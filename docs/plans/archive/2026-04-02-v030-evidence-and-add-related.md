# v0.3.0 Remaining Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete v0.3.0 by adding citation affordances everywhere (badges, Cite buttons, inline source on EventForm) and "Add Related Person" actions from PersonDetailView.

**Architecture:** All changes are in the Vue renderer layer (`src/renderer/`). No new API functions or IPC channels are needed — the existing `citations.forEvent`, `persons.create`, and `relationships.create` IPC calls cover everything. Two new components are added: `AddRelatedPersonModal.vue` (creates person + relationship in one modal) and citation UI is added inline to existing components.

**Tech Stack:** Vue 3 Composition API (`<script setup lang="ts">`), vue-i18n, existing `window.api.*` IPC surface.

---

## File Map

| File | Change |
|------|--------|
| `src/renderer/i18n/sv.ts` | Add new strings for citation badges, Cite buttons, Add Related Person |
| `src/renderer/i18n/en.ts` | Same strings in English |
| `src/renderer/components/EventList.vue` | Add citation count column, Cite button per row, import CitationForm |
| `src/renderer/components/CitationForm.vue` | Add `relationshipId` prop |
| `src/renderer/components/EventForm.vue` | Add optional "Add Source" section (visible on create only) |
| `src/renderer/components/AddRelatedPersonModal.vue` | **New.** Modal to create a new person and link them as parent/spouse/child |
| `src/renderer/views/PersonDetailView.vue` | Add Cite Person button, evidence summary, Add Parent/Spouse/Child buttons |
| `src/renderer/views/RelationshipDetailView.vue` | Add Cite Relationship button |

---

## Task 1: Add i18n strings

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add strings to sv.ts**

In `src/renderer/i18n/sv.ts`, make these additions:

In the `events` block, add after `confirmDelete`:
```typescript
    citeSources: 'Citera',
    unsourced: 'Okänd källa',
    sources: 'källa | källor',
    addSourceOptional: 'Lägg till källa (valfritt)',
```

In the `personDetail` block, add after `noRelationships`:
```typescript
    citePersonTitle: 'Citera person',
    addParent: '+ Lägg till förälder',
    addSpouse: '+ Lägg till partner',
    addChild: '+ Lägg till barn',
    addParentTitle: 'Lägg till förälder',
    addSpouseTitle: 'Lägg till partner',
    addChildTitle: 'Lägg till barn',
    coupleSubtype: 'Relationstyp',
    addAndLink: 'Skapa och koppla',
    evidenceSummary: '{sourced} av {total} händelser med källa',
```

In the `relationshipDetail` block, add after `notesPlaceholder`:
```typescript
    citeRelationship: 'Citera relation',
```

- [ ] **Step 2: Add strings to en.ts**

Same locations in `src/renderer/i18n/en.ts`:

In the `events` block:
```typescript
    citeSources: 'Cite',
    unsourced: 'Unsourced',
    sources: 'source | sources',
    addSourceOptional: 'Add Source (optional)',
```

In the `personDetail` block:
```typescript
    citePersonTitle: 'Cite Person',
    addParent: '+ Add Parent',
    addSpouse: '+ Add Spouse/Partner',
    addChild: '+ Add Child',
    addParentTitle: 'Add Parent',
    addSpouseTitle: 'Add Spouse/Partner',
    addChildTitle: 'Add Child',
    coupleSubtype: 'Relationship Type',
    addAndLink: 'Create and Link',
    evidenceSummary: '{sourced} of {total} events sourced',
```

In the `relationshipDetail` block:
```typescript
    citeRelationship: 'Cite Relationship',
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "i18n: add strings for citation affordances and add-related-person"
```

---

## Task 2: Citation count + Cite button in EventList

**Files:**
- Modify: `src/renderer/components/EventList.vue`

- [ ] **Step 1: Add citation count loading and CitationForm import**

Replace the entire `<script setup>` block in `src/renderer/components/EventList.vue` with:

```typescript
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import EventForm from './EventForm.vue';
import CitationForm from './CitationForm.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface EventRow {
  id: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  description: string;
}

const props = defineProps<{
  personId?: string;
  relationshipId?: string;
}>();

const { t } = useI18n();
const events = ref<EventRow[]>([]);
const citationCounts = ref<Record<string, number>>({});
const showForm = ref(false);
const editingEvent = ref<EventRow | null>(null);
const citingEventId = ref<string | null>(null);

async function load() {
  if (!window.api) return;
  try {
    if (props.personId) {
      events.value = (await window.api.events.forPerson(props.personId)) as EventRow[];
    } else if (props.relationshipId) {
      events.value = (await window.api.events.forRelationship(props.relationshipId)) as EventRow[];
    }
    await loadCitationCounts();
  } catch (err) {
    console.error('[EventList] load failed:', err);
  }
}

async function loadCitationCounts() {
  const counts: Record<string, number> = {};
  await Promise.all(
    events.value.map(async (ev) => {
      const cits = (await window.api.citations.forEvent(ev.id)) as unknown[];
      counts[ev.id] = cits.length;
    }),
  );
  citationCounts.value = counts;
}

function formatDate(event: EventRow): string {
  if (event.date_original) return event.date_original;
  if (!event.date_value) return '';
  const prefix =
    event.date_type === 'about'
      ? t('datePrefix.about')
      : event.date_type === 'before'
        ? t('datePrefix.before')
        : event.date_type === 'after'
          ? t('datePrefix.after')
          : '';
  if (event.date_type === 'between' && event.date_value_end) {
    return `${event.date_value} – ${event.date_value_end}`;
  }
  return `${prefix}${event.date_value}`;
}

function editEvent(event: EventRow) {
  editingEvent.value = event;
  showForm.value = true;
}

async function removeEvent(id: string) {
  if (!window.api) return;
  if (!confirm(t('events.confirmDelete'))) return;
  try {
    await window.api.events.delete(id);
    await load();
  } catch (err) {
    console.error('[EventList] removeEvent failed:', err);
  }
}

function closeForm() {
  showForm.value = false;
  editingEvent.value = null;
}

function onSaved() {
  closeForm();
  load();
}

function openCiteForm(eventId: string) {
  citingEventId.value = eventId;
}

function closeCiteForm() {
  citingEventId.value = null;
}

function onCiteSaved() {
  closeCiteForm();
  loadCitationCounts();
}

onMounted(load);

defineExpose({ reload: load });
```

- [ ] **Step 2: Update the template**

Replace the entire `<template>` block with:

```html
<template>
  <div class="event-list">
    <div class="section-header">
      <h4>{{ $t('events.title') }}</h4>
      <button type="button" class="btn-add" @click="showForm = true">{{ $t('events.addEvent') }}</button>
    </div>
    <div v-if="events.length === 0" class="empty-hint">{{ $t('events.noEvents') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('common.type') }}</th>
          <th>{{ $t('events.date') }}</th>
          <th>{{ $t('events.description') }}</th>
          <th>{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="event in events" :key="event.id">
          <td>
            <span class="event-badge">{{ $t('eventTypes.' + event.event_type) }}</span>
            <span
              v-if="citationCounts[event.id] > 0"
              class="source-count-badge"
            >{{ citationCounts[event.id] }} {{ $t('events.sources', citationCounts[event.id]) }}</span>
            <span v-else class="unsourced-badge">{{ $t('events.unsourced') }}</span>
          </td>
          <td>{{ formatDate(event) }}</td>
          <td>{{ event.description }}</td>
          <td class="actions-cell">
            <button type="button" class="btn-sm btn-cite" @click="openCiteForm(event.id)">{{ $t('events.citeSources') }}</button>
            <button type="button" class="btn-sm btn-edit" @click="editEvent(event)">{{ $t('common.edit') }}</button>
            <button type="button" class="btn-sm btn-delete" @click="removeEvent(event.id)">{{ $t('common.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>

    <EventForm
      v-if="showForm"
      :person-id="personId"
      :relationship-id="relationshipId"
      :editing-event="editingEvent"
      @close="closeForm"
      @saved="onSaved"
    />

    <CitationForm
      v-if="citingEventId"
      :event-id="citingEventId"
      @close="closeCiteForm"
      @saved="onCiteSaved"
    />
  </div>
</template>
```

- [ ] **Step 3: Add styles for new badges**

In the `<style scoped>` block, add after the existing `.btn-delete` rule:

```css
.source-count-badge {
  background: #dcfce7;
  color: #166534;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 11px;
  margin-left: 6px;
}
.unsourced-badge {
  background: #fef9c3;
  color: #854d0e;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 11px;
  margin-left: 6px;
}
.btn-cite {
  background: #eff6ff;
  color: #1d4ed8;
}
```

- [ ] **Step 4: Verify the app runs**

```bash
npm start
```

Navigate to a person with events. Confirm:
- Each event row shows either a green "N sources" badge or a yellow "Unsourced" badge
- "Cite" button opens CitationForm pre-linked to that event
- After adding a citation, the badge updates to "1 source"

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/EventList.vue
git commit -m "feat: add citation count badges and Cite button to EventList"
```

---

## Task 3: Add relationshipId prop to CitationForm + Cite Relationship button

**Files:**
- Modify: `src/renderer/components/CitationForm.vue`
- Modify: `src/renderer/views/RelationshipDetailView.vue`

- [ ] **Step 1: Add relationshipId prop to CitationForm**

In `src/renderer/components/CitationForm.vue`, change the `defineProps` block from:

```typescript
const props = defineProps<{
  sourceId?: string;
  eventId?: string;
  personId?: string;
}>();
```

To:

```typescript
const props = defineProps<{
  sourceId?: string;
  eventId?: string;
  personId?: string;
  relationshipId?: string;
}>();
```

In the `save()` function, after `if (props.personId) data.person_id = props.personId;`, add:

```typescript
    if (props.relationshipId) data.relationship_id = props.relationshipId;
```

- [ ] **Step 2: Add Cite Relationship button to RelationshipDetailView**

In `src/renderer/views/RelationshipDetailView.vue`, add these imports at the top of the `<script setup>`:

```typescript
import { ref, onMounted } from 'vue';
import CitationForm from '../components/CitationForm.vue';
```

(Note: `ref` is already imported, just add `CitationForm` to the import list.)

Add a new ref after `const notesText = ref('');`:

```typescript
const showCiteForm = ref(false);
```

In the template, find the `<div class="detail-header">` block and add a Cite button after the `<h2>`:

```html
    <div class="detail-header">
      <button class="btn-back" @click="$router.push('/relationships')">{{ $t('relationshipDetail.back') }}</button>
      <div class="header-row">
        <h2>{{ $t('relationshipDetail.title') }} — {{ $t('relTypes.' + relationship.type) }}</h2>
        <button type="button" class="btn-cite-header" @click="showCiteForm = true">{{ $t('relationshipDetail.citeRelationship') }}</button>
      </div>
    </div>
```

At the bottom of the template (before closing `</div>`), add:

```html
    <CitationForm
      v-if="showCiteForm && relationship"
      :relationship-id="relationship.id"
      @close="showCiteForm = false"
      @saved="showCiteForm = false"
    />
```

In the `<style scoped>` block, add:

```css
.header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.header-row h2 {
  margin: 0;
}
.btn-cite-header {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
```

Also remove the existing `margin: 8px 0 0` from `.detail-header h2` since h2 is now inside `.header-row`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/CitationForm.vue src/renderer/views/RelationshipDetailView.vue
git commit -m "feat: add Cite Relationship button and relationshipId support to CitationForm"
```

---

## Task 4: Cite Person button + evidence summary in PersonDetailView

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`

- [ ] **Step 1: Add CitationForm import and new refs**

In the `<script setup>` block of `PersonDetailView.vue`, add `CitationForm` to imports:

```typescript
import CitationForm from '../components/CitationForm.vue';
```

Add new refs after `const showNameForm = ref(false);`:

```typescript
const showCitePersonForm = ref(false);
const evidenceSourced = ref(0);
const evidenceTotal = ref(0);
```

- [ ] **Step 2: Load evidence summary in the load() function**

After building `rels.value = enriched;` in the `load()` function, add:

```typescript
    // Evidence summary: count events with at least one citation
    const evs = (await window.api.events.forPerson(personId)) as Array<{ id: string }>;
    evidenceTotal.value = evs.length;
    const counts = await Promise.all(
      evs.map(async (ev) => {
        const cits = (await window.api.citations.forEvent(ev.id)) as unknown[];
        return cits.length > 0 ? 1 : 0;
      }),
    );
    evidenceSourced.value = counts.reduce((a, b) => a + b, 0);
```

- [ ] **Step 3: Update the header template**

Find the `<div class="header-info">` block and replace it with:

```html
      <div class="header-info">
        <h2>{{ primaryName }}</h2>
        <span :class="'sex-badge sex-' + person.sex">{{ person.sex }}</span>
        <span v-if="!person.living" class="deceased-badge">{{ $t('personDetail.deceased') }}</span>
        <button type="button" class="btn-cite-header" @click="showCitePersonForm = true">{{ $t('personDetail.citePersonTitle') }}</button>
      </div>
      <div v-if="evidenceTotal > 0" class="evidence-summary">
        {{ $t('personDetail.evidenceSummary', { sourced: evidenceSourced, total: evidenceTotal }) }}
      </div>
```

At the bottom of the template (before the closing `</div>` of `v-if="person"`), add:

```html
    <CitationForm
      v-if="showCitePersonForm"
      :person-id="person.id"
      @close="showCitePersonForm = false"
      @saved="showCitePersonForm = false"
    />
```

- [ ] **Step 4: Add styles**

In the `<style scoped>` block, add after `.deceased-badge`:

```css
.btn-cite-header {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.evidence-summary {
  font-size: 13px;
  color: #6b7280;
  margin-top: 4px;
}
```

- [ ] **Step 5: Verify**

```bash
npm start
```

Open a person with events. Confirm:
- "Cite Person" button appears in the header
- Evidence summary line shows (e.g. "2 of 3 events sourced")
- Clicking "Cite Person" opens CitationForm with person pre-linked

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/PersonDetailView.vue
git commit -m "feat: add Cite Person button and evidence summary to PersonDetailView"
```

---

## Task 5: Optional source section in EventForm

**Files:**
- Modify: `src/renderer/components/EventForm.vue`

- [ ] **Step 1: Add source loading and form fields**

Replace the entire `<script setup>` block with:

```typescript
import { reactive, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import DateInput from './DateInput.vue';
import { PERSON_EVENT_TYPE_VALUES, RELATIONSHIP_EVENT_TYPE_VALUES } from '../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface EventData {
  id: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  description: string;
}

interface SourceRow {
  id: string;
  title: string;
}

const props = defineProps<{
  personId?: string;
  relationshipId?: string;
  editingEvent?: EventData | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

useI18n();

const eventTypeValues = props.relationshipId ? RELATIONSHIP_EVENT_TYPE_VALUES : PERSON_EVENT_TYPE_VALUES;

const form = reactive({
  event_type: props.editingEvent?.event_type ?? '',
  date_type: props.editingEvent?.date_type ?? 'exact',
  date_value: props.editingEvent?.date_value ?? '',
  date_value_end: props.editingEvent?.date_value_end ?? '',
  date_original: props.editingEvent?.date_original ?? '',
  place_name: '',
  description: props.editingEvent?.description ?? '',
});

const addSource = ref(false);
const sources = ref<SourceRow[]>([]);
const sourceForm = reactive({
  source_id: '',
  page: '',
});

onMounted(async () => {
  if (!window.api) return;
  sources.value = (await window.api.sources.list()) as SourceRow[];
});

async function save() {
  if (!window.api) return;
  try {
    const data: Record<string, unknown> = {
      event_type: form.event_type,
      date_type: form.date_type,
      date_value: form.date_value || null,
      date_value_end: form.date_type === 'between' ? form.date_value_end || null : null,
      date_original: form.date_original,
      description: form.description,
    };

    if (props.relationshipId) data.relationship_id = props.relationshipId;

    if (props.editingEvent) {
      await window.api.events.update(props.editingEvent.id, data);
    } else {
      const event = (await window.api.events.create(data)) as { id: string };
      if (props.personId && event.id) {
        await window.api.eventParticipants.add({
          event_id: event.id,
          person_id: props.personId,
          role: 'primary',
        });
      }
      if (addSource.value && sourceForm.source_id && event.id) {
        const citData: Record<string, unknown> = {
          source_id: sourceForm.source_id,
          page: sourceForm.page,
          confidence: 2,
        };
        if (event.id) citData.event_id = event.id;
        if (props.personId) citData.person_id = props.personId;
        await window.api.citations.create(citData);
      }
    }
    emit('saved');
    emit('close');
  } catch (err) {
    console.error('[EventForm] save failed:', err);
  }
}
```

- [ ] **Step 2: Add source section to the template**

In `EventForm.vue`'s `<template>`, add the optional source section between the description label and the modal-actions div:

```html
        <!-- Optional source — only on create -->
        <div v-if="!editingEvent" class="source-toggle">
          <label class="checkbox-label">
            <input type="checkbox" v-model="addSource" />
            {{ $t('events.addSourceOptional') }}
          </label>
        </div>
        <template v-if="addSource && !editingEvent">
          <label>
            {{ $t('citations.source') }}
            <select v-model="sourceForm.source_id">
              <option value="" disabled>{{ $t('citations.selectSource') }}</option>
              <option v-for="src in sources" :key="src.id" :value="src.id">{{ src.title }}</option>
            </select>
          </label>
          <label>
            {{ $t('citations.pageLocation') }}
            <input v-model="sourceForm.page" type="text" :placeholder="$t('citations.pagePlaceholder')" />
          </label>
        </template>
```

- [ ] **Step 3: Add style for checkbox label**

In the `<style scoped>` block, add:

```css
.source-toggle {
  border-top: 1px solid #eee;
  padding-top: 8px;
}
.checkbox-label {
  flex-direction: row !important;
  align-items: center;
  gap: 8px !important;
  font-weight: 500 !important;
  cursor: pointer;
}
.checkbox-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
```

- [ ] **Step 4: Verify**

```bash
npm start
```

Add a new event to a person. Confirm:
- "Add Source (optional)" checkbox appears at the bottom
- Checking it reveals source picker + page input
- Saving with a source selected creates both the event and a citation linked to it
- Saving without checking it creates only the event (unsourced badge appears)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/EventForm.vue
git commit -m "feat: add optional inline source citation to EventForm"
```

---

## Task 6: AddRelatedPersonModal component

**Files:**
- Create: `src/renderer/components/AddRelatedPersonModal.vue`

- [ ] **Step 1: Create the component**

Create `src/renderer/components/AddRelatedPersonModal.vue` with the full content:

```vue
<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h3>{{ title }}</h3>
      <form @submit.prevent="save">
        <label>
          {{ $t('persons.givenName') }}
          <input v-model="form.given_name" type="text" required :placeholder="$t('persons.givenName')" />
        </label>

        <label>
          {{ $t('persons.surname') }}
          <input v-model="form.surname" type="text" :placeholder="$t('persons.surname')" />
        </label>

        <label>
          {{ $t('persons.sex') }}
          <select v-model="form.sex">
            <option value="U">{{ $t('persons.sexUnknown') }}</option>
            <option value="M">{{ $t('persons.male') }}</option>
            <option value="F">{{ $t('persons.female') }}</option>
          </select>
        </label>

        <label class="checkbox-label">
          <input type="checkbox" v-model="form.living" />
          {{ $t('persons.living') }}
        </label>

        <label v-if="mode === 'spouse'">
          {{ $t('personDetail.coupleSubtype') }}
          <select v-model="form.subtype">
            <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">
              {{ $t('coupleSubtypes.' + st) }}
            </option>
          </select>
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="$emit('close')">{{ $t('common.cancel') }}</button>
          <button type="submit">{{ $t('personDetail.addAndLink') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { COUPLE_SUBTYPE_VALUES } from '../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  personId: string;
  mode: 'parent' | 'spouse' | 'child';
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const { t } = useI18n();

const title = computed(() => {
  if (props.mode === 'parent') return t('personDetail.addParentTitle');
  if (props.mode === 'spouse') return t('personDetail.addSpouseTitle');
  return t('personDetail.addChildTitle');
});

const form = reactive({
  given_name: '',
  surname: '',
  sex: 'U' as 'M' | 'F' | 'U',
  living: true,
  subtype: 'unknown',
});

async function save() {
  if (!window.api) return;
  try {
    const newPerson = (await window.api.persons.create({
      given_name: form.given_name,
      surname: form.surname,
      sex: form.sex,
      living: form.living,
    })) as { id: string };

    const relData: Record<string, unknown> = {};
    if (props.mode === 'parent') {
      relData.type = 'parent_child';
      relData.person1_id = newPerson.id;  // parent
      relData.person2_id = props.personId; // child
      relData.subtype = 'biological';
    } else if (props.mode === 'child') {
      relData.type = 'parent_child';
      relData.person1_id = props.personId; // parent
      relData.person2_id = newPerson.id;  // child
      relData.subtype = 'biological';
    } else {
      relData.type = 'couple';
      relData.person1_id = props.personId;
      relData.person2_id = newPerson.id;
      relData.subtype = form.subtype;
    }

    await window.api.relationships.create(relData);
    emit('saved');
    emit('close');
  } catch (err) {
    console.error('[AddRelatedPersonModal] save failed:', err);
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.modal h3 {
  margin: 0 0 16px;
}
form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #555;
}
input[type='text'],
select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}
.checkbox-label {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  cursor: pointer;
}
.checkbox-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.modal-actions button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 14px;
}
.modal-actions button[type='submit'] {
  background: #2c3e50;
  color: white;
}
.btn-cancel {
  background: #e0e0e0;
  color: #333;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/AddRelatedPersonModal.vue
git commit -m "feat: add AddRelatedPersonModal component"
```

---

## Task 7: Add Parent/Spouse/Child buttons in PersonDetailView

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`

- [ ] **Step 1: Import AddRelatedPersonModal**

In `PersonDetailView.vue`'s `<script setup>`, add the import:

```typescript
import AddRelatedPersonModal from '../components/AddRelatedPersonModal.vue';
```

- [ ] **Step 2: Add refs for the modal**

After `const showCitePersonForm = ref(false);`, add:

```typescript
const showAddRelated = ref(false);
const addRelatedMode = ref<'parent' | 'spouse' | 'child'>('parent');
```

- [ ] **Step 3: Add buttons to the relationships section header**

Find the Relationships section header in the template:

```html
      <div class="section-header">
        <h4>{{ $t('personDetail.relationships') }}</h4>
      </div>
```

Replace it with:

```html
      <div class="section-header">
        <h4>{{ $t('personDetail.relationships') }}</h4>
        <div class="rel-actions">
          <button class="btn-rel-add" @click="addRelatedMode = 'parent'; showAddRelated = true">{{ $t('personDetail.addParent') }}</button>
          <button class="btn-rel-add" @click="addRelatedMode = 'spouse'; showAddRelated = true">{{ $t('personDetail.addSpouse') }}</button>
          <button class="btn-rel-add" @click="addRelatedMode = 'child'; showAddRelated = true">{{ $t('personDetail.addChild') }}</button>
        </div>
      </div>
```

- [ ] **Step 4: Add the modal at the bottom of the template**

After the existing `<CitationForm>` at the bottom of the template (still inside `v-if="person"`), add:

```html
    <AddRelatedPersonModal
      v-if="showAddRelated"
      :person-id="person.id"
      :mode="addRelatedMode"
      @close="showAddRelated = false"
      @saved="showAddRelated = false; load()"
    />
```

- [ ] **Step 5: Add styles**

In `<style scoped>`, add:

```css
.rel-actions {
  display: flex;
  gap: 6px;
}
.btn-rel-add {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.btn-rel-add:hover {
  background: #e2e8f0;
}
```

- [ ] **Step 6: Verify**

```bash
npm start
```

Open a person detail page. Confirm:
- Three buttons appear in the Relationships section header: "Add Parent", "Add Spouse", "Add Child"
- Each opens AddRelatedPersonModal with the correct title
- "Add Spouse" shows the relationship type dropdown
- Saving creates the new person and links them via a relationship
- The relationships table refreshes and shows the new relationship

- [ ] **Step 7: Commit**

```bash
git add src/renderer/views/PersonDetailView.vue
git commit -m "feat: add Add Parent/Spouse/Child actions to PersonDetailView"
```

---

## Task 8: Run full test suite and update plan

- [ ] **Step 1: Run unit tests**

```bash
npm test
```

Expected: all 37 tests pass. If any fail, fix before continuing.

- [ ] **Step 2: Run E2E tests**

```bash
npx playwright test
```

Expected: both tests pass (app launch + MCP connectivity).

- [ ] **Step 3: Update PLAN.md**

In `docs/PLAN.md`, in the v0.3.0 Evidence Visibility and Add Related Person sections, mark all items as done:

```markdown
#### Evidence Visibility & Citation Affordances
- [x] Events in `EventList` show a citation count badge or "unsourced" warning
- [x] "Cite" action on each event row → opens `CitationForm` pre-linked to that event
- [x] `PersonDetailView` gets a "Cite Person" button
- [x] Relationship views get a "Cite Relationship" button
- [x] `EventForm` includes optional "Source" section on create

#### Add Related Person from Detail View
- [x] Add Parent from PersonDetailView
- [x] Add Spouse/Partner from PersonDetailView
- [x] Add Child from PersonDetailView
```

- [ ] **Step 4: Final commit**

```bash
git add docs/PLAN.md
git commit -m "docs: mark v0.3.0 evidence and add-related-person features complete"
```
