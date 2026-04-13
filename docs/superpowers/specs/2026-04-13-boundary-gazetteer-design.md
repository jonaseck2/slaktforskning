# Boundary Gazetteer Overlay — Design Spec

**Date:** 2026-04-13
**Status:** Draft

## Problem

The MapView shows place pins (points) but provides no sense of geographic extent. When a user clicks a parish pin, they see details in the PlacePanel but have no visual indication of where that parish's boundaries lie. For Swedish genealogy research, parish boundaries are the fundamental geographic unit — knowing their extent provides critical context.

## Solution

Add a "boundary gazetteer" — a new gazetteer kind that carries polygon geometry instead of (or alongside) point coordinates. When a user clicks a place pin on the map, the system resolves the place against enabled boundary gazetteers and renders the matched polygon as an outline overlay on the map.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Boundary data source | Separate gazetteer (not embedded in point gazetteers) | Keeps point gazetteers small and fast; boundary data loads lazily |
| Gazetteer kind | `kind: 'point' \| 'boundary'` field on Gazetteer type | Reuses existing infrastructure; backwards compatible (defaults to `'point'`) |
| Visual treatment | Outline only (no fill) | Subtle, doesn't obscure pins or map features |
| Trigger | Click a place pin | On-demand, single place at a time |
| Bundled boundary data | None initially | Ship feature without sourcing data; users import via MCP or UI |
| Compression | Uncompressed JSON (same as point gazetteers) | Defer gzip-at-build-time until sizes warrant it |

## Data Model

### GazetteerNode Extension

```typescript
interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
  geometry?: GeoJSON.Polygon | GeoJSON.MultiPolygon;  // NEW
}
```

### Gazetteer Extension

```typescript
interface Gazetteer {
  id: string;
  name: string;
  locale: string;
  kind: 'point' | 'boundary';  // NEW — defaults to 'point'
  description?: string;
  source?: GazetteerSource;
  root: GazetteerNode;
}
```

- `kind` defaults to `'point'` — existing gazetteers work unchanged, no migration needed
- `geometry` is optional per node — a boundary gazetteer can have polygons at some tree levels but not others
- The `gazetteers` DB table stores full JSON as a blob — no schema migration needed
- Not every node needs geometry; structural container nodes (e.g., a county node in a parish boundary gazetteer) may or may not carry their own polygon

## Boundary Resolution

### New Function: `resolveBoundary()`

Lives in `src/api/place-gazetteers/resolver.ts` alongside `resolvePlace()`.

```typescript
interface BoundaryResolveResult {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  matchedPath: string[];
  matchQuality: 'exact' | 'partial' | 'ambiguous';
  nodeType: string;  // e.g. 'parish', 'county'
}

function resolveBoundary(
  placeName: string,
  gazetteers: Gazetteer[]
): BoundaryResolveResult | null;
```

**Algorithm:**
1. Filter gazetteers to `kind: 'boundary'` only
2. Use the same tree-matching logic as `resolvePlace()` (normalize, split comma-separated components, walk tree)
3. Return the `geometry` from the best-matched node, or `null` if no match or no geometry on matched node

**Shared matching logic:** Extract the common tree-walking/matching code so `resolvePlace()` and `resolveBoundary()` share it rather than duplicating.

### Loading Strategy

- Point gazetteers: loaded at startup (small, needed for map rendering) — unchanged
- Boundary gazetteers: **not loaded until first boundary request** (lazy)
- Once loaded, cached in memory for the session
- `resolvePlace()` unchanged — only operates on point gazetteers
- `resolveBoundary()` is a separate call, invoked by MapView on place selection

## Map Rendering

### Trigger Flow

```
User clicks place pin
  → MapView calls resolveBoundary(place.name, boundaryGazetteers)
  → If result: render polygon outline on map
  → If null: no polygon (silent, not an error)
```

### Visual Specification

- **Style:** Outline only, solid stroke, 2px weight
- **Color:** Muted blue (`#4a90d9`) — contrasts with map tiles without dominating
- **Lifecycle:** One boundary visible at a time. Clicking a new pin replaces the previous boundary. Closing the PlacePanel removes the boundary.

### Leaflet Implementation

- Single reactive `L.GeoJSON` layer managed by MapView
- On place selection: clear layer → add new geometry (if available)
- No additional UI controls (boundary appears/disappears with pin selection)

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Place has no matching boundary | No polygon, no error |
| Matched node has no `geometry` field | No polygon, no error |
| No boundary gazetteers enabled | `resolveBoundary()` returns `null` |
| Boundary gazetteer loading (first click) | Nothing shown until loaded, then render. No spinner. |

## Gazetteer Management & Import

### GazetteersView

- Add `kind` badge ("Point" / "Boundary") to gazetteer list items
- Enable/disable toggle unchanged — boundary gazetteers toggled independently
- Import flow unchanged — `kind` detected from imported JSON

### Schema Validation

Extend `getGazetteerSchema()`:
- Add `kind` as optional enum (`'point' | 'boundary'`), defaults to `'point'`
- Add `geometry` as optional field on GazetteerNode, validated as GeoJSON Polygon or MultiPolygon (structural check: `type` + `coordinates` array of number arrays)

### MCP Tools

No new tools needed:
- `import_gazetteer` — accepts boundary gazetteers via existing flow
- `list_gazetteers` — `kind` field included in response naturally
- `export_gazetteer` — exports full JSON including geometry

### IPC / Composable

- `usePlaceResolver` composable gains `resolveBoundary(placeName)` method
- Boundary gazetteers loaded through existing `getImportedGazetteers()`, filtered by `kind`, loaded lazily on first call

## Out of Scope

- Showing parent boundaries (county when viewing a parish)
- Boundary-based spatial search ("all places within this boundary")
- Boundary editing or user-drawn regions
- Fill/opacity toggle in settings
- Bundled boundary gazetteer data
- Gzip compression at build time (defer until sizes warrant it)
