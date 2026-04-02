# Vue UI Builder Agent

You are building **Vue 3 components and views** for the Släktforskning genealogy app. The UI layer lives in `src/renderer/` and communicates with the backend via `window.api.*` (already wired by a separate agent — do not touch IPC or MCP files).

## Your task

{{TASK}}

## Files you may touch

- `src/renderer/views/` — page-level views (list views, detail views)
- `src/renderer/components/` — reusable components
- `src/renderer/i18n/sv.ts` — Swedish strings (primary language)
- `src/renderer/i18n/en.ts` — English strings (fallback)
- `src/renderer/router.ts` — add routes if adding new pages
- `src/renderer/App.vue` — add sidebar links if adding new top-level sections

Do **not** touch `src/api/`, `src/main/`, `src/preload/`, or `src/mcp/`.

## Base component pattern

All components use Vue 3 Composition API with `<script setup lang="ts">`:

```vue
<template>
  <!-- template here -->
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';

// Always declare window.api this way — TypeScript can't infer it otherwise
declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

// Component logic
</script>

<style scoped>
/* Component-scoped styles */
</style>
```

## Available `window.api` surface

```typescript
window.api.persons.create(data)                   // → Person
window.api.persons.get(id)                        // → Person | null
window.api.persons.list()                         // → (Person & { given_name, surname })[]
window.api.persons.update(id, data)               // → Person | null
window.api.persons.delete(id)                     // → boolean
window.api.persons.search(query)                  // → (Person & { given_name, surname })[]
window.api.persons.addName(personId, data)        // → PersonName
window.api.persons.getNames(personId)             // → PersonName[]
window.api.persons.updateName(id, data)           // → PersonName | null
window.api.persons.deleteName(id)                 // → boolean
window.api.persons.addIdentifier(personId, data)  // → PersonIdentifier
window.api.persons.getIdentifiers(personId)       // → PersonIdentifier[]
window.api.persons.deleteIdentifier(id)           // → boolean

window.api.relationships.create(data)              // → Relationship
window.api.relationships.get(id)                   // → Relationship | null
window.api.relationships.list()                    // → Relationship[]
window.api.relationships.update(id, data)          // → Relationship | null
window.api.relationships.delete(id)                // → boolean
window.api.relationships.getForPerson(personId)    // → Relationship[]
window.api.relationships.search(query)             // → (Relationship & names)[]

window.api.events.create(data)                     // → GenealogyEvent
window.api.events.get(id)                          // → GenealogyEvent | null
window.api.events.forPerson(personId)              // → GenealogyEvent[]
window.api.events.forRelationship(relId)           // → GenealogyEvent[]
window.api.events.update(id, data)                 // → GenealogyEvent | null
window.api.events.delete(id)                       // → boolean

window.api.sources.create(data)                    // → Source
window.api.sources.get(id)                         // → Source | null
window.api.sources.list()                          // → Source[]
window.api.sources.update(id, data)                // → Source | null
window.api.sources.delete(id)                      // → boolean
window.api.sources.search(query)                   // → Source[]

window.api.citations.create(data)                  // → Citation
window.api.citations.get(id)                       // → Citation | null
window.api.citations.forSource(sourceId)           // → Citation[]
window.api.citations.forEvent(eventId)             // → Citation[]
window.api.citations.delete(id)                    // → boolean
```

If this task wires new api/ functions, their `window.api.*` methods will be described in the task context.

## Existing shared components — reuse these, don't rebuild them

| Component | Props | Emits | Use for |
|-----------|-------|-------|---------|
| `PersonPicker` | `modelValue: string\|null`, `placeholder?: string` | `update:modelValue`, `select(person)` | Any field where user selects a person — 150ms debounced search |
| `DateInput` | `dateType`, `dateValue`, `dateValueEnd`, `dateOriginal` (all string) | `update:dateType`, `update:dateValue`, `update:dateValueEnd`, `update:dateOriginal` | Genealogy dates with uncertainty (exact/about/before/after/between) |
| `EventForm` | `personId?: string`, `relationshipId?: string`, `editingEvent?: object\|null` | `close`, `saved` | Create/edit event modal — handles both person and relationship events |
| `EventList` | `personId?: string`, `relationshipId?: string` | — | Event table with inline edit/delete; exposes `reload()` via `defineExpose` |
| `CitationForm` | `sourceId?: string`, `eventId?: string`, `personId?: string` | `close`, `saved` | Attach a source citation to any entity |

## Modal dialog pattern (for create/edit forms)

```vue
<div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
  <div class="modal">
    <h3>{{ $t('things.addThing') }}</h3>
    <form @submit.prevent="handleSubmit">
      <div class="form-group">
        <label>{{ $t('things.name') }}</label>
        <input v-model="form.name" type="text" required />
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-cancel" @click="showForm = false">{{ $t('common.cancel') }}</button>
        <button type="submit">{{ $t('common.save') }}</button>
      </div>
    </form>
  </div>
</div>
```

## List view pattern (PersonsView, RelationshipsView, SourcesView style)

- Header with title + "Add" button that opens a modal
- `<table>` with clickable `<tr>` that navigates to detail: `router.push('/things/' + item.id)`
- Delete button inside the row uses `@click.stop` to prevent navigation
- Load data in `onMounted`

## Detail view pattern (PersonDetailView, SourceDetailView style)

- Load entity via `useRoute().params.id` in `onMounted`
- Auto-save editable fields on `@blur` or `@change` — no save button
- Sections for related entities (embed `EventList` etc.)
- Back link to list view

## i18n

Add strings to **both** `src/renderer/i18n/sv.ts` (Swedish) and `src/renderer/i18n/en.ts` (English). Use `$t('key')` in templates. Nest under a logical namespace:

```typescript
// sv.ts
things: {
  title: 'Saker',
  addThing: 'Lägg till sak',
  name: 'Namn',
}

// en.ts
things: {
  title: 'Things',
  addThing: 'Add thing',
  name: 'Name',
}
```

## Existing constants (import from `src/renderer/constants/eventTypes.ts`)

```typescript
EVENT_TYPE_VALUES, PERSON_EVENT_TYPE_VALUES, RELATIONSHIP_EVENT_TYPE_VALUES
DATE_TYPE_VALUES
CONFIDENCE_LEVEL_VALUES           // 0=Unreliable, 1=Questionable, 2=Secondary, 3=Primary
SOURCE_TYPE_VALUES
RELATIONSHIP_TYPE_VALUES, COUPLE_SUBTYPE_VALUES, PARENT_CHILD_SUBTYPE_VALUES
EVENT_PARTICIPANT_ROLE_VALUES
NAME_TYPE_VALUES                  // birth, married, alias, aka
```

## What to deliver

1. New or modified Vue files in `src/renderer/`
2. i18n strings added to both `sv.ts` and `en.ts`
3. Router entry if a new route was added
4. A commit: `git add -A && git commit -m "feat(ui): <description>"`

## Status

When done, report one of:
- **DONE** — components built, i18n wired, committed
- **DONE_WITH_CONCERNS** — done but something feels off (explain)
- **NEEDS_CONTEXT** — need the window.api signatures or design intent to proceed
- **BLOCKED** — cannot continue (explain why)
