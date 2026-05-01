# German Gazetteer (`de-gemeinden`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

> **This plan delivers Phase 1 only of the multi-country roadmap.** The roadmap covering all 7 priority European countries (DE, PL, GB, NL, BE, FR, EE/LV/LT) lives at `docs/plans/2026-05-01-european-country-gazetteers-design.md`. Each subsequent country will get its own implementation plan; this plan does not.

**Goal:** Bring Germany to parity with the Nordic countries for genealogical place resolution. Add a point gazetteer (`de-gemeinden`: country → Bundesland → Kreis → Gemeinde) and a boundary gazetteer (`de-gemeinden-boundaries`: same hierarchy with geoshapes), so that German place names like "Hamburg", "Bayern", "Schleswig-Holstein", "Lübeck", and "Garmisch-Partenkirchen" resolve correctly without the user hand-coordinating each entry.

**Architecture:**
1. `scripts/build-de-municipalities.ts` — GeoNames `DE.zip` → admin1 (Bundesland, 16 entities) + admin2 (Kreis, ~400) + populated places (≥ ~5000 pop) → `de-gemeinden.json`. Mirrors `build-no-municipalities.ts` and `build-fi-municipalities.ts` patterns exactly.
2. `scripts/build-de-boundaries.ts` — Wikidata SPARQL for the same admin1 + admin2 entities, fetch `wdt:P3896` geoshape per entity, output the same tree shape with `geometry` populated. Mirrors `build-no-boundaries.ts`.
3. Both files registered in `bundled.ts`. `BUNDLED_GAZETTEERS` count grows by 2 (27 → 29, or 28 → 30 if `sv-landskap` ships first).
4. German suffix-strip rules added to `src/gazetteer-build/normalize-rules.ts` so `Land Bayern`, `Bezirk Mittelfranken`, `Landkreis Schwabach`, `Gemeinde Vaterstetten` all match the bare name.
5. **Bundle-size mitigation:** geometry simplification with `mapshaper` at build time. Target: keep `de-gemeinden-boundaries.json` under 10 MB.

**Tech Stack:** TypeScript (`tsx` runner), Vitest, GeoNames bulk dumps, Wikidata SPARQL, Wikimedia Maps geoshape API, `mapshaper` (npm dev dep, only used inside the build script).

**Source spec:** `docs/plans/2026-05-01-european-country-gazetteers-design.md` (Phase 1 = Germany).

---

## Pre-flight: confirm scope decisions before coding

Before implementing, confirm with the user (or default the answers if working autonomously):

1. **Place inclusion threshold.** GeoNames `DE.zip` has ~190k populated places. Mirroring the Norwegian/Finnish build, we want admin1 + admin2 + only the largest cities/towns. **Default: include populated places with `population ≥ 5000` and feature class `P`.** This roughly matches `no-kommuner.json` density. Higher thresholds reduce bundle size; lower ones bloat it. Note this in the script\'s header.

2. **Parishes (Kirchgemeinden).** The roadmap defers parish-level coverage. **Default: do not include.** German civil records are organised by Standesamt; ecclesiastical records by Kirchgemeinde. Both vary by Bundesland, by Konfession, and by century. Out of scope for Phase 1.

3. **Boundary simplification ratio.** Mapshaper\'s `-simplify` flag accepts percentages. **Default: 5% (95% reduction).** That preserves visible shape at the zoom levels the map uses. Tune if the rendered map looks bad.

4. **Suffix-strip list contents.** German civil-administrative suffixes for the resolver to ignore: `Land`, `Bezirk`, `Kreis`, `Landkreis`, `Stadtkreis`, `Gemeinde`, `Stadt`, `Markt`, `Ortsteil`. **Default: include all of these.** None of them belong in the canonical name; users may type them.

If any of these defaults don\'t fit the user\'s expectation, change them in Task 0 below (a no-op stub task that exists to make the choice visible) and propagate.

---

## File Structure

| File | Status | Purpose |
|---|---|---|
| `scripts/build-de-municipalities.ts` | Create | Build `de-gemeinden.json` (point gazetteer, ~3-6 MB) |
| `scripts/build-de-boundaries.ts` | Create | Build `de-gemeinden-boundaries.json` (boundary gazetteer, target < 10 MB after simplify) |
| `src/api/place-gazetteers/data/de-gemeinden.json` | Create (generated) | Country → 16 Bundesländer → ~400 Kreise → cities |
| `src/api/place-gazetteers/data/de-gemeinden-boundaries.json` | Create (generated) | Same hierarchy with geoshapes |
| `src/api/place-gazetteers/bundled.ts` | Modify | Static imports + 2 entries in `BUNDLED_GAZETTEERS` + 2 entries in `NORMALIZE_RULES_BY_ID` |
| `src/gazetteer-build/normalize-rules.ts` | Modify | Add `DE_RULES` with the German suffix-strip list |
| `tests/unit/gazetteers.test.ts` | Modify | Bump count, include de-gemeinden(+ boundaries), add resolution probes |
| `package.json` | Modify | Add `mapshaper` to devDependencies |

## Conventions

- Build scripts run with `npx tsx scripts/build-de-municipalities.ts` and `npx tsx scripts/build-de-boundaries.ts`.
- GeoNames DE dump under `/tmp/geonames_de/DE.txt` (downloaded once in Task 1).
- Coordinates round to 6 decimals via `round6` in `src/gazetteer-build/geo.ts` (point gazetteer); 4 decimals via `round4` for boundary geoshapes.
- Wikidata SPARQL uses `sparqlFetch` from `src/gazetteer-build/sparql.ts`, sleep 500ms between geoshape fetches (Wikimedia Maps API).
- Conventional commits: `feat(gazetteer):`, `test(gazetteer):`, `chore(deps):`.

---

## Task 0: Lock pre-flight defaults

**Files:**
- (none — decisional only)

- [x] **Step 1: Confirm or override the four pre-flight defaults**

If using the defaults: `population ≥ 5000`, parishes excluded, simplification at 5%, suffix list as listed above. Proceed to Task 1.

If overriding any: note the override in the script header comments (Task 1, Task 4). Don\'t silently change them — future maintenance assumes the documented choice.

- [x] **Step 2: No commit — informational**

---

## Task 1: GeoNames DE download + raw parse

**Files:**
- (downloads only)

- [x] **Step 1: Download the DE dump**

```bash
[ -f /tmp/geonames_de/DE.txt ] || (
  curl -o /tmp/DE.zip https://download.geonames.org/export/dump/DE.zip
  unzip -o /tmp/DE.zip -d /tmp/geonames_de/
)
ls -la /tmp/geonames_de/DE.txt
```

Expected: ~110 MB file. Lines are tab-separated GeoNames rows.

- [x] **Step 2: Confirm admin1 codes**

```bash
awk -F\'\\t\' \'$7=="ADM1"{print $11"\\t"$2}\' /tmp/geonames_de/DE.txt | sort
```

Expected: 16 lines (the 16 Bundesländer), each with admin1 code + name. Codes follow ISO-style: `01`-`16` (Schleswig-Holstein through Thüringen).

If you get fewer than 16 or weird codes (e.g. `00`), GeoNames\'s DE dump has been reorganised; check the source.

- [x] **Step 3: No commit — verification only**

---

## Task 2: `build-de-municipalities.ts` skeleton

**Files:**
- Create: `scripts/build-de-municipalities.ts`

- [x] **Step 1: Create the script using the Norwegian one as template**

Read `scripts/build-no-municipalities.ts` first to understand the structure. Then create a parallel German version. Key differences:

- Country code: `DE`
- 16 admin1 entries (vs 11 fylker for Norway after the 2024 reform)
- Many more admin2 entries (~400 Kreise vs ~360 kommuner)
- Population threshold for places: 5000 (per pre-flight default)

```typescript
/**
 * Build de-gemeinden gazetteer from GeoNames DE.zip.
 *
 * Hierarchy: Germany -> Bundesland (16) -> Kreis (~400) -> populated places (>= 5000 pop).
 *
 * Usage: npx tsx scripts/build-de-municipalities.ts
 *
 * Prerequisites:
 *   curl -o /tmp/DE.zip https://download.geonames.org/export/dump/DE.zip
 *   unzip -o /tmp/DE.zip -d /tmp/geonames_de/
 *
 * Source: GeoNames - CC BY 4.0
 */

import * as fs from \'fs\';
import * as path from \'path\';
import type { GazetteerNode } from \'../src/api/place-gazetteers/types\';
import { round6, avgCoordinates } from \'../src/gazetteer-build/geo\';

const DATA_DIR = path.join(__dirname, \'..\', \'src\', \'api\', \'place-gazetteers\', \'data\');
const GEONAMES_FILE = \'/tmp/geonames_de/DE.txt\';
const PLACE_MIN_POP = 5000;

const ADMIN1_NAMES: Record<string, string> = {
  \'01\': \'Baden-Württemberg\',
  \'02\': \'Bayern\',
  \'03\': \'Bremen\',
  \'04\': \'Hamburg\',
  \'05\': \'Hessen\',
  \'06\': \'Niedersachsen\',
  \'07\': \'Nordrhein-Westfalen\',
  \'08\': \'Rheinland-Pfalz\',
  \'09\': \'Saarland\',
  \'10\': \'Schleswig-Holstein\',
  \'11\': \'Berlin\',
  \'12\': \'Brandenburg\',
  \'13\': \'Mecklenburg-Vorpommern\',
  \'14\': \'Sachsen\',
  \'15\': \'Sachsen-Anhalt\',
  \'16\': \'Thüringen\',
};

interface GeoNameRow {
  geonameId: string;
  name: string;
  altNames: string;
  lat: number;
  lon: number;
  featureClass: string;
  featureCode: string;
  population: number;
  admin1: string;
  admin2: string;
}

function parseRows(filePath: string): GeoNameRow[] {
  const result: GeoNameRow[] = [];
  const content = fs.readFileSync(filePath, \'utf-8\');
  for (const line of content.split(\'\\n\')) {
    if (!line.trim()) continue;
    const cols = line.split(\'\\t\');
    result.push({
      geonameId: cols[0],
      name: cols[1],
      altNames: cols[3] ?? \'\',
      lat: parseFloat(cols[4]),
      lon: parseFloat(cols[5]),
      featureClass: cols[6],
      featureCode: cols[7],
      population: parseInt(cols[14] ?? \'0\', 10) || 0,
      admin1: cols[10],
      admin2: cols[11],
    });
  }
  return result;
}

async function main() {
  if (!fs.existsSync(GEONAMES_FILE)) {
    console.error(`Missing ${GEONAMES_FILE}. See script header for download steps.`);
    process.exit(1);
  }

  console.log(\'Parsing GeoNames DE...\');
  const allRows = parseRows(GEONAMES_FILE);
  console.log(`  Total rows: ${allRows.length}`);

  // Tasks 3-5 fill in the tree-build + write.
  console.log(\'TODO: build tree, write JSON\');
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [x] **Step 2: Run it and confirm parsing**

Run: `npx tsx scripts/build-de-municipalities.ts`
Expected: `Total rows: ~190000`. If radically off, the parser is mis-counting columns; inspect the first row.

- [x] **Step 3: Commit**

```bash
git add scripts/build-de-municipalities.ts
git commit -m "feat(gazetteer): scaffold build-de-municipalities"
```

---

## Task 3: Build the Bundesland → Kreis tree

**Files:**
- Modify: `scripts/build-de-municipalities.ts`

- [x] **Step 1: Replace the `// TODO` stub with the tree builder**

```typescript
  console.log(\'Grouping by Bundesland and Kreis...\');

  // Build admin2 (Kreis) name index from ADM2 rows.
  // GeoNames stores Kreis names as ADM2 entries with admin1 + admin2 codes set.
  const kreisNames = new Map<string, string>(); // "01.01" -> "Stuttgart"
  const kreisCoords = new Map<string, { lat: number; lon: number }>();
  for (const r of allRows) {
    if (r.featureCode !== \'ADM2\') continue;
    if (!r.admin1 || !r.admin2) continue;
    const key = `${r.admin1}.${r.admin2}`;
    kreisNames.set(key, r.name);
    if (Number.isFinite(r.lat) && Number.isFinite(r.lon)) {
      kreisCoords.set(key, { lat: r.lat, lon: r.lon });
    }
  }
  console.log(`  Kreis count: ${kreisNames.size}`);

  // Group populated places by Bundesland > Kreis.
  // Inclusion: feature class P, population >= PLACE_MIN_POP.
  type PlaceBucket = Map<string, GeoNameRow[]>; // kreisKey -> rows
  const placesByBundesland = new Map<string, PlaceBucket>(); // admin1 -> ...

  for (const r of allRows) {
    if (r.featureClass !== \'P\') continue;
    if (r.population < PLACE_MIN_POP) continue;
    if (!r.admin1) continue;
    const kreisKey = r.admin2 ? `${r.admin1}.${r.admin2}` : r.admin1;
    if (!placesByBundesland.has(r.admin1)) placesByBundesland.set(r.admin1, new Map());
    const bucket = placesByBundesland.get(r.admin1)!;
    if (!bucket.has(kreisKey)) bucket.set(kreisKey, []);
    bucket.get(kreisKey)!.push(r);
  }

  // Build the tree.
  type Tree = GazetteerNode[];
  const bundeslandNodes: Tree = [];

  // Sort Bundesländer alphabetically.
  const sortedAdmin1 = Object.keys(ADMIN1_NAMES).sort((a, b) =>
    ADMIN1_NAMES[a].localeCompare(ADMIN1_NAMES[b], \'de\')
  );

  for (const a1 of sortedAdmin1) {
    const blName = ADMIN1_NAMES[a1];
    const bucket = placesByBundesland.get(a1) ?? new Map<string, GeoNameRow[]>();

    // Collect Kreis children.
    const kreisChildren: GazetteerNode[] = [];
    const kreisKeys = [...bucket.keys()].sort((a, b) =>
      (kreisNames.get(a) ?? a).localeCompare(kreisNames.get(b) ?? b, \'de\')
    );
    for (const kreisKey of kreisKeys) {
      const kreisName = kreisNames.get(kreisKey) ?? kreisKey;
      const places = bucket.get(kreisKey)!;
      const placeChildren: GazetteerNode[] = places
        .sort((a, b) => a.name.localeCompare(b.name, \'de\'))
        .map<GazetteerNode>(p => ({
          name: p.name,
          type: \'locality\',
          lat: round6(p.lat),
          lon: round6(p.lon),
          ...(p.population > 0 ? { metadata: { population: p.population } } : {}),
        }));

      const coords = kreisCoords.get(kreisKey)
        ?? avgCoordinates(places.map(p => ({ lat: p.lat, lon: p.lon })));

      kreisChildren.push({
        name: kreisName,
        type: \'admin2\',
        lat: round6(coords.lat),
        lon: round6(coords.lon),
        children: placeChildren,
      });
    }

    // Bundesland centroid: average of its Kreise.
    const blCoords = avgCoordinates(
      kreisChildren.map(k => ({ lat: k.lat, lon: k.lon }))
    );

    bundeslandNodes.push({
      name: blName,
      type: \'admin1\',
      lat: round6(blCoords.lat),
      lon: round6(blCoords.lon),
      children: kreisChildren,
    });
  }

  // Country centroid - average of Bundesländer.
  const deCoords = avgCoordinates(
    bundeslandNodes.map(b => ({ lat: b.lat, lon: b.lon }))
  );

  const today = new Date().toISOString().slice(0, 10);

  const gazetteer = {
    id: \'de-gemeinden\',
    name: \'Tyskland: Bundesländer, Kreise, Gemeinden\',
    locale: \'de\',
    description: \'German Bundesländer (16), Kreise (~400), and populated places (≥ 5000 pop).\',
    source: {
      name: \'GeoNames\',
      url: \'https://www.geonames.org/\',
      license: \'CC BY 4.0\',
      fetched: today,
    },
    kind: \'point\' as const,
    root: {
      name: \'Tyskland\',
      type: \'country\',
      lat: round6(deCoords.lat),
      lon: round6(deCoords.lon),
      aliases: [\'Germany\', \'Deutschland\', \'DE\'],
      children: bundeslandNodes,
    },
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const outPath = path.join(DATA_DIR, \'de-gemeinden.json\');
  fs.writeFileSync(outPath, JSON.stringify(gazetteer, null, 2) + \'\\n\', \'utf-8\');

  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  const totalPlaces = bundeslandNodes.reduce(
    (sum, bl) => sum + (bl.children ?? []).reduce(
      (s, k) => s + (k.children?.length ?? 0), 0
    ), 0
  );
  console.log(`Wrote ${outPath} (${sizeMB} MB)`);
  console.log(`  16 Bundesländer, ${kreisNames.size} Kreise, ${totalPlaces} places`);
}
```

- [x] **Step 2: Run the script**

Run: `npx tsx scripts/build-de-municipalities.ts`
Expected:
- `16 Bundesländer, ~400 Kreise, NNNN places`
- File size 2-6 MB

If place count exceeds 10000, the population threshold is too low — bump to 10000 or higher. If under 1000, threshold may be too high or admin1 codes are mis-mapped.

- [x] **Step 3: Eyeball the output**

```bash
node -e "
const j = require(\'./src/api/place-gazetteers/data/de-gemeinden.json\');
const bayern = j.root.children.find(c => c.name === \'Bayern\');
console.log(\'Bayern Kreis count:\', bayern.children.length);
console.log(\'first Kreis:\', bayern.children[0].name);
console.log(\'first place:\', bayern.children[0].children?.[0]?.name);
"
```

Expected: Bayern has dozens of Kreise; first Kreis has populated places. Names look German.

- [x] **Step 4: Commit**

```bash
git add scripts/build-de-municipalities.ts \
        src/api/place-gazetteers/data/de-gemeinden.json
git commit -m "feat(gazetteer): build de-gemeinden from GeoNames"
```

---

## Task 4: `build-de-boundaries.ts` skeleton

**Files:**
- Create: `scripts/build-de-boundaries.ts`
- Modify: `package.json` (add `mapshaper` devDep)

- [x] **Step 1: Add `mapshaper` to devDependencies**

```bash
npm install --save-dev mapshaper
```

This adds `"mapshaper": "^X.Y.Z"` to `package.json`. We use it as a CLI invoked from the build script via `child_process.spawn`.

- [x] **Step 2: Create the boundary-fetch script**

Mirror `scripts/build-no-boundaries.ts`. The structure:
1. SPARQL query: list all instances of (Bundesland, Kreis) for Germany with declared P3896 geoshape.
2. For each, fetch the GeoJSON polygon from Wikimedia Maps, compute centroid, round coords to 4 decimals.
3. Write a tree in the same shape as `de-gemeinden.json` but with `geometry` populated and (per the design spec) NO populated-place leaf level — boundaries gazetteer only goes 2 levels deep.

```typescript
/**
 * Build de-gemeinden-boundaries gazetteer from Wikidata + Wikimedia Maps.
 *
 * Hierarchy: Germany -> Bundesland -> Kreis. Each entity has a wdt:P3896
 * geoshape fetched from the Wikimedia Maps API (CC0 1.0).
 *
 * Usage: npx tsx scripts/build-de-boundaries.ts
 * Output: src/api/place-gazetteers/data/de-gemeinden-boundaries.json
 * Source: Wikidata / Wikimedia Maps - CC0 1.0
 *
 * Note: mapshaper -simplify is run on the output to reduce vertex count by 95%.
 */

import * as fs from \'fs\';
import * as path from \'path\';
import { spawnSync } from \'child_process\';
import type { GazetteerNode, GazetteerGeometry } from \'../src/api/place-gazetteers/types\';
import { computeCentroid, round4 } from \'../src/gazetteer-build/geo\';
import { sparqlFetch as sparqlFetchRaw, sleep, USER_AGENT } from \'../src/gazetteer-build/sparql\';

const DATA_DIR = path.join(__dirname, \'..\', \'src\', \'api\', \'place-gazetteers\', \'data\');
const OUT_PATH = path.join(DATA_DIR, \'de-gemeinden-boundaries.json\');
const TMP_PATH = path.join(DATA_DIR, \'.de-gemeinden-boundaries.unsimplified.json\');

interface Row {
  itemQid: string;
  itemLabel: string;
  parentQid: string;
  parentLabel: string;
  level: \'admin1\' | \'admin2\';
}

// Q1221156 = Bundesland; Q106658 = Landkreis (rural); Q22865 = kreisfreie Stadt (urban).
// Adjust if Wikidata\'s class hierarchy changes.
const QUERY = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?item ?itemLabel ?parent ?parentLabel ?level WHERE {
  {
    ?item wdt:P31 wd:Q1221156 .
    BIND("admin1" AS ?level)
    BIND(wd:Q183 AS ?parent)  # parent of Bundesland is Germany itself
  } UNION {
    ?item wdt:P31/wdt:P279* wd:Q106658 .
    ?item wdt:P131 ?parent .
    BIND("admin2" AS ?level)
  } UNION {
    ?item wdt:P31 wd:Q22865 .  # kreisfreie Stadt
    ?item wdt:P131 ?parent .
    BIND("admin2" AS ?level)
  }
  ?item wdt:P3896 ?_ .  # has geoshape
  ?item rdfs:label ?itemLabel . FILTER(LANG(?itemLabel) = "de")
  ?parent rdfs:label ?parentLabel . FILTER(LANG(?parentLabel) = "de")
}
`;

function extractQid(uri: string): string | null {
  const m = uri.match(/(Q\\d+)$/);
  return m ? m[1] : null;
}

async function fetchGeoshape(qid: string): Promise<GazetteerGeometry | null> {
  const url = `https://maps.wikimedia.org/geoshape?getgeojson=1&ids=${qid}`;
  try {
    const res = await fetch(url, { headers: { \'User-Agent\': USER_AGENT } });
    if (!res.ok) return null;
    const data = await res.json() as {
      type: string;
      features: Array<{ geometry: { type: string; coordinates: unknown } }>;
    };
    if (!data.features?.length) return null;
    const geom = data.features[0].geometry;
    if (!geom || ![\'Polygon\', \'MultiPolygon\'].includes(geom.type)) return null;
    return geom as GazetteerGeometry;
  } catch {
    return null;
  }
}

function roundCoords(geom: GazetteerGeometry): GazetteerGeometry {
  const factor = 10_000;
  function roundRing(ring: number[][]): number[][] {
    return ring.map(([lon, lat]) => [
      Math.round(lon * factor) / factor,
      Math.round(lat * factor) / factor,
    ]);
  }
  if (geom.type === \'Polygon\') {
    return { type: \'Polygon\', coordinates: (geom.coordinates as number[][][]).map(roundRing) };
  }
  return {
    type: \'MultiPolygon\',
    coordinates: (geom.coordinates as number[][][][]).map(p => p.map(roundRing)),
  };
}

async function main() {
  console.log(\'Building de-gemeinden-boundaries gazetteer...\\n\');

  console.log(\'Querying Wikidata for DE Bundesländer + Kreise...\');
  type Binding = Record<string, { value: string }>;
  const bindings = await sparqlFetchRaw<Binding>(QUERY);
  console.log(`  ${bindings.length} candidates`);

  const rows: Row[] = [];
  for (const b of bindings) {
    const qid = extractQid(b.item?.value ?? \'\');
    const parentQid = extractQid(b.parent?.value ?? \'\');
    if (!qid || !parentQid) continue;
    rows.push({
      itemQid: qid,
      itemLabel: b.itemLabel?.value ?? \'\',
      parentQid,
      parentLabel: b.parentLabel?.value ?? \'\',
      level: (b.level?.value as \'admin1\' | \'admin2\') ?? \'admin2\',
    });
  }

  console.log(`\\nFetching geoshapes (500ms/request, ~${rows.length * 0.5}s total)...`);

  // qid -> { node, geomRaw }
  const nodes = new Map<string, { node: GazetteerNode; rawGeom: GazetteerGeometry }>();
  let fetched = 0, skipped = 0;
  for (const r of rows) {
    process.stdout.write(`  ${r.itemLabel} (${r.itemQid})... `);
    const rawGeom = await fetchGeoshape(r.itemQid);
    await sleep(500);
    if (!rawGeom) { console.log(\'NO GEOSHAPE\'); skipped++; continue; }
    const geometry = roundCoords(rawGeom);
    const [lat, lon] = computeCentroid(rawGeom);
    nodes.set(r.itemQid, {
      node: {
        name: r.itemLabel,
        type: r.level === \'admin1\' ? \'admin1\' : \'admin2\',
        lat: round4(lat),
        lon: round4(lon),
        geometry,
      },
      rawGeom,
    });
    fetched++;
    if (fetched % 25 === 0) {
      process.stdout.write(`OK (${fetched}/${rows.length})\\n`);
    } else {
      process.stdout.write(\'OK\\n\');
    }
  }
  console.log(`\\nFetched ${fetched}, skipped ${skipped}.`);

  // Build the parent->child tree.
  const admin1ByQid = new Map<string, GazetteerNode>();
  for (const r of rows.filter(x => x.level === \'admin1\')) {
    const entry = nodes.get(r.itemQid);
    if (!entry) continue;
    admin1ByQid.set(r.itemQid, entry.node);
    entry.node.children = [];
  }
  for (const r of rows.filter(x => x.level === \'admin2\')) {
    const child = nodes.get(r.itemQid);
    const parent = admin1ByQid.get(r.parentQid);
    if (!child || !parent) continue;
    parent.children!.push(child.node);
  }
  // Sort children alphabetically.
  for (const a1 of admin1ByQid.values()) {
    a1.children!.sort((a, b) => a.name.localeCompare(b.name, \'de\'));
  }

  const root: GazetteerNode = {
    name: \'Tyskland\',
    type: \'country\',
    lat: 51.0,
    lon: 10.0,
    children: [...admin1ByQid.values()].sort((a, b) => a.name.localeCompare(b.name, \'de\')),
  };

  const today = new Date().toISOString().slice(0, 10);
  const unsimplified = {
    id: \'de-gemeinden-boundaries\',
    name: \'Tyskland: Bundesländer + Kreise (gränser)\',
    locale: \'de\',
    kind: \'boundary\' as const,
    description: \'Geometric boundaries for German Bundesländer and Kreise.\',
    source: {
      name: \'Wikidata / Wikimedia Maps\',
      url: \'https://maps.wikimedia.org/\',
      license: \'CC0 1.0\',
      fetched: today,
    },
    root,
  };

  fs.writeFileSync(TMP_PATH, JSON.stringify(unsimplified), \'utf-8\');
  const rawSizeMB = (fs.statSync(TMP_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`\\nUnsimplified: ${rawSizeMB} MB at ${TMP_PATH}`);

  console.log(\'\\nRunning mapshaper simplify (5%)...\');
  // mapshaper handles GeoJSON, not our nested wrapper. We feed individual
  // geometries through one Feature collection and reattach by index.
  // Pragma: a robust approach is to write each geometry as its own GeoJSON
  // feature with an id, run mapshaper, read back, and re-merge. See Task 5.
  console.log(\'(simplify deferred to Task 5)\');

  // For now, write the unsimplified file as a placeholder.
  fs.copyFileSync(TMP_PATH, OUT_PATH);
  fs.unlinkSync(TMP_PATH);
  const sizeMB = (fs.statSync(OUT_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`Wrote ${OUT_PATH} (${sizeMB} MB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [x] **Step 3: Run the script (this is the slow run)**

Run: `npx tsx scripts/build-de-boundaries.ts`
Expected runtime: ~3-5 minutes (16 Bundesländer + ~400 Kreise × 500ms each, ~3-4 min). Output: a JSON file possibly 30-100 MB before simplification.

If many Kreise return "NO GEOSHAPE", the SPARQL filter is too strict. Try the `Q22865` (kreisfreie Stadt) and `Q106658` (Landkreis) classes; some special-cases like Stadt Berlin double as a Bundesland and may fall outside both. The design accepts some skips — log them.

- [x] **Step 4: Commit**

```bash
git add scripts/build-de-boundaries.ts package.json package-lock.json \
        src/api/place-gazetteers/data/de-gemeinden-boundaries.json
git commit -m "feat(gazetteer): fetch DE Bundesland + Kreis boundaries"
```

---

## Task 5: Geometry simplification with `mapshaper`

**Files:**
- Modify: `scripts/build-de-boundaries.ts`

- [x] **Step 1: Replace the "(simplify deferred to Task 5)" stub with a real mapshaper invocation**

Mapshaper accepts GeoJSON FeatureCollections, not our nested wrapper. The approach:
1. Walk the tree, emit one GeoJSON Feature per node (id = the node\'s position in a flat list).
2. Run `npx mapshaper -i features.json -simplify 5% -o features-simplified.json`.
3. Read back the simplified features and replace each node\'s `geometry` in-place.

```typescript
// Replace the "(simplify deferred...)" block with:

console.log(\'\\nRunning mapshaper simplify (5%)...\');

// Flatten all nodes with geometry into one Feature collection.
type Indexed = { node: GazetteerNode };
const flat: Indexed[] = [];
function walk(n: GazetteerNode) {
  if (n.geometry) flat.push({ node: n });
  for (const c of n.children ?? []) walk(c);
}
walk(root);

const fc = {
  type: \'FeatureCollection\',
  features: flat.map((entry, idx) => ({
    type: \'Feature\',
    properties: { idx },
    geometry: entry.node.geometry,
  })),
};

const FEATURES_PATH = path.join(DATA_DIR, \'.de-features.geojson\');
const SIMPLIFIED_PATH = path.join(DATA_DIR, \'.de-features-simplified.geojson\');
fs.writeFileSync(FEATURES_PATH, JSON.stringify(fc), \'utf-8\');

const result = spawnSync(\'npx\', [\'mapshaper\', FEATURES_PATH, \'-simplify\', \'5%\', \'-o\', SIMPLIFIED_PATH], {
  stdio: \'inherit\',
});
if (result.status !== 0) {
  console.error(\'mapshaper failed - leaving unsimplified output in place\');
  fs.copyFileSync(TMP_PATH, OUT_PATH);
} else {
  const simplified = JSON.parse(fs.readFileSync(SIMPLIFIED_PATH, \'utf-8\')) as {
    features: Array<{ properties: { idx: number }; geometry: GazetteerGeometry }>;
  };
  for (const f of simplified.features) {
    const idx = f.properties.idx;
    if (flat[idx]) flat[idx].node.geometry = roundCoords(f.geometry);
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(unsimplified), \'utf-8\');
}

// Cleanup.
for (const p of [FEATURES_PATH, SIMPLIFIED_PATH, TMP_PATH]) {
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

const sizeMB = (fs.statSync(OUT_PATH).size / 1024 / 1024).toFixed(2);
console.log(`Wrote ${OUT_PATH} (${sizeMB} MB after simplification)`);
```

- [x] **Step 2: Re-run the build (using cached fetches if you saved them)**

The naive approach refetches everything. To skip refetching during simplification iteration, cache the unsimplified JSON:

```bash
cp src/api/place-gazetteers/data/de-gemeinden-boundaries.json /tmp/de-boundaries-raw.json
```

Then if you tweak only the simplify parameter, you can mock the fetch step (or just rerun — 5 min is bearable).

- [x] **Step 3: Eyeball the result**

```bash
ls -la src/api/place-gazetteers/data/de-gemeinden-boundaries.json
```

Target: < 10 MB. If it\'s 20+ MB, drop the simplify percentage to `2%` or `1%`. If it\'s under 1 MB, the geometries got nuked — bump back up to `10%`.

Visual check: open `https://geojson.io` (paste a single Bundesland\'s geometry). The shape should still recognisably be e.g. Bayern, just with less detail.

- [x] **Step 4: Commit**

```bash
git add scripts/build-de-boundaries.ts \
        src/api/place-gazetteers/data/de-gemeinden-boundaries.json
git commit -m "feat(gazetteer): simplify DE boundary geometries with mapshaper"
```

---

## Task 6: Add `DE_RULES` to normalize-rules

**Files:**
- Modify: `src/gazetteer-build/normalize-rules.ts`

- [x] **Step 1: Add the German rule set**

Append after `IS_RULES`:

```typescript
export const DE_RULES: GazetteerNormalizeRules = {
  stripSuffixes: [
    \'Land\', \'Bezirk\', \'Kreis\', \'Landkreis\', \'Stadtkreis\',
    \'Gemeinde\', \'Stadt\', \'Markt\', \'Ortsteil\',
  ],
};
```

- [x] **Step 2: Lint**

```bash
npm run lint
```

- [x] **Step 3: Commit**

```bash
git add src/gazetteer-build/normalize-rules.ts
git commit -m "chore(resolver): add DE_RULES suffix-strip set"
```

---

## Task 7: Register both gazetteers in `bundled.ts`

**Files:**
- Modify: `src/api/place-gazetteers/bundled.ts`

- [x] **Step 1: Add static imports**

In the import block:

```typescript
// German
import deGemeinden from \'./data/de-gemeinden.json\';
import deGemeindenBoundaries from \'./data/de-gemeinden-boundaries.json\';
```

Add `DE_RULES` to the existing `import { ... } from \'../../gazetteer-build/normalize-rules\';` line.

- [x] **Step 2: Add to `NORMALIZE_RULES_BY_ID`**

```typescript
  // German
  \'de-gemeinden\': DE_RULES,
  \'de-gemeinden-boundaries\': DE_RULES,
```

- [x] **Step 3: Push into `BUNDLED_GAZETTEERS`**

Add `deGemeinden as Gazetteer` after the Icelandic block (alphabetical-ish — DE goes before NA-region). Add `deGemeindenBoundaries as Gazetteer` in the boundary-gazetteers block at the bottom.

- [x] **Step 4: Run lint + vitest**

```bash
npm run lint
npx vitest run tests/unit/gazetteers.test.ts
```

Expected: lint passes. The `loads all 27 bundled gazetteers` test FAILS because the count is now 29 (or 30 if landskap shipped). Fix in Task 8.

- [x] **Step 5: Commit**

```bash
git add src/api/place-gazetteers/bundled.ts
git commit -m "feat(gazetteer): register de-gemeinden in bundled set"
```

---

## Task 8: Tests — count + presence + resolution

**Files:**
- Modify: `tests/unit/gazetteers.test.ts`

- [x] **Step 1: Bump the count**

At `tests/unit/gazetteers.test.ts:10` (or wherever the count assertion is), update from 27 → 29 (assuming this plan ships in isolation). If `sv-landskap` already shipped, 28 → 30.

- [x] **Step 2: Add the per-id checks**

Add to the BUNDLED_IDS list (or equivalent):

```typescript
  \'de-gemeinden\',
  \'de-gemeinden-boundaries\',
```

The boundary-gazetteers describe block (line 102) iterates a list of boundary IDs (line 108). Add `\'de-gemeinden-boundaries\'` there.

- [x] **Step 3: Add resolution probes**

```typescript
describe(\'de-gemeinden resolution\', () => {
  const gazetteers = getAllGazetteers();

  it(\'resolves "Hamburg" to a German node\', () => {
    const r = resolvePlace(\'Hamburg\', gazetteers);
    const fromDe = r.matches?.find(m => m.gazetteerId === \'de-gemeinden\');
    expect(fromDe).toBeDefined();
  });

  it(\'resolves "Bayern" to the Bundesland\', () => {
    const r = resolvePlace(\'Bayern\', gazetteers);
    const fromDe = r.matches?.find(m => m.gazetteerId === \'de-gemeinden\');
    expect(fromDe).toBeDefined();
  });

  it(\'strips German suffixes - "Landkreis Schwabach" matches the same as "Schwabach"\', () => {
    const a = resolvePlace(\'Landkreis Schwabach\', gazetteers);
    const b = resolvePlace(\'Schwabach\', gazetteers);
    const aFromDe = a.matches?.find(m => m.gazetteerId === \'de-gemeinden\');
    const bFromDe = b.matches?.find(m => m.gazetteerId === \'de-gemeinden\');
    expect(aFromDe?.path).toEqual(bFromDe?.path);
  });

  it(\'resolves "Schleswig-Holstein" without breaking on the hyphen\', () => {
    const r = resolvePlace(\'Schleswig-Holstein\', gazetteers);
    const fromDe = r.matches?.find(m => m.gazetteerId === \'de-gemeinden\');
    expect(fromDe).toBeDefined();
  });
});
```

(Adjust `result.matches` access shape to match existing tests.)

- [x] **Step 4: Run all tests**

```bash
npx vitest run tests/unit/gazetteers.test.ts
```

Expected: all pass. If the Schleswig-Holstein test fails, the universal hyphen↔space rule may already collapse it; check the resolver\'s `normalize()` output by adding a `console.log` in the test.

- [x] **Step 5: Commit**

```bash
git add tests/unit/gazetteers.test.ts
git commit -m "test(gazetteer): cover de-gemeinden registration and resolution"
```

---

## Task 9: Bundle-size sanity check

**Files:**
- (none modified)

- [x] **Step 1: Measure data folder growth**

```bash
du -sh src/api/place-gazetteers/data/de-*.json
du -sh src/api/place-gazetteers/data/
```

Expected: `de-gemeinden.json` 2-6 MB, `de-gemeinden-boundaries.json` < 10 MB, total `data/` folder grows by < 15 MB. The roadmap budget for adding all 7 priority countries is 50-100 MB — Germany taking 10-15 MB leaves room.

If `de-gemeinden-boundaries.json` is over 15 MB, simplify harder (Task 5 — drop simplify percentage). If it\'s over 25 MB, something is wrong; verify simplification ran.

- [x] **Step 2: No commit — informational**

---

## Task 10: Manual smoke check in the app

**Files:**
- (none modified)

- [x] **Step 1: Start the dev app**

```bash
./.devcontainer/dev-debug.sh
```

- [x] **Step 2: Probe via `slaktforskning-dev` MCP**

Use the dev MCP `ui_screenshot` and `ui_click` tools per the user\'s feedback memory:

1. Open the place picker on any event.
2. Type "Hamburg" — confirm a hit appears tagged Tyskland > Hamburg (the city is also a Bundesland — both should appear, OR the picker should pick one consistently).
3. Type "Bayern" — confirm a Bundesland-level hit.
4. Type "Garmisch-Partenkirchen" — confirm a city hit nested under its Kreis.
5. Open a place panel and confirm the boundary gazetteer renders the correct geometry on the map (if the place is resolved to a Kreis or Bundesland).

- [x] **Step 3: No commit — informational**

If anything fails, the data is correct but the picker UI may be filtering out the new gazetteers. Check `GazetteersView` to ensure the user\'s `gazetteer_config` includes them, or that `usePlaceResolver` is defaulting to all bundled gazetteers (per the renderer rules).

---

## Task 11: Document the build scripts

**Files:**
- Modify: `scripts/build-de-municipalities.ts` (header) and `scripts/build-de-boundaries.ts` (header)

- [x] **Step 1: Confirm both headers cover usage, prerequisites, source/license, and expected output size**

Match the prose density of `scripts/build-no-municipalities.ts` and `scripts/build-no-boundaries.ts`. If anything is sparse, fill it in.

- [x] **Step 2: Append to `docs/PLAN.md` if a build-script inventory exists**

```bash
grep -n "build-no\|build-fi\|build-dk" docs/PLAN.md docs/DATA_MODEL.md 2>/dev/null
```

If a list exists, append `build-de-municipalities.ts` and `build-de-boundaries.ts`.

- [x] **Step 3: Commit if anything changed**

```bash
git add scripts/build-de-*.ts docs/PLAN.md
git commit -m "docs(gazetteer): document DE build scripts"
```

---

## Self-review checklist

- [x] `de-gemeinden.json` exists, `kind: \'point\'`, root `Tyskland` → 16 Bundesländer → ~400 Kreise → cities ≥ 5000 pop.
- [x] `de-gemeinden-boundaries.json` exists, `kind: \'boundary\'`, every leaf has a `geometry`.
- [x] Combined data-folder growth < 15 MB.
- [x] `bundled.ts` imports both, registers both, applies `DE_RULES` to both.
- [x] `DE_RULES.stripSuffixes` covers Land / Bezirk / Kreis / Landkreis / Stadtkreis / Gemeinde / Stadt / Markt / Ortsteil.
- [x] `tests/unit/gazetteers.test.ts` count assertion bumped, both new ids in the per-id list, resolution probes pass.
- [x] `npm run lint` and `npx vitest run` green.
- [x] Re-running both build scripts produces only date-line diffs (with cached GeoNames data — fresh re-fetches will round-trip the same data).
- [x] `package.json` has `mapshaper` in `devDependencies`.

## Out of scope (future plans)

- Polish (PL) gazetteer — Phase 2 of the roadmap.
- UK (GB) — Phase 3.
- Belgian (BE) — Phase 5; *but the Brussels exonym gap is partially addressed by the Swedish exonyms expansion plan.*
- German parishes (Kirchgemeinden) — defer until Phase 1 stability is confirmed.
- Lazy-load per country — defer unless the bundle-size budget actually trips.
- A CI check enforcing bundle-size budget — flagged in the design spec, separate concern.
