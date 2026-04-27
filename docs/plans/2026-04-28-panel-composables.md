# Panel Composables & EntityPanel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate ~600 lines of repeated panel code across 6 entity panels by extracting three composables (`useEntityData`, `useEditableFields`, `usePanelStorage`) and a shared `<EntityPanel>` shell. Fix the EventList stale-load race condition along the way and centralize the 56+ ad-hoc localStorage keys.

**Architecture:**
- `useEntityData<T>(idRef, loaders)` — race-safe loading with a generation counter. Replaces hand-rolled `if (props.id !== id) return` guards.
- `useEditableFields<T>(idRef, refetch, persist)` — debounced field-edit/save with race-safe persistence. Replaces hand-rolled `editFields` + `saveField` patterns.
- `<EntityPanel>` — wrapper component owning header (close button, role label, edit button), sticky-top section, and slot for sections. Replaces 6 near-identical panel headers.
- `src/renderer/utils/storage-keys.ts` — central registry of every localStorage key with typed `getJSON/setJSON` helpers.

**Tech Stack:** Vue 3 Composition API, Pinia, Vitest, @vue/test-utils.

---

## Why this matters

Six entity panels (`PersonPanel`, `PlacePanel`, `SourcePanel`, `RelationshipPanel`, `GroupPanel`, `ResearchTaskPanel`) repeat:
- Header skeleton (~20 lines × 6 = 120 lines)
- `editFields` + `saveField(field)` (`SourcePanel.vue:331-340,432-443`, `RelationshipPanel.vue:269-357`, `PlacePanel.vue:375+`)
- Stale-load guards (`PlacePanel.vue:414`, `SourcePanel.vue:391,409,418`, `RelationshipPanel.vue:314,327,334`, `GroupPanel.vue:177,191`, `ResearchTaskPanel.vue:222,241`)

Plus a confirmed race in `EventList.vue:133-200` (no guard) and ad-hoc localStorage keys scattered across 27 files.

After this refactor:
- Adding a new entity panel is ~30 lines: declare loaders, declare editable field shape, slot section components.
- Stale-load races impossible by construction.
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

- [ ] **Step 1: Audit existing keys**

```
grep -RInE "localStorage\\.(get|set|remove)Item\\(['\"]" src/renderer | sort -u > /tmp/keys.txt
wc -l /tmp/keys.txt
```

Should show 50+ unique keys.

- [ ] **Step 2: Write the failing test**

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

- [ ] **Step 3: Run test, see it fail**

```
npx vitest run tests/unit/storage-keys.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

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

- [ ] **Step 5: Run test, see it pass**

```
npx vitest run tests/unit/storage-keys.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Migrate one usage site as proof**

Pick `src/renderer/views/PersonsView.vue`. Replace inline string keys with `STORAGE_KEYS.personsPanelOpen` etc. Run `npm run lint`.

- [ ] **Step 7: Commit**

```
git add src/renderer/utils/storage-keys.ts tests/unit/storage-keys.test.ts \
        src/renderer/views/PersonsView.vue
git commit -m "feat(renderer): centralize localStorage keys"
```

- [ ] **Step 8: Migrate remaining call sites incrementally**

This is mechanical search-and-replace. Use:

```
grep -RIln "localStorage.\\(getItem\\|setItem\\|removeItem\\)" src/renderer
```

For each file: replace string literal with `STORAGE_KEYS.foo`. Add new entries to the registry as discovered. Commit per file or per cluster of related files. Lint after each.

---

## Task 2: useEntityData composable

**Files:**
- Create: `src/renderer/composables/useEntityData.ts`
- Create: `tests/components/composables/useEntityData.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/components/composables/useEntityData.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import { useEntityData } from '../../../src/renderer/composables/useEntityData';

describe('useEntityData', () => {
  it('loads data when id changes', async () => {
    const id = ref<string | null>(null);
    const load = vi.fn(async (i: string) => ({ id: i, name: 'X' }));
    const { data, loading } = useEntityData(id, load);

    expect(data.value).toBeNull();
    id.value = 'a';
    await nextTick();
    await nextTick();
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

    // Late-arriving result for 'a' must not overwrite
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
```

- [ ] **Step 2: Run test, see it fail**

```
npx vitest run tests/components/composables/useEntityData.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/renderer/composables/useEntityData.ts
import { ref, watch, type Ref } from 'vue';

export function useEntityData<T>(
  idRef: Ref<string | null>,
  loader: (id: string) => Promise<T>
) {
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
      if (gen !== generation) return;       // stale
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

  return { data, loading, error, reload };
}
```

- [ ] **Step 4: Run test, see it pass**

```
npx vitest run tests/components/composables/useEntityData.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```
git add src/renderer/composables/useEntityData.ts tests/components/composables/useEntityData.test.ts
git commit -m "feat(renderer): add useEntityData composable"
```

---

## Task 3: useEditableFields composable

**Files:**
- Create: `src/renderer/composables/useEditableFields.ts`
- Create: `tests/components/composables/useEditableFields.test.ts`

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test, see it fail**

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run test, see it pass**

- [ ] **Step 5: Commit**

```
git add src/renderer/composables/useEditableFields.ts tests/components/composables/useEditableFields.test.ts
git commit -m "feat(renderer): add useEditableFields composable"
```

---

## Task 4: EntityPanel shell component

**Files:**
- Create: `src/renderer/components/EntityPanel.vue`
- Create: `tests/components/EntityPanel.test.ts`

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test, see it fail**

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run test, see it pass**

- [ ] **Step 5: Commit**

```
git add src/renderer/components/EntityPanel.vue tests/components/EntityPanel.test.ts
git commit -m "feat(renderer): add EntityPanel shell component"
```

---

## Task 5: Migrate PlacePanel to new composables

PlacePanel is the simplest non-trivial panel. Use it as the migration template.

**Files:**
- Modify: `src/renderer/components/PlacePanel.vue`

- [ ] **Step 1: Read the current PlacePanel** (`src/renderer/components/PlacePanel.vue`) and inventory:
  - Loaders called in `load(id)` (likely: `place`, `events`, `persons`, `media`, `citations`, `child_places`, `groups`, `tasks`)
  - Editable fields (e.g. name, place_type, notes, latitude, longitude, dates, address parts)
  - Stale-load guards at lines ~414+

- [ ] **Step 2: Refactor data loading**

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

- [ ] **Step 3: Refactor field editing**

```ts
const placeData = computed(() => allData.data.value?.place ?? null);
const { fields, save } = useEditableFields(
  toRef(props, 'placeId'),
  placeData,
  async (id, patch) => { await window.api.places.update(id, patch); allData.reload(); }
);
```

Replace every `<input v-model="editFields.name" @blur="saveField('name')" />` with `<input v-model="fields.name" @blur="save('name')" />`.

- [ ] **Step 4: Wrap in EntityPanel**

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

- [ ] **Step 5: Lint, run app, smoke test**

```
npm run lint
./.devcontainer/dev-debug.sh
```

In another terminal, use `slaktforskning-dev` MCP `ui_screenshot` after navigating to `/places/<id>`. Compare against `main`.

- [ ] **Step 6: Commit**

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

- [ ] **Step 1: Reproduce the race in a test**

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

- [ ] **Step 2: Run test, see it fail**

- [ ] **Step 3: Refactor `EventList.vue:133-200` to use `useEntityData`**

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

- [ ] **Step 4: Run test, see it pass**

- [ ] **Step 5: Commit**

```
git add src/renderer/components/EventList.vue tests/components/EventList.race.test.ts
git commit -m "fix(panel): close stale-load race in EventList"
```

---

## Task 12: Migrate self-loading sections

`PersonMediaSection`, `PersonChecksSection`, `PersonIdentifiersSection` all have the same pattern: `watch(() => props.personId, load, { immediate: true })`. Replace with `useEntityData(toRef(props, 'personId'), loader)`.

For each section:
- [ ] Refactor.
- [ ] Smoke-check by clicking rapidly between persons in the running app.
- [ ] Commit `refactor(panel): migrate <Section> to useEntityData`.

---

## Task 13: Document the pattern in CLAUDE.md

- [ ] **Step 1:** Update the "Vue Component Patterns → Person Section Component Pattern" section of CLAUDE.md to reference `useEntityData` and `useEditableFields` as the canonical loaders.
- [ ] **Step 2:** Add `EntityPanel` to the "Domain Components" table.
- [ ] **Step 3:** Update the storage-keys reference in any panel-resize docs.
- [ ] **Step 4:** Commit `docs: document panel composable pattern`.

---

## Self-review checklist

- [ ] No panel file contains a manual `if (props.id !== id) return` guard.
- [ ] No panel file declares its own `editFields` reactive + `saveField` function.
- [ ] `grep -RIn "localStorage.setItem('" src/renderer` returns 0 — every key goes through `STORAGE_KEYS`.
- [ ] `EventList.race.test.ts` is green.
- [ ] `npm run test:e2e` passes (CRUD round-trip exercises every panel via `/persons/:id` etc.).
- [ ] CLAUDE.md updated.

## Out of scope (for follow-up plans)

- Section-collapse storage migration (currently in `usePanelSections` — leave alone).
- Modal form-handling abstraction (related but distinct refactor; punt).
- IPC channel registry (see `2026-04-28-ipc-channel-registry.md`).
- API link helpers (see `2026-04-28-api-link-helpers.md`).
