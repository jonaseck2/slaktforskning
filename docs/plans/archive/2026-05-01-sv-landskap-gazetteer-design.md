# `sv-landskap` Gazetteer — Design

**Status:** Approved (design) — implementation plan to follow
**Date:** 2026-05-01

## Goal

Add a new bundled gazetteer `sv-landskap` covering the 25 Swedish historical provinces (landskap). Landskap names are pervasive in Swedish genealogy — births, marriages, and parish records frequently identify a person's origin by landskap rather than by län (county) or kommun (municipality). The current bundled set has none of them, so inputs like "Ångermanland", "Bohuslän", or "Skåne" (the *landskap*, not the *län*) silently fail to match anything geographic.

A separate gazetteer keeps landskap independent of the modern administrative tree (län/kommun/sogn/församling), which is correct: landskap and län are *different* hierarchies that overlap unevenly. Some län are also landskap names (Skåne län ⊂ Skåne landskap), some aren't.

## Why

- Probe today: `resolvePlace("Ångermanland")` → NO MATCH. `resolvePlace("Bohuslän")` → NO MATCH. The bundled `sv-*` gazetteers cover the modern administrative levels (county → municipality → parish/locality) but not the historical regional level.
- Genealogists searching for "Sundsvall, Medelpad" or "Lund, Skåne" need the resolver to recognise the landskap as a valid geographic anchor — even if the modern entry sits under a different län.

## Source

**Wikidata Q200250** (Swedish landskap). License: CC0 1.0. The class has exactly 25 instances:

> Blekinge, Bohuslän, Dalarna, Dalsland, Gotland, Gästrikland, Halland, Hälsingland, Härjedalen, Jämtland, Lappland, Medelpad, Norrbotten, Närke, Skåne, Småland, Södermanland, Uppland, Värmland, Västerbotten, Västergötland, Västmanland, Ångermanland, Öland, Östergötland.

For each, the SPARQL query fetches:
- `rdfs:label @sv` (canonical Swedish name)
- `wdt:P625` (coordinate location — used as centroid)
- `wdt:P1448` / `wdt:P1813` (additional aliases / short names, e.g. "Skåne län" historical alt forms)
- Optionally `wdt:P3896` (geoshape) for a future boundary variant — **not built in this first pass**, only the point gazetteer.

## Architecture

### New script: `scripts/build-sv-landskap.ts`

Single SPARQL query against Wikidata. Output:

```json
{
  "id": "sv-landskap",
  "name": "Svenska landskap",
  "locale": "sv",
  "description": "Sveriges 25 historiska landskap",
  "source": {
    "name": "Wikidata",
    "url": "https://www.wikidata.org/wiki/Q200250",
    "license": "CC0 1.0",
    "fetched": "<ISO date>"
  },
  "kind": "point",
  "root": {
    "name": "Sverige (landskap)",
    "type": "country",
    "lat": <centroid>,
    "lon": <centroid>,
    "children": [
      { "name": "Skåne", "type": "landskap", "lat": ..., "lon": ..., "aliases": [...] },
      ...24 more
    ]
  },
  "normalize": {
    "stripSuffixes": ["landskap"]
  }
}
```

The root is named "Sverige (landskap)" so it doesn't collide with the existing "Sverige" root in `sv-orter`/`sv-forsamlingar`/etc. The resolver de-dupes by gazetteer; both can coexist and contribute matches independently. The tree picker's existing merge-by-name logic at root level groups them visually under "Sverige" (one root in the merged tree, with both gazetteer ids attached).

### `bundled.ts` registration

Add static import + push to `BUNDLED_GAZETTEERS`. Count goes from 27 → 28.

### Resolver suffix list

`landskap` is added to the existing Swedish suffix-strip list in `resolver.ts` (alongside län, kommun, etc.) so "Skåne landskap" matches the same as "Skåne".

## Testing

- Unit (`tests/unit/gazetteers.test.ts`): assert all 25 landskap are present, each has lat/lon, and `resolvePlace("Ångermanland")` returns the new gazetteer's match.
- Resolution disambiguation:
  - `resolvePlace("Skåne län")` → still resolves to the modern Skåne län (in `sv-orter`), not the landskap. The län suffix is the disambiguator.
  - `resolvePlace("Skåne")` → ambiguous (both gazetteers match the bare name). The resolver's existing best-match scoring picks one; document the expected outcome in the test.
- Determinism: rerun → identical JSON.

## Out of scope

- Boundary geometry. A future `sv-landskap-boundaries.json` could be built from Wikidata's geoshape (P3896) — separate small spec, only if/when needed.
- Pre-1973 parish hierarchy under landskap. Modern sogn/församling are already covered by `sv-socknar` / `sv-forsamlingar` under län. The historical parish-under-landskap structure is a much larger archival project.
- Adding landskap as a parent of län. The two are different hierarchies; reparenting would break the modern hierarchy.

## Open questions

None.
