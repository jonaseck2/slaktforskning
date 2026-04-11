/**
 * Build Swedish parish gazetteers from Wikidata.
 *
 * Produces TWO separate gazetteers:
 *   1. sv-socknar   — Civil parishes (socknar, Q18333556) ~2,523 entries
 *   2. sv-forsamlingar — Church parishes (församlingar, Q615980) ~3,446 entries
 *
 * These are separate because they serve different purposes in genealogy:
 *   - Socknar: Where people resided. Used in tax records, census, etc.
 *   - Församlingar: Church administrative units. Birth, baptism, marriage,
 *     and burial records are filed by församling. Swedish passports list
 *     birthplace as församling.
 * Users can toggle each independently in the app.
 *
 * Usage:
 *   npx tsx scripts/build-sv-parishes.ts
 *
 * Output:
 *   src/api/place-gazetteers/data/sv-socknar.json
 *   src/api/place-gazetteers/data/sv-forsamlingar.json
 *
 * ──────────────────────────────────────────────────────────────────────
 * DATA SOURCE
 * ──────────────────────────────────────────────────────────────────────
 * Wikidata SPARQL endpoint: https://query.wikidata.org/sparql
 * License: CC0 (public domain) — no attribution required, but we
 * document the source here for transparency.
 *
 * ──────────────────────────────────────────────────────────────────────
 * DESIGN DECISIONS
 * ──────────────────────────────────────────────────────────────────────
 *
 * 1. TWO SEPARATE GAZETTEERS
 *    Civil and church parishes are kept separate so users can enable
 *    the one(s) relevant to their research. Many parishes exist in
 *    both systems with the same name, but they're independent entities
 *    in Wikidata with distinct coordinates and metadata.
 *
 * 2. HIERARCHY: parish → kommun → län → Sverige
 *    Wikidata's P131 (located in administrative entity) gives us:
 *      parish → kommun (municipality) → län (county)
 *    We add Sverige as the root. This matches how Swedish genealogy
 *    place strings are typically formatted:
 *      "Vallsjö, Sävsjö, Jönköpings län, Sverige"
 *
 *    Note: The historical härad (hundred) level is NOT in Wikidata's
 *    P131 chain. Kommun is used instead. Härad could be added later
 *    via P1001 (jurisdiction) or manual mapping.
 *
 * 3. ALIASES
 *    Each parish gets aliases from:
 *    - Wikidata skos:altLabel (sv) — historical names, abbreviations,
 *      spelling variants, merged parish names
 *    - Automatic suffix stripping: "Vallsjö församling" → "Vallsjö",
 *      "Elleholms distrikt" → "Elleholm"
 *    The resolver also strips these suffixes at match time, so aliases
 *    are mainly for historical name variants.
 *
 * 4. COORDINATES
 *    Wikidata's P625 gives WKT Point(lon lat). We extract lat/lon.
 *    For kommun and län, we compute the centroid (mean of children).
 *    Sverige gets a hardcoded center point.
 *
 * 5. RATE LIMITING
 *    Wikidata asks for max 1 concurrent query. We run 2 sequential
 *    queries with a polite 2-second delay between them.
 *
 * ──────────────────────────────────────────────────────────────────────
 * EXTENDING THIS SCRIPT
 * ──────────────────────────────────────────────────────────────────────
 *
 * To add härad: Query P1001 (jurisdiction) on socknar. Many link to a
 * härad entity. Build härad as an intermediate level between kommun and
 * socken.
 *
 * To add historical counties: Some socknar existed in counties that were
 * merged (e.g. Göteborgs och Bohus län → Västra Götalands län in 1998).
 * Wikidata currently links to modern counties. Historical county mapping
 * would require P580/P582 (start/end time) qualifiers on P131.
 *
 * To refresh: Just re-run the script. It overwrites the output files.
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────

interface WikidataRow {
  item: string;        // Wikidata URI
  itemLabel: string;
  coord: string;       // WKT "Point(lon lat)"
  kommunLabel: string;
  countyLabel: string;
  altLabels: string;   // pipe-separated
}

interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
}

// ── Constants ────────────────────────────────────────────────────────

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');

const USER_AGENT = 'SlaktforskningGazetteerBuilder/1.0 (https://github.com/jonasahnstedt/slaktforskning)';

// Suffixes to strip when generating aliases
const PARISH_SUFFIXES = /\s+(församling|distrikt|socken|pastorat)$/i;

// Gazetteer definitions
const GAZETTEERS = [
  {
    classId: 'Q18333556',
    id: 'sv-socknar',
    name: 'Swedish Civil Parishes (Socknar)',
    gazDescription: 'Civil parishes (socknar) — where people resided. Used in tax records, census, and land records.',
    description: 'civil parishes (socknar)',
    filename: 'sv-socknar.json',
  },
  {
    classId: 'Q615980',
    id: 'sv-forsamlingar',
    name: 'Swedish Church Parishes (Församlingar)',
    gazDescription: 'Church parishes (församlingar) — used for vital records (birth, baptism, marriage, burial). Swedish passports list birthplace as församling.',
    description: 'church parishes (församlingar)',
    filename: 'sv-forsamlingar.json',
  },
];

// ── SPARQL query ─────────────────────────────────────────────────────

/**
 * Build a SPARQL query that fetches all parishes of a given class with
 * their coordinates, kommun, county, and Swedish alt labels.
 *
 * GROUP_CONCAT collects all alt labels into a single pipe-separated
 * string to avoid row multiplication from multiple alt labels per entity.
 */
function buildQuery(classId: string): string {
  return `
    SELECT
      ?item
      ?itemLabel
      ?coord
      ?kommunLabel
      ?countyLabel
      (GROUP_CONCAT(DISTINCT ?altLabel; SEPARATOR="|") AS ?altLabels)
    WHERE {
      ?item wdt:P31 wd:${classId} .
      ?item wdt:P625 ?coord .
      ?item wdt:P131 ?kommun .
      ?kommun wdt:P131 ?county .
      OPTIONAL {
        ?item skos:altLabel ?altLabel .
        FILTER(LANG(?altLabel) = "sv")
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "sv,en". }
    }
    GROUP BY ?item ?itemLabel ?coord ?kommunLabel ?countyLabel
  `;
}

// ── Fetch helper ─────────────────────────────────────────────────────

async function sparqlFetch(query: string): Promise<WikidataRow[]> {
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}\n${body}`);
  }

  const json = await response.json() as {
    results: {
      bindings: Array<Record<string, { value: string }>>;
    };
  };

  return json.results.bindings.map(b => ({
    item: b.item?.value ?? '',
    itemLabel: b.itemLabel?.value ?? '',
    coord: b.coord?.value ?? '',
    kommunLabel: b.kommunLabel?.value ?? '',
    countyLabel: b.countyLabel?.value ?? '',
    altLabels: b.altLabels?.value ?? '',
  }));
}

// ── Coordinate parsing ───────────────────────────────────────────────

/** Parse WKT "Point(lon lat)" → { lat, lon } */
function parseWktPoint(wkt: string): { lat: number; lon: number } | null {
  const match = wkt.match(/Point\(([^ ]+)\s+([^ ]+)\)/i);
  if (!match) return null;
  const lon = parseFloat(match[1]);
  const lat = parseFloat(match[2]);
  if (isNaN(lat) || isNaN(lon)) return null;
  return { lat: round6(lat), lon: round6(lon) };
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

// ── Alias generation ─────────────────────────────────────────────────

/**
 * Generate aliases for a parish. Combines:
 * 1. Wikidata altLabels (historical names, abbreviations, variants)
 * 2. Suffix-stripped form of the primary name
 */
function generateAliases(name: string, altLabels: string): string[] {
  const aliases = new Set<string>();

  // Add Wikidata alt labels
  if (altLabels) {
    for (const label of altLabels.split('|')) {
      const trimmed = label.trim();
      if (trimmed && trimmed !== name) {
        aliases.add(trimmed);
      }
    }
  }

  // Strip parish suffixes from name to generate bare alias
  const bare = name.replace(PARISH_SUFFIXES, '').trim();
  if (bare && bare !== name) {
    aliases.add(bare);
  }

  // Also strip suffixes from alt labels to catch "Fässbergs församling" → "Fässberg"
  for (const alias of [...aliases]) {
    const bareAlias = alias.replace(PARISH_SUFFIXES, '').trim();
    if (bareAlias && bareAlias !== alias && bareAlias !== name) {
      aliases.add(bareAlias);
    }
  }

  return [...aliases].sort();
}

// ── Tree building ────────────────────────────────────────────────────

/**
 * Build a hierarchical tree from Wikidata rows:
 *   Sverige → län → kommun → parish
 */
function buildTree(rows: WikidataRow[]): GazetteerNode {
  // län → kommun → parish name → { lat, lon, aliases }
  const tree = new Map<string, Map<string, Map<string, { lat: number; lon: number; aliases: string[] }>>>();

  for (const row of rows) {
    const coord = parseWktPoint(row.coord);
    if (!coord) continue;

    const county = row.countyLabel;
    const kommun = row.kommunLabel;
    const name = row.itemLabel;
    if (!county || !kommun || !name) continue;

    if (!tree.has(county)) tree.set(county, new Map());
    const countyMap = tree.get(county)!;
    if (!countyMap.has(kommun)) countyMap.set(kommun, new Map());
    const kommunMap = countyMap.get(kommun)!;

    if (!kommunMap.has(name)) {
      kommunMap.set(name, {
        lat: coord.lat,
        lon: coord.lon,
        aliases: generateAliases(name, row.altLabels),
      });
    }
  }

  // Convert to GazetteerNode tree
  const countyNodes: GazetteerNode[] = [];

  for (const [countyName, kommunMap] of [...tree.entries()].sort((a, b) => a[0].localeCompare(b[0], 'sv'))) {
    const kommunNodes: GazetteerNode[] = [];

    for (const [kommunName, parishMap] of [...kommunMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'sv'))) {
      const parishNodes: GazetteerNode[] = [];

      for (const [parishName, entry] of [...parishMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'sv'))) {
        const node: GazetteerNode = {
          name: parishName,
          type: 'parish',
          lat: entry.lat,
          lon: entry.lon,
        };
        if (entry.aliases.length > 0) node.aliases = entry.aliases;
        parishNodes.push(node);
      }

      // Kommun centroid = mean of parish coordinates
      const kommunLat = round6(parishNodes.reduce((s, n) => s + n.lat, 0) / parishNodes.length);
      const kommunLon = round6(parishNodes.reduce((s, n) => s + n.lon, 0) / parishNodes.length);

      // Kommun alias: strip " kommun" suffix
      const kommunAliases: string[] = [];
      const bareKommun = kommunName.replace(/\s+kommun$/i, '').trim();
      if (bareKommun && bareKommun !== kommunName) kommunAliases.push(bareKommun);

      const kommunNode: GazetteerNode = {
        name: kommunName,
        type: 'municipality',
        lat: kommunLat,
        lon: kommunLon,
        children: parishNodes,
      };
      if (kommunAliases.length > 0) kommunNode.aliases = kommunAliases;
      kommunNodes.push(kommunNode);
    }

    // County centroid = mean of kommun centroids
    const countyLat = round6(kommunNodes.reduce((s, n) => s + n.lat, 0) / kommunNodes.length);
    const countyLon = round6(kommunNodes.reduce((s, n) => s + n.lon, 0) / kommunNodes.length);

    // County alias: strip " län" suffix
    const countyAliases: string[] = [];
    const bareLan = countyName.replace(/\s+län$/i, '').trim();
    if (bareLan && bareLan !== countyName) countyAliases.push(bareLan);

    const countyNode: GazetteerNode = {
      name: countyName,
      type: 'county',
      lat: countyLat,
      lon: countyLon,
      children: kommunNodes,
    };
    if (countyAliases.length > 0) countyNode.aliases = countyAliases;
    countyNodes.push(countyNode);
  }

  return {
    name: 'Sverige',
    type: 'country',
    aliases: ['Sweden'],
    lat: 62.0,
    lon: 15.0,
    children: countyNodes,
  };
}

// ── Stats ────────────────────────────────────────────────────────────

function printStats(root: GazetteerNode): void {
  let counties = 0;
  let kommuner = 0;
  let parishes = 0;
  let withAliases = 0;

  for (const county of root.children ?? []) {
    counties++;
    for (const kommun of county.children ?? []) {
      kommuner++;
      for (const parish of kommun.children ?? []) {
        parishes++;
        if (parish.aliases && parish.aliases.length > 0) withAliases++;
      }
    }
  }

  console.log(`    Counties (län):      ${counties}`);
  console.log(`    Municipalities:      ${kommuner}`);
  console.log(`    Parishes:            ${parishes}`);
  console.log(`    Parishes w/ aliases: ${withAliases}`);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('Building Swedish parish gazetteers from Wikidata...\n');

  fs.mkdirSync(DATA_DIR, { recursive: true });

  for (let i = 0; i < GAZETTEERS.length; i++) {
    const gaz = GAZETTEERS[i];

    // Polite delay between queries
    if (i > 0) {
      console.log('  (waiting 2s between queries...)\n');
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`${i + 1}. Fetching ${gaz.description} (${gaz.classId})...`);
    const rows = await sparqlFetch(buildQuery(gaz.classId));
    console.log(`   Got ${rows.length} rows`);

    console.log('   Building hierarchy...');
    const root = buildTree(rows);

    const gazetteer = {
      id: gaz.id,
      name: gaz.name,
      locale: 'sv',
      description: gaz.gazDescription,
      source: {
        name: 'Wikidata',
        url: 'https://www.wikidata.org',
        license: 'CC0 1.0',
        fetched: new Date().toISOString().slice(0, 10),
      },
      root,
    };

    const outputPath = path.join(DATA_DIR, gaz.filename);
    const json = JSON.stringify(gazetteer, null, 2);
    fs.writeFileSync(outputPath, json + '\n', 'utf-8');

    const sizeMb = (Buffer.byteLength(json) / 1_048_576).toFixed(2);
    console.log(`   Written to ${gaz.filename} (${sizeMb} MB)`);
    printStats(root);
    console.log();
  }

  console.log('Done!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
