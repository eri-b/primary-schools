import { METRIC_COLORS, MISSING_COLOR, metricText, type MetricScale } from '@/lib/map-metrics';

export function DotMetricLegend({ label, breaks, scale, relative = false, lowerIsBetter = false }: { label: string; breaks: [number, number, number]; scale: MetricScale; relative?: boolean; lowerIsBetter?: boolean }) {
  const format = (value: number) => metricText(value, scale);
  const labels = lowerIsBetter ? [
    `${format(breaks[0])} or less`,
    `Above ${format(breaks[0])} to ${format(breaks[1])}`,
    `Above ${format(breaks[1])} to ${format(breaks[2])}`,
    `Above ${format(breaks[2])}`,
  ] : [
    `Below ${format(breaks[0])}`,
    `${format(breaks[0])} to below ${format(breaks[1])}`,
    `${format(breaks[1])} to below ${format(breaks[2])}`,
    `${format(breaks[2])} or more`,
  ];
  return <div className="legend" aria-label={`${label} color legend`}>
    <p>{label}</p>
    {[3, 2, 1, 0].map((index) => <div key={index}><span className="dot" style={{ backgroundColor: METRIC_COLORS[lowerIsBetter ? 3 - index : index] }} />{labels[index]}</div>)}
    <div><span className="dot" style={{ backgroundColor: MISSING_COLOR }} />Unavailable</div>
    {(scale === 'count' || scale === 'currency' || relative) && <small>Ranges are based on schools in this map.{lowerIsBetter ? ' Lower values are better.' : ''}</small>}
  </div>;
}
