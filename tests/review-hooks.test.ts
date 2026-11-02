// @vitest-environment happy-dom
import { afterEach, beforeEach, test, vi } from 'vite-plus/test';
import { act, cleanup, renderHook } from '@testing-library/react';
import assert from 'node:assert/strict';
import type { Job, Preview, Review } from '../shared/types.ts';
import { useReviewQuery } from '../src/hooks/useReviewQuery.ts';
import { useReviewSessions } from '../src/hooks/useReviewSessions.ts';
import { review } from './fixtures.ts';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../src/lib/api.ts', () => mocks);

function session(id: string, status: Job['status'] = 'paused'): Job {
  return {
    id,
    status,
    query: { appid: 440, limit: 1000, start: null, end: null },
    game: { appid: 440, name: 'Synthetic Game', releaseDate: null },
    count: 0,
    matching: 5,
    pages: 0,
    cursor: '*',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    message: '',
    retryAt: null,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.api.mockReset();
  mocks.api.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test('switching sessions ignores a late review-list response from the previous session', async () => {
  const old = deferred<Review[]>();
  mocks.api.mockImplementation((url: string) =>
    url === '/jobs/old/reviews'
      ? old.promise
      : Promise.resolve(url === '/jobs/new/reviews' ? [review(2)] : []),
  );
  const hook = renderHook(() => useReviewSessions());
  await act(async () => {});
  let firstLoad!: Promise<void>;
  act(() => {
    firstLoad = hook.result.current.openSession(session('old'));
  });
  await act(async () => {
    await hook.result.current.openSession(session('new'));
  });
  await act(async () => {
    old.resolve([review(1)]);
    await firstLoad;
  });
  assert.equal(hook.result.current.job?.id, 'new');
  assert.deepEqual(
    hook.result.current.rows.map((r) => r.recommendationid),
    ['2'],
  );
  assert.equal(hook.result.current.loadingRows, false);
});

test('ReactUse polling never overlaps requests and loads reviews when a download finishes', async () => {
  const progress = deferred<Job>();
  const complete = { ...session('active', 'complete'), count: 1 };
  let finished = false;
  mocks.api.mockImplementation((url: string) => {
    if (url === '/jobs/active') return progress.promise;
    if (url === '/jobs/active/reviews') return Promise.resolve(finished ? [review(1)] : []);
    return Promise.resolve([]);
  });
  const hook = renderHook(() => useReviewSessions());
  await act(async () => {
    await hook.result.current.openSession(session('active', 'running'));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4800);
  });
  assert.equal(mocks.api.mock.calls.filter(([url]) => url === '/jobs/active').length, 1);
  finished = true;
  await act(async () => {
    progress.resolve(complete);
  });
  assert.equal(hook.result.current.job?.status, 'complete');
  assert.equal(hook.result.current.rows.length, 1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2400);
  });
  assert.equal(mocks.api.mock.calls.filter(([url]) => url === '/jobs/active').length, 1);
});

test('a stale progress response cannot reopen a session after the user selects another one', async () => {
  const progress = deferred<Job>();
  mocks.api.mockImplementation((url: string) =>
    url === '/jobs/old'
      ? progress.promise
      : Promise.resolve(url === '/jobs/new/reviews' ? [review(2)] : []),
  );
  const hook = renderHook(() => useReviewSessions());
  await act(async () => {
    await hook.result.current.openSession(session('old', 'running'));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1200);
  });
  await act(async () => {
    await hook.result.current.openSession(session('new'));
  });
  await act(async () => {
    progress.resolve(session('old', 'complete'));
  });
  assert.equal(hook.result.current.job?.id, 'new');
  assert.equal(hook.result.current.rows[0].recommendationid, '2');
});

test('a late pause response updates the server session without replacing the current selection', async () => {
  const pause = deferred<Job>();
  mocks.api.mockImplementation((url: string) =>
    url === '/jobs/old/pause' ? pause.promise : Promise.resolve([]),
  );
  const hook = renderHook(() => useReviewSessions());
  await act(async () => {
    await hook.result.current.openSession(session('old', 'running'));
  });
  let action!: Promise<void>;
  act(() => {
    action = hook.result.current.changeStatus('pause');
  });
  await act(async () => {
    await hook.result.current.openSession(session('new'));
  });
  await act(async () => {
    pause.resolve(session('old'));
    await action;
  });
  assert.equal(hook.result.current.job?.id, 'new');
  assert.equal(hook.result.current.busy, false);
});

test('a failed start leaves the controller usable and reports its error', async () => {
  mocks.api.mockImplementation((_url: string, method?: string) =>
    method === 'POST' ? Promise.reject(new Error('Synthetic failure')) : Promise.resolve([]),
  );
  const hook = renderHook(() => useReviewSessions());
  await act(async () => {
    await hook.result.current.start(session('new').query);
  });
  assert.equal(hook.result.current.job, null);
  assert.equal(hook.result.current.error, 'Synthetic failure');
  assert.equal(hook.result.current.busy, false);
});

test('query previews belong to their input snapshot and never appear for edited parameters', async () => {
  const response = deferred<Preview>();
  mocks.api.mockReturnValue(response.promise);
  const onError = vi.fn();
  const hook = renderHook(() => useReviewQuery(onError));
  act(() => {
    hook.result.current.setAppid('440');
  });
  let checking!: Promise<void>;
  act(() => {
    checking = hook.result.current.check();
  });
  act(() => {
    hook.result.current.setLimit(2000);
  });
  await act(async () => {
    response.resolve({
      query: session('x').query,
      game: session('x').game,
      matching: 3000,
      estimatedRequests: 10,
    });
    await checking;
  });
  assert.equal(hook.result.current.preview, null);
  assert.equal(hook.result.current.limit, 2000);
  assert.equal(hook.result.current.busy, false);
});

test('invalid form input is reported before a preview network request', async () => {
  const onError = vi.fn();
  const hook = renderHook(() => useReviewQuery(onError));
  act(() => {
    hook.result.current.setAppid('not-an-app-id');
  });
  await act(async () => {
    await hook.result.current.check();
  });
  assert.equal(mocks.api.mock.calls.length, 0);
  assert.match(onError.mock.calls.at(-1)?.[0], /App ID/);
  assert.equal(hook.result.current.busy, false);
});
