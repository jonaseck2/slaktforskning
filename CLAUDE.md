# CLAUDE.md

## Approach

Think before acting. Read existing files before writing code.
Be concise in output but thorough in reasoning.
Prefer editing over rewriting whole files.
Do not re-read files you have already read unless the file may have changed.
Test your code before declaring done.
No sycophantic openers or closing fluff.
Keep solutions simple and direct.
User instructions always override this file.

Agent instructions for the Släktforskning codebase. This file is the complete reference — an agent should be able to start coding without scanning the repo.

## Project Overview

Släktforskning is a cross-platform desktop genealogy app built with Electron + Vue 3 + TypeScript. All data stays local in SQLite. A built-in MCP server lets AI agents read/write genealogy data without the UI.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 41 (Chromium + Node.js) |
| Frontend | Vue 3 (Composition API, `<script setup>`) + Vue Router + Pinia |
| Build | Electron Forge + Vite |
| Database | SQLite via node-sqlite3-wasm (WAL mode, foreign keys on) |
| MCP Server | @modelcontextprotocol/sdk (stdio transport) |
| Language | TypeScript throughout |

## Architecture

### Key Principle

`src/api/` is the single source of truth for all business logic. It has **zero Electron dependencies**. Both the Electron IPC handlers (`src/main/ipc.ts`) and the MCP server (`src/mcp/server.ts`) call the same api/ functions. All api/ functions take a `Database` instance as their first argument (dependency injection, no singletons).

### File Map

```
src/
├── api/                          # Pure TypeScript business logic — NO Electron imports
│   ├── types.ts                  # Domain types (Person, PersonName, Relationship, etc.)
│   ├── schema.ts                 # SQLite DDL (CREATE TABLE IF NOT EXISTS)
│   ├── persons.ts                # Person + PersonName CRUD
│   ├── relationships.ts          # Relationship + EventParticipant CRUD
│   ├── events.ts                 # Life event CRUD
│   ├── places.ts                 # Place CRUD + findOrCreate + getPlacePath
│   ├── sources.ts                # Source + Citation CRUD
│   ├── groups.ts                 # Group + GroupMember CRUD
│   ├── repositories.ts           # Repository CRUD + source links
│   ├── research_tasks.ts         # ResearchTask CRUD
│   └── media.ts                  # Media + MediaLink CRUD
├── main/                         # Electron main process
│   ├── index.ts                  # App lifecycle, BrowserWindow, menu (Cmd+N new window)
│   ├── database.ts               # SQLite connection, stale lock cleanup, switchDatabase
│   ├── settings.ts               # Persistent settings (lastDatabase, recentDatabases) in userData/settings.json
│   └── ipc.ts                    # IPC handlers bridging renderer ↔ api/
├── preload/                      # contextBridge — exposes window.api
│   └── index.ts                  # All IPC channels mapped to window.api.*
├── renderer/                     # Vue 3 application
│   ├── App.vue                   # Root layout: sidebar (Persons/Relationships/Sources) + <router-view>
│   ├── router.ts                 # Hash-based router with 7 routes
│   ├── main.ts                   # Vue bootstrap (createApp + router)
│   ├── views/
│   │   ├── PersonsView.vue       # Person list + "Add Person" modal
│   │   ├── PersonDetailView.vue  # Person detail: names, events, relationships, notes
│   │   ├── RelationshipsView.vue # Relationship list + "Add Relationship" modal (with PersonPicker)
│   │   ├── RelationshipDetailView.vue # Relationship detail: persons, type/subtype, events
│   │   ├── SourcesView.vue       # Source list + "Add Source" modal
│   │   └── SourceDetailView.vue  # Source detail: editable fields, citations
│   ├── components/
│   │   ├── PersonPicker.vue      # Searchable person dropdown (typeahead)
│   │   ├── DateInput.vue         # Compound genealogy date input
│   │   ├── EventForm.vue         # Event create/edit modal
│   │   ├── EventList.vue         # Event table with add/edit/delete
│   │   └── CitationForm.vue      # Citation create modal
│   └── constants/
│       └── eventTypes.ts         # GEDCOM event types, date types, confidence levels, etc.
└── mcp/
    ├── createServer.ts           # MCP tools — thin wrappers over api/ functions
    └── server.ts                 # Entry point: DB setup + launches createServer

tests/
├── unit/                         # Vitest — tests api/ with in-memory SQLite
│   ├── helpers.ts                # createTestDb() — fresh :memory: DB with schema
│   ├── persons.test.ts
│   ├── relationships.test.ts
│   ├── events.test.ts
│   └── sources.test.ts
└── e2e/                          # Playwright — process spawning tests
    └── app.test.ts               # App launch smoke test + MCP server connectivity

.claude/
├── PLAN.md                       # Vision, implementation status, roadmap
├── DATA_MODEL.md                 # Schema design, GEDCOM compatibility
├── MCP.md                        # MCP server tools and UI bridge reference
├── napkin.md                     # Per-repo runbook (auto-curated)
└── skills/                       # Claude skills (commit, test, electron-dev, etc.)

.devcontainer/
├── devcontainer.json             # VS Code dev container config (Node 22, extensions)
├── Dockerfile                    # Node 22 + Electron Linux deps + Xvfb
└── xvfb-start.sh                 # Helper: start virtual display before E2E tests
```

### Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `PersonsView` | Person list with "Add Person" modal |
| `/persons/:id` | `PersonDetailView` | Person detail with names, events, relationships, notes |
| `/relationships` | `RelationshipsView` | Relationship list + "Add Relationship" modal |
| `/relationships/:id` | `RelationshipDetailView` | Relationship detail: persons, type/subtype, events |
| `/sources` | `SourcesView` | Source list with "Add Source" modal |
| `/sources/:id` | `SourceDetailView` | Source detail with editable fields, citations |
| `/search` | `SearchView` | Global search across persons, relationships, sources |
| `/places` | `PlacesView` | Place list with "Add Place" modal |
| `/places/:id` | `PlaceDetailView` | Place detail: name, type, parent, lat/lon, child places |
| `/database` | `DatabaseView` | Active database path, recent databases list, New/Open buttons |

Router uses `createWebHashHistory()` (required for Electron file:// protocol).

---

## Domain Types (`src/api/types.ts`)

```typescript
Person           { id, sex: 'M'|'F'|'U', living: boolean, notes, created_at, updated_at }
PersonName       { id, person_id, given_name, surname, name_type: 'birth'|'married'|'alias'|'aka', date_from?, date_to?, sort_order, name_prefix?, name_suffix?, patronymic_base?, name_qualifier?, preferred_name?, nickname? }
PersonIdentifier { id, person_id, identifier_type: 'familysearch'|'ancestry'|'riksarkivet'|'personnummer'|'refn'|'rin'|'other', identifier_value, created_at }
Relationship     { id, type: 'couple'|'parent_child'|'sibling'|'godparent'|'other', person1_id?, person2_id?, subtype?, notes, created_at, updated_at }
EventParticipant { id, event_id, person_id, role: 'primary'|'spouse'|'parent'|'child'|'witness'|'godparent'|'officiant'|'other' }
GenealogyEvent   { id, event_type, date_type, date_value?, date_value_end?, date_original, place_id?, place_address?, cause?, description, relationship_id?, created_at, updated_at }
Place            { id, name, normalized_name, place_type?, parent_place_id?, latitude?, longitude?, date_from?, date_to?, notes, street?, postal_code?, city?, country? }
Source           { id, title, author, publication_info, repository, url, source_type, call_number?, abstract?, created_at, updated_at }
Citation         { id, source_id, page, date_accessed, confidence: 0-3, transcription, notes, event_id?, person_id?, relationship_id?, place_id?, created_at }
Assertion        { id, citation_id, subject_type, subject_id, attribute, value, value_original, confidence, is_accepted, notes, created_at } // schema only, UI deferred
Group            { id, name, notes, created_at }
GroupMember      { id, group_id, person_id }
Repository       { id, name, address?, city?, postal_code?, state?, country?, phone?, email?, web?, call_number?, notes, created_at }
ResearchTask     { id, person_id?, priority: number, status: 'open'|'in_progress'|'done'|'stopped', task, notes, result, created_at, updated_at }
Media            { id, file_ref?, title, format?, notes, is_printable: boolean, created_at }
MediaLink        { id, media_id, entity_type: 'person'|'event'|'relationship'|'place'|'source', entity_id, link_type?, created_at }
```

## Database Schema

16 tables with foreign keys and cascade deletes. Schema in `src/api/schema.ts`, applied via `initializeSchema(db)` (idempotent).

| Table | Key Columns | FK Cascades |
|-------|-------------|-------------|
| `persons` | id, sex, living, notes | — |
| `person_names` | person_id, given_name, surname, name_type, sort_order, preferred_name, nickname | person_id → CASCADE |
| `relationships` | type, person1_id, person2_id, subtype, notes | person1/person2 → CASCADE |
| `events` | event_type, date_type, date_value, date_value_end, date_original, place_id, place_address, cause, description, relationship_id | relationship → SET NULL, place → SET NULL |
| `event_participants` | event_id, person_id, role (UNIQUE event+person) | both → CASCADE |
| `places` | name, normalized_name, place_type, latitude, longitude, parent_place_id, date_from, date_to, notes, street, postal_code, city, country | parent → SET NULL |
| `sources` | title, author, publication_info, repository, url, source_type, call_number, abstract | — |
| `citations` | source_id, page, confidence, transcription, notes, event_id, person_id, relationship_id, place_id | source → CASCADE, event/person/relationship → SET NULL |
| `assertions` | citation_id, subject_type, subject_id, attribute, value, confidence, is_accepted | citation → CASCADE |
| `groups` | name, notes | — |
| `group_members` | group_id, person_id (UNIQUE) | group → CASCADE, person → CASCADE |
| `repositories` | name, address, city, postal_code, state, country, phone, email, web, call_number, notes | — |
| `source_repositories` | source_id, repository_id (UNIQUE) | both → CASCADE |
| `research_tasks` | person_id, priority, status, task, notes, result | person → CASCADE |
| `media` | file_ref, title, format, notes, is_printable | — |
| `media_links` | media_id, entity_type, entity_id, link_type | media → CASCADE |

---

## API Functions (`src/api/`)

Every function takes `db: Database` as its first argument. Returns domain types from `types.ts`.

### persons.ts
```
createPerson(db, { sex?, living?, notes?, given_name?, surname? }) → Person
getPerson(db, id) → Person | null
listPersons(db) → (Person & { given_name, surname })[]
updatePerson(db, id, { sex?, living?, notes? }) → Person | null
deletePerson(db, id) → boolean
searchPersons(db, query) → (Person & { given_name, surname })[]
addPersonName(db, personId, { given_name, surname, name_type? }) → PersonName
getPersonNames(db, personId) → PersonName[]
```

### relationships.ts
```
createRelationship(db, { type, person1_id?, person2_id?, subtype?, notes? }) → Relationship
getRelationship(db, id) → Relationship | null
listRelationships(db) → Relationship[]
updateRelationship(db, id, { type?, person1_id?, person2_id?, subtype?, notes? }) → Relationship | null
deleteRelationship(db, id) → boolean
getRelationshipsOfPerson(db, personId) → Relationship[]
searchRelationships(db, query) → (Relationship & { person1_given_name, person1_surname, person2_given_name, person2_surname })[]
addEventParticipant(db, { event_id, person_id, role? }) → EventParticipant
getEventParticipants(db, eventId) → EventParticipant[]
removeEventParticipant(db, id) → boolean
```

### events.ts
```
createEvent(db, { event_type, relationship_id?, date_type?, date_value?, date_value_end?, date_original?, place_id?, description? }) → GenealogyEvent
getEvent(db, id) → GenealogyEvent | null
getEventsForPerson(db, personId) → GenealogyEvent[]   // via event_participants JOIN
getEventsForRelationship(db, relationshipId) → GenealogyEvent[]
updateEvent(db, id, { ...partial fields }) → GenealogyEvent | null
deleteEvent(db, id) → boolean
```

### places.ts
```
createPlace(db, { name, place_type?, parent_place_id?, latitude?, longitude?, date_from?, date_to?, notes? }) → Place
getPlace(db, id) → Place | null
listPlaces(db) → Place[]
searchPlaces(db, query) → Place[]
updatePlace(db, id, { ...partial }) → Place | null
deletePlace(db, id) → boolean
findOrCreatePlace(db, name) → Place
```

### sources.ts
```
createSource(db, { title?, author?, publication_info?, repository?, url?, source_type?, call_number?, abstract? }) → Source
getSource(db, id) → Source | null
listSources(db) → Source[]
updateSource(db, id, { ...partial fields }) → Source | null
deleteSource(db, id) → boolean
createCitation(db, { source_id, event_id?, person_id?, relationship_id?, place_id?, page?, confidence?, transcription?, notes?, date_accessed? }) → Citation
getCitation(db, id) → Citation | null
getCitationsForSource(db, sourceId) → Citation[]
getCitationsForEvent(db, eventId) → Citation[]
getCitationsForPerson(db, personId) → Citation[]
getCitationsForRelationship(db, relationshipId) → Citation[]
getCitationsForPlace(db, placeId) → Citation[]
deleteCitation(db, id) → boolean
```

### groups.ts
```
createGroup(db, { name, notes? }) → Group
getGroup(db, id) → Group | null
listGroups(db) → Group[]
updateGroup(db, id, { name?, notes? }) → Group | null
deleteGroup(db, id) → boolean
addGroupMember(db, groupId, personId) → GroupMember
removeGroupMember(db, groupId, personId) → boolean
getGroupMembers(db, groupId) → GroupMember[]
getGroupsForPerson(db, personId) → Group[]
```

### repositories.ts
```
createRepository(db, { name, address?, city?, postal_code?, state?, country?, phone?, email?, web?, call_number?, notes? }) → Repository
getRepository(db, id) → Repository | null
listRepositories(db) → Repository[]
updateRepository(db, id, { ...partial }) → Repository | null
deleteRepository(db, id) → boolean
linkSourceRepository(db, sourceId, repositoryId) → void
unlinkSourceRepository(db, sourceId, repositoryId) → boolean
getRepositoriesForSource(db, sourceId) → Repository[]
```

### research_tasks.ts
```
createResearchTask(db, { task, notes?, result?, person_id?, priority?, status? }) → ResearchTask
getResearchTask(db, id) → ResearchTask | null
listResearchTasks(db) → ResearchTask[]
getResearchTasksForPerson(db, personId) → ResearchTask[]
updateResearchTask(db, id, { task?, notes?, result?, status?, priority? }) → ResearchTask | null
deleteResearchTask(db, id) → boolean
```

### media.ts
```
createMedia(db, { title, file_ref?, format?, notes?, is_printable? }) → Media
getMedia(db, id) → Media | null
listMedia(db) → Media[]
deleteMedia(db, id) → boolean
addMediaLink(db, { media_id, entity_type, entity_id, link_type? }) → MediaLink
getMediaForEntity(db, entityType, entityId) → (Media & { link_id, link_type })[]
removeMediaLink(db, linkId) → boolean
```

---

## IPC Bridge

### How it works

1. **Main process** (`src/main/ipc.ts`): `wrapHandler(channel, fn)` registers an `ipcMain.handle()` with logging
2. **Preload** (`src/preload/index.ts`): Maps channels to `window.api.*` via `contextBridge`
3. **Renderer**: Vue components call `window.api.persons.create(...)` etc.

### window.api Surface + IPC Channel Mapping

See `.claude/IPC_REFERENCE.md` for the complete `window.api` surface and IPC channel → API function mapping table.
---

## Vue Component Patterns

### General Pattern

All components use Vue 3 Composition API with `<script setup lang="ts">`:

```vue
<template>
  <!-- HTML template -->
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';

// Declare window.api type for TypeScript
declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

// Component logic
</script>

<style scoped>
/* Component-scoped styles */
</style>
```

### Modal Dialog Pattern

Used for all create/edit forms. Stays in context (no page navigation).

```vue
<!-- Toggle visibility -->
<div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
  <div class="modal">
    <h3>Title</h3>
    <form @submit.prevent="handleSubmit">
      <!-- fields -->
      <div class="modal-actions">
        <button type="button" class="btn-cancel" @click="showForm = false">Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  </div>
</div>
```

### List View Pattern

Used by PersonsView, RelationshipsView, SourcesView:
- Header with title + "Add" button
- Table with clickable rows → `router.push('/entity/:id')`
- Delete button with `@click.stop` to prevent row click
- "Add" modal dialog

### Detail View Pattern

Used by PersonDetailView, RelationshipDetailView, SourceDetailView:
- Load entity on mount via `useRoute().params.id`
- Auto-save on blur/change for editable fields
- Embedded section components for related data (see Person Section Component pattern below)
- "Back" link to list view

### Person Section Component Pattern

**Every per-person data section is a reusable component**, shared between `PersonDetailView` (full editing page) and `PersonPanel` (collapsible side panel in VisualizationView). **Never inline a section in just one view** — extract it as a component from the start.

Two flavours:

**Self-loading** (`PersonIdentifiersSection`, `PersonMediaSection`, `PersonChecksSection`, `EventList`):
- Takes `personId: string` prop
- Loads its own data with `watch(() => props.personId, load, { immediate: true })` — **never `onMounted`** — so it reacts when the panel switches person without being destroyed/recreated
- Uses `defineExpose({ action })` when the parent's header button must trigger something inside (e.g. open add form, file picker)

**Prop-driven** (`PersonNamesTable`, `ResearchTasksTable`, `GroupsTable`):
- Parent fetches data and passes it as a prop; component emits `updated` / `remove` / `edit` / `delete` back up
- Reusable across list views (e.g. `ResearchTasksTable` is used in `ResearchTasksView`, `PersonDetailView`, and `PersonPanel`)

Parent structure is always the same — the component renders only the table/content:
```vue
<section class="detail-section">           <!-- PersonDetailView -->
  <div class="section-header">
    <h4>{{ $t('things.title') }}</h4>
    <button class="btn-add" @click="ref?.openAddForm()">+ Add</button>
  </div>
  <PersonThingsSection ref="ref" :person-id="person.id" />
</section>
```

See the `add-feature` skill for the full component template and PersonPanel wiring.

### Shared Components

| Component | Props | Emits | Description |
|-----------|-------|-------|-------------|
| `PersonPicker` | `modelValue: string\|null`, `placeholder?: string` | `update:modelValue`, `select(person)` | Searchable autocomplete for selecting a person. 150ms debounced search via `window.api.persons.search()`. |
| `DateInput` | `dateType`, `dateValue`, `dateValueEnd`, `dateOriginal` (all string) | `update:dateType`, `update:dateValue`, `update:dateValueEnd`, `update:dateOriginal` | Compound date input. Shows `date_value_end` only when type is "between". Preserves original source text. |
| `EventForm` | `personId?: string`, `relationshipId?: string`, `editingEvent?: object\|null` | `close`, `saved` | Modal for creating/editing events. Uses DateInput. Shows PERSON_EVENT_TYPES or RELATIONSHIP_EVENT_TYPES based on context. When creating a person event, also adds an event_participant. |
| `EventList` | `personId?: string`, `relationshipId?: string`, `hideHeader?: boolean` | — | Self-loading event table with edit/delete. Embeds EventForm. Exposes `openAddForm()` via `defineExpose`. Reloads on `personId` change. |
| `CitationForm` | `sourceId?: string`, `eventId?: string`, `personId?: string` | `close`, `saved` | Modal for adding citations. Loads all sources into dropdown. Confidence dropdown with GEDCOM QUAY labels. |
| `PlacePicker` | `modelValue: string\|null`, `placeholder?: string` | `update:modelValue`, `select(place)` | Searchable autocomplete for places. 150ms debounced search via `window.api.places.search()`. Creates new place inline via `findOrCreate`. |
| `PersonNamesTable` | `names: NameRow[]` | `edit(name)`, `delete(nameId)` | Names table with ★ primary indicator. Prop-driven. |
| `PersonNameFormModal` | `personId: string`, `name: NameRow\|null` | `close`, `saved` | Add/edit name modal (`name=null` → add mode). |
| `ResearchTasksTable` | `tasks: ResearchTaskRow[]`, `showPerson?: boolean` | `updated` | Inline-expand-to-edit task rows, status chip cycling, priority badge. Prop-driven. |
| `GroupsTable` | `groups: GroupRow[]`, `showMembers?: boolean` | `remove(id)` | Groups table with clickable rows (→ `/groups/:id`) and remove button. Prop-driven. |
| `PersonIdentifiersSection` | `personId: string` | — | Self-loading identifiers table + add modal. Exposes `openAddForm()`. |
| `PersonMediaSection` | `personId: string` | — | Self-loading media table with open/unlink. Exposes `attach()`. |
| `PersonChecksSection` | `personId: string` | — | Self-loading quality checks table with per-row ignore/restore. Exposes `reload()`. Shares ignore state with QualityView. |

**Person Section Component pattern:** Every per-person data section is a reusable component shared between `PersonDetailView` and `PersonPanel`. Self-loading components (`PersonIdentifiersSection`, `PersonMediaSection`, `PersonChecksSection`, `EventList`) use `watch(() => props.personId, load, { immediate: true })` — never `onMounted` — so they reload when the panel switches person. The parent owns the `<section>` header and action button; the component renders only the table/content. See the `add-feature` skill for the full pattern, templates, and wiring examples.

### UI Design System

Shared classes are defined **once** in `src/renderer/styles/shared.css` (imported globally in `main.ts`). **Never redefine these in `<style scoped>` blocks** — scoped styles have higher specificity than global styles and will override the CSS variables (`var(--font-sm)` etc.) that power the text-size accessibility feature.

**Shared classes (do NOT copy to scoped blocks):**
- Layout: `.header`, `.count-label`, `.running-hint`, `.empty`, `.empty-hint`, `.scroll-sentinel`
- Table: `.data-table`, `.data-table th/td`, `.clickable-row`, `.clickable-row:hover`
- Filter chips: `.filter-chips`, `.chip`, `.chip:hover`, `.chip.active`
- Buttons: `.btn-add`, `.btn-add:hover`, `.btn-sm`, `.btn-delete`, `.btn-delete:hover`, `.btn-cancel`, `.btn-cancel:hover`
- Modal: `.modal-overlay`, `.modal`, `.modal h3`, `.modal-actions`, `form > label`, `form input/select/textarea`
- Person links: `.person-link`, `.person-link:hover`
- Tabs: `.tab-bar`, `.tab-btn`, `.tab-btn.active`, `.tab-btn:hover`

**CSS custom properties** (use these in any view-specific styles instead of hardcoded px values):
```css
--font-xs: 11px   /* table headers, badges */
--font-sm: 13px   /* body text, chips, count labels */
--font-base: 14px /* default UI text */
--font-md: 15px   /* slightly larger labels */
--font-lg: 16px   /* section headings */
```

Each view's `<style scoped>` keeps **only** classes unique to that view (badges, layout specific to that view, etc.).

**Person name links:**
Use `<router-link :to="'/persons/' + personId" class="person-link" @click.stop>` in table cells.

**Reference view:** `QualityView.vue` is the canonical implementation.

---

### Constants (`src/renderer/constants/eventTypes.ts`)

```typescript
EVENT_TYPE_VALUES              // 23 GEDCOM event types: birth, death, marriage, divorce, ..., mention, other
PERSON_EVENT_TYPE_VALUES       // EVENT_TYPES minus marriage/divorce
RELATIONSHIP_EVENT_TYPE_VALUES // marriage, divorce, census, other only
DATE_TYPE_VALUES               // exact, about, before, after, between, calculated, unknown
CONFIDENCE_LEVEL_VALUES        // 0=Unreliable, 1=Questionable, 2=Secondary, 3=Primary
SOURCE_TYPE_VALUES             // vital_record, census, church_record, newspaper, ...
RELATIONSHIP_TYPE_VALUES       // couple, parent_child, sibling, godparent, other
COUPLE_SUBTYPE_VALUES          // marriage, civil_union, cohabitation, unknown
PARENT_CHILD_SUBTYPE_VALUES    // biological, adopted, foster, step, unknown
EVENT_PARTICIPANT_ROLE_VALUES  // primary, spouse, parent, child, witness, godparent, officiant, other
NAME_TYPE_VALUES               // birth, married, alias, aka
```

---

## Common Commands

```bash
npm start              # Launch Electron app in dev mode (Vite HMR)
npm test               # Run unit tests (Vitest, 68 tests)
npm test -- --coverage # Run with coverage report (80% threshold on src/api/)
npx playwright test    # Run E2E tests (app launch + MCP server)
npm run package        # Package for current platform
npm run make           # Build distributable installers
npm run lint           # Run ESLint
npx tsx src/mcp/server.ts  # Run MCP server standalone
```

### In the Dev Container

`npm start` does not work (no display). Everything else works:

```bash
npm test                                # unit + component tests — no display needed
source .devcontainer/xvfb-start.sh     # start Xvfb on :99 (once per session)
npx playwright test                     # E2E tests (requires Xvfb running)
npm run package                         # produces a Linux distributable
```

## Testing

### Unit Tests (Vitest)

Tests live in `tests/unit/` and test `src/api/` directly with an in-memory SQLite database. Config: `vitest.config.mts`.

```typescript
import { createTestDb } from './helpers';
let db: any;
beforeEach(() => { db = createTestDb(); }); // Fresh DB per test
```

### E2E Tests (Playwright)

Tests live in `tests/e2e/`. Two tests: app launch smoke test + MCP server `initialize` handshake. Both use `SLAKTFORSKNING_DB` env var for temp DB. Config: `playwright.config.ts`.

### SQLite Quirks (node-sqlite3-wasm)

- Parameter binding uses arrays: `stmt.run([a, b])` not `stmt.run(a, b)`
- `db.get()` returns `undefined` not `null` — api/ functions use `?? null`
- No `.pragma()` method — use `db.exec('PRAGMA ...')`
- Emscripten creates `.db.lock` directories that go stale on crash — auto-cleaned on startup

---

## MCP Server

Data tools wrapping the same api/ functions, plus UI tools. Runs standalone via `npx tsx src/mcp/server.ts`.

DB path: `SLAKTFORSKNING_DB` env var, or platform's app data dir by default.

**Person tools:** `create_person`, `get_person`, `list_persons`, `search_persons`, `update_person`, `delete_person`, `add_person_name`, `get_person_names`, `update_person_name`, `delete_person_name`, `add_person_identifier`, `get_person_identifiers`, `delete_person_identifier`

**Relationship tools:** `create_relationship`, `get_relationship`, `list_relationships`, `update_relationship`, `delete_relationship`, `get_relationships_of_person`, `search_relationships`

**Event participant tools:** `add_event_participant`, `get_event_participants`, `remove_event_participant`

**Event tools:** `add_event`, `get_event`, `get_events_for_person`, `get_events_for_relationship`, `update_event`, `delete_event`

**Source/citation tools:** `add_source`, `get_source`, `list_sources`, `update_source`, `delete_source`, `search_sources`, `add_citation`, `get_citation`, `get_citations_for_source`, `get_citations_for_event`, `delete_citation`

**Place tools:** `add_place`, `get_place`, `list_places`, `search_places`, `update_place`, `delete_place`

**Group tools:** `create_group`, `get_group`, `list_groups`, `update_group`, `delete_group`, `add_group_member`, `remove_group_member`, `get_group_members`, `get_groups_for_person`

**Repository tools:** `create_repository`, `get_repository`, `list_repositories`, `update_repository`, `delete_repository`, `link_source_repository`, `unlink_source_repository`, `get_repositories_for_source`

**Research task tools:** `create_research_task`, `get_research_task`, `list_research_tasks`, `get_research_tasks_for_person`, `update_research_task`, `delete_research_task`

**Media tools:** `create_media`, `get_media`, `list_media`, `delete_media`, `add_media_link`, `get_media_for_entity`, `remove_media_link`

**Database tools:** `get_current_database`, `switch_database`

**GEDCOM/import tools:** `import_gedcom` (`.ged` files only — for Genney GEDCOM exports use `profile: "genney"`), `import_genney` (`.backup`/`.gcc` archives or Derby directories), `import_holger` (`.ged` or `.zip` file or folder containing `.ged` — for Holger/OurKind GEDCOM exports; accepts `media_dir` for remapping Windows OBJE FILE paths to a local directory), `export_gedcom` (accepts optional `version: '5.5.1' | '7.0'`, default `'5.5.1'`)

**Import/export data integrity:** All import tools (`import_gedcom`, `import_genney`, `import_holger`) return a report object with `warnings: string[]` (human-readable messages for remapped/converted data) and `unmappedData` or `skipped` arrays documenting what data was lost and why (e.g., LDS ordinances, TRAN translations, NO negative assertions, dropped ASSO associations, orphaned events/citations, unknown event types). `export_gedcom` now returns `{ ged: string; report: ExportReport }` instead of a plain string. `ExportReport` includes `excluded: { category, count, reason }[]` for entities that cannot be represented in GEDCOM 5.5.1: Research Tasks, Groups, Assertions, and event place_address fields. The export report is displayed to the user after export, ensuring transparency about data loss during round-trip operations.

**UI tools** (requires Electron app running): `ui_screenshot`, `ui_navigate`, `ui_get_dom`, `ui_click`, `ui_execute_js`

---

## Adding New Features

Use the `/add-feature` skill — it contains the full 10-step checklist, SQLite quirks, IPC patterns, MCP tool patterns, and Vue component patterns.

---

## Multi-Window

Each `BrowserWindow` runs an independent Vue app instance. All windows share the same main process and SQLite database. New windows: `Cmd+N` / `Ctrl+N`.

## Build Configuration

| File | Purpose |
|------|---------|
| `forge.config.ts` | Electron Forge config (packager, makers, Vite plugin) |
| `vite.main.config.ts` | Main process build + WASM copy plugin (`closeBundle` hook) |
| `vite.preload.config.ts` | Preload build (`entryFileNames: 'preload.js'` — avoids collision) |
| `vite.renderer.config.ts` | Renderer build (`root: src/renderer`, `outDir` resolves to project root) |
| `vitest.config.mts` | Unit test config |
| `playwright.config.ts` | E2E test config |
| `tsconfig.json` | TypeScript config |

---

## Related Docs

| File | Audience | Content |
|------|----------|---------|
| `README.md` | Humans | Quick start, features, project structure |
| `CLAUDE.md` | Agents | This file. Complete architecture reference |
| `.claude/PLAN.md` | Both | Vision, implementation status, roadmap |
| `.claude/DATA_MODEL.md` | Both | Schema design, GEDCOM compatibility (also bundled in `/data-modeling` skill) |
| `.claude/MCP.md` | Both | MCP server tools (also bundled in `/mcp-dev` skill) |
| `.claude/IPC_REFERENCE.md` | Agents | Complete `window.api` surface + IPC channel mapping |
| `.claude/napkin.md` | Agents | Per-repo runbook with recurring gotchas |

## Skills

### Project Skills (`.claude/skills/` — checked into repo)

| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/commit` | When committing | Always `git add -A`, compose message, never skip files |
| `/test` | When running/writing tests | Unit test patterns (Vitest), E2E patterns (Playwright) |
| `/electron-dev` | When launching/debugging the app | Dev mode, IPC debugging, common issues |
| `/add-feature` | Adding any new feature or entity | Full 10-step checklist: schema → API → IPC → MCP → Vue |
| `/mcp-dev` | When adding/testing MCP tools | Tool patterns, server testing, tool reference |
| `/data-modeling` | Schema design questions | GEDCOM-X model, this project's schema reference |
| `/gedcom` | GEDCOM import/export | GEDCOM 5.5.1/7.0 parsing, validation |
| `/interview-synthesis` | Processing user research | Extract insights from interviews |
| `/web-research` | Competitive analysis | Research genealogy platforms |
| `/performance-profiling` | CPU saturation / slow operations | Profile, analyze, and fix performance bottlenecks |

### Required Global Skills (`~/.claude/skills/`)

Install on each machine:

```bash
npx skills add anthropics/skills --skill frontend-design -y -g
npx skills add browserbase/skills -y -g
```

### Built-in Skills

`napkin`, `simplify`, `anthropic-skills:skill-creator`, `anthropic-skills:pdf`, `anthropic-skills:docx`, `anthropic-skills:xlsx`, `anthropic-skills:pptx`

### Execution default

After `writing-plans` finishes, **always invoke `superpowers:subagent-driven-development` immediately** — never present the execution-approach choice to the user.

## Conventions

- **UUIDs (v4)** for all primary keys
- **ISO date strings** in DB; genealogy dates use `date_type` + `date_original` to preserve uncertainty
- **SQLite WAL mode** with foreign keys enforced
- **No global DB singletons** in api/ — always pass `db` as parameter
- **Modal dialogs** for create/edit forms — reserve page navigation for detail views
- **Always keep documentation up to date** — After finishing a feature, update `README.md`, `CLAUDE.md`, and `.claude/PLAN.md`
- **Always commit ALL files** — Use `git add -A`. Never selectively skip files.
- **Write plans to files using Python, not the Write tool** — Persist implementation plans to `.claude/plans/` immediately (e.g. `.claude/plans/YYYY-MM-DD-description.md`). Context can be lost. The Write/Edit tools trigger a security hook when plan content contains patterns like exec() — always write plan files via `python3 -c "open(path,'w').write(content)"` through the Bash tool instead. (e.g. `.claude/plans/YYYY-MM-DD-description.md`). Context can be lost. When asked to "continue according to plan", look there for the most recent plan file.
- **Keep plan files and roadmap in sync** — When adding a plan file in `.claude/plans/`, add a matching milestone to `.claude/PLAN.md` roadmap with a pointer to the plan file. When completing a milestone, mark it done in both the plan file (checkboxes) and `.claude/PLAN.md`. The roadmap is the index; the plan files are the detail.
- **Archive completed plans** — When a milestone is fully complete, move its plan file from `.claude/plans/` to `.claude/plans/archive/`. Update the `.claude/PLAN.md` pointer to the archived path. This prevents completed plans from being loaded into context unnecessarily. `.claude/PLAN.md` Done entries are brief summaries only — full implementation details live in the archived plan files.
