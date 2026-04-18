# Gazetteer Build Module Extraction + gazetteers.ts Coverage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract duplicated utility code from 20 gazetteer build scripts into a shared testable module at `src/gazetteer-build/`, and add unit tests for `src/api/gazetteers.ts`.

**Architecture:** Shared pure functions live in `src/gazetteer-build/` (6 focused files). Scripts import from there instead of inlining. `gazetteers.ts` imports `countNodes` from the shared module. New test files cover both the extracted module and the DB CRUD module.

**Tech Stack:** TypeScript, Vitest, node-sqlite3-wasm (for gazetteers.ts tests)

---

## File Structure

### New files
- `src/gazetteer-build/geo.ts` — Coordinate rounding, centroid, averaging
- `src/gazetteer-build/sparql.ts` — Wikidata SPARQL fetch, retry, sleep
- `src/gazetteer-build/geonames.ts` — GeoNames TSV parsing, dedup
- `src/gazetteer-build/wikidata.ts` — WKT parsing, alias generation
- `src/gazetteer-build/tree.ts` — Tree node counting, walking, stats
- `src/gazetteer-build/io.ts` — File write helper, DATA_DIR constant
- `src/gazetteer-build/index.ts` — Barrel re-export
- `tests/unit/gazetteer-build.test.ts` — Tests for all extracted functions
- `tests/unit/gazetteers-crud.test.ts` — Tests for `src/api/gazetteers.ts`

### Modified files
- `src/api/gazetteers.ts` — Import `countNodes` from `../gazetteer-build/tree`
- `vitest.config.mts` — Add `src/gazetteer-build/**` to coverage include
- All 20 `scripts/build-*.ts` — Replace inline utils with imports
- `scripts/fetch-sv-orter.ts` — Check for shared utils

---

## Task 1: Create `src/gazetteer-build/geo.ts` + tests

**Files:**
- Create: `src/gazetteer-build/geo.ts`
- Test: `tests/unit/gazetteer-build.test.ts`

- [ ] **Step 1: Write failing tests for geo utilities**

Create `tests/unit/gazetteer-build.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { round6, round4, computeCentroid, avgCoordinates, weightedCentroid } from '../../src/gazetteer-build/geo';

describe('round6', () => {
  it('rounds to 6 decimal places', () => {
    expect(round6(57.123456789)).toBe(57.123457);
  });

  it('preserves already-rounded values', () => {
    expect(round6(57.42)).toBe(57.42);
  });

  it('handles negative coordinates', () => {
    expect(round6(-98.654321987)).toBe(-98.654322);
  });

  it('handles zero', () => {
    expect(round6(0)).toBe(0);
  });
});

describe('round4', () => {
  it('rounds to 4 decimal places', () => {
    expect(round4(57.123456)).toBe(57.1235);
  });

  it('handles negative values', () => {
    expect(round4(-10.98765)).toBe(-10.9877);
  });
});

describe('computeCentroid', () => {
  it('computes centroid of a simple Polygon', () => {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    };
    const [lat, lon] = computeCentroid(geometry);
    expect(lat).toBeCloseTo(5, 1);
    expect(lon).toBeCloseTo(5, 1);
  });

  it('computes centroid of a MultiPolygon', () => {
    const geometry = {
      type: 'MultiPolygon' as const,
      coordinates: [
        [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
        [[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]],
      ],
    };
    const [lat, lon] = computeCentroid(geometry);
    // Average of all exterior ring points
    expect(lat).toBeCloseTo(6, 0);
    expect(lon).toBeCloseTo(6, 0);
  });

  it('uses only exterior ring (ignores holes)', () => {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],  // exterior
        [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],       // hole (ignored)
      ],
    };
    const [lat, lon] = computeCentroid(geometry);
    expect(lat).toBeCloseTo(5, 1);
    expect(lon).toBeCloseTo(5, 1);
  });
});

describe('avgCoordinates', () => {
  it('averages lat/lon of nodes', () => {
    const nodes = [
      { lat: 57.0, lon: 14.0 },
      { lat: 58.0, lon: 15.0 },
      { lat: 59.0, lon: 16.0 },
    ];
    const avg = avgCoordinates(nodes);
    expect(avg.lat).toBeCloseTo(58.0, 5);
    expect(avg.lon).toBeCloseTo(15.0, 5);
  });

  it('returns rounded values', () => {
    const nodes = [
      { lat: 57.1111111, lon: 14.2222222 },
      { lat: 57.3333333, lon: 14.4444444 },
    ];
    const avg = avgCoordinates(nodes);
    expect(avg.lat).toBe(round6(57.2222222));
    expect(avg.lon).toBe(round6(14.3333333));
  });
});

describe('weightedCentroid', () => {
  it('weights by population', () => {
    const items = [
      { lat: 0, lon: 0, weight: 100 },
      { lat: 10, lon: 10, weight: 0 },
    ];
    const result = weightedCentroid(items);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(0);
    expect(result!.lon).toBe(0);
  });

  it('falls back to simple mean when total weight is 0', () => {
    const items = [
      { lat: 10, lon: 20, weight: 0 },
      { lat: 30, lon: 40, weight: 0 },
    ];
    const result = weightedCentroid(items);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(20);
    expect(result!.lon).toBe(30);
  });

  it('returns null for empty array', () => {
    expect(weightedCentroid([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/gazetteer-build.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement geo.ts**

Create `src/gazetteer-build/geo.ts`:

```typescript
export function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function computeCentroid(geometry: {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}): [number, number] {
  let sumLat = 0, sumLon = 0, count = 0;
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates as number[][][]]
    : geometry.coordinates as number[][][][];

  for (const polygon of polygons) {
    const ring = polygon[0]; // exterior ring only
    for (const [lon, lat] of ring) {
      sumLon += lon;
      sumLat += lat;
      count++;
    }
  }
  return [sumLat / count, sumLon / count];
}

export function avgCoordinates(nodes: Array<{ lat: number; lon: number }>): { lat: number; lon: number } {
  const lat = nodes.reduce((s, n) => s + n.lat, 0) / nodes.length;
  const lon = nodes.reduce((s, n) => s + n.lon, 0) / nodes.length;
  return { lat: round6(lat), lon: round6(lon) };
}

export function weightedCentroid(
  items: Array<{ lat: number; lon: number; weight: number }>,
): { lat: number; lon: number } | null {
  if (items.length === 0) return null;

  const totalWeight = items.reduce((s, c) => s + c.weight, 0);

  if (totalWeight === 0) {
    const lat = items.reduce((s, c) => s + c.lat, 0) / items.length;
    const lon = items.reduce((s, c) => s + c.lon, 0) / items.length;
    return { lat: round6(lat), lon: round6(lon) };
  }

  let lat = 0, lon = 0;
  for (const c of items) {
    lat += c.lat * c.weight;
    lon += c.lon * c.weight;
  }
  return { lat: round6(lat / totalWeight), lon: round6(lon / totalWeight) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/gazetteer-build.test.ts`
Expected: All geo tests PASS

- [ ] **Step 5: Commit**

```
feat(gazetteer-build): add geo.ts with coordinate utilities and tests
```

---

## Task 2: Create `src/gazetteer-build/wikidata.ts` + tests

**Files:**
- Create: `src/gazetteer-build/wikidata.ts`
- Modify: `tests/unit/gazetteer-build.test.ts`

- [ ] **Step 1: Write failing tests for wikidata utilities**

Append to `tests/unit/gazetteer-build.test.ts`:

```typescript
import { parseWktPoint, generateAliases } from '../../src/gazetteer-build/wikidata';

describe('parseWktPoint', () => {
  it('parses a valid WKT Point', () => {
    const result = parseWktPoint('Point(14.72 57.42)');
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(57.42);
    expect(result!.lon).toBe(14.72);
  });

  it('returns null for invalid WKT', () => {
    expect(parseWktPoint('not wkt')).toBeNull();
  });

  it('returns null for NaN coordinates', () => {
    expect(parseWktPoint('Point(abc def)')).toBeNull();
  });

  it('handles negative coordinates', () => {
    const result = parseWktPoint('Point(-98.5 45.3)');
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(45.3);
    expect(result!.lon).toBe(-98.5);
  });

  it('rounds to 6 decimals', () => {
    const result = parseWktPoint('Point(14.123456789 57.987654321)');
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(57.987654);
    expect(result!.lon).toBe(14.123457);
  });
});

describe('generateAliases', () => {
  it('splits pipe-separated alt labels', () => {
    const result = generateAliases('Vallsjö', 'Wallsjö|Valsjö');
    expect(result).toContain('Wallsjö');
    expect(result).toContain('Valsjö');
    expect(result).not.toContain('Vallsjö');
  });

  it('returns empty array when no alt labels', () => {
    expect(generateAliases('Vallsjö', '')).toEqual([]);
  });

  it('strips suffixes when regex provided', () => {
    const suffixRegex = /\s*(församling|socken)$/i;
    const result = generateAliases('Vallsjö församling', '', suffixRegex);
    expect(result).toContain('Vallsjö');
  });

  it('also strips suffixes from alt labels', () => {
    const suffixRegex = /\s*(församling|socken)$/i;
    const result = generateAliases('Vallsjö', 'Vallsjö socken', suffixRegex);
    // 'Vallsjö socken' is an alt label, and its bare form 'Vallsjö' matches the primary name,
    // so only 'Vallsjö socken' should appear
    expect(result).toContain('Vallsjö socken');
  });

  it('deduplicates aliases', () => {
    const result = generateAliases('Vallsjö', 'Wallsjö|Wallsjö|Wallsjö');
    const wallsjoCount = result.filter(a => a === 'Wallsjö').length;
    expect(wallsjoCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/gazetteer-build.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement wikidata.ts**

Create `src/gazetteer-build/wikidata.ts`:

```typescript
import { round6 } from './geo';

/** Parse WKT "Point(lon lat)" → { lat, lon } or null. */
export function parseWktPoint(wkt: string): { lat: number; lon: number } | null {
  const match = wkt.match(/Point\(([^ ]+)\s+([^ ]+)\)/i);
  if (!match) return null;
  const lon = parseFloat(match[1]);
  const lat = parseFloat(match[2]);
  if (isNaN(lat) || isNaN(lon)) return null;
  return { lat: round6(lat), lon: round6(lon) };
}

/**
 * Generate aliases from a pipe-separated Wikidata altLabel string.
 * Deduplicates, removes primary name, optionally strips administrative suffixes.
 */
export function generateAliases(name: string, altLabels: string, suffixRegex?: RegExp): string[] {
  const aliases = new Set<string>();

  if (altLabels) {
    for (const label of altLabels.split('|')) {
      const trimmed = label.trim();
      if (trimmed && trimmed !== name) {
        aliases.add(trimmed);
      }
    }
  }

  if (suffixRegex) {
    const bare = name.replace(suffixRegex, '').trim();
    if (bare && bare !== name) {
      aliases.add(bare);
    }

    for (const alias of [...aliases]) {
      const bareAlias = alias.replace(suffixRegex, '').trim();
      if (bareAlias && bareAlias !== alias && bareAlias !== name) {
        aliases.add(bareAlias);
      }
    }
  }

  return [...aliases];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/gazetteer-build.test.ts`
Expected: All wikidata tests PASS

- [ ] **Step 5: Commit**

```
feat(gazetteer-build): add wikidata.ts with WKT parsing and alias generation
```

---

## Task 3: Create `src/gazetteer-build/geonames.ts` + tests

**Files:**
- Create: `src/gazetteer-build/geonames.ts`
- Modify: `tests/unit/gazetteer-build.test.ts`

- [ ] **Step 1: Write failing tests for GeoNames parsing**

Append to `tests/unit/gazetteer-build.test.ts`:

```typescript
import { parseGeoNamesRows, parseGeoNamesWithAdminNames, dedup } from '../../src/gazetteer-build/geonames';

describe('parseGeoNamesRows', () => {
  it('parses a TSV line into a GeoNameRow', () => {
    const line = '123	Minneapolis	Minneapolis	Mpls	44.98	-93.27	P	PPLA	US		MN	053			382578		254		2024-01-01';
    const rows = parseGeoNamesRows(line);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Minneapolis');
    expect(rows[0].lat).toBeCloseTo(44.98);
    expect(rows[0].lon).toBeCloseTo(-93.27);
    expect(rows[0].featureClass).toBe('P');
    expect(rows[0].featureCode).toBe('PPLA');
    expect(rows[0].admin1).toBe('MN');
    expect(rows[0].admin2).toBe('053');
    expect(rows[0].population).toBe(382578);
  });

  it('skips blank lines', () => {
    const content = '123	Place	Place		10	20	P	PPL	US		MN	001			100		0		

';
    const rows = parseGeoNamesRows(content);
    expect(rows).toHaveLength(1);
  });
});

describe('parseGeoNamesWithAdminNames', () => {
  it('extracts ADM1 and ADM2 names', () => {
    const content = [
      '1	Minnesota	Minnesota		44.0	-93.0	A	ADM1	US		MN				0		0		',
      '2	Hennepin County	Hennepin		44.9	-93.3	A	ADM2	US		MN	053			0		0		',
      '3	Minneapolis	Minneapolis		44.98	-93.27	P	PPLA	US		MN	053			382578		254		',
    ].join('\n');
    const { rows, admin1Names, admin2Names } = parseGeoNamesWithAdminNames(content);
    expect(admin1Names['MN']).toBe('Minnesota');
    expect(admin2Names['MN.053']).toBe('Hennepin County');
    expect(rows).toHaveLength(3);
  });

  it('filters rows when filter function provided', () => {
    const content = [
      '1	Minnesota	Minnesota		44.0	-93.0	A	ADM1	US		MN				0		0		',
      '3	Minneapolis	Minneapolis		44.98	-93.27	P	PPLA	US		MN	053			382578		254		',
    ].join('\n');
    const { rows } = parseGeoNamesWithAdminNames(content, r => r.featureClass === 'P');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Minneapolis');
  });
});

describe('dedup', () => {
  it('deduplicates by lowercase name, first wins', () => {
    const items = [
      { name: 'Minneapolis', lat: 1 },
      { name: 'minneapolis', lat: 2 },
      { name: 'Saint Paul', lat: 3 },
    ];
    const result = dedup(items);
    expect(result).toHaveLength(2);
    expect(result[0].lat).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(dedup([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/gazetteer-build.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement geonames.ts**

Create `src/gazetteer-build/geonames.ts`:

```typescript
export interface GeoNameRow {
  geonameId: string;
  name: string;
  lat: number;
  lon: number;
  featureClass: string;
  featureCode: string;
  countryCode: string;
  admin1: string;
  admin2: string;
  population: number;
  altNames: string;
}

function parseLine(line: string): GeoNameRow | null {
  if (!line.trim()) return null;
  const cols = line.split('\t');
  if (cols.length < 15) return null;
  return {
    geonameId: cols[0],
    name: cols[1],
    lat: parseFloat(cols[4]),
    lon: parseFloat(cols[5]),
    featureClass: cols[6],
    featureCode: cols[7],
    countryCode: cols[8],
    admin1: cols[10],
    admin2: cols[11],
    population: parseInt(cols[14], 10) || 0,
    altNames: cols[3],
  };
}

/** Parse a GeoNames TSV file into rows. Skips blank lines and short lines. */
export function parseGeoNamesRows(content: string): GeoNameRow[] {
  return content.split('\n').map(parseLine).filter((r): r is GeoNameRow => r !== null);
}

/**
 * Two-pass parse: builds admin1/admin2 name maps, returns all rows.
 * Optional filter applied to output rows (admin rows always processed for name maps).
 */
export function parseGeoNamesWithAdminNames(
  content: string,
  filter?: (row: GeoNameRow) => boolean,
): {
  rows: GeoNameRow[];
  admin1Names: Record<string, string>;
  admin2Names: Record<string, string>;
} {
  const allRows = parseGeoNamesRows(content);
  const admin1Names: Record<string, string> = {};
  const admin2Names: Record<string, string> = {};

  for (const row of allRows) {
    if (row.featureClass === 'A' && row.featureCode === 'ADM1') {
      admin1Names[row.admin1] = row.name;
    }
    if (row.featureClass === 'A' && row.featureCode === 'ADM2') {
      admin2Names[`${row.admin1}.${row.admin2}`] = row.name;
    }
  }

  const rows = filter ? allRows.filter(filter) : allRows;
  return { rows, admin1Names, admin2Names };
}

/** Deduplicate items by lowercase name. First occurrence wins. */
export function dedup<T extends { name: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return [...seen.values()];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/gazetteer-build.test.ts`
Expected: All geonames tests PASS

- [ ] **Step 5: Commit**

```
feat(gazetteer-build): add geonames.ts with TSV parsing and dedup
```

---

## Task 4: Create `src/gazetteer-build/tree.ts` + tests

**Files:**
- Create: `src/gazetteer-build/tree.ts`
- Modify: `tests/unit/gazetteer-build.test.ts`

- [ ] **Step 1: Write failing tests for tree utilities**

Append to `tests/unit/gazetteer-build.test.ts`:

```typescript
import { countNodes, walkTree, countByType } from '../../src/gazetteer-build/tree';
import type { GazetteerNode } from '../../src/api/place-gazetteers/types';

const sampleTree: GazetteerNode = {
  name: 'Sverige', type: 'country', lat: 62, lon: 15,
  children: [
    {
      name: 'Jönköpings län', type: 'county', lat: 57.78, lon: 14.16,
      children: [
        { name: 'Vallsjö', type: 'parish', lat: 57.42, lon: 14.72 },
        { name: 'Bringetofta', type: 'parish', lat: 57.5, lon: 14.8 },
      ],
    },
  ],
};

describe('countNodes', () => {
  it('counts all nodes recursively', () => {
    expect(countNodes(sampleTree)).toBe(4);
  });

  it('returns 1 for a leaf node', () => {
    expect(countNodes({ name: 'Leaf', type: 'parish', lat: 0, lon: 0 })).toBe(1);
  });
});

describe('walkTree', () => {
  it('visits every node with correct depth', () => {
    const visited: Array<{ name: string; depth: number }> = [];
    walkTree(sampleTree, (node, depth) => {
      visited.push({ name: node.name, depth });
    });
    expect(visited).toHaveLength(4);
    expect(visited[0]).toEqual({ name: 'Sverige', depth: 0 });
    expect(visited[1]).toEqual({ name: 'Jönköpings län', depth: 1 });
    expect(visited[2]).toEqual({ name: 'Vallsjö', depth: 2 });
    expect(visited[3]).toEqual({ name: 'Bringetofta', depth: 2 });
  });
});

describe('countByType', () => {
  it('counts nodes grouped by type', () => {
    const counts = countByType(sampleTree);
    expect(counts).toEqual({ country: 1, county: 1, parish: 2 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/gazetteer-build.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement tree.ts**

Create `src/gazetteer-build/tree.ts`:

```typescript
import type { GazetteerNode } from '../api/place-gazetteers/types';

/** Count all nodes recursively in a gazetteer tree. */
export function countNodes(node: GazetteerNode): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

/** Walk every node in the tree, calling fn(node, depth) at each. */
export function walkTree(
  node: GazetteerNode,
  fn: (node: GazetteerNode, depth: number) => void,
  depth = 0,
): void {
  fn(node, depth);
  if (node.children) {
    for (const child of node.children) {
      walkTree(child, fn, depth + 1);
    }
  }
}

/** Count nodes grouped by type. Returns e.g. { country: 1, county: 21, parish: 2400 }. */
export function countByType(node: GazetteerNode): Record<string, number> {
  const counts: Record<string, number> = {};
  walkTree(node, (n) => {
    counts[n.type] = (counts[n.type] || 0) + 1;
  });
  return counts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/gazetteer-build.test.ts`
Expected: All tree tests PASS

- [ ] **Step 5: Commit**

```
feat(gazetteer-build): add tree.ts with node counting and tree walking
```

---

## Task 5: Create `src/gazetteer-build/sparql.ts`, `io.ts`, `index.ts`

These modules wrap network/filesystem calls and are tested indirectly through the build scripts. Add minimal tests for the pure logic parts.

**Files:**
- Create: `src/gazetteer-build/sparql.ts`
- Create: `src/gazetteer-build/io.ts`
- Create: `src/gazetteer-build/index.ts`

- [ ] **Step 1: Create sparql.ts**

```typescript
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'SlaktforskningBot/1.0 (genealogy gazetteer builder)';

export { SPARQL_ENDPOINT, USER_AGENT };

/** Sleep for ms milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Fetch with retry on 429/5xx. */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<Response> {
  const { attempts = 3, delayMs = 2000 } = opts;
  let lastError: Error | null = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, init);
      if (response.status === 429 || response.status >= 500) {
        if (i < attempts - 1) {
          await sleep(delayMs * (i + 1));
          continue;
        }
      }
      return response;
    } catch (e) {
      lastError = e as Error;
      if (i < attempts - 1) {
        await sleep(delayMs * (i + 1));
      }
    }
  }
  throw lastError ?? new Error('fetchWithRetry: all attempts failed');
}

/** Fetch SPARQL results from Wikidata. Returns the bindings array. */
export async function sparqlFetch<T = Record<string, { value: string }>>(
  query: string,
): Promise<T[]> {
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}\n${body}`);
  }

  const json = await response.json() as {
    results: { bindings: T[] };
  };

  return json.results.bindings;
}
```

- [ ] **Step 2: Create io.ts**

```typescript
import * as fs from 'fs';
import * as path from 'path';

/** Resolved path to src/api/place-gazetteers/data/. */
export const DATA_DIR = path.resolve(__dirname, '..', 'api', 'place-gazetteers', 'data');

/** Write a gazetteer object to DATA_DIR/<filename>. Returns file size in KB. */
export function writeGazetteer(
  data: unknown,
  filename: string,
  dataDir: string = DATA_DIR,
): { path: string; sizeKB: number } {
  fs.mkdirSync(dataDir, { recursive: true });
  const outPath = path.join(dataDir, filename);
  const json = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(outPath, json);
  const sizeKB = Math.round(fs.statSync(outPath).size / 1024);
  return { path: outPath, sizeKB };
}
```

- [ ] **Step 3: Create index.ts barrel**

```typescript
export { round6, round4, computeCentroid, avgCoordinates, weightedCentroid } from './geo';
export { parseWktPoint, generateAliases } from './wikidata';
export { parseGeoNamesRows, parseGeoNamesWithAdminNames, dedup } from './geonames';
export type { GeoNameRow } from './geonames';
export { countNodes, walkTree, countByType } from './tree';
export { sparqlFetch, sleep, fetchWithRetry, SPARQL_ENDPOINT, USER_AGENT } from './sparql';
export { writeGazetteer, DATA_DIR } from './io';
```

- [ ] **Step 4: Run all gazetteer-build tests**

Run: `npx vitest run tests/unit/gazetteer-build.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```
feat(gazetteer-build): add sparql.ts, io.ts, and barrel index.ts
```

---

## Task 6: Update `vitest.config.mts` + DRY `gazetteers.ts`

**Files:**
- Modify: `vitest.config.mts`
- Modify: `src/api/gazetteers.ts`

- [ ] **Step 1: Add `src/gazetteer-build/**` to coverage include**

In `vitest.config.mts`, change:
```typescript
include: ['src/api/**/*.ts'],
```
to:
```typescript
include: ['src/api/**/*.ts', 'src/gazetteer-build/**/*.ts'],
```

- [ ] **Step 2: Replace `countNodes` in `gazetteers.ts` with import**

In `src/api/gazetteers.ts`, add import:
```typescript
import { countNodes } from '../gazetteer-build/tree';
```

Remove the inline `countNodes` function (lines 18-26).

- [ ] **Step 3: Run all tests to verify nothing breaks**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```
refactor: gazetteers.ts imports countNodes from gazetteer-build, add coverage config
```

---

## Task 7: Add unit tests for `src/api/gazetteers.ts`

**Files:**
- Create: `tests/unit/gazetteers-crud.test.ts`

- [ ] **Step 1: Write tests for validateGazetteer + importGazetteer**

Create `tests/unit/gazetteers-crud.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'node-sqlite3-wasm';
import { createTestDb } from './helpers';
import {
  importGazetteer,
  exportGazetteer,
  deleteGazetteer,
  listGazetteers,
  getImportedGazetteers,
  getGazetteerSchema,
} from '../../src/api/gazetteers';

const VALID_GAZETTEER = {
  id: 'test-gaz',
  name: 'Test Gazetteer',
  locale: 'en',
  description: 'A test gazetteer',
  source: {
    name: 'Test',
    url: 'https://example.com',
    license: 'CC0',
    fetched: '2026-01-01',
  },
  root: {
    name: 'World',
    type: 'root',
    lat: 0,
    lon: 0,
    children: [
      { name: 'Place A', type: 'country', lat: 10, lon: 20 },
      {
        name: 'Place B', type: 'country', lat: 30, lon: 40,
        aliases: ['PB', 'PlaceB'],
        children: [
          { name: 'Sub', type: 'city', lat: 31, lon: 41 },
        ],
      },
    ],
  },
};

const VALID_BOUNDARY_GAZETTEER = {
  id: 'test-boundary',
  name: 'Test Boundary',
  locale: 'en',
  kind: 'boundary',
  root: {
    name: 'World',
    type: 'root',
    lat: 0,
    lon: 0,
    children: [{
      name: 'Country',
      type: 'country',
      lat: 10,
      lon: 20,
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      },
    }],
  },
};

let db: Database;
beforeEach(() => {
  db = createTestDb();
});

describe('importGazetteer', () => {
  it('imports a valid point gazetteer', () => {
    const result = importGazetteer(db, JSON.stringify(VALID_GAZETTEER));
    expect(result.id).toBe('test-gaz');
    expect(result.name).toBe('Test Gazetteer');
    expect(result.locale).toBe('en');
    expect(result.nodeCount).toBe(4); // root + 2 countries + 1 city
  });

  it('imports a valid boundary gazetteer', () => {
    const result = importGazetteer(db, JSON.stringify(VALID_BOUNDARY_GAZETTEER));
    expect(result.id).toBe('test-boundary');
    expect(result.nodeCount).toBe(2);
  });

  it('upserts on duplicate id', () => {
    importGazetteer(db, JSON.stringify(VALID_GAZETTEER));
    const updated = { ...VALID_GAZETTEER, name: 'Updated Name' };
    const result = importGazetteer(db, JSON.stringify(updated));
    expect(result.name).toBe('Updated Name');
  });

  it('rejects bundled id', () => {
    const bundled = { ...VALID_GAZETTEER, id: 'sv-socknar' };
    expect(() => importGazetteer(db, JSON.stringify(bundled))).toThrow('bundled ID');
  });

  it('rejects invalid JSON', () => {
    expect(() => importGazetteer(db, 'not json')).toThrow('Invalid JSON');
  });

  it('rejects oversized JSON', () => {
    const huge = JSON.stringify({ ...VALID_GAZETTEER, padding: 'x'.repeat(51 * 1024 * 1024) });
    expect(() => importGazetteer(db, huge)).toThrow('50 MB');
  });

  it('rejects missing id', () => {
    const bad = { name: 'X', locale: 'en', root: VALID_GAZETTEER.root };
    expect(() => importGazetteer(db, JSON.stringify(bad))).toThrow('id');
  });

  it('rejects missing name', () => {
    const bad = { id: 'x', locale: 'en', root: VALID_GAZETTEER.root };
    expect(() => importGazetteer(db, JSON.stringify(bad))).toThrow('name');
  });

  it('rejects missing locale', () => {
    const bad = { id: 'x', name: 'X', root: VALID_GAZETTEER.root };
    expect(() => importGazetteer(db, JSON.stringify(bad))).toThrow('locale');
  });

  it('rejects missing root', () => {
    const bad = { id: 'x', name: 'X', locale: 'en' };
    expect(() => importGazetteer(db, JSON.stringify(bad))).toThrow('root');
  });

  it('rejects invalid node (missing lat)', () => {
    const bad = { ...VALID_GAZETTEER, id: 'bad', root: { name: 'X', type: 'r', lon: 0 } };
    expect(() => importGazetteer(db, JSON.stringify(bad))).toThrow('lat');
  });

  it('rejects invalid aliases (not string array)', () => {
    const bad = {
      ...VALID_GAZETTEER,
      id: 'bad',
      root: { name: 'X', type: 'r', lat: 0, lon: 0, aliases: [123] },
    };
    expect(() => importGazetteer(db, JSON.stringify(bad))).toThrow('aliases');
  });

  it('rejects invalid geometry type', () => {
    const bad = {
      ...VALID_GAZETTEER,
      id: 'bad',
      root: {
        name: 'X', type: 'r', lat: 0, lon: 0,
        geometry: { type: 'LineString', coordinates: [] },
      },
    };
    expect(() => importGazetteer(db, JSON.stringify(bad))).toThrow('geometry.type');
  });

  it('rejects invalid kind', () => {
    const bad = { ...VALID_GAZETTEER, id: 'bad', kind: 'language' };
    expect(() => importGazetteer(db, JSON.stringify(bad))).toThrow('kind');
  });
});

describe('exportGazetteer', () => {
  it('exports an imported gazetteer', () => {
    importGazetteer(db, JSON.stringify(VALID_GAZETTEER));
    const exported = exportGazetteer(db, 'test-gaz');
    expect(exported).not.toBeNull();
    const parsed = JSON.parse(exported!);
    expect(parsed.id).toBe('test-gaz');
  });

  it('exports a bundled gazetteer', () => {
    const exported = exportGazetteer(db, 'sv-socknar');
    expect(exported).not.toBeNull();
    const parsed = JSON.parse(exported!);
    expect(parsed.id).toBe('sv-socknar');
  });

  it('returns null for unknown id', () => {
    expect(exportGazetteer(db, 'nonexistent')).toBeNull();
  });
});

describe('deleteGazetteer', () => {
  it('deletes an imported gazetteer', () => {
    importGazetteer(db, JSON.stringify(VALID_GAZETTEER));
    expect(deleteGazetteer(db, 'test-gaz')).toBe(true);
    expect(exportGazetteer(db, 'test-gaz')).toBeNull();
  });

  it('refuses to delete a bundled gazetteer', () => {
    expect(deleteGazetteer(db, 'sv-socknar')).toBe(false);
  });

  it('returns false for non-existent id', () => {
    expect(deleteGazetteer(db, 'nonexistent')).toBe(false);
  });

  it('removes deleted gazetteer from enabled config', () => {
    importGazetteer(db, JSON.stringify(VALID_GAZETTEER));
    // Set a config that includes the gazetteer
    const { setDbSetting } = require('../../src/api/db_settings');
    setDbSetting(db, 'gazetteer_config', JSON.stringify({ enabledGazetteers: ['test-gaz', 'other'] }));

    deleteGazetteer(db, 'test-gaz');

    const { getDbSetting } = require('../../src/api/db_settings');
    const config = JSON.parse(getDbSetting(db, 'gazetteer_config')!);
    expect(config.enabledGazetteers).toEqual(['other']);
  });
});

describe('listGazetteers', () => {
  it('returns bundled gazetteers with bundled: true', () => {
    const list = listGazetteers(db);
    const svSocknar = list.find(g => g.id === 'sv-socknar');
    expect(svSocknar).toBeDefined();
    expect(svSocknar!.bundled).toBe(true);
  });

  it('returns imported gazetteers with bundled: false', () => {
    importGazetteer(db, JSON.stringify(VALID_GAZETTEER));
    const list = listGazetteers(db);
    const custom = list.find(g => g.id === 'test-gaz');
    expect(custom).toBeDefined();
    expect(custom!.bundled).toBe(false);
    expect(custom!.source).toBeDefined();
    expect(custom!.source!.name).toBe('Test');
  });

  it('returns both bundled and imported', () => {
    importGazetteer(db, JSON.stringify(VALID_GAZETTEER));
    const list = listGazetteers(db);
    expect(list.some(g => g.bundled)).toBe(true);
    expect(list.some(g => !g.bundled)).toBe(true);
  });
});

describe('getImportedGazetteers', () => {
  it('returns empty array when no imports', () => {
    expect(getImportedGazetteers(db)).toEqual([]);
  });

  it('returns parsed Gazetteer objects', () => {
    importGazetteer(db, JSON.stringify(VALID_GAZETTEER));
    const imported = getImportedGazetteers(db);
    expect(imported).toHaveLength(1);
    expect(imported[0].id).toBe('test-gaz');
    expect(imported[0].root.children).toHaveLength(2);
  });
});

describe('getGazetteerSchema', () => {
  it('returns a JSON Schema object', () => {
    const schema = getGazetteerSchema();
    expect(schema.).toContain('json-schema.org');
    expect(schema.required).toContain('id');
    expect(schema.required).toContain('root');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/unit/gazetteers-crud.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Run full test suite + coverage**

Run: `npm test -- --coverage`
Expected: All tests PASS, `gazetteers.ts` coverage >90%

- [ ] **Step 4: Commit**

```
test: add comprehensive gazetteers.ts CRUD tests (>90% coverage)
```

---

## Task 8: Update build scripts — GeoNames-based scripts

Update the 6 GeoNames-based scripts to import from `src/gazetteer-build/` instead of inlining utilities.

**Files:**
- Modify: `scripts/build-us-places.ts`
- Modify: `scripts/build-us-places-all.ts`
- Modify: `scripts/build-ca-places.ts`
- Modify: `scripts/build-no-municipalities.ts`
- Modify: `scripts/build-fi-municipalities.ts`
- Modify: `scripts/build-is-municipalities.ts`

- [ ] **Step 1: Update each script**

For each script, make these changes:

1. **Add imports** at the top (after the doc comment):
```typescript
import { round6, avgCoordinates } from '../src/gazetteer-build/geo';
import { dedup } from '../src/gazetteer-build/geonames';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
```

2. **Remove** the inline `round6()` function definition

3. **Remove** the inline `GazetteerNode` interface definition

4. **Remove** the inline `dedup()` function (if present — in build-us-places, build-ca-places, build-no-municipalities)

5. **Replace** coordinate averaging patterns like:
```typescript
const avgLat = nodes.reduce((s, n) => s + n.lat, 0) / nodes.length;
const avgLon = nodes.reduce((s, n) => s + n.lon, 0) / nodes.length;
// Use: round6(avgLat), round6(avgLon)
```
with:
```typescript
const { lat, lon } = avgCoordinates(nodes);
```

Each script keeps its domain-specific logic: target states, admin name maps, GEONAMES_FILE path, gazetteer metadata, `main()` function.

- [ ] **Step 2: Run lint to verify**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: Commit**

```
refactor: GeoNames build scripts import from gazetteer-build
```

---

## Task 9: Update build scripts — Wikidata-based scripts

**Files:**
- Modify: `scripts/build-sv-parishes.ts`
- Modify: `scripts/build-dk-parishes.ts`
- Modify: `scripts/build-dk-parishes-dawa.ts`

- [ ] **Step 1: Update each script**

For each script:

1. **Add imports:**
```typescript
import { round6, avgCoordinates } from '../src/gazetteer-build/geo';
import { parseWktPoint, generateAliases } from '../src/gazetteer-build/wikidata';
import { sparqlFetch } from '../src/gazetteer-build/sparql';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
```

2. **Remove** inline `round6()`, `parseWktPoint()`, `generateAliases()`, `sparqlFetch()`, `GazetteerNode` definitions

3. **Note:** Each script's `sparqlFetch()` maps bindings to a script-specific `WikidataRow` type. The shared `sparqlFetch<T>()` returns raw bindings — scripts do the mapping after:
```typescript
// Before:
const rows = await sparqlFetch(query);
// rows is WikidataRow[]

// After:
const bindings = await sparqlFetch<Record<string, { value: string }>>(query);
const rows: WikidataRow[] = bindings.map(b => ({
  item: b.item?.value ?? '',
  itemLabel: b.itemLabel?.value ?? '',
  coord: b.coord?.value ?? '',
  kommunLabel: b.kommunLabel?.value ?? '',
  countyLabel: b.countyLabel?.value ?? '',
  altLabels: b.altLabels?.value ?? '',
}));
```

4. **Pass suffixRegex to generateAliases:** Each script has a different `PARISH_SUFFIXES` regex. Pass it as the third argument:
```typescript
// Before:
const aliases = generateAliases(name, altLabels);
// After:
const aliases = generateAliases(name, altLabels, PARISH_SUFFIXES);
```

- [ ] **Step 2: Run lint to verify**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: Commit**

```
refactor: Wikidata build scripts import from gazetteer-build
```

---

## Task 10: Update build scripts — Boundary + Language + World scripts

**Files:**
- Modify: `scripts/build-world.ts`
- Modify: `scripts/build-world-boundaries.ts`
- Modify: `scripts/build-sv-boundaries.ts`
- Modify: `scripts/build-dk-boundaries.ts`
- Modify: `scripts/build-no-boundaries.ts`
- Modify: `scripts/build-fi-boundaries.ts`
- Modify: `scripts/build-is-boundaries.ts`
- Modify: `scripts/build-us-boundaries.ts`
- Modify: `scripts/build-ca-boundaries.ts`
- Modify: `scripts/build-lang-sv-geonames.ts`
- Modify: `scripts/build-lang-sv-wikidata.ts`

- [ ] **Step 1: Update boundary scripts**

For boundary scripts (`build-world-boundaries.ts`, `build-us-boundaries.ts`, etc.):

1. **Add imports:**
```typescript
import { computeCentroid, round4, round6 } from '../src/gazetteer-build/geo';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
```

2. **Remove** inline `computeCentroid()`, `GazetteerNode`, `Gazetteer` type definitions

3. Keep script-specific types (`GeoJSONFeature`, `GeoJSONCollection`), download logic, and metadata.

- [ ] **Step 2: Update language scripts**

For `build-lang-sv-geonames.ts` and `build-lang-sv-wikidata.ts`:

1. **Add imports:**
```typescript
import { sparqlFetch, sleep } from '../src/gazetteer-build/sparql';
```

2. **Remove** inline `sparqlFetch()` and `sleep()`

3. Keep script-specific logic: SPARQL queries, name matching, translation map building.

- [ ] **Step 3: Update world script**

For `build-world.ts`:

1. **Add imports:**
```typescript
import { round6, weightedCentroid, avgCoordinates } from '../src/gazetteer-build/geo';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
```

2. **Remove** inline `round6()`, `weightedCentroid()`, `GazetteerNode`

3. Adapt: The script's `weightedCentroid(cities)` takes `CityRow[]` with `.population`. Map to the shared interface:
```typescript
// Before:
weightedCentroid(cities)
// After:
weightedCentroid(cities.map(c => ({ lat: c.lat, lon: c.lon, weight: c.population })))
```

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 5: Commit**

```
refactor: boundary, language, and world build scripts import from gazetteer-build
```

---

## Task 11: Final verification + coverage check

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 2: Run coverage report**

Run: `npm test -- --coverage`
Expected:
- `gazetteers.ts` > 90%
- `gazetteer-build/geo.ts` > 95%
- `gazetteer-build/geonames.ts` > 95%
- `gazetteer-build/wikidata.ts` > 95%
- `gazetteer-build/tree.ts` > 95%
- All files in `src/api/` still above 80% aggregate

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 4: Update CLAUDE.md file map**

Add `src/gazetteer-build/` to the file map in CLAUDE.md:
```
src/
├── gazetteer-build/              # Shared utilities for gazetteer build scripts
│   ├── geo.ts                    # Coordinate rounding, centroid, averaging
│   ├── sparql.ts                 # Wikidata SPARQL fetch, retry, sleep
│   ├── geonames.ts               # GeoNames TSV parsing, dedup
│   ├── wikidata.ts               # WKT parsing, alias generation
│   ├── tree.ts                   # Tree node counting, walking, stats
│   ├── io.ts                     # File write helper, DATA_DIR constant
│   └── index.ts                  # Barrel re-export
```

- [ ] **Step 5: Update docs/PLAN.md implementation status**

Add row:
```
| v0.104.0 | Gazetteer build module extraction + gazetteers.ts test coverage | [spec](superpowers/specs/2026-04-18-gazetteer-build-extraction-design.md) |
```

- [ ] **Step 6: Bump version to 0.104.0 in package.json**

- [ ] **Step 7: Final commit**

```
feat: extract gazetteer build utilities into shared module with full test coverage

Moves duplicated utility code from 20 build scripts into src/gazetteer-build/.
Adds comprehensive tests for gazetteers.ts CRUD (4.9% → >90% coverage).
New shared module: geo, geonames, wikidata, tree, sparql, io.
```
