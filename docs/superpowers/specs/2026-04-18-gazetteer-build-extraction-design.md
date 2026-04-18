# Design: Gazetteer Build Module Extraction + gazetteers.ts Coverage

## Goal

1. Extract duplicated logic from 20 gazetteer build scripts into a shared, testable module at `src/gazetteer-build/`.
2. Add unit tests for `src/api/gazetteers.ts` (currently at 4.9% coverage).

Both bring the gazetteer subsystem above the 80% coverage threshold.

---

## Problem

The 20 `scripts/build-*.ts` files duplicate ~300 lines of utility code: `round6()` appears in 6 scripts, `sparqlFetch()` in 3, `dedup()` in 3, `computeCentroid()` in 2, `parseWktPoint()` in 2, plus the `GazetteerNode` type is re-declared in every file. Tree-building and coordinate-averaging patterns are nearly identical across scripts.

`src/api/gazetteers.ts` has thorough validation logic and DB CRUD but zero test coverage — it was never tested because it needs a database.

---

## Module: `src/gazetteer-build/`

### `geo.ts` — Coordinate utilities

```typescript
/** Round to 6 decimal places (~11 cm precision). */
export function round6(n: number): number;

/** Round to 4 decimal places (~11 m precision, used for boundary centroids). */
export function round4(n: number): number;

/** Compute centroid from a GeoJSON Polygon or MultiPolygon geometry.
 *  Uses exterior rings only. Returns [lat, lon]. */
export function computeCentroid(geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }): [number, number];

/** Average coordinates of child nodes. Returns { lat, lon } rounded to 6 decimals. */
export function avgCoordinates(nodes: Array<{ lat: number; lon: number }>): { lat: number; lon: number };

/** Population-weighted centroid. Items with weight 0 are ignored. */
export function weightedCentroid(items: Array<{ lat: number; lon: number; weight: number }>): { lat: number; lon: number };
```

### `sparql.ts` — Wikidata SPARQL client

```typescript
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'SlaktforskningBot/1.0 (genealogy gazetteer builder)';

/** Fetch SPARQL results from Wikidata. Returns the bindings array. */
export function sparqlFetch<T = Record<string, { value: string }>>(query: string): Promise<T[]>;

/** Sleep for ms milliseconds. */
export function sleep(ms: number): Promise<void>;

/** Fetch with retry on 429/5xx. Default: 3 attempts, 2s initial delay. */
export function fetchWithRetry(url: string, init: RequestInit, opts?: { attempts?: number; delayMs?: number }): Promise<Response>;
```

### `geonames.ts` — GeoNames TSV parsing

```typescript
/** A parsed GeoNames TSV row (columns 0–18). */
export interface GeoNameRow {
  geonameId: string;
  name: string;
  lat: number;
  lon: number;
  featureClass: string;  // A, P, H, etc.
  featureCode: string;   // ADM1, PPL, etc.
  countryCode: string;
  admin1: string;
  admin2: string;
  population: number;
  altNames: string;
}

/** Parse a GeoNames TSV file into rows. Skips blank lines. */
export function parseGeoNamesRows(content: string): GeoNameRow[];

/** Two-pass parse: first pass builds admin1/admin2 name maps,
 *  second pass returns filtered rows. */
export function parseGeoNamesWithAdminNames(
  content: string,
  filter?: (row: GeoNameRow) => boolean,
): {
  rows: GeoNameRow[];
  admin1Names: Record<string, string>;
  admin2Names: Record<string, string>;
};

/** Deduplicate rows by lowercase name. First occurrence wins. */
export function dedup<T extends { name: string }>(items: T[]): T[];
```

### `wikidata.ts` — Wikidata-specific helpers

```typescript
/** Parse a WKT POINT string: "Point(lon lat)" → { lat, lon } or null. */
export function parseWktPoint(wkt: string): { lat: number; lon: number } | null;

/** Generate aliases from a Wikidata altLabel pipe-separated string.
 *  Deduplicates and removes the primary name.
 *  suffixRegex strips administrative suffixes (e.g. /\s*(församling|socken)$/i). */
export function generateAliases(name: string, altLabels: string, suffixRegex?: RegExp): string[];
```

### `tree.ts` — Tree building and stats

```typescript
import type { GazetteerNode } from '../api/place-gazetteers/types';

/** Count all nodes (recursive) in a gazetteer tree. */
export function countNodes(node: GazetteerNode): number;

/** Walk every node in the tree, calling fn(node, depth) at each. */
export function walkTree(node: GazetteerNode, fn: (node: GazetteerNode, depth: number) => void): void;

/** Count nodes by type. Returns e.g. { country: 1, county: 21, parish: 2400 }. */
export function countByType(node: GazetteerNode): Record<string, number>;
```

### `io.ts` — File I/O helpers

```typescript
/** Resolved path to src/api/place-gazetteers/data/. */
export const DATA_DIR: string;

/** Write a gazetteer object to DATA_DIR/<filename>. Returns file size in KB. */
export function writeGazetteer(data: unknown, filename: string): { path: string; sizeKB: number };
```

### `index.ts` — Barrel re-export

Re-exports all public functions from the above modules.

---

## Script Updates

Each of the 20 build scripts replaces inline definitions with imports:

```typescript
// Before (in each script):
function round6(n: number): number { ... }
interface GazetteerNode { ... }

// After:
import { round6, avgCoordinates, dedup } from '../src/gazetteer-build';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
```

Scripts keep their domain-specific logic (target state lists, SPARQL queries, download URLs). Only shared utilities are extracted.

---

## `gazetteers.ts` Test Coverage

New file: `tests/unit/gazetteers-crud.test.ts`

Uses `createTestDb()` with in-memory SQLite (same as other API tests).

### Test cases

**`importGazetteer`:**
- Import valid point gazetteer → returns id, name, locale, nodeCount
- Import valid boundary gazetteer (with geometry) → succeeds
- Import with existing id → upserts (ON CONFLICT UPDATE)
- Reject bundled id → throws "Cannot import gazetteer with bundled ID"
- Reject invalid JSON → throws "Invalid JSON"
- Reject oversized JSON → throws "exceeds 50 MB" (mock with string of length > MAX)
- Reject missing required fields (id, name, locale, root) → throws validation errors
- Reject invalid node (missing name/type/lat/lon) → throws
- Reject invalid aliases (not string array) → throws
- Reject invalid geometry type → throws
- Reject invalid geometry coordinates → throws

**`exportGazetteer`:**
- Export imported gazetteer → returns JSON string matching what was imported
- Export bundled gazetteer → returns JSON string
- Export non-existent id → returns null

**`deleteGazetteer`:**
- Delete imported gazetteer → returns true, removed from DB
- Delete removes from enabled config → config updated
- Delete bundled gazetteer → returns false (blocked)
- Delete non-existent id → returns false

**`listGazetteers`:**
- Returns all bundled gazetteers with bundled: true
- Returns imported gazetteers with bundled: false
- Returns both bundled and imported together
- Parses source_json and kind from imported data

**`getImportedGazetteers`:**
- Returns empty array when no imports
- Returns parsed Gazetteer objects for imported entries

**`getGazetteerSchema`:**
- Returns valid JSON Schema object with required fields

**`countNodes` (internal, tested via import result):**
- Single node → 1
- Node with children → correct recursive count

**`validateGazetteer` / `validateNode` (tested via import rejection):**
- Valid kind values: 'point', 'boundary'
- Invalid kind rejected
- Language kind — note: current code rejects 'language' kind. Need to check if this is intentional.

---

## Coverage Target

| File | Current | Target |
|------|---------|--------|
| `src/api/gazetteers.ts` | 4.9% | >90% |
| `src/gazetteer-build/geo.ts` | — (new) | >95% |
| `src/gazetteer-build/geonames.ts` | — (new) | >95% |
| `src/gazetteer-build/wikidata.ts` | — (new) | >95% |
| `src/gazetteer-build/tree.ts` | — (new) | >95% |
| `src/gazetteer-build/sparql.ts` | — (new) | ~60% (network-dependent) |
| `src/gazetteer-build/io.ts` | — (new) | ~60% (filesystem-dependent) |

`sparql.ts` and `io.ts` have lower targets because they wrap network/filesystem calls. The pure functions in the other modules should have near-complete coverage.

---

## DRY: `gazetteers.ts` imports from `gazetteer-build`

`src/api/gazetteers.ts` has its own `countNodes()` function (lines 18–26) which is identical to what `tree.ts` exports. After extraction, `gazetteers.ts` should import `countNodes` from `../gazetteer-build/tree` instead of defining it inline.

## What's NOT Changing

- The 20 scripts keep their domain-specific logic (target states, SPARQL queries, download steps, output metadata).
- `src/api/place-gazetteers/` (resolver, types, index) is unchanged.
- No new dependencies.
- Gazetteer JSON data files are unchanged.

---

## Vitest Configuration

`src/gazetteer-build/` needs to be included in the Vitest coverage target. Check `vitest.config.mts` — the current `include` pattern for coverage may need `src/gazetteer-build/**` added.

---

## Validation Note

`gazetteers.ts:validateGazetteer` currently accepts only `kind: 'point' | 'boundary'` and rejects `'language'`. Language gazetteers are bundled (never imported through this path), so this is intentional — importing a language gazetteer via the UI would fail validation. The tests should verify this behavior.
