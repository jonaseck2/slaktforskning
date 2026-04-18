/**
 * Build Finnish municipality boundary gazetteer from Statistics Finland WFS.
 *
 * Fetches pre-simplified GeoJSON at 1:4.5M scale in WGS84 from the Statistics
 * Finland WFS endpoint. No ogr2ogr or GDAL needed — single HTTP GET.
 *
 * Usage:
 *   npx tsx scripts/build-fi-boundaries.ts
 *
 * Output:
 *   src/api/place-gazetteers/data/fi-kunnat-boundaries.json
 *
 * ──────────────────────────────────────────────────────────────────────
 * DATA SOURCE
 * ──────────────────────────────────────────────────────────────────────
 * Publisher: Statistics Finland (Tilastokeskus)
 * Endpoint: https://geo.stat.fi/geoserver/tilastointialueet/wfs
 * Layer: tilastointialueet:kunta4500k_2025 (1:4.5M scale, WGS84)
 * License: CC BY 4.0
 *
 * Contains all Finnish municipalities (kunnat) with boundaries at 1:4.5M
 * scale — pre-simplified by Statistics Finland, suitable for overview maps.
 *
 * Feature properties:
 *   kunta  — municipality code (3-digit string)
 *   nimi   — Finnish name
 *   namn   — Swedish name
 *
 * ──────────────────────────────────────────────────────────────────────
 * PIPELINE
 * ──────────────────────────────────────────────────────────────────────
 *
 * 1. Fetch GeoJSON from WFS endpoint
 * 2. Group features by kunta code (islands → MultiPolygon)
 * 3. Round coordinates to 4 decimal places (~11m accuracy)
 * 4. Compute centroid from exterior ring coordinates
 * 5. Add Swedish name as alias when different from Finnish name
 * 6. Write gazetteer JSON with kind: "boundary"
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode, GazetteerGeometry } from '../src/api/place-gazetteers/types';
import { computeCentroid, round4 } from '../src/gazetteer-build/geo';

// ── Types ────────────────────────────────────────────────────────────

interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    kunta: string;
    nimi: string;
    namn: string;
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
const OUTPUT = path.join(ROOT, 'src', 'api', 'place-gazetteers', 'data', 'fi-kunnat-boundaries.json');

// ── WFS endpoint ─────────────────────────────────────────────────────

const WFS_URL = 'https://geo.stat.fi/geoserver/tilastointialueet/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:kunta4500k_2025&outputFormat=application/json&srsName=EPSG:4326';

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  // Step 1: Fetch GeoJSON from WFS
  console.log('Fetching Finnish municipality boundaries from Statistics Finland WFS...');
  const response = await fetch(WFS_URL);
  if (!response.ok) {
    console.error(`WFS request failed: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const geojson: GeoJSONCollection = await response.json() as GeoJSONCollection;
  console.log(`  ${geojson.features.length} features loaded`);

  // Step 2: Group features by kunta code (islands have multiple polygons)
  const byCode = new Map<string, GeoJSONFeature[]>();
  for (const f of geojson.features) {
    const code = f.properties.kunta;
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
    const [lat, lon] = computeCentroidRound4(geometry);

    const node: GazetteerNode = {
      name: props.nimi,
      type: 'municipality',
      lat,
      lon,
      geometry,
    };

    // Add Swedish name as alias when different from Finnish name
    if (props.namn && props.namn !== props.nimi) {
      node.aliases = [props.namn];
    }

    nodes.push(node);
  }

  // Sort by Finnish name
  nodes.sort((a, b) => a.name.localeCompare(b.name, 'fi'));

  console.log(`  ${nodes.length} municipalities`);

  // Step 4: Build gazetteer
  const today = new Date().toISOString().slice(0, 10);

  const gazetteer: Gazetteer = {
    id: 'fi-kunnat-boundaries',
    name: 'Finnish Municipalities — Boundaries',
    locale: 'fi',
    description: `Finnish municipality (kunta) boundaries. ${nodes.length} municipalities at 1:4.5M scale from Statistics Finland.`,
    source: {
      name: 'Statistics Finland',
      url: 'https://geo.stat.fi/geoserver/tilastointialueet/wfs',
      license: 'CC BY 4.0',
      fetched: today,
    },
    kind: 'boundary',
    root: {
      name: 'Suomi',
      type: 'country',
      aliases: ['Finland'],
      lat: 64.0,
      lon: 26.0,
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
