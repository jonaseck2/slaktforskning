# World Historical Gazetteers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two bundled gazetteers — `world-historical` (point) and `world-historical-boundaries` (boundary) — containing dissolved political entities sourced from Wikidata.

**Architecture:** Two independent build scripts query Wikidata SPARQL. The point script runs two queries (dedicated historical-country classes + broader classes filtered by P576) and merges by QID. The boundary script queries for entities with both P576 and P3896 (declared geoshape), then fetches each polygon from the Wikimedia Maps geoshape API. `GazetteerNode` gains optional `startYear`/`endYear` fields (resolver ignores them; they are metadata for future date-aware resolution). Both gazetteers are flat: `World (Historical)` root → all entities as direct children.

**Tech Stack:** TypeScript, Wikidata SPARQL endpoint, Wikimedia Maps geoshape API, existing `src/gazetteer-build/` utilities.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/api/place-gazetteers/types.ts` | Modify | Add `startYear?: number; endYear?: number` to `GazetteerNode` |
| `scripts/build-world-historical.ts` | Create | Point gazetteer build script |
| `src/api/place-gazetteers/data/world-historical.json` | Generated | Output of point build (run script, do not write by hand) |
| `scripts/build-world-historical-boundaries.ts` | Create | Boundary gazetteer build script |
| `src/api/place-gazetteers/data/world-historical-boundaries.json` | Generated | Output of boundary build (run script, do not write by hand) |
| `src/api/place-gazetteers/bundled.ts` | Modify | Import + register both new gazetteers |
| `tests/unit/gazetteers.test.ts` | Modify | Update count 25→27, add IDs, add resolution test |
| `CLAUDE.md` | Modify | Update gazetteer tables (two locations) |

---

### Task 1: Extend GazetteerNode type

**Files:**
- Modify: `src/api/place-gazetteers/types.ts` (lines 13–21)

- [ ] **Step 1: Add startYear/endYear to GazetteerNode**

In `src/api/place-gazetteers/types.ts`, replace the `GazetteerNode` interface:

```typescript
export interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
  geometry?: GazetteerGeometry;
  startYear?: number;
  endYear?: number;
}
```

- [ ] **Step 2: Verify no type errors**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/place-gazetteers/types.ts
git commit -m "feat(gazetteers): add startYear/endYear to GazetteerNode"
```

---

### Task 2: Build point gazetteer script

**Files:**
- Create: `scripts/build-world-historical.ts`

**Background:** Two SPARQL queries cover different Wikidata class hierarchies and are merged by QID URI. `sparqlFetch` from `src/gazetteer-build/sparql.ts` returns bindings. `parseWktPoint` from `src/gazetteer-build/wikidata.ts` parses WKT `Point(lon lat)`. `generateAliases(name, altLabels, suffixRegex)` returns deduplicated alias array. `sleep` is used between queries to respect rate limits.

- [ ] **Step 1: Write the script**

Create `scripts/build-world-historical.ts`:

```typescript
/**
 * Build world-historical point gazetteer from Wikidata.
 *
 * Two queries cover different class hierarchies:
 *   Q1: Q3024240 (historical country) + Q28171280 (ancient country) — no P576 required
 *   Q2: Q6256 (country) + Q7270 (republic) + Q7275 (state) — filtered by P576
 * Results are merged by QID and deduplicated.
 *
 * Usage: npx tsx scripts/build-world-historical.ts
 * Output: src/api/place-gazetteers/data/world-historical.json
 * Source: Wikidata — CC0 1.0
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { round6 } from '../src/gazetteer-build/geo';
import { parseWktPoint, generateAliases } from '../src/gazetteer-build/wikidata';
import { sparqlFetch as sparqlFetchRaw, sleep } from '../src/gazetteer-build/sparql';

interface WikidataRow {
  item: string;       // "http://www.wikidata.org/entity/Q15180"
  itemLabel: string;
  coord: string;      // WKT "Point(lon lat)"
  startYear: string;
  endYear: string;
  altLabels: string;  // pipe-separated English alt labels
}

// Strip common political entity suffixes to generate bare-name aliases
const ENTITY_SUFFIXES =
  /\s+(empire|kingdom|republic|union|sultanate|emirate|caliphate|dynasty|khanate|principality|duchy|state|confederation)s?$/i;

// Q1: dedicated historical-country classes (no P576 required)
const QUERY_HISTORICAL = `
SELECT ?item ?itemLabel ?coord
  (SAMPLE(YEAR(?startDate)) AS ?startYear)
  (SAMPLE(YEAR(?endDate)) AS ?endYear)
  (GROUP_CONCAT(DISTINCT ?altLabel; SEPARATOR="|") AS ?altLabels)
WHERE {
  VALUES ?class { wd:Q3024240 wd:Q28171280 }
  ?item wdt:P31 ?class ; wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P571 ?startDate }
  OPTIONAL { ?item wdt:P576 ?endDate }
  OPTIONAL {
    ?item skos:altLabel ?altLabel .
    FILTER(LANG(?altLabel) = "en")
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
GROUP BY ?item ?itemLabel ?coord
LIMIT 10000
`;

// Q2: broader classes that require P576 (catches Soviet Union, Ottoman Empire etc.)
const QUERY_DISSOLVED = `
SELECT ?item ?itemLabel ?coord
  (SAMPLE(YEAR(?startDate)) AS ?startYear)
  (SAMPLE(YEAR(?endDate)) AS ?endYear)
  (GROUP_CONCAT(DISTINCT ?altLabel; SEPARATOR="|") AS ?altLabels)
WHERE {
  VALUES ?class { wd:Q6256 wd:Q7270 wd:Q7275 }
  ?item wdt:P31 ?class ; wdt:P576 ?_ ; wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P571 ?startDate }
  OPTIONAL { ?item wdt:P576 ?endDate }
  OPTIONAL {
    ?item skos:altLabel ?altLabel .
    FILTER(LANG(?altLabel) = "en")
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
GROUP BY ?item ?itemLabel ?coord
LIMIT 10000
`;

async function sparqlFetch(query: string): Promise<WikidataRow[]> {
  type Binding = Record<string, { value: string }>;
  const bindings = await sparqlFetchRaw<Binding>(query);
  return bindings.map(b => ({
    item: b.item?.value ?? '',
    itemLabel: b.itemLabel?.value ?? '',
    coord: b.coord?.value ?? '',
    startYear: b.startYear?.value ?? '',
    endYear: b.endYear?.value ?? '',
    altLabels: b.altLabels?.value ?? '',
  }));
}

function buildNodes(rows: WikidataRow[]): GazetteerNode[] {
  const seen = new Set<string>();
  const nodes: GazetteerNode[] = [];

  for (const row of rows) {
    if (!row.item || !row.itemLabel || !row.coord) continue;
    if (seen.has(row.item)) continue;
    seen.add(row.item);

    const coord = parseWktPoint(row.coord);
    if (!coord) continue;

    const aliases = generateAliases(row.itemLabel, row.altLabels, ENTITY_SUFFIXES);

    const node: GazetteerNode = {
      name: row.itemLabel,
      type: 'historical_state',
      lat: round6(coord.lat),
      lon: round6(coord.lon),
    };
    if (aliases.length > 0) node.aliases = aliases;
    if (row.startYear) node.startYear = parseInt(row.startYear, 10);
    if (row.endYear) node.endYear = parseInt(row.endYear, 10);

    nodes.push(node);
  }

  nodes.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return nodes;
}

async function main() {
  console.log('Building world-historical point gazetteer from Wikidata...\n');

  console.log('Query 1: historical/ancient country classes...');
  const rows1 = await sparqlFetch(QUERY_HISTORICAL);
  console.log(`  ${rows1.length} rows`);

  await sleep(2000);

  console.log('Query 2: dissolved countries/republics/states...');
  const rows2 = await sparqlFetch(QUERY_DISSOLVED);
  console.log(`  ${rows2.length} rows`);

  const nodes = buildNodes([...rows1, ...rows2]);
  console.log(`\nBuilt ${nodes.length} entities (after dedup)`);
  console.log(`  With aliases:    ${nodes.filter(n => n.aliases?.length).length}`);
  console.log(`  With start year: ${nodes.filter(n => n.startYear).length}`);
  console.log(`  With end year:   ${nodes.filter(n => n.endYear).length}`);

  // Spot-check key entities — if any are missing, adjust SPARQL class list
  const SPOT_CHECK = ['Soviet Union', 'Ottoman Empire', 'Byzantine Empire'];
  for (const name of SPOT_CHECK) {
    const found = nodes.some(n =>
      n.name.includes(name) || (n.aliases ?? []).some(a => a.includes(name))
    );
    console.log(`  ${name}: ${found ? '✓' : '✗ MISSING — check SPARQL classes'}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const gazetteer = {
    id: 'world-historical',
    name: 'World — Historical States',
    locale: 'en',
    kind: 'point',
    description: `Dissolved political entities (empires, historical states, ancient countries). ${nodes.length} entities from Wikidata.`,
    source: {
      name: 'Wikidata',
      url: 'https://www.wikidata.org/',
      license: 'CC0 1.0',
      fetched: today,
    },
    root: {
      name: 'World (Historical)',
      type: 'root',
      lat: 0,
      lon: 0,
      children: nodes,
    },
  };

  const outputPath = path.join(
    __dirname, '..', 'src', 'api', 'place-gazetteers', 'data', 'world-historical.json',
  );
  const json = JSON.stringify(gazetteer, null, 2);
  fs.writeFileSync(outputPath, json + '\n', 'utf-8');

  const sizeMb = (Buffer.byteLength(json) / 1_048_576).toFixed(2);
  console.log(`\nWritten: world-historical.json (${sizeMb} MB, ${nodes.length} entities)`);
  console.log('\nDone!');
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Commit the script (before running)**

```bash
git add scripts/build-world-historical.ts
git commit -m "feat(gazetteers): add world-historical build script"
```

---

### Task 3: Run point gazetteer script and verify output

**Files:**
- Generated: `src/api/place-gazetteers/data/world-historical.json`

- [ ] **Step 1: Run the script**

```bash
npx tsx scripts/build-world-historical.ts
```

Expected output (approximate):
```
Building world-historical point gazetteer from Wikidata...

Query 1: historical/ancient country classes...
  NNN rows
Query 2: dissolved countries/republics/states...
  NNN rows

Built NNN entities (after dedup)
  With aliases:    NNN
  With start year: NNN
  With end year:   NNN
  Soviet Union: ✓
  Ottoman Empire: ✓
  Byzantine Empire: ✓

Written: world-historical.json (X.XX MB, NNN entities)
Done!
```

If Soviet Union or Ottoman Empire shows ✗ MISSING: check their Wikidata P31 values at
https://www.wikidata.org/wiki/Q15180 and https://www.wikidata.org/wiki/Q12560 respectively,
then add the missing class to the appropriate QUERY constants in the script.

If total entities < 200: the SPARQL query may have timed out — check the error output.

- [ ] **Step 2: Spot-check the JSON**

```bash
node -e "
const g = require('./src/api/place-gazetteers/data/world-historical.json');
const c = g.root.children;
console.log('Total entities:', c.length);
const su = c.find(n => n.name === 'Soviet Union');
if (su) { console.log('Soviet Union:', JSON.stringify(su, null, 2)); }
console.log('Sample (first 5):', c.slice(0, 5).map(n => n.name));
"
```

Verify: total > 200, Soviet Union has reasonable lat/lon (~55, ~37), startYear ~1922, endYear ~1991.

- [ ] **Step 3: Commit generated data**

```bash
git add src/api/place-gazetteers/data/world-historical.json
git commit -m "feat(gazetteers): generate world-historical.json"
```

---

### Task 4: Register point gazetteer in bundled.ts and update tests

**Files:**
- Modify: `src/api/place-gazetteers/bundled.ts`
- Modify: `tests/unit/gazetteers.test.ts`

- [ ] **Step 1: Add import to bundled.ts**

In `src/api/place-gazetteers/bundled.ts`, after the `// Global` imports (line 24), add:

```typescript
// Historical
import worldHistorical from './data/world-historical.json';
```

- [ ] **Step 2: Add to BUNDLED_GAZETTEERS array**

In the same file, after `worldAdmin1 as Gazetteer,` (after the `// Global` block), add:

```typescript
  // Historical
  worldHistorical as Gazetteer,
```

- [ ] **Step 3: Update the count test in gazetteers.test.ts**

In `tests/unit/gazetteers.test.ts`, line 10, change `25` to `26`:

```typescript
  it('loads all 26 bundled gazetteers', () => {
    expect(gazetteers.length).toBe(26);
  });
```

- [ ] **Step 4: Add world-historical to dataIds array**

In `tests/unit/gazetteers.test.ts`, in the `dataIds` array (around line 19), add `'world-historical'`:

```typescript
  const dataIds = [
    'sv-socknar', 'sv-forsamlingar', 'sv-orter', 'sv-gardar', 'sv-kyrkor', 'sv-sockenstad-boundaries',
    'dk-sogne', 'dk-sogne-dawa',
    'no-kommuner', 'fi-kunnat', 'is-sveitarfelog',
    'us-immigration-states', 'us-all-states', 'ca-provinces',
    'world-countries', 'world-admin1',
    'world-historical',
    'dk-sogne-boundaries', 'no-kommuner-boundaries', 'fi-kunnat-boundaries',
    'is-sveitarfelog-boundaries', 'us-counties-boundaries', 'ca-divisions-boundaries',
    'world-boundaries',
  ];
```

- [ ] **Step 5: Add resolution test for world-historical**

After the existing count tests in `tests/unit/gazetteers.test.ts`, add:

```typescript
  it('world-historical has > 200 dissolved entities', () => {
    const wh = gazetteers.find(g => g.id === 'world-historical')!;
    expect(wh.root.children!.length).toBeGreaterThan(200);
  });

  it('world-historical resolves Soviet Union', () => {
    const gazetteers = loadGazetteers(
      { enabledGazetteers: ['world-historical'] },
      getAllGazetteers(),
    );
    const result = resolvePlace('Soviet Union', gazetteers);
    expect(result).not.toBeNull();
    expect(result!.matchedNode.name).toBe('Soviet Union');
  });
```

- [ ] **Step 6: Run tests**

```bash
npm test -- --grep "gazetteers"
```

Expected: all gazetteer tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/api/place-gazetteers/bundled.ts tests/unit/gazetteers.test.ts
git commit -m "feat(gazetteers): register world-historical point gazetteer"
```

---

### Task 5: Build boundary gazetteer script

**Files:**
- Create: `scripts/build-world-historical-boundaries.ts`

**Background:** Wikidata `P3896` (geoshape) declares that an entity has a geoshape file on Wikimedia Commons. The Wikimedia Maps geoshape API serves these as GeoJSON:
`GET https://maps.wikimedia.org/geoshape?getgeojson=1&ids=Q15180`
Returns `{ type: "FeatureCollection", features: [...] }`. Empty features array = no boundary.
Rate-limit to 500ms between requests. `sleep` is from `src/gazetteer-build/sparql.ts`.
`computeCentroid(geometry)` returns `[lat, lon]` from `src/gazetteer-build/geo.ts`.
`round4` rounds to 4 decimal places (~11m accuracy, matching other boundary gazetteers).

- [ ] **Step 1: Write the script**

Create `scripts/build-world-historical-boundaries.ts`:

```typescript
/**
 * Build world-historical-boundaries gazetteer from Wikidata geoshapes.
 *
 * Queries Wikidata for dissolved political entities (P576) with declared
 * geoshape data (P3896), then fetches each boundary from the
 * Wikimedia Maps geoshape API at 500ms/request.
 *
 * Usage: npx tsx scripts/build-world-historical-boundaries.ts
 * Output: src/api/place-gazetteers/data/world-historical-boundaries.json
 * Source: Wikidata / Wikimedia Maps — CC0 1.0
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode, GazetteerGeometry } from '../src/api/place-gazetteers/types';
import { computeCentroid, round4 } from '../src/gazetteer-build/geo';
import { sparqlFetch as sparqlFetchRaw, sleep, USER_AGENT } from '../src/gazetteer-build/sparql';

interface CandidateRow {
  item: string;       // "http://www.wikidata.org/entity/Q15180"
  itemLabel: string;
}

// Dissolved entities with declared geoshape
const QUERY = `
SELECT DISTINCT ?item ?itemLabel WHERE {
  ?item wdt:P576 ?_ ; wdt:P3896 ?_ .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 5000
`;

function extractQid(uri: string): string | null {
  const match = uri.match(/(Q\d+)$/);
  return match ? match[1] : null;
}

function roundCoords(geom: GazetteerGeometry): GazetteerGeometry {
  const factor = 10_000;
  function roundRing(ring: number[][]): number[][] {
    return ring.map(([lon, lat]) => [
      Math.round(lon * factor) / factor,
      Math.round(lat * factor) / factor,
    ]);
  }
  if (geom.type === 'Polygon') {
    return { type: 'Polygon', coordinates: (geom.coordinates as number[][][]).map(roundRing) };
  }
  return {
    type: 'MultiPolygon',
    coordinates: (geom.coordinates as number[][][][]).map(p => p.map(roundRing)),
  };
}

async function fetchGeoshape(qid: string): Promise<GazetteerGeometry | null> {
  const url = `https://maps.wikimedia.org/geoshape?getgeojson=1&ids=${qid}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const data = await res.json() as {
      type: string;
      features: Array<{ geometry: { type: string; coordinates: unknown } }>;
    };
    if (!data.features?.length) return null;
    const geom = data.features[0].geometry;
    if (!geom || !['Polygon', 'MultiPolygon'].includes(geom.type)) return null;
    return geom as GazetteerGeometry;
  } catch {
    return null;
  }
}

async function main() {
  console.log('Building world-historical-boundaries gazetteer...\n');

  console.log('Querying Wikidata for dissolved entities with geoshapes (P3896)...');
  type Binding = Record<string, { value: string }>;
  const bindings = await sparqlFetchRaw<Binding>(QUERY);
  const candidates: CandidateRow[] = bindings
    .map(b => ({ item: b.item?.value ?? '', itemLabel: b.itemLabel?.value ?? '' }))
    .filter(r => r.item && r.itemLabel);
  console.log(`  ${candidates.length} candidates`);

  console.log(`\nFetching geoshapes from Wikimedia Maps (500ms/request)...`);
  const nodes: GazetteerNode[] = [];
  let fetched = 0, skipped = 0;

  for (const candidate of candidates) {
    const qid = extractQid(candidate.item);
    if (!qid) { skipped++; continue; }

    const rawGeom = await fetchGeoshape(qid);
    await sleep(500);
    fetched++;
    if (fetched % 20 === 0 || fetched === candidates.length) {
      process.stdout.write(`  ${fetched}/${candidates.length} fetched, ${nodes.length} with geometry\n`);
    }

    if (!rawGeom) { skipped++; continue; }

    const geometry = roundCoords(rawGeom);
    const [lat, lon] = computeCentroid(rawGeom);

    nodes.push({
      name: candidate.itemLabel,
      type: 'historical_state',
      lat: round4(lat),
      lon: round4(lon),
      geometry,
    });
  }

  nodes.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  console.log(`\nResults: ${nodes.length} with boundaries, ${skipped} skipped`);

  const today = new Date().toISOString().slice(0, 10);
  const gazetteer = {
    id: 'world-historical-boundaries',
    name: 'World — Historical State Boundaries',
    locale: 'en',
    kind: 'boundary',
    description: `Boundaries of dissolved political entities. ${nodes.length} entities from Wikidata / Wikimedia Maps.`,
    source: {
      name: 'Wikidata / Wikimedia Maps',
      url: 'https://maps.wikimedia.org/',
      license: 'CC0 1.0',
      fetched: today,
    },
    root: {
      name: 'World (Historical)',
      type: 'root',
      lat: 0,
      lon: 0,
      children: nodes,
    },
  };

  const outputPath = path.join(
    __dirname, '..', 'src', 'api', 'place-gazetteers', 'data', 'world-historical-boundaries.json',
  );
  const json = JSON.stringify(gazetteer);
  fs.writeFileSync(outputPath, json, 'utf-8');

  const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0);
  console.log(`Written: world-historical-boundaries.json (${sizeKB} KB, ${nodes.length} entities)`);
  console.log('\nDone!');
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Commit the script**

```bash
git add scripts/build-world-historical-boundaries.ts
git commit -m "feat(gazetteers): add world-historical-boundaries build script"
```

---

### Task 6: Run boundary script and verify output

**Files:**
- Generated: `src/api/place-gazetteers/data/world-historical-boundaries.json`

**Note:** This script fetches boundaries one at a time at 500ms/request. With ~50–300 candidates (most dissolved entities lack P3896), expect 1–3 minutes total.

- [ ] **Step 1: Run the script**

```bash
npx tsx scripts/build-world-historical-boundaries.ts
```

Expected output:
```
Building world-historical-boundaries gazetteer...

Querying Wikidata for dissolved entities with geoshapes (P3896)...
  NN candidates

Fetching geoshapes from Wikimedia Maps (500ms/request)...
  20/NN fetched, NN with geometry
  ...

Results: NN with boundaries, NN skipped
Written: world-historical-boundaries.json (NNN KB, NN entities)
Done!
```

If candidates = 0: the SPARQL query may have timed out. Re-run once.
If all fetches return null geometry: check the Wikimedia Maps API URL manually:
  `curl "https://maps.wikimedia.org/geoshape?getgeojson=1&ids=Q15180"` (Soviet Union)
  Should return non-empty features array.

- [ ] **Step 2: Spot-check output**

```bash
node -e "
const g = require('./src/api/place-gazetteers/data/world-historical-boundaries.json');
const c = g.root.children;
console.log('Total entities with boundaries:', c.length);
const su = c.find(n => n.name === 'Soviet Union');
if (su) {
  console.log('Soviet Union geometry type:', su.geometry?.type);
  console.log('Soviet Union lat/lon:', su.lat, su.lon);
} else {
  console.log('Soviet Union: not found (may lack P3896 in Wikidata)');
}
console.log('First 5:', c.slice(0, 5).map(n => n.name));
"
```

- [ ] **Step 3: Commit generated data**

```bash
git add src/api/place-gazetteers/data/world-historical-boundaries.json
git commit -m "feat(gazetteers): generate world-historical-boundaries.json"
```

---

### Task 7: Register boundary gazetteer in bundled.ts and update tests

**Files:**
- Modify: `src/api/place-gazetteers/bundled.ts`
- Modify: `tests/unit/gazetteers.test.ts`

- [ ] **Step 1: Add import to bundled.ts**

After the `worldHistorical` import added in Task 4, add:

```typescript
import worldHistoricalBoundaries from './data/world-historical-boundaries.json';
```

- [ ] **Step 2: Add to BUNDLED_GAZETTEERS array**

After `worldHistorical as Gazetteer,`, add:

```typescript
  worldHistoricalBoundaries as Gazetteer,
```

- [ ] **Step 3: Update count test to 27**

In `tests/unit/gazetteers.test.ts`, change:

```typescript
  it('loads all 27 bundled gazetteers', () => {
    expect(gazetteers.length).toBe(27);
  });
```

- [ ] **Step 4: Add world-historical-boundaries to dataIds and boundaryIds**

In the `dataIds` array, add `'world-historical-boundaries'` after `'world-historical'`:

```typescript
    'world-historical',
    'world-historical-boundaries',
```

In the `boundaryIds` array (around line 72), add `'world-historical-boundaries'`:

```typescript
  const boundaryIds = [
    'sv-sockenstad-boundaries',
    'dk-sogne-boundaries', 'no-kommuner-boundaries', 'fi-kunnat-boundaries',
    'is-sveitarfelog-boundaries', 'us-counties-boundaries', 'ca-divisions-boundaries',
    'world-boundaries',
    'world-historical-boundaries',
  ];
```

- [ ] **Step 5: Add size test for boundary gazetteer**

```typescript
  it('world-historical-boundaries has at least 10 entities with geometry', () => {
    const whb = gazetteers.find(g => g.id === 'world-historical-boundaries')!;
    expect(whb.root.children!.length).toBeGreaterThanOrEqual(10);
    const withGeometry = whb.root.children!.filter(n => n.geometry).length;
    expect(withGeometry).toBeGreaterThanOrEqual(10);
  });
```

(10 is a conservative lower bound — actual count depends on Wikidata P3896 coverage.)

- [ ] **Step 6: Run tests**

```bash
npm test -- --grep "gazetteers"
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/api/place-gazetteers/bundled.ts tests/unit/gazetteers.test.ts
git commit -m "feat(gazetteers): register world-historical-boundaries gazetteer"
```

---

### Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Point Gazetteers table**

In `CLAUDE.md`, the Point Gazetteers table lists 15 gazetteers. Append two rows:

```markdown
| `world-historical` | World Historical States | Wikidata | ~NNN | ~X MB |
```

Replace `~NNN` and `~X MB` with the actual values printed when the build script ran.

- [ ] **Step 2: Update the Boundary Gazetteers table**

In `CLAUDE.md`, the Boundary Gazetteers table lists 8 gazetteers. Append one row:

```markdown
| `world-historical-boundaries` | World Historical State Boundaries | Wikidata/Wikimedia Maps | NN | ~X MB |
```

- [ ] **Step 3: Update the build scripts table**

In `CLAUDE.md`, under the gazetteers skill section or build scripts table, add:

```markdown
| `build-world-historical.ts` | Wikidata SPARQL (Q3024240, Q28171280, Q6256, Q7270, Q7275) | Two queries merged by QID | world-historical |
| `build-world-historical-boundaries.ts` | Wikidata P3896 + Wikimedia Maps API | SPARQL pre-filter then HTTP per entity | world-historical-boundaries |
```

- [ ] **Step 4: Run lint and full tests**

```bash
npm run lint && npm test
```

Expected: 0 lint errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for world-historical gazetteers"
```
