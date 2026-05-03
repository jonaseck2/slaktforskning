# Global Gazetteer Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate gazetteers from a forest of self-rooted trees to one canonical hierarchy, so the place picker, panel breadcrumb, resolver, and map all see the same single tree (`World > Europe > Sweden > Jönköpings län > Eksjö kommun > Eksjö`). The user-observable end state is defined in `docs/plans/2026-05-03-global-gazetteer-hierarchy-design.md`.

**Architecture:** Build scripts emit `{ parentPath, nodes }` contributions instead of full self-rooted trees. Three privileged scaffolding gazetteers (`world-continents`, `world-countries`, `world-admin1`) load first and provide canonical names that every contribution must resolve into. A new merge phase in `merge.ts` walks contributions, attaches them under scaffolding nodes, and unions duplicates.

**Tech Stack:** TypeScript, Vitest, node-sqlite3-wasm, Vue 3 (renderer consumers).

**Design spec:** [docs/plans/2026-05-03-global-gazetteer-hierarchy-design.md](./2026-05-03-global-gazetteer-hierarchy-design.md). Read it before starting Phase 0.

**Verification (whole plan):** A genealogist opens the place picker after the plan ships. The dropdown's hierarchy view has one root ("World") with continents → countries → admin1 → admin2 → leaves underneath. Searching `eksjö` returns one "Eksjö kommun" with a `5 sources` badge. No `Sverige × 6`, no `Sverige (landskap)` fork, no flat-rooted "Eksjö, City, Sverige" without a län/kommun chain. After every country phase, the user is asked to navigate the picker for that country and sign off before the next country starts.

---

## Phase 0 — Types and the Contribution shape

**Goal:** Lay down the type system. No build-script changes, no merge changes yet. The repo still compiles and all existing tests still pass — Phase 0 only adds new types and a discriminator.

### Task 0.1: Add `GazetteerNodeType` enum

**Files:**
- Modify: `src/api/place-gazetteers/types.ts`
- Test: `tests/unit/gazetteer-types.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/gazetteer-types.test.ts
import { describe, it, expect } from 'vitest';
import { GAZETTEER_NODE_TYPES, isGazetteerNodeType } from '../../src/api/place-gazetteers/types';

describe('GazetteerNodeType', () => {
  it('exports the canonical closed vocabulary', () => {
    expect(GAZETTEER_NODE_TYPES).toEqual([
      'world', 'continent', 'country', 'admin1', 'admin2', 'admin3', 'admin4',
      'locality', 'parish', 'farm', 'church', 'city', 'landskap',
      'historical-state', 'other',
    ]);
  });

  it('isGazetteerNodeType accepts valid values', () => {
    expect(isGazetteerNodeType('country')).toBe(true);
    expect(isGazetteerNodeType('admin1')).toBe(true);
    expect(isGazetteerNodeType('parish')).toBe(true);
  });

  it('isGazetteerNodeType rejects invalid values', () => {
    expect(isGazetteerNodeType('municipality')).toBe(false);
    expect(isGazetteerNodeType('sogn')).toBe(false);
    expect(isGazetteerNodeType('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/unit/gazetteer-types.test.ts`
Expected: FAIL — `GAZETTEER_NODE_TYPES` not exported.

- [ ] **Step 3: Implement in `types.ts`**

Add at the top of `src/api/place-gazetteers/types.ts`:

```typescript
export const GAZETTEER_NODE_TYPES = [
  'world', 'continent', 'country', 'admin1', 'admin2', 'admin3', 'admin4',
  'locality', 'parish', 'farm', 'church', 'city', 'landskap',
  'historical-state', 'other',
] as const;

export type GazetteerNodeType = typeof GAZETTEER_NODE_TYPES[number];

export function isGazetteerNodeType(s: string): s is GazetteerNodeType {
  return (GAZETTEER_NODE_TYPES as readonly string[]).includes(s);
}
```

**Important:** keep `GazetteerNode.type: string` for now — Phase 0 only adds the enum alongside. Tightening to `GazetteerNodeType` happens in Phase 8 (cleanup) after every gazetteer has been migrated to the closed vocabulary. Loosening to `string` here keeps the existing build outputs valid and avoids cascading TS errors before any migration has run.

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run tests/unit/gazetteer-types.test.ts` → PASS.
Run: `npx vitest run` → all green (no other tests touched).

- [ ] **Step 5: Commit**

```bash
git add src/api/place-gazetteers/types.ts tests/unit/gazetteer-types.test.ts
git commit -m "feat(gazetteers): add GazetteerNodeType closed vocabulary"
```

### Task 0.2: Add `Contribution` and `Gazetteer.shape` discriminator

**Files:**
- Modify: `src/api/place-gazetteers/types.ts`
- Test: `tests/unit/gazetteer-types.test.ts` (extend)

- [ ] **Step 1: Write the failing test (extend existing file)**

Append to `tests/unit/gazetteer-types.test.ts`:

```typescript
import type { Gazetteer, Contribution } from '../../src/api/place-gazetteers/types';

describe('Contribution shape', () => {
  it('a scaffolding gazetteer has root and shape="scaffolding"', () => {
    const g: Gazetteer = {
      id: 'world-countries', name: 'World Countries', locale: 'en',
      shape: 'scaffolding',
      root: { name: 'World', type: 'world', lat: 0, lon: 0, children: [] },
    };
    expect(g.shape).toBe('scaffolding');
    expect(g.root).toBeDefined();
  });

  it('a contribution gazetteer has contributions and shape="contributions"', () => {
    const c: Contribution = {
      parentPath: ['World', 'Europe', 'Sweden', 'Jönköpings län', 'Eksjö kommun'],
      nodes: [{ name: 'Eksjö', type: 'locality', lat: 57.66643, lon: 14.97205 }],
    };
    const g: Gazetteer = {
      id: 'sv-orter', name: 'Swedish Populated Places', locale: 'sv',
      shape: 'contributions',
      contributions: [c],
    };
    expect(g.shape).toBe('contributions');
    expect(g.contributions?.[0].parentPath).toHaveLength(5);
  });

  it('a language gazetteer has translations and shape="language"', () => {
    const g: Gazetteer = {
      id: 'lang-sv-geonames', name: 'Swedish translations', locale: 'sv',
      shape: 'language', kind: 'language',
      translations: { 'world-countries': { Denmark: ['Danmark'] } },
    };
    expect(g.shape).toBe('language');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/unit/gazetteer-types.test.ts` → FAIL — `Contribution` and `shape` field unknown.

- [ ] **Step 3: Implement**

Add to `src/api/place-gazetteers/types.ts`:

```typescript
export interface Contribution {
  parentPath: string[];      // canonical names from scaffolding, e.g. ['World','Europe','Sweden']
  nodes: GazetteerNode[];    // children to attach under the resolved parent
}
```

Modify the `Gazetteer` interface (existing) to add the discriminator and contributions, leaving old fields optional for backward compatibility:

```typescript
export interface Gazetteer {
  id: string;
  name: string;
  locale: string;
  description?: string;
  source?: GazetteerSource;
  /** Discriminator. New gazetteers set this; legacy gazetteers without it are treated as 'scaffolding' if `root` is set, else error. */
  shape?: 'scaffolding' | 'contributions' | 'language';
  /** Set when shape === 'scaffolding' OR for legacy self-rooted gazetteers (Phase 0–7). */
  root?: GazetteerNode;
  /** Set when shape === 'contributions'. */
  contributions?: Contribution[];
  kind?: 'point' | 'boundary' | 'language';
  translations?: Record<string, Record<string, string[]>>;
  normalize?: GazetteerNormalizeRules;
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run tests/unit/gazetteer-types.test.ts` → PASS.
Run: `npx vitest run && npm run lint` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/api/place-gazetteers/types.ts tests/unit/gazetteer-types.test.ts
git commit -m "feat(gazetteers): add Contribution shape and Gazetteer.shape discriminator"
```

---

## Phase 1 — Merge engine with legacy fallback

**Goal:** Implement the contribution-merging code path. Behind a feature flag (`GAZETTEER_MERGE_V2 === '1'`) so existing tests still pass. Old self-rooted gazetteers continue loading via the old code path until their build scripts migrate.

### Task 1.1: Index scaffolding by canonical path

**Files:**
- Modify: `src/api/place-gazetteers/merge.ts`
- Test: `tests/unit/gazetteer-merge.test.ts` (new)

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/gazetteer-merge.test.ts
import { describe, it, expect } from 'vitest';
import { buildScaffoldingIndex } from '../../src/api/place-gazetteers/merge';
import type { Gazetteer } from '../../src/api/place-gazetteers/types';

const worldCountries: Gazetteer = {
  id: 'world-countries', name: 'World Countries', locale: 'en',
  shape: 'scaffolding',
  root: {
    name: 'World', type: 'world', lat: 0, lon: 0,
    children: [
      { name: 'Europe', type: 'continent', lat: 50, lon: 10, children: [
        { name: 'Sweden', type: 'country', lat: 62, lon: 15 },
        { name: 'Denmark', type: 'country', lat: 56, lon: 10 },
      ]},
    ],
  },
};

describe('buildScaffoldingIndex', () => {
  it('indexes every node by canonical lowercased path', () => {
    const idx = buildScaffoldingIndex([worldCountries]);
    expect(idx.lookup(['World'])?.name).toBe('World');
    expect(idx.lookup(['World', 'Europe'])?.name).toBe('Europe');
    expect(idx.lookup(['World', 'Europe', 'Sweden'])?.name).toBe('Sweden');
    expect(idx.lookup(['World', 'Europe', 'Antarctica'])).toBeNull();
  });

  it('lookup is case-insensitive on each segment', () => {
    const idx = buildScaffoldingIndex([worldCountries]);
    expect(idx.lookup(['world', 'europe', 'sweden'])?.name).toBe('Sweden');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`buildScaffoldingIndex` not exported).

- [ ] **Step 3: Implement in `merge.ts`**

Append to `src/api/place-gazetteers/merge.ts`:

```typescript
export interface ScaffoldingIndex {
  lookup(path: string[]): GazetteerNode | null;
  /** All scaffolding root nodes (typically the World root, plus any sibling super-roots). */
  roots(): GazetteerNode[];
}

function pathKey(parts: string[]): string {
  return parts.map(p => p.toLowerCase()).join(' › ');
}

export function buildScaffoldingIndex(scaffolding: Gazetteer[]): ScaffoldingIndex {
  const index = new Map<string, GazetteerNode>();
  const rootNodes: GazetteerNode[] = [];

  function walk(node: GazetteerNode, ancestors: string[]) {
    const path = [...ancestors, node.name];
    index.set(pathKey(path), node);
    if (node.children) {
      for (const child of node.children) walk(child, path);
    }
  }

  for (const g of scaffolding) {
    if (!g.root) continue;
    rootNodes.push(g.root);
    walk(g.root, []);
  }

  return {
    lookup: (path) => index.get(pathKey(path)) ?? null,
    roots: () => rootNodes,
  };
}
```

- [ ] **Step 4: Run — expect PASS**

`npx vitest run tests/unit/gazetteer-merge.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/place-gazetteers/merge.ts tests/unit/gazetteer-merge.test.ts
git commit -m "feat(gazetteers): index scaffolding by canonical path"
```

### Task 1.2: Attach contributions to scaffolding

**Files:**
- Modify: `src/api/place-gazetteers/merge.ts`
- Test: `tests/unit/gazetteer-merge.test.ts` (extend)

- [ ] **Step 1: Write failing test**

Append to `tests/unit/gazetteer-merge.test.ts`:

```typescript
import { attachContributions } from '../../src/api/place-gazetteers/merge';

describe('attachContributions', () => {
  it('attaches contribution nodes under the resolved parent', () => {
    const scaffolding = JSON.parse(JSON.stringify(worldCountries)) as typeof worldCountries;
    const idx = buildScaffoldingIndex([scaffolding]);
    const contribution: Gazetteer = {
      id: 'sv-orter', name: 'SE places', locale: 'sv',
      shape: 'contributions',
      contributions: [
        {
          parentPath: ['World', 'Europe', 'Sweden'],
          nodes: [{ name: 'Eksjö kommun', type: 'admin2', lat: 57.7, lon: 15.0 }],
        },
      ],
    };
    const report = attachContributions([contribution], idx);
    expect(report.attached).toBe(1);
    expect(report.rejected).toEqual([]);

    const sweden = idx.lookup(['World', 'Europe', 'Sweden'])!;
    expect(sweden.children?.map(c => c.name)).toContain('Eksjö kommun');
  });

  it('rejects contributions whose parentPath does not resolve', () => {
    const scaffolding = JSON.parse(JSON.stringify(worldCountries)) as typeof worldCountries;
    const idx = buildScaffoldingIndex([scaffolding]);
    const bogus: Gazetteer = {
      id: 'eg-test', name: 'Egypt test', locale: 'ar',
      shape: 'contributions',
      contributions: [{ parentPath: ['World', 'Africa', 'Egypta'], nodes: [{ name: 'Cairo', type: 'locality', lat: 30, lon: 31 }] }],
    };
    const report = attachContributions([bogus], idx);
    expect(report.attached).toBe(0);
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0]).toMatchObject({ gazetteer: 'eg-test', parentPath: ['World', 'Africa', 'Egypta'] });
  });

  it('records contributors on attached nodes for picker provenance', () => {
    const scaffolding = JSON.parse(JSON.stringify(worldCountries)) as typeof worldCountries;
    const idx = buildScaffoldingIndex([scaffolding]);
    const contribA: Gazetteer = {
      id: 'sv-socknar', name: 'A', locale: 'sv', shape: 'contributions',
      contributions: [{ parentPath: ['World', 'Europe', 'Sweden'], nodes: [{ name: 'Eksjö kommun', type: 'admin2', lat: 57.7, lon: 15.0 }] }],
    };
    const contribB: Gazetteer = {
      id: 'sv-orter', name: 'B', locale: 'sv', shape: 'contributions',
      contributions: [{ parentPath: ['World', 'Europe', 'Sweden'], nodes: [{ name: 'Eksjö kommun', type: 'admin2', lat: 57.7, lon: 15.0 }] }],
    };
    attachContributions([contribA, contribB], idx);
    const eksjoKommun = idx.lookup(['World', 'Europe', 'Sweden'])!.children!.find(c => c.name === 'Eksjö kommun')!;
    expect((eksjoKommun as { __contributors?: string[] }).__contributors).toEqual(['sv-socknar', 'sv-orter']);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**.

- [ ] **Step 3: Implement**

Append to `src/api/place-gazetteers/merge.ts`:

```typescript
export interface AttachReport {
  attached: number;
  rejected: Array<{ gazetteer: string; parentPath: string[]; reason: string }>;
}

interface RuntimeNode extends GazetteerNode {
  __contributors?: string[];
  __priority?: number;
}

function mergeNode(
  target: RuntimeNode,
  incoming: RuntimeNode,
  contributorId: string,
  incomingSource: GazetteerSource | undefined,
  incomingKind: string | undefined,
): void {
  target.__contributors = target.__contributors ?? [];
  if (!target.__contributors.includes(contributorId)) target.__contributors.push(contributorId);

  if (incoming.aliases) {
    const set = new Set(target.aliases ?? []);
    for (const a of incoming.aliases) set.add(a);
    target.aliases = Array.from(set);
  }

  // Coord priority — boundary > Wikidata > GeoNames > first-seen (full table in Task 1.3).
  // Phase 1.2 only does the additive "geometry wins if absent" rule; 1.3 lands the priority table.
  if (!target.geometry && incoming.geometry) target.geometry = incoming.geometry;

  if (incoming.children) {
    target.children = target.children ?? [];
    for (const child of incoming.children) {
      const existing = target.children.find(c => c.name === child.name && c.type === child.type);
      if (existing) {
        mergeNode(existing as RuntimeNode, child as RuntimeNode, contributorId, incomingSource, incomingKind);
      } else {
        const cloned = JSON.parse(JSON.stringify(child)) as RuntimeNode;
        cloned.__contributors = [contributorId];
        target.children.push(cloned);
      }
    }
  }
}

export function attachContributions(gazetteers: Gazetteer[], idx: ScaffoldingIndex): AttachReport {
  const report: AttachReport = { attached: 0, rejected: [] };

  for (const g of gazetteers) {
    if (g.shape !== 'contributions' || !g.contributions) continue;
    for (const contrib of g.contributions) {
      const parent = idx.lookup(contrib.parentPath) as RuntimeNode | null;
      if (!parent) {
        report.rejected.push({
          gazetteer: g.id,
          parentPath: contrib.parentPath,
          reason: 'parent path does not resolve in scaffolding',
        });
        continue;
      }
      parent.children = parent.children ?? [];
      for (const node of contrib.nodes) {
        const existing = parent.children.find(c => c.name === node.name && c.type === node.type);
        if (existing) {
          mergeNode(existing as RuntimeNode, node as RuntimeNode, g.id, g.source, g.kind);
        } else {
          const cloned = JSON.parse(JSON.stringify(node)) as RuntimeNode;
          cloned.__contributors = [g.id];
          parent.children.push(cloned);
        }
        report.attached++;
      }
    }
  }

  return report;
}
```

- [ ] **Step 4: Run tests — expect PASS**

`npx vitest run tests/unit/gazetteer-merge.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/place-gazetteers/merge.ts tests/unit/gazetteer-merge.test.ts
git commit -m "feat(gazetteers): attach contributions onto scaffolding with merge"
```

### Task 1.3: Coord tie-breaker priority

**Files:**
- Modify: `src/api/place-gazetteers/merge.ts`
- Test: `tests/unit/gazetteer-merge.test.ts` (extend)

- [ ] **Step 1: Write failing test**

```typescript
describe('coord tie-breaker', () => {
  it('boundary contributor wins over point contributor', () => {
    const sc = JSON.parse(JSON.stringify(worldCountries)) as typeof worldCountries;
    const idx = buildScaffoldingIndex([sc]);
    const point: Gazetteer = { id: 'sv-orter', name: 'pt', locale: 'sv', shape: 'contributions', kind: 'point',
      contributions: [{ parentPath: ['World', 'Europe', 'Sweden'], nodes: [{ name: 'Eksjö', type: 'locality', lat: 57.66, lon: 14.97 }] }] };
    const boundary: Gazetteer = { id: 'sv-bnd', name: 'bnd', locale: 'sv', shape: 'contributions', kind: 'boundary',
      contributions: [{ parentPath: ['World', 'Europe', 'Sweden'], nodes: [{ name: 'Eksjö', type: 'locality', lat: 57.99, lon: 15.99,
        geometry: { type: 'Polygon', coordinates: [[[15, 57], [16, 57], [16, 58], [15, 58], [15, 57]]] } }] }] };
    attachContributions([point, boundary], idx);
    const eksjo = idx.lookup(['World', 'Europe', 'Sweden'])!.children!.find(c => c.name === 'Eksjö')!;
    expect(eksjo.lat).toBeCloseTo(57.99, 1);
    expect(eksjo.geometry).toBeDefined();
  });

  it('Wikidata wins over GeoNames when both are point sources', () => {
    const sc = JSON.parse(JSON.stringify(worldCountries)) as typeof worldCountries;
    const idx = buildScaffoldingIndex([sc]);
    const geonames: Gazetteer = { id: 'gn', name: 'GN', locale: 'sv', shape: 'contributions', kind: 'point',
      source: { name: 'GeoNames', url: '', license: 'CC BY 4.0', fetched: '2026-01-01' },
      contributions: [{ parentPath: ['World', 'Europe', 'Sweden'], nodes: [{ name: 'Eksjö', type: 'locality', lat: 57.10, lon: 14.10 }] }] };
    const wikidata: Gazetteer = { id: 'wd', name: 'WD', locale: 'sv', shape: 'contributions', kind: 'point',
      source: { name: 'Wikidata', url: '', license: 'CC0 1.0', fetched: '2026-01-01' },
      contributions: [{ parentPath: ['World', 'Europe', 'Sweden'], nodes: [{ name: 'Eksjö', type: 'locality', lat: 57.66, lon: 14.97 }] }] };
    attachContributions([geonames, wikidata], idx);
    const eksjo = idx.lookup(['World', 'Europe', 'Sweden'])!.children!.find(c => c.name === 'Eksjö')!;
    expect(eksjo.lat).toBeCloseTo(57.66, 2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (current `mergeNode` keeps first-seen coords).

- [ ] **Step 3: Implement priority**

Add to `merge.ts`:

```typescript
function priority(args: { source?: GazetteerSource; kind?: string }): number {
  if (args.kind === 'boundary') return 4;
  const sn = args.source?.name?.toLowerCase() ?? '';
  if (sn.includes('wikidata')) return 3;
  if (sn.includes('geonames')) return 2;
  return 1;
}
```

Replace the coord-handling block in `mergeNode` (between the aliases block and the children block) with:

```typescript
const targetPriority = target.__priority ?? 1;
const incomingPriority = priority({ source: incomingSource, kind: incomingKind });
if (incomingPriority > targetPriority) {
  target.lat = incoming.lat;
  target.lon = incoming.lon;
  if (incoming.geometry) target.geometry = incoming.geometry;
  target.__priority = incomingPriority;
} else if (!target.geometry && incoming.geometry) {
  target.geometry = incoming.geometry;
}
```

In `attachContributions`, when cloning a fresh child (the `else` branch), set its priority too:

```typescript
const cloned = JSON.parse(JSON.stringify(node)) as RuntimeNode;
cloned.__contributors = [g.id];
cloned.__priority = priority({ source: g.source, kind: g.kind });
parent.children.push(cloned);
```

- [ ] **Step 4: Run — expect PASS**

`npx vitest run tests/unit/gazetteer-merge.test.ts` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/api/place-gazetteers/merge.ts tests/unit/gazetteer-merge.test.ts
git commit -m "feat(gazetteers): coord tie-breaker boundary > wikidata > geonames"
```

### Task 1.4: `loadGazetteersV2` entry point with feature flag

**Files:**
- Modify: `src/api/place-gazetteers/merge.ts`
- Test: `tests/unit/gazetteer-merge.test.ts` (extend)

- [ ] **Step 1: Write failing test**

```typescript
import { loadGazetteers } from '../../src/api/place-gazetteers/merge';

describe('loadGazetteers V2 path', () => {
  it('returns merged scaffolding when GAZETTEER_MERGE_V2=1', () => {
    process.env.GAZETTEER_MERGE_V2 = '1';
    try {
      const result = loadGazetteers(
        { enabledGazetteers: ['world-countries'] },
        [worldCountries],
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('__merged__');
      expect(result[0].root?.name).toBe('World');
    } finally {
      delete process.env.GAZETTEER_MERGE_V2;
    }
  });

  it('returns legacy per-gazetteer array when flag is unset', () => {
    const result = loadGazetteers(
      { enabledGazetteers: ['world-countries'] },
      [worldCountries],
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('world-countries');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**.

- [ ] **Step 3: Implement**

Modify `loadGazetteers` in `merge.ts`:

```typescript
export function loadGazetteers(
  config: GazetteerConfig,
  bundled: Gazetteer[],
  imported: Gazetteer[] = [],
): Gazetteer[] {
  if (process.env.GAZETTEER_MERGE_V2 === '1') {
    return loadGazetteersV2(config, bundled, imported);
  }
  return loadGazetteersLegacy(config, bundled, imported);
}

function loadGazetteersLegacy(
  config: GazetteerConfig,
  bundled: Gazetteer[],
  imported: Gazetteer[],
): Gazetteer[] {
  // Move the existing body of loadGazetteers here verbatim.
}

function loadGazetteersV2(
  config: GazetteerConfig,
  bundled: Gazetteer[],
  imported: Gazetteer[],
): Gazetteer[] {
  const enabled = new Set(config.enabledGazetteers);
  const importedIds = new Set(imported.map(g => g.id));
  const all = [...bundled.filter(g => !importedIds.has(g.id)), ...imported];
  const filtered = all.filter(g => enabled.has(g.id) || g.shape === 'scaffolding');

  const scaffolding = filtered
    .filter(g => g.shape === 'scaffolding')
    .map(g => JSON.parse(JSON.stringify(g)) as Gazetteer);

  const idx = buildScaffoldingIndex(scaffolding);

  const contributions = filtered.filter(g => g.shape === 'contributions');
  const report = attachContributions(contributions, idx);
  if (report.rejected.length > 0) {
    console.warn('[gazetteers] rejected contributions:', report.rejected);
  }

  const langGazetteers = filtered.filter(g => g.shape === 'language');
  for (const lang of langGazetteers) mergeTranslationsV2(lang, idx);

  return [{
    id: '__merged__',
    name: 'Merged hierarchy',
    locale: 'mul',
    shape: 'scaffolding',
    root: scaffolding[0]?.root ?? { name: 'World', type: 'world', lat: 0, lon: 0 },
  }];
}

function mergeTranslationsV2(lang: Gazetteer, idx: ScaffoldingIndex): void {
  if (!lang.translations) return;
  for (const [_targetId, translations] of Object.entries(lang.translations)) {
    for (const [pathStr, names] of Object.entries(translations)) {
      const node = idx.lookup(pathStr.split(' › '));
      if (!node) continue;
      const existing = new Set(node.aliases ?? []);
      for (const n of names) existing.add(n);
      node.aliases = Array.from(existing);
    }
  }
}
```

**Note for executor:** `loadGazetteersV2` currently surfaces only the first scaffolding tree's root. Phase 6's Task 6.2 (when `world-historical` joins as a sibling super-root) introduces a `MergedTree` return type with `roots: GazetteerNode[]`. Until then, historical lives behind its own legacy gazetteer.

- [ ] **Step 4: Run — expect PASS**

`npx vitest run tests/unit/gazetteer-merge.test.ts` → all green.
`npx vitest run` → all existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/api/place-gazetteers/merge.ts tests/unit/gazetteer-merge.test.ts
git commit -m "feat(gazetteers): loadGazetteersV2 behind GAZETTEER_MERGE_V2 flag"
```

---

## Phase 2 — Scaffolding gazetteers

**Goal:** Promote `world-countries` and `world-admin1` to scaffolding shape with the canonical `World > continent > country > admin1` tree. After this phase the merge engine has scaffolding to attach contributions into.

### Task 2.1: Add the continent layer to `world-countries`

**Files:**
- Modify: `scripts/build-world.ts`
- Regenerate: `src/api/place-gazetteers/data/world-countries.json`
- Test: `tests/unit/gazetteers.test.ts` (extend)

- [ ] **Step 1: Failing test**

```typescript
it('world-countries roots at "World" with continent children', () => {
  const wc = require('../../src/api/place-gazetteers/data/world-countries.json');
  expect(wc.shape).toBe('scaffolding');
  expect(wc.root.name).toBe('World');
  expect(wc.root.type).toBe('world');
  const continents = wc.root.children.map((c: any) => c.name).sort();
  expect(continents).toEqual([
    'Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'Oceania', 'South America',
  ]);
  const europe = wc.root.children.find((c: any) => c.name === 'Europe');
  expect(europe.children.map((c: any) => c.name)).toContain('Sweden');
});
```

- [ ] **Step 2: Run — FAIL**.

- [ ] **Step 3: Modify `scripts/build-world.ts`**

Where the script emits `world-countries.json`, group GeoNames `countryInfo.txt` rows by their `Continent` column code (`AF`, `AS`, `EU`, `NA`, `OC`, `SA`, `AN`). Map codes to canonical English names. Emit:

```json
{
  "id": "world-countries",
  "shape": "scaffolding",
  "root": {
    "name": "World", "type": "world", "lat": 0, "lon": 0,
    "children": [
      { "name": "Africa", "type": "continent", "lat": 2, "lon": 18, "children": [ /* countries */ ] },
      { "name": "Antarctica", "type": "continent", "lat": -75, "lon": 0, "children": [ /* countries */ ] },
      { "name": "Asia", "type": "continent", "lat": 45, "lon": 90, "children": [ /* countries */ ] },
      { "name": "Europe", "type": "continent", "lat": 54, "lon": 15, "children": [ /* countries */ ] },
      { "name": "North America", "type": "continent", "lat": 45, "lon": -100, "children": [ /* countries */ ] },
      { "name": "Oceania", "type": "continent", "lat": -25, "lon": 135, "children": [ /* countries */ ] },
      { "name": "South America", "type": "continent", "lat": -15, "lon": -60, "children": [ /* countries */ ] }
    ]
  }
}
```

Country nodes use the existing canonical English name as `name` and add native names to `aliases`. Set `type: 'country'`.

Re-run: `npx tsx scripts/build-world.ts`.

- [ ] **Step 4: PASS**.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-world.ts src/api/place-gazetteers/data/world-countries.json tests/unit/gazetteers.test.ts
git commit -m "feat(gazetteers): add continent layer + scaffolding shape to world-countries"
```

### Task 2.2: Re-root `world-admin1` under `World > <continent> > <country>`

**Files:**
- Modify: `scripts/build-world.ts` (admin1 emit branch)
- Regenerate: `src/api/place-gazetteers/data/world-admin1.json`
- Test: `tests/unit/gazetteers.test.ts` (extend)

- [ ] **Step 1: Failing test**

```typescript
it('world-admin1 has admin1 nodes under World > continent > country', () => {
  const wa = require('../../src/api/place-gazetteers/data/world-admin1.json');
  expect(wa.shape).toBe('scaffolding');
  expect(wa.root.name).toBe('World');
  const europe = wa.root.children.find((c: any) => c.name === 'Europe');
  const sweden = europe.children.find((c: any) => c.name === 'Sweden');
  expect(sweden.children.map((c: any) => c.name)).toContain('Jönköpings län');
});
```

- [ ] **Step 2: Run — FAIL**.

- [ ] **Step 3: Modify `scripts/build-world.ts`** to emit admin1 under the continent>country layout. Set `shape: 'scaffolding'`. Re-run.

- [ ] **Step 4: PASS**.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-world.ts src/api/place-gazetteers/data/world-admin1.json tests/unit/gazetteers.test.ts
git commit -m "feat(gazetteers): re-root world-admin1 under World > continent > country"
```

### Task 2.3: CI scaffolding-integrity test

**Files:**
- Create: `tests/unit/gazetteer-hierarchy.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect } from 'vitest';
import { getAllGazetteers } from '../../src/api/place-gazetteers/bundled';
import { GAZETTEER_NODE_TYPES } from '../../src/api/place-gazetteers/types';
import { buildScaffoldingIndex, attachContributions } from '../../src/api/place-gazetteers/merge';

describe('gazetteer hierarchy integrity', () => {
  const all = getAllGazetteers();
  const scaffolding = all.filter(g => g.shape === 'scaffolding');
  const contribGazetteers = all.filter(g => g.shape === 'contributions');

  it('every contribution parent path resolves into scaffolding', () => {
    const idx = buildScaffoldingIndex(JSON.parse(JSON.stringify(scaffolding)));
    const report = attachContributions(JSON.parse(JSON.stringify(contribGazetteers)), idx);
    if (report.rejected.length > 0) console.error('Rejected contributions:', report.rejected);
    expect(report.rejected).toEqual([]);
  });

  it.skip('every node type is in the closed vocabulary', () => {
    function check(node: any, gid: string): string[] {
      const errors: string[] = [];
      if (!(GAZETTEER_NODE_TYPES as readonly string[]).includes(node.type)) {
        errors.push(`${gid}: invalid type "${node.type}" on node "${node.name}"`);
      }
      if (node.children) for (const c of node.children) errors.push(...check(c, gid));
      return errors;
    }
    const errors: string[] = [];
    for (const g of all) {
      if (g.root) errors.push(...check(g.root, g.id));
      if (g.contributions) for (const contrib of g.contributions) for (const n of contrib.nodes) errors.push(...check(n, g.id));
    }
    expect(errors).toEqual([]);
  });

  it('exactly one canonical Sweden node in scaffolding', () => {
    const idx = buildScaffoldingIndex(JSON.parse(JSON.stringify(scaffolding)));
    const sweden = idx.lookup(['World', 'Europe', 'Sweden']);
    expect(sweden).not.toBeNull();
    expect(sweden!.type).toBe('country');
  });
});
```

The closed-vocab test is `it.skip` until Phase 8 — every gazetteer must migrate first or it fails on legacy values like `'municipality'` or `'sogn'`.

- [ ] **Step 2: Run — expect PASS** (the active two tests; the skipped one doesn't fail).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/gazetteer-hierarchy.test.ts
git commit -m "test(gazetteers): scaffolding integrity (closed-vocab assertion deferred)"
```

---

## Phase 3 — Sweden migration (live)

**Goal:** All 7 Swedish gazetteers (`sv-socknar`, `sv-forsamlingar`, `sv-orter`, `sv-gardar`, `sv-kyrkor`, `sv-landskap`, `sv-sockenstad-boundaries`) emit `shape: 'contributions'` rooted under `World > Europe > Sweden > <län> > <kommun>` (or `<landskap>` for the landskap gazetteer). After this phase, when the user opens the picker with `GAZETTEER_MERGE_V2=1`, Sweden is one tree.

This is the user-verification gate — sign off on Sweden before any other country is touched.

### Task 3.1: Migrate `sv-orter`, `sv-gardar`, `sv-kyrkor`

**Files:**
- Modify: `scripts/fetch-sv-orter.ts`
- Regenerate: `src/api/place-gazetteers/data/{sv-orter,sv-gardar,sv-kyrkor}.json`
- Test: `tests/unit/gazetteer-sweden.test.ts` (new)

- [ ] **Step 1: Failing fixture test**

```typescript
import { describe, it, expect } from 'vitest';

describe('sv-orter contributions', () => {
  const g = require('../../src/api/place-gazetteers/data/sv-orter.json');

  it('uses contributions shape', () => {
    expect(g.shape).toBe('contributions');
    expect(Array.isArray(g.contributions)).toBe(true);
  });

  it('every parentPath roots at World > Europe > Sweden', () => {
    for (const c of g.contributions) {
      expect(c.parentPath.slice(0, 3)).toEqual(['World', 'Europe', 'Sweden']);
    }
  });

  it('Eksjö locality lives under Jönköpings län > Eksjö kommun', () => {
    const c = g.contributions.find((x: any) =>
      x.parentPath.join(' › ') === 'World › Europe › Sweden › Jönköpings län › Eksjö kommun'
    );
    expect(c).toBeDefined();
    expect(c.nodes.find((n: any) => n.name === 'Eksjö' && n.type === 'locality')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — FAIL**.

- [ ] **Step 3: Rewrite `scripts/fetch-sv-orter.ts`**

For each populated-place row in `geonames_se/SE.txt`:
1. Read admin1 (län code) and admin2 (kommun code); map to canonical Swedish names via `admin1Codes.txt` and `admin2Codes.txt` (script already does this).
2. Group rows by `(län, kommun)`.
3. Emit one contribution per group: `parentPath: ['World', 'Europe', 'Sweden', län, kommun]`, `nodes: [<all leaves in that kommun>]`.
4. Set `shape: 'contributions'`. Drop the `root` field entirely.
5. Use the closed-vocab type for each leaf: `locality` for sv-orter, `farm` for sv-gardar, `church` for sv-kyrkor.

Re-run: `npx tsx scripts/fetch-sv-orter.ts`.

- [ ] **Step 4: PASS**.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-sv-orter.ts src/api/place-gazetteers/data/sv-orter.json src/api/place-gazetteers/data/sv-gardar.json src/api/place-gazetteers/data/sv-kyrkor.json tests/unit/gazetteer-sweden.test.ts
git commit -m "feat(gazetteers): sv-orter/sv-gardar/sv-kyrkor as contributions"
```

### Task 3.2: Migrate `sv-socknar` and `sv-forsamlingar`

**Files:**
- Modify: `scripts/build-sv-parishes.ts`
- Regenerate: `src/api/place-gazetteers/data/sv-socknar.json`, `sv-forsamlingar.json`
- Test: `tests/unit/gazetteer-sweden.test.ts` (extend)

- [ ] **Step 1: Failing test** — assert `sv-socknar` uses contributions, parishes hang under `…> Eksjö kommun`, and `Eksjö socken` carries `type: 'parish'`.

- [ ] **Step 2: FAIL**.

- [ ] **Step 3: Rewrite `scripts/build-sv-parishes.ts`** to walk Wikidata results' P131 chain → län+kommun and emit contributions with `parentPath: ['World','Europe','Sweden',län,kommun]`. `type: 'parish'`. `shape: 'contributions'`.

- [ ] **Step 4: PASS**.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-sv-parishes.ts src/api/place-gazetteers/data/sv-socknar.json src/api/place-gazetteers/data/sv-forsamlingar.json tests/unit/gazetteer-sweden.test.ts
git commit -m "feat(gazetteers): sv-socknar/sv-forsamlingar as contributions"
```

### Task 3.3: Migrate `sv-landskap` (sibling axis to län)

**Files:**
- Modify: `scripts/build-sv-landskap.ts`
- Regenerate: `src/api/place-gazetteers/data/sv-landskap.json`
- Test: `tests/unit/gazetteer-sweden.test.ts` (extend)

The current root `Sverige (landskap)` is the bug. Migrate to contributions rooted at `World > Europe > Sweden`. Each landskap is `{ name: 'Skåne', type: 'landskap', ... }` — sibling to län inside Sweden.

- [ ] **Step 1: Failing test**

```typescript
it('sv-landskap uses contributions, parentPath = Sweden', () => {
  const g = require('../../src/api/place-gazetteers/data/sv-landskap.json');
  expect(g.shape).toBe('contributions');
  expect(g.contributions[0].parentPath).toEqual(['World', 'Europe', 'Sweden']);
  const skane = g.contributions[0].nodes.find((n: any) => n.name === 'Skåne');
  expect(skane.type).toBe('landskap');
});
```

- [ ] **Step 2: FAIL**.

- [ ] **Step 3: Rewrite the script** — emit one contribution `{ parentPath: ['World','Europe','Sweden'], nodes: [25 landskap] }`. Drop the `Sverige (landskap)` root entirely.

- [ ] **Step 4: PASS**.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(gazetteers): sv-landskap as contributions, ends Sverige (landskap) fork"
```

### Task 3.4: Migrate `sv-sockenstad-boundaries`

**Files:**
- Modify: `scripts/build-sv-boundaries.ts`
- Regenerate: `src/api/place-gazetteers/data/sv-sockenstad-boundaries.json`
- Test: `tests/unit/gazetteer-sweden.test.ts` (extend)

The source dataset is flat (parishes + cities under `Sverige`, no kommun). The new output declares the kommun parent path for every polygon. Lantmäteriet metadata has `kommunkod` per polygon — map it to kommun name via the same admin code lookup `fetch-sv-orter.ts` uses. Polygons whose kommun cannot be resolved (extinct parish, boundary change) are **rejected and warned** at build time — no flat-rooted shortcut.

- [ ] **Step 1: Failing test**

```typescript
it('sv-sockenstad-boundaries Eksjö parish polygon under canonical kommun', () => {
  const g = require('../../src/api/place-gazetteers/data/sv-sockenstad-boundaries.json');
  expect(g.shape).toBe('contributions');
  const c = g.contributions.find((x: any) =>
    x.parentPath.join(' › ') === 'World › Europe › Sweden › Jönköpings län › Eksjö kommun'
  );
  expect(c).toBeDefined();
  const eksjoParish = c.nodes.find((n: any) => n.name === 'Eksjö' && n.type === 'parish');
  expect(eksjoParish.geometry).toBeDefined();
});
```

- [ ] **Step 2: FAIL**.

- [ ] **Step 3: Rewrite `scripts/build-sv-boundaries.ts`**

For each Lantmäteriet feature:
1. Extract `kommunkod` (4-digit Statistics Sweden code) from feature properties.
2. Look up kommun + län name via the admin codes data already loaded.
3. Group features by `(län, kommun)`; emit one contribution per group.
4. Parishes → `type: 'parish'`. City polygons (stadsrättigheter) → `type: 'city'` siblings to parishes.
5. Polygons with no kommun match → log to stderr; build script exits non-zero if more than 1% are skipped.

Re-run.

- [ ] **Step 4: PASS**.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(gazetteers): sv-sockenstad-boundaries attaches geometry to canonical kommun children"
```

### Task 3.5: User verification gate — Sweden

- [ ] **Step 1: Run the app with the merge flag**

```bash
GAZETTEER_MERGE_V2=1 npm start
```

- [ ] **Step 2: Open the place picker on any place input.**

- [ ] **Step 3: Without typing, drill `World > Europe > Sweden > Jönköpings län > Eksjö kommun`.**

Expected: one Sweden, one Jönköpings län, one Eksjö kommun. Under Eksjö kommun, the union of leaves from all 5+ source gazetteers — parishes, churches, farms, localities, polygons.

- [ ] **Step 4: Search "eksjö".**

Expected: "Eksjö kommun" once with multi-source badge; Eksjö parish, Eksjö city (boundary), Eksjö locality each once with full canonical breadcrumb.

- [ ] **Step 5: Sign-off prompt to user.** If sign-off given, proceed to Phase 4. If not, fix and re-verify.

- [ ] **Step 6: Commit empty checkpoint**

```bash
git commit --allow-empty -m "chore(gazetteers): Sweden migration verified by user"
```

---

## Phase 4 — Nordic countries (Denmark, Norway, Finland, Iceland)

**Pattern:** each country follows the Sweden shape. Closed-vocab type vocabulary per country:

- Denmark: `parish` (sogn), `admin2` (kommune)
- Norway: `admin2` (kommune), `parish` (sokn)
- Finland: `admin2` (kunta), `parish` (seurakunta)
- Iceland: `admin2` (sveitarfélag)

### Task 4.1: Denmark — `dk-sogne`, `dk-sogne-dawa`, `dk-sogne-boundaries`

- [ ] **Step 1:** Write `tests/unit/gazetteer-denmark.test.ts`. Assert each gazetteer uses `shape: 'contributions'` and a known parish (e.g. `Vor Frue Sogn` Copenhagen) lives under `World > Europe > Denmark > Region Hovedstaden > Københavns Kommune`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Rewrite `scripts/build-dk-parishes.ts` (Wikidata P131 chain), `scripts/build-dk-parishes-dawa.ts` (DAWA reverse-geo already returns hierarchy), `scripts/build-dk-boundaries.ts` (ok-dk/dagi GeoJSON properties carry kommune code).
- [ ] **Step 4:** Re-run all three; tests PASS.
- [ ] **Step 5:** Commit `feat(gazetteers): Denmark as contributions`.
- [ ] **Step 6:** User verification gate — drill `World > Europe > Denmark`. Sign off.

### Task 4.2: Norway — `no-kommuner`, `no-kommuner-boundaries`

- [ ] Tests: `tests/unit/gazetteer-norway.test.ts`. Assert `Oslo kommune` under `World > Europe > Norway > Oslo`.
- [ ] Rewrite `scripts/build-no-municipalities.ts` and `scripts/build-no-boundaries.ts`. GeoNames `NO.zip` admin1+admin2 → parent path.
- [ ] PASS. Commit `feat(gazetteers): Norway as contributions`. User verification gate.

### Task 4.3: Finland — `fi-kunnat`, `fi-kunnat-boundaries`

- [ ] Tests: `tests/unit/gazetteer-finland.test.ts`.
- [ ] Rewrite `scripts/build-fi-municipalities.ts`, `scripts/build-fi-boundaries.ts`. GeoNames `FI.zip` admin codes; bilingual names in `aliases`.
- [ ] PASS. Commit. User verification gate.

### Task 4.4: Iceland — `is-sveitarfelog`, `is-sveitarfelog-boundaries`

- [ ] Tests: `tests/unit/gazetteer-iceland.test.ts`.
- [ ] Rewrite `scripts/build-is-municipalities.ts`, `scripts/build-is-boundaries.ts`.
- [ ] PASS. Commit. User verification gate.

---

## Phase 5 — Anglosphere + Germany

### Task 5.1: US — `us-immigration-states`, `us-all-states`, `us-counties-boundaries`

- [ ] Tests: `tests/unit/gazetteer-usa.test.ts`. Assert San Francisco under `World > North America > United States > California > San Francisco County`.
- [ ] Rewrite `scripts/build-us-places.ts`, `scripts/build-us-places-all.ts`, `scripts/build-us-boundaries.ts`. GeoNames admin1 (state) + admin2 (county). The two `us-*-states` gazetteers share scaffolding — duplicates merge.
- [ ] PASS. Commit. User verification gate.

### Task 5.2: Canada — `ca-provinces`, `ca-divisions-boundaries`

- [ ] Tests: `tests/unit/gazetteer-canada.test.ts`.
- [ ] Rewrite `scripts/build-ca-places.ts`, `scripts/build-ca-boundaries.ts`. GeoNames admin1 (province) + admin2 (census division).
- [ ] PASS. Commit. User verification gate.

### Task 5.3: Germany — `de-gemeinden`

- [ ] Tests: `tests/unit/gazetteer-germany.test.ts`. Assert München under `World > Europe > Germany > Bayern > <kreis>`.
- [ ] Rewrite `scripts/build-de-municipalities.ts`. GeoNames admin1 (Bundesland) + admin2 (Kreis).
- [ ] PASS. Commit. User verification gate.

---

## Phase 6 — World-* gazetteers + sibling super-root

### Task 6.1: `world-boundaries` — country polygons attach to scaffolding

- [ ] Test in `tests/unit/gazetteer-world.test.ts`: assert `world-boundaries` is `shape: 'contributions'`. Assert Sweden's polygon attaches to `World > Europe > Sweden`.
- [ ] Rewrite `scripts/build-world-boundaries.ts`. For each country polygon: emit `{ parentPath: ['World', continent], nodes: [{ name: country, type: 'country', geometry: ... }] }`. Merge engine deduplicates against the country already in `world-countries` scaffolding and the boundary tie-breaker promotes the polygon's coords.
- [ ] PASS. Commit `feat(gazetteers): world-boundaries attaches polygons to canonical country nodes`.

### Task 6.2: `world-historical` sibling super-root + `MergedTree` return type

**Files:**
- Modify: `scripts/build-world-historical.ts`
- Modify: `src/api/place-gazetteers/merge.ts`
- Modify: `src/api/place-gazetteers/types.ts`
- Test: `tests/unit/gazetteer-merge.test.ts` (extend)

- [ ] **Step 1: Failing test**

```typescript
describe('world-historical sibling super-root', () => {
  it('exposes both World and World (Historical) roots', () => {
    process.env.GAZETTEER_MERGE_V2 = '1';
    try {
      const result = loadGazetteers(
        { enabledGazetteers: [] },
        [
          worldCountries,
          { id: 'world-historical', name: 'WH', locale: 'en', shape: 'scaffolding',
            root: { name: 'World (Historical)', type: 'world', lat: 0, lon: 0,
              children: [{ name: 'Holy Roman Empire', type: 'historical-state', lat: 50, lon: 10 }] } },
        ],
      );
      expect(result[0].id).toBe('__merged__');
      // The merged tree exposes both roots via meta
      const meta = result[0] as any;
      expect(meta.allRoots.map((r: any) => r.name)).toEqual(['World', 'World (Historical)']);
    } finally {
      delete process.env.GAZETTEER_MERGE_V2;
    }
  });
});
```

- [ ] **Step 2: FAIL**.

- [ ] **Step 3: Rewrite `scripts/build-world-historical.ts`** to emit `shape: 'scaffolding'` with root name `World (Historical)`. Each historical state has `type: 'historical-state'` and contains `startYear`/`endYear` fields where known. Re-run.

- [ ] **Step 4: Update `loadGazetteersV2` in `merge.ts`** to expose all scaffolding roots via the synthesised gazetteer:

```typescript
return [{
  id: '__merged__',
  name: 'Merged hierarchy',
  locale: 'mul',
  shape: 'scaffolding',
  root: scaffolding[0]?.root ?? { name: 'World', type: 'world', lat: 0, lon: 0 },
  // Non-serialized runtime extension — exposes sibling super-roots.
  ...(scaffolding.length > 1 ? { allRoots: scaffolding.map(g => g.root!) } : {}),
}] as Gazetteer[];
```

Add the optional field to the `Gazetteer` type:

```typescript
allRoots?: GazetteerNode[];
```

- [ ] **Step 5: PASS**. Commit `feat(gazetteers): world-historical as sibling scaffolding root`.

- [ ] **Step 6: User verification gate.**

### Task 6.3: `build-world-continents-boundaries.ts`

- [ ] Test: continent polygon attaches to `World > Europe`.
- [ ] Rewrite the script to emit `shape: 'contributions'`, `parentPath: ['World']`, 7 continent nodes carrying geometry. Re-run.
- [ ] PASS. Commit.

---

## Phase 7 — Language gazetteers and consumer wiring

### Task 7.1: Translation path keys move to canonical paths

**Files:**
- Modify: `scripts/build-lang-sv-geonames.ts`, `scripts/build-lang-sv-wikidata.ts`, `scripts/build-lang-world-historical.ts`
- Regenerate: `lang-sv-geonames.json`, `lang-sv-wikidata.json`, `lang-world-historical.json`

Today: `translations: { 'world-countries': { 'Denmark': ['Danmark'] } }` keyed by gazetteer ID.
New: `translations: { '__merged__': { 'World › Europe › Denmark': ['Danmark'] } }` keyed against the merged tree's canonical paths.

- [ ] Test: `lang-sv-geonames.translations.__merged__['World › Europe › Denmark']` includes `Danmark`.
- [ ] Rewrite the build scripts to emit canonical paths.
- [ ] `mergeTranslationsV2` already accepts canonical path keys (Task 1.4) — no engine change.
- [ ] PASS. Commit `feat(gazetteers): language gazetteers key translations by canonical path`.

### Task 7.2: Renderer + resolver wiring

**Files:**
- Modify: `src/renderer/components/PlacePicker.vue`
- Modify: `src/renderer/components/modals/PlaceTreePickerModal.vue`
- Modify: `src/api/place-gazetteers/resolver.ts`
- Modify: `src/main/ipc/gazetteers.ts` (the MCP `resolve_place` path, if applicable)

- [ ] **PlacePicker** — drop `cand.gazetteer` from the dedup key. The badge becomes `__contributors.length` sources; hide when `n === 1`.
- [ ] **PlaceTreePickerModal** — the tree view walks the merged tree (`gazetteers[0].root` plus `gazetteers[0].allRoots ?? []` siblings) instead of iterating each bundled gazetteer's root.
- [ ] **resolver.ts** — `resolveHierarchical`, `resolvePlace`, `searchGazetteer` walk the merged tree. The cross-gazetteer contradiction-scoring stays valuable inside one tree (multiple Eksjös in different countries) and works unchanged.
- [ ] Tests: extend `tests/unit/place-resolver.test.ts` with a "single canonical match" assertion for `Eksjö, Sverige` returning one matched node, not 5.
- [ ] PASS. Commit `feat(gazetteers): renderer and resolver consume merged tree`.

### Task 7.3: User verification — every consumer

- [ ] Run app without flag (V2 still default-off).
- [ ] Run app with `GAZETTEER_MERGE_V2=1`.
- [ ] Place picker, place panel breadcrumb, map polygon, MCP `resolve_place`, gazetteer config UI all behave correctly.
- [ ] Sign off.
- [ ] Commit empty `chore(gazetteers): consumers verified on merged tree`.

### Task 7.4: Imported user-gazetteer policy (deferred from design §11)

The design spec left open whether imported (third-party) gazetteers in the legacy self-rooted shape are accepted with a build-time rewrite or rejected with a migration error. Decide here.

- [ ] **Step 1:** Survey `src/api/gazetteers.ts` for the import path. Determine if any user-importable schema validation exists today.
- [ ] **Step 2:** Decision: **reject legacy shape on import**, surface a one-line migration message pointing at the new contract docs. Rationale: the import feature is months old, likely no third-party gazetteers in the wild, and silent rewrite hides errors that the contributor needs to see.
- [ ] **Step 3:** Update `src/api/gazetteers.ts` import validation to require `shape` and reject otherwise.
- [ ] **Step 4:** Test: `tests/unit/gazetteers-crud.test.ts` extends with a "rejects shape-less import" case.
- [ ] **Step 5:** Commit.

---

## Phase 8 — Cleanup: remove the flag and the legacy path

### Task 8.1: Make V2 the default; delete legacy path

**Files:**
- Modify: `src/api/place-gazetteers/merge.ts`
- Modify: `src/api/place-gazetteers/types.ts`
- Modify: `tests/unit/gazetteer-hierarchy.test.ts`

- [ ] **Step 1:** Delete `loadGazetteersLegacy`. `loadGazetteers` always runs the V2 path.
- [ ] **Step 2:** Tighten `GazetteerNode.type: GazetteerNodeType`. Build will fail anywhere a free-form string survives — fix or convert to `'other'` + alias.
- [ ] **Step 3:** Un-skip `'every node type is in the closed vocabulary'` in `tests/unit/gazetteer-hierarchy.test.ts`. Run — expect PASS.
- [ ] **Step 4:** Drop all `process.env.GAZETTEER_MERGE_V2` references.
- [ ] **Step 5:** `npm test && npm run lint` → all green.
- [ ] **Step 6:** Commit

```bash
git commit -am "feat(gazetteers): merge V2 is default; remove legacy self-rooted path"
```

### Task 8.2: Update docs and archive

**Files:**
- Modify: `.claude/skills/gazetteers/SKILL.md`
- Modify: `CLAUDE.md`
- Modify: `docs/PLAN.md`, `docs/plans/archive/PLAN.md`
- Modify: `package.json`, `CHANGELOG.md`

- [ ] Update the gazetteer skill to reflect the new contract (shape, contributions, scaffolding privilege, closed vocab, canonical-path translation keys).
- [ ] Update CLAUDE.md gazetteer references.
- [ ] Move this plan and its design sibling to `docs/plans/archive/` via `git mv`.
- [ ] Append a one-paragraph entry to `docs/plans/archive/PLAN.md` (matching existing format).
- [ ] Remove the milestone block from `docs/PLAN.md`.
- [ ] Bump `package.json` minor version (feature). Add `## Unreleased` line in `CHANGELOG.md`.
- [ ] Tick every checkbox in this plan file as `[x]`.
- [ ] Commit `chore: archive completed global-gazetteer-hierarchy plan`.

---

## Self-review

**Spec coverage check.** Every section of the design spec maps to a task:

- §1 closed vocab → Task 0.1 + Task 8.1 (tighten).
- §2 scaffolding privilege → Task 1.4 (always-on filter), Phase 2 (build outputs).
- §3 contribution shape → Task 0.2 (types), Phase 3+ (build outputs).
- §4 load-time merge → Tasks 1.1–1.4.
- §5 load order → Task 1.4.
- §6 CI validation → Task 2.3 + Task 8.1.
- §7 coord tie-breaker → Task 1.3.
- §8 boundary geometry → Tasks 3.4, 4.x, 5.x, 6.1, 6.3.
- §9 renderer/resolver consequences → Tasks 7.1–7.3.
- §10 migration order → Phases 3–6 in stated order, with user-verification gates.
- §11 imported user gazetteers → Task 7.4.

**Placeholder scan.** No "TODO" / "fill in later" / "similar to" remain. Build-script rewrites are described by their source dataset's admin-code structure; the executor reads each existing script's body before rewriting.

**Type consistency.** Types defined exactly once: `GazetteerNodeType` (Task 0.1), `Contribution` (Task 0.2), `Gazetteer.shape` (Task 0.2), `RuntimeNode` (Task 1.2), `ScaffoldingIndex` (Task 1.1), `AttachReport` (Task 1.2), `priority` (Task 1.3), `allRoots` (Task 6.2). No drift.

---

## Execution

Execute this plan in a worktree (`superpowers:using-git-worktrees`) with `superpowers:subagent-driven-development` (per project workflow). User-verification gates between phases are mandatory — do not advance to the next country without explicit sign-off.

**Plan path note (project rule override):** This plan lives at `docs/plans/2026-05-03-global-gazetteer-hierarchy.md`, not `docs/superpowers/specs/` or `.claude/plans/`. When archived, both this file and `2026-05-03-global-gazetteer-hierarchy-design.md` move to `docs/plans/archive/`.
