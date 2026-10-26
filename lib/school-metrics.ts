import { metricText, type MetricScale } from '@/lib/map-metrics';

export type SchoolMetric = {
  value: number;
  label: string;
  year: string;
  unit: MetricScale;
  source: string;
  note: string;
  lowerIsBetter: boolean;
};
export type MeasuredSchool = { metrics?: Record<string, SchoolMetric> };

export function extraMetricOptions(schools: MeasuredSchool[]) {
  const options = new Map<string, SchoolMetric>();
  for (const school of schools) {
    for (const [key, metric] of Object.entries(school.metrics ?? {})) options.set(key, metric);
  }
  return [...options].sort((a, b) => a[1].label.localeCompare(b[1].label));
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]!);

export function metricsPopup(school: MeasuredSchool) {
  const entries = Object.values(school.metrics ?? {});
  if (!entries.length) return '';
  return `<section><h3>Academic outcomes and resources</h3><p class="detail-note">Measures use different student groups and reporting periods. Missing or suppressed results are unavailable. Spending is a resource measure, not a school rating.</p>${entries.map(metric => `<div class="additional-metric"><strong>${escape(metric.label)}: ${metricText(metric.value, metric.unit)}</strong><p class="detail-note">${escape(metric.year)} · ${escape(metric.note)} <a href="${escape(metric.source)}" target="_blank" rel="noopener noreferrer">Source</a></p></div>`).join('')}</section>`;
}
