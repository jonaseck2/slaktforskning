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
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { avgCoordinates } from '../src/gazetteer-build/geo';
import { parseWktPoint, generateAliases } from '../src/gazetteer-build/wikidata';
import { sparqlFetch as sparqlFetchRaw, SPARQL_ENDPOINT, USER_AGENT } from '../src/gazetteer-build/sparql';

// ── Types ────────────────────────────────────────────────────────────

interface WikidataRow {
  item: string;        // Wikidata URI
  itemLabel: string;
  coord: string;       // WKT "Point(lon lat)"
  kommunLabel: string;
  countyLabel: string;
  altLabels: string;   // pipe-separated
}

// ── Constants ────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');

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

interface ClassMetadata {
  created?: string;  // ISO date from P571 (inception)
  kgmid?: string;    // Google Knowledge Graph ID from P2671 or Freebase ID from P646
}

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
  type Binding = Record<string, { value: string }>;
  const bindings = await sparqlFetchRaw<Binding>(query);
  return bindings.map(b => ({
    item: b.item?.value ?? '',
    itemLabel: b.itemLabel?.value ?? '',
    coord: b.coord?.value ?? '',
    kommunLabel: b.kommunLabel?.value ?? '',
    countyLabel: b.countyLabel?.value ?? '',
    altLabels: b.altLabels?.value ?? '',
  }));
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
        aliases: generateAliases(name, row.altLabels, PARISH_SUFFIXES),
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
      const kommunCoords = avgCoordinates(parishNodes);

      // Kommun alias: strip " kommun" suffix
      const kommunAliases: string[] = [];
      const bareKommun = kommunName.replace(/\s+kommun$/i, '').trim();
      if (bareKommun && bareKommun !== kommunName) kommunAliases.push(bareKommun);

      const kommunNode: GazetteerNode = {
        name: kommunName,
        type: 'municipality',
        lat: kommunCoords.lat,
        lon: kommunCoords.lon,
        children: parishNodes,
      };
      if (kommunAliases.length > 0) kommunNode.aliases = kommunAliases;
      kommunNodes.push(kommunNode);
    }

    // County centroid = mean of kommun centroids
    const countyCoords = avgCoordinates(kommunNodes);

    // County alias: strip " län" suffix
    const countyAliases: string[] = [];
    const bareLan = countyName.replace(/\s+län$/i, '').trim();
    if (bareLan && bareLan !== countyName) countyAliases.push(bareLan);

    const countyNode: GazetteerNode = {
      name: countyName,
      type: 'county',
      lat: countyCoords.lat,
      lon: countyCoords.lon,
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

// ── Class metadata (inception date, KGMID) ─────────────────────────

/**
 * Fetch metadata about the Wikidata class itself: inception date (P571)
 * and Google Knowledge Graph ID (P2671, falling back to Freebase ID P646).
 */
async function fetchClassMetadata(classId: string): Promise<ClassMetadata> {
  const query = `
    SELECT ?created ?kgmid ?freebaseId WHERE {
      OPTIONAL { wd:${classId} wdt:P571 ?created . }
      OPTIONAL { wd:${classId} wdt:P2671 ?kgmid . }
      OPTIONAL { wd:${classId} wdt:P646 ?freebaseId . }
    }
    LIMIT 1
  `;
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) return {};

  const json = await response.json() as {
    results: { bindings: Array<Record<string, { value: string }>> };
  };
  const b = json.results.bindings[0];
  if (!b) return {};

  const result: ClassMetadata = {};
  if (b.created?.value) {
    result.created = b.created.value.slice(0, 10); // ISO date
  }
  if (b.kgmid?.value) {
    result.kgmid = b.kgmid.value;
  } else if (b.freebaseId?.value) {
    result.kgmid = b.freebaseId.value;
  }
  return result;
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
    const [rows, metadata] = await Promise.all([
      sparqlFetch(buildQuery(gaz.classId)),
      fetchClassMetadata(gaz.classId),
    ]);
    console.log(`   Got ${rows.length} rows`);
    if (metadata.created) console.log(`   Class inception: ${metadata.created}`);
    if (metadata.kgmid) console.log(`   Knowledge Graph ID: ${metadata.kgmid}`);

    console.log('   Building hierarchy...');
    const root = buildTree(rows);

    const source: Record<string, string> = {
      name: 'Wikidata',
      url: `https://www.wikidata.org/wiki/${gaz.classId}`,
      license: 'CC0 1.0',
    };
    if (metadata.created) source.created = metadata.created;
    source.fetched = new Date().toISOString().slice(0, 10);
    if (metadata.kgmid) source.kgmid = metadata.kgmid;

    const gazetteer = {
      id: gaz.id,
      name: gaz.name,
      locale: 'sv',
      description: gaz.gazDescription,
      source,
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
