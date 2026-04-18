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

// ── Types ────────────────────────────────────────────────────────────

interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    NAME: string;
    ISO_A2: string;
    ISO_A3: string;
    [key: string]: unknown;
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
  aliases?: string[];
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

const nodes: GazetteerNode[] = [];

for (const f of geojson.features) {
  const props = f.properties;
  const geometry: GazetteerGeometry = {
    type: f.geometry.type,
    coordinates: f.geometry.coordinates,
  };
  const [lat, lon] = computeCentroid(geometry);

  // Build aliases from ISO codes, filtering out -99 (no code assigned)
  const aliases: string[] = [];
  if (props.ISO_A2 && props.ISO_A2 !== '-99') aliases.push(props.ISO_A2);
  if (props.ISO_A3 && props.ISO_A3 !== '-99') aliases.push(props.ISO_A3);

  const node: GazetteerNode = {
    name: props.NAME,
    type: 'country',
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
    geometry,
  };
  if (aliases.length > 0) node.aliases = aliases;

  nodes.push(node);
}

// Sort by name for deterministic output
nodes.sort((a, b) => a.name.localeCompare(b.name, 'en'));

console.log(`  ${nodes.length} countries`);

// ── Step 5: Build gazetteer ──────────────────────────────────────────

const gazetteer: Gazetteer = {
  id: 'world-boundaries',
  name: 'World Countries — Boundaries',
  locale: 'en',
  description: `Country boundaries from Natural Earth 1:110m. ${nodes.length} countries with ISO A2/A3 aliases.`,
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
    children: nodes,
  },
};

// ── Step 6: Write output ─────────────────────────────────────────────

const json = JSON.stringify(gazetteer);
fs.writeFileSync(OUTPUT, json, 'utf-8');

const sizeKB = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
console.log(`\nWrote ${OUTPUT}`);
console.log(`  ${sizeKB} KB (${nodes.length} countries)`);

// Clean up temp file
if (fs.existsSync(TMP_GEOJSON)) fs.unlinkSync(TMP_GEOJSON);

console.log('\nDone.');
