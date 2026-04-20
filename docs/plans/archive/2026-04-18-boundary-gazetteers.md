# Boundary Gazetteers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 boundary gazetteers (polygon geometry for map overlays) matching the existing point gazetteers for Denmark, Norway, Finland, Iceland, USA, Canada, and the world.

**Architecture:** One build script per country. Flat hierarchy (`Country > [leaf boundaries]`). Use pre-simplified sources where available; ogr2ogr reproject+simplify only where needed. All boundary gazetteers use `kind: 'boundary'` and 4 decimal place coordinate precision (~11m).

**Tech Stack:** TypeScript build scripts (`npx tsx`), ogr2ogr (GDAL) for shapefile conversion, direct GeoJSON download/WFS for others. Existing Gazetteer JSON format with `geometry` fields.

**Spec:** `docs/plans/2026-04-18-boundary-gazetteers-design.md`

---

## File Structure

### Build Scripts

| File | Source | ogr2ogr? |
|------|--------|----------|
| `scripts/build-fi-boundaries.ts` | Statistics Finland WFS | No |
| `scripts/build-world-boundaries.ts` | Natural Earth 110m | Yes (SHP→GeoJSON) |
| `scripts/build-us-boundaries.ts` | Census Bureau 20m | Yes (SHP→GeoJSON) |
| `scripts/build-dk-boundaries.ts` | ok-dk/dagi GitHub | No |
| `scripts/build-is-boundaries.ts` | LMI WFS | No |
| `scripts/build-no-boundaries.ts` | Kartverket/Geonorge | Yes (reproject+simplify) |
| `scripts/build-ca-boundaries.ts` | Statistics Canada | Yes (reproject+simplify) |

### Data Files (new, in `src/api/place-gazetteers/data/`)

| File | Est. size |
|------|-----------|
| `fi-kunnat-boundaries.json` | ~200 KB |
| `world-boundaries.json` | ~200 KB |
| `us-counties-boundaries.json` | ~1 MB |
| `dk-sogne-boundaries.json` | ~2 MB |
| `is-sveitarfelog-boundaries.json` | ~1-2 MB |
| `no-kommuner-boundaries.json` | ~2-3 MB |
| `ca-divisions-boundaries.json` | ~2-3 MB |

### Modified Files

| File | Change |
|------|--------|
| `src/api/place-gazetteers/index.ts` | Import + register 7 new boundary gazetteers |
| `tests/unit/gazetteers.test.ts` | Update count to 23, add boundary-specific tests |

---

## Task 1: Finland Municipality Boundaries (WFS — simplest)

**Files:**
- Create: `scripts/build-fi-boundaries.ts`
- Create: `src/api/place-gazetteers/data/fi-kunnat-boundaries.json`

The simplest boundary gazetteer — a single HTTP GET returns pre-simplified GeoJSON at 1:4.5M scale in WGS84. No ogr2ogr needed. Establishes the shared patterns (roundCoords, computeCentroid, mergeMultiPolygon) used by all subsequent boundary scripts.

- [ ] **Step 1: Write the build script**

Create `scripts/build-fi-boundaries.ts`:

```typescript
/**
 * Build Finnish municipality boundary gazetteer from Statistics Finland WFS.
 *
 * Source: Statistics Finland (Tilastokeskus) open WFS
 * URL: https://geo.stat.fi/geoserver/tilastointialueet/wfs
 * License: CC BY 4.0
 *
 * Uses the 1:4.5M simplified layer (kunta4500k_2025) — ~270 KB, pre-simplified
 * by Statistics Finland. No ogr2ogr or local simplification needed.
 *
 * Usage:
 *   npx tsx scripts/build-fi-boundaries.ts
 *
 * Output:
 *   src/api/place-gazetteers/data/fi-kunnat-boundaries.json
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');

const WFS_URL = 'https://geo.stat.fi/geoserver/tilastointialueet/wfs'
  + '?service=WFS&version=2.0.0&request=GetFeature'
  + '&typeName=tilastointialueet:kunta4500k_2025'
  + '&outputFormat=application/json'
  + '&srsName=EPSG:4326';

// ── Shared boundary utilities ────────────────────────────────────────

interface GazetteerGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

interface GazetteerNode {
  name: string;
  type: string;
  lat: number;
  lon: number;
  geometry?: GazetteerGeometry;
  children?: GazetteerNode[];
}

/**
 * Round all coordinates in a GeoJSON geometry to `precision` decimal places.
 * This is the primary size optimization for boundary gazetteers.
 * 4 decimal places ≈ 11m accuracy — sufficient for admin boundaries.
 */
function roundCoords(geom: GazetteerGeometry, precision = 4): GazetteerGeometry {
  const factor = Math.pow(10, precision);
  const roundArr = (coords: number[]): number[] =>
    coords.map(c => Math.round(c * factor) / factor);

  if (geom.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: (geom.coordinates as number[][][]).map(ring => ring.map(roundArr)),
    };
  }
  return {
    type: 'MultiPolygon',
    coordinates: (geom.coordinates as number[][][][]).map(
      poly => poly.map(ring => ring.map(roundArr))
    ),
  };
}

/**
 * Compute centroid as mean of all exterior ring coordinates.
 * Simple and fast — exact centroid not needed for gazetteer node placement.
 */
function computeCentroid(geom: GazetteerGeometry): { lat: number; lon: number } {
  let sumLat = 0, sumLon = 0, count = 0;
  const polygons = geom.type === 'Polygon'
    ? [geom.coordinates as number[][][]]
    : geom.coordinates as number[][][][];

  for (const poly of polygons) {
    for (const [lon, lat] of poly[0]) { // exterior ring only
      sumLon += lon;
      sumLat += lat;
      count++;
    }
  }
  const factor = Math.pow(10, 4);
  return {
    lat: Math.round((sumLat / count) * factor) / factor,
    lon: Math.round((sumLon / count) * factor) / factor,
  };
}

/**
 * Merge multiple GeoJSON features into a single MultiPolygon geometry.
 * Handles islands and exclaves that are separate features with the same ID.
 */
function mergeGeometries(geometries: GazetteerGeometry[]): GazetteerGeometry {
  if (geometries.length === 1) return geometries[0];
  const allPolygons: number[][][][] = [];
  for (const g of geometries) {
    if (g.type === 'Polygon') {
      allPolygons.push(g.coordinates as number[][][]);
    } else {
      for (const poly of g.coordinates as number[][][][]) {
        allPolygons.push(poly);
      }
    }
  }
  return { type: 'MultiPolygon', coordinates: allPolygons };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching Finnish municipality boundaries from Statistics Finland WFS...');
  const response = await fetch(WFS_URL);
  if (!response.ok) throw new Error('WFS error: ' + response.status);
  const geojson = await response.json();

  const features = geojson.features as Array<{
    properties: { kunta: string; nimi: string; namn: string; name: string };
    geometry: GazetteerGeometry;
  }>;
  console.log('  Features: ' + features.length);

  // Group by municipality code (kunta) to merge multi-part features
  const byCode = new Map<string, { name: string; namn: string; geometries: GazetteerGeometry[] }>();
  for (const f of features) {
    const code = f.properties.kunta;
    if (!byCode.has(code)) {
      byCode.set(code, { name: f.properties.nimi, namn: f.properties.namn, geometries: [] });
    }
    byCode.get(code)!.geometries.push(f.geometry);
  }

  const nodes: GazetteerNode[] = [];
  for (const [, entry] of [...byCode.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'fi'))) {
    const merged = mergeGeometries(entry.geometries);
    const rounded = roundCoords(merged);
    const centroid = computeCentroid(rounded);
    const node: GazetteerNode = {
      name: entry.name,
      type: 'municipality',
      lat: centroid.lat,
      lon: centroid.lon,
      geometry: rounded,
    };
    // Add Swedish name as alias if different
    if (entry.namn && entry.namn !== entry.name) {
      (node as any).aliases = [entry.namn];
    }
    nodes.push(node);
  }

  const gazetteer = {
    id: 'fi-kunnat-boundaries',
    name: 'Finnish Municipalities — Boundaries',
    locale: 'fi',
    description: `Finnish municipality (kunta) boundaries. ${nodes.length} municipalities at 1:4.5M scale from Statistics Finland.`,
    source: {
      name: 'Statistics Finland',
      url: 'https://geo.stat.fi/geoserver/tilastointialueet/wfs',
      license: 'CC BY 4.0',
      fetched: new Date().toISOString().slice(0, 10),
    },
    kind: 'boundary' as const,
    root: {
      name: 'Suomi',
      type: 'country',
      aliases: ['Finland'],
      lat: 64.0,
      lon: 26.0,
      children: nodes,
    },
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const outPath = path.join(DATA_DIR, 'fi-kunnat-boundaries.json');
  const json = JSON.stringify(gazetteer);
  fs.writeFileSync(outPath, json + '\n');
  console.log('  Municipalities: ' + nodes.length);
  console.log('  Output: ' + (Buffer.byteLength(json) / 1024).toFixed(0) + ' KB → ' + outPath);
  console.log('\nDone!');
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
```

- [ ] **Step 2: Run the script**

```bash
npx tsx scripts/build-fi-boundaries.ts
```

Expected: `fi-kunnat-boundaries.json` created, ~200-300 KB.

- [ ] **Step 3: Verify and commit**

```bash
ls -la src/api/place-gazetteers/data/fi-kunnat-boundaries.json
git add scripts/build-fi-boundaries.ts src/api/place-gazetteers/data/fi-kunnat-boundaries.json
git commit -m "feat: add Finnish municipality boundary gazetteer (Statistics Finland WFS)"
```

---

## Task 2: World Country Boundaries (Natural Earth 110m)

**Files:**
- Create: `scripts/build-world-boundaries.ts`
- Create: `src/api/place-gazetteers/data/world-boundaries.json`

Pre-simplified at 1:110m scale (~210 KB shapefile). ogr2ogr converts SHP→GeoJSON format only — no reprojection needed (source is WGS84).

- [ ] **Step 1: Write the build script**

Create `scripts/build-world-boundaries.ts`:

The script:
1. Downloads Natural Earth 110m countries zip from `https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip`
2. Unzips to `/tmp/ne_110m/`
3. Runs `ogr2ogr -f GeoJSON -lco COORDINATE_PRECISION=4 output.geojson input.shp`
4. Reads the GeoJSON, extracts `NAME` and `ISO_A2`/`ISO_A3` for each feature
5. Builds flat gazetteer: `World > [country boundaries]`
6. Uses `roundCoords()` with precision 4, `computeCentroid()`, `mergeGeometries()` — same inline functions as Task 1

Key metadata:
- ID: `world-boundaries`
- Name: `World Countries — Boundaries`
- Locale: `en`
- Root: `World` (lat 0, lon 0)
- Node type: `country`
- Aliases: ISO_A2 and ISO_A3 codes
- Source: `{ name: "Natural Earth", url: "https://www.naturalearthdata.com/", license: "Public domain" }`
- `kind: 'boundary'`

Prerequisites:
```bash
curl -o /tmp/ne_110m_countries.zip https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip
unzip -o /tmp/ne_110m_countries.zip -d /tmp/ne_110m/
```

The script runs ogr2ogr internally (like `build-sv-boundaries.ts`):
```typescript
execFileSync('ogr2ogr', [
  '-f', 'GeoJSON',
  '-lco', 'COORDINATE_PRECISION=4',
  tmpGeoJson,
  path.join('/tmp/ne_110m', 'ne_110m_admin_0_countries.shp'),
]);
```

- [ ] **Step 2: Download prerequisites and run**

```bash
curl -o /tmp/ne_110m_countries.zip https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip
unzip -o /tmp/ne_110m_countries.zip -d /tmp/ne_110m/
npx tsx scripts/build-world-boundaries.ts
```

- [ ] **Step 3: Verify and commit**

```bash
ls -la src/api/place-gazetteers/data/world-boundaries.json
git add scripts/build-world-boundaries.ts src/api/place-gazetteers/data/world-boundaries.json
git commit -m "feat: add world country boundary gazetteer (Natural Earth 110m)"
```

---

## Task 3: US County Boundaries (Census Bureau 20m)

**Files:**
- Create: `scripts/build-us-boundaries.ts`
- Create: `src/api/place-gazetteers/data/us-counties-boundaries.json`

Pre-simplified at 20m resolution (~880 KB shapefile). ogr2ogr converts SHP→GeoJSON — no reprojection needed (NAD83 ≈ WGS84).

- [ ] **Step 1: Write the build script**

Create `scripts/build-us-boundaries.ts`:

The script:
1. Downloads Census Bureau 20m county shapefile from `https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_20m.zip`
2. Unzips to `/tmp/us_counties/`
3. Runs ogr2ogr SHP→GeoJSON with `COORDINATE_PRECISION=4`
4. Reads GeoJSON, extracts `NAME` (county), `STUSPS` (state abbrev), `STATEFP`/`COUNTYFP` (FIPS)
5. Builds flat gazetteer: `United States > [county boundaries]`
6. Node name: just the county name (e.g., "Chisago"). Do NOT append "County" — the resolver's `normalize()` strips it anyway.
7. Add state abbreviation as context in aliases (e.g., aliases: ["Chisago County, MN"])

Key metadata:
- ID: `us-counties-boundaries`
- Name: `US Counties — Boundaries`
- Locale: `en`
- Root: `United States` (lat 39.8, lon -98.6, aliases: ["USA", "US", "United States of America"])
- Node type: `county`
- Source: `{ name: "US Census Bureau", url: "https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html", license: "Public domain" }`

- [ ] **Step 2: Download and run**

```bash
curl -o /tmp/cb_2023_us_county_20m.zip https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_20m.zip
unzip -o /tmp/cb_2023_us_county_20m.zip -d /tmp/us_counties/
npx tsx scripts/build-us-boundaries.ts
```

- [ ] **Step 3: Verify and commit**

Expected: ~1 MB with ~3,200 county polygons.

```bash
ls -la src/api/place-gazetteers/data/us-counties-boundaries.json
git add scripts/build-us-boundaries.ts src/api/place-gazetteers/data/us-counties-boundaries.json
git commit -m "feat: add US county boundary gazetteer (Census Bureau 20m)"
```

---

## Task 4: Danish Parish Boundaries (ok-dk/dagi)

**Files:**
- Create: `scripts/build-dk-boundaries.ts`
- Create: `src/api/place-gazetteers/data/dk-sogne-boundaries.json`

Direct GeoJSON download from GitHub. Already WGS84. Needs coordinate precision reduction only (no ogr2ogr).

- [ ] **Step 1: Write the build script**

Create `scripts/build-dk-boundaries.ts`:

The script:
1. Downloads `https://raw.githubusercontent.com/ok-dk/dagi/master/geojson/sogne.geojson`
2. Parses GeoJSON, extracts `SOGNENAVN` for each feature
3. Groups by `SOGNEKODE` to merge multi-part features
4. Rounds coordinates to 4dp via `roundCoords()`
5. Builds flat gazetteer: `Danmark > [parish boundaries]`

Key metadata:
- ID: `dk-sogne-boundaries`
- Name: `Danish Parishes — Boundaries`
- Locale: `da`
- Root: `Danmark` (lat 56.0, lon 10.0, aliases: ["Denmark"])
- Node type: `parish`
- Source: `{ name: "GeoDanmark via ok-dk/dagi", url: "https://github.com/ok-dk/dagi", license: "Danish Open Government Data" }`

- [ ] **Step 2: Run the script**

```bash
npx tsx scripts/build-dk-boundaries.ts
```

Expected: ~2 MB with ~2,468 parish polygons.

- [ ] **Step 3: Verify and commit**

```bash
ls -la src/api/place-gazetteers/data/dk-sogne-boundaries.json
git add scripts/build-dk-boundaries.ts src/api/place-gazetteers/data/dk-sogne-boundaries.json
git commit -m "feat: add Danish parish boundary gazetteer (ok-dk/dagi)"
```

---

## Task 5: Icelandic Municipality Boundaries (LMI WFS)

**Files:**
- Create: `scripts/build-is-boundaries.ts`
- Create: `src/api/place-gazetteers/data/is-sveitarfelog-boundaries.json`

WFS GeoJSON, already WGS84. Coordinate precision reduction only.

- [ ] **Step 1: Write the build script**

Create `scripts/build-is-boundaries.ts`:

The script:
1. Fetches `https://gis.lmi.is/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=EBM:AdministrativeUnit_level2&outputFormat=application/json&srsName=EPSG:4326`
2. Parses GeoJSON, extracts `namn` for each feature
3. Groups by `shn` code to merge multi-part features
4. Rounds coordinates to 4dp
5. Builds flat gazetteer: `Ísland > [municipality boundaries]`

Key metadata:
- ID: `is-sveitarfelog-boundaries`
- Name: `Icelandic Municipalities — Boundaries`
- Locale: `is`
- Root: `Ísland` (lat 65.0, lon -18.5, aliases: ["Iceland"])
- Node type: `municipality`
- Source: `{ name: "LMI (Landmælingar Íslands)", url: "https://gis.lmi.is/geoserver/wfs", license: "LMI Open Data" }`

- [ ] **Step 2: Run the script**

```bash
npx tsx scripts/build-is-boundaries.ts
```

Expected: ~1-2 MB with ~128 municipality polygons.

- [ ] **Step 3: Verify and commit**

```bash
ls -la src/api/place-gazetteers/data/is-sveitarfelog-boundaries.json
git add scripts/build-is-boundaries.ts src/api/place-gazetteers/data/is-sveitarfelog-boundaries.json
git commit -m "feat: add Icelandic municipality boundary gazetteer (LMI WFS)"
```

---

## Task 6: Norwegian Municipality Boundaries (Kartverket)

**Files:**
- Create: `scripts/build-no-boundaries.ts`
- Create: `src/api/place-gazetteers/data/no-kommuner-boundaries.json`

Needs ogr2ogr for reprojection (EPSG:25833 → WGS84) and simplification. Follows `build-sv-boundaries.ts` pattern.

- [ ] **Step 1: Write the build script**

Create `scripts/build-no-boundaries.ts`:

The script:
1. Downloads `https://nedlasting.geonorge.no/geonorge/Basisdata/Kommuner/GeoJSON/Basisdata_0000_Norge_25833_Kommuner_GeoJSON.zip`
2. Unzips — contains a GeoJSON file in EPSG:25833
3. Runs ogr2ogr: reproject to WGS84, simplify 200m, coordinate precision 4dp
4. Reads output GeoJSON, extracts `kommunenavn` for each feature
5. Groups by `kommunenummer` to merge multi-part features (islands)
6. Builds flat gazetteer: `Norge > [municipality boundaries]`

ogr2ogr command:
```typescript
execFileSync('ogr2ogr', [
  '-f', 'GeoJSON',
  '-t_srs', 'EPSG:4326',
  '-simplify', '200',
  '-lco', 'COORDINATE_PRECISION=4',
  tmpOutput,
  inputGeoJson,
]);
```

Key metadata:
- ID: `no-kommuner-boundaries`
- Name: `Norwegian Municipalities — Boundaries`
- Locale: `no`
- Root: `Norge` (lat 65.0, lon 13.0, aliases: ["Norway"])
- Node type: `municipality`
- Source: `{ name: "Kartverket", url: "https://kartkatalog.geonorge.no/", license: "NLOD / CC BY 4.0" }`

**Note:** The downloaded GeoJSON file may have a UTF-8 BOM. Read with `utf-8` encoding — Node's `fs.readFileSync` handles BOM in JSON.parse, but ogr2ogr may need the file passed directly.

- [ ] **Step 2: Download and run**

```bash
curl -o /tmp/no_kommuner.zip 'https://nedlasting.geonorge.no/geonorge/Basisdata/Kommuner/GeoJSON/Basisdata_0000_Norge_25833_Kommuner_GeoJSON.zip'
unzip -o /tmp/no_kommuner.zip -d /tmp/no_kommuner/
npx tsx scripts/build-no-boundaries.ts
```

- [ ] **Step 3: Verify and commit**

Expected: ~2-3 MB with ~357 municipality polygons.

```bash
ls -la src/api/place-gazetteers/data/no-kommuner-boundaries.json
git add scripts/build-no-boundaries.ts src/api/place-gazetteers/data/no-kommuner-boundaries.json
git commit -m "feat: add Norwegian municipality boundary gazetteer (Kartverket)"
```

---

## Task 7: Canadian Census Division Boundaries (Statistics Canada)

**Files:**
- Create: `scripts/build-ca-boundaries.ts`
- Create: `src/api/place-gazetteers/data/ca-divisions-boundaries.json`

Needs ogr2ogr for reprojection (EPSG:3347 Lambert → WGS84) and simplification.

- [ ] **Step 1: Write the build script**

Create `scripts/build-ca-boundaries.ts`:

The script:
1. Downloads `https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcd_000a21a_e.zip`
2. Unzips to `/tmp/ca_divisions/`
3. Runs ogr2ogr: reproject EPSG:3347 → WGS84, simplify 500m, coordinate precision 4dp
4. Reads output GeoJSON, extracts `CDNAME` (division name), `CDTYPE` (type code)
5. Groups by `CDUID` to merge multi-part features
6. Builds flat gazetteer: `Canada > [division boundaries]`

ogr2ogr command:
```typescript
execFileSync('ogr2ogr', [
  '-f', 'GeoJSON',
  '-t_srs', 'EPSG:4326',
  '-simplify', '500',
  '-lco', 'COORDINATE_PRECISION=4',
  tmpOutput,
  path.join('/tmp/ca_divisions', 'lcd_000a21a_e.shp'),
]);
```

Key metadata:
- ID: `ca-divisions-boundaries`
- Name: `Canadian Census Divisions — Boundaries`
- Locale: `en`
- Root: `Canada` (lat 56.0, lon -96.0, aliases: ["CA"])
- Node type: `division`
- Source: `{ name: "Statistics Canada", url: "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm", license: "Statistics Canada Open Licence" }`

- [ ] **Step 2: Download and run**

```bash
curl -o /tmp/ca_divisions.zip 'https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcd_000a21a_e.zip'
unzip -o /tmp/ca_divisions.zip -d /tmp/ca_divisions/
npx tsx scripts/build-ca-boundaries.ts
```

- [ ] **Step 3: Verify and commit**

Expected: ~2-3 MB with ~293 census division polygons.

```bash
ls -la src/api/place-gazetteers/data/ca-divisions-boundaries.json
git add scripts/build-ca-boundaries.ts src/api/place-gazetteers/data/ca-divisions-boundaries.json
git commit -m "feat: add Canadian census division boundary gazetteer (Statistics Canada)"
```

---

## Task 8: Register All Boundary Gazetteers in Loader

**Files:**
- Modify: `src/api/place-gazetteers/index.ts`

- [ ] **Step 1: Add imports and register**

Add 7 imports after the existing boundary import:

```typescript
// Boundary gazetteers
import dkSogneBoundaries from './data/dk-sogne-boundaries.json';
import noKommunerBoundaries from './data/no-kommuner-boundaries.json';
import fiKunnatBoundaries from './data/fi-kunnat-boundaries.json';
import isSveitarfelogBoundaries from './data/is-sveitarfelog-boundaries.json';
import usCountiesBoundaries from './data/us-counties-boundaries.json';
import caDivisionsBoundaries from './data/ca-divisions-boundaries.json';
import worldBoundaries from './data/world-boundaries.json';
```

Add to `BUNDLED_GAZETTEERS` array:

```typescript
  // Boundary gazetteers
  dkSogneBoundaries as Gazetteer,
  noKommunerBoundaries as Gazetteer,
  fiKunnatBoundaries as Gazetteer,
  isSveitarfelogBoundaries as Gazetteer,
  usCountiesBoundaries as Gazetteer,
  caDivisionsBoundaries as Gazetteer,
  worldBoundaries as Gazetteer,
```

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/api/place-gazetteers/index.ts
git commit -m "feat: register all boundary gazetteers in bundled loader"
```

---

## Task 9: Unit Tests for Boundary Gazetteers

**Files:**
- Modify: `tests/unit/gazetteers.test.ts`

- [ ] **Step 1: Update existing tests and add boundary-specific tests**

Update the test file:

1. Change total count from 16 to 23
2. Add 7 new IDs to `expectedIds`:
   ```typescript
   'dk-sogne-boundaries', 'no-kommuner-boundaries', 'fi-kunnat-boundaries',
   'is-sveitarfelog-boundaries', 'us-counties-boundaries', 'ca-divisions-boundaries',
   'world-boundaries',
   ```
3. Add boundary-specific test group:
   ```typescript
   describe('boundary gazetteers', () => {
     const boundaryIds = [
       'sv-sockenstad-boundaries',
       'dk-sogne-boundaries', 'no-kommuner-boundaries', 'fi-kunnat-boundaries',
       'is-sveitarfelog-boundaries', 'us-counties-boundaries', 'ca-divisions-boundaries',
       'world-boundaries',
     ];

     for (const id of boundaryIds) {
       it(`${id} has kind=boundary and nodes with geometry`, () => {
         const gaz = gazetteers.find(g => g.id === id);
         expect(gaz).toBeDefined();
         expect((gaz as any).kind).toBe('boundary');
         const firstChild = gaz!.root.children![0];
         expect(firstChild.geometry).toBeDefined();
         expect(['Polygon', 'MultiPolygon']).toContain(firstChild.geometry!.type);
       });
     }
   });
   ```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/gazetteers.test.ts
git commit -m "test: add unit tests for boundary gazetteers"
```

---

## Task 10: Update Documentation

**Files:**
- Modify: `CLAUDE.md` — update gazetteer count and data file listing
- Modify: `.claude/skills/gazetteers/SKILL.md` — add boundary gazetteers to table and build scripts
- Modify: `docs/PLAN.md` — mark boundary gazetteer milestone

- [ ] **Step 1: Update all docs**

Update gazetteer count from 16 to 23. Add all 7 new boundary data files and build scripts. Update total data size estimate.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md .claude/skills/gazetteers/SKILL.md docs/PLAN.md
git commit -m "docs: update documentation for boundary gazetteers"
```

---

## Task 11: Final Verification and Version Bump

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

- [ ] **Step 3: Check total data size**

```bash
du -sh src/api/place-gazetteers/data/
ls -lhS src/api/place-gazetteers/data/*boundaries*.json
```

Expected: ~41-44 MB total data directory.

- [ ] **Step 4: Version bump and commit**

```bash
npm version minor --no-git-tag-version
git add -A
git commit -m "feat(vX.Y.0): add boundary gazetteers for Denmark, Norway, Finland, Iceland, USA, Canada, world"
```
