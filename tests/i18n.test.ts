import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  chooseLanguage,
  formatDate,
  formatNumber,
  reviewLanguageName,
  translate,
} from '../shared/i18n.ts';
import { messages } from '../shared/messages.ts';
import { prepare, wordCloud } from '../src/lib/analysis.ts';
import { review } from './fixtures.ts';

test('language detection respects a saved choice and regional browser variants', () => {
  assert.equal(chooseLanguage('es', ['ru-RU']), 'es');
  assert.equal(chooseLanguage(null, ['fr-FR', 'es-MX']), 'es');
  assert.equal(chooseLanguage('invalid', ['en-GB']), 'en');
  assert.equal(chooseLanguage(null, ['fr']), 'en');
});

test('every source interface phrase and known server message has both translations', () => {
  for (const file of [
    'src/App.tsx',
    'src/components/Dashboard.tsx',
    'src/components/Histogram.tsx',
    'src/i18n.tsx',
    'server/jobs.ts',
    'server/steam.ts',
    'shared/query.ts',
    'src/lib/api.ts',
  ]) {
    const source = ts.createSourceFile(
      file,
      readFileSync(new URL('../' + file, import.meta.url), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    function check(key: string) {
      if (!/[А-Яа-яЁё]/.test(key) || key === 'Русский') return;
      assert.ok(messages[key]?.[0], `Missing English: ${file}: ${key}`);
      assert.ok(messages[key]?.[1], `Missing Spanish: ${file}: ${key}`);
    }
    function walk(node: ts.Node) {
      if (ts.isTemplateExpression(node)) {
        let key = node.head.text;
        node.templateSpans.forEach((span, index) => {
          key += `{${index}}` + span.literal.text;
        });
        check(key);
        node.templateSpans.forEach((span) => walk(span.expression));
        return;
      }
      if (ts.isStringLiteralLike(node)) check(node.text);
      if (ts.isJsxText(node)) check(node.text.replace(/\s+/g, ' ').trim());
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
});

test('translations retain all interpolation placeholders', () => {
  const placeholders = (s: string) => [...s.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
  for (const [key, values] of Object.entries(messages)) {
    for (const translated of values)
      assert.deepEqual(placeholders(translated), placeholders(key), key);
  }
});

test('persisted server errors and explicit templates translate without touching review data', () => {
  assert.equal(translate('en', 'Steam ответил HTTP 429.'), 'Steam returned HTTP 429.');
  assert.equal(translate('es', 'Steam ответил HTTP 429.'), 'Steam respondió con HTTP 429.');
  assert.equal(translate('es', 'Автор {0}', [7]), 'Autor 7');
  assert.equal(translate('ru', 'Автор {0}', [7]), 'Автор 7');
  assert.equal(translate('es', 'Unrecognized external message'), 'Unrecognized external message');
});

test('locale formatting changes while UTC boundaries stay fixed', () => {
  assert.equal(formatNumber('en', 12345.5), '12,345.5');
  assert.equal(formatNumber('es', 12345.5), '12.345,5');
  assert.equal(formatNumber('ru', undefined), '—');
  const t = Date.parse('2024-02-29T23:59:59Z') / 1000;
  assert.equal(formatDate('en', t, true), '02/29/2024');
  assert.equal(formatDate('es', t, true), '29/02/2024');
  assert.equal(formatDate('ru', t, true), '29.02.2024');
  assert.equal(reviewLanguageName('es', 'english'), 'inglés');
  assert.equal(reviewLanguageName('en', 'russian'), 'Russian');
});

test('Spanish stop words do not dominate the cloud and review text stays original', () => {
  const text = 'El juego y la historia con música excelente';
  const rows = prepare([review(1, { review: text, language: 'spanish' })]);
  const cloud = wordCloud(rows);
  assert.ok(!cloud.some((w) => ['el', 'juego', 'la', 'con'].includes(w.word)));
  assert.ok(cloud.some((w) => w.word === 'excelente'));
  assert.equal(rows[0].review, text);
});
