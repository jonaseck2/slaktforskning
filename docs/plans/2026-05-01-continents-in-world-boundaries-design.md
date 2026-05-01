# Continents in `world-boundaries` — Design

**Status:** Approved (design) — implementation plan to follow
**Date:** 2026-05-01

## Goal

Add the 7 continent geometries (Africa, Antarctica, Asia, Europe, North America, Oceania/Australia, South America) to the existing `world-boundaries` gazetteer so that bare-continent inputs ("Afrika", "Europa") resolve to a meaningful boundary, and so the boundary resolver can pin a region for places where the user only knows the continent.

The point gazetteer (`world-countries`) is **not** changed — adding continent points would create a top-level node above the country list and reshuffle the existing tree. Boundaries-only is the targeted fix.

## Why

- Probe today: `resolvePlace("Afrika, Finland", gazetteers)` returns Finland (the strong country anchor wins, "Afrika" is silently dropped). With continents present in a boundary gazetteer, the boundary resolver can return Africa's polygon for "Afrika"-only inputs, and the contradiction-weight scoring in the point resolver can surface "Afrika" as a known-but-non-matched anchor instead of just discarding it.
- Continents are stable, well-defined geographic entities. They belong in the data layer next to countries, not in resolver code.

## Source

**Wikidata SPARQL** for continent QIDs + their declared geoshape (P3896). Same pattern as `build-world-historical-boundaries.ts`. License: CC0 1.0.

| Continent | QID |
|---|---|
| Africa | Q15 |
| Antarctica | Q51 |
| Asia | Q48 |
| Europe | Q46 |
| North America | Q49 |
| Oceania | Q538 |
| South America | Q18 |

(Australia-as-continent uses Q538 Oceania; the country Australia stays in `world-countries` as Q408.)

For each, fetch `?geoshape` (P3896) — the Wikimedia Maps API serves the polygon as GeoJSON. Centroid is computed via existing `computeCentroid` in `src/gazetteer-build/geo.ts` from the polygon coordinates.

**Fallback if Wikidata's geoshape is absent or low-quality for a continent:** Natural Earth Continents (public domain, version 5.x) is the second canonical source. The build script tries Wikidata first, falls back to Natural Earth only if Wikidata returns nothing — and logs which source was used so we can audit the output. We do not blend the two; one source per node.

## Architecture

### New script

`scripts/build-world-continents-boundaries.ts` — fetches the 7 QIDs, downloads each geoshape, computes centroid, writes to a temp file. Then a small "merge" step prepends the continent nodes to the existing `world-boundaries.json` so the structure becomes:

```
World (boundaries) [unchanged root]
├── Africa [new — type: continent, geometry, lat/lon centroid]
├── Antarctica [new]
├── Asia [new]
├── Europe [new]
├── North America [new]
├── Oceania [new]
├── South America [new]
└── ...all existing country nodes [unchanged]
```

(Continents are siblings of countries in this flat boundary gazetteer — countries are NOT reparented under continents. Countries already have working point coordinates and admin1 hierarchies; reparenting would force every country resolver consumer to walk through a new level. Continents simply become alternate boundary anchors.)

### Type extension

`type: 'continent'` is a new value for `GazetteerNode.type`. No code changes required — `type` is a free-form string used only for display badges. `placeTypes.continent` i18n key is added (sv: "Kontinent", en: "Continent") so the badge renders.

## Testing

- Unit (`tests/unit/gazetteers.test.ts`): assert the 7 continents are present in `world-boundaries`, each with non-empty geometry and a sensible centroid (e.g. Europe lat in 35–71, lon in -10–60).
- Integration (`gazetteer-testing` skill): probe `resolveBoundary("Afrika")` returns the Africa polygon. Probe `resolvePlace("Afrika, Finland")` no longer drops "Afrika" silently — the unmatched-with-known-name contradiction weight should now classify Finland as a worse match than the bare continent.
- Build determinism: run script twice, diff JSON output → no diff. Coordinate rounding to 6 decimals (existing `round6`).

## Out of scope

- Reparenting countries under continents (separate, much larger refactor).
- Sub-continental regions (Western Europe, Sub-Saharan Africa) — could be future work driven by user need.
- Adding continent translations to language gazetteers — handled when the lang-sv expansion happens (separate spec).

## Open questions

None.
