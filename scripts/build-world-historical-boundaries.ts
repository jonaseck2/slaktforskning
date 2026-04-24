/**
 * Build world-historical-boundaries gazetteer from Wikidata geoshapes.
 *
 * Queries Wikidata for dissolved political entities (P576) with declared
 * geoshape data (P3896), then fetches each boundary from the
 * Wikimedia Maps geoshape API at 500ms/request.
 *
 * Usage: npx tsx scripts/build-world-historical-boundaries.ts
 * Output: src/api/place-gazetteers/data/world-historical-boundaries.json
 * Source: Wikidata / Wikimedia Maps — CC0 1.0
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode, GazetteerGeometry } from '../src/api/place-gazetteers/types';
import { computeCentroid, round4 } from '../src/gazetteer-build/geo';
import { sparqlFetch as sparqlFetchRaw, sleep, USER_AGENT } from '../src/gazetteer-build/sparql';

interface CandidateRow {
  item: string;       // "http://www.wikidata.org/entity/Q15180"
  itemLabel: string;
}

// Dissolved entities with declared geoshape
const QUERY = `
SELECT DISTINCT ?item ?itemLabel WHERE {
  ?item wdt:P576 ?_ ; wdt:P3896 ?_ .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 5000
`;

function extractQid(uri: string): string | null {
  const match = uri.match(/(Q\d+)$/);
  return match ? match[1] : null;
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
  } catch {
    return null;
  }
}

async function main() {
  console.log('Building world-historical-boundaries gazetteer...\n');

  console.log('Querying Wikidata for dissolved entities with geoshapes (P3896)...');
  type Binding = Record<string, { value: string }>;
  const bindings = await sparqlFetchRaw<Binding>(QUERY);
  const candidates: CandidateRow[] = bindings
    .map(b => ({ item: b.item?.value ?? '', itemLabel: b.itemLabel?.value ?? '' }))
    .filter(r => r.item && r.itemLabel);
  console.log(`  ${candidates.length} candidates`);

  console.log(`\nFetching geoshapes from Wikimedia Maps (500ms/request)...`);
  const nodes: GazetteerNode[] = [];
  let fetched = 0, skipped = 0;

  for (const candidate of candidates) {
    const qid = extractQid(candidate.item);
    if (!qid) { skipped++; continue; }

    const rawGeom = await fetchGeoshape(qid);
    await sleep(500);
    fetched++;
    if (fetched % 20 === 0 || fetched === candidates.length) {
      process.stdout.write(`  ${fetched}/${candidates.length} fetched, ${nodes.length} with geometry\n`);
    }

    if (!rawGeom) { skipped++; continue; }

    const geometry = roundCoords(rawGeom);
    const [lat, lon] = computeCentroid(rawGeom);

    nodes.push({
      name: candidate.itemLabel,
      type: 'historical_state',
      lat: round4(lat),
      lon: round4(lon),
      geometry,
    });
  }

  nodes.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  console.log(`\nResults: ${nodes.length} with boundaries, ${skipped} skipped`);

  const today = new Date().toISOString().slice(0, 10);
  const gazetteer = {
    id: 'world-historical-boundaries',
    name: 'World — Historical State Boundaries',
    locale: 'en',
    kind: 'boundary',
    description: `Boundaries of dissolved political entities. ${nodes.length} entities from Wikidata / Wikimedia Maps.`,
    source: {
      name: 'Wikidata / Wikimedia Maps',
      url: 'https://maps.wikimedia.org/',
      license: 'CC0 1.0',
      fetched: today,
    },
    root: {
      name: 'World (Historical)',
      type: 'root',
      lat: 0,
      lon: 0,
      children: nodes,
    },
  };

  const outputPath = path.join(
    __dirname, '..', 'src', 'api', 'place-gazetteers', 'data', 'world-historical-boundaries.json',
  );
  const json = JSON.stringify(gazetteer);
  fs.writeFileSync(outputPath, json, 'utf-8');

  const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0);
  console.log(`Written: world-historical-boundaries.json (${sizeKB} KB, ${nodes.length} entities)`);
  console.log('\nDone!');
}

main().catch(err => { console.error(err); process.exit(1); });
