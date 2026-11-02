import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { dateRangeToQuery, parseAppId, validateQuery } from '../shared/query.ts';
import { decodePage, retryDelay, SteamClient } from '../server/steam.ts';
import { review } from './fixtures.ts';

test('App ID accepts only an ID or an actual Steam store game URL', () => {
  assert.equal(parseAppId('https://store.steampowered.com/app/440/example/'), 440);
  assert.equal(parseAppId('440'), 440);
  assert.throws(() => parseAppId('https://example.com/app/440/'));
  assert.throws(() => parseAppId('0'));
});
test('limits and both date bounds are validated before network requests', () => {
  assert.throws(() => validateQuery({ appid: 440, limit: 50001 }));
  assert.throws(() => validateQuery({ appid: 440, limit: 1000, start: 123 }));
  assert.deepEqual(validateQuery({ appid: 440, limit: 50000 }), {
    appid: 440,
    limit: 50000,
    start: null,
    end: null,
  });
});
test('calendar range includes the entire last UTC day, including leap day', () => {
  const q = dateRangeToQuery('2024-02-28', '2024-02-29');
  assert.equal(q.end! - q.start!, 2 * 86400);
  assert.throws(() => dateRangeToQuery('2025-02-29', '2025-03-01'));
});
test('Steam may omit reviews on a terminal empty page', () => {
  assert.deepEqual(
    decodePage({ response: { query_summary: { num_reviews: 0 }, total_matching: 0 } }).reviews,
    [],
  );
  assert.throws(() => decodePage({ response: {} }));
});
test('cursor, all-language flags, and exclusive dates are encoded for GetAppReviews', async () => {
  let requested: URL | undefined;
  const fetcher = (async (input: URL | string) => {
    requested = new URL(String(input));
    return Response.json({ response: { reviews: [review(1)], cursor: 'next', total_matching: 1 } });
  }) as typeof fetch;
  const client = new SteamClient({ fetch: fetcher, delayMs: 0 });
  await client.page({ appid: 440, limit: 1000, start: 10, end: 20 }, 'a+/= reserved', 100);
  const args = JSON.parse(requested!.searchParams.get('input_json')!);
  assert.equal(args.cursor, 'a+/= reserved');
  assert.equal(args.date_range_end, 19);
  assert.equal(args.num_per_page, 100);
  assert.equal(args.filter, 1);
  assert.deepEqual(args.languages, ['all']);
  assert.equal(args.purchase_type, 1);
  assert.equal(args.filter_offtopic_activity, false);
  assert.equal(requested!.searchParams.has('key'), false);
});
test('Retry-After seconds and HTTP dates are respected', () => {
  assert.equal(retryDelay('120', 0), 120000);
  assert.equal(
    retryDelay('Wed, 01 Jan 2025 00:01:00 GMT', 0, Date.parse('2025-01-01T00:00:00Z')),
    60000,
  );
  assert.equal(retryDelay('bad', 2), 8000);
});
test('abort exits a rate-limit wait instead of continuing to retry', async () => {
  const controller = new AbortController(),
    client = new SteamClient({
      fetch: (async () =>
        new Response('', { status: 429, headers: { 'Retry-After': '60' } })) as typeof fetch,
      delayMs: 0,
    });
  await assert.rejects(
    client.page(
      { appid: 440, limit: 1, start: null, end: null },
      '*',
      1,
      controller.signal,
      async () => {
        controller.abort();
      },
    ),
  );
});
