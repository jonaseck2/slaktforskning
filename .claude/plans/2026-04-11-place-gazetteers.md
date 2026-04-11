# Place Gazetteers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a render-time place resolution system using bundled hierarchical gazetteers, starting with Swedish parishes.

**Architecture:** Pure resolver in `src/api/place-gazetteers/` matches place names against hierarchical JSON trees. No DB writes — coordinates are resolved at display time only. Config stored in `db_settings` per database. UI follows the LinkRulesView pattern.

**Tech Stack:** TypeScript, Vitest, Vue 3 + Leaflet, existing db_settings infrastructure

**Spec:** `docs/superpowers/specs/2026-04-11-place-gazetteers-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/api/place-gazetteers/types.ts` | GazetteerNode, Gazetteer, PlaceResolveResult, GazetteerConfig types |
| `src/api/place-gazetteers/resolver.ts` | `resolvePlace()` — parse place string, walk tree, return match with quality |
| `src/api/place-gazetteers/index.ts` | `loadGazetteers()` — load + filter enabled gazetteers from config |
| `src/api/place-gazetteers/data/sv-parishes.json` | Bundled Swedish parish gazetteer (~50 sample parishes for first iteration) |
| `tests/unit/place-gazetteers.test.ts` | Unit tests for resolver |
| `src/renderer/views/GazetteersView.vue` | Settings UI — toggle gazetteers on/off, test lookup |
| `src/renderer/composables/usePlaceResolver.ts` | Vue composable — loads config + gazetteers, exposes `resolve(placeName)` with cache |

### Modified Files
| File | Change |
|------|--------|
| `src/renderer/router.ts` | Add `/gazetteers` route |
| `src/renderer/App.vue` | Add Gazetteers nav link in sidebar |
| `src/renderer/views/MapView.vue` | Use resolver for places without coordinates |
| `src/renderer/components/PersonMap.vue` | Use resolver for places without coordinates |
| `src/renderer/views/PlaceDetailView.vue` | Show gazetteer match section |
| `src/import/genney/index.ts` | Set `gazetteer_config` in db_settings after import |
| `src/renderer/locales/en.ts` | Add gazetteer i18n keys |
| `src/renderer/locales/sv.ts` | Add gazetteer i18n keys |

---

## Task 1: Types and Resolver Core

**Files:**
- Create: `src/api/place-gazetteers/types.ts`
- Create: `src/api/place-gazetteers/resolver.ts`
- Test: `tests/unit/place-gazetteers.test.ts`

- [ ] **Step 1: Create types file**

Create `src/api/place-gazetteers/types.ts`:

```typescript
export interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
}

export interface Gazetteer {
  id: string;
  name: string;
  locale: string;
  root: GazetteerNode;
}

export interface PlaceResolveResult {
  lat: number;
  lon: number;
  matchedPath: string[];
  matchDepth: number;
  treeDepth: number;
  matchQuality: 'exact' | 'partial' | 'ambiguous';
  matchedNode: GazetteerNode;
  gazetteer: string;
  unmatchedComponents: string[];
}

export interface GazetteerConfig {
  enabledGazetteers: string[];
}
```

- [ ] **Step 2: Write failing tests for resolver**

Create `tests/unit/place-gazetteers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolvePlace } from '../../src/api/place-gazetteers/resolver';
import type { Gazetteer } from '../../src/api/place-gazetteers/types';

const svGazetteer: Gazetteer = {
  id: 'sv-parishes',
  name: 'Swedish Parishes',
  locale: 'sv',
  root: {
    name: 'Sverige',
    type: 'country',
    lat: 62.0,
    lon: 15.0,
    children: [
      {
        name: 'Jönköpings län',
        type: 'county',
        aliases: ['Jönköping'],
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
                aliases: ['Wallsjö', 'Vallsjö församling'],
                lat: 57.42,
                lon: 14.72,
              },
            ],
          },
        ],
      },
      {
        name: 'Kronobergs län',
        type: 'county',
        lat: 56.88,
        lon: 14.81,
        children: [
          {
            name: 'Växjö',
            type: 'municipality',
            lat: 56.88,
            lon: 14.81,
            children: [
              {
                name: 'Växjö',
                type: 'parish',
                lat: 56.88,
                lon: 14.81,
              },
            ],
          },
        ],
      },
    ],
  },
};

describe('resolvePlace', () => {
  it('returns null for empty string', () => {
    expect(resolvePlace('', [svGazetteer])).toBeNull();
  });

  it('matches a full 4-level Swedish place string (exact)', () => {
    const result = resolvePlace('Vallsjö, Sävsjö, Jönköpings län, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län', 'Sävsjö', 'Vallsjö']);
    expect(result!.lat).toBe(57.42);
    expect(result!.lon).toBe(14.72);
    expect(result!.matchDepth).toBe(4);
    expect(result!.treeDepth).toBe(4);
    expect(result!.unmatchedComponents).toEqual([]);
    expect(result!.gazetteer).toBe('sv-parishes');
  });

  it('matches via alias (Wallsjö)', () => {
    const result = resolvePlace('Wallsjö, Sävsjö, Jönköpings län, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län', 'Sävsjö', 'Vallsjö']);
  });

  it('matches county alias (Jönköping instead of Jönköpings län)', () => {
    const result = resolvePlace('Vallsjö, Sävsjö, Jönköping, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
  });

  it('returns partial match when only county + country match', () => {
    const result = resolvePlace('Okänd socken, Jönköpings län, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('partial');
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län']);
    expect(result!.lat).toBe(57.78);
    expect(result!.lon).toBe(14.16);
    expect(result!.unmatchedComponents).toEqual(['Okänd socken']);
  });

  it('returns partial match for country-only match', () => {
    const result = resolvePlace('Ingenstans, Okänt, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('partial');
    expect(result!.matchedPath).toEqual(['Sverige']);
    expect(result!.unmatchedComponents).toEqual(['Ingenstans', 'Okänt']);
  });

  it('returns null when nothing matches', () => {
    expect(resolvePlace('London, England', [svGazetteer])).toBeNull();
  });

  it('handles reversed order (parish first, country last)', () => {
    const result = resolvePlace('Vallsjö, Sävsjö, Jönköpings län, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
  });

  it('handles suffix stripping (Vallsjö församling)', () => {
    const result = resolvePlace('Vallsjö församling, Sävsjö, Jönköpings län, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
  });

  it('returns null for empty gazetteers array', () => {
    expect(resolvePlace('Vallsjö, Sverige', [])).toBeNull();
  });

  it('matches when components are a subset (parish + country, skip middle)', () => {
    const result = resolvePlace('Vallsjö, Sverige', [svGazetteer]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('exact');
    expect(result!.matchedPath).toEqual(['Sverige', 'Jönköpings län', 'Sävsjö', 'Vallsjö']);
  });

  it('reports ambiguous when same name exists in multiple branches', () => {
    // Växjö appears as both municipality and parish
    const gazetteerWithDup: Gazetteer = {
      ...svGazetteer,
      root: {
        ...svGazetteer.root,
        children: [
          ...svGazetteer.root.children!,
          {
            name: 'Testläns län',
            type: 'county',
            lat: 58.0,
            lon: 15.0,
            children: [{
              name: 'Vallsjö',
              type: 'parish',
              lat: 58.1,
              lon: 15.1,
            }],
          },
        ],
      },
    };
    // Without disambiguation, "Vallsjö, Sverige" matches two parishes
    const result = resolvePlace('Vallsjö, Sverige', [gazetteerWithDup]);
    expect(result).not.toBeNull();
    expect(result!.matchQuality).toBe('ambiguous');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/place-gazetteers.test.ts`
Expected: FAIL — `resolvePlace` not found

- [ ] **Step 4: Implement resolver**

Create `src/api/place-gazetteers/resolver.ts`:

```typescript
import type { Gazetteer, GazetteerNode, PlaceResolveResult } from './types';

function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*(församling|socken|kommun|stad|härad|län)$/i, '');
}

function nodeMatches(node: GazetteerNode, component: string): boolean {
  const norm = normalize(component);
  if (normalize(node.name) === norm) return true;
  return node.aliases?.some(a => normalize(a) === norm) ?? false;
}

function getTreeDepth(node: GazetteerNode): number {
  if (!node.children || node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(getTreeDepth));
}

interface MatchCandidate {
  path: GazetteerNode[];
  matched: string[];
  unmatched: string[];
  depth: number;
  treeDepth: number;
}

/**
 * Recursively search the tree for the best match.
 * components: normalized input parts to match against
 * node: current gazetteer node
 * path: accumulated path from root to current node
 */
function findMatches(
  components: string[],
  node: GazetteerNode,
  path: GazetteerNode[],
): MatchCandidate[] {
  const currentPath = [...path, node];
  const remaining = components.filter(c => !nodeMatches(node, c));
  const matchedHere = components.length - remaining.length;

  const candidates: MatchCandidate[] = [];

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      candidates.push(...findMatches(remaining, child, currentPath));
    }
  }

  // Also consider stopping at this node (partial match)
  if (matchedHere > 0) {
    candidates.push({
      path: currentPath,
      matched: currentPath.map(n => n.name),
      unmatched: remaining,
      depth: currentPath.length,
      treeDepth: getTreeDepth(node) + currentPath.length - 1,
    });
  }

  return candidates;
}

function pickBest(candidates: MatchCandidate[]): { best: MatchCandidate; ambiguous: boolean } | null {
  if (candidates.length === 0) return null;

  // Sort: fewer unmatched first, then deeper match first
  candidates.sort((a, b) => {
    if (a.unmatched.length !== b.unmatched.length) return a.unmatched.length - b.unmatched.length;
    return b.depth - a.depth;
  });

  const best = candidates[0];

  // Check ambiguity: multiple candidates with same depth and unmatched count
  const tied = candidates.filter(
    c => c.unmatched.length === best.unmatched.length && c.depth === best.depth
  );
  return { best, ambiguous: tied.length > 1 };
}

export function resolvePlace(
  placeName: string,
  gazetteers: Gazetteer[],
): PlaceResolveResult | null {
  if (!placeName.trim() || gazetteers.length === 0) return null;

  const components = placeName.split(',').map(p => p.trim()).filter(Boolean);
  if (components.length === 0) return null;

  let bestOverall: { candidate: MatchCandidate; ambiguous: boolean; gazId: string } | null = null;

  for (const gaz of gazetteers) {
    const candidates = findMatches(components, gaz.root, []);
    const picked = pickBest(candidates);
    if (!picked) continue;

    if (
      !bestOverall ||
      picked.best.unmatched.length < bestOverall.candidate.unmatched.length ||
      (picked.best.unmatched.length === bestOverall.candidate.unmatched.length &&
        picked.best.depth > bestOverall.candidate.depth)
    ) {
      bestOverall = { candidate: picked.best, ambiguous: picked.ambiguous, gazId: gaz.id };
    }
  }

  if (!bestOverall) return null;

  const { candidate, ambiguous, gazId } = bestOverall;
  const deepestNode = candidate.path[candidate.path.length - 1];
  const isLeaf = !deepestNode.children || deepestNode.children.length === 0;

  let matchQuality: PlaceResolveResult['matchQuality'];
  if (ambiguous) {
    matchQuality = 'ambiguous';
  } else if (candidate.unmatched.length === 0 && isLeaf) {
    matchQuality = 'exact';
  } else {
    matchQuality = 'partial';
  }

  return {
    lat: deepestNode.lat,
    lon: deepestNode.lon,
    matchedPath: candidate.matched,
    matchDepth: candidate.depth,
    treeDepth: candidate.treeDepth,
    matchQuality,
    matchedNode: deepestNode,
    gazetteer: gazId,
    unmatchedComponents: candidate.unmatched,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/place-gazetteers.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/api/place-gazetteers/types.ts src/api/place-gazetteers/resolver.ts tests/unit/place-gazetteers.test.ts
git commit -m "feat: place gazetteer resolver with match quality"
```

---

## Task 2: Gazetteer Loader and Swedish Data

**Files:**
- Create: `src/api/place-gazetteers/index.ts`
- Create: `src/api/place-gazetteers/data/sv-parishes.json`
- Test: `tests/unit/place-gazetteers.test.ts` (extend)

- [ ] **Step 1: Write failing test for loadGazetteers**

Append to `tests/unit/place-gazetteers.test.ts`:

```typescript
import { loadGazetteers, getAllGazetteers } from '../../src/api/place-gazetteers/index';
import type { GazetteerConfig } from '../../src/api/place-gazetteers/types';

describe('loadGazetteers', () => {
  it('returns empty array when no gazetteers enabled', () => {
    const config: GazetteerConfig = { enabledGazetteers: [] };
    const result = loadGazetteers(config);
    expect(result).toEqual([]);
  });

  it('returns sv-parishes when enabled', () => {
    const config: GazetteerConfig = { enabledGazetteers: ['sv-parishes'] };
    const result = loadGazetteers(config);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('sv-parishes');
    expect(result[0].root.name).toBe('Sverige');
    expect(result[0].root.children!.length).toBeGreaterThan(0);
  });

  it('getAllGazetteers returns all bundled gazetteers', () => {
    const all = getAllGazetteers();
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all.find(g => g.id === 'sv-parishes')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/place-gazetteers.test.ts`
Expected: FAIL — `loadGazetteers` not found

- [ ] **Step 3: Create Swedish parishes JSON**

Create `src/api/place-gazetteers/data/sv-parishes.json`. This is a representative sample — the full dataset will be expanded over time. Include the counties relevant to the user's Genney data:

```json
{
  "id": "sv-parishes",
  "name": "Swedish Parishes (Sockenindelningen)",
  "locale": "sv",
  "root": {
    "name": "Sverige",
    "type": "country",
    "lat": 62.0,
    "lon": 15.0,
    "children": [
      {
        "name": "Jönköpings län",
        "type": "county",
        "aliases": ["Jönköping"],
        "lat": 57.78,
        "lon": 14.16,
        "children": [
          {
            "name": "Sävsjö",
            "type": "municipality",
            "lat": 57.40,
            "lon": 14.66,
            "children": [
              {
                "name": "Vallsjö",
                "type": "parish",
                "aliases": ["Wallsjö", "Vallsjö församling"],
                "lat": 57.4017,
                "lon": 14.7153
              },
              {
                "name": "Sävsjö",
                "type": "parish",
                "aliases": ["Sävsjö församling"],
                "lat": 57.3972,
                "lon": 14.6653
              }
            ]
          },
          {
            "name": "Nässjö",
            "type": "municipality",
            "lat": 57.65,
            "lon": 14.70,
            "children": [
              {
                "name": "Nässjö",
                "type": "parish",
                "aliases": ["Nässjö församling"],
                "lat": 57.6531,
                "lon": 14.6967
              }
            ]
          }
        ]
      },
      {
        "name": "Göteborgs och Bohus län",
        "type": "county",
        "aliases": ["Göteborg", "Göteborgs och Bohus"],
        "lat": 57.71,
        "lon": 11.97,
        "children": [
          {
            "name": "Mölndal",
            "type": "municipality",
            "aliases": ["Mölndals stad"],
            "lat": 57.6554,
            "lon": 12.0134,
            "children": [
              {
                "name": "Fässberg",
                "type": "parish",
                "aliases": ["Fässbergs församling"],
                "lat": 57.6667,
                "lon": 12.0167
              }
            ]
          }
        ]
      },
      {
        "name": "Älvsborgs län",
        "type": "county",
        "aliases": ["Älvsborg", "Älvsborgs"],
        "lat": 57.93,
        "lon": 12.53,
        "children": [
          {
            "name": "Mark",
            "type": "municipality",
            "aliases": ["Marks härad"],
            "lat": 57.49,
            "lon": 12.35,
            "children": [
              {
                "name": "Örby",
                "type": "parish",
                "aliases": ["Örby församling"],
                "lat": 57.4833,
                "lon": 12.3667
              },
              {
                "name": "Kinnahult",
                "type": "parish",
                "lat": 57.50,
                "lon": 12.40
              }
            ]
          }
        ]
      },
      {
        "name": "Kronobergs län",
        "type": "county",
        "aliases": ["Kronoberg"],
        "lat": 56.88,
        "lon": 14.81,
        "children": [
          {
            "name": "Växjö",
            "type": "municipality",
            "lat": 56.8777,
            "lon": 14.8091,
            "children": [
              {
                "name": "Växjö",
                "type": "parish",
                "aliases": ["Växjö domkyrkoförsamling"],
                "lat": 56.8777,
                "lon": 14.8091
              }
            ]
          }
        ]
      },
      {
        "name": "Stockholms län",
        "type": "county",
        "aliases": ["Stockholm"],
        "lat": 59.33,
        "lon": 18.07,
        "children": [
          {
            "name": "Stockholm",
            "type": "municipality",
            "lat": 59.3293,
            "lon": 18.0686,
            "children": [
              {
                "name": "Stockholm",
                "type": "parish",
                "aliases": ["Stockholms stad"],
                "lat": 59.3293,
                "lon": 18.0686
              }
            ]
          }
        ]
      }
    ]
  }
}
```

Note: This is a starter dataset. It should be expanded by extracting parish data from OpenStreetMap or Riksarkivet. The structure supports incremental growth.

- [ ] **Step 4: Implement loadGazetteers**

Create `src/api/place-gazetteers/index.ts`:

```typescript
import type { Gazetteer, GazetteerConfig } from './types';
import svParishes from './data/sv-parishes.json';

const BUNDLED_GAZETTEERS: Gazetteer[] = [
  svParishes as Gazetteer,
];

export function getAllGazetteers(): Gazetteer[] {
  return BUNDLED_GAZETTEERS;
}

export function loadGazetteers(config: GazetteerConfig): Gazetteer[] {
  const enabled = new Set(config.enabledGazetteers);
  return BUNDLED_GAZETTEERS.filter(g => enabled.has(g.id));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/place-gazetteers.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/api/place-gazetteers/index.ts src/api/place-gazetteers/data/sv-parishes.json tests/unit/place-gazetteers.test.ts
git commit -m "feat: gazetteer loader with bundled Swedish parishes"
```

---

## Task 3: Vue Composable for Place Resolution

**Files:**
- Create: `src/renderer/composables/usePlaceResolver.ts`

- [ ] **Step 1: Create the composable**

Create `src/renderer/composables/usePlaceResolver.ts`:

```typescript
import { ref, type Ref } from 'vue';
import { resolvePlace } from '../../api/place-gazetteers/resolver';
import { loadGazetteers } from '../../api/place-gazetteers/index';
import type { Gazetteer, GazetteerConfig, PlaceResolveResult } from '../../api/place-gazetteers/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const cache = new Map<string, PlaceResolveResult | null>();
let gazetteersRef: Gazetteer[] = [];
let configLoaded = false;

export function usePlaceResolver() {
  const ready = ref(false);

  async function ensureLoaded() {
    if (configLoaded) { ready.value = true; return; }
    const raw = (await window.api.db.getSetting('gazetteer_config')) as string | null;
    const config: GazetteerConfig = raw
      ? JSON.parse(raw) as GazetteerConfig
      : { enabledGazetteers: [] };
    gazetteersRef = loadGazetteers(config);
    configLoaded = true;
    ready.value = true;
  }

  function resolve(placeName: string): PlaceResolveResult | null {
    if (gazetteersRef.length === 0) return null;
    const cacheKey = placeName;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    const result = resolvePlace(placeName, gazetteersRef);
    cache.set(cacheKey, result);
    return result;
  }

  /** Call when user toggles gazetteers in settings to force reload */
  function invalidate() {
    cache.clear();
    configLoaded = false;
    ready.value = false;
  }

  return { ready, ensureLoaded, resolve, invalidate };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/composables/usePlaceResolver.ts
git commit -m "feat: usePlaceResolver composable with session cache"
```

---

## Task 4: MapView Integration

**Files:**
- Modify: `src/renderer/views/MapView.vue`

- [ ] **Step 1: Update MapView to resolve places without coordinates**

In `MapView.vue`, the current flow filters out places without coordinates (`placesWithCoords` at line 78). Change this to:

1. Load the resolver on mount
2. For places without stored coordinates, try the resolver
3. Show resolved places with a different marker style indicating match quality

Edit `src/renderer/views/MapView.vue`:

Replace the `<script setup>` section. Key changes:

After the existing imports, add:
```typescript
import { usePlaceResolver } from '../composables/usePlaceResolver';
import type { PlaceResolveResult } from '../../api/place-gazetteers/types';
```

Add the resolver setup after existing refs:
```typescript
const { ready: resolverReady, ensureLoaded, resolve } = usePlaceResolver();
```

Replace `placesWithCoords` computed with a new `allDisplayPlaces` computed that includes resolved places:
```typescript
interface DisplayPlace extends PlaceRow {
  resolved?: PlaceResolveResult;
  displayLat: number;
  displayLon: number;
}

const allDisplayPlaces = computed<DisplayPlace[]>(() => {
  return places.value
    .map(p => {
      if (p.latitude != null && p.longitude != null) {
        return { ...p, displayLat: p.latitude, displayLon: p.longitude };
      }
      if (!resolverReady.value) return null;
      const resolved = resolve(p.name);
      if (!resolved) return null;
      return { ...p, resolved, displayLat: resolved.lat, displayLon: resolved.lon };
    })
    .filter((p): p is DisplayPlace => p !== null);
});
```

Update `placesWithoutCoords` to count places that have neither stored nor resolved coordinates:
```typescript
const placesWithoutCoords = computed(() =>
  places.value.filter(p => {
    if (p.latitude != null && p.longitude != null) return false;
    if (resolverReady.value && resolve(p.name)) return false;
    return true;
  }).length
);
```

Update `filteredPlaces` to use `allDisplayPlaces`:
```typescript
const filteredPlaces = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  if (!q) return allDisplayPlaces.value;
  return allDisplayPlaces.value.filter(p => p.name.toLowerCase().includes(q));
});
```

Call `ensureLoaded()` in `onMounted`:
```typescript
onMounted(async () => {
  places.value = (await window.api.places.list()) as PlaceRow[];
  await ensureLoaded();
});
```

In the template, update marker rendering to use `displayLat`/`displayLon` and show match quality:

```html
<LMarker
  v-for="p in filteredPlaces"
  :key="p.id"
  :lat-lng="[p.displayLat, p.displayLon]"
  :opacity="p.resolved ? 0.65 : 1"
>
  <LPopup>
    <router-link :to="'/places/' + p.id" class="popup-link">{{ p.name }}</router-link>
    <div v-if="p.place_type" class="popup-type">{{ ('placeTypes.' + p.place_type) }}</div>
    <div v-if="p.resolved" class="popup-resolved">
      <span :class="'match-' + p.resolved.matchQuality">
        {{ ('gazetteers.match.' + p.resolved.matchQuality) }}
      </span>
      <span class="match-path">{{ p.resolved.matchedPath.join(' > ') }}</span>
    </div>
  </LPopup>
</LMarker>
```

Update the count label in the header:
```html
<span class="count-label">
  {{ filteredPlaces.length }} {{ ('places.title').toLowerCase() }}
</span>
```

Add scoped styles for match quality indicators:
```css
.popup-resolved {
  font-size: var(--font-xs);
  margin-top: 4px;
  border-top: 1px solid #eee;
  padding-top: 4px;
}
.match-exact { color: #22c55e; font-weight: 600; }
.match-partial { color: #f59e0b; font-weight: 600; }
.match-ambiguous { color: #ef4444; font-weight: 600; }
.match-path {
  display: block;
  color: #666;
  font-size: var(--font-xs);
}
```

- [ ] **Step 2: Verify visually**

Run: `npm start`
Navigate to /map. Places without stored coordinates that match the Swedish gazetteer should now appear as slightly transparent markers. Their popups should show the match quality and matched path.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/views/MapView.vue
git commit -m "feat: MapView resolves places via gazetteers"
```

---

## Task 5: PersonMap Integration

**Files:**
- Modify: `src/renderer/components/PersonMap.vue`

- [ ] **Step 1: Update PersonMap to use resolver**

Same pattern as MapView. In `PersonMap.vue`, the filter at line 124 skips places without coordinates. Change this to try the resolver first.

After existing imports, add:
```typescript
import { usePlaceResolver } from '../composables/usePlaceResolver';
```

After props, add:
```typescript
const { ready: resolverReady, ensureLoaded, resolve } = usePlaceResolver();
```

Update the `Marker` interface to include optional resolution info:
```typescript
interface Marker {
  lat: number;
  lon: number;
  eventType: string;
  date: string | null;
  placeName: string;
  placeId: string;
  resolved?: boolean;
  matchQuality?: string;
}
```

In the `load()` function, change the coordinate check (line 124) to try the resolver:
```typescript
if (place && place.latitude != null && place.longitude != null) {
  result.push({
    lat: place.latitude,
    lon: place.longitude,
    eventType: ev.event_type,
    date: ev.date_original || ev.date_value,
    placeName: place.name,
    placeId: place.id!,
  });
} else if (place && resolverReady.value) {
  const resolved = resolve(place.name);
  if (resolved) {
    result.push({
      lat: resolved.lat,
      lon: resolved.lon,
      eventType: ev.event_type,
      date: ev.date_original || ev.date_value,
      placeName: place.name,
      placeId: place.id!,
      resolved: true,
      matchQuality: resolved.matchQuality,
    });
  }
}
```

Call `ensureLoaded()` at the start of `load()`:
```typescript
async function load() {
  if (!props.personId) { markers.value = []; return; }
  await ensureLoaded();
  // ... rest of load
}
```

Update LCircleMarker to show resolved pins differently (dashed stroke):
```html
<LCircleMarker
  v-for="(m, idx) in markers"
  :key="idx"
  :lat-lng="[m.lat, m.lon]"
  :radius="8"
  :color="eventColor(m.eventType)"
  :fill-color="eventColor(m.eventType)"
  :fill-opacity="m.resolved ? 0.4 : 0.8"
  :dash-array="m.resolved ? '4, 4' : undefined"
>
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/PersonMap.vue
git commit -m "feat: PersonMap resolves places via gazetteers"
```

---

## Task 6: PlaceDetailView — Gazetteer Match Section

**Files:**
- Modify: `src/renderer/views/PlaceDetailView.vue`

- [ ] **Step 1: Add gazetteer match display to PlaceDetailView**

In `PlaceDetailView.vue`, add a "Gazetteer Match" section below the existing place details. This shows the resolver result for informational purposes only — non-editable.

After existing imports, add:
```typescript
import { usePlaceResolver } from '../composables/usePlaceResolver';
```

In setup, add:
```typescript
const { ready: resolverReady, ensureLoaded, resolve } = usePlaceResolver();

const gazetteerMatch = computed(() => {
  if (!resolverReady.value || !place.value) return null;
  // Only show when the place has no stored coordinates
  if (place.value.latitude != null && place.value.longitude != null) return null;
  return resolve(place.value.name);
});

// Call ensureLoaded in the existing load function
```

Add to the template, after the existing map section:
```html
<section v-if="gazetteerMatch" class="detail-section gazetteer-section">
  <h4>{{ ('gazetteers.matchTitle') }}</h4>
  <div class="gazetteer-match">
    <div class="match-quality-row">
      <span :class="'match-badge match-' + gazetteerMatch.matchQuality">
        {{ ('gazetteers.match.' + gazetteerMatch.matchQuality) }}
      </span>
      <span class="gazetteer-name">{{ gazetteerMatch.gazetteer }}</span>
    </div>
    <div class="match-path">
      {{ gazetteerMatch.matchedPath.join(' > ') }}
    </div>
    <div v-if="gazetteerMatch.unmatchedComponents.length > 0" class="unmatched">
      {{ ('gazetteers.unmatched') }}: {{ gazetteerMatch.unmatchedComponents.join(', ') }}
    </div>
    <div class="resolved-coords">
      {{ gazetteerMatch.lat.toFixed(4) }}, {{ gazetteerMatch.lon.toFixed(4) }}
    </div>
  </div>
</section>
```

Add scoped styles:
```css
.gazetteer-section {
  background: #f8f9fa;
  border: 1px dashed #dee2e6;
  border-radius: 6px;
  padding: 12px;
}
.gazetteer-match { font-size: var(--font-sm); }
.match-quality-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.match-badge {
  font-size: var(--font-xs);
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 3px;
}
.match-exact { background: #dcfce7; color: #166534; }
.match-partial { background: #fef3c7; color: #92400e; }
.match-ambiguous { background: #fee2e2; color: #991b1b; }
.gazetteer-name { color: #666; font-size: var(--font-xs); }
.match-path { color: #374151; margin-bottom: 4px; }
.unmatched { color: #9ca3af; font-size: var(--font-xs); margin-bottom: 4px; }
.resolved-coords { color: #6b7280; font-size: var(--font-xs); font-family: monospace; }
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/views/PlaceDetailView.vue
git commit -m "feat: PlaceDetailView shows gazetteer match section"
```

---

## Task 7: GazetteersView Settings Page

**Files:**
- Create: `src/renderer/views/GazetteersView.vue`
- Modify: `src/renderer/router.ts`
- Modify: `src/renderer/App.vue`

- [ ] **Step 1: Create GazetteersView**

Create `src/renderer/views/GazetteersView.vue`:

```vue
<template>
  <div class="gazetteers-view">
    <div class="header">
      <h2>{{ ('gazetteers.title') }}</h2>
    </div>

    <p class="description">{{ ('gazetteers.description') }}</p>

    <section class="detail-section">
      <h4>{{ ('gazetteers.installed') }}</h4>
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ ('gazetteers.enabled') }}</th>
            <th>{{ ('gazetteers.name') }}</th>
            <th>{{ ('gazetteers.locale') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in allGazetteers" :key="g.id">
            <td>
              <input
                type="checkbox"
                :checked="config.enabledGazetteers.includes(g.id)"
                @change="toggleGazetteer(g.id)"
              />
            </td>
            <td>{{ g.name }}</td>
            <td>{{ g.locale }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="detail-section">
      <h4>{{ ('gazetteers.testLookup') }}</h4>
      <div class="test-row">
        <input
          v-model="testInput"
          type="text"
          :placeholder="('gazetteers.testPlaceholder')"
          class="test-input"
          @input="runTest"
        />
      </div>
      <div v-if="testResult" class="test-result">
        <div class="match-quality-row">
          <span :class="'match-badge match-' + testResult.matchQuality">
            {{ ('gazetteers.match.' + testResult.matchQuality) }}
          </span>
        </div>
        <div class="match-path">{{ testResult.matchedPath.join(' > ') }}</div>
        <div v-if="testResult.unmatchedComponents.length > 0" class="unmatched">
          {{ ('gazetteers.unmatched') }}: {{ testResult.unmatchedComponents.join(', ') }}
        </div>
        <div class="resolved-coords">
          {{ testResult.lat.toFixed(4) }}, {{ testResult.lon.toFixed(4) }}
        </div>
      </div>
      <div v-else-if="testInput.trim()" class="empty-hint">
        {{ ('gazetteers.noMatch') }}
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getAllGazetteers } from '../../api/place-gazetteers/index';
import { resolvePlace } from '../../api/place-gazetteers/resolver';
import { loadGazetteers } from '../../api/place-gazetteers/index';
import type { Gazetteer, GazetteerConfig, PlaceResolveResult } from '../../api/place-gazetteers/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const allGazetteers = ref<Gazetteer[]>([]);
const config = ref<GazetteerConfig>({ enabledGazetteers: [] });
const testInput = ref('');
const testResult = ref<PlaceResolveResult | null>(null);

async function loadConfig() {
  const raw = (await window.api.db.getSetting('gazetteer_config')) as string | null;
  if (raw) config.value = JSON.parse(raw) as GazetteerConfig;
}

async function saveConfig() {
  await window.api.db.setSetting('gazetteer_config', JSON.stringify(config.value));
}

function toggleGazetteer(id: string) {
  const idx = config.value.enabledGazetteers.indexOf(id);
  if (idx >= 0) {
    config.value = {
      ...config.value,
      enabledGazetteers: config.value.enabledGazetteers.filter(g => g !== id),
    };
  } else {
    config.value = {
      ...config.value,
      enabledGazetteers: [...config.value.enabledGazetteers, id],
    };
  }
  saveConfig();
  runTest();
}

function runTest() {
  const text = testInput.value.trim();
  if (!text) { testResult.value = null; return; }
  const enabled = loadGazetteers(config.value);
  testResult.value = resolvePlace(text, enabled);
}

onMounted(async () => {
  allGazetteers.value = getAllGazetteers();
  await loadConfig();
});
</script>

<style scoped>
.description {
  font-size: var(--font-sm);
  color: #666;
  margin-bottom: 16px;
}
.test-row {
  margin-bottom: 8px;
}
.test-input {
  width: 100%;
  max-width: 500px;
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
  font-family: inherit;
}
.test-result {
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: var(--font-sm);
}
.match-quality-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.match-badge {
  font-size: var(--font-xs);
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 3px;
}
.match-exact { background: #dcfce7; color: #166534; }
.match-partial { background: #fef3c7; color: #92400e; }
.match-ambiguous { background: #fee2e2; color: #991b1b; }
.match-path { color: #374151; margin-bottom: 4px; }
.unmatched { color: #9ca3af; font-size: var(--font-xs); margin-bottom: 4px; }
.resolved-coords { color: #6b7280; font-size: var(--font-xs); font-family: monospace; }
</style>
```

- [ ] **Step 2: Add route**

In `src/renderer/router.ts`, add after the link-rules route:
```typescript
{ path: '/gazetteers', component: () => import('./views/GazetteersView.vue') },
```

- [ ] **Step 3: Add sidebar nav link**

In `src/renderer/App.vue`, add a nav link for gazetteers near the link-rules nav item. Also add the route to the `routeMap` for TTS/screen reader announcement.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/views/GazetteersView.vue src/renderer/router.ts src/renderer/App.vue
git commit -m "feat: GazetteersView settings page with test lookup"
```

---

## Task 8: i18n Keys

**Files:**
- Modify: `src/renderer/locales/en.ts`
- Modify: `src/renderer/locales/sv.ts`

- [ ] **Step 1: Add English keys**

Add to the English locale file under a new `gazetteers` namespace:
```typescript
gazetteers: {
  title: 'Gazetteers',
  description: 'Gazetteers provide coordinates and geographic context for places without stored location data. Matches are shown on maps and place detail views but never written to your database.',
  installed: 'Installed Gazetteers',
  enabled: 'Enabled',
  name: 'Name',
  locale: 'Locale',
  testLookup: 'Test Lookup',
  testPlaceholder: 'Type a place name, e.g. Vallsjö, Sävsjö, Jönköpings län, Sverige',
  noMatch: 'No match found in enabled gazetteers',
  matchTitle: 'Gazetteer Match',
  unmatched: 'Unmatched',
  match: {
    exact: 'Exact',
    partial: 'Partial',
    ambiguous: 'Ambiguous',
  },
},
```

- [ ] **Step 2: Add Swedish keys**

Add to the Swedish locale file:
```typescript
gazetteers: {
  title: 'Ortsregister',
  description: 'Ortsregister ger koordinater och geografisk kontext för platser utan lagrad platsdata. Matchningar visas på kartor och platsvyer men skrivs aldrig till din databas.',
  installed: 'Installerade ortsregister',
  enabled: 'Aktiverat',
  name: 'Namn',
  locale: 'Språk',
  testLookup: 'Testa uppslag',
  testPlaceholder: 'Skriv ett platsnamn, t.ex. Vallsjö, Sävsjö, Jönköpings län, Sverige',
  noMatch: 'Ingen matchning i aktiverade ortsregister',
  matchTitle: 'Ortsregister-matchning',
  unmatched: 'Omatchat',
  match: {
    exact: 'Exakt',
    partial: 'Delvis',
    ambiguous: 'Tvetydig',
  },
},
```

- [ ] **Step 3: Also add the nav key**

Add to both locale files in the `nav` namespace:
- English: `gazetteers: 'Gazetteers'`
- Swedish: `gazetteers: 'Ortsregister'`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/locales/en.ts src/renderer/locales/sv.ts
git commit -m "feat: i18n keys for gazetteers (en + sv)"
```

---

## Task 9: Auto-Enable on Genney Import

**Files:**
- Modify: `src/import/genney/index.ts`

- [ ] **Step 1: Set gazetteer_config after Genney import**

In `src/import/genney/index.ts`, after the `transformGenney()` call succeeds (around line 160, inside the transaction), add:

```typescript
import { getDbSetting, setDbSetting } from '../../api/db_settings';

// After successful transform, enable Swedish gazetteer
const existingConfig = getDbSetting(db, 'gazetteer_config');
if (!existingConfig) {
  setDbSetting(db, 'gazetteer_config', JSON.stringify({ enabledGazetteers: ['sv-parishes'] }));
}
```

This only sets the config if none exists (doesn't overwrite user choices on re-import).

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `npm test -- --run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/import/genney/index.ts
git commit -m "feat: auto-enable sv-parishes gazetteer on Genney import"
```

---

## Task 10: Run Full Test Suite and Update Docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/PLAN.md`

- [ ] **Step 1: Run full test suite**

Run: `npm test -- --run`
Expected: All tests PASS (including new place-gazetteers tests)

- [ ] **Step 2: Update CLAUDE.md**

Add the gazetteers to the file map, routes table, and relevant sections. Key additions:
- File map: `src/api/place-gazetteers/` directory
- Routes table: `/gazetteers` route
- Shared Components table: `usePlaceResolver` composable
- Constants/config: `gazetteer_config` db_settings key

- [ ] **Step 3: Update docs/PLAN.md**

Add the Place Gazetteers milestone to the roadmap, mark it as done, and link to the spec.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/PLAN.md
git commit -m "docs: add gazetteers to CLAUDE.md and PLAN.md"
```
