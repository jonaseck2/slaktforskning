# Add Person from Place Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "+ Person" button to the PlacePanel that opens the Add-Person modal with the place pre-filled, and replace the bespoke inline birth panel with a reused event form that defaults its event type using a configurable ladder (birth → death → occupation → residence).

**Architecture:**
- Extract the body of `EventForm.vue` into `EventFormBody.vue` (v-model controlled, no submit) so it can be embedded inline in other modals.
- Add a server-side transactional workflow `createPersonWithEventWorkflow(db, args)` so person + event + event_participant + citation commit atomically or roll back.
- Add a pure ladder util `suggestNextEventType(existingTypes, enabled)` and a per-database toggle (`event_defaults_config`) exposed in a new Settings → "Defaults" tab.
- Rewire `AddPersonModal.vue` and `AddRelatedPersonModal.vue` to use `EventFormBody.vue` + the new workflow. Add a "+ Person" entry point on `PlacePanel.vue` that pre-fills the place.

**Tech Stack:** TypeScript, Vue 3 (Composition API, `<script setup>`), node-sqlite3-wasm, Vitest.

**Conventions to follow (from CLAUDE.md):**
- `src/api/` has zero Electron imports; everything takes `db: Database` as its first argument.
- SQLite via node-sqlite3-wasm: parameter binding is `stmt.run([a, b])` (array), `db.get()` returns `undefined` not `null`, and there is no `.pragma()` — use `db.exec()`.
- UUIDs (v4) for all PKs (`import { v4 as uuid } from 'uuid'`).
- Transactions: `db.exec('BEGIN')` / `db.exec('COMMIT')` / `db.exec('ROLLBACK')` — see `src/mcp/tools/prod/persons.ts` `createPersonWorkflow` for the pattern.
- **Never hardcode colors** — use tokens from `tokens.css`.
- Shared CSS classes (`.modal-actions`, `.btn-add`, `.data-table`, etc.) live in `shared.css` — don't redefine in scoped blocks.
- All create/edit UI uses `<BaseModal>`.
- After the feature is done and tested, version bumps minor (see CLAUDE.md "Version bumps only when work is complete"). Intermediate commits do NOT bump version.

---

## File Structure

**New files:**
- `src/api/persons_workflows.ts` — `createPersonWithEventWorkflow(db, args)` transactional workflow.
- `src/renderer/utils/eventDefaults.ts` — pure `suggestNextEventType()` ladder util.
- `src/renderer/components/EventFormBody.vue` — controlled event-form body (no modal chrome, no submit).
- `src/renderer/views/DefaultsView.vue` — new Settings tab content: smart event-type toggle.
- `tests/unit/eventDefaults.test.ts` — unit tests for the ladder.
- `tests/unit/persons-workflows.test.ts` — unit tests for the transactional workflow.

**Modified files:**
- `src/renderer/components/EventForm.vue` — delegates rendering to `EventFormBody.vue`, keeps submission logic.
- `src/renderer/components/AddPersonModal.vue` — adds collapsible event section using `EventFormBody.vue`; submits via new workflow.
- `src/renderer/components/AddRelatedPersonModal.vue` — replaces `<details class="birth-section">` with `EventFormBody.vue`; submits via new workflow.
- `src/renderer/components/PlacePanel.vue` — adds "+ Person" action on the Persons section, pre-fills place.
- `src/renderer/views/PersonsView.vue` — reload after the modal saves (already does, verify).
- `src/renderer/views/SettingsView.vue` — add `defaults` tab.
- `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts` — new keys under `settings.tabs.defaults`, `defaults.*`, `placePanel.addPerson`, `addPerson.eventSection`.
- `src/main/ipc/persons.ts` — new `persons:createWithEvent` handler.
- `src/preload/index.ts` — new `window.api.persons.createWithEvent(...)`.
- `src/api/undo_wrappers.ts` — new `createPersonWithEventUndo` wrapper.
- `CLAUDE.md` — document the new workflow, the setting key, and the updated AddPersonModal signature.
- `package.json` — bump minor version at the end (feature complete).
- `docs/PLAN.md` — mark this milestone done, point to archived plan.

---

## Design Decisions

**1. Event-type ladder.** Only person-scoped event types (marriage/divorce/wedding are relationship events and excluded from `PERSON_EVENT_TYPE_VALUES`).

Ladder (terminal is `residence`):
```
birth → death → occupation → residence (stays at residence)
```

**2. Setting.**
- Key: `event_defaults_config`
- Value: JSON string `{ smartDefaults: boolean }` (default `{ smartDefaults: true }`)
- Location: Settings → "Defaults" tab → "Suggest event type based on existing events" toggle.
- When `smartDefaults: false`: `suggestNextEventType` always returns `'birth'`.

**3. Atomicity.** The new IPC channel `persons:createWithEvent` runs the workflow inside a single SQLite transaction. If any step fails, nothing is committed. If the caller also needs a relationship (AddRelatedPersonModal), the relationship is created as a separate follow-up call — same as today.

**4. EventFormBody split.** `EventForm.vue` owns:
- `<BaseModal>` chrome
- "Save and another" + "Cancel"  + "Update/Add" buttons
- Existing citations list (when editing)
- Submission to `window.api.events.*`

`EventFormBody.vue` owns:
- Event type `<select>` (with common/other optgroups, filtered by context prop)
- `DateInput` (with v-model bindings)
- `PlacePicker`
- Description textarea
- Cause input (conditional on event type)
- Source picker + page input

`EventFormBody.vue` emits `update:event` and `update:source` (two `defineModel`s). It never calls `window.api` — the caller decides when/how to persist.

---

### Task 1: Add the event-defaults ladder utility (TDD)

**Files:**
- Create: `src/renderer/utils/eventDefaults.ts`
- Test: `tests/unit/eventDefaults.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/eventDefaults.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { suggestNextEventType, DEFAULT_EVENT_LADDER } from '../../src/renderer/utils/eventDefaults';

describe('suggestNextEventType', () => {
  it('returns birth when no events and smart defaults enabled', () => {
    expect(suggestNextEventType([], true)).toBe('birth');
  });

  it('returns birth when smart defaults disabled, regardless of existing events', () => {
    expect(suggestNextEventType([], false)).toBe('birth');
    expect(suggestNextEventType(['birth'], false)).toBe('birth');
    expect(suggestNextEventType(['birth', 'death', 'occupation', 'residence'], false)).toBe('birth');
  });

  it('walks the ladder birth → death → occupation → residence', () => {
    expect(suggestNextEventType(['birth'], true)).toBe('death');
    expect(suggestNextEventType(['birth', 'death'], true)).toBe('occupation');
    expect(suggestNextEventType(['birth', 'death', 'occupation'], true)).toBe('residence');
  });

  it('residence is terminal — stays at residence when all ladder types exist', () => {
    expect(suggestNextEventType(['birth', 'death', 'occupation', 'residence'], true)).toBe('residence');
  });

  it('ignores off-ladder events and returns first missing ladder type', () => {
    // has occupation but not birth → birth is still missing first
    expect(suggestNextEventType(['occupation', 'baptism'], true)).toBe('birth');
  });

  it('returns residence when all ladder types present even with extras', () => {
    expect(suggestNextEventType(['birth', 'death', 'occupation', 'residence', 'baptism'], true))
      .toBe('residence');
  });

  it('exports the ladder as a readonly array', () => {
    expect(DEFAULT_EVENT_LADDER).toEqual(['birth', 'death', 'occupation', 'residence']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/eventDefaults.test.ts
```
Expected: FAIL with "Cannot find module '../../src/renderer/utils/eventDefaults'".

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/utils/eventDefaults.ts`:

```ts
import type { EventTypeValue } from '../constants/eventTypes';

export const DEFAULT_EVENT_LADDER: readonly EventTypeValue[] = [
  'birth', 'death', 'occupation', 'residence',
] as const;

export function suggestNextEventType(
  existingEventTypes: readonly string[],
  smartDefaultsEnabled: boolean,
): EventTypeValue {
  if (!smartDefaultsEnabled) return 'birth';
  const existing = new Set(existingEventTypes);
  for (const t of DEFAULT_EVENT_LADDER) {
    if (!existing.has(t)) return t;
  }
  return 'residence';
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/eventDefaults.test.ts
```
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/utils/eventDefaults.ts tests/unit/eventDefaults.test.ts
git commit -m "feat(events): add suggestNextEventType ladder util"
```

---

### Task 2: Transactional createPersonWithEvent workflow (TDD)

**Files:**
- Create: `src/api/persons_workflows.ts`
- Test: `tests/unit/persons-workflows.test.ts`

Follow the pattern from `src/mcp/tools/prod/persons.ts:_createPersonCore` / `createPersonWorkflow` — core function without transaction + public wrapper with BEGIN/COMMIT/ROLLBACK. We put it in `src/api/` so both the IPC handler and any future MCP tool can share it.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/persons-workflows.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createPersonWithEventWorkflow } from '../../src/api/persons_workflows';
import * as persons from '../../src/api/persons';
import * as events from '../../src/api/events';
import * as places from '../../src/api/places';
import * as sources from '../../src/api/sources';
import { createTestDb } from './helpers';
import type { Database } from 'node-sqlite3-wasm';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('createPersonWithEventWorkflow', () => {
  it('creates a person-only record when no event fields are provided', () => {
    const result = createPersonWithEventWorkflow(db, {
      given_name: 'Anna',
      surname: 'Lindström',
      sex: 'F',
    });
    expect(result.person.id).toBeTruthy();
    expect(result.event).toBeNull();
    expect(result.citation).toBeNull();
    expect(events.getEventsForPerson(db, result.person.id)).toHaveLength(0);
  });

  it('creates person + birth event + event_participant + place', () => {
    const result = createPersonWithEventWorkflow(db, {
      given_name: 'Erik',
      surname: 'Svensson',
      sex: 'M',
      event: {
        event_type: 'birth',
        date_type: 'exact',
        date_value: '1850-03-12',
        date_original: '12 Mar 1850',
        place_id: null,
        place_name: 'Stockholm',
        description: '',
        cause: null,
      },
    });
    expect(result.event).not.toBeNull();
    expect(result.event!.event_type).toBe('birth');
    expect(result.event!.place_id).toBeTruthy();

    const personEvents = events.getEventsForPerson(db, result.person.id);
    expect(personEvents).toHaveLength(1);
    expect(personEvents[0].id).toBe(result.event!.id);

    const place = places.getPlace(db, result.event!.place_id!);
    expect(place?.name).toBe('Stockholm');
  });

  it('uses an existing place_id instead of creating one', () => {
    const stockholm = places.createPlace(db, { name: 'Stockholm' });
    const result = createPersonWithEventWorkflow(db, {
      given_name: 'Erik',
      surname: 'Svensson',
      event: {
        event_type: 'birth',
        date_type: 'exact',
        date_value: '1850',
        date_original: '1850',
        place_id: stockholm.id,
        place_name: null,
        description: '',
        cause: null,
      },
    });
    expect(result.event!.place_id).toBe(stockholm.id);
  });

  it('creates a citation when source is provided', () => {
    const src = sources.createSource(db, { title: 'Husförhörslängd 1850' });
    const result = createPersonWithEventWorkflow(db, {
      given_name: 'Erik',
      surname: 'Svensson',
      event: {
        event_type: 'birth',
        date_type: 'exact',
        date_value: '1850',
        date_original: '1850',
        place_id: null,
        place_name: null,
        description: '',
        cause: null,
      },
      citation: { source_id: src.id, page: '42' },
    });
    expect(result.citation).not.toBeNull();
    expect(result.citation!.source_id).toBe(src.id);
    expect(result.citation!.event_id).toBe(result.event!.id);
    expect(result.citation!.page).toBe('42');
  });

  it('rolls back on failure — person is not created when event creation throws', () => {
    // Provide an invalid event_type through a type-cast to force a DB constraint failure.
    // If the event insert fails, the transaction must roll back — no person should exist.
    const beforeCount = persons.listPersons(db).length;
    expect(() => {
      createPersonWithEventWorkflow(db, {
        given_name: 'Erik',
        surname: 'Svensson',
        event: {
          // cause an FK violation by pointing to a non-existent place_id
          event_type: 'birth',
          date_type: 'exact',
          date_value: '1850',
          date_original: '1850',
          place_id: 'nonexistent-place-id',
          place_name: null,
          description: '',
          cause: null,
        },
      });
    }).toThrow();
    const afterCount = persons.listPersons(db).length;
    expect(afterCount).toBe(beforeCount);
  });

  it('creates a person with only event_type (no date, no place)', () => {
    const result = createPersonWithEventWorkflow(db, {
      given_name: 'Maria',
      surname: 'Olsson',
      event: {
        event_type: 'residence',
        date_type: 'unknown',
        date_value: null,
        date_original: '',
        place_id: null,
        place_name: null,
        description: '',
        cause: null,
      },
    });
    expect(result.event).not.toBeNull();
    expect(result.event!.event_type).toBe('residence');
    expect(result.event!.place_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/persons-workflows.test.ts
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the workflow**

Create `src/api/persons_workflows.ts`:

```ts
import type { Database } from 'node-sqlite3-wasm';
import * as personApi from './persons';
import * as eventApi from './events';
import * as relationshipApi from './relationships';
import * as placeApi from './places';
import * as sourceApi from './sources';
import type { Citation, GenealogyEvent, Person } from './types';

export interface PersonEventInput {
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end?: string | null;
  date_original: string;
  place_id: string | null;
  /** If place_id is null and place_name is provided, findOrCreatePlace is called. */
  place_name?: string | null;
  description: string;
  cause: string | null;
}

export interface CreatePersonWithEventArgs {
  given_name?: string;
  surname?: string;
  sex?: Person['sex'];
  living?: boolean;
  notes?: string;
  event?: PersonEventInput;
  citation?: { source_id: string; page?: string };
}

export interface CreatePersonWithEventResult {
  person: Person;
  event: GenealogyEvent | null;
  citation: Citation | null;
}

function _core(db: Database, args: CreatePersonWithEventArgs): CreatePersonWithEventResult {
  const person = personApi.createPerson(db, {
    given_name: args.given_name,
    surname: args.surname,
    sex: args.sex,
    living: args.living,
    notes: args.notes,
  });

  let event: GenealogyEvent | null = null;
  let citation: Citation | null = null;

  if (args.event) {
    let place_id: string | null = args.event.place_id;
    if (!place_id && args.event.place_name && args.event.place_name.trim()) {
      const place = placeApi.findOrCreatePlace(db, args.event.place_name.trim());
      place_id = place.id;
    }

    event = eventApi.createEvent(db, {
      event_type: args.event.event_type,
      date_type: args.event.date_type as GenealogyEvent['date_type'],
      date_value: args.event.date_value,
      date_value_end: args.event.date_value_end ?? null,
      date_original: args.event.date_original,
      place_id,
      description: args.event.description,
      cause: args.event.cause,
    });

    relationshipApi.addEventParticipant(db, {
      event_id: event.id,
      person_id: person.id,
      role: 'primary',
    });

    if (args.citation) {
      citation = sourceApi.createCitation(db, {
        source_id: args.citation.source_id,
        event_id: event.id,
        person_id: person.id,
        page: args.citation.page ?? '',
        confidence: 2,
      });
    }
  }

  return { person, event, citation };
}

export function createPersonWithEventWorkflow(
  db: Database,
  args: CreatePersonWithEventArgs,
): CreatePersonWithEventResult {
  db.exec('BEGIN');
  try {
    const result = _core(db, args);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
```

**Note on API signatures:** verify each call against the actual modules before pasting — field names must match. For reference:
- `personApi.createPerson(db, { given_name, surname, sex, living, notes })` → `src/api/persons.ts`.
- `eventApi.createEvent(db, { event_type, date_type, date_value, date_value_end, date_original, place_id, description, cause, relationship_id? })` → `src/api/events.ts`.
- `relationshipApi.addEventParticipant(db, { event_id, person_id, role })` → `src/api/relationships.ts`.
- `placeApi.findOrCreatePlace(db, name)` → `src/api/places.ts`.
- `sourceApi.createCitation(db, { source_id, event_id?, person_id?, page?, confidence? })` → `src/api/sources.ts`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/persons-workflows.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/persons_workflows.ts tests/unit/persons-workflows.test.ts
git commit -m "feat(persons): add transactional createPersonWithEvent workflow"
```

---

### Task 3: Undo wrapper + IPC + preload for the new workflow

**Files:**
- Modify: `src/api/undo_wrappers.ts`
- Modify: `src/main/ipc/persons.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add the undo wrapper**

Open `src/api/undo_wrappers.ts`. After the existing `createPersonUndo` function, add:

```ts
import { createPersonWithEventWorkflow } from './persons_workflows';
import type { CreatePersonWithEventArgs, CreatePersonWithEventResult } from './persons_workflows';
import * as eventApi from './events';
import * as sourceApi from './sources';

// ... existing code ...

export function createPersonWithEventUndo(
  db: Database,
  args: CreatePersonWithEventArgs,
): CreatePersonWithEventResult {
  const result = createPersonWithEventWorkflow(db, args);
  const personId = result.person.id;
  const eventId = result.event?.id ?? null;
  const citationId = result.citation?.id ?? null;
  const snapshot = JSON.parse(JSON.stringify(args));

  undoManager.push({
    label: 'undo.createPersonWithEvent',
    undo: () => {
      // Delete in reverse dependency order
      if (citationId) sourceApi.deleteCitation(db, citationId);
      if (eventId) eventApi.deleteEvent(db, eventId);
      persons.deletePerson(db, personId);
    },
    redo: () => {
      createPersonWithEventWorkflow(db, snapshot);
    },
  });

  return result;
}
```

- [ ] **Step 2: Register the IPC handler**

Modify `src/main/ipc/persons.ts` — add after the existing `persons:create` handler:

```ts
wrapHandler('persons:createWithEvent', (data) =>
  uw.createPersonWithEventUndo(getDb(), data as Parameters<typeof uw.createPersonWithEventUndo>[1])
);
```

- [ ] **Step 3: Expose on window.api**

Modify `src/preload/index.ts` — inside the `persons:` block, add after `create`:

```ts
createWithEvent: mutating((data: Record<string, unknown>) => ipcRenderer.invoke('persons:createWithEvent', data)),
```

- [ ] **Step 4: Smoke-test manually**

There is no automated IPC test today. Verify wiring by starting the app and running a sanity check in DevTools:

```bash
npm start
```

In the DevTools console of the app window:
```js
await window.api.persons.createWithEvent({
  given_name: 'Smoke',
  surname: 'Test',
  sex: 'U',
  event: {
    event_type: 'birth',
    date_type: 'exact',
    date_value: '1900-01-01',
    date_original: '1900',
    place_id: null,
    place_name: 'Testville',
    description: '',
    cause: null,
  },
});
```
Expected: Returns `{ person, event, citation: null }`. Verify the person and event appear in Persons and Places views. Delete the test person afterward.

- [ ] **Step 5: Commit**

```bash
git add src/api/undo_wrappers.ts src/main/ipc/persons.ts src/preload/index.ts
git commit -m "feat(persons): wire persons:createWithEvent through IPC + undo"
```

---

### Task 4: Extract EventFormBody.vue from EventForm.vue

**Files:**
- Create: `src/renderer/components/EventFormBody.vue`
- Modify: `src/renderer/components/EventForm.vue`

`EventForm.vue` currently renders modal chrome + form fields + submission. We split it so the fields become a reusable controlled component.

- [ ] **Step 1: Create EventFormBody.vue**

Create `src/renderer/components/EventFormBody.vue`. It renders ONLY the fields, emits `update:event` and `update:source` via `defineModel`, and takes a `context` prop to choose between person/relationship event-type lists:

```vue
<template>
  <label>
    {{ $t('events.eventType') }}
    <select v-model="event.event_type" required>
      <option value="" disabled>{{ $t('events.selectType') }}</option>
      <optgroup v-if="commonTypes.length > 0" :label="$t('events.commonTypes')">
        <option v-for="et in commonTypes" :key="et" :value="et">{{ $t('eventTypes.' + et) }}</option>
      </optgroup>
      <optgroup :label="commonTypes.length > 0 ? $t('events.allTypes') : undefined">
        <option v-for="et in otherTypes" :key="et" :value="et">{{ $t('eventTypes.' + et) }}</option>
      </optgroup>
    </select>
  </label>

  <label>{{ $t('events.date') }}</label>
  <DateInput
    v-model:dateType="event.date_type"
    v-model:dateValue="event.date_value"
    v-model:dateValueEnd="event.date_value_end"
    v-model:dateOriginal="event.date_original"
  />

  <label>
    {{ $t('events.place') }}
    <PlacePicker v-model="event.place_id" :placeholder="$t('events.placePlaceholder')" />
  </label>

  <label>
    {{ $t('events.description') }}
    <textarea
      v-model="event.description"
      rows="2"
      :placeholder="$t('events.descriptionPlaceholder')"
    />
  </label>

  <label v-if="CAUSE_APPLICABLE_TYPES.includes(event.event_type)">
    {{ $t('events.cause') }}
    <input v-model="event.cause" type="text" :placeholder="$t('events.causePlaceholder')" />
  </label>

  <div class="source-section">
    <label>
      {{ $t('citations.source') }}
      <SourcePicker v-model="source.source_id" />
    </label>
    <label>
      {{ $t('citations.pageLocation') }}
      <input v-model="source.page" type="text" :placeholder="$t('citations.pagePlaceholder')" />
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DateInput from './DateInput.vue';
import PlacePicker from './PlacePicker.vue';
import SourcePicker from './SourcePicker.vue';
import { PERSON_EVENT_TYPE_VALUES, RELATIONSHIP_EVENT_TYPE_VALUES } from '../constants/eventTypes';
import type { EventTypeValue } from '../constants/eventTypes';

export interface EventBodyData {
  event_type: string;
  date_type: string;
  date_value: string;
  date_value_end: string;
  date_original: string;
  place_id: string | null;
  description: string;
  cause: string;
}

export interface SourceBodyData {
  source_id: string | null;
  page: string;
}

const props = defineProps<{ context: 'person' | 'relationship' }>();

const event = defineModel<EventBodyData>('event', { required: true });
const source = defineModel<SourceBodyData>('source', { required: true });

const { t } = useI18n();

const CAUSE_APPLICABLE_TYPES: readonly EventTypeValue[] = ['death'];
const COMMON_EVENT_TYPES: readonly EventTypeValue[] = [
  'birth', 'baptism', 'death', 'burial', 'marriage', 'residence', 'census', 'emigration', 'immigration',
];

const unsortedEventTypes = computed(() =>
  props.context === 'relationship' ? RELATIONSHIP_EVENT_TYPE_VALUES : PERSON_EVENT_TYPE_VALUES
);

const commonTypes = computed(() =>
  COMMON_EVENT_TYPES.filter(et => (unsortedEventTypes.value as readonly string[]).includes(et))
);

const otherTypes = computed(() =>
  [...unsortedEventTypes.value]
    .filter(et => !COMMON_EVENT_TYPES.includes(et) && et !== 'other')
    .sort((a, b) => t('eventTypes.' + a).localeCompare(t('eventTypes.' + b), undefined, { sensitivity: 'base' }))
    .concat(['other'] as typeof unsortedEventTypes.value[number][])
);
</script>

<style scoped>
.source-section {
  border-top: 1px solid var(--surface-border-subtle);
  padding-top: 8px;
}
</style>
```

**Note:** `defineModel` requires Vue 3.4+. Confirm via `package.json` before writing — if the project is on an older minor, fall back to `modelValue` + `update:modelValue` emits with two wrapper objects instead.

- [ ] **Step 2: Refactor EventForm.vue to use EventFormBody**

Rewrite `src/renderer/components/EventForm.vue`. Keep all submission logic, delete the inlined fields, and embed `<EventFormBody>`:

```vue
<template>
  <BaseModal @close="$emit('close')" title-id="modal-title-event">
    <h3 id="modal-title-event">{{ editingEvent ? $t('events.editEvent') : $t('events.addEventTitle') }}</h3>
    <form @submit.prevent="save">
      <EventFormBody
        v-model:event="form"
        v-model:source="sourceForm"
        :context="relationshipId ? 'relationship' : 'person'"
      />

      <div v-if="editingEvent" class="citations-section">
        <div class="citations-label">{{ $t('citations.title') }}</div>
        <div v-if="existingCitations.length === 0" class="citations-empty">{{ $t('citations.none') }}</div>
        <div v-for="cit in existingCitations" :key="cit.id" class="citation-row">
          <span class="citation-source">{{ cit.sourceTitle }}</span>
          <span v-if="cit.page" class="citation-page">{{ cit.page }}</span>
          <AppButton variant="ghost" size="sm" @click="deleteCitation(cit.id)">✕</AppButton>
        </div>
      </div>

      <div class="modal-actions">
        <span v-if="addedCount > 0" class="added-badge">
          {{ $t('events.eventsAdded', addedCount) }}
        </span>
        <AppButton variant="secondary" @click="$emit('close')">{{ $t('common.cancel') }}</AppButton>
        <AppButton v-if="!editing" variant="secondary" @click="saveAndAnother">
          {{ $t('events.saveAndAnother') }}
        </AppButton>
        <AppButton variant="primary" type="submit">
          {{ editing ? $t('events.updateEvent') : $t('events.addEvent') }}
        </AppButton>
      </div>
    </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import AppButton from './ui/AppButton.vue';
import EventFormBody from './EventFormBody.vue';
import type { EventTypeValue } from '../constants/eventTypes';
import { useToast } from '../composables/useToast';
import { useSourceSession } from '../stores/sourceSession';

const CAUSE_APPLICABLE_TYPES: readonly EventTypeValue[] = ['death'];

interface EventData {
  id: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  description: string;
  cause: string | null;
}

interface CitationRow {
  id: string;
  source_id: string;
  sourceTitle: string;
  page: string | null;
}

const props = defineProps<{
  personId?: string;
  relationshipId?: string;
  editingEvent?: EventData | null;
  defaultEventType?: string;
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const { t } = useI18n();
const toast = useToast();
const sourceSession = useSourceSession();

const editing = computed(() => !!props.editingEvent);
const addedCount = ref(0);

const form = reactive({
  event_type: props.editingEvent?.event_type ?? props.defaultEventType ?? '',
  date_type: props.editingEvent?.date_type ?? 'exact',
  date_value: props.editingEvent?.date_value ?? '',
  date_value_end: props.editingEvent?.date_value_end ?? '',
  date_original: props.editingEvent?.date_original ?? '',
  place_id: (props.editingEvent?.place_id ?? null) as string | null,
  description: props.editingEvent?.description ?? '',
  cause: props.editingEvent?.cause ?? '',
});

const sourceForm = reactive({ source_id: null as string | null, page: '' });
const existingCitations = ref<CitationRow[]>([]);

onMounted(async () => {
  if (!window.api) return;
  if (sourceSession.lastSourceId) sourceForm.source_id = sourceSession.lastSourceId;
  if (props.editingEvent) await loadCitations();
});

async function loadCitations() {
  if (!props.editingEvent || !window.api) return;
  const raw = (await window.api.citations.forEvent(props.editingEvent.id)) as Array<{
    id: string; source_id: string; page: string | null;
  }>;
  existingCitations.value = await Promise.all(
    raw.map(async (c) => {
      const src = (await window.api.sources.get(c.source_id)) as { title: string } | null;
      return { id: c.id, source_id: c.source_id, sourceTitle: src?.title ?? c.source_id, page: c.page };
    }),
  );
}

async function deleteCitation(id: string) {
  if (!window.api) return;
  try {
    await window.api.citations.delete(id);
    await loadCitations();
  } catch (err) {
    console.error('[EventForm] deleteCitation failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

async function doSave(): Promise<boolean> {
  if (!window.api) return false;
  try {
    const data: Record<string, unknown> = {
      event_type: form.event_type,
      date_type: form.date_type,
      date_value: form.date_value || null,
      date_value_end: form.date_type === 'between' ? form.date_value_end || null : null,
      date_original: form.date_original,
      place_id: form.place_id || null,
      description: form.description,
      cause: CAUSE_APPLICABLE_TYPES.includes(form.event_type as EventTypeValue) ? (form.cause || null) : null,
    };
    if (props.relationshipId) data.relationship_id = props.relationshipId;

    let eventId: string;
    if (props.editingEvent) {
      await window.api.events.update(props.editingEvent.id, data);
      eventId = props.editingEvent.id;
    } else {
      const event = (await window.api.events.create(data)) as { id: string };
      eventId = event.id;
      if (props.personId && eventId) {
        await window.api.eventParticipants.add({
          event_id: eventId,
          person_id: props.personId,
          role: 'primary',
        });
      }
    }

    if (sourceForm.source_id && eventId) {
      const citData: Record<string, unknown> = {
        source_id: sourceForm.source_id,
        page: sourceForm.page,
        confidence: 2,
        event_id: eventId,
      };
      if (props.personId) citData.person_id = props.personId;
      await window.api.citations.create(citData);
      sourceSession.setLastUsed(sourceForm.source_id, sourceForm.page);
    }
    return true;
  } catch (err) {
    console.error('[EventForm] save failed:', err);
    toast.error(t('errors.saveFailed'));
    return false;
  }
}

async function save() {
  if (await doSave()) { emit('saved'); emit('close'); }
}

async function saveAndAnother() {
  if (await doSave()) {
    emit('saved');
    form.event_type = '';
    form.date_type = 'exact';
    form.date_value = '';
    form.date_value_end = '';
    form.date_original = '';
    form.description = '';
    form.cause = '';
    existingCitations.value = [];
    addedCount.value++;
  }
}
</script>

<style scoped>
.citations-section {
  border-top: 1px solid var(--surface-border-subtle);
  padding-top: 8px;
  margin-bottom: 4px;
}
.citations-label {
  font-size: var(--font-xs);
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.4px;
  margin-bottom: 6px;
}
.citations-empty {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-bottom: 4px;
}
.citation-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-xs);
  margin-bottom: 4px;
}
.citation-source {
  flex: 1;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.citation-page { color: var(--text-secondary); flex-shrink: 0; }
.added-badge {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-right: auto;
}
</style>
```

**Note:** we intentionally dropped the `useTextareaHeight` composable for the description textarea here to reduce scope. The description is now a plain `<textarea>`. If end-users want the resizable-and-remembered behavior back, it can be re-added to `EventFormBody` directly in a follow-up.

- [ ] **Step 3: Verify EventForm still works**

Run the existing unit + visual checks:

```bash
npm run lint
npx vitest run
npm start
```
Then, in the running app:
1. Open a person detail page, click "+ Add Event".
2. Confirm the form looks identical to before (modal, event type optgroups, place, description, source/page, "save and another" button).
3. Create an event. Confirm it persists and shows in the event list.
4. Edit an existing event; confirm the Citations section still appears.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/EventFormBody.vue src/renderer/components/EventForm.vue
git commit -m "refactor(events): extract EventFormBody from EventForm"
```

---

### Task 5: Rewire AddPersonModal to use EventFormBody + the new workflow

**Files:**
- Modify: `src/renderer/components/AddPersonModal.vue`
- Modify: `src/renderer/views/PersonsView.vue` (only if the reload logic needs adjustment — likely not)

The new AddPersonModal:
- Accepts an optional `prefillPlaceId` prop (used by PlacePanel).
- Accepts an optional `prefillSurname` prop (future-proof for child-from-parent flows; not strictly needed for place-panel flow but cheap to include).
- Contains a collapsible "Event" section (a `<details>` block) that, when open, renders `EventFormBody`.
- When `prefillPlaceId` is provided, the `<details>` starts open with the place prefilled and the event_type defaulted from the ladder (enabled → `'birth'` for a brand new person).
- Submits atomically via `window.api.persons.createWithEvent`.

- [ ] **Step 1: Rewrite AddPersonModal.vue**

Replace the contents of `src/renderer/components/AddPersonModal.vue`:

```vue
<template>
  <BaseModal @close="emit('close')" title-id="modal-title-add-person">
    <h3 id="modal-title-add-person">+ {{ $t('persons.addPerson') }}</h3>
    <form @submit.prevent="submit">
      <label>{{ $t('persons.givenName') }}
        <input v-model="form.given_name" type="text" required autofocus />
      </label>
      <label>{{ $t('persons.surname') }}
        <input v-model="form.surname" type="text" />
      </label>
      <div class="form-row-2col">
        <label>{{ $t('persons.sex') }}
          <select v-model="form.sex">
            <option value="U">{{ $t('persons.sexUnknown') }}</option>
            <option value="M">{{ $t('persons.male') }}</option>
            <option value="F">{{ $t('persons.female') }}</option>
          </select>
        </label>
        <label class="checkbox-label">
          {{ $t('persons.living') }}
          <div class="checkbox-wrap">
            <input type="checkbox" v-model="form.living" />
            {{ form.living ? $t('personDetail.statusLiving') : $t('personDetail.statusDeceased') }}
          </div>
        </label>
      </div>

      <details class="event-section" :open="eventOpen" @toggle="onToggle">
        <summary>{{ $t('addPerson.eventSection') }}</summary>
        <EventFormBody
          v-model:event="eventForm"
          v-model:source="sourceForm"
          context="person"
        />
      </details>

      <div class="modal-actions">
        <AppButton variant="secondary" @click="emit('close')">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" type="submit">{{ $t('common.create') }}</AppButton>
      </div>
    </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import BaseModal from './BaseModal.vue';
import AppButton from './ui/AppButton.vue';
import EventFormBody from './EventFormBody.vue';
import { useToast } from '../composables/useToast';
import { useI18n } from 'vue-i18n';
import { useSourceSession } from '../stores/sourceSession';
import { suggestNextEventType } from '../utils/eventDefaults';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface Person { id: string; sex: string; living: boolean; }

const props = defineProps<{
  prefillPlaceId?: string | null;
  prefillSurname?: string | null;
}>();

const emit = defineEmits<{ close: []; saved: [person: Person] }>();

const { t } = useI18n();
const toast = useToast();
const sourceSession = useSourceSession();

const form = reactive({
  given_name: '',
  surname: props.prefillSurname ?? '',
  sex: 'U',
  living: true,
});

const eventOpen = ref(!!props.prefillPlaceId);

const eventForm = reactive({
  event_type: 'birth', // will be overwritten by ladder at mount
  date_type: 'exact',
  date_value: '',
  date_value_end: '',
  date_original: '',
  place_id: (props.prefillPlaceId ?? null) as string | null,
  description: '',
  cause: '',
});

const sourceForm = reactive({ source_id: null as string | null, page: '' });

onMounted(async () => {
  if (!window.api) return;

  // Fetch the smart-defaults setting from the per-database config.
  let enabled = true;
  try {
    const raw = (await window.api.db.getSetting('event_defaults_config')) as string | null;
    if (raw) {
      const parsed = JSON.parse(raw) as { smartDefaults?: boolean };
      if (parsed.smartDefaults === false) enabled = false;
    }
  } catch {
    // If the setting is missing or malformed, treat as enabled.
  }
  // Brand new person → no existing events → ladder returns 'birth' regardless of setting.
  eventForm.event_type = suggestNextEventType([], enabled);

  if (sourceSession.lastSourceId) sourceForm.source_id = sourceSession.lastSourceId;
});

function onToggle(e: Event) {
  eventOpen.value = (e.target as HTMLDetailsElement).open;
}

async function submit() {
  try {
    const payload: Record<string, unknown> = {
      given_name: form.given_name,
      surname: form.surname,
      sex: form.sex,
      living: form.living,
    };

    if (eventOpen.value && eventForm.event_type) {
      payload.event = {
        event_type: eventForm.event_type,
        date_type: eventForm.date_type,
        date_value: eventForm.date_value || null,
        date_value_end: eventForm.date_type === 'between' ? (eventForm.date_value_end || null) : null,
        date_original: eventForm.date_original,
        place_id: eventForm.place_id,
        place_name: null,
        description: eventForm.description,
        cause: eventForm.event_type === 'death' ? (eventForm.cause || null) : null,
      };

      if (sourceForm.source_id) {
        payload.citation = { source_id: sourceForm.source_id, page: sourceForm.page };
        sourceSession.setLastUsed(sourceForm.source_id, sourceForm.page);
      }
    }

    const result = (await window.api.persons.createWithEvent(payload)) as { person: Person };
    emit('saved', result.person);
  } catch (err) {
    console.error('[AddPersonModal] submit failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}
</script>

<style scoped>
.checkbox-label { font-weight: 500; cursor: pointer; }
.checkbox-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 0;
  font-size: var(--font-base);
  color: var(--text-primary);
}
.checkbox-wrap input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--accent);
}
.form-row-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.event-section {
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  margin-top: 4px;
}
.event-section summary {
  cursor: pointer;
  font-weight: 600;
  font-size: var(--font-sm);
  color: var(--text-primary);
}
.event-section[open] > :not(summary) {
  margin-top: 8px;
}
</style>
```

- [ ] **Step 2: Verify PersonsView integration**

`PersonsView.vue` currently renders `<AddPersonModal @saved="onPersonAdded">`. That already calls `load()` on save, so no change is needed — but confirm the new modal's `saved` event still emits a person object. It does (`emit('saved', result.person)`).

- [ ] **Step 3: Manual smoke test**

```bash
npm start
```

In the app:
1. Navigate to Persons. Click "+ Add Person". Enter a name, leave the event section collapsed, submit. Verify the person is created with no event.
2. Click "+ Add Person" again. Enter a name, open the "Add event" section, fill in a date + place, pick a source, submit. Verify the person, event, and citation all exist and are linked.
3. Verify the event type defaulted to `birth`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/AddPersonModal.vue
git commit -m "feat(persons): rewire AddPersonModal to use EventFormBody + atomic workflow"
```

---

### Task 6: Replace the inline birth panel in AddRelatedPersonModal

**Files:**
- Modify: `src/renderer/components/AddRelatedPersonModal.vue`

Replace the `<details class="birth-section">` block and `useBirthEventCreation` call with `EventFormBody`. Submit the person+event atomically via `persons.createWithEvent`, then create the relationship afterwards (same as today).

- [ ] **Step 1: Update the template**

In `src/renderer/components/AddRelatedPersonModal.vue`, replace the `<details class="birth-section">...</details>` block with:

```vue
<details class="event-section" :open="eventOpen" @toggle="onEventToggle">
  <summary>{{ $t('addPerson.eventSection') }}</summary>
  <EventFormBody
    v-model:event="eventForm"
    v-model:source="sourceForm"
    context="person"
  />
</details>
```

- [ ] **Step 2: Update the script**

- Add `import EventFormBody from './EventFormBody.vue';` at the top.
- Remove the `import { useBirthEventCreation }` line and its `const { createBirthEvent } = useBirthEventCreation();` call.
- Replace the `birthForm`/`birthSourceForm` reactives with:

```ts
const eventOpen = ref(false);
const eventForm = reactive({
  event_type: 'birth',
  date_type: 'exact',
  date_value: '',
  date_value_end: '',
  date_original: '',
  place_id: null as string | null,
  description: '',
  cause: '',
});
const sourceForm = reactive({ source_id: null as string | null, page: '' });

function onEventToggle(e: Event) {
  eventOpen.value = (e.target as HTMLDetailsElement).open;
}
```

- Update `onMounted` to keep the `sourceSession.lastSourceId` prefill on `sourceForm.source_id`.
- Replace the existing new-person creation block inside `save()` (currently: `window.api.persons.create`, then `createBirthEvent`, then source-session update) with:

```ts
const payload: Record<string, unknown> = {
  given_name: form.given_name,
  surname: form.surname,
  sex: form.sex,
  living: form.living,
};

if (eventOpen.value && eventForm.event_type) {
  payload.event = {
    event_type: eventForm.event_type,
    date_type: eventForm.date_type,
    date_value: eventForm.date_value || null,
    date_value_end: eventForm.date_type === 'between' ? (eventForm.date_value_end || null) : null,
    date_original: eventForm.date_original,
    place_id: eventForm.place_id,
    place_name: null,
    description: eventForm.description,
    cause: eventForm.event_type === 'death' ? (eventForm.cause || null) : null,
  };
  if (sourceForm.source_id) {
    payload.citation = { source_id: sourceForm.source_id, page: sourceForm.page };
    sourceSession.setLastUsed(sourceForm.source_id, sourceForm.page);
  }
}

const result = (await window.api.persons.createWithEvent(payload)) as { person: { id: string } };
targetPersonId = result.person.id;
```

- Remove the no-longer-used `.birth-section` styles (keep `.event-section` styles — copy the `event-section` CSS from AddPersonModal for consistency).

- [ ] **Step 3: Manual smoke test**

```bash
npm start
```

1. Open a person detail page. Click "+ Add father" (or mother/spouse/child).
2. Verify the event section (collapsed by default) replaces the old birth details. Open it, fill in birth data, submit.
3. Confirm the person + event + relationship appear.
4. Confirm existing-person flow (pick from `PersonPicker`) still works.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/AddRelatedPersonModal.vue
git commit -m "refactor(persons): replace inline birth panel in AddRelatedPersonModal with EventFormBody"
```

---

### Task 7: Add the Settings → Defaults tab

**Files:**
- Create: `src/renderer/views/DefaultsView.vue`
- Modify: `src/renderer/views/SettingsView.vue`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add i18n keys**

In `src/renderer/i18n/sv.ts`, extend `settings.tabs`:

```ts
tabs: { appearance: 'Utseende', database: 'Databas', importExport: 'Import / Export', linkRules: 'Länkregler', gazetteers: 'Ortsregister', defaults: 'Standardval' },
```

Add a new top-level key (alongside `settings`, `common`, etc.):

```ts
defaults: {
  title: 'Standardval',
  eventsSection: 'Händelser',
  smartEventType: 'Föreslå händelsetyp utifrån befintliga händelser',
  smartEventTypeHint: 'När aktiverat väljs nästa saknade typ i ordningen: födelse → död → yrke → bostad. När avstängt väljs alltid födelse.',
},
addPerson: {
  eventSection: 'Lägg till händelse (valfritt)',
},
placePanel: {
  addPerson: 'Lägg till person',
},
```

In `src/renderer/i18n/en.ts`, mirror the same keys with English text:

```ts
tabs: { appearance: 'Appearance', database: 'Database', importExport: 'Import / Export', linkRules: 'Link rules', gazetteers: 'Gazetteers', defaults: 'Defaults' },
```

```ts
defaults: {
  title: 'Defaults',
  eventsSection: 'Events',
  smartEventType: 'Suggest event type based on existing events',
  smartEventTypeHint: 'When enabled, picks the next missing type in the order: birth → death → occupation → residence. When off, always defaults to birth.',
},
addPerson: {
  eventSection: 'Add event (optional)',
},
placePanel: {
  addPerson: 'Add person',
},
```

(If `placePanel` and `addPerson` already exist in the files, merge these keys into the existing objects. Do not create duplicate top-level keys.)

- [ ] **Step 2: Create DefaultsView.vue**

Create `src/renderer/views/DefaultsView.vue`:

```vue
<template>
  <div class="defaults-view">
    <h2>{{ $t('defaults.title') }}</h2>
    <section class="defaults-section">
      <h3>{{ $t('defaults.eventsSection') }}</h3>
      <label class="toggle-label">
        <input type="checkbox" :checked="smartDefaults" @change="toggle" />
        {{ $t('defaults.smartEventType') }}
      </label>
      <p class="defaults-hint">{{ $t('defaults.smartEventTypeHint') }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const smartDefaults = ref(true);

async function load() {
  const raw = (await window.api.db.getSetting('event_defaults_config')) as string | null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { smartDefaults?: boolean };
      smartDefaults.value = parsed.smartDefaults !== false;
    } catch {
      smartDefaults.value = true;
    }
  }
}

async function toggle(e: Event) {
  const on = (e.target as HTMLInputElement).checked;
  smartDefaults.value = on;
  await window.api.db.setSetting('event_defaults_config', JSON.stringify({ smartDefaults: on }));
}

onMounted(load);
</script>

<style scoped>
.defaults-view {
  padding: var(--space-md);
}
.defaults-section {
  margin-top: var(--space-md);
}
.toggle-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-base);
  color: var(--text-primary);
  cursor: pointer;
}
.toggle-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}
.defaults-hint {
  margin-top: var(--space-xs);
  color: var(--text-muted);
  font-size: var(--font-sm);
}
</style>
```

- [ ] **Step 3: Register the tab in SettingsView.vue**

Modify `src/renderer/views/SettingsView.vue`:

```vue
<template>
  <div>
    <div class="header">
      <h2>{{ $t('settings.title') }}</h2>
    </div>

    <FilterChips :options="tabOptions" :model-value="activeTab" @update:model-value="activeTab = $event" />

    <div class="settings-content">
      <DatabaseView v-if="activeTab === 'database'" />
      <DefaultsView v-else-if="activeTab === 'defaults'" />
      <LinkRulesView v-else-if="activeTab === 'link-rules'" />
      <GazetteersView v-else-if="activeTab === 'gazetteers'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import FilterChips from '../components/ui/FilterChips.vue';
import DatabaseView from './DatabaseView.vue';
import DefaultsView from './DefaultsView.vue';
import LinkRulesView from './LinkRulesView.vue';
import GazetteersView from './GazetteersView.vue';

const { t } = useI18n();
const activeTab = ref('database');

const tabOptions = computed(() => [
  { value: 'database', label: t('settings.tabs.database') },
  { value: 'defaults', label: t('settings.tabs.defaults') },
  { value: 'link-rules', label: t('settings.tabs.linkRules') },
  { value: 'gazetteers', label: t('settings.tabs.gazetteers') },
]);
</script>
```

- [ ] **Step 4: Manual smoke test**

```bash
npm start
```

1. Go to Settings → Defaults. Toggle off. Switch databases (or reload the window). Return to Defaults — toggle should still be off.
2. With the toggle off, create a new person from the Persons view and open the event section: event_type should default to `birth` (the "off" behavior — confirmed separately when there are no existing events).
3. With the toggle ON, open "+ Add Event" on a person that already has a birth event: event_type should default to `death`. (This requires Task 8 below to be implemented for the existing EventList flow — run this step after Task 8.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/DefaultsView.vue src/renderer/views/SettingsView.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(settings): add Defaults tab with smart event-type toggle"
```

---

### Task 8: Wire the ladder into EventList (+ Add Event)

**Files:**
- Modify: `src/renderer/components/EventList.vue`

Currently EventList's `openAddForm(eventType?)` takes an optional type and falls back to empty. Compute a smart default based on the person's existing events and the `event_defaults_config` setting.

- [ ] **Step 1: Modify EventList.vue**

In `src/renderer/components/EventList.vue`:

Add imports at the top of `<script setup>`:
```ts
import { suggestNextEventType } from '../utils/eventDefaults';
```

Add a cached setting state:
```ts
const smartDefaultsEnabled = ref(true);

async function loadSmartDefaultsSetting() {
  if (!window.api) return;
  try {
    const raw = (await window.api.db.getSetting('event_defaults_config')) as string | null;
    if (raw) {
      const parsed = JSON.parse(raw) as { smartDefaults?: boolean };
      smartDefaultsEnabled.value = parsed.smartDefaults !== false;
    }
  } catch {
    smartDefaultsEnabled.value = true;
  }
}
```

Call it inside the existing `watch` (before or after `load()`):
```ts
watch(
  () => props.personId ?? props.relationshipId ?? props.placeId,
  async () => { await loadSmartDefaultsSetting(); await load(); },
  { immediate: true }
);
```

Modify `openAddForm` (line ~191) to compute the default:
```ts
function openAddForm(eventType?: string) {
  editingEvent.value = null;
  if (eventType) {
    defaultEventType.value = eventType;
  } else if (props.personId) {
    const existing = events.value.map(e => e.event_type);
    defaultEventType.value = suggestNextEventType(existing, smartDefaultsEnabled.value);
  } else {
    defaultEventType.value = '';
  }
  showForm.value = true;
}
```

Also update the inline "+ Add Event" button (line 5):
```vue
<AppButton v-if="!props.readonly" variant="soft" size="sm" @click="openAddForm()">+ {{ $t('events.addEvent') }}</AppButton>
```
(Passing no argument so the ladder applies — it already does in the template above; verify the existing `@click="showForm = true"` is replaced by `@click="openAddForm()"` here.)

- [ ] **Step 2: Manual smoke test**

```bash
npm start
```

1. Toggle Defaults ON. Open a person with no events, click "+ Add Event" — type defaults to `birth`.
2. Save it. Click "+ Add Event" again — type defaults to `death`.
3. Add a death. Click again — type defaults to `occupation`.
4. Add occupation. Click again — type defaults to `residence`.
5. Add residence. Click again — type stays at `residence`.
6. Toggle Defaults OFF. Click "+ Add Event" on any person — type always defaults to `birth`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/EventList.vue
git commit -m "feat(events): use smart event-type ladder when adding events"
```

---

### Task 9: Add the "+ Person" entry point on PlacePanel

**Files:**
- Modify: `src/renderer/components/PlacePanel.vue`

The Persons section currently shows a list but has no "+" action. Add one that opens `AddPersonModal` with the current place pre-filled.

- [ ] **Step 1: Update the Persons section header**

In `src/renderer/components/PlacePanel.vue`, find the Persons section (around line 88):

```vue
<div class="panel-section">
  <SectionHeader :title="$t('persons.title')" :count="personCount" :collapsed="!sections.persons" @toggle="toggleSection('persons')" />
  <div v-if="sections.persons" class="panel-section-body">
    <PlacePersonsSection :place-id="placeId!" />
  </div>
</div>
```

Replace it with:

```vue
<div class="panel-section">
  <SectionHeader
    :title="$t('persons.title')"
    :count="personCount"
    :collapsed="!sections.persons"
    :action-label="'+ ' + $t('placePanel.addPerson')"
    @toggle="toggleSection('persons')"
    @action="showAddPersonForm = true"
  />
  <div v-if="sections.persons" class="panel-section-body">
    <PlacePersonsSection ref="personsSectionRef" :place-id="placeId!" />
  </div>
</div>
```

- [ ] **Step 2: Add the modal and ref**

At the bottom of the template, alongside the existing `CitationForm` modal:

```vue
<AddPersonModal
  v-if="showAddPersonForm && placeId"
  :prefill-place-id="placeId"
  @close="showAddPersonForm = false"
  @saved="onPersonSaved"
/>
```

In `<script setup>`, add:

```ts
import AddPersonModal from './AddPersonModal.vue';
import type PlacePersonsSection from './PlacePersonsSection.vue';

const showAddPersonForm = ref(false);
const personsSectionRef = ref<InstanceType<typeof PlacePersonsSection> | null>(null);

async function onPersonSaved() {
  showAddPersonForm.value = false;
  personsSectionRef.value?.reload();
  await load(props.placeId);
}
```

- [ ] **Step 3: Manual smoke test**

```bash
npm start
```

1. Go to Places, click a place. The PlacePanel opens.
2. Expand the Persons section. Click "+ Add person".
3. The modal opens, the event section is pre-expanded, event_type defaults to `birth`, and the place field is pre-filled with the current place.
4. Fill in name + submit. Confirm the new person appears in the Persons section and at `/places/:id` and in the persons list. Confirm a birth event was created with the correct place.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/PlacePanel.vue
git commit -m "feat(places): add '+ Person' action on PlacePanel that pre-fills place"
```

---

### Task 10: Update CLAUDE.md and bump version

**Files:**
- Modify: `CLAUDE.md`
- Modify: `package.json`
- Modify: `docs/PLAN.md` (if a roadmap milestone exists for this; otherwise skip)

- [ ] **Step 1: Update CLAUDE.md**

In `CLAUDE.md`:

1. Under the IPC section, add `persons.createWithEvent(args)` to the person-related surface notes (and/or point at `docs/IPC_REFERENCE.md` if it lists it there).
2. Under "Per-database settings", add `event_defaults_config` to the known keys list:

```
`event_defaults_config` (JSON `{ smartDefaults: boolean }`, default true — controls smart event-type suggestions in EventList "+ Add Event" and AddPersonModal)
```

3. Under the Shared Components table, update or add rows for:
   - `AddPersonModal` — mention `prefillPlaceId` and `prefillSurname` props and the atomic workflow.
   - `EventFormBody` — new entry: props `v-model:event`, `v-model:source`, `context`.
   - `EventForm` — note that it now composes `EventFormBody`.
4. Under the Composables table, remove `useBirthEventCreation` (it's no longer used). Delete `src/renderer/composables/useBirthEventCreation.ts`.

```bash
git rm src/renderer/composables/useBirthEventCreation.ts
```

- [ ] **Step 2: Update docs/PLAN.md roadmap**

If a roadmap entry exists for "Add Person from Place Panel" or similar, mark it done and point at the archived plan path `docs/plans/archive/2026-04-19-add-person-from-place-panel.md`.

Then archive:
```bash
mkdir -p docs/plans/archive
git mv docs/plans/2026-04-19-add-person-from-place-panel.md docs/plans/archive/
```

- [ ] **Step 3: Bump version**

Read the current version in `package.json`. It is a feature → minor bump (x.Y.0).

Edit `package.json` and increment the minor version. Example: `0.121.0` → `0.122.0`.

- [ ] **Step 4: Final verification**

```bash
npm run lint
npx vitest run
```
Expected: 0 errors, all tests pass.

Quick manual regression:
```bash
npm start
```

1. Create a person with no event — works.
2. Create a person with an event inline — works.
3. Create a person from PlacePanel — place pre-filled, event_type defaults to birth.
4. Add a second event to an existing person — type defaults to next ladder step.
5. Toggle smart defaults off in Settings → Defaults — next add defaults to birth.
6. Ctrl+Z after creating a person-with-event — all three records (person, event, citation) disappear; Ctrl+Shift+Z restores them.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md package.json docs/plans/
git commit -m "release: v0.122.0 — add person from place panel, atomic person+event workflow, smart event-type defaults"
```

---

## Self-Review Notes

**Coverage of the spec:**
- "+ Person" button on PlacePanel — Task 9.
- Clicking opens the create-person modal — Task 9 + Task 5.
- Get rid of the bespoke inline birth panel — Task 6 replaces it with `EventFormBody`.
- Reuse the event form — Task 4 extracts `EventFormBody`.
- Default to a birth event — Task 5 (new-person, empty events → `suggestNextEventType([], true) === 'birth'`); Task 1 formalizes the rule.
- Pre-fill place as an optional argument to the modal — Task 5 (`prefillPlaceId` prop) + Task 9 (PlacePanel passes it).
- Person → event → place in one go, atomic — Task 2 (transactional workflow) + Task 3 (IPC wiring).
- Smart event-type ladder (birth → death → occupation → residence, terminal) — Task 1 + Task 8.
- Configurable on/off via Settings → Defaults — Task 7.
- Ladder excludes `marriage` (flagged as relationship event) — Task 1.

**Naming consistency:**
- `createPersonWithEventWorkflow`, `createPersonWithEventUndo`, IPC `persons:createWithEvent`, preload `createWithEvent` — all aligned.
- `suggestNextEventType`, `DEFAULT_EVENT_LADDER`, `event_defaults_config`, `smartDefaults` — all aligned.
- `EventFormBody` + `EventForm` + `AddPersonModal` + `AddRelatedPersonModal` — consistent.
