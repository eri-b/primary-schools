'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import Link from 'next/link';
import { ChevronDown, GraduationCap, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DataSourcesFooter } from '@/components/data-sources-footer';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

type Result = { tested: number; proficient: number | null; level4: number | null; grades: string[] } | null;
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

type Region = 'long-island' | 'neighbors';
const CONFIG = {
  'long-island': { title: 'Long Island elementary schools', center: [40.82, -73.1] as [number, number], zoom: 9, placeholder: 'Try Hempstead or Riverhead', scores: true },
  neighbors: { title: 'Nearby NJ and CT elementary schools', center: [40.91, -73.84] as [number, number], zoom: 9, placeholder: 'Try Bergen or Greenwich', scores: false },
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
}

function score(value: number | null | undefined) {
  return value == null ? 'Unavailable' : `${value.toFixed(1)}%`;
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
  return school.county.endsWith(', NJ') ? '#2f78a8' : '#e39a22';
}

function popupFor(school: School, hasScores: boolean) {
  const demographics = [
    ['Asian', school.demographics.asian], ['Black', school.demographics.black],
    ['Hispanic', school.demographics.hispanic], ['White', school.demographics.white],
    ['Two or more races', school.demographics.multiracial],
  ];
  return `<article class="school-popup">
    <div class="popup-eyebrow">${escapeHtml(school.county)} · ${escapeHtml(school.district)}</div>
    <h2>${escapeHtml(school.name)}</h2>
    <p class="popup-meta">${escapeHtml(school.city)} · Grades ${escapeHtml(school.grades)} · ${school.enrollment?.toLocaleString() ?? 'Unknown'} students</p>
    ${hasScores ? `<div class="score-grid">
      <div><strong>${score(school.ela?.proficient)}</strong><span>ELA proficient</span></div>
      <div><strong>${score(school.math?.proficient)}</strong><span>Math proficient</span></div>
      <div class="score-average"><strong>${score(school.average)}</strong><span>Average proficient</span></div>
    </div>` : ''}
    <details class="popup-details"><summary>More details</summary><div class="popup-details-content">
      <section><h3>School</h3><dl class="detail-grid">
        <div><dt>Address</dt><dd>${escapeHtml(school.address)}, ${escapeHtml(school.city)}</dd></div>
        <div><dt>District</dt><dd>${escapeHtml(school.district)}</dd></div>
        <div><dt>County/region</dt><dd>${escapeHtml(school.county)}</dd></div>
        <div><dt>Enrollment</dt><dd>${school.enrollment?.toLocaleString() ?? 'Unavailable'}</dd></div>
      </dl></section>
      ${hasScores ? `<section><h3>2024–25 state assessments</h3><dl class="detail-grid">
        <div><dt>ELA tested, grades 3–5</dt><dd>${school.ela?.tested.toLocaleString() ?? 'Unavailable'}</dd></div>
        <div><dt>ELA proficient</dt><dd>${score(school.ela?.proficient)}</dd></div>
        <div><dt>ELA level 4</dt><dd>${score(school.ela?.level4)}</dd></div>
        <div><dt>Math tested, grades 3–5</dt><dd>${school.math?.tested.toLocaleString() ?? 'Unavailable'}</dd></div>
        <div><dt>Math proficient</dt><dd>${score(school.math?.proficient)}</dd></div>
        <div><dt>Math level 4</dt><dd>${score(school.math?.level4)}</dd></div>
      </dl><p class="detail-note">Results combine published grade 3–5 counts. Small groups suppressed by NYSED remain unavailable. ${school.reportUrl ? `<a href="${escapeHtml(school.reportUrl)}" target="_blank" rel="noopener noreferrer">NYSED report card</a>` : 'No matching NYSED report card was found.'}</p></section>` : ''}
      <section><h3>Student demographics</h3><dl class="detail-grid">${demographics.map(([label, value]) => `<div><dt>${label}</dt><dd>${score(value as number | null)}</dd></div>`).join('')}</dl><p class="detail-note">2024–25 NCES Common Core of Data.</p></section>
    </div></details>
  </article>`;
}

export function RegionMap({ region }: { region: Region }) {
  const config = CONFIG[region];
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
      (!onlyScored || school.average !== null) &&
      (!needle || `${school.name} ${school.city} ${school.district} ${school.county}`.toLowerCase().includes(needle)));
  }, [schools, county, district, onlyScored, query]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/${region}-schools.json`).then((response) => {
      if (!response.ok) throw new Error('Schools unavailable');
      return response.json() as Promise<School[]>;
    }).then((data) => { if (!cancelled) setSchools(data); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    fetch(`/${region}-districts.geojson`).then((response) => {
      if (!response.ok) throw new Error('Districts unavailable');
      return response.json() as Promise<GeoJsonObject>;
    }).then((data) => { if (!cancelled) setDistricts(data); })
      .catch(() => { if (!cancelled) setBoundaryError(true); });
    return () => { cancelled = true; };
  }, [region]);

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
        if (name) layer.bindTooltip(escapeHtml(String(name)), { className: 'district-label', sticky: true });
      },
    }).addTo(map);
  }, [districts, mapReady, showDistricts]);

  useEffect(() => {
    const L = leafletRef.current, map = mapRef.current, layer = markersRef.current;
    if (!mapReady || !L || !map || !layer) return;
    layer.clearLayers();
    const bounds: [number, number][] = [];
    for (const school of filteredSchools) {
      L.circleMarker([school.lat, school.lng], { pane: 'schools', className: 'school-marker', radius: 6.5, color: '#fff', weight: 2, fillColor: markerColor(school, config.scores), fillOpacity: 0.96 })
        .bindTooltip(school.name, { direction: 'top', offset: [0, -5] })
        .bindPopup(popupFor(school, config.scores), { minWidth: 300, maxWidth: 360, maxHeight: 520 }).addTo(layer);
      bounds.push([school.lat, school.lng]);
    }
    const filterKey = `${query}\n${county}\n${district}`;
    if (schools.length && filterKey !== lastSearchRef.current) {
      lastSearchRef.current = filterKey;
      if ((query || county !== 'All counties' || district !== 'All districts') && bounds.length) map.fitBounds(bounds, { padding: [36, 36], maxZoom: bounds.length === 1 ? 14 : 13 });
    }
  }, [config.scores, county, district, filteredSchools, mapReady, query, schools.length]);

  return <main className="map-shell">
    <aside className="control-panel">
      <nav className="region-nav" aria-label="Choose region"><Link href="/elementary/nyc">NYC</Link><Link href="/elementary/westchester">Westchester</Link><Link href="/elementary/long-island" aria-current={region === 'long-island' ? 'page' : undefined}>Long Island</Link><Link href="/elementary/neighbors" aria-current={region === 'neighbors' ? 'page' : undefined}>NJ / CT</Link></nav>
      <div className="brand-row"><span className="brand-mark" aria-hidden="true"><GraduationCap size={22} strokeWidth={2.2} /></span><div><p className="eyebrow">2024–25 school year</p><h1>{config.title}</h1></div></div>
      <p className="intro">Select a dot for school info.</p>
      <div className="filters"><label htmlFor="region-search">School, city, county, or district</label><div className="search-wrap"><Search size={18} aria-hidden="true" /><Input id="region-search" type="search" placeholder={config.placeholder} value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 rounded-none border-slate-300 bg-white pl-10 text-base shadow-none focus-visible:ring-2" /></div>
        <details className="filter-section"><summary><span>Filters{(county !== 'All counties' || district !== 'All districts' || onlyScored) ? ' (active)' : ''}</span><ChevronDown size={17} aria-hidden="true" /></summary><div className="filter-grid"><div className="filter-control"><label htmlFor="county-filter">County / region</label><NativeSelect id="county-filter" className="w-full" value={county} onChange={(event) => { setCounty(event.target.value); setDistrict('All districts'); }}>{countyNames.map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></div><div className="filter-control"><label htmlFor="district-filter">District</label><NativeSelect id="district-filter" className="w-full" value={district} onChange={(event) => setDistrict(event.target.value)}>{districtNames.map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></div>{config.scores && <label className="filter-checkbox"><input type="checkbox" checked={onlyScored} onChange={(event) => setOnlyScored(event.target.checked)} />Has ELA and math scores</label>}</div></details>
      </div>
      <div className="result-count" aria-live="polite"><MapPin size={17} aria-hidden="true" /><strong>{filteredSchools.length.toLocaleString()}</strong><span>{filteredSchools.length === 1 ? 'school shown' : 'schools shown'}</span></div>
      <fieldset className="layer-controls"><legend>Boundary layers</legend><label htmlFor="district-layer"><span><i className="line-key district-key" />School districts</span><input id="district-layer" className="layer-toggle" type="checkbox" role="switch" checked={showDistricts} aria-checked={showDistricts} onChange={(event) => setShowDistricts(event.target.checked)} disabled={!districts} /></label><p>District boundaries are generalized 2024–25 NCES data. Confirm a specific address with the district.</p>{boundaryError && <p className="boundary-error">District boundaries could not be loaded.</p>}</fieldset>
      {config.scores ? <div className="legend" aria-label="Average proficiency color legend"><p>Average proficiency</p><div><span className="dot high" />75% or more</div><div><span className="dot upper" />55–74.9%</div><div><span className="dot middle" />35–54.9%</div><div><span className="dot lower" />Below 35%</div><div><span className="dot unavailable" />Unavailable</div></div> : <div className="legend" aria-label="State color legend"><p>School location</p><div><span className="dot upper" />New Jersey</div><div><span className="dot middle" />Connecticut</div></div>}
      <DataSourcesFooter><p>{config.scores && <>Scores: <a href="https://data.nysed.gov/downloads.php" target="_blank" rel="noopener noreferrer">NYSED 2024–25 report cards</a>, combining published grades 3–5 counts. </>}Enrollment, demographics, and locations: <a href="https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_ADMINDATA_PUBLICSCH_2425/MapServer/1" target="_blank" rel="noopener noreferrer">NCES 2024–25</a>. District boundaries: <a href="https://nces.ed.gov/opengis/rest/services/School_District_Boundaries/EDGE_ADMINDATA_SCHOOLDISTRICTS_SY2425/MapServer/1" target="_blank" rel="noopener noreferrer">NCES 2024–25</a>. {!config.scores && 'State assessment scores are not yet included for NJ and CT.'}</p></DataSourcesFooter>
    </aside>
    <section className="map-stage" aria-label="Interactive school map">{loadError && <div className="map-message">School data could not be loaded.</div>}{!loadError && schools.length === 0 && <div className="map-message">Loading schools…</div>}{schools.length > 0 && filteredSchools.length === 0 && <div className="empty-message">No schools match those filters.</div>}<div ref={mapElementRef} className="map-canvas" role="application" aria-label={`Map of ${config.title}`} /></section>
  </main>;
}
