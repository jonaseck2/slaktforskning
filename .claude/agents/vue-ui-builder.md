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

## List view + Side Panel pattern (universal — there are no DetailView components)

Every entity list view (PersonsView, RelationshipsView, SourcesView, PlacesView, GroupsView, ResearchTasksView) follows the same shape. The `:id` route opens the same view with the panel pre-selected — never a separate page.

```
┌─ list/tree/map ────┐ │ ┌─ Side Panel ────────────┐
│  selectedId        │ │ │ Entity-colored header   │
│  highlighted       │ │ │ [Edit] [Cite]      [✕]  │
│                    │ │ │                         │
│ + Add button       │ │ │ ─ section (collapsible) │
│                    │ │ │ ─ section               │
│                    │ │ │ ─ section               │
└────────────────────┘ ↑ └─────────────────────────┘
                  drag handle
```

**View rules:**
1. Header with title + "Add" button that opens a modal (`<EntityModal mode="standalone">`)
2. Rows/tree nodes/map pins are clickable → call `selectId(item.id)` which sets `selectedId`, opens the panel, and pushes `/<entity>/:id`
3. Delete button uses `@click.stop`
4. Drag handle (`<div class="panel-drag-handle">`) bound to `usePanelResize({ storageKey: '<entity>-panel-width', maxWidthRatio: 0.7 })`
5. `onMounted` and `onActivated` both read `route.params.id` and call `selectId(id)` for deep-link + back-nav restore
6. localStorage keys: `<entity>-selected-id`, `<entity>-panel-open`, `<entity>-panel-width`

**Panel rules (`SourcePanel.vue` is the reference):**
1. Self-contained sheet: `background: var(--surface)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-lg)`, `font-size: var(--font-sm)` on the root
2. Header is entity-colored (uses `ENTITY_VISUALS`) and contains only: title, Edit button (opens the matching modal), optional action buttons, and `✕` close
3. Editing happens in modals — the panel does not host inline `<input>` grids. Click Edit → `<EntityModal mode="standalone" :editing="entity" @saved="reload">`
4. Sections are collapsible; open/close persists in `<entity>-section-<name>-open`
5. Every section uses `<SectionHeader>` with `:count` and optional `:action-label`
6. Cross-entity links (e.g. clicking a person row inside SourcePanel's citations) navigate via `router.push('/persons/' + id)` — never inline-edit across entity types

**CSS constants for panel sections:**
```css
.panel-section { padding: 0 var(--space-lg); border-bottom: 1px solid var(--surface-border-subtle); }
.panel-section-body { padding: var(--space-xs) 0 var(--space-sm); }
.section-header { display: flex; justify-content: space-between; align-items: center; }
.section-header h4 { margin: 0; font-size: 15px; }
```

Reference panels: `src/renderer/components/{Person,Place,Source,Relationship,Group,ResearchTask}Panel.vue`.

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
