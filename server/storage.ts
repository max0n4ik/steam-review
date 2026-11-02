import { mkdir, readFile, writeFile, rename, appendFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Job, Review } from '../shared/types.ts';

export class Storage {
  constructor(public root: string) {}
  directory(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid job ID');
    return path.join(this.root, id);
  }
  async save(job: Job) {
    const dir = this.directory(job.id);
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, 'state.json');
    await writeFile(target + '.tmp', JSON.stringify(job, null, 2));
    await rename(target + '.tmp', target);
  }
  async append(id: string, rows: Review[]) {
    if (rows.length)
      await appendFile(
        path.join(this.directory(id), 'reviews.jsonl'),
        rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
      );
  }
  async reviews(id: string, recover = false): Promise<Review[]> {
    let text: string;
    try {
      text = await readFile(path.join(this.directory(id), 'reviews.jsonl'), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    const lines = text.split('\n'),
      rows: Review[] = [],
      seen = new Set<string>();
    let valid = '';
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      try {
        const r = JSON.parse(lines[i]) as Review;
        valid += lines[i] + '\n';
        if (!seen.has(r.recommendationid)) {
          seen.add(r.recommendationid);
          rows.push(r);
        }
      } catch {
        if (i < lines.length - 1 && lines.slice(i + 1).some(Boolean))
          throw new Error('Damaged review cache. Export or delete this session.');
        if (recover) await writeFile(path.join(this.directory(id), 'reviews.jsonl'), valid);
        break;
      }
    }
    return rows;
  }
  async list(): Promise<Job[]> {
    await mkdir(this.root, { recursive: true });
    const ids = await readdir(this.root),
      jobs: Job[] = [];
    for (const id of ids) {
      if (!/^[0-9a-f-]{36}$/.test(id)) continue;
      try {
        jobs.push(JSON.parse(await readFile(path.join(this.directory(id), 'state.json'), 'utf8')));
      } catch {
        /* Ignore incomplete directories without a checkpoint. */
      }
    }
    return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async remove(id: string) {
    await rm(this.directory(id), { recursive: true, force: true });
  }
}
