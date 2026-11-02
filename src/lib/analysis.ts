import type { Review } from '../../shared/types.ts';

export const stripMarkup = (text: string) =>
  text.replace(/\[[^\]]*\]/g, ' ').replace(/https?:\/\/\S+/g, ' ');
export const words = (text: string) =>
  stripMarkup(text)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .match(/\p{L}+(?:[-’']\p{L}+)*/gu) ?? [];
export const normalize = (text: string) =>
  (
    stripMarkup(text)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  ).join(' ');
export const median = (values: (number | null | undefined)[]) => {
  const a = values
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);
  return a.length
    ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2
    : null;
};
export interface Analyzed extends Review {
  tokens: string[];
  normalized: string;
  searchText: string;
}
export function prepare(rows: Review[]): Analyzed[] {
  return rows.map((r) => ({
    ...r,
    tokens: words(r.review),
    normalized: normalize(r.review),
    searchText: words(r.review).join(' '),
  }));
}
export type Sentiment = 'positive' | 'negative' | 'all';
export function filterReviews(
  rows: Analyzed[],
  sentiment: Sentiment,
  language: string,
  range: [number, number] | null,
) {
  return rows.filter(
    (r) =>
      (sentiment === 'all' || r.voted_up === (sentiment === 'positive')) &&
      (language === 'all' || r.language === language) &&
      (!range || (r.timestamp_created >= range[0] && r.timestamp_created < range[1])),
  );
}
export interface Bucket {
  label: string;
  count: number;
  start: number;
  end: number;
}
export function histogram(values: (number | undefined)[], boundaries: number[]): Bucket[] {
  return boundaries.map((start, i) => ({
    label: i === boundaries.length - 1 ? `${start}+` : `${start}–${boundaries[i + 1] - 1}`,
    start,
    end: boundaries[i + 1] ?? Infinity,
    count: values.filter(
      (v) => v !== undefined && v >= start && v < (boundaries[i + 1] ?? Infinity),
    ).length,
  }));
}
export function timeline(rows: Analyzed[], range: [number, number], step: number): Bucket[] | null {
  const first = Math.floor(range[0] / step) * step,
    total = Math.ceil((range[1] - first) / step);
  if (total > 2000) return null;
  const bins = Array.from({ length: Math.max(0, total) }, (_, i) => {
    const start = Math.max(range[0], first + i * step),
      end = Math.min(range[1], first + (i + 1) * step);
    return { start, end, label: new Date(start * 1000).toISOString(), count: 0 };
  });
  rows.forEach((r) => {
    if (r.timestamp_created >= range[0] && r.timestamp_created < range[1])
      bins[Math.floor((r.timestamp_created - first) / step)].count++;
  });
  return bins;
}
export function bursts(rows: Analyzed[], seconds: number, max = 10) {
  const sorted = [...rows].sort((a, b) => a.timestamp_created - b.timestamp_created);
  let end = 0;
  const candidates: { start: number; end: number; count: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].timestamp_created;
    if (i && sorted[i - 1].timestamp_created === start) continue;
    while (end < sorted.length && sorted[end].timestamp_created < start + seconds) end++;
    candidates.push({ start, end: start + seconds, count: end - i });
  }
  candidates.sort((a, b) => b.count - a.count || a.start - b.start);
  const result: typeof candidates = [];
  for (const c of candidates) {
    if (result.every((r) => c.start >= r.end || c.end <= r.start)) {
      result.push(c);
      if (result.length >= max) break;
    }
  }
  return result;
}
export interface DuplicateGroup {
  key: string;
  rows: Analyzed[];
  span: number;
  wordCount: number;
}
export function duplicateGroups(rows: Analyzed[], minWords = 6): DuplicateGroup[] {
  const groups = new Map<string, Analyzed[]>();
  for (const r of rows) {
    if (r.normalized && r.tokens.length >= minWords) {
      let g = groups.get(r.normalized);
      if (!g) {
        g = [];
        groups.set(r.normalized, g);
      }
      g.push(r);
    }
  }
  return [...groups]
    .filter(([, g]) => g.length > 1)
    .map(([key, g]) => {
      const sorted = g.sort((a, b) => a.timestamp_created - b.timestamp_created);
      return {
        key,
        rows: sorted,
        span: sorted.at(-1)!.timestamp_created - sorted[0].timestamp_created,
        wordCount: sorted[0].tokens.length,
      };
    });
}
const stop = new Set(
  'и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ли если уже или ни быть был него до вас вам ведь там потом себя ничего ей может они тут где есть надо для мы тебя их чем была сам чтобы без чего раз тоже себе под будет кто этот того потому этого какой ним здесь этом один почти тем нее сейчас были куда зачем всех никогда сегодня можно при после нас эту об эти очень это просто игры игру игре игра the a an and or of to in is it that this was for with on be are as at have has had i you he she we they my your not but so if its from all one can just about out up really much more than been me no do did does there their them into only will would how what which when who some'.split(
    /\s+/,
  ),
);
const generic = new Set(
  'игра игры игру игре игрой игр играть играл играла играли играешь game games played play playing'.split(
    ' ',
  ),
);
export function wordCloud(rows: Analyzed[], pairs = false, hideGeneric = true) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const terms = pairs
      ? r.tokens
          .slice(0, -1)
          .map((w, i) => [w, r.tokens[i + 1]])
          .filter((pair) =>
            pair.every((w) => w.length > 2 && !stop.has(w) && (!hideGeneric || !generic.has(w))),
          )
          .map((p) => p.join(' '))
      : r.tokens.filter((w) => w.length > 2 && !stop.has(w) && (!hideGeneric || !generic.has(w)));
    for (const word of new Set(terms)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, pairs ? 40 : 60);
}
export function authorDistribution(rows: Analyzed[], limit = 20) {
  const authors = [...new Map(rows.map((r) => [r.author.steamid, r])).values()],
    bins = Array.from({ length: limit + 1 }, (_, i) => ({
      start: i + 1,
      end: i === limit ? Infinity : i + 2,
      label: i === limit ? `${i + 1}+` : String(i + 1),
      count: 0,
    }));
  for (const r of authors) {
    const n = r.author.num_reviews;
    if (n !== undefined && n >= 1) bins[Math.min(n - 1, limit)].count++;
  }
  return bins;
}
export function anonymize(rows: Review[]) {
  const ids = new Map<string, string>();
  return rows.map((r) => {
    if (!ids.has(r.author.steamid)) ids.set(r.author.steamid, `reviewer-${ids.size + 1}`);
    return {
      reviewer: ids.get(r.author.steamid),
      language: r.language,
      text: r.review,
      positive: r.voted_up,
      createdAt: r.timestamp_created,
      updatedAt: r.timestamp_updated,
      playtimeAtReview: r.author.playtime_at_review,
      totalPlaytime: r.author.playtime_forever,
      authorPublicReviews: r.author.num_reviews,
    };
  });
}
