---
name: gazetteers
description: Build, extend, and debug gazetteers for place resolution. Use when adding new country gazetteers, modifying build scripts, debugging place matching, or questions about the gazetteer system (types, resolver, normalization, data sources).
---

# Gazetteer Skill

## Overview

The gazetteer system resolves place strings (e.g. "Roskilde, Danmark") to coordinates by matching against hierarchical place trees. 23 bundled gazetteers (15 point + 8 boundary) cover Sweden, Denmark, Norway, Finland, Iceland, US (9 immigration states + full 50-state), all Canadian provinces/territories, and ~244 countries globally.

## Architecture

```
Build scripts (scripts/)     →  JSON data files (src/api/place-gazetteers/data/)
                                       ↓
Loader (index.ts)            →  BUNDLED_GAZETTEERS array
                                       ↓
Resolver (resolver.ts)       →  resolvePlace(query, gazetteers) → PlaceResolveResult
```

### Key Files

| File | Purpose |
|------|---------|
| `src/api/place-gazetteers/types.ts` | `Gazetteer`, `GazetteerNode`, `PlaceResolveResult`, `BoundaryResolveResult` |
| `src/api/place-gazetteers/resolver.ts` | `resolvePlace()`, `resolveBoundary()`, `searchGazetteer()`, `normalize()` |
| `src/api/place-gazetteers/index.ts` | `getAllGazetteers()`, `loadGazetteers()`, bundled imports, historical alias enrichment |
| `src/api/gazetteers.ts` | Import/export/storage in SQLite, JSON schema validation |
| `tests/unit/gazetteers.test.ts` | Unit tests for loading and resolution |

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

## Bundled Gazetteers (23)

### Point Gazetteers (15)

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
| `us-immigration-states` | US Immigration States | GeoNames | ~20,936 | 3.6 MB |
| `us-all-states` | US All States | GeoNames | ~21,568 | 4.1 MB |
| `ca-provinces` | Canadian Provinces/Territories | GeoNames | ~11,854 | 2.1 MB |
| `world-countries` | World Countries | GeoNames | ~244 | 45 KB |
| `world-admin1` | World States & Provinces | GeoNames | ~2,754 | 452 KB |

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
| `build-fi-boundaries.ts` | Statistics Finland WFS | Fetch GeoJSON, round coords | fi-kunnat-boundaries |
| `build-world-boundaries.ts` | Natural Earth 110m | ogr2ogr SHP→GeoJSON | world-boundaries |
| `build-us-boundaries.ts` | Census Bureau 20m | ogr2ogr SHP→GeoJSON | us-counties-boundaries |
| `build-dk-boundaries.ts` | ok-dk/dagi GitHub | Fetch GeoJSON, round coords | dk-sogne-boundaries |
| `build-is-boundaries.ts` | LMI WFS | Fetch GeoJSON, round coords | is-sveitarfelog-boundaries |
| `build-no-boundaries.ts` | Kartverket/Geonorge | ogr2ogr reproject+simplify | no-kommuner-boundaries |
| `build-ca-boundaries.ts` | Statistics Canada | ogr2ogr reproject+simplify | ca-divisions-boundaries |

## Adding a New Country Gazetteer

### From GeoNames (most common)

1. **Create build script** -- copy `scripts/build-no-municipalities.ts` as template:
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

Use `scripts/build-dk-parishes.ts` as template. Requires:
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
