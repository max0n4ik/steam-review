import {
  Button,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconArrowRight, IconCalendar, IconRefresh } from '@tabler/icons-react';
import dayjs from 'dayjs';
import type { Preview } from '../../../shared/types.ts';
import type { ReviewQueryForm } from '../../hooks/useReviewQuery.ts';
import { useI18n } from '../../i18n.tsx';

interface QueryFormProps {
  form: ReviewQueryForm;
  busy: boolean;
  downloading: boolean;
  onDownload: () => Promise<void>;
}

export default function QueryForm({ form, busy, downloading, onDownload }: QueryFormProps) {
  const { t, n, calendarLabels, numberSymbols } = useI18n();
  const { appid, setAppid, limit, setLimit, period, setPeriod, dates, setDates, preview, check } =
    form;
  return (
    <Stack gap="lg">
      <TextInput
        label={t('App ID или ссылка на игру')}
        placeholder={t('Например, 440')}
        value={appid}
        onChange={(e) => setAppid(e.currentTarget.value)}
        disabled={busy}
        inputMode="url"
      />
      <div>
        <Text component="label" size="sm" fw={500} mb={7}>
          {' '}
          {t('Максимум отзывов')}{' '}
        </Text>
        <SegmentedControl
          fullWidth
          value={String([1000, 10000, 50000].includes(Number(limit)) ? limit : 'custom')}
          onChange={(v) => setLimit(v === 'custom' ? 500 : Number(v))}
          data={[
            { label: n(1000), value: '1000' },
            { label: n(10000), value: '10000' },
            { label: n(50000), value: '50000' },
            { label: t('Другое'), value: 'custom' },
          ]}
          size="xs"
        />
        <NumberInput
          aria-label={t('Точный лимит отзывов')}
          value={limit}
          onChange={setLimit}
          min={1}
          max={50000}
          allowDecimal={false}
          thousandSeparator={numberSymbols.group}
          decimalSeparator={numberSymbols.decimal}
          mt="xs"
        />
        <Text size="xs" c="dimmed" mt={5}>
          {' '}
          {t('Если отзывов больше, загружаются самые новые.')}{' '}
        </Text>
      </div>
      <div>
        <Text size="sm" fw={500} mb={7}>
          {' '}
          {t('Период публикации')}{' '}
        </Text>
        <SegmentedControl
          fullWidth
          value={period}
          onChange={setPeriod}
          data={[
            { label: t('Всё время'), value: 'all' },
            { label: t('Выбрать даты'), value: 'range' },
          ]}
          size="xs"
        />
        {period === 'range' && (
          <Stack gap="xs" mt="sm">
            <DatePickerInput
              ariaLabels={calendarLabels}
              clearButtonProps={{ 'aria-label': t('Очистить') }}
              type="range"
              label={t('Диапазон дат · UTC')}
              placeholder={t('Начальная и конечная даты')}
              value={dates}
              onChange={setDates}
              valueFormat="DD MMM YYYY"
              numberOfColumns={2}
              clearable
              leftSection={<IconCalendar size={16} />}
              maxDate={dayjs().format('YYYY-MM-DD')}
            />
            <Group gap={6}>
              <Button
                size="compact-xs"
                variant="subtle"
                onClick={() =>
                  setDates([
                    dayjs().subtract(29, 'day').format('YYYY-MM-DD'),
                    dayjs().format('YYYY-MM-DD'),
                  ])
                }
              >
                {' '}
                {t('30 дней')}{' '}
              </Button>
              <Button
                size="compact-xs"
                variant="subtle"
                onClick={() =>
                  setDates([
                    dayjs().subtract(2, 'month').format('YYYY-MM-DD'),
                    dayjs().format('YYYY-MM-DD'),
                  ])
                }
              >
                {' '}
                {t('2 месяца')}{' '}
              </Button>
            </Group>
          </Stack>
        )}
      </div>
      <Button
        variant="default"
        leftSection={<IconRefresh size={16} />}
        onClick={check}
        loading={busy}
        disabled={!appid.trim() || downloading}
      >
        {' '}
        {t('Проверить объём')}{' '}
      </Button>
      {preview && <QueryPreview preview={preview} />}
      <Button
        rightSection={<IconArrowRight size={16} />}
        onClick={onDownload}
        loading={busy}
        disabled={!appid.trim() || downloading}
      >
        {' '}
        {t('Загрузить отзывы')}{' '}
      </Button>
    </Stack>
  );
}

function QueryPreview({ preview }: { preview: Preview }) {
  const { t, locale } = useI18n();
  return (
    <Paper p="sm" bg="gray.0">
      <Text fw={600} size="sm">
        {preview.game.name}
      </Text>
      <Text size="sm" mt={6}>
        {' '}
        {t('Подходит:')} {preview.matching?.toLocaleString(locale) ?? t('количество неизвестно')}
      </Text>
      <Text size="xs" c="dimmed" mt={4}>
        {' '}
        {t('До')}{' '}
        {Math.min(preview.query.limit, preview.matching ?? preview.query.limit).toLocaleString(
          locale,
        )}{' '}
        {t('отзывов · примерно')} {preview.estimatedRequests} {t('запросов')}{' '}
        {preview.estimatedRequests > 0
          ? t(' · от {0} мин', [Math.max(1, Math.ceil((preview.estimatedRequests * 1.5) / 60))])
          : ''}
      </Text>
      <Text size="xs" c="dimmed" mt={5}>
        {' '}
        {t(
          'Оценка при стандартной паузе 1,5 с. Ответы Steam и ограничения могут увеличить время.',
        )}{' '}
      </Text>
    </Paper>
  );
}
