# Boundary Gazetteer Overlay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add boundary gazetteer support so clicking a map pin shows the place's geographic extent as a polygon outline.

**Architecture:** Extend the existing Gazetteer type system with a `kind` discriminator (`point` | `boundary`) and optional `geometry` field on nodes. Add `resolveBoundary()` function that reuses the existing tree-matching logic. The MapView renders matched polygons as a Leaflet GeoJSON layer. The GazetteersView shows a kind badge. No new IPC channels, MCP tools, or DB migrations needed.

**Tech Stack:** TypeScript, Vue 3, Leaflet (via @vue-leaflet/vue-leaflet), Vitest

**Spec:** `docs/plans/2026-04-13-boundary-gazetteer-design.md`

---

### Task 1: Extend GazetteerNode and Gazetteer types

**Files:**
- Modify: `src/api/place-gazetteers/types.ts`

- [ ] **Step 1: Add GeoJSON geometry types and extend GazetteerNode**

Add a `geometry` field to `GazetteerNode` and a `kind` field to `Gazetteer`. Also add `GazetteerInfo.kind`. Use inline GeoJSON types to avoid adding a dependency.

In `src/api/place-gazetteers/types.ts`, add before the `GazetteerNode` interface:

```typescript
export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export type GazetteerGeometry = GeoJSONPolygon | GeoJSONMultiPolygon;
```

Add to `GazetteerNode`:
```typescript
  geometry?: GazetteerGeometry;
```

Add to `Gazetteer`:
```typescript
  kind?: 'point' | 'boundary';
```

Add to `GazetteerInfo`:
```typescript
  kind?: 'point' | 'boundary';
```

- [ ] **Step 2: Add BoundaryResolveResult type**

Add after `PlaceResolveResult` in `types.ts`:

```typescript
export interface BoundaryResolveResult {
  geometry: GazetteerGeometry;
  matchedPath: string[];
  matchQuality: 'exact' | 'partial' | 'ambiguous';
  nodeType: string;
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit src/api/place-gazetteers/types.ts`
Expected: No errors (the new types are additive and optional, so all existing code remains valid).

- [ ] **Step 4: Commit**

```bash
git add src/api/place-gazetteers/types.ts
git commit -m "feat: add boundary gazetteer types (kind, geometry, BoundaryResolveResult)"
```

---

### Task 2: Implement resolveBoundary()

**Files:**
- Modify: `src/api/place-gazetteers/resolver.ts`
- Modify: `tests/unit/place-gazetteers.test.ts`

- [ ] **Step 1: Write failing tests for resolveBoundary**

Add to `tests/unit/place-gazetteers.test.ts`:

```typescript
import { resolvePlace, resolveBoundary } from '../../src/api/place-gazetteers/resolver';
import type { Gazetteer, GazetteerConfig, GazetteerGeometry } from '../../src/api/place-gazetteers/types';

const boundaryGazetteer: Gazetteer = {
  id: 'sv-boundaries',
  name: 'Swedish Parish Boundaries',
  locale: 'sv',
  kind: 'boundary',
  root: {
    name: 'Sverige',
    type: 'country',
    lat: 62.0,
    lon: 15.0,
    children: [
      {
        name: 'Jönköpings län',
        type: 'county',
        lat: 57.78,
        lon: 14.16,
        children: [
          {
            name: 'Sävsjö',
            type: 'municipality',
            lat: 57.40,
            lon: 14.66,
            children: [
              {
                name: 'Vallsjö',
                type: 'parish',
                lat: 57.42,
                lon: 14.72,
                geometry: {
                  type: 'Polygon',
                  coordinates: [[[14.6, 57.3], [14.8, 57.3], [14.8, 57.5], [14.6, 57.5], [14.6, 57.3]]],
                },
              },
            ],
          },
        ],
      },
    ],
  },
};

describe('resolveBoundary', () => {
  it('returns null for empty string', () => {
    expect(resolveBoundary('', [boundaryGazetteer])).toBeNull();
  });

  it('returns null when no boundary gazetteers provided', () => {
    expect(resolveBoundary('Vallsjö, Sverige', [svGazetteer])).toBeNull();
  });

  it('returns null for empty gazetteers array', () => {
    expect(resolveBoundary('Vallsjö, Sverige', [])).toBeNull();
  });

  it('resolves boundary for exact parish match', () => {
    const result = resolveBoundary('Vallsjö, Sävsjö, Jönköpings län, Sverige', [boundaryGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.nodeType).toBe('parish');
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län', 'Sävsjö', 'Vallsjö']);
    expect(result!.geometry.type).toBe('Polygon');
    expect(result!.geometry.coordinates).toHaveLength(1);
  });

  it('returns null when matched node has no geometry', () => {
    const result = resolveBoundary('Jönköpings län, Sverige', [boundaryGazetteer]);
    expect(result).toBeNull();
  });

  it('resolves boundary with partial match (parish + country)', () => {
    const result = resolveBoundary('Vallsjö, Sverige', [boundaryGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.geometry.type).toBe('Polygon');
    expect(result!.nodeType).toBe('parish');
  });

  it('filters out point gazetteers from mixed array', () => {
    const result = resolveBoundary('Vallsjö, Sverige', [svGazetteer, boundaryGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.geometry.type).toBe('Polygon');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/place-gazetteers.test.ts`
Expected: FAIL — `resolveBoundary` is not exported from resolver.

- [ ] **Step 3: Implement resolveBoundary**

The existing `resolvePlace` uses internal helpers `findMatches`, `pickBest`, and `normalize` which are already factored out as standalone functions. `resolveBoundary` reuses them directly — no refactoring needed.

Add to `src/api/place-gazetteers/resolver.ts`, after the `resolvePlace` function:

```typescript
import type { Gazetteer, GazetteerNode, PlaceResolveResult, BoundaryResolveResult } from './types';

export function resolveBoundary(
  placeName: string,
  gazetteers: Gazetteer[],
): BoundaryResolveResult | null {
  if (!placeName.trim() || gazetteers.length === 0) return null;

  const boundaryGazetteers = gazetteers.filter(g => g.kind === 'boundary');
  if (boundaryGazetteers.length === 0) return null;

  const components = placeName.split(',').map(p => p.trim()).filter(Boolean);
  if (components.length === 0) return null;

  let bestOverall: { candidate: MatchCandidate; ambiguous: boolean } | null = null;

  for (const gaz of boundaryGazetteers) {
    const candidates = findMatches(components, gaz.root, []);
    const picked = pickBest(candidates);
    if (!picked) continue;

    if (
      !bestOverall ||
      picked.best.unmatched.length < bestOverall.candidate.unmatched.length ||
      (picked.best.unmatched.length === bestOverall.candidate.unmatched.length &&
        picked.best.depth > bestOverall.candidate.depth)
    ) {
      bestOverall = { candidate: picked.best, ambiguous: picked.ambiguous };
    }
  }

  if (!bestOverall) return null;

  const { candidate, ambiguous } = bestOverall;
  const deepestNode = candidate.path[candidate.path.length - 1];

  if (!deepestNode.geometry) return null;

  const isLeaf = !deepestNode.children || deepestNode.children.length === 0;
  let matchQuality: BoundaryResolveResult['matchQuality'];
  if (ambiguous) {
    matchQuality = 'ambiguous';
  } else if (candidate.unmatched.length === 0 && isLeaf) {
    matchQuality = 'exact';
  } else {
    matchQuality = 'partial';
  }

  return {
    geometry: deepestNode.geometry,
    matchedPath: candidate.matched,
    matchQuality,
    nodeType: deepestNode.type,
  };
}
```

Update the import line at the top of `resolver.ts` to include `BoundaryResolveResult`:
```typescript
import type { Gazetteer, GazetteerNode, PlaceResolveResult, BoundaryResolveResult } from './types';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/place-gazetteers.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/place-gazetteers/resolver.ts tests/unit/place-gazetteers.test.ts
git commit -m "feat: add resolveBoundary() for boundary gazetteer polygon lookup"
```

---

### Task 3: Extend gazetteer validation and schema

**Files:**
- Modify: `src/api/gazetteers.ts`
- Modify: `tests/unit/gazetteers.test.ts` (if it exists, otherwise `tests/unit/place-gazetteers.test.ts`)

- [ ] **Step 1: Write failing tests for geometry validation and kind field**

Add to `tests/unit/place-gazetteers.test.ts` (or the gazetteers test file):

```typescript
import { importGazetteer, getGazetteerSchema } from '../../src/api/gazetteers';

describe('importGazetteer with boundary kind', () => {
  // This test needs a real DB — use createTestDb if available, otherwise skip
  // The key thing to test is that the schema accepts kind and geometry fields
});

describe('getGazetteerSchema', () => {
  it('includes kind field in schema', () => {
    const schema = getGazetteerSchema() as Record<string, any>;
    expect(schema.properties.kind).toBeDefined();
    expect(schema.properties.kind.enum).toEqual(['point', 'boundary']);
  });

  it('includes geometry field in GazetteerNode definition', () => {
    const schema = getGazetteerSchema() as Record<string, any>;
    const nodeSchema = schema..GazetteerNode;
    expect(nodeSchema.properties.geometry).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/place-gazetteers.test.ts`
Expected: FAIL — schema does not include `kind` or `geometry`.

- [ ] **Step 3: Extend getGazetteerSchema()**

In `src/api/gazetteers.ts`, update `getGazetteerSchema()`:

Add to the top-level `properties` object (after `description`):
```typescript
      kind: {
        type: 'string',
        enum: ['point', 'boundary'],
        description: 'Gazetteer kind: point (default) for coordinate lookups, boundary for polygon overlays',
      },
```

Add to the `GazetteerNode` `` properties (after `children`):
```typescript
          geometry: {
            type: 'object',
            description: 'GeoJSON Polygon or MultiPolygon geometry for boundary gazetteers',
            required: ['type', 'coordinates'],
            properties: {
              type: { type: 'string', enum: ['Polygon', 'MultiPolygon'] },
              coordinates: { type: 'array' },
            },
          },
```

- [ ] **Step 4: Extend validateNode() to accept geometry**

In `src/api/gazetteers.ts`, add geometry validation to `validateNode()` after the `children` check:

```typescript
  if (n.geometry !== undefined) {
    if (!n.geometry || typeof n.geometry !== 'object') {
      throw new Error(`Invalid node at ${path}: "geometry" must be an object`);
    }
    const geo = n.geometry as Record<string, unknown>;
    if (geo.type !== 'Polygon' && geo.type !== 'MultiPolygon') {
      throw new Error(`Invalid node at ${path}: geometry.type must be "Polygon" or "MultiPolygon"`);
    }
    if (!Array.isArray(geo.coordinates)) {
      throw new Error(`Invalid node at ${path}: geometry.coordinates must be an array`);
    }
  }
```

- [ ] **Step 5: Extend validateGazetteer() to accept kind**

In `src/api/gazetteers.ts`, add kind validation to `validateGazetteer()` after the locale check:

```typescript
  if (g.kind !== undefined && g.kind !== 'point' && g.kind !== 'boundary') {
    throw new Error('Field "kind" must be "point" or "boundary"');
  }
```

- [ ] **Step 6: Update listGazetteers to include kind**

In `src/api/gazetteers.ts`, update the `listGazetteers` function to include `kind` in both bundled and imported results.

For bundled gazetteers, add `kind: g.kind` (will be undefined for existing ones, which is fine — UI treats missing kind as `'point'`).

For imported gazetteers, parse the `data` JSON to extract `kind`. Since we already store full JSON, update the imported mapping:

Change the imported query to also select `data`:
```typescript
  const rows = queryAll<GazetteerRow & { data: string }>(db,
    'SELECT id, name, locale, description, source_json, data FROM gazetteers ORDER BY created_at');
```

Then in the mapping, extract kind:
```typescript
  const imported = rows.map((row): GazetteerInfo => {
    let kind: 'point' | 'boundary' | undefined;
    try {
      const parsed = JSON.parse(row.data);
      kind = parsed.kind;
    } catch { /* ignore */ }
    return {
      id: row.id,
      name: row.name,
      locale: row.locale,
      description: row.description ?? undefined,
      source: row.source_json ? (JSON.parse(row.source_json) as GazetteerSource) : undefined,
      bundled: false,
      kind,
    };
  });
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/place-gazetteers.test.ts`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/api/gazetteers.ts tests/unit/place-gazetteers.test.ts
git commit -m "feat: extend gazetteer schema and validation for boundary kind + geometry"
```

---

### Task 4: Add resolveBoundary to usePlaceResolver composable

**Files:**
- Modify: `src/renderer/composables/usePlaceResolver.ts`

- [ ] **Step 1: Add lazy-loaded boundary gazetteers and resolveBoundary method**

The composable currently caches point gazetteers eagerly. For boundary gazetteers, we load them lazily on first `resolveBoundary` call.

Update `src/renderer/composables/usePlaceResolver.ts`:

Add import:
```typescript
import { resolvePlace, resolveBoundary as resolveBoundaryFn } from '../../api/place-gazetteers/resolver';
import type { Gazetteer, GazetteerConfig, PlaceResolveResult, BoundaryResolveResult } from '../../api/place-gazetteers/types';
```

Add module-level state for boundary gazetteers (alongside existing cache/gazetteersRef):
```typescript
const boundaryCache = new Map<string, BoundaryResolveResult | null>();
let boundaryGazetteersRef: Gazetteer[] = [];
let boundaryLoaded = false;
```

Inside the `usePlaceResolver()` function, add:
```typescript
  async function ensureBoundaryLoaded() {
    if (boundaryLoaded) return;
    const imported = (await window.api.gazetteers.getImported()) as Gazetteer[];
    boundaryGazetteersRef = imported.filter(g => g.kind === 'boundary');
    boundaryLoaded = true;
  }

  async function resolveBoundary(placeName: string): Promise<BoundaryResolveResult | null> {
    await ensureBoundaryLoaded();
    if (boundaryGazetteersRef.length === 0) return null;
    if (boundaryCache.has(placeName)) return boundaryCache.get(placeName)!;
    const result = resolveBoundaryFn(placeName, boundaryGazetteersRef);
    boundaryCache.set(placeName, result);
    return result;
  }
```

Update the `invalidate()` function to also clear boundary state:
```typescript
  function invalidate() {
    cache.clear();
    boundaryCache.clear();
    configLoaded = false;
    boundaryLoaded = false;
    ready.value = false;
  }
```

Update the return:
```typescript
  return { ready, ensureLoaded, resolve, resolveBoundary, invalidate, getGazetteers };
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/composables/usePlaceResolver.ts
git commit -m "feat: add resolveBoundary to usePlaceResolver composable (lazy-loaded)"
```

---

### Task 5: Render boundary overlay in MapView

**Files:**
- Modify: `src/renderer/views/MapView.vue`

- [ ] **Step 1: Add boundary GeoJSON layer to MapView**

In `src/renderer/views/MapView.vue`, import the Leaflet GeoJSON component and add the boundary layer.

Update imports in the `<script setup>` block:
```typescript
import { LMarker, LPopup, LGeoJson } from '@vue-leaflet/vue-leaflet';
```

Update the `usePlaceResolver` destructure:
```typescript
const { ready: resolverReady, ensureLoaded, resolve, resolveBoundary } = usePlaceResolver();
```

Add reactive state for the boundary:
```typescript
import type { PlaceResolveResult, BoundaryResolveResult } from '../../api/place-gazetteers/types';

const boundaryGeojson = ref<Record<string, unknown> | null>(null);

const boundaryStyle = {
  color: '#4a90d9',
  weight: 2,
  fill: false,
};
```

Add a watcher on `selectedPlaceId` that resolves the boundary:
```typescript
watch(selectedPlaceId, async (id) => {
  if (!id) {
    boundaryGeojson.value = null;
    return;
  }
  const place = allDisplayPlaces.value.find(p => p.id === id);
  if (!place) {
    boundaryGeojson.value = null;
    return;
  }
  const result = await resolveBoundary(place.name);
  if (result) {
    boundaryGeojson.value = {
      type: 'Feature',
      properties: {},
      geometry: result.geometry,
    };
  } else {
    boundaryGeojson.value = null;
  }
});
```

- [ ] **Step 2: Add LGeoJson to template**

In the `<template>`, inside the `<BaseMap>` component (after the `LMarker` loop), add:

```html
          <LGeoJson
            v-if="boundaryGeojson"
            :key="selectedPlaceId"
            :geojson="boundaryGeojson"
            :options-style="boundaryStyle"
          />
```

- [ ] **Step 3: Clear boundary when panel closes**

Update `closePanel()`:
```typescript
function closePanel() {
  panelOpen.value = false;
  localStorage.setItem('map-panel-open', 'false');
  boundaryGeojson.value = null;
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/MapView.vue
git commit -m "feat: render boundary polygon overlay when place pin is clicked"
```

---

### Task 6: Add kind badge to GazetteersView

**Files:**
- Modify: `src/renderer/views/GazetteersView.vue`

- [ ] **Step 1: Add kind badge to gazetteer cards**

In `src/renderer/views/GazetteersView.vue`, update the `gazetteer-card-actions` div to include a kind badge before the bundled/imported badge.

In the template, inside `.gazetteer-card-actions`, add before the existing type-badge span:
```html
              <span :class="['kind-badge', 'kind-' + (gaz.kind || 'point')]">
                {{ gaz.kind === 'boundary' ? ('gazetteers.kindBoundary') : ('gazetteers.kindPoint') }}
              </span>
```

- [ ] **Step 2: Add scoped styles for kind badges**

Add to the `<style scoped>` section:
```css
.kind-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: var(--font-xs);
  font-weight: 500;
}

.kind-point {
  background: #e0f2fe;
  color: #0369a1;
}

.kind-boundary {
  background: #fce7f3;
  color: #9d174d;
}
```

- [ ] **Step 3: Add i18n keys**

Add to the English and Swedish locale files under the `gazetteers` namespace:

English:
```
gazetteers.kindPoint: "Point"
gazetteers.kindBoundary: "Boundary"
```

Swedish:
```
gazetteers.kindPoint: "Punkt"
gazetteers.kindBoundary: "Gräns"
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/GazetteersView.vue src/renderer/i18n/
git commit -m "feat: show Point/Boundary kind badge on gazetteer cards"
```

---

### Task 7: Re-export resolveBoundary from barrel and update tests

**Files:**
- Modify: `src/api/place-gazetteers/index.ts` (if needed for barrel export)
- Run: full test suite

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS (existing tests unaffected, new tests pass).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Commit any fixes**

If lint or tests revealed issues, fix and commit:
```bash
git add -A
git commit -m "fix: address lint/test issues from boundary gazetteer feature"
```

---

### Task 8: Manual verification

- [ ] **Step 1: Start the app**

Run: `npm start`

- [ ] **Step 2: Verify GazetteersView shows kind badges**

Navigate to the Gazetteers page. All existing gazetteers should show a "Point" badge. Import a boundary gazetteer JSON file — it should show a "Boundary" badge.

- [ ] **Step 3: Verify MapView boundary rendering**

Navigate to the Map page. Click a place pin. If a boundary gazetteer is enabled and has geometry for that place, a blue outline polygon should appear on the map. Click a different pin — the previous polygon should be replaced. Close the panel — the polygon should disappear.

- [ ] **Step 4: Verify edge cases**

- Click a place with no boundary match → no polygon, no error
- Disable all boundary gazetteers → no polygons ever shown
- Test with no boundary gazetteers imported at all → no errors

---

### Task 9: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/PLAN.md`

- [ ] **Step 1: Update CLAUDE.md**

Add `geometry?: GazetteerGeometry` to the `GazetteerNode` description.
Add `kind?: 'point' | 'boundary'` to the `Gazetteer` description.
Add `resolveBoundary` to the resolver function list.
Mention boundary rendering in MapView description.

- [ ] **Step 2: Update docs/PLAN.md**

Mark boundary gazetteer overlay as completed, reference the spec and plan files.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/PLAN.md
git commit -m "docs: update CLAUDE.md and PLAN.md for boundary gazetteer feature"
```
