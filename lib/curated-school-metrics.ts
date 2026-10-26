import type { MetricScale } from '@/lib/map-metrics';

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

// Keep the map menu focused; individual exams remain in school details.
const MAP_METRICS = [
  'academic-average', 'academic-growth', 'graduation', 'advanced-regents',
  'regents-diploma', 'dropout', 'absenteeism-em', 'absenteeism-hs', 'absenteeism',
  'college-coursework', 'college-readiness', 'spending', 'district-spending',
] as const;

function average(school: MeasuredSchool, pairs: [string, string][], label: string): SchoolMetric | undefined {
  for (const [ela, math] of pairs) {
    const a = school.metrics?.[ela], b = school.metrics?.[math];
    if (!a || !b || a.year !== b.year || a.unit !== b.unit || a.source !== b.source) continue;
    return {
      ...a,
      value: Math.round((a.value + b.value) / 2 * 10) / 10,
      label,
      note: `Arithmetic mean of the ELA and math measures; both must be published for the same reporting period. Individual results and definitions appear in school details.`,
    };
  }
}

export function getSchoolMetric(school: MeasuredSchool, key: string): SchoolMetric | undefined {
  if (key === 'academic-average') {
    return average(school, [['ela-elementary', 'math-elementary'], ['ela-middle', 'math-middle']], 'Average ELA and math proficiency')
      ?? average(school, [['ela-index', 'math-index']], 'Average ELA and math performance index')
      ?? average(school, [['njgpa-ela', 'njgpa-math']], 'Average NJGPA graduation readiness');
  }
  if (key === 'academic-growth') {
    return average(school, [['ela-growth', 'math-growth']], 'Average academic growth target achieved');
  }
  return school.metrics?.[key];
}

export function extraMetricOptions(schools: MeasuredSchool[], includeAcademic = true): [string, SchoolMetric][] {
  const options: [string, SchoolMetric][] = [];
  for (const key of MAP_METRICS) {
    if (key === 'academic-average' && !includeAcademic) continue;
    for (const school of schools) {
      const metric = getSchoolMetric(school, key);
      if (metric) {
        options.push([key, metric]);
        break;
      }
    }
  }
  return options;
}
