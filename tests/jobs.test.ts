import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, appendFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Jobs } from '../server/jobs.ts';
import { Storage } from '../server/storage.ts';
import type { PageClient } from '../server/steam.ts';
import type { Job } from '../shared/types.ts';
import { review } from './fixtures.ts';

const query = { appid: 440, limit: 4, start: null, end: null };
const metadata = async () => ({ appid: 440, name: 'Synthetic Game', releaseDate: null });
async function setup(client: PageClient) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'steam-lab-test-'));
  const storage = new Storage(dir),
    jobs = new Jobs(storage, client);
  await jobs.initialize();
  return {
    jobs,
    storage,
    cleanup: async () => {
      await jobs.shutdown();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
async function waitFor(jobs: Jobs, id: string) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (jobs.get(id).status !== 'running') return jobs.get(id);
    await delay(5);
  }
  throw new Error('Test job did not finish');
}

test('a 50,000-review cap is honored across 500 mocked Steam pages', async () => {
  let calls = 0;
  const env = await setup({
    game: metadata,
    page: async (_query, cursor, size) => {
      calls++;
      assert.ok(size <= 100);
      const page = cursor === '*' ? 0 : Number(cursor);
      return {
        reviews: Array.from({ length: size }, (_, i) => review(page * 100 + i + 1)),
        cursor: String(page + 1),
        total_matching: 50010,
      };
    },
  });
  try {
    const job = await env.jobs.create({ ...query, limit: 50000 });
    await waitFor(env.jobs, job.id);
    assert.equal(job.status, 'limited');
    assert.equal(job.count, 50000);
    assert.equal(calls, 500);
    const saved = await env.storage.reviews(job.id);
    assert.equal(saved.length, 50000);
    assert.equal(new Set(saved.map((r) => r.recommendationid)).size, 50000);
  } finally {
    await env.cleanup();
  }
});
test('download is deduplicated, newest-first, and stops exactly at the selected cap', async () => {
  const cursors: string[] = [];
  const env = await setup({
    game: metadata,
    page: async (_q, c) => {
      cursors.push(c);
      return c === '*'
        ? { reviews: [review(1), review(2)], cursor: 'a', total_matching: 8 }
        : { reviews: [review(2), review(3), review(4), review(5)], cursor: 'b', total_matching: 8 };
    },
  });
  try {
    const j = await env.jobs.create(query);
    await waitFor(env.jobs, j.id);
    assert.equal(j.status, 'limited');
    const rows = await env.storage.reviews(j.id);
    assert.deepEqual(
      rows.map((r) => r.recommendationid),
      ['1', '2', '3', '4'],
    );
    assert.deepEqual(cursors, ['*', 'a']);
  } finally {
    await env.cleanup();
  }
});
test('errors preserve the cursor and resume without losing or duplicating reviews', async () => {
  let fail = true;
  const requested: string[] = [];
  const env = await setup({
    game: metadata,
    page: async (_q, c) => {
      requested.push(c);
      if (c === '*') return { reviews: [review(1), review(2)], cursor: 'a', total_matching: 3 };
      if (c === 'a' && fail) {
        fail = false;
        throw new Error('Temporary outage');
      }
      if (c === 'a') return { reviews: [review(2), review(3)], cursor: 'b', total_matching: 3 };
      return { reviews: [], total_matching: 3 };
    },
  });
  try {
    const j = await env.jobs.create(query);
    await waitFor(env.jobs, j.id);
    assert.equal(j.status, 'error');
    assert.equal(j.count, 2);
    await env.jobs.resume(j.id);
    await waitFor(env.jobs, j.id);
    assert.equal(j.status, 'complete');
    assert.equal(j.count, 3);
    assert.deepEqual(requested, ['*', 'a', 'a', 'b']);
    assert.equal((await env.storage.reviews(j.id)).length, 3);
  } finally {
    await env.cleanup();
  }
});
test('a stalled cursor produces an explicit partial error rather than an infinite loop', async () => {
  const env = await setup({
    game: metadata,
    page: async () => ({ reviews: [review(1)], cursor: '*', total_matching: 7 }),
  });
  try {
    const j = await env.jobs.create(query);
    await waitFor(env.jobs, j.id);
    assert.equal(j.status, 'error');
    assert.equal(j.count, 1);
  } finally {
    await env.cleanup();
  }
});
test('pause aborts an in-flight request and leaves a resumable cache', async () => {
  const env = await setup({
    game: metadata,
    page: async (_q, c, _s, signal) => {
      if (c === '*') return { reviews: [review(1)], cursor: 'a' };
      await delay(60000, undefined, { signal });
      return { reviews: [], cursor: 'b' };
    },
  });
  try {
    const j = await env.jobs.create(query);
    for (let i = 0; i < 100 && j.count < 1; i++) await delay(5);
    await env.jobs.pause(j.id);
    assert.equal(j.status, 'paused');
    assert.equal((await env.storage.reviews(j.id)).length, 1);
  } finally {
    await env.cleanup();
  }
});
test('restart marks unfinished work paused; a cache already at cap does not stay running', async () => {
  const env = await setup({
    game: metadata,
    page: async () => {
      throw Error('Should not fetch');
    },
  });
  try {
    const j: Job = {
      id: '00000000-0000-4000-8000-000000000001',
      query: { ...query, limit: 1 },
      game: await metadata(),
      status: 'running',
      count: 0,
      matching: 5,
      pages: 0,
      cursor: '*',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      message: '',
      retryAt: null,
    };
    await env.storage.save(j);
    await env.storage.append(j.id, [review(1)]);
    await env.jobs.initialize();
    assert.equal(env.jobs.get(j.id).status, 'paused');
    await env.jobs.resume(j.id);
    await waitFor(env.jobs, j.id);
    assert.equal(env.jobs.get(j.id).status, 'limited');
    assert.equal(env.jobs.get(j.id).count, 1);
  } finally {
    await env.cleanup();
  }
});
test('tail recovery truncates only a damaged final line, and normal reads never mutate a live cache', async () => {
  const env = await setup({ game: metadata, page: async () => ({ reviews: [] }) });
  try {
    const j = await env.jobs.create(query);
    await waitFor(env.jobs, j.id);
    await env.storage.append(j.id, [review(1)]);
    const file = path.join(env.storage.directory(j.id), 'reviews.jsonl');
    await appendFile(file, '{"partial":');
    const before = await readFile(file, 'utf8');
    assert.equal((await env.storage.reviews(j.id)).length, 1);
    assert.equal(await readFile(file, 'utf8'), before);
    await env.storage.reviews(j.id, true);
    assert.ok(!(await readFile(file, 'utf8')).includes('partial'));
    assert.throws(() => env.storage.directory('../outside'));
  } finally {
    await env.cleanup();
  }
});
