import { randomUUID } from 'node:crypto';
import type { Job, Preview, Query } from '../shared/types.ts';
import type { PageClient } from './steam.ts';
import { Storage } from './storage.ts';

export class Jobs {
  jobs = new Map<string, Job>();
  private active: { id: string; controller: AbortController; done: Promise<void> } | null = null;
  constructor(
    public storage: Storage,
    private steam: PageClient,
  ) {}
  async initialize() {
    for (const j of await this.storage.list()) {
      if (j.status === 'running') {
        j.status = 'paused';
        j.message = 'Предыдущий запуск остановлен. Можно продолжить.';
        j.retryAt = null;
        await this.storage.save(j);
      }
      this.jobs.set(j.id, j);
    }
  }
  get(id: string) {
    const j = this.jobs.get(id);
    if (!j) throw new Error('Сессия не найдена.');
    return j;
  }
  list() {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async preview(query: Query): Promise<Preview> {
    const [page, game] = await Promise.all([
      this.steam.page(query, '*', 1),
      this.steam.game(query.appid),
    ]);
    return {
      query,
      game,
      matching: page.total_matching ?? null,
      estimatedRequests: Math.ceil(Math.min(query.limit, page.total_matching ?? query.limit) / 100),
    };
  }
  async create(query: Query) {
    if (this.active) throw new Error('Уже выполняется загрузка. Сначала остановите её.');
    const now = new Date().toISOString(),
      job: Job = {
        id: randomUUID(),
        query,
        game: await this.steam.game(query.appid),
        status: 'paused',
        count: 0,
        matching: null,
        pages: 0,
        cursor: '*',
        createdAt: now,
        updatedAt: now,
        message: 'Подготовка загрузки',
        retryAt: null,
      };
    // Another request may have started while metadata was loading.
    if (this.active) throw new Error('Уже выполняется загрузка.');
    this.jobs.set(job.id, job);
    await this.storage.save(job);
    await this.resume(job.id);
    return job;
  }
  async resume(id: string) {
    // A terminal status can become visible just before its checkpoint finishes.
    if (this.active?.id === id && this.get(id).status !== 'running') await this.active.done;
    if (this.active) throw new Error('Уже выполняется загрузка.');
    const job = this.get(id);
    if (['complete', 'limited'].includes(job.status)) throw new Error('Загрузка уже завершена.');
    const controller = new AbortController();
    job.status = 'running';
    job.message = 'Загрузка отзывов';
    job.retryAt = null;
    // Reserve the slot before yielding to disk I/O.
    const slot = { id, controller, done: Promise.resolve() };
    this.active = slot;
    try {
      await this.storage.save(job);
    } catch (error) {
      this.active = null;
      throw error;
    }
    slot.done = this.run(job, controller.signal)
      .catch(() => {
        job.status = 'error';
        job.message = 'Не удалось сохранить прогресс на диск. Проверьте доступ и свободное место.';
      })
      .finally(() => {
        if (this.active === slot) this.active = null;
      });
  }
  async pause(id: string) {
    const active = this.active;
    if (active?.id === id) {
      active.controller.abort();
      await active.done;
    }
    return this.get(id);
  }
  async remove(id: string) {
    await this.pause(id);
    await this.storage.remove(id);
    this.jobs.delete(id);
  }
  async shutdown() {
    if (this.active) await this.pause(this.active.id);
  }
  private async run(job: Job, signal: AbortSignal) {
    try {
      const existing = await this.storage.reviews(job.id, true),
        seen = new Set(existing.map((r) => r.recommendationid));
      job.count = existing.length;
      if (job.count >= job.query.limit) {
        job.status = job.matching !== null && job.count >= job.matching ? 'complete' : 'limited';
        job.message = 'Выбранный объём уже сохранён.';
      }
      while (job.count < job.query.limit) {
        signal.throwIfAborted();
        const page = await this.steam.page(
          job.query,
          job.cursor,
          Math.min(100, job.query.limit - job.count),
          signal,
          async (wait) => {
            job.retryAt = new Date(Date.now() + wait).toISOString();
            job.message = 'Steam просит подождать. Автоматический повтор.';
            await this.storage.save(job);
          },
        );
        job.retryAt = null;
        job.message = 'Загрузка отзывов';
        if (page.total_matching !== undefined) job.matching = page.total_matching;
        const valid = page.reviews.filter(
          (r) =>
            job.query.start === null ||
            (r.timestamp_created >= job.query.start && r.timestamp_created < job.query.end!),
        );
        if (valid.length !== page.reviews.length)
          throw new Error('Steam вернул отзывы вне выбранного периода. Загрузка остановлена.');
        const fresh = valid
          .filter((r) => {
            if (seen.has(r.recommendationid)) return false;
            seen.add(r.recommendationid);
            return true;
          })
          .slice(0, job.query.limit - job.count);
        await this.storage.append(job.id, fresh);
        job.count += fresh.length;
        job.pages++;
        if (!page.reviews.length) {
          job.status = 'complete';
          job.message = 'Все доступные отзывы по запросу загружены.';
          break;
        }
        if (job.count >= job.query.limit) {
          job.status = job.matching !== null && job.count >= job.matching ? 'complete' : 'limited';
          job.message =
            job.status === 'complete'
              ? 'Все доступные отзывы по запросу загружены.'
              : 'Достигнут выбранный лимит. Загружены самые новые подходящие отзывы.';
          break;
        }
        if (!page.cursor || page.cursor === job.cursor)
          throw new Error('Курсор Steam не продвинулся. Сохранена частичная выборка.');
        job.cursor = page.cursor;
        job.updatedAt = new Date().toISOString();
        await this.storage.save(job);
      }
    } catch (error) {
      job.status = signal.aborted ? 'paused' : 'error';
      job.message = signal.aborted
        ? 'Загрузка остановлена. Прогресс сохранён.'
        : error instanceof Error
          ? error.message
          : 'Ошибка загрузки';
    } finally {
      job.retryAt = null;
      job.updatedAt = new Date().toISOString();
      await this.storage.save(job);
    }
  }
}
