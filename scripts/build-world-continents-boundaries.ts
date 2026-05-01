/**
 * Add 7 continent geoshapes as siblings of country nodes in world-boundaries.json.
 *
 * Fetches wdt:P3896 (geoshape) from Wikimedia Maps for each continent QID.
 * Re-reads the existing world-boundaries.json, prepends the continent nodes
 * to root.children, writes the file back.
 *
 * Usage: npx tsx scripts/build-world-continents-boundaries.ts
 * Source: Wikidata / Wikimedia Maps - CC0 1.0
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode, GazetteerGeometry } from '../src/api/place-gazetteers/types';
import { computeCentroid, round4 } from '../src/gazetteer-build/geo';
import { sleep, USER_AGENT } from '../src/gazetteer-build/sparql';

interface ContinentSpec {
  qid: string;
  name: string;
}

const CONTINENTS: ContinentSpec[] = [
  { qid: 'Q15',  name: 'Africa' },
  { qid: 'Q51',  name: 'Antarctica' },
  { qid: 'Q48',  name: 'Asia' },
  { qid: 'Q46',  name: 'Europe' },
  { qid: 'Q49',  name: 'North America' },
  { qid: 'Q538', name: 'Oceania' },
  { qid: 'Q18',  name: 'South America' },
];

const OUT_PATH = path.join(
  __dirname, '..', 'src', 'api', 'place-gazetteers', 'data', 'world-boundaries.json',
);

async function main() {
  console.log('Adding continent geoshapes to world-boundaries.json...\n');
  // Tasks 2-5 fill this in.
}

main().catch(err => { console.error(err); process.exit(1); });
