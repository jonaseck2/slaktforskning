# Global Gazetteer Hierarchy — Design Spec

> Companion to a future implementation plan. This document defines **what** changes and **why**; the implementation plan defines **how** task-by-task.

## User goal

Place pickers, place panels, place maps, and resolver output behave as if there is **one** global place hierarchy. A genealogist drilling from "World" reaches "Sweden", from there "Jönköpings län", from there "Eksjö kommun" — once, with every relevant leaf (parishes, churches, farms, localities, polygons) listed underneath, each leaf carrying its source attribution intact. Adding a new country gazetteer (Egypt, Brazil, Poland, …) is a contributor task with a single contract: "root your data into the canonical World tree." The picker no longer presents a forest of `Sverige × 6`, `Danmark × 3`, `Sverige (landskap) × 1`, `World × 4`.

**Critical clarification:** "Eksjö kommun appears once" because the *kommun* is project-curated scaffolding (one canonical node, one canonical name). Leaves under it are **never merged across sources** — different gazetteers' contributions stay as distinct siblings, each with its own source license. See "License & source provenance" below.

## Contract over fixture

The system's stability comes from a **contract**, not from fixtures.

The contract:
1. **Closed type vocabulary**: `world | continent | country | admin1 | admin2 | admin3 | admin4 | locality | parish | farm | church | city | landskap | historical-state | other`. This is fixed; it's the only thing the loader knows about.
2. **Every gazetteer emits a tree** rooted at `World` (or `World (Historical)` for historical-era data). Nodes are typed per the closed vocabulary.
3. **Structural-merge rule**: same `(name, type, parent_path)` from any number of source gazetteers merges into one node. Aliases union; lat/lon first-wins; geometry first-wins; children recursive merge.

A fixture (e.g. "world-admin1.json shipped as scaffolding everyone must use") is fragile: when admin1 boundaries change globally tomorrow, the fixture is wrong until rebuilt. The contract is durable: when admin1 changes, every gazetteer that re-fetches its source produces updated trees, the merge does its work, and the system is correct again. No central artifact to keep current.

Same logic for new countries: a contributor adding Egypt or Brazil writes one new gazetteer that emits `World > Africa > Egypt > …` or `World > South America > Brazil > …`. They don't update a fixture, don't add an entry to a per-country override table, don't synthesize admin codes. They just emit data that fits the contract.

This principle holds regardless of which gazetteers happen to be in `BUNDLED_GAZETTEERS` today. `world-countries.json` and `world-admin1.json` are useful broad-coverage gazetteers, but they're not load-bearing — they're regular contributors that follow the same contract as everyone else.

## Cleanly sourced, clearly processed, cleanly joined

The pipeline is three serial stages with one clean responsibility each:

1. **Cleanly sourced data.** Each source dataset (Wikidata, GeoNames, Lantmäteriet, DAWA, ok-dk/dagi, …) carries one license. We don't combine sources at the data level.
2. **Clearly processed scripts.** Each build script reads ONE source and produces ONE gazetteer JSON. The script knows its country: "Swedish län is admin1", "Swedish kommun is admin2", "US county is admin2", "Canadian census division is admin2". The script labels every node with the right closed-vocab `type` and emits canonical names with locale variants as `aliases`.
3. **Cleanly joined gazetteers.** The load-time engine is mechanical: walk every gazetteer, merge by `(name, type, parent_path)`, union aliases, first-wins coords. No app-layer flibbergasting.

### Why structural merge is not frankenstein

Structural names (`country | admin1 | admin2 | admin3 | admin4`) are administrative **facts** — the kommun is named "Eksjö" because the Swedish state says so, not because GeoNames or Wikidata owns the name. Two scripts independently providing the same `(name, type, parent_path)` are stating the same fact. Merging is agreement, not synthesis.

The same logic applies to leaves: if two GeoNames-derived scripts both say "Eksjö is a locality at (57.66, 14.97)", that's agreement, not data fabrication. We union aliases, keep first-seen coords, and warn if coords diverge >0.01° (script bug to fix upstream).

The earlier framing of "no cross-source merging, period" was overcautious. The right rule is: **scripts produce clean enough data that the merge is mechanical agreement.** The frankenstein anti-pattern is a *load-time tie-breaker* picking "best coord" or unioning differing data; that we still don't do. We accept first-wins agreement, warn on divergence.

### Disambiguation mechanism

Names that look ambiguous (e.g. "Jönköping" both as a län and as a kommun) are disambiguated by `type` — they're at different levels of the closed vocabulary, so they never collide. The build script labels each correctly:

- `{name: 'Jönköping', type: 'admin1', aliases: ['Jönköpings län']}` ← the län
- `{name: 'Jönköping', type: 'admin2', aliases: ['Jönköpings kommun'], parent_path: ['World','Europe','Sweden','Jönköping']}` ← the kommun (under the län)
- `{name: 'Jönköping', type: 'admin3', aliases: ['Jönköping stad'], parent_path: [...]}` ← the city (under the kommun)

If two leaves SHOULDN'T merge — e.g. a civil parish and a church parish with the same name+location representing legally distinct entities — the build scripts MUST give them different `type` (e.g. `parish-civil` vs `parish-church`) or different `parent_path`. The loader doesn't second-guess the script.

### License attribution

Each gazetteer JSON carries its `source.name`, `source.license`, `source.fetched`. When the loader merges nodes from N sources, the resulting merged node's runtime metadata includes `__contributors: string[]` listing every gazetteer ID that contributed to it. The picker can show this as provenance ("from GeoNames + Lantmäteriet"). The legal attribution is satisfied at the gazetteer-file level (each file credits its source); the merge doesn't strip or muddy this.

### The "no app-side mapping" rule

If you find yourself wanting to add a per-country mapping table in the loader (suffix-strip rules, locale-form translation, name canonicalization), STOP — that's a script-stage responsibility. The loader is mechanical. Push the work back to the build script that produced the wrong-shaped data.

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

### 2. No fixtures, no privileged gazetteers

Every gazetteer is just a tree starting at `World`. There's no "scaffolding" layer, no "fixture" layer, no privileged always-on bundle. The structural-merge rule (§4) means whatever each script contributes flows into the same merged tree.

What exists today:

- `world-countries.json` — a regular gazetteer that contributes `World > 7 continents > 244 countries` from GeoNames `countryInfo.txt` (CC BY 4.0). Useful for global country coverage even when no per-country gazetteer is enabled.
- `world-admin1.json` — a regular gazetteer that contributes `World > continent > country > admin1` from GeoNames `admin1CodesASCII.txt` (CC BY 4.0). Useful for global admin1 coverage.
- `world-historical.json` — a regular gazetteer rooted at `World (Historical)` (separate from modern `World`) — historical empires can span modern country boundaries.
- Per-country gazetteers (sv-orter, no-kommuner, …) — each emits a self-rooted tree from `World > continent > country > …` covering whatever levels its source provides.

**None of these have privilege.** Users can disable any of them in the gazetteer-config UI. If a user disables `world-countries.json`, only countries that have an enabled per-country gazetteer appear in the picker. That's a feature — users can curate their own working set.

If no gazetteer covers a country, it doesn't appear. When someone adds a gazetteer for Japan, Japan appears. The picker is exactly as complete as the enabled gazetteer set.

### Why this is sufficient

The structural-merge rule does the work that "scaffolding" was previously doing:
- Multiple scripts agreeing on `Sweden > Jönköping > Eksjö` (admin1+admin2) collapse into one node.
- Locale variants flow in via `aliases`, unioned across scripts.
- Country / admin1 coverage from `world-countries` + `world-admin1` is just one more contributing gazetteer's data.

A separate "scaffolding" or "fixture" layer would force a bootstrap with mapping tables (per-country suffix-strip rules, locale-form translation, etc.) — exactly the "lots of mapping" smell the structural-merge approach eliminates.

### 3. Build-script output shape — every script emits a self-rooted tree from `World`

Every gazetteer JSON emits a self-rooted tree starting at `World`, with the script's data filling in only the levels it covers. Sweden's `sv-orter` emits:

```json
{
  "id": "sv-orter",
  "shape": "tree",
  "root": {
    "name": "World", "type": "world", "lat": 0, "lon": 0,
    "children": [
      { "name": "Europe", "type": "continent", "lat": 54, "lon": 15, "children": [
        { "name": "Sweden", "type": "country", "lat": 62, "lon": 15, "aliases": ["Sverige"], "children": [
          { "name": "Jönköping", "type": "admin1", "lat": 57.7, "lon": 14.2, "aliases": ["Jönköpings län"], "children": [
            { "name": "Eksjö", "type": "admin2", "lat": 57.7, "lon": 14.97, "aliases": ["Eksjö kommun"], "children": [
              { "name": "Eksjö", "type": "locality", "lat": 57.66643, "lon": 14.97205 },
              { "name": "Mariannelund", "type": "locality", "lat": 57.61667, "lon": 15.56667 }
            ]}
          ]}
        ]}
      ]}
    ]
  }
}
```

The script's responsibilities:

- **Stem from `World`.** Every output starts at `World > continent > country > …`. Mechanical, no per-country logic for the upper levels.
- **Type-tag every node** with the closed-vocab `type` (`world | continent | country | admin1 | admin2 | admin3 | admin4 | locality | parish | farm | church | city | landskap | historical-state | other`).
- **Emit canonical name + aliases.** Use GeoNames-canonical when GeoNames is the source. Locale variants go in `aliases`. Within a `type`, the name is unambiguous because of the type label — "Jönköping" the admin1 doesn't collide with "Jönköping" the admin2.
- **Cover only what the source covers.** sv-kyrkor (churches) emits `World > Europe > Sweden > … > <kommun> > <church>` — its admin1+admin2 layer is sourced from the same GeoNames data its leaves come from. It doesn't need to know about ALL Swedish admin1s — only the ones its churches happen to live in.

The `Gazetteer` interface (already shipped via Phase 0.2):

```typescript
interface Gazetteer {
  id: string;
  name: string;
  locale: string;
  description?: string;
  source?: GazetteerSource;
  shape?: 'scaffolding' | 'contributions' | 'language';  // legacy discriminator — being deprecated
  root?: GazetteerNode;        // every gazetteer has a root
  contributions?: Contribution[];   // unused going forward — keep field for legacy until Phase 8
  kind?: 'point' | 'boundary' | 'language';
  translations?: Record<string, Record<string, string[]>>;
  normalize?: GazetteerNormalizeRules;
}
```

The `shape: 'contributions'` discriminator and the `Contribution` interface (added in Phase 0.2) are deprecated by this revision but stay in the type until Phase 8 cleanup. Going forward every gazetteer uses `shape: 'tree'` (or omits `shape` entirely — same meaning).

Language gazetteers (`shape: 'language'`) are unchanged — they overlay aliases on existing nodes in the merged tree.

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

### 9a. Re-source the data on every migration

Each per-country migration is a re-source as well as a format change. The build-script rewrite + fresh fetch from the original source + updated `source.fetched: <YYYY-MM-DD>` ship as one commit. Migrating without re-fetching would carry stale admin codes / parish names forward into the new shape.

Operational note: long-running fetches (Wikidata SPARQL, DAWA reverse-geocoding, Lantmäteriet/Kartverket/Statistics Canada GeoPackage exports, Statistics Finland WFS) run on the operator's machine, not in subagent sandboxes. Subagents handle the format migration against locally-fetched inputs. GeoNames country .zip files are small enough to re-fetch inline.

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
