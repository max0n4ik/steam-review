import { Anchor, Text } from '@mantine/core';
import { useI18n } from '../../i18n.tsx';

export default function AppFooter() {
  const { t } = useI18n();
  return (
    <>
      <Text size="xs" c="dimmed">
        {' '}
        {t('Steam Review Lab не связан с Valve. Источник:')}{' '}
        <Anchor
          size="xs"
          href="https://partner.steamgames.com/doc/webapi/IUserReviewsService#GetAppReviews"
          target="_blank"
        >
          Steam GetAppReviews API
        </Anchor>
      </Text>
      <Text size="xs" c="dimmed">
        <Anchor
          size="xs"
          c="dimmed"
          href="https://openai.com/codex/"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('Создано с помощью Codex')}
        </Anchor>
      </Text>
    </>
  );
}
