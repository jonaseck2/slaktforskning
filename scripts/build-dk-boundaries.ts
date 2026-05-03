/**
 * Build Danish parish boundary gazetteer from ok-dk/dagi GitHub repo.
 *
 * Downloads pre-built GeoJSON in WGS84 — no ogr2ogr needed.
 *
 * Usage:
 *   npx tsx scripts/build-dk-boundaries.ts
 *
 * Output:
 *   src/api/place-gazetteers/data/dk-sogne-boundaries.json
 *
 * ──────────────────────────────────────────────────────────────────────
 * DATA SOURCE
 * ──────────────────────────────────────────────────────────────────────
 * Publisher: GeoDanmark via ok-dk/dagi
 * URL: https://github.com/ok-dk/dagi
 * License: Danish Open Government Data
 *
 * Contains all Danish parishes (sogne) with boundaries.
 *
 * Feature properties:
 *   SOGNENAVN  — parish name
 *   SOGNEKODE  — parish code (used to group multi-part features)
 *
 * ──────────────────────────────────────────────────────────────────────
 * PIPELINE
 * ──────────────────────────────────────────────────────────────────────
 *
 * 1. Fetch GeoJSON from GitHub
 * 2. Group features by SOGNEKODE (multi-part parishes → MultiPolygon)
 * 3. Round coordinates to 4 decimal places (~11m accuracy)
 * 4. Compute centroid from exterior ring coordinates
 * 5. Write gazetteer JSON with kind: "boundary"
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode, GazetteerGeometry } from '../src/api/place-gazetteers/types';
import { computeCentroid, round4 } from '../src/gazetteer-build/geo';

// ── Types ────────────────────────────────────────────────────────────

interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    SOGNENAVN: string;
    SOGNEKODE: string;
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
    fetched: string;
  };
  kind: 'boundary';
  root: GazetteerNode;
}

// ── Utility functions ────────────────────────────────────────────────

function roundCoords(geom: GazetteerGeometry, precision = 4): GazetteerGeometry {
  const factor = Math.pow(10, precision);

  function roundRing(ring: number[][]): number[][] {
    return ring.map(([lon, lat]) => [
      Math.round(lon * factor) / factor,
      Math.round(lat * factor) / factor,
    ]);
  }

  if (geom.type === 'Polygon') {
    const coords = geom.coordinates as number[][][];
    return {
      type: 'Polygon',
      coordinates: coords.map(roundRing),
    };
  } else {
    const coords = geom.coordinates as number[][][][];
    return {
      type: 'MultiPolygon',
      coordinates: coords.map(poly => poly.map(roundRing)),
    };
  }
}

function computeCentroidRound4(geom: GazetteerGeometry): [number, number] {
  const [lat, lon] = computeCentroid(geom);
  return [round4(lat), round4(lon)];
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

// ── Paths ────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'src', 'api', 'place-gazetteers', 'data', 'dk-sogne-boundaries.json');

// ── Source URL ───────────────────────────────────────────────────────

const GEOJSON_URL = 'https://raw.githubusercontent.com/ok-dk/dagi/master/geojson/sogne.geojson';

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  // Step 1: Fetch GeoJSON
  console.log('Fetching Danish parish boundaries from ok-dk/dagi...');
  const response = await fetch(GEOJSON_URL);
  if (!response.ok) {
    console.error(`Fetch failed: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const geojson: GeoJSONCollection = await response.json() as GeoJSONCollection;
  console.log(`  ${geojson.features.length} features loaded`);

  // Step 2: Group features by SOGNEKODE (multi-part parishes)
  const byCode = new Map<string, GeoJSONFeature[]>();
  for (const f of geojson.features) {
    const code = f.properties.SOGNEKODE;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code)!.push(f);
  }
  console.log(`  ${byCode.size} unique parishes`);

  // Step 3a: Build parish-name → (region, kommune) lookup from dk-sogne.json.
  console.log('Building parish → (region, kommune) lookup from dk-sogne.json...');
  const DK_SOGNE_PATH = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data', 'dk-sogne.json');
  const parentByParish: Record<string, { region: string; kommune: string }> = {};
  if (fs.existsSync(DK_SOGNE_PATH)) {
    const dkSogne = JSON.parse(fs.readFileSync(DK_SOGNE_PATH, 'utf-8'));
    const denmark = dkSogne.root?.children?.[0]?.children?.[0];
    for (const region of denmark?.children ?? []) {
      for (const kommune of region.children ?? []) {
        for (const parish of kommune.children ?? []) {
          const entry = { region: region.name, kommune: kommune.name };
          if (!parentByParish[parish.name]) parentByParish[parish.name] = entry;
          // Aliases include the bare 'X' form matching ok-dk/dagi's SOGNENAVN.
          for (const alias of parish.aliases ?? []) {
            if (!parentByParish[alias]) parentByParish[alias] = entry;
          }
        }
      }
    }
    console.log(`  ${Object.keys(parentByParish).length} parish-name→(region, kommune) entries (incl. aliases)`);
  } else {
    console.warn('  dk-sogne.json not found; polygons will attach directly under Denmark.');
  }

  // Step 3b: Build polygon nodes, group by (region, kommune).
  type Bucket = { region: string; kommune: string; nodes: GazetteerNode[] };
  const buckets = new Map<string, Bucket>();
  let unmappedCount = 0;

  for (const [_code, features] of byCode) {
    const props = features[0].properties;
    const rawGeometry = mergeGeometries(features);
    const geometry = roundCoords(rawGeometry, 4);
    const [lat, lon] = computeCentroidRound4(geometry);

    const node: GazetteerNode = {
      name: props.SOGNENAVN,
      type: 'admin3',
      lat,
      lon,
      geometry,
    };

    const lookup = parentByParish[props.SOGNENAVN];
    const key = lookup ? `${lookup.region}|${lookup.kommune}` : '__direct__';
    if (!buckets.has(key)) {
      buckets.set(key, { region: lookup?.region ?? '', kommune: lookup?.kommune ?? '', nodes: [] });
    }
    buckets.get(key)!.nodes.push(node);
    if (!lookup) unmappedCount++;
  }

  // Build region → kommune → polygons hierarchy.
  const regMap = new Map<string, Map<string, GazetteerNode[]>>();
  const directPolygons: GazetteerNode[] = [];
  for (const [key, bucket] of buckets) {
    if (key === '__direct__') {
      directPolygons.push(...bucket.nodes);
      continue;
    }
    if (!regMap.has(bucket.region)) regMap.set(bucket.region, new Map());
    regMap.get(bucket.region)!.set(bucket.kommune, bucket.nodes);
  }

  const nodes: GazetteerNode[] = [];
  for (const [regionName, kommuneMap] of [...regMap.entries()].sort()) {
    const kommuneNodes: GazetteerNode[] = [];
    for (const [kommuneName, polygons] of [...kommuneMap.entries()].sort()) {
      polygons.sort((a, b) => a.name.localeCompare(b.name, 'da'));
      const lat = round4(polygons.reduce((s, p) => s + p.lat, 0) / polygons.length);
      const lon = round4(polygons.reduce((s, p) => s + p.lon, 0) / polygons.length);
      kommuneNodes.push({ name: kommuneName, type: 'admin2', lat, lon, children: polygons });
    }
    const lat = round4(kommuneNodes.reduce((s, k) => s + k.lat, 0) / kommuneNodes.length);
    const lon = round4(kommuneNodes.reduce((s, k) => s + k.lon, 0) / kommuneNodes.length);
    nodes.push({ name: regionName, type: 'admin1', lat, lon, children: kommuneNodes });
  }
  if (directPolygons.length > 0) {
    console.warn(`  ${directPolygons.length} parish polygon(s) without (region, kommune) match — appending under Denmark directly`);
    directPolygons.sort((a, b) => a.name.localeCompare(b.name, 'da'));
    nodes.push(...directPolygons);
  }

  console.log(`  ${nodes.length} top-level nodes (regions + direct polygons; ${unmappedCount} unmapped)`);

  // Step 4: Build gazetteer
  const today = new Date().toISOString().slice(0, 10);

  const gazetteer: Gazetteer = {
    id: 'dk-sogne-boundaries',
    name: 'Danish Parishes — Boundaries',
    locale: 'da',
    description: `Danish parish (sogn) boundaries. ${nodes.length} parishes from GeoDanmark via ok-dk/dagi.`,
    source: {
      name: 'GeoDanmark via ok-dk/dagi',
      url: 'https://github.com/ok-dk/dagi',
      license: 'Danish Open Government Data',
      fetched: today,
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
          name: 'Denmark',
          type: 'country',
          aliases: ['Danmark'],
          lat: 56.0,
          lon: 10.0,
          children: nodes,
        }],
      }],
    },
  };

  // Step 5: Write output
  const json = JSON.stringify(gazetteer);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, json, 'utf-8');

  const sizeKB = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
  const sizeMB = (fs.statSync(OUTPUT).size / (1024 * 1024)).toFixed(1);
  console.log(`\nWrote ${OUTPUT}`);
  console.log(`  ${sizeMB} MB / ${sizeKB} KB (${nodes.length} parishes)`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
