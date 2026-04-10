# Usability Optimization Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce family tree data entry actions by ~50% through 6 UI optimizations: enhanced quick-add, inline birth, quick cite, source memory, tree shortcuts, batch events.

**Architecture:** Shared composable `useBirthEventCreation` for Features A+C. New Pinia store `sourceSession` for Feature D, consumed by citation forms across all features. Chart layout extended with placeholder nodes for Feature F. All changes are additive — existing flows preserved.

**Tech Stack:** Vue 3 (Composition API), Pinia, TypeScript, SQLite (node-sqlite3-wasm), SVG charts

**Implementation order:** Follows dependency graph — shared infrastructure first, then features by impact.

---

## File Map

| File | Action | Feature | Purpose |
|------|--------|---------|---------|
| `src/renderer/composables/useBirthEventCreation.ts` | Create | A, C | Shared composable: create birth event + participant + citation |
| `src/renderer/stores/sourceSession.ts` | Create | D | Pinia store for last-used source memory |
| `src/renderer/components/AddRelatedPersonModal.vue` | Modify | A | Add birth fields, surname pre-fill, sex inference, mode split |
| `src/renderer/views/PersonsView.vue` | Modify | C | Add inline birth fields to Add Person modal |
| `src/renderer/components/EventList.vue` | Modify | E | Add cite button per row, citation count badge |
| `src/renderer/components/CitationForm.vue` | Modify | D | Source session pre-fill |
| `src/renderer/components/EventForm.vue` | Modify | D, G | Source session + Save & Add Another |
| `src/api/events.ts` | Modify | E | Add citation_count to event queries |
| `src/renderer/utils/chartLayout.ts` | Modify | F | Placeholder nodes for missing parents |
| `src/renderer/components/charts/PedigreeChart.vue` | Modify | F | Ghost box rendering + click handler |
| `src/renderer/views/PersonDetailView.vue` | Modify | A | Split parent button into father/mother |
| `src/renderer/components/PersonPanel.vue` | Modify | A | Split parent button into father/mother |
| `src/renderer/i18n/en.ts` | Modify | All | English translations |
| `src/renderer/i18n/sv.ts` | Modify | All | Swedish translations |
| `tests/unit/events.test.ts` | Modify | E | Test citation_count in queries |
| `tests/components/AddRelatedPersonModal.test.ts` | Modify | A | Test birth fields, pre-fill, inference |

---

## Task 1: Shared Birth Event Composable

**Files:**
- Create: `src/renderer/composables/useBirthEventCreation.ts`

- [ ] **Step 1: Create the composable**

```typescript
// src/renderer/composables/useBirthEventCreation.ts

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface BirthEventData {
  date_value?: string;
  date_original?: string;
  place_id?: string | null;
  source_id?: string | null;
  page?: string;
}

export function useBirthEventCreation() {
  async function createBirthEvent(
    personId: string,
    data: BirthEventData
  ): Promise<string | null> {
    if (!window.api) return null;
    const hasData = data.date_value || data.place_id;
    if (!hasData) return null;

    const event = (await window.api.events.create({
      event_type: 'birth',
      date_type: 'exact',
      date_value: data.date_value || null,
      date_original: data.date_original || '',
      place_id: data.place_id || null,
    })) as { id: string };

    await window.api.eventParticipants.add({
      event_id: event.id,
      person_id: personId,
      role: 'primary',
    });

    if (data.source_id) {
      await window.api.citations.create({
        source_id: data.source_id,
        event_id: event.id,
        page: data.page || '',
        confidence: 2,
      });
    }

    return event.id;
  }

  return { createBirthEvent };
}
```

- [ ] **Step 2: Commit**

```
git add src/renderer/composables/useBirthEventCreation.ts
git commit -m "feat: add useBirthEventCreation composable for shared birth event creation"
```

---

## Task 2: Feature A — Enhanced AddRelatedPersonModal

**Files:**
- Modify: `src/renderer/components/AddRelatedPersonModal.vue`
- Modify: `src/renderer/views/PersonDetailView.vue`
- Modify: `src/renderer/components/PersonPanel.vue`
- Modify: `src/renderer/components/charts/PedigreeChart.vue`
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`

- [ ] **Step 1: Update i18n keys for father/mother split and birth fields**

In `src/renderer/i18n/en.ts`, add to the `personDetail` section:
```
addFather: 'Add Father',
addMother: 'Add Mother',
addFatherTitle: 'Add Father',
addMotherTitle: 'Add Mother',
```

In the `addRelated` section, add:
```
birthDate: 'Birth date',
birthPlace: 'Birth place',
originalDate: 'Original date text',
addSource: 'Add source',
sourcePlaceholder: 'Select source…',
page: 'Page / location',
```

Add the same keys in `sv.ts`:
```
// personDetail:
addFather: 'Lägg till far',
addMother: 'Lägg till mor',
addFatherTitle: 'Lägg till far',
addMotherTitle: 'Lägg till mor',

// addRelated:
birthDate: 'Födelsedatum',
birthPlace: 'Födelseort',
originalDate: 'Originaldatum',
addSource: 'Lägg till källa',
sourcePlaceholder: 'Välj källa…',
page: 'Sida / plats',
```

- [ ] **Step 2: Modify AddRelatedPersonModal — props, inference, birth fields**

Update props to accept mode `'father' | 'mother' | 'spouse' | 'child'` plus new optional props:

```typescript
const props = defineProps<{
  personId: string;
  personSex?: 'M' | 'F' | 'U';
  personSurname?: string;
  mode: 'father' | 'mother' | 'spouse' | 'child';
}>();
```

Update computed title to handle father/mother:

```typescript
const title = computed(() => {
  if (props.mode === 'father') return t('personDetail.addFatherTitle');
  if (props.mode === 'mother') return t('personDetail.addMotherTitle');
  if (props.mode === 'spouse') return t('personDetail.addSpouseTitle');
  return t('personDetail.addChildTitle');
});
```

Add auto-inference logic. After the form reactive (line 99), add a `watchEffect` or immediate setup:

```typescript
// Sex auto-inference
const inferredSex = computed(() => {
  if (props.mode === 'father') return 'M';
  if (props.mode === 'mother') return 'F';
  if (props.mode === 'spouse') {
    if (props.personSex === 'M') return 'F';
    if (props.personSex === 'F') return 'M';
  }
  return 'U';
});

// Pre-fill on mount
form.sex = inferredSex.value;
if (props.mode === 'child' && props.personSurname) {
  form.surname = props.personSurname;
}
```

Add birth form state:

```typescript
const birthForm = reactive({
  date_value: '',
  date_original: '',
  place_id: null as string | null,
});
const addBirthSource = ref(false);
const birthSourceForm = reactive({ source_id: '', page: '' });
const sources = ref<{ id: string; title: string }[]>([]);

onMounted(async () => {
  if (window.api) {
    sources.value = (await window.api.sources.list()) as { id: string; title: string }[];
  }
});
```

Import the composable and PlacePicker:

```typescript
import { useBirthEventCreation } from '../composables/useBirthEventCreation';
import PlacePicker from './PlacePicker.vue';
const { createBirthEvent } = useBirthEventCreation();
```

Add birth fields to the template, after the "New person" `<template v-else>` block but still inside it, before the subtype label:

```vue
<!-- Birth (optional) -->
<details class="birth-section" open>
  <summary>{{ $t('events.birth') }}</summary>
  <label>{{ $t('addRelated.birthDate') }}
    <input v-model="birthForm.date_value" type="date" />
  </label>
  <label>{{ $t('addRelated.originalDate') }}
    <input v-model="birthForm.date_original" type="text"
      :placeholder="$t('addRelated.originalDate')" />
  </label>
  <label>{{ $t('addRelated.birthPlace') }}
    <PlacePicker v-model="birthForm.place_id"
      :placeholder="$t('addRelated.birthPlace')" />
  </label>
  <label class="checkbox-label">
    <input type="checkbox" v-model="addBirthSource" />
    {{ $t('addRelated.addSource') }}
  </label>
  <template v-if="addBirthSource">
    <label>{{ $t('sources.source') }}
      <select v-model="birthSourceForm.source_id">
        <option value="" disabled>{{ $t('addRelated.sourcePlaceholder') }}</option>
        <option v-for="s in sources" :key="s.id" :value="s.id">{{ s.title }}</option>
      </select>
    </label>
    <label>{{ $t('addRelated.page') }}
      <input v-model="birthSourceForm.page" type="text"
        :placeholder="$t('addRelated.page')" />
    </label>
  </template>
</details>
```

Update the `save()` function — after person creation (line 115) and before relationship creation (line 118), add birth event creation:

```typescript
// After: targetPersonId = newPerson.id;
// Add birth event if any birth data provided
await createBirthEvent(targetPersonId, {
  date_value: birthForm.date_value || undefined,
  date_original: birthForm.date_original || undefined,
  place_id: birthForm.place_id,
  source_id: addBirthSource.value ? birthSourceForm.source_id || undefined : undefined,
  page: addBirthSource.value ? birthSourceForm.page : undefined,
});
```

Add scoped styles for birth section:

```css
.birth-section {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 4px 0;
}
.birth-section summary {
  cursor: pointer;
  font-weight: 500;
  font-size: var(--font-sm);
  color: var(--color-text-muted, #64748b);
}
```

- [ ] **Step 3: Update PersonDetailView — split parent into father/mother**

In `src/renderer/views/PersonDetailView.vue`, change the parent button (line ~85) from one button to two:

Replace:
```html
<button class="btn-add" @click="addRelatedMode = 'parent'; showAddRelated = true">
  <span aria-hidden="true">+ </span>{{ $t('personDetail.addParent') }}
</button>
```

With:
```html
<button class="btn-add" @click="addRelatedMode = 'father'; showAddRelated = true">
  <span aria-hidden="true">+ </span>{{ $t('personDetail.addFather') }}
</button>
<button class="btn-add" @click="addRelatedMode = 'mother'; showAddRelated = true">
  <span aria-hidden="true">+ </span>{{ $t('personDetail.addMother') }}
</button>
```

Update the type of `addRelatedMode` ref (line ~229):

```typescript
const addRelatedMode = ref<'father' | 'mother' | 'spouse' | 'child'>('father');
```

Pass new props to the modal (line ~148):

```html
<AddRelatedPersonModal
  v-if="showAddRelated"
  :person-id="person.id"
  :person-sex="person.sex"
  :person-surname="primaryName?.surname"
  :mode="addRelatedMode"
  @close="showAddRelated = false"
  @saved="showAddRelated = false; relSectionRef?.reload()"
/>
```

Add a computed `primaryName` that extracts the first name from the loaded names list (the names are already loaded):

```typescript
const primaryName = computed(() => names.value?.[0] ?? null);
```

- [ ] **Step 4: Update PersonPanel — split parent into father/mother**

In `src/renderer/components/PersonPanel.vue`, replace the parent button (line ~31):

Replace:
```html
<button class="btn-dark" @click="openAddRelative('parent')">{{ $t('personDetail.addParent') }}</button>
```

With:
```html
<button class="btn-dark" @click="openAddRelative('father')">{{ $t('personDetail.addFather') }}</button>
<button class="btn-dark" @click="openAddRelative('mother')">{{ $t('personDetail.addMother') }}</button>
```

Update the type of `addRelativeMode` ref:

```typescript
const addRelativeMode = ref<'father' | 'mother' | 'spouse' | 'child'>('father');
```

Update `openAddRelative` function parameter type:

```typescript
function openAddRelative(mode: 'father' | 'mother' | 'spouse' | 'child') {
```

Pass new props to AddRelatedPersonModal:

```html
<AddRelatedPersonModal
  v-if="showAddRelative && personId"
  :person-id="personId"
  :person-sex="person?.sex"
  :person-surname="personPrimarySurname"
  :mode="addRelativeMode"
  @close="showAddRelative = false"
  @saved="onRelativeSaved"
/>
```

Add computed for primary surname (person data is already loaded in PersonPanel):

```typescript
const personPrimarySurname = computed(() => names.value?.[0]?.surname ?? null);
```

- [ ] **Step 5: Update PedigreeChart add popover — father/mother split**

In `src/renderer/components/charts/PedigreeChart.vue`, update the popover buttons (lines ~136-138):

Replace:
```html
<button @click="startAddRelative('parent')">{{ $t('personDetail.addParent') }}</button>
```

With:
```html
<button @click="startAddRelative('father')">{{ $t('personDetail.addFather') }}</button>
<button @click="startAddRelative('mother')">{{ $t('personDetail.addMother') }}</button>
```

Update the `startAddRelative` function type and modal props to pass `personSex` and `personSurname`. The popover already knows which person is selected via `popoverBox` — extract sex and surname from `popoverBox.value.person`.

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: All existing tests pass. The AddRelatedPersonModal test may need updating for the new mode type.

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "feat: enhance AddRelatedPersonModal with birth fields, surname pre-fill, sex inference"
```

---

## Task 3: Feature C — Inline Birth in Person Creation

**Files:**
- Modify: `src/renderer/views/PersonsView.vue`

- [x] **Step 1: Add birth fields to PersonsView Add Person modal**

Import the composable and PlacePicker at the top of the script:

```typescript
import PlacePicker from '../components/PlacePicker.vue';
import { useBirthEventCreation } from '../composables/useBirthEventCreation';

const { createBirthEvent } = useBirthEventCreation();
```

Add birth form state alongside existing form (after line ~245):

```typescript
const birthForm = reactive({
  date_value: '',
  date_original: '',
  place_id: null as string | null,
});
const addBirthSource = ref(false);
const birthSourceForm = reactive({ source_id: '', page: '' });
const sources = ref<{ id: string; title: string }[]>([]);
```

Load sources on mount (add to existing onMounted or add new one):

```typescript
onMounted(async () => {
  if (window.api) {
    sources.value = (await window.api.sources.list()) as { id: string; title: string }[];
  }
});
```

In the template, add birth section after the Notes textarea (line ~140) but before modal-actions:

```vue
<!-- Birth (optional) -->
<details class="birth-section" open>
  <summary>{{ $t('events.birth') }}</summary>
  <label>{{ $t('addRelated.birthDate') }}
    <input v-model="birthForm.date_value" type="date" />
  </label>
  <label>{{ $t('addRelated.originalDate') }}
    <input v-model="birthForm.date_original" type="text"
      :placeholder="$t('addRelated.originalDate')" />
  </label>
  <label>{{ $t('addRelated.birthPlace') }}
    <PlacePicker v-model="birthForm.place_id"
      :placeholder="$t('addRelated.birthPlace')" />
  </label>
  <label class="checkbox-label">
    <input type="checkbox" v-model="addBirthSource" />
    {{ $t('addRelated.addSource') }}
  </label>
  <template v-if="addBirthSource">
    <label>{{ $t('sources.source') }}
      <select v-model="birthSourceForm.source_id">
        <option value="" disabled>{{ $t('addRelated.sourcePlaceholder') }}</option>
        <option v-for="s in sources" :key="s.id" :value="s.id">{{ s.title }}</option>
      </select>
    </label>
    <label>{{ $t('addRelated.page') }}
      <input v-model="birthSourceForm.page" type="text"
        :placeholder="$t('addRelated.page')" />
    </label>
  </template>
</details>
```

- [ ] **Step 2: Update addPerson function to create birth event after person**

In the `addPerson()` function (line ~319), after person creation and before form reset:

```typescript
// After: const person = await window.api.persons.create({...});
const newPerson = person as { id: string };

// Create birth event if any birth data provided
await createBirthEvent(newPerson.id, {
  date_value: birthForm.date_value || undefined,
  date_original: birthForm.date_original || undefined,
  place_id: birthForm.place_id,
  source_id: addBirthSource.value ? birthSourceForm.source_id || undefined : undefined,
  page: addBirthSource.value ? birthSourceForm.page : undefined,
});
```

Add birth form reset in the existing reset block:

```typescript
birthForm.date_value = '';
birthForm.date_original = '';
birthForm.place_id = null;
addBirthSource.value = false;
birthSourceForm.source_id = '';
birthSourceForm.page = '';
```

- [ ] **Step 3: Add scoped styles**

Add the same `.birth-section` styles as in Task 2 (copy from AddRelatedPersonModal).

- [ ] **Step 4: Run tests**

```bash
npm test
```

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat: add inline birth fields to Add Person modal"
```

---

## Task 4: Feature E — Quick Cite from Event List

**Files:**
- Modify: `src/api/events.ts`
- Modify: `src/renderer/components/EventList.vue`
- Modify: `tests/unit/events.test.ts`
- Modify: `src/renderer/i18n/en.ts`, `sv.ts`

- [ ] **Step 1: Add citation_count to event queries in src/api/events.ts**

Modify `getEventsForPerson` (lines 43-50):

```typescript
export function getEventsForPerson(db: Database, personId: string): (GenealogyEvent & { citation_count: number })[] {
  return queryAll<GenealogyEvent & { citation_count: number }>(db, `
    SELECT e.*, COALESCE(cc.cnt, 0) AS citation_count
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    LEFT JOIN (SELECT event_id, COUNT(*) AS cnt FROM citations GROUP BY event_id) cc ON cc.event_id = e.id
    WHERE ep.person_id = ?
    ORDER BY e.date_value
  `, [personId]);
}
```

Modify `getEventsForRelationship` (lines 52-54):

```typescript
export function getEventsForRelationship(db: Database, relationshipId: string): (GenealogyEvent & { citation_count: number })[] {
  return queryAll<GenealogyEvent & { citation_count: number }>(db, `
    SELECT e.*, COALESCE(cc.cnt, 0) AS citation_count
    FROM events e
    LEFT JOIN (SELECT event_id, COUNT(*) AS cnt FROM citations GROUP BY event_id) cc ON cc.event_id = e.id
    WHERE e.relationship_id = ?
    ORDER BY e.date_value
  `, [relationshipId]);
}
```

- [ ] **Step 2: Write unit test for citation_count**

In `tests/unit/events.test.ts`, add a test:

```typescript
test('getEventsForPerson includes citation_count', () => {
  const person = persons.createPerson(db, { given_name: 'Test' });
  const event = events.createEvent(db, { event_type: 'birth' });
  relationships.addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

  // No citations yet
  let result = events.getEventsForPerson(db, person.id);
  expect(result[0].citation_count).toBe(0);

  // Add a source and citation
  const source = sources.createSource(db, { title: 'Test Source' });
  sources.createCitation(db, { source_id: source.id, event_id: event.id });

  result = events.getEventsForPerson(db, person.id);
  expect(result[0].citation_count).toBe(1);

  // Add second citation
  sources.createCitation(db, { source_id: source.id, event_id: event.id, page: 'p2' });
  result = events.getEventsForPerson(db, person.id);
  expect(result[0].citation_count).toBe(2);
});
```

- [ ] **Step 3: Run unit tests**

```bash
npm test
```

Expected: All pass including the new citation_count test.

- [ ] **Step 4: Add i18n keys**

In `en.ts` events section:
```
cite: 'Cite',
addCitation: 'Add citation',
citationCount: '{count} citation | {count} citations',
```

In `sv.ts` events section:
```
cite: 'Citera',
addCitation: 'Lägg till citering',
citationCount: '{count} citering | {count} citeringar',
```

- [ ] **Step 5: Add cite button and citation badge to EventList.vue**

Import CitationForm:
```typescript
import CitationForm from './CitationForm.vue';
```

Add state for the cite modal:
```typescript
const citingEventId = ref<string | null>(null);

function openCiteModal(event: EventRow) {
  citingEventId.value = event.id;
}

async function onCitationSaved() {
  citingEventId.value = null;
  await load();
}
```

In the table header row, add a "Cites" column before the existing actions column.

In each event row, add citation count badge and cite button. The badge goes in the new Cites column:

```vue
<td class="cite-cell">
  <span v-if="event.citation_count" class="cite-badge"
    :title="$t('events.citationCount', event.citation_count)">
    {{ event.citation_count }}
  </span>
  <button v-if="!props.readonly" class="btn-sm btn-cite"
    @click.stop="openCiteModal(event)"
    :title="$t('events.addCitation')">
    {{ $t('events.cite') }}
  </button>
</td>
```

Add the CitationForm modal at the bottom of the template:

```vue
<CitationForm v-if="citingEventId"
  :event-id="citingEventId"
  @close="citingEventId = null"
  @saved="onCitationSaved" />
```

Update the `EventRow` type to include `citation_count`:

```typescript
interface EventRow {
  id: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  place_name?: string;
  description: string;
  cause: string | null;
  citation_count: number;
}
```

Add scoped styles for cite elements:

```css
.cite-cell {
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}
.cite-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--color-primary, #3b82f6);
  color: white;
  font-size: var(--font-xs);
  font-weight: 600;
  padding: 0 4px;
}
.btn-cite {
  font-size: var(--font-xs);
  padding: 2px 6px;
  border: 1px solid var(--color-border, #cbd5e1);
  background: var(--color-bg-subtle, #f8fafc);
  border-radius: 4px;
  cursor: pointer;
}
.btn-cite:hover {
  background: var(--color-bg-hover, #f1f5f9);
}
```

- [ ] **Step 6: Run tests**

```bash
npm test
```

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "feat: add quick cite button and citation count to event list"
```

---

## Task 5: Feature D — Source Session Memory

**Files:**
- Create: `src/renderer/stores/sourceSession.ts`
- Modify: `src/renderer/components/CitationForm.vue`
- Modify: `src/renderer/components/EventForm.vue`
- Modify: `src/renderer/components/AddRelatedPersonModal.vue`
- Modify: `src/renderer/views/PersonsView.vue`

- [ ] **Step 1: Create the Pinia store**

```typescript
// src/renderer/stores/sourceSession.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSourceSession = defineStore('sourceSession', () => {
  const lastSourceId = ref<string | null>(null);
  const lastPage = ref('');

  function setLastUsed(sourceId: string, page: string) {
    lastSourceId.value = sourceId;
    lastPage.value = page;
  }

  function clear() {
    lastSourceId.value = null;
    lastPage.value = '';
  }

  return { lastSourceId, lastPage, setLastUsed, clear };
});
```

- [ ] **Step 2: Integrate into CitationForm.vue**

Import the store:
```typescript
import { useSourceSession } from '../stores/sourceSession';
const sourceSession = useSourceSession();
```

On mount, pre-fill source if session has one and no prop override (after line ~88):
```typescript
onMounted(async () => {
  if (!window.api) return;
  sources.value = (await window.api.sources.list()) as SourceRow[];
  // Pre-fill from session memory if no prop override
  if (!props.sourceId && sourceSession.lastSourceId) {
    form.source_id = sourceSession.lastSourceId;
  }
});
```

After successful save (after line ~109), record the source:
```typescript
// After: await window.api.citations.create(data);
if (form.source_id) {
  sourceSession.setLastUsed(form.source_id, form.page);
}
```

- [ ] **Step 3: Integrate into EventForm.vue**

Import the store:
```typescript
import { useSourceSession } from '../stores/sourceSession';
const sourceSession = useSourceSession();
```

On mount, pre-fill source form if session has one (after sources load, line ~146):
```typescript
// After: sources.value = ...
if (sourceSession.lastSourceId) {
  sourceForm.source_id = sourceSession.lastSourceId;
}
```

After save with citation (after line ~217):
```typescript
// After citation creation in save()
if (sourceForm.source_id) {
  sourceSession.setLastUsed(sourceForm.source_id, sourceForm.page);
}
```

- [ ] **Step 4: Integrate into AddRelatedPersonModal.vue**

Import the store (add alongside existing imports):
```typescript
import { useSourceSession } from '../stores/sourceSession';
const sourceSession = useSourceSession();
```

On mount, pre-fill birth source from session:
```typescript
onMounted(async () => {
  if (window.api) {
    sources.value = (await window.api.sources.list()) as { id: string; title: string }[];
    if (sourceSession.lastSourceId) {
      birthSourceForm.source_id = sourceSession.lastSourceId;
    }
  }
});
```

After save, if birth source was used:
```typescript
// After createBirthEvent call in save()
if (addBirthSource.value && birthSourceForm.source_id) {
  sourceSession.setLastUsed(birthSourceForm.source_id, birthSourceForm.page);
}
```

- [ ] **Step 5: Integrate into PersonsView.vue**

Same pattern as AddRelatedPersonModal — import store, pre-fill on mount, record after save. Identical code.

- [ ] **Step 6: Run tests**

```bash
npm test
```

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "feat: add source session memory for citation pre-fill"
```

---

## Task 6: Feature F — Tree-Based Entry Shortcuts

**Files:**
- Modify: `src/renderer/utils/chartLayout.ts`
- Modify: `src/renderer/components/charts/PedigreeChart.vue`

- [ ] **Step 1: Add PlaceholderBox type and generation logic in chartLayout.ts**

Add a new interface after `PersonNode` (around line 14):

```typescript
export interface PlaceholderBox {
  type: 'placeholder';
  role: 'father' | 'mother';
  childPersonId: string;
  key: number;
  x: number;
  y: number;
}
```

Update the return type of `computePedigreeLayout` to include placeholder boxes. The function currently returns `{ boxes, lines, collapseButtons }`. Add `placeholders: PlaceholderBox[]` to the return.

After the main layout loop that computes box positions (around line 233), add placeholder generation:

```typescript
// Generate placeholder boxes for missing parents of leaf nodes
const placeholders: PlaceholderBox[] = [];
for (const [key, node] of nodes) {
  const fatherKey = key * 2;
  const motherKey = key * 2 + 1;
  // Only add placeholders for nodes that are missing one or both parents
  // and are within the loaded generation range
  const gen = Math.floor(Math.log2(key));
  if (gen >= G - 1) continue; // Don't add beyond max generations

  const nodeBox = boxes.find(b => b.key === key);
  if (!nodeBox) continue;

  // Father placeholder (above center)
  if (!nodes.has(fatherKey)) {
    placeholders.push({
      type: 'placeholder',
      role: 'father',
      childPersonId: node.id,
      key: fatherKey,
      x: nodeBox.x + BOX_W + H_GAP,
      y: nodeBox.y - (BOX_H + V_GAP) / 2,
    });
  }

  // Mother placeholder (below center)
  if (!nodes.has(motherKey)) {
    placeholders.push({
      type: 'placeholder',
      role: 'mother',
      childPersonId: node.id,
      key: motherKey,
      x: nodeBox.x + BOX_W + H_GAP,
      y: nodeBox.y + (BOX_H + V_GAP) / 2,
    });
  }
}

return { boxes, lines, collapseButtons, placeholders };
```

Note: The exact x/y calculation depends on the direction of the pedigree layout (right-to-left vs left-to-right). Read the actual direction logic in `computePedigreeLayout` and adjust accordingly — the key principle is: placeholder goes one generation further out, vertically offset from the child node.

- [ ] **Step 2: Render ghost boxes in PedigreeChart.vue**

Import the `PlaceholderBox` type.

In the SVG template, after the main box rendering loop, add ghost box rendering:

```vue
<!-- Ghost boxes for missing parents -->
<g v-for="ph in layout.placeholders" :key="'ph-' + ph.key"
  class="ghost-box"
  :transform="`translate(${ph.x}, ${ph.y})`"
  tabindex="0"
  role="button"
  :aria-label="ph.role === 'father' ? $t('personDetail.addFather') : $t('personDetail.addMother')"
  @click="startAddFromPlaceholder(ph)"
  @keydown.enter="startAddFromPlaceholder(ph)"
  @keydown.space.prevent="startAddFromPlaceholder(ph)">
  <rect :width="BOX_W" :height="BOX_H" rx="6" ry="6"
    fill="none" stroke="#94a3b8" stroke-dasharray="4 3" stroke-width="1.5" />
  <text :x="BOX_W / 2" :y="BOX_H / 2 - 6" text-anchor="middle"
    fill="#94a3b8" font-size="18">+</text>
  <text :x="BOX_W / 2" :y="BOX_H / 2 + 12" text-anchor="middle"
    fill="#94a3b8" font-size="11">
    {{ ph.role === 'father' ? $t('personDetail.addFather') : $t('personDetail.addMother') }}
  </text>
</g>
```

Add the handler function:

```typescript
function startAddFromPlaceholder(ph: PlaceholderBox) {
  // Find the child person's data for surname/sex props
  const childBox = layout.value.boxes.find(b => b.person.id === ph.childPersonId);
  addRelativePersonId.value = ph.childPersonId;
  addRelativeMode.value = ph.role;
  addRelativePersonSex.value = childBox?.person.sex ?? 'U';
  addRelativePersonSurname.value = childBox?.person.surname ?? undefined;
  showAddRelativeModal.value = true;
}
```

Add connector lines from ghost boxes to their child nodes (dashed lines matching the ghost style):

```vue
<!-- Ghost connector lines -->
<line v-for="ph in layout.placeholders" :key="'phl-' + ph.key"
  :x1="ph.x" :y1="ph.y + BOX_H / 2"
  :x2="ph.x - H_GAP" :y2="/* child box center Y */"
  stroke="#94a3b8" stroke-dasharray="4 3" stroke-width="1" />
```

The exact child Y coordinate needs to be computed from the child's box position. Look up the child box from layout.boxes.

Add scoped styles:

```css
.ghost-box { cursor: pointer; }
.ghost-box:hover rect { stroke: var(--color-primary, #3b82f6); }
.ghost-box:hover text { fill: var(--color-primary, #3b82f6); }
.ghost-box:focus { outline: 2px solid var(--color-primary, #3b82f6); outline-offset: 2px; border-radius: 6px; }
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat: add ghost placeholder boxes for missing parents in pedigree chart"
```

---

## Task 7: Feature G — Batch Event Entry

**Files:**
- Modify: `src/renderer/components/EventForm.vue`
- Modify: `src/renderer/i18n/en.ts`, `sv.ts`

- [ ] **Step 1: Add i18n keys**

In `en.ts` events section:
```
saveAndAnother: 'Save & Add Another',
eventsAdded: '{count} event added | {count} events added',
```

In `sv.ts` events section:
```
saveAndAnother: 'Spara & lägg till fler',
eventsAdded: '{count} händelse tillagd | {count} händelser tillagda',
```

- [ ] **Step 2: Add batch mode to EventForm.vue**

Add state for batch counter:

```typescript
const addedCount = ref(0);
```

Add `saveAndAnother` function:

```typescript
async function saveAndAnother() {
  await save();
  // save() emits 'saved' which reloads the event list
  // But we DON'T want to close — so we need to restructure slightly
  // Reset form for next entry
  form.event_type = '';
  form.date_type = 'exact';
  form.date_value = '';
  form.date_value_end = '';
  form.date_original = '';
  form.place_id = null;
  form.description = '';
  form.cause = '';
  // Keep source selection from session memory
  addedCount.value++;
}
```

However, the current `save()` function emits `close` at the end. We need to prevent that when doing "save and another". Refactor: extract the save logic into a `doSave()` function that returns success boolean, then:
- `save()` calls `doSave()` then emits `saved` + `close`
- `saveAndAnother()` calls `doSave()` then emits `saved` (no close) and resets form

```typescript
async function doSave(): Promise<boolean> {
  // All the current save() logic, but without emit calls
  // Returns true on success, false on error
  // ... (move lines 179-225 here, remove emit calls)
}

async function save() {
  if (await doSave()) {
    emit('saved');
    emit('close');
  }
}

async function saveAndAnother() {
  if (await doSave()) {
    emit('saved');
    // Reset form for next entry
    form.event_type = '';
    form.date_type = 'exact';
    form.date_value = '';
    form.date_value_end = '';
    form.date_original = '';
    form.place_id = null;
    form.description = '';
    form.cause = '';
    addSource.value = false;
    existingCitations.value = [];
    addedCount.value++;
  }
}
```

In the template, add the "Save & Add Another" button and counter badge. Update the modal-actions div:

```vue
<div class="modal-actions">
  <span v-if="addedCount > 0" class="added-badge">
    {{ $t('events.eventsAdded', addedCount) }}
  </span>
  <button type="button" class="btn-cancel" @click="$emit('close')">
    {{ $t('common.cancel') }}
  </button>
  <button v-if="!editing" type="button" class="btn-secondary"
    @click="saveAndAnother">
    {{ $t('events.saveAndAnother') }}
  </button>
  <button type="submit">
    {{ editing ? $t('events.updateEvent') : $t('events.addEvent') }}
  </button>
</div>
```

Add scoped styles:

```css
.added-badge {
  font-size: var(--font-xs);
  color: var(--color-text-muted, #64748b);
  margin-right: auto;
}
.btn-secondary {
  padding: 6px 14px;
  border: 1px solid var(--color-border, #cbd5e1);
  background: var(--color-bg-subtle, #f8fafc);
  border-radius: 6px;
  cursor: pointer;
  font-size: var(--font-sm);
}
.btn-secondary:hover {
  background: var(--color-bg-hover, #f1f5f9);
}
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat: add Save & Add Another for batch event entry"
```

---

## Task 8: Final Integration & Version Bump

**Files:**
- Modify: `package.json`
- Modify: `.claude/PLAN.md`

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

All tests must pass.

- [ ] **Step 2: Bump version**

In `package.json`, bump the version (minor bump for feature addition):

```json
"version": "0.49.0"
```

- [ ] **Step 3: Update PLAN.md roadmap**

Add a Done entry for the usability optimization milestone in `.claude/PLAN.md`.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat: usability optimization suite — reduce data entry actions by ~50% (v0.49.0)"
```
