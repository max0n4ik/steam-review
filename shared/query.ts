import type { Query } from './types.ts';

export function parseAppId(value: unknown): number {
  const text = String(value ?? '').trim();
  const match = text.match(
    /^https:\/\/store\.steampowered\.com\/app\/(\d+)(?:\/[^?#]*)?(?:[?#].*)?$/i,
  );
  const digits = match?.[1] ?? text;
  if (!/^\d+$/.test(digits)) throw new Error('Введите числовой App ID или ссылку на игру в Steam.');
  const appid = Number(digits);
  if (!Number.isSafeInteger(appid) || appid < 1 || appid > 4294967295)
    throw new Error('Некорректный App ID.');
  return appid;
}
export function validateQuery(input: unknown): Query {
  if (!input || typeof input !== 'object') throw new Error('Не переданы параметры загрузки.');
  const p = input as Record<string, unknown>,
    appid = parseAppId(p.appid),
    limit = Number(p.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50000)
    throw new Error('Лимит должен быть целым числом от 1 до 50 000.');
  const start = p.start == null ? null : Number(p.start),
    end = p.end == null ? null : Number(p.end);
  if ((start === null) !== (end === null)) throw new Error('Выберите обе границы периода.');
  if (
    start !== null &&
    end !== null &&
    (!Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end > 4294967295 ||
      start >= end)
  )
    throw new Error('Начало периода должно быть раньше конца.');
  return { appid, limit, start, end };
}
// Date-only selections are whole UTC days, including the final calendar day.
export function dateRangeToQuery(start: string, end: string): Pick<Query, 'start' | 'end'> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
    throw new Error('Выберите корректные даты.');
  const a = Date.parse(start + 'T00:00:00Z') / 1000,
    b = Date.parse(end + 'T00:00:00Z') / 1000 + 86400;
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    a >= b ||
    new Date(a * 1000).toISOString().slice(0, 10) !== start ||
    new Date((b - 86400) * 1000).toISOString().slice(0, 10) !== end
  )
    throw new Error('Некорректный диапазон дат.');
  return { start: a, end: b };
}
