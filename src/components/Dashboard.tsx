import { useI18n } from '../i18n.tsx';
import { useCallback, useMemo, useState } from 'react';
import {
  Accordion,
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Pagination,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { IconDownload, IconSearch, IconX } from '@tabler/icons-react';
import type { Job, Review } from '../../shared/types.ts';
import {
  anonymize,
  authorDistribution,
  bursts,
  duplicateGroups,
  filterReviews,
  histogram,
  median,
  normalize,
  prepare,
  stripMarkup,
  timeline,
  wordCloud,
  type Analyzed,
  type Sentiment,
} from '../lib/analysis.ts';
import { saveJSON } from '../lib/api.ts';
import Histogram from './Histogram.tsx';

const inputDate = (t: number) => new Date(t * 1000).toISOString().slice(0, 19).replace('T', ' ');
const parseDate = (s: string | null) => (s ? Date.parse(s.replace(' ', 'T') + 'Z') / 1000 : NaN);
const link = (r: Review, appid: number) =>
  `https://steamcommunity.com/profiles/${r.author.steamid}/recommended/${appid}/`;
interface Filters {
  time?: [number, number];
  length?: [number, number];
  author?: [number, number];
  exact?: string;
  term?: string;
}
function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Paper p="lg">
      <Title order={3} size="h5">
        {title}
      </Title>
      {description && (
        <Text size="xs" c="dimmed" mt={4} mb="md">
          {description}
        </Text>
      )}
      {children}
    </Paper>
  );
}
function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Paper p="md">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text className="metric-value" fw={600}>
        {value}
      </Text>
      <Text size="xs" c="dimmed">
        {note}
      </Text>
    </Paper>
  );
}
export default function Dashboard({ rows, job }: { rows: Review[]; job: Job }) {
  const { t, n, fmt, languageName, calendarLabels, pageItemProps, pageControlProps } = useI18n();
  const prepared = useMemo(() => prepare(rows), [rows]);
  const [sentiment, setSentiment] = useState<Sentiment>('positive'),
    [language, setLanguage] = useState('all'),
    [tab, setTab] = useState<string | null>('overview'),
    [customRange, setCustomRange] = useState<[number, number] | null>(null);
  const [start, setStart] = useState<string | null>(null),
    [end, setEnd] = useState<string | null>(null),
    [rangeError, setRangeError] = useState(''),
    [step, setStep] = useState('86400'),
    [windowSize, setWindowSize] = useState('300');
  const [timeMode, setTimeMode] = useState('review'),
    [timeStep, setTimeStep] = useState('15'),
    [cloudMode, setCloudMode] = useState('words'),
    [hideGeneric, setHideGeneric] = useState(true),
    [authorLimit, setAuthorLimit] = useState('20');
  const [minWords, setMinWords] = useState('6'),
    [dupSort, setDupSort] = useState('count'),
    [dupSearch, setDupSearch] = useState(''),
    [dupPage, setDupPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({}),
    [search, setSearch] = useState(''),
    [sort, setSort] = useState('new'),
    [page, setPage] = useState(1),
    [showLinks, setShowLinks] = useState(false),
    [exportAnonymous, setExportAnonymous] = useState(true);
  const languages = useMemo(() => [...new Set(prepared.map((r) => r.language))].sort(), [prepared]);
  const baseRange = useMemo<[number, number]>(() => {
    let low = Infinity,
      high = -Infinity;
    for (const r of prepared) {
      low = Math.min(low, r.timestamp_created);
      high = Math.max(high, r.timestamp_created);
    }
    return [job.query.start ?? low, job.query.end ?? high + 1];
  }, [prepared, job.query]);
  const range = customRange ?? baseRange;
  const cohort = useMemo(
    () => filterReviews(prepared, sentiment, language, customRange),
    [prepared, sentiment, language, customRange],
  );
  const time = useCallback(
    (r: Analyzed) =>
      timeMode === 'review' ? r.author.playtime_at_review : r.author.playtime_forever,
    [timeMode],
  );
  const timelineBins = useMemo(() => timeline(cohort, range, Number(step)), [cohort, range, step]);
  const peakWindows = useMemo(() => bursts(cohort, Number(windowSize)), [cohort, windowSize]);
  const cloud = useMemo(
    () => wordCloud(cohort, cloudMode === 'pairs', hideGeneric),
    [cohort, cloudMode, hideGeneric],
  );
  const groups = useMemo(() => {
    const q = normalize(dupSearch),
      g = duplicateGroups(cohort, Number(minWords)).filter((g) => !q || g.key.includes(q));
    g.sort((a, b) =>
      dupSort === 'span'
        ? a.span - b.span
        : dupSort === 'words'
          ? b.wordCount - a.wordCount
          : b.rows.length - a.rows.length || b.wordCount - a.wordCount,
    );
    return g;
  }, [cohort, minWords, dupSort, dupSearch]);
  const authorBins = useMemo(
    () => authorDistribution(cohort, Number(authorLimit)),
    [cohort, authorLimit],
  );
  const aliases = useMemo(() => {
    const ids = new Map<string, string>();
    prepared.forEach((r) => {
      if (!ids.has(r.author.steamid)) ids.set(r.author.steamid, t('Автор {0}', [ids.size + 1]));
    });
    return ids;
  }, [prepared, t]);
  const selected = useMemo(() => {
    const q = normalize(search);
    return cohort
      .filter(
        (r) =>
          (!q || normalize(r.review).includes(q)) &&
          (!filters.time ||
            (time(r) !== undefined && time(r)! >= filters.time[0] && time(r)! < filters.time[1])) &&
          (!filters.length ||
            (r.tokens.length >= filters.length[0] && r.tokens.length < filters.length[1])) &&
          (!filters.author ||
            (r.author.num_reviews !== undefined &&
              r.author.num_reviews >= filters.author[0] &&
              r.author.num_reviews < filters.author[1])) &&
          (!filters.exact || r.normalized === filters.exact) &&
          (!filters.term || (' ' + r.searchText + ' ').includes(' ' + filters.term + ' ')),
      )
      .sort((a, b) =>
        sort === 'time'
          ? (time(a) ?? Infinity) - (time(b) ?? Infinity)
          : sort === 'words'
            ? a.tokens.length - b.tokens.length
            : sort === 'author'
              ? (a.author.num_reviews ?? Infinity) - (b.author.num_reviews ?? Infinity)
              : b.timestamp_created - a.timestamp_created,
      );
  }, [cohort, search, filters, sort, time]);
  const positives = prepared.filter((r) => r.voted_up).length,
    negatives = prepared.length - positives;
  const playtimeBins = histogram(
    cohort.map(time),
    Array.from(
      { length: Math.ceil((timeMode === 'review' ? 180 : 600) / Number(timeStep)) + 1 },
      (_, i) => i * Number(timeStep),
    ),
  );
  const lengthBins = histogram(
    cohort.map((r) => r.tokens.length),
    [0, 5, 10, 20, 50, 100, 200],
  );
  const authorCount = new Set(cohort.map((r) => r.author.steamid)).size;
  function focus(filter: Filters) {
    setFilters(filter);
    setSearch('');
    setPage(1);
    setTab('reviews');
  }
  function setRange(a: number, b: number, newStep?: number) {
    if (
      !Number.isFinite(a) ||
      !Number.isFinite(b) ||
      a >= b ||
      a < baseRange[0] ||
      b > baseRange[1]
    ) {
      setRangeError('Выберите корректный интервал внутри загруженного периода.');
      return;
    }
    setRangeError('');
    setCustomRange([a, b]);
    setStart(inputDate(a));
    setEnd(inputDate(b));
    if (newStep) setStep(String(newStep));
    setFilters({});
    setPage(1);
  }
  function resetRange() {
    setCustomRange(null);
    setStart(null);
    setEnd(null);
    setRangeError('');
    setStep('86400');
    setFilters({});
    setPage(1);
  }
  function exportRows() {
    saveJSON(`steam-${job.query.appid}-${sentiment}.json`, {
      version: 1,
      app: job.game,
      query: job.query,
      downloadStatus: job.status,
      totalMatching: job.matching,
      loadedCount: prepared.length,
      exportedCount: selected.length,
      sentiment,
      language,
      timeRange: customRange,
      filters: {
        ...filters,
        time: filters.time?.map((v) => (Number.isFinite(v) ? v : null)),
        length: filters.length?.map((v) => (Number.isFinite(v) ? v : null)),
        author: filters.author?.map((v) => (Number.isFinite(v) ? v : null)),
        timeMode,
        search,
      },
      identifiersRemoved: exportAnonymous,
      reviews: exportAnonymous
        ? anonymize(selected)
        : selected.map(
            ({ tokens: _tokens, normalized: _normalized, searchText: _searchText, ...r }) => r,
          ),
    });
  }
  const source = (r: Analyzed) =>
    showLinks ? (
      <Anchor href={link(r, job.query.appid)} target="_blank" size="xs">
        {aliases.get(r.author.steamid)} ↗
      </Anchor>
    ) : (
      <Text size="xs">{aliases.get(r.author.steamid)}</Text>
    );
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="end">
        <div>
          <Text size="xs" c="dimmed" mb={7}>
            {' '}
            {t('Загруженный снимок:')} {n(prepared.length)} {t('отзывов')}{' '}
          </Text>
          <SegmentedControl
            value={sentiment}
            onChange={(v) => {
              setSentiment(v as Sentiment);
              setFilters({});
              setPage(1);
            }}
            data={[
              { label: t('Положительные · {0}', [n(positives)]), value: 'positive' },
              { label: t('Отрицательные · {0}', [n(negatives)]), value: 'negative' },
              { label: t('Все'), value: 'all' },
            ]}
          />
        </div>
        <Select
          label={t('Язык отзыва')}
          aria-label={t('Язык отзыва')}
          value={language}
          onChange={(v) => {
            setLanguage(v ?? 'all');
            setFilters({});
            setPage(1);
          }}
          data={[
            { value: 'all', label: t('Все языки') },
            ...languages.map((l) => ({ value: l, label: languageName(l) })),
          ]}
          searchable
          w={180}
        />
      </Group>
      {customRange && (
        <Alert color="gray">
          <Group justify="space-between">
            <Text size="xs">
              {' '}
              {t('Период анализа:')} {fmt(range[0])} — {fmt(range[1])}{' '}
              {t('UTC (конец не включён)')}{' '}
            </Text>
            <Button size="compact-xs" variant="subtle" onClick={resetRange}>
              {' '}
              {t('Весь загруженный период')}{' '}
            </Button>
          </Group>
        </Alert>
      )}
      <SimpleGrid cols={{ base: 2, lg: 4 }}>
        <Metric
          label={t('Отзывов в выборке')}
          value={n(cohort.length)}
          note={t('{0} уникальных авторов', [n(authorCount)])}
        />
        <Metric
          label={t('Время при отзыве · медиана')}
          value={t('{0} мин', [n(median(cohort.map((r) => r.author.playtime_at_review)))])}
          note={t('{0} без данных о времени', [
            n(cohort.filter((r) => r.author.playtime_at_review === undefined).length),
          ])}
        />
        <Metric
          label={t('Длина текста · медиана')}
          value={t('{0} слов', [n(median(cohort.map((r) => r.tokens.length)))])}
          note={t('Без BBCode и ссылок')}
        />
        <Metric
          label={t('Отзывов у автора · медиана')}
          value={n(median(cohort.map((r) => r.author.num_reviews)))}
          note={t('Публичные отзывы сейчас, включая этот')}
        />
      </SimpleGrid>
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="overview">{t('Обзор')}</Tabs.Tab>
          <Tabs.Tab value="timeline">{t('Публикации')}</Tabs.Tab>
          <Tabs.Tab value="duplicates">{t('Совпадения')}</Tabs.Tab>
          <Tabs.Tab value="authors">{t('Опыт авторов')}</Tabs.Tab>
          <Tabs.Tab value="reviews">{t('Отзывы')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview" pt="lg">
          <Stack gap="lg">
            <Panel
              title={t('Время в игре')}
              description={t(
                'Каждый столбец — количество отзывов. Нажмите его, чтобы открыть тексты из интервала.',
              )}
            >
              <Group justify="space-between" mb="md">
                <SegmentedControl
                  value={timeMode}
                  onChange={(v) => {
                    setTimeMode(v);
                    setFilters({});
                  }}
                  size="xs"
                  data={[
                    { value: 'review', label: t('При отзыве') },
                    { value: 'total', label: t('Всего сейчас') },
                  ]}
                />
                <Select
                  label={t('Шаг, минуты')}
                  value={timeStep}
                  onChange={(v) => setTimeStep(v ?? '15')}
                  data={['15', '30', '60']}
                  w={110}
                  size="xs"
                />
              </Group>
              <Histogram data={playtimeBins} onSelect={(b) => focus({ time: [b.start, b.end] })} />
              <Text size="xs" c="dimmed">
                {' '}
                {t(
                  'Интервалы включают нижнюю границу и не включают верхнюю. Последний столбец без верхней границы. Малое время игры само по себе не доказывает накрутку.',
                )}{' '}
              </Text>
            </Panel>
            <Panel
              title={t('Длина отзывов')}
              description={t(
                'Количество слов в сообщении. Нажмите столбец для просмотра соответствующих отзывов.',
              )}
            >
              <Histogram data={lengthBins} onSelect={(b) => focus({ length: [b.start, b.end] })} />
            </Panel>
            <Panel
              title={t('Повторяющиеся слова')}
              description={t(
                'Размер слова соответствует числу отзывов, где оно встретилось хотя бы один раз. Нажмите для просмотра текстов.',
              )}
            >
              <Group justify="space-between">
                <SegmentedControl
                  value={cloudMode}
                  onChange={setCloudMode}
                  size="xs"
                  data={[
                    { value: 'words', label: t('Слова') },
                    { value: 'pairs', label: t('Пары слов') },
                  ]}
                />
                <Checkbox
                  size="xs"
                  label={t('Убрать «игра / game / juego»')}
                  checked={hideGeneric}
                  onChange={(e) => setHideGeneric(e.currentTarget.checked)}
                />
              </Group>
              <div className="word-cloud">
                {cloud.length ? (
                  cloud.map(({ word, count }) => (
                    <button
                      key={word}
                      title={t('{0}: {1} отзывов', [word, count])}
                      style={{
                        fontSize: `${13 + 26 * Math.sqrt(count / (cloud[0]?.count || 1))}px`,
                      }}
                      onClick={() => focus({ term: word })}
                    >
                      {word}
                    </button>
                  ))
                ) : (
                  <Text size="sm" c="dimmed">
                    {' '}
                    {t('Недостаточно слов для облака.')}{' '}
                  </Text>
                )}
              </div>
              <Text size="xs" c="dimmed">
                {' '}
                {t(
                  'Удаляются служебные слова русского, английского и испанского языка. Словоформы считаются отдельно. Облако не определяет смысл или достоверность отзывов.',
                )}{' '}
              </Text>
            </Panel>
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="timeline" pt="lg">
          <Stack gap="lg">
            <Panel
              title={t('Когда публиковали отзывы')}
              description={t(
                'Все даты и время здесь в UTC. Конец интервала не включён. Нажмите день → часы, час → минуты.',
              )}
            >
              <Group align="end" grow>
                <DateTimePicker
                  ariaLabels={calendarLabels}
                  submitButtonProps={{ 'aria-label': t('Применить') }}
                  label={t('С')}
                  placeholder={inputDate(range[0])}
                  value={start}
                  onChange={setStart}
                  withSeconds
                  valueFormat="DD MMM YYYY HH:mm:ss"
                />
                <DateTimePicker
                  ariaLabels={calendarLabels}
                  submitButtonProps={{ 'aria-label': t('Применить') }}
                  label={t('До, не включая')}
                  placeholder={inputDate(range[1])}
                  value={end}
                  onChange={setEnd}
                  withSeconds
                  valueFormat="DD MMM YYYY HH:mm:ss"
                />
              </Group>
              <Group mt="sm" justify="space-between">
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() =>
                      setRange(start ? parseDate(start) : range[0], end ? parseDate(end) : range[1])
                    }
                  >
                    {' '}
                    {t('Применить')}{' '}
                  </Button>
                  <Button size="xs" variant="subtle" onClick={resetRange}>
                    {' '}
                    {t('Весь период')}{' '}
                  </Button>
                </Group>
                <Select
                  label={t('Шаг')}
                  value={step}
                  onChange={(v) => setStep(v ?? '86400')}
                  data={[
                    { value: '86400', label: t('День') },
                    { value: '3600', label: t('Час') },
                    { value: '900', label: t('15 минут') },
                    { value: '300', label: t('5 минут') },
                    { value: '60', label: t('Минута') },
                  ]}
                  w={140}
                />
              </Group>
              {rangeError && (
                <Text size="xs" c="red" mt="xs">
                  {t(rangeError)}
                </Text>
              )}
              {timelineBins ? (
                <Histogram
                  data={timelineBins}
                  formatter={(b) => `${fmt(b.start)} — ${fmt(b.end)} UTC`}
                  onSelect={(b) => {
                    setRange(b.start, b.end, Number(step) >= 86400 ? 3600 : 60);
                    if (Number(step) === 60) setTab('reviews');
                  }}
                />
              ) : (
                <Alert color="gray" mt="md">
                  {' '}
                  {t(
                    'Для такого шага слишком широкий период. Сначала выберите день или откройте серию из таблицы ниже. График ограничен 2 000 столбцами.',
                  )}{' '}
                </Alert>
              )}
            </Panel>
            <Panel
              title={t('Плотные серии публикаций')}
              description={t(
                'Скользящее окно начинается с реального отзыва, чтобы не потерять серии на границе часа. До 10 наиболее плотных непересекающихся окон.',
              )}
            >
              <Select
                label={t('Размер окна')}
                value={windowSize}
                onChange={(v) => setWindowSize(v ?? '300')}
                data={[
                  { value: '60', label: t('1 минута') },
                  { value: '300', label: t('5 минут') },
                  { value: '900', label: t('15 минут') },
                  { value: '3600', label: t('1 час') },
                ]}
                w={150}
                mb="md"
              />
              <Table.ScrollContainer minWidth={550}>
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('Начало · UTC')}</Table.Th>
                      <Table.Th>{t('Конец · UTC')}</Table.Th>
                      <Table.Th>{t('Отзывов')}</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {peakWindows.map((b) => (
                      <Table.Tr key={b.start}>
                        <Table.Td>{fmt(b.start)}</Table.Td>
                        <Table.Td>{fmt(Math.min(b.end, range[1]))}</Table.Td>
                        <Table.Td>{b.count}</Table.Td>
                        <Table.Td>
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            onClick={() => setRange(b.start, Math.min(b.end, range[1]), 60)}
                          >
                            {' '}
                            {t('Исследовать')}{' '}
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Panel>
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="duplicates" pt="lg">
          <Panel
            title={t('Точные совпадения')}
            description={t(
              'Сравниваются тексты после удаления BBCode, ссылок, пунктуации и приведения регистра. «Ё/е» объединены, числа сохранены. Мемы и цитаты могут совпадать естественно.',
            )}
          >
            <Group align="end" grow>
              <Select
                label={t('Минимальная длина')}
                value={minWords}
                onChange={(v) => {
                  setMinWords(v ?? '6');
                  setDupPage(1);
                }}
                data={[
                  { value: '0', label: t('Любая длина') },
                  { value: '6', label: t('От 6 слов') },
                  { value: '20', label: t('От 20 слов') },
                ]}
              />
              <Select
                label={t('Сортировка')}
                value={dupSort}
                onChange={(v) => {
                  setDupSort(v ?? 'count');
                  setDupPage(1);
                }}
                data={[
                  { value: 'count', label: t('Больше повторов') },
                  { value: 'span', label: t('Ближе по времени') },
                  { value: 'words', label: t('Длиннее текст') },
                ]}
              />
              <TextInput
                label={t('Поиск в совпадениях')}
                value={dupSearch}
                onChange={(e) => {
                  setDupSearch(e.currentTarget.value);
                  setDupPage(1);
                }}
                leftSection={<IconSearch size={15} />}
              />
            </Group>
            <Text size="xs" c="dimmed" my="md">
              {groups.length} {t('групп ·')} {groups.reduce((sum, g) => sum + g.rows.length, 0)}{' '}
              {t('отзывов в них')}{' '}
            </Text>
            {groups.length ? (
              <Accordion variant="separated">
                {groups.slice((dupPage - 1) * 12, dupPage * 12).map((g) => (
                  <Accordion.Item key={g.key} value={g.key}>
                    <Accordion.Control>
                      <Group gap="xs">
                        <Badge color="gray">
                          {g.rows.length} {t('совпадений')}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {g.wordCount} {t('слов · разброс')} {n(g.span / 3600)} {t('ч')}{' '}
                        </Text>
                      </Group>
                      <Text size="sm" mt={6} lineClamp={1}>
                        {g.rows[0].tokens.slice(0, 12).join(' ')}…
                      </Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Text size="xs" c="dimmed" mb="sm">
                        {fmt(g.rows[0].timestamp_created)} — {fmt(g.rows.at(-1)!.timestamp_created)}{' '}
                        {t('UTC · медиана времени при отзыве')}{' '}
                        {n(median(g.rows.map((r) => r.author.playtime_at_review)))} {t('мин')}{' '}
                      </Text>
                      <details className="full-review">
                        <summary>{t('Полный текст одного отзыва')}</summary>
                        <Text size="sm" className="review-text">
                          {stripMarkup(g.rows[0].review)}
                        </Text>
                      </details>
                      <Table.ScrollContainer minWidth={500}>
                        <Table>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>{t('Публикация · UTC')}</Table.Th>
                              <Table.Th>{t('Минут в игре')}</Table.Th>
                              <Table.Th>{t('Всего отзывов')}</Table.Th>
                              <Table.Th>{t('Автор')}</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {g.rows.map((r) => (
                              <Table.Tr key={r.recommendationid}>
                                <Table.Td>{fmt(r.timestamp_created)}</Table.Td>
                                <Table.Td>{n(r.author.playtime_at_review)}</Table.Td>
                                <Table.Td>{n(r.author.num_reviews)}</Table.Td>
                                <Table.Td>{source(r)}</Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Table.ScrollContainer>
                      <Group mt="sm">
                        <Button size="xs" variant="default" onClick={() => focus({ exact: g.key })}>
                          {' '}
                          {t('Открыть эти отзывы')}{' '}
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={() => {
                            const a = g.rows[0].timestamp_created,
                              b = g.rows.at(-1)!.timestamp_created + 1;
                            setRange(a, b, b - a > 86400 ? 86400 : b - a > 3600 ? 3600 : 60);
                            setTab('timeline');
                          }}
                        >
                          {' '}
                          {t('Исследовать время группы')}{' '}
                        </Button>
                      </Group>
                    </Accordion.Panel>
                  </Accordion.Item>
                ))}
              </Accordion>
            ) : (
              <Text size="sm" c="dimmed" py="lg">
                {' '}
                {t('Совпадений по этим условиям нет.')}{' '}
              </Text>
            )}
            {groups.length > 12 && (
              <Pagination
                getItemProps={pageItemProps}
                getControlProps={pageControlProps}
                mt="md"
                total={Math.ceil(groups.length / 12)}
                value={Math.min(dupPage, Math.ceil(groups.length / 12))}
                onChange={setDupPage}
              />
            )}
            <Checkbox
              size="xs"
              mt="md"
              label={t('Показывать публичные ссылки на отзывы Steam')}
              checked={showLinks}
              onChange={(e) => setShowLinks(e.currentTarget.checked)}
            />
          </Panel>
        </Tabs.Panel>
        <Tabs.Panel value="authors" pt="lg">
          <Panel
            title={t('Сколько отзывов у авторов')}
            description={t(
              'Всего публичных отзывов сейчас, включая отзыв на эту игру. Единственный отзыв не означает новый аккаунт. Дата регистрации, покупки и число игр через этот endpoint недоступны.',
            )}
          >
            <Select
              label={t('Показывать каждое число отдельно')}
              value={authorLimit}
              onChange={(v) => setAuthorLimit(v ?? '20')}
              data={[
                { value: '10', label: '1–10' },
                { value: '20', label: '1–20' },
                { value: '50', label: '1–50' },
              ]}
              w={230}
            />
            <Histogram data={authorBins} onSelect={(b) => focus({ author: [b.start, b.end] })} />
            <Table.ScrollContainer minWidth={380} mah={400}>
              <Table stickyHeader highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('Отзывов у автора')}</Table.Th>
                    <Table.Th>{t('Авторов')}</Table.Th>
                    <Table.Th>{t('Доля известных')}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {authorBins.map((b) => (
                    <Table.Tr key={b.start}>
                      <Table.Td>{b.label}</Table.Td>
                      <Table.Td>{b.count}</Table.Td>
                      <Table.Td>
                        {n(
                          (b.count /
                            Math.max(
                              1,
                              authorBins.reduce((sum, b) => sum + b.count, 0),
                            )) *
                            100,
                        )}
                        %
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          onClick={() => focus({ author: [b.start, b.end] })}
                        >
                          {' '}
                          {t('Показать')}{' '}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Text size="xs" c="dimmed" mt="sm">
              {' '}
              {t('Неизвестно число отзывов или указано 0:')}{' '}
              {cohort.filter((r) => !r.author.num_reviews).length}
              {t('. Отсутствующие значения не считаются нулями в медианах.')}{' '}
            </Text>
          </Panel>
        </Tabs.Panel>
        <Tabs.Panel value="reviews" pt="lg">
          <Stack gap="md">
            <Paper p="md">
              <Group justify="space-between" mb="md">
                <Title order={3} size="h5">
                  {' '}
                  {t('Отзывы ·')} {n(selected.length)}
                </Title>
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconDownload size={15} />}
                  onClick={exportRows}
                >
                  {' '}
                  {t('Экспорт JSON')}{' '}
                </Button>
              </Group>
              <Group grow align="end">
                <TextInput
                  label={t('Поиск по тексту')}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.currentTarget.value);
                    setPage(1);
                  }}
                  leftSection={<IconSearch size={15} />}
                />
                <Select
                  label={t('Сортировка')}
                  value={sort}
                  onChange={(v) => {
                    setSort(v ?? 'new');
                    setPage(1);
                  }}
                  data={[
                    { value: 'new', label: t('Сначала новые') },
                    { value: 'time', label: t('Меньше времени в игре') },
                    { value: 'words', label: t('Короче текст') },
                    { value: 'author', label: t('Меньше отзывов у автора') },
                  ]}
                />
              </Group>
              <Group mt="sm" gap="xs">
                {Object.entries(filters).map(([key, v]) => (
                  <Badge key={key} variant="light" color="gray">
                    {key === 'time'
                      ? t('В игре: {0}', [(v as number[]).map(n).join('–')])
                      : key === 'length'
                        ? t('Слов: {0}', [(v as number[]).map(n).join('–')])
                        : key === 'author'
                          ? t('Отзывов у автора: {0}', [(v as number[]).map(n).join('–')])
                          : key === 'term'
                            ? String(v)
                            : t('Точное совпадение')}
                  </Badge>
                ))}
                {(Object.keys(filters).length > 0 || search) && (
                  <Button
                    variant="subtle"
                    size="compact-xs"
                    leftSection={<IconX size={13} />}
                    onClick={() => {
                      setFilters({});
                      setSearch('');
                      setPage(1);
                    }}
                  >
                    {' '}
                    {t('Сбросить')}{' '}
                  </Button>
                )}
              </Group>
              <Group mt="md" gap="lg">
                <Checkbox
                  size="xs"
                  label={t('Публичные ссылки Steam')}
                  checked={showLinks}
                  onChange={(e) => setShowLinks(e.currentTarget.checked)}
                />
                <Checkbox
                  size="xs"
                  label={t('Убирать идентификаторы из экспорта')}
                  checked={exportAnonymous}
                  onChange={(e) => setExportAnonymous(e.currentTarget.checked)}
                />
              </Group>
              <Text size="xs" c="dimmed" mt="xs">
                {' '}
                {t(
                  'Экспорт удаляет Steam ID и ID отзывов, но сам текст может содержать личные сведения.',
                )}{' '}
              </Text>
            </Paper>
            {selected
              .slice(
                (Math.min(page, Math.max(1, Math.ceil(selected.length / 20))) - 1) * 20,
                Math.min(page, Math.max(1, Math.ceil(selected.length / 20))) * 20,
              )
              .map((r) => (
                <Paper key={r.recommendationid} p="md">
                  <Group justify="space-between" gap="xs">
                    <Text size="xs" c="dimmed">
                      {fmt(r.timestamp_created)} UTC · {languageName(r.language)}
                    </Text>
                    <Badge variant="light" color={r.voted_up ? 'teal' : 'red'}>
                      {r.voted_up ? t('Положительный') : t('Отрицательный')}
                    </Badge>
                  </Group>
                  <Text size="sm" className="review-text" my="md">
                    {stripMarkup(r.review)}
                  </Text>
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Text size="xs" c="dimmed">
                        {n(r.author.playtime_at_review)} {t('мин при отзыве')}{' '}
                      </Text>
                      <Text size="xs" c="dimmed">
                        · {r.tokens.length} {t('слов')}{' '}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {' '}
                        {t('· всего отзывов:')} {n(r.author.num_reviews)}
                      </Text>
                    </Group>
                    {source(r)}
                  </Group>
                </Paper>
              ))}
            {!selected.length && (
              <Text size="sm" c="dimmed">
                {' '}
                {t('Нет отзывов по выбранным условиям.')}{' '}
              </Text>
            )}
            {selected.length > 20 && (
              <Pagination
                getItemProps={pageItemProps}
                getControlProps={pageControlProps}
                total={Math.ceil(selected.length / 20)}
                value={Math.min(page, Math.ceil(selected.length / 20))}
                onChange={setPage}
              />
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
