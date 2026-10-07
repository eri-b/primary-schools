export type SchoolLevel = 'elementary' | 'middle' | 'high';

export function gradeMatchesLevel(grade: string, level: SchoolLevel): boolean {
  const normalized = grade.trim().toUpperCase();
  if (['3K', 'PK', 'K', 'KG'].includes(normalized)) return level === 'elementary';

  const number = Number(normalized);
  if (!Number.isInteger(number)) return false;
  if (level === 'elementary') return number >= 1 && number <= 5;
  if (level === 'middle') return number >= 6 && number <= 8;
  return number >= 9 && number <= 12;
}
