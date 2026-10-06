'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import { ChevronDown, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DataSourcesFooter } from '@/components/data-sources-footer';
import { SchoolMapHeader } from '@/components/school-map-header';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

type Result = { tested: number | null; proficient: number | null; index?: number | null; level4: number | null; grades: string[] } | null;
type School = {
  id: string;
  name: string;
  district: string;
  county: string;
  city: string;
  address: string;
  grades: string;
  enrollment: number | null;
  lat: number;
  lng: number;
  ela: Result;
  math: Result;
  average: number | null;
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

function colorFor(value: number | null) {
  if (value === null) return '#7b8790';
  if (value >= 75) return '#087f5b';
  if (value >= 55) return '#2f78a8';
  if (value >= 35) return '#e39a22';
  return '#c44a3d';
}

function markerColor(school: School, hasScores: boolean) {
  if (hasScores) return colorFor(school.average);
  return '#2f78a8';
}

function popupFor(school: School, region: Region, level: SchoolLevel) {
  const hasScores = level === 'elementary' && CONFIG[region].scores;
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
    ${hasScores ? `<div class="score-grid">
      <div><strong>${assessmentScore(elaValue, region)}</strong><span>ELA ${ct ? 'index' : 'proficient'}</span></div>
      <div><strong>${assessmentScore(mathValue, region)}</strong><span>Math ${ct ? 'index' : 'proficient'}</span></div>
      <div class="score-average"><strong>${assessmentScore(school.average, region)}</strong><span>Average ${ct ? 'index' : 'proficient'}</span></div>
    </div>` : ''}
    <details class="popup-details"><summary>More details</summary><div class="popup-details-content">
      <section><h3>School</h3><dl class="detail-grid">
        <div><dt>Address</dt><dd>${escapeHtml(school.address)}, ${escapeHtml(school.city)}</dd></div>
        <div><dt>District</dt><dd>${escapeHtml(school.district)}</dd></div>
        <div><dt>County/region</dt><dd>${escapeHtml(school.county)}</dd></div>
        <div><dt>Schoolwide enrollment</dt><dd>${school.enrollment?.toLocaleString() ?? 'Unavailable'}</dd></div>
      </dl></section>
      ${hasScores ? `<section><h3>2024–25 ${nj ? 'NJSLA assessments' : ct ? 'state accountability' : 'state assessments'}</h3><dl class="detail-grid">
        ${ct ? '' : `<div><dt>ELA tested, grades 3–5</dt><dd>${school.ela?.tested?.toLocaleString() ?? 'Unavailable'}</dd></div>`}
        <div><dt>ELA ${ct ? 'performance index' : 'proficient'}</dt><dd>${assessmentScore(elaValue, region)}</dd></div>
        ${nj || ct ? '' : `<div><dt>ELA level 4</dt><dd>${score(school.ela?.level4)}</dd></div>`}
        ${ct ? '' : `<div><dt>Math tested, grades 3–5</dt><dd>${school.math?.tested?.toLocaleString() ?? 'Unavailable'}</dd></div>`}
        <div><dt>Math ${ct ? 'performance index' : 'proficient'}</dt><dd>${assessmentScore(mathValue, region)}</dd></div>
        ${nj || ct ? '' : `<div><dt>Math level 4</dt><dd>${score(school.math?.level4)}</dd></div>`}
      </dl><p class="detail-note">${ct ? 'The Connecticut performance index is a 0–100 achievement measure across all tested grades at the school; it is not a proficiency percentage.' : nj ? 'NJSLA proficiency is Levels 4 and 5, weighted across published grades 3–5. Suppressed results remain unavailable.' : 'Results combine published grade 3–5 counts. Small groups suppressed by NYSED remain unavailable.'} ${school.reportUrl ? `<a href="${escapeHtml(school.reportUrl)}" target="_blank" rel="noopener noreferrer">${ct ? 'CSDE accountability data' : nj ? 'NJDOE assessment data' : 'NYSED report card'}</a>` : `No matching ${ct ? 'CSDE' : nj ? 'NJDOE' : 'NYSED'} results were found.`}</p></section>` : ''}
      <section><h3>Student demographics</h3><dl class="detail-grid">${demographics.map(([label, value]) => `<div><dt>${label}</dt><dd>${score(value as number | null)}</dd></div>`).join('')}</dl><p class="detail-note">2024–25 NCES Common Core of Data.</p></section>
    </div></details>
  </article>`;
}

export function RegionMap({ region, level = 'elementary' }: { region: Region; level?: SchoolLevel }) {
  const config = CONFIG[region];
  const hasScores = level === 'elementary' && config.scores;
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
  const [onlyScored, setOnlyScored] = useState(false);
  const [showDistricts, setShowDistricts] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [boundaryError, setBoundaryError] = useState(false);

  const districtNames = useMemo(() => ['All districts', ...new Set(schools.filter((school) => county === 'All counties' || school.county === county).map((school) => school.district))].sort((a, b) => a === 'All districts' ? -1 : b === 'All districts' ? 1 : a.localeCompare(b)), [county, schools]);
  const countyNames = useMemo(() => ['All counties', ...new Set(schools.map((school) => school.county))], [schools]);
  const filteredSchools = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return schools.filter((school) =>
      (district === 'All districts' || school.district === district) &&
      (county === 'All counties' || school.county === county) &&
      (!hasScores || !onlyScored || school.average !== null) &&
      (!needle || `${school.name} ${school.city} ${school.district} ${school.county}`.toLowerCase().includes(needle)));
  }, [schools, county, district, hasScores, onlyScored, query]);

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
    const bounds: [number, number][] = [];
    for (const school of filteredSchools) {
      L.circleMarker([school.lat, school.lng], { pane: 'schools', className: 'school-marker', radius: 6.5, color: '#fff', weight: 2, fillColor: markerColor(school, hasScores), fillOpacity: 0.96 })
        .bindTooltip(school.name, { direction: 'top', offset: [0, -5] })
        .bindPopup(popupFor(school, region, level), { minWidth: 300, maxWidth: 360, maxHeight: 520 }).addTo(layer);
      bounds.push([school.lat, school.lng]);
    }
    const filterKey = `${query}\n${county}\n${district}`;
    if (schools.length && filterKey !== lastSearchRef.current) {
      lastSearchRef.current = filterKey;
      if ((query || county !== 'All counties' || district !== 'All districts') && bounds.length) map.fitBounds(bounds, { padding: [36, 36], maxZoom: bounds.length === 1 ? 14 : 13 });
    }
  }, [hasScores, county, district, filteredSchools, mapReady, query, region, level, schools.length]);

  return <main className="map-shell">
    <aside className="control-panel">
      <SchoolMapHeader current={region} schoolYear="2024–25" level={level} />
      <p className="intro">Select a dot for school info.</p>
      <div className="filters"><label htmlFor="region-search">School, city, county, or district</label><div className="search-wrap"><Search size={18} aria-hidden="true" /><Input id="region-search" type="search" placeholder={config.placeholder} value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 rounded-none border-slate-300 bg-white pl-10 text-base shadow-none focus-visible:ring-2" /></div>
        <details className="filter-section"><summary><span>Filters{(county !== 'All counties' || district !== 'All districts' || onlyScored) ? ' (active)' : ''}</span><ChevronDown size={17} aria-hidden="true" /></summary><div className="filter-grid"><div className="filter-control"><label htmlFor="county-filter">County / region</label><NativeSelect id="county-filter" className="w-full" value={county} onChange={(event) => { setCounty(event.target.value); setDistrict('All districts'); }}>{countyNames.map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></div><div className="filter-control"><label htmlFor="district-filter">District</label><NativeSelect id="district-filter" className="w-full" value={district} onChange={(event) => setDistrict(event.target.value)}>{districtNames.map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></div>{hasScores && <label className="filter-checkbox"><input type="checkbox" checked={onlyScored} onChange={(event) => setOnlyScored(event.target.checked)} />Has ELA and math scores</label>}</div></details>
      </div>
      <div className="result-count" aria-live="polite"><MapPin size={17} aria-hidden="true" /><strong>{filteredSchools.length.toLocaleString()}</strong><span>{filteredSchools.length === 1 ? 'school shown' : 'schools shown'}</span></div>
      <fieldset className="layer-controls"><legend>Boundary layers</legend><label htmlFor="district-layer"><span><i className="line-key district-key" />School districts</span><input id="district-layer" className="layer-toggle" type="checkbox" role="switch" checked={showDistricts} aria-checked={showDistricts} onChange={(event) => setShowDistricts(event.target.checked)} disabled={!districts} /></label><p>District boundaries are generalized 2024–25 NCES data. Confirm a specific address with the district.</p>{boundaryError && <p className="boundary-error">District boundaries could not be loaded.</p>}</fieldset>
      {hasScores && <div className="legend" aria-label={region === 'connecticut' ? 'Average performance index color legend' : 'Average proficiency color legend'}><p>Average {region === 'connecticut' ? 'performance index' : 'proficiency'}</p><div><span className="dot high" />75{region === 'connecticut' ? ' or more' : '% or more'}</div><div><span className="dot upper" />55–74.9{region === 'connecticut' ? '' : '%'}</div><div><span className="dot middle" />35–54.9{region === 'connecticut' ? '' : '%'}</div><div><span className="dot lower" />Below 35{region === 'connecticut' ? '' : '%'}</div><div><span className="dot unavailable" />Unavailable</div></div>}
      <DataSourcesFooter><p>{level !== 'elementary' && <>Assessment results are not included for middle and high schools. </>}{level === 'elementary' && (region === 'long-island' || region === 'hudson-valley') && <>Scores: <a href="https://data.nysed.gov/downloads.php" target="_blank" rel="noopener noreferrer">NYSED 2024–25 report cards</a>, combining published grades 3–5 counts. </>}{level === 'elementary' && region === 'new-jersey' && <>Scores: <a href="https://www.nj.gov/education/assessment/results/reports/2425/index.shtml" target="_blank" rel="noopener noreferrer">NJDOE 2024–25 NJSLA</a>, combining published grades 3–5 results. </>}{level === 'elementary' && region === 'connecticut' && <>Scores: <a href="https://data.ct.gov/Education/Next-Generation-Accountability-System/h28j-iix5" target="_blank" rel="noopener noreferrer">CSDE 2024–25 accountability data</a>, using the ELA and math performance index. This index is not a proficiency percentage. </>}{level === 'elementary' ? <>Enrollment, demographics, and locations: <a href="https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_ADMINDATA_PUBLICSCH_2425/MapServer/1" target="_blank" rel="noopener noreferrer">NCES 2024–25</a>. </> : <>School grades, enrollment, and demographics: <a href="https://nces.ed.gov/ccd/files.asp" target="_blank" rel="noopener noreferrer">NCES CCD 2024–25</a>. Locations: <a href="https://nces.ed.gov/programs/edge/Geographic/SchoolLocations" target="_blank" rel="noopener noreferrer">NCES EDGE 2024–25</a>. </>}District boundaries: {region === 'hudson-valley' ? <>NCES 2024–25 and <a href="https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Schools/MapServer/18" target="_blank" rel="noopener noreferrer">NYS GIS</a>.</> : region === 'westchester' ? <><a href="https://q-giswww.westchestergov.com/arcgis/rest/services/MappingWestchesterCounty/MapServer/87" target="_blank" rel="noopener noreferrer">Westchester County GIS</a>.</> : region === 'nyc' ? <>NYC Open Data.</> : <><a href="https://nces.ed.gov/opengis/rest/services/School_District_Boundaries/EDGE_ADMINDATA_SCHOOLDISTRICTS_SY2425/MapServer/1" target="_blank" rel="noopener noreferrer">NCES 2024–25</a>.</>}</p></DataSourcesFooter>
    </aside>
    <section className="map-stage" aria-label="Interactive school map">{loadError && <div className="map-message">School data could not be loaded.</div>}{!loadError && schools.length === 0 && <div className="map-message">Loading schools…</div>}{schools.length > 0 && filteredSchools.length === 0 && <div className="empty-message">No schools match those filters.</div>}<div ref={mapElementRef} className="map-canvas" role="application" aria-label={`Map of ${title}`} /></section>
  </main>;
}
