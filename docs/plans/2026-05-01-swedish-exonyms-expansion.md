# Swedish-Language Exonyms Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Broaden the two existing Swedish-language gazetteers (`lang-sv-geonames`, `lang-sv-wikidata`) to cover Swedish exonyms for European capitals and major cities, so inputs like "Bryssel", "Köpenhamn", "Wien", "Florens" actually resolve. Pure data work — no new files, no new schema, no resolver changes.

**Architecture:** Two existing build scripts get broader scopes:
- `scripts/build-lang-sv-geonames.ts` — currently walks countries + admin1; extend the walk to include populated places `feature_class=P` with `population ≥ 100000`. Source: GeoNames `alternateNamesV2.txt` filtered by `isolanguage=sv`. CC BY 4.0.
- `scripts/build-lang-sv-wikidata.ts` — currently scoped to Nordic admin divisions; add two SPARQL queries for European admin1 outside the Nordics and for European capital cities with distinct Swedish labels. CC0 1.0.

Output JSON files grow but `bundled.ts` and `BUNDLED_GAZETTEERS` count stay unchanged. The hard rule is **no hand-edited aliases** — every Swedish name traces back to GeoNames or Wikidata.

**Tech Stack:** TypeScript (`tsx` runner), Vitest, Wikidata SPARQL, GeoNames bulk dumps (`alternateNamesV2.txt`, `cities15000.txt`).

**Source spec:** `docs/plans/2026-05-01-swedish-exonyms-expansion-design.md`.

---

## Pre-flight: confirm the world-countries / world-admin1 base

Both build scripts read from `world-countries.json` and `world-admin1.json` to get canonical name → path-key mappings. Cities live one level below admin1 in our model — but `world-admin1.json` does NOT have city children. We have two options for the new "City > pathKey" entries:

a. **Use a virtual third level on the lookup side only.** The translation map key is `"Country > Admin1 > City"`. The resolver\'s lang-merge already supports arbitrary path keys; if no node matches the city level, the translation is unused but harmless.
b. **Walk `world.json` (the source for world-countries / world-admin1) for cities.** Heavier, requires re-running `build-world.ts` to populate cities into `world-countries.json` first.

**This plan uses option (a).** Adding cities into `world-countries` is a separate, larger change. We emit `Country > Admin1 > City` keys; if/when the resolver-side gazetteer ever has a matching city node, the alias attaches automatically.

This means the resolver must accept lang-translation entries that don\'t correspond to a current node. Verify in Task 1 before writing data.

---

## File Structure

| File | Status | Purpose |
|---|---|---|
| `scripts/build-lang-sv-geonames.ts` | Modify | Add city walk; broaden altname filter |
| `scripts/build-lang-sv-wikidata.ts` | Modify | Add European admin1 + capital-cities SPARQL |
| `src/api/place-gazetteers/data/lang-sv-geonames.json` | Modify (regenerate) | New entries for European cities |
| `src/api/place-gazetteers/data/lang-sv-wikidata.json` | Modify (regenerate) | New entries for European admin1 + capitals |
| `tests/unit/gazetteers.test.ts` | Modify | Add specific exonym resolution tests (Bryssel, Köpenhamn, Wien, Florens) |

No changes to `bundled.ts`, `world-countries.json`, `world-admin1.json`, or the resolver.

## Conventions

- Build scripts run with `npx tsx scripts/<name>.ts`. Tests run with `npx vitest run tests/unit/gazetteers.test.ts`.
- The GeoNames bulk dumps are large (~600 MB unzipped) and live under `/tmp/`. Both scripts already have prerequisite curl commands documented in their headers — Task 2 walks through running them.
- All new aliases must trace back to a canonical source. **No hand-edited entries in the JSON.**
- Conventional commits: `feat(gazetteer):`, `test(gazetteer):`.

---

## Task 1: Verify the resolver tolerates unmatched lang-translation keys

**Files:**
- (read-only inspection)

- [x] **Step 1: Read `mergeTranslations` (or whatever the lang-merge step is called)**

```bash
grep -RIn "lang-sv\|translations\[" src/api/place-gazetteers/resolver.ts | head -20
```

Look at how the resolver consumes the `translations` map. Specifically: when the lang gazetteer has key `"Belgium > Brussels Capital > Brussels"` and no point gazetteer node matches that exact path, does the resolver:
- (a) silently skip the entry (good — option (a) above is safe), or
- (b) crash / emit a warning?

- [x] **Step 2: Decide**

If the resolver silently ignores unmatched keys, proceed with this plan as written.

If the resolver crashes, log a warning, or accumulates the unmatched keys in a way that pollutes results, this plan stops here. The user needs to decide whether to:
- Add city nodes to `world-countries.json` first (significant scope addition), or
- Patch the resolver to ignore unmatched keys (smaller change but it\'s a resolver behaviour change).

If a patch is needed, it becomes Task 1.5 of this plan and you write it before continuing. The patch should be a single-line: skip-if-not-found in `mergeTranslations`.

- [x] **Step 3: No commit — informational**

---

## Task 2: GeoNames extension — pull cities into `lang-sv-geonames.json`

**Files:**
- Modify: `scripts/build-lang-sv-geonames.ts`

- [x] **Step 1: Download the prerequisites**

The script already documents these in its header comment, but run them now if not already cached:

```bash
[ -f /tmp/geonames_altnames/alternateNamesV2.txt ] || (
  curl -o /tmp/alternateNamesV2.zip https://download.geonames.org/export/dump/alternateNamesV2.zip
  unzip -o /tmp/alternateNamesV2.zip -d /tmp/geonames_altnames/
)
[ -f /tmp/countryInfo.txt ] || curl -o /tmp/countryInfo.txt https://download.geonames.org/export/dump/countryInfo.txt
[ -f /tmp/admin1CodesASCII.txt ] || curl -o /tmp/admin1CodesASCII.txt https://download.geonames.org/export/dump/admin1CodesASCII.txt
[ -f /tmp/cities15000.txt ] || (
  curl -o /tmp/cities15000.zip https://download.geonames.org/export/dump/cities15000.zip
  unzip -o /tmp/cities15000.zip -d /tmp/
)
```

Total disk: ~4 GB unzipped. cities15000.txt is ~30 MB. The bulk altnames is the heavy file.

- [x] **Step 2: Add city loading to the script**

In `scripts/build-lang-sv-geonames.ts`, add a constant near the top:

```typescript
const CITIES_FILE = \'/tmp/cities15000.txt\';
const CITY_MIN_POPULATION = 100_000;
```

After the existing `parseAdmin1Codes(...)` call, add a `parseCities` function and call it:

```typescript
/**
 * Parse cities15000.txt and return cities with population >= threshold.
 * Returns: geonameId -> { name, iso2, admin1Code, population }
 */
function parseCities(filePath: string, minPopulation: number): Map<string, {
  name: string; iso2: string; admin1Code: string; population: number;
}> {
  const result = new Map<string, { name: string; iso2: string; admin1Code: string; population: number }>();
  const content = fs.readFileSync(filePath, \'utf-8\');
  for (const line of content.split(\'\\n\')) {
    if (!line.trim()) continue;
    const cols = line.split(\'\\t\');
    // cities15000 columns:
    // 0=geonameId, 1=name, 2=asciiName, 3=altNames, 4=lat, 5=lon, 6=featureClass,
    // 7=featureCode, 8=countryCode, 9=cc2, 10=admin1Code, 11=admin2, 12=admin3,
    // 13=admin4, 14=population, ...
    const geonameId = cols[0];
    const name = cols[1];
    const featureClass = cols[6];
    const iso2 = cols[8];
    const admin1Code = cols[10];
    const population = parseInt(cols[14] ?? \'0\', 10) || 0;
    if (featureClass !== \'P\') continue;
    if (population < minPopulation) continue;
    if (!geonameId || !name || !iso2) continue;
    result.set(geonameId, { name, iso2, admin1Code, population });
  }
  return result;
}
```

Call it inside `main()`, near where the country / admin1 maps are built:

```typescript
console.log(\'Parsing cities15000.txt for cities >= 100k population...\');
const citiesByGeonameId = parseCities(CITIES_FILE, CITY_MIN_POPULATION);
console.log(`  Cities: ${citiesByGeonameId.size}`);
```

Then expand `allRelevantIds`:

```typescript
const allRelevantIds = new Set([
  ...countryGeonameIds,
  ...admin1GeonameIds,
  ...citiesByGeonameId.keys(),
]);
```

- [x] **Step 3: Add a `svCityNames` collector to the altname loop**

Same shape as `svCountryNames` and `svAdmin1Names`. After the existing `if (countryGeonameIds.has(geonameId))` / `if (admin1GeonameIds.has(geonameId))` branches, add:

```typescript
} else if (citiesByGeonameId.has(geonameId)) {
  if (!svCityNames.has(geonameId)) svCityNames.set(geonameId, []);
  svCityNames.get(geonameId)!.push(entry);
}
```

Declare `svCityNames` next to the others:

```typescript
const svCityNames = new Map<string, { name: string; preferred: boolean; short: boolean }[]>();
```

- [x] **Step 4: Build city translations and merge into the output**

After the existing `// Admin1` block, add:

```typescript
// Cities
const cityTranslations: Record<string, string[]> = {};
for (const [geonameId, entries] of svCityNames) {
  const city = citiesByGeonameId.get(geonameId);
  if (!city) continue;

  const canonicalCountryName = iso2ToCountryName.get(city.iso2);
  if (!canonicalCountryName) continue;

  const admin1Lookup = `${city.iso2}.${city.admin1Code}`;
  const admin1Info = admin1CodeToPathKey.get(admin1Lookup);

  const svName = pickBestName(entries);
  if (svName === city.name) continue;  // no exonym

  // Path key: "Country > Admin1 > City" if admin1 known, else "Country > City"
  const pathKey = admin1Info
    ? `${canonicalCountryName} > ${admin1Info.admin1Name} > ${city.name}`
    : `${canonicalCountryName} > ${city.name}`;

  cityTranslations[pathKey] = [svName];
}

console.log(`  Cities with exonyms: ${Object.keys(cityTranslations).length}`);
```

Then merge `cityTranslations` into `admin1Translations` (which the resolver consumes for the broader `world-admin1` translation map):

```typescript
for (const [key, values] of Object.entries(cityTranslations)) {
  admin1Translations[key] = values;
}
```

- [x] **Step 5: Run the script**

```bash
npx tsx scripts/build-lang-sv-geonames.ts
```

Expected runtime: 2–4 minutes (the altnames file is 700+ MB and gets streamed line-by-line). Output should report `Cities with exonyms: NNN` (ballpark 100–500 — depends on how many European cities have Swedish altnames in GeoNames).

- [x] **Step 6: Spot-check the output**

```bash
node -e "
const j = require(\'./src/api/place-gazetteers/data/lang-sv-geonames.json\');
const t = j.translations[\'world-admin1\'];
const probes = [\'Belgium > Brussels Capital > Brussels\', \'Belgium > Brussels\', \'Austria > Vienna > Vienna\', \'Austria > Vienna\'];
for (const k of probes) console.log(k, \'->\', t[k] ?? \'(missing)\');
console.log(\'total entries:\', Object.keys(t).length);
"
```

Expected: at least Brussels resolves to "Bryssel" under one of the probed keys, and one of the Vienna keys returns "Wien". If both Brussels probes return `(missing)`, the issue is either:
- GeoNames doesn\'t have a `sv` altname for Brussels (unlikely — verify by `grep "geonameId" /tmp/geonames_altnames/alternateNamesV2.txt | grep -P "\\t2800866\\t" | grep -P "\\tsv\\t"` where 2800866 is Brussels\' geonameId), or
- the path key shape doesn\'t match what we wrote (admin1 missing or named differently). Inspect with `console.log(Object.keys(cityTranslations).filter(k => k.includes(\'Belgium\')))` and adjust.

- [x] **Step 7: Commit**

```bash
git add scripts/build-lang-sv-geonames.ts \
        src/api/place-gazetteers/data/lang-sv-geonames.json
git commit -m "feat(gazetteer): include major-city exonyms in lang-sv-geonames"
```

---

## Task 3: Wikidata extension — European admin1 + capital cities

**Files:**
- Modify: `scripts/build-lang-sv-wikidata.ts`

- [x] **Step 1: Add a "European admin1 outside Nordic" SPARQL query**

Append after the existing IS_SVEITARFELOG_QUERY constant (around the same area as the other queries):

```typescript
/**
 * European admin1 divisions outside the Nordics (those are already covered above).
 * Query approach: instances of "first-level administrative country subdivision" (Q10864048)
 * located in (P17) any country with continent (P30) = Europe (Q46), excluding the
 * Nordic countries we handle separately (DK Q35, NO Q20, SE Q34, FI Q33, IS Q189).
 *
 * Native label uses the country\'s primary language - we ask for the country\'s P37
 * (official language) but settle for any non-sv label since Wikidata has many.
 *
 * Filter: only emit when sv label exists and differs from native.
 */
const EU_ADMIN1_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q10864048 .
  ?item wdt:P17 ?country .
  ?country wdt:P30 wd:Q46 .
  FILTER(?country NOT IN (wd:Q35, wd:Q20, wd:Q34, wd:Q33, wd:Q189))
  ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
  OPTIONAL {
    ?item rdfs:label ?nativeLabel .
    FILTER(LANG(?nativeLabel) IN ("en", "de", "fr", "it", "nl", "es", "pl"))
  }
  FILTER(BOUND(?nativeLabel) && ?nativeLabel != ?svLabel)
}
LIMIT 5000
`;

/**
 * Capital cities of European countries with distinct Swedish labels.
 * P31 wd:Q5119 = capital. P17 -> country -> P30 wd:Q46 = Europe.
 */
const EU_CAPITAL_CITIES_QUERY = `
SELECT DISTINCT ?nativeLabel ?svLabel WHERE {
  ?item wdt:P31 wd:Q5119 .
  ?item wdt:P17 ?country .
  ?country wdt:P30 wd:Q46 .
  ?item rdfs:label ?svLabel . FILTER(LANG(?svLabel) = "sv")
  OPTIONAL {
    ?item rdfs:label ?nativeLabel .
    FILTER(LANG(?nativeLabel) IN ("en", "de", "fr", "it", "nl", "es", "pl", "cs", "hu", "el", "ro"))
  }
  FILTER(BOUND(?nativeLabel) && ?nativeLabel != ?svLabel)
}
LIMIT 1000
`;
```

(Adjust the language filter list as needed — these are the languages most likely to appear as `nativeLabel`.)

- [x] **Step 2: Fetch the new queries**

In `main()`, after the existing `await fetchWithRetry(IS_SVEITARFELOG_QUERY, ...)` line, append:

```typescript
  await sleep(1500);
  const euAdmin1Rows = await fetchWithRetry(EU_ADMIN1_QUERY, \'EU admin1 outside Nordics\');
  await sleep(1500);
  const euCapitalRows = await fetchWithRetry(EU_CAPITAL_CITIES_QUERY, \'EU capital cities\');
```

- [x] **Step 3: Map the new rows against `world-admin1` index**

The Wikidata script\'s existing approach is to load each Nordic gazetteer (`dk-sogne`, `no-kommuner`, etc.) and build per-gazetteer name indices. For the new European data, we want to attach to `world-admin1` (the same target the GeoNames script uses for its admin1 / city merge).

After `loadGaz` calls, add:

```typescript
const worldAdmin1 = loadGaz(\'world-admin1.json\');

/**
 * Build a path index for world-admin1 covering both the country (lvl 1)
 * and admin1 (lvl 2) names.
 */
function buildWorldAdmin1Index(root: GazetteerNode): Map<string, string> {
  const index = new Map<string, string>();
  for (const country of root.children ?? []) {
    index.set(country.name.toLowerCase(), country.name);
    for (const admin1 of country.children ?? []) {
      const pathKey = `${country.name} > ${admin1.name}`;
      index.set(admin1.name.toLowerCase(), pathKey);
    }
  }
  return index;
}

const worldAdmin1Index = buildWorldAdmin1Index(worldAdmin1.root);
```

Then build the translation map:

```typescript
const euAdmin1Translations = buildTranslationMap(
  [...euAdmin1Rows, ...euCapitalRows],
  worldAdmin1Index,
);
console.log(`  EU admin1 + capitals translations: ${Object.keys(euAdmin1Translations).length}`);
```

- [x] **Step 4: Add the new entries to the output\'s `translations` map**

Find the existing `translations: { ... }` block in the output gazetteer near the bottom of `main()`. Add a new entry:

```typescript
    translations: {
      \'dk-sogne\': dkSogneTranslations,
      \'dk-sogne-dawa\': dkSogneDawaTranslations,
      \'no-kommuner\': noTranslations,
      \'fi-kunnat\': fiTranslations,
      \'is-sveitarfelog\': isTranslations,
      \'world-admin1\': euAdmin1Translations,
    },
```

- [x] **Step 5: Run the script**

```bash
npx tsx scripts/build-lang-sv-wikidata.ts
```

Expected: queries fetch 200–800 rows each. Final translation count: 100–500 entries in `world-admin1`.

If a query times out (Wikidata SPARQL has a 60s limit), tighten the LIMIT or split the query by sub-region (e.g. one for Western Europe, one for Eastern). Watch for the `Error fetching` log — when those appear with empty rows, we silently lose data.

- [x] **Step 6: Spot-check**

```bash
node -e "
const j = require(\'./src/api/place-gazetteers/data/lang-sv-wikidata.json\');
const t = j.translations[\'world-admin1\'];
console.log(\'count:\', Object.keys(t).length);
const probes = [\'Austria\', \'Italy\', \'Belgium\', \'Czech Republic\'];
for (const c of probes) {
  const matches = Object.keys(t).filter(k => k.startsWith(c)).slice(0, 5);
  console.log(c, matches);
}
"
```

Expected: each probed country has at least one admin1 or capital entry.

- [x] **Step 7: Commit**

```bash
git add scripts/build-lang-sv-wikidata.ts \
        src/api/place-gazetteers/data/lang-sv-wikidata.json
git commit -m "feat(gazetteer): include EU admin1 + capitals in lang-sv-wikidata"
```

---

## Task 4: Determinism check

**Files:**
- (none modified)

- [x] **Step 1: Re-run both scripts and diff**

```bash
cp src/api/place-gazetteers/data/lang-sv-geonames.json /tmp/lsg-before.json
cp src/api/place-gazetteers/data/lang-sv-wikidata.json /tmp/lsw-before.json
npx tsx scripts/build-lang-sv-geonames.ts
npx tsx scripts/build-lang-sv-wikidata.ts
diff /tmp/lsg-before.json src/api/place-gazetteers/data/lang-sv-geonames.json
diff /tmp/lsw-before.json src/api/place-gazetteers/data/lang-sv-wikidata.json
```

Expected: only `source.fetched` date differs. If row order or content shifts:
- GeoNames: confirm the `sortedObject(...)` helper is applied to all translation maps (not just countries / admin1).
- Wikidata: confirm `buildTranslationMap` deterministically inserts in a stable order. If multiple rows produce the same `pathKey` with different `svLabel`, push to the array — but sort the array before writing.

If you fixed determinism in either script:

```bash
git add scripts/build-lang-sv-*.ts \
        src/api/place-gazetteers/data/lang-sv-*.json
git commit -m "fix(gazetteer): sort lang-sv translation outputs"
```

---

## Task 5: Resolution tests

**Files:**
- Modify: `tests/unit/gazetteers.test.ts`

- [x] **Step 1: Add the design-spec\'s required probes as tests**

Inside the existing `describe(\'language gazetteer integration\', ...)` block (around line 173) or a new sibling block:

```typescript
describe(\'Swedish exonym expansion\', () => {
  const gazetteers = getAllGazetteers();

  it(\'resolves "Bryssel" to Brussels\', () => {
    const result = resolvePlace(\'Bryssel\', gazetteers);
    expect(result).toBeDefined();
    // The path key shape is "Belgium > Brussels Capital > Brussels" (or similar).
    // We assert the country anchor is Belgium - more permissive than the exact path.
    const matches = result.matches ?? [];
    expect(matches.length).toBeGreaterThan(0);
    const belgium = matches.find(m => m.path?.[0] === \'Belgium\' || m.country === \'Belgium\');
    expect(belgium).toBeDefined();
  });

  it(\'resolves "Köpenhamn" to Denmark > Hovedstaden > København\', () => {
    const result = resolvePlace(\'Köpenhamn\', gazetteers);
    const matches = result.matches ?? [];
    const denmark = matches.find(m => m.path?.[0] === \'Denmark\' || m.country === \'Denmark\' || m.country === \'Danmark\');
    expect(denmark).toBeDefined();
  });

  it(\'resolves "Wien" to Austria\', () => {
    const result = resolvePlace(\'Wien\', gazetteers);
    const matches = result.matches ?? [];
    const austria = matches.find(m => m.path?.[0] === \'Austria\' || m.country === \'Austria\');
    expect(austria).toBeDefined();
  });

  it(\'resolves "Florens" to Italy\', () => {
    const result = resolvePlace(\'Florens\', gazetteers);
    const matches = result.matches ?? [];
    const italy = matches.find(m => m.path?.[0] === \'Italy\' || m.country === \'Italy\');
    expect(italy).toBeDefined();
  });

  it(\'does NOT manufacture a "Bryssel" hit when none exists upstream\', () => {
    // Negative-control: a city that is unlikely to have a Swedish exonym in
    // GeoNames or Wikidata should NOT resolve via the lang gazetteer.
    // Pick something obscure - "Åhlborg" (a typo of Aalborg) was the example
    // in the design spec.
    const result = resolvePlace(\'Åhlborg, Danmark\', gazetteers);
    // The result may have a Denmark match (the country anchor wins), but the
    // city-level match should be absent OR equal to the canonical "Aalborg".
    const matches = result.matches ?? [];
    for (const m of matches) {
      // No path component named "Åhlborg" should appear.
      const hasAhlborg = (m.path ?? []).some(p => p === \'Åhlborg\');
      expect(hasAhlborg).toBe(false);
    }
  });
});
```

The exact `result.matches[i].path` / `country` shape depends on `resolvePlace`\'s return type — adjust the assertions to match the existing language-gazetteer tests around `gazetteers.test.ts:178-208`.

- [x] **Step 2: Run the new tests**

```bash
npx vitest run tests/unit/gazetteers.test.ts
```

Expected: all 5 pass.

If a positive test fails (Bryssel doesn\'t resolve), the data is missing — go back to Task 2 / 3, find the gap, fix the build script. **Do not weaken the assertion to make a failing test pass.** That defeats the point.

If the negative-control test fails (Åhlborg DOES resolve to "Åhlborg" through some mechanism), some upstream source actually has it — the test should be relaxed or removed. Verify with `grep -i "åhlborg" /tmp/geonames_altnames/alternateNamesV2.txt`; if it\'s genuinely there, the user gets a free correction and the test was wrong.

- [x] **Step 3: Commit**

```bash
git add tests/unit/gazetteers.test.ts
git commit -m "test(gazetteer): cover Swedish exonym resolution"
```

---

## Task 6: Output-size check

**Files:**
- (none modified)

- [x] **Step 1: Compare bundle sizes**

```bash
ls -la src/api/place-gazetteers/data/lang-sv-*.json
git log -1 --format=%H -- src/api/place-gazetteers/data/lang-sv-geonames.json
git show HEAD~1:src/api/place-gazetteers/data/lang-sv-geonames.json | wc -c
ls -la src/api/place-gazetteers/data/lang-sv-geonames.json
```

The design spec estimated growth from "few hundred" entries to ~2000. If the file grew by more than 5× (e.g. millions of entries because the city walk pulled in too much), something\'s wrong — most likely the `population >= 100000` filter is being skipped. Inspect `parseCities()`.

If the size is reasonable, no commit needed for this task.

---

## Task 7: License audit

**Files:**
- (read-only inspection)

- [x] **Step 1: Confirm both files\' `source` blocks are correct**

```bash
node -e "
const lsg = require(\'./src/api/place-gazetteers/data/lang-sv-geonames.json\');
const lsw = require(\'./src/api/place-gazetteers/data/lang-sv-wikidata.json\');
console.log(\'lang-sv-geonames source:\', lsg.source);
console.log(\'lang-sv-wikidata source:\', lsw.source);
"
```

Expected: GeoNames file shows `license: \'CC BY 4.0\'`; Wikidata file shows `license: \'CC0 1.0\'`. Both have `fetched` set to today.

- [x] **Step 2: No commit — informational**

---

## Self-review checklist

- [x] Both build scripts run end-to-end without error.
- [x] `lang-sv-geonames.json` and `lang-sv-wikidata.json` are larger than they were on `main` (more entries) but not absurdly so.
- [x] Re-running both scripts produces only a date-line diff.
- [x] `npx vitest run tests/unit/gazetteers.test.ts` passes including the new exonym tests.
- [x] No new files in `src/api/place-gazetteers/data/`. `bundled.ts` unchanged. `BUNDLED_GAZETTEERS` count unchanged.
- [x] Source/license blocks in both JSON files are correct.
- [x] `npm run lint` passes.

## Out of scope

- Hand-curating Swedish aliases that the canonical sources don\'t contain. **Hard rule** — never add a manual entry. If a user wants "Lillköping" for Linköping, they contribute upstream to GeoNames/Wikidata.
- Adding a third source (e.g. Wikipedia interwiki labels) — increases drift risk for marginal gain.
- Other language gazetteers (`lang-de-*`, `lang-no-*`, etc.) — separate specs driven by their own user demand.
- Adding city-level nodes to `world-countries.json` so the translation map\'s "Country > Admin1 > City" keys actually match resolver nodes — separate, larger plan.
- Resolver behaviour changes (path matching, scoring, contradiction weights).
