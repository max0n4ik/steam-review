import type { Job } from '../../shared/types.ts';

export const sessionStatusLabels: Record<Job['status'], string> = {
  running: 'Загрузка',
  paused: 'Остановлено',
  complete: 'Полная выборка',
  limited: 'Достигнут лимит',
  error: 'Прервано с ошибкой',
};

export function downloadProgress(job: Job) {
  const target = Math.min(job.query.limit, job.matching ?? job.query.limit);
  return { target, percent: target ? Math.min(100, (job.count / target) * 100) : 0 };
}
