/**
 * Build world-historical point gazetteer from Wikidata.
 *
 * Two queries cover different class hierarchies:
 *   Q1: Q3024240 (historical country) + Q28171280 (ancient country) — no P576 required
 *   Q2: Q6256 (country) + Q7270 (republic) + Q7275 (state) — filtered by P576
 * Results are merged by QID and deduplicated.
 *
 * Usage: npx tsx scripts/build-world-historical.ts
 * Output: src/api/place-gazetteers/data/world-historical.json
 * Source: Wikidata — CC0 1.0
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { round6 } from '../src/gazetteer-build/geo';
import { parseWktPoint, generateAliases } from '../src/gazetteer-build/wikidata';
import { sparqlFetch as sparqlFetchRaw, sleep } from '../src/gazetteer-build/sparql';

interface WikidataRow {
  item: string;       // "http://www.wikidata.org/entity/Q15180"
  itemLabel: string;
  coord: string;      // WKT "Point(lon lat)"
  startYear: string;
  endYear: string;
  altLabels: string;  // pipe-separated English alt labels
}

// Strip common political entity suffixes to generate bare-name aliases
const ENTITY_SUFFIXES =
  /\s+(empire|kingdom|republic|union|sultanate|emirate|caliphate|dynasty|khanate|principality|duchy|state|confederation)s?$/i;

// Q1: dedicated historical-country classes (no P576 required)
const QUERY_HISTORICAL = `
SELECT ?item ?itemLabel ?coord
  (SAMPLE(YEAR(?startDate)) AS ?startYear)
  (SAMPLE(YEAR(?endDate)) AS ?endYear)
  (GROUP_CONCAT(DISTINCT ?altLabel; SEPARATOR="|") AS ?altLabels)
WHERE {
  VALUES ?class { wd:Q3024240 wd:Q28171280 }
  ?item wdt:P31 ?class ; wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P571 ?startDate }
  OPTIONAL { ?item wdt:P576 ?endDate }
  OPTIONAL {
    ?item skos:altLabel ?altLabel .
    FILTER(LANG(?altLabel) = "en")
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
GROUP BY ?item ?itemLabel ?coord
LIMIT 10000
`;

// Q2: broader classes that require P576 (catches Soviet Union, Ottoman Empire etc.)
const QUERY_DISSOLVED = `
SELECT ?item ?itemLabel ?coord
  (SAMPLE(YEAR(?startDate)) AS ?startYear)
  (SAMPLE(YEAR(?endDate)) AS ?endYear)
  (GROUP_CONCAT(DISTINCT ?altLabel; SEPARATOR="|") AS ?altLabels)
WHERE {
  VALUES ?class { wd:Q6256 wd:Q7270 wd:Q7275 }
  ?item wdt:P31 ?class ; wdt:P576 ?_ ; wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P571 ?startDate }
  OPTIONAL { ?item wdt:P576 ?endDate }
  OPTIONAL {
    ?item skos:altLabel ?altLabel .
    FILTER(LANG(?altLabel) = "en")
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
GROUP BY ?item ?itemLabel ?coord
LIMIT 10000
`;

async function sparqlFetch(query: string): Promise<WikidataRow[]> {
  type Binding = Record<string, { value: string }>;
  const bindings = await sparqlFetchRaw<Binding>(query);
  return bindings.map(b => ({
    item: b.item?.value ?? '',
    itemLabel: b.itemLabel?.value ?? '',
    coord: b.coord?.value ?? '',
    startYear: b.startYear?.value ?? '',
    endYear: b.endYear?.value ?? '',
    altLabels: b.altLabels?.value ?? '',
  }));
}

function buildNodes(rows: WikidataRow[]): GazetteerNode[] {
  const seen = new Set<string>();
  const nodes: GazetteerNode[] = [];

  for (const row of rows) {
    if (!row.item || !row.itemLabel || !row.coord) continue;
    if (seen.has(row.item)) continue;
    seen.add(row.item);

    const coord = parseWktPoint(row.coord);
    if (!coord) continue;

    const aliases = generateAliases(row.itemLabel, row.altLabels, ENTITY_SUFFIXES);

    const node: GazetteerNode = {
      name: row.itemLabel,
      type: 'historical_state',
      lat: round6(coord.lat),
      lon: round6(coord.lon),
    };
    if (aliases.length > 0) node.aliases = aliases;
    if (row.startYear) node.startYear = parseInt(row.startYear, 10);
    if (row.endYear) node.endYear = parseInt(row.endYear, 10);

    nodes.push(node);
  }

  nodes.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return nodes;
}

async function main() {
  console.log('Building world-historical point gazetteer from Wikidata...\n');

  console.log('Query 1: historical/ancient country classes...');
  const rows1 = await sparqlFetch(QUERY_HISTORICAL);
  console.log(`  ${rows1.length} rows`);

  await sleep(2000);

  console.log('Query 2: dissolved countries/republics/states...');
  const rows2 = await sparqlFetch(QUERY_DISSOLVED);
  console.log(`  ${rows2.length} rows`);

  const nodes = buildNodes([...rows1, ...rows2]);
  console.log(`\nBuilt ${nodes.length} entities (after dedup)`);
  console.log(`  With aliases:    ${nodes.filter(n => n.aliases?.length).length}`);
  console.log(`  With start year: ${nodes.filter(n => n.startYear).length}`);
  console.log(`  With end year:   ${nodes.filter(n => n.endYear).length}`);

  // Spot-check key entities — if any are missing, adjust SPARQL class list
  const SPOT_CHECK = ['Soviet Union', 'Ottoman Empire', 'Byzantine Empire'];
  for (const name of SPOT_CHECK) {
    const found = nodes.some(n =>
      n.name.includes(name) || (n.aliases ?? []).some(a => a.includes(name))
    );
    console.log(`  ${name}: ${found ? '✓' : '✗ MISSING — check SPARQL classes'}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const gazetteer = {
    id: 'world-historical',
    name: 'World — Historical States',
    locale: 'en',
    kind: 'point',
    description: `Dissolved political entities (empires, historical states, ancient countries). ${nodes.length} entities from Wikidata.`,
    source: {
      name: 'Wikidata',
      url: 'https://www.wikidata.org/',
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
    __dirname, '..', 'src', 'api', 'place-gazetteers', 'data', 'world-historical.json',
  );
  const json = JSON.stringify(gazetteer, null, 2);
  fs.writeFileSync(outputPath, json + '\n', 'utf-8');

  const sizeMb = (Buffer.byteLength(json) / 1_048_576).toFixed(2);
  console.log(`\nWritten: world-historical.json (${sizeMb} MB, ${nodes.length} entities)`);
  console.log('\nDone!');
}

main().catch(err => { console.error(err); process.exit(1); });
