import { setTimeout as delay } from 'node:timers/promises';
import type { Game, Query, Review, ReviewPage } from '../shared/types.ts';

export class SteamError extends Error {
  constructor(
    message: string,
    public status: number = 502,
  ) {
    super(message);
  }
}
export function retryDelay(header: string | null, attempt: number, now = Date.now()): number {
  const fallback = Math.min(60000, 2000 * 2 ** attempt);
  if (!header) return fallback;
  const seconds = Number(header);
  const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(requested) ? Math.max(fallback, requested) : fallback;
}
export function decodePage(payload: unknown): ReviewPage {
  const outer = payload as Record<string, unknown>;
  const p = (outer?.response ?? outer) as Record<string, unknown>;
  if (!p || typeof p !== 'object') throw new SteamError('Steam вернул некорректный ответ.');
  const summary = p.query_summary as { num_reviews?: number } | undefined;
  const raw = p.reviews ?? (summary?.num_reviews === 0 ? [] : null);
  if (!Array.isArray(raw)) throw new SteamError('В ответе Steam нет списка отзывов.');
  for (const r of raw) {
    if (
      !r ||
      typeof r.review !== 'string' ||
      !/^\d+$/.test(String(r.recommendationid)) ||
      !/^\d+$/.test(String(r.author?.steamid)) ||
      !Number.isInteger(r.timestamp_created) ||
      typeof r.voted_up !== 'boolean'
    )
      throw new SteamError('Неожиданный формат отзыва Steam.');
  }
  return {
    reviews: raw.map((r: Review) => ({
      ...r,
      recommendationid: String(r.recommendationid),
      author: { ...r.author, steamid: String(r.author.steamid) },
    })),
    cursor: typeof p.cursor === 'string' ? p.cursor : undefined,
    total_matching: typeof p.total_matching === 'number' ? p.total_matching : undefined,
  };
}
export interface PageClient {
  page(
    query: Query,
    cursor: string,
    size: number,
    signal?: AbortSignal,
    onRetry?: (wait: number) => Promise<void>,
  ): Promise<ReviewPage>;
  game(appid: number): Promise<Game>;
}
export class SteamClient implements PageClient {
  private nextRequest = 0;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private options: { fetch?: typeof fetch; delayMs?: number; key?: string } = {}) {}
  async page(
    query: Query,
    cursor: string,
    size: number,
    signal?: AbortSignal,
    onRetry?: (wait: number) => Promise<void>,
  ): Promise<ReviewPage> {
    // A shared queue paces previews and all downloads together.
    const task = this.queue
      .catch(() => {})
      .then(() => this.request(query, cursor, size, signal, onRetry));
    this.queue = task;
    return task;
  }
  private async request(
    q: Query,
    cursor: string,
    size: number,
    signal?: AbortSignal,
    onRetry?: (wait: number) => Promise<void>,
  ): Promise<ReviewPage> {
    const params: Record<string, unknown> = {
      appid: q.appid,
      filter: 1,
      languages: ['all'],
      review_type: 0,
      purchase_type: 1,
      num_per_page: Math.min(100, size),
      filter_offtopic_activity: false,
      cursor,
    };
    if (q.start !== null && q.end !== null) {
      params.date_range_start = q.start;
      params.date_range_end = q.end - 1;
    }
    const url = new URL('https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/');
    url.searchParams.set('input_json', JSON.stringify(params));
    if (this.options.key) url.searchParams.set('key', this.options.key);
    const fetcher = this.options.fetch ?? fetch;
    for (let attempt = 0; attempt < 6; attempt++) {
      signal?.throwIfAborted();
      await delay(Math.max(0, this.nextRequest - Date.now()), undefined, { signal });
      this.nextRequest = Date.now() + (this.options.delayMs ?? 1500);
      let response: Response;
      try {
        response = await fetcher(url, {
          signal: AbortSignal.any([
            signal ?? new AbortController().signal,
            AbortSignal.timeout(30000),
          ]),
          headers: { Accept: 'application/json' },
        });
      } catch (_error) {
        signal?.throwIfAborted();
        if (attempt === 5)
          throw new SteamError(
            'Нет ответа Steam после нескольких попыток. Данные сохранены; загрузку можно продолжить.',
          );
        const wait = retryDelay(null, attempt);
        await onRetry?.(wait);
        await delay(wait, undefined, { signal });
        continue;
      }
      if (response.ok) return decodePage(await response.json());
      if (response.status !== 429 && response.status < 500)
        throw new SteamError(`Steam ответил HTTP ${response.status}.`, response.status);
      if (attempt === 5)
        throw new SteamError(
          `Steam ограничил или не смог обработать запросы (HTTP ${response.status}). Продолжите загрузку позже.`,
          response.status,
        );
      const wait = retryDelay(response.headers.get('Retry-After'), attempt);
      await response.body?.cancel();
      await onRetry?.(wait);
      await delay(wait, undefined, { signal });
    }
    throw new SteamError('Не удалось загрузить отзывы.');
  }
  async game(appid: number): Promise<Game> {
    const fallback = { appid, name: `App ${appid}`, releaseDate: null };
    try {
      const url = new URL('https://store.steampowered.com/api/appdetails');
      url.search = new URLSearchParams({ appids: String(appid), l: 'english' }).toString();
      const r = await (this.options.fetch ?? fetch)(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return fallback;
      const payload = await r.json(),
        data = payload[String(appid)]?.data;
      if (!data) return fallback;
      return {
        appid,
        name: typeof data.name === 'string' ? data.name : fallback.name,
        releaseDate: typeof data.release_date?.date === 'string' ? data.release_date.date : null,
      };
    } catch {
      return fallback;
    }
  }
}
