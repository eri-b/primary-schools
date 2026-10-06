'use client';

import { GraduationCap } from 'lucide-react';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

const locations = [
  { slug: 'nyc', name: 'NYC' },
  { slug: 'westchester', name: 'Westchester' },
  { slug: 'long-island', name: 'Long Island' },
  { slug: 'hudson-valley', name: 'Hudson Valley' },
  { slug: 'new-jersey', name: 'New Jersey' },
  { slug: 'connecticut', name: 'Connecticut' },
] as const;

type Location = (typeof locations)[number]['slug'];
type SchoolLevel = 'elementary' | 'middle' | 'high';

export function SchoolMapHeader({ current, schoolYear, level = 'elementary' }: { current: Location; schoolYear: string; level?: SchoolLevel }) {
  return (
    <header className="school-map-header">
      <div className="brand-row">
        <span className="brand-mark" aria-hidden="true"><GraduationCap size={22} strokeWidth={2.2} /></span>
        <div>
          <p className="eyebrow">{schoolYear} school year</p>
          <h1>NYC Metro schools</h1>
        </div>
      </div>
      <nav className="school-controls" aria-label="Choose school map">
        <div className="school-control">
          <label htmlFor="location-select">Location</label>
          <NativeSelect
            id="location-select"
            className="school-control-select"
            value={current}
            onChange={(event) => window.location.assign(`/${level}/${event.target.value}`)}
          >
            {locations.map(({ slug, name }) => (
              <NativeSelectOption key={slug} value={slug}>{name}</NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="school-control">
          <label htmlFor="school-level-select">School level</label>
          <NativeSelect id="school-level-select" className="school-control-select" value={level} onChange={(event) => window.location.assign(`/${event.target.value}/${current}`)}>
            <NativeSelectOption value="elementary">Elementary</NativeSelectOption>
            <NativeSelectOption value="middle">Middle</NativeSelectOption>
            <NativeSelectOption value="high">High</NativeSelectOption>
          </NativeSelect>
        </div>
      </nav>
    </header>
  );
}
