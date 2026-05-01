# `sv-landskap` Gazetteer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a new bundled point gazetteer `sv-landskap` covering the 25 Swedish historical provinces (landskap), so inputs like "Ångermanland", "Bohuslän", and "Skåne landskap" resolve to a geographic anchor independent of the modern län/kommun hierarchy.

**Architecture:** A new build script `scripts/build-sv-landskap.ts` runs a single Wikidata SPARQL query for instances of Q200250 (Swedish landskap), pulls Swedish label + centroid (P625) + aliases (P1448 / P1813), and writes a flat JSON tree under root `Sverige (landskap)`. The new file is registered in `src/api/place-gazetteers/bundled.ts`, growing `BUNDLED_GAZETTEERS` from 27 to 28. The Swedish suffix-strip rules get `landskap` added so `Skåne landskap` matches `Skåne`.

**Tech Stack:** TypeScript (`tsx` runner), Vitest, Wikidata SPARQL (CC0 1.0). Existing helpers in `src/gazetteer-build/sparql.ts`.

**Source spec:** `docs/plans/2026-05-01-sv-landskap-gazetteer-design.md`.

---

## File Structure

| File | Status | Purpose |
|---|---|---|
| `scripts/build-sv-landskap.ts` | Create | SPARQL query for Q200250 instances → write JSON |
| `src/api/place-gazetteers/data/sv-landskap.json` | Create (generated) | 1 root + 25 landskap children, point gazetteer |
| `src/api/place-gazetteers/bundled.ts` | Modify | Static import + push to `BUNDLED_GAZETTEERS` |
| `src/gazetteer-build/normalize-rules.ts` | Modify | Add `landskap` to `SV_RULES.stripSuffixes` |
| `tests/unit/gazetteers.test.ts` | Modify | Count assertion bumped 27→28; new landskap-resolution tests |

## Conventions

- Build scripts run with `npx tsx scripts/build-sv-landskap.ts`. Tests run with `npx vitest run tests/unit/gazetteers.test.ts`.
- Coordinates come from Wikidata P625 directly — round to 6 decimals via `round6` from `src/gazetteer-build/geo.ts`.
- Output JSON is sorted by Swedish locale (`localeCompare(\'sv\')`) for determinism.
- Conventional commits: `feat(gazetteer):`, `test(gazetteer):`, `chore(resolver):`.

---

## Task 1: Build script skeleton + SPARQL query

**Files:**
- Create: `scripts/build-sv-landskap.ts`

- [x] **Step 1: Create the script**

```typescript
/**
 * Build sv-landskap gazetteer from Wikidata.
 *
 * Queries Wikidata for instances of Q200250 (Swedish landskap), one row per
 * landskap with Swedish label, centroid (P625), and optional aliases.
 * Writes a flat point gazetteer with one root + 25 children.
 *
 * Usage: npx tsx scripts/build-sv-landskap.ts
 * Source: Wikidata - CC0 1.0
 */

import * as fs from \'fs\';
import * as path from \'path\';
import type { GazetteerNode } from \'../src/api/place-gazetteers/types\';
import { round6 } from \'../src/gazetteer-build/geo\';
import { sparqlFetch as sparqlFetchRaw } from \'../src/gazetteer-build/sparql\';

const DATA_DIR = path.join(__dirname, \'..\', \'src\', \'api\', \'place-gazetteers\', \'data\');
const OUT_PATH = path.join(DATA_DIR, \'sv-landskap.json\');

// One row per landskap. wkt = "Point(LON LAT)". Aliases via GROUP_CONCAT to
// flatten multiple altLabel rows into one.
const QUERY = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?item ?svLabel ?coord (GROUP_CONCAT(DISTINCT ?altLabel; SEPARATOR="|") AS ?aliases) WHERE {
  ?item wdt:P31 wd:Q200250 .
  ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item skos:altLabel ?altLabel . FILTER(LANG(?altLabel) = "sv") }
}
GROUP BY ?item ?svLabel ?coord
ORDER BY ?svLabel
`;

interface Row {
  itemQid: string;
  svLabel: string;
  lat: number;
  lon: number;
  aliases: string[];
}

function extractQid(uri: string): string | null {
  const m = uri.match(/(Q\\d+)$/);
  return m ? m[1] : null;
}

function parsePoint(wkt: string): { lat: number; lon: number } | null {
  // "Point(17.5 62.0)" - lon then lat
  const m = wkt.match(/Point\\(\\s*([-\\d.]+)\\s+([-\\d.]+)\\s*\\)/);
  if (!m) return null;
  const lon = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

async function main() {
  console.log(\'Building sv-landskap gazetteer...\\n\');

  type Binding = Record<string, { value: string }>;
  const bindings = await sparqlFetchRaw<Binding>(QUERY);
  console.log(`  Fetched ${bindings.length} rows from Wikidata.`);

  const rows: Row[] = [];
  for (const b of bindings) {
    const qid = extractQid(b.item?.value ?? \'\');
    const svLabel = b.svLabel?.value ?? \'\';
    const coordRaw = b.coord?.value ?? \'\';
    const aliasesRaw = b.aliases?.value ?? \'\';
    if (!qid || !svLabel || !coordRaw) {
      console.warn(`  Skipping incomplete row: qid=${qid} label=${svLabel} coord=${coordRaw}`);
      continue;
    }
    const point = parsePoint(coordRaw);
    if (!point) {
      console.warn(`  Skipping ${svLabel} - unparseable coord ${coordRaw}`);
      continue;
    }
    rows.push({
      itemQid: qid,
      svLabel,
      lat: point.lat,
      lon: point.lon,
      aliases: aliasesRaw ? aliasesRaw.split(\'|\').map(s => s.trim()).filter(Boolean) : [],
    });
  }

  console.log(`  Parsed ${rows.length} valid rows.`);
  if (rows.length !== 25) {
    console.warn(`  WARNING: expected 25 landskap, got ${rows.length}. Check query.`);
  }

  // Tasks 2-3 fill in the JSON build + write.
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [x] **Step 2: Run it and confirm 25 rows come back**

Run: `npx tsx scripts/build-sv-landskap.ts`
Expected: `Fetched NN rows from Wikidata.` followed by `Parsed 25 valid rows.` (or close — Wikidata occasionally has duplicate or stub instances; ≥24 is acceptable, <24 means the SPARQL is wrong).

If the count is way off, eyeball the row labels. Q200250 has been stable for years and should give exactly the 25 named in the design spec.

- [x] **Step 3: Commit**

```bash
git add scripts/build-sv-landskap.ts
git commit -m "feat(gazetteer): scaffold build-sv-landskap"
```

---

## Task 2: Build the gazetteer JSON structure

**Files:**
- Modify: `scripts/build-sv-landskap.ts`

- [x] **Step 1: Replace the `// Tasks 2-3 fill in...` comment with the JSON-build block**

Append:

```typescript
  // Build child nodes - one per landskap.
  const children: GazetteerNode[] = rows
    .map<GazetteerNode>(r => ({
      name: r.svLabel,
      type: \'landskap\',
      lat: round6(r.lat),
      lon: round6(r.lon),
      ...(r.aliases.length > 0 ? { aliases: r.aliases } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, \'sv\'));

  // Sweden centroid - good enough as the root point.
  // (Roughly Östersund area. Computed once, hardcoded; the root never moves.)
  const SE_LAT = 62.0;
  const SE_LON = 15.0;

  const today = new Date().toISOString().slice(0, 10);

  const gazetteer = {
    id: \'sv-landskap\',
    name: \'Svenska landskap\',
    locale: \'sv\',
    description: \'Sveriges 25 historiska landskap\',
    source: {
      name: \'Wikidata\',
      url: \'https://www.wikidata.org/wiki/Q200250\',
      license: \'CC0 1.0\',
      fetched: today,
    },
    kind: \'point\' as const,
    root: {
      name: \'Sverige (landskap)\',
      type: \'country\',
      lat: SE_LAT,
      lon: SE_LON,
      children,
    },
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(gazetteer, null, 2) + \'\\n\', \'utf-8\');

  const sizeKB = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
  console.log(`\\nWrote ${OUT_PATH} (${sizeKB} KB, ${children.length} landskap)`);
}
```

- [x] **Step 2: Run the script**

Run: `npx tsx scripts/build-sv-landskap.ts`
Expected: `Wrote .../sv-landskap.json (NN.N KB, 25 landskap)`.

- [x] **Step 3: Eyeball the output**

```bash
node -e "
const j = require(\'./src/api/place-gazetteers/data/sv-landskap.json\');
console.log(\'id:\', j.id);
console.log(\'count:\', j.root.children.length);
console.log(\'first 3:\', j.root.children.slice(0, 3).map(c => `${c.name} (${c.lat}, ${c.lon})`));
console.log(\'last 3:\', j.root.children.slice(-3).map(c => `${c.name} (${c.lat}, ${c.lon})`));
"
```

Expected: `count: 25`, names alphabetised in Swedish locale (Blekinge first, Östergötland last). All `lat` values between 55 (Skåne) and 69 (Lappland); all `lon` values between 11 and 25.

- [x] **Step 4: Confirm the 25 names match the design spec**

```bash
node -e "
const j = require(\'./src/api/place-gazetteers/data/sv-landskap.json\');
const expected = [
  \'Blekinge\', \'Bohuslän\', \'Dalarna\', \'Dalsland\', \'Gotland\', \'Gästrikland\',
  \'Halland\', \'Hälsingland\', \'Härjedalen\', \'Jämtland\', \'Lappland\', \'Medelpad\',
  \'Norrbotten\', \'Närke\', \'Skåne\', \'Småland\', \'Södermanland\', \'Uppland\',
  \'Värmland\', \'Västerbotten\', \'Västergötland\', \'Västmanland\', \'Ångermanland\',
  \'Öland\', \'Östergötland\',
];
const actual = new Set(j.root.children.map(c => c.name));
const missing = expected.filter(e => !actual.has(e));
const extra = [...actual].filter(a => !expected.includes(a));
console.log(\'missing:\', missing);
console.log(\'extra:\', extra);
"
```

Expected: `missing: []`, `extra: []`.

If something is missing, the SPARQL query is dropping rows — check if it has a `wdt:P31 wd:Q200250` row in Wikidata. Some landskap may be classified under more specific subclasses; if so, broaden the filter to `wdt:P31/wdt:P279* wd:Q200250` (instance-of-or-subclass-of) and re-run.

- [x] **Step 5: Commit**

```bash
git add scripts/build-sv-landskap.ts \
        src/api/place-gazetteers/data/sv-landskap.json
git commit -m "feat(gazetteer): build sv-landskap from Wikidata Q200250"
```

---

## Task 3: Determinism check

**Files:**
- (none modified)

- [x] **Step 1: Run the script twice and diff**

```bash
cp src/api/place-gazetteers/data/sv-landskap.json /tmp/sv-landskap-before.json
npx tsx scripts/build-sv-landskap.ts
diff /tmp/sv-landskap-before.json src/api/place-gazetteers/data/sv-landskap.json
```

Expected: only the `source.fetched` date line differs (or no diff at all). Coordinates and ordering are stable because we round + locale-sort.

If alias ordering shifts between runs, GROUP_CONCAT in SPARQL returns aliases in non-deterministic order — sort each row\'s `aliases` array in the build step:

```typescript
aliases: aliasesRaw ? aliasesRaw.split(\'|\').map(s => s.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, \'sv\')) : [],
```

If you needed that fix, commit:

```bash
git add scripts/build-sv-landskap.ts src/api/place-gazetteers/data/sv-landskap.json
git commit -m "fix(gazetteer): sort aliases for sv-landskap determinism"
```

---

## Task 4: Register in `bundled.ts`

**Files:**
- Modify: `src/api/place-gazetteers/bundled.ts`

- [x] **Step 1: Add the static import**

Around `bundled.ts:7-22` (the Swedish import block), add a new line:

```typescript
import svLandskap from \'./data/sv-landskap.json\';
```

Place it in the Swedish cluster alphabetically:

```typescript
// Swedish
import svSocknar from \'./data/sv-socknar.json\';
import svForsamlingar from \'./data/sv-forsamlingar.json\';
import svOrter from \'./data/sv-orter.json\';
import svGardar from \'./data/sv-gardar.json\';
import svKyrkor from \'./data/sv-kyrkor.json\';
import svLandskap from \'./data/sv-landskap.json\';
import svSockenstadBoundaries from \'./data/sv-sockenstad-boundaries.json\';
```

- [x] **Step 2: Add to `NORMALIZE_RULES_BY_ID`**

Find the `NORMALIZE_RULES_BY_ID` object (around line 80-100). Add `\'sv-landskap\': SV_RULES` next to the other Swedish IDs:

```typescript
  // Swedish
  \'sv-socknar\': SV_RULES,
  \'sv-forsamlingar\': SV_RULES,
  \'sv-orter\': SV_RULES,
  \'sv-gardar\': SV_RULES,
  \'sv-kyrkor\': SV_RULES,
  \'sv-landskap\': SV_RULES,
  \'sv-sockenstad-boundaries\': SV_RULES,
```

- [x] **Step 3: Push into `BUNDLED_GAZETTEERS`**

Around `bundled.ts:140-178`, in the `BUNDLED_GAZETTEERS` array, add `svLandskap as Gazetteer,` to the Swedish block:

```typescript
const BUNDLED_GAZETTEERS: Gazetteer[] = [
  // Swedish
  svSocknar as Gazetteer,
  svForsamlingar as Gazetteer,
  svOrter as Gazetteer,
  svGardar as Gazetteer,
  svKyrkor as Gazetteer,
  svLandskap as Gazetteer,
  svSockenstadBoundaries as Gazetteer,
  // Danish
  // ...rest unchanged
];
```

- [x] **Step 4: Run lint + the full vitest pass**

```bash
npm run lint
npx vitest run tests/unit/gazetteers.test.ts
```

Expected: lint passes. The `loads all 27 bundled gazetteers` test FAILS because the count is now 28. We fix that in Task 6 — for now, log "test failure expected, fixed in Task 6" and proceed.

- [x] **Step 5: Commit**

```bash
git add src/api/place-gazetteers/bundled.ts
git commit -m "feat(gazetteer): register sv-landskap in bundled set"
```

---

## Task 5: Add `landskap` to the Swedish suffix-strip list

**Files:**
- Modify: `src/gazetteer-build/normalize-rules.ts:11-15`

- [x] **Step 1: Add `\'landskap\'` to `SV_RULES.stripSuffixes`**

Edit:

```typescript
export const SV_RULES: GazetteerNormalizeRules = {
  stripSuffixes: [
    \'församling\', \'socken\', \'kommun\', \'stad\', \'härad\', \'län\', \'distrikt\', \'pastorat\',
    \'landskap\',
    \'kn\', \'sn\', \'fs\',
  ],
};
```

The order inside the array doesn\'t matter for matching — the resolver tries every entry. Group it on its own line so the diff is clean.

- [x] **Step 2: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [x] **Step 3: Commit**

```bash
git add src/gazetteer-build/normalize-rules.ts
git commit -m "chore(resolver): add \'landskap\' to SV_RULES.stripSuffixes"
```

---

## Task 6: Tests — count + resolution

**Files:**
- Modify: `tests/unit/gazetteers.test.ts`

- [x] **Step 1: Bump the count assertion**

At `tests/unit/gazetteers.test.ts:10`:

```typescript
  it(\'loads all 28 bundled gazetteers\', () => {
```

Update the body\'s expected count from 27 to 28 (whatever the existing assertion was). Search the file for `27` to make sure no related count snapshot is left over.

- [x] **Step 2: Add an `includes sv-landskap` block**

Find the `BUNDLED_IDS` (or equivalent) array in the same file (around line 23) — the list of expected ids in the iterated `it(\'includes ${id}\')` test. Append `\'sv-landskap\'`:

```typescript
const BUNDLED_IDS = [
  // ...existing ids
  \'sv-landskap\',
];
```

(If the test uses a different mechanism for the per-id check, just confirm sv-landskap is in whatever list drives it.)

- [x] **Step 3: Add resolution tests**

Append a new `describe`:

```typescript
describe(\'sv-landskap resolution\', () => {
  const gazetteers = getAllGazetteers();

  it(\'has 25 landskap\', () => {
    const gaz = gazetteers.find(g => g.id === \'sv-landskap\')!;
    expect(gaz).toBeDefined();
    expect(gaz.root.children).toHaveLength(25);
  });

  it(\'every landskap has lat/lon and type=landskap\', () => {
    const gaz = gazetteers.find(g => g.id === \'sv-landskap\')!;
    for (const c of gaz.root.children!) {
      expect(c.type).toBe(\'landskap\');
      expect(typeof c.lat).toBe(\'number\');
      expect(typeof c.lon).toBe(\'number\');
      expect(c.lat).toBeGreaterThan(54);
      expect(c.lat).toBeLessThan(70);
      expect(c.lon).toBeGreaterThan(10);
      expect(c.lon).toBeLessThan(25);
    }
  });

  it(\'resolves "Ångermanland" to sv-landskap\', () => {
    const result = resolvePlace(\'Ångermanland\', gazetteers);
    expect(result).toBeDefined();
    // Find the match coming from sv-landskap.
    const fromLandskap = result.matches?.find(m => m.gazetteerId === \'sv-landskap\');
    expect(fromLandskap).toBeDefined();
  });

  it(\'resolves "Bohuslän" to the landskap (not the modern län)\', () => {
    const result = resolvePlace(\'Bohuslän\', gazetteers);
    expect(result).toBeDefined();
    const fromLandskap = result.matches?.find(m => m.gazetteerId === \'sv-landskap\');
    expect(fromLandskap).toBeDefined();
    // Bohuslän no longer exists as a modern län - so sv-orter should NOT match.
    const fromOrter = result.matches?.find(m => m.gazetteerId === \'sv-orter\');
    expect(fromOrter).toBeUndefined();
  });

  it(\'strips "landskap" suffix - "Skåne landskap" matches the same as "Skåne"\', () => {
    const a = resolvePlace(\'Skåne landskap\', gazetteers);
    const b = resolvePlace(\'Skåne\', gazetteers);
    const aFromLandskap = a.matches?.find(m => m.gazetteerId === \'sv-landskap\');
    const bFromLandskap = b.matches?.find(m => m.gazetteerId === \'sv-landskap\');
    expect(aFromLandskap?.path).toEqual(bFromLandskap?.path);
  });
});
```

The exact `result.matches` shape depends on `resolvePlace`\'s return type — adjust the property names to match the existing tests\' usage above (around line 138-170 of `gazetteers.test.ts` they pull e.g. `result.matches[0].gazetteerId`). Mirror what works.

- [x] **Step 4: Run the full gazetteer test file**

```bash
npx vitest run tests/unit/gazetteers.test.ts
```

Expected: ALL tests pass (count = 28, sv-landskap included, resolution tests green).

If a test fails because the resolver returns a different shape than assumed, **read the actual return value** instead of guessing — `console.log(JSON.stringify(result, null, 2))` inside the test, run once, fix the assertion.

- [x] **Step 5: Commit**

```bash
git add tests/unit/gazetteers.test.ts
git commit -m "test(gazetteer): cover sv-landskap registration and resolution"
```

---

## Task 7: Disambiguation against `sv-orter` Skåne län

**Files:**
- Modify: `tests/unit/gazetteers.test.ts`

- [x] **Step 1: Add the disambiguation tests called out in the design spec**

Inside the `describe(\'sv-landskap resolution\', ...)` block, add:

```typescript
  it(\'"Skåne län" still resolves to the modern Skåne län (not the landskap)\', () => {
    const result = resolvePlace(\'Skåne län\', gazetteers);
    const fromOrter = result.matches?.find(m => m.gazetteerId === \'sv-orter\');
    // The län suffix anchors to the modern administrative tree.
    expect(fromOrter).toBeDefined();
  });

  it(\'"Skåne" (bare) returns matches from both gazetteers\', () => {
    const result = resolvePlace(\'Skåne\', gazetteers);
    const ids = new Set((result.matches ?? []).map(m => m.gazetteerId));
    expect(ids.has(\'sv-landskap\')).toBe(true);
    expect(ids.has(\'sv-orter\')).toBe(true);
    // Don\'t lock in which wins - the resolver\'s scoring picks one and the
    // test should reflect whatever it produces today, not pre-commit a winner.
  });
```

- [x] **Step 2: Run**

```bash
npx vitest run tests/unit/gazetteers.test.ts
```

Expected: PASS.

If the bare-`Skåne` test fails because only one gazetteer matches, you have a real disambiguation issue worth investigating with the user — commit only after the test reflects actual behaviour.

- [x] **Step 3: Commit**

```bash
git add tests/unit/gazetteers.test.ts
git commit -m "test(gazetteer): assert sv-landskap vs sv-orter disambiguation"
```

---

## Task 8: i18n — `placeTypes.landskap`

**Files:**
- Check: `src/renderer/i18n/sv.ts:631-644`
- Modify if missing: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`

- [x] **Step 1: Check whether `placeTypes.landskap` already exists**

```bash
grep -n "landskap" src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
```

The Swedish `placeTypes` block at `sv.ts:631-644` already has `province: \'Landskap\'`. That maps the type **value** `province` to the Swedish word "Landskap". We use type value `landskap` (not `province`) for the new gazetteer — so the badge will fall through to "Annat" / "other" until we add it.

- [x] **Step 2: Add `landskap: \'Landskap\'` to `sv.ts`**

In the `placeTypes:` block:

```typescript
  placeTypes: {
    continent: \'Kontinent\',  // (added in continents plan; skip if not yet present)
    country: \'Land\',
    admin1: \'Delstat/Region\',
    province: \'Landskap\',
    landskap: \'Landskap\',
    county: \'Län\',
    // ...rest unchanged
  },
```

Both `province` and `landskap` map to the same Swedish word. That\'s fine — the type field is free-form and we control what the gazetteer emits.

- [x] **Step 3: Add `landskap: \'Province\'` to `en.ts`**

In the matching `placeTypes` block in `en.ts`. The English label should match `province` (already English-named) — both keys map to the same string.

- [x] **Step 4: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [x] **Step 5: Commit**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(i18n): add landskap placeType label"
```

---

## Task 9: Manual smoke check

**Files:**
- (none modified)

- [x] **Step 1: Start the dev app**

```bash
./.devcontainer/dev-debug.sh
```

- [x] **Step 2: Use `slaktforskning-dev` MCP to drive the UI**

(This is the user\'s preferred inspection workflow per the feedback memory.)

1. `ui_screenshot` — confirm the app loads.
2. Navigate to a person, open the place picker (e.g. for an event), type "Ångermanland" — confirm a hit appears tagged as Landskap.
3. Type "Skåne landskap" — confirm it matches the landskap node.
4. Type "Bohuslän" — confirm it matches the landskap (and *only* the landskap — Bohuslän is not a modern län).

If any of those probes fail, the data is registered correctly but the picker UI is filtering out the new gazetteer — check if `GazetteersView` defaults include `sv-landskap` or if the user needs to enable it explicitly. (Per the renderer rules: `usePlaceResolver` defaults to all bundled gazetteers when `gazetteer_config` is null, so a fresh DB should see it. An existing DB with a saved config may have it disabled.)

- [x] **Step 3: No commit — informational**

---

## Self-review checklist

- [x] `sv-landskap.json` exists, has `kind: \'point\'`, root `Sverige (landskap)`, exactly 25 children.
- [x] All 25 expected landskap names present (per the design spec list).
- [x] Every node has `type: \'landskap\'`, lat in [54, 70], lon in [10, 25].
- [x] `bundled.ts` imports `svLandskap` and pushes it into `BUNDLED_GAZETTEERS`.
- [x] `NORMALIZE_RULES_BY_ID[\'sv-landskap\'] = SV_RULES`.
- [x] `SV_RULES.stripSuffixes` includes `\'landskap\'`.
- [x] `tests/unit/gazetteers.test.ts` has count = 28, sv-landskap in the per-id list, the new resolution tests, and the disambiguation tests.
- [x] `placeTypes.landskap` exists in both `sv.ts` and `en.ts`.
- [x] `npm run lint` and `npx vitest run tests/unit/gazetteers.test.ts` both pass.
- [x] Re-running the build script produces only a date-line diff.

## Out of scope

- Boundary geometry for landskap (`sv-landskap-boundaries.json` from P3896) — separate small spec.
- Pre-1973 parish hierarchy under landskap.
- Reparenting län under landskap (the two are different hierarchies, would break the modern tree).
- Landskap entries in `lang-sv-*` (handled by the Swedish exonyms expansion plan, only if Swedish exonyms exist for the names — most don\'t).

---

## Implementation Status — shipped 2026-05-01

**Outcome:** Implemented end-to-end on `feat/sv-landskap` (commits `0f87a521`..`97929119`).

**Deviations from plan:**
- **Wikidata QID corrected.** The plan referenced `Q200250` but that's actually "metropolis" (returns 56 world cities). The correct QID for "province of Sweden" is `Q193556`. Build script comment, source URL, and the spec link in `sv-landskap.json` all use Q193556.
- **Test return-type adapted.** Plan pseudocode used `result.matches?.find(...)`; actual `PlaceResolveResult` exposes `result.gazetteer: string` (single match). Tests rewritten with `loadGazetteers` per-test-isolated configs to disambiguate which gazetteer matched. Stronger than the plan's pseudocode.
- **Aliases sorted with `localeCompare("sv")`** in the build script (not in the plan, but matches the determinism principle).

Source/license: single Wikidata source (CC0 1.0), no mixing.
