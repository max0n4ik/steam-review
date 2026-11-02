import { useState } from 'react';
import type { Preview, Query } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { buildReviewQuery } from '../lib/review-query.ts';

export function useReviewQuery(onError: (message: string) => void) {
  const [appid, setAppid] = useState('');
  const [limit, setLimit] = useState<number | string>(1000);
  const [period, setPeriod] = useState('all');
  const [dates, setDates] = useState<[string | null, string | null]>([null, null]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(Preview & { formKey: string }) | null>(null);
  const draft = { appid, limit, period, dates };
  const formKey = JSON.stringify(draft);
  const preview = result?.formKey === formKey ? result : null;

  async function submit(action: (query: Query) => Promise<void>) {
    setBusy(true);
    onError('');
    try {
      await action(buildReviewQuery(draft));
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    await submit(async (query) => {
      const response = await api<Preview>('/preview', 'POST', query);
      setResult({ ...response, formKey });
    });
  }

  return {
    ...draft,
    setAppid,
    setLimit,
    setPeriod,
    setDates,
    preview,
    busy,
    check,
    download: submit,
    clearPreview: () => setResult(null),
  };
}

export type ReviewQueryForm = ReturnType<typeof useReviewQuery>;
