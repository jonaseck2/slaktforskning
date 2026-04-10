# Evidence Model Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove confusing direct-cite buttons from person/relationship/place views, add citation editing in SourceDetailView, add a `mention` event type for intentional person-level sourcing, and fix the Genney importer to create MENTION events instead of direct person citations.

**Architecture:** The `citations` table keeps its `person_id`, `relationship_id`, and `place_id` columns (needed for GEDCOM import roundtrip and Genney compatibility) but these anchors are no longer exposed as user-initiated UI actions. Evidence flows through events. A new `mention` event type provides a semantically precise alternative to vague person-level citations. Citation editing is wired as `updateCitation` in the API → IPC → preload stack, then surfaced via a new `CitationEditModal` component in `SourceDetailView`.

**Tech Stack:** Vue 3 Composition API, TypeScript, node-sqlite3-wasm, Vitest, vue-i18n (sv/en)

**Decisions NOT in this plan (deferred to investigation):**
- GEDCOM importer: whether `INDI.SOUR` → MENTION event (see `docs/plans/2026-04-05-gedcom-citation-roundtrip.md`)
- GEDCOM exporter: whether to derive `FAM.SOUR` from marriage event citations

---

## File Map

| File | Change |
|------|--------|
| `src/renderer/constants/eventTypes.ts` | Add `'mention'` to `EVENT_TYPE_VALUES` |
| `src/renderer/i18n/sv.ts` | Add `eventTypes.mention`, `citations.editTitle` |
| `src/renderer/i18n/en.ts` | Same |
| `src/api/sources.ts` | Add `updateCitation()` |
| `src/main/ipc.ts` | Add `citations:update` handler |
| `src/preload/index.ts` | Add `citations.update` channel |
| `src/renderer/components/CitationEditModal.vue` | New — edit form for citation fields |
| `src/renderer/views/SourceDetailView.vue` | Add edit button + wire CitationEditModal |
| `src/renderer/views/PersonDetailView.vue` | Remove cite button, badge, and related state |
| `src/renderer/views/RelationshipDetailView.vue` | Remove cite button, badge, and related state |
| `src/renderer/views/PlaceDetailView.vue` | Remove cite button, badge, and related state |
| `src/import/genney/transform.ts` | Person citations → MENTION event + event citation |
| `tests/unit/sources.test.ts` | Add `updateCitation` test |
| `tests/unit/genney-transform.test.ts` | New — test person citation → MENTION conversion |

---

### Task 1: Add `mention` event type

**Files:**
- Modify: `src/renderer/constants/eventTypes.ts`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`
- Test: `tests/unit/events.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/events.test.ts`:
```typescript
it('creates a mention event', () => {
  const ev = createEvent(db, { event_type: 'mention', date_type: 'unknown' });
  expect(ev.event_type).toBe('mention');
  expect(getEvent(db, ev.id)?.event_type).toBe('mention');
});
```

- [ ] **Step 2: Run test — it passes already (no validation on event_type in API)**

```bash
npm test -- --reporter=verbose tests/unit/events.test.ts
```

The API doesn't validate event_type values, so this passes immediately. The test exists to document intent and prevent regression.

- [ ] **Step 3: Add `mention` to eventTypes.ts**

In `src/renderer/constants/eventTypes.ts`, add `'mention'` before `'other'`:

```typescript
export const EVENT_TYPE_VALUES = [
  'birth', 'death', 'marriage', 'divorce', 'christening', 'burial',
  'baptism', 'confirmation', 'ordination', 'census', 'immigration',
  'emigration', 'naturalization', 'occupation', 'residence', 'education',
  'graduation', 'military', 'retirement', 'will', 'probate', 'mention', 'other',
] as const;
```

`PERSON_EVENT_TYPE_VALUES` filters out only `'marriage'` and `'divorce'`, so `'mention'` is automatically included. `RELATIONSHIP_EVENT_TYPE_VALUES` excludes it (it's not in the explicit list), which is correct — you don't cite a relationship with a MENTION, you cite its event.

- [ ] **Step 4: Add i18n labels**

In `src/renderer/i18n/sv.ts`, inside `eventTypes: { ... }`, add after `probate`:
```typescript
    mention: 'Omnämning',
```

In `src/renderer/i18n/en.ts`, inside `eventTypes: { ... }`, add after `probate`:
```typescript
    mention: 'Mention',
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all existing tests pass, the new events test passes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add mention event type for intentional person-level sourcing"
```

---

### Task 2: Add `updateCitation` API + IPC + preload

**Files:**
- Modify: `src/api/sources.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/unit/sources.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/sources.test.ts` (after the existing citation tests, import `updateCitation` at the top of the file):

```typescript
// Add to imports at top of file:
import {
  /* existing imports */
  updateCitation,
} from '../../src/api/sources';

// Add test:
it('updateCitation updates editable fields', () => {
  const source = createSource(db, { title: 'Test', source_type: 'other' });
  const event = createEvent(db, { event_type: 'birth', date_type: 'unknown' });
  const cit = createCitation(db, { source_id: source.id, event_id: event.id });

  const updated = updateCitation(db, cit.id, {
    page: 'p. 42',
    confidence: 3,
    transcription: 'Verbatim text from source',
  });

  expect(updated?.page).toBe('p. 42');
  expect(updated?.confidence).toBe(3);
  expect(updated?.transcription).toBe('Verbatim text from source');
  // Fields not in updates are unchanged
  expect(updated?.notes).toBe(cit.notes);
});

it('updateCitation with empty updates returns citation unchanged', () => {
  const source = createSource(db, { title: 'Test', source_type: 'other' });
  const cit = createCitation(db, { source_id: source.id, page: 'p. 1' });
  const result = updateCitation(db, cit.id, {});
  expect(result?.page).toBe('p. 1');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/sources.test.ts
```

Expected: FAIL with "updateCitation is not a function" (import error).

- [ ] **Step 3: Add `updateCitation` to `src/api/sources.ts`**

Add after the `deleteCitation` function:

```typescript
export function updateCitation(
  db: Database,
  id: string,
  updates: Partial<Pick<Citation, 'page' | 'confidence' | 'transcription' | 'notes' | 'date_accessed'>>
): Citation | null {
  const allowed = ['page', 'confidence', 'transcription', 'notes', 'date_accessed'] as const;
  const fields = allowed.filter(k => k in updates);
  if (fields.length === 0) return getCitation(db, id);
  const setClauses = fields.map(f => `${f} = ?`).join(', ');
  const vals = fields.map(f => (updates as Record<string, unknown>)[f]);
  db.run(`UPDATE citations SET ${setClauses} WHERE id = ?`, [...vals, id]);
  return getCitation(db, id);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/unit/sources.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add IPC handler in `src/main/ipc.ts`**

In the Citations section (after line 96, `citations:delete`), add:

```typescript
wrapHandler('citations:update', (id, updates) =>
  sources.updateCitation(getDatabase(), id as string, updates as Parameters<typeof sources.updateCitation>[2])
);
```

- [ ] **Step 6: Add preload channel in `src/preload/index.ts`**

In the `citations` object (after `delete:`), add:

```typescript
    update: (id: string, updates: Record<string, unknown>) => ipcRenderer.invoke('citations:update', id, updates),
```

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add updateCitation API, IPC handler, and preload channel"
```

---

### Task 3: CitationEditModal + SourceDetailView wiring

**Files:**
- Create: `src/renderer/components/CitationEditModal.vue`
- Modify: `src/renderer/views/SourceDetailView.vue`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

No unit tests for Vue components — verify manually by launching the app and editing a citation.

- [ ] **Step 1: Add i18n key**

In `src/renderer/i18n/sv.ts`, inside `citations: { ... }`, add:
```typescript
    editTitle: 'Redigera hänvisning',
```

In `src/renderer/i18n/en.ts`, inside `citations: { ... }`, add:
```typescript
    editTitle: 'Edit citation',
```

- [ ] **Step 2: Create `src/renderer/components/CitationEditModal.vue`**

```vue
<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h3>{{ $t('citations.editTitle') }}</h3>
      <form @submit.prevent="save">
        <label>
          {{ $t('citations.pageLocation') }}
          <input v-model="form.page" type="text" :placeholder="$t('citations.pagePlaceholder')" />
        </label>
        <label>
          {{ $t('citations.confidence') }}
          <select v-model.number="form.confidence">
            <option v-for="c in CONFIDENCE_LEVEL_VALUES" :key="c" :value="c">
              {{ $t('confidenceLevels.' + c) }}
            </option>
          </select>
        </label>
        <label>
          {{ $t('citations.transcription') }}
          <textarea v-model="form.transcription" rows="3" :placeholder="$t('citations.transcriptionPlaceholder')" />
        </label>
        <label>
          {{ $t('citations.notes') }}
          <textarea v-model="form.notes" rows="2" :placeholder="$t('citations.notesPlaceholder')" />
        </label>
        <label>
          {{ $t('citations.dateAccessed') }}
          <input v-model="form.date_accessed" type="date" />
        </label>
        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="$emit('close')">{{ $t('common.cancel') }}</button>
          <button type="submit">{{ $t('common.save') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted, onUnmounted } from 'vue';
import { CONFIDENCE_LEVEL_VALUES } from '../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  citation: {
    id: string;
    page: string;
    confidence: number;
    transcription: string;
    notes: string;
    date_accessed: string;
  };
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>();

const form = reactive({
  page: props.citation.page || '',
  confidence: props.citation.confidence ?? 2,
  transcription: props.citation.transcription || '',
  notes: props.citation.notes || '',
  date_accessed: props.citation.date_accessed || '',
});

async function save() {
  await window.api.citations.update(props.citation.id, { ...form });
  emit('saved');
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 480px;
  max-width: 95vw;
}
.modal h3 {
  margin: 0 0 16px;
  font-size: 16px;
}
.modal label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #555;
  margin-bottom: 12px;
}
.modal input, .modal select, .modal textarea {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}
.modal textarea { resize: vertical; }
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.btn-cancel {
  background: none;
  border: 1px solid #ccc;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
}
button[type="submit"] {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
}
</style>
```

- [ ] **Step 3: Wire CitationEditModal into SourceDetailView**

In `src/renderer/views/SourceDetailView.vue`:

**Add import** at the top of `<script setup>`:
```typescript
import CitationEditModal from '../components/CitationEditModal.vue';
```

**Add ref** after `const showCitationForm = ref(false);`:
```typescript
const editingCitation = ref<CitationRow | null>(null);
```

**Add edit button** in the citation table row (after the delete button):
```html
<button class="btn-sm btn-edit" @click="editingCitation = cit">{{ $t('common.edit') }}</button>
```

The `<td>` with actions should become:
```html
<td>
  <button class="btn-sm btn-edit" @click="editingCitation = cit">{{ $t('common.edit') }}</button>
  <button class="btn-sm btn-delete" @click="removeCitation(cit.id)">{{ $t('common.delete') }}</button>
</td>
```

**Add modal** after the existing `<CitationForm>` block (before the closing `</div>`):
```html
<CitationEditModal
  v-if="editingCitation"
  :citation="editingCitation"
  @close="editingCitation = null"
  @saved="editingCitation = null; load()"
/>
```

**Add button style** in `<style scoped>`:
```css
.btn-edit {
  background: #e8f4fd;
  color: #1565c0;
  margin-right: 4px;
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all passing (no unit tests for this component — verify manually).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add CitationEditModal and wire into SourceDetailView"
```

---

### Task 4: Remove direct cite buttons from entity detail views

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`
- Modify: `src/renderer/views/RelationshipDetailView.vue`
- Modify: `src/renderer/views/PlaceDetailView.vue`

No unit tests. The existing test suite verifies no regressions.

- [ ] **Step 1: PersonDetailView — remove cite button, badge, state, and IPC call**

Open `src/renderer/views/PersonDetailView.vue`.

**In the template**, remove these two elements from the `<div class="header-info">` section:
```html
<CitationBadge :count="personCitationCount" />
<button type="button" class="btn-cite-header" @click="showCitePersonForm = true">{{ $t('personDetail.citePersonTitle') }}</button>
```

**In the template**, find and remove the CitationForm block at the bottom:
```html
<CitationForm
  v-if="showCitePersonForm"
  :person-id="person.id"
  @close="showCitePersonForm = false"
  @saved="showCitePersonForm = false; load()"
/>
```

**In `<script setup>`**, remove these two ref declarations (around line 412):
```typescript
const showCitePersonForm = ref(false);
const personCitationCount = ref(0);
```

**In the Escape key handler** (the `handleKeydown` function), remove:
```typescript
showCitePersonForm.value = false;
```

**In the `load()` function**, remove the person citation count block:
```typescript
// Person-level citation count
const personCits = (await window.api.citations.forPerson(personId)) as unknown[];
personCitationCount.value = personCits.length;
```

**Check imports**: if `CitationForm` is no longer used anywhere else in this file after removing the block above, remove it from the import line. If it is still used (e.g. for a different purpose), keep it.

- [ ] **Step 2: RelationshipDetailView — remove cite button, badge, state, and IPC call**

Open `src/renderer/views/RelationshipDetailView.vue`.

**In the template**, remove from `<div class="header-row">`:
```html
<CitationBadge :count="relCitationCount" />
<button type="button" class="btn-cite-header" @click="showCiteForm = true">{{ $t('relationshipDetail.citeRelationship') }}</button>
```

**In the template**, remove the CitationForm at the bottom:
```html
<CitationForm
  v-if="showCiteForm && relationship"
  :relationship-id="relationship.id"
  @close="showCiteForm = false"
  @saved="showCiteForm = false; load()"
/>
```

**In `<script setup>`**, remove:
```typescript
const showCiteForm = ref(false);
const relCitationCount = ref(0);
```

**In the `load()` function**, remove:
```typescript
const relCits = (await window.api.citations.forRelationship(relId)) as unknown[];
relCitationCount.value = relCits.length;
```

**Check imports**: remove `CitationForm` and `CitationBadge` from imports if no longer used.

- [ ] **Step 3: PlaceDetailView — remove cite button, badge, state, and IPC call**

Open `src/renderer/views/PlaceDetailView.vue`.

**In the template**, remove from the header:
```html
<CitationBadge :count="placeCitationCount" />
<button type="button" class="btn-cite-header" @click="showCiteForm = true">{{ $t('places.citeSources') }}</button>
```

**In the template**, remove the CitationForm at the bottom:
```html
<CitationForm
  v-if="showCiteForm"
  :place-id="place.id"
  @close="showCiteForm = false"
  @saved="showCiteForm = false; load()"
/>
```

**In `<script setup>`**, remove:
```typescript
const placeCitationCount = ref(0);
const showCiteForm = ref(false);
```

**In the `load()` function**, remove:
```typescript
const placeCits = (await window.api.citations.forPlace(placeId)) as unknown[];
placeCitationCount.value = placeCits.length;
```

**Check imports**: remove `CitationForm` and `CitationBadge` from imports if no longer used.

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove direct cite buttons from person, relationship, and place views"
```

---

### Task 5: Fix Genney import — person citations → MENTION events

**Files:**
- Modify: `src/import/genney/transform.ts`
- Create: `tests/unit/genney-transform.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/genney-transform.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import { createTestDb } from './helpers';
import { transformGenney, GenneyTables } from '../../src/import/genney/transform';

const emptyTables: GenneyTables = {
  PERSON: [], FAMILY: [], COUPLE_FAMILY: [], SPOUSE_FAMILY: [],
  EVENT: [], EVENT_PLACE: [], OWNER_EVENT: [], SPLACE: [],
  SOURCE: [], CITATION: [], CITATION_SOURCE: [], OWNER_CITATION: [],
  REMARK: [], REPO: [], SOURCE_REPO: [], GROUPS: [], GROUP_MEMBER: [],
  MEDIA: [], OWNER_MEDIA: [], TODO: [],
};

let db: Database;
beforeEach(() => { db = createTestDb(); });

describe('transformGenney — person citations', () => {
  it('converts a person-owned citation to a MENTION event + event citation', () => {
    const tables: GenneyTables = {
      ...emptyTables,
      PERSON: [{ RID: 'I1', GIVENNAME: 'Erik', SURNAME: 'Svensson' }],
      SOURCE: [{ RID: 'S1', TITLE: 'Household Examination 1780' }],
      CITATION: [{ RID: 'C1', WHEREINTEXT: 'p. 12', CERTAINTY: 2 }],
      CITATION_SOURCE: [{ CITATION: 'C1', SOURCE: 'S1' }],
      OWNER_CITATION: [{ OWNER: 'I1', CITATION: 'C1' }],
    };

    const summary = transformGenney(db, tables);

    // One MENTION event created
    const events = db.all('SELECT * FROM events WHERE event_type = ?', ['mention']) as Array<{ id: string }>;
    expect(events).toHaveLength(1);

    // An event_participant links the person to the MENTION event
    const participants = db.all(
      'SELECT ep.* FROM event_participants ep WHERE ep.event_id = ?',
      [events[0].id]
    ) as Array<{ role: string }>;
    expect(participants).toHaveLength(1);
    expect(participants[0].role).toBe('primary');

    // The citation is attached to the event, not the person
    const citations = db.all('SELECT * FROM citations', []) as Array<{
      event_id: string | null;
      person_id: string | null;
    }>;
    expect(citations).toHaveLength(1);
    expect(citations[0].person_id).toBeNull();
    expect(citations[0].event_id).toBe(events[0].id);

    // Summary counts correctly
    expect(summary.citations).toBe(1);
    expect(summary.events).toBe(1);
  });

  it('leaves event-owned citations as event citations (no MENTION created)', () => {
    const tables: GenneyTables = {
      ...emptyTables,
      PERSON: [{ RID: 'I1', GIVENNAME: 'Erik', SURNAME: 'Svensson' }],
      EVENT: [{ RID: 'E1', TYPE: 'BIRT', DATE: '1 JAN 1850', OWNER: 'I1' }],
      OWNER_EVENT: [{ OWNER: 'I1', EVENT: 'E1' }],
      SOURCE: [{ RID: 'S1', TITLE: 'Birth Register' }],
      CITATION: [{ RID: 'C1', CERTAINTY: 3 }],
      CITATION_SOURCE: [{ CITATION: 'C1', SOURCE: 'S1' }],
      OWNER_CITATION: [{ OWNER: 'E1', CITATION: 'C1' }],
    };

    transformGenney(db, tables);

    // No MENTION events
    const mentions = db.all('SELECT * FROM events WHERE event_type = ?', ['mention']) as unknown[];
    expect(mentions).toHaveLength(0);

    // Citation is on the birth event
    const citations = db.all('SELECT * FROM citations', []) as Array<{
      event_id: string | null;
      person_id: string | null;
    }>;
    expect(citations).toHaveLength(1);
    expect(citations[0].person_id).toBeNull();
    expect(citations[0].event_id).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/genney-transform.test.ts
```

Expected: FAIL — person citation test fails because person_id is still set.

- [ ] **Step 3: Update the citation loop in `src/import/genney/transform.ts`**

Find the citation-processing loop (around line 604). The current code:

```typescript
for (const owner of owners) {
  const event_id = owner.startsWith('E') ? eventMap.get(owner) ?? null : null;
  const person_id = owner.startsWith('I') ? personMap.get(owner) ?? null : null;
  const relationship_id = owner.startsWith('F') ? familyMap.get(owner) ?? null : null;

  stmts.insertCitation.run([
    crypto.randomUUID(), source_id, event_id, person_id, relationship_id,
    cit.WHEREINTEXT ?? '', mapConfidence(cit.CERTAINTY),
    cit.TEXT ?? '', cit.NOTE ?? '', cit.DATE ?? '',
  ]);
  summary.citations++;
}
```

Replace with:

```typescript
for (const owner of owners) {
  let event_id: string | null = null;
  const relationship_id = owner.startsWith('F') ? familyMap.get(owner) ?? null : null;

  if (owner.startsWith('E')) {
    event_id = eventMap.get(owner) ?? null;
  } else if (owner.startsWith('I')) {
    // Person-level citations become MENTION events so all evidence flows through events.
    // The person_id citation anchor is intentionally not used here.
    const person_id = personMap.get(owner);
    if (person_id) {
      const mentionId = crypto.randomUUID();
      stmts.insertEvent.run([mentionId, 'mention', null, 'unknown', null, null, null, null, null, null, null]);
      stmts.insertParticipant.run([crypto.randomUUID(), mentionId, person_id, 'primary']);
      event_id = mentionId;
      summary.events++;
    }
  }

  stmts.insertCitation.run([
    crypto.randomUUID(), source_id, event_id, null, relationship_id,
    cit.WHEREINTEXT ?? '', mapConfidence(cit.CERTAINTY),
    cit.TEXT ?? '', cit.NOTE ?? '', cit.DATE ?? '',
  ]);
  summary.citations++;
}
```

Note: `stmts.insertEvent` parameters match the prepared statement at line 340:
`(id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, place_address, cause, description)`

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/unit/genney-transform.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(genney): convert person-level citations to MENTION events"
```

---

### Final step: bump version and sync docs

- [ ] **Step 1: Bump version in `package.json`**

This is a new feature (MENTION event type, citation editing) → minor bump. Read current version from `package.json`, increment the minor segment, reset patch to 0.

- [ ] **Step 2: Update `CLAUDE.md`**

Add `mention` to the list of event types in the MCP Server section and the domain types section.

- [ ] **Step 3: Run final tests**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: bump version, sync docs after evidence model simplification"
```
