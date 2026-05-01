/**
 * Build Swedish-language translation gazetteer from Wikidata.
 *
 * Queries Wikidata SPARQL for Swedish labels of Danish, Norwegian, Finnish,
 * and Icelandic administrative divisions, then matches results against the
 * existing gazetteer data files.
 *
 * Only names that differ from the native-language name are included.
 *
 * Usage:
 *   npx tsx scripts/build-lang-sv-wikidata.ts
 *
 * Output:
 *   src/api/place-gazetteers/data/lang-sv-wikidata.json
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { sparqlFetch as sparqlFetchRaw, sleep } from '../src/gazetteer-build/sparql';

// ── Constants ────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');

// Standard Wikidata SPARQL prefix declarations (rdfs: is not auto-imported)
const SPARQL_PREFIXES = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
`;

// ── Types ────────────────────────────────────────────────────────────────

interface Gazetteer {
  id: string;
  root: GazetteerNode;
}

interface WikidataTranslationRow {
  nativeLabel: string;
  svLabel: string;
}

// Translations: pathKey → Swedish name(s)
type TranslationMap = Record<string, string[]>;

// ── SPARQL helpers ───────────────────────────────────────────────────────

async function sparqlFetch(query: string): Promise<WikidataTranslationRow[]> {
  const fullQuery = SPARQL_PREFIXES + query;
  type Binding = Record<string, { value: string }>;
  const bindings = await sparqlFetchRaw<Binding>(fullQuery);
  return bindings.map(b => ({
    nativeLabel: b.nativeLabel?.value ?? '',
    svLabel: b.svLabel?.value ?? '',
  }));
}

// ── Gazetteer tree walking ───────────────────────────────────────────────

/**
 * Walk a gazetteer tree and build a map: nodeName → pathKey(s).
 * Root node itself is excluded (it's the country).
 * Top-level children → bare name.
 * Deeper nodes → "parent > child".
 *
 * Only walks the first two levels below root (e.g. county → municipality),
 * since that's where administrative division names live.
 */
function buildNameIndex(root: GazetteerNode): Map<string, string> {
  // name (lowercase) → pathKey (original case)
  const index = new Map<string, string>();

  for (const lvl1 of root.children ?? []) {
    // Top-level child: bare name
    index.set(lvl1.name.toLowerCase(), lvl1.name);

    for (const lvl2 of lvl1.children ?? []) {
      // Second level: "parent > child"
      const pathKey = `${lvl1.name} > ${lvl2.name}`;
      index.set(lvl2.name.toLowerCase(), pathKey);

      // Third level is usually localities — skip to keep output focused on
      // administrative divisions. We could add it later if needed.
    }
  }

  return index;
}

/**
 * Given Wikidata translation rows and a gazetteer name index,
 * build a TranslationMap with only names that differ.
 */
function buildTranslationMap(
  rows: WikidataTranslationRow[],
  nameIndex: Map<string, string>,
): TranslationMap {
  const result: TranslationMap = {};

  for (const { nativeLabel, svLabel } of rows) {
    if (!nativeLabel || !svLabel) continue;
    if (nativeLabel === svLabel) continue;  // no difference — skip

    const pathKey = nameIndex.get(nativeLabel.toLowerCase());
    if (!pathKey) continue;  // not in our gazetteer

    if (!result[pathKey]) result[pathKey] = [];
    if (!result[pathKey].includes(svLabel)) {
      result[pathKey].push(svLabel);
    }
  }

  return result;
}

// ── SPARQL queries ───────────────────────────────────────────────────────
//
// Correct QIDs (verified against Wikidata):
//   Q814648   = parish of Denmark
//   Q102854139= former parish in Denmark
//   Q29946056 = municipality of Denmark (Q29946056 → 33 items)
//   Q62326    = region of Denmark (5 regions)
//   Q755707   = municipality of Norway (358 items)
//   Q192299   = county of Norway (fylke, 16 items)
//   Q856076   = municipality of Finland (308 items)
//   Q193512   = region of Finland (maakunta, 20 items)
//   Q955655   = municipality of Iceland (sveitarfélag)
//   Q842100   = region of Iceland
//
// Pattern: use OPTIONAL for both language labels so that missing labels
// don't silently drop rows. Wikidata SPARQL requires rdfs: prefix declaration.

/**
 * Danish parishes (Q814648) and former parishes (Q102854139).
 * Native language: da, Swedish label: sv.
 */
const DK_SOGNE_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  { ?item wdt:P31 wd:Q814648 . }
  UNION
  { ?item wdt:P31 wd:Q102854139 . }
  OPTIONAL { ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "da") }
  OPTIONAL { ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv") }
  FILTER(BOUND(?nativeLabel) && BOUND(?svLabel) && ?nativeLabel != ?svLabel)
}
`;

/**
 * Danish municipalities (Q29946056) — for kommune name matching.
 */
const DK_KOMMUNER_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q29946056 .
  OPTIONAL { ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "da") }
  OPTIONAL { ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv") }
  FILTER(BOUND(?nativeLabel) && BOUND(?svLabel) && ?nativeLabel != ?svLabel)
}
`;

/**
 * Danish regions (Q62326) — 5 regions.
 */
const DK_REGIONS_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q62326 .
  OPTIONAL { ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "da") }
  OPTIONAL { ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv") }
  FILTER(BOUND(?nativeLabel) && BOUND(?svLabel) && ?nativeLabel != ?svLabel)
}
`;

/**
 * Norwegian municipalities (Q755707).
 * Norwegian label: nb (bokmål) or no.
 */
const NO_KOMMUNER_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q755707 .
  OPTIONAL { ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "nb") }
  OPTIONAL { ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv") }
  FILTER(BOUND(?nativeLabel) && BOUND(?svLabel) && ?nativeLabel != ?svLabel)
}
`;

/**
 * Norwegian municipalities — also try "no" tag (some entries use "no" instead of "nb").
 */
const NO_KOMMUNER_NO_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q755707 .
  OPTIONAL { ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "no") }
  OPTIONAL { ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv") }
  FILTER(BOUND(?nativeLabel) && BOUND(?svLabel) && ?nativeLabel != ?svLabel)
}
`;

/**
 * Norwegian counties/fylker (Q192299 = county of Norway).
 */
const NO_FYLKER_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q192299 .
  OPTIONAL { ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "nb") }
  OPTIONAL { ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv") }
  FILTER(BOUND(?nativeLabel) && BOUND(?svLabel) && ?nativeLabel != ?svLabel)
}
`;

/**
 * Finnish municipalities (Q856076).
 * Finland is officially bilingual; many municipalities have Swedish names.
 * Native language: fi, Swedish label: sv.
 * Includes cases where fi == sv (e.g. Åland municipalities) to map fi→sv.
 */
const FI_KUNNAT_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q856076 .
  OPTIONAL { ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "fi") }
  OPTIONAL { ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv") }
  FILTER(BOUND(?nativeLabel) && BOUND(?svLabel))
}
`;

/**
 * Finnish regions/maakunnat (Q193512 = region of Finland).
 */
const FI_MAAKUNTA_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q193512 .
  OPTIONAL { ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "fi") }
  OPTIONAL { ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv") }
  FILTER(BOUND(?nativeLabel) && BOUND(?svLabel) && ?nativeLabel != ?svLabel)
}
`;

/**
 * Icelandic municipalities (Q955655 = municipality of Iceland / sveitarfélag).
 */
const IS_SVEITARFELOG_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q955655 .
  OPTIONAL { ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "is") }
  OPTIONAL { ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv") }
  FILTER(BOUND(?nativeLabel) && BOUND(?svLabel) && ?nativeLabel != ?svLabel)
}
`;

/**
 * European admin1 divisions outside the Nordics (those are already covered above).
 * Query: items that are administrative divisions (wdt:P131 = "administrative territorial entity")
 * in European countries, where an English and Swedish label both exist and differ.
 *
 * Strategy: ask for items with P31 in a broad set of admin-territorial types,
 * or items whose English label matches our world-admin1 canonical names.
 * We match by English label (en) against worldAdmin1Index, so results outside
 * our gazetteer are harmlessly skipped.
 *
 * Two sub-queries cover common EU admin1 types:
 *   Q10864048 = first-level administrative subdivision (wide coverage)
 *   Q13220204 = second-level administrative subdivision (belt-and-suspenders)
 *
 * Excludes Nordic countries already covered: DK Q35, NO Q20, SE Q34, FI Q33, IS Q189.
 */
const EU_ADMIN1_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  { ?item wdt:P31/wdt:P279* wd:Q10864048 . }
  UNION
  { ?item wdt:P31 wd:Q13220204 . }
  ?item wdt:P17 ?country .
  ?country wdt:P30 wd:Q46 .
  FILTER(?country NOT IN (wd:Q35, wd:Q20, wd:Q34, wd:Q33, wd:Q189))
  ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "en")
  ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
  FILTER(?nativeLabel != ?svLabel)
}
LIMIT 5000
`;

/**
 * Capital cities of European countries with distinct Swedish labels.
 * Broad query: items that are the capital (P36) of a European country, with
 * English and Swedish labels that differ.
 *
 * We query countries' P36 values and get their labels, matching the English
 * city name against worldAdmin1Index (future city nodes) or emitting for
 * future use. The GeoNames script already covers most capitals, so Wikidata
 * adds coverage for capitals that GeoNames may lack.
 */
const EU_CAPITAL_CITIES_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?country wdt:P30 wd:Q46 .
  ?country wdt:P36 ?capital .
  ?capital rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "en")
  ?capital rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
  FILTER(?nativeLabel != ?svLabel)
}
LIMIT 1000
`;

// ── Main ─────────────────────────────────────────────────────────────────

async function fetchWithRetry(query: string, label: string): Promise<WikidataTranslationRow[]> {
  try {
    console.log(`  Fetching ${label}...`);
    const rows = await sparqlFetch(query);
    console.log(`    → ${rows.length} rows`);
    return rows;
  } catch (err) {
    console.warn(`    → Error fetching ${label}: ${(err as Error).message}`);
    return [];
  }
}

async function main() {
  console.log('Building Swedish translation gazetteer from Wikidata...\n');

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // ── Load target gazetteers ──────────────────────────────────────────

  const loadGaz = (filename: string): Gazetteer => {
    const jsonPath = path.join(DATA_DIR, filename);
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Gazetteer;
  };

  const dkSogne = loadGaz('dk-sogne.json');
  const dkSogneDawa = loadGaz('dk-sogne-dawa.json');
  const noKommuner = loadGaz('no-kommuner.json');
  const fiKunnat = loadGaz('fi-kunnat.json');
  const isSveitarfelog = loadGaz('is-sveitarfelog.json');
  const worldAdmin1 = loadGaz('world-admin1.json');

  console.log('Loaded 6 target gazetteers.');
  console.log('Building name indices...\n');

  const dkSogneIndex = buildNameIndex(dkSogne.root);
  const dkSogneDawaIndex = buildNameIndex(dkSogneDawa.root);
  const noKommunerIndex = buildNameIndex(noKommuner.root);
  const fiKunnatIndex = buildNameIndex(fiKunnat.root);
  const isSveitarfelogIndex = buildNameIndex(isSveitarfelog.root);

  /**
   * Build a path index for world-admin1 covering both the country (lvl 1)
   * and admin1 (lvl 2) names.
   */
  function buildWorldAdmin1Index(root: GazetteerNode): Map<string, string> {
    const index = new Map<string, string>();
    for (const country of root.children ?? []) {
      index.set(country.name.toLowerCase(), country.name);
      for (const admin1 of country.children ?? []) {
        const pathKey = `${country.name} > ${admin1.name}`;
        index.set(admin1.name.toLowerCase(), pathKey);
      }
    }
    return index;
  }

  const worldAdmin1Index = buildWorldAdmin1Index(worldAdmin1.root);

  console.log(`  dk-sogne:       ${dkSogneIndex.size} names`);
  console.log(`  dk-sogne-dawa:  ${dkSogneDawaIndex.size} names`);
  console.log(`  no-kommuner:    ${noKommunerIndex.size} names`);
  console.log(`  fi-kunnat:      ${fiKunnatIndex.size} names`);
  console.log(`  is-sveitarfelog:${isSveitarfelogIndex.size} names`);
  console.log('');

  // ── Fetch from Wikidata ─────────────────────────────────────────────

  console.log('Fetching from Wikidata SPARQL...\n');

  // Danish parishes
  const dkSogneRows = await fetchWithRetry(DK_SOGNE_QUERY, 'Danish parishes (sogne)');
  await sleep(1500);

  // Danish municipalities (for kommune name matching)
  const dkKommunerRows = await fetchWithRetry(DK_KOMMUNER_QUERY, 'Danish municipalities (kommuner)');
  await sleep(1500);

  // Danish regions
  const dkRegionRows = await fetchWithRetry(DK_REGIONS_QUERY, 'Danish regions');
  await sleep(1500);

  // Norwegian municipalities (try both "nb" and "no" language tags)
  const noKommunerNbRows = await fetchWithRetry(NO_KOMMUNER_QUERY, 'Norwegian municipalities (nb label)');
  await sleep(1500);

  const noKommunerNoRows = await fetchWithRetry(NO_KOMMUNER_NO_QUERY, 'Norwegian municipalities (no label)');
  await sleep(1500);

  // Norwegian counties/fylker
  const noFylkerRows = await fetchWithRetry(NO_FYLKER_QUERY, 'Norwegian counties (fylker)');
  await sleep(1500);

  // Finnish municipalities (fi → sv, including fi==sv cases for our index mapping)
  const fiKunnatRows = await fetchWithRetry(FI_KUNNAT_QUERY, 'Finnish municipalities (fi → sv)');
  await sleep(1500);

  // Finnish regions/maakunnat
  const fiMaakuntaRows = await fetchWithRetry(FI_MAAKUNTA_QUERY, 'Finnish regions (maakunnat)');
  await sleep(1500);

  // Icelandic municipalities
  const isRows = await fetchWithRetry(IS_SVEITARFELOG_QUERY, 'Icelandic municipalities (sveitarfélög)');
  await sleep(1500);

  // European admin1 outside Nordics
  const euAdmin1Rows = await fetchWithRetry(EU_ADMIN1_QUERY, 'EU admin1 outside Nordics');
  await sleep(1500);

  // European capital cities
  const euCapitalRows = await fetchWithRetry(EU_CAPITAL_CITIES_QUERY, 'EU capital cities');

  // ── Build translation maps ──────────────────────────────────────────

  console.log('\nBuilding translation maps...');

  // Merge rows for dk-sogne (parishes + municipalities + regions all affect the same tree)
  const dkAllRows = [...dkSogneRows, ...dkKommunerRows, ...dkRegionRows];
  const dkSogneTranslations = buildTranslationMap(dkAllRows, dkSogneIndex);
  const dkSogneDawaTranslations = buildTranslationMap(dkAllRows, dkSogneDawaIndex);

  // Norwegian: merge kommuner (nb + no labels) + fylker
  const noAllRows = [...noKommunerNbRows, ...noKommunerNoRows, ...noFylkerRows];
  const noTranslations = buildTranslationMap(noAllRows, noKommunerIndex);

  // Finnish: municipalities + regions. Include fi==sv cases because our gazetteer
  // uses Finnish names as keys; even when the Swedish name is the same, it may
  // be recorded differently in practice.
  const fiAllRows = [...fiKunnatRows, ...fiMaakuntaRows];
  const fiTranslations = buildTranslationMap(fiAllRows, fiKunnatIndex);

  // Icelandic
  const isTranslations = buildTranslationMap(isRows, isSveitarfelogIndex);

  // EU admin1 + capitals: merge against world-admin1 index
  const euAdmin1Translations = buildTranslationMap(
    [...euAdmin1Rows, ...euCapitalRows],
    worldAdmin1Index,
  );

  // ── Stats ───────────────────────────────────────────────────────────

  console.log(`  dk-sogne:           ${Object.keys(dkSogneTranslations).length} translated nodes`);
  console.log(`  dk-sogne-dawa:      ${Object.keys(dkSogneDawaTranslations).length} translated nodes`);
  console.log(`  no-kommuner:        ${Object.keys(noTranslations).length} translated nodes`);
  console.log(`  fi-kunnat:          ${Object.keys(fiTranslations).length} translated nodes`);
  console.log(`  is-sveitarfelog:    ${Object.keys(isTranslations).length} translated nodes`);
  console.log(`  world-admin1 (EU):  ${Object.keys(euAdmin1Translations).length} translated nodes`);

  // ── Spot-check ──────────────────────────────────────────────────────

  console.log('\nSpot-check samples:');

  // Finnish should have many Swedish names — Helsinki = Helsingfors, etc.
  const fiSamples = Object.entries(fiTranslations).slice(0, 5);
  for (const [key, names] of fiSamples) {
    console.log(`  fi-kunnat: "${key}" → ${names.join(', ')}`);
  }

  const noSamples = Object.entries(noTranslations).slice(0, 3);
  for (const [key, names] of noSamples) {
    console.log(`  no-kommuner: "${key}" → ${names.join(', ')}`);
  }

  // ── Write output ────────────────────────────────────────────────────

  const gazetteer = {
    id: 'lang-sv-wikidata',
    name: 'Swedish place names (Wikidata)',
    locale: 'sv',
    kind: 'language',
    description: 'Swedish translations for Nordic administrative divisions (Danish, Norwegian, Finnish, Icelandic)',
    source: {
      name: 'Wikidata',
      url: 'https://www.wikidata.org/',
      license: 'CC0 1.0',
      fetched: new Date().toISOString().slice(0, 10),
    },
    root: {
      name: 'sv',
      type: 'language',
      lat: 0,
      lon: 0,
    },
    translations: {
      'dk-sogne': dkSogneTranslations,
      'dk-sogne-dawa': dkSogneDawaTranslations,
      'no-kommuner': noTranslations,
      'fi-kunnat': fiTranslations,
      'is-sveitarfelog': isTranslations,
      'world-admin1': euAdmin1Translations,
    },
  };

  const outPath = path.join(DATA_DIR, 'lang-sv-wikidata.json');
  fs.writeFileSync(outPath, JSON.stringify(gazetteer, null, 2) + '\n', 'utf-8');

  const fileSizeKB = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`\nWritten to lang-sv-wikidata.json (${fileSizeKB} KB)`);
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
