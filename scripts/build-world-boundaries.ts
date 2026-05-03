/**
 * Build world country boundary gazetteer from Natural Earth 1:110m Admin-0 shapefile.
 *
 * Natural Earth 110m data is pre-simplified — ogr2ogr only converts SHP→GeoJSON
 * (no reprojection needed, already WGS84).
 *
 * Prerequisites:
 *   - GDAL installed: `brew install gdal` (macOS) or `apt install gdal-bin` (Linux)
 *
 * Usage:
 *   npx tsx scripts/build-world-boundaries.ts
 *
 * Output:
 *   src/api/place-gazetteers/data/world-boundaries.json
 *
 * ──────────────────────────────────────────────────────────────────────
 * DATA SOURCE
 * ──────────────────────────────────────────────────────────────────────
 * Product: Natural Earth 1:110m Admin 0 – Countries
 * Publisher: Natural Earth (https://www.naturalearthdata.com/)
 * License: Public domain — no attribution required
 *
 * Contains ~177 sovereign states and territories at 1:110 million scale.
 * Suitable for world-level country identification and map display.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode, GazetteerGeometry } from '../src/api/place-gazetteers/types';
import { computeCentroid, round4 } from '../src/gazetteer-build/geo';

// ── Types ────────────────────────────────────────────────────────────

interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    NAME: string;
    ISO_A2: string;
    ISO_A3: string;
    CONTINENT?: string;
    [key: string]: unknown;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

// Continent code-name map matches the canonical continents that
// world-countries.json emits — so the structural merge collapses by name.
// Centroid coords match build-world.ts CONTINENT_COORDS.
const CONTINENT_COORDS: Record<string, { lat: number; lon: number }> = {
  Africa: { lat: 2, lon: 18 },
  Antarctica: { lat: -75, lon: 0 },
  Asia: { lat: 45, lon: 90 },
  Europe: { lat: 54, lon: 15 },
  'North America': { lat: 45, lon: -100 },
  Oceania: { lat: -25, lon: 135 },
  'South America': { lat: -15, lon: -60 },
};

interface GeoJSONCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
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
  };
  kind: 'boundary';
  root: GazetteerNode;
}

// ── Paths ────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const TMP_DIR = '/tmp/ne_110m';
const TMP_ZIP = '/tmp/ne_110m_countries.zip';
const TMP_GEOJSON = '/tmp/ne_110m_countries.geojson';
const SHP_FILE = path.join(TMP_DIR, 'ne_110m_admin_0_countries.shp');
const OUTPUT = path.join(ROOT, 'src', 'api', 'place-gazetteers', 'data', 'world-boundaries.json');

// ── Step 1: Download if needed ──────────────────────────────────────

if (!fs.existsSync(SHP_FILE)) {
  console.log('Downloading Natural Earth 110m Admin-0 Countries...');
  execFileSync('curl', [
    '-o', TMP_ZIP,
    'https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip',
  ], { stdio: 'inherit' });

  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  execFileSync('unzip', ['-o', TMP_ZIP, '-d', TMP_DIR], { stdio: 'inherit' });
}

// ── Step 2: Convert SHP to GeoJSON with ogr2ogr ─────────────────────

console.log('Converting shapefile to GeoJSON...');

try {
  if (fs.existsSync(TMP_GEOJSON)) fs.unlinkSync(TMP_GEOJSON);
  execFileSync('ogr2ogr', [
    '-f', 'GeoJSON',
    '-lco', 'COORDINATE_PRECISION=4',
    TMP_GEOJSON,
    SHP_FILE,
  ], { stdio: 'pipe' });
} catch (e: unknown) {
  const err = e as { stderr?: Buffer };
  console.error('ogr2ogr failed. Is GDAL installed?');
  console.error('  macOS: brew install gdal');
  console.error('  Linux: apt install gdal-bin');
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
}

// ── Step 3: Read and process GeoJSON ─────────────────────────────────

console.log('Reading GeoJSON...');
const geojson: GeoJSONCollection = JSON.parse(fs.readFileSync(TMP_GEOJSON, 'utf-8'));
console.log(`  ${geojson.features.length} features loaded`);

// ── Step 4: Build gazetteer nodes ────────────────────────────────────
// Group countries under their continent (Natural Earth provides CONTINENT in
// the feature properties). The merge engine collapses same-(name, type, parent)
// nodes, so country polygons here merge with world-countries.json's
// non-geometry country nodes — point gazetteer + boundary gazetteer agree on
// name+continent; boundary's `geometry` field is preserved by first-wins rule.

const continentBuckets = new Map<string, GazetteerNode[]>();
let unmappedContinent = 0;

for (const f of geojson.features) {
  const props = f.properties;
  const geometry: GazetteerGeometry = f.geometry.type === 'Polygon'
    ? { type: 'Polygon', coordinates: f.geometry.coordinates as number[][][] }
    : { type: 'MultiPolygon', coordinates: f.geometry.coordinates as number[][][][] };
  const [lat, lon] = computeCentroid(geometry);

  // Build aliases from ISO codes, filtering out -99 (no code assigned)
  const aliases: string[] = [];
  if (props.ISO_A2 && props.ISO_A2 !== '-99') aliases.push(props.ISO_A2);
  if (props.ISO_A3 && props.ISO_A3 !== '-99') aliases.push(props.ISO_A3);

  const node: GazetteerNode = {
    name: props.NAME,
    type: 'country',
    lat: round4(lat),
    lon: round4(lon),
    geometry,
  };
  if (aliases.length > 0) node.aliases = aliases;

  const continentName = props.CONTINENT;
  if (!continentName || !(continentName in CONTINENT_COORDS)) {
    unmappedContinent++;
    continue;
  }
  if (!continentBuckets.has(continentName)) continentBuckets.set(continentName, []);
  continentBuckets.get(continentName)!.push(node);
}

// Sort countries within each continent for deterministic output
const continentNodes: GazetteerNode[] = [];
for (const [continentName, countries] of [...continentBuckets.entries()].sort()) {
  countries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const coords = CONTINENT_COORDS[continentName];
  continentNodes.push({
    name: continentName,
    type: 'continent',
    lat: coords.lat,
    lon: coords.lon,
    children: countries,
  });
}

const totalCountries = continentNodes.reduce((sum, c) => sum + (c.children?.length ?? 0), 0);
console.log(`  ${totalCountries} countries across ${continentNodes.length} continents`);
if (unmappedContinent > 0) {
  console.warn(`  WARNING: ${unmappedContinent} features had no/unrecognized CONTINENT property`);
}

// ── Step 5: Build gazetteer ──────────────────────────────────────────

const gazetteer: Gazetteer = {
  id: 'world-boundaries',
  name: 'World Countries — Boundaries',
  locale: 'en',
  description: `Country boundaries from Natural Earth 1:110m. ${totalCountries} countries grouped under continents, with ISO A2/A3 aliases.`,
  source: {
    name: 'Natural Earth',
    url: 'https://www.naturalearthdata.com/',
    license: 'Public domain',
  },
  kind: 'boundary',
  root: {
    name: 'World',
    type: 'world',
    lat: 0,
    lon: 0,
    children: continentNodes,
  },
};

// ── Step 6: Write output ─────────────────────────────────────────────

const json = JSON.stringify(gazetteer);
fs.writeFileSync(OUTPUT, json, 'utf-8');

const sizeKB = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
console.log(`\nWrote ${OUTPUT}`);
console.log(`  ${sizeKB} KB (${totalCountries} countries across ${continentNodes.length} continents)`);

// Clean up temp file
if (fs.existsSync(TMP_GEOJSON)) fs.unlinkSync(TMP_GEOJSON);

console.log('\nDone.');
