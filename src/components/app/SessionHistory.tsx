import { Button, Group, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { Job } from '../../../shared/types.ts';
import { useI18n } from '../../i18n.tsx';
import { sessionStatusLabels } from '../../lib/session-display.ts';

interface SessionHistoryProps {
  history: Job[];
  currentId?: string;
  onOpen: (job: Job) => Promise<void>;
  onDelete: (job: Job) => void;
  onRefresh: () => Promise<void>;
}

export default function SessionHistory({
  history,
  currentId,
  onOpen,
  onDelete,
  onRefresh,
}: SessionHistoryProps) {
  const { t, locale } = useI18n();
  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Text size="xs" fw={600} tt="uppercase" c="dimmed">
          {' '}
          {t('Локальные сессии')}{' '}
        </Text>
        <Button variant="subtle" size="compact-xs" onClick={() => void onRefresh()}>
          {' '}
          {t('Обновить')}{' '}
        </Button>
      </Group>
      {history.length ? (
        history.map((h) => (
          <div className="history-item" key={h.id}>
            <button className="history-open" onClick={() => void onOpen(h)}>
              <Text size="sm" fw={currentId === h.id ? 600 : 400} lineClamp={1}>
                {h.game.name}
              </Text>
              <Text size="xs" c="dimmed">
                {h.count.toLocaleString(locale)} · {t(sessionStatusLabels[h.status])}
              </Text>
            </button>
            <Button
              variant="subtle"
              color="gray"
              size="compact-xs"
              aria-label={t('Удалить сессию {0}', [h.game.name])}
              onClick={() => onDelete(h)}
            >
              <IconTrash size={15} />
            </Button>
          </div>
        ))
      ) : (
        <Text size="xs" c="dimmed">
          {' '}
          {t('Пока нет сохранённых загрузок.')}{' '}
        </Text>
      )}
    </Stack>
  );
}
