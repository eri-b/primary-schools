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

Open [http://localhost:3000](http://localhost:3000) in a browser. Stop the server with `Ctrl+C`.

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

- School statistics are stored in `public/schools.json`.
- The original comparison dataset is kept in `data/NYC_Public_Elementary_School_Comparison_2025-26.csv`.
- The basemap uses OpenStreetMap tiles, so an internet connection is needed to display the map background.
- School locations come from NYC Open Data. Performance and demographic statistics come from NYC Public Schools.
