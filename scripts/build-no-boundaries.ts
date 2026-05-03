/**
 * Build Norwegian municipality boundary gazetteer from Kartverket/Geonorge.
 *
 * Downloads the official Norwegian municipality boundaries (EPSG:25833),
 * reprojects to WGS84, simplifies, and outputs a boundary gazetteer JSON.
 *
 * Prerequisites:
 *   - GDAL installed: `brew install gdal` (macOS) or `apt install gdal-bin` (Linux)
 *
 * Usage:
 *   npx tsx scripts/build-no-boundaries.ts [--simplify <tolerance>]
 *
 * Options:
 *   --simplify <meters>  Simplify polygons (in source CRS meters). Default: 200
 *
 * Output:
 *   src/api/place-gazetteers/data/no-kommuner-boundaries.json
 *
 * ──────────────────────────────────────────────────────────────────────
 * DATA SOURCE
 * ──────────────────────────────────────────────────────────────────────
 * Product: Basisdata — Kommuner (GeoJSON)
 * Publisher: Kartverket (Norwegian Mapping Authority)
 * URL: https://kartkatalog.geonorge.no/
 * License: NLOD / CC BY 4.0
 *
 * Contains ~357 municipality boundaries for Norway.
 *
 * ──────────────────────────────────────────────────────────────────────
 * CONVERSION PIPELINE
 * ──────────────────────────────────────────────────────────────────────
 *
 * 1. Download zip from Geonorge (EPSG:25833)
 * 2. ogr2ogr reprojects EPSG:25833 → WGS84 (EPSG:4326) with simplification
 * 3. Script groups features by kommunenummer (multi-part municipalities)
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
    kommunenummer: string;
    kommunenavn: string;
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
const simplifyTolerance = simplifyIdx >= 0 ? parseInt(args[simplifyIdx + 1], 10) : 200;

if (simplifyIdx >= 0 && isNaN(simplifyTolerance)) {
  console.error('Error: --simplify requires a numeric tolerance in meters');
  process.exit(1);
}

// ── Paths ────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const TMP_DIR = '/tmp/no_kommuner';
const TMP_ZIP = '/tmp/no_kommuner.zip';
const TMP_GEOJSON = '/tmp/no_kommuner_wgs84.geojson';
const OUTPUT = path.join(ROOT, 'src', 'api', 'place-gazetteers', 'data', 'no-kommuner-boundaries.json');

const DOWNLOAD_URL = 'https://nedlasting.geonorge.no/geonorge/Basisdata/Kommuner/GeoJSON/Basisdata_0000_Norge_25833_Kommuner_GeoJSON.zip';

// ── Step 1: Download if needed ──────────────────────────────────────

if (!fs.existsSync(TMP_DIR) || fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.geojson')).length === 0) {
  console.log('Downloading Norwegian municipality boundaries from Geonorge...');
  execFileSync('curl', ['-L', '-o', TMP_ZIP, DOWNLOAD_URL], { stdio: 'inherit' });

  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  execFileSync('unzip', ['-o', TMP_ZIP, '-d', TMP_DIR], { stdio: 'inherit' });
}

// Find the Kommune GeoJSON file (not the Grense boundary-lines file)
const allFiles = fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.geojson'));
const kommuneFile = allFiles.find(f => f.includes('_Kommune_')) || allFiles[0];

if (!kommuneFile) {
  console.error('Error: No .geojson files found in extracted zip');
  console.error(`Contents of ${TMP_DIR}:`);
  console.error(fs.readdirSync(TMP_DIR).join('\n'));
  process.exit(1);
}

const INPUT_GEOJSON = path.join(TMP_DIR, kommuneFile);
const inputSize = (fs.statSync(INPUT_GEOJSON).size / 1024 / 1024).toFixed(1);
console.log(`Using source file: ${kommuneFile} (${inputSize} MB)`);

// ── Step 2: Reproject with ogr2ogr ──────────────────────────────────

console.log(`Reprojecting EPSG:25833 → WGS84, simplify=${simplifyTolerance}m...`);

try {
  if (fs.existsSync(TMP_GEOJSON)) fs.unlinkSync(TMP_GEOJSON);
  execFileSync('ogr2ogr', [
    '-f', 'GeoJSON',
    '-t_srs', 'EPSG:4326',
    '-simplify', String(simplifyTolerance),
    '-lco', 'COORDINATE_PRECISION=4',
    TMP_GEOJSON,
    INPUT_GEOJSON,
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

// Group features by kommunenummer (multi-part municipalities: islands, fjord-split)
const byKommune = new Map<string, GeoJSONFeature[]>();
for (const f of geojson.features) {
  const code = f.properties.kommunenummer;
  if (!code) continue;
  if (!byKommune.has(code)) byKommune.set(code, []);
  byKommune.get(code)!.push(f);
}
console.log(`  ${byKommune.size} unique municipalities`);

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

// Build kommunenavn → fylkenavn lookup from /tmp/geonames_no/NO.txt to enable
// nesting kommune polygons under their fylke (admin1) for clean structural merge
// with no-kommuner's point data.
console.log('Building kommune → fylke lookup from GeoNames NO.txt...');
const NO_TXT = '/tmp/geonames_no/NO.txt';
const fylkeByCode: Record<string, string> = {};
const fylkeByKommune: Record<string, string> = {};
if (fs.existsSync(NO_TXT)) {
  const lines = fs.readFileSync(NO_TXT, 'utf-8').split('\n');
  // Pass 1: ADM1 rows give fylke names per admin1 code (prefer Norwegian alt name)
  for (const line of lines) {
    if (!line.trim()) continue;
    const c = line.split('\t');
    if (c[6] === 'A' && c[7] === 'ADM1') {
      const altNames = (c[3] || '').split(',').map(a => a.trim());
      const noFylke = altNames.find(a => / [Ff]ylke$/.test(a) && /[øæåØÆÅ]/.test(a))
        || altNames.find(a => / [Ff]ylke$/.test(a))
        || c[1];
      // Strip " fylke"/" Fylke" suffix to get canonical admin1 name (matches no-kommuner).
      const canonical = noFylke.replace(/ [Ff]ylke$/, '');
      fylkeByCode[c[10]] = canonical;
    }
  }
  // Pass 2: ADM2 rows map kommune-name → fylke-name via the admin1 code.
  for (const line of lines) {
    if (!line.trim()) continue;
    const c = line.split('\t');
    if (c[6] === 'A' && c[7] === 'ADM2') {
      const kommuneName = c[1];
      const fylke = fylkeByCode[c[10]];
      if (kommuneName && fylke) fylkeByKommune[kommuneName] = fylke;
    }
  }
  console.log(`  ${Object.keys(fylkeByCode).length} fylker, ${Object.keys(fylkeByKommune).length} kommune→fylke entries`);
} else {
  console.warn('  /tmp/geonames_no/NO.txt not found; polygons will attach directly under Norway (no fylke layer).');
}

// Group by fylke. Kommunes without a fylke match attach under a synthetic '__direct__' bucket
// (legacy fallback — should be empty in practice).
const byFylke = new Map<string, GazetteerNode[]>();
for (const [_code, features] of byKommune) {
  const props = features[0].properties;
  const geometry = mergeGeometries(features);
  const [lat, lon] = computeCentroid(geometry);

  // Strip " kommune" suffix to get canonical admin2 name; original as alias.
  const rawName = props.kommunenavn;
  const canonicalName = rawName.endsWith(' kommune') ? rawName.slice(0, -8) : rawName;
  const aliases = canonicalName !== rawName ? [rawName] : undefined;

  const fylkeName = fylkeByKommune[rawName] || fylkeByKommune[canonicalName] || '__direct__';
  if (!byFylke.has(fylkeName)) byFylke.set(fylkeName, []);
  const node: GazetteerNode = {
    name: canonicalName,
    type: 'admin2',
    lat: round4(lat),
    lon: round4(lon),
    geometry,
  };
  if (aliases) node.aliases = aliases;
  byFylke.get(fylkeName)!.push(node);
}

const fylkeNodes: GazetteerNode[] = [];
for (const [fylkeName, kommunes] of [...byFylke.entries()].sort()) {
  if (fylkeName === '__direct__') continue;
  kommunes.sort((a, b) => a.name.localeCompare(b.name, 'no'));
  const fylkeCoords = {
    lat: round4(kommunes.reduce((s, k) => s + k.lat, 0) / kommunes.length),
    lon: round4(kommunes.reduce((s, k) => s + k.lon, 0) / kommunes.length),
  };
  fylkeNodes.push({
    name: fylkeName,
    type: 'admin1',
    lat: fylkeCoords.lat,
    lon: fylkeCoords.lon,
    children: kommunes,
  });
}
const directKommunes = byFylke.get('__direct__') ?? [];
if (directKommunes.length > 0) {
  console.warn(`  ${directKommunes.length} kommune polygon(s) without fylke match — appending under Norway directly`);
}
const nodes: GazetteerNode[] = [...fylkeNodes, ...directKommunes];

// Sort by name (Norwegian locale)
nodes.sort((a, b) => a.name.localeCompare(b.name, 'no'));

console.log(`  ${nodes.length} municipality nodes`);

// ── Step 5: Build gazetteer ──────────────────────────────────────────

const gazetteer: Gazetteer = {
  id: 'no-kommuner-boundaries',
  name: 'Norwegian Municipalities — Boundaries',
  locale: 'no',
  description: `Municipality boundaries from Kartverket. ${nodes.length} municipalities. Simplified with ${simplifyTolerance}m tolerance.`,
  source: {
    name: 'Kartverket',
    url: 'https://kartkatalog.geonorge.no/',
    license: 'NLOD / CC BY 4.0',
  },
  kind: 'boundary',
  root: {
    name: 'World',
    type: 'world',
    lat: 0,
    lon: 0,
    children: [{
      name: 'Europe',
      type: 'continent',
      lat: 54,
      lon: 15,
      children: [{
        name: 'Norway',
        type: 'country',
        aliases: ['Norge'],
        lat: 65.0,
        lon: 13.0,
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
console.log(`  ${sizeMB} MB (${nodes.length} municipalities)`);

// Clean up temp file
if (fs.existsSync(TMP_GEOJSON)) fs.unlinkSync(TMP_GEOJSON);

console.log('\nDone.');
