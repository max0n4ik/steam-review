import { Badge, Button, Group, Paper, Progress, Text, Title } from '@mantine/core';
import { IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react';
import type { Job } from '../../../shared/types.ts';
import { useI18n } from '../../i18n.tsx';
import { downloadProgress, sessionStatusLabels } from '../../lib/session-display.ts';

interface DownloadStatusProps {
  job: Job;
  busy: boolean;
  loadingRows: boolean;
  onAction: (action: 'pause' | 'resume') => Promise<void>;
  onLoadRows: (job: Job) => Promise<void>;
}

export default function DownloadStatus({
  job,
  busy,
  loadingRows,
  onAction,
  onLoadRows,
}: DownloadStatusProps) {
  const { t, locale, utcDay } = useI18n();
  const { target, percent } = downloadProgress(job);
  return (
    <Paper p="lg">
      <Group justify="space-between" align="start">
        <div>
          <Group gap="sm">
            <Title order={2} size="h3">
              {job.game.name}
            </Title>
            <Badge
              color={job.status === 'complete' ? 'teal' : job.status === 'error' ? 'red' : 'gray'}
              variant="light"
            >
              {t(sessionStatusLabels[job.status])}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed" mt={5}>
            App {job.query.appid} ·{' '}
            {job.query.start !== null
              ? `${utcDay(job.query.start)} — ${utcDay(job.query.end! - 1)} UTC`
              : t('Всё время')}{' '}
            {t('· лимит')} {job.query.limit.toLocaleString(locale)}
          </Text>
        </div>
        <Group gap="xs">
          {job.status === 'running' ? (
            <Button
              size="xs"
              variant="default"
              leftSection={<IconPlayerPause size={15} />}
              onClick={() => void onAction('pause')}
              loading={busy}
            >
              {' '}
              {t('Остановить')}{' '}
            </Button>
          ) : (
            ['paused', 'error'].includes(job.status) && (
              <Button
                size="xs"
                variant="default"
                leftSection={<IconPlayerPlay size={15} />}
                onClick={() => void onAction('resume')}
                loading={busy}
              >
                {' '}
                {t('Продолжить')}{' '}
              </Button>
            )
          )}
          {job.status === 'running' && (
            <Button
              size="xs"
              variant="subtle"
              onClick={() => void onLoadRows(job)}
              loading={loadingRows}
            >
              {' '}
              {t('Посмотреть загруженное')}{' '}
            </Button>
          )}
        </Group>
      </Group>
      <Progress value={percent} mt="md" size="sm" animated={job.status === 'running'} />
      <Group justify="space-between" mt={8}>
        <Text size="xs">
          {job.count.toLocaleString(locale)} / {target.toLocaleString(locale)} · {t('страниц:')}{' '}
          {job.pages}
        </Text>
        <Text size="xs" c="dimmed">
          {t(job.message)}
          {job.retryAt
            ? t(' Повтор после {0}.', [new Date(job.retryAt).toLocaleTimeString(locale)])
            : ''}
        </Text>
      </Group>
      {job.status !== 'complete' && (
        <Text size="xs" c="dimmed" mt={8}>
          {' '}
          {t(
            'Частичная выборка. Проценты и графики относятся только к загруженным отзывам, а не ко всем отзывам игры.',
          )}{' '}
        </Text>
      )}
    </Paper>
  );
}
