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

interface GazetteerGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
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

function computeCentroid(geom: GazetteerGeometry): [number, number] {
  let sumLat = 0, sumLon = 0, count = 0;
  const coords = geom.type === 'Polygon'
    ? [geom.coordinates as number[][][]]
    : geom.coordinates as number[][][][];

  for (const polygon of coords) {
    const ring = polygon[0]; // exterior ring only
    for (const [lon, lat] of ring) {
      sumLon += lon;
      sumLat += lat;
      count++;
    }
  }
  return [
    Math.round((sumLat / count) * 10000) / 10000,
    Math.round((sumLon / count) * 10000) / 10000,
  ];
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

  // Step 3: Build gazetteer nodes
  const nodes: GazetteerNode[] = [];

  for (const [_code, features] of byCode) {
    const props = features[0].properties;
    const rawGeometry = mergeGeometries(features);
    const geometry = roundCoords(rawGeometry, 4);
    const [lat, lon] = computeCentroid(geometry);

    const node: GazetteerNode = {
      name: props.namn,
      type: 'municipality',
      lat,
      lon,
      geometry,
    };

    nodes.push(node);
  }

  // Sort by Icelandic name
  nodes.sort((a, b) => a.name.localeCompare(b.name, 'is'));

  console.log(`  ${nodes.length} municipalities`);

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
      name: 'Ísland',
      type: 'country',
      aliases: ['Iceland'],
      lat: 65.0,
      lon: -18.5,
      children: nodes,
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
