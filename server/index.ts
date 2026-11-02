import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { validateQuery } from '../shared/query.ts';
import { SteamClient } from './steam.ts';
import { Storage } from './storage.ts';
import { Jobs } from './jobs.ts';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url))),
  production = process.argv.includes('--production');
const port = Number(process.env.PORT ?? 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const configuredDelay = Number(process.env.STEAM_REQUEST_DELAY_MS ?? 1500);
const jobs = new Jobs(
  new Storage(path.resolve(root, process.env.DATA_DIR ?? '.data')),
  new SteamClient({
    delayMs: Number.isFinite(configuredDelay) ? Math.max(500, configuredDelay) : 1500,
    key: process.env.STEAM_WEB_API_KEY,
  }),
);
await jobs.initialize();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.get('/api/jobs', (_req, res) => res.json(jobs.list()));
app.post('/api/preview', async (req, res) => res.json(await jobs.preview(validateQuery(req.body))));
app.post('/api/jobs', async (req, res) =>
  res.status(201).json(await jobs.create(validateQuery(req.body))),
);
app.get('/api/jobs/:id', (req, res) => res.json(jobs.get(req.params.id)));
app.get('/api/jobs/:id/reviews', async (req, res) => {
  jobs.get(req.params.id);
  res.json(await jobs.storage.reviews(req.params.id));
});
app.post('/api/jobs/:id/pause', async (req, res) => res.json(await jobs.pause(req.params.id)));
app.post('/api/jobs/:id/resume', async (req, res) => {
  await jobs.resume(req.params.id);
  res.json(jobs.get(req.params.id));
});
app.delete('/api/jobs/:id', async (req, res) => {
  jobs.get(req.params.id);
  await jobs.remove(req.params.id);
  res.status(204).end();
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).json({ error: err.message || 'Request failed' });
});
let vite: Awaited<ReturnType<(typeof import('vite'))['createServer']>> | undefined;
if (production) {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
} else {
  const { createServer } = await import('vite');
  vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    if (req.method !== 'GET') return next();
    try {
      const html = await readFile(path.join(root, 'index.html'), 'utf8');
      res.type('html').send(await vite!.transformIndexHtml(req.originalUrl, html));
    } catch (e) {
      vite!.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
const server = app.listen(port, '127.0.0.1', () =>
  console.log(
    `Steam Review Lab: http://127.0.0.1:${port} (${production ? 'production' : 'development'})`,
  ),
);
server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await jobs.shutdown();
  await vite?.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
