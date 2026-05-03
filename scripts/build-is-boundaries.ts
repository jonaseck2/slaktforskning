/**
 * Build Icelandic municipality boundary gazetteer from LMI WFS.
 *
 * Fetches GeoJSON in WGS84 from the LMI (Landmælingar Íslands) WFS endpoint.
 * No ogr2ogr or GDAL needed — single HTTP GET.
 *
 * Usage:
 *   npx tsx scripts/build-is-boundaries.ts
 *
 * Output:
 *   src/api/place-gazetteers/data/is-sveitarfelog-boundaries.json
 *
 * ──────────────────────────────────────────────────────────────────────
 * DATA SOURCE
 * ──────────────────────────────────────────────────────────────────────
 * Publisher: LMI (Landmælingar Íslands)
 * Endpoint: https://gis.lmi.is/geoserver/wfs
 * Layer: EBM:AdministrativeUnit_level2
 * License: LMI Open Data
 *
 * Contains all Icelandic municipalities (sveitarfélög) with boundaries.
 *
 * Feature properties:
 *   namn  — Icelandic name
 *   shn   — municipality code
 *
 * ──────────────────────────────────────────────────────────────────────
 * PIPELINE
 * ──────────────────────────────────────────────────────────────────────
 *
 * 1. Fetch GeoJSON from WFS endpoint
 * 2. Group features by shn code (multi-part features → MultiPolygon)
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
    namn: string;
    shn: string;
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
const OUTPUT = path.join(ROOT, 'src', 'api', 'place-gazetteers', 'data', 'is-sveitarfelog-boundaries.json');

// ── WFS endpoint ─────────────────────────────────────────────────────

const WFS_URL = 'https://gis.lmi.is/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=EBM:AdministrativeUnit_level2&outputFormat=application/json&srsName=EPSG:4326';

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  // Step 1: Fetch GeoJSON from WFS
  console.log('Fetching Icelandic municipality boundaries from LMI WFS...');
  const response = await fetch(WFS_URL);
  if (!response.ok) {
    console.error(`WFS request failed: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const geojson: GeoJSONCollection = await response.json() as GeoJSONCollection;
  console.log(`  ${geojson.features.length} features loaded`);

  // Step 2: Group features by shn code (multi-part municipalities)
  const byCode = new Map<string, GeoJSONFeature[]>();
  for (const f of geojson.features) {
    const code = f.properties.shn;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code)!.push(f);
  }
  console.log(`  ${byCode.size} unique municipalities`);

  // Step 3a: Build sveitarfelag-name → region-name lookup from /tmp/geonames_is/IS.txt.
  console.log('Building sveitarfelag → region lookup from GeoNames IS.txt...');
  const IS_TXT = '/tmp/geonames_is/IS.txt';
  const adm1ByCode: Record<string, string> = {};
  const regionByMun: Record<string, string> = {};
  if (fs.existsSync(IS_TXT)) {
    const lines = fs.readFileSync(IS_TXT, 'utf-8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const c = line.split('\t');
      if (c[6] === 'A' && c[7] === 'ADM1') adm1ByCode[c[10]] = c[1];
    }
    for (const line of lines) {
      if (!line.trim()) continue;
      const c = line.split('\t');
      if (c[6] === 'A' && c[7] === 'ADM2') {
        const region = adm1ByCode[c[10]];
        if (region && c[1]) regionByMun[c[1]] = region;
      }
    }
    console.log(`  ${Object.keys(adm1ByCode).length} regions, ${Object.keys(regionByMun).length} sveitarfelag→region entries`);
  } else {
    console.warn('  /tmp/geonames_is/IS.txt not found; polygons will attach directly under Iceland.');
  }

  // Step 3b: Build sveitarfelag nodes, group by region.
  const byRegion = new Map<string, GazetteerNode[]>();
  for (const [_code, features] of byCode) {
    const props = features[0].properties;
    const rawGeometry = mergeGeometries(features);
    const geometry = roundCoords(rawGeometry, 4);
    const [lat, lon] = computeCentroidRound4(geometry);

    const node: GazetteerNode = {
      name: props.namn,
      type: 'admin2',
      lat,
      lon,
      geometry,
    };

    const region = regionByMun[props.namn] || '__direct__';
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region)!.push(node);
  }

  const nodes: GazetteerNode[] = [];
  for (const [regionName, muns] of [...byRegion.entries()].sort()) {
    if (regionName === '__direct__') continue;
    muns.sort((a, b) => a.name.localeCompare(b.name, 'is'));
    const lat = round4(muns.reduce((s, k) => s + k.lat, 0) / muns.length);
    const lon = round4(muns.reduce((s, k) => s + k.lon, 0) / muns.length);
    nodes.push({ name: regionName, type: 'admin1', lat, lon, children: muns });
  }
  const direct = byRegion.get('__direct__') ?? [];
  if (direct.length > 0) {
    console.warn(`  ${direct.length} sveitarfelag polygon(s) without region match — appending under Iceland directly`);
    nodes.push(...direct);
  }
  console.log(`  ${nodes.length} top-level nodes`);

  // Step 4: Build gazetteer
  const today = new Date().toISOString().slice(0, 10);

  const gazetteer: Gazetteer = {
    id: 'is-sveitarfelog-boundaries',
    name: 'Icelandic Municipalities — Boundaries',
    locale: 'is',
    description: `Icelandic municipality (sveitarfélag) boundaries. ${nodes.length} municipalities from LMI (Landmælingar Íslands).`,
    source: {
      name: 'LMI (Landmælingar Íslands)',
      url: 'https://gis.lmi.is/geoserver/wfs',
      license: 'LMI Open Data',
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
          name: 'Iceland',
          type: 'country',
          aliases: ['Ísland'],
          lat: 65.0,
          lon: -18.5,
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
  console.log(`\nWrote ${OUTPUT}`);
  console.log(`  ${sizeKB} KB (${nodes.length} municipalities)`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
