'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import { GraduationCap, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';

type School = {
  dbn: string;
  name: string;
  borough: string;
  district: number;
  grades: string;
  enrollment: number;
  elaTested: number;
  elaMeanScore: number;
  ela: number;
  elaLevel4: number;
  elaPctile: number;
  mathTested: number;
  mathMeanScore: number;
  math: number;
  mathLevel4: number;
  mathPctile: number;
  average: number;
  averagePctile: number;
  asian: number;
  black: number;
  hispanic: number;
  white: number;
  multiracial: number;
  nativeAmerican: number;
  swd: number;
  ell: number;
  poverty: number | string;
  eni: number | string;
  lat: number;
  lng: number;
};

const BOROUGHS = ['All boroughs', 'Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island'];

function colorFor(score: number) {
  if (score >= 75) return '#087f5b';
  if (score >= 55) return '#2f78a8';
  if (score >= 35) return '#e39a22';
  return '#c44a3d';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;',
  })[character] ?? character);
}

function percent(value: number | string) {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : escapeHtml(value);
}

function popupFor(school: School) {
  return `
    <article class="school-popup">
      <div class="popup-eyebrow">${escapeHtml(school.dbn)} · District ${school.district}</div>
      <h2>${escapeHtml(school.name)}</h2>
      <p class="popup-meta">${escapeHtml(school.borough)} · Grades ${escapeHtml(school.grades)} · ${school.enrollment.toLocaleString()} students</p>
      <div class="score-grid">
        <div><strong>${school.ela.toFixed(1)}%</strong><span>ELA proficient</span></div>
        <div><strong>${school.math.toFixed(1)}%</strong><span>Math proficient</span></div>
        <div class="score-average"><strong>${school.average.toFixed(1)}%</strong><span>Average proficient</span></div>
      </div>
      <details class="popup-details">
        <summary>More details</summary>
        <div class="popup-details-content">
          <section>
            <h3>School</h3>
            <dl class="detail-grid">
              <div><dt>DBN</dt><dd>${escapeHtml(school.dbn)}</dd></div>
              <div><dt>District</dt><dd>${school.district}</dd></div>
              <div><dt>Borough</dt><dd>${escapeHtml(school.borough)}</dd></div>
              <div><dt>Grades</dt><dd>${escapeHtml(school.grades)}</dd></div>
              <div><dt>Enrollment</dt><dd>${school.enrollment.toLocaleString()}</dd></div>
            </dl>
          </section>
          <section>
            <h3>ELA results</h3>
            <dl class="detail-grid">
              <div><dt>Students tested</dt><dd>${school.elaTested.toLocaleString()}</dd></div>
              <div><dt>Mean scale score</dt><dd>${school.elaMeanScore.toFixed(1)}</dd></div>
              <div><dt>Proficient</dt><dd>${school.ela.toFixed(1)}%</dd></div>
              <div><dt>Level 4</dt><dd>${school.elaLevel4.toFixed(1)}%</dd></div>
              <div><dt>NYC percentile</dt><dd>${school.elaPctile.toFixed(1)}</dd></div>
            </dl>
          </section>
          <section>
            <h3>Math results</h3>
            <dl class="detail-grid">
              <div><dt>Students tested</dt><dd>${school.mathTested.toLocaleString()}</dd></div>
              <div><dt>Mean scale score</dt><dd>${school.mathMeanScore.toFixed(1)}</dd></div>
              <div><dt>Proficient</dt><dd>${school.math.toFixed(1)}%</dd></div>
              <div><dt>Level 4</dt><dd>${school.mathLevel4.toFixed(1)}%</dd></div>
              <div><dt>NYC percentile</dt><dd>${school.mathPctile.toFixed(1)}</dd></div>
              <div><dt>Average proficient</dt><dd>${school.average.toFixed(1)}%</dd></div>
              <div><dt>Average NYC percentile</dt><dd>${school.averagePctile.toFixed(1)}</dd></div>
            </dl>
          </section>
          <section>
            <h3>Student demographics</h3>
            <dl class="detail-grid">
              <div><dt>Asian and Pacific Islander</dt><dd>${school.asian.toFixed(1)}%</dd></div>
              <div><dt>Black</dt><dd>${school.black.toFixed(1)}%</dd></div>
              <div><dt>Hispanic</dt><dd>${school.hispanic.toFixed(1)}%</dd></div>
              <div><dt>White</dt><dd>${school.white.toFixed(1)}%</dd></div>
              <div><dt>Multi-Racial</dt><dd>${school.multiracial.toFixed(1)}%</dd></div>
              <div><dt>Native American</dt><dd>${school.nativeAmerican.toFixed(1)}%</dd></div>
              <div><dt>Students with disabilities</dt><dd>${school.swd.toFixed(1)}%</dd></div>
              <div><dt>English language learners</dt><dd>${school.ell.toFixed(1)}%</dd></div>
              <div><dt>Poverty</dt><dd>${percent(school.poverty)}</dd></div>
              <div><dt>Economic need index</dt><dd>${percent(school.eni)}</dd></div>
            </dl>
          </section>
        </div>
      </details>
    </article>`;
}

export default function Home() {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const districtLayerRef = useRef<Leaflet.GeoJSON | null>(null);
  const zoneLayerRef = useRef<Leaflet.GeoJSON | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [districts, setDistricts] = useState<GeoJsonObject | null>(null);
  const [zones, setZones] = useState<GeoJsonObject | null>(null);
  const [query, setQuery] = useState('');
  const [borough, setBorough] = useState('All boroughs');
  const [showDistricts, setShowDistricts] = useState(true);
  const [showZones, setShowZones] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [boundaryError, setBoundaryError] = useState(false);

  const filteredSchools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return schools.filter((school) => {
      const matchesBorough = borough === 'All boroughs' || school.borough === borough;
      const matchesQuery = !normalizedQuery ||
        school.name.toLowerCase().includes(normalizedQuery) ||
        school.dbn.toLowerCase().includes(normalizedQuery);
      return matchesBorough && matchesQuery;
    });
  }, [borough, query, schools]);

  useEffect(() => {
    let cancelled = false;
    fetch('/schools.json')
      .then((response) => {
        if (!response.ok) throw new Error('School data could not be loaded');
        return response.json() as Promise<School[]>;
      })
      .then((data: School[]) => {
        if (!cancelled) setSchools(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/school-districts.geojson'),
      fetch('/elementary-zones.geojson'),
    ])
      .then(async ([districtResponse, zoneResponse]) => {
        if (!districtResponse.ok || !zoneResponse.ok) {
          throw new Error('Boundary data could not be loaded');
        }
        return Promise.all([
          districtResponse.json() as Promise<GeoJsonObject>,
          zoneResponse.json() as Promise<GeoJsonObject>,
        ]);
      })
      .then(([districtData, zoneData]: [GeoJsonObject, GeoJsonObject]) => {
        if (!cancelled) {
          setDistricts(districtData);
          setZones(zoneData);
        }
      })
      .catch(() => {
        if (!cancelled) setBoundaryError(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    let cancelled = false;

    void import('leaflet').then((L) => {
      if (cancelled || !mapElementRef.current) return;
      leafletRef.current = L;
      const map = L.map(mapElementRef.current, {
        center: [40.7128, -74.006],
        zoom: 10,
        zoomControl: false,
        preferCanvas: true,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      const cartoKey = process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY;
      const tileUrl = cartoKey
        ? `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`
        : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      L.tileLayer(tileUrl, {
        maxZoom: cartoKey ? 20 : 19,
        subdomains: cartoKey ? 'abcd' : undefined,
        attribution: cartoKey
          ? '&copy; OpenStreetMap contributors &copy; CARTO'
          : '&copy; OpenStreetMap contributors',
      }).addTo(map);
      map.createPane('districts');
      map.getPane('districts')!.style.zIndex = '310';
      map.createPane('zones');
      map.getPane('zones')!.style.zIndex = '320';
      map.createPane('schools');
      map.getPane('schools')!.style.zIndex = '450';
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      setMapReady(true);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      districtLayerRef.current = null;
      zoneLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !L || !map) return;

    districtLayerRef.current?.remove();
    districtLayerRef.current = null;
    if (!showDistricts || !districts) return;

    districtLayerRef.current = L.geoJSON(districts, {
      pane: 'districts',
      style: {
        color: '#334e68',
        weight: 2,
        opacity: 0.82,
        fillColor: '#d9e8ee',
        fillOpacity: 0.08,
      },
      onEachFeature: (feature, layer) => {
        const district = feature.properties?.schooldist;
        if (!district) return;
        layer.bindTooltip(`District ${district}`, {
          className: 'district-label',
          direction: 'center',
          permanent: true,
        });
      },
    }).addTo(map);
  }, [districts, mapReady, showDistricts]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !L || !map) return;

    zoneLayerRef.current?.remove();
    zoneLayerRef.current = null;
    if (!showZones || !zones) return;

    const schoolNames = new Map(schools.map((school) => [school.dbn, school.name]));
    const zoneLayer = L.geoJSON(zones, {
      pane: 'zones',
      style: {
        color: '#9b6415',
        weight: 1,
        opacity: 0.68,
        fillColor: '#f5bf55',
        fillOpacity: 0.1,
      },
      onEachFeature: (feature, layer) => {
        const dbn = String(feature.properties?.dbn ?? '');
        const schoolName = schoolNames.get(dbn);
        layer.bindTooltip(
          `<strong>${escapeHtml(schoolName ?? `Zone ${dbn}`)}</strong><br><span>${escapeHtml(dbn)} · District ${escapeHtml(String(feature.properties?.schooldist ?? '').replace('.0', ''))}</span>`,
          { className: 'zone-tooltip', sticky: true },
        );
        if (layer instanceof L.Path) {
          layer.on({
            mouseover: () => layer.setStyle({ weight: 2, fillOpacity: 0.22 }),
            mouseout: () => zoneLayer.resetStyle(layer),
          });
        }
      },
    }).addTo(map);
    zoneLayerRef.current = zoneLayer;
  }, [mapReady, schools, showZones, zones]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!mapReady || !L || !map || !layer) return;

    layer.clearLayers();
    const bounds: [number, number][] = [];
    filteredSchools.forEach((school) => {
      const marker = L.circleMarker([school.lat, school.lng], {
        pane: 'schools',
        className: 'school-marker',
        radius: 6.5,
        color: '#ffffff',
        weight: 2,
        fillColor: colorFor(school.average),
        fillOpacity: 0.96,
      });
      marker.bindTooltip(school.name, { direction: 'top', offset: [0, -5] });
      marker.bindPopup(popupFor(school), { minWidth: 300, maxWidth: 360, maxHeight: 520 });
      marker.addTo(layer);
      bounds.push([school.lat, school.lng]);
    });

    if ((query || borough !== 'All boroughs') && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: bounds.length === 1 ? 14 : 13 });
    } else if (!query && borough === 'All boroughs') {
      map.setView([40.7128, -74.006], 10);
    }
  }, [borough, filteredSchools, mapReady, query]);

  return (
    <main className="map-shell">
      <aside className="control-panel">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true"><GraduationCap size={22} strokeWidth={2.2} /></span>
          <div>
            <p className="eyebrow">2025–26 school year</p>
            <h1>NYC elementary schools</h1>
          </div>
        </div>

        <p className="intro">Explore public schools with 2026 state test results. Select a dot for details.</p>

        <div className="filters" aria-label="Map filters">
          <label htmlFor="school-search">School name or DBN</label>
          <div className="search-wrap">
            <Search size={18} aria-hidden="true" />
            <Input
              id="school-search"
              type="search"
              placeholder="Try P.S. 11 or 13K011"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 rounded-none border-slate-300 bg-white pl-10 text-base shadow-none focus-visible:ring-2"
            />
          </div>

          <label htmlFor="borough-filter">Borough</label>
          <NativeSelect id="borough-filter" className="w-full" value={borough} onChange={(event) => setBorough(event.target.value)}>
            {BOROUGHS.map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}
          </NativeSelect>
        </div>

        <div className="result-count" aria-live="polite">
          <MapPin size={17} aria-hidden="true" />
          <strong>{filteredSchools.length.toLocaleString()}</strong>
          <span>{filteredSchools.length === 1 ? 'school shown' : 'schools shown'}</span>
        </div>

        <fieldset className="layer-controls">
          <legend>Boundary layers</legend>
          <label htmlFor="district-layer-toggle">
            <span><i className="line-key district-key" />School districts</span>
            <input
              id="district-layer-toggle"
              className="layer-toggle"
              type="checkbox"
              role="switch"
              checked={showDistricts}
              aria-checked={showDistricts}
              onChange={(event) => setShowDistricts(event.target.checked)}
              aria-label="Show community school district boundaries"
              disabled={!districts}
            />
          </label>
          <label htmlFor="zone-layer-toggle">
            <span><i className="line-key zone-key" />Elementary zones</span>
            <input
              id="zone-layer-toggle"
              className="layer-toggle"
              type="checkbox"
              role="switch"
              checked={showZones}
              aria-checked={showZones}
              onChange={(event) => setShowZones(event.target.checked)}
              aria-label="Show elementary school attendance zones"
              disabled={!zones}
            />
          </label>
          <p>Districts are administrative areas. Zones give local residents priority at a specific school; Districts 1, 7, and 23 are unzoned choice districts.</p>
          {boundaryError && <p className="boundary-error">Boundary data could not be loaded.</p>}
        </fieldset>

        <div className="legend" aria-label="Average proficiency color legend">
          <p>Average proficiency</p>
          <div><span className="dot high" />75% or more</div>
          <div><span className="dot upper" />55–74.9%</div>
          <div><span className="dot middle" />35–54.9%</div>
          <div><span className="dot lower" />Below 35%</div>
        </div>

        <p className="source-note">Performance: NYCPS 2026 ELA &amp; Math results. Demographics: NYCPS 2025–26 snapshot. Locations and boundaries: NYC Open Data. Elementary zones shown are 2024–25 and should be confirmed by address with NYCPS.</p>
      </aside>

      <section className="map-stage" aria-label="Interactive school map">
        {loadError && <div className="map-message">The school data could not be loaded.</div>}
        {!loadError && schools.length === 0 && <div className="map-message">Loading schools…</div>}
        {schools.length > 0 && filteredSchools.length === 0 && (
          <div className="empty-message">No schools match those filters.</div>
        )}
        <div ref={mapElementRef} className="map-canvas" role="application" aria-label="Map of New York City public elementary schools" />
      </section>
    </main>
  );
}
