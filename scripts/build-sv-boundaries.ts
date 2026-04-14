/**
 * Build Swedish boundary gazetteer from Lantmäteriet "Socken och stad" GeoPackage.
 *
 * Converts the GeoPackage (EPSG:3006 SWEREF99 TM) to a boundary gazetteer JSON
 * file with WGS84 (EPSG:4326) coordinates, suitable for import into the app.
 *
 * Prerequisites:
 *   - GDAL installed: `brew install gdal` (macOS) or `apt install gdal-bin` (Linux)
 *   - Source file: `export-import/sockenstad.gpkg` from Lantmäteriet
 *     Download: https://www.lantmateriet.se/sv/geodata/vara-produkter/produktlista/socken-och-stad/
 *
 * Usage:
 *   npx tsx scripts/build-sv-boundaries.ts [--simplify <tolerance>]
 *
 * Options:
 *   --simplify <meters>  Simplify polygons (in source CRS meters). Default: 100
 *                         Lower = more detail, larger file. Higher = coarser, smaller.
 *                         Recommended: 50 (detailed), 100 (balanced), 200 (compact)
 *
 * Output:
 *   export-import/sv-sockenstad-boundaries.gazetteer.json
 *
 * ──────────────────────────────────────────────────────────────────────
 * DATA SOURCE
 * ──────────────────────────────────────────────────────────────────────
 * Product: "Socken och stad Nedladdning, vektor"
 * Publisher: Lantmäteriet (Swedish National Land Survey)
 * URL: https://www.lantmateriet.se/sv/geodata/vara-produkter/produktlista/socken-och-stad/
 * License: CC0 1.0 (public domain) — no attribution required
 *
 * Contains ~2,350 historical parishes (socknar) and ~130 cities (städer)
 * based on land registry parishes from the 1976–1995 property register
 * transition, plus city areas with privileges during the 1971 municipal reform.
 * This is a static division ("tills annat beslutas").
 *
 * The boundaries are authoritative for the Swedish property register's
 * historical parish system — the same parishes used in Swedish genealogy
 * records (tax, census, land records).
 *
 * ──────────────────────────────────────────────────────────────────────
 * CONVERSION PIPELINE
 * ──────────────────────────────────────────────────────────────────────
 *
 * 1. ogr2ogr reprojects SWEREF99 TM (EPSG:3006) → WGS84 (EPSG:4326)
 *    and optionally simplifies geometry (Douglas-Peucker in source CRS)
 * 2. Script reads the GeoJSON, groups features by sockenstadkod
 * 3. Multi-part features (islands, exclaves) are merged into MultiPolygon
 * 4. Output follows the app's Gazetteer JSON schema with kind: "boundary"
 *
 * Coordinate precision is 5 decimal places (~1.1m at Swedish latitudes),
 * which is more than sufficient for parish boundaries.
 *
 * ──────────────────────────────────────────────────────────────────────
 * SIZE ESTIMATES (2,486 main-area features)
 * ──────────────────────────────────────────────────────────────────────
 *
 *   simplify=50:   ~5.4 MB raw, ~1.5 MB gzipped
 *   simplify=100:  ~3.8 MB raw, ~1.1 MB gzipped  (default)
 *   simplify=200:  ~2.7 MB raw, ~0.8 MB gzipped
 *   simplify=500:  ~1.7 MB raw, ~0.5 MB gzipped
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────

interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    sockenstadkod: string;
    sockenstadnamn: string;
    sockenstadtyp: number;    // 1 = socken, 2 = stad
    omradesnummer: number;
    huvudomrade: string;      // J = main, N = secondary
    sockenstadanmarkning: string | null;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

interface GeoJSONCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

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

interface Gazetteer {
  id: string;
  name: string;
  locale: string;
  description: string;
  source: {
    name: string;
    url: string;
    license: string;
    created: string;
    fetched: string;
  };
  kind: 'boundary';
  root: GazetteerNode;
}

// ── CLI args ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const simplifyIdx = args.indexOf('--simplify');
const simplifyTolerance = simplifyIdx >= 0 ? parseInt(args[simplifyIdx + 1], 10) : 100;

if (simplifyIdx >= 0 && isNaN(simplifyTolerance)) {
  console.error('Error: --simplify requires a numeric tolerance in meters');
  process.exit(1);
}

// ── Paths ────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const INPUT_GPKG = path.join(ROOT, 'export-import', 'sockenstad.gpkg');
const TMP_GEOJSON = path.join(ROOT, 'export-import', 'sockenstad_wgs84.geojson');
const OUTPUT = path.join(ROOT, 'export-import', 'sv-sockenstad-boundaries.gazetteer.json');

// ── Step 1: Convert GeoPackage to GeoJSON with ogr2ogr ──────────────

if (!fs.existsSync(INPUT_GPKG)) {
  console.error(`Error: Source file not found: ${INPUT_GPKG}`);
  console.error('Download from: https://www.lantmateriet.se/sv/geodata/vara-produkter/produktlista/socken-och-stad/');
  process.exit(1);
}

console.log(`Converting ${path.basename(INPUT_GPKG)} to GeoJSON (WGS84, simplify=${simplifyTolerance}m)...`);

try {
  // Remove existing temp file
  if (fs.existsSync(TMP_GEOJSON)) fs.unlinkSync(TMP_GEOJSON);
  execFileSync('ogr2ogr', [
    '-f', 'GeoJSON',
    '-t_srs', 'EPSG:4326',
    '-simplify', String(simplifyTolerance),
    '-lco', 'COORDINATE_PRECISION=5',
    TMP_GEOJSON,
    INPUT_GPKG,
  ], { stdio: 'pipe' });
} catch (e: unknown) {
  const err = e as { stderr?: Buffer };
  console.error('ogr2ogr failed. Is GDAL installed?');
  console.error('  macOS: brew install gdal');
  console.error('  Linux: apt install gdal-bin');
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
}

// ── Step 2: Read and process GeoJSON ─────────────────────────────────

console.log('Reading GeoJSON...');
const geojson: GeoJSONCollection = JSON.parse(fs.readFileSync(TMP_GEOJSON, 'utf-8'));
console.log(`  ${geojson.features.length} features loaded`);

// Group features by sockenstadkod (multi-part parishes have multiple features)
const byCode = new Map<string, GeoJSONFeature[]>();
for (const f of geojson.features) {
  const code = f.properties.sockenstadkod;
  if (!byCode.has(code)) byCode.set(code, []);
  byCode.get(code)!.push(f);
}
console.log(`  ${byCode.size} unique parishes/cities`);

// ── Step 3: Build gazetteer nodes ────────────────────────────────────

function computeCentroid(geometry: GazetteerGeometry): [number, number] {
  let sumLat = 0, sumLon = 0, count = 0;
  const coords = geometry.type === 'Polygon'
    ? [geometry.coordinates as number[][][]]
    : geometry.coordinates as number[][][][];

  for (const polygon of coords) {
    const ring = polygon[0]; // exterior ring only
    for (const [lon, lat] of ring) {
      sumLon += lon;
      sumLat += lat;
      count++;
    }
  }
  return [sumLat / count, sumLon / count];
}

function mergeGeometries(features: GeoJSONFeature[]): GazetteerGeometry {
  if (features.length === 1) {
    const g = features[0].geometry;
    return { type: g.type, coordinates: g.coordinates } as GazetteerGeometry;
  }

  // Merge all parts into a single MultiPolygon
  const allPolygons: number[][][][] = [];
  for (const f of features) {
    if (f.geometry.type === 'Polygon') {
      allPolygons.push(f.geometry.coordinates as number[][][]);
    } else {
      for (const poly of f.geometry.coordinates as number[][][][]) {
        allPolygons.push(poly);
      }
    }
  }
  return { type: 'MultiPolygon', coordinates: allPolygons };
}

const nodes: GazetteerNode[] = [];
let sockenCount = 0;
let stadCount = 0;

for (const [_code, features] of byCode) {
  const props = features[0].properties;
  const geometry = mergeGeometries(features);
  const [lat, lon] = computeCentroid(geometry);
  const isSocken = props.sockenstadtyp === 1;

  nodes.push({
    name: props.sockenstadnamn,
    type: isSocken ? 'parish' : 'city',
    lat: Math.round(lat * 100000) / 100000,
    lon: Math.round(lon * 100000) / 100000,
    geometry,
  });

  if (isSocken) sockenCount++;
  else stadCount++;
}

// Sort by name for deterministic output
nodes.sort((a, b) => a.name.localeCompare(b.name, 'sv'));

console.log(`  ${sockenCount} socknar, ${stadCount} städer`);

// ── Step 4: Build gazetteer ──────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);

const gazetteer: Gazetteer = {
  id: 'sv-sockenstad-boundaries',
  name: 'Swedish Parishes & Cities — Boundaries',
  locale: 'sv',
  description: [
    'Parish (socken) and city boundaries from Lantmäteriet.',
    `Based on the property register parishes from 1976–1995. ${sockenCount} parishes, ${stadCount} cities.`,
    `Simplified with ${simplifyTolerance}m tolerance.`,
  ].join(' '),
  source: {
    name: 'Lantmäteriet',
    url: 'https://www.lantmateriet.se/sv/geodata/vara-produkter/produktlista/socken-och-stad/',
    license: 'CC0 1.0',
    created: '2021-10-13',
    fetched: today,
  },
  kind: 'boundary',
  root: {
    name: 'Sverige',
    type: 'country',
    lat: 62.0,
    lon: 15.0,
    children: nodes,
  },
};

// ── Step 5: Write output ─────────────────────────────────────────────

const json = JSON.stringify(gazetteer);
fs.writeFileSync(OUTPUT, json, 'utf-8');

const sizeMB = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
console.log(`\nWrote ${OUTPUT}`);
console.log(`  ${sizeMB} MB (${nodes.length} features)`);

// Clean up temp file
fs.unlinkSync(TMP_GEOJSON);

console.log('\nTo import into the app:');
console.log('  1. Open the app → Gazetteers view');
console.log('  2. Import the .gazetteer.json file');
console.log('  3. Or use MCP: import_gazetteer with the JSON content');
