import { metricText } from '@/lib/map-metrics';

import type { MeasuredSchool } from '@/lib/curated-school-metrics';
export { extraMetricOptions, getSchoolMetric, type MeasuredSchool, type SchoolMetric } from '@/lib/curated-school-metrics';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]!);

export function metricsPopup(school: MeasuredSchool, group: 'all' | 'general' | 'subject' = 'all') {
  const entries = Object.entries(school.metrics ?? {}).filter(([key]) => {
    const subjectSpecific = /^(ela-|math-|njgpa-|njsla-)/.test(key) || (key.startsWith('regents-') && key !== 'regents-diploma');
    return group === 'all' || (group === 'subject' ? subjectSpecific : !subjectSpecific);
  }).map(([, metric]) => metric);
  if (!entries.length) return '';
  return `<section><h3>${group === 'subject' ? 'Subject-specific' : 'Academic outcomes and resources'}</h3><p class="detail-note">Measures use different student groups and reporting periods. Missing or suppressed results are unavailable.${group === 'subject' ? '' : ' Spending is a resource measure, not a school rating.'}</p>${entries.map(metric => `<div class="additional-metric"><strong>${escape(metric.label)}: ${metricText(metric.value, metric.unit)}</strong><p class="detail-note">${escape(metric.year)} · ${escape(metric.note)} <a href="${escape(metric.source)}" target="_blank" rel="noopener noreferrer">Source</a></p></div>`).join('')}</section>`;
}
