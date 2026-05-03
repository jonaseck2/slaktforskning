# Global Gazetteer Hierarchy — Design Spec

> Companion to a future implementation plan. This document defines **what** changes and **why**; the implementation plan defines **how** task-by-task.

## User goal

Place pickers, place panels, place maps, and resolver output behave as if there is **one** global place hierarchy. A genealogist drilling from "World" reaches "Sweden", from there "Jönköpings län", from there "Eksjö kommun" — once, with the union of every relevant child (parishes, churches, farms, localities, polygons) hanging under it. Adding a new country gazetteer (Egypt, Brazil, Poland, …) is a contributor task with a single contract: "root your data into the canonical World tree." The picker no longer presents a forest of `Sverige × 6`, `Danmark × 3`, `Sverige (landskap) × 1`, `World × 4`. Eksjö kommun appears once; Eksjö city appears once; Eksjö parish appears once.

## Scope — gazetteer build scripts

Every script in `scripts/` that emits a file in `src/api/place-gazetteers/data/` migrates to the new contract. **Default assumption: all of them.** Anything else is a deviation listed below.

Data gazetteers (24):

- `build-ca-boundaries.ts` → `ca-divisions-boundaries.json`
- `build-ca-places.ts` → `ca-provinces.json`
- `build-de-municipalities.ts` → `de-gemeinden.json`
- `build-dk-boundaries.ts` → `dk-sogne-boundaries.json`
- `build-dk-parishes.ts` → `dk-sogne.json`
- `build-dk-parishes-dawa.ts` → `dk-sogne-dawa.json`
- `build-fi-boundaries.ts` → `fi-kunnat-boundaries.json`
- `build-fi-municipalities.ts` → `fi-kunnat.json`
- `build-is-boundaries.ts` → `is-sveitarfelog-boundaries.json`
- `build-is-municipalities.ts` → `is-sveitarfelog.json`
- `build-no-boundaries.ts` → `no-kommuner-boundaries.json`
- `build-no-municipalities.ts` → `no-kommuner.json`
- `build-sv-boundaries.ts` → `sv-sockenstad-boundaries.json`
- `build-sv-landskap.ts` → `sv-landskap.json`
- `build-sv-parishes.ts` → `sv-socknar.json`, `sv-forsamlingar.json`
- `fetch-sv-orter.ts` → `sv-orter.json`, `sv-gardar.json`, `sv-kyrkor.json`
- `build-us-boundaries.ts` → `us-counties-boundaries.json`
- `build-us-places.ts` → `us-immigration-states.json`
- `build-us-places-all.ts` → `us-all-states.json`
- `build-world.ts` → `world-countries.json`, `world-admin1.json`
- `build-world-boundaries.ts` → `world-boundaries.json`
- `build-world-continents-boundaries.ts` → (continents only — promoted to scaffolding, see below)
- `build-world-historical.ts` → `world-historical.json`
- `build-world-historical-boundaries.ts` → (no output today)

Language gazetteers (3):

- `build-lang-sv-geonames.ts`, `build-lang-sv-wikidata.ts`, `build-lang-world-historical.ts` — these are translations, not place data; they continue to emit `kind: "language"` and inject aliases at load time. Migration impact: their `translations` map keys (currently `<gazetteerId> > <pathString>`) must move to canonical-tree path keys.

### Scope deviations

- **`world-historical.json`** — historical empires and states (Roman Empire, Swedish-Pomeranian Empire, Holy Roman Empire, …) often span what are today multiple modern countries. They cannot cleanly root under a single modern `country` node. **Deviation:** historical entities root under a sibling top-level scaffolding node `World (Historical)` rather than under modern `World`. The resolver treats both as siblings under a virtual super-root for cross-search. This matches Pleiades' graph-style approach for historical places without breaking the modern hierarchy.
- **No other deviations.** If a modern gazetteer feels like it doesn't fit, the canonical type vocabulary is wrong — extend it rather than excluding the gazetteer.

## Verification — user-observable

The plan is verified by the genealogist using the running app. Tests below are necessary but not sufficient; they observe structure, not user goal.

1. **Picker top-level.** Open `PlacePicker` (any place input). Without typing, the dropdown's hierarchy view shows **one root** ("World") whose children are **continents**, then countries, then admin1, then admin2, then leaves. No `Sverige × 6`, no `Sverige (landskap)` fork, no `World (Historical)` mixed in with the modern tree (it lives as a sibling top-level entry, intentionally).
2. **Picker search "eksjö".** "Eksjö kommun" appears exactly **once** in the result list, with the badge `5 sources` (or equivalent) signalling that 5 gazetteers contribute leaves under it. Clicking it shows children unioned across all 5.
3. **Picker search "Eksjö".** Eksjö as a `city` (boundary), as a `parish` (multiple variants), and as a `locality` are distinct rows, each appearing once. None of them appear with breadcrumb "Sverige" alone — every one has its full canonical chain (`World > Europe > Sweden > Jönköpings län > Eksjö kommun > Eksjö`).
4. **Resolver smoke test.** `resolvePlace("Eksjö, Sverige")` returns one canonical match with `matchedPath = ["World", "Europe", "Sweden", "Eksjö"]` (or the canonical depth of the leaf type). Currently it returns N candidates, one per source gazetteer.
5. **CI test — scaffolding integrity.** A new test in `tests/unit/gazetteer-hierarchy.test.ts` walks every bundled gazetteer's contributions and asserts every `parentPath` resolves to an existing scaffolding node. Adding a hypothetical `eg-governorates.json` whose parent path is `["World", "Africa", "Egypta"]` (typo) breaks the build.
6. **CI test — single canonical Sverige/Sweden.** Asserts the loaded merged tree contains exactly one node at `World > Europe > Sweden`, regardless of how many source gazetteers contributed children to it.

## Failure modes / RCA reference

This plan addresses three concrete bugs visible to the user as of 2026-05-03:

- **`Sverige (landskap)` forks the tree.** `sv-landskap.json` roots at `"Sverige (landskap)"` rather than `"Sverige"` because the build script avoided a name collision with the län-based `sv-socknar.json` rather than modeling landskap as a sibling axis. Build-time scaffolding contract makes this kind of hack impossible — there is **one** Sweden node, and landskap nodes attach as `type: "landskap"` siblings to län.
- **5× Eksjö kommun.** 5 gazetteers (`sv-socknar`, `sv-forsamlingar`, `sv-orter`, `sv-gardar`, `sv-kyrkor`) each carry their own `Eksjö kommun` parent because each emits a self-rooted tree. The picker's dedup key includes `gazetteer`, so identical scaffolding survives. Build-time contributions (parent paths, not full trees) make scaffolding shared by construction.
- **Forest of 13 tops.** Each gazetteer's root is a top-level entry; there is no global root. Build-time contract forces every gazetteer to declare a parent path that resolves into the canonical scaffolding (`world-countries` + `world-admin1` + new `world-continents`).

Prior brainstorming considered render-time merging in the picker (compute one virtual tree from N source trees on every open). Rejected because: (a) every consumer (picker, panel breadcrumb, resolver, MCP `resolve_place`, map clustering, gazetteer-config UI) would need to call into the merger; (b) the merger has to invent canonicalization rules that the build scripts could just enforce up front; (c) the project's bias is "clean data over runtime inference" (CLAUDE.md Prime Directive's rationale, applied to curator-authored data).

---

## Design — the contract

### 1. Canonical type vocabulary (closed list)

Replace ad-hoc strings with a fixed enum exported from `src/api/place-gazetteers/types.ts`:

```typescript
export type GazetteerNodeType =
  // Scaffolding
  | 'world'         // singleton root
  | 'continent'     // World > Europe, World > Africa, ...
  | 'country'       // Europe > Sweden, Africa > Egypt
  | 'admin1'        // Sweden > Jönköpings län (state, province, governorate, län)
  | 'admin2'        // Jönköpings län > Eksjö kommun (county, municipality)
  | 'admin3'        // sub-municipality, district
  | 'admin4'        // smaller still (rare)
  // Leaves
  | 'locality'      // populated place (city, town, village)
  | 'parish'        // civil OR church parish
  | 'farm'          // farm/hamlet
  | 'church'        // building
  | 'city'          // historical city status (Sweden's stadsrättigheter)
  | 'landskap'      // Swedish landskap (sibling axis to admin1 — historical/cultural)
  | 'historical-state'   // historical empires/kingdoms (lives under World (Historical))
  | 'other';
```

The current free-form `type: string` field becomes `type: GazetteerNodeType`. Build scripts that today emit `"municipality"`, `"sogn"`, `"kommune"`, etc. translate to the closed-vocabulary equivalent at emit time — original-language type stays in `aliases` if useful for display ("Eksjö kommun" already handles the user-facing label).

### 2. Scaffolding gazetteers — load-order privileged

Three gazetteers become **canonical scaffolding** that every other gazetteer's parent paths must resolve into:

- `world-continents` (new — extracted from `build-world-continents-boundaries.ts`, currently boundary-only) — type `continent`, children of `World`.
- `world-countries` — type `country`, children of continents.
- `world-admin1` — type `admin1`, children of countries.

Scaffolding gazetteers are **always enabled** and **load first** (see §5 load order). Disabling them in the gazetteer-config UI is not allowed — the UI hides them.

`world-historical` becomes scaffolding for the historical sibling tree (rooted at `World (Historical)`). Same rules apply for any contributing historical-context gazetteer.

### 3. Build-script output shape — contributions, not self-rooted trees

Today every gazetteer JSON looks like:

```json
{
  "id": "sv-orter",
  "root": { "name": "Sverige", "type": "country", "children": [...] }
}
```

New shape: a **contributions list**. Each contribution declares the canonical parent path (using canonical names from scaffolding) and the subtree to attach as children:

```json
{
  "id": "sv-orter",
  "contributions": [
    {
      "parentPath": ["World", "Europe", "Sweden", "Jönköpings län", "Eksjö kommun"],
      "nodes": [
        { "name": "Eksjö", "type": "locality", "lat": 57.66643, "lon": 14.97205 },
        { "name": "Mariannelund", "type": "locality", "lat": 57.61667, "lon": 15.56667 }
      ]
    },
    { "parentPath": ["World", "Europe", "Sweden", "Stockholms län", "Stockholms kommun"], "nodes": [...] }
  ]
}
```

A contribution's `nodes` may itself contain children (e.g. `Eksjö parish > Eksjö kyrka`). Only the **top of the contribution** declares its canonical parent path — descendants are flat children of that contribution.

Scaffolding gazetteers (`world-continents`, `world-countries`, `world-admin1`) are exempt from the contributions shape — they emit the tree they are scaffolding (`World > Europe > Sweden`, etc.). The CI test in §6 enforces "scaffolding may declare its own tree; everyone else uses contributions."

The `Gazetteer` interface gains a discriminator:

```typescript
interface Gazetteer {
  // ... existing fields ...
  shape: 'scaffolding' | 'contributions' | 'language';   // new
  root?: GazetteerNode;            // present when shape === 'scaffolding'
  contributions?: Contribution[];  // present when shape === 'contributions'
  translations?: ...;              // unchanged
}

interface Contribution {
  parentPath: string[];   // canonical names from scaffolding
  nodes: GazetteerNode[];
}
```

### 4. Load-time merge

`loadGazetteers(config, bundled, imported?)` in `src/api/place-gazetteers/merge.ts` gains a merge phase before the existing translations injection:

1. **Phase A — load scaffolding.** Build the canonical tree from `world-continents` → `world-countries` → `world-admin1`. Index every node by `joinPath(...names).toLowerCase()` for O(1) parent resolution.
2. **Phase B — attach contributions.** For each contribution-shape gazetteer, walk its contributions; look up `parentPath` in the index; **append** the contribution's nodes as children of the resolved parent. Track which gazetteer contributed each node (for the picker's "5 sources" badge — store `__contributors: string[]` as a non-serialized runtime field on merged nodes).
3. **Phase C — merge duplicate nodes within a parent.** If two contributions add a child with the same `(name, type)` under the same parent, merge: union `aliases`, keep the highest-quality coords (boundary polygon centroid > Wikidata > GeoNames — see §7), recursively merge `children`. Track contributors.
4. **Phase D — translations.** Unchanged from today, but path keys in `translations` use canonical paths.
5. **Phase E — return** a single `MergedTree` instead of an array of `Gazetteer`.

The renderer + resolver consume `MergedTree` (one root + one historical sibling). The `Gazetteer[]` API stays available for legacy code paths and the gazetteer-config UI; everything that walks the tree switches to `MergedTree`.

### 5. Load order

```
world-continents          (scaffolding)
  ↓
world-countries           (scaffolding — declares parent paths into continents)
  ↓
world-admin1              (scaffolding — declares parent paths into countries)
  ↓
all other data gazetteers (contributions — paths must resolve into the above)
  ↓
language gazetteers       (translations — path keys must resolve into the merged tree)
```

`getAllGazetteers()` in `bundled.ts` returns the array in this order. Imported user gazetteers run **after** all bundled gazetteers, so they can attach to anything bundled (and override colliding contributions on a last-write-wins basis — same rule as today).

### 6. CI validation — scaffolding integrity

`tests/unit/gazetteer-hierarchy.test.ts` (new):

- **Test 1 — every parent path resolves.** Walk every bundled contribution; assert `parentPath` resolves into the scaffolding tree. Failure message names the offending `(gazetteer, parentPath)` so the contributor knows what to fix.
- **Test 2 — exactly one canonical country.** For each ISO-2 country code, assert the merged tree contains exactly one `country` node. Sweden gets one Sweden, regardless of how many gazetteers add children under it.
- **Test 3 — landskap is a sibling axis.** Assert `Sweden > Skåne (landskap)` is a sibling of `Sweden > Skåne län`, not a fork.
- **Test 4 — closed-vocabulary types.** Walk every node in the merged tree, assert `node.type` is in the `GazetteerNodeType` enum.
- **Test 5 — sv-orter Eksjö smoke.** Resolve `Eksjö, Sverige`; assert exactly one match; assert `matchedPath` ends at `Eksjö` and traverses through `Eksjö kommun > Jönköpings län > Sweden > Europe > World`.

### 7. Coordinate tie-breaker (multi-source same node)

Phase C of merge needs a rule when two gazetteers contribute the same `(name, type)` under the same parent with different coords. Order:

1. **Boundary polygon centroid** — if any contributor has `geometry`, use its centroid (most accurate, derived from the actual polygon).
2. **Wikidata** — if any contributor sourced from Wikidata (per the gazetteer's `source.name`).
3. **GeoNames** — fallback.
4. **First contributor in load order** — final tiebreaker.

Geometry attaches to the merged node from whichever contributor has it. If two contributors have polygons (rare), keep the boundary gazetteer's polygon and discard the other (boundary gazetteers are curated for polygons; non-boundary geometries are incidental).

### 8. Boundary gazetteers contribute geometry, not a parallel tree

`sv-sockenstad-boundaries` today declares a flat tree: `Sverige > 2,341 parishes + 132 cities` (no län/kommun). New shape:

- For each parish polygon, find the canonical `parish` node in the merged tree (via `parentPath` resolution requiring matching county+municipality, which the build script extracts from Lantmäteriet metadata). Attach `geometry` to that existing node.
- For "cities" (Eksjö stad), they're historical city status. Either match to the modern `Eksjö kommun > Eksjö (locality)` node or attach as a sibling `city` type under the kommun. The build script picks whichever the source dataset's metadata supports.

If a parish polygon has no matching modern node (extinct parish, boundary change), the contribution is **rejected** with a build-time warning rather than introducing a flat-rooted shortcut. The user-visible result: every polygon attaches to a node a genealogist already navigates to.

### 9. Renderer + resolver consequences

Most consuming code simplifies:

- **`PlacePicker.vue`** — drops the `gazetteer` field from the dedup key. `runSearch` walks one tree. The `gazetteer-badge` becomes a `n sources` chip (or hidden if `n === 1`).
- **`resolver.ts`** — `resolveHierarchical` runs against one tree instead of N. The cross-gazetteer contradiction-scoring logic stays (it's still valuable for ambiguous matches like "Dirleton") but operates inside the merged tree.
- **`searchGazetteer`** — same. Still returns `{ node, path, gazetteer }` but `gazetteer` becomes `contributors: string[]` so the picker can show provenance.
- **`window.api.gazetteers.getBundled()`** — unchanged for the gazetteer-config UI (lists individual gazetteers as toggles). Disabling a contribution-shape gazetteer at runtime stops including its contributions in the next merge; scaffolding remains always-on.
- **`MapView` / `PlacePanel` map pin lookup** — uses `resolveBoundary` against the merged tree. Polygon attached to canonical node = one polygon per place, not three.

### 10. Migration order (informs the implementation plan)

Reverse-dependency order (scaffolding first, leaves last). Each step ships a green CI:

1. **Add types + interfaces** (Contribution, GazetteerNodeType, MergedTree). No build scripts touched yet — old gazetteers still loadable.
2. **Implement merge.ts Phase B+C.** With a feature flag (env var) so old shape still loads. Tests cover both code paths.
3. **Migrate scaffolding** — `build-world.ts` (already produces the scaffolding tree, mostly compatible — needs continent layer added if not present), `build-world-continents-boundaries.ts` extracted/promoted to point scaffolding too.
4. **Migrate one country end-to-end** (Sweden — biggest blast radius, surfaces all the issues). All 7 SE gazetteers (`sv-socknar`, `sv-forsamlingar`, `sv-orter`, `sv-gardar`, `sv-kyrkor`, `sv-landskap`, `sv-sockenstad-boundaries`) migrate together.
5. **Verify with the user** — the user navigates the picker, the panel, the map, the resolver, MCP `resolve_place`. Sign off on Sweden before moving on.
6. **Migrate Denmark, Norway, Finland, Iceland.** Each ships its own CI-green commit.
7. **Migrate US (3 gazetteers), Canada (2 gazetteers), Germany (1 gazetteer).**
8. **Migrate `world-admin1`, `world-boundaries`, `world-historical`.** Historical roots under sibling `World (Historical)` per §2 deviation.
9. **Migrate language gazetteers.** Translation path keys move to canonical paths.
10. **Drop the feature flag.** Remove the old self-rooted-tree code path.

### 11. Open question — imported user gazetteers

Today users can import third-party gazetteers via `gazetteers:importFile`. Their JSON shape is the old self-rooted-tree. Migration:

- Keep accepting the old shape for imports (forward-compat). At load time, the import path tries to resolve the imported root against the canonical scaffolding (`Sverige` → `World > Europe > Sweden`) and rewrites it to a contributions form. If it can't resolve, the import fails with a clear error pointing the user at the contract docs.
- Alternative: emit a new shape and require imports to follow it; reject old shape with a migration message. **Decision deferred to implementation plan** — depends on how many third-party gazetteers exist in the wild today (likely zero — feature is months old).

---

## Out of scope (deliberately)

- No changes to the `places` table schema. Authored places continue to store user-typed name + parent_place_id chains. Resolver output is render-only per Prime Directive.
- No changes to the static SPA bundle's gazetteer behavior. The static SPA fetches `getBundled()` over IPC equivalent and consumes the `MergedTree` once it lands.
- No new gazetteers added in this plan. Contributors who want Egypt or Brazil follow the new contract once it exists.
- Gazetteer config UI gains a "scaffolding (always on)" section but no other UX changes.

---

## Open follow-up after sign-off

This is a design spec. The implementation plan (`docs/plans/2026-05-03-global-gazetteer-hierarchy.md`) breaks this into TDD tasks: types, merge phases, CI tests, then build-script migrations one country at a time with user verification gates. Each migration commits independently so a regression is easy to bisect.
