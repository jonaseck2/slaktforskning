---
title: Boundary Gazetteers
date: 2026-04-18
status: approved
---

# Boundary Gazetteers Design Spec

## Goal

Add 7 boundary gazetteers (polygon geometry) matching the existing point gazetteers for Denmark, Norway, Finland, Iceland, USA, Canada, and the world. All use `kind: "boundary"` and flat hierarchy (`Country > [leaf boundaries]`).

## Architecture Decisions

### Flat Hierarchy

Boundary gazetteers use a flat 2-level structure: `Country > [leaf features]`. No intermediate admin levels (no region > municipality nesting). This matches the established Swedish pattern (`sv-sockenstad-boundaries`).

**Why:** Boundary gazetteers serve a different purpose than point gazetteers. Point gazetteers handle hierarchical name resolution ("Roskilde, Region Sjaelland, Danmark"). Boundary gazetteers provide polygon overlays for map visualization. The resolver matches boundary node names against already-resolved place names. Keeping boundaries flat means smaller files, simpler build scripts, and no need to compute intermediate-level geometries.

### Size Optimization Strategy

**Use pre-simplified sources where available.** Cartographic agencies publish simplified boundary files designed to look good at specific scales. These are smaller, faster to process, and visually tuned by cartographers — better than running our own simplification on full-resolution data.

**Three processing tiers:**

1. **Pre-simplified, format conversion only** (USA 20m, World 110m): Source is already simplified by the publisher. Build script just converts SHP → GeoJSON via ogr2ogr and reduces coordinate precision.

2. **Pre-simplified via WFS scale parameter** (Finland 1:4.5M): Source WFS offers multiple scale levels. We request the most simplified version. Build script fetches GeoJSON and reduces coordinate precision.

3. **Full-resolution, needs simplification** (Denmark, Norway, Iceland, Canada): Source provides full-resolution data. Build script either:
   - Uses ogr2ogr `-simplify` flag (for shapefiles needing reprojection anyway)
   - Reduces coordinate precision to 4 decimal places (~11m accuracy) for GeoJSON sources — this is a simple but effective size reduction without topology distortion

**Coordinate precision:** All boundary gazetteers use 4 decimal places (~11m at equatorial latitudes). This is sufficient for parish/municipality boundaries and significantly reduces file size compared to the 5-6+ decimal places in source data.

### Matching to Point Gazetteers

Each boundary gazetteer's node names should match the corresponding point gazetteer's leaf node names as closely as possible. The resolver's `resolveBoundary()` function matches by name after normalization. If a boundary node name exactly matches a point node name, the boundary is returned.

When source boundary data uses different naming conventions than our point gazetteers (e.g., different suffixes, different language variants), the build script should normalize names to match, or add aliases.

## Gazetteers

### 1. dk-sogne-boundaries — Danish Parish Boundaries

| Field | Value |
|-------|-------|
| **ID** | `dk-sogne-boundaries` |
| **Source** | ok-dk/dagi GitHub |
| **URL** | `https://raw.githubusercontent.com/ok-dk/dagi/master/geojson/sogne.geojson` |
| **License** | Danish open government data |
| **Format** | GeoJSON, WGS84 |
| **Features** | ~2,468 parish polygons |
| **Processing** | Download GeoJSON, reduce coordinate precision to 4dp |
| **Root** | Danmark (lat 56.0, lon 10.0, aliases: ["Denmark"]) |
| **Node type** | "parish" |
| **Name field** | `SOGNENAVN` property |
| **Est. output size** | ~2 MB |

### 2. no-kommuner-boundaries — Norwegian Municipality Boundaries

| Field | Value |
|-------|-------|
| **ID** | `no-kommuner-boundaries` |
| **Source** | Kartverket via Geonorge |
| **URL** | `https://nedlasting.geonorge.no/geonorge/Basisdata/Kommuner/GeoJSON/Basisdata_0000_Norge_25833_Kommuner_GeoJSON.zip` |
| **License** | NLOD / CC BY 4.0 (attribution: Kartverket) |
| **Format** | GeoJSON in zip, EPSG:25833 (UTM zone 33N) |
| **Features** | ~357 municipality polygons |
| **Processing** | ogr2ogr reproject EPSG:25833 → WGS84, simplify 200m tolerance, reduce precision to 4dp |
| **Root** | Norge (lat 65.0, lon 13.0, aliases: ["Norway"]) |
| **Node type** | "municipality" |
| **Name field** | `kommunenavn` property |
| **Est. output size** | ~2-3 MB |

### 3. fi-kunnat-boundaries — Finnish Municipality Boundaries

| Field | Value |
|-------|-------|
| **ID** | `fi-kunnat-boundaries` |
| **Source** | Statistics Finland WFS |
| **URL** | `https://geo.stat.fi/geoserver/tilastointialueet/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:kunta4500k_2025&outputFormat=application/json&srsName=EPSG:4326` |
| **License** | CC BY 4.0 (Statistics Finland) |
| **Format** | GeoJSON via WFS, WGS84 (requested via srsName) |
| **Features** | ~308 municipality polygons |
| **Processing** | Single GET request, reduce coordinate precision to 4dp |
| **Root** | Suomi (lat 64.0, lon 26.0, aliases: ["Finland"]) |
| **Node type** | "municipality" |
| **Name fields** | `nimi` (Finnish), `namn` (Swedish) as alias |
| **Est. output size** | ~200 KB (source is already 1:4.5M simplified) |

### 4. is-sveitarfelog-boundaries — Icelandic Municipality Boundaries

| Field | Value |
|-------|-------|
| **ID** | `is-sveitarfelog-boundaries` |
| **Source** | LMI (Landmaelingar Islands) WFS |
| **URL** | `https://gis.lmi.is/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=EBM:AdministrativeUnit_level2&outputFormat=application/json&srsName=EPSG:4326` |
| **License** | LMI open data (CC compatible) |
| **Format** | GeoJSON via WFS, WGS84 |
| **Features** | ~128 municipality polygons |
| **Processing** | Single GET request, reduce coordinate precision to 4dp |
| **Root** | Island (lat 65.0, lon -18.5, aliases: ["Iceland"]) |
| **Node type** | "municipality" |
| **Name field** | `namn` property |
| **Est. output size** | ~1-2 MB |

### 5. us-counties-boundaries — US County Boundaries

| Field | Value |
|-------|-------|
| **ID** | `us-counties-boundaries` |
| **Source** | US Census Bureau TIGER/Line Cartographic Boundary Files (20m) |
| **URL** | `https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_20m.zip` |
| **License** | Public domain (US government) |
| **Format** | Shapefile in zip, NAD83 (EPSG:4269, ~= WGS84) |
| **Features** | ~3,200+ county polygons (all states + territories) |
| **Processing** | ogr2ogr SHP → GeoJSON (no reprojection needed, NAD83 ≈ WGS84), reduce precision to 4dp |
| **Root** | United States (lat 39.8, lon -98.6, aliases: ["USA", "US", "United States of America"]) |
| **Node type** | "county" |
| **Name fields** | `NAME` (county name), `STUSPS` (state abbrev) — node name format: "`NAME County, STATE`" or use NAME with STATE as context |
| **Est. output size** | ~1 MB (source is pre-simplified at 20m) |

**Note:** County names are not unique nationally (e.g., "Washington County" exists in 30+ states). Node names should include state context for disambiguation: store as `"Washington County"` with the state path providing context, or include state in aliases.

### 6. ca-divisions-boundaries — Canadian Census Division Boundaries

| Field | Value |
|-------|-------|
| **ID** | `ca-divisions-boundaries` |
| **Source** | Statistics Canada 2021 Census Boundary Files |
| **URL** | `https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcd_000a21a_e.zip` |
| **License** | Statistics Canada Open Licence |
| **Format** | Shapefile in zip, EPSG:3347 (Lambert conformal conic) |
| **Features** | ~293 census division polygons |
| **Processing** | ogr2ogr reproject EPSG:3347 → WGS84, simplify 500m tolerance, reduce precision to 4dp |
| **Root** | Canada (lat 56.0, lon -96.0, aliases: ["CA"]) |
| **Node type** | "division" |
| **Name field** | `CDNAME` property |
| **Est. output size** | ~2-3 MB |

### 7. world-boundaries — World Country Boundaries

| Field | Value |
|-------|-------|
| **ID** | `world-boundaries` |
| **Source** | Natural Earth 1:110m Admin-0 Countries |
| **URL** | `https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip` |
| **License** | Public domain |
| **Format** | Shapefile in zip, WGS84 |
| **Features** | ~177 sovereign countries |
| **Processing** | ogr2ogr SHP → GeoJSON (no reprojection needed), reduce precision to 4dp |
| **Root** | World (lat 0, lon 0) |
| **Node type** | "country" |
| **Name fields** | `NAME` (common name), `ISO_A2`/`ISO_A3` as aliases |
| **Est. output size** | ~200 KB (source is pre-simplified at 1:110m) |

## Build Scripts

One script per boundary gazetteer, following the naming convention `build-XX-boundaries.ts`:

| Script | Source type | ogr2ogr needed? |
|--------|-----------|-----------------|
| `build-dk-boundaries.ts` | Direct GeoJSON download | No |
| `build-no-boundaries.ts` | GeoJSON zip, needs reproject | Yes (reproject + simplify) |
| `build-fi-boundaries.ts` | WFS GeoJSON | No |
| `build-is-boundaries.ts` | WFS GeoJSON | No |
| `build-us-boundaries.ts` | Shapefile zip, pre-simplified | Yes (format conversion only) |
| `build-ca-boundaries.ts` | Shapefile zip, needs reproject | Yes (reproject + simplify) |
| `build-world-boundaries.ts` | Shapefile zip, pre-simplified | Yes (format conversion only) |

### Shared Utilities

All boundary build scripts share common operations:

- **`roundCoords(geometry, precision=4)`**: Recursively round all coordinates in a GeoJSON geometry to N decimal places. This is the primary size optimization for GeoJSON sources.
- **`computeCentroid(geometry)`**: Compute a simple centroid (mean of all exterior ring coordinates) for the `lat`/`lon` fields on GazetteerNode.
- **`mergeMultiPolygon(features)`**: Merge multiple features with the same name/code into a single MultiPolygon (for islands, exclaves).

These can be inline in each script (they are small functions) rather than a shared module, keeping each script self-contained per the project convention.

## Integration

### Loader (index.ts)

Add 7 imports and register in BUNDLED_GAZETTEERS (total will be 23):


### Tests

Update `tests/unit/gazetteers.test.ts`:
- Update expected count from 16 to 23
- Add all 7 new IDs to expectedIds
- Add boundary-specific tests: verify `kind === "boundary"`, verify nodes have geometry

### Resolver

No changes needed — `resolveBoundary()` already handles `kind: "boundary"` gazetteers.

## Estimated Total Sizes

| Gazetteer | Est. size |
|-----------|-----------|
| dk-sogne-boundaries | ~2 MB |
| no-kommuner-boundaries | ~2-3 MB |
| fi-kunnat-boundaries | ~200 KB |
| is-sveitarfelog-boundaries | ~1-2 MB |
| us-counties-boundaries | ~1 MB |
| ca-divisions-boundaries | ~2-3 MB |
| world-boundaries | ~200 KB |
| **Total new** | **~9-12 MB** |
| **Grand total (all gazetteers)** | **~41-44 MB** |
