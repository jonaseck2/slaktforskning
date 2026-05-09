---
name: gazetteers
description: Build, extend, and debug gazetteers for place resolution. Use when adding new country gazetteers, modifying build scripts, debugging place matching, or questions about the gazetteer system (types, resolver, normalization, data sources).
---

# Gazetteer Skill

## ⚠️ Prime Directive: Gazetteer values are NEVER persisted

**Coordinates, place_type, matched paths, gazetteer IDs, and any other value derived from a gazetteer match are computed at render time only. They are NEVER written to the `places` table.**

The resolver is the single source of truth for inferred place data. Improving the gazetteers (better coords, more aliases, richer hierarchy) immediately improves every existing place because the data layer holds only the user-authored name and parent chain — not stale guesses from a previous resolver version.

If you find yourself writing `places.update({ latitude: ..., longitude: ... })` with a gazetteer-derived value, **stop**. The map / panel / report computes those at view time. Authored coordinates (typed by the user in `PlaceModal`, or imported verbatim from a GEDCOM `MAP > LATI/LONG` sub-tag the source file already contained) ARE allowed; gazetteer-resolved coordinates are NOT.

This is non-negotiable per `CLAUDE.md`. Past violations corrupted databases and pinned them to specific gazetteer versions. Don't reintroduce them.

## ⚠️ Prime Directive (cont.): Sources are truth; gazetteers are build outputs

The Prime Directive's shape applied a layer up: **the source datasets** (Wikidata, GeoNames, Lantmäteriet, DAWA, ok-dk/dagi, …) are canonical truth. **The build scripts** (`scripts/build-*-*.ts`, `scripts/fetch-*.ts`) are the valuable code the project owns — the transformation logic. **The gazetteer JSON files** in `src/api/place-gazetteers/data/` are derived, point-in-time snapshots; not truth, not value beyond their fetched-date utility.

**What follows:**

- **Gazetteer JSON is a build output**, not authored code. It happens to be checked into git for offline reproducible builds, but conceptually it's a `dist/` artifact — re-derivable from sources at any time.
- **Never hand-edit a gazetteer JSON.** Edits belong in the script. A diff in `data/*.json` that doesn't correspond to a script or source change is a smell — investigate before merging.
- **License lives on the source; the JSON inherits.** `source.fetched: 'YYYY-MM-DD'` is the snapshot's frozen-time marker. The license belongs to the source dataset.
- **Build scripts must be deterministic and re-runnable.** Anyone with the sources should reproduce the JSON. Non-determinism is a script bug.
- **Stale JSONs are not "preserved history" — they're stale outputs.** Re-deriving on migrations is hygiene, not destruction.

If something feels wrong about touching a gazetteer JSON, the question is "what does the *script* need to do differently?" — not "how do I edit this JSON to be correct?" The JSON's job is to be re-derivable.

## ⚠️ Prime Directive (cont.): Contract over fixture

The system is held together by a **contract**, not by fixtures.

The contract:
1. Closed type vocabulary: `world | continent | country | admin1 | admin2 | admin3 | admin4 | locality | parish | farm | church | city | landskap | historical-state | other`. This is fixed.
2. Every gazetteer emits a tree rooted at `World` (or `World (Historical)`). Nodes are typed per the closed vocabulary.
3. Structural merge: same `(name, type, parent_path)` from any number of gazetteers → one merged node. Aliases union; lat/lon first-wins; geometry first-wins; children recursive merge.

If the world's admin divisions change tomorrow, the contract still works — every gazetteer re-fetches its source, emits updated trees, and the merge produces a correct result. There is no central fixture to keep current. There are no privileged "scaffolding" gazetteers — `world-countries.json` and `world-admin1.json` are regular contributors providing broad coverage at the country / admin1 levels, no different from `sv-orter.json` providing coverage at admin2+leaf levels.

A new country contribution is one new gazetteer following the contract. A migration is a script rewrite emitting trees that fit the contract. The loader is mechanical merge, never a per-country mapping table.

## ⚠️ Prime Directive (cont.): Cleanly sourced, clearly processed, cleanly joined

The pipeline has three serial stages, each with a clean responsibility:

1. **Cleanly sourced data** — each source dataset (Wikidata, GeoNames, Lantmäteriet, DAWA, ok-dk/dagi, …) carries one license. We don't combine them.
2. **Clearly processed scripts** — each build script (`scripts/build-*-*.ts`, `scripts/fetch-*.ts`) reads ONE source and produces ONE gazetteer JSON. The script knows its country: "Swedish län is `admin1`", "Swedish kommun is `admin2`", "US county is `admin2`", "Canadian census division is `admin2`". The script is the locus of correctness — it labels every node with the right closed-vocab `type` and emits canonical names with locale variants as `aliases`.
3. **Cleanly joined gazetteers** — the load-time engine is mechanical: walk every gazetteer, merge by `(name, type, parent_path)`, union aliases, first-wins coords. No flibbergasting in the app.

### What "clean" means at each stage

**Source stage.** One dataset, one license. We never edit downloaded source files.

**Script stage.** Output canonical name as `name` (GeoNames-canonical when GeoNames is the source — `Jönköping`, not `Jönköpings län`). Put alt forms in `aliases` (`['Jönköpings län']`). Use the closed-vocab `type` to disambiguate by level — there's no ambiguity between "Jönköping" the admin1 and "Jönköping" the admin2 because they have different `type` values. Build scripts emit nodes at every level they cover (country, admin1, admin2, leaves) — they don't depend on a separate "scaffolding" file to provide structure.

**Loader stage.** Two nodes with the same `(name, type, parent_path)` from any number of sources merge into one:
- `aliases`: union, dedup.
- `lat`/`lon`: first-wins (warn on >0.01° divergence — that's a script bug to fix upstream).
- `geometry`: first-wins (boundary scripts run first if priority is needed).
- `children`: recursively merge by the same rule.
- `__contributors: string[]`: array of contributing gazetteer IDs (replaces the singular `__gazetteer`). The picker shows this as provenance.

If two leaves shouldn't merge (a civil parish vs a church parish that share a name+location but represent legally distinct entities), the build scripts MUST give them different `type` or different `parent_path`. The loader doesn't second-guess the script.

### License & provenance under structural merge

Structural names (country/admin1/admin2/admin3/admin4) are **administrative facts** — the kommun is named "Eksjö" because the Swedish state says so, not because GeoNames or Wikidata owns the name. Merging same-`(name, type, parent)` structural nodes across sources isn't a frankenstein — it's stating the same fact. CC BY 4.0 attribution still applies for the source we credit.

For leaves, the same rule holds: if two scripts independently determined that "Eksjö" is a `locality` at coords (57.66, 14.97), they're agreeing on a fact. The merge unions aliases (different translations), keeps first-wins coords. Where they disagree on coords, that's a script bug.

The original "no merge across sources" framing was wrong. The right framing is: **scripts produce clean enough data that the merge is mechanical agreement, never frankenstein synthesis.**

### Concrete rules — apply at every code-touch

- **The build script is responsible for clean output.** If something feels wrong about a gazetteer JSON, fix the script — never patch in the loader.
- **The loader is mechanical.** No tie-breakers beyond first-wins. No type-detection-at-load-time. No backward-compat shims. No legacy normalization.
- **`type` is the disambiguation mechanism within a level.** "Jönköping" the admin1 and "Jönköping" the admin2 don't collide because they differ on `type`. Use this; don't append admin suffixes to the name itself.
- **Aliases carry locale variants.** Build scripts source these from the source's locale data (GeoNames `alternateNames.txt`, Wikidata `Plabel@<lang>`).
- **License-redundant gazetteers are dropped at build time** (curatorial). The audit doesn't disappear — it's still valuable when two scripts cover the same primitives. But the merge engine isn't load-bearing in license terms anymore.

## Overview

The gazetteer system resolves place strings (e.g. "Roskilde, Danmark") to coordinates by matching against hierarchical place trees. 30 bundled gazetteers (18 point + 8 boundary + 3 language + 1 admin-only `sv-sockenstad-boundaries`) cover Sweden, Denmark, Norway, Finland, Iceland, Germany (Bundesländer + Kreise + Wikidata parishes), US (9 immigration states + full 50-state), all Canadian provinces/territories, ~244 countries globally, and ~1,393 historical states/empires. Language gazetteers provide multilingual place name translations (e.g. "Danmark" → "Denmark", "Brasilien" → "Brazil").

## Architecture

```
Build scripts (scripts/)     →  JSON data files (src/api/place-gazetteers/data/)
                                       ↓
bundled.ts                   →  BUNDLED_GAZETTEERS array + getAllGazetteers()
                                       ↓ (main process only — never import from renderer)
merge.ts                     →  loadGazetteers(config, bundled, imported?) → Gazetteer[]
                                       ↓
Resolver (resolver.ts)       →  resolvePlace(query, gazetteers) → PlaceResolveResult
```

**IPC split:** `bundled.ts` statically imports ~40 MB of JSON and must never be reachable from a renderer import chain (would OOM Vite). The renderer fetches bundled gazetteers via `window.api.gazetteers.getBundled()` (IPC channel `gazetteers:getBundled`). Main process and MCP code import `getAllGazetteers` from `./place-gazetteers/bundled` directly. `index.ts` is now a renderer-safe barrel re-exporting only `merge`, `resolver`, and `types`.

### Key Files

| File | Purpose |
|------|---------|
| `src/api/place-gazetteers/types.ts` | `Gazetteer`, `GazetteerNode`, `PlaceResolveResult`, `BoundaryResolveResult` |
| `src/api/place-gazetteers/resolver.ts` | `resolvePlace()`, `resolveBoundary()`, `searchGazetteer()`, `normalize()` |
| `src/api/place-gazetteers/bundled.ts` | `getAllGazetteers()`, 25 static JSON imports, `BUNDLED_GAZETTEERS` array, `enrichHistoricalAliases()` — **main/MCP only** |
| `src/api/place-gazetteers/merge.ts` | `loadGazetteers(config, bundled, imported?)`, `mergeTranslations()`, `findNodeByPath()` — renderer-safe, no JSON imports |
| `src/api/place-gazetteers/index.ts` | Renderer-safe barrel re-exporting `loadGazetteers` (merge), `resolvePlace`/`resolveBoundary`/`searchGazetteer` (resolver), and all types |
| `src/api/gazetteers.ts` | Import/export/storage in SQLite, JSON schema validation |
| `src/gazetteer-build/` | Shared build utilities: `geo.ts` (round6, computeCentroid, avgCoordinates, weightedCentroid), `geonames.ts` (TSV parsing, dedup), `wikidata.ts` (parseWktPoint, generateAliases), `sparql.ts` (sparqlFetch, sleep), `tree.ts` (countNodes, walkTree), `io.ts` (writeGazetteer, DATA_DIR) |
| `tests/unit/gazetteers.test.ts` | Unit tests for loading and resolution |
| `tests/unit/gazetteer-build.test.ts` | Unit tests for shared build utilities |
| `tests/unit/gazetteers-crud.test.ts` | Unit tests for import/export/delete/list |

### GazetteerNode Type

```typescript
interface GazetteerNode {
  name: string;
  type: string;           // 'country', 'county', 'municipality', 'parish', 'locality', etc.
  aliases?: string[];     // Alternative names, ISO codes, historical names
  lat: number;
  lon: number;
  children?: GazetteerNode[];
  geometry?: GeoJSONPolygon | GeoJSONMultiPolygon;  // boundary gazetteers only
}
```

### Resolver Normalization

`normalize()` in `resolver.ts` strips administrative suffixes before matching:
- Swedish: församling, socken, kommun, stad, härad, län, distrikt, pastorat
- Danish: sogn, kirkedistrikt, kommune, amt, herred
- Norwegian: fylke, prestegjeld, sokn
- Finnish: kunta, kaupunki, maakunta, seurakunta
- Icelandic: sýsla, hreppur, sveitarfélag, sókn
- English: county, parish, township, borough, province, state
- Prefixes: "county of", "province of", "state of"

When adding a new country, add its admin suffixes here too.

### Resolver Hierarchy Awareness

The resolver uses **depth-weighted contradiction scoring** when comparing candidates across gazetteers. If an unmatched input component matches a known place name in another gazetteer, that's a contradiction — and its weight depends on the depth of the contradicting match:

- **Shallow matches** (countries, admin1 — depth 1–2) produce strong contradictions
- **Deep matches** (localities, leaves — depth 4+) produce weak contradictions

This ensures "Dirleton, East Lothian, Skottland" matches Scotland (via language alias) rather than the Canadian locality named Dirleton. Plain "Dirleton" without hierarchy still matches the leaf as before.

The global name-depth map is cached across `resolvePlace` calls for the same gazetteer set.

## Bundled Gazetteers (30)

### Point Gazetteers (18)

| ID | Name | Source | Nodes | Size |
|----|------|--------|-------|------|
| `sv-socknar` | Swedish Civil Parishes | Wikidata | ~2,836 | 744 KB |
| `sv-forsamlingar` | Swedish Church Parishes | Wikidata | ~3,408 | 886 KB |
| `sv-orter` | Swedish Populated Places | GeoNames | ~27,429 | 4.4 MB |
| `sv-gardar` | Swedish Farms | GeoNames | ~15,204 | 2.4 MB |
| `sv-kyrkor` | Swedish Churches | GeoNames | ~3,631 | 623 KB |
| `dk-sogne` | Danish Parishes | Wikidata | ~2,706 | 712 KB |
| `dk-sogne-dawa` | Danish Parishes (DAWA) | DAWA API | ~2,097 | 367 KB |
| `no-kommuner` | Norwegian Municipalities | GeoNames | ~13,395 | 2.2 MB |
| `fi-kunnat` | Finnish Municipalities | GeoNames | ~26,887 | 4.4 MB |
| `is-sveitarfelog` | Icelandic Municipalities | GeoNames | ~115 | 32 KB |
| `de-gemeinden` | German Bundesländer / Kreise / Cities | GeoNames | ~3,000 | ~3 MB |
| `de-kirchgemeinden` | German Parishes (Lutheran + Catholic) | Wikidata | ~899 fetched, 61 with admin1 chain | ~18 KB |
| `us-immigration-states` | US Immigration States | GeoNames | ~20,936 | 3.6 MB |
| `us-all-states` | US All States | GeoNames | ~21,568 | 4.1 MB |
| `ca-provinces` | Canadian Provinces/Territories | GeoNames | ~11,854 | 2.1 MB |
| `world-countries` | World Countries | GeoNames | ~244 | 45 KB |
| `world-admin1` | World States & Provinces | GeoNames | ~2,754 | 452 KB |
| `world-historical` | World Historical States | Wikidata | ~1,393 | 350 KB |

### Boundary Gazetteers (8)

| ID | Name | Source | Nodes | Size |
|----|------|--------|-------|------|
| `sv-sockenstad-boundaries` | Swedish Parish Boundaries | Lantmäteriet | ~2,474 | 3.5 MB |
| `fi-kunnat-boundaries` | Finnish Municipalities — Boundaries | Statistics Finland WFS | 308 | 167 KB |
| `world-boundaries` | World Countries — Boundaries | Natural Earth 110m | 177 | 213 KB |
| `us-counties-boundaries` | US Counties — Boundaries | Census Bureau 20m | 3,222 | 1.4 MB |
| `dk-sogne-boundaries` | Danish Parishes — Boundaries | ok-dk/dagi | 2,148 | 1.5 MB |
| `is-sveitarfelog-boundaries` | Icelandic Municipalities — Boundaries | LMI WFS | 64 | 3.7 MB |
| `no-kommuner-boundaries` | Norwegian Municipalities — Boundaries | Kartverket | 357 | 474 KB |
| `ca-divisions-boundaries` | Canadian Census Divisions — Boundaries | Statistics Canada | 293 | 637 KB |

### Language Gazetteers (3)

Language gazetteers (`kind: "language"`) contain no coordinates — they inject translated place names as aliases into point/boundary gazetteers at load time via `mergeTranslations()` in `index.ts`.

| ID | Name | Source | Translations | License |
|----|------|--------|-------------|---------|
| `lang-sv-geonames` | Swedish (GeoNames) | GeoNames alternateNames | 133 countries + 1,014 admin1 | CC BY 4.0 |
| `lang-sv-wikidata` | Swedish (Wikidata) | Wikidata SPARQL | 304 Nordic divisions | CC0 1.0 |
| `lang-world-historical` | World Historical States — All Languages | Wikidata SPARQL | ~1,391 historical entities × all languages (~70K names) | CC0 1.0 |

**Format:** `translations` field maps target gazetteer ID → path key → translated names array:
```json
{
  "kind": "language",
  "translations": {
    "world-countries": { "Denmark": ["Danmark"], "Germany": ["Tyskland"] },
    "world-admin1": { "United Kingdom > Scotland": ["Skottland"] }
  }
}
```

**Merge rules:** `loadGazetteers(config, bundled, imported?)` separates language gazetteers from the combined array, injects translations as aliases into deep-cloned data gazetteers (to protect bundled singletons), then returns only the data gazetteers. Imported gazetteers override bundled ones when IDs collide.

**Calling `loadGazetteers`:** Main process and MCP code pass `getAllGazetteers()` as the second arg. Renderer code receives bundled via `window.api.gazetteers.getBundled()` (IPC) and passes it as the second arg. Never import `getAllGazetteers` from the renderer — it pulls in ~40 MB of JSON.

**Adding a new language:** Create a build script per data source (e.g. `build-lang-da-geonames.ts`), register the output in `BUNDLED_GAZETTEERS` in `bundled.ts`, update tests and docs. Keep sources separate for license clarity.

## Build Scripts

Each country/source has its own build script in `scripts/`:

| Script | Source | Pattern | Output |
|--------|--------|---------|--------|
| `build-sv-parishes.ts` | Wikidata SPARQL | Query by class ID, parse WKT coords | sv-socknar, sv-forsamlingar |
| `build-sv-boundaries.ts` | Lantmäteriet GeoPackage | ogr2ogr conversion | sv-sockenstad-boundaries |
| `fetch-sv-orter.ts` | GeoNames SE.zip | Parse TSV, filter by featureClass | sv-orter, sv-gardar, sv-kyrkor |
| `build-dk-parishes.ts` | Wikidata SPARQL | Same as Swedish, Danish classes | dk-sogne |
| `build-dk-parishes-dawa.ts` | DAWA REST API | Fetch JSON, reverse geocode for hierarchy | dk-sogne-dawa |
| `build-no-municipalities.ts` | GeoNames NO.zip | Parse TSV, Norwegian admin names | no-kommuner |
| `build-fi-municipalities.ts` | GeoNames FI.zip | Parse TSV, bilingual Finnish+Swedish | fi-kunnat |
| `build-is-municipalities.ts` | GeoNames IS.zip | Parse TSV, Icelandic admin names | is-sveitarfelog |
| `build-us-places.ts` | GeoNames US.zip | Parse TSV, filter 9 states | us-immigration-states |
| `build-us-places-all.ts` | GeoNames US.zip | Parse TSV, all 50 states + DC, pop >= 500 | us-all-states |
| `build-ca-places.ts` | GeoNames CA.zip | Parse TSV, all 13 provinces/territories | ca-provinces |
| `build-world.ts` | GeoNames countryInfo + cities15000 + admin1 | Parse 3 files, population-weighted centroids | world-countries, world-admin1 |
| `build-world-historical.ts` | Wikidata SPARQL (Q3024240, Q28171280, Q6256, Q7270, Q7275) | Two queries merged by QID dedup | world-historical |
| `build-world-historical-boundaries.ts` | Wikidata P3896 + Wikimedia Maps API | No output — Wikidata has no polygon data for historical empires | — |
| `build-fi-boundaries.ts` | Statistics Finland WFS | Fetch GeoJSON, round coords | fi-kunnat-boundaries |
| `build-world-boundaries.ts` | Natural Earth 110m | ogr2ogr SHP→GeoJSON | world-boundaries |
| `build-us-boundaries.ts` | Census Bureau 20m | ogr2ogr SHP→GeoJSON | us-counties-boundaries |
| `build-dk-boundaries.ts` | ok-dk/dagi GitHub | Fetch GeoJSON, round coords | dk-sogne-boundaries |
| `build-is-boundaries.ts` | LMI WFS | Fetch GeoJSON, round coords | is-sveitarfelog-boundaries |
| `build-no-boundaries.ts` | Kartverket/Geonorge | ogr2ogr reproject+simplify | no-kommuner-boundaries |
| `build-ca-boundaries.ts` | Statistics Canada | ogr2ogr reproject+simplify | ca-divisions-boundaries |
| `build-lang-sv-geonames.ts` | GeoNames alternateNamesV2 | Filter isolanguage=sv, match to world gazetteers | lang-sv-geonames |
| `build-lang-sv-wikidata.ts` | Wikidata SPARQL | Swedish labels for Nordic admin divisions | lang-sv-wikidata |
| `build-lang-world-historical.ts` | Wikidata SPARQL | Phase 1: QID fetch; Phase 2: batched label lookups (80 QIDs/batch) | lang-world-historical |

## Local source-data cache: `export-import/`

Already-downloaded source files for Swedish gazetteers live in the project's `export-import/` directory (gitignored). Scripts that read from there:
- `build-sv-boundaries.ts` ← `export-import/sockenstad.gpkg` (Lantmäteriet, parishes + cities)
- `distrikt.gpkg` is staged in `export-import/` but no script consumes it yet (Sweden's post-2016 distrikt boundaries — future feature).

Other countries' large source files (DAWA dumps, Lantmäteriet datasets, etc.) accumulate here too. Before fetching anything, check `export-import/` for an existing local copy and its age — if it's recent enough for the migration's hygiene point, reuse rather than re-download.

## Re-source the data when migrating or extending a gazetteer

A migration commit pairs a format change with a fresh fetch from the original source. The regenerated JSON ships with an updated `source.fetched: 'YYYY-MM-DD'` reflecting the migration date. Migrating without re-sourcing carries stale admin codes / parish names forward — defeats the point of the migration as a hygiene checkpoint.

Practical split: long-running fetches (Wikidata SPARQL, DAWA reverse-geo, Lantmäteriet/Kartverket/Statistics Canada GeoPackage exports, Statistics Finland WFS) run on the operator's machine before dispatching subagents — subagent sandboxes can't reliably handle multi-minute rate-limited fetches. GeoNames country .zip files are small and inline-able.

The migration commit body lists the source name + license + fetch date for every regenerated gazetteer.

## License & redundancy audit (mandatory pre-step before adding or modifying any gazetteer)

Before adding a new country gazetteer or making changes that touch the bundled set, audit for license and redundancy. The engine never auto-merges (see Prime Directive above) — consolidation is always a curatorial decision recorded in the commit message.

**Audit procedure:**

1. **List every gazetteer touching the same country/region.** Note source name, license, and what primitive each emits (parishes, kommunes, polygons, etc.).
2. **For each pair, ask: distinct value, or redundant?**
   - Distinct value examples: civil parish (legal admin) vs church parish (different legal entity); points vs polygons (different geometry); historical vs modern; different feature classes (PPL vs FRM).
   - Redundancy examples: two Wikidata-sourced gazetteers querying the same SPARQL parish list with different filters; a "boundaries" gazetteer that re-emits the same point data as another gazetteer.
3. **For each redundant pair, decide:**
   - Drop one entirely from `BUNDLED_GAZETTEERS` (and delete its JSON).
   - OR extend one to absorb the other's distinct content under a single source license.
4. **Record the decision in the commit message** — sources, licenses, rationale per pair, what was kept and what was dropped.

**Never** auto-resolve overlap by adding merge logic to `merge.ts`. The engine is attach-only; it cannot legally combine sources.

## Adding a New Country Gazetteer

### From GeoNames (most common)

1. **Create build script** -- use `scripts/build-no-municipalities.ts` as a structural template, but **import shared utils from `src/gazetteer-build/`** instead of inlining:
   ```typescript
   import { round6, avgCoordinates } from '../src/gazetteer-build/geo';
   import { dedup } from '../src/gazetteer-build/geonames';
   import type { GazetteerNode } from '../src/api/place-gazetteers/types';
   ```
   ```bash
   # Download country data
   curl -o /tmp/XX.zip https://download.geonames.org/export/dump/XX.zip
   unzip -o /tmp/XX.zip -d /tmp/geonames_xx/
   npx tsx scripts/build-xx-places.ts
   ```

2. **Key adaptations:**
   - Set root name, coordinates, aliases (including English name)
   - Set locale code
   - Choose hierarchy: Country > ADM1 (type varies) > ADM2 (type varies) > PPL (type: "locality")
   - Prefer local-language admin names from GeoNames altNames over English
   - Set appropriate node types for each level
   - Use `avgCoordinates()` for parent node coordinates, `dedup()` for name deduplication

3. **Register in loader** -- add import + entry in `src/api/place-gazetteers/index.ts`:
   ```typescript
   import xxPlaces from './data/xx-places.json';
   // Add to BUNDLED_GAZETTEERS array
   ```

4. **Extend resolver** -- add admin suffixes for the new language to `normalize()` in `resolver.ts`

5. **Add tests** -- update `tests/unit/gazetteers.test.ts`:
   - Add ID to `expectedIds` array
   - Update total count assertion
   - Add specific count/resolution test if warranted

6. **Update docs** -- CLAUDE.md gazetteer table, this skill file

### From Wikidata SPARQL

Use `scripts/build-dk-parishes.ts` as structural template, importing shared utils:
```typescript
import { avgCoordinates } from '../src/gazetteer-build/geo';
import { parseWktPoint, generateAliases } from '../src/gazetteer-build/wikidata';
import { sparqlFetch } from '../src/gazetteer-build/sparql';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
```

Requires:
- Wikidata class ID for the entity type (e.g. Q814648 for Danish parishes)
- Sufficient entries with P625 (coordinates) and P131 (admin hierarchy)
- Check Wikidata coverage first -- some countries have very few entries

### From a REST API

Use `scripts/build-dk-parishes-dawa.ts` as template. Each API is different -- adapt the fetch and parsing logic.

## GeoNames Reference

**TSV columns:** 0=id, 1=name, 2=asciiName, 3=altNames(comma-sep), 4=lat, 5=lon, 6=featureClass, 7=featureCode, 8=countryCode, 9=cc2, 10=admin1, 11=admin2, 12=admin3, 13=admin4, 14=population

**Feature classes:** A=admin, P=populated place, S=structure, T=terrain, H=hydro, L=area, R=road, U=undersea, V=vegetation

**Key feature codes:** PCLI=country, ADM1=state/province, ADM2=county, ADM3=commune, PPL=populated place, FRM=farm, CH=church

**Download:** `https://download.geonames.org/export/dump/{CC}.zip` (CC = ISO alpha-2)

**License:** CC BY 4.0 (attribution required)

## Testing

```bash
npm test -- --grep "gazetteers"    # Run gazetteer tests only
npm test                            # Full suite (includes gazetteers)
```

## Common Issues

- **GeoNames admin codes** are FIPS codes, not postal abbreviations. Map state/province names from ADM1 rows, don't hardcode.
- **Wikidata rate limiting** -- max 1 concurrent query, add 2s delay between queries.
- **Bilingual countries** (Finland, Canada) -- prefer primary language, add secondary as aliases.
- **Historical admin divisions** -- Wikidata P131 chains may include historical counties. This is correct for genealogy.
- **Coordinate precision** -- round to 6 decimal places (~0.1m accuracy).
