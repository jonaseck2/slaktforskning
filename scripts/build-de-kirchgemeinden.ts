/**
 * Build de-kirchgemeinden gazetteer from Wikidata.
 *
 * Produces ONE gazetteer:
 *   de-kirchgemeinden — German parishes (Lutheran Kirchengemeinden + Catholic
 *   Pfarreien) for genealogy research.
 *
 * Usage:
 *   npx tsx scripts/build-de-kirchgemeinden.ts
 *
 * Output:
 *   src/api/place-gazetteers/data/de-kirchgemeinden.json
 *
 * ──────────────────────────────────────────────────────────────────────
 * DATA SOURCE
 * ──────────────────────────────────────────────────────────────────────
 * Wikidata SPARQL endpoint: https://query.wikidata.org/sparql
 * License: CC0 1.0 (public domain).
 *
 * ──────────────────────────────────────────────────────────────────────
 * WIKIDATA CLASSES — refinements made vs. the original task brief
 * ──────────────────────────────────────────────────────────────────────
 * The plan brief proposed wd:Q1620908 (Kirchengemeinde) and wd:Q73501
 * (Pfarrei). Verifying against Wikidata revealed those QIDs are wrong:
 *   - Q1620908 actually labels "historische Landschaft" (historical region)
 *   - Q73501 labels "Bredevoort" (a Dutch town)
 * The genuine class identifiers, confirmed via wbsearchentities and
 * sample-row inspection on 2026-05-09:
 *   - Q20820021 — "ecclesiastical municipality" (parish-level admin entity;
 *                 used for Lutheran Kirchengemeinden and others). Returns
 *                 ~873 German parishes with coordinates.
 *   - Q17143723 — "Catholic parish" (canonical canon-law parish).
 *   - Q102496   — "parish" (generic ecclesiastical subdivision of a
 *                 diocese).
 *
 * ──────────────────────────────────────────────────────────────────────
 * QUERY REFINEMENTS — Wikidata endpoint quirks
 * ──────────────────────────────────────────────────────────────────────
 * 1. Transitive class closure (`wdt:P31/wdt:P279*`) was dropped per the
 *    plan note — it consistently times out on the public endpoint.
 *    We use direct P31 only.
 * 2. P131 chain to admin1 must be transitive (`wdt:P131+`) — direct P131
 *    rarely points at the Bundesland; it usually goes parish → city →
 *    Kreis → Bundesland.
 * 3. admin2 (Landkreis, Q106658) lookup is best-effort only. Many parish
 *    rows lack a clean Kreis chain in Wikidata; rather than synthesize a
 *    fake admin2, parishes without one attach directly under their admin1
 *    Bundesland.
 * 4. altLabels via GROUP_CONCAT timed out repeatedly; aliases are sourced
 *    only from the German-prefixed denomination form (e.g. "Pfarrei
 *    Aufhausen" → alias "Aufhausen") to keep the bundle small and the
 *    fetch reliable.
 *
 * ──────────────────────────────────────────────────────────────────────
 * COVERAGE
 * ──────────────────────────────────────────────────────────────────────
 * Wikidata's coverage of German parishes is sparse — there are ~23,500
 * actual Kirchengemeinden + Pfarreien in Germany, but only a few thousand
 * are modelled in Wikidata with coordinates. This is a known gap; the
 * gazetteer will grow as Wikidata fills in over time. The first cut still
 * gives the user typo-tolerant matching for thousands of well-known
 * parishes (St. Petri Lübeck, Pfarrei St. Maria München, etc.).
 *
 * ──────────────────────────────────────────────────────────────────────
 * HIERARCHY
 * ──────────────────────────────────────────────────────────────────────
 *   World > Europe > Germany > Bundesland (admin1) > [Kreis (admin2)] > parish (admin3)
 *
 * NOTE: Closed-vocab `type` is `world|continent|country|adminN`. Parish leaves
 * therefore carry `type: 'admin3'`, matching the sv-socknar / dk-sogne precedent.
 * The "parish" semantic lives in the gazetteer ID + node name, not the type.
 *
 * Parishes without an admin1 Bundesland match are skipped (logged).
 * Parishes without an admin2 Kreis attach directly under admin1.
 */

import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { avgCoordinates } from '../src/gazetteer-build/geo';
import { parseWktPoint } from '../src/gazetteer-build/wikidata';
import { sparqlFetch as sparqlFetchRaw } from '../src/gazetteer-build/sparql';
import { writeGazetteer } from '../src/gazetteer-build/io';

// ── Types ────────────────────────────────────────────────────────────

interface WikidataRow {
  item: string;
  itemLabel: string;
  coord: string; // WKT "Point(lon lat)"
  denominationLabel: string;
  admin1Label: string;
  admin2Label: string;
}

// ── Constants ────────────────────────────────────────────────────────

const FETCHED_DATE = new Date().toISOString().slice(0, 10);

// Prefixes that German parish names commonly carry. Stripping these for
// alias generation gives matchers the bare form.
const PARISH_PREFIXES = /^(Pfarrei|Kirchengemeinde|Pfarrgemeinde|Kirchspiel|Evangelische Kirchengemeinde|Katholische Pfarrei|Evangelisch-Lutherische Kirchengemeinde)\s+/i;

// ── SPARQL queries ───────────────────────────────────────────────────

/**
 * Two queries split by class — the public Wikidata endpoint times out
 * when too many OPTIONALs combine with too many classes. Splitting
 * keeps each well under the 60s timeout.
 *
 * Q20820021 = ecclesiastical municipality (Lutheran Kirchengemeinden)
 * Q17143723 = Catholic parish
 * Q102496   = parish (generic)
 */
function makeQuery(classQid: string): string {
  return `
    SELECT ?item ?itemLabel ?coord ?denominationLabel ?admin1Label ?admin2Label WHERE {
      ?item wdt:P31 wd:${classQid} .
      ?item wdt:P17 wd:Q183 .
      ?item wdt:P625 ?coord .
      OPTIONAL { ?item wdt:P140 ?denomination }
      OPTIONAL {
        ?item wdt:P131+ ?admin1 .
        ?admin1 wdt:P31 wd:Q1221156 .
        ?admin1 rdfs:label ?admin1Label .
        FILTER(LANG(?admin1Label) = "de")
      }
      OPTIONAL {
        ?item wdt:P131+ ?admin2 .
        ?admin2 wdt:P31 wd:Q106658 .
        ?admin2 rdfs:label ?admin2Label .
        FILTER(LANG(?admin2Label) = "de")
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
    }
  `;
}

const PARISH_CLASSES = ['Q20820021', 'Q17143723', 'Q102496'];

// ── Fetch helper ─────────────────────────────────────────────────────

async function fetchRows(): Promise<WikidataRow[]> {
  type Binding = Record<string, { value: string }>;
  const seen = new Set<string>();
  const rows: WikidataRow[] = [];

  for (const classQid of PARISH_CLASSES) {
    console.log(`Fetching parishes (class ${classQid})...`);
    const bindings = await sparqlFetchRaw<Binding>(makeQuery(classQid));
    let added = 0;
    for (const b of bindings) {
      const item = b.item?.value ?? '';
      if (!item || seen.has(item)) continue;
      seen.add(item);
      rows.push({
        item,
        itemLabel: b.itemLabel?.value ?? '',
        coord: b.coord?.value ?? '',
        denominationLabel: b.denominationLabel?.value ?? '',
        admin1Label: b.admin1Label?.value ?? '',
        admin2Label: b.admin2Label?.value ?? '',
      });
      added++;
    }
    console.log(`  ${classQid}: ${bindings.length} bindings, ${added} new unique items`);
  }

  return rows;
}

// ── Tree building ────────────────────────────────────────────────────

interface ParishEntry {
  name: string;
  lat: number;
  lon: number;
  aliases: string[];
}

function generateParishAliases(name: string, denomination: string): string[] {
  const aliases = new Set<string>();
  // Strip parish prefix for bare-name match.
  const bare = name.replace(PARISH_PREFIXES, '').trim();
  if (bare && bare !== name) aliases.add(bare);
  // Denomination-prefixed form, e.g. "Evangelisch-Lutherische Kirchengemeinde St. Petri".
  if (denomination) {
    if (/lutheran|lutherisch|evangelisch/i.test(denomination) && !/Kirchengemeinde/i.test(name)) {
      aliases.add(`Evangelisch-Lutherische Kirchengemeinde ${bare || name}`);
      aliases.add(`Kirchengemeinde ${bare || name}`);
    }
    if (/katholisch|catholic/i.test(denomination) && !/Pfarrei/i.test(name)) {
      aliases.add(`Pfarrei ${bare || name}`);
      aliases.add(`Katholische Pfarrei ${bare || name}`);
    }
  }
  // Deduplicate against name itself.
  aliases.delete(name);
  return [...aliases];
}

function buildTree(rows: WikidataRow[]): {
  root: GazetteerNode;
  stats: { total: number; skippedNoAdmin1: number; skippedNoCoord: number; skippedNoName: number };
} {
  let skippedNoCoord = 0;
  let skippedNoAdmin1 = 0;
  let skippedNoName = 0;

  // admin1 → admin2 (or '__direct__' bucket) → parish entries
  const tree = new Map<string, Map<string, ParishEntry[]>>();

  for (const row of rows) {
    const coord = parseWktPoint(row.coord);
    if (!coord) {
      skippedNoCoord++;
      continue;
    }
    if (!row.itemLabel || /^Q\d+$/.test(row.itemLabel)) {
      // Wikidata returns the QID as the label when no language label exists.
      skippedNoName++;
      continue;
    }
    if (!row.admin1Label) {
      skippedNoAdmin1++;
      continue;
    }

    const admin1 = row.admin1Label;
    const admin2 = row.admin2Label || '__direct__';
    const parishName = row.itemLabel;

    if (!tree.has(admin1)) tree.set(admin1, new Map());
    const adm1Map = tree.get(admin1)!;
    if (!adm1Map.has(admin2)) adm1Map.set(admin2, []);
    adm1Map.get(admin2)!.push({
      name: parishName,
      lat: coord.lat,
      lon: coord.lon,
      aliases: generateParishAliases(parishName, row.denominationLabel),
    });
  }

  // Convert to GazetteerNode tree.
  const bundeslandNodes: GazetteerNode[] = [];

  const sortedAdmin1 = [...tree.keys()].sort((a, b) => a.localeCompare(b, 'de'));

  for (const admin1Name of sortedAdmin1) {
    const adm1Map = tree.get(admin1Name)!;
    const adm1Children: GazetteerNode[] = [];

    // Collect parishes attached directly under admin1 (no admin2 match).
    const directParishes = adm1Map.get('__direct__') ?? [];
    const sortedKreise = [...adm1Map.keys()]
      .filter(k => k !== '__direct__')
      .sort((a, b) => a.localeCompare(b, 'de'));

    for (const kreisName of sortedKreise) {
      const parishes = adm1Map.get(kreisName)!;
      const parishNodes: GazetteerNode[] = parishes
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .map<GazetteerNode>(p => {
          const node: GazetteerNode = {
            name: p.name,
            type: 'admin3',
            lat: p.lat,
            lon: p.lon,
          };
          if (p.aliases.length > 0) node.aliases = p.aliases;
          return node;
        });

      const kreisCoords = avgCoordinates(parishNodes.map(n => ({ lat: n.lat, lon: n.lon })));
      adm1Children.push({
        name: kreisName,
        type: 'admin2',
        lat: kreisCoords.lat,
        lon: kreisCoords.lon,
        children: parishNodes,
      });
    }

    // Direct parishes (no Kreis) — attach as admin3 leaves directly under admin1.
    // Per the plan: do NOT synthesize a fake admin2 wrapper.
    for (const p of directParishes.sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
      const node: GazetteerNode = {
        name: p.name,
        type: 'admin3',
        lat: p.lat,
        lon: p.lon,
      };
      if (p.aliases.length > 0) node.aliases = p.aliases;
      adm1Children.push(node);
    }

    const blCoords = avgCoordinates(adm1Children.map(c => ({ lat: c.lat, lon: c.lon })));
    bundeslandNodes.push({
      name: admin1Name,
      type: 'admin1',
      lat: blCoords.lat,
      lon: blCoords.lon,
      children: adm1Children,
    });
  }

  // Country centroid.
  const deCoords = bundeslandNodes.length > 0
    ? avgCoordinates(bundeslandNodes.map(b => ({ lat: b.lat, lon: b.lon })))
    : { lat: 51.0, lon: 10.0 };

  const root: GazetteerNode = {
    name: 'World',
    type: 'world',
    lat: 0,
    lon: 0,
    children: [{
      name: 'Europe',
      type: 'continent',
      lat: 54,
      lon: 15,
      children: [{
        name: 'Germany',
        type: 'country',
        aliases: ['Tyskland', 'Deutschland', 'DE'],
        lat: deCoords.lat,
        lon: deCoords.lon,
        children: bundeslandNodes,
      }],
    }],
  };

  let total = 0;
  for (const m of tree.values()) for (const arr of m.values()) total += arr.length;

  return {
    root,
    stats: { total, skippedNoAdmin1, skippedNoCoord, skippedNoName },
  };
}

// ── Stats ────────────────────────────────────────────────────────────

function printStats(root: GazetteerNode, skipped: { skippedNoAdmin1: number; skippedNoCoord: number; skippedNoName: number }): void {
  const germany = root.children?.[0]?.children?.[0];
  if (!germany) return;

  let bundeslaender = 0;
  let kreiseOrDirect = 0;
  let parishes = 0;
  let withAliases = 0;

  for (const bl of germany.children ?? []) {
    bundeslaender++;
    for (const child of bl.children ?? []) {
      kreiseOrDirect++;
      if (child.type === 'admin3') {
        // direct parish leaf
        parishes++;
        if (child.aliases && child.aliases.length > 0) withAliases++;
      } else {
        for (const parish of child.children ?? []) {
          parishes++;
          if (parish.aliases && parish.aliases.length > 0) withAliases++;
        }
      }
    }
  }

  console.log(`    Bundesländer (admin1):   ${bundeslaender}`);
  console.log(`    Kreise + direct buckets: ${kreiseOrDirect}`);
  console.log(`    Parishes (admin3):       ${parishes}`);
  console.log(`    Parishes w/ aliases:     ${withAliases}`);
  console.log(`    Skipped — no admin1:     ${skipped.skippedNoAdmin1}`);
  console.log(`    Skipped — no coords:     ${skipped.skippedNoCoord}`);
  console.log(`    Skipped — no name:       ${skipped.skippedNoName}`);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('Building German parish gazetteer (de-kirchgemeinden) from Wikidata...\n');

  const rows = await fetchRows();
  console.log(`\nTotal unique parish rows: ${rows.length}`);

  console.log('\nBuilding hierarchy...');
  const { root, stats } = buildTree(rows);

  const gazetteer = {
    id: 'de-kirchgemeinden',
    name: 'Tyskland: Kirchengemeinden & Pfarreien',
    locale: 'de',
    description: 'German Lutheran Kirchengemeinden and Catholic Pfarreien for genealogy research. Sourced from Wikidata; sparse first cut — coverage will grow as Wikidata fills in.',
    source: {
      name: 'Wikidata',
      url: 'https://www.wikidata.org/',
      license: 'CC0 1.0',
      fetched: FETCHED_DATE,
      notes: 'SPARQL fetch over P31 ∈ {Q20820021 ecclesiastical municipality, Q17143723 Catholic parish, Q102496 parish}, filtered P17 = Q183 (Germany). admin1 (Bundesland) resolved via P131+ → Q1221156. Parishes lacking admin1 are skipped. Wikidata coverage of German parishes is incomplete (~23,500 actual exist); this is a sparse first cut.',
    },
    kind: 'point' as const,
    root,
  };

  const { path: outPath, sizeKB } = writeGazetteer(gazetteer, 'de-kirchgemeinden.json');

  console.log(`\nWrote ${outPath} (${(sizeKB / 1024).toFixed(2)} MB)`);
  printStats(root, stats);

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
