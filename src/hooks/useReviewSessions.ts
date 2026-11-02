import { useCallback, useEffect, useRef, useState } from 'react';
import { useInterval } from '@siberiacancode/reactuse';
import type { Job, Query, Review } from '../../shared/types.ts';
import { api } from '../lib/api.ts';

export function useReviewSessions() {
  const [history, setHistory] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [rows, setRows] = useState<Review[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Job | null>(null);
  const requests = useRef({ id: '', selection: 0, rows: 0, polling: false });

  const refreshHistory = useCallback(async () => {
    setHistory(await api<Job[]>('/jobs'));
  }, []);

  useEffect(() => {
    let active = true;
    const lifecycle = requests.current;
    void api<Job[]>('/jobs')
      .then((items) => {
        if (active) setHistory(items);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
      lifecycle.selection++;
      lifecycle.rows++;
    };
  }, []);

  function selectSession(target: Job | null, clearRows = false) {
    requests.current.id = target?.id ?? '';
    requests.current.selection++;
    requests.current.rows++;
    setLoadingRows(false);
    setJob(target);
    if (clearRows) setRows([]);
  }

  const loadRows = useCallback(async (target: Job) => {
    if (requests.current.id !== target.id) return;
    const ticket = ++requests.current.rows;
    setLoadingRows(true);
    try {
      const records = await api<Review[]>(`/jobs/${target.id}/reviews`);
      if (ticket === requests.current.rows) setRows(records);
    } catch (cause) {
      if (ticket === requests.current.rows) setError((cause as Error).message);
    } finally {
      if (ticket === requests.current.rows) setLoadingRows(false);
    }
  }, []);

  async function pollCurrentSession() {
    if (!job || job.status !== 'running' || requests.current.polling) return;
    const { id, selection: revision } = requests.current;
    requests.current.polling = true;
    try {
      const fresh = await api<Job>(`/jobs/${id}`);
      if (requests.current.selection !== revision) return;
      setJob(fresh);
      if (fresh.status !== 'running') {
        await loadRows(fresh);
        await refreshHistory();
      }
    } catch (cause) {
      if (requests.current.selection === revision) setError((cause as Error).message);
    } finally {
      requests.current.polling = false;
    }
  }

  // ReactUse owns the timer and keeps its callback current. Idle sessions make no requests.
  useInterval(() => {
    void pollCurrentSession();
  }, 1200);

  async function withBusy(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openSession(target: Job) {
    setError('');
    selectSession(target, true);
    await loadRows(target);
  }

  async function start(query: Query) {
    await withBusy(async () => {
      selectSession(await api<Job>('/jobs', 'POST', query), true);
      await refreshHistory();
    });
  }

  async function changeStatus(action: 'pause' | 'resume') {
    if (!job) return;
    const revision = requests.current.selection;
    await withBusy(async () => {
      const fresh = await api<Job>(`/jobs/${job.id}/${action}`, 'POST');
      if (requests.current.selection === revision) {
        selectSession(fresh);
        if (action === 'pause') await loadRows(fresh);
      }
      await refreshHistory();
    });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await withBusy(async () => {
      await api(`/jobs/${pendingDelete.id}`, 'DELETE');
      if (requests.current.id === pendingDelete.id) selectSession(null, true);
      setPendingDelete(null);
      await refreshHistory();
    });
  }

  async function refresh() {
    try {
      await refreshHistory();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return {
    history,
    job,
    rows,
    loadingRows,
    busy,
    error,
    setError,
    openSession,
    loadRows,
    refreshHistory: refresh,
    start,
    changeStatus,
    pendingDelete,
    requestDelete: setPendingDelete,
    cancelDelete: () => setPendingDelete(null),
    confirmDelete,
  };
}
