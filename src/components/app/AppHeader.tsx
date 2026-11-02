import { Group, NativeSelect, Title } from '@mantine/core';
import { IconFlask2 } from '@tabler/icons-react';
import { useI18n } from '../../i18n.tsx';

export default function AppHeader() {
  const { t, language, setLanguage } = useI18n();
  return (
    <header className="app-header">
      <Group gap="sm">
        <IconFlask2 size={23} />
        <Title order={1} size="h4">
          Steam Review Lab
        </Title>
      </Group>
      <Group gap="md">
        <NativeSelect
          aria-label={t('Язык интерфейса')}
          value={language}
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (value === 'ru' || value === 'en' || value === 'es') setLanguage(value);
          }}
          data={[
            { value: 'ru', label: 'Русский' },
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Español' },
          ]}
          size="xs"
          w={130}
        />
      </Group>
    </header>
  );
}
