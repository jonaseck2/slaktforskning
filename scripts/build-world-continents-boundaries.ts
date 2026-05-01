/**
 * Add 7 continent geoshapes as siblings of country nodes in world-boundaries.json.
 *
 * Tries to fetch wdt:P3896 (geoshape) from Wikimedia Maps for each continent QID.
 * Falls back to Natural Earth ne_50m_geography_regions_polys (public domain) when
 * Wikimedia Maps is unavailable (API restricted to Wikimedia-affiliated sites).
 * Re-reads the existing world-boundaries.json, prepends the continent nodes
 * to root.children, writes the file back.
 *
 * Usage: npx tsx scripts/build-world-continents-boundaries.ts
 * Source: Wikidata / Wikimedia Maps - CC0 1.0; Natural Earth - Public domain
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode, GazetteerGeometry } from '../src/api/place-gazetteers/types';
import { computeCentroid, round4 } from '../src/gazetteer-build/geo';
import { sleep, USER_AGENT, fetchWithRetry } from '../src/gazetteer-build/sparql';

interface ContinentSpec {
  qid: string;
  name: string;
  /** Fallback name key as it appears (uppercased) in Natural Earth FEATURECLA=Continent */
  neNameUpper: string;
}

const CONTINENTS: ContinentSpec[] = [
  { qid: 'Q15',  name: 'Africa',        neNameUpper: 'AFRICA' },
  { qid: 'Q51',  name: 'Antarctica',    neNameUpper: 'ANTARCTICA' },
  { qid: 'Q48',  name: 'Asia',          neNameUpper: 'ASIA' },
  { qid: 'Q46',  name: 'Europe',        neNameUpper: 'EUROPE' },
  { qid: 'Q49',  name: 'North America', neNameUpper: 'NORTH AMERICA' },
  { qid: 'Q538', name: 'Oceania',       neNameUpper: 'AUSTRALIA' }, // NE calls it "Australia"
  { qid: 'Q18',  name: 'South America', neNameUpper: 'SOUTH AMERICA' },
];

const NE_CONTINENTS_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_geography_regions_polys.geojson';

const OUT_PATH = path.join(
  __dirname, '..', 'src', 'api', 'place-gazetteers', 'data', 'world-boundaries.json',
);

async function fetchGeoshape(qid: string): Promise<GazetteerGeometry | null> {
  const url = `https://maps.wikimedia.org/geoshape?getgeojson=1&ids=${qid}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const data = await res.json() as {
      type: string;
      features: Array<{ geometry: { type: string; coordinates: unknown } }>;
    };
    if (!data.features?.length) return null;
    const geom = data.features[0].geometry;
    if (!geom || !['Polygon', 'MultiPolygon'].includes(geom.type)) return null;
    return geom as GazetteerGeometry;
  } catch (err) {
    console.warn(`  fetchGeoshape ${qid} threw:`, err);
    return null;
  }
}

function roundCoords(geom: GazetteerGeometry): GazetteerGeometry {
  const factor = 10_000;
  function roundRing(ring: number[][]): number[][] {
    return ring.map(([lon, lat]) => [
      Math.round(lon * factor) / factor,
      Math.round(lat * factor) / factor,
    ]);
  }
  if (geom.type === 'Polygon') {
    return { type: 'Polygon', coordinates: (geom.coordinates as number[][][]).map(roundRing) };
  }
  return {
    type: 'MultiPolygon',
    coordinates: (geom.coordinates as number[][][][]).map(p => p.map(roundRing)),
  };
}

interface NeFeature {
  type: 'Feature';
  properties: Record<string, string | number | null>;
  geometry: { type: string; coordinates: unknown };
}

async function fetchNaturalEarthContinents(): Promise<Map<string, GazetteerGeometry>> {
  console.log(`  Fetching Natural Earth continents from GitHub...`);
  const res = await fetchWithRetry(NE_CONTINENTS_URL, { headers: { 'User-Agent': USER_AGENT } }, { attempts: 3, delayMs: 1000 });
  if (!res.ok) throw new Error(`Natural Earth fetch failed: ${res.status} ${res.statusText}`);
  const data = await res.json() as { features: NeFeature[] };
  const result = new Map<string, GazetteerGeometry>();
  for (const feature of data.features) {
    const props = feature.properties;
    if (props['FEATURECLA'] !== 'Continent') continue;
    const name = String(props['NAME'] ?? '').toUpperCase();
    const geom = feature.geometry;
    if (!geom || !['Polygon', 'MultiPolygon'].includes(geom.type)) continue;
    result.set(name, geom as GazetteerGeometry);
  }
  return result;
}

async function main() {
  console.log(`Fetching ${CONTINENTS.length} continent geoshapes...\n`);

  // Try Wikimedia Maps first for one continent to see if it's accessible.
  process.stdout.write(`  Testing Wikimedia Maps (Africa Q15)... `);
  const testGeom = await fetchGeoshape('Q15');
  await sleep(500);
  const wikimediaAvailable = testGeom !== null;
  if (wikimediaAvailable) {
    console.log('OK - using Wikimedia Maps');
  } else {
    console.log('BLOCKED - falling back to Natural Earth');
  }

  // Load Natural Earth as fallback (or primary if Wikimedia unavailable).
  let neMap: Map<string, GazetteerGeometry> | null = null;
  if (!wikimediaAvailable) {
    neMap = await fetchNaturalEarthContinents();
    console.log(`  Loaded ${neMap.size} continent geometries from Natural Earth\n`);
  }

  const newNodes: GazetteerNode[] = [];
  for (const { qid, name, neNameUpper } of CONTINENTS) {
    process.stdout.write(`  ${name} (${qid})... `);

    let rawGeom: GazetteerGeometry | null = null;
    let source: 'wikidata' | 'naturalEarth' = 'wikidata';

    if (wikimediaAvailable) {
      if (name !== 'Africa') {
        // Africa was already fetched as the test; re-use its geom.
        rawGeom = await fetchGeoshape(qid);
        await sleep(500);
      } else {
        rawGeom = testGeom;
      }
    } else {
      rawGeom = neMap?.get(neNameUpper) ?? null;
      source = 'naturalEarth';
    }

    if (!rawGeom) { console.log('NO GEOSHAPE - skipping'); continue; }

    const geometry = roundCoords(rawGeom);
    const [lat, lon] = computeCentroid(rawGeom);
    newNodes.push({
      name,
      type: 'continent',
      lat: round4(lat),
      lon: round4(lon),
      geometry,
    });
    console.log(`OK via ${source} (centroid ${round4(lat)}, ${round4(lon)})`);
  }

  if (newNodes.length === 0) {
    console.error('\nFATAL: no continents fetched');
    process.exit(1);
  }

  console.log(`\nFetched ${newNodes.length}/${CONTINENTS.length} continents.`);

  console.log(`\nReading ${OUT_PATH}...`);
  const existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf-8')) as {
    root: { children: GazetteerNode[]; [k: string]: unknown };
    [k: string]: unknown;
  };

  // Replace any existing continent nodes (idempotent re-run).
  const existingNonContinents = (existing.root.children ?? [])
    .filter(c => c.type !== 'continent');

  // Sort continents alphabetically; prepend before countries.
  newNodes.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  existing.root.children = [...newNodes, ...existingNonContinents];

  // Update the source.fetched date so downstream caches notice the rebuild.
  if (existing.source && typeof existing.source === 'object') {
    (existing.source as { fetched?: string }).fetched = new Date().toISOString().slice(0, 10);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(existing), 'utf-8');
  const sizeKB = (fs.statSync(OUT_PATH).size / 1024).toFixed(0);
  console.log(`Wrote ${OUT_PATH} (${sizeKB} KB, +${newNodes.length} continents)`);
}

main().catch(err => { console.error(err); process.exit(1); });
