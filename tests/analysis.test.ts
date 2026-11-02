import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import {
  anonymize,
  authorDistribution,
  bursts,
  duplicateGroups,
  filterReviews,
  histogram,
  median,
  prepare,
  timeline,
  wordCloud,
} from '../src/lib/analysis.ts';
import { review } from './fixtures.ts';

test('missing playtime is excluded from median instead of becoming zero', () => {
  assert.equal(median([undefined, null, 10, 20]), 15);
  assert.equal(median([]), null);
});
test('time and sentiment boundaries are inclusive/exclusive and do not mix signs', () => {
  const rows = prepare([
    review(1, { timestamp_created: 100 }),
    review(2, { timestamp_created: 110 }),
    review(3, { timestamp_created: 109, voted_up: false }),
  ]);
  assert.deepEqual(
    filterReviews(rows, 'positive', 'all', [100, 110]).map((r) => r.recommendationid),
    ['1'],
  );
  assert.deepEqual(
    filterReviews(rows, 'negative', 'all', [100, 110]).map((r) => r.recommendationid),
    ['3'],
  );
});
test('histogram assigns exact boundaries once and keeps unknowns out', () => {
  assert.deepEqual(
    histogram([0, 14, 15, 29, 30, undefined], [0, 15, 30]).map((b) => b.count),
    [2, 2, 1],
  );
});
test('timeline includes empty intervals and excludes the right boundary', () => {
  const rows = prepare([
    review(1, { timestamp_created: 119 }),
    review(2, { timestamp_created: 120 }),
    review(3, { timestamp_created: 240 }),
  ]);
  assert.deepEqual(
    timeline(rows, [60, 240], 60)?.map((b) => b.count),
    [1, 1, 0],
  );
  assert.equal(timeline(rows, [0, 999999], 60), null);
});
test('rolling windows find a burst spanning clock-hour boundaries', () => {
  const rows = prepare([
    review(1, { timestamp_created: 3599 }),
    review(2, { timestamp_created: 3601 }),
    review(3, { timestamp_created: 3602 }),
    review(4, { timestamp_created: 3659 }),
  ]);
  const found = bursts(rows, 60);
  assert.deepEqual(found[0], { start: 3599, end: 3659, count: 3 });
  assert.ok(
    found.every((b, i) => found.slice(0, i).every((a) => b.start >= a.end || b.end <= a.start)),
  );
});
test('duplicate grouping removes markup but preserves different numerical ratings', () => {
  const rows = prepare([
    review(1, { review: '[b]A thoughtful game with a gentle story[/b].' }),
    review(2, { review: 'a thoughtful game with a gentle story!' }),
    review(3, { review: '10/10' }),
    review(4, { review: '1/10' }),
  ]);
  const groups = duplicateGroups(rows, 0);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rows.length, 2);
});
test('cloud counts a word at most once per review and keeps sentiment scope', () => {
  const cloud = wordCloud(
    prepare([
      review(1, { review: 'beautiful beautiful beautiful' }),
      review(2, { review: 'beautiful music' }),
    ]),
  );
  assert.equal(cloud.find((w) => w.word === 'beautiful')?.count, 2);
});
test('author distribution uses distinct authors and exact 1 and 2 groups', () => {
  const a = review(1),
    b = review(2),
    dup = review(3, { author: a.author });
  const result = authorDistribution(prepare([a, b, dup]), 2);
  assert.deepEqual(
    result.map((b) => b.count),
    [1, 1, 0],
  );
});
test('anonymized export removes persistent Steam IDs while preserving within-export author grouping', () => {
  const a = review(1),
    b = review(2, { author: a.author });
  const out = anonymize([a, b]);
  assert.equal(out[0].reviewer, out[1].reviewer);
  assert.ok(!JSON.stringify(out).includes(a.author.steamid));
  assert.ok(!('recommendationid' in out[0]));
});
