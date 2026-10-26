export type MetricRange = { min: number | null; max: number | null; onlyAvailable: boolean };

export function filterAndSortSchools<T extends { name: string }>(schools: T[], value: (school: T) => number | null, range: MetricRange, order: string) {
  const filtered = schools.filter(school => {
    const n = value(school);
    if (n == null) return !range.onlyAvailable && range.min == null && range.max == null;
    return (range.min == null || n >= range.min) && (range.max == null || n <= range.max);
  });
  const sorted = [...filtered].sort((a, b) => {
    if (order === 'name') return a.name.localeCompare(b.name);
    const av = value(a), bv = value(b);
    if (av == null) return bv == null ? a.name.localeCompare(b.name) : 1;
    if (bv == null) return -1;
    return (order === 'ascending' ? av - bv : bv - av) || a.name.localeCompare(b.name);
  });
  return { schools: filtered, sorted };
}
