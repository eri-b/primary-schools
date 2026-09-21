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
- The basemap uses OpenStreetMap tiles, so an internet connection is needed to display the map background.
- School locations come from NYC Open Data. Performance and demographic statistics come from NYC Public Schools.
