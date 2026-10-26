import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

export type SchoolSector = 'all' | 'charter' | 'district';

export function matchesSchoolSector(isCharter: boolean | null | undefined, sector: SchoolSector) {
  return sector === 'all' || (sector === 'charter' ? isCharter === true : isCharter === false);
}

export function SchoolSectorFilter({ value, onChange }: { value: SchoolSector; onChange: (value: SchoolSector) => void }) {
  return (
    <div className="filter-control">
      <label htmlFor="school-sector-filter">Public school sector</label>
      <NativeSelect id="school-sector-filter" className="w-full" value={value} onChange={(event) => onChange(event.target.value as SchoolSector)}>
        <NativeSelectOption value="all">All public schools</NativeSelectOption>
        <NativeSelectOption value="charter">Charter schools only</NativeSelectOption>
        <NativeSelectOption value="district">Public schools (non-charter)</NativeSelectOption>
      </NativeSelect>
    </div>
  );
}
