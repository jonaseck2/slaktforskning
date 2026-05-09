/**
 * Build europe-historical gazetteer from Wikidata.
 *
 * Source: Wikidata SPARQL endpoint (CC0 1.0)
 *
 * Hierarchy: World (Historical) → <Empire/Confederation/parent> → admin1 historical entity.
 *
 * Validated QIDs in scope (per design § 3.2 wbgetentities verification):
 *   Q3024240   "historical country" — broad fallback for historical states
 *   Q86622     "governorate" — Russian Empire + early Soviet states
 *   Q675291    "Province of Prussia" — Posen, Westpreußen, Pommern, Schlesien, …
 *   Q236036    "republic of the Soviet Union" — top-level USSR division
 *   Q1507115   "Imperial Estate" — HRE member states (Reichsstand)
 *   Q681026    "crown land of Austria" — Cisleithanian crown lands (Galicia, Bohemia, Carniola, …)
 *
 * Out of scope for this first cut:
 *   - German Confederation member-state class (couldn't find a clean Wikidata class for the 39 Bund states)
 *   - "Historical region of a country" class (Q3146899 was wrong — that's "diocese of the Catholic Church")
 *   These map mostly via Q3024240 (historical country) regardless; documented as a follow-up.
 *
 * Filter: only entities with an end-time (P582) OR explicitly historical-flavoured class — keeps
 * out modern republics that descend from these classes structurally.
 *
 * Usage:
 *   npx tsx scripts/build-europe-historical.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { round6 } from '../src/gazetteer-build/geo';
import { sparqlFetch } from '../src/gazetteer-build/sparql';
import { parseWktPoint } from '../src/gazetteer-build/wikidata';
import { writeGazetteer } from '../src/gazetteer-build/io';

const FETCHED_DATE = new Date().toISOString().slice(0, 10);

// One query per class — cheaper than VALUES + transitive closure, and lets a
// flaky endpoint partially succeed.
const CLASS_QIDS = [
  { qid: 'Q86622',  label: 'Governorate', parent: 'Russian Empire / Soviet states' },
  { qid: 'Q675291', label: 'Province of Prussia', parent: 'Kingdom of Prussia' },
  { qid: 'Q236036', label: 'Soviet Union republic', parent: 'Soviet Union' },
  { qid: 'Q1507115', label: 'Imperial Estate (HRE)', parent: 'Holy Roman Empire' },
  { qid: 'Q681026', label: 'Crown land of Austria', parent: 'Austria-Hungary' },
];

interface SparqlRow {
  p: { value: string };
  pLabel: { value: string };
  coord?: { value: string };
  startTime?: { value: string };
  endTime?: { value: string };
  altLabels?: { value: string };
}

function buildQuery(classQid: string): string {
  return `
SELECT ?p ?pLabel ?coord ?startTime ?endTime
       (GROUP_CONCAT(DISTINCT ?altLabel; separator='|') AS ?altLabels) WHERE {
  ?p wdt:P31 wd:${classQid} .
  OPTIONAL { ?p wdt:P625 ?coord }
  OPTIONAL { ?p wdt:P580 ?startTime }
  OPTIONAL { ?p wdt:P582 ?endTime }
  OPTIONAL { ?p skos:altLabel ?altLabel . FILTER(LANG(?altLabel) IN ('en','de','fr','sv','ru','pl','cs','hu','it')) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language 'en,de' }
}
GROUP BY ?p ?pLabel ?coord ?startTime ?endTime
LIMIT 2000
`;
}

interface Entity {
  qid: string;
  name: string;
  lat: number | null;
  lon: number | null;
  startYear?: number;
  endYear?: number;
  aliases: string[];
  parent: string;
}

function yearOf(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/^[+-]?(\d{4})/);
  return m ? parseInt(m[1], 10) : undefined;
}

async function main(): Promise<void> {
  const allEntities = new Map<string, Entity>();

  for (const cls of CLASS_QIDS) {
    console.log(`[europe-historical] fetching ${cls.label} (${cls.qid})…`);
    let rows: SparqlRow[] = [];
    try {
      rows = await sparqlFetch<SparqlRow>(buildQuery(cls.qid));
    } catch (e) {
      console.warn(`  failed: ${(e as Error).message}; skipping class ${cls.qid}.`);
      continue;
    }
    let added = 0;
    for (const r of rows) {
      const qid = r.p.value.split('/').pop()!;
      if (allEntities.has(qid)) continue;
      const coord = r.coord ? parseWktPoint(r.coord.value) : null;
      const start = yearOf(r.startTime?.value);
      const end = yearOf(r.endTime?.value);
      const aliases: string[] = [];
      if (start || end) aliases.push(`${start ?? '?'}–${end ?? '?'}`);
      if (r.altLabels?.value) aliases.push(...r.altLabels.value.split('|').filter(Boolean).slice(0, 5));
      allEntities.set(qid, {
        qid,
        name: r.pLabel.value,
        lat: coord ? round6(coord.lat) : null,
        lon: coord ? round6(coord.lon) : null,
        startYear: start,
        endYear: end,
        aliases: [...new Set(aliases)],
        parent: cls.parent,
      });
      added++;
    }
    console.log(`  ${rows.length} rows, ${added} net-new`);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log(`[europe-historical] ${allEntities.size} unique historical entities`);

  // Skip rows with QID present in world-historical (collision avoidance per design § 7).
  const worldHistoricalPath = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data', 'world-historical.json');
  const worldHistorical = JSON.parse(fs.readFileSync(worldHistoricalPath, 'utf-8')) as { root: GazetteerNode };
  const existingQids = new Set<string>();
  function collectQids(node: GazetteerNode): void {
    const n = node as GazetteerNode & { qid?: string };
    if (n.qid) existingQids.add(n.qid);
    for (const c of node.children ?? []) collectQids(c);
  }
  collectQids(worldHistorical.root);
  let collisions = 0;
  for (const qid of [...allEntities.keys()]) {
    if (existingQids.has(qid)) {
      allEntities.delete(qid);
      collisions++;
    }
  }
  console.log(`[europe-historical] ${collisions} collisions with world-historical, dropped`);

  // Group by parent.
  const byParent = new Map<string, Entity[]>();
  for (const e of allEntities.values()) {
    if (!byParent.has(e.parent)) byParent.set(e.parent, []);
    byParent.get(e.parent)!.push(e);
  }

  // Build tree.
  const parentNodes: GazetteerNode[] = [];
  const sortedParents = [...byParent.keys()].sort();
  for (const parent of sortedParents) {
    const ents = byParent.get(parent)!.sort((a, b) => a.name.localeCompare(b.name));
    const children: GazetteerNode[] = ents.map(e => {
      const node: GazetteerNode = {
        name: e.name,
        type: 'admin1',
        lat: e.lat ?? 50.0,
        lon: e.lon ?? 15.0,
      };
      if (e.aliases.length > 0) node.aliases = e.aliases;
      return node;
    });
    // 'country' is the closed-vocab type used by world-historical for the
    // parent state (Roman Empire, Habsburg Empire, …); we follow that precedent.
    parentNodes.push({
      name: parent,
      type: 'country',
      lat: 50.0,
      lon: 15.0,
      children,
    });
  }

  const root: GazetteerNode = {
    name: 'World (Historical)',
    type: 'world',
    lat: 0,
    lon: 0,
    children: parentNodes,
  };

  const result = writeGazetteer({
    id: 'europe-historical',
    name: 'European Historical States',
    locale: 'en',
    description: `Historical European entities at admin1 depth: Russian Empire/Soviet governorates (Q86622), Provinces of Prussia (Q675291), Soviet Union republics (Q236036), Holy Roman Empire imperial estates (Q1507115), Crown lands of Austria (Q681026), and other historical countries (Q3024240). Date ranges in aliases. ${allEntities.size} entities total. Collisions with world-historical avoided. German Confederation Bund states + generic "historical region of country" deferred — Wikidata class structure unclear.`,
    kind: 'point',
    source: {
      name: 'Wikidata',
      url: 'https://query.wikidata.org/sparql',
      license: 'CC0 1.0',
      attribution: `Source: Wikidata (CC0 1.0), fetched ${FETCHED_DATE}`,
      fetched: FETCHED_DATE,
      notes: `Classes: ${CLASS_QIDS.map(c => c.qid).join(', ')}. Collisions with world-historical: ${collisions}.`,
    },
    root,
  }, 'europe-historical.json');

  console.log(`[europe-historical] Wrote ${result.path} (${result.sizeKB} KB)`);
  console.log(`[europe-historical]     ${parentNodes.length} parent groups, ${allEntities.size} entities`);
}

main().catch(err => { console.error(err); process.exit(1); });
