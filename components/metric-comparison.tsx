'use client';

import { useId, useState } from 'react';
import { filterAndSortSchools } from '@/lib/school-comparison';
import { metricText, type MetricScale } from '@/lib/map-metrics';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

type LocatedSchool = { name: string; lat: number; lng: number };
type Range = { metric: string; min: string; max: string; onlyAvailable: boolean };

export function useMetricComparison<T extends LocatedSchool>(schools: T[], metric: string, value: (school: T) => number | null) {
  const [stored, setRange] = useState<Range>({ metric, min: '', max: '', onlyAvailable: false });
  const [order, setOrder] = useState('descending');
  const range = stored.metric === metric ? stored : { metric, min: '', max: '', onlyAvailable: false };
  const min = range.min.trim() === '' ? null : Number(range.min);
  const max = range.max.trim() === '' ? null : Number(range.max);
  const result = filterAndSortSchools(schools, value, { min, max, onlyAvailable: range.onlyAvailable }, order);
  return { ...result, range, setRange, order, setOrder, invalid: min != null && max != null && min > max };
}

export function MetricComparison<T extends LocatedSchool>({ comparison, label, scale, value, onSelect, note }: {
  comparison: ReturnType<typeof useMetricComparison<T>>;
  label: string;
  scale: MetricScale;
  value: (school: T) => number | null;
  onSelect: (school: T) => void;
  note?: string;
}) {
  const [limit, setLimit] = useState(20);
  const id = useId();
  const { range, setRange } = comparison;
  return <div className="metric-comparison">
    <p className="comparison-label">Filter and sort by {label.toLowerCase()}</p>
    {note && <p className="detail-note">{note}</p>}
    <div className="metric-range">
      <label htmlFor={`${id}-min`}>Minimum<InputNumber id={`${id}-min`} value={range.min} onChange={min => setRange({ ...range, min })} /></label>
      <label htmlFor={`${id}-max`}>Maximum<InputNumber id={`${id}-max`} value={range.max} onChange={max => setRange({ ...range, max })} /></label>
    </div>
    {comparison.invalid && <p role="alert">Minimum must not exceed maximum.</p>}
    <label className="filter-checkbox"><input type="checkbox" checked={range.onlyAvailable} onChange={event => setRange({ ...range, onlyAvailable: event.target.checked })} />Has selected measure</label>
    <label className="comparison-sort" htmlFor={`${id}-sort`}>Sort schools<NativeSelect id={`${id}-sort`} className="w-full" value={comparison.order} onChange={event => comparison.setOrder(event.target.value)}>
      <NativeSelectOption value="descending">Highest to lowest</NativeSelectOption>
      <NativeSelectOption value="ascending">Lowest to highest</NativeSelectOption>
      <NativeSelectOption value="name">School name</NativeSelectOption>
    </NativeSelect></label>
    <details className="comparison-results"><summary>School list ({comparison.sorted.length.toLocaleString()})</summary>
      <p className="detail-note">Missing results appear last. Select a school to open it on the map.</p>
      <ol>{comparison.sorted.slice(0, limit).map((school, index) => <li key={`${school.name}-${school.lat}-${school.lng}-${index}`}><button type="button" onClick={() => onSelect(school)}><span>{school.name}</span><strong>{metricText(value(school), scale)}</strong></button></li>)}</ol>
      {comparison.sorted.length > limit && <button className="comparison-more" type="button" onClick={() => setLimit(limit + 50)}>Show more schools</button>}
    </details>
  </div>;
}

function InputNumber({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return <input id={id} type="number" min="0" step="any" value={value} onChange={event => onChange(event.target.value)} placeholder="Any" />;
}
