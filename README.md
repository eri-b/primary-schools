# Elementary School Maps

Interactive Leaflet maps of public elementary schools in New York City, Westchester, Long Island, Dutchess, Putnam, Ulster, and nearby New Jersey and Connecticut. They include school search, district boundaries, and clickable school details. New York maps also show assessment scores where available.

## Run locally

Requirements:

- Node.js 22.13 or newer
- npm

From this directory, install the dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open [NYC](http://localhost:3000/elementary/nyc), [Westchester](http://localhost:3000/elementary/westchester), [Long Island](http://localhost:3000/elementary/long-island), [Hudson Valley](http://localhost:3000/elementary/hudson-valley), [New Jersey](http://localhost:3000/elementary/new-jersey), or [Connecticut](http://localhost:3000/elementary/connecticut) in a browser. Visiting `/` or the former `/elementary` route redirects to `/elementary/nyc`; the former combined `/elementary/neighbors` route redirects to New Jersey. Stop the server with `Ctrl+C`.

### Optional CARTO basemap

The map uses OpenStreetMap by default. To enable the quieter CARTO light basemap, request a free key from [CARTO Basemaps](https://carto.com/basemaps/apikey/) and create a local `.env.local` file:

```bash
NEXT_PUBLIC_CARTO_BASEMAP_KEY=your_key_here
```

Restart the development server after adding the key. `.env.local` is ignored by Git; restrict the key to your site or local origin in the CARTO dashboard when appropriate.

## Production build

Build the site:

```bash
npm run build
```

Run the completed build locally:

```bash
npm run start
```

## Data and maps

- The NYC map reads its optimized school statistics from `public/schools.json`.
- `scripts/build_schools_json.py` rebuilds that file from the original NYC Public Schools demographic and 2026 ELA/Math workbooks, the NYC Open Data school-point service, the NYC School Construction Authority capacity report, and the 2025–26 MySchools 3-K, pre-K, kindergarten, and G&T directories. It no longer depends on a manually distilled comparison CSV.
- The source workbooks contain much more than the UI currently shows: 2018–2026 grade-level results and breakdowns by disability, race/ethnicity, gender, economic status, and English-learner status, plus five years of enrollment and demographic counts.
- NYCPS marks privacy-protected aggregate results with `s`. Those schools remain on the map with a gray marker and “Suppressed” in place of the protected values.
- The basemap uses OpenStreetMap tiles, so an internet connection is needed to display the map background.
- School locations come from NYC Open Data. Performance and demographic statistics come from NYC Public Schools. G&T program type and program codes come from MySchools.
- The Admissions tab shows schoolwide estimated capacity and utilization from the latest available city report, plus selectable prior-year 3-K, pre-K, and kindergarten seats, applicants, and offer priority descriptions from MySchools. These historical figures do not indicate live seat availability. Schools absent from a source show an unavailable message.

### Westchester data

- `public/westchester-schools.json` combines 2024–25 NCES school locations, enrollment, grade spans, and demographics with [NYSED 2024–25 school report cards](https://data.nysed.gov/downloads.php). Each subject's proficiency combines published grade 3–5 counts; the marker score averages ELA and math proficiency. Missing or suppressed results stay unavailable.
- `public/westchester-districts.geojson` contains [Westchester County GIS school district polygons](https://q-giswww.westchestergov.com/arcgis/rest/services/MappingWestchesterCounty/MapServer/87). These generalized boundaries are for exploration; confirm district assignment for an address with the district.
- `public/westchester-zones-2015.geojson` contains the Westchester school polygons available from the [NCES 2015–16 School Attendance Boundary Survey](https://nces.ed.gov/programs/edge/SABS). This is an incomplete, historical layer that is off by default. A verified current countywide elementary attendance-zone dataset is not published by the county. Confirm current assignments with each district.
- Refresh all three Westchester files with `python3 scripts/build_westchester_json.py`. The builder fetches NYSED report cards, the [NCES 2024–25 school data](https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_ADMINDATA_PUBLICSCH_2425/MapServer/1), the NCES boundary survey, and county GIS data.

### Long Island, Hudson Valley, New Jersey, and Connecticut data

- `public/long-island-schools.json` includes Nassau and Suffolk public elementary schools from NCES 2024–25, with grades 3–5 ELA and math proficiency matched to published NYSED 2024–25 report cards where possible. Missing or suppressed scores remain unavailable.
- `public/hudson-valley-schools.json` includes Dutchess, Putnam, and Ulster public elementary schools using the same NCES and NYSED sources and score matching. Its district boundaries are generalized NCES 2024–25 polygons.
- `public/new-jersey-schools.json` includes Bergen, Hudson, Essex, Union, Passaic, and Middlesex counties. `public/connecticut-schools.json` includes the Western Connecticut and Greater Bridgeport planning regions. Connecticut's planning regions replaced counties in the federal 2024–25 data; together those two regions cover the southwest Connecticut area near former Fairfield County.
- Each map includes generalized 2024–25 NCES district boundaries. The New Jersey map combines published 2024–25 NJSLA grades 3–5 Levels 4 and 5 into a proficiency rate where the data are available (650 of 797 schools). The Connecticut map shows the 2024–25 CSDE ELA and math performance index where available (145 of 157 schools). Connecticut's index is a 0–100 measure across a school's tested grades, **not** a proficiency percentage; the maps label it separately.
- Refresh with `python3 scripts/build_metro_json.py`. Pass `long-island`, `hudson-valley`, `new-jersey`, or `connecticut` to refresh just one region. Sources: [NCES schools](https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_ADMINDATA_PUBLICSCH_2425/MapServer/1), [NCES district boundaries](https://nces.ed.gov/opengis/rest/services/School_District_Boundaries/EDGE_ADMINDATA_SCHOOLDISTRICTS_SY2425/MapServer/1), [NYSED report cards](https://data.nysed.gov/downloads.php), [NJDOE NJSLA results](https://www.nj.gov/education/assessment/results/reports/2425/index.shtml), and [CSDE accountability data](https://data.ct.gov/Education/Next-Generation-Accountability-System/h28j-iix5).

Refresh the checked-in JSON from the official sources:

```bash
python3 scripts/build_schools_json.py
```

For an offline/reproducible refresh, pass a directory containing `demographics.xlsx`, `ela.xlsx`, `math.xlsx`, the ArcGIS query response as `locations.json`, the combined MySchools G&T, 3-K, pre-K, and kindergarten API results as `gifted_talented.json`, `three_k.json`, `pre_k.json`, and `kindergarten.json`, and the latest SCA city capacity API results as `capacity.json`:

```bash
python3 scripts/build_schools_json.py --source-dir /path/to/source-files
```
