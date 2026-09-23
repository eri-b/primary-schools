'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import { ChevronDown, GraduationCap, MapPin, Search } from 'lucide-react';
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
  elaMeanScore: number | null;
  ela: number | null;
  elaLevel4: number | null;
  elaPctile: number | null;
  mathTested: number;
  mathMeanScore: number | null;
  math: number | null;
  mathLevel4: number | null;
  mathPctile: number | null;
  average: number | null;
  averagePctile: number | null;
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
  giftedTalented: {
    type: 'District G&T' | 'Citywide G&T';
    programCode: string;
    directoryId: number;
  } | null;
  capacity: {
    enrollment: number;
    seats: number;
    utilization: number;
    sites: number;
    reportDate: string;
  } | null;
  kindergarten: {
    directoryId: number;
    directoryYear: string;
    programs: {
      name: string;
      code: string;
      method: string;
      seatsLastYear: number | null;
      applicantsLastYear: number | null;
      filledLastYear: boolean | null;
      priorities: { name: string; result: string }[];
    }[];
  } | null;
  details: {
    gradeEnrollment: { grade: string; count: number }[];
    gender: CountShare[];
    race: CountShare[];
    programs: CountShare[];
    elaLevels: TestLevel[];
    mathLevels: TestLevel[];
  };
  lat: number;
  lng: number;
};

type CountShare = {
  label: string;
  count: number | null;
  percent: number | string | null;
};

type TestLevel = {
  level: number;
  count: number | null;
  percent: number | null;
};

type GiftedTalentedFilter =
  | 'All schools'
  | 'Any G&T'
  | 'District G&T'
  | 'Citywide G&T';

const BOROUGHS = [
  'All boroughs',
  'Bronx',
  'Brooklyn',
  'Manhattan',
  'Queens',
  'Staten Island',
];
const DEFAULT_MAP_CENTER: [number, number] = [40.7128, -74.006];
const DEFAULT_MAP_ZOOM = 11;

function colorFor(score: number | null) {
  if (score === null) return '#7b8790';
  if (score >= 75) return '#087f5b';
  if (score >= 55) return '#2f78a8';
  if (score >= 35) return '#e39a22';
  return '#c44a3d';
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#039;',
        '"': '&quot;',
      })[character] ?? character,
  );
}

function percent(value: number | string) {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : escapeHtml(value);
}

function metric(value: number | null, suffix = '') {
  return value === null ? 'Suppressed' : `${value.toFixed(1)}${suffix}`;
}

function compactCount(value: number | null) {
  return value === null ? '—' : value.toLocaleString();
}

function compactPercent(value: number | string | null) {
  if (value === null) return '—';
  return typeof value === 'number' ? `${value.toFixed(1)}%` : escapeHtml(value);
}

function compactRows(rows: CountShare[]) {
  return rows
    .filter((row) => row.count !== null || row.percent !== null)
    .map(
      (row) => `
        <tr>
          <th scope="row">${escapeHtml(row.label)}</th>
          <td>${compactCount(row.count)}</td>
          <td>${compactPercent(row.percent)}</td>
        </tr>`,
    )
    .join('');
}

function testLevelRows(levels: TestLevel[]) {
  return levels
    .map(
      (level) => `
        <tr>
          <th scope="row">Level ${level.level}</th>
          <td>${level.count === null ? 'Suppressed' : level.count.toLocaleString()}</td>
          <td>${metric(level.percent, '%')}</td>
        </tr>`,
    )
    .join('');
}

function kindergartenDetails(school: School) {
  if (!school.kindergarten) {
    return '<p class="detail-note">No kindergarten program is listed for this school in the available MySchools directory.</p>';
  }
  return school.kindergarten.programs.map((program) => `
    <div class="admissions-program">
      <h4>${escapeHtml(program.name)}</h4>
      <dl class="detail-grid">
        <div><dt>Admissions method</dt><dd>${escapeHtml(program.method)}</dd></div>
        <div><dt>Program code</dt><dd>${escapeHtml(program.code)}</dd></div>
        <div><dt>Seats last year</dt><dd>${compactCount(program.seatsLastYear)}</dd></div>
        <div><dt>Applicants last year</dt><dd>${compactCount(program.applicantsLastYear)}</dd></div>
      </dl>
      ${program.filledLastYear === null ? '' : `<p class="detail-note">${program.filledLastYear ? 'All listed seats filled last year.' : 'Not all listed seats filled last year.'}</p>`}
      <details class="priority-details">
        <summary>Priorities and last year’s offers</summary>
        <ol>${program.priorities.map((priority) => `<li><strong>${escapeHtml(priority.name)}</strong><span>${escapeHtml(priority.result)}</span></li>`).join('')}</ol>
      </details>
    </div>
  `).join('');
}

function popupFor(school: School) {
  const hasSuppressedResults =
    school.ela === null || school.math === null || school.average === null;
  return `
    <article class="school-popup">
      <div class="popup-eyebrow">${escapeHtml(school.dbn)} · District ${school.district}</div>
      <h2>${escapeHtml(school.name)}</h2>
      <p class="popup-meta">${escapeHtml(school.borough)} · Grades ${escapeHtml(school.grades)} · ${school.enrollment.toLocaleString()} students</p>
      <div class="score-grid">
        <div><strong>${metric(school.ela, '%')}</strong><span>ELA proficient</span></div>
        <div><strong>${metric(school.math, '%')}</strong><span>Math proficient</span></div>
        <div class="score-average"><strong>${metric(school.average, '%')}</strong><span>Average proficient</span></div>
      </div>
      ${
        hasSuppressedResults
          ? '<p class="suppression-note"><strong>Why suppressed?</strong> NYCPS hides outcome values for groups of 5 or fewer tested students—and sometimes another small group—to protect student privacy. Participation totals may still be shown.</p>'
          : ''
      }
      <details class="popup-details">
        <summary>More details</summary>
        <div class="popup-details-content">
          <div class="popup-tabs">
            <input class="tab-school" type="radio" name="tabs-${escapeHtml(school.dbn)}" id="school-${escapeHtml(school.dbn)}" checked>
            <label for="school-${escapeHtml(school.dbn)}">School</label>
            <input class="tab-admissions" type="radio" name="tabs-${escapeHtml(school.dbn)}" id="admissions-${escapeHtml(school.dbn)}">
            <label for="admissions-${escapeHtml(school.dbn)}">Admissions</label>
            <input class="tab-results" type="radio" name="tabs-${escapeHtml(school.dbn)}" id="results-${escapeHtml(school.dbn)}">
            <label for="results-${escapeHtml(school.dbn)}">Results</label>
            <input class="tab-students" type="radio" name="tabs-${escapeHtml(school.dbn)}" id="students-${escapeHtml(school.dbn)}">
            <label for="students-${escapeHtml(school.dbn)}">Students</label>
            <div class="popup-panel panel-school">
          <section>
            <h3>School</h3>
            <dl class="detail-grid">
              <div><dt>DBN</dt><dd>${escapeHtml(school.dbn)}</dd></div>
              <div><dt>District</dt><dd>${school.district}</dd></div>
              <div><dt>Borough</dt><dd>${escapeHtml(school.borough)}</dd></div>
              <div><dt>Grades</dt><dd>${escapeHtml(school.grades)}</dd></div>
              <div><dt>Enrollment</dt><dd>${school.enrollment.toLocaleString()}</dd></div>
              <div><dt>G&amp;T program</dt><dd>${school.giftedTalented ? escapeHtml(school.giftedTalented.type) : 'Not listed'}</dd></div>
              ${
                school.giftedTalented
                  ? `<div><dt>G&amp;T program code</dt><dd>${escapeHtml(school.giftedTalented.programCode)}</dd></div>`
                  : ''
              }
            </dl>
            ${
              school.giftedTalented
                ? `<p class="detail-note">${
                    school.giftedTalented.type === 'Citywide G&T'
                      ? 'This is a citywide G&amp;T school. Admission requires a G&amp;T application.'
                      : 'This school offers District G&amp;T classes alongside its general education program. A G&amp;T seat requires a separate G&amp;T application.'
                  } <a href="https://www.myschools.nyc/en/schools/gt-app/${school.giftedTalented.directoryId}/" target="_blank" rel="noopener noreferrer">See admissions details in MySchools</a>.</p>`
                : '<p class="detail-note">No G&amp;T program is listed for this school in the 2025–26 MySchools directory.</p>'
            }
          </section>
            </div>
            <div class="popup-panel panel-admissions">
              <section>
                <h3>School capacity</h3>
                ${school.capacity ? `<dl class="detail-grid">
                  <div><dt>Reported enrollment</dt><dd>${school.capacity.enrollment.toLocaleString()}</dd></div>
                  <div><dt>Estimated capacity</dt><dd>${school.capacity.seats.toLocaleString()}</dd></div>
                  <div><dt>Utilization</dt><dd>${school.capacity.utilization}%</dd></div>
                  <div><dt>Reported sites</dt><dd>${school.capacity.sites}</dd></div>
                </dl><p class="detail-note">NYC School Construction Authority report dated ${escapeHtml(school.capacity.reportDate)}. This is schoolwide space utilization, not available kindergarten seats. <a href="https://data.cityofnewyork.us/Education/Enrollment-Capacity-And-Utilization-Reports/gkd7-3vk7" target="_blank" rel="noopener noreferrer">Source</a></p>` : '<p class="detail-note">Capacity is unavailable in the current city report.</p>'}
              </section>
              <section>
                <h3>Kindergarten demand</h3>
                ${kindergartenDetails(school)}
                <p class="detail-note">These are prior-year figures from the ${school.kindergarten ? escapeHtml(school.kindergarten.directoryYear) : 'available'} MySchools directory, not current openings. Counts shown are for general education where reported. <a href="${school.kindergarten ? `https://www.myschools.nyc/en/schools/kindergarten/${school.kindergarten.directoryId}/` : 'https://www.myschools.nyc/'}" target="_blank" rel="noopener noreferrer">Check MySchools for current admissions and waitlists</a>.</p>
                <p class="detail-note">Offers follow your ranked choices and each program’s priority groups. Random numbers break ties when a group has more applicants than seats. If a seat opens after offers, the program can make a waitlist offer. <a href="https://www.schools.nyc.gov/enrollment/enroll-grade-by-grade/kindergarten" target="_blank" rel="noopener noreferrer">How kindergarten offers work</a>.</p>
              </section>
            </div>
            <div class="popup-panel panel-results">
          <section>
            <h3>ELA results</h3>
            <dl class="detail-grid">
              <div><dt>Students tested</dt><dd>${school.elaTested.toLocaleString()}</dd></div>
              <div><dt>Mean scale score</dt><dd>${metric(school.elaMeanScore)}</dd></div>
              <div><dt>Proficient</dt><dd>${metric(school.ela, '%')}</dd></div>
              <div><dt>Level 4</dt><dd>${metric(school.elaLevel4, '%')}</dd></div>
              <div><dt>NYC percentile</dt><dd>${metric(school.elaPctile)}</dd></div>
            </dl>
          </section>
          <section>
            <h3>Math results</h3>
            <dl class="detail-grid">
              <div><dt>Students tested</dt><dd>${school.mathTested.toLocaleString()}</dd></div>
              <div><dt>Mean scale score</dt><dd>${metric(school.mathMeanScore)}</dd></div>
              <div><dt>Proficient</dt><dd>${metric(school.math, '%')}</dd></div>
              <div><dt>Level 4</dt><dd>${metric(school.mathLevel4, '%')}</dd></div>
              <div><dt>NYC percentile</dt><dd>${metric(school.mathPctile)}</dd></div>
              <div><dt>Average proficient</dt><dd>${metric(school.average, '%')}</dd></div>
              <div><dt>Average NYC percentile</dt><dd>${metric(school.averagePctile)}</dd></div>
            </dl>
          </section>
              <section>
                <h3>ELA score distribution</h3>
                <table class="compact-table">
                  <thead><tr><th>Level</th><th>Students</th><th>Share</th></tr></thead>
                  <tbody>${testLevelRows(school.details.elaLevels)}</tbody>
                </table>
              </section>
              <section>
                <h3>Math score distribution</h3>
                <table class="compact-table">
                  <thead><tr><th>Level</th><th>Students</th><th>Share</th></tr></thead>
                  <tbody>${testLevelRows(school.details.mathLevels)}</tbody>
                </table>
              </section>
            </div>
            <div class="popup-panel panel-students">
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
          <details class="even-more">
            <summary>Even more</summary>
            <div class="even-more-content">
              <section>
                <h3>Enrollment by grade</h3>
                <div class="grade-counts">
                  ${school.details.gradeEnrollment
                    .map(
                      (grade) =>
                        `<span><b>${escapeHtml(grade.grade)}</b>${grade.count.toLocaleString()}</span>`,
                    )
                    .join('')}
                </div>
              </section>
              <section>
                <h3>Gender</h3>
                <table class="compact-table">
                  <thead><tr><th>Group</th><th>Students</th><th>Share</th></tr></thead>
                  <tbody>${compactRows(school.details.gender)}</tbody>
                </table>
              </section>
              <section>
                <h3>Race and ethnicity</h3>
                <table class="compact-table">
                  <thead><tr><th>Group</th><th>Students</th><th>Share</th></tr></thead>
                  <tbody>${compactRows(school.details.race)}</tbody>
                </table>
              </section>
              <section>
                <h3>Student groups</h3>
                <table class="compact-table">
                  <thead><tr><th>Group</th><th>Students</th><th>Share</th></tr></thead>
                  <tbody>${compactRows(school.details.programs)}</tbody>
                </table>
                <p class="compact-footnote">Economic need index: ${percent(school.eni)}</p>
              </section>
            </div>
          </details>
            </div>
          </div>
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
  const [gtFilter, setGtFilter] = useState<GiftedTalentedFilter>('All schools');
  const [only3K, setOnly3K] = useState(false);
  const [showDistricts, setShowDistricts] = useState(true);
  const [showZones, setShowZones] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [boundaryError, setBoundaryError] = useState(false);

  const filteredSchools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return schools.filter((school) => {
      const matchesBorough =
        borough === 'All boroughs' || school.borough === borough;
      const matchesQuery =
        !normalizedQuery ||
        school.name.toLowerCase().includes(normalizedQuery) ||
        school.dbn.toLowerCase().includes(normalizedQuery);
      const matchesGt =
        gtFilter === 'All schools' ||
        (gtFilter === 'Any G&T' && school.giftedTalented !== null) ||
        school.giftedTalented?.type === gtFilter;
      const matches3K =
        !only3K ||
        school.details.gradeEnrollment.some(
          ({ grade, count }) => grade === '3K' && count > 0,
        );
      return matchesBorough && matchesQuery && matchesGt && matches3K;
    });
  }, [borough, gtFilter, only3K, query, schools]);

  const activeFilterCount =
    Number(borough !== 'All boroughs') +
    Number(gtFilter !== 'All schools') +
    Number(only3K);

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
    return () => {
      cancelled = true;
    };
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
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    let cancelled = false;

    void import('leaflet').then((L) => {
      if (cancelled || !mapElementRef.current) return;
      leafletRef.current = L;
      const map = L.map(mapElementRef.current, {
        center: DEFAULT_MAP_CENTER,
        zoom: DEFAULT_MAP_ZOOM,
        zoomControl: false,
        preferCanvas: true,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      const cartoKey = process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY;
      const tileUrl = cartoKey
        ? `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`
        : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      const tileOptions: Leaflet.TileLayerOptions = {
        maxZoom: cartoKey ? 20 : 19,
        attribution: cartoKey
          ? '&copy; OpenStreetMap contributors &copy; CARTO'
          : '&copy; OpenStreetMap contributors',
      };
      if (cartoKey) tileOptions.subdomains = 'abcd';
      L.tileLayer(tileUrl, tileOptions).addTo(map);
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

    const schoolNames = new Map(
      schools.map((school) => [school.dbn, school.name]),
    );
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
      marker.bindPopup(popupFor(school), {
        minWidth: 300,
        maxWidth: 360,
        maxHeight: 520,
      });
      marker.addTo(layer);
      bounds.push([school.lat, school.lng]);
    });

    if ((query || borough !== 'All boroughs') && bounds.length > 0) {
      map.fitBounds(bounds, {
        padding: [36, 36],
        maxZoom: bounds.length === 1 ? 14 : 13,
      });
    } else if (!query && borough === 'All boroughs') {
      map.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
    }
  }, [borough, filteredSchools, mapReady, query]);

  return (
    <main className="map-shell">
      <aside className="control-panel">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true">
            <GraduationCap size={22} strokeWidth={2.2} />
          </span>
          <div>
            <p className="eyebrow">2025–26 school year</p>
            <h1>NYC elementary schools</h1>
          </div>
        </div>

        <p className="intro">
          Explore public schools that served tested grades in 2026. Select a dot
          for details.
        </p>

        <div className="filters">
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

          <details className="filter-section">
            <summary>
              <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}</span>
              <ChevronDown size={17} aria-hidden="true" />
            </summary>
            <div className="filter-grid">
              <div className="filter-control">
                <label htmlFor="borough-filter">Borough</label>
                <NativeSelect
                  id="borough-filter"
                  className="w-full"
                  value={borough}
                  onChange={(event) => setBorough(event.target.value)}
                >
                  {BOROUGHS.map((name) => (
                    <NativeSelectOption key={name} value={name}>
                      {name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <div className="filter-control">
                <label htmlFor="gt-filter">G&amp;T program</label>
                <NativeSelect
                  id="gt-filter"
                  className="w-full"
                  value={gtFilter}
                  onChange={(event) =>
                    setGtFilter(event.target.value as GiftedTalentedFilter)
                  }
                >
                  <NativeSelectOption value="All schools">
                    All schools
                  </NativeSelectOption>
                  <NativeSelectOption value="Any G&T">
                    Any G&amp;T program
                  </NativeSelectOption>
                  <NativeSelectOption value="District G&T">
                    District G&amp;T
                  </NativeSelectOption>
                  <NativeSelectOption value="Citywide G&T">
                    Citywide G&amp;T
                  </NativeSelectOption>
                </NativeSelect>
              </div>
              <label className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={only3K}
                  onChange={(event) => setOnly3K(event.target.checked)}
                />
                Offers 3K
              </label>
            </div>
          </details>
        </div>

        <div className="result-count" aria-live="polite">
          <MapPin size={17} aria-hidden="true" />
          <strong>{filteredSchools.length.toLocaleString()}</strong>
          <span>
            {filteredSchools.length === 1 ? 'school shown' : 'schools shown'}
          </span>
        </div>

        <fieldset className="layer-controls">
          <legend>Boundary layers</legend>
          <label htmlFor="district-layer-toggle">
            <span>
              <i className="line-key district-key" />
              School districts
            </span>
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
            <span>
              <i className="line-key zone-key" />
              Elementary zones
            </span>
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
          <p>
            Districts are administrative areas. Zones give local residents
            priority at a specific school; Districts 1, 7, and 23 are unzoned
            choice districts.
          </p>
          {boundaryError && (
            <p className="boundary-error">Boundary data could not be loaded.</p>
          )}
        </fieldset>

        <div className="legend" aria-label="Average proficiency color legend">
          <p>Average proficiency</p>
          <div>
            <span className="dot high" />
            75% or more
          </div>
          <div>
            <span className="dot upper" />
            55–74.9%
          </div>
          <div>
            <span className="dot middle" />
            35–54.9%
          </div>
          <div>
            <span className="dot lower" />
            Below 35%
          </div>
          <div>
            <span className="dot unavailable" />
            Suppressed
          </div>
        </div>

        <p className="source-note">
          Performance: NYCPS 2026 ELA &amp; Math results. Demographics: NYCPS
          2025–26 snapshot. Admissions: NYC SCA capacity report and 2025–26
          MySchools directory. G&amp;T programs: 2025–26 MySchools directory.
          Locations and boundaries: NYC Open Data. Elementary zones shown are
          2024–25 and should be confirmed by address with NYCPS.
        </p>
      </aside>

      <section className="map-stage" aria-label="Interactive school map">
        {loadError && (
          <div className="map-message">
            The school data could not be loaded.
          </div>
        )}
        {!loadError && schools.length === 0 && (
          <div className="map-message">Loading schools…</div>
        )}
        {schools.length > 0 && filteredSchools.length === 0 && (
          <div className="empty-message">No schools match those filters.</div>
        )}
        <div
          ref={mapElementRef}
          className="map-canvas"
          role="application"
          aria-label="Map of New York City public elementary schools"
        />
      </section>
    </main>
  );
}
