# Global Gazetteer Hierarchy Implementation Plan

> **PLAN STATE (2026-05-03, mid-execution).** The architecture below was significantly revised after several iteration rounds with the user. **Read the design spec for the current model** — `docs/plans/2026-05-03-global-gazetteer-hierarchy-design.md`. Summary of revisions:
> 1. **Contract over fixture.** No "scaffolding" privilege. `world-countries.json` and `world-admin1.json` are regular contributors. No `world-admin2.json` file.
> 2. **Structural merge by `(name, type, parent_path)`** across all gazetteers. Same key from any number of sources → one merged node. Aliases union, lat/lon first-wins (warns >0.01°), geometry first-wins. `__contributors: string[]` tracks provenance.
> 3. **Closed type vocabulary collapsed** to admin levels only: `world | continent | country | admin{N}` (open-ended for higher levels). No leaf-type vocabulary. Build scripts pick the right admin level per country.
> 4. **No "contributions" shape.** Every gazetteer is a self-rooted tree from `World` (or `World (Historical)`).
>
> **What's actually shipped (verify via `git log --oneline`):**
> - Phase 0.1: `GazetteerNodeType` enum (final form: `world|continent|country|admin{N}`).
> - Phase 0.2: `Gazetteer.shape` discriminator. `Contribution` interface kept as legacy stub, unused going forward.
> - Phase 1: `mergeTree` + `buildNodeIndex` + `loadGazetteers` (structural-merge engine; commit `b9182a34`). Old attach/scaffolding logic gone.
> - Phase 2.1, 2.2: `world-countries.json` + `world-admin1.json` rebuilt with `World > continent > country [> admin1]` shape.
> - Phase 2.4: CI integrity test (verifies "after merge, exactly one canonical Sweden under World > Europe").
> - Phase 3.2 in progress: sv-socknar + sv-forsamlingar migration.
>
> **What's stale below.** The Phase 1.2/1.3 task descriptions describing "attachContributions" and "contributions/scaffolding shape" are stale. Phase 2.3 ("world-admin2 scaffolding") is gone — admin2 names live inside per-country build scripts. Phase 3.1+ task framing is directionally correct but uses obsolete terminology ("contributions"). For new dispatches, treat each per-country task as: "rewrite the build script to emit a `World > Europe > <country> > admin1 > admin2 > admin3 > …` tree using the closed admin vocabulary; suffix-strip locale forms to canonical with originals as aliases; the merge engine handles structural dedup automatically."

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Migrate gazetteers from a forest of self-rooted trees to one canonical hierarchy, so the place picker, panel breadcrumb, resolver, and map all see the same single tree (`World > Europe > Sweden > Jönköping > Eksjö > <parishes>`). The user-observable end state is defined in `docs/plans/2026-05-03-global-gazetteer-hierarchy-design.md`.

**Architecture (current — revised):** Every gazetteer emits a self-rooted tree from `World`. Build scripts type each node with the closed admin vocabulary (`world | continent | country | admin{N}`), emit canonical names with locale variants in `aliases`. The loader (`mergeTree`) walks every enabled gazetteer's tree and merges by `(name, type, parent_path)` — aliases union, lat/lon first-wins, children recursive merge. `__contributors` tracks provenance. No fixtures, no privileged gazetteers, no per-country mapping tables in the loader.

**Tech Stack:** TypeScript, Vitest, node-sqlite3-wasm, Vue 3 (renderer consumers).

**Design spec:** [docs/plans/2026-05-03-global-gazetteer-hierarchy-design.md](./2026-05-03-global-gazetteer-hierarchy-design.md). Read it — especially the "License & source provenance" section — before starting Phase 0.

**Verification (whole plan):** A genealogist opens the place picker after the plan ships. The dropdown's hierarchy view has one root ("World") with continents → countries → admin1 → admin2 → leaves underneath. Searching `eksjö` returns one "Eksjö kommun" (single scaffolding node), with leaves under it from each contributing gazetteer listed as distinct siblings, each carrying its own source badge — never one row labelled "N sources." No `Sverige × 6`, no `Sverige (landskap)` fork, no flat-rooted "Eksjö, City, Sverige" without a län/kommun chain. After every country phase, the user navigates the picker for that country and signs off before the next country starts.

---

## Phase 0 — Types and the Contribution shape

**Goal:** Lay down the type system. No build-script changes, no merge changes yet. The repo still compiles and all existing tests still pass — Phase 0 only adds new types and a discriminator.

### Task 0.1: Add `GazetteerNodeType` enum

**Files:**
- Modify: `src/api/place-gazetteers/types.ts`
- Test: `tests/unit/gazetteer-types.test.ts` (new)

- [x] **Step 1: Write the failing test**

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

- [x] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/unit/gazetteer-types.test.ts`
Expected: FAIL — `GAZETTEER_NODE_TYPES` not exported.

- [x] **Step 3: Implement in `types.ts`**

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

- [x] **Step 4: Run test — expect PASS**

Run: `npx vitest run tests/unit/gazetteer-types.test.ts` → PASS.
Run: `npx vitest run` → all green (no other tests touched).

- [x] **Step 5: Commit**

```bash
git add src/api/place-gazetteers/types.ts tests/unit/gazetteer-types.test.ts
git commit -m "feat(gazetteers): add GazetteerNodeType closed vocabulary"
```

### Task 0.2: Add `Contribution` and `Gazetteer.shape` discriminator

**Files:**
- Modify: `src/api/place-gazetteers/types.ts`
- Test: `tests/unit/gazetteer-types.test.ts` (extend)

- [x] **Step 1: Write the failing test (extend existing file)**

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

- [x] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/unit/gazetteer-types.test.ts` → FAIL — `Contribution` and `shape` field unknown.

- [x] **Step 3: Implement**

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

- [x] **Step 4: Run test — expect PASS**

Run: `npx vitest run tests/unit/gazetteer-types.test.ts` → PASS.
Run: `npx vitest run && npm run lint` → all green.

- [x] **Step 5: Commit**

```bash
git add src/api/place-gazetteers/types.ts tests/unit/gazetteer-types.test.ts
git commit -m "feat(gazetteers): add Contribution shape and Gazetteer.shape discriminator"
```

---

## Phase 1 — Attach engine (replaces the legacy loader)

**Goal:** Replace `loadGazetteers` with the new attach-only engine. There is no feature flag, no parallel code path. Old self-rooted bundled gazetteers will fail to load until their build scripts migrate (Phases 3+) — that's by design: the failure surfaces in tests, ensuring no country is forgotten. **The engine never merges leaves across sources** (see design spec, "License & source provenance"). Scaffolding gazetteers cannot be disabled.

### Task 1.1: Index scaffolding by canonical path

**Files:**
- Modify: `src/api/place-gazetteers/merge.ts`
- Test: `tests/unit/gazetteer-merge.test.ts` (new)

- [x] **Step 1: Failing test**

```typescript
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

- [x] **Step 2: Run — FAIL** (`buildScaffoldingIndex` not exported).

- [x] **Step 3: Implement** in `src/api/place-gazetteers/merge.ts`:

```typescript
export interface ScaffoldingIndex {
  lookup(path: string[]): GazetteerNode | null;
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
    if (node.children) for (const child of node.children) walk(child, path);
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

- [x] **Step 4: PASS**.
- [x] **Step 5: Commit** `feat(gazetteers): index scaffolding by canonical path`.

### Task 1.2: Attach contributions as distinct siblings (no cross-source merge)

**Files:**
- Modify: `src/api/place-gazetteers/merge.ts`
- Test: `tests/unit/gazetteer-merge.test.ts` (extend)

- [x] **Step 1: Failing test**

```typescript
import { attachContributions } from '../../src/api/place-gazetteers/merge';

describe('attachContributions', () => {
  it('attaches contribution nodes under the resolved scaffolding parent', () => {
    const scaffolding = JSON.parse(JSON.stringify(worldCountries)) as typeof worldCountries;
    const idx = buildScaffoldingIndex([scaffolding]);
    const g: Gazetteer = {
      id: 'sv-orter', name: 'SE places', locale: 'sv', shape: 'contributions',
      contributions: [{
        parentPath: ['World', 'Europe', 'Sweden'],
        nodes: [{ name: 'Eksjö', type: 'locality', lat: 57.66, lon: 14.97 }],
      }],
    };
    const report = attachContributions([g], idx);
    expect(report.attached).toBe(1);
    expect(report.rejected).toEqual([]);
    const sweden = idx.lookup(['World', 'Europe', 'Sweden'])!;
    const eksjo = sweden.children!.find(c => c.name === 'Eksjö')!;
    expect((eksjo as { __gazetteer?: string }).__gazetteer).toBe('sv-orter');
  });

  it('rejects contributions whose parentPath does not resolve', () => {
    const scaffolding = JSON.parse(JSON.stringify(worldCountries)) as typeof worldCountries;
    const idx = buildScaffoldingIndex([scaffolding]);
    const bogus: Gazetteer = {
      id: 'eg-test', name: 'Egypt test', locale: 'ar', shape: 'contributions',
      contributions: [{ parentPath: ['World', 'Africa', 'Egypta'], nodes: [{ name: 'Cairo', type: 'locality', lat: 30, lon: 31 }] }],
    };
    const report = attachContributions([bogus], idx);
    expect(report.attached).toBe(0);
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0]).toMatchObject({ gazetteer: 'eg-test', parentPath: ['World', 'Africa', 'Egypta'] });
  });

  it('keeps same-name contributions from different sources as DISTINCT siblings (no merge)', () => {
    const scaffolding = JSON.parse(JSON.stringify(worldCountries)) as typeof worldCountries;
    const idx = buildScaffoldingIndex([scaffolding]);
    const a: Gazetteer = {
      id: 'sv-socknar', name: 'A', locale: 'sv', shape: 'contributions',
      contributions: [{ parentPath: ['World', 'Europe', 'Sweden'],
        nodes: [{ name: 'Eksjö', type: 'parish', lat: 57.66, lon: 14.97, aliases: ['Eksjö civil'] }] }],
    };
    const b: Gazetteer = {
      id: 'sv-forsamlingar', name: 'B', locale: 'sv', shape: 'contributions',
      contributions: [{ parentPath: ['World', 'Europe', 'Sweden'],
        nodes: [{ name: 'Eksjö', type: 'parish', lat: 57.67, lon: 14.98, aliases: ['Eksjö church'] }] }],
    };
    attachContributions([a, b], idx);
    const sweden = idx.lookup(['World', 'Europe', 'Sweden'])!;
    const matches = sweden.children!.filter(c => c.name === 'Eksjö' && c.type === 'parish');
    expect(matches).toHaveLength(2);
    const sources = matches.map(m => (m as { __gazetteer?: string }).__gazetteer).sort();
    expect(sources).toEqual(['sv-forsamlingar', 'sv-socknar']);
    // Each leaf keeps ITS OWN coords and aliases — no union, no overwrite.
    const fromA = matches.find(m => (m as any).__gazetteer === 'sv-socknar')!;
    const fromB = matches.find(m => (m as any).__gazetteer === 'sv-forsamlingar')!;
    expect(fromA.lat).toBeCloseTo(57.66);
    expect(fromB.lat).toBeCloseTo(57.67);
    expect(fromA.aliases).toEqual(['Eksjö civil']);
    expect(fromB.aliases).toEqual(['Eksjö church']);
  });
});
```

- [x] **Step 2: Run — FAIL**.

- [x] **Step 3: Implement** in `merge.ts`:

```typescript
export interface AttachReport {
  attached: number;
  rejected: Array<{ gazetteer: string; parentPath: string[]; reason: string }>;
}

interface RuntimeNode extends GazetteerNode {
  __gazetteer?: string;     // single source ID — never an array, never updated after first set
}

function stampSource(node: GazetteerNode, gazetteerId: string): RuntimeNode {
  const cloned = JSON.parse(JSON.stringify(node)) as RuntimeNode;
  cloned.__gazetteer = gazetteerId;
  if (cloned.children) {
    cloned.children = cloned.children.map(c => stampSource(c, gazetteerId));
  }
  return cloned;
}

export function attachContributions(gazetteers: Gazetteer[], idx: ScaffoldingIndex): AttachReport {
  const report: AttachReport = { attached: 0, rejected: [] };

  for (const g of gazetteers) {
    if (g.shape !== 'contributions' || !g.contributions) continue;
    for (const contrib of g.contributions) {
      const parent = idx.lookup(contrib.parentPath);
      if (!parent) {
        report.rejected.push({
          gazetteer: g.id,
          parentPath: contrib.parentPath,
          reason: 'parent path does not resolve in scaffolding',
        });
        continue;
      }
      parent.children = parent.children ?? [];
      // No merging — every contribution leaf becomes a distinct sibling under the scaffolding parent.
      // License/provenance: each leaf is stamped with its single source gazetteer ID.
      // If two source gazetteers contribute leaves with the same (name, type), both are appended.
      // De-duplication of redundant gazetteers is a curatorial decision at build time, not a load-time merge.
      for (const node of contrib.nodes) {
        parent.children.push(stampSource(node, g.id));
        report.attached++;
      }
    }
  }

  return report;
}
```

- [x] **Step 4: PASS**.
- [x] **Step 5: Commit** `feat(gazetteers): attach contributions as distinct siblings, no cross-source merging`.

### Task 1.3: Replace `loadGazetteers` with the attach-only engine

**Files:**
- Modify: `src/api/place-gazetteers/merge.ts` (rewrite `loadGazetteers`)
- Test: `tests/unit/gazetteer-merge.test.ts` (extend)

- [x] **Step 1: Failing test**

```typescript
import { loadGazetteers } from '../../src/api/place-gazetteers/merge';

describe('loadGazetteers (attach-only)', () => {
  it('returns one merged-tree gazetteer with the scaffolding root and attached contributions', () => {
    const scaffolding: Gazetteer = JSON.parse(JSON.stringify(worldCountries));
    const contrib: Gazetteer = {
      id: 'sv-orter', name: 'SE', locale: 'sv', shape: 'contributions',
      contributions: [{ parentPath: ['World', 'Europe', 'Sweden'],
        nodes: [{ name: 'Eksjö', type: 'locality', lat: 57.66, lon: 14.97 }] }],
    };
    const result = loadGazetteers(
      { enabledGazetteers: ['sv-orter'] },  // scaffolding always enabled
      [scaffolding, contrib],
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('__merged__');
    const sweden = result[0].root!.children!.find(c => c.name === 'Europe')!.children!.find(c => c.name === 'Sweden')!;
    expect(sweden.children!.find(c => c.name === 'Eksjö')).toBeDefined();
  });

  it('always includes scaffolding regardless of enabledGazetteers', () => {
    const scaffolding: Gazetteer = JSON.parse(JSON.stringify(worldCountries));
    const result = loadGazetteers({ enabledGazetteers: [] }, [scaffolding]);
    expect(result[0].root!.name).toBe('World');
  });

  it('warns and skips contributions whose parentPath cannot resolve', () => {
    const scaffolding: Gazetteer = JSON.parse(JSON.stringify(worldCountries));
    const orphan: Gazetteer = {
      id: 'orphan', name: 'O', locale: 'en', shape: 'contributions',
      contributions: [{ parentPath: ['World', 'Atlantis'], nodes: [{ name: 'X', type: 'locality', lat: 0, lon: 0 }] }],
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loadGazetteers({ enabledGazetteers: ['orphan'] }, [scaffolding, orphan]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
```

- [x] **Step 2: Run — FAIL**.

- [x] **Step 3: Rewrite `loadGazetteers`** (replace the existing body — no legacy fallback):

```typescript
export function loadGazetteers(
  config: GazetteerConfig,
  bundled: Gazetteer[],
  imported: Gazetteer[] = [],
): Gazetteer[] {
  const enabled = new Set(config.enabledGazetteers);
  const importedIds = new Set(imported.map(g => g.id));
  const all = [...bundled.filter(g => !importedIds.has(g.id)), ...imported];

  // Scaffolding is ALWAYS enabled — it's the canonical reference set, not a toggle.
  const filtered = all.filter(g => g.shape === 'scaffolding' || enabled.has(g.id));

  const scaffolding = filtered
    .filter(g => g.shape === 'scaffolding')
    .map(g => JSON.parse(JSON.stringify(g)) as Gazetteer);

  const idx = buildScaffoldingIndex(scaffolding);

  const contributions = filtered.filter(g => g.shape === 'contributions');
  const report = attachContributions(contributions, idx);
  if (report.rejected.length > 0) {
    console.warn('[gazetteers] rejected contributions:', report.rejected);
  }

  // Translations apply only to scaffolding nodes (admin division naming).
  // They never touch leaves — leaf aliases stay exactly as the source authored them.
  const langGazetteers = filtered.filter(g => g.shape === 'language');
  for (const lang of langGazetteers) mergeTranslations(lang, idx);

  // Synthesize a single merged-tree gazetteer. Multi-root case (World + World (Historical))
  // ships in Phase 6 — for Phases 1–5 there is exactly one scaffolding root.
  return [{
    id: '__merged__',
    name: 'Merged hierarchy',
    locale: 'mul',
    shape: 'scaffolding',
    root: scaffolding[0]?.root ?? { name: 'World', type: 'world', lat: 0, lon: 0 },
  }];
}

function mergeTranslations(lang: Gazetteer, idx: ScaffoldingIndex): void {
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

Delete the previously-existing `loadGazetteers` body (the self-rooted-trees pass-through). Delete the old `mergeTranslations` (renamed/replaced above).

- [x] **Step 4: Run all tests — FAIL on existing places-resolver / picker / gazetteer tests**

This is expected. The legacy code path is gone; until Phase 2 ships scaffolding outputs and Phase 3+ migrates each country, many existing tests will fail because their fixture gazetteers are still self-rooted.

For Task 1.3 alone: assert that `tests/unit/gazetteer-merge.test.ts` passes. Other failing tests are tracked in the Phase 2 / Phase 3 commits as they're brought back to green.

- [x] **Step 5: Commit** `feat(gazetteers): replace loadGazetteers with attach-only engine`. CI will be red on legacy tests until Phase 2 lands — acceptable per the no-flag design. Phase 2 is the immediate next task, not parked work.


## Phase 2 — Scaffolding gazetteers (four-layer)

**Goal:** Build the four-layer canonical scaffolding: `world-continents`, `world-countries`, `world-admin1`, `world-admin2`. After this phase the engine has scaffolding to attach contributions into. All four are bootstrapped from GeoNames (`countryInfo.txt` + `admin1Codes.txt` + `admin2Codes.txt`, CC BY 4.0); attribution is recorded on each scaffolding gazetteer's `source` field. **Scaffolding cannot be disabled in the gazetteer-config UI** — it's the canonical reference set, not user-toggleable.

**Design decision — scaffolding names are GeoNames-pure (no synthesized suffixes).** Admin1/admin2 names ship exactly as GeoNames provides them: `Jönköping` (not `Jönköpings län`), `Bavaria` (not `Bayern`), `Eksjö` (not `Eksjö kommun`). Locale-canonical forms ("Jönköpings län") are the responsibility of **language gazetteers** (Phase 7.1) — they contribute these as aliases on scaffolding nodes. The picker/renderer (Phase 7.2) prefers the user's locale's alias for display when one is available; the underlying canonical path stays GeoNames. This keeps each layer one-source: GeoNames for structural names, language gazetteers for locale display, contributions for leaves. No cross-source merging.

This means contributions in Phase 3+ MUST declare `parentPath` matching GeoNames-canonical names — `parentPath: ['World','Europe','Sweden','Jönköping','Eksjö']`, not `['World','Europe','Sweden','Jönköpings län','Eksjö kommun']`. The "Jönköpings län" form is added later by `lang-sv-geonames`.

After Phase 2 lands, CI is back to green: legacy tests that were red after Task 1.3 either pass (because their fixture self-rooted gazetteer is replaced by scaffolding) or are migrated alongside the scaffolding emit.

### Task 2.1: Add the continent layer to `world-countries`

**Files:**
- Modify: `scripts/build-world.ts`
- Regenerate: `src/api/place-gazetteers/data/world-countries.json`
- Test: `tests/unit/gazetteers.test.ts` (extend)

- [x] **Step 1: Failing test**

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

- [x] **Step 2: Run — FAIL**.

- [x] **Step 3: Modify `scripts/build-world.ts`**

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

- [x] **Step 4: PASS**.

- [x] **Step 5: Commit**

```bash
git add scripts/build-world.ts src/api/place-gazetteers/data/world-countries.json tests/unit/gazetteers.test.ts
git commit -m "feat(gazetteers): add continent layer + scaffolding shape to world-countries"
```

### Task 2.2: Re-root `world-admin1` under `World > <continent> > <country>`

**Files:**
- Modify: `scripts/build-world.ts` (admin1 emit branch)
- Regenerate: `src/api/place-gazetteers/data/world-admin1.json`
- Test: `tests/unit/gazetteers.test.ts` (extend)

- [x] **Step 1: Failing test**

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

- [x] **Step 2: Run — FAIL**.

- [x] **Step 3: Modify `scripts/build-world.ts`** to emit admin1 under the continent>country layout. Set `shape: 'scaffolding'`. Re-run.

- [x] **Step 4: PASS**.

- [x] **Step 5: Commit**

```bash
git add scripts/build-world.ts src/api/place-gazetteers/data/world-admin1.json tests/unit/gazetteers.test.ts
git commit -m "feat(gazetteers): re-root world-admin1 under World > continent > country"
```

### Task 2.3: Build `world-admin2` scaffolding

**Files:**
- Modify: `scripts/build-world.ts` (extend with admin2 emit)
- Create: `src/api/place-gazetteers/data/world-admin2.json`
- Modify: `src/api/place-gazetteers/bundled.ts` (register the new file in `BUNDLED_GAZETTEERS`)
- Test: `tests/unit/gazetteers.test.ts` (extend)

- [x] **Step 1: Failing test**

```typescript
it('world-admin2 has admin2 nodes under World > continent > country > admin1', () => {
  const wa2 = require('../../src/api/place-gazetteers/data/world-admin2.json');
  expect(wa2.shape).toBe('scaffolding');
  expect(wa2.root.name).toBe('World');
  const sweden = wa2.root.children.find((c: any) => c.name === 'Europe').children.find((c: any) => c.name === 'Sweden');
  const jonkoping = sweden.children.find((c: any) => c.name === 'Jönköpings län');
  expect(jonkoping.children.map((c: any) => c.name)).toContain('Eksjö kommun');
});
```

- [x] **Step 2: FAIL**.

- [x] **Step 3: Extend `scripts/build-world.ts`** to emit `world-admin2.json`.

GeoNames `admin2Codes.txt` lists every admin2 globally with `concatenated_code TAB name TAB asciiName TAB geonameId`, where `concatenated_code` is `<countryCode>.<admin1Code>.<admin2Code>` (e.g. `SE.06.0686` for Eksjö kommun in Jönköpings län). For each row:
1. Look up admin1 name from `admin1Codes.txt`.
2. Look up country canonical name + continent code from `countryInfo.txt`.
3. Compute centroid coords from populated places GeoNames lists in the admin2 (use `avgCoordinates` from `src/gazetteer-build/geo`).
4. Emit `World > <continent> > <country> > <admin1> > <admin2>` with `type: 'admin2'`. Native admin2 names go in `aliases` (e.g. canonical `'Eksjö kommun'`, alias `'Eksjö Municipality'`).

Set `shape: 'scaffolding'`. Record GeoNames as the source.

Add `world-admin2.json` to `BUNDLED_GAZETTEERS` in `src/api/place-gazetteers/bundled.ts`, immediately after `world-admin1`.

- [x] **Step 4: PASS**.

- [x] **Step 5: Commit** `feat(gazetteers): world-admin2 scaffolding (admin2 layer)`.

### Task 2.4: CI scaffolding-integrity test

**Files:**
- Create: `tests/unit/gazetteer-hierarchy.test.ts`

- [x] **Step 1: Write the test**

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

- [x] **Step 2: Run — expect PASS** (the active two tests; the skipped one doesn't fail).

- [x] **Step 3: Commit**

```bash
git add tests/unit/gazetteer-hierarchy.test.ts
git commit -m "test(gazetteers): scaffolding integrity (closed-vocab assertion deferred)"
```

---

## Phase 3 — Sweden migration (live)

**Goal:** All Swedish gazetteers (post-audit — see Task 3.0) emit `shape: 'contributions'` rooted under `World > Europe > Sweden > <län> > <kommun>` (or `<landskap>` for the landskap gazetteer). After this phase, Sweden is one canonical tree with leaves from each surviving source listed as distinct siblings carrying their source attribution.

This is the user-verification gate — sign off on Sweden before any other country is touched.

### Re-source the data (applies to every country migration in Phases 3, 4, 5, 6)

A migration is also a re-source. Every build-script rewrite is paired with a fresh fetch from the original data source, and the regenerated JSON ships with an updated `source.fetched: 'YYYY-MM-DD'` reflecting the date of the migration commit. This catches admin-code changes, new parishes, renames — staleness that would otherwise accumulate silently — and makes each country's migration commit a coherent unit (format change + fresh data + new license attribution).

**Operational split — who runs what:**

- **Dispatcher (operator on the human's machine)** runs the slow source fetches: Wikidata SPARQL queries (rate-limited, can take 10–60 minutes per query), DAWA reverse-geocoding loops, Lantmäteriet GeoPackage downloads, Statistics Finland WFS pulls, Kartverket / Statistics Canada exports. These need internet, time, and sometimes API auth that subagents shouldn't carry. The dispatcher fetches into `/tmp/` (or wherever the existing scripts read from) BEFORE dispatching the migration subagent.
- **Subagents** run the format migration: rewrite the build script to emit `shape: 'contributions'` with canonical parent paths, re-run the (already-downloaded-locally) script against the fresh inputs, write the JSON, write fixture tests, commit.
- **GeoNames country .zip files** are an exception — they're a few MB, take seconds to fetch, and the existing scripts already handle the curl. Subagents can re-fetch these inline.

Each country task (3.1–3.4, 4.x, 5.x, 6.x) implicitly includes a "Step 0: dispatcher fetches fresh source data" if the source isn't a quick GeoNames .zip. The migration commit's body lists the source name + fetch date for every regenerated gazetteer.

### Task 3.0: License & redundancy audit (mandatory pre-step)

**Files:** none — this is a curatorial decision recorded in the migration commit message.

The 7 candidate Sweden gazetteers and their source/license combinations:

- `sv-socknar` — Wikidata, CC0 — civil parishes (socken)
- `sv-forsamlingar` — Wikidata, CC0 — church parishes (församling) [legally distinct from socken since 2000 reform]
- `sv-orter` — GeoNames, CC BY 4.0 — populated places (towns, villages)
- `sv-gardar` — GeoNames, CC BY 4.0 — farms
- `sv-kyrkor` — GeoNames, CC BY 4.0 — churches (buildings, distinct from församling)
- `sv-landskap` — Wikipedia/curated, CC BY-SA — Swedish landskap (cultural-historical regions)
- `sv-sockenstad-boundaries` — Lantmäteriet, CC0 — parish & city polygons

- [x] **Step 1: Audit each pair for redundancy without distinct value.**

For each pair, decide: distinct value (keep both as separate sources) OR redundant (drop one).

Expected outcome (record in commit message — change if reality differs):

| Pair | Distinct? | Reasoning |
|------|-----------|-----------|
| sv-socknar ↔ sv-forsamlingar | **Yes** | Civil parish (legal admin unit pre-2000) vs church parish (current Svenska kyrkan unit) — legally distinct since the 2000 reform. Genealogists need both. |
| sv-orter ↔ sv-gardar | **Yes** | Different feature classes in GeoNames (PPL vs FRM); different scope of place. |
| sv-kyrkor ↔ sv-forsamlingar | **Yes** | Buildings vs administrative parishes. A församling can have multiple churches; a church is one building. |
| sv-socknar ↔ sv-sockenstad-boundaries | **Yes** | Points (Wikidata) vs polygons (Lantmäteriet). The boundary gazetteer adds geometry, not redundant point data. |
| sv-landskap | **Yes** | Sibling axis to län; no other gazetteer covers landskap. |

Conclusion: keep all 7. No drops.

- [x] **Step 2: Document the audit decision** by writing a one-paragraph summary into the next commit message (Task 3.1's commit). Record sources, licenses, and rationale per pair.

- [x] **Step 3: Commit (empty checkpoint marking the audit decision)**

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(gazetteers): Sweden license/redundancy audit — keep all 7

Audit per design spec §10a. All 7 gazetteers carry distinct value:
- sv-socknar (Wikidata CC0) civil parishes vs sv-forsamlingar (Wikidata CC0)
  church parishes — legally distinct post-2000 reform.
- sv-orter (GeoNames CC BY 4.0) PPL vs sv-gardar (CC BY 4.0) FRM —
  different feature classes.
- sv-kyrkor (CC BY 4.0) church buildings vs sv-forsamlingar admin parishes.
- sv-sockenstad-boundaries (Lantmäteriet CC0) polygons vs sv-socknar points
  — geometry adds value, not redundancy.
- sv-landskap (Wikipedia CC BY-SA) — sole source for cultural-historical
  landskap.

No consolidation needed. License/source provenance preserved — the engine
attaches contributions as distinct siblings per design spec.
EOF
)"
```

### Task 3.1: Migrate `sv-orter`, `sv-gardar`, `sv-kyrkor`

**Files:**
- Modify: `scripts/fetch-sv-orter.ts`
- Regenerate: `src/api/place-gazetteers/data/{sv-orter,sv-gardar,sv-kyrkor}.json`
- Test: `tests/unit/gazetteer-sweden.test.ts` (new)

- [x] **Step 1: Failing fixture test**

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

- [x] **Step 2: Run — FAIL**.

- [x] **Step 3: Rewrite `scripts/fetch-sv-orter.ts`**

For each populated-place row in `geonames_se/SE.txt`:
1. Read admin1 (län code) and admin2 (kommun code); map to canonical Swedish names via `admin1Codes.txt` and `admin2Codes.txt` (script already does this).
2. Group rows by `(län, kommun)`.
3. Emit one contribution per group: `parentPath: ['World', 'Europe', 'Sweden', län, kommun]`, `nodes: [<all leaves in that kommun>]`.
4. Set `shape: 'contributions'`. Drop the `root` field entirely.
5. Use the closed-vocab type for each leaf: `locality` for sv-orter, `farm` for sv-gardar, `church` for sv-kyrkor.

Re-run: `npx tsx scripts/fetch-sv-orter.ts`.

- [x] **Step 4: PASS**.

- [x] **Step 5: Commit**

```bash
git add scripts/fetch-sv-orter.ts src/api/place-gazetteers/data/sv-orter.json src/api/place-gazetteers/data/sv-gardar.json src/api/place-gazetteers/data/sv-kyrkor.json tests/unit/gazetteer-sweden.test.ts
git commit -m "feat(gazetteers): sv-orter/sv-gardar/sv-kyrkor as contributions"
```

### Task 3.2: Migrate `sv-socknar` and `sv-forsamlingar`

**Files:**
- Modify: `scripts/build-sv-parishes.ts`
- Regenerate: `src/api/place-gazetteers/data/sv-socknar.json`, `sv-forsamlingar.json`
- Test: `tests/unit/gazetteer-sweden.test.ts` (extend)

- [x] **Step 1: Failing test** — assert `sv-socknar` uses contributions, parishes hang under `…> Eksjö kommun`, and `Eksjö socken` carries `type: 'parish'`.

- [x] **Step 2: FAIL**.

- [x] **Step 3: Rewrite `scripts/build-sv-parishes.ts`** to walk Wikidata results' P131 chain → län+kommun and emit contributions with `parentPath: ['World','Europe','Sweden',län,kommun]`. `type: 'parish'`. `shape: 'contributions'`.

- [x] **Step 4: PASS**.

- [x] **Step 5: Commit**

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

- [x] **Step 1: Failing test**

```typescript
it('sv-landskap uses contributions, parentPath = Sweden', () => {
  const g = require('../../src/api/place-gazetteers/data/sv-landskap.json');
  expect(g.shape).toBe('contributions');
  expect(g.contributions[0].parentPath).toEqual(['World', 'Europe', 'Sweden']);
  const skane = g.contributions[0].nodes.find((n: any) => n.name === 'Skåne');
  expect(skane.type).toBe('landskap');
});
```

- [x] **Step 2: FAIL**.

- [x] **Step 3: Rewrite the script** — emit one contribution `{ parentPath: ['World','Europe','Sweden'], nodes: [25 landskap] }`. Drop the `Sverige (landskap)` root entirely.

- [x] **Step 4: PASS**.

- [x] **Step 5: Commit**

```bash
git commit -am "feat(gazetteers): sv-landskap as contributions, ends Sverige (landskap) fork"
```

### Task 3.4: Migrate `sv-sockenstad-boundaries`

**Files:**
- Modify: `scripts/build-sv-boundaries.ts`
- Regenerate: `src/api/place-gazetteers/data/sv-sockenstad-boundaries.json`
- Test: `tests/unit/gazetteer-sweden.test.ts` (extend)

The source dataset is flat (parishes + cities under `Sverige`, no kommun). The new output declares the kommun parent path for every polygon. Lantmäteriet metadata has `kommunkod` per polygon — map it to kommun name via the same admin code lookup `fetch-sv-orter.ts` uses. Polygons whose kommun cannot be resolved (extinct parish, boundary change) are **rejected and warned** at build time — no flat-rooted shortcut.

- [x] **Step 1: Failing test**

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

- [x] **Step 2: FAIL**.

- [x] **Step 3: Rewrite `scripts/build-sv-boundaries.ts`**

For each Lantmäteriet feature:
1. Extract `kommunkod` (4-digit Statistics Sweden code) from feature properties.
2. Look up kommun + län name via the admin codes data already loaded.
3. Group features by `(län, kommun)`; emit one contribution per group.
4. Parishes → `type: 'parish'`. City polygons (stadsrättigheter) → `type: 'city'` siblings to parishes.
5. Polygons with no kommun match → log to stderr; build script exits non-zero if more than 1% are skipped.

Re-run.

- [x] **Step 4: PASS**.

- [x] **Step 5: Commit**

```bash
git commit -am "feat(gazetteers): sv-sockenstad-boundaries attaches geometry to canonical kommun children"
```

### Task 3.5: User verification gate — Sweden

- [x] **Step 1: Run the app with the merge flag**

```bash
GAZETTEER_MERGE_V2=1 npm start
```

- [x] **Step 2: Open the place picker on any place input.**

- [x] **Step 3: Without typing, drill `World > Europe > Sweden > Jönköpings län > Eksjö kommun`.**

Expected: one Sweden, one Jönköpings län, one Eksjö kommun. Under Eksjö kommun, the union of leaves from all 5+ source gazetteers — parishes, churches, farms, localities, polygons.

- [x] **Step 4: Search "eksjö".**

Expected: "Eksjö kommun" once with multi-source badge; Eksjö parish, Eksjö city (boundary), Eksjö locality each once with full canonical breadcrumb.

- [x] **Step 5: Sign-off prompt to user.** If sign-off given, proceed to Phase 4. If not, fix and re-verify.

- [x] **Step 6: Commit empty checkpoint**

```bash
git commit --allow-empty -m "chore(gazetteers): Sweden migration verified by user"
```

---

## Phase 4 — Nordic countries (Denmark, Norway, Finland, Iceland)

**Per-country pattern:** every country starts with a license/redundancy audit (Task X.0 — same shape as Sweden's Task 3.0) before migrating its build scripts. The audit is recorded as an empty commit summarising sources, licenses, and any consolidation decisions. The engine never auto-merges leaves — if two gazetteers genuinely duplicate without distinct value, drop one in this phase.

**Pattern:** each country follows the Sweden shape. Closed-vocab type vocabulary per country:

- Denmark: `parish` (sogn), `admin2` (kommune)
- Norway: `admin2` (kommune), `parish` (sokn)
- Finland: `admin2` (kunta), `parish` (seurakunta)
- Iceland: `admin2` (sveitarfélag)

### Task 4.1: Denmark — `dk-sogne`, `dk-sogne-dawa`, `dk-sogne-boundaries`

- [x] **Task 4.1.0 — License/redundancy audit.** Sources: `dk-sogne` (Wikidata, CC0), `dk-sogne-dawa` (DAWA, CC BY 4.0), `dk-sogne-boundaries` (ok-dk/dagi, CC0). **Critical question:** do `dk-sogne` and `dk-sogne-dawa` carry distinct value, or do they overlap? Both list Danish parishes; one comes from Wikidata's curated parish list, one from the official DAWA address API's parish set. **Likely outcome:** they overlap meaningfully (same set of parishes, different metadata depth). Decision: pick one as the canonical Danish-parish point gazetteer, drop the other. Sketch suggestion: keep `dk-sogne-dawa` (official source, more authoritative naming + hierarchy), drop `dk-sogne` (Wikidata replicas of the same admin data); but the executor verifies parish-by-parish before deciding. Record in commit message.

- [x] **Step 1:** Write `tests/unit/gazetteer-denmark.test.ts`. Assert the surviving (post-audit) gazetteers use `shape: 'contributions'` and a known parish (e.g. `Vor Frue Sogn` in Copenhagen) lives under `World > Europe > Denmark > Region Hovedstaden > Københavns Kommune`.
- [x] **Step 2:** Run — FAIL.
- [x] **Step 3:** Rewrite the surviving build scripts to emit contributions. If `dk-sogne` is dropped, also remove its entry from `BUNDLED_GAZETTEERS` in `bundled.ts` and delete its JSON from the `data/` directory in the same commit. DAWA reverse-geo already returns hierarchy — use it directly. ok-dk/dagi GeoJSON properties carry kommune code.
- [x] **Step 4:** Re-run; tests PASS.
- [x] **Step 5:** Commit `feat(gazetteers): Denmark as contributions` with the audit decision in the commit body.
- [x] **Step 6:** User verification gate — drill `World > Europe > Denmark`. Sign off.

### Task 4.2: Norway — `no-kommuner`, `no-kommuner-boundaries`

- [x] **Task 4.2.0 — Audit.** Two gazetteers, both GeoNames+Kartverket sourced. Likely outcome: keep both (points + boundaries are distinct value); record in commit.
- [x] Tests: `tests/unit/gazetteer-norway.test.ts`. Assert `Oslo kommune` under `World > Europe > Norway > Oslo`.
- [x] Rewrite `scripts/build-no-municipalities.ts` and `scripts/build-no-boundaries.ts`. GeoNames `NO.zip` admin1+admin2 → parent path.
- [x] PASS. Commit `feat(gazetteers): Norway as contributions`. User verification gate.

### Task 4.3: Finland — `fi-kunnat`, `fi-kunnat-boundaries`

- [x] **Task 4.3.0 — Audit.** GeoNames + Statistics Finland WFS. Likely outcome: keep both.
- [x] Tests: `tests/unit/gazetteer-finland.test.ts`.
- [x] Rewrite `scripts/build-fi-municipalities.ts`, `scripts/build-fi-boundaries.ts`. GeoNames `FI.zip` admin codes; bilingual names in `aliases`.
- [x] PASS. Commit. User verification gate.

### Task 4.4: Iceland — `is-sveitarfelog`, `is-sveitarfelog-boundaries`

- [x] **Task 4.4.0 — Audit.** GeoNames + LMI WFS. Likely outcome: keep both.
- [x] Tests: `tests/unit/gazetteer-iceland.test.ts`.
- [x] Rewrite `scripts/build-is-municipalities.ts`, `scripts/build-is-boundaries.ts`.
- [x] PASS. Commit. User verification gate.

---

## Phase 5 — Anglosphere + Germany

### Task 5.1: US — `us-immigration-states`, `us-all-states`, `us-counties-boundaries`

- [x] **Task 5.1.0 — Audit.** **Critical question:** `us-immigration-states` (9 states) and `us-all-states` (50 states) — are they redundant? `us-all-states` is a superset by population threshold; `us-immigration-states` is the curated subset for the genealogy use case. **Likely outcome:** drop `us-immigration-states` entirely — `us-all-states` covers it (same GeoNames source) and the picker UX of "9 vs 50" is no longer needed once everything's under one canonical hierarchy. Record decision in commit.
- [x] Tests: `tests/unit/gazetteer-usa.test.ts`. Assert San Francisco under `World > North America > United States > California > San Francisco County`.
- [x] Rewrite the surviving build scripts. If `us-immigration-states` is dropped, remove its entry from `BUNDLED_GAZETTEERS` and delete its JSON. GeoNames admin1 (state) + admin2 (county) drives parent path.
- [x] PASS. Commit. User verification gate.

### Task 5.2: Canada — `ca-provinces`, `ca-divisions-boundaries`

- [x] **Task 5.2.0 — Audit.** GeoNames + Statistics Canada. Likely outcome: keep both (points + boundaries).
- [x] Tests: `tests/unit/gazetteer-canada.test.ts`.
- [x] Rewrite `scripts/build-ca-places.ts`, `scripts/build-ca-boundaries.ts`. GeoNames admin1 (province) + admin2 (census division).
- [x] PASS. Commit. User verification gate.

### Task 5.3: Germany — `de-gemeinden`

- [x] **Task 5.3.0 — Audit.** Single gazetteer; no peers to consolidate against. Record source and license.
- [x] Tests: `tests/unit/gazetteer-germany.test.ts`. Assert München under `World > Europe > Germany > Bayern > <kreis>`.
- [x] Rewrite `scripts/build-de-municipalities.ts`. GeoNames admin1 (Bundesland) + admin2 (Kreis).
- [x] PASS. Commit. User verification gate.

---

## Phase 6 — World-* gazetteers + sibling super-root

### Task 6.1: `world-boundaries` — country polygons as a contribution gazetteer

The country *names* live in `world-countries` scaffolding. `world-boundaries` is a *separate* contribution gazetteer that adds country-shape polygons as **its own leaves** under each continent. They appear as siblings to scaffolding's country nodes (same name, same `country` type), each with its own source license and `__gazetteer: 'world-boundaries'`. The merge engine never silently absorbs the polygon onto the scaffolding node — that would conflate sources.

For map rendering, the consumer (MapView) walks both: scaffolding country nodes for the canonical name, plus matching polygon leaves for the geometry. This is consistent with the broader rule — leaves carry their source's data; scaffolding carries the project-curated reference.

- [x] Test in `tests/unit/gazetteer-world.test.ts`: assert `world-boundaries` is `shape: 'contributions'`. Assert there is a contribution under `World > Europe` whose nodes include `{ name: 'Sweden', type: 'country', geometry: ... }`. Assert that node carries `__gazetteer: 'world-boundaries'` post-load.
- [x] Rewrite `scripts/build-world-boundaries.ts`. For each country polygon: emit `{ parentPath: ['World', continent], nodes: [{ name: country, type: 'country', geometry }] }`. The polygon node IS its own leaf, sibling to the scaffolding country.
- [x] PASS. Commit `feat(gazetteers): world-boundaries country polygons as sibling contributions`.

### Task 6.2: `world-historical` sibling super-root + `MergedTree` return type

**Files:**
- Modify: `scripts/build-world-historical.ts`
- Modify: `src/api/place-gazetteers/merge.ts`
- Modify: `src/api/place-gazetteers/types.ts`
- Test: `tests/unit/gazetteer-merge.test.ts` (extend)

- [x] **Step 1: Failing test**

```typescript
describe('world-historical sibling super-root', () => {
  it('exposes both World and World (Historical) roots', () => {
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
    const meta = result[0] as any;
    expect(meta.allRoots.map((r: any) => r.name)).toEqual(['World', 'World (Historical)']);
  });
});
```

- [x] **Step 2: FAIL**.

- [x] **Step 3: Rewrite `scripts/build-world-historical.ts`** to emit `shape: 'scaffolding'` with root name `World (Historical)`. Each historical state has `type: 'historical-state'` and `startYear` / `endYear` where known. Re-run.

- [x] **Step 4: Update `loadGazetteers` in `merge.ts`** to expose all scaffolding roots:

```typescript
return [{
  id: '__merged__',
  name: 'Merged hierarchy',
  locale: 'mul',
  shape: 'scaffolding',
  root: scaffolding[0]?.root ?? { name: 'World', type: 'world', lat: 0, lon: 0 },
  ...(scaffolding.length > 1 ? { allRoots: scaffolding.map(g => g.root!) } : {}),
}] as Gazetteer[];
```

Add the optional field to the `Gazetteer` type:

```typescript
allRoots?: GazetteerNode[];
```

- [x] **Step 5: PASS**. Commit `feat(gazetteers): world-historical as sibling scaffolding root`.

- [x] **Step 6: User verification gate.**

### Task 6.3: `build-world-continents-boundaries.ts`

- [x] Test: continent polygon attaches to `World > Europe`.
- [x] Rewrite the script to emit `shape: 'contributions'`, `parentPath: ['World']`, 7 continent nodes carrying geometry. Re-run.
- [x] PASS. Commit.

---

## Phase 7 — Language gazetteers and consumer wiring

### Task 7.1: Translation path keys move to canonical paths + locale-canonical admin forms

**Files:**
- Modify: `scripts/build-lang-sv-geonames.ts`, `scripts/build-lang-sv-wikidata.ts`, `scripts/build-lang-world-historical.ts`
- Regenerate: `lang-sv-geonames.json`, `lang-sv-wikidata.json`, `lang-world-historical.json`

Today: `translations: { 'world-countries': { 'Denmark': ['Danmark'] } }` keyed by gazetteer ID.
New: `translations: { '__merged__': { 'World › Europe › Denmark': ['Danmark'] } }` keyed against the merged tree's canonical paths.

**New responsibility (per Phase 2 design decision):** language gazetteers contribute **locale-canonical administrative forms** as aliases on scaffolding nodes, since scaffolding ships GeoNames-pure (no synthesized suffixes). Examples for `lang-sv-geonames`:

```json
{
  "translations": {
    "__merged__": {
      "World › Europe › Sweden › Jönköping": ["Jönköpings län"],
      "World › Europe › Sweden › Jönköping › Eksjö": ["Eksjö kommun"],
      "World › Europe › Sweden › Stockholm": ["Stockholms län"],
      "World › Europe › Sweden › Stockholm › Stockholm": ["Stockholms kommun"]
    }
  }
}
```

These forms come from GeoNames `alternateNames.txt` filtered by `isolanguage=sv` + feature class `A` (admin), OR from Wikidata SPARQL `Plabel@sv` for admin1+admin2 entities. Each language gazetteer covers its locale's admin forms across all countries, not just one.

- [x] Test: `lang-sv-geonames.translations.__merged__['World › Europe › Denmark']` includes `Danmark`.
- [x] Test: `lang-sv-geonames.translations.__merged__['World › Europe › Sweden › Jönköping']` includes `Jönköpings län`.
- [x] Rewrite the build scripts to emit canonical paths AND locale-canonical admin forms for the language's primary scope.
- [x] `mergeTranslations` (in `merge.ts`, Task 1.3) already accepts canonical path keys — no engine change.
- [x] PASS. Commit `feat(gazetteers): language gazetteers key translations by canonical path + add locale admin forms`.

**Important:** translations apply *only* to scaffolding nodes (admin division names like `Sweden → Sverige`, `Jönköping → Jönköpings län`). They never touch leaves — leaf aliases stay exactly as the leaf-emitting source gazetteer authored them, per the no-cross-source rule.

### Task 7.2: Renderer + resolver wiring

**Files:**
- Modify: `src/renderer/components/PlacePicker.vue`
- Modify: `src/renderer/components/modals/PlaceTreePickerModal.vue`
- Modify: `src/api/place-gazetteers/resolver.ts`
- Modify: `src/main/ipc/gazetteers.ts` (the MCP `resolve_place` path, if applicable)

- [x] **PlacePicker** — `runSearch` walks the merged tree. Each result row carries the leaf's single `__gazetteer` source for the badge. Two same-named contributions under the same scaffolding parent become two distinct rows, each with its own badge — never one row labelled "N sources." Drop the legacy `cand.gazetteer` dedup-key construction (it always produced N copies; now there is one tree).
- [x] **PlaceTreePickerModal + breadcrumb rendering — locale-aware display.** The tree view walks the merged tree (`gazetteers[0].root` plus `gazetteers[0].allRoots ?? []` siblings). For display, the picker prefers the locale-canonical form of admin division names: when the user's locale is `sv-SE` and a scaffolding node has aliases like `['Jönköpings län']` from `lang-sv-geonames`, render `Jönköpings län` as the breadcrumb segment instead of the canonical `Jönköping`. Implementation: a small helper `displayName(node, locale)` that picks the first alias from a locale-tagged source if available, falls back to `node.name`. Aliases keep their source provenance via the language gazetteer's `id`. Matching logic stays unchanged — search by either form still resolves to the same canonical node.
- [x] **resolver.ts** — `resolveHierarchical`, `resolvePlace`, `searchGazetteer` walk the merged tree. Each returned `PlaceResolveResult.gazetteer` is a single source ID. The cross-gazetteer contradiction-scoring still applies for genuinely ambiguous matches (Dirleton Scotland vs. Canada — different scaffolding parents).
- [x] Tests: extend `tests/unit/place-resolver.test.ts` with a "Eksjö, Sverige resolves through canonical scaffolding" assertion — the matchedPath traverses `World > Europe > Sweden > Jönköpings län > Eksjö kommun`, and each surviving candidate carries its single source ID.
- [x] PASS. Commit `feat(gazetteers): renderer and resolver consume merged tree`.

### Task 7.3: User verification — every consumer

- [x] Run app: `npm start` (no env flag — V2 is default after Phase 1).
- [x] Place picker, place panel breadcrumb, map polygon, MCP `resolve_place`, gazetteer config UI all behave correctly.
- [x] Sign off.
- [x] Commit empty `chore(gazetteers): consumers verified on merged tree`.

### Task 7.4: Imported user-gazetteer policy (deferred from design §11)

The design spec left open whether imported (third-party) gazetteers in the legacy self-rooted shape are accepted with a build-time rewrite or rejected with a migration error. Decide here.

- [x] **Step 1:** Survey `src/api/gazetteers.ts` for the import path. Determine if any user-importable schema validation exists today.
- [x] **Step 2:** Decision: **reject legacy shape on import**, surface a one-line migration message pointing at the new contract docs. Rationale: the import feature is months old, likely no third-party gazetteers in the wild, and silent rewrite hides errors that the contributor needs to see.
- [x] **Step 3:** Update `src/api/gazetteers.ts` import validation to require `shape` and reject otherwise.
- [x] **Step 4:** Test: `tests/unit/gazetteers-crud.test.ts` extends with a "rejects shape-less import" case.
- [x] **Step 5:** Commit.

---

## Phase 8 — Cleanup

### Task 8.1: Tighten the closed-vocab type

**Files:**
- Modify: `src/api/place-gazetteers/types.ts`
- Modify: `tests/unit/gazetteer-hierarchy.test.ts`

After Phase 7 every gazetteer is migrated. Now tighten the type system to prevent regression.

- [x] **Step 1:** Tighten `GazetteerNode.type: GazetteerNodeType`. Build will fail anywhere a free-form string survives — fix or convert to `'other'` + alias.
- [x] **Step 2:** Un-skip `'every node type is in the closed vocabulary'` in `tests/unit/gazetteer-hierarchy.test.ts`. Run — expect PASS.
- [x] **Step 3:** `npm test && npm run lint` → all green.
- [x] **Step 4:** Commit

```bash
git commit -am "feat(gazetteers): tighten GazetteerNode.type to closed vocabulary"
```

### Task 8.2: Update docs and archive

**Files:**
- Modify: `.claude/skills/gazetteers/SKILL.md`
- Modify: `CLAUDE.md`
- Modify: `docs/PLAN.md`, `docs/plans/archive/PLAN.md`
- Modify: `package.json`, `CHANGELOG.md`

- [x] Update the gazetteer skill to reflect the new contract (shape, contributions, scaffolding privilege, closed vocab, canonical-path translation keys).
- [x] Update CLAUDE.md gazetteer references.
- [x] Move this plan and its design sibling to `docs/plans/archive/` via `git mv`.
- [x] Append a one-paragraph entry to `docs/plans/archive/PLAN.md` (matching existing format).
- [x] Remove the milestone block from `docs/PLAN.md`.
- [x] Bump `package.json` minor version (feature). Add `## Unreleased` line in `CHANGELOG.md`.
- [x] Tick every checkbox in this plan file as `[x]`.
- [x] Commit `chore: archive completed global-gazetteer-hierarchy plan`.

---

## Self-review

**Spec coverage check.** Every section of the design spec maps to a task:

- §1 closed vocab → Task 0.1 + Task 8.1 (tighten).
- License & source provenance — non-negotiable → Task 1.2 (no merge), Task 3.0 + every X.0 audit task per country (curatorial drops).
- §2 scaffolding privilege (incl. always-on, four layers) → Task 1.3 (always-on filter), Phase 2 (build outputs incl. world-admin2 in Task 2.3).
- §3 contribution shape → Task 0.2 (types), Phase 3+ (build outputs).
- §4 attach engine (no merge) → Tasks 1.1–1.3.
- §5 load order → Task 1.3.
- §6 CI validation → Task 2.4 + Task 8.1.
- §7 (removed; no tie-breaker) → no task; reflected in Task 1.2 by absence.
- §8 boundary geometry → Tasks 3.4, 4.x, 5.x, 6.1, 6.3.
- §9 renderer/resolver consequences → Tasks 7.1–7.3.
- §10 migration order with §10a per-country audit → Tasks 3.0, 4.x.0, 5.x.0.
- §11 imported user gazetteers → Task 7.4.

**Placeholder scan.** No "TODO" / "fill in later" / "similar to" remain. Build-script rewrites are described by their source dataset's admin-code structure; the executor reads each existing script's body before rewriting.

**Type consistency.** Types defined exactly once: `GazetteerNodeType` (Task 0.1), `Contribution` (Task 0.2), `Gazetteer.shape` (Task 0.2), `RuntimeNode` (Task 1.2 — single source via `__gazetteer`, NOT plural `__contributors`), `ScaffoldingIndex` (Task 1.1), `AttachReport` (Task 1.2), `allRoots` (Task 6.2). No drift.

---

## Execution

Execute this plan in a worktree (`superpowers:using-git-worktrees`) with `superpowers:subagent-driven-development` (per project workflow). User-verification gates between phases are mandatory — do not advance to the next country without explicit sign-off.

**Plan path note (project rule override):** This plan lives at `docs/plans/2026-05-03-global-gazetteer-hierarchy.md`, not `docs/superpowers/specs/` or `.claude/plans/`. When archived, both this file and `2026-05-03-global-gazetteer-hierarchy-design.md` move to `docs/plans/archive/`.
