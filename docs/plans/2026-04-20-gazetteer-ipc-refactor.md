# Gazetteer IPC Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Vite from OOMing on CI builds by moving the ~40 MB of bundled gazetteer JSON out of the renderer bundle, shipping it via a new IPC channel instead.

**Architecture:** Split `src/api/place-gazetteers/index.ts` into `bundled.ts` (main-only, holds the 25 static JSON imports) and `merge.ts` (pure, renderer-safe). The `index.ts` becomes a barrel re-exporting `merge + resolver + types` but NOT `bundled`. Renderer fetches bundled gazetteers once per window via a new `gazetteers:getBundled` IPC channel, then resolves synchronously as today.

**Tech Stack:** TypeScript, Electron IPC, Vue 3 Composition API, Vitest.

**Spec:** [docs/plans/2026-04-20-gazetteer-ipc-refactor-design.md](2026-04-20-gazetteer-ipc-refactor-design.md)

---

## Parallelism map

Tasks run sequentially except where noted. After Task 3, Tasks 4 and 5 are independent; after Task 5, Tasks 6 and 7 are independent.

```
Task 1 → Task 2 → Task 3 → ┬→ Task 4 ─→┬→ Task 6 ─→┬→ Task 8
                           │            │           │
                           └→ Task 5 ──→┴→ Task 7 ──┘
```

---

## Task 1: Update `loadGazetteers` test file to drive the new shape (RED)

**Files:**
- Modify: `tests/unit/place-gazetteers.test.ts`

Context: the test file is the canary that proves the refactor preserves behavior. By updating imports to target the new files (`merge.ts`, `bundled.ts`) and passing the new 3-arg signature explicitly, running the test fails until Task 2 creates those files.

- [ ] **Step 1: Update imports in the test file**

In `tests/unit/place-gazetteers.test.ts` line 3, replace:

```ts
import { loadGazetteers, getAllGazetteers } from '../../src/api/place-gazetteers/index';
```

with:

```ts
import { loadGazetteers } from '../../src/api/place-gazetteers/merge';
import { getAllGazetteers } from '../../src/api/place-gazetteers/bundled';
```

- [ ] **Step 2: Update all `loadGazetteers(config, ...)` call sites in the test file**

`loadGazetteers` now takes `(config, bundled, imported?)` instead of `(config, imported?)`. Every call in the test file needs a bundled-array argument inserted.

Find each `loadGazetteers(config)` — no second arg — and change to `loadGazetteers(config, getAllGazetteers())`. The occurrences (line numbers from the current file; verify with `grep -n` before editing):
- Line 365: `const result = loadGazetteers(config);` → `const result = loadGazetteers(config, getAllGazetteers());`
- Line 371: `const result = loadGazetteers(config);` → `const result = loadGazetteers(config, getAllGazetteers());`
- Line 380: `const result = loadGazetteers(config);` → `const result = loadGazetteers(config, getAllGazetteers());`
- Line 396: `const gazetteers = loadGazetteers(config);` → `const gazetteers = loadGazetteers(config, getAllGazetteers());`

Find each `loadGazetteers(config, [someArray])` — imported as second arg — and change to `loadGazetteers(config, getAllGazetteers(), [someArray])`. The occurrences:
- Line 307: `loadGazetteers(config, [worldGazetteer, langSvGeonames])` → `loadGazetteers(config, getAllGazetteers(), [worldGazetteer, langSvGeonames])`
- Line 323: same change
- Line 341: `loadGazetteers(config, [worldGazetteer, langWithExisting])` → `loadGazetteers(config, getAllGazetteers(), [worldGazetteer, langWithExisting])`
- Line 350: same as 307
- Line 356: `loadGazetteers(config, [worldGazetteer])` → `loadGazetteers(config, getAllGazetteers(), [worldGazetteer])`

Verify with `grep -n "loadGazetteers(" tests/unit/place-gazetteers.test.ts` before and after — the count should match and every call must now have at least 2 args.

- [ ] **Step 3: Run the test to confirm it fails with module-resolution errors**

Run:

```bash
npx vitest run tests/unit/place-gazetteers.test.ts
```

Expected: FAIL with errors like `Cannot find module '../../src/api/place-gazetteers/merge'` and `...bundled`. This proves the test drives the new structure.

- [ ] **Step 4: Do NOT commit yet.** The test file is now broken; Task 2 creates the missing modules and makes it pass.

---

## Task 2: Create `bundled.ts` and `merge.ts` (GREEN)

**Files:**
- Create: `src/api/place-gazetteers/bundled.ts`
- Create: `src/api/place-gazetteers/merge.ts`

Context: move the static JSON imports into `bundled.ts` (main-only) and the pure merge logic into `merge.ts` (renderer-safe). `index.ts` remains untouched this task — Task 3 converts it to a barrel. After this task the test from Task 1 should pass.

- [ ] **Step 1: Create `src/api/place-gazetteers/bundled.ts`**

Write exactly this content (copied verbatim from the static-imports block of the existing `index.ts`):

```ts
import type { Gazetteer, GazetteerNode } from './types';
// Swedish
import svSocknar from './data/sv-socknar.json';
import svForsamlingar from './data/sv-forsamlingar.json';
import svOrter from './data/sv-orter.json';
import svGardar from './data/sv-gardar.json';
import svKyrkor from './data/sv-kyrkor.json';
import svSockenstadBoundaries from './data/sv-sockenstad-boundaries.json';
// Danish
import dkSogne from './data/dk-sogne.json';
import dkSogneDawa from './data/dk-sogne-dawa.json';
// Norwegian
import noKommuner from './data/no-kommuner.json';
// Finnish
import fiKunnat from './data/fi-kunnat.json';
// Icelandic
import isSveitarfelog from './data/is-sveitarfelog.json';
// North American
import usImmigrationStates from './data/us-immigration-states.json';
import usAllStates from './data/us-all-states.json';
import caProvinces from './data/ca-provinces.json';
// Global
import worldCountries from './data/world-countries.json';
import worldAdmin1 from './data/world-admin1.json';
// Language gazetteers
import langSvGeonames from './data/lang-sv-geonames.json';
import langSvWikidata from './data/lang-sv-wikidata.json';
// Boundary gazetteers
import dkSogneBoundaries from './data/dk-sogne-boundaries.json';
import noKommunerBoundaries from './data/no-kommuner-boundaries.json';
import fiKunnatBoundaries from './data/fi-kunnat-boundaries.json';
import isSveitarfelogBoundaries from './data/is-sveitarfelog-boundaries.json';
import usCountiesBoundaries from './data/us-counties-boundaries.json';
import caDivisionsBoundaries from './data/ca-divisions-boundaries.json';
import worldBoundaries from './data/world-boundaries.json';

// Historical Swedish county (län) names → modern equivalents.
// These were renamed in the 1997 county reform.
const HISTORICAL_LAN_ALIASES: Record<string, string[]> = {
  'Dalarnas län': ['Kopparbergs län', 'Kopparbergs'],
  'Västra Götalands län': ['Älvsborgs län', 'Älvsborgs', 'Skaraborgs län', 'Skaraborgs', 'Göteborgs och Bohus län'],
  'Skåne län': ['Malmöhus län', 'Malmöhus', 'Kristianstads län', 'Kristianstads'],
};

function enrichHistoricalAliases(gaz: Gazetteer): Gazetteer {
  if (!gaz.root.children) return gaz;
  for (const child of gaz.root.children) {
    const extra = HISTORICAL_LAN_ALIASES[child.name];
    if (extra) {
      const existing = new Set(child.aliases ?? []);
      const merged = [...(child.aliases ?? [])];
      for (const alias of extra) {
        if (!existing.has(alias)) merged.push(alias);
      }
      (child as GazetteerNode).aliases = merged;
    }
  }
  return gaz;
}

const BUNDLED_GAZETTEERS: Gazetteer[] = [
  // Swedish
  svSocknar as Gazetteer,
  svForsamlingar as Gazetteer,
  svOrter as Gazetteer,
  svGardar as Gazetteer,
  svKyrkor as Gazetteer,
  svSockenstadBoundaries as Gazetteer,
  // Danish
  dkSogne as Gazetteer,
  dkSogneDawa as Gazetteer,
  // Norwegian
  noKommuner as Gazetteer,
  // Finnish
  fiKunnat as Gazetteer,
  // Icelandic
  isSveitarfelog as Gazetteer,
  // North American
  usImmigrationStates as Gazetteer,
  usAllStates as Gazetteer,
  caProvinces as Gazetteer,
  // Global
  worldCountries as Gazetteer,
  worldAdmin1 as Gazetteer,
  // Language gazetteers
  langSvGeonames as Gazetteer,
  langSvWikidata as Gazetteer,
  // Boundary gazetteers
  dkSogneBoundaries as Gazetteer,
  noKommunerBoundaries as Gazetteer,
  fiKunnatBoundaries as Gazetteer,
  isSveitarfelogBoundaries as Gazetteer,
  usCountiesBoundaries as Gazetteer,
  caDivisionsBoundaries as Gazetteer,
  worldBoundaries as Gazetteer,
].map(enrichHistoricalAliases);

export function getAllGazetteers(): Gazetteer[] {
  return BUNDLED_GAZETTEERS;
}
```

- [ ] **Step 2: Create `src/api/place-gazetteers/merge.ts`**

Write exactly this content. The only behavioral change vs. today's `loadGazetteers` in `index.ts` is the added `bundled` parameter; all merge / filter / translation logic is identical.

```ts
import type { Gazetteer, GazetteerConfig, GazetteerNode } from './types';

/**
 * Find a node in the tree by path key.
 * Bare key ("Denmark") — match first node by name at any depth.
 * Path key ("Germany > Bavaria") — walk down matching each ancestor from root's children.
 */
function findNodeByPath(root: GazetteerNode, pathKey: string): GazetteerNode | null {
  const parts = pathKey.split(' > ');
  if (parts.length === 1) {
    function walk(node: GazetteerNode): GazetteerNode | null {
      if (node.name === parts[0]) return node;
      if (node.children) {
        for (const child of node.children) {
          const found = walk(child);
          if (found) return found;
        }
      }
      return null;
    }
    if (root.name === parts[0]) return root;
    if (root.children) {
      for (const child of root.children) {
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  }
  let current: GazetteerNode | null = root;
  for (const part of parts) {
    if (!current.children) return null;
    const child = current.children.find(c => c.name === part);
    if (!child) {
      if (current === root && current.name === part) continue;
      return null;
    }
    current = child;
  }
  return current;
}

/**
 * Merge language gazetteer translations into target gazetteers as aliases.
 * Mutates target gazetteer nodes in place.
 */
function mergeTranslations(langGaz: Gazetteer, targets: Gazetteer[]): void {
  if (!langGaz.translations) return;
  const targetMap = new Map(targets.map(g => [g.id, g]));

  for (const [targetId, translations] of Object.entries(langGaz.translations)) {
    const target = targetMap.get(targetId);
    if (!target) continue;

    for (const [pathKey, names] of Object.entries(translations)) {
      const node = findNodeByPath(target.root, pathKey);
      if (!node) continue;

      const existing = new Set(node.aliases ?? []);
      const merged = [...(node.aliases ?? [])];
      for (const name of names) {
        if (!existing.has(name)) {
          merged.push(name);
          existing.add(name);
        }
      }
      (node as GazetteerNode).aliases = merged;
    }
  }
}

export function loadGazetteers(
  config: GazetteerConfig,
  bundled: Gazetteer[],
  imported: Gazetteer[] = [],
): Gazetteer[] {
  const enabled = new Set(config.enabledGazetteers);

  // Imported overrides bundled when ids collide
  const importedIds = new Set(imported.map(g => g.id));
  const all = [...bundled.filter(g => !importedIds.has(g.id)), ...imported];
  const filtered = all.filter(g => enabled.has(g.id));

  // Separate language gazetteers from point/boundary
  const langGazetteers = filtered.filter(g => g.kind === 'language');
  const dataGazetteers = filtered.filter(g => g.kind !== 'language');

  // Nothing to merge — return as-is
  if (langGazetteers.length === 0) return dataGazetteers;

  // Clone data gazetteers before mutating so bundled singletons stay clean
  const cloned: Gazetteer[] = dataGazetteers.map(g => JSON.parse(JSON.stringify(g)) as Gazetteer);

  // Merge translations into cloned data gazetteers
  for (const lang of langGazetteers) {
    mergeTranslations(lang, cloned);
  }

  return cloned;
}
```

- [ ] **Step 3: Run the updated test and verify it passes**

```bash
npx vitest run tests/unit/place-gazetteers.test.ts
```

Expected: PASS. All existing assertions still hold — only the test file's import paths and call signatures changed.

- [ ] **Step 4: Commit Tasks 1 + 2 together**

```bash
git add src/api/place-gazetteers/bundled.ts src/api/place-gazetteers/merge.ts tests/unit/place-gazetteers.test.ts
git commit -m "$(cat <<'EOF'
refactor(gazetteers): split index.ts into bundled.ts + merge.ts

Extract the 25 static JSON imports into bundled.ts (main-only) and the
pure loadGazetteers / mergeTranslations / findNodeByPath logic into
merge.ts (renderer-safe). loadGazetteers gains a required bundled
argument; tests updated to pass it explicitly.

index.ts still re-exports the old API surface — call-site updates come
in follow-up commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Convert `index.ts` into a renderer-safe barrel

**Files:**
- Modify: `src/api/place-gazetteers/index.ts`

Context: this is the invariant-enforcing step. `index.ts` drops its static JSON imports and becomes a thin barrel re-exporting only renderer-safe modules (`merge`, `resolver`, `types`). Every file that imports from `./place-gazetteers/index` and relied on `getAllGazetteers` or the old 2-arg `loadGazetteers` signature will stop compiling — those are Task 4 / 6 / 7.

- [ ] **Step 1: Replace the entire contents of `src/api/place-gazetteers/index.ts`**

```ts
// Renderer-safe barrel. Re-exports pure logic and types.
//
// Does NOT re-export from ./bundled — bundled.ts statically imports ~40 MB of
// JSON and must never be reachable from a renderer import chain. Main-process
// and MCP code should import from './bundled' directly when they need the
// bundled gazetteer data.

export { loadGazetteers } from './merge';
export { resolvePlace, resolveBoundary, searchGazetteer } from './resolver';
export type {
  Gazetteer,
  GazetteerNode,
  GazetteerConfig,
  GazetteerInfo,
  GazetteerSource,
  PlaceResolveResult,
  BoundaryResolveResult,
} from './types';
```

Note on the `resolver` re-export: confirm with `grep -n "^export" src/api/place-gazetteers/resolver.ts` that `resolvePlace`, `resolveBoundary`, and `searchGazetteer` are the exported names. Add any others you find there (e.g. `GazetteerSearchHit`, `BoundaryHint` types) to this barrel. If resolver exports more than listed here, add them verbatim.

Similarly for `types.ts`: `grep -n "^export" src/api/place-gazetteers/types.ts` to ensure the `export type { ... }` list covers every type consumers use. If `types.ts` exports more, include them.

- [ ] **Step 2: Run lint to flag every broken call site**

```bash
npm run lint
```

Expected: FAIL. The errors should specifically complain about:
- `src/api/checks/index.ts` — imports `getAllGazetteers` from `../place-gazetteers` (barrel no longer exports it)
- `src/api/gazetteers.ts` — imports `getAllGazetteers` from `./place-gazetteers/index` (same)
- `src/mcp/tools/prod/places.ts` — imports `loadGazetteers, getImportedGazetteers` from `../../../api/place-gazetteers/index` (loadGazetteers is exported; getImportedGazetteers never was — check this file)
- `src/renderer/composables/usePlaceResolver.ts` — imports `getAllGazetteers` from `../../api/place-gazetteers/index`
- `src/renderer/views/GazetteersView.vue` — imports `getAllGazetteers, loadGazetteers` from `../../api/place-gazetteers/index` (loadGazetteers still works; getAllGazetteers breaks)

If `npm run lint` reports errors in any file NOT listed above, stop and investigate — there may be a call site the spec missed. Do not continue until the error list matches.

Record the exact error list in a scratch note — you'll use it as the task-4/6/7 checklist.

- [ ] **Step 3: Do NOT commit yet.** The build is broken by design; commit after Task 4 restores main-side compilation.

---

## Task 4: Update main-side call sites

**Files:**
- Modify: `src/api/checks/index.ts`
- Modify: `src/api/gazetteers.ts`
- Modify: `src/mcp/tools/prod/places.ts`

Context: these three main-process files used `getAllGazetteers` and/or the old 2-arg `loadGazetteers`. Point them at `./place-gazetteers/bundled` for `getAllGazetteers` and pass it explicitly to `loadGazetteers(config, bundled, imported)`.

Can run in parallel with Task 5. This task is self-contained.

- [ ] **Step 1: Update `src/api/checks/index.ts`**

At line 2, replace:

```ts
import { loadGazetteers, getAllGazetteers } from '../place-gazetteers';
```

with:

```ts
import { loadGazetteers } from '../place-gazetteers';
import { getAllGazetteers } from '../place-gazetteers/bundled';
```

At line 110 (the `loadGazetteers(gazConfig, imported)` call), replace:

```ts
const gazetteers = loadGazetteers(gazConfig, imported);
```

with:

```ts
const gazetteers = loadGazetteers(gazConfig, getAllGazetteers(), imported);
```

The `getAllGazetteers()` call on line 108 (inside the default config construction) stays as-is.

- [ ] **Step 2: Update `src/api/gazetteers.ts`**

At line 4, replace:

```ts
import { getAllGazetteers } from './place-gazetteers/index';
```

with:

```ts
import { getAllGazetteers } from './place-gazetteers/bundled';
```

No other changes in this file — `loadGazetteers` is not used here, and all other `getAllGazetteers()` call sites (lines 10, 132, 177) keep working once the import is fixed.

- [ ] **Step 3: Update `src/mcp/tools/prod/places.ts`**

At line 6, replace:

```ts
import { loadGazetteers, getImportedGazetteers } from '../../../api/place-gazetteers/index';
```

with:

```ts
import { loadGazetteers } from '../../../api/place-gazetteers';
import { getImportedGazetteers } from '../../../api/gazetteers';
import { getAllGazetteers } from '../../../api/place-gazetteers/bundled';
```

(Note: `getImportedGazetteers` lives in `src/api/gazetteers.ts`, not in `src/api/place-gazetteers/`. If the existing file imports it from `place-gazetteers/index`, that was already a bug — it would have been resolving to `undefined` at runtime. Verify with `grep -n "getImportedGazetteers" src/mcp/tools/prod/places.ts src/api/place-gazetteers/index.ts src/api/gazetteers.ts` before editing. If the current import resolves successfully today, use whatever path works — don't invent one.)

At line 63 (the `loadGazetteers(config, imported)` call), replace:

```ts
const gazetteers = loadGazetteers(config, imported);
```

with:

```ts
const gazetteers = loadGazetteers(config, getAllGazetteers(), imported);
```

- [ ] **Step 4: Run lint + tests**

```bash
npm run lint
npm test
```

Expected: lint should now only complain about the renderer call sites (`usePlaceResolver.ts`, `GazetteersView.vue`). Tests should all pass — no main-side behavior changed.

- [ ] **Step 5: Commit**

```bash
git add src/api/place-gazetteers/index.ts src/api/checks/index.ts src/api/gazetteers.ts src/mcp/tools/prod/places.ts
git commit -m "$(cat <<'EOF'
refactor(gazetteers): thin index.ts to a barrel; update main-side callers

index.ts now re-exports only merge, resolver, and types — not bundled.
Main, checks, MCP, and db-layer call sites import getAllGazetteers from
./place-gazetteers/bundled directly and pass it to loadGazetteers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add `gazetteers:getBundled` IPC handler + preload surface

**Files:**
- Modify: `src/main/ipc/gazetteers.ts`
- Modify: `src/preload/index.ts`

Context: expose `getAllGazetteers()` to the renderer over IPC. One-shot handler — no caching in main because `getAllGazetteers()` already returns a module-level constant.

Can run in parallel with Task 4. This task is self-contained.

- [ ] **Step 1: Add the handler in `src/main/ipc/gazetteers.ts`**

At line 1, add an import for the bundled getter. The file should start with:

```ts
import * as gazetteers from '../../api/gazetteers';
import { getAllGazetteers } from '../../api/place-gazetteers/bundled';
import type { WrapHandlerFn } from './wrap-handler';
```

Inside `registerGazetteerHandlers`, add a new handler. The file ends up like:

```ts
export function registerGazetteerHandlers(
  getDb: () => ReturnType<typeof import('../database').getDatabase>,
  wrapHandler: WrapHandlerFn,
) {
  wrapHandler('gazetteers:list', () => gazetteers.listGazetteers(getDb()));
  wrapHandler('gazetteers:import', (json) => gazetteers.importGazetteer(getDb(), json as string));
  wrapHandler('gazetteers:export', (id) => gazetteers.exportGazetteer(getDb(), id as string));
  wrapHandler('gazetteers:delete', (id) => gazetteers.deleteGazetteer(getDb(), id as string));
  wrapHandler('gazetteers:getImported', () => gazetteers.getImportedGazetteers(getDb()));
  wrapHandler('gazetteers:getSchema', () => gazetteers.getGazetteerSchema());
  wrapHandler('gazetteers:getBundled', () => getAllGazetteers());
}
```

- [ ] **Step 2: Expose `getBundled` via the preload**

In `src/preload/index.ts`, find the `gazetteers` block (currently around line 218). Add a `getBundled` method. The block becomes:

```ts
gazetteers: {
  list: () => ipcRenderer.invoke('gazetteers:list'),
  import: mutating((json: string) => ipcRenderer.invoke('gazetteers:import', json)),
  export: (id: string) => ipcRenderer.invoke('gazetteers:export', id),
  delete: mutating((id: string) => ipcRenderer.invoke('gazetteers:delete', id)),
  getImported: () => ipcRenderer.invoke('gazetteers:getImported'),
  getSchema: () => ipcRenderer.invoke('gazetteers:getSchema'),
  getBundled: () => ipcRenderer.invoke('gazetteers:getBundled'),
},
```

`getBundled` is a read-only query; no `mutating()` wrapper.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: lint errors from `usePlaceResolver.ts` and `GazetteersView.vue` still present; no new errors from Task 5 files.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/gazetteers.ts src/preload/index.ts
git commit -m "$(cat <<'EOF'
feat(ipc): add gazetteers:getBundled channel

New IPC channel exposes getAllGazetteers() to the renderer. Consumed
next by usePlaceResolver and GazetteersView so the renderer bundle
stops statically inlining ~40 MB of gazetteer JSON.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Rewrite `usePlaceResolver.ts` to load bundled via IPC

**Files:**
- Modify: `src/renderer/composables/usePlaceResolver.ts`

Context: this composable is the hot-path consumer. It replaces the static `import { getAllGazetteers }` with an IPC call, keeps resolve/resolveBoundary synchronous, and adds a try/catch so IPC failures fail-closed (empty caches, `ready.value = false`).

Can run in parallel with Task 7 after Task 5 is merged.

- [ ] **Step 1: Replace the entire file contents**

Write exactly:

```ts
import { ref } from 'vue';
import { resolvePlace, resolveBoundary as resolveBoundaryFn, type BoundaryHint } from '../../api/place-gazetteers/resolver';
import { loadGazetteers } from '../../api/place-gazetteers/merge';
import type { Gazetteer, GazetteerConfig, PlaceResolveResult, BoundaryResolveResult } from '../../api/place-gazetteers/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const cache = new Map<string, PlaceResolveResult | null>();
const boundaryCache = new Map<string, BoundaryResolveResult | null>();
let gazetteersRef: Gazetteer[] = [];
let configLoaded = false;
let boundaryGazetteersRef: Gazetteer[] = [];
let boundaryLoaded = false;

export function usePlaceResolver() {
  const ready = ref(false);

  async function ensureLoaded() {
    if (configLoaded) { ready.value = true; return; }
    try {
      const raw = (await window.api.db.getSetting('gazetteer_config')) as string | null;
      // console.time('[usePlaceResolver] getBundled+getImported');
      const [bundled, imported] = await Promise.all([
        window.api.gazetteers.getBundled() as Promise<Gazetteer[]>,
        window.api.gazetteers.getImported() as Promise<Gazetteer[]>,
      ]);
      // console.timeEnd('[usePlaceResolver] getBundled+getImported');

      let config: GazetteerConfig;
      if (raw) {
        config = JSON.parse(raw) as GazetteerConfig;
      } else {
        // Default: enable all bundled gazetteers on new databases
        config = { enabledGazetteers: bundled.map(g => g.id) };
        await window.api.db.setSetting('gazetteer_config', JSON.stringify(config));
      }
      gazetteersRef = loadGazetteers(config, bundled, imported);
      configLoaded = true;
      ready.value = true;
    } catch (err) {
      console.error('[usePlaceResolver] ensureLoaded failed:', err);
      gazetteersRef = [];
      configLoaded = false;
      ready.value = false;
    }
  }

  function resolve(placeName: string): PlaceResolveResult | null {
    if (gazetteersRef.length === 0) return null;
    const cacheKey = placeName;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    const result = resolvePlace(placeName, gazetteersRef);
    cache.set(cacheKey, result);
    return result;
  }

  async function ensureBoundaryLoaded() {
    if (boundaryLoaded) return;
    try {
      const [bundled, imported] = await Promise.all([
        window.api.gazetteers.getBundled() as Promise<Gazetteer[]>,
        window.api.gazetteers.getImported() as Promise<Gazetteer[]>,
      ]);
      boundaryGazetteersRef = [...bundled, ...imported].filter(g => g.kind === 'boundary');
      boundaryLoaded = true;
    } catch (err) {
      console.error('[usePlaceResolver] ensureBoundaryLoaded failed:', err);
      boundaryGazetteersRef = [];
      boundaryLoaded = false;
    }
  }

  async function resolveBoundary(placeName: string, hint?: BoundaryHint): Promise<BoundaryResolveResult | null> {
    await ensureBoundaryLoaded();
    if (boundaryGazetteersRef.length === 0) return null;
    const cacheKey = hint ? `${placeName}@${hint.lat},${hint.lon}` : placeName;
    if (boundaryCache.has(cacheKey)) return boundaryCache.get(cacheKey)!;
    const result = resolveBoundaryFn(placeName, boundaryGazetteersRef, hint);
    boundaryCache.set(cacheKey, result);
    return result;
  }

  function invalidate() {
    cache.clear();
    boundaryCache.clear();
    configLoaded = false;
    boundaryLoaded = false;
    ready.value = false;
  }

  function getGazetteers(): Gazetteer[] {
    return gazetteersRef;
  }

  function resolveCoordinates(
    place: { latitude: number | null; longitude: number | null },
    placePath: string
  ): { lat: number; lon: number; resolved: boolean } | null {
    if (place.latitude != null && place.longitude != null) {
      return { lat: place.latitude, lon: place.longitude, resolved: false };
    }
    const result = resolve(placePath);
    if (result) {
      return { lat: result.lat, lon: result.lon, resolved: true };
    }
    return null;
  }

  return { ready, ensureLoaded, resolve, resolveCoordinates, resolveBoundary, invalidate, getGazetteers };
}
```

Key diffs vs. today's version:
- Removed `import { loadGazetteers, getAllGazetteers } from '../../api/place-gazetteers/index'`; imports `loadGazetteers` from `./merge` and no longer imports `getAllGazetteers` at all.
- `ensureLoaded` now fetches bundled via `window.api.gazetteers.getBundled()` in parallel with `getImported()`; `loadGazetteers(config, bundled, imported)` gets three args.
- Default-config bootstrap uses `bundled.map(g => g.id)` instead of `getAllGazetteers().map(...)`.
- `ensureBoundaryLoaded` fetches both bundled and imported via IPC and filters by `kind === 'boundary'`.
- Both `ensureLoaded` and `ensureBoundaryLoaded` wrap their IPC calls in try/catch — on rejection, clear state and leave `ready` / `boundaryLoaded` false.

The commented-out `console.time` / `console.timeEnd` lines are placeholders. Uncomment them locally during manual verification to record startup timing (spec requires a concrete number). Re-comment (don't delete) before committing.

- [ ] **Step 2: Run lint + tests**

```bash
npm run lint
npm test
```

Expected: lint passes for `usePlaceResolver.ts` (only `GazetteersView.vue` should still be broken). All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/composables/usePlaceResolver.ts
git commit -m "$(cat <<'EOF'
refactor(gazetteers): load bundled gazetteers via IPC in usePlaceResolver

Drop the static import of getAllGazetteers — the renderer composable
now fetches bundled gazetteers over window.api.gazetteers.getBundled()
during ensureLoaded / ensureBoundaryLoaded. Resolve remains synchronous.

Fail-closed: on any IPC rejection, gazetteersRef clears and ready
stays false. Map and pickers degrade gracefully (no pins, no
suggestions) rather than crashing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Rewrite `GazetteersView.vue` to load bundled via IPC

**Files:**
- Modify: `src/renderer/views/GazetteersView.vue` (script block only)

Context: the settings view needs the bundled array for its default-config bootstrap and for building the `enabledGazetteerObjects` list used by the test-resolve input. Replace the static import with an IPC fetch during `loadAll`.

Can run in parallel with Task 6.

- [ ] **Step 1: Replace the gazetteer-related imports**

At lines 107-109, replace:

```ts
import { getAllGazetteers, loadGazetteers } from '../../api/place-gazetteers/index';
import { resolvePlace } from '../../api/place-gazetteers/resolver';
import type { GazetteerConfig, Gazetteer, GazetteerInfo } from '../../api/place-gazetteers/types';
```

with:

```ts
import { loadGazetteers } from '../../api/place-gazetteers/merge';
import { resolvePlace } from '../../api/place-gazetteers/resolver';
import type { GazetteerConfig, Gazetteer, GazetteerInfo } from '../../api/place-gazetteers/types';
```

- [ ] **Step 2: Update `buildEnabledGazetteers` to take a `bundled` parameter**

Find (around line 191):

```ts
function buildEnabledGazetteers(cfg: GazetteerConfig, imported: Gazetteer[]): Gazetteer[] {
  return loadGazetteers(cfg, imported);
}
```

Replace with:

```ts
function buildEnabledGazetteers(cfg: GazetteerConfig, bundled: Gazetteer[], imported: Gazetteer[]): Gazetteer[] {
  return loadGazetteers(cfg, bundled, imported);
}
```

- [ ] **Step 3: Update `loadAll` to fetch bundled via IPC and thread it through**

Find (around line 195):

```ts
async function loadAll() {
  // Load list (bundled + imported)
  const list = await window.api.gazetteers.list() as GazetteerInfo[];
  gazetteerList.value = list;

  // Load config
  const raw = await window.api.db.getSetting('gazetteer_config') as string | null;
  if (raw) {
    try {
      config.value = JSON.parse(raw) as GazetteerConfig;
    } catch {
      // keep default
    }
  } else {
    // Default: enable all bundled gazetteers
    config.value = { enabledGazetteers: list.filter(g => g.bundled).map(g => g.id) };
  }

  // Load full Gazetteer objects for test lookup
  const imported = await window.api.gazetteers.getImported() as Gazetteer[];
  enabledGazetteerObjects.value = buildEnabledGazetteers(config.value, imported);
}
```

Replace with:

```ts
async function loadAll() {
  // Load list (bundled + imported)
  const list = await window.api.gazetteers.list() as GazetteerInfo[];
  gazetteerList.value = list;

  // Load config
  const raw = await window.api.db.getSetting('gazetteer_config') as string | null;
  if (raw) {
    try {
      config.value = JSON.parse(raw) as GazetteerConfig;
    } catch {
      // keep default
    }
  } else {
    // Default: enable all bundled gazetteers
    config.value = { enabledGazetteers: list.filter(g => g.bundled).map(g => g.id) };
  }

  // Load full Gazetteer objects for test lookup
  const [bundled, imported] = await Promise.all([
    window.api.gazetteers.getBundled() as Promise<Gazetteer[]>,
    window.api.gazetteers.getImported() as Promise<Gazetteer[]>,
  ]);
  enabledGazetteerObjects.value = buildEnabledGazetteers(config.value, bundled, imported);
}
```

Note: the default-config branch already uses `list.filter(g => g.bundled).map(g => g.id)` in the current file — that one does not need to change. Only the `getAllGazetteers()` import needed removal, which Step 1 handled.

- [ ] **Step 4: Update `saveConfig` to fetch bundled too**

Find (around line 218):

```ts
async function saveConfig() {
  await window.api.db.setSetting('gazetteer_config', JSON.stringify(config.value));
  // Reload enabled gazetteers for test lookup
  const imported = await window.api.gazetteers.getImported() as Gazetteer[];
  enabledGazetteerObjects.value = buildEnabledGazetteers(config.value, imported);
  invalidatePlaceResolver();
}
```

Replace with:

```ts
async function saveConfig() {
  await window.api.db.setSetting('gazetteer_config', JSON.stringify(config.value));
  // Reload enabled gazetteers for test lookup
  const [bundled, imported] = await Promise.all([
    window.api.gazetteers.getBundled() as Promise<Gazetteer[]>,
    window.api.gazetteers.getImported() as Promise<Gazetteer[]>,
  ]);
  enabledGazetteerObjects.value = buildEnabledGazetteers(config.value, bundled, imported);
  invalidatePlaceResolver();
}
```

- [ ] **Step 5: Run lint + tests**

```bash
npm run lint
npm test
```

Expected: PASS for both. Every file now compiles, every unit test passes.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/GazetteersView.vue
git commit -m "$(cat <<'EOF'
refactor(gazetteers): load bundled gazetteers via IPC in GazetteersView

Drop the static import of getAllGazetteers. The settings view now
fetches bundled via window.api.gazetteers.getBundled() during loadAll
and saveConfig, and threads it through buildEnabledGazetteers to the
3-arg loadGazetteers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Verification gates + patch version bump

**Files:**
- Modify: `package.json` (version bump only)

Context: the refactor is mechanically complete after Task 7. This task is the evidence-gathering pass that proves the OOM is fixed and behavior is preserved. Do NOT skip any gate.

- [ ] **Step 1: Lint and unit tests must be green**

```bash
npm run lint
npm test
```

Expected: both PASS. If anything is red, stop and fix before proceeding.

- [ ] **Step 2: Local macOS build — primary evidence the OOM is fixed**

```bash
rm -rf out/make .vite
npm run make -- --platform darwin
```

Expected: completes without FATAL heap errors. Verify a zip exists:

```bash
ls -la out/make/zip/darwin/
```

Expected: at least one `.zip` file in `out/make/zip/darwin/arm64/` (or `x64/` depending on the runner arch). If the directory is empty or the build emitted a heap-limit error, the refactor is incomplete — investigate before claiming done.

- [ ] **Step 3: Manual smoke test — `npm start`**

```bash
npm start
```

Walk through every hot path the spec listed:

1. **MapView** — open `/map`. Verify pins render at the correct coordinates. Open the dev tools console; confirm no `[usePlaceResolver] ensureLoaded failed` errors. A place with only a name (no stored lat/lon) should still get a pin from gazetteer resolution.
2. **PlacePicker** — open the `AddPersonModal` (click "+ Add Person" on `/persons`) and start typing a place name in the birth-event place field. Gazetteer suggestions should appear alongside DB matches.
3. **GazetteersView** — open `/settings`, scroll to the Gazetteers section (or click the Gazetteers tab). Verify the list renders with all bundled entries. Toggle one off and back on. Type a place name in the test-resolve input — matching gazetteers should show results.

If any of the three fails, stop — the fix is incomplete.

- [ ] **Step 4: Record startup timing**

Temporarily uncomment the two `console.time` / `console.timeEnd` lines in `usePlaceResolver.ts:ensureLoaded` (they were left as comments in Task 6). Restart `npm start`, reload, open dev tools console. Note the elapsed time for `[usePlaceResolver] getBundled+getImported` in a scratch note. A number over 1 s is worth flagging in the final commit message; under 500 ms is fine.

Re-comment (do not delete) the two lines before committing.

- [ ] **Step 5: Patch version bump**

Read the current version from `package.json`:

```bash
grep '"version"' package.json
```

Increment the patch number by one (e.g. `0.130.0` → `0.130.1`). Edit `package.json` to reflect the new version.

This is a fix to an existing feature (CI builds), not a new feature, so per CLAUDE.md it's a patch bump.

- [ ] **Step 6: Final commit**

```bash
git add package.json
git commit -m "$(cat <<'EOF'
release: vX.Y.Z — gazetteer IPC refactor fixes CI renderer-build OOM

Renderer bundle no longer statically inlines the ~40 MB of gazetteer
JSON. Vite's renderer build now fits comfortably inside Node's
default heap; local `npm run make -- --platform darwin` produces a
zip artifact again, and CI builds should stop hitting FATAL heap
limit on macOS/Windows.

ensureLoaded IPC payload measured at <T ms> on macOS arm64.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Replace `vX.Y.Z` with the actual new version and `<T ms>` with the recorded timing from Step 4.

- [ ] **Step 7: Mark plan complete in docs/PLAN.md**

Open `docs/PLAN.md`, find the "Gazetteer IPC Refactor [planned]" entry, change the status tag to `[done]`, and commit:

```bash
git add docs/PLAN.md
git commit -m "docs(plan): mark gazetteer IPC refactor done"
```

(Do NOT move the design or plan files to `docs/plans/archive/` yet — that happens when the user is ready to archive, after the worktree is merged and CI has produced artifacts on all three platforms.)

---

## Spec coverage checklist

Every requirement from the design spec should map to a task above:

| Spec requirement | Covered by |
|---|---|
| Create `bundled.ts` with 25 static JSON imports + `getAllGazetteers` + `enrichHistoricalAliases` | Task 2 |
| Create `merge.ts` with pure `loadGazetteers(config, bundled, imported)` + `mergeTranslations` + `findNodeByPath` | Task 2 |
| `index.ts` becomes a barrel re-exporting merge + resolver + types, NOT bundled | Task 3 |
| Main-side call sites updated: checks/index.ts | Task 4 |
| Main-side call sites updated: mcp/tools/prod/places.ts | Task 4 |
| Main-side call sites updated: api/gazetteers.ts | Task 4 |
| `gazetteers:getBundled` IPC handler in src/main/ipc/gazetteers.ts | Task 5 |
| `getBundled` method on preload window.api.gazetteers | Task 5 |
| usePlaceResolver.ts rewritten to load bundled via IPC | Task 6 |
| Fail-closed on IPC error: empty `gazetteersRef`, `ready=false` | Task 6 |
| GazetteersView.vue rewritten to load bundled via IPC | Task 7 |
| tests/unit/place-gazetteers.test.ts updated to new signature | Task 1 |
| No changes to resolver.ts, types.ts, or `data/*.json` | Enforced by task scopes |
| Verification gate: lint + unit tests | Tasks 4, 6, 7, 8 |
| Verification gate: `npm run make --platform darwin` produces a zip | Task 8 |
| Verification gate: manual smoke of MapView / PlacePicker / GazetteersView | Task 8 |
| Record renderer startup timing | Task 8 |
| Patch version bump in final commit | Task 8 |

---

## Notes for the executing agent

- **Worktree discipline.** The plan runs in a git worktree branched from main. The main working copy has unrelated WIP (fan chart + reports files). Do NOT touch those files, do NOT `git stash`, do NOT `git reset --hard`. If a file outside the task scope shows in `git status`, stop and tell the user.
- **One file at a time when using the Edit tool.** Several files in this plan have multiple edit points (e.g. GazetteersView.vue Task 7 has 3 edit regions). Run each Edit as a separate tool call with enough surrounding context to be unique.
- **Resolver-exports verification in Task 3.** The skill author couldn't guarantee the exact names exported from `resolver.ts`. Before finalizing the barrel, run `grep -n "^export" src/api/place-gazetteers/resolver.ts src/api/place-gazetteers/types.ts` and make sure the barrel re-exports every name consumers use. If anything is missing, add it; the lint pass in Step 2 will catch regressions anyway.
- **MCP import path in Task 4 Step 3.** The current `src/mcp/tools/prod/places.ts:6` imports `getImportedGazetteers` from `place-gazetteers/index`. That's suspect — the function lives in `src/api/gazetteers.ts`. Before editing, verify with `grep -rn "getImportedGazetteers"` which module actually exports it. The plan instructs importing it from `src/api/gazetteers.ts` via a relative path — but whatever path resolves today is the right one to preserve. Don't break a working import while "fixing" another.
- **No version bump before Task 8.** Per CLAUDE.md: version bumps happen only when work is complete. Intermediate commits in Tasks 2, 4, 5, 6, 7 do NOT change `package.json`.
