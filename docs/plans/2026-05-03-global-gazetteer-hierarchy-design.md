# Global Gazetteer Hierarchy — Design Spec

> Companion to a future implementation plan. This document defines **what** changes and **why**; the implementation plan defines **how** task-by-task.

## User goal

Place pickers, place panels, place maps, and resolver output behave as if there is **one** global place hierarchy. A genealogist drilling from "World" reaches "Sweden", from there "Jönköpings län", from there "Eksjö kommun" — once, with every relevant leaf (parishes, churches, farms, localities, polygons) listed underneath, each leaf carrying its source attribution intact. Adding a new country gazetteer (Egypt, Brazil, Poland, …) is a contributor task with a single contract: "root your data into the canonical World tree." The picker no longer presents a forest of `Sverige × 6`, `Danmark × 3`, `Sverige (landskap) × 1`, `World × 4`.

**Critical clarification:** "Eksjö kommun appears once" because the *kommun* is project-curated scaffolding (one canonical node, one canonical name). Leaves under it are **never merged across sources** — different gazetteers' contributions stay as distinct siblings, each with its own source license. See "License & source provenance" below.

## License & source provenance — non-negotiable

**Every leaf's data stays attributable to a single source. No cross-source merging of leaves, ever.**

Each gazetteer ships its own license (Wikidata CC0, GeoNames CC BY 4.0, Lantmäteriet CC0, DAWA CC BY 4.0, ok-dk/dagi CC0, …). Merging a leaf's coords from one source with aliases from another produces a record with no clean license — a frankenstein the project cannot legally redistribute, and a data-fidelity failure (the user can't tell what was authored where, or by whom).

**Two layers, two licensing models:**

1. **Scaffolding nodes** (`world | continent | country | admin1 | admin2`) are project-curated structural data — admin division names + parent chains, plus a centroid coord. Bootstrapped once from GeoNames with the `CC BY 4.0` attribution recorded on the scaffolding gazetteer's `source` field; treated thereafter as the project's canonical reference set. These deduplicate by canonical name+path. Scaffolding is the *only* layer where canonical-name deduplication happens.

2. **Leaf nodes** (`locality | parish | farm | church | city | landskap | historical-state | …`) belong to **exactly one gazetteer** and inherit that gazetteer's license, source, and `fetched` date. They never merge with leaves from other gazetteers, even when names match. Two parishes both named "Eksjö parish" from different source gazetteers stay as **two distinct siblings** under the canonical kommun, each badged with its source.

**Concrete rules:**

- The merge engine attaches contributions as **distinct siblings**. It does not union by `(name, type)`. It does not pick a "best coord" across sources. **There is no tie-breaker.**
- Each leaf carries a `__gazetteer: string` runtime field naming its single source. The picker reads this for source attribution; the resolver returns it in `PlaceResolveResult.gazetteer`.
- Scaffolding nodes carry GeoNames-derived centroid coords (CC BY 4.0). Leaves carry their own source's coords. Scaffolding never inherits leaf coords; leaves never overwrite scaffolding coords.
- License-redundant gazetteers are **dropped at build time, by curatorial decision**, not merged at load time. If gazetteer A and B genuinely cover the same primitives with no distinct value, the redundancy audit (per-country, in the implementation plan) consolidates them — one is removed, attribution-aware. The merge engine never silently combines them.

**What this means for the picker:**

- "Eksjö kommun" is a single canonical scaffolding node — it appears **once** because it's project scaffolding, not because we merged 5 contributions.
- Under it, children from sv-socknar, sv-forsamlingar, sv-orter, sv-gardar, sv-kyrkor, sv-sockenstad-boundaries all listed as siblings. If two contributions both add a `parish` named "Eksjö", both appear, each with its own source badge.
- If the redundancy audit determines two gazetteers genuinely duplicate without distinct value → one is removed in its build script before the migration ever ships. The user sees one entry because we curated; not because the engine guessed.

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
2. **Picker search "eksjö".** "Eksjö kommun" appears exactly **once** in the result list (it's a single scaffolding node — there is nothing to merge). Clicking it shows leaves from each contributing gazetteer as distinct siblings, each with its own source badge (one badge per leaf, naming the single source).
3. **Picker search "Eksjö".** Eksjö as a `city` (boundary), as a `parish` (potentially from multiple sources, kept as distinct siblings), and as a `locality` are listed. Each row carries its source badge. None appear with breadcrumb "Sverige" alone — every one has its full canonical chain (`World > Europe > Sweden > Jönköpings län > Eksjö kommun > Eksjö`).
4. **Resolver smoke test.** `resolvePlace("Eksjö, Sverige")` returns each matching leaf with its single source attribution; `matchedPath` for each traverses the canonical scaffolding chain `World > Europe > Sweden > Jönköpings län > Eksjö kommun > <leaf>`. Currently it returns N candidates rooted at N different `Sverige` nodes.
5. **CI test — scaffolding integrity.** A new test in `tests/unit/gazetteer-hierarchy.test.ts` walks every bundled gazetteer's contributions and asserts every `parentPath` resolves to an existing scaffolding node. Adding a hypothetical `eg-governorates.json` whose parent path is `["World", "Africa", "Egypta"]` (typo) breaks the build.
6. **CI test — single canonical Sverige/Sweden.** Asserts the loaded merged tree contains exactly one node at `World > Europe > Sweden`, regardless of how many source gazetteers contributed children to it.

## Failure modes / RCA reference

This plan addresses three concrete bugs visible to the user as of 2026-05-03:

- **`Sverige (landskap)` forks the tree.** `sv-landskap.json` roots at `"Sverige (landskap)"` rather than `"Sverige"` because the build script avoided a name collision with the län-based `sv-socknar.json` rather than modeling landskap as a sibling axis. Build-time scaffolding contract makes this kind of hack impossible — there is **one** Sweden node, and landskap nodes attach as `type: "landskap"` siblings to län.
- **5× Eksjö kommun.** 5 gazetteers each carry their own `Eksjö kommun` parent because each emits a self-rooted tree, and the picker's dedup key includes `gazetteer`. The fix is **not** to merge them at load time — that would create a frankenstein license. The fix is to make `Eksjö kommun` a **scaffolding node** the project owns (project-curated, GeoNames-sourced under CC BY 4.0), and have each leaf-emitting gazetteer attach its leaves under that one canonical kommun. The kommun appears once because we curated one, not because the engine merged five.
- **Forest of 13 tops.** Each gazetteer's root is a top-level entry; there is no global root. Build-time contract forces every non-scaffolding gazetteer to declare a parent path that resolves into the canonical scaffolding (`world-continents` + `world-countries` + `world-admin1` + `world-admin2`).

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

Four gazetteers become **canonical scaffolding** that every other gazetteer's parent paths must resolve into:

- `world-continents` (new — extracted from `build-world-continents-boundaries.ts`) — type `continent`, children of `World`.
- `world-countries` — type `country`, children of continents.
- `world-admin1` — type `admin1` (state/province/län/governorate), children of countries.
- `world-admin2` (new) — type `admin2` (county/kommun/kommune/kunta), children of admin1.

Scaffolding extends to **admin2** because that's where the user-visible canonicalization needs to land — without admin2 in scaffolding, every leaf-emitting gazetteer would have to declare `Eksjö kommun` itself, recreating the duplication the plan is meant to eliminate.

Scaffolding is bootstrapped from GeoNames `countryInfo.txt` + `admin1Codes.txt` + `admin2Codes.txt` (CC BY 4.0; attribution recorded on each scaffolding gazetteer's `source` field). Centroid coords for admin1 + admin2 are computed from the populated places GeoNames lists in each division. Once bootstrapped, scaffolding is the project's canonical reference set; updates require an explicit re-fetch + curation pass.

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

### 4. Load-time attach (no merge across sources)

`loadGazetteers(config, bundled, imported?)` in `src/api/place-gazetteers/merge.ts` is rewritten — there is no legacy fallback (per implementation plan, the old self-rooted path is replaced, not coexisting):

1. **Phase A — load scaffolding.** Build the canonical tree from `world-continents` → `world-countries` → `world-admin1` → `world-admin2`. Index every node by lowercased path for O(1) parent resolution.
2. **Phase B — attach contributions.** For each contribution-shape gazetteer, walk its contributions; look up `parentPath` in the scaffolding index; **append** the contribution's nodes as children of the resolved parent. Each appended node is stamped with `__gazetteer: <id>` (single source). **Same-name contributions stay as distinct siblings** — no union, no merging by `(name, type)`. The only deduplication that ever happens is at the scaffolding layer, which is project-curated by definition.
3. **Phase C — translations.** Inject language-gazetteer aliases onto scaffolding nodes only (translations are admin-division names like "Sweden" → "Sverige" — these are per-language naming of canonical scaffolding, not new leaf data). Translations never touch leaf nodes.
4. **Phase D — return** a `MergedTree` with the scaffolding roots. Each root carries the full attached contribution forest underneath, with every leaf stamped by its single source.

The renderer + resolver consume `MergedTree`. The `Gazetteer[]` API stays available for the gazetteer-config UI (lists individual gazetteers as toggles).

**What the engine does NOT do:**
- It does not merge two contributions that add the same `(name, type)` under the same parent. They become two siblings. The picker may show both with source badges, or the redundancy audit (§10a) decides at build time whether to consolidate the source gazetteers.
- It does not compute "best coords" across sources. There is no `__priority`, no boundary-vs-point tiebreaker. A leaf has the coords its source authored.
- It does not union aliases across sources. Each leaf's aliases are exactly what its source contributed.

### 5. Load order

```
world-continents          (scaffolding)
  ↓
world-countries           (scaffolding — children of continents)
  ↓
world-admin1              (scaffolding — children of countries)
  ↓
world-admin2              (scaffolding — children of admin1)
  ↓
all other data gazetteers (contributions — paths must resolve into the above)
  ↓
language gazetteers       (translations — path keys resolve into scaffolding)
```

`getAllGazetteers()` in `bundled.ts` returns the array in this order. Imported user gazetteers run **after** all bundled gazetteers, so they can attach to anything bundled. Imported gazetteers attach as additional siblings (same no-merge rule as bundled) — they never overwrite bundled contributions.

### 6. CI validation — scaffolding integrity

`tests/unit/gazetteer-hierarchy.test.ts` (new):

- **Test 1 — every parent path resolves.** Walk every bundled contribution; assert `parentPath` resolves into the scaffolding tree. Failure message names the offending `(gazetteer, parentPath)` so the contributor knows what to fix.
- **Test 2 — exactly one canonical country.** For each ISO-2 country code, assert the merged tree contains exactly one `country` node. Sweden gets one Sweden, regardless of how many gazetteers add children under it.
- **Test 3 — landskap is a sibling axis.** Assert `Sweden > Skåne (landskap)` is a sibling of `Sweden > Skåne län`, not a fork.
- **Test 4 — closed-vocabulary types.** Walk every node in the merged tree, assert `node.type` is in the `GazetteerNodeType` enum.
- **Test 5 — sv-orter Eksjö smoke.** Resolve `Eksjö, Sverige`; assert exactly one match; assert `matchedPath` ends at `Eksjö` and traverses through `Eksjö kommun > Jönköpings län > Sweden > Europe > World`.

### 7. (removed — see "License & source provenance")

There is no coordinate tie-breaker. Each leaf has the coords authored by its single source. Two same-named contributions under the same scaffolding parent become two siblings, each with its own coords. This is by design — see "License & source provenance" above. If two gazetteers genuinely emit redundant data without distinct value, the per-country redundancy audit (§10a) consolidates them at build time by *removing* one source, not by merging.

Boundary polygons attach to the **leaf the boundary gazetteer itself contributes** (e.g. `sv-sockenstad-boundaries` contributes parish polygons; the polygon hangs on its own contributed `parish` leaf, not on a sibling parish from a different gazetteer). If two source gazetteers want to be deduped — e.g. boundary gazetteer A's polygon attached to point gazetteer B's parish — that's a curatorial decision: drop one, or extend the boundary gazetteer to also emit point data with both source attributions stamped on each leaf.

### 8. Boundary gazetteers contribute polygons as their own leaves

`sv-sockenstad-boundaries` today declares a flat tree: `Sverige > 2,341 parishes + 132 cities` (no län/kommun). New shape:

- The build script extracts `(län, kommun, parishname)` from Lantmäteriet metadata for each parish polygon and emits a contribution `{ parentPath: ['World', 'Europe', 'Sweden', län, kommun], nodes: [{ name, type: 'parish', geometry }] }`.
- That parish leaf is `sv-sockenstad-boundaries`'s own contribution — it carries its own source license and `__gazetteer: 'sv-sockenstad-boundaries'`. It is **not** merged with `sv-socknar`'s parish of the same name — both stay as distinct siblings under the kommun.
- City polygons (stadsrättigheter) emit as `{ type: 'city' }` leaves, again as the boundary gazetteer's own contribution.
- Polygons with no kommun match (extinct parish, boundary change) are **rejected** at build time with a warning. No flat-rooted shortcut.

If the redundancy audit (§10a) finds that `sv-socknar`'s parishes and `sv-sockenstad-boundaries`'s parishes carry the same information for genealogy purposes, that's a curatorial call: keep both (point data + polygon data are distinct value), or extend one to emit polygons too and retire the other. The engine never auto-merges them.

### 9. Renderer + resolver consequences

Most consuming code simplifies:

- **`PlacePicker.vue`** — `runSearch` walks one merged tree. Each result row carries the leaf's single `__gazetteer` source for the badge. Two same-named contributions under the same parent are two distinct rows, each with its own badge — never one row labelled "N sources."
- **`resolver.ts`** — `resolveHierarchical` runs against one tree. The cross-gazetteer contradiction-scoring logic still applies for genuinely ambiguous matches (e.g. "Dirleton" in Scotland vs. Canada — different scaffolding parents). It does not arbitrate between two contributions to the same scaffolding parent — those resolve to multiple distinct results, and the picker / caller chooses.
- **`searchGazetteer`** — returns `{ node, path, gazetteer }` where `gazetteer` is the single source ID. No `contributors: string[]` plural — that framing was wrong.
- **`window.api.gazetteers.getBundled()`** — unchanged for the gazetteer-config UI. Disabling a contribution-shape gazetteer at runtime omits its contributions on the next load. **Scaffolding gazetteers (`world-continents`, `world-countries`, `world-admin1`, `world-admin2`) cannot be disabled and are hidden from the toggles UI** — disabling them would orphan every contribution.
- **`MapView` / `PlacePanel` map pin lookup** — uses `resolveBoundary` against the merged tree. A leaf with a polygon shows its polygon; a sibling leaf without a polygon shows a point. Two siblings with polygons (e.g. parish polygon from one source, kommun boundary from another) render as two layers — they were separate leaves to begin with.

### 10. Migration order (informs the implementation plan)

Reverse-dependency order (scaffolding first, leaves last). The legacy `loadGazetteers` is **replaced**, not run alongside — there is no flag, no parallel code path. Each step ships a CI-green commit; if anything regresses, revert that commit.

1. **Add types + interfaces** (Contribution, GazetteerNodeType, MergedTree). No build scripts touched yet.
2. **Replace `loadGazetteers`** with the new attach-only engine. Old self-rooted gazetteers still in the data folder fail loudly — they migrate in step 4+.
3. **Build scaffolding** — `world-continents`, `world-countries`, `world-admin1`, `world-admin2`. Bootstrap from GeoNames; record CC BY 4.0 attribution.
4. **For each country, before migrating its build scripts:**

   **§10a — License & redundancy audit (mandatory pre-step per country).** List every gazetteer for the country. For each pair, ask: "do they emit distinct value, or do they overlap?" Distinct value examples: civil parishes vs church parishes (legal identities differ post-2000 reform); polygons vs points (different geometry types); historical vs modern. Overlap examples: two Wikidata-sourced gazetteers both listing the same kommunes from the same SPARQL query; a "boundaries" gazetteer that re-emits points from another gazetteer's data. Decision per overlapping pair: **drop one source gazetteer entirely from `BUNDLED_GAZETTEERS`**, or extend one to absorb the other's distinct content under a single source license. The engine never silently merges — every consolidation is a curatorial decision recorded in the migration commit message.

5. **Migrate Sweden end-to-end.** All surviving SE gazetteers post-audit migrate together. User-verification gate before moving on.
6. **Migrate Denmark, Norway, Finland, Iceland.** Each does its own §10a audit + migration + user gate.
7. **Migrate US, Canada, Germany.** Same pattern.
8. **Migrate `world-boundaries`, `world-historical`.** Historical roots under sibling `World (Historical)`.
9. **Migrate language gazetteers** to canonical scaffolding path keys. Translations only ever apply to scaffolding nodes (admin division naming) — never to leaves.

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
