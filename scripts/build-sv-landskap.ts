/**
 * Build sv-landskap gazetteer from Wikidata.
 *
 * Queries Wikidata for instances of Q200250 (Swedish landskap), one row per
 * landskap with Swedish label, centroid (P625), and optional aliases.
 * Writes a flat point gazetteer with one root + 25 children.
 *
 * Usage: npx tsx scripts/build-sv-landskap.ts
 * Source: Wikidata - CC0 1.0
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { round6 } from '../src/gazetteer-build/geo';
import { sparqlFetch as sparqlFetchRaw } from '../src/gazetteer-build/sparql';

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');
const OUT_PATH = path.join(DATA_DIR, 'sv-landskap.json');

// One row per landskap. wkt = "Point(LON LAT)". Aliases via GROUP_CONCAT to
// flatten multiple altLabel rows into one.
// Q193556 = "province of Sweden" (historical and cultural geographical region)
const QUERY = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?item ?svLabel ?coord (GROUP_CONCAT(DISTINCT ?altLabel; SEPARATOR="|") AS ?aliases) WHERE {
  ?item wdt:P31 wd:Q193556 .
  ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item skos:altLabel ?altLabel . FILTER(LANG(?altLabel) = "sv") }
}
GROUP BY ?item ?svLabel ?coord
ORDER BY ?svLabel
`;

interface Row {
  itemQid: string;
  svLabel: string;
  lat: number;
  lon: number;
  aliases: string[];
}

function extractQid(uri: string): string | null {
  const m = uri.match(/(Q\d+)$/);
  return m ? m[1] : null;
}

function parsePoint(wkt: string): { lat: number; lon: number } | null {
  // "Point(17.5 62.0)" - lon then lat
  const m = wkt.match(/Point\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/);
  if (!m) return null;
  const lon = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

async function main() {
  console.log('Building sv-landskap gazetteer...\n');

  type Binding = Record<string, { value: string }>;
  const bindings = await sparqlFetchRaw<Binding>(QUERY);
  console.log(`  Fetched ${bindings.length} rows from Wikidata.`);

  const rows: Row[] = [];
  for (const b of bindings) {
    const qid = extractQid(b.item?.value ?? '');
    const svLabel = b.svLabel?.value ?? '';
    const coordRaw = b.coord?.value ?? '';
    const aliasesRaw = b.aliases?.value ?? '';
    if (!qid || !svLabel || !coordRaw) {
      console.warn(`  Skipping incomplete row: qid=${qid} label=${svLabel} coord=${coordRaw}`);
      continue;
    }
    const point = parsePoint(coordRaw);
    if (!point) {
      console.warn(`  Skipping ${svLabel} - unparseable coord ${coordRaw}`);
      continue;
    }
    rows.push({
      itemQid: qid,
      svLabel,
      lat: point.lat,
      lon: point.lon,
      aliases: aliasesRaw
        ? aliasesRaw.split('|').map(s => s.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'sv'))
        : [],
    });
  }

  console.log(`  Parsed ${rows.length} valid rows.`);
  if (rows.length !== 25) {
    console.warn(`  WARNING: expected 25 landskap, got ${rows.length}. Check query.`);
  }

  // Build child nodes — one per landskap. Typed admin1 (parallel axis to län
  // under Sweden; same level of partition, different cultural-historical lens).
  // Same-name landskap and län (Blekinge, Dalarna, Gotland, …) merge as one
  // admin1 node when both gazetteers are enabled — the merge engine unions
  // their aliases. Unique landskap (Småland, Bohuslän, …) appear as
  // additional admin1 siblings under Sweden.
  const landskapNodes: GazetteerNode[] = rows
    .map<GazetteerNode>(r => ({
      name: r.svLabel,
      type: 'admin1',
      lat: round6(r.lat),
      lon: round6(r.lon),
      ...(r.aliases.length > 0 ? { aliases: r.aliases } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'));

  const today = new Date().toISOString().slice(0, 10);

  // World > Europe > Sweden > <landskap as admin1>
  const sweden: GazetteerNode = {
    name: 'Sweden',
    type: 'country',
    aliases: ['Sverige'],
    lat: 62.0,
    lon: 15.0,
    children: landskapNodes,
  };
  const europe: GazetteerNode = {
    name: 'Europe',
    type: 'continent',
    lat: 54,
    lon: 15,
    children: [sweden],
  };

  const gazetteer = {
    id: 'sv-landskap',
    name: 'Svenska landskap',
    locale: 'sv',
    description: 'Sveriges 25 historiska landskap, typade som admin1 under Sverige (parallell axel till län).',
    source: {
      name: 'Wikidata',
      url: 'https://www.wikidata.org/wiki/Q193556',
      license: 'CC0 1.0',
      fetched: today,
    },
    kind: 'point' as const,
    root: {
      name: 'World',
      type: 'world',
      lat: 0,
      lon: 0,
      children: [europe],
    },
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(gazetteer, null, 2) + '\n', 'utf-8');

  const sizeKB = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
  console.log(`\nWrote ${OUT_PATH} (${sizeKB} KB, ${landskapNodes.length} landskap)`);
}

main().catch(err => { console.error(err); process.exit(1); });
