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
import type { GazetteerNode, GazetteerGeometry } from '../src/api/place-gazetteers/types';
import { computeCentroid, round4 } from '../src/gazetteer-build/geo';

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

// ── FIPS state codes → full state names ─────────────────────────────

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  // Territories
  AS: 'American Samoa', GU: 'Guam', MP: 'Northern Mariana Islands',
  PR: 'Puerto Rico', VI: 'U.S. Virgin Islands',
};

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

// Group counties by state using STUSPS property
const stateMap = new Map<string, GazetteerNode[]>();
let countyCount = 0;

for (const f of geojson.features) {
  const props = f.properties;
  const stateCode = props.STUSPS;
  const stateName = STATE_NAMES[stateCode];
  if (!stateName) {
    console.warn(`  Skipping unknown state code: ${stateCode} (${props.NAME})`);
    continue;
  }

  const geometry: GazetteerGeometry = f.geometry.type === 'Polygon'
    ? { type: 'Polygon', coordinates: f.geometry.coordinates as number[][][] }
    : { type: 'MultiPolygon', coordinates: f.geometry.coordinates as number[][][][] };
  const [lat, lon] = computeCentroid(geometry);

  if (!stateMap.has(stateCode)) stateMap.set(stateCode, []);
  // Strip US county suffixes for canonical admin2 name; original as alias.
  const COUNTY_SUFFIXES = [' County', ' Borough', ' Census Area', ' Parish', ' City and Borough', ' Municipality'];
  let canonicalName = props.NAME;
  for (const sfx of COUNTY_SUFFIXES) {
    if (props.NAME.endsWith(sfx)) { canonicalName = props.NAME.slice(0, -sfx.length); break; }
  }
  const aliases = canonicalName !== props.NAME ? [props.NAME] : undefined;
  const node: GazetteerNode = {
    name: canonicalName,
    type: 'admin2',
    lat: round4(lat),
    lon: round4(lon),
    geometry,
  };
  if (aliases) node.aliases = aliases;
  stateMap.get(stateCode)!.push(node);
  countyCount++;
}

// Build state nodes with county children, sorted alphabetically
const stateNodes: GazetteerNode[] = [...stateMap.entries()]
  .sort((a, b) => STATE_NAMES[a[0]].localeCompare(STATE_NAMES[b[0]], 'en'))
  .map(([code, counties]) => {
    counties.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    const avgLat = counties.reduce((s, c) => s + c.lat, 0) / counties.length;
    const avgLon = counties.reduce((s, c) => s + c.lon, 0) / counties.length;
    return {
      name: STATE_NAMES[code],
      type: 'admin1',
      lat: round4(avgLat),
      lon: round4(avgLon),
      children: counties,
    };
  });

console.log(`  ${stateNodes.length} states, ${countyCount} counties`);

// ── Step 5: Build gazetteer ──────────────────────────────────────────

const gazetteer: Gazetteer = {
  id: 'us-counties-boundaries',
  name: 'US Counties — Boundaries',
  locale: 'en',
  description: `County boundaries from US Census Bureau TIGER/Line 20m cartographic boundary file. ${countyCount} counties in ${stateNodes.length} states.`,
  source: {
    name: 'US Census Bureau',
    url: 'https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html',
    license: 'Public domain',
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
        name: 'United States',
        type: 'country',
        aliases: ['USA', 'US', 'United States of America'],
        lat: 39.8,
        lon: -98.6,
        children: stateNodes,
      }],
    }],
  },
};

// ── Step 6: Write output ─────────────────────────────────────────────

const json = JSON.stringify(gazetteer);
fs.writeFileSync(OUTPUT, json, 'utf-8');

const sizeMB = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
console.log(`\nWrote ${OUTPUT}`);
console.log(`  ${sizeMB} MB (${countyCount} counties in ${stateNodes.length} states)`);

// Clean up temp file
if (fs.existsSync(TMP_GEOJSON)) fs.unlinkSync(TMP_GEOJSON);

console.log('\nDone.');
