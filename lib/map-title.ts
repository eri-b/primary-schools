import type { SchoolLevel } from './school-grades';

export const regionNames = {
  nyc: 'NYC',
  westchester: 'Westchester',
  'long-island': 'Long Island',
  'hudson-valley': 'Hudson Valley',
  'new-jersey': 'New Jersey',
  connecticut: 'Connecticut',
} as const;

export type Region = keyof typeof regionNames;

export function schoolMapTitle(region: Region, level: SchoolLevel): string {
  const levelName = level[0].toUpperCase() + level.slice(1);
  return `School Sampler — ${regionNames[region]} ${levelName}`;
}
