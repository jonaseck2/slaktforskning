/**
 * Build multilingual translation gazetteer for world-historical entities.
 *
 * Phase 1: Fetch QID → English label mappings (same classes as build-world-historical.ts).
 * Phase 2: Batch-query rdfs:label + skos:altLabel for each QID in batches of 80.
 * Phase 3: Build translations map and write output.
 *
 * Usage: npx tsx scripts/build-lang-world-historical.ts
 * Output: src/api/place-gazetteers/data/lang-world-historical.json
 * Source: Wikidata — CC0 1.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { sparqlFetch as sparqlFetchRaw, sleep } from '../src/gazetteer-build/sparql';

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');
const BATCH_SIZE = 80; // QIDs per label-fetch batch

// ── Types ────────────────────────────────────────────────────────────────────

interface EntityRow {
  item: string;      // full URI "http://www.wikidata.org/entity/Q15180"
  itemLabel: string; // English label
}

interface LabelRow {
  item: string;
  label: string;     // any non-English label or alt-label
}

// ── Phase-1 queries (same classes as build-world-historical.ts) ──────────────

const QUERY_HISTORICAL = `
SELECT ?item ?itemLabel WHERE {
  VALUES ?class { wd:Q3024240 wd:Q28171280 }
  ?item wdt:P31 ?class ; wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 10000
`;

const QUERY_DISSOLVED = `
SELECT ?item ?itemLabel WHERE {
  VALUES ?class { wd:Q6256 wd:Q7270 wd:Q7275 }
  ?item wdt:P31 ?class ; wdt:P576 ?dissolved ; wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 10000
`;

// ── Phase-2 label query ───────────────────────────────────────────────────────

function buildLabelQuery(qids: string[]): string {
  const values = qids.map(q => `<${q}>`).join(' ');
  return `
SELECT ?item ?label WHERE {
  VALUES ?item { ${values} }
  {
    ?item rdfs:label ?label .
  } UNION {
    ?item skos:altLabel ?label .
  }
  FILTER(LANG(?label) != "en")
}
LIMIT 50000
`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchEntities(query: string): Promise<EntityRow[]> {
  type B = Record<string, { value: string }>;
  const bindings = await sparqlFetchRaw<B>(query);
  return bindings.map(b => ({
    item: b.item?.value ?? '',
    itemLabel: b.itemLabel?.value ?? '',
  }));
}

async function fetchLabels(query: string): Promise<LabelRow[]> {
  type B = Record<string, { value: string }>;
  const bindings = await sparqlFetchRaw<B>(query);
  return bindings.map(b => ({
    item: b.item?.value ?? '',
    label: b.label?.value ?? '',
  }));
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────

// Load world-historical to get canonical English names
interface Gazetteer {
  root: { children?: { name: string }[] };
}

async function main() {
  console.log('Building multilingual translation gazetteer for world-historical...\n');

  const historicalPath = path.join(DATA_DIR, 'world-historical.json');
  const historical: Gazetteer = JSON.parse(fs.readFileSync(historicalPath, 'utf-8'));
  const canonicalNames = new Set((historical.root.children ?? []).map(n => n.name));
  console.log(`world-historical has ${canonicalNames.size} entities\n`);

  // ── Phase 1: get QID → English label ──────────────────────────────────────

  console.log('Phase 1: fetching entity QIDs...');

  console.log('  Query 1 (historical/ancient)...');
  const rows1 = await fetchEntities(QUERY_HISTORICAL);
  console.log(`    ${rows1.length} rows`);
  await sleep(2000);

  console.log('  Query 2 (dissolved)...');
  const rows2 = await fetchEntities(QUERY_DISSOLVED);
  console.log(`    ${rows2.length} rows`);
  await sleep(2000);

  // Deduplicate by QID, keep only entities that exist in world-historical
  const qidToName = new Map<string, string>();
  for (const row of [...rows1, ...rows2]) {
    if (!row.item || !row.itemLabel) continue;
    if (qidToName.has(row.item)) continue;
    if (canonicalNames.has(row.itemLabel)) {
      qidToName.set(row.item, row.itemLabel);
    }
  }
  console.log(`\n  ${qidToName.size} QIDs matched to world-historical entities`);

  // ── Phase 2: batch-fetch labels ────────────────────────────────────────────

  const allQids = [...qidToName.keys()];
  const batches = chunks(allQids, BATCH_SIZE);
  console.log(`\nPhase 2: fetching labels in ${batches.length} batches of ${BATCH_SIZE}...`);

  const labelsByQid = new Map<string, Set<string>>();
  for (const qid of allQids) labelsByQid.set(qid, new Set());

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    process.stdout.write(`  Batch ${i + 1}/${batches.length}... `);
    try {
      const labelRows = await fetchLabels(buildLabelQuery(batch));
      for (const { item, label } of labelRows) {
        if (!item || !label) continue;
        labelsByQid.get(item)?.add(label);
      }
      console.log(`${labelRows.length} labels`);
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message} — skipping batch`);
    }
    if (i < batches.length - 1) await sleep(1200);
  }

  // ── Phase 3: build translations map ───────────────────────────────────────

  console.log('\nPhase 3: building translations map...');

  // Path-key format: 'World (Historical) › <english entity name>' (joined
  // by U+203A) — matches the merge engine's mergeTranslations split.
  const SEP = ' › ';
  const translations: Record<string, string[]> = {};
  let withTranslations = 0;

  for (const [qid, englishName] of qidToName) {
    const labels = labelsByQid.get(qid);
    if (!labels || labels.size === 0) continue;
    translations[`World (Historical)${SEP}${englishName}`] = [...labels];
    withTranslations++;
  }

  const totalNames = Object.values(translations).reduce((s, v) => s + v.length, 0);
  console.log(`  ${withTranslations} entities with translations`);
  console.log(`  ${totalNames} total translation entries`);

  // Spot-check
  const CHECK = ['Soviet Union', 'Ottoman Empire', 'Byzantine Empire'];
  console.log('\nSpot-check:');
  for (const name of CHECK) {
    const names = translations[name] ?? [];
    const preview = names.slice(0, 4).join(', ');
    console.log(`  ${name}: ${names.length} translations (${preview}${names.length > 4 ? '...' : ''})`);
  }

  // ── Write output ────────────────────────────────────────────────────────────

  const today = new Date().toISOString().slice(0, 10);
  const gazetteer = {
    id: 'lang-world-historical',
    name: 'World Historical States — All Languages',
    locale: 'all',
    kind: 'language',
    description: `Multilingual names for ${withTranslations} historical political entities in all available Wikidata languages.`,
    source: {
      name: 'Wikidata',
      url: 'https://www.wikidata.org/',
      license: 'CC0 1.0',
      fetched: today,
    },
    root: { name: 'lang-world-historical', type: 'language', lat: 0, lon: 0 },
    translations: {
      __merged__: translations,
    },
  };

  const outPath = path.join(DATA_DIR, 'lang-world-historical.json');
  fs.writeFileSync(outPath, JSON.stringify(gazetteer) + '\n', 'utf-8');

  const sizeKB = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`\nWritten: lang-world-historical.json (${sizeKB} KB)`);
  console.log('\nDone!');
}

main().catch(err => { console.error(err); process.exit(1); });
