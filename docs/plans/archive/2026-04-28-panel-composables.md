# Panel Composables & EntityPanel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Eliminate ~600 lines of repeated panel code across 6 entity panels by extracting three composables (`useEntityData`, `useEditableFields`, `usePanelStorage`) and a shared `<EntityPanel>` shell — and **bake cross-view reactivity into the composables themselves** so the left list, the right side panel, and the center view (chart / map / timeline) all stay in sync after any mutation, automatically. Fix the EventList stale-load race condition along the way and centralize the 56+ ad-hoc localStorage keys.

**Architecture:**
- `useEntityData<T>(idRef, loader, options?)` — race-safe loading with a generation counter **AND auto-subscription to `onDataChanged`** with debounced reload + `onScopeDispose` cleanup. Replaces hand-rolled `if (props.id !== id) return` guards AND hand-rolled `onDataChanged` listeners. Opt-out via `options.subscribe = false` (rare — e.g. read-only snapshot views).
- `useEditableFields<T>(idRef, dataRef, persist)` — debounced field-edit/save with race-safe persistence. Replaces hand-rolled `editFields` + `saveField` patterns.
- `<EntityPanel>` — wrapper component owning header (close button, role label, edit button), sticky-top section, and slot for sections. Replaces 6 near-identical panel headers.
- `src/renderer/utils/storage-keys.ts` — central registry of every localStorage key with typed `getJSON/setJSON` helpers.

**Cross-view reactivity contract** (this is the new, project-wide rule the refactor establishes):

> Whenever an entity is mutated anywhere in the app — via a panel save, a modal, an MCP tool call, an undo/redo, or an import — every view that displays that data refreshes automatically. The left list count + rows, the right panel sections + counts, and the center view (chart / map / timeline) update without the user navigating away and back. **Composables own the subscription.** Views and panels never register `window.api.onDataChanged(...)` themselves — they consume `useEntityData` (or `usePagedList`, see Task 13) and that's it.

The mechanism: `preload/index.ts` already wraps every mutating IPC call in `mutating()` which fans out to `dataChangedListeners`. Composables register and unregister against this single source of truth. Debounce (~150ms) inside each composable batches rapid mutation bursts (multi-step modal saves, bulk imports).

**Tech Stack:** Vue 3 Composition API, Pinia, Vitest, @vue/test-utils.

---

## Why this matters

Six entity panels (`PersonPanel`, `PlacePanel`, `SourcePanel`, `RelationshipPanel`, `GroupPanel`, `ResearchTaskPanel`) repeat:
- Header skeleton (~20 lines × 6 = 120 lines)
- `editFields` + `saveField(field)` (`SourcePanel.vue:331-340,432-443`, `RelationshipPanel.vue:269-357`, `PlacePanel.vue:375+`)
- Stale-load guards (`PlacePanel.vue:414`, `SourcePanel.vue:391,409,418`, `RelationshipPanel.vue:314,327,334`, `GroupPanel.vue:177,191`, `ResearchTaskPanel.vue:222,241`)

Plus a confirmed race in `EventList.vue:133-200` (no guard) and ad-hoc localStorage keys scattered across 27 files.

**And — most importantly — cross-view reactivity is currently a hand-wired patchwork.** Today:
- `PersonsView` directly subscribes to `onDataChanged` (added during the Ben-reactivity work) → chart refetches.
- `PlacesView` and `SourcesView` watch `dataVersionStore.version` → list reloads.
- `usePersonPanelData` directly subscribes to `onDataChanged` → counts refresh.
- `MapView` + `PlacePanel` use a panel-emits `entity-updated` event for targeted single-pin refresh.
- `EventList`, `PersonTimeline`, `PersonMap`, `PersonMediaSection`, `PersonChecksSection`, `PersonIdentifiersSection` only refetch when their `id` prop changes — same-id mutations leave them stale.

Three patterns, none consistent, several views with no listener at all. Ben hits stale data anywhere we forgot to wire one of the three. Centralising this into `useEntityData` + `usePagedList` collapses the four mechanisms into one.

After this refactor:
- Adding a new entity panel is ~30 lines: declare loaders, declare editable field shape, slot section components.
- Stale-load races impossible by construction.
- **Mutation-stale views impossible by construction** — anything using `useEntityData` / `usePagedList` reacts to mutations automatically; opt-out is explicit.
- One file owns every localStorage key.

## File Structure

```
src/renderer/composables/
├── useEntityData.ts          # generation-guarded async load
├── useEditableFields.ts      # debounced field save with race guard
└── usePanelStorage.ts        # convenience over storage-keys for panel open/width

src/renderer/utils/
└── storage-keys.ts           # exhaustive const + typed helpers

src/renderer/components/
└── EntityPanel.vue           # shared shell (header + close + section slot)

tests/components/composables/
├── useEntityData.test.ts
├── useEditableFields.test.ts
└── usePanelStorage.test.ts
```

Modified:
- `src/renderer/components/PersonPanel.vue` (consolidate over `usePersonPanelData` if it exists)
- `src/renderer/components/PlacePanel.vue`
- `src/renderer/components/SourcePanel.vue`
- `src/renderer/components/RelationshipPanel.vue`
- `src/renderer/components/GroupPanel.vue`
- `src/renderer/components/ResearchTaskPanel.vue`
- `src/renderer/components/EventList.vue` (race fix)
- `src/renderer/components/PersonMediaSection.vue`, `PersonChecksSection.vue`, `PersonIdentifiersSection.vue` (use `useEntityData`)

## Conventions

- Tests run with `npx vitest run <file>`.
- Component tests use `@vue/test-utils` + `mount()` per `tests/components/setup.ts`.
- Run `npm run lint` after every task.
- Smoke-check the migrated panel in the running app with `./.devcontainer/dev-debug.sh` + the `slaktforskning-dev` MCP `ui_screenshot`/`ui_click` tools (per CLAUDE.md feedback memory).
- Conventional commits: `feat(panel):`, `refactor(panel):`, `fix(panel):`, `test(panel):`.

---

## Task 1: localStorage key registry

**Files:**
- Create: `src/renderer/utils/storage-keys.ts`
- Create: `tests/unit/storage-keys.test.ts`

- [x] **Step 1: Audit existing keys**

```
grep -RInE "localStorage\\.(get|set|remove)Item\\(['\"]" src/renderer | sort -u > /tmp/keys.txt
wc -l /tmp/keys.txt
```

Should show 50+ unique keys.

- [x] **Step 2: Write the failing test**

```ts
// tests/unit/storage-keys.test.ts
import { describe, it, expect } from 'vitest';
import { STORAGE_KEYS, getJSON, setJSON } from '../../src/renderer/utils/storage-keys';

describe('storage keys', () => {
  it('every key is unique', () => {
    const values = Object.values(STORAGE_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('getJSON returns default when missing', () => {
    localStorage.clear();
    expect(getJSON(STORAGE_KEYS.personsPanelOpen, true)).toBe(true);
  });

  it('setJSON + getJSON round-trips', () => {
    setJSON(STORAGE_KEYS.personsPanelWidth, 480);
    expect(getJSON(STORAGE_KEYS.personsPanelWidth, 0)).toBe(480);
  });

  it('getJSON returns default on parse error', () => {
    localStorage.setItem(STORAGE_KEYS.personsPanelWidth, '{not json');
    expect(getJSON(STORAGE_KEYS.personsPanelWidth, 99)).toBe(99);
  });
});
```

- [x] **Step 3: Run test, see it fail**

```
npx vitest run tests/unit/storage-keys.test.ts
```

Expected: FAIL — module not found.

- [x] **Step 4: Implement**

```ts
// src/renderer/utils/storage-keys.ts
export const STORAGE_KEYS = {
  // Panels
  personsPanelOpen:     'persons-panel-open',
  personsPanelWidth:    'persons-panel-width',
  personsSelectedId:    'persons-selected-id',
  personsListOpen:      'persons-list-open',
  placesPanelOpen:      'places-panel-open',
  placesPanelWidth:     'places-panel-width',
  placesSelectedId:     'places-selected-id',
  sourcesPanelOpen:     'sources-panel-open',
  sourcesPanelWidth:    'sources-panel-width',
  sourcesSelectedId:    'sources-selected-id',
  relationshipsPanelOpen:  'relationships-panel-open',
  relationshipsPanelWidth: 'relationships-panel-width',
  relationshipsSelectedId: 'relationships-selected-id',
  groupsPanelOpen:      'groups-panel-open',
  groupsPanelWidth:     'groups-panel-width',
  groupsSelectedId:     'groups-selected-id',
  tasksPanelOpen:       'tasks-panel-open',
  tasksPanelWidth:      'tasks-panel-width',
  tasksSelectedId:      'tasks-selected-id',

  // Sections (collapse state lives in usePanelSections — leave it as-is for now)

  // Settings / appearance
  appearance:           'slaktforskning-appearance',
  legacyDarkMode:       'darkMode',          // read-only, migrating away
  textSize:             'slaktforskning-text-size',
  language:             'slaktforskning-language',
  theme:                'slaktforskning-theme',
  tts:                  'slaktforskning-tts',

  // Charts
  fanArcSpan:           'fan-arc-span',
  vizPanelOpen:         'viz-panel-open',
  vizPanelWidth:        'viz-panel-width',

  // ...add every key from /tmp/keys.txt
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

export function getJSON<T>(key: StorageKey, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function setJSON<T>(key: StorageKey, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeKey(key: StorageKey): void {
  localStorage.removeItem(key);
}
```

Populate the rest of the keys from `/tmp/keys.txt`. Group by feature area with comments.

- [x] **Step 5: Run test, see it pass**

```
npx vitest run tests/unit/storage-keys.test.ts
```

Expected: PASS, 4 tests.

- [x] **Step 6: Migrate one usage site as proof**

Pick `src/renderer/views/PersonsView.vue`. Replace inline string keys with `STORAGE_KEYS.personsPanelOpen` etc. Run `npm run lint`.

- [x] **Step 7: Commit**

```
git add src/renderer/utils/storage-keys.ts tests/unit/storage-keys.test.ts \
        src/renderer/views/PersonsView.vue
git commit -m "feat(renderer): centralize localStorage keys"
```

- [x] **Step 8: Migrate remaining call sites incrementally**

This is mechanical search-and-replace. Use:

```
grep -RIln "localStorage.\\(getItem\\|setItem\\|removeItem\\)" src/renderer
```

For each file: replace string literal with `STORAGE_KEYS.foo`. Add new entries to the registry as discovered. Commit per file or per cluster of related files. Lint after each.

---

## Task 2: useEntityData composable (extend existing — adds reactivity)

**Status:** `src/renderer/composables/useEntityData.ts` already exists with race-safe loading. This task **extends** it with `onDataChanged` auto-subscription so any consumer reacts to mutations automatically. Existing call sites (10+ components already using it) inherit the new behavior with no edits.

**Files:**
- Modify: `src/renderer/composables/useEntityData.ts`
- Modify (or create): `tests/components/composables/useEntityData.test.ts`

- [x] **Step 1: Read the existing implementation**

```bash
cat src/renderer/composables/useEntityData.ts
grep -RIn "useEntityData" src/renderer
```

Confirm the current call sites — every one of them must keep working after the change.

- [x] **Step 2: Extend the test file**

If `tests/components/composables/useEntityData.test.ts` doesn't exist yet, create it. Add the existing 3 race-safety tests from the prior task, then add the reactivity tests below:

```ts
// tests/components/composables/useEntityData.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick, effectScope } from 'vue';
import { useEntityData } from '../../../src/renderer/composables/useEntityData';

// Minimal stub for window.api.onDataChanged / offDataChanged
let dataChangedCb: (() => void) | null = null;
beforeEach(() => {
  dataChangedCb = null;
  (globalThis as { api: unknown }).api = undefined;
  (globalThis as { window: { api: unknown } }).window = {
    api: {
      onDataChanged: (cb: () => void) => { dataChangedCb = cb; },
      offDataChanged: () => { dataChangedCb = null; },
    },
  };
});

describe('useEntityData — race safety', () => {
  it('loads data when id changes', async () => {
    const id = ref<string | null>(null);
    const load = vi.fn(async (i: string) => ({ id: i, name: 'X' }));
    const { data } = useEntityData(id, load);

    expect(data.value).toBeNull();
    id.value = 'a';
    await nextTick(); await nextTick();
    expect(load).toHaveBeenCalledWith('a');
    expect(data.value).toEqual({ id: 'a', name: 'X' });
  });

  it('discards stale results', async () => {
    const id = ref<string | null>('a');
    let resolveA: (v: unknown) => void = () => {};
    let resolveB: (v: unknown) => void = () => {};
    const load = vi.fn(async (i: string) => {
      if (i === 'a') return new Promise(r => { resolveA = r; });
      return new Promise(r => { resolveB = r; });
    });
    const { data } = useEntityData(id, load as never);

    await nextTick();
    id.value = 'b';
    await nextTick();
    resolveB({ id: 'b' });
    await nextTick(); await nextTick();
    expect(data.value).toEqual({ id: 'b' });
    resolveA({ id: 'a' });
    await nextTick(); await nextTick();
    expect(data.value).toEqual({ id: 'b' });
  });

  it('clears data when id becomes null', async () => {
    const id = ref<string | null>('a');
    const { data } = useEntityData(id, async i => ({ id: i }));
    await nextTick(); await nextTick();
    id.value = null;
    await nextTick();
    expect(data.value).toBeNull();
  });
});

describe('useEntityData — onDataChanged reactivity', () => {
  it('reloads when onDataChanged fires (debounced)', async () => {
    vi.useFakeTimers();
    try {
      const id = ref<string | null>('a');
      let counter = 0;
      const load = vi.fn(async (i: string) => ({ id: i, n: ++counter }));
      const { data } = useEntityData(id, load);
      await nextTick(); await nextTick();
      expect(load).toHaveBeenCalledTimes(1);

      // Fire mutation event 3 times rapidly — debounce coalesces
      dataChangedCb!(); dataChangedCb!(); dataChangedCb!();
      await vi.advanceTimersByTimeAsync(200);
      await nextTick();
      expect(load).toHaveBeenCalledTimes(2);
      expect((data.value as { n: number }).n).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not subscribe when subscribe: false', async () => {
    const id = ref<string | null>('a');
    const load = vi.fn(async (i: string) => ({ id: i }));
    useEntityData(id, load, { subscribe: false });
    await nextTick(); await nextTick();
    expect(dataChangedCb).toBeNull();
  });

  it('unsubscribes on scope dispose', async () => {
    const scope = effectScope();
    scope.run(() => {
      const id = ref<string | null>('a');
      useEntityData(id, async i => ({ id: i }));
    });
    expect(dataChangedCb).not.toBeNull();
    scope.stop();
    expect(dataChangedCb).toBeNull();
  });

  it('does not reload when id is null', async () => {
    vi.useFakeTimers();
    try {
      const id = ref<string | null>(null);
      const load = vi.fn(async (i: string) => ({ id: i }));
      useEntityData(id, load);
      await nextTick();
      dataChangedCb!();
      await vi.advanceTimersByTimeAsync(200);
      expect(load).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [x] **Step 3: Run test, see new ones fail**

```
npx vitest run tests/components/composables/useEntityData.test.ts
```

Expected: 3 race tests PASS, 4 reactivity tests FAIL (`onDataChanged` not subscribed yet).

- [x] **Step 4: Implement**

```ts
// src/renderer/composables/useEntityData.ts
import { ref, watch, onScopeDispose, type Ref } from 'vue';

interface UseEntityDataOptions {
  /**
   * Subscribe to `window.api.onDataChanged` and reload (debounced) on
   * mutation. Default: true. Set false for read-only snapshot views
   * (e.g. report previews, undo-history viewers) where stale data is
   * intentional.
   */
  subscribe?: boolean;
  /** Debounce window in ms for batching mutation bursts. Default: 150. */
  debounceMs?: number;
}

declare const window: Window & {
  api?: {
    onDataChanged?: (cb: () => void) => void;
    offDataChanged?: (cb: () => void) => void;
  };
};

/**
 * Race-safe loader for self-loading sections + cross-view reactivity.
 *
 * The composable does two things every consumer needs:
 *   1. Reload when `idRef` changes (immediate), with a generation guard
 *      so late-arriving fetches for stale ids don't overwrite the
 *      current entity.
 *   2. Reload when ANY mutating IPC call fires (`window.api.onDataChanged`),
 *      debounced ~150ms to coalesce bursts. Cleans up on scope dispose.
 *
 * This is the canonical mechanism for keeping list / panel / center
 * views in sync — composables own the subscription, views never call
 * `onDataChanged` directly.
 *
 * Pass `{ subscribe: false }` for snapshot views.
 */
export function useEntityData<T>(
  idRef: Ref<string | null>,
  loader: (id: string) => Promise<T>,
  options: UseEntityDataOptions = {}
) {
  const subscribe = options.subscribe ?? true;
  const debounceMs = options.debounceMs ?? 150;

  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<unknown>(null);
  let generation = 0;

  async function reload() {
    const id = idRef.value;
    if (id === null) {
      data.value = null;
      loading.value = false;
      error.value = null;
      return;
    }
    const gen = ++generation;
    loading.value = true;
    error.value = null;
    try {
      const result = await loader(id);
      if (gen !== generation) return;
      data.value = result;
    } catch (e) {
      if (gen !== generation) return;
      error.value = e;
      data.value = null;
    } finally {
      if (gen === generation) loading.value = false;
    }
  }

  watch(idRef, reload, { immediate: true });

  if (subscribe && typeof window !== 'undefined' && window.api?.onDataChanged) {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onMutation = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (idRef.value !== null) reload();
      }, debounceMs);
    };
    window.api.onDataChanged(onMutation);
    onScopeDispose(() => {
      if (debounce) clearTimeout(debounce);
      window.api?.offDataChanged?.(onMutation);
    });
  }

  return { data, loading, error, reload };
}
```

- [x] **Step 5: Run test, see it pass**

```
npx vitest run tests/components/composables/useEntityData.test.ts
```

Expected: PASS, 7 tests.

- [x] **Step 6: Verify existing call sites still work**

```bash
npx vitest run tests/components
npm run lint
```

The 10+ components already calling `useEntityData(idRef, loader)` keep working — they just gain mutation reactivity for free.

- [x] **Step 7: Commit**

```
git add src/renderer/composables/useEntityData.ts tests/components/composables/useEntityData.test.ts
git commit -m "feat(renderer): useEntityData auto-subscribes to onDataChanged"
```

---

## Task 3: useEditableFields composable

**Files:**
- Create: `src/renderer/composables/useEditableFields.ts`
- Create: `tests/components/composables/useEditableFields.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/components/composables/useEditableFields.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import { useEditableFields } from '../../../src/renderer/composables/useEditableFields';

interface Foo { id: string; title: string; notes: string; }

describe('useEditableFields', () => {
  it('seeds fields from initial data and persists changes', async () => {
    const id = ref<string | null>('a');
    const data = ref<Foo | null>({ id: 'a', title: 'Hi', notes: 'N' });
    const persist = vi.fn(async (i: string, patch: Partial<Foo>) => {
      Object.assign(data.value!, patch);
    });
    const { fields, save } = useEditableFields<Foo>(id, data, persist);

    await nextTick();
    expect(fields.title).toBe('Hi');
    fields.title = 'Hello';
    await save('title');
    expect(persist).toHaveBeenCalledWith('a', { title: 'Hello' });
  });

  it('drops save when id changed mid-flight', async () => {
    const id = ref<string | null>('a');
    const data = ref<Foo | null>({ id: 'a', title: 'A', notes: '' });
    let resolve: () => void = () => {};
    const persist = vi.fn(async () => new Promise<void>(r => { resolve = r; }));
    const { fields, save } = useEditableFields<Foo>(id, data, persist);
    await nextTick();

    const p = save('title');
    id.value = 'b';
    data.value = { id: 'b', title: 'B', notes: '' };
    await nextTick();
    resolve();
    await p;
    expect(fields.title).toBe('B');  // re-seeded from new data, not stale 'A'
  });
});
```

- [x] **Step 2: Run test, see it fail**

- [x] **Step 3: Implement**

```ts
// src/renderer/composables/useEditableFields.ts
import { reactive, watch, type Ref } from 'vue';

export function useEditableFields<T extends Record<string, unknown>>(
  idRef: Ref<string | null>,
  dataRef: Ref<T | null>,
  persist: (id: string, patch: Partial<T>) => Promise<void>
) {
  const fields = reactive({}) as T;
  let generation = 0;

  watch(
    [idRef, dataRef],
    () => {
      generation++;
      if (dataRef.value) {
        for (const k of Object.keys(dataRef.value) as (keyof T)[]) {
          (fields as Record<string, unknown>)[k as string] = dataRef.value[k];
        }
      }
    },
    { immediate: true, deep: false }
  );

  async function save<K extends keyof T>(field: K) {
    const id = idRef.value;
    if (id === null) return;
    const gen = generation;
    const patch = { [field]: fields[field] } as Partial<T>;
    await persist(id, patch);
    if (gen !== generation) return;          // id changed during save; re-seed already happened
    if (dataRef.value) (dataRef.value as T)[field] = fields[field];
  }

  return { fields, save };
}
```

- [x] **Step 4: Run test, see it pass**

- [x] **Step 5: Commit**

```
git add src/renderer/composables/useEditableFields.ts tests/components/composables/useEditableFields.test.ts
git commit -m "feat(renderer): add useEditableFields composable"
```

---

## Task 4: EntityPanel shell component

**Files:**
- Create: `src/renderer/components/EntityPanel.vue`
- Create: `tests/components/EntityPanel.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/components/EntityPanel.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import EntityPanel from '../../src/renderer/components/EntityPanel.vue';

describe('EntityPanel', () => {
  it('renders empty state when entity is null', () => {
    const w = mount(EntityPanel, {
      props: { entityType: 'person', entity: null, label: 'Person' },
    });
    expect(w.find('.empty').exists()).toBe(true);
  });

  it('emits close when close button clicked', async () => {
    const w = mount(EntityPanel, {
      props: { entityType: 'person', entity: { id: '1' }, label: 'Person' },
      slots: { default: '<div>content</div>' },
    });
    await w.find('[data-testid="entity-close"]').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('emits edit when edit button clicked', async () => {
    const w = mount(EntityPanel, {
      props: { entityType: 'person', entity: { id: '1' }, label: 'Person', editable: true },
    });
    await w.find('[data-testid="entity-edit"]').trigger('click');
    expect(w.emitted('edit')).toHaveLength(1);
  });
});
```

- [x] **Step 2: Run test, see it fail**

- [x] **Step 3: Implement**

```vue
<!-- src/renderer/components/EntityPanel.vue -->
<template>
  <aside v-if="!entity" class="side-panel empty">
    <span class="empty-hint">{{ $t('panel.selectToView') }}</span>
  </aside>
  <aside v-else class="side-panel">
    <div class="panel-header sticky-top">
      <button class="panel-close" data-testid="entity-close" @click="$emit('close')">×</button>
      <span class="role-label" :class="`role-${entityType}`">{{ label }}</span>
      <button
        v-if="editable"
        class="btn-add"
        data-testid="entity-edit"
        @click="$emit('edit')"
      >
        {{ $t('common.edit') }}
      </button>
    </div>
    <slot />
  </aside>
</template>

<script setup lang="ts">
defineProps<{
  entityType: 'person' | 'place' | 'source' | 'relationship' | 'group' | 'task' | 'media';
  entity: { id: string } | null;
  label: string;
  editable?: boolean;
}>();
defineEmits<{ close: []; edit: [] }>();
</script>
```

- [x] **Step 4: Run test, see it pass**

- [x] **Step 5: Commit**

```
git add src/renderer/components/EntityPanel.vue tests/components/EntityPanel.test.ts
git commit -m "feat(renderer): add EntityPanel shell component"
```

---

## Task 5: Migrate PlacePanel to new composables

PlacePanel is the simplest non-trivial panel. Use it as the migration template.

**Files:**
- Modify: `src/renderer/components/PlacePanel.vue`

- [x] **Step 1: Read the current PlacePanel** (`src/renderer/components/PlacePanel.vue`) and inventory:
  - Loaders called in `load(id)` (likely: `place`, `events`, `persons`, `media`, `citations`, `child_places`, `groups`, `tasks`)
  - Editable fields (e.g. name, place_type, notes, latitude, longitude, dates, address parts)
  - Stale-load guards at lines ~414+

- [x] **Step 2: Refactor data loading**

Replace the manual `place = ref(null)` + `load(id)` with:

```ts
const place = useEntityData(toRef(props, 'placeId'), async id =>
  await window.api.places.get(id)
);
const events = useEntityData(toRef(props, 'placeId'), async id =>
  await window.api.events.forPlace(id)
);
// ...one useEntityData per query
```

Or, if every loader fires together, write a single combined loader:

```ts
const allData = useEntityData(toRef(props, 'placeId'), async id => ({
  place: await window.api.places.get(id),
  events: await window.api.events.forPlace(id),
  persons: await window.api.places.getPersons(id),
  // ...
}));
```

- [x] **Step 3: Refactor field editing**

```ts
const placeData = computed(() => allData.data.value?.place ?? null);
const { fields, save } = useEditableFields(
  toRef(props, 'placeId'),
  placeData,
  async (id, patch) => { await window.api.places.update(id, patch); allData.reload(); }
);
```

Replace every `<input v-model="editFields.name" @blur="saveField('name')" />` with `<input v-model="fields.name" @blur="save('name')" />`.

- [x] **Step 4: Wrap in EntityPanel**

```vue
<EntityPanel
  entity-type="place"
  :entity="placeData"
  :label="$t('places.role')"
  editable
  @close="$emit('close')"
  @edit="openEditModal"
>
  <!-- existing sections -->
</EntityPanel>
```

Delete the old header markup and the `if (!props.placeId) return` empty-state branch — `EntityPanel` handles both.

- [x] **Step 5: Lint, run app, smoke test**

```
npm run lint
./.devcontainer/dev-debug.sh
```

In another terminal, use `slaktforskning-dev` MCP `ui_screenshot` after navigating to `/places/<id>`. Compare against `main`.

- [x] **Step 6: Commit**

```
git add src/renderer/components/PlacePanel.vue
git commit -m "refactor(panel): migrate PlacePanel to useEntityData + useEditableFields"
```

---

## Task 6: Migrate SourcePanel

Same pattern as Task 5. Source has more editable fields (~12) so the win is bigger. After migration, run `npm run lint && npx vitest run`. Smoke-check `/sources/<id>`. Commit.

---

## Task 7: Migrate RelationshipPanel

Type-change is special: when relationship type flips couple ↔ parent_child, the editable schema changes. Keep the existing `onTypeChange` logic as-is — `useEditableFields` only deduplicates the per-field save plumbing. Commit.

---

## Task 8: Migrate GroupPanel

Smallest panel. Quick win. Commit.

---

## Task 9: Migrate ResearchTaskPanel

Status cycling, priority chips. Commit.

---

## Task 10: Migrate PersonPanel

PersonPanel already uses `usePersonPanelData` — it is the existing manual implementation of what `useEntityData` now provides. Replace the bespoke composable with the generic one. Delete `src/renderer/composables/usePersonPanelData.ts` after migration (grep for any other call sites first). Commit `refactor(panel): consolidate PersonPanel onto useEntityData`.

---

## Task 11: Fix EventList stale-load race

**Files:**
- Modify: `src/renderer/components/EventList.vue`
- Create: `tests/components/EventList.race.test.ts`

- [x] **Step 1: Reproduce the race in a test**

```ts
// tests/components/EventList.race.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EventList from '../../src/renderer/components/EventList.vue';

describe('EventList race', () => {
  it('does not show stale events when personId changes mid-fetch', async () => {
    let resolveA: (v: unknown) => void = () => {};
    const apiMock = vi.fn((id: string) =>
      id === 'a'
        ? new Promise(r => { resolveA = r; })
        : Promise.resolve([{ id: 'eB', event_type: 'birth' }])
    );
    (globalThis as { api: { events: { forPerson: typeof apiMock } } }).api =
      { events: { forPerson: apiMock } };

    const w = mount(EventList, { props: { personId: 'a' } });
    await flushPromises();

    await w.setProps({ personId: 'b' });
    await flushPromises();
    resolveA([{ id: 'eA', event_type: 'death' }]);   // late
    await flushPromises();

    const text = w.text();
    expect(text).toContain('birth');  // events for B
    expect(text).not.toContain('death'); // not stale A
  });
});
```

- [x] **Step 2: Run test, see it fail**

- [x] **Step 3: Refactor `EventList.vue:133-200` to use `useEntityData`**

Replace the manual `watch(props, load)` + `events.value = ...` with:

```ts
const idRef = computed(() => props.personId ?? props.relationshipId ?? props.placeId ?? null);
const { data: events } = useEntityData(idRef, async id => {
  if (props.personId)       return await window.api.events.forPerson(id);
  if (props.relationshipId) return await window.api.events.forRelationship(id);
  if (props.placeId)        return await window.api.events.forPlace(id);
  return [];
});
```

- [x] **Step 4: Run test, see it pass**

- [x] **Step 5: Commit**

```
git add src/renderer/components/EventList.vue tests/components/EventList.race.test.ts
git commit -m "fix(panel): close stale-load race in EventList"
```

---

## Task 12: Migrate self-loading sections

`PersonMediaSection`, `PersonChecksSection`, `PersonIdentifiersSection` all have the same pattern: `watch(() => props.personId, load, { immediate: true })`. Replace with `useEntityData(toRef(props, 'personId'), loader)`.

For each section:
- [x] Refactor.
- [x] Smoke-check by clicking rapidly between persons in the running app.
- [x] Commit `refactor(panel): migrate <Section> to useEntityData`.

---

## Task 13: usePagedList — auto-react to mutations

The left-side list views (`PersonsListTab`, `PlacesView`, `SourcesView`, `MediaView`, `RelationshipsView`, `GroupsView`, `ResearchTasksView`) all use `usePagedList`. Today, only some watch `dataVersionStore.version` to trigger reload after mutations — others go stale. Bake the subscription into the composable.

**Files:**
- Modify: `src/renderer/composables/usePagedList.ts`
- Modify (or create): `tests/components/composables/usePagedList.test.ts`

- [x] **Step 1: Extend the test**

```ts
// tests/components/composables/usePagedList.test.ts (append)
describe('usePagedList — onDataChanged reactivity', () => {
  it('reloads (debounced) when onDataChanged fires', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetchPage = vi.fn(async () => {
      calls++;
      return { items: [{ id: String(calls) }], total: calls };
    });
    const list = usePagedList({ defaultSortBy: 'name', fetchPage });
    await flushPromises();
    expect(fetchPage).toHaveBeenCalledTimes(1);

    dataChangedCb!(); dataChangedCb!();
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();
    expect(fetchPage).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('opt-out via subscribe: false', async () => {
    const fetchPage = vi.fn(async () => ({ items: [], total: 0 }));
    usePagedList({ defaultSortBy: 'name', fetchPage, subscribe: false });
    await flushPromises();
    expect(dataChangedCb).toBeNull();
  });

  it('unsubscribes on unmount', async () => {
    const scope = effectScope();
    scope.run(() => {
      usePagedList({ defaultSortBy: 'name', fetchPage: async () => ({ items: [], total: 0 }) });
    });
    expect(dataChangedCb).not.toBeNull();
    scope.stop();
    expect(dataChangedCb).toBeNull();
  });
});
```

- [x] **Step 2: Implement the subscription**

In `src/renderer/composables/usePagedList.ts`:

```ts
export interface PagedListOptions<T, SortBy extends string> {
  // ... existing fields ...
  /** Auto-reload on `onDataChanged`. Default true. */
  subscribe?: boolean;
}

// Inside the function, after the existing watches:
const subscribe = opts.subscribe ?? true;
if (subscribe && typeof window !== 'undefined' && window.api?.onDataChanged) {
  let mutationDebounce: ReturnType<typeof setTimeout> | null = null;
  const onMutation = () => {
    if (mutationDebounce) clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(() => { void reload(); }, 200);
  };
  window.api.onDataChanged(onMutation);
  onScopeDispose(() => {
    if (mutationDebounce) clearTimeout(mutationDebounce);
    window.api?.offDataChanged?.(onMutation);
  });
}
```

(Use `onScopeDispose` not `onUnmounted` so the existing `onUnmounted` for the IntersectionObserver stays untouched, and so the subscription works for any composable that wraps `usePagedList`.)

- [x] **Step 3: Run tests, lint, smoke-check**

```
npx vitest run tests/components/composables/usePagedList.test.ts
npm run lint
```

- [x] **Step 4: Commit**

```
git add src/renderer/composables/usePagedList.ts tests/components/composables/usePagedList.test.ts
git commit -m "feat(renderer): usePagedList auto-subscribes to onDataChanged"
```

---

## Task 14: Migrate center views (chart / map / timeline) to use the composables

The center column of each list+panel view holds a chart, map, or timeline. Today, none of these auto-react to mutations — Ben's reactivity work added an ad-hoc `onDataChanged` listener in `PersonsView` to call `chartRef.refetch()`. This task migrates each chart/map/timeline so its data source goes through `useEntityData`, eliminating the ad-hoc registrations.

**Files modified (one commit per migration):**
- `src/renderer/components/HourglassChart.vue`, `PedigreeChart.vue`, `DescendantChart.vue` — replace bespoke `load()` + `watch(personId, load)` with `useEntityData(toRef(props,'personId'), loader)`. Keep the existing `refetch()` `defineExpose` for the rare case `PersonsView` needs to force a refresh imperatively, but `refetch()` becomes a thin wrapper around the composable's `reload`.
- `src/renderer/components/MapView.vue` (if applicable) and `src/renderer/views/PlacesView.vue` map data path — currently uses `dataVersionStore.version` watch + targeted `refreshPlace(id)`. Keep the targeted refresh as a Pattern-1 optimisation (frontend-design SKILL section "Map reactivity on data changes"), but replace the `dataVersionStore.version` watch with the `usePagedList` subscription baked in by Task 13.
- `src/renderer/components/PersonTimeline.vue`, `PersonMap.vue` — already use `watch(() => props.personId, load, { immediate: true })`. Migrate to `useEntityData` so they refetch on event/relationship mutation, not just person change.

**Per-component checklist:**
- [x] Replace the bespoke loader with `useEntityData`.
- [x] If the component exposes `refetch()` via `defineExpose`, keep the export, return the composable's `reload`.
- [x] Verify no manual `window.api.onDataChanged(...)` call remains in the component.
- [x] Smoke-check by editing an event for the focal person and watching the chart / timeline / map update without view-switch.
- [x] Commit per component: `refactor(chart): HourglassChart uses useEntityData`, etc.

---

## Task 15: Sweep — remove ad-hoc onDataChanged / dataVersionStore listeners

Composables now own the subscription. The remaining ad-hoc registrations should disappear or be reduced to the few cases that genuinely need cross-component fan-out (e.g., the badge debouncing in `App.vue`, which intentionally watches everything).

- [x] **Step 1: Audit**

```bash
grep -RIn "onDataChanged\|offDataChanged\|dataVersionStore\.version" src/renderer | grep -v "composables/useEntityData.ts\|composables/usePagedList.ts\|App.vue\|preload"
```

- [x] **Step 2:** For each hit:
  - If it's calling `composable.reload()` to react to mutations → DELETE (the composable now auto-reloads).
  - If it's doing something the composable can't (cross-entity fan-out, badge counts in `App.vue`, undo toast) → KEEP and add a comment explaining why.

Expected high-confidence deletions:
- `usePersonPanelData.ts` — the bespoke `onMutation` debounce + `reloadCounts` listener (the composable subscription replaces it; counts come from `useEntityData` per query).
- `PersonsView.vue` — the direct `onDataChanged(onChartDataChanged)` call (chart components now self-subscribe via `useEntityData`).
- `PlacesView.vue`, `SourcesView.vue` — the `dataVersionStore.version` watch wrappers (`usePagedList` now self-subscribes).

- [x] **Step 3:** `npm run lint && npx vitest run && npm run test:e2e`. Smoke-check each list+panel+center triple by editing data via a modal and watching all three update.

- [x] **Step 4:** Commit `refactor(renderer): drop ad-hoc onDataChanged listeners now that composables own reactivity`.

---

## Task 16: Document the pattern in CLAUDE.md + skills

- [x] **Step 1:** Update `.claude/rules/renderer.md` "Person Section Component Pattern" section to:
  - Mark `useEntityData` as the canonical self-loading-section pattern.
  - Add explicit guidance that `useEntityData` and `usePagedList` auto-react to `onDataChanged` and that **components must NOT register `window.api.onDataChanged(...)` directly**.
  - Add a short "Cross-view reactivity" subsection summarising the contract from the plan header.
- [x] **Step 2:** Update `.claude/skills/frontend-design/SKILL.md`:
  - Replace the "Refreshing Views on Data Changes" section's three-pattern explanation with one rule: "lean on `useEntityData` / `usePagedList`; the composables own the subscription. Use Pattern-1 panel-emits-refresh only when you need a targeted single-row update without a full reload (e.g., map pin)."
  - Add `EntityPanel` to the components catalog.
- [x] **Step 3:** Update `.claude/skills/add-feature/SKILL.md`:
  - In the renderer section, point to `useEntityData` for any new self-loading section component, and `usePagedList` for any new list view.
  - Note that `mutating: true` on a `defineChannel` is what makes downstream reactivity work — the composable side is automatic.
- [x] **Step 4:** Update `CLAUDE.md` "Vue Component Patterns" section if present, otherwise just point to the skill.
- [x] **Step 5:** Commit `docs: document panel composables + cross-view reactivity rule`.

---

## Self-review checklist

- [x] No panel file contains a manual `if (props.id !== id) return` guard.
- [x] No panel file declares its own `editFields` reactive + `saveField` function.
- [x] `grep -RIn "localStorage.setItem('" src/renderer` returns 0 — every key goes through `STORAGE_KEYS`.
- [x] `EventList.race.test.ts` is green.
- [x] `grep -RIn "onDataChanged\|dataVersionStore" src/renderer/{views,components}` returns ONLY justified cases (App.vue badge debouncing, panel-emits Pattern-1 in MapView, the targeted `refreshPlace`). Every other site reaches reactivity through `useEntityData` / `usePagedList`.
- [x] **Reactivity smoke test**: with the app running, open `/persons/:id` (left list + right panel + center chart all visible). Edit an event for the focal person via the panel's EventList → all three update without view-switch. Repeat for `/places/:id` (left list + right panel + center map): rename a place via the panel → list row, panel header, and map pin all update. Repeat for `/sources/:id`.
- [x] `npm run test:e2e` passes (CRUD round-trip exercises every panel via `/persons/:id` etc.).
- [x] CLAUDE.md / `.claude/rules/renderer.md` / frontend-design + add-feature skills updated to mark `useEntityData` and `usePagedList` as the canonical reactive loaders.

## Out of scope (for follow-up plans)

- Section-collapse storage migration (currently in `usePanelSections` — leave alone).
- Modal form-handling abstraction (related but distinct refactor; punt).
- Per-domain mutation event channels (e.g. only-fire-when-events-change). Today every mutation pings every listener; debounce keeps the cost negligible. Revisit only if profiling shows wasted reloads.
- IPC channel registry (see `2026-04-28-ipc-channel-registry.md`).
- API link helpers (see `2026-04-28-api-link-helpers.md`).
