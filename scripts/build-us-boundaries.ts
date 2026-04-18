/**
 * Build US county boundary gazetteer from Census Bureau TIGER/Line 20m shapefile.
 *
 * The 20m cartographic boundary file is pre-simplified — ogr2ogr only converts
 * SHP→GeoJSON (no reprojection needed, NAD83 ≈ WGS84).
 *
 * Prerequisites:
 *   - GDAL installed: `brew install gdal` (macOS) or `apt install gdal-bin` (Linux)
 *
 * Usage:
 *   npx tsx scripts/build-us-boundaries.ts
 *
 * Output:
 *   src/api/place-gazetteers/data/us-counties-boundaries.json
 *
 * ──────────────────────────────────────────────────────────────────────
 * DATA SOURCE
 * ──────────────────────────────────────────────────────────────────────
 * Product: Cartographic Boundary Files — Counties (cb_2023_us_county_20m)
 * Publisher: US Census Bureau
 * URL: https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html
 * License: Public domain — no attribution required
 *
 * Contains ~3,200+ county and county-equivalent boundaries at 1:20,000,000 scale.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────

interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    NAME: string;
    STUSPS: string;
    STATEFP: string;
    COUNTYFP: string;
    GEOID: string;
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
const TMP_DIR = '/tmp/cb_us_county_20m';
const TMP_ZIP = '/tmp/cb_2023_us_county_20m.zip';
const TMP_GEOJSON = '/tmp/cb_2023_us_county_20m.geojson';
const SHP_FILE = path.join(TMP_DIR, 'cb_2023_us_county_20m.shp');
const OUTPUT = path.join(ROOT, 'src', 'api', 'place-gazetteers', 'data', 'us-counties-boundaries.json');

// ── Step 1: Download if needed ──────────────────────────────────────

if (!fs.existsSync(SHP_FILE)) {
  console.log('Downloading Census Bureau 20m county boundaries...');
  execFileSync('curl', [
    '-L',
    '-o', TMP_ZIP,
    'https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_20m.zip',
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

  nodes.push({
    name: props.NAME,
    type: 'county',
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
    geometry,
  });
}

// Sort by name for deterministic output
nodes.sort((a, b) => a.name.localeCompare(b.name, 'en'));

console.log(`  ${nodes.length} counties`);

// ── Step 5: Build gazetteer ──────────────────────────────────────────

const gazetteer: Gazetteer = {
  id: 'us-counties-boundaries',
  name: 'US Counties — Boundaries',
  locale: 'en',
  description: `County boundaries from US Census Bureau TIGER/Line 20m cartographic boundary file. ${nodes.length} counties and county equivalents.`,
  source: {
    name: 'US Census Bureau',
    url: 'https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html',
    license: 'Public domain',
  },
  kind: 'boundary',
  root: {
    name: 'United States',
    type: 'country',
    lat: 39.8,
    lon: -98.6,
    aliases: ['USA', 'US', 'United States of America'],
    children: nodes,
  },
};

// ── Step 6: Write output ─────────────────────────────────────────────

const json = JSON.stringify(gazetteer);
fs.writeFileSync(OUTPUT, json, 'utf-8');

const sizeMB = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
console.log(`\nWrote ${OUTPUT}`);
console.log(`  ${sizeMB} MB (${nodes.length} counties)`);

// Clean up temp file
if (fs.existsSync(TMP_GEOJSON)) fs.unlinkSync(TMP_GEOJSON);

console.log('\nDone.');
