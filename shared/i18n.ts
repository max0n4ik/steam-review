import { messages } from './messages.ts';

export const languages = ['ru', 'en', 'es'] as const;
export type Language = (typeof languages)[number];
export const intlLocales: Record<Language, string> = { ru: 'ru-RU', en: 'en-US', es: 'es-ES' };
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.keys(messages)
  .filter((key) => /\{\d+\}/.test(key))
  .map((key) => ({
    key,
    regex: new RegExp(
      '^' +
        key
          .split(/(\{\d+\})/)
          .map((part) => (/^\{\d+\}$/.test(part) ? '(.+?)' : escape(part)))
          .join('') +
        '$',
    ),
  }));

export function chooseLanguage(saved: string | null, preferred: readonly string[]): Language {
  if (languages.includes(saved as Language)) return saved as Language;
  for (const locale of preferred) {
    const base = locale.toLowerCase().split('-')[0];
    if (languages.includes(base as Language)) return base as Language;
  }
  return 'en';
}

export function translate(language: Language, key: string, args: readonly unknown[] = []): string {
  let source = key,
    values = args;
  if (!messages[source]) {
    // Localize persisted server messages too, without modifying their stored text.
    for (const pattern of patterns) {
      const match = key.match(pattern.regex);
      if (match) {
        source = pattern.key;
        values = match.slice(1);
        break;
      }
    }
  }
  const translated =
    language === 'ru' ? source : (messages[source]?.[language === 'en' ? 0 : 1] ?? source);
  return translated.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    values[Number(index)] === undefined ? placeholder : String(values[Number(index)]),
  );
}

export function formatNumber(language: Language, value: number | null | undefined): string {
  return value == null
    ? '—'
    : new Intl.NumberFormat(intlLocales[language], { maximumFractionDigits: 1 }).format(value);
}

export function formatDate(language: Language, timestamp: number, dateOnly = false): string {
  return new Date(timestamp * 1000).toLocaleString(intlLocales[language], {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  });
}

const steamLanguages: Record<string, string> = {
  english: 'en',
  russian: 'ru',
  spanish: 'es',
  latam: 'es-419',
  french: 'fr',
  german: 'de',
  italian: 'it',
  portuguese: 'pt',
  brazilian: 'pt-BR',
  schinese: 'zh-Hans',
  tchinese: 'zh-Hant',
  japanese: 'ja',
  koreana: 'ko',
  polish: 'pl',
  ukrainian: 'uk',
  turkish: 'tr',
  thai: 'th',
  czech: 'cs',
  danish: 'da',
  dutch: 'nl',
  finnish: 'fi',
  greek: 'el',
  hungarian: 'hu',
  norwegian: 'no',
  romanian: 'ro',
  swedish: 'sv',
  bulgarian: 'bg',
  indonesian: 'id',
  vietnamese: 'vi',
  arabic: 'ar',
  belarusian: 'be',
};
export function reviewLanguageName(language: Language, code: string): string {
  const tag = steamLanguages[code];
  return tag
    ? (new Intl.DisplayNames([intlLocales[language]], { type: 'language' }).of(tag) ?? code)
    : code;
}
