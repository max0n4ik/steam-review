import { dateRangeToQuery, parseAppId } from '../../shared/query.ts';
import type { Query } from '../../shared/types.ts';

export interface ReviewQueryDraft {
  appid: string;
  limit: number | string;
  period: string;
  dates: [string | null, string | null];
}

export function buildReviewQuery(draft: ReviewQueryDraft): Query {
  return {
    appid: parseAppId(draft.appid),
    limit: Number(draft.limit),
    ...(draft.period === 'all'
      ? { start: null, end: null }
      : dateRangeToQuery(draft.dates[0] ?? '', draft.dates[1] ?? '')),
  };
}
