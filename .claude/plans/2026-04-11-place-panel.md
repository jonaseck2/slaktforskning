# PlacePanel — Map Side Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a side panel to MapView that shows comprehensive place details when a map pin is clicked, mirroring the PersonPanel pattern from VisualizationView.

**Architecture:** New `PlacePanel.vue` component with 8 collapsible sections, integrated into MapView with a drag-resize handle. Requires one new API function (`getPersonsForPlace`), one new IPC channel, extending EventList with a `placeId` prop, and two new section components (`PlacePersonsSection`, `PlaceCitationsSection`). Also creates an `EntityMediaSection` to replace the person-only `PersonMediaSection` with a generic entity-aware version.

**Tech Stack:** Vue 3 Composition API, TypeScript, SQLite, Electron IPC

**Spec:** `docs/superpowers/specs/2026-04-11-place-panel-design.md`

---

### Task 1: Add `getPersonsForPlace` API function + test

**Files:**
- Modify: `src/api/places.ts`
- Create: `tests/unit/places.test.ts`

- [ ] **Step 1: Create test file with failing test**

Create `tests/unit/places.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import { createTestDb } from './helpers';
import { createPlace, getPersonsForPlace } from '../../src/api/places';
import { createPerson, addPersonName } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';

describe('getPersonsForPlace', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns persons linked to events at a place', () => {
    const place = createPlace(db, { name: 'Stockholm' });
    const person = createPerson(db, { sex: 'M' });
    addPersonName(db, person.id, { given_name: 'Erik', surname: 'Svensson' });
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const result = getPersonsForPlace(db, place.id);
    expect(result).toHaveLength(1);
    expect(result[0].given_name).toBe('Erik');
    expect(result[0].surname).toBe('Svensson');
    expect(result[0].event_count).toBe(1);
  });

  it('returns empty array for place with no events', () => {
    const place = createPlace(db, { name: 'Nowhere' });
    const result = getPersonsForPlace(db, place.id);
    expect(result).toEqual([]);
  });

  it('deduplicates persons with multiple events at same place', () => {
    const place = createPlace(db, { name: 'Uppsala' });
    const person = createPerson(db, { sex: 'F' });
    addPersonName(db, person.id, { given_name: 'Anna', surname: 'Nilsson' });
    const e1 = createEvent(db, { event_type: 'birth', place_id: place.id });
    const e2 = createEvent(db, { event_type: 'christening', place_id: place.id });
    addEventParticipant(db, { event_id: e1.id, person_id: person.id, role: 'primary' });
    addEventParticipant(db, { event_id: e2.id, person_id: person.id, role: 'primary' });

    const result = getPersonsForPlace(db, place.id);
    expect(result).toHaveLength(1);
    expect(result[0].event_count).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/places.test.ts`
Expected: FAIL — `getPersonsForPlace` is not exported from `src/api/places.ts`

- [ ] **Step 3: Implement `getPersonsForPlace` in `src/api/places.ts`**

Add to the end of `src/api/places.ts`, before the closing of the file. Also add the import for `queryAll` if not already present:

```typescript
export function getPersonsForPlace(
  db: Database,
  placeId: string
): { id: string; sex: string; given_name: string; surname: string; event_count: number }[] {
  return queryAll(db, `
    SELECT p.id, p.sex,
      COALESCE(pn.given_name, '') AS given_name,
      COALESCE(pn.surname, '') AS surname,
      COUNT(DISTINCT e.id) AS event_count
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    JOIN persons p ON p.id = ep.person_id
    LEFT JOIN person_names pn ON pn.person_id = p.id AND pn.sort_order = (
      SELECT MIN(pn2.sort_order) FROM person_names pn2 WHERE pn2.person_id = p.id
    )
    WHERE e.place_id = ?
    GROUP BY p.id
    ORDER BY pn.surname, pn.given_name
  `, [placeId]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/places.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```
feat: add getPersonsForPlace API function
```

---

### Task 2: Add IPC channel for `getPersonsForPlace`

**Files:**
- Modify: `src/main/ipc/places.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add IPC handler in `src/main/ipc/places.ts`**

Add after the existing `wrapHandler('places:getPath', ...)` line:

```typescript
wrapHandler('places:getPersons', (placeId) => places.getPersonsForPlace(getDb(), placeId as string));
```

- [ ] **Step 2: Add preload binding in `src/preload/index.ts`**

In the `places:` object, add after the `getPath` line:

```typescript
getPersons: (placeId: string) => ipcRenderer.invoke('places:getPersons', placeId),
```

- [ ] **Step 3: Verify the app still compiles**

Run: `npm test -- --run`
Expected: All existing tests still pass

- [ ] **Step 4: Commit**

```
feat: add places:getPersons IPC channel
```

---

### Task 3: Add `placeId` prop to EventList

**Files:**
- Modify: `src/renderer/components/EventList.vue`

- [ ] **Step 1: Add `placeId` prop to the props definition**

In EventList.vue, change the props definition from:

```typescript
const props = defineProps<{
  personId?: string;
  relationshipId?: string;
  readonly?: boolean;
  hideHeader?: boolean;
}>();
```

to:

```typescript
const props = defineProps<{
  personId?: string;
  relationshipId?: string;
  placeId?: string;
  readonly?: boolean;
  hideHeader?: boolean;
}>();
```

- [ ] **Step 2: Add place loading path in the `load()` function**

Change the `load()` function from:

```typescript
async function load() {
  if (!window.api) return;
  try {
    if (props.personId) {
      events.value = (await window.api.events.forPerson(props.personId)) as EventRow[];
    } else if (props.relationshipId) {
      events.value = (await window.api.events.forRelationship(props.relationshipId)) as EventRow[];
    }
  } catch (err) {
    console.error('[EventList] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}
```

to:

```typescript
async function load() {
  if (!window.api) return;
  try {
    if (props.personId) {
      events.value = (await window.api.events.forPerson(props.personId)) as EventRow[];
    } else if (props.relationshipId) {
      events.value = (await window.api.events.forRelationship(props.relationshipId)) as EventRow[];
    } else if (props.placeId) {
      events.value = (await window.api.events.forPlace(props.placeId)) as EventRow[];
    }
  } catch (err) {
    console.error('[EventList] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}
```

- [ ] **Step 3: Change from `onMounted` to `watch` for reactive reloading**

EventList currently uses `onMounted(load)`. For the PlacePanel use case (where `placeId` changes without remounting), change it to use a watcher. Replace:

```typescript
onMounted(load);
```

with:

```typescript
import { ref, watch } from 'vue';
// ... (remove onMounted from the import if no longer used elsewhere)

watch(
  () => props.personId ?? props.relationshipId ?? props.placeId,
  () => load(),
  { immediate: true }
);
```

Remove `onMounted` from the import at line 69 if it is no longer used anywhere else in the component.

- [ ] **Step 4: Run tests**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```
feat: add placeId prop to EventList component
```

---

### Task 4: Create `PlacePersonsSection` component

**Files:**
- Create: `src/renderer/components/PlacePersonsSection.vue`

- [ ] **Step 1: Create the component**

Create `src/renderer/components/PlacePersonsSection.vue`:

```vue
<template>
  <div>
    <div v-if="persons.length === 0" class="empty-hint">{{ $t('places.noPersons') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('persons.name') }}</th>
          <th>{{ $t('persons.sex') }}</th>
          <th>{{ $t('places.eventCount') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in persons" :key="p.id" class="clickable-row" @click="$router.push('/persons/' + p.id)">
          <td>
            <router-link :to="'/persons/' + p.id" class="person-link" @click.stop>
              {{ [p.given_name, p.surname].filter(Boolean).join(' ') || '—' }}
            </router-link>
          </td>
          <td><span :class="['sex-badge', 'sex-' + p.sex]">{{ p.sex }}</span></td>
          <td>{{ p.event_count }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface PersonAtPlace {
  id: string;
  sex: string;
  given_name: string;
  surname: string;
  event_count: number;
}

const props = defineProps<{ placeId: string }>();
const persons = ref<PersonAtPlace[]>([]);

async function load() {
  persons.value = (await window.api.places.getPersons(props.placeId)) as PersonAtPlace[];
}

watch(() => props.placeId, () => load(), { immediate: true });

defineExpose({ reload: load });
</script>
```

- [ ] **Step 2: Add i18n keys**

Add to the `places` section in both `src/renderer/i18n/en.ts` and `src/renderer/i18n/sv.ts`:

English (`en.ts`), in the `places` object:
```typescript
noPersons: 'No persons linked to this place',
eventCount: 'Events',
```

Swedish (`sv.ts`), in the `places` object:
```typescript
noPersons: 'Inga personer kopplade till denna plats',
eventCount: 'Händelser',
```

- [ ] **Step 3: Run tests**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```
feat: add PlacePersonsSection component
```

---

### Task 5: Create `PlaceCitationsSection` component

**Files:**
- Create: `src/renderer/components/PlaceCitationsSection.vue`

- [ ] **Step 1: Create the component**

Create `src/renderer/components/PlaceCitationsSection.vue`:

```vue
<template>
  <div>
    <div v-if="citations.length === 0" class="empty-hint">{{ $t('citations.noCitations') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('sources.title') }}</th>
          <th>{{ $t('citations.page') }}</th>
          <th>{{ $t('citations.confidence') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in citations" :key="c.id" class="clickable-row" @click="$router.push('/sources/' + c.source_id)">
          <td>
            <router-link :to="'/sources/' + c.source_id" class="person-link" @click.stop>
              {{ c.source_title || '—' }}
            </router-link>
          </td>
          <td>{{ c.page || '—' }}</td>
          <td>
            <span v-if="c.confidence != null" class="confidence-badge">
              {{ CONFIDENCE_LABELS[c.confidence] ?? c.confidence }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const CONFIDENCE_LABELS: Record<number, string> = {
  0: 'Unreliable',
  1: 'Questionable',
  2: 'Secondary',
  3: 'Primary',
};

interface CitationRow {
  id: string;
  source_id: string;
  source_title: string;
  page: string | null;
  confidence: number | null;
  transcription: string | null;
  notes: string | null;
}

const props = defineProps<{ placeId: string }>();
const citations = ref<CitationRow[]>([]);

async function load() {
  const raw = (await window.api.citations.forPlace(props.placeId)) as Array<{
    id: string; source_id: string; page: string | null; confidence: number | null;
    transcription: string | null; notes: string | null;
  }>;
  // Enrich with source titles
  const enriched: CitationRow[] = [];
  for (const c of raw) {
    const source = (await window.api.sources.get(c.source_id)) as { title: string } | null;
    enriched.push({ ...c, source_title: source?.title ?? '' });
  }
  citations.value = enriched;
}

watch(() => props.placeId, () => load(), { immediate: true });

defineExpose({ reload: load });
</script>
```

- [ ] **Step 2: Add i18n keys if missing**

Check `en.ts` and `sv.ts` for existing `citations.noCitations` key. If missing, add:

English (`en.ts`), in a `citations` section (create if needed):
```typescript
citations: {
  noCitations: 'No citations',
  page: 'Page',
  confidence: 'Confidence',
},
```

Swedish (`sv.ts`):
```typescript
citations: {
  noCitations: 'Inga källhänvisningar',
  page: 'Sida',
  confidence: 'Tillförlitlighet',
},
```

- [ ] **Step 3: Run tests**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```
feat: add PlaceCitationsSection component
```

---

### Task 6: Create `EntityMediaSection` component

**Files:**
- Create: `src/renderer/components/EntityMediaSection.vue`

The existing `PersonMediaSection` is hardcoded to `entity_type: 'person'`. Rather than duplicating it, create a new `EntityMediaSection` that accepts `entityType` and `entityId` props. This can be used for places and later for other entity types.

- [ ] **Step 1: Create the component**

Create `src/renderer/components/EntityMediaSection.vue` by copying the pattern from `PersonMediaSection.vue` but making `entityType` and `entityId` props:

```vue
<template>
  <div>
    <div v-if="media.length === 0" class="empty-hint">{{ $t('media.noMedia') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th class="th-shrink"></th>
          <th class="th-shrink"></th>
          <th>{{ $t('media.title_label') }}</th>
          <th class="th-shrink">{{ $t('media.format') }}</th>
          <th class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(m, idx) in media" :key="m.link_id" class="clickable-row" @click="openLightbox(idx)">
          <td class="td-shrink thumb-cell">
            <img v-if="thumbnails[m.id]" :src="thumbnails[m.id]" class="row-thumb" :alt="mediaDisplayName(m.title, m.file_ref, '')" />
            <span v-else-if="isImage(m.format)" class="row-thumb-placeholder"></span>
            <span v-else class="row-thumb-icon">{{ (m.format || '?').toUpperCase() }}</span>
          </td>
          <td class="td-shrink order-cell">
            <span v-if="idx === 0" class="profile-badge">{{ $t('media.profile') }}</span>
            <button class="btn-order" :disabled="idx === 0" @click.stop="moveUp(idx)" :title="$t('media.moveUp')">&#9650;</button>
            <button class="btn-order" :disabled="idx === media.length - 1" @click.stop="moveDown(idx)" :title="$t('media.moveDown')">&#9660;</button>
          </td>
          <td>{{ mediaDisplayName(m.title, m.file_ref) }}</td>
          <td class="td-shrink">{{ m.format || '—' }}</td>
          <td class="actions-cell">
            <button v-if="m.file_ref" class="btn-sm" @click.stop="openFile(m.id)">{{ $t('media.open') }}</button>
            <button class="btn-sm btn-delete" @click.stop="unlink(m.link_id)">&#10005;</button>
          </td>
        </tr>
      </tbody>
    </table>

    <MediaLightbox
      :media-items="media"
      :current-index="lightboxIndex"
      :visible="lightboxVisible"
      @close="lightboxVisible = false"
      @update:current-index="lightboxIndex = $event"
      @link-changed="load"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import MediaLightbox from './MediaLightbox.vue';
import { mediaDisplayName } from '../utils/mediaUtils';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif']);

export interface MediaItem {
  id: string;
  title: string;
  file_ref: string | null;
  format: string | null;
  link_id: string;
  link_type: number | null;
  sort_order: number;
  notes: string;
}

const props = defineProps<{
  entityType: 'person' | 'place' | 'event' | 'relationship' | 'source';
  entityId: string;
}>();

const media = ref<MediaItem[]>([]);
const thumbnails = ref<Record<string, string>>({});
const lightboxVisible = ref(false);
const lightboxIndex = ref(0);

defineExpose({ attach, reload: load });

function isImage(format: string | null): boolean {
  return format ? IMAGE_FORMATS.has(format.toLowerCase()) : false;
}

async function load() {
  media.value = (await window.api.media.forEntity(props.entityType, props.entityId)) as MediaItem[];
  loadThumbnails();
}

async function loadThumbnails() {
  for (const m of media.value) {
    if (isImage(m.format) && !thumbnails.value[m.id]) {
      const url = await window.api.media.readAsDataUrl(m.id) as string | null;
      if (url) {
        thumbnails.value[m.id] = url;
      }
    }
  }
}

function openLightbox(idx: number) {
  lightboxIndex.value = idx;
  lightboxVisible.value = true;
}

async function attach() {
  const result = await window.api.media.attach({ entityType: props.entityType, entityId: props.entityId });
  if (!(result as { canceled: boolean }).canceled) {
    await load();
  }
}

async function openFile(id: string) {
  await window.api.media.openFile(id);
}

async function unlink(linkId: string) {
  await window.api.media.removeLink(linkId);
  await load();
}

async function reorder(newOrder: MediaItem[]) {
  media.value = newOrder;
  await window.api.media.reorder(newOrder.map(m => m.link_id));
}

function moveUp(idx: number) {
  if (idx === 0) return;
  const items = [...media.value];
  [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
  reorder(items);
}

function moveDown(idx: number) {
  if (idx === media.value.length - 1) return;
  const items = [...media.value];
  [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
  reorder(items);
}

watch(() => `${props.entityType}:${props.entityId}`, () => load(), { immediate: true });
</script>

<style scoped>
.thumb-cell { width: 40px; }
.row-thumb { width: 36px; height: 36px; object-fit: cover; border-radius: 4px; }
.row-thumb-placeholder { display: inline-block; width: 36px; height: 36px; background: var(--color-bg-muted); border-radius: 4px; }
.row-thumb-icon { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; background: var(--color-bg-muted); border-radius: 4px; font-size: 9px; color: var(--color-text-faint); font-weight: 600; }
.order-cell { white-space: nowrap; }
.btn-order { background: none; border: none; cursor: pointer; padding: 0 2px; font-size: 10px; color: var(--color-text-faint); }
.btn-order:disabled { opacity: 0.2; cursor: default; }
.profile-badge { display: inline-block; background: var(--color-primary); color: white; border-radius: 4px; padding: 1px 5px; font-size: 9px; font-weight: 600; margin-right: 4px; }
.th-shrink, .td-shrink { width: 1px; white-space: nowrap; }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
</style>
```

- [ ] **Step 2: Run tests**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```
feat: add EntityMediaSection component for entity-agnostic media display
```

---

### Task 7: Create `usePlacePanelSections` composable

**Files:**
- Create: `src/renderer/composables/usePlacePanelSections.ts`

The existing `useSectionState` is tightly coupled to `PersonPanelSections`. Create a place-specific section state composable.

- [ ] **Step 1: Create the composable**

Create `src/renderer/composables/usePlacePanelSections.ts`:

```typescript
import { reactive } from 'vue';

export interface PlacePanelSections {
  place: boolean;
  address: boolean;
  children: boolean;
  persons: boolean;
  events: boolean;
  citations: boolean;
  media: boolean;
  mediaTimeline: boolean;
}

const STORAGE_PREFIX = 'map-panel-section-';

function loadSection(key: string, defaultValue: boolean): boolean {
  const v = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
  return v === null ? defaultValue : v === 'true';
}

const SECTION_DEFAULTS: Record<keyof PlacePanelSections, boolean> = {
  place: true,
  address: false,
  children: false,
  persons: true,
  events: true,
  citations: false,
  media: false,
  mediaTimeline: false,
};

export function usePlacePanelSections() {
  const sections = reactive<PlacePanelSections>(
    Object.fromEntries(
      Object.entries(SECTION_DEFAULTS).map(([key, def]) => [key, loadSection(key, def)])
    ) as PlacePanelSections
  );

  function toggleSection(key: keyof PlacePanelSections) {
    sections[key] = !sections[key];
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, String(sections[key]));
  }

  return { sections, toggleSection };
}
```

- [ ] **Step 2: Run tests**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```
feat: add usePlacePanelSections composable
```

---

### Task 8: Create `PlacePanel.vue` component

**Files:**
- Create: `src/renderer/components/PlacePanel.vue`

- [ ] **Step 1: Create the component**

Create `src/renderer/components/PlacePanel.vue`:

```vue
<template>
  <div class="place-panel">
    <!-- Empty state -->
    <div v-if="!placeId" class="panel-empty">
      {{ $t('placePanel.noPlaceSelected') }}
    </div>

    <template v-else-if="place">
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-header-content">
          <div class="panel-name-row">
            <div class="panel-name">{{ place.name }}</div>
            <span v-if="place.place_type" class="type-badge">{{ $t('placeTypes.' + place.place_type) }}</span>
          </div>
          <div class="panel-header-links">
            <router-link :to="'/places/' + placeId" class="panel-detail-link">{{ $t('placePanel.viewFull') }}</router-link>
          </div>
        </div>
      </div>

      <!-- Place section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('place')">
          <span class="panel-chevron">{{ sections.place ? '▾' : '▸' }}</span>
          {{ $t('places.detailsTitle') }}
          <router-link :to="'/places/' + placeId" class="panel-section-header-action" @click.stop>{{ $t('common.edit') }}</router-link>
        </button>
        <div v-if="sections.place" class="panel-section-body">
          <div class="compact-form">
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.name') }}</label>
              <input class="compact-control" type="text" :value="place.name" @blur="save({ name: ($event.target as HTMLInputElement).value })" />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.type') }}</label>
              <select class="compact-control" :value="place.place_type ?? ''" @change="save({ place_type: ($event.target as HTMLSelectElement).value || null })">
                <option value="">—</option>
                <option v-for="pt in PLACE_TYPE_VALUES" :key="pt" :value="pt">{{ $t('placeTypes.' + pt) }}</option>
              </select>
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.parentPlace') }}</label>
              <PlacePicker :model-value="place.parent_place_id" @update:model-value="save({ parent_place_id: $event })" />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.latitude') }}</label>
              <input class="compact-control" type="number" step="0.000001" :value="place.latitude" @blur="save({ latitude: parseFloat(($event.target as HTMLInputElement).value) || null })" />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.longitude') }}</label>
              <input class="compact-control" type="number" step="0.000001" :value="place.longitude" @blur="save({ longitude: parseFloat(($event.target as HTMLInputElement).value) || null })" />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('common.notes') }}</label>
              <textarea class="compact-control" rows="2" :value="place.notes" @blur="save({ notes: ($event.target as HTMLTextAreaElement).value })" />
            </div>
          </div>
        </div>
      </div>

      <!-- Address section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('address')">
          <span class="panel-chevron">{{ sections.address ? '▾' : '▸' }}</span>
          {{ $t('places.address') }}
        </button>
        <div v-if="sections.address" class="panel-section-body">
          <div class="compact-form">
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.street') }}</label>
              <input class="compact-control" type="text" :value="place.street ?? ''" @blur="save({ street: ($event.target as HTMLInputElement).value || null })" />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.postalCode') }}</label>
              <input class="compact-control" type="text" :value="place.postal_code ?? ''" @blur="save({ postal_code: ($event.target as HTMLInputElement).value || null })" />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.city') }}</label>
              <input class="compact-control" type="text" :value="place.city ?? ''" @blur="save({ city: ($event.target as HTMLInputElement).value || null })" />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.country') }}</label>
              <input class="compact-control" type="text" :value="place.country ?? ''" @blur="save({ country: ($event.target as HTMLInputElement).value || null })" />
            </div>
          </div>
        </div>
      </div>

      <!-- Child Places section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('children')">
          <span class="panel-chevron">{{ sections.children ? '▾' : '▸' }}</span>
          {{ $t('places.childPlaces') }}
          <span v-if="childPlaces.length" class="panel-section-count">{{ childPlaces.length }}</span>
        </button>
        <div v-if="sections.children" class="panel-section-body">
          <div v-if="childPlaces.length === 0" class="panel-empty-section">—</div>
          <ul v-else class="child-list">
            <li v-for="child in childPlaces" :key="child.id">
              <a href="#" @click.prevent="$emit('select-place', child.id)">{{ child.name }}</a>
              <span v-if="child.place_type" class="type-badge-sm">{{ $t('placeTypes.' + child.place_type) }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Persons section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('persons')">
          <span class="panel-chevron">{{ sections.persons ? '▾' : '▸' }}</span>
          {{ $t('persons.title') }}
        </button>
        <div v-if="sections.persons" class="panel-section-body">
          <PlacePersonsSection ref="personsSectionRef" :place-id="placeId" />
        </div>
      </div>

      <!-- Events section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('events')">
          <span class="panel-chevron">{{ sections.events ? '▾' : '▸' }}</span>
          {{ $t('panel.events') }}
        </button>
        <div v-if="sections.events" class="panel-section-body">
          <EventList ref="eventListRef" :place-id="placeId" hide-header readonly />
        </div>
      </div>

      <!-- Citations section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('citations')">
          <span class="panel-chevron">{{ sections.citations ? '▾' : '▸' }}</span>
          {{ $t('places.citeSources') }}
        </button>
        <div v-if="sections.citations" class="panel-section-body">
          <PlaceCitationsSection ref="citationsSectionRef" :place-id="placeId" />
        </div>
      </div>

      <!-- Media section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('media')">
          <span class="panel-chevron">{{ sections.media ? '▾' : '▸' }}</span>
          {{ $t('media.title') }}
          <span class="panel-section-header-action" @click.stop="mediaSectionRef?.attach()"><span aria-hidden="true">+ </span>{{ $t('media.attachShort') }}</span>
        </button>
        <div v-if="sections.media" class="panel-section-body">
          <EntityMediaSection ref="mediaSectionRef" entity-type="place" :entity-id="placeId" />
        </div>
      </div>

      <!-- Media Timeline section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('mediaTimeline')">
          <span class="panel-chevron">{{ sections.mediaTimeline ? '▾' : '▸' }}</span>
          {{ $t('mediaTimeline.title') }}
        </button>
        <div v-if="sections.mediaTimeline" class="panel-section-body">
          <MediaTimeline entity-type="place" :entity-id="placeId" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import PlacePicker from './PlacePicker.vue';
import EventList from './EventList.vue';
import PlacePersonsSection from './PlacePersonsSection.vue';
import PlaceCitationsSection from './PlaceCitationsSection.vue';
import EntityMediaSection from './EntityMediaSection.vue';
import MediaTimeline from './MediaTimeline.vue';
import { usePlacePanelSections } from '../composables/usePlacePanelSections';
import { PLACE_TYPE_VALUES } from '../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface PlaceRow {
  id: string;
  name: string;
  place_type: string | null;
  parent_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
}

const props = defineProps<{ placeId: string | null }>();
defineEmits<{ 'select-place': [id: string] }>();

const place = ref<PlaceRow | null>(null);
const childPlaces = ref<PlaceRow[]>([]);

const { sections, toggleSection } = usePlacePanelSections();

// Template refs
const eventListRef = ref<(ComponentPublicInstance & { openAddForm: () => void }) | null>(null);
const personsSectionRef = ref<InstanceType<typeof PlacePersonsSection> | null>(null);
const citationsSectionRef = ref<InstanceType<typeof PlaceCitationsSection> | null>(null);
const mediaSectionRef = ref<InstanceType<typeof EntityMediaSection> | null>(null);

async function load() {
  if (!props.placeId) { place.value = null; childPlaces.value = []; return; }
  place.value = (await window.api.places.get(props.placeId)) as PlaceRow | null;
  if (!place.value) return;
  const allPlaces = (await window.api.places.list()) as PlaceRow[];
  childPlaces.value = allPlaces.filter(p => p.parent_place_id === props.placeId);
}

async function save(data: Record<string, unknown>) {
  if (!props.placeId) return;
  await window.api.places.update(props.placeId, data);
  await load();
}

watch(() => props.placeId, () => load(), { immediate: true });
</script>

<style scoped>
.place-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  background: var(--color-bg);
  font-size: var(--font-sm);
}

.panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-faint);
  font-size: var(--font-sm);
  padding: 24px;
  text-align: center;
}

/* Header */
.panel-header {
  display: flex;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.panel-header-content {
  padding: 10px 14px;
  flex: 1;
  min-width: 0;
}
.panel-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.panel-name {
  font-size: var(--font-base);
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.type-badge {
  background: var(--color-bg-muted);
  color: var(--color-text-subtle);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
  flex-shrink: 0;
}
.panel-header-links {
  font-size: var(--font-xs);
}
.panel-detail-link {
  color: var(--color-primary);
  text-decoration: none;
}
.panel-detail-link:hover { text-decoration: underline; }

/* Sections — same classes as PersonPanel */
.panel-section {
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.panel-section-header {
  width: 100%;
  text-align: left;
  background: var(--color-bg-subtle);
  border: none;
  padding: 8px 14px;
  cursor: pointer;
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 6px;
}
.panel-section-header:hover { background: var(--color-bg-muted); }
.panel-chevron { font-size: var(--font-xs); color: var(--color-text-faint); }
.panel-section-header-action {
  margin-left: auto;
  background: var(--color-primary);
  color: white;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: var(--font-xs);
  font-weight: 600;
  text-decoration: none;
  display: inline-block;
}
.panel-section-header-action:hover { opacity: 0.85; }
.panel-section-count {
  margin-left: auto;
  background: var(--color-bg-muted);
  color: var(--color-text-subtle);
  border-radius: 8px;
  padding: 0 6px;
  font-size: var(--font-xs);
}
.panel-section-body { padding: 4px 0 8px; }
.panel-empty-section { padding: 4px 14px; color: var(--color-text-faint); font-size: var(--font-xs); }

/* Compact form — same as PersonPanel */
.compact-form {
  padding: 4px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.compact-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.compact-label {
  font-size: var(--font-xs);
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-subtle);
  letter-spacing: 0.4px;
}
.compact-control {
  font-size: var(--font-xs);
  padding: 4px 6px;
  border: 1px solid var(--color-border-input);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  resize: vertical;
}
.compact-control:focus {
  outline: none;
  border-color: #2980b9;
}

/* Child list */
.child-list {
  list-style: none;
  padding: 4px 14px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.child-list li { display: flex; align-items: center; gap: 6px; }
.child-list a { color: var(--color-primary); text-decoration: none; font-size: var(--font-xs); }
.child-list a:hover { text-decoration: underline; }
.type-badge-sm {
  background: var(--color-bg-muted);
  color: var(--color-text-subtle);
  padding: 1px 5px;
  border-radius: 8px;
  font-size: 9px;
}
</style>
```

- [ ] **Step 2: Add i18n keys**

Add to both `en.ts` and `sv.ts`:

English (`en.ts`):
```typescript
placePanel: {
  noPlaceSelected: 'Click a pin on the map',
  viewFull: 'View full details',
},
```

Swedish (`sv.ts`):
```typescript
placePanel: {
  noPlaceSelected: 'Klicka på en markör på kartan',
  viewFull: 'Visa alla detaljer',
},
```

- [ ] **Step 3: Run tests**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```
feat: add PlacePanel component with 8 collapsible sections
```

---

### Task 9: Integrate PlacePanel into MapView

**Files:**
- Modify: `src/renderer/views/MapView.vue`

- [ ] **Step 1: Add the side panel layout**

Replace the entire MapView template with:

```vue
<template>
  <div class="map-view">
    <div class="header">
      <h2>{{ $t('map.title') }}</h2>
      <span class="count-label">{{ filteredPlaces.length }} {{ $t('places.title').toLowerCase() }}</span>
    </div>

    <div v-if="filterText || allDisplayPlaces.length > 0" class="map-toolbar">
      <input
        v-model="filterText"
        type="text"
        :placeholder="$t('app.search')"
        class="map-search"
      />
      <span v-if="placesWithoutCoords > 0" class="no-coords-hint">
        {{ $t('map.noCoordinates', { count: placesWithoutCoords }) }}
      </span>
    </div>

    <div v-if="filteredPlaces.length === 0" class="empty">
      {{ $t('map.empty') }}
    </div>

    <div v-else class="map-body" ref="mapBodyRef">
      <div class="map-chart-area">
        <LMap
          ref="mapRef"
          :zoom="4"
          :center="[55, 15]"
          :use-global-leaflet="false"
          :options="{ zoomControl: false }"
          @ready="onMapReady"
        >
          <LTileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
            layer-type="base"
          />
          <LMarker
            v-for="p in filteredPlaces"
            :key="p.id"
            :lat-lng="[p.displayLat, p.displayLon]"
            :options="p.resolved ? { opacity: 0.65 } : {}"
            @click="selectPlace(p.id)"
          >
            <LPopup>
              <a href="#" class="popup-link" @click.prevent="selectPlace(p.id)">{{ p.name }}</a>
              <div v-if="p.place_type" class="popup-type">{{ $t('placeTypes.' + p.place_type) }}</div>
              <div v-if="p.resolved" class="popup-resolved">
                <span :class="'match-' + p.resolved.matchQuality">{{ $t('gazetteers.match.' + p.resolved.matchQuality) }}</span>
                <span class="match-path">{{ p.resolved.matchedPath.join(' > ') }}</span>
              </div>
            </LPopup>
          </LMarker>
        </LMap>

        <ZoomControls
          :zoom="currentZoom / maxZoom"
          :show-fit="true"
          @zoom-in="zoomIn"
          @zoom-out="zoomOut"
          @reset="fitBounds"
        />

        <!-- Reopen panel button when panel is closed -->
        <button v-if="!panelOpen && selectedPlaceId" class="panel-open-btn" @click="openPanel">▶</button>
      </div>

      <!-- Drag handle + panel -->
      <template v-if="panelOpen">
        <div
          class="panel-drag-handle"
          @mousedown="(e) => startResize(e, mapBodyRef!)"
        ></div>
        <div class="map-panel" :style="{ width: panelWidth + 'px' }">
          <button class="panel-close-btn" @click="closePanel">◀</button>
          <PlacePanel
            :place-id="selectedPlaceId"
            @select-place="selectPlace"
          />
        </div>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Update the script section**

Add imports and panel state logic. Replace the entire `<script setup>` block:

```typescript
<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { LMap, LTileLayer, LMarker, LPopup } from '@vue-leaflet/vue-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import ZoomControls from '../components/ZoomControls.vue';
import PlacePanel from '../components/PlacePanel.vue';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import { usePanelResize } from '../composables/usePanelResize';
import type { PlaceResolveResult } from '../../api/place-gazetteers/types';

// Fix default marker icons for Vite bundler
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

interface PlaceRow {
  id: string;
  name: string;
  place_type: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface DisplayPlace extends PlaceRow {
  displayLat: number;
  displayLon: number;
  resolved?: PlaceResolveResult;
}

const places = ref<PlaceRow[]>([]);
const filterText = ref('');
const mapRef = ref<InstanceType<typeof LMap> | null>(null);
const mapBodyRef = ref<HTMLElement | null>(null);
const { ready: resolverReady, ensureLoaded, resolve } = usePlaceResolver();

const maxZoom = 18;
const currentZoom = ref(4);

// Panel state
const selectedPlaceId = ref<string | null>(null);
const panelOpen = ref(localStorage.getItem('map-panel-open') !== 'false');
const { panelWidth, startResize } = usePanelResize();

function selectPlace(id: string) {
  selectedPlaceId.value = id;
  if (!panelOpen.value) openPanel();
}

function openPanel() {
  panelOpen.value = true;
  localStorage.setItem('map-panel-open', 'true');
}

function closePanel() {
  panelOpen.value = false;
  localStorage.setItem('map-panel-open', 'false');
}

function onMapReady() {
  const map = mapRef.value?.leafletObject;
  if (map) {
    map.zoomControl?.remove();
    map.on('zoomend', () => { currentZoom.value = map.getZoom(); });
  }
  fitBounds();
}

function zoomIn() {
  mapRef.value?.leafletObject?.zoomIn();
}

function zoomOut() {
  mapRef.value?.leafletObject?.zoomOut();
}

const allDisplayPlaces = computed<DisplayPlace[]>(() => {
  const result: DisplayPlace[] = [];
  for (const p of places.value) {
    if (p.latitude != null && p.longitude != null) {
      result.push({ ...p, displayLat: p.latitude, displayLon: p.longitude });
    } else if (resolverReady.value) {
      const resolved = resolve(p.name);
      if (resolved) {
        result.push({ ...p, displayLat: resolved.lat, displayLon: resolved.lon, resolved });
      }
    }
  }
  return result;
});

const placesWithoutCoords = computed(() => {
  const displayIds = new Set(allDisplayPlaces.value.map(p => p.id));
  return places.value.filter(p => !displayIds.has(p.id)).length;
});

const filteredPlaces = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  if (!q) return allDisplayPlaces.value;
  return allDisplayPlaces.value.filter(p => p.name.toLowerCase().includes(q));
});

function fitBounds() {
  nextTick(() => {
    const map = mapRef.value?.leafletObject;
    if (!map || filteredPlaces.value.length === 0) return;
    const bounds = filteredPlaces.value.map(p => [p.displayLat, p.displayLon] as [number, number]);
    if (bounds.length === 1) {
      map.setView(bounds[0], 10);
    } else {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  });
}

watch(filteredPlaces, () => {
  if (mapRef.value?.leafletObject) fitBounds();
});

onMounted(async () => {
  places.value = (await window.api.places.list()) as PlaceRow[];
  await ensureLoaded();
});
</script>
```

- [ ] **Step 3: Update the styles**

Replace the entire `<style scoped>` block:

```css
<style scoped>
.map-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.map-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.map-search {
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
  font-family: inherit;
  width: 260px;
}
.no-coords-hint {
  font-size: var(--font-sm);
  color: #999;
}

/* Body: map + panel flex layout */
.map-body {
  flex: 1;
  display: flex;
  min-height: 400px;
  position: relative;
}
.map-chart-area {
  flex: 1;
  min-width: 200px;
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #ddd;
}

/* Panel */
.map-panel {
  flex-shrink: 0;
  position: relative;
  border-left: 1px solid var(--color-border);
  overflow: hidden;
}
.panel-drag-handle {
  width: 5px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
}
.panel-drag-handle:hover {
  background: var(--color-primary);
  opacity: 0.3;
}
.panel-close-btn {
  position: absolute;
  top: 8px;
  left: 4px;
  z-index: 10;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  font-size: var(--font-xs);
  color: var(--color-text-faint);
}
.panel-close-btn:hover { background: var(--color-bg-muted); }
.panel-open-btn {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  z-index: 1000;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 4px 6px;
  cursor: pointer;
  font-size: var(--font-sm);
  color: var(--color-text-faint);
}
.panel-open-btn:hover { background: var(--color-bg-muted); }

/* Popups */
.popup-link {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 600;
  font-size: var(--font-base);
  cursor: pointer;
}
.popup-link:hover {
  text-decoration: underline;
}
.popup-type {
  font-size: var(--font-xs);
  color: #666;
  margin-top: 2px;
}
.popup-resolved {
  font-size: var(--font-xs);
  margin-top: 4px;
  border-top: 1px solid #eee;
  padding-top: 4px;
}
.match-exact {
  color: #22c55e;
  font-weight: 600;
}
.match-partial {
  color: #f59e0b;
  font-weight: 600;
}
.match-ambiguous {
  color: #ef4444;
  font-weight: 600;
}
.match-path {
  display: block;
  color: #666;
  font-size: var(--font-xs);
}
</style>
```

- [ ] **Step 4: Invalidate the Leaflet map on panel resize**

The Leaflet map needs to be invalidated when the panel opens/closes or resizes (otherwise the map tiles may not render correctly in the new size). Add this watcher to the script section, after the `panelOpen` ref:

```typescript
watch(panelOpen, () => {
  nextTick(() => {
    mapRef.value?.leafletObject?.invalidateSize();
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```
feat: integrate PlacePanel into MapView with drag-resize side panel
```

---

### Task 10: Manual testing and polish

- [ ] **Step 1: Launch the app**

Run: `npm start`

- [ ] **Step 2: Navigate to the Map view**

Click "Map" in the sidebar. Verify:
- Pins render correctly
- Clicking a pin opens the side panel
- The place name appears in the panel header
- All 8 sections are present with correct collapse/expand behavior
- Editing a field (e.g. place name) saves on blur
- The panel resizes via the drag handle
- Closing and reopening the panel works
- Clicking a different pin switches the panel content
- The "View full details" link navigates to `/places/:id`
- Child place links within the panel update the selected place (emit `select-place`)
- The map resizes properly when the panel opens/closes
- ZoomControls still work

- [ ] **Step 3: Fix any issues found during testing**

- [ ] **Step 4: Run full test suite**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 5: Commit any fixes**

```
fix: polish PlacePanel integration
```

---

### Task 11: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/PLAN.md`

- [ ] **Step 1: Update CLAUDE.md**

Add `PlacePanel` to the Shared Components table. Add `PlacePersonsSection`, `PlaceCitationsSection`, `EntityMediaSection`, and `usePlacePanelSections` entries. Update MapView route description to mention the side panel.

- [ ] **Step 2: Update `docs/PLAN.md`**

Mark the PlacePanel milestone as done and add a pointer to the spec file.

- [ ] **Step 3: Commit**

```
docs: update CLAUDE.md and PLAN.md for PlacePanel feature
```
