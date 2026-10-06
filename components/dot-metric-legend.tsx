import { METRIC_COLORS, MISSING_COLOR, type MetricScale } from '@/lib/map-metrics';

export function DotMetricLegend({ label, breaks, scale, relative = false }: { label: string; breaks: [number, number, number]; scale: MetricScale; relative?: boolean }) {
  const format = (value: number) => scale === 'count' ? value.toLocaleString() : `${value}${scale === 'percent' ? '%' : ''}`;
  const labels = [
    `Below ${format(breaks[0])}`,
    `${format(breaks[0])} to below ${format(breaks[1])}`,
    `${format(breaks[1])} to below ${format(breaks[2])}`,
    `${format(breaks[2])} or more`,
  ];
  return <div className="legend" aria-label={`${label} color legend`}>
    <p>{label}</p>
    {[3, 2, 1, 0].map((index) => <div key={index}><span className="dot" style={{ backgroundColor: METRIC_COLORS[index] }} />{labels[index]}</div>)}
    <div><span className="dot" style={{ backgroundColor: MISSING_COLOR }} />Unavailable</div>
    {(scale === 'count' || relative) && <small>Ranges are based on schools in this map.</small>}
  </div>;
}
