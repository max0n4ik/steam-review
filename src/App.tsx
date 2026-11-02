import { useI18n } from './i18n.tsx';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  NumberInput,
  NativeSelect,
  Paper,
  Progress,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconArrowRight,
  IconCalendar,
  IconDatabase,
  IconFlask2,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import type { Job, Preview, Review } from '../shared/types.ts';
import { dateRangeToQuery, parseAppId } from '../shared/query.ts';
import { api } from './lib/api.ts';
const Dashboard = lazy(() => import('./components/Dashboard.tsx'));

const statusLabel: Record<Job['status'], string> = {
  running: 'Загрузка',
  paused: 'Остановлено',
  complete: 'Полная выборка',
  limited: 'Достигнут лимит',
  error: 'Прервано с ошибкой',
};
export default function App() {
  const { t, locale, utcDay, language, setLanguage, calendarLabels, n, numberSymbols } = useI18n();
  const [appid, setAppid] = useState(''),
    [limit, setLimit] = useState<number | string>(1000),
    [period, setPeriod] = useState('all'),
    [dates, setDates] = useState<[string | null, string | null]>([null, null]),
    [previewState, setPreview] = useState<(Preview & { formKey: string }) | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [history, setHistory] = useState<Job[]>([]),
    [job, setJob] = useState<Job | null>(null),
    [rows, setRows] = useState<Review[]>([]),
    [loadingRows, setLoadingRows] = useState(false),
    [deleteJob, setDeleteJob] = useState<Job | null>(null);
  const generation = useRef(0);
  const formKey = JSON.stringify([appid, limit, period, dates]);
  const preview = previewState?.formKey === formKey ? previewState : null;
  const refreshHistory = useCallback(async () => {
    const h = await api<Job[]>('/jobs');
    setHistory(h);
  }, []);
  useEffect(() => {
    let active = true;
    void api<Job[]>('/jobs')
      .then((items) => {
        if (active) setHistory(items);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const loadRows = useCallback(async (target: Job) => {
    const ticket = ++generation.current;
    setLoadingRows(true);
    try {
      const data = await api<Review[]>(`/jobs/${target.id}/reviews`);
      if (ticket === generation.current) setRows(data);
    } catch (e) {
      if (ticket === generation.current) setError((e as Error).message);
    } finally {
      if (ticket === generation.current) setLoadingRows(false);
    }
  }, []);
  async function openSession(target: Job) {
    setError('');
    setPreview(null);
    setJob(target);
    setRows([]);
    await loadRows(target);
  }
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const id = job.id;
    let disposed = false;
    const timer = setInterval(async () => {
      try {
        const fresh = await api<Job>(`/jobs/${id}`);
        if (disposed) return;
        setJob(fresh);
        if (fresh.status !== 'running') {
          clearInterval(timer);
          await loadRows(fresh);
          await refreshHistory();
        }
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      }
    }, 1200);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [job, loadRows, refreshHistory]);
  function query() {
    return {
      appid: parseAppId(appid),
      limit: Number(limit),
      ...(period === 'all'
        ? { start: null, end: null }
        : dateRangeToQuery(dates[0] ?? '', dates[1] ?? '')),
    };
  }
  async function check() {
    setBusy(true);
    setError('');
    try {
      setPreview({ ...(await api<Preview>('/preview', 'POST', query())), formKey });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setBusy(true);
    setError('');
    try {
      const fresh = await api<Job>('/jobs', 'POST', query());
      generation.current++;
      setRows([]);
      setJob(fresh);
      await refreshHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(type: 'pause' | 'resume') {
    if (!job) return;
    setBusy(true);
    setError('');
    try {
      const fresh = await api<Job>(`/jobs/${job.id}/${type}`, 'POST');
      setJob(fresh);
      if (type === 'pause') await loadRows(fresh);
      await refreshHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleteJob) return;
    setBusy(true);
    try {
      await api(`/jobs/${deleteJob.id}`, 'DELETE');
      if (job?.id === deleteJob.id) {
        generation.current++;
        setJob(null);
        setRows([]);
      }
      setDeleteJob(null);
      await refreshHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const target = job ? Math.min(job.query.limit, job.matching ?? job.query.limit) : 0,
    progress = target && job ? Math.min(100, (job.count / target) * 100) : 0;
  return (
    <div className="app">
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
      <div className="workspace">
        <aside className="sidebar">
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
              disabled={!appid.trim() || job?.status === 'running'}
            >
              {' '}
              {t('Проверить объём')}{' '}
            </Button>
            {preview && (
              <Paper p="sm" bg="gray.0">
                <Text fw={600} size="sm">
                  {preview.game.name}
                </Text>
                <Text size="sm" mt={6}>
                  {' '}
                  {t('Подходит:')}{' '}
                  {preview.matching?.toLocaleString(locale) ?? t('количество неизвестно')}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {' '}
                  {t('До')}{' '}
                  {Math.min(
                    preview.query.limit,
                    preview.matching ?? preview.query.limit,
                  ).toLocaleString(locale)}{' '}
                  {t('отзывов · примерно')} {preview.estimatedRequests} {t('запросов')}{' '}
                  {preview.estimatedRequests > 0
                    ? t(' · от {0} мин', [
                        Math.max(1, Math.ceil((preview.estimatedRequests * 1.5) / 60)),
                      ])
                    : ''}
                </Text>
                <Text size="xs" c="dimmed" mt={5}>
                  {' '}
                  {t(
                    'Оценка при стандартной паузе 1,5 с. Ответы Steam и ограничения могут увеличить время.',
                  )}{' '}
                </Text>
              </Paper>
            )}
            <Button
              rightSection={<IconArrowRight size={16} />}
              onClick={start}
              loading={busy}
              disabled={!appid.trim() || job?.status === 'running'}
            >
              {' '}
              {t('Загрузить отзывы')}{' '}
            </Button>
            <Divider />
            <Group justify="space-between">
              <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                {' '}
                {t('Локальные сессии')}{' '}
              </Text>
              <Button variant="subtle" size="compact-xs" onClick={() => void refreshHistory()}>
                {' '}
                {t('Обновить')}{' '}
              </Button>
            </Group>
            {history.length ? (
              history.map((h) => (
                <div className="history-item" key={h.id}>
                  <button className="history-open" onClick={() => void openSession(h)}>
                    <Text size="sm" fw={job?.id === h.id ? 600 : 400} lineClamp={1}>
                      {h.game.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {h.count.toLocaleString(locale)} · {t(statusLabel[h.status])}
                    </Text>
                  </button>
                  <Button
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    aria-label={t('Удалить сессию {0}', [h.game.name])}
                    onClick={() => setDeleteJob(h)}
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
        </aside>
        <main className="content">
          <Stack gap="lg">
            {error && (
              <Alert
                color="red"
                title={t('Не удалось выполнить действие')}
                withCloseButton
                closeButtonLabel={t('Закрыть')}
                onClose={() => setError('')}
              >
                {t(error)}
              </Alert>
            )}
            {job && (
              <Paper p="lg">
                <Group justify="space-between" align="start">
                  <div>
                    <Group gap="sm">
                      <Title order={2} size="h3">
                        {job.game.name}
                      </Title>
                      <Badge
                        color={
                          job.status === 'complete'
                            ? 'teal'
                            : job.status === 'error'
                              ? 'red'
                              : 'gray'
                        }
                        variant="light"
                      >
                        {t(statusLabel[job.status])}
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
                        onClick={() => void action('pause')}
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
                          onClick={() => void action('resume')}
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
                        onClick={() => void loadRows(job)}
                        loading={loadingRows}
                      >
                        {' '}
                        {t('Посмотреть загруженное')}{' '}
                      </Button>
                    )}
                  </Group>
                </Group>
                <Progress value={progress} mt="md" size="sm" animated={job.status === 'running'} />
                <Group justify="space-between" mt={8}>
                  <Text size="xs">
                    {job.count.toLocaleString(locale)} / {target.toLocaleString(locale)} ·{' '}
                    {t('страниц:')} {job.pages}
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
            )}
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
          </Stack>
        </main>
      </div>
      <Modal
        opened={!!deleteJob}
        onClose={() => setDeleteJob(null)}
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
          <Button variant="default" onClick={() => setDeleteJob(null)}>
            {' '}
            {t('Отмена')}{' '}
          </Button>
          <Button color="red" onClick={() => void remove()} loading={busy}>
            {' '}
            {t('Удалить сессию')}{' '}
          </Button>
        </Group>
      </Modal>
    </div>
  );
}
