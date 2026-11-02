import { Button, Group, Modal, Text } from '@mantine/core';
import type { Job } from '../../../shared/types.ts';
import { useI18n } from '../../i18n.tsx';

export default function DeleteSessionDialog({
  job,
  busy,
  onCancel,
  onConfirm,
}: {
  job: Job | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <Modal
      opened={!!job}
      onClose={() => onCancel()}
      title={t('Удалить локальную сессию?')}
      centered
      closeButtonProps={{ 'aria-label': t('Закрыть') }}
    >
      <Text size="sm">
        {' '}
        {t(
          'Отзывы и сохранённый прогресс этой сессии будут удалены с компьютера. Исходные отзывы в Steam останутся.',
        )}{' '}
      </Text>
      <Group justify="end" mt="lg">
        <Button variant="default" onClick={() => onCancel()}>
          {' '}
          {t('Отмена')}{' '}
        </Button>
        <Button color="red" onClick={() => void onConfirm()} loading={busy}>
          {' '}
          {t('Удалить сессию')}{' '}
        </Button>
      </Group>
    </Modal>
  );
}
