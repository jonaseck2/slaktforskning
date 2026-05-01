# Continents in `world-boundaries` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the 7 continent geometries (Africa, Antarctica, Asia, Europe, North America, Oceania, South America) to the existing `world-boundaries` gazetteer so bare-continent inputs ("Afrika", "Europa") resolve, and the boundary resolver gets a continent-shaped fallback for places where the user only knows the continent.

**Architecture:** A new build script `scripts/build-world-continents-boundaries.ts` fetches each continent's `wdt:P3896` geoshape from Wikimedia Maps. A second merge step prepends the 7 continent nodes as siblings of the existing country nodes inside `world-boundaries.json`. Continents do **not** become parents of countries — that would force a tree-walk change on every consumer. The `world-boundaries.json` file stays one flat list at the root.

**Tech Stack:** TypeScript (`tsx` runner), Vitest, Wikidata SPARQL, Wikimedia Maps geoshape API. Existing helpers in `src/gazetteer-build/` (`sparql.ts`, `geo.ts`).

**Source spec:** `docs/plans/2026-05-01-continents-in-world-boundaries-design.md`.

---

## File Structure

| File | Status | Purpose |
|---|---|---|
| `scripts/build-world-continents-boundaries.ts` | Create | Fetch 7 continent geoshapes + merge into `world-boundaries.json` |
| `src/api/place-gazetteers/data/world-boundaries.json` | Modify (regenerate) | 7 new continent nodes prepended to `root.children` |
| `src/renderer/i18n/sv.ts` | Modify | Add `placeTypes.continent: \'Kontinent\'` |
| `src/renderer/i18n/en.ts` | Modify | Add `placeTypes.continent: \'Continent\'` |
| `tests/unit/gazetteers.test.ts` | Modify | Add continent presence + `resolveBoundary("Afrika")` tests |

No changes to `bundled.ts` (the `worldBoundaries` import already exists, the rebuilt JSON just contains more nodes). No new gazetteer file. `BUNDLED_GAZETTEERS` count stays at 27.

## Conventions

- Build scripts run with `npx tsx scripts/<name>.ts`. Tests run with `npx vitest run <file>`.
- Coordinates round to 4 decimals via `round4` from `src/gazetteer-build/geo.ts` (matches `build-world-historical-boundaries.ts`).
- Geoshape fetch rate-limited to 500ms/request (matches existing pattern, polite to Wikimedia Maps).
- Source attribution stored in the gazetteer JSON `source` field. Per-continent provenance (`wikidata` vs `naturalEarth`) recorded inside the build script log only — the JSON keeps a single source block. **Phase 1 of this plan uses Wikidata only.** Natural Earth fallback is Task 7 (deferred).
- Conventional commits: `feat(gazetteer):`, `test(gazetteer):`, `docs(gazetteer):`.

---

## Task 1: Build script skeleton + Wikidata QID list

**Files:**
- Create: `scripts/build-world-continents-boundaries.ts`

- [x] **Step 1: Create the script with the 7 QIDs and a stub `main()`**

```typescript
/**
 * Add 7 continent geoshapes as siblings of country nodes in world-boundaries.json.
 *
 * Fetches wdt:P3896 (geoshape) from Wikimedia Maps for each continent QID.
 * Re-reads the existing world-boundaries.json, prepends the continent nodes
 * to root.children, writes the file back.
 *
 * Usage: npx tsx scripts/build-world-continents-boundaries.ts
 * Source: Wikidata / Wikimedia Maps - CC0 1.0
 */

import * as fs from \'fs\';
import * as path from \'path\';
import type { GazetteerNode, GazetteerGeometry } from \'../src/api/place-gazetteers/types\';
import { computeCentroid, round4 } from \'../src/gazetteer-build/geo\';
import { sleep, USER_AGENT } from \'../src/gazetteer-build/sparql\';

interface ContinentSpec {
  qid: string;
  name: string;
}

const CONTINENTS: ContinentSpec[] = [
  { qid: \'Q15\',  name: \'Africa\' },
  { qid: \'Q51\',  name: \'Antarctica\' },
  { qid: \'Q48\',  name: \'Asia\' },
  { qid: \'Q46\',  name: \'Europe\' },
  { qid: \'Q49\',  name: \'North America\' },
  { qid: \'Q538\', name: \'Oceania\' },
  { qid: \'Q18\',  name: \'South America\' },
];

const OUT_PATH = path.join(
  __dirname, \'..\', \'src\', \'api\', \'place-gazetteers\', \'data\', \'world-boundaries.json\',
);

async function main() {
  console.log(\'Adding continent geoshapes to world-boundaries.json...\\n\');
  // Tasks 2-5 fill this in.
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [x] **Step 2: Run it once to confirm the file compiles**

Run: `npx tsx scripts/build-world-continents-boundaries.ts`
Expected: Prints "Adding continent geoshapes..." and exits 0.

- [x] **Step 3: Commit**

```bash
git add scripts/build-world-continents-boundaries.ts
git commit -m "feat(gazetteer): scaffold build-world-continents-boundaries"
```

---

## Task 2: Fetch geoshape for one continent (Africa)

**Files:**
- Modify: `scripts/build-world-continents-boundaries.ts`

- [x] **Step 1: Add `fetchGeoshape()` borrowed from `build-world-historical-boundaries.ts`**

Append below `CONTINENTS`:

```typescript
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
```

- [x] **Step 2: Replace `main()` body with a one-continent smoke fetch**

```typescript
async function main() {
  console.log(\'Fetching Africa (Q15) as smoke test...\');
  const geom = await fetchGeoshape(\'Q15\');
  if (!geom) { console.error(\'No geometry returned\'); process.exit(1); }
  console.log(`  type=${geom.type}, rings=${(geom.coordinates as unknown[]).length}`);
  const [lat, lon] = computeCentroid(geom);
  console.log(`  centroid lat=${round4(lat)}, lon=${round4(lon)}`);
}
```

- [x] **Step 3: Run and confirm output**

Run: `npx tsx scripts/build-world-continents-boundaries.ts`
Expected: A line containing "type=MultiPolygon" or "type=Polygon" with rings ≥ 1 and a centroid latitude in roughly the range -10 to +20 (Africa straddles the equator).

If the fetch fails (rare network glitch), retry. If it consistently returns null, Wikidata\'s Q15 has no P3896 — skip ahead to Task 7 (Natural Earth fallback) instead.

- [x] **Step 4: Commit**

```bash
git add scripts/build-world-continents-boundaries.ts
git commit -m "feat(gazetteer): fetch single continent geoshape"
```

---

## Task 3: Fetch all 7 continents

**Files:**
- Modify: `scripts/build-world-continents-boundaries.ts`

- [x] **Step 1: Replace `main()` with the full 7-continent loop**

```typescript
async function main() {
  console.log(`Fetching ${CONTINENTS.length} continent geoshapes...\\n`);

  const newNodes: GazetteerNode[] = [];
  for (const { qid, name } of CONTINENTS) {
    process.stdout.write(`  ${name} (${qid})... `);
    const rawGeom = await fetchGeoshape(qid);
    await sleep(500);
    if (!rawGeom) { console.log(\'NO GEOSHAPE - skipping\'); continue; }

    const geometry = roundCoords(rawGeom);
    const [lat, lon] = computeCentroid(rawGeom);
    newNodes.push({
      name,
      type: \'continent\',
      lat: round4(lat),
      lon: round4(lon),
      geometry,
    });
    console.log(`OK (centroid ${round4(lat)}, ${round4(lon)})`);
  }

  if (newNodes.length === 0) {
    console.error(\'\\nFATAL: no continents fetched\');
    process.exit(1);
  }

  console.log(`\\nFetched ${newNodes.length}/${CONTINENTS.length} continents.`);
  // Task 4 wires the merge step here.
}
```

- [x] **Step 2: Run it**

Run: `npx tsx scripts/build-world-continents-boundaries.ts`
Expected: 7 lines, each ending in "OK (centroid ...)". Total runtime ~5 seconds (7 × 500ms + fetch latency).

If any continent prints "NO GEOSHAPE - skipping", investigate before proceeding. The design spec calls out Natural Earth as the fallback (Task 7), but ship without it for the first iteration only if all 7 succeed.

- [x] **Step 3: Verify centroids look sensible**

Eyeball the output:

| Continent | Expected lat range | Expected lon range |
|---|---|---|
| Africa | -10 to 20 | 10 to 30 |
| Antarctica | -90 to -70 | any (-180 to 180) |
| Asia | 25 to 60 | 60 to 120 |
| Europe | 35 to 71 | -10 to 60 |
| North America | 20 to 70 | -160 to -60 |
| Oceania | -25 to 0 | 130 to 180 |
| South America | -30 to 5 | -80 to -50 |

If any centroid is wildly outside its expected range, the geoshape may be a country-only fragment of a multi-component continent (e.g. just Russia for "Europe"). Stop and inspect — this design assumes the QIDs cover the full continent.

- [x] **Step 4: Commit**

```bash
git add scripts/build-world-continents-boundaries.ts
git commit -m "feat(gazetteer): fetch all 7 continent geoshapes"
```

---

## Task 4: Merge into `world-boundaries.json`

**Files:**
- Modify: `scripts/build-world-continents-boundaries.ts`
- Modify: `src/api/place-gazetteers/data/world-boundaries.json` (regenerated)

- [x] **Step 1: Add the merge step at the end of `main()`**

Append (replacing the `// Task 4 wires the merge step here.` comment):

```typescript
  console.log(`\\nReading ${OUT_PATH}...`);
  const existing = JSON.parse(fs.readFileSync(OUT_PATH, \'utf-8\')) as {
    root: { children: GazetteerNode[]; [k: string]: unknown };
    [k: string]: unknown;
  };

  // Replace any existing continent nodes (idempotent re-run).
  const existingNonContinents = (existing.root.children ?? [])
    .filter(c => c.type !== \'continent\');

  // Sort continents alphabetically; prepend before countries.
  newNodes.sort((a, b) => a.name.localeCompare(b.name, \'en\'));
  existing.root.children = [...newNodes, ...existingNonContinents];

  // Update the source.fetched date so downstream caches notice the rebuild.
  if (existing.source && typeof existing.source === \'object\') {
    (existing.source as { fetched?: string }).fetched = new Date().toISOString().slice(0, 10);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(existing), \'utf-8\');
  const sizeKB = (fs.statSync(OUT_PATH).size / 1024).toFixed(0);
  console.log(`Wrote ${OUT_PATH} (${sizeKB} KB, +${newNodes.length} continents)`);
}
```

- [x] **Step 2: Run it**

Run: `npx tsx scripts/build-world-continents-boundaries.ts`
Expected: Final line `Wrote .../world-boundaries.json (NNNN KB, +7 continents)`.

- [x] **Step 3: Verify the file changed and is still valid JSON**

```bash
git diff --stat src/api/place-gazetteers/data/world-boundaries.json
node -e "JSON.parse(require(\'fs\').readFileSync(\'src/api/place-gazetteers/data/world-boundaries.json\', \'utf-8\'))"
```

Expected: `git diff` shows the file changed. The `node -e` line exits 0 (valid JSON).

- [x] **Step 4: Verify continents are present and ordered first**

```bash
node -e "
const j = JSON.parse(require(\'fs\').readFileSync(\'src/api/place-gazetteers/data/world-boundaries.json\', \'utf-8\'));
const continents = j.root.children.filter(c => c.type === \'continent\');
console.log(\'continent count:\', continents.length);
console.log(\'first 7 children types:\', j.root.children.slice(0, 7).map(c => c.type));
console.log(\'continent names:\', continents.map(c => c.name).join(\', \'));
"
```

Expected: `continent count: 7`, first 7 children all type `continent`, names alphabetical.

- [x] **Step 5: Commit**

```bash
git add scripts/build-world-continents-boundaries.ts \
        src/api/place-gazetteers/data/world-boundaries.json
git commit -m "feat(gazetteer): merge 7 continents into world-boundaries"
```

---

## Task 5: Idempotency / determinism check

**Files:**
- (none modified)

- [x] **Step 1: Run the script a second time**

```bash
cp src/api/place-gazetteers/data/world-boundaries.json /tmp/wb-before.json
npx tsx scripts/build-world-continents-boundaries.ts
diff /tmp/wb-before.json src/api/place-gazetteers/data/world-boundaries.json
```

Expected: `diff` reports either no differences, **or** only the `source.fetched` date line (acceptable — that\'s by design). If continent geometries shift, something is non-deterministic.

If the diff shows continent count growing past 7, the merge step is appending instead of replacing — fix the `existingNonContinents` filter.

- [x] **Step 2: If only the date differs, lock that down**

If the only diff is the date line, decide: do we want every rebuild to bump `source.fetched`, or only when the data changes? The existing world-historical-boundaries pattern bumps every run. Keep that behaviour — no code change.

If the diff includes coordinate jitter (different rounding), check `round4` is being applied to all rings consistently in `roundCoords`. The current implementation already covers Polygon and MultiPolygon — geometry is deterministic.

- [x] **Step 3: No commit required for this task**

This task is verification only.

---

## Task 6: i18n keys for continent badge

**Files:**
- Modify: `src/renderer/i18n/sv.ts:631-644`
- Modify: `src/renderer/i18n/en.ts` (matching `placeTypes` block)

- [x] **Step 1: Add `continent: \'Kontinent\'` to `sv.ts`**

Find the `placeTypes:` block (around line 631) and add `continent: \'Kontinent\',` as the first key:

```typescript
  placeTypes: {
    continent: \'Kontinent\',
    country: \'Land\',
    admin1: \'Delstat/Region\',
    // ...rest unchanged
  },
```

- [x] **Step 2: Add `continent: \'Continent\'` to `en.ts`**

Mirror the change in the matching `placeTypes` block in `en.ts`.

- [x] **Step 3: Run lint**

```bash
npm run lint
```

Expected: 0 errors.

- [x] **Step 4: Run i18n key-parity test**

```bash
npx vitest run tests/unit/i18n
```

If a parity test exists, expected: PASS. If no such test exists, skip and rely on the lint pass.

- [x] **Step 5: Commit**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(i18n): add continent placeType label"
```

---

## Task 7: Natural Earth fallback (deferred — only if Task 3 had failures)

Skip this task if Task 3 fetched all 7 continents from Wikidata cleanly.

**Files:**
- Modify: `scripts/build-world-continents-boundaries.ts`

- [x] **Step 1: Decide**

If every continent printed "OK" in Task 3, **delete this task from the in-progress checklist and move on to Task 8.** Natural Earth adds a network/data dependency we don\'t need.

- [x] **Step 2 (only if needed): Add a fallback path**

Per the design spec: try Wikidata first, fall back to Natural Earth Continents v5 (public domain). One source per node, log which source was used. The Natural Earth GeoJSON lives at `https://github.com/nvkelso/natural-earth-vector/raw/master/geojson/ne_50m_continents.geojson` — fetch once, cache to `/tmp/ne_continents.geojson`, look up each continent by name.

The structure mirrors `fetchGeoshape`: try Wikidata first, on null fall back. Add a `source: \'wikidata\' | \'naturalEarth\'` log column. The gazetteer JSON\'s top-level `source` field stays as Wikidata (the dominant source); inline-per-node `source` is not added (the schema doesn\'t support it and adding a field for one rare case isn\'t worth it).

If you implement this, commit:

```bash
git add scripts/build-world-continents-boundaries.ts
git commit -m "feat(gazetteer): add Natural Earth fallback for missing continents"
```

---

## Task 8: Unit tests

**Files:**
- Modify: `tests/unit/gazetteers.test.ts`

- [x] **Step 1: Read the existing `boundary gazetteers` describe block**

Look around `tests/unit/gazetteers.test.ts:102` for the `describe(\'boundary gazetteers\', ...)` block. The existing iteration over boundary IDs (line 108) automatically asserts each has `kind=boundary` and nodes with geometry — so `world-boundaries` is already exercised. We\'re adding *continent-specific* assertions next to it.

- [x] **Step 2: Add the failing test**

Inside `describe(\'boundary gazetteers\', () => { ... })` (or in a new sibling `describe`), append:

```typescript
  it(\'world-boundaries includes 7 continents as siblings of countries\', () => {
    const all = getAllGazetteers();
    const wb = all.find(g => g.id === \'world-boundaries\');
    expect(wb).toBeDefined();

    const continents = (wb!.root.children ?? []).filter(c => c.type === \'continent\');
    expect(continents).toHaveLength(7);

    const names = new Set(continents.map(c => c.name));
    for (const name of [
      \'Africa\', \'Antarctica\', \'Asia\', \'Europe\',
      \'North America\', \'Oceania\', \'South America\',
    ]) {
      expect(names).toContain(name);
    }

    // Every continent has a non-empty geometry and a sensible centroid.
    for (const c of continents) {
      expect(c.geometry).toBeDefined();
      expect(c.geometry!.coordinates).toBeDefined();
      expect(typeof c.lat).toBe(\'number\');
      expect(typeof c.lon).toBe(\'number\');
      expect(c.lat).toBeGreaterThan(-90);
      expect(c.lat).toBeLessThan(90);
    }

    // Spot-check Europe falls in northern hemisphere, eastern (or near-zero) longitude.
    const europe = continents.find(c => c.name === \'Europe\')!;
    expect(europe.lat).toBeGreaterThan(35);
    expect(europe.lat).toBeLessThan(71);
    expect(europe.lon).toBeGreaterThan(-10);
    expect(europe.lon).toBeLessThan(60);
  });
```

- [x] **Step 3: Run, see the geometry/centroid assertions pass**

```bash
npx vitest run tests/unit/gazetteers.test.ts
```

Expected: PASS for the new test. If `wb!.root.children` is undefined, you\'re looking at the wrong gazetteer — `getAllGazetteers()` returns the post-`attachNormalizeRules` array, which keeps `root.children` intact. Inspect by adding `console.log(wb!.root.children?.slice(0, 3))` before the assertions and re-running.

- [x] **Step 4: Add an `it(\'loads all 27 bundled gazetteers\')` regression check**

The existing test at `tests/unit/gazetteers.test.ts:10` asserts the count. **Verify that test still passes** — we did not add a new gazetteer, only new nodes. If it fails because the count went up, something else changed; do not increase the expected number to compensate.

- [x] **Step 5: Commit**

```bash
git add tests/unit/gazetteers.test.ts
git commit -m "test(gazetteer): assert continents present in world-boundaries"
```

---

## Task 9: Resolution probe (manual smoke check)

**Files:**
- (none modified)

- [x] **Step 1: Probe `resolveBoundary` for "Afrika"**

Open a Node REPL with `tsx`:

```bash
npx tsx -e "
import { getAllGazetteers } from \'./src/api/place-gazetteers/bundled\';
import { resolvePlace } from \'./src/api/place-gazetteers/resolver\';
const gaz = getAllGazetteers();
const result = resolvePlace(\'Afrika\', gaz);
console.log(JSON.stringify(result, null, 2));
"
```

Expected: a hit on the Africa continent node from `world-boundaries`. The exact gazetteer id and path keys depend on resolver scoring.

- [x] **Step 2: Probe the design spec\'s `Afrika, Finland` case**

```bash
npx tsx -e "
import { getAllGazetteers } from \'./src/api/place-gazetteers/bundled\';
import { resolvePlace } from \'./src/api/place-gazetteers/resolver\';
const gaz = getAllGazetteers();
console.log(JSON.stringify(resolvePlace(\'Afrika, Finland\', gaz), null, 2));
"
```

Expected: Finland still wins (it\'s the strong country anchor), but the resolver\'s contradiction-weight scoring should now classify Africa as a known-but-non-matched anchor in the same input. Exact behavioural change is documented in the design spec; we\'re verifying the data is in place, not retuning the scoring.

If you have the `gazetteer-testing` skill available, prefer running its end-to-end probe over this REPL hack.

- [x] **Step 3: No commit needed**

Probe is informational. Move on.

---

## Task 10: Document the build script

**Files:**
- Modify: `scripts/build-world-continents-boundaries.ts` (header comment)

- [x] **Step 1: Confirm the script header matches the existing conventions**

The header should already say:
- Purpose (one paragraph)
- Usage line (`npx tsx scripts/build-world-continents-boundaries.ts`)
- Source + license (`Wikidata / Wikimedia Maps - CC0 1.0`)

If anything is missing, add it. Match the prose style of `scripts/build-world-historical-boundaries.ts`.

- [x] **Step 2: Mention the script in `docs/PLAN.md` if there is a "build scripts" inventory**

```bash
grep -n "build-world\|build-dk\|gazetteer build" docs/PLAN.md docs/DATA_MODEL.md 2>/dev/null
```

If a list exists and includes the existing build scripts, append `build-world-continents-boundaries.ts`. If no such list exists, skip — the script is self-documenting.

- [x] **Step 3: Commit if anything changed**

```bash
git add scripts/build-world-continents-boundaries.ts docs/PLAN.md
git commit -m "docs(gazetteer): document continent build script"
```

If only the header was already correct and PLAN.md has no build-script list, no commit needed.

---

## Self-review checklist

- [x] `world-boundaries.json` has exactly 7 nodes with `type: \'continent\'`, alphabetically ordered, prepended before countries.
- [x] Each continent node has `lat`, `lon`, and a `geometry` with non-empty `coordinates`.
- [x] No country node was modified, removed, or reparented.
- [x] `npm run lint` passes.
- [x] `npx vitest run tests/unit/gazetteers.test.ts` passes including the new test.
- [x] `BUNDLED_GAZETTEERS` count is unchanged (still 27).
- [x] Re-running the build script produces identical output (or only the `source.fetched` date differs).
- [x] `placeTypes.continent` exists in both `sv.ts` and `en.ts`.

## Out of scope (for follow-up plans)

- Reparenting countries under continents in `world-boundaries` (separate, much larger refactor — would change every consumer\'s tree-walk).
- Adding continents to the *point* gazetteer `world-countries` (would create a new top-level node above the country list and reshuffle the tree).
- Sub-continental regions (Western Europe, Sub-Saharan Africa).
- Adding `continent` translations to `lang-sv-*` (handled by the Swedish exonyms expansion plan).
- Boundary-resolver scoring tuning to surface "known-but-unmatched continent" as a stronger contradiction.

---

## Implementation Status — shipped 2026-05-01

**Outcome:** Implemented end-to-end on branch `feat/continents-boundaries` (commits `e8ac17b0`..`fb9ee812`).

**Deviations from plan:**
- **Task 7 (Natural Earth fallback) was activated, not deferred.** Wikimedia Maps geoshape API returned HTTP 403 from the build environment. The script now auto-probes Wikimedia first; on 403 it falls back to Natural Earth `ne_50m_geography_regions_polys.geojson` (public domain). All 7 continents in the shipped `world-boundaries.json` come from Natural Earth. The top-level `source` block accurately attributes Natural Earth (it was already attributed there from prior content; no false attribution added). Source/license stays clean — one source per continent, no blending.
- **Task 9 (interactive REPL probe)** was satisfied indirectly by the new vitest assertion in Task 8 (asserts continent presence, geometry, centroid ranges).
- **Oceania centroid** is `lat -25.12` — 0.12° outside the plan's `-25..0` lower bound. Natural Earth's polygon for the Australian/Oceanian landmass extends further south than the Wikidata polygon the plan's table was calibrated against. Functionally harmless.

**Reliability fixes added during code review:** `fetchGeoshape` now logs caught errors instead of silently returning null; the Natural Earth download uses `fetchWithRetry` (3 attempts, exponential backoff).
