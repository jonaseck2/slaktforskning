# Place-as-Biography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`2026-05-02-place-as-biography-design.md`](./2026-05-02-place-as-biography-design.md)

## User goal

Opening a Place panel feels like opening a biography of that place — same shape as a Person panel: hero photo, chronological events, residents with year ranges, photos of the building, place-level research tasks. No new schema; everything derives from data the user already authors.

## Scope

PlacePanel.vue refactor + one API extension (`getPersonsForPlace`) + one modal prop addition (`ResearchTaskModal.placeId`). The `PlaceTimeline.vue` component, the polymorphic `getResearchTasksForPlace` API, the `researchTasks.forPlace` IPC, and the MCP `add_research_task` place-linking already exist — only the renderer wiring is missing.

**Full target enumeration:** This plan touches PlacePanel.vue (one file). The pattern "right-side entity panel" is already migrated across all 10 panels by the prior panel-composables refactor. We are not changing the panel pattern itself, only adding sections within PlacePanel. No other panels are affected. Per `.claude/rules/renderer.md` "Pattern migrations are all-or-nothing" — this is a within-panel addition, not a cross-panel pattern change.

## Verification

User-observable outcomes — **all 9 must pass smoke-check in the running Electron app before marking the plan complete:**

1. Hero photo appears in PlacePanel header for places with attached images; updates after media reorder.
2. Hero falls back to text-only header for places with no qualifying media (no broken-image placeholder).
3. Persons section shows year ranges (e.g. `1842-1879`), sorted earliest-first; witnesses/godparents/officiants are absent.
4. Persons section degrades to name-sorted with empty Year column when all events are undated.
5. Timeline section renders chronologically; row click opens same EventModal as Events section.
6. Tasks section renders; +Add task creates a task linked to the place; same task appears in `/research-tasks` view.
7. MCP `add_research_task { place_ids: [id] }` creates a task that appears in PlaceTasksSection after reload.
8. Section order matches spec §6 in PlacePanel; collapse states persist per place.
9. No regressions in PersonPanel, ResearchTasksView, MapView, PlacesView.

Plus passing tests:

- `tests/unit/places.test.ts` — extended for `getPersonsForPlace` new fields and primary-role filter
- `tests/unit/ipc-worker-coverage.test.ts`, `preload-coverage.test.ts`, `static-api-coverage.test.ts`, `tests/components/panel-layout-consistency.test.ts` — must continue to pass

## Failure modes / RCA reference

- **Don't persist the hero choice as a new column on `places`.** Use `media_links.sort_order` (user already controls this via Media section). Persisting would violate Prime Directive (CLAUDE.md) — same class as persisting gazetteer-resolved coords.
- **Don't persist `first_year`/`last_year` on `persons` or a new `place_residences` table.** Compute in the SQL `SELECT` only. Same Prime Directive class.
- **Don't roll a manual `watch(props.placeId, …)` + `window.api.onDataChanged(...)` in new sections.** Use `useEntityData` exclusively (rule from `.claude/rules/renderer.md`; learned via panel-composables refactor).
- **MCP exposure already exists.** Don't add a duplicate place-tasks MCP tool — `add_research_task` already takes `place_ids: string[]` ([src/mcp/tools/prod/research.ts:21-45](../../src/mcp/tools/prod/research.ts#L21-L45)).
- **Run the shared.css class collision check before introducing any new CSS class** for the hero block — see Task 6.

---

## File map

| File | Change |
|---|---|
| `src/api/places.ts:260-277` | Extend `getPersonsForPlace`: primary-role filter, year range, sort |
| `tests/unit/places.test.ts` | New test cases for the extension |
| `src/renderer/components/PlacePersonsSection.vue` | Add Years column + interface field |
| `src/renderer/components/modals/ResearchTaskModal.vue:96-104,148-167` | Add `placeId` prop + place-link branch |
| `src/renderer/components/PlacePanel.vue` | Add Timeline section + Tasks section + hero photo + reorder + new section state |
| `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts` | New keys: `places.yearsHeader`, `placePanel.tasksTitle` (if missing) |
| `docs/UX_INVENTORY.md` | Add Timeline + Tasks section entries; update Persons purpose |

---

## Task 1: Extend `getPersonsForPlace` — primary-role filter, year range, sort

**Files:**
- Modify: `src/api/places.ts:260-277`
- Test: `tests/unit/places.test.ts`

- [ ] **Step 1: Read existing test file structure**

Run: `head -40 tests/unit/places.test.ts`

Look for the existing import shape and the `createTestDb()` helper usage. New tests follow the same pattern.

- [ ] **Step 2: Write the failing tests**

Append to `tests/unit/places.test.ts` (place inside the existing `describe('places api', …)` block, or create a new `describe('getPersonsForPlace - biography fields', …)` block at end of file):

```typescript
describe('getPersonsForPlace - biography fields', () => {
  test('returns first_year and last_year per person from primary-role events', () => {
    const db = createTestDb();
    const place = createPlace(db, { name: 'Vienna' });
    const alice = createPerson(db, { sex: 'F' });
    addPersonName(db, { person_id: alice.id, given_name: 'Alice', surname: 'A', name_type: 'birth' });

    // birth 1842, death 1879 — both primary
    const birth = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1842-03-01', date_original: '1842-03-01', place_id: place.id });
    addEventParticipant(db, { event_id: birth.id, person_id: alice.id, role: 'primary' });
    const death = createEvent(db, { event_type: 'death', date_type: 'exact', date_value: '1879-11-04', date_original: '1879-11-04', place_id: place.id });
    addEventParticipant(db, { event_id: death.id, person_id: alice.id, role: 'primary' });

    const rows = getPersonsForPlace(db, place.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].first_year).toBe('1842');
    expect(rows[0].last_year).toBe('1879');
    expect(rows[0].event_count).toBe(2);
  });

  test('excludes persons whose only role at the place is non-primary (witness/godparent/officiant)', () => {
    const db = createTestDb();
    const place = createPlace(db, { name: 'Vienna' });
    const alice = createPerson(db, { sex: 'F' });
    addPersonName(db, { person_id: alice.id, given_name: 'Alice', surname: 'A', name_type: 'birth' });
    const bob = createPerson(db, { sex: 'M' });
    addPersonName(db, { person_id: bob.id, given_name: 'Bob', surname: 'B', name_type: 'birth' });

    const wedding = createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1860-06-01', date_original: '1860-06-01', place_id: place.id });
    addEventParticipant(db, { event_id: wedding.id, person_id: alice.id, role: 'primary' });
    addEventParticipant(db, { event_id: wedding.id, person_id: bob.id, role: 'witness' });

    const rows = getPersonsForPlace(db, place.id);
    expect(rows.map(r => r.id)).toEqual([alice.id]);
  });

  test('includes person with primary AND witness roles (counts only primary events)', () => {
    const db = createTestDb();
    const place = createPlace(db, { name: 'Vienna' });
    const alice = createPerson(db, { sex: 'F' });
    addPersonName(db, { person_id: alice.id, given_name: 'Alice', surname: 'A', name_type: 'birth' });

    const ownBirth = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1842-03-01', date_original: '1842-03-01', place_id: place.id });
    addEventParticipant(db, { event_id: ownBirth.id, person_id: alice.id, role: 'primary' });
    const witnessed = createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1900-01-01', date_original: '1900-01-01', place_id: place.id });
    addEventParticipant(db, { event_id: witnessed.id, person_id: alice.id, role: 'witness' });

    const rows = getPersonsForPlace(db, place.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_count).toBe(1);
    expect(rows[0].first_year).toBe('1842');
    expect(rows[0].last_year).toBe('1842');
  });

  test('returns null first_year/last_year for primary-role events without dates', () => {
    const db = createTestDb();
    const place = createPlace(db, { name: 'Vienna' });
    const alice = createPerson(db, { sex: 'F' });
    addPersonName(db, { person_id: alice.id, given_name: 'Alice', surname: 'A', name_type: 'birth' });

    const undated = createEvent(db, { event_type: 'residence', date_type: 'unknown', date_value: null, date_original: '', place_id: place.id });
    addEventParticipant(db, { event_id: undated.id, person_id: alice.id, role: 'primary' });

    const rows = getPersonsForPlace(db, place.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].first_year).toBeNull();
    expect(rows[0].last_year).toBeNull();
  });

  test('sorts by first_year ascending, undated last, then by surname/given_name', () => {
    const db = createTestDb();
    const place = createPlace(db, { name: 'Vienna' });

    const carl = createPerson(db, { sex: 'M' });
    addPersonName(db, { person_id: carl.id, given_name: 'Carl', surname: 'C', name_type: 'birth' });
    const carlBirth = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1830-01-01', date_original: '1830-01-01', place_id: place.id });
    addEventParticipant(db, { event_id: carlBirth.id, person_id: carl.id, role: 'primary' });

    const alice = createPerson(db, { sex: 'F' });
    addPersonName(db, { person_id: alice.id, given_name: 'Alice', surname: 'A', name_type: 'birth' });
    const aliceBirth = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1850-01-01', date_original: '1850-01-01', place_id: place.id });
    addEventParticipant(db, { event_id: aliceBirth.id, person_id: alice.id, role: 'primary' });

    const zoe = createPerson(db, { sex: 'F' });
    addPersonName(db, { person_id: zoe.id, given_name: 'Zoe', surname: 'Z', name_type: 'birth' });
    const zoeUndated = createEvent(db, { event_type: 'residence', date_type: 'unknown', date_value: null, date_original: '', place_id: place.id });
    addEventParticipant(db, { event_id: zoeUndated.id, person_id: zoe.id, role: 'primary' });

    const rows = getPersonsForPlace(db, place.id);
    expect(rows.map(r => r.given_name)).toEqual(['Carl', 'Alice', 'Zoe']);
  });
});
```

You will likely need additional imports at the top of the test file. Match the imports already present (e.g. `createPerson`, `createEvent`, `addEventParticipant`, `addPersonName`, `createPlace`, `getPersonsForPlace`, `createTestDb`). If the helpers are imported elsewhere in the file, reuse the same import path.

- [ ] **Step 3: Run tests to verify failure**

Run: `npx vitest run tests/unit/places.test.ts -t "biography fields"`

Expected: 5 failures with messages about missing `first_year`/`last_year` fields, wrong sort order, and witness rows being included.

- [ ] **Step 4: Replace the function body**

In `src/api/places.ts:260-277`, replace `getPersonsForPlace` with:

```typescript
export function getPersonsForPlace(
  db: Database,
  placeId: string
): { id: string; sex: string; given_name: string; surname: string; event_count: number; first_year: string | null; last_year: string | null }[] {
  return queryAll(db, `
    SELECT p.id, p.sex,
      COALESCE(pn.given_name, '') AS given_name,
      COALESCE(pn.surname, '') AS surname,
      COUNT(DISTINCT e.id) AS event_count,
      MIN(substr(e.date_value, 1, 4)) AS first_year,
      MAX(substr(e.date_value, 1, 4)) AS last_year
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    JOIN persons p ON p.id = ep.person_id
    LEFT JOIN person_names pn ON pn.id = ${displayedNameIdSql('p.id')}
    WHERE e.place_id = ? AND ep.role = 'primary'
    GROUP BY p.id
    ORDER BY (first_year IS NULL), first_year, pn.surname, pn.given_name
  `, [placeId]);
}
```

The `(first_year IS NULL)` term puts NULLs last in SQLite (boolean false (0) before true (1)). `substr(date_value, 1, 4)` extracts the year from ISO `YYYY-MM-DD` strings; SQLite's `MIN`/`MAX` over NULL ignores NULL operands, returning NULL only when all are NULL.

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run tests/unit/places.test.ts`

Expected: all tests in `places.test.ts` pass (the 5 new ones + every pre-existing one).

- [ ] **Step 6: Run lint**

Run: `npm run lint`

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/api/places.ts tests/unit/places.test.ts
git commit -m "feat(api): getPersonsForPlace returns year range, primary-role only

Adds first_year/last_year (MIN/MAX over event date_value) and filters
to ep.role = 'primary' so witnesses/godparents/officiants don't appear
as residents. Sort: earliest year first, undated last, ties by name.

Place-as-biography plan task 1."
```

---

## Task 2: PlacePersonsSection — add Years column

**Files:**
- Modify: `src/renderer/components/PlacePersonsSection.vue`
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add i18n keys**

In `src/renderer/i18n/sv.ts`, locate the `places: { … }` namespace (around the existing `eventCount` key) and add:

```typescript
yearsHeader: 'År',
```

In `src/renderer/i18n/en.ts`, the matching `places: { … }` namespace gets:

```typescript
yearsHeader: 'Years',
```

- [ ] **Step 2: Update interface and template**

Replace the contents of `src/renderer/components/PlacePersonsSection.vue` with:

```vue
<template>
  <div>
    <SectionEmpty v-if="persons.length === 0" :message="$t('empty.persons')" />
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('persons.givenName') }}</th>
          <th>{{ $t('persons.sex') }}</th>
          <th>{{ $t('places.yearsHeader') }}</th>
          <th>{{ $t('places.eventCount') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in persons" :key="p.id" class="clickable-row" @click="$router.push('/persons/' + p.id)">
          <td class="person-cell">
            <AppAvatar :person-id="p.id" :given-name="p.given_name" :surname="p.surname" :sex="p.sex" size="sm" />
            <router-link :to="'/persons/' + p.id" class="person-link" @click.stop>
              {{ [p.given_name, p.surname].filter(Boolean).join(' ') || '—' }}
            </router-link>
          </td>
          <td><span :class="['sex-badge', 'sex-' + p.sex]">{{ p.sex }}</span></td>
          <td class="years-cell">{{ formatYears(p.first_year, p.last_year) }}</td>
          <td>{{ p.event_count }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppAvatar from './ui/AppAvatar.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import { useEntityData } from '../composables/useEntityData';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface PersonAtPlace {
  id: string;
  sex: string;
  given_name: string;
  surname: string;
  event_count: number;
  first_year: string | null;
  last_year: string | null;
}

const props = defineProps<{ placeId: string }>();

const idRef = computed(() => props.placeId ?? null);
const { data, reload } = useEntityData<PersonAtPlace[]>(idRef, async (id) => {
  return (await window.api.places.getPersons(id)) as PersonAtPlace[];
});
const persons = computed(() => data.value ?? []);

function formatYears(first: string | null, last: string | null): string {
  if (!first && !last) return '';
  if (first === last) return first ?? '';
  return `${first ?? '?'}–${last ?? '?'}`;
}

defineExpose({ reload });
</script>

<style scoped>
.person-cell { display: flex; align-items: center; gap: var(--space-xs); }
.years-cell { font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
```

- [ ] **Step 3: Run tests + lint**

Run: `npx vitest run && npm run lint`

Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/PlacePersonsSection.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(place-panel): show year range column in Persons section

Renders first_year-last_year next to event_count. Tabular-nums for
column alignment. Single-year residents collapse to one number.

Place-as-biography plan task 2."
```

---

## Task 3: ResearchTaskModal — accept placeId prop

**Files:**
- Modify: `src/renderer/components/modals/ResearchTaskModal.vue`

- [ ] **Step 1: Add placeId to props and link on save**

In `src/renderer/components/modals/ResearchTaskModal.vue`, find the props declaration (around line 96-104) and add `placeId`:

```typescript
const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  personId?: string;
  placeId?: string;
  editingTask?: ResearchTask | null;
}>(), {
  mode: 'standalone',
  personId: undefined,
  placeId: undefined,
  editingTask: null,
});
```

Find the `handleSave()` block (around line 148-167), and below the existing `if (saved && props.personId)` block, add:

```typescript
      if (saved && props.placeId) {
        await window.api.researchTasks.addLink(saved.id, 'place', props.placeId);
      }
```

The full save block reads:

```typescript
    let saved: ResearchTask;
    if (props.editingTask) {
      saved = (await window.api.researchTasks.update(props.editingTask.id, payload)) as ResearchTask;
    } else {
      saved = (await window.api.researchTasks.create(payload)) as ResearchTask;
      if (saved && props.personId) {
        await window.api.researchTasks.addLink(saved.id, 'person', props.personId);
      }
      if (saved && props.placeId) {
        await window.api.researchTasks.addLink(saved.id, 'place', props.placeId);
      }
    }
```

- [ ] **Step 2: Run tests + lint**

Run: `npx vitest run && npm run lint`

Expected: pass, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/modals/ResearchTaskModal.vue
git commit -m "feat(research-task-modal): accept placeId prop, link new task to place

Mirror of personId behavior. The polymorphic addLink IPC and the place
entity_type already exist; this only surfaces the entry point.

Place-as-biography plan task 3."
```

---

## Task 4: Add Timeline section to PlacePanel

**Files:**
- Modify: `src/renderer/components/PlacePanel.vue`

The `PlaceTimeline.vue` component already exists and is fully functional. We are only wiring it into a section block in the panel.

- [ ] **Step 1: Add the import**

In `src/renderer/components/PlacePanel.vue` `<script setup>` block (look for the other component imports near `EntityMediaSection`, `PlacePersonsSection`):

```typescript
import PlaceTimeline from './PlaceTimeline.vue';
```

- [ ] **Step 2: Add a Timeline section in the template**

In the template, **immediately after** the Events section (`<!-- Events section -->` block ending at line ~146), insert:

```vue
      <!-- Timeline section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('placeTimeline.title')"
          :count="eventCount"
          :collapsed="!sections.timeline"
          v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('events.event') }"
          @toggle="toggleSection('timeline')"
          @action="eventListRef?.openAddForm()"
        />
        <div v-if="sections.timeline" class="panel-section-body">
          <PlaceTimeline :place-id="placeId!" />
        </div>
      </div>
```

The `timeline` key is already present in `usePanelSections` defaults (line ~299: `timeline: false` initial state, `timeline: true` collapsible flag), so no section-state change is needed here.

- [ ] **Step 3: Verify `placeTimeline.title` i18n key exists in both locales**

Run: `grep -nE "placeTimeline:" src/renderer/i18n/sv.ts src/renderer/i18n/en.ts`

Expected: a `placeTimeline:` namespace with at least a `title` key in both. If `title` is missing, add `title: 'Tidslinje'` (sv) and `title: 'Timeline'` (en) into the existing `placeTimeline: { … }` block in both files.

- [ ] **Step 4: Run tests + lint**

Run: `npx vitest run tests/components/panel-layout-consistency.test.ts && npm run lint`

Expected: pass, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/PlacePanel.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(place-panel): add Timeline section

Wires the existing PlaceTimeline.vue component into a panel section
block, mirroring PersonPanel. Collapsible, default-collapsed; +Add
event triggers the Events section's add-form.

Place-as-biography plan task 4."
```

---

## Task 5: Add Research Tasks section to PlacePanel

**Files:**
- Modify: `src/renderer/components/PlacePanel.vue`

- [ ] **Step 1: Add `tasks` to section state**

In `src/renderer/components/PlacePanel.vue`, locate the `usePanelSections` call (around line 296):

```typescript
const { sections, toggleSection } = usePanelSections(
  'place-panel-section-',
  {
    place: true, persons: true, events: true, timeline: false,
    media: false, mediaTimeline: false, tasks: false, quality: false,
  },
  {
    place: true, persons: true, events: true, timeline: true,
    media: true, mediaTimeline: true, tasks: true, quality: false,
  },
);
```

The `tasks: false` initial state matches PersonPanel's research section default-collapsed behavior. The `tasks: true` collapsible flag allows the user to open/close it.

- [ ] **Step 2: Add imports + reactive state for tasks**

In `<script setup>` add:

```typescript
import ResearchTasksTable from './ResearchTasksTable.vue';
import ResearchTaskModal from './modals/ResearchTaskModal.vue';
import type { ResearchTask } from '../../api/types';
import { useRouter } from 'vue-router';
```

If `useRouter` is already imported, just add the others. If `ResearchTask` type lives in a different file, match the existing import path used elsewhere in the file (PersonPanel imports it from `../../api/types`).

In the script body (anywhere among the existing reactive state declarations), add:

```typescript
const router = useRouter();
const researchTasks = ref<ResearchTask[]>([]);
const showTaskForm = ref(false);
const editingTask = ref<ResearchTask | null>(null);

async function loadTasks() {
  if (!props.placeId) {
    researchTasks.value = [];
    return;
  }
  try {
    researchTasks.value = (await window.api.researchTasks.forPlace(props.placeId)) as ResearchTask[];
  } catch (err) {
    console.error('[PlacePanel] loadTasks failed:', err);
    researchTasks.value = [];
  }
}

function openTaskForm(task: ResearchTask | null = null) {
  editingTask.value = task;
  showTaskForm.value = true;
}

function closeTaskForm() {
  showTaskForm.value = false;
  editingTask.value = null;
}

async function onTaskSaved() {
  closeTaskForm();
  await loadTasks();
}

function goToTask(id: string) {
  router.push('/research-tasks/' + id);
}

watch(() => props.placeId, () => { void loadTasks(); }, { immediate: true });
```

If `watch`/`ref` aren't already imported from `vue` at the top of the file, add them to the existing `import { … } from 'vue'` line.

- [ ] **Step 3: Add the Tasks section in the template**

Insert **immediately after** the `Media Timeline section` block (`<!-- Media Timeline section -->` ending around the existing line 170):

```vue
      <!-- Research tasks section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('researchTasks.nav')"
          :count="researchTasks.length"
          :collapsed="!sections.tasks"
          v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('researchTasks.addTask') }"
          @toggle="toggleSection('tasks')"
          @action="openTaskForm()"
        />
        <div v-if="sections.tasks" class="panel-section-body">
          <SectionEmpty v-if="researchTasks.length === 0" :message="$t('empty.researchTasks')" />
          <ResearchTasksTable
            v-else
            :tasks="researchTasks"
            :readonly="props.readonly"
            @updated="loadTasks"
            @select="goToTask"
          />
        </div>
      </div>
```

- [ ] **Step 4: Add the modal at the end of the template**

After the existing `<CitationModal v-if="!props.readonly && showCitationForm && placeId" …>` block at the end of the template, before the closing `</EntityPanel>`, add:

```vue
    <!-- Research task form modal -->
    <ResearchTaskModal
      v-if="!props.readonly && showTaskForm && placeId"
      mode="standalone"
      :place-id="placeId"
      :editing-task="editingTask"
      @cancel="closeTaskForm"
      @close="closeTaskForm"
      @saved="onTaskSaved"
    />
```

- [ ] **Step 5: Verify SectionEmpty + AppEmptyState usage**

If the existing PlacePanel.vue does not already import `SectionEmpty`, locate the import for `SectionEmpty` used by other sections (e.g. in the Hierarchy section's empty state) and reuse the same import. If no such import exists, add:

```typescript
import SectionEmpty from './ui/SectionEmpty.vue';
```

PersonPanel does the same.

- [ ] **Step 6: Run tests + lint**

Run: `npx vitest run tests/components/panel-layout-consistency.test.ts && npm run lint`

Expected: pass, 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/PlacePanel.vue
git commit -m "feat(place-panel): add Research Tasks section

Loads researchTasks.forPlace, renders via ResearchTasksTable. +Add
opens ResearchTaskModal preset to link this place. Section default-
collapsed. Mirrors PersonPanel's research section.

Place-as-biography plan task 5."
```

---

## Task 6: Hero photo in PlacePanel header

**Files:**
- Modify: `src/renderer/components/PlacePanel.vue`

- [ ] **Step 1: Run the class-name collision check before naming the hero block**

Per `.claude/rules/renderer.md`. Run:

```bash
grep -RIn '\.place-hero\b\|\.hero-photo\b\|\.hero-thumb\b' src/renderer/styles/ src/renderer/components/ src/renderer/views/
```

Expected: no hits (especially nothing from `shared.css`). If any hit comes from `shared.css`, pick a different class name (suggested fallback: `place-panel-hero`, then re-grep).

- [ ] **Step 2: Add hero state and loader**

In `src/renderer/components/PlacePanel.vue` `<script setup>`, add:

```typescript
const heroMediaId = ref<string | null>(null);
const heroSrc = ref<string | null>(null);

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif)$/i;

function isImageMedia(m: { format?: string | null; file_ref?: string | null }): boolean {
  if (m.format && /^image\//i.test(m.format)) return true;
  if (m.file_ref && IMAGE_EXT.test(m.file_ref)) return true;
  return false;
}

async function loadHero() {
  heroMediaId.value = null;
  heroSrc.value = null;
  if (!props.placeId) return;
  try {
    const items = (await window.api.media.forEntity('place', props.placeId)) as Array<{ id: string; format: string | null; file_ref: string | null; sort_order: number }>;
    const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
    const first = sorted.find(isImageMedia);
    if (!first) return;
    heroMediaId.value = first.id;
    heroSrc.value = (await window.api.media.readAsDataUrl(first.id)) as string | null;
  } catch (err) {
    console.error('[PlacePanel] loadHero failed:', err);
  }
}

watch(() => props.placeId, () => { void loadHero(); }, { immediate: true });
```

`window.api.media.readAsDataUrl(id)` is verified to exist in the preload layer (see `src/preload/index.ts:206`).

- [ ] **Step 3: Render the hero in the header slot**

Replace the existing `<template #header>` block in PlacePanel.vue (lines 9-14) with:

```vue
    <template #header>
      <div class="place-panel-hero" :class="{ 'has-photo': !!heroSrc }">
        <button
          v-if="heroSrc && heroMediaId"
          type="button"
          class="place-panel-hero-photo"
          :title="$t('media.title')"
          @click="$router.push('/media?open=' + heroMediaId)"
        >
          <img :src="heroSrc" :alt="place?.name ?? ''" />
        </button>
        <div class="panel-name-row">
          <div class="panel-name">{{ place?.name }}</div>
          <span v-if="place?.place_type" class="place-type-badge">{{ $t('placeTypes.' + place.place_type) }}</span>
        </div>
      </div>
    </template>
```

- [ ] **Step 4: Style the hero**

Add to the `<style scoped>` block at the bottom of PlacePanel.vue:

```css
.place-panel-hero { display: flex; flex-direction: column; gap: var(--space-xs); }
.place-panel-hero-photo {
  display: block;
  width: 100%;
  max-height: 180px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius-md);
  overflow: hidden;
}
.place-panel-hero-photo img {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 180px;
  object-fit: cover;
}
.place-panel-hero-photo:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

If your collision check in Step 1 forced a different class name, propagate it through Steps 3 and 4.

- [ ] **Step 5: Run tests + lint**

Run: `npx vitest run && npm run lint`

Expected: pass, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/PlacePanel.vue
git commit -m "feat(place-panel): hero photo in header

Renders the first image-format media (lowest sort_order) above the
place name. Click navigates to MediaPanel. No new schema; uses
existing user-controlled media reorder. Falls back to text-only
header when no qualifying media exists.

Place-as-biography plan task 6."
```

---

## Task 7: Reorder PlacePanel sections to biography flow

**Files:**
- Modify: `src/renderer/components/PlacePanel.vue`

- [ ] **Step 1: Reorder section blocks**

The final order, top to bottom, in the `<template v-if="place">` block:

1. Place section (current first — keep)
2. Events section (was 3rd)
3. Timeline section (added in Task 4)
4. Persons section (was 2nd, enhanced in Task 2)
5. Media section (was 5th)
6. Media Timeline section (was 6th)
7. Research Tasks section (added in Task 5)
8. Citations section (was 4th)
9. Address section (was 8th)
10. Hierarchy section (was 9th)
11. Quality section (was 7th)

Move whole `<!-- ... section -->` blocks (header + body) without modifying their internal content. The relative order of all 11 blocks is the only change.

- [ ] **Step 2: Run tests + lint**

Run: `npx vitest run tests/components/panel-layout-consistency.test.ts && npm run lint`

Expected: pass, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/PlacePanel.vue
git commit -m "refactor(place-panel): reorder sections to biography flow

Place identity > Events > Timeline > Persons > Media > Media Timeline
> Research Tasks > Citations > Address > Hierarchy > Quality.

Persons drops below the chronology so the panel reads as the place's
story. Citations becomes the 'where did this come from' column,
deeper in the panel.

Place-as-biography plan task 7."
```

---

## Task 8: Update UX_INVENTORY.md

**Files:**
- Modify: `docs/UX_INVENTORY.md`

- [ ] **Step 1: Update the PlacePanel section index**

Locate the `### Places view (PlacesView + PlacePanel)` table (line ~109). Replace the table with the new section list reflecting the reorder + new sections. The sections must include Timeline (new) and Research Tasks (new), in the order they appear in the panel after Task 7. Set `Verified | 2026-05-02` for all.

- [ ] **Step 2: Add Purpose statements for the new sections**

Find the existing `### PlacePanel - Persons section` entry (line ~349). Update its Purpose statement to reflect the year-range and primary-role filtering — e.g.:

> **Purpose:** A user would use this section to *see* who lived at this place — name, sex, year range of their events here (first event year - last event year), and event count. Witnesses, godparents, and officiants of other people's events are excluded. The "+ Add person" button creates a new person *and* a primary-role event at this place. Removal requires deleting events in the Events section.

Add new entries (placed near the existing PlacePanel section entries):

> ### PlacePanel - Timeline section
> **File:** `src/renderer/components/PlacePanel.vue`, `PlaceTimeline.vue`
> **Verified:** 2026-05-02
>
> > **Purpose:** A user would use this section to *view* the same events from the Events section laid out chronologically with year markers and gap-indicators, and to *jump* to add a new event.
>
> | View | Add | Edit | Delete | Open |
> |---|---|---|---|---|
> | Read-only chronological list of events at this place. Same data as Events section. | `+ event` chip - routes/scrolls to the Events section's `+ Add event` flow (no second authoring path). | Not offered - authoring lives in the Events section. | Not offered - deletion lives in the Events section. | Row click - opens the same EventModal as the Events section. |
>
> **Notes:** Default-collapsed. Cross-section coupling: derived read of the Events section.

> ### PlacePanel - Research Tasks section
> **File:** `src/renderer/components/PlacePanel.vue`, `ResearchTasksTable.vue`, `ResearchTaskModal.vue`
> **Verified:** 2026-05-02
>
> > **Purpose:** A user would use this section to *view* open research tasks linked to this place, *add* a new task (linked to this place via `task_links`), *open* a task to edit it, and *navigate* to a task's full record in the Research Tasks view.
>
> | View | Add | Edit | Delete | Open |
> |---|---|---|---|---|
> | ResearchTasksTable rows: priority - status - task description | `+ Add task` - opens **ResearchTaskModal** preset to link this place | Row interaction inside ResearchTasksTable - opens **ResearchTaskModal** with task prefilled | Inside the modal | Row select - navigates to `/research-tasks/{id}` |
>
> **Notes:** Default-collapsed. The polymorphic `task_links` schema (entity_type='place') makes this a renderer-only addition - the api/ipc/mcp surface already exposed `researchTasks.forPlace` and `add_research_task { place_ids }`.

> ### PlacePanel - Header hero photo
> **File:** `src/renderer/components/PlacePanel.vue`
> **Verified:** 2026-05-02
>
> > **Purpose:** A user would use the header hero to *see* the place visually - the first image-format media attached to the place becomes the hero photo above the name. *Click* navigates to that media's full record.
>
> | View | Add | Edit | Delete | Open |
> |---|---|---|---|---|
> | Hero photo (first image media by sort_order) above place name and place-type badge. Falls back to text-only when no qualifying media. | Attaching media lives in Media section. | Reorder media in Media section to change which photo is hero. | Unattaching media lives in Media section. | Click hero - navigates to MediaPanel for that media id. |
>
> **Notes:** No new schema. Hero choice = lowest `media_links.sort_order` for this place where the file resolves to an image.

- [ ] **Step 3: Commit**

```bash
git add docs/UX_INVENTORY.md
git commit -m "docs(ux-inventory): place-as-biography panel structure

Adds entries for Timeline + Research Tasks + Header hero sections.
Updates Persons section Purpose to reflect year-range and primary-
role filtering.

Place-as-biography plan task 8."
```

---

## Task 9: Smoke verification in the running app

This task is the user-observable verification gate per `.claude/rules/plans.md`. **Do not mark the plan complete on test passes alone.**

- [ ] **Step 1: Boot the dev app**

Run: `npm start` in the worktree.

Wait for the Electron window to open with the app's database.

- [ ] **Step 2: Outcome 1 - Hero photo appears**

Navigate to `/places`, select a place that has at least one image attached (or attach one in the Media section). Confirm: the PlacePanel header shows the photo above the place name. Reorder media in the Media section so a different photo is first; refresh the panel; the hero updates.

- [ ] **Step 3: Outcome 2 - Hero falls back gracefully**

Select a place with no media attached. Confirm: the header is text-only, no broken image.

- [ ] **Step 4: Outcome 3 - Year ranges and primary-role filter**

Pick a place with several primary-role residents (births/deaths/baptisms here) plus at least one person who is only a witness/godparent at this place. Confirm: the Persons table shows year ranges (e.g. `1842-1879`), is sorted earliest-first, and the witness-only person is absent.

- [ ] **Step 5: Outcome 4 - Undated graceful degradation**

Select a place whose only residents have undated events. Confirm: the Year column is empty for those rows; sort falls back to surname/given_name.

- [ ] **Step 6: Outcome 5 - Timeline section renders**

Expand the Timeline section in a place with multiple dated events. Confirm: events appear chronologically with year markers and gap indicators; a row click opens the same EventModal that the Events section uses.

- [ ] **Step 7: Outcome 6 - Tasks section authors place tasks**

Expand the Research Tasks section. Click `+ Add task`. Fill in a task. Save. Confirm: the task appears in the section. Navigate to `/research-tasks` (top-level view) and confirm the same task is visible there.

- [ ] **Step 8: Outcome 7 - MCP can author place tasks**

In another terminal, run an MCP `add_research_task` call with a `place_ids: [<id>]` payload (use Claude Code's MCP CLI or the dev server with a manual call - see `/mcp-dev` for the helper). Reload the place panel; the new task appears in the Research Tasks section.

- [ ] **Step 9: Outcome 8 - Section order matches spec**

Scroll the entire PlacePanel for a populated place. Confirm sections appear in this order: Place, Events, Timeline, Persons, Media, Media Timeline, Research Tasks, Citations, Address, Hierarchy, Quality. Collapse a few sections, switch to a different place, switch back - per-place collapse states persist.

- [ ] **Step 10: Outcome 9 - No regressions in other panels**

Open `/persons`, click a person. Confirm panel renders normally. Open `/research-tasks`, click a task. Confirm. Open `/places` map view, click a pin. Confirm. Open `/places` list view, sort/filter as usual. Confirm.

- [ ] **Step 11: Run the full test suite once more**

Run: `npx vitest run && npm run lint`

Expected: all green.

- [ ] **Step 12: Mark all checkboxes in this plan as `[x]` and prepare to archive (per CLAUDE.md plan close-out)**

Edit this plan file and the design spec sibling, then continue to the standard close-out (version bump in package.json, CHANGELOG.md Unreleased entry, archive both files to `docs/plans/archive/`, single `chore: archive completed place-as-biography` commit, then `superpowers:finishing-a-development-branch` Option 1: merge worktree into `main`, delete branch, remove worktree).

---

## Self-review checklist (run before merging)

- [ ] Spec coverage: every section of `2026-05-02-place-as-biography-design.md` has a matching task above. Hero (Task 6), Persons enhancement (Tasks 1-2), Timeline (Task 4), Tasks (Tasks 3, 5), reorder (Task 7), UX inventory (Task 8), verification (Task 9). i18n is covered inline in Tasks 2 and 4. Spec deviations (no Gantt, no schema) are honored throughout (no schema migrations in the plan).
- [ ] No placeholders, TBDs, or "implement later" markers.
- [ ] Type/method names consistent: `getPersonsForPlace`, `loadHero`, `loadTasks`, `openTaskForm`, `goToTask`, `closeTaskForm`, `onTaskSaved`, `formatYears`, `isImageMedia` - same names everywhere they appear.
- [ ] Class collision check is in Task 6 step 1 (rule from `.claude/rules/renderer.md`).
- [ ] Plan close-out is in Task 9 step 12 (rule from CLAUDE.md - five-step plan close-out).
