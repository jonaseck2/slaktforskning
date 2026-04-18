/**
 * Build Danish parish gazetteer from Wikidata.
 *
 * Produces ONE gazetteer:
 *   dk-sogne — Danish parishes (sogne, Q814648 + Q102854139)
 *
 * Sogne are the basic ecclesiastical unit for vital records in Denmark.
 * Both current parishes (Q814648) and former parishes (Q102854139) are
 * included, since genealogy research spans historical periods.
 *
 * Usage:
 *   npx tsx scripts/build-dk-parishes.ts
 *
 * Output:
 *   src/api/place-gazetteers/data/dk-sogne.json
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
 * 1. SINGLE GAZETTEER
 *    Unlike Sweden (separate socknar/församlingar), Denmark has one
 *    parish system (sogne) that serves both civil and ecclesiastical
 *    purposes.
 *
 * 2. HIERARCHY: sogn → kommune → region → Danmark
 *    Wikidata's P131 (located in administrative entity) gives us:
 *      parish → kommune (municipality) → region
 *    We add Danmark as the root. This matches how Danish genealogy
 *    place strings are typically formatted:
 *      "Holbæk, Holbæk Kommune, Region Sjælland, Danmark"
 *
 * 3. TWO WIKIDATA CLASSES
 *    Q814648 (parish of Denmark) covers current parishes.
 *    Q102854139 (former parish in Denmark) covers historical ones.
 *    Both are fetched via UNION in a single SPARQL query.
 *
 * 4. ALIASES
 *    Each parish gets aliases from:
 *    - Wikidata skos:altLabel (da) — historical names, variants
 *    - Automatic suffix stripping: "Holbæk Sogn" → "Holbæk"
 *
 * 5. COORDINATES
 *    Wikidata's P625 gives WKT Point(lon lat). We extract lat/lon.
 *    For kommune and region, we compute the centroid (mean of children).
 *    Danmark gets a hardcoded center point.
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────

interface WikidataRow {
  item: string;        // Wikidata URI
  itemLabel: string;
  coord: string;       // WKT "Point(lon lat)"
  kommuneLabel: string;
  regionLabel: string;
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
const PARISH_SUFFIXES = /\s+(sogn|pastorat|kirkedistrikt)$/i;

// ── SPARQL query ─────────────────────────────────────────────────────

/**
 * SPARQL query fetching all Danish parishes (current + former) with
 * coordinates, kommune, region, and Danish alt labels.
 *
 * Uses UNION to combine Q814648 (parish of Denmark) and Q102854139
 * (former parish in Denmark).
 */
const QUERY = `
  SELECT ?item ?itemLabel ?coord ?kommuneLabel ?regionLabel
    (GROUP_CONCAT(DISTINCT ?altLabel; SEPARATOR="|") AS ?altLabels)
  WHERE {
    { ?item wdt:P31 wd:Q814648 . }
    UNION
    { ?item wdt:P31 wd:Q102854139 . }
    ?item wdt:P625 ?coord .
    ?item wdt:P131 ?kommune .
    ?kommune wdt:P131 ?region .
    OPTIONAL {
      ?item skos:altLabel ?altLabel .
      FILTER(LANG(?altLabel) = "da")
    }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "da,en". }
  }
  GROUP BY ?item ?itemLabel ?coord ?kommuneLabel ?regionLabel
`;

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
    kommuneLabel: b.kommuneLabel?.value ?? '',
    regionLabel: b.regionLabel?.value ?? '',
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

  // Also strip suffixes from alt labels
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
 *   Danmark → region → kommune → parish
 */
function buildTree(rows: WikidataRow[]): GazetteerNode {
  // region → kommune → parish name → { lat, lon, aliases }
  const tree = new Map<string, Map<string, Map<string, { lat: number; lon: number; aliases: string[] }>>>();

  for (const row of rows) {
    const coord = parseWktPoint(row.coord);
    if (!coord) continue;

    const region = row.regionLabel;
    const kommune = row.kommuneLabel;
    const name = row.itemLabel;
    if (!region || !kommune || !name) continue;

    if (!tree.has(region)) tree.set(region, new Map());
    const regionMap = tree.get(region)!;
    if (!regionMap.has(kommune)) regionMap.set(kommune, new Map());
    const kommuneMap = regionMap.get(kommune)!;

    if (!kommuneMap.has(name)) {
      kommuneMap.set(name, {
        lat: coord.lat,
        lon: coord.lon,
        aliases: generateAliases(name, row.altLabels),
      });
    }
  }

  // Convert to GazetteerNode tree
  const regionNodes: GazetteerNode[] = [];

  for (const [regionName, kommuneMap] of [...tree.entries()].sort((a, b) => a[0].localeCompare(b[0], 'da'))) {
    const kommuneNodes: GazetteerNode[] = [];

    for (const [kommuneName, parishMap] of [...kommuneMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'da'))) {
      const parishNodes: GazetteerNode[] = [];

      for (const [parishName, entry] of [...parishMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'da'))) {
        const node: GazetteerNode = {
          name: parishName,
          type: 'parish',
          lat: entry.lat,
          lon: entry.lon,
        };
        if (entry.aliases.length > 0) node.aliases = entry.aliases;
        parishNodes.push(node);
      }

      // Kommune centroid = mean of parish coordinates
      const kommuneLat = round6(parishNodes.reduce((s, n) => s + n.lat, 0) / parishNodes.length);
      const kommuneLon = round6(parishNodes.reduce((s, n) => s + n.lon, 0) / parishNodes.length);

      // Kommune alias: strip " Kommune" suffix
      const kommuneAliases: string[] = [];
      const bareKommune = kommuneName.replace(/\s+kommune$/i, '').trim();
      if (bareKommune && bareKommune !== kommuneName) kommuneAliases.push(bareKommune);

      const kommuneNode: GazetteerNode = {
        name: kommuneName,
        type: 'municipality',
        lat: kommuneLat,
        lon: kommuneLon,
        children: parishNodes,
      };
      if (kommuneAliases.length > 0) kommuneNode.aliases = kommuneAliases;
      kommuneNodes.push(kommuneNode);
    }

    // Region centroid = mean of kommune centroids
    const regionLat = round6(kommuneNodes.reduce((s, n) => s + n.lat, 0) / kommuneNodes.length);
    const regionLon = round6(kommuneNodes.reduce((s, n) => s + n.lon, 0) / kommuneNodes.length);

    // Region alias: strip "Region " prefix
    const regionAliases: string[] = [];
    const bareRegion = regionName.replace(/^Region\s+/i, '').trim();
    if (bareRegion && bareRegion !== regionName) regionAliases.push(bareRegion);

    const regionNode: GazetteerNode = {
      name: regionName,
      type: 'region',
      lat: regionLat,
      lon: regionLon,
      children: kommuneNodes,
    };
    if (regionAliases.length > 0) regionNode.aliases = regionAliases;
    regionNodes.push(regionNode);
  }

  return {
    name: 'Danmark',
    type: 'country',
    aliases: ['Denmark'],
    lat: 56.0,
    lon: 10.0,
    children: regionNodes,
  };
}

// ── Stats ────────────────────────────────────────────────────────────

function printStats(root: GazetteerNode): void {
  let regions = 0;
  let kommuner = 0;
  let parishes = 0;
  let withAliases = 0;

  for (const region of root.children ?? []) {
    regions++;
    for (const kommune of region.children ?? []) {
      kommuner++;
      for (const parish of kommune.children ?? []) {
        parishes++;
        if (parish.aliases && parish.aliases.length > 0) withAliases++;
      }
    }
  }

  console.log(`    Regions:             ${regions}`);
  console.log(`    Municipalities:      ${kommuner}`);
  console.log(`    Parishes:            ${parishes}`);
  console.log(`    Parishes w/ aliases: ${withAliases}`);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('Building Danish parish gazetteer from Wikidata...\n');

  fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log('Fetching Danish parishes (Q814648 + Q102854139)...');
  const rows = await sparqlFetch(QUERY);
  console.log(`Got ${rows.length} rows`);

  console.log('Building hierarchy...');
  const root = buildTree(rows);

  const source: Record<string, string> = {
    name: 'Wikidata',
    url: 'https://www.wikidata.org/wiki/Q814648',
    license: 'CC0 1.0',
    fetched: new Date().toISOString().slice(0, 10),
  };

  const gazetteer = {
    id: 'dk-sogne',
    name: 'Danish Parishes (Sogne)',
    locale: 'da',
    description: 'Danish parishes (sogne) — the basic ecclesiastical unit for vital records.',
    source,
    root,
  };

  const outputPath = path.join(DATA_DIR, 'dk-sogne.json');
  const json = JSON.stringify(gazetteer, null, 2);
  fs.writeFileSync(outputPath, json + '\n', 'utf-8');

  const sizeMb = (Buffer.byteLength(json) / 1_048_576).toFixed(2);
  console.log(`Written to dk-sogne.json (${sizeMb} MB)`);
  printStats(root);

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
