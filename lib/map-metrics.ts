export type MetricScale = 'percent' | 'count' | 'index';

export const METRIC_COLORS = ['#c44a3d', '#e39a22', '#2f78a8', '#087f5b'] as const;
export const MISSING_COLOR = '#7b8790';

export function metricBreaks(values: (number | null | undefined)[], scale: MetricScale, useDistribution = false): [number, number, number] {
  if (scale !== 'count' && !useDistribution) return [35, 55, 75];
  const sorted = values.filter((value): value is number => value != null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return [0, 0, 0];
  return [0.25, 0.5, 0.75].map((fraction) => sorted[Math.floor((sorted.length - 1) * fraction)]) as [number, number, number];
}

export function metricColor(value: number | null | undefined, breaks: [number, number, number]): string {
  if (value == null || !Number.isFinite(value)) return MISSING_COLOR;
  if (value < breaks[0]) return METRIC_COLORS[0];
  if (value < breaks[1]) return METRIC_COLORS[1];
  if (value < breaks[2]) return METRIC_COLORS[2];
  return METRIC_COLORS[3];
}

export function metricText(value: number | null | undefined, scale: MetricScale): string {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  return scale === 'count' ? value.toLocaleString() : `${value.toFixed(1)}${scale === 'percent' ? '%' : ''}`;
}
