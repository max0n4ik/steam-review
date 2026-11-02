import { useMemo, useState } from 'react';
import {
  Accordion,
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
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
  type Bucket,
  type Sentiment,
} from '../lib/analysis.ts';
import { saveJSON } from '../lib/api.ts';
import Histogram from './Histogram.tsx';

const n = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const fmt = (t: number) =>
  new Date(t * 1000).toLocaleString('ru-RU', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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
  const time = (r: Analyzed) =>
    timeMode === 'review' ? r.author.playtime_at_review : r.author.playtime_forever;
  const timelineBins = useMemo(
    () => timeline(cohort, range, Number(step)),
    [cohort, range[0], range[1], step],
  );
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
      if (!ids.has(r.author.steamid)) ids.set(r.author.steamid, `Автор ${ids.size + 1}`);
    });
    return ids;
  }, [prepared]);
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
  }, [cohort, search, filters, sort, timeMode]);
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
        : selected.map(({ tokens, normalized, searchText, ...r }) => r),
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
            Загруженный снимок: {n(prepared.length)} отзывов
          </Text>
          <SegmentedControl
            value={sentiment}
            onChange={(v) => {
              setSentiment(v as Sentiment);
              setFilters({});
              setPage(1);
            }}
            data={[
              { label: `Положительные · ${n(positives)}`, value: 'positive' },
              { label: `Отрицательные · ${n(negatives)}`, value: 'negative' },
              { label: 'Все', value: 'all' },
            ]}
          />
        </div>
        <Select
          label="Язык отзыва"
          aria-label="Язык отзыва"
          value={language}
          onChange={(v) => {
            setLanguage(v ?? 'all');
            setFilters({});
            setPage(1);
          }}
          data={[
            { value: 'all', label: 'Все языки' },
            ...languages.map((l) => ({ value: l, label: l })),
          ]}
          searchable
          w={180}
        />
      </Group>
      {customRange && (
        <Alert color="gray">
          <Group justify="space-between">
            <Text size="xs">
              Период анализа: {fmt(range[0])} — {fmt(range[1])} UTC (конец не включён)
            </Text>
            <Button size="compact-xs" variant="subtle" onClick={resetRange}>
              Весь загруженный период
            </Button>
          </Group>
        </Alert>
      )}
      <SimpleGrid cols={{ base: 2, lg: 4 }}>
        <Metric
          label="Отзывов в выборке"
          value={n(cohort.length)}
          note={`${n(authorCount)} уникальных авторов`}
        />
        <Metric
          label="Время при отзыве · медиана"
          value={`${n(median(cohort.map((r) => r.author.playtime_at_review)))} мин`}
          note={`${n(cohort.filter((r) => r.author.playtime_at_review === undefined).length)} без данных о времени`}
        />
        <Metric
          label="Длина текста · медиана"
          value={`${n(median(cohort.map((r) => r.tokens.length)))} слов`}
          note="Без BBCode и ссылок"
        />
        <Metric
          label="Отзывов у автора · медиана"
          value={n(median(cohort.map((r) => r.author.num_reviews)))}
          note="Публичные отзывы сейчас, включая этот"
        />
      </SimpleGrid>
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="overview">Обзор</Tabs.Tab>
          <Tabs.Tab value="timeline">Публикации</Tabs.Tab>
          <Tabs.Tab value="duplicates">Совпадения</Tabs.Tab>
          <Tabs.Tab value="authors">Опыт авторов</Tabs.Tab>
          <Tabs.Tab value="reviews">Отзывы</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview" pt="lg">
          <Stack gap="lg">
            <Panel
              title="Время в игре"
              description="Каждый столбец — количество отзывов. Нажмите его, чтобы открыть тексты из интервала."
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
                    { value: 'review', label: 'При отзыве' },
                    { value: 'total', label: 'Всего сейчас' },
                  ]}
                />
                <Select
                  label="Шаг, минуты"
                  value={timeStep}
                  onChange={(v) => setTimeStep(v ?? '15')}
                  data={['15', '30', '60']}
                  w={110}
                  size="xs"
                />
              </Group>
              <Histogram data={playtimeBins} onSelect={(b) => focus({ time: [b.start, b.end] })} />
              <Text size="xs" c="dimmed">
                Интервалы включают нижнюю границу и не включают верхнюю. Последний столбец без
                верхней границы. Малое время игры само по себе не доказывает накрутку.
              </Text>
            </Panel>
            <Panel
              title="Длина отзывов"
              description="Количество слов в сообщении. Нажмите столбец для просмотра соответствующих отзывов."
            >
              <Histogram data={lengthBins} onSelect={(b) => focus({ length: [b.start, b.end] })} />
            </Panel>
            <Panel
              title="Повторяющиеся слова"
              description="Размер слова соответствует числу отзывов, где оно встретилось хотя бы один раз. Нажмите для просмотра текстов."
            >
              <Group justify="space-between">
                <SegmentedControl
                  value={cloudMode}
                  onChange={setCloudMode}
                  size="xs"
                  data={[
                    { value: 'words', label: 'Слова' },
                    { value: 'pairs', label: 'Пары слов' },
                  ]}
                />
                <Checkbox
                  size="xs"
                  label="Убрать «игра / game»"
                  checked={hideGeneric}
                  onChange={(e) => setHideGeneric(e.currentTarget.checked)}
                />
              </Group>
              <div className="word-cloud">
                {cloud.length ? (
                  cloud.map(({ word, count }) => (
                    <button
                      key={word}
                      title={`${word}: ${count} отзывов`}
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
                    Недостаточно слов для облака.
                  </Text>
                )}
              </div>
              <Text size="xs" c="dimmed">
                Удаляются служебные слова русского и английского языка. Словоформы считаются
                отдельно. Облако не определяет смысл или достоверность отзывов.
              </Text>
            </Panel>
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="timeline" pt="lg">
          <Stack gap="lg">
            <Panel
              title="Когда публиковали отзывы"
              description="Все даты и время здесь в UTC. Конец интервала не включён. Нажмите день → часы, час → минуты."
            >
              <Group align="end" grow>
                <DateTimePicker
                  label="С"
                  placeholder={inputDate(range[0])}
                  value={start}
                  onChange={setStart}
                  withSeconds
                  valueFormat="DD MMM YYYY HH:mm:ss"
                />
                <DateTimePicker
                  label="До, не включая"
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
                    Применить
                  </Button>
                  <Button size="xs" variant="subtle" onClick={resetRange}>
                    Весь период
                  </Button>
                </Group>
                <Select
                  label="Шаг"
                  value={step}
                  onChange={(v) => setStep(v ?? '86400')}
                  data={[
                    { value: '86400', label: 'День' },
                    { value: '3600', label: 'Час' },
                    { value: '900', label: '15 минут' },
                    { value: '300', label: '5 минут' },
                    { value: '60', label: 'Минута' },
                  ]}
                  w={140}
                />
              </Group>
              {rangeError && (
                <Text size="xs" c="red" mt="xs">
                  {rangeError}
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
                  Для такого шага слишком широкий период. Сначала выберите день или откройте серию
                  из таблицы ниже. График ограничен 2 000 столбцами.
                </Alert>
              )}
            </Panel>
            <Panel
              title="Плотные серии публикаций"
              description="Скользящее окно начинается с реального отзыва, чтобы не потерять серии на границе часа. До 10 наиболее плотных непересекающихся окон."
            >
              <Select
                label="Размер окна"
                value={windowSize}
                onChange={(v) => setWindowSize(v ?? '300')}
                data={[
                  { value: '60', label: '1 минута' },
                  { value: '300', label: '5 минут' },
                  { value: '900', label: '15 минут' },
                  { value: '3600', label: '1 час' },
                ]}
                w={150}
                mb="md"
              />
              <Table.ScrollContainer minWidth={550}>
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Начало · UTC</Table.Th>
                      <Table.Th>Конец · UTC</Table.Th>
                      <Table.Th>Отзывов</Table.Th>
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
                            Исследовать
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
            title="Точные совпадения"
            description="Сравниваются тексты после удаления BBCode, ссылок, пунктуации и приведения регистра. «Ё/е» объединены, числа сохранены. Мемы и цитаты могут совпадать естественно."
          >
            <Group align="end" grow>
              <Select
                label="Минимальная длина"
                value={minWords}
                onChange={(v) => {
                  setMinWords(v ?? '6');
                  setDupPage(1);
                }}
                data={[
                  { value: '0', label: 'Любая длина' },
                  { value: '6', label: 'От 6 слов' },
                  { value: '20', label: 'От 20 слов' },
                ]}
              />
              <Select
                label="Сортировка"
                value={dupSort}
                onChange={(v) => {
                  setDupSort(v ?? 'count');
                  setDupPage(1);
                }}
                data={[
                  { value: 'count', label: 'Больше повторов' },
                  { value: 'span', label: 'Ближе по времени' },
                  { value: 'words', label: 'Длиннее текст' },
                ]}
              />
              <TextInput
                label="Поиск в совпадениях"
                value={dupSearch}
                onChange={(e) => {
                  setDupSearch(e.currentTarget.value);
                  setDupPage(1);
                }}
                leftSection={<IconSearch size={15} />}
              />
            </Group>
            <Text size="xs" c="dimmed" my="md">
              {groups.length} групп · {groups.reduce((sum, g) => sum + g.rows.length, 0)} отзывов в
              них
            </Text>
            {groups.length ? (
              <Accordion variant="separated">
                {groups.slice((dupPage - 1) * 12, dupPage * 12).map((g) => (
                  <Accordion.Item key={g.key} value={g.key}>
                    <Accordion.Control>
                      <Group gap="xs">
                        <Badge color="gray">{g.rows.length} совпадений</Badge>
                        <Text size="xs" c="dimmed">
                          {g.wordCount} слов · разброс {n(g.span / 3600)} ч
                        </Text>
                      </Group>
                      <Text size="sm" mt={6} lineClamp={1}>
                        {g.rows[0].tokens.slice(0, 12).join(' ')}…
                      </Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Text size="xs" c="dimmed" mb="sm">
                        {fmt(g.rows[0].timestamp_created)} — {fmt(g.rows.at(-1)!.timestamp_created)}{' '}
                        UTC · медиана времени при отзыве{' '}
                        {n(median(g.rows.map((r) => r.author.playtime_at_review)))} мин
                      </Text>
                      <details className="full-review">
                        <summary>Полный текст одного отзыва</summary>
                        <Text size="sm" className="review-text">
                          {stripMarkup(g.rows[0].review)}
                        </Text>
                      </details>
                      <Table.ScrollContainer minWidth={500}>
                        <Table>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Публикация · UTC</Table.Th>
                              <Table.Th>Минут в игре</Table.Th>
                              <Table.Th>Всего отзывов</Table.Th>
                              <Table.Th>Автор</Table.Th>
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
                          Открыть эти отзывы
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
                          Исследовать время группы
                        </Button>
                      </Group>
                    </Accordion.Panel>
                  </Accordion.Item>
                ))}
              </Accordion>
            ) : (
              <Text size="sm" c="dimmed" py="lg">
                Совпадений по этим условиям нет.
              </Text>
            )}
            {groups.length > 12 && (
              <Pagination
                mt="md"
                total={Math.ceil(groups.length / 12)}
                value={Math.min(dupPage, Math.ceil(groups.length / 12))}
                onChange={setDupPage}
              />
            )}
            <Checkbox
              size="xs"
              mt="md"
              label="Показывать публичные ссылки на отзывы Steam"
              checked={showLinks}
              onChange={(e) => setShowLinks(e.currentTarget.checked)}
            />
          </Panel>
        </Tabs.Panel>
        <Tabs.Panel value="authors" pt="lg">
          <Panel
            title="Сколько отзывов у авторов"
            description="Всего публичных отзывов сейчас, включая отзыв на эту игру. Единственный отзыв не означает новый аккаунт. Дата регистрации, покупки и число игр через этот endpoint недоступны."
          >
            <Select
              label="Показывать каждое число отдельно"
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
                    <Table.Th>Отзывов у автора</Table.Th>
                    <Table.Th>Авторов</Table.Th>
                    <Table.Th>Доля известных</Table.Th>
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
                          Показать
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Text size="xs" c="dimmed" mt="sm">
              Неизвестно число отзывов или указано 0:{' '}
              {cohort.filter((r) => !r.author.num_reviews).length}. Отсутствующие значения не
              считаются нулями в медианах.
            </Text>
          </Panel>
        </Tabs.Panel>
        <Tabs.Panel value="reviews" pt="lg">
          <Stack gap="md">
            <Paper p="md">
              <Group justify="space-between" mb="md">
                <Title order={3} size="h5">
                  Отзывы · {n(selected.length)}
                </Title>
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconDownload size={15} />}
                  onClick={exportRows}
                >
                  Экспорт JSON
                </Button>
              </Group>
              <Group grow align="end">
                <TextInput
                  label="Поиск по тексту"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.currentTarget.value);
                    setPage(1);
                  }}
                  leftSection={<IconSearch size={15} />}
                />
                <Select
                  label="Сортировка"
                  value={sort}
                  onChange={(v) => {
                    setSort(v ?? 'new');
                    setPage(1);
                  }}
                  data={[
                    { value: 'new', label: 'Сначала новые' },
                    { value: 'time', label: 'Меньше времени в игре' },
                    { value: 'words', label: 'Короче текст' },
                    { value: 'author', label: 'Меньше отзывов у автора' },
                  ]}
                />
              </Group>
              <Group mt="sm" gap="xs">
                {Object.entries(filters).map(([key, v]) => (
                  <Badge key={key} variant="light" color="gray">
                    {key === 'time'
                      ? `В игре: ${(v as number[]).map(n).join('–')}`
                      : key === 'length'
                        ? `Слов: ${(v as number[]).map(n).join('–')}`
                        : key === 'author'
                          ? `Отзывов у автора: ${(v as number[]).map(n).join('–')}`
                          : key === 'term'
                            ? String(v)
                            : 'Точное совпадение'}
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
                    Сбросить
                  </Button>
                )}
              </Group>
              <Group mt="md" gap="lg">
                <Checkbox
                  size="xs"
                  label="Публичные ссылки Steam"
                  checked={showLinks}
                  onChange={(e) => setShowLinks(e.currentTarget.checked)}
                />
                <Checkbox
                  size="xs"
                  label="Убирать идентификаторы из экспорта"
                  checked={exportAnonymous}
                  onChange={(e) => setExportAnonymous(e.currentTarget.checked)}
                />
              </Group>
              <Text size="xs" c="dimmed" mt="xs">
                Экспорт удаляет Steam ID и ID отзывов, но сам текст может содержать личные сведения.
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
                      {fmt(r.timestamp_created)} UTC · {r.language}
                    </Text>
                    <Badge variant="light" color={r.voted_up ? 'teal' : 'red'}>
                      {r.voted_up ? 'Положительный' : 'Отрицательный'}
                    </Badge>
                  </Group>
                  <Text size="sm" className="review-text" my="md">
                    {stripMarkup(r.review)}
                  </Text>
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Text size="xs" c="dimmed">
                        {n(r.author.playtime_at_review)} мин при отзыве
                      </Text>
                      <Text size="xs" c="dimmed">
                        · {r.tokens.length} слов
                      </Text>
                      <Text size="xs" c="dimmed">
                        · всего отзывов: {n(r.author.num_reviews)}
                      </Text>
                    </Group>
                    {source(r)}
                  </Group>
                </Paper>
              ))}
            {!selected.length && (
              <Text size="sm" c="dimmed">
                Нет отзывов по выбранным условиям.
              </Text>
            )}
            {selected.length > 20 && (
              <Pagination
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
