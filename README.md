# Steam Review Lab

**English** · [Русский](README.ru.md) · [Español](README.es.md)

A local-first workbench for exploring public Steam reviews for **any game**. Enter an App ID, choose a date range and a download cap, then inspect publication bursts, playtime, reviewer activity, word patterns, and repeated texts.

Built with **Vite+, React, TypeScript, Mantine, Recharts, and a small local Express server**. The interface supports **Russian, English, and Spanish**; use the language selector in the header. The choice is saved in your browser and does not reset an active analysis.

No account, database service, or Steam API key is required for review downloads. Nothing is deployed or uploaded to a hosted analytics service.

## Quick start

Requirements: **Node.js 22.18+, 24.11+, or 26+** and npm (the supported ranges are `^22.18.0 || ^24.11.0 || >=26.0.0`). Node.js 24 LTS is recommended.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Keep the terminal running. Stop with `Ctrl+C`.

For a production build running on your own computer:

```sh
npm run build
npm start
```

The Node server is needed in both modes. Do not open `index.html` directly or deploy `dist/` by itself: the browser calls the local `/api` routes to fetch Steam data and manage downloads.

## How to use it

1. **Choose a game.** Enter its numerical App ID or a Steam store URL, such as `https://store.steampowered.com/app/440/`.
2. **Set the download cap.** Choose 1,000, 10,000, 50,000, or a custom number from 1 to 50,000. This cap applies to the combined positive and negative download, not to each group separately.
3. **Choose a publication period.** Download all time or pick a calendar range. Calendar end dates are inclusive; all date filtering and analysis use **UTC**.
4. Optionally click **“Проверить объём”** to request a matching count before the bulk download. The preview reads one review page with a page size of one; it does not download the complete dataset.
5. Click **“Загрузить отзывы”**. Watch the progress or stop and resume later. After restarting the app, open the session from the local history and click **“Продолжить”**.
6. Analyze positive reviews, negative reviews, or both. Language and analysis-time filters apply to the downloaded snapshot.

The newest matching reviews are downloaded first. If the cap is smaller than the available count, this is a **capped recent subset**, not a random sample or a complete history. The UI labels incomplete datasets explicitly.

## Analysis tools

| View               | What it does                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview           | Review count; median playtime, word count, and public-review count; playtime and text-length histograms; clickable word and phrase clouds.                                                |
| Publications       | Day, hour, 15-minute, 5-minute, or minute buckets; exact UTC date-time filters; click a bucket to drill down.                                                                             |
| Publication bursts | Finds dense rolling windows anchored at actual review timestamps, including bursts crossing a clock-hour boundary. Displays up to ten non-overlapping windows.                            |
| Exact matches      | Groups normalized identical texts; filters by minimum word count and text; sorts by frequency, text length, or time span; expands each group to inspect timestamps and author statistics. |
| Reviewer activity  | Counts distinct authors with exactly 1, 2, 3, etc. public reviews. Click a group to inspect its reviews.                                                                                  |
| Review explorer    | Search, sort, paginate, inspect public source links on demand, and export the current filtered selection as JSON.                                                                         |

Histogram and word-cloud clicks filter the review explorer. A selected publication interval changes the full analysis scope. Use **“Весь период”** to reset the time filter.

### Definitions

- **Playtime at review** is `author.playtime_at_review`, in minutes. It is separate from current lifetime playtime.
- **Reviewer activity** is `author.num_reviews` at download time, including the review on this game. It is not historical activity at publication time, account age, or proof of a new account.
- **Missing values** are excluded from medians. They are never converted into zero.
- **Words** are sequences of letters with optional internal hyphens/apostrophes, after removing Steam BBCode and URLs. Counts are approximate, especially for languages without spaces.
- **Word-cloud frequency** counts reviews containing a term, not repetitions within one review. Russian/English/Spanish stop words are removed; no stemming or semantic model is used.
- **Exact matches** ignore BBCode, URLs, punctuation, case, and the Russian `ё/е` distinction. Numbers are retained. These are normalized duplicates, not an AI plagiarism detector.
- **Time intervals** use `[start, end)`: the start is included, the end is excluded. The calendar translates its inclusive final date to the following midnight.

## Download limits and Steam behavior

Reviews come from Valve's documented [GetAppReviews endpoint](https://partner.steamgames.com/doc/webapi/IUserReviewsService#GetAppReviews), using cursor pagination and pages of at most 100 records.

**50,000 is this application's cap, not a guaranteed Steam allowance.** At 100 reviews per page, that is about 500 successful review requests, possibly plus a terminal-page check, retries, or additional requests when pages overlap. With the default 1.5-second pacing, allow at least roughly 12.5 minutes for a full-size download; network latency and rate limiting can add substantially more time. The app does not claim an official fixed anonymous requests-per-minute allowance.

The downloader:

- Uses chronological creation-date sorting (`filter: 1`) so pagination can terminate.
- Includes all languages, both review signs, all acquisition types, and off-topic activity.
- Shares a paced queue between previews and downloads; only one bulk download runs at a time.
- Honors `Retry-After` and uses exponential backoff for HTTP 429, server errors, and network timeouts, with at most six attempts per page.
- Saves each completed page and its cursor locally, deduplicating by review ID.
- Stops at the cap, an empty terminal page, an explicit pause, or an unrecoverable error.
- Makes paused/error sessions resumable and detects non-advancing cursors.

Anonymous responses can be cached by Steam for up to ten minutes. An app-associated publisher key may have a higher rate limit, but it does not guarantee uninterrupted downloads. Metadata lookup is best effort; if it fails, the app still works with an `App <id>` label.

## Local storage and privacy

Each session is stored under `.data/<session-id>/`:

```text
.data/
  <session-id>/
    state.json       # query, cursor, progress, and completion status
    reviews.jsonl    # original public review records, one per line
```

`.data/`, `.env`, `node_modules/`, and `dist/` are excluded from Git. This repository contains **no downloaded review dataset, account IDs, credentials, or game-specific report**. Test fixtures are synthetic.

The server binds to `127.0.0.1`. It does not use analytics, hosted storage, or remote fonts. Steam requests originate from your computer. Do not expose this local server to the Internet: it is not a multi-user hosted service and has no login system.

Public reviewer links are hidden by default. JSON exports remove Steam IDs and review IDs by default, replacing reviewers with export-local aliases. **This is identifier removal, not full anonymization:** review text and timestamps may still identify someone. Raw cache files retain the original public records and must not be committed or shared accidentally.

Delete a session using its trash button to remove its local records and checkpoint. To erase all downloaded data manually, stop the server and delete `.data/`.

## Configuration

Copy `.env.example` to `.env` if you need different defaults:

```dotenv
PORT=5173
STEAM_REQUEST_DELAY_MS=1500
# DATA_DIR=.data
# STEAM_WEB_API_KEY=
```

| Variable                 | Default | Purpose                                                                                                    |
| ------------------------ | ------- | ---------------------------------------------------------------------------------------------------------- |
| `PORT`                   | `5173`  | Local HTTP port.                                                                                           |
| `STEAM_REQUEST_DELAY_MS` | `1500`  | Delay between review requests; values below 500 ms are clamped to 500.                                     |
| `DATA_DIR`               | `.data` | Cache directory, resolved relative to the repository root. If changed, keep that directory out of Git too. |
| `STEAM_WEB_API_KEY`      | unset   | Optional server-only Steam Web API key. Never prefix secrets with `VITE_` or place them in client source.  |

Do not run multiple server processes against the same `DATA_DIR`.

## Development

```sh
npm run dev          # Express + Vite+ core middleware, one local process
npm run check        # Oxfmt + Oxlint + type-aware TypeScript checks
npm run lint         # Oxlint, failing on warnings
npm run lint:fix     # Apply safe lint fixes
npm run format       # Write Oxfmt formatting
npm run format:check # Check formatting without changing files
npm run typecheck    # TypeScript checks via the Vite+ toolchain
npm test             # Vitest through Vite+; no Steam network requests
npm run build        # Vite+ checks + production assets
npm start            # Serve the built UI and API locally
```

### Vite+, Oxlint, and Oxfmt

The project pins `vite-plus` and uses its matching `@voidzero-dev/vite-plus-core` alias for the embedded dev server. Vite+ provides Oxlint, Oxfmt, Vitest, and the type-aware checking toolchain; standalone Prettier has been removed. You do not need to install a global CLI.

All shared tool configuration lives in **`vite.config.ts`**:

- **Oxlint:** correctness checks, TypeScript/React/React Hooks/accessibility/import plugins, unused-variable checks (intentional `_` names are allowed), no debugger or `var`, `prefer-const`, smart strict equality, duplicate imports, React keys, and hook dependencies. CI-style scripts reject warnings as well as errors.
- **Type checking:** both `typeAware` and `typeCheck` are enabled. `npm run check` runs formatting, lint, and types together.
- **Oxfmt:** two spaces, single quotes, semicolons, trailing commas, 100-column line width, and LF endings. Generated assets, dependencies, local datasets, tool caches, and the generated lockfile are excluded.
- **Tests:** Node environment, `tests/**/*.test.ts`, using `vite-plus/test`.

The underlying commands are `vp lint`, `vp fmt`, `vp check`, `vp test run`, and `vp build`. With npm, invoke them through the scripts above or `npx vp ...`. For the full local application, use **`npm run dev`** (or `npx vp run dev`): bare `vp dev` only starts Vite's frontend server and does not start this project's Express API.

Tool caches under `.vite-plus/` are ignored by Git. No commit hooks or global environment changes are installed.

Tests cover date boundaries, cursor encoding, missing fields, capped downloads, duplicate pages, pause/resume, restart recovery, damaged-tail recovery, HTTP backoff, rolling windows, sentiment separation, exact matches, and identifier-free exports. A 50,000-record download is also exercised against 500 mocked Steam pages; the suite has 29 tests.

```text
src/
  App.tsx                    # query form, session history, download progress
  components/Dashboard.tsx   # analysis views and review explorer
  components/Histogram.tsx   # shared chart
  lib/analysis.ts            # pure analysis functions
server/
  index.ts                   # local HTTP API and Vite/static serving
  steam.ts                   # Steam contract, request queue, retry policy
  jobs.ts                    # download lifecycle and cursor checkpoints
  storage.ts                 # JSONL persistence and recovery
shared/
  types.ts                   # browser/server data contracts
  query.ts                   # input validation and UTC range conversion
tests/                       # synthetic fixtures and automated tests
```

### Local API

| Method        | Endpoint                | Description                                 |
| ------------- | ----------------------- | ------------------------------------------- |
| `POST`        | `/api/preview`          | Matching-count preview for a query.         |
| `GET`, `POST` | `/api/jobs`             | List sessions / start a download.           |
| `GET`         | `/api/jobs/:id`         | Progress and status.                        |
| `GET`         | `/api/jobs/:id/reviews` | Currently saved records.                    |
| `POST`        | `/api/jobs/:id/pause`   | Abort the active request and keep progress. |
| `POST`        | `/api/jobs/:id/resume`  | Resume a paused/error session.              |
| `DELETE`      | `/api/jobs/:id`         | Stop and delete the session.                |

A query body is `{ "appid": 440, "limit": 1000, "start": null, "end": null }`. Date bounds, if supplied, are Unix seconds in UTC with an exclusive `end`.

## Interpretation and limitations

This tool is for exploratory analysis. A short review, a single-review author, a repeated phrase, or a publication burst does not establish paid reviews or coordinated manipulation. Release-day traffic, streams, promotions, memes, quotations, and game length can explain patterns.

Only currently accessible public reviews are returned. Deleted records and previous versions of edited reviews cannot be reconstructed. A long download is not a transactionally consistent historical snapshot: reviews and matching totals can change while it runs.

The review endpoint does **not** provide account registration dates, profile visibility, or owned/purchased-game counts. This app does not silently scrape every reviewer profile. It cannot label an account “clean,” private, or purchased from the available fields.

The UI analyzes up to 50,000 reviews in browser memory, computes exact duplicates rather than expensive pairwise similarity, paginates texts, and limits timeline charts to 2,000 buckets. The code supports the configured cap, but a 50,000-review live download has not been used as a release test. Large multilingual texts may take longer on less powerful machines.

## Troubleshooting

- **Steam returns 429:** leave the app open while it waits, or stop and resume later. Increasing request frequency will not remove the limit.
- **The game name is missing:** store metadata may be unavailable; the App ID download can still work.
- **No reviews in the selected range:** confirm the App ID and UTC dates; a demo/DLC can have its own ID.
- **Port already in use:** set another `PORT` in `.env` and restart.
- **The browser cannot connect:** keep `npm run dev` or `npm start` running and use the URL printed by the server.
- **Changes after a restart:** active sessions become paused; completed pages remain on disk. Reopen and resume them.

## Localization

Interface language is independent of review-language filtering. Original reviews and Steam game names are never machine-translated. Numbers, dates, calendars, accessibility labels, download statuses, and known server errors follow the selected language; all time boundaries remain UTC. The first visit uses the browser's preferred supported language, falling back to English. A saved selection takes precedence.

Translations use stable source phrases in `shared/messages.ts`; `shared/i18n.ts` provides pure formatting and translation helpers, and `src/i18n.tsx` provides the React context and localized Mantine calendar. Add translations and update the coverage tests when changing interface text. Unknown external error messages are displayed unchanged rather than mistranslated. JSON export field names remain stable for programmatic use.

## Acknowledgment

Developed with assistance from [OpenAI Codex](https://openai.com/codex/) for implementation, documentation, and automated checks.

## License

Source code is licensed under the [MIT License](LICENSE). Downloaded review content remains subject to its authors' rights and applicable Steam terms. This project is independent of Valve and Steam.
