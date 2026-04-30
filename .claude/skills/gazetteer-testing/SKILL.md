---
name: gazetteer-testing
description: Audit place resolution against a real database to find outliers — places that resolve to the wrong country, state, or sub-region. Use when investigating bad map pins, validating new gazetteers, or debugging "why did Richmond, Kalifornien USA land in Canada?". Pairs with the `gazetteers` skill (build/extend) — this skill is for *testing* placement on real data.
---

# Gazetteer Placement Testing

## When to use

- A user reports that places are "in the wrong spot" on the map.
- After adding/modifying a gazetteer or `normalize()` aliases — verify the change against a real database.
- Auditing a region (e.g. "find every Swedish place that resolves outside Sweden").
- Investigating a single weird match (the popup now shows the gazetteer ID — see [src/renderer/views/MapView.vue](../../src/renderer/views/MapView.vue) `popup-gazetteer`).

## The diagnostic script

[scripts/check-us-places.ts](../../scripts/check-us-places.ts) is the reference template. It:

1. Opens any `.db` file readonly via `node-sqlite3-wasm`.
2. Loads enabled gazetteers from `db_settings.gazetteer_config` (so it audits exactly what the user sees).
3. Iterates a SQL filter (e.g. `name LIKE '%USA%'`) and calls `resolvePlace()` on each row.
4. Buckets results into named outlier categories with the matched path and gazetteer ID.

Run it:
```bash
npx tsx scripts/check-us-places.ts
```

## Adapting the script for a different region

Copy the file and change three things:

1. **DB path** — point at the user's database (or a fixture).
2. **SQL filter** — what subset of places to audit. Examples:
   - US: `name LIKE '%USA%' OR name LIKE '%U.S.A%' OR name LIKE '%America%'`
   - Sweden: `name LIKE '%Sverige%' OR name LIKE '%Sweden%'`
   - Specific country code: `name LIKE '%Tyskland%' OR name LIKE '%Germany%'`
   - All places with no stored coords: `latitude IS NULL AND longitude IS NULL`
3. **Outlier rules** — the heuristics for what counts as wrong. The US script flags:
   - `NOT_US` — resolved tree root isn't United States
   - `STATE_MISMATCH` — input names a state that isn't on the resolved path
   - `AMBIGUOUS` — `matchQuality === 'ambiguous'`
   - `UNRESOLVED` — `resolvePlace` returned null

Adapt by swapping the country/state alias map and the path-prefix check.

## Common outlier buckets and root causes

These came out of running the US audit on `bengt-inte-trasig.db` (444 places, 127 outliers):

| Bucket | Example | Root cause | Fix |
|--------|---------|------------|-----|
| Foreign-language state alias missing | `Berkerley, Kalifornien, USA` → United States only | "Kalifornien" / "Californien" not in `us-all-states` aliases | Add aliases in build script |
| Abbrev-with-period breaks splitter | `(City of) Ontario, Calif. USA` → unresolved | `,` is the only separator; `Calif.` followed by space attaches to next token | Strip trailing `.` in `normalize()` or treat `. ` as soft separator |
| Wrong country entirely | `Richmond, Kalifornien USA` → Canada > Richmond | Missing comma collapses two components into one unmatchable token | Same as above + alias fix |
| Same-name in another sub-region wins | `Miami, USA` → Indiana > Miami County | Cities with no state hint match a county anywhere | Add population/notability hint or prefer state-anchor matches |
| Common name picks county over city | `Houston, Texas, USA` → Texas > Houston County | Both city and county exist; greedy 1:1 picks the leaf with the same name as Texas's child | Prefer cities (PPL) over admin (ADM2) when tied |
| `world-admin1` vs `us-all-states` tie | `California, USA` → ambiguous | Both gazetteers contain "California" with the same lat/lon | If two gazetteers' top matches share lat/lon, drop ambiguity |
| Province read as US county | `Sudbury, Ontario, USA` → New York > Ontario County > Sudbury | Greedy match prefers same-tree paths; "Ontario" the province isn't on the same path as the city | Boost lastComponentMatched country match before sub-tree |

## Fixing the underlying issue

Most fixes live in one of these places:

| Symptom | File to edit |
|---------|--------------|
| Foreign-language alias for a state/country missing | The build script that emitted the JSON (e.g. `scripts/build-us-places-all.ts`) — add to `aliases` for the relevant ADM1 row, then re-run and check in `data/*.json` |
| Normalization rule (suffix, prefix, punctuation) | `src/api/place-gazetteers/resolver.ts` `normalize()` |
| Tiebreaker order across gazetteers | `src/api/place-gazetteers/resolver.ts` `isBetterCandidate()` |
| Tiebreaker order within one gazetteer | `src/api/place-gazetteers/resolver.ts` `pickBest()` |
| Splitter handling of partial commas | `src/api/place-gazetteers/resolver.ts` line ~279 (`placeName.split(',').map(...)`) |

After any fix:
1. Re-run the diagnostic script — outlier count should drop.
2. Run the relevant unit test: `npx vitest run tests/unit/gazetteers.test.ts`.
3. If the fix touches `normalize()` or scoring, add a test case to `tests/unit/resolver.test.ts` (or wherever the resolver tests live) reproducing the original wrong match.

## Workflow when a user reports a bad pin

1. **Reproduce** — open the place panel; the "Resolved via" row shows the gazetteer + match quality.
2. **Bucket** — does it match one of the common outliers above?
3. **Audit at scale** — write/adapt a script with the relevant SQL filter to see if it's a one-off or systemic.
4. **Fix at the source** — alias in build-script JSON > `normalize()` rule > tiebreaker change. Don't paper over with hardcoded special cases.
5. **Verify** — re-run the audit and the relevant unit tests; ask the user to reload the database.

## Caveats

- The script auto-bumps the resolver's WeakMap caches by re-creating the gazetteer set per run. If you're iterating quickly, expect ~1–2s startup as `getNameIndex` builds.
- `gazetteer_config` may be missing on new databases — fall back to enabling all bundled IDs (the resolver doesn't care).
- Many "ambiguous" markings are cosmetic, not bugs — `California, USA` matching both `world-admin1` and `us-all-states` to the same lat/lon is fine. Filter them out of the report unless investigating ambiguity itself.
- The map UI surfaces gazetteer ID + match quality in two places: the marker popup ([MapView.vue](../../src/renderer/views/MapView.vue) `popup-resolved` block) and the place panel ([PlacePanel.vue](../../src/renderer/components/PlacePanel.vue) `resolved-field` block). When debugging, read those before opening the script.
