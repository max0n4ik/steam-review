import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Text } from '@mantine/core';
import type { Bucket } from '../lib/analysis.ts';

export default function Histogram({
  data,
  onSelect,
  formatter,
}: {
  data: Bucket[];
  onSelect?: (bucket: Bucket) => void;
  formatter?: (bucket: Bucket) => string;
}) {
  if (!data.length)
    return (
      <Text c="dimmed" py="xl">
        Нет данных для графика.
      </Text>
    );
  return (
    <div className="histogram" aria-label="Гистограмма количества отзывов">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 6, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--mantine-color-gray-2)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#747b83' }}
            axisLine={false}
            tickLine={false}
            minTickGap={30}
            tickFormatter={(label: string) =>
              label.includes('T') ? label.slice(5, 16).replace('T', ' ') : label
            }
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#747b83' }}
          />
          <Tooltip
            cursor={{ fill: 'var(--mantine-color-gray-0)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const b = payload[0].payload as Bucket;
              return (
                <div className="chart-tooltip">
                  <strong>{formatter?.(b) ?? b.label}</strong>
                  <br />
                  {b.count.toLocaleString('ru-RU')} {onSelect ? '· нажмите, чтобы выбрать' : ''}
                </div>
              );
            }}
          />
          <Bar
            dataKey="count"
            fill="var(--mantine-color-teal-6)"
            radius={[2, 2, 0, 0]}
            maxBarSize={44}
            isAnimationActive={false}
            cursor={onSelect ? 'pointer' : 'default'}
            onClick={(entry: unknown) => {
              const b = (entry as { payload?: Bucket }).payload ?? (entry as Bucket);
              if (onSelect && typeof b.start === 'number') onSelect(b);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
