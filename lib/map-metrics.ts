export type MetricScale = 'percent' | 'count' | 'index' | 'currency';

export const METRIC_COLORS = ['#c44a3d', '#e39a22', '#2f78a8', '#087f5b'] as const;
export const MISSING_COLOR = '#7b8790';

export function metricBreaks(values: (number | null | undefined)[], scale: MetricScale, useDistribution = false): [number, number, number] {
  if (scale !== 'count' && scale !== 'currency' && !useDistribution) return [35, 55, 75];
  const sorted = values.filter((value): value is number => value != null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return [0, 0, 0];
  return [0.25, 0.5, 0.75].map((fraction) => sorted[Math.floor((sorted.length - 1) * fraction)]) as [number, number, number];
}

export function metricColor(value: number | null | undefined, breaks: [number, number, number], lowerIsBetter = false): string {
  if (value == null || !Number.isFinite(value)) return MISSING_COLOR;
  // Inclusive lower bands keep zero dropout/absence rates green, including
  // maps where several quartile boundaries are zero.
  const index = lowerIsBetter
    ? value <= breaks[0] ? 0 : value <= breaks[1] ? 1 : value <= breaks[2] ? 2 : 3
    : value < breaks[0] ? 0 : value < breaks[1] ? 1 : value < breaks[2] ? 2 : 3;
  return METRIC_COLORS[lowerIsBetter ? 3 - index : index];
}

export function metricText(value: number | null | undefined, scale: MetricScale): string {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  if (scale === 'currency') return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return scale === 'count' ? value.toLocaleString() : `${value.toFixed(1)}${scale === 'percent' ? '%' : ''}`;
}
