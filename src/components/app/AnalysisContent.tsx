import { lazy, Suspense } from 'react';
import { Divider, Group, Loader, Paper, Text, Title } from '@mantine/core';
import { IconDatabase } from '@tabler/icons-react';
import type { Job, Review } from '../../../shared/types.ts';
import { useI18n } from '../../i18n.tsx';

const Dashboard = lazy(() => import('../Dashboard.tsx'));

export default function AnalysisContent({
  job,
  rows,
  loadingRows,
}: {
  job: Job | null;
  rows: Review[];
  loadingRows: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      {loadingRows && (
        <Group>
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            {' '}
            {t('Подготовка данных…')}{' '}
          </Text>
        </Group>
      )}
      {job && rows.length > 0 ? (
        <Suspense fallback={<Loader size="sm" />}>
          <Dashboard key={job.id} rows={rows} job={job} />
        </Suspense>
      ) : (
        !loadingRows && (
          <Paper className="welcome" p="xl">
            <IconDatabase size={35} stroke={1.3} />
            <Title order={2} mt="md">
              {' '}
              {t('Начните с игры')}{' '}
            </Title>
            <Text c="dimmed" maw={480} mx="auto" mt="sm">
              {' '}
              {t(
                'Введите App ID, ограничьте количество отзывов и выберите период. Здесь появятся графики публикаций, время в игре и повторяющиеся тексты.',
              )}{' '}
            </Text>
            <Divider my="xl" />
            <Group justify="center" gap="xl">
              <Text size="xs" c="dimmed">
                {' '}
                {t('Без регистрации')}{' '}
              </Text>
              <Text size="xs" c="dimmed">
                {' '}
                {t('Данные на вашем компьютере')}{' '}
              </Text>
              <Text size="xs" c="dimmed">
                {' '}
                {t('Остановка и продолжение')}{' '}
              </Text>
            </Group>
          </Paper>
        )
      )}
    </>
  );
}
