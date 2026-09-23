# NYC Elementary School Map

An interactive Leaflet map of New York City public elementary schools. It includes school search, borough filtering, performance colors, and clickable school statistics.

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

Open [http://localhost:3000/elementary](http://localhost:3000/elementary) in a browser. Visiting `/` redirects there. Stop the server with `Ctrl+C`.

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

- The app reads its optimized school statistics from `public/schools.json`.
- `scripts/build_schools_json.py` rebuilds that file from the original NYC Public Schools demographic and 2026 ELA/Math workbooks, the NYC Open Data school-point service, the NYC School Construction Authority capacity report, and the 2025–26 MySchools kindergarten and G&T directories. It no longer depends on a manually distilled comparison CSV.
- The source workbooks contain much more than the UI currently shows: 2018–2026 grade-level results and breakdowns by disability, race/ethnicity, gender, economic status, and English-learner status, plus five years of enrollment and demographic counts.
- NYCPS marks privacy-protected aggregate results with `s`. Those schools remain on the map with a gray marker and “Suppressed” in place of the protected values.
- The basemap uses OpenStreetMap tiles, so an internet connection is needed to display the map background.
- School locations come from NYC Open Data. Performance and demographic statistics come from NYC Public Schools. G&T program type and program codes come from MySchools.
- The Admissions tab shows schoolwide estimated capacity and utilization from the latest available city report, plus prior-year general education kindergarten seats, applicants, and offer priority descriptions from MySchools. These historical figures do not indicate live seat availability. Schools absent from a source show an unavailable message.

Refresh the checked-in JSON from the official sources:

```bash
python3 scripts/build_schools_json.py
```

For an offline/reproducible refresh, pass a directory containing `demographics.xlsx`, `ela.xlsx`, `math.xlsx`, the ArcGIS query response as `locations.json`, the combined MySchools G&T and kindergarten API results as `gifted_talented.json` and `kindergarten.json`, and the latest SCA city capacity API results as `capacity.json`:

```bash
python3 scripts/build_schools_json.py --source-dir /path/to/source-files
```
