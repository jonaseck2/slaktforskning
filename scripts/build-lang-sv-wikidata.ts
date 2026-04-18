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

// ── Constants ────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'SlaktforskningGazetteerBuilder/1.0 (https://github.com/jonasahnstedt/slaktforskning)';

// Standard Wikidata SPARQL prefix declarations (rdfs: is not auto-imported)
const SPARQL_PREFIXES = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
`;

// ── Types ────────────────────────────────────────────────────────────────

interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
}

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
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(fullQuery)}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}\n${body.slice(0, 500)}`);
  }

  const json = await response.json() as {
    results: {
      bindings: Array<Record<string, { value: string }>>;
    };
  };

  return json.results.bindings.map(b => ({
    nativeLabel: b.nativeLabel?.value ?? '',
    svLabel: b.svLabel?.value ?? '',
  }));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

/**
 * Danish parishes (Q814648) and former parishes (Q102854139).
 * Native language: da, Swedish label: sv.
 */
const DK_SOGNE_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  { ?item wdt:P31 wd:Q814648 . }
  UNION
  { ?item wdt:P31 wd:Q102854139 . }
  ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "da")
  ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
  FILTER(?nativeLabel != ?svLabel)
}
`;

/**
 * Danish municipalities (Q29946056) — for region/kommune matching.
 */
const DK_KOMMUNER_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31/wdt:P279* wd:Q29946056 .
  ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "da")
  ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
  FILTER(?nativeLabel != ?svLabel)
}
`;

/**
 * Danish regions (Q1523821).
 */
const DK_REGIONS_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q1523821 .
  ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "da")
  ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
  FILTER(?nativeLabel != ?svLabel)
}
`;

/**
 * Norwegian municipalities (Q755707).
 */
const NO_KOMMUNER_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q755707 .
  ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "no")
  ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
  FILTER(?nativeLabel != ?svLabel)
}
`;

/**
 * Norwegian counties/fylker (Q5880884 = fylke of Norway).
 */
const NO_FYLKER_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q5880884 .
  ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "no")
  ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
  FILTER(?nativeLabel != ?svLabel)
}
`;

/**
 * Finnish municipalities (Q515708).
 * Finland is officially bilingual; many municipalities have Swedish names.
 * Native language: fi, Swedish label: sv.
 */
const FI_KUNNAT_FI_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q515708 .
  ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "fi")
  ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
  FILTER(?nativeLabel != ?svLabel)
}
`;

/**
 * Finnish municipalities — also via native Swedish label (for bilingual communes
 * where the Swedish name is the official native name too).
 * This catches cases where ?nativeLabel = ?svLabel but the Finnish name differs.
 * We still want to map Finnish name → Swedish name.
 */
const FI_KUNNAT_SV_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q515708 .
  ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "fi")
  ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
}
`;

/**
 * Finnish regions (Q1307620 = region of Finland).
 */
const FI_MAAKUNTA_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q1307620 .
  ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "fi")
  ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
  FILTER(?nativeLabel != ?svLabel)
}
`;

/**
 * Icelandic municipalities (Q132700).
 */
const IS_SVEITARFELOG_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q132700 .
  ?item rdfs:label ?nativeLabel . FILTER(LANG(?nativeLabel) = "is")
  ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
  FILTER(?nativeLabel != ?svLabel)
}
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

  console.log('Loaded 5 target gazetteers.');
  console.log('Building name indices...\n');

  const dkSogneIndex = buildNameIndex(dkSogne.root);
  const dkSogneDawaIndex = buildNameIndex(dkSogneDawa.root);
  const noKommunerIndex = buildNameIndex(noKommuner.root);
  const fiKunnatIndex = buildNameIndex(fiKunnat.root);
  const isSveitarfelogIndex = buildNameIndex(isSveitarfelog.root);

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

  // Danish municipalities/regions (for kommune + region name matching)
  const dkKommunerRows = await fetchWithRetry(DK_KOMMUNER_QUERY, 'Danish municipalities (kommuner)');
  await sleep(1500);

  const dkRegionRows = await fetchWithRetry(DK_REGIONS_QUERY, 'Danish regions');
  await sleep(1500);

  // Norwegian municipalities
  const noKommunerRows = await fetchWithRetry(NO_KOMMUNER_QUERY, 'Norwegian municipalities (kommuner)');
  await sleep(1500);

  const noFylkerRows = await fetchWithRetry(NO_FYLKER_QUERY, 'Norwegian counties (fylker)');
  await sleep(1500);

  // Finnish municipalities (Finnish names → Swedish)
  const fiKunnatRows = await fetchWithRetry(FI_KUNNAT_FI_QUERY, 'Finnish municipalities (fi → sv, differing only)');
  await sleep(1500);

  // Also include all Finnish → Swedish mappings (even where fi==sv, to map fi names in our gazetteer)
  const fiKunnatAllRows = await fetchWithRetry(FI_KUNNAT_SV_QUERY, 'Finnish municipalities (fi → sv, all)');
  await sleep(1500);

  const fiMaakuntaRows = await fetchWithRetry(FI_MAAKUNTA_QUERY, 'Finnish regions (maakunnat)');
  await sleep(1500);

  // Icelandic municipalities
  const isRows = await fetchWithRetry(IS_SVEITARFELOG_QUERY, 'Icelandic municipalities (sveitarfélög)');

  // ── Build translation maps ──────────────────────────────────────────

  console.log('\nBuilding translation maps...');

  // Merge rows for dk-sogne (parishes + municipalities + regions all affect the same tree)
  const dkAllRows = [...dkSogneRows, ...dkKommunerRows, ...dkRegionRows];
  const dkSogneTranslations = buildTranslationMap(dkAllRows, dkSogneIndex);
  const dkSogneDawaTranslations = buildTranslationMap(dkAllRows, dkSogneDawaIndex);

  // Norwegian: merge kommuner + fylker
  const noAllRows = [...noKommunerRows, ...noFylkerRows];
  const noTranslations = buildTranslationMap(noAllRows, noKommunerIndex);

  // Finnish: use the full set (fi → sv all), so Finnish municipality names in our
  // gazetteer get Swedish translations even when fi name == sv name.
  const fiAllRows = [...fiKunnatRows, ...fiKunnatAllRows, ...fiMaakuntaRows];
  const fiTranslations = buildTranslationMap(fiAllRows, fiKunnatIndex);

  // Icelandic
  const isTranslations = buildTranslationMap(isRows, isSveitarfelogIndex);

  // ── Stats ───────────────────────────────────────────────────────────

  console.log(`  dk-sogne:        ${Object.keys(dkSogneTranslations).length} translated nodes`);
  console.log(`  dk-sogne-dawa:   ${Object.keys(dkSogneDawaTranslations).length} translated nodes`);
  console.log(`  no-kommuner:     ${Object.keys(noTranslations).length} translated nodes`);
  console.log(`  fi-kunnat:       ${Object.keys(fiTranslations).length} translated nodes`);
  console.log(`  is-sveitarfelog: ${Object.keys(isTranslations).length} translated nodes`);

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
