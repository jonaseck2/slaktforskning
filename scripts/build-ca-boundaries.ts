/**
 * Build Canadian census division boundary gazetteer from Statistics Canada.
 *
 * Downloads the 2021 Census Division boundary files (EPSG:3347 Lambert
 * conformal conic), reprojects to WGS84, simplifies, and outputs a
 * boundary gazetteer JSON.
 *
 * Prerequisites:
 *   - GDAL installed: `brew install gdal` (macOS) or `apt install gdal-bin` (Linux)
 *
 * Usage:
 *   npx tsx scripts/build-ca-boundaries.ts [--simplify <tolerance>]
 *
 * Options:
 *   --simplify <meters>  Simplify polygons (in source CRS meters). Default: 500
 *
 * Output:
 *   src/api/place-gazetteers/data/ca-divisions-boundaries.json
 *
 * ──────────────────────────────────────────────────────────────────────
 * DATA SOURCE
 * ──────────────────────────────────────────────────────────────────────
 * Product: Census Division Boundary File, 2021 Census
 * Publisher: Statistics Canada
 * URL: https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm
 * License: Statistics Canada Open Licence
 *
 * Contains ~293 census division boundaries for Canada.
 *
 * ──────────────────────────────────────────────────────────────────────
 * CONVERSION PIPELINE
 * ──────────────────────────────────────────────────────────────────────
 *
 * 1. Download zip from Statistics Canada (EPSG:3347 Lambert conformal conic)
 * 2. ogr2ogr reprojects EPSG:3347 → WGS84 (EPSG:4326) with simplification
 * 3. Script groups features by CDUID (multi-part census divisions)
 * 4. Output follows the app's Gazetteer JSON schema with kind: "boundary"
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
    CDUID: string;
    CDNAME: string;
    [key: string]: unknown;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

// Statistics Canada PRUID → province name. CDUID is "PRUIDXX" so the first
// two characters give us the parent province for each census division.
const PROVINCE_NAMES: Record<string, string> = {
  '10': 'Newfoundland and Labrador',
  '11': 'Prince Edward Island',
  '12': 'Nova Scotia',
  '13': 'New Brunswick',
  '24': 'Quebec',
  '35': 'Ontario',
  '46': 'Manitoba',
  '47': 'Saskatchewan',
  '48': 'Alberta',
  '59': 'British Columbia',
  '60': 'Yukon',
  '61': 'Northwest Territories',
  '62': 'Nunavut',
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

// ── CLI args ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const simplifyIdx = args.indexOf('--simplify');
const simplifyTolerance = simplifyIdx >= 0 ? parseInt(args[simplifyIdx + 1], 10) : 500;

if (simplifyIdx >= 0 && isNaN(simplifyTolerance)) {
  console.error('Error: --simplify requires a numeric tolerance in meters');
  process.exit(1);
}

// ── Paths ────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const TMP_DIR = '/tmp/ca_divisions';
const TMP_ZIP = '/tmp/ca_divisions.zip';
const TMP_GEOJSON = '/tmp/ca_divisions_wgs84.geojson';
const OUTPUT = path.join(ROOT, 'src', 'api', 'place-gazetteers', 'data', 'ca-divisions-boundaries.json');

const DOWNLOAD_URL = 'https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcd_000a21a_e.zip';

// ── Step 1: Download if needed ──────────────────────────────────────

if (!fs.existsSync(TMP_DIR) || fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.shp')).length === 0) {
  console.log('Downloading Canadian census division boundaries from Statistics Canada...');
  execFileSync('curl', ['-L', '-o', TMP_ZIP, DOWNLOAD_URL], { stdio: 'inherit' });

  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  execFileSync('unzip', ['-o', TMP_ZIP, '-d', TMP_DIR], { stdio: 'inherit' });
}

// Find the shapefile
const allFiles = fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.shp'));
const shpFile = allFiles.find(f => f.includes('lcd_')) || allFiles[0];

if (!shpFile) {
  console.error('Error: No .shp files found in extracted zip');
  console.error(`Contents of ${TMP_DIR}:`);
  console.error(fs.readdirSync(TMP_DIR).join('\n'));
  process.exit(1);
}

const INPUT_SHP = path.join(TMP_DIR, shpFile);
const inputSize = (fs.statSync(INPUT_SHP).size / 1024 / 1024).toFixed(1);
console.log(`Using source file: ${shpFile} (${inputSize} MB)`);

// ── Step 2: Reproject with ogr2ogr ──────────────────────────────────

console.log(`Reprojecting EPSG:3347 → WGS84, simplify=${simplifyTolerance}m...`);

try {
  if (fs.existsSync(TMP_GEOJSON)) fs.unlinkSync(TMP_GEOJSON);
  execFileSync('ogr2ogr', [
    '-f', 'GeoJSON',
    '-s_srs', 'EPSG:3347',
    '-t_srs', 'EPSG:4326',
    '-simplify', String(simplifyTolerance),
    '-lco', 'COORDINATE_PRECISION=4',
    TMP_GEOJSON,
    INPUT_SHP,
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

// Log sample properties to verify field names
if (geojson.features.length > 0) {
  console.log('  Sample properties:', JSON.stringify(Object.keys(geojson.features[0].properties)));
}

// Group features by CDUID (multi-part census divisions)
const byDivision = new Map<string, GeoJSONFeature[]>();
for (const f of geojson.features) {
  const code = f.properties.CDUID;
  if (!code) continue;
  if (!byDivision.has(code)) byDivision.set(code, []);
  byDivision.get(code)!.push(f);
}
console.log(`  ${byDivision.size} unique census divisions`);

// ── Step 4: Build gazetteer nodes ────────────────────────────────────

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

// Group census divisions by province (first 2 chars of CDUID = PRUID).
const byProvince = new Map<string, GazetteerNode[]>();

for (const [code, features] of byDivision) {
  const props = features[0].properties;
  const geometry = mergeGeometries(features);
  const [lat, lon] = computeCentroid(geometry);

  const pruid = code.slice(0, 2);
  const provinceName = PROVINCE_NAMES[pruid] || '__direct__';

  if (!byProvince.has(provinceName)) byProvince.set(provinceName, []);
  byProvince.get(provinceName)!.push({
    name: props.CDNAME,
    type: 'admin2',
    lat: round4(lat),
    lon: round4(lon),
    geometry,
  });
}

const nodes: GazetteerNode[] = [];
for (const [provinceName, divisions] of [...byProvince.entries()].sort()) {
  if (provinceName === '__direct__') continue;
  divisions.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const lat = round4(divisions.reduce((s, d) => s + d.lat, 0) / divisions.length);
  const lon = round4(divisions.reduce((s, d) => s + d.lon, 0) / divisions.length);
  nodes.push({
    name: provinceName,
    type: 'admin1',
    lat,
    lon,
    children: divisions,
  });
}
const direct = byProvince.get('__direct__') ?? [];
if (direct.length > 0) {
  console.warn(`  ${direct.length} division polygon(s) without province match — appending under Canada directly`);
  nodes.push(...direct);
}
console.log(`  ${nodes.length} top-level nodes (provinces + direct divisions)`);

// ── Step 5: Build gazetteer ──────────────────────────────────────────

const gazetteer: Gazetteer = {
  id: 'ca-divisions-boundaries',
  name: 'Canadian Census Divisions — Boundaries',
  locale: 'en',
  description: `Census division boundaries from Statistics Canada (2021 Census). ${nodes.length} divisions. Simplified with ${simplifyTolerance}m tolerance.`,
  source: {
    name: 'Statistics Canada',
    url: 'https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm',
    license: 'Statistics Canada Open Licence',
  },
  kind: 'boundary',
  root: {
    name: 'World',
    type: 'world',
    lat: 0,
    lon: 0,
    children: [{
      name: 'North America',
      type: 'continent',
      lat: 45,
      lon: -100,
      children: [{
        name: 'Canada',
        type: 'country',
        aliases: ['CA'],
        lat: 56.0,
        lon: -96.0,
        children: nodes,
      }],
    }],
  },
};

// ── Step 6: Write output ─────────────────────────────────────────────

const json = JSON.stringify(gazetteer);
fs.writeFileSync(OUTPUT, json, 'utf-8');

const sizeMB = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
console.log(`\nWrote ${OUTPUT}`);
console.log(`  ${sizeMB} MB (${nodes.length} census divisions)`);

// Clean up temp file
if (fs.existsSync(TMP_GEOJSON)) fs.unlinkSync(TMP_GEOJSON);

console.log('\nDone.');
