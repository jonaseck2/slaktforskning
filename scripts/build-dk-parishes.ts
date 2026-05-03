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
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { avgCoordinates } from '../src/gazetteer-build/geo';
import { parseWktPoint, generateAliases } from '../src/gazetteer-build/wikidata';
import { sparqlFetch as sparqlFetchRaw } from '../src/gazetteer-build/sparql';

// ── Types ────────────────────────────────────────────────────────────

interface WikidataRow {
  item: string;        // Wikidata URI
  itemLabel: string;
  coord: string;       // WKT "Point(lon lat)"
  kommuneLabel: string;
  regionLabel: string;
  altLabels: string;   // pipe-separated
}

// ── Constants ────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');

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
  type Binding = Record<string, { value: string }>;
  const bindings = await sparqlFetchRaw<Binding>(query);
  return bindings.map(b => ({
    item: b.item?.value ?? '',
    itemLabel: b.itemLabel?.value ?? '',
    coord: b.coord?.value ?? '',
    kommuneLabel: b.kommuneLabel?.value ?? '',
    regionLabel: b.regionLabel?.value ?? '',
    altLabels: b.altLabels?.value ?? '',
  }));
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
        aliases: generateAliases(name, row.altLabels, PARISH_SUFFIXES),
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
      const kommuneCoords = avgCoordinates(parishNodes);

      // Kommune name: canonical form drops " Kommune" (Danish-canonical bare name).
      // Original kept as alias.
      const canonicalKommune = kommuneName.replace(/\s+kommune$/i, '').trim();
      const kommuneAliases: string[] = [];
      if (canonicalKommune && canonicalKommune !== kommuneName) kommuneAliases.push(kommuneName);

      const kommuneNode: GazetteerNode = {
        name: canonicalKommune || kommuneName,
        type: 'admin2',
        lat: kommuneCoords.lat,
        lon: kommuneCoords.lon,
        children: parishNodes,
      };
      if (kommuneAliases.length > 0) kommuneNode.aliases = kommuneAliases;
      kommuneNodes.push(kommuneNode);
    }

    // Region centroid = mean of kommune centroids
    const regionCoords = avgCoordinates(kommuneNodes);

    // Region: keep canonical Danish form (e.g. "Region Hovedstaden"). Bare form
    // ("Hovedstaden") goes in aliases. Don't try to map to GeoNames English
    // forms ("Capital Region") — that's the language-gazetteer's job (Phase 7.1).
    const regionAliases: string[] = [];
    const bareRegion = regionName.replace(/^Region\s+/i, '').trim();
    if (bareRegion && bareRegion !== regionName) regionAliases.push(bareRegion);

    const regionNode: GazetteerNode = {
      name: regionName,
      type: 'admin1',
      lat: regionCoords.lat,
      lon: regionCoords.lon,
      children: kommuneNodes,
    };
    if (regionAliases.length > 0) regionNode.aliases = regionAliases;
    regionNodes.push(regionNode);
  }

  // Set parish type to admin3 in-place. Done as a final pass so the inner
  // loop stays focused on tree construction.
  for (const region of regionNodes) {
    for (const kommune of region.children ?? []) {
      for (const parish of kommune.children ?? []) {
        parish.type = 'admin3';
      }
    }
  }

  // Wrap in World > Europe > Denmark.
  const denmark: GazetteerNode = {
    name: 'Denmark',
    type: 'country',
    aliases: ['Danmark'],
    lat: 56.0,
    lon: 10.0,
    children: regionNodes,
  };
  const europe: GazetteerNode = {
    name: 'Europe',
    type: 'continent',
    lat: 54,
    lon: 15,
    children: [denmark],
  };
  return {
    name: 'World',
    type: 'world',
    lat: 0,
    lon: 0,
    children: [europe],
  };
}

// ── Stats ────────────────────────────────────────────────────────────

function printStats(root: GazetteerNode): void {
  // root is World; descend to Denmark
  const europe = root.children?.[0];
  const denmark = europe?.children?.[0];
  if (!denmark) return;

  let regions = 0;
  let kommuner = 0;
  let parishes = 0;
  let withAliases = 0;

  for (const region of denmark.children ?? []) {
    regions++;
    for (const kommune of region.children ?? []) {
      kommuner++;
      for (const parish of kommune.children ?? []) {
        parishes++;
        if (parish.aliases && parish.aliases.length > 0) withAliases++;
      }
    }
  }

  console.log(`    Regions (admin1):    ${regions}`);
  console.log(`    Kommuner (admin2):   ${kommuner}`);
  console.log(`    Parishes (admin3):   ${parishes}`);
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
