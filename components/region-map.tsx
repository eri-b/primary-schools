'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import { ChevronDown, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DataSourcesFooter } from '@/components/data-sources-footer';
import { SchoolMapHeader } from '@/components/school-map-header';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { DotMetricLegend } from '@/components/dot-metric-legend';
import { metricBreaks, metricColor, metricText, type MetricScale } from '@/lib/map-metrics';

type Result = { tested: number | null; proficient: number | null; index?: number | null; level4: number | null; grades: string[] } | null;
type School = {
  id: string;
  name: string;
  schoolType?: string;
  district: string;
  county: string;
  city: string;
  address: string;
  grades: string;
  enrollment: number | null;
  acceptanceRate?: number | null;
  classSizeByGrade?: Record<string, number | null>;
  lat: number;
  lng: number;
  ela: Result;
  math: Result;
  average: number | null;
  graduation?: { rate: number; cohortSize: number | null; regentsRate: number | null };
  demographics: Record<string, number | null>;
  reportUrl: string | null;
};

export type Region = 'nyc' | 'westchester' | 'long-island' | 'hudson-valley' | 'new-jersey' | 'connecticut';
export type SchoolLevel = 'elementary' | 'middle' | 'high';
const CONFIG = {
  nyc: { title: 'NYC elementary schools', center: [40.73, -73.94] as [number, number], zoom: 11, placeholder: 'Try Brooklyn or Queens', scores: false },
  westchester: { title: 'Westchester elementary schools', center: [41.12, -73.78] as [number, number], zoom: 10, placeholder: 'Try Yonkers or White Plains', scores: false },
  'long-island': { title: 'Long Island elementary schools', center: [40.82, -73.1] as [number, number], zoom: 9, placeholder: 'Try Hempstead or Riverhead', scores: true },
  'hudson-valley': { title: 'Hudson Valley elementary schools', center: [41.6, -74.3] as [number, number], zoom: 8, placeholder: 'Try Poughkeepsie, Newburgh, or Monticello', scores: true },
  'new-jersey': { title: 'Nearby New Jersey elementary schools', center: [40.79, -74.29] as [number, number], zoom: 10, placeholder: 'Try Bergen or Montclair', scores: true },
  connecticut: { title: 'Southwest Connecticut elementary schools', center: [41.2, -73.45] as [number, number], zoom: 10, placeholder: 'Try Greenwich or Bridgeport', scores: true },
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
}

function score(value: number | null | undefined) {
  return value == null ? 'Unavailable' : `${value.toFixed(1)}%`;
}

function assessmentScore(value: number | null | undefined, region: Region) {
  return value == null ? 'Unavailable' : `${value.toFixed(1)}${region === 'connecticut' ? '' : '%'}`;
}

type DotMetric = 'assessment' | 'ela' | 'math' | 'graduation' | 'regents' | 'enrollment' | 'acceptance' | `class-size:${string}`;
function dotValue(school: School, metric: DotMetric): number | null {
  if (metric.startsWith('class-size:')) return school.classSizeByGrade?.[metric.slice(11)] ?? null;
  if (metric === 'acceptance') return school.acceptanceRate ?? null;
  if (metric === 'assessment') return school.average;
  if (metric === 'ela') return school.ela?.proficient ?? null;
  if (metric === 'math') return school.math?.proficient ?? null;
  if (metric === 'graduation') return school.graduation?.rate ?? null;
  if (metric === 'regents') return school.graduation?.regentsRate ?? null;
  return school.enrollment;
}

function popupFor(school: School, region: Region, level: SchoolLevel, dotLabel: string, dotMetric: DotMetric, dotScale: MetricScale) {
  const hasScores = (level === 'elementary' && CONFIG[region].scores) || (level === 'middle' && region === 'nyc');
  const nj = region === 'new-jersey';
  const ct = region === 'connecticut';
  const elaValue = ct ? school.ela?.index : school.ela?.proficient;
  const mathValue = ct ? school.math?.index : school.math?.proficient;
  const demographics = [
    ['Asian', school.demographics.asian], ['Black', school.demographics.black],
    ['Hispanic', school.demographics.hispanic], ['White', school.demographics.white],
    ['Two or more races', school.demographics.multiracial],
  ];
  return `<article class="school-popup">
    <div class="popup-eyebrow">${escapeHtml(school.county)} · ${escapeHtml(school.district)}</div>
    <h2>${escapeHtml(school.name)}</h2>
    <p class="popup-meta">${escapeHtml(school.city)} · Grades ${escapeHtml(school.grades)} · ${school.enrollment?.toLocaleString() ?? 'Unknown'} students schoolwide</p>
    <p class="popup-map-metric"><strong>${escapeHtml(dotLabel)}:</strong> ${metricText(dotValue(school, dotMetric), dotScale)}</p>
    ${hasScores ? `<div class="score-grid">
      <div><strong>${assessmentScore(elaValue, region)}</strong><span>ELA ${ct ? 'index' : 'proficient'}</span></div>
      <div><strong>${assessmentScore(mathValue, region)}</strong><span>Math ${ct ? 'index' : 'proficient'}</span></div>
      <div class="score-average"><strong>${assessmentScore(school.average, region)}</strong><span>Average ${ct ? 'index' : 'proficient'}</span></div>
    </div>` : ''}
    ${level === 'high' && region === 'nyc' ? `<div class="score-grid">
      <div><strong>${score(school.graduation?.rate)}</strong><span>Graduated in four years</span></div>
      <div><strong>${score(school.graduation?.regentsRate)}</strong><span>Regents diploma</span></div>
    </div>` : ''}
    <details class="popup-details"><summary>More details</summary><div class="popup-details-content">
      <section><h3>School</h3><dl class="detail-grid">
        <div><dt>Address</dt><dd>${escapeHtml(school.address)}, ${escapeHtml(school.city)}</dd></div>
        <div><dt>District</dt><dd>${escapeHtml(school.district)}</dd></div>
        ${school.schoolType ? `<div><dt>School type</dt><dd>${escapeHtml(school.schoolType)}</dd></div>` : ''}
        <div><dt>County/region</dt><dd>${escapeHtml(school.county)}</dd></div>
        <div><dt>Schoolwide enrollment</dt><dd>${school.enrollment?.toLocaleString() ?? 'Unavailable'}</dd></div>
      </dl></section>
      ${hasScores ? `<section><h3>${level === 'middle' ? '2026 NYCPS state assessments' : `2024–25 ${nj ? 'NJSLA assessments' : ct ? 'state accountability' : 'state assessments'}`}</h3><dl class="detail-grid">
        ${ct ? '' : `<div><dt>ELA tested, grades ${level === 'middle' ? '6–8' : '3–5'}</dt><dd>${school.ela?.tested?.toLocaleString() ?? 'Unavailable'}</dd></div>`}
        <div><dt>ELA ${ct ? 'performance index' : 'proficient'}</dt><dd>${assessmentScore(elaValue, region)}</dd></div>
        ${nj || ct ? '' : `<div><dt>ELA level 4</dt><dd>${score(school.ela?.level4)}</dd></div>`}
        ${ct ? '' : `<div><dt>Math tested, grades ${level === 'middle' ? '6–8' : '3–5'}</dt><dd>${school.math?.tested?.toLocaleString() ?? 'Unavailable'}</dd></div>`}
        <div><dt>Math ${ct ? 'performance index' : 'proficient'}</dt><dd>${assessmentScore(mathValue, region)}</dd></div>
        ${nj || ct ? '' : `<div><dt>Math level 4</dt><dd>${score(school.math?.level4)}</dd></div>`}
      </dl><p class="detail-note">${level === 'middle' ? 'Results combine published grades 6–8 counts. Suppressed results remain unavailable.' : ct ? 'The Connecticut performance index is a 0–100 achievement measure across all tested grades at the school; it is not a proficiency percentage.' : nj ? 'NJSLA proficiency is Levels 4 and 5, weighted across published grades 3–5. Suppressed results remain unavailable.' : 'Results combine published grade 3–5 counts. Small groups suppressed by NYSED remain unavailable.'} ${school.reportUrl ? `<a href="${escapeHtml(school.reportUrl)}" target="_blank" rel="noopener noreferrer">${level === 'middle' ? 'NYCPS test results' : ct ? 'CSDE accountability data' : nj ? 'NJDOE assessment data' : 'NYSED report card'}</a>` : `No matching ${level === 'middle' ? 'NYCPS' : ct ? 'CSDE' : nj ? 'NJDOE' : 'NYSED'} results were found.`}</p></section>` : ''}
      ${level === 'high' && region === 'nyc' ? `<section><h3>Class of 2025 outcomes</h3><dl class="detail-grid">
        <div><dt>Four-year graduation rate, through August</dt><dd>${score(school.graduation?.rate)}</dd></div>
        <div><dt>Regents diploma rate, of cohort</dt><dd>${score(school.graduation?.regentsRate)}</dd></div>
        <div><dt>2021 entering cohort size</dt><dd>${school.graduation?.cohortSize?.toLocaleString() ?? 'Unavailable'}</dd></div>
      </dl><p class="detail-note">Rates use the cohort that first entered grade 9 in 2021; they are not test scores. Charter-school outcomes are not in this NYCPS file. <a href="https://infohub.nyced.org/reports/academics/graduation-results" target="_blank" rel="noopener noreferrer">NYCPS graduation results</a>.</p></section>` : ''}
      <section><h3>Student demographics</h3><dl class="detail-grid">${demographics.map(([label, value]) => `<div><dt>${label}</dt><dd>${score(value as number | null)}</dd></div>`).join('')}</dl><p class="detail-note">2024–25 NCES Common Core of Data.</p></section>
    </div></details>
  </article>`;
}

function sharedLocationPopup(schools: School[], region: Region, level: SchoolLevel, dotLabel: string, dotMetric: DotMetric, dotScale: MetricScale) {
  return `<article class="school-popup shared-school-popup">
    <div class="popup-eyebrow">${schools.length} schools · shared location</div>
    <h2>Schools at this location</h2>
    <p class="popup-meta">Choose a school to see its details.</p>
    <div class="shared-school-list">${schools.map((school) => `<details>
      <summary><span>${escapeHtml(school.name)}</span><strong>${metricText(dotValue(school, dotMetric), dotScale)}</strong></summary>
      ${popupFor(school, region, level, dotLabel, dotMetric, dotScale)}
    </details>`).join('')}</div>
  </article>`;
}

export function RegionMap({ region, level = 'elementary' }: { region: Region; level?: SchoolLevel }) {
  const config = CONFIG[region];
  const hasScores = (level === 'elementary' && config.scores) || (level === 'middle' && region === 'nyc');
  const hasGraduation = level === 'high' && region === 'nyc';
  const title = config.title.replace('elementary', level);
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markersRef = useRef<Leaflet.LayerGroup | null>(null);
  const districtLayerRef = useRef<Leaflet.GeoJSON | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const lastSearchRef = useRef('');
  const [schools, setSchools] = useState<School[]>([]);
  const [districts, setDistricts] = useState<GeoJsonObject | null>(null);
  const [query, setQuery] = useState('');
  const [district, setDistrict] = useState('All districts');
  const [county, setCounty] = useState('All counties');
  const [schoolType, setSchoolType] = useState('All school types');
  const [onlyScored, setOnlyScored] = useState(false);
  const [dotMetric, setDotMetric] = useState<DotMetric>(hasScores ? 'assessment' : hasGraduation ? 'graduation' : 'enrollment');
  const [showDistricts, setShowDistricts] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [boundaryError, setBoundaryError] = useState(false);

  const districtNames = useMemo(() => ['All districts', ...new Set(schools.filter((school) => county === 'All counties' || school.county === county).map((school) => school.district))].sort((a, b) => a === 'All districts' ? -1 : b === 'All districts' ? 1 : a.localeCompare(b)), [county, schools]);
  const countyNames = useMemo(() => ['All counties', ...new Set(schools.map((school) => school.county))], [schools]);
  const schoolTypeNames = useMemo(() => ['All school types', ...new Set(schools.map((school) => school.schoolType).filter((type): type is string => Boolean(type)))].sort((a, b) => a === 'All school types' ? -1 : b === 'All school types' ? 1 : a === 'Regular School' ? -1 : b === 'Regular School' ? 1 : a.localeCompare(b)), [schools]);
  const hasAcceptance = schools.some((school) => school.acceptanceRate != null);
  const classSizeGrades = useMemo(() => [...new Set(schools.flatMap((school) => Object.entries(school.classSizeByGrade ?? {}).filter(([, value]) => value != null).map(([grade]) => grade)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [schools]);
  const effectiveMetric = dotMetric === 'assessment' && !hasScores ? 'enrollment' : dotMetric;
  const dotScale: MetricScale = effectiveMetric === 'enrollment' || effectiveMetric.startsWith('class-size:') ? 'count' : effectiveMetric === 'assessment' && region === 'connecticut' ? 'index' : 'percent';
  const dotLabel = effectiveMetric === 'assessment' ? `Average ${region === 'connecticut' ? 'performance index' : 'proficiency'}` : effectiveMetric === 'ela' ? 'ELA proficiency' : effectiveMetric === 'math' ? 'Math proficiency' : effectiveMetric === 'graduation' ? 'Four-year graduation rate' : effectiveMetric === 'regents' ? 'Regents diploma rate' : effectiveMetric === 'enrollment' ? 'Schoolwide enrollment' : effectiveMetric === 'acceptance' ? 'Acceptance rate' : `Grade ${effectiveMetric.slice(11)} average class size`;
  const relativeScale = effectiveMetric === 'graduation' || effectiveMetric === 'regents';
  const breaks = useMemo(() => metricBreaks(schools.map((school) => dotValue(school, effectiveMetric)), dotScale, relativeScale), [schools, effectiveMetric, dotScale, relativeScale]);
  const filteredSchools = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return schools.filter((school) =>
      (district === 'All districts' || school.district === district) &&
      (county === 'All counties' || school.county === county) &&
      (level === 'elementary' || schoolType === 'All school types' || school.schoolType === schoolType) &&
      (!(hasScores || hasGraduation) || !onlyScored || dotValue(school, effectiveMetric) !== null) &&
      (!needle || `${school.name} ${school.city} ${school.district} ${school.county}`.toLowerCase().includes(needle)));
  }, [schools, county, district, schoolType, level, hasScores, hasGraduation, onlyScored, effectiveMetric, query]);

  useEffect(() => {
    let cancelled = false;
    fetch(level === 'elementary' ? `/${region}-schools.json` : `/${level}-${region}-schools.json`).then((response) => {
      if (!response.ok) throw new Error('Schools unavailable');
      return response.json() as Promise<School[]>;
    }).then((data) => { if (!cancelled) setSchools(data); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    fetch(region === 'nyc' ? '/school-districts.geojson' : `/${region}-districts.geojson`).then((response) => {
      if (!response.ok) throw new Error('Districts unavailable');
      return response.json() as Promise<GeoJsonObject>;
    }).then((data) => { if (!cancelled) setDistricts(data); })
      .catch(() => { if (!cancelled) setBoundaryError(true); });
    return () => { cancelled = true; };
  }, [region, level]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !mapElementRef.current) return;
      leafletRef.current = L;
      const map = L.map(mapElementRef.current, { center: config.center, zoom: config.zoom, zoomControl: false, preferCanvas: true });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      const cartoKey = process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY;
      L.tileLayer(cartoKey ? `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}` : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: cartoKey ? 20 : 19,
        attribution: cartoKey ? '&copy; OpenStreetMap contributors &copy; CARTO' : '&copy; OpenStreetMap contributors',
        ...(cartoKey ? { subdomains: 'abcd' } : {}),
      }).addTo(map);
      map.createPane('districts');
      map.getPane('districts')!.style.zIndex = '310';
      map.createPane('schools');
      map.getPane('schools')!.style.zIndex = '450';
      mapRef.current = map;
      markersRef.current = L.layerGroup().addTo(map);
      setMapReady(true);
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; markersRef.current = null; districtLayerRef.current = null; };
  }, [config.center, config.zoom]);

  useEffect(() => {
    const L = leafletRef.current, map = mapRef.current;
    if (!mapReady || !L || !map) return;
    districtLayerRef.current?.remove();
    districtLayerRef.current = null;
    if (!showDistricts || !districts) return;
    districtLayerRef.current = L.geoJSON(districts, {
      pane: 'districts',
      style: { color: '#334e68', weight: 2, opacity: 0.82, fillColor: '#d9e8ee', fillOpacity: 0.08 },
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.name;
        if (name || feature.properties?.schooldist) layer.bindTooltip(escapeHtml(String(name ?? `District ${feature.properties?.schooldist}`)), { className: 'district-label', sticky: true });
      },
    }).addTo(map);
  }, [districts, mapReady, showDistricts]);

  useEffect(() => {
    const L = leafletRef.current, map = mapRef.current, layer = markersRef.current;
    if (!mapReady || !L || !map || !layer) return;
    layer.clearLayers();
    const byLocation = new Map<string, School[]>();
    for (const school of filteredSchools) {
      const key = `${school.lat},${school.lng}`;
      const group = byLocation.get(key) ?? [];
      group.push(school);
      byLocation.set(key, group);
    }
    const bounds: [number, number][] = [];
    for (const group of byLocation.values()) {
      const school = group[0];
      const point: [number, number] = [school.lat, school.lng];
      if (group.length === 1) {
        L.circleMarker(point, { pane: 'schools', className: 'school-marker', radius: 6.5, color: '#fff', weight: 2, fillColor: metricColor(dotValue(school, effectiveMetric), breaks), fillOpacity: 0.96 })
          .bindTooltip(`${escapeHtml(school.name)}<br>${escapeHtml(dotLabel)}: ${metricText(dotValue(school, effectiveMetric), dotScale)}`, { direction: 'top', offset: [0, -5] })
          .bindPopup(popupFor(school, region, level, dotLabel, effectiveMetric, dotScale), { minWidth: 300, maxWidth: 360, maxHeight: 520 }).addTo(layer);
      } else {
        L.marker(point, { pane: 'schools', icon: L.divIcon({ className: 'shared-school-marker', html: `<span>${group.length}</span>`, iconSize: [27, 27], iconAnchor: [13.5, 13.5] }) })
          .bindTooltip(`${group.length} schools at this location<br>${group.map((item) => escapeHtml(item.name)).join('<br>')}`, { direction: 'top', offset: [0, -12] })
          .bindPopup(sharedLocationPopup(group, region, level, dotLabel, effectiveMetric, dotScale), { minWidth: 320, maxWidth: 400, maxHeight: 520 }).addTo(layer);
      }
      bounds.push(point);
    }
    const filterKey = `${query}\n${county}\n${district}\n${schoolType}`;
    if (schools.length && filterKey !== lastSearchRef.current) {
      lastSearchRef.current = filterKey;
      if ((query || county !== 'All counties' || district !== 'All districts' || schoolType !== 'All school types') && bounds.length) map.fitBounds(bounds, { padding: [36, 36], maxZoom: bounds.length === 1 ? 14 : 13 });
    }
  }, [breaks, county, district, schoolType, filteredSchools, mapReady, query, region, level, schools.length, effectiveMetric, dotLabel, dotScale]);

  return <main className="map-shell">
    <aside className="control-panel">
      <SchoolMapHeader current={region} schoolYear="2024–25" level={level} />
      <p className="intro">Select a dot for school info. Numbered dots contain schools that share a location.</p>
      <div className="filters"><label htmlFor="region-search">School, city, county, or district</label><div className="search-wrap"><Search size={18} aria-hidden="true" /><Input id="region-search" type="search" placeholder={config.placeholder} value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 rounded-none border-slate-300 bg-white pl-10 text-base shadow-none focus-visible:ring-2" /></div>
        <details className="filter-section"><summary><span>Filters{(county !== 'All counties' || district !== 'All districts' || schoolType !== 'All school types' || onlyScored) ? ' (active)' : ''}</span><ChevronDown size={17} aria-hidden="true" /></summary><div className="filter-grid"><div className="filter-control"><label htmlFor="county-filter">County / region</label><NativeSelect id="county-filter" className="w-full" value={county} onChange={(event) => { setCounty(event.target.value); setDistrict('All districts'); }}>{countyNames.map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></div><div className="filter-control"><label htmlFor="district-filter">District</label><NativeSelect id="district-filter" className="w-full" value={district} onChange={(event) => setDistrict(event.target.value)}>{districtNames.map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></div>{level !== 'elementary' && <div className="filter-control"><label htmlFor="school-type-filter">School type</label><NativeSelect id="school-type-filter" className="w-full" value={schoolType} onChange={(event) => setSchoolType(event.target.value)}>{schoolTypeNames.map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></div>}{(hasScores || hasGraduation) && <label className="filter-checkbox"><input type="checkbox" checked={onlyScored} onChange={(event) => setOnlyScored(event.target.checked)} />Has selected result</label>}</div></details>
      </div>
      <div className="result-count" aria-live="polite"><MapPin size={17} aria-hidden="true" /><strong>{filteredSchools.length.toLocaleString()}</strong><span>{filteredSchools.length === 1 ? 'school shown' : 'schools shown'}</span></div>
      <div className="dot-metric-control"><label htmlFor="region-dot-metric">Color dots by</label><NativeSelect id="region-dot-metric" className="w-full" value={effectiveMetric} onChange={(event) => setDotMetric(event.target.value as DotMetric)}>{hasScores && <NativeSelectOption value="assessment">Average ELA and math proficiency</NativeSelectOption>}{level === 'middle' && region === 'nyc' && <><NativeSelectOption value="ela">ELA proficiency</NativeSelectOption><NativeSelectOption value="math">Math proficiency</NativeSelectOption></>}{hasGraduation && <><NativeSelectOption value="graduation">Four-year graduation rate</NativeSelectOption><NativeSelectOption value="regents">Regents diploma rate</NativeSelectOption></>}<NativeSelectOption value="enrollment">Schoolwide enrollment</NativeSelectOption>{hasAcceptance && <NativeSelectOption value="acceptance">Acceptance rate</NativeSelectOption>}{classSizeGrades.map((grade) => <NativeSelectOption key={grade} value={`class-size:${grade}`}>Grade {grade} average class size</NativeSelectOption>)}</NativeSelect></div>
      <fieldset className="layer-controls"><legend>Boundary layers</legend><label htmlFor="district-layer"><span><i className="line-key district-key" />School districts</span><input id="district-layer" className="layer-toggle" type="checkbox" role="switch" checked={showDistricts} aria-checked={showDistricts} onChange={(event) => setShowDistricts(event.target.checked)} disabled={!districts} /></label><p>District boundaries are generalized 2024–25 NCES data. Confirm a specific address with the district.</p>{boundaryError && <p className="boundary-error">District boundaries could not be loaded.</p>}</fieldset>
      <DotMetricLegend label={dotLabel} breaks={breaks} scale={dotScale} relative={relativeScale} />
      <DataSourcesFooter><p>{level === 'middle' && region === 'nyc' && <>Scores: <a href="https://infohub.nyced.org/reports/academics/test-results" target="_blank" rel="noopener noreferrer">NYCPS 2026 grades 6–8 ELA and math</a>. </>}{level === 'high' && region === 'nyc' && <>Outcomes: <a href="https://infohub.nyced.org/reports/academics/graduation-results" target="_blank" rel="noopener noreferrer">NYCPS class of 2025 four-year graduation</a> and Regents diploma rates. </>}{level !== 'elementary' && region !== 'nyc' && <>Assessment and graduation results are not included for this region yet. </>}{level === 'elementary' && (region === 'long-island' || region === 'hudson-valley') && <>Scores: <a href="https://data.nysed.gov/downloads.php" target="_blank" rel="noopener noreferrer">NYSED 2024–25 report cards</a>, combining published grades 3–5 counts. </>}{level === 'elementary' && region === 'new-jersey' && <>Scores: <a href="https://www.nj.gov/education/assessment/results/reports/2425/index.shtml" target="_blank" rel="noopener noreferrer">NJDOE 2024–25 NJSLA</a>, combining published grades 3–5 results. </>}{level === 'elementary' && region === 'connecticut' && <>Scores: <a href="https://data.ct.gov/Education/Next-Generation-Accountability-System/h28j-iix5" target="_blank" rel="noopener noreferrer">CSDE 2024–25 accountability data</a>, using the ELA and math performance index. This index is not a proficiency percentage. </>}{level === 'elementary' ? <>Enrollment, demographics, and locations: <a href="https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_ADMINDATA_PUBLICSCH_2425/MapServer/1" target="_blank" rel="noopener noreferrer">NCES 2024–25</a>. </> : <>School grades, enrollment, and demographics: <a href="https://nces.ed.gov/ccd/files.asp" target="_blank" rel="noopener noreferrer">NCES CCD 2024–25</a>. Locations: <a href="https://nces.ed.gov/programs/edge/Geographic/SchoolLocations" target="_blank" rel="noopener noreferrer">NCES EDGE 2024–25</a>. </>}District boundaries: {region === 'hudson-valley' ? <>NCES 2024–25 and <a href="https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Schools/MapServer/18" target="_blank" rel="noopener noreferrer">NYS GIS</a>.</> : region === 'westchester' ? <><a href="https://q-giswww.westchestergov.com/arcgis/rest/services/MappingWestchesterCounty/MapServer/87" target="_blank" rel="noopener noreferrer">Westchester County GIS</a>.</> : region === 'nyc' ? <>NYC Open Data.</> : <><a href="https://nces.ed.gov/opengis/rest/services/School_District_Boundaries/EDGE_ADMINDATA_SCHOOLDISTRICTS_SY2425/MapServer/1" target="_blank" rel="noopener noreferrer">NCES 2024–25</a>.</>}</p></DataSourcesFooter>
    </aside>
    <section className="map-stage" aria-label="Interactive school map">{loadError && <div className="map-message">School data could not be loaded.</div>}{!loadError && schools.length === 0 && <div className="map-message">Loading schools…</div>}{schools.length > 0 && filteredSchools.length === 0 && <div className="empty-message">No schools match those filters.</div>}<div ref={mapElementRef} className="map-canvas" role="application" aria-label={`Map of ${title}`} /></section>
  </main>;
}
