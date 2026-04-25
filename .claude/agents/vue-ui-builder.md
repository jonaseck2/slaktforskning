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
| `EventModal` | `personId?: string`, `relationshipId?: string`, `editingEvent?: object\|null`, `mode?: 'standalone'\|'subpanel'` | `close`, `cancel`, `saved` | Create/edit event on `BaseSubPanel` — handles person and relationship events; embedded citation sub-panel |
| `EventList` | `personId?: string`, `relationshipId?: string` | — | Event table with inline edit/delete; exposes `openAddForm()` via `defineExpose` |
| `CitationModal` | `sourceId?: string`, `sourceTitle?: string`, `editingCitation?: object\|null`, `eventId?`/`personId?`/`relationshipId?`/`placeId?: string`, `mode?: 'standalone'\|'subpanel'` | `close`, `cancel`, `saved` | Attach a source citation to any entity. Inline `SourcePicker` when `sourceId` not preset |

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

## Detail view pattern (SourceDetailView is the reference)

Every detail view follows this exact layout. **Do not deviate.**

```
← Back button
<h2>Entity display name</h2>   [optional action buttons: Cite, etc.]
[optional evidence/status line]

─── Entity Details (ALWAYS FIRST) ─────────
  2-column field-grid
  Each field: <label> wrapping <input> or <select>
  Text: saves on @blur  |  Selects: saves on @change
  No Save button — all changes are immediate

─── Related entities (events, names, etc.) ─
  section-header with h4 + optional Add button
  table or list
```

**Rules — enforce all of them:**
1. Entity Details section is **always first** — before names, events, relationships, etc.
2. Header contains **only** back button + `<h2>` + action buttons. No inputs, no selects, no badges that substitute for edit controls.
3. Every DB column (except id, created_at, updated_at) has an edit control in the Entity Details section.
4. Auto-save: `@blur` for text, `@change` for selects. Never a Save button for inline fields.
5. Every `<section>` has `<div class="section-header"><h4>...</h4></div>` — never a bare `<h4>`.
6. 2-column field-grid (`grid-template-columns: 1fr 1fr`). Wide fields (pickers, textareas) use `grid-column: 1 / -1`.

**CSS constants for detail views:**
```css
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field-grid label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; color: #555; }
.field-grid input, .field-grid select { padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; font-family: inherit; }
.full-width { grid-column: 1 / -1; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.section-header h4 { margin: 0; font-size: 15px; }
```

Load entity via `useRoute().params.id` in `onMounted`. Sections for related entities embed `EventList` etc. Back link to list view.

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
