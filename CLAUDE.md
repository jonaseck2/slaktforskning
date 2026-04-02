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
│   └── sources.ts                # Source + Citation CRUD
├── main/                         # Electron main process
│   ├── index.ts                  # App lifecycle, BrowserWindow, menu (Cmd+N new window)
│   ├── database.ts               # SQLite connection + stale lock cleanup
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
    └── server.ts                 # MCP server — thin wrappers over api/ functions

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

Router uses `createWebHashHistory()` (required for Electron file:// protocol).

---

## Domain Types (`src/api/types.ts`)

```typescript
Person           { id, sex: 'M'|'F'|'U', living: boolean, notes, created_at, updated_at }
PersonName       { id, person_id, given_name, surname, name_type: 'birth'|'married'|'alias'|'aka', date_from?, date_to?, sort_order }
Relationship     { id, type: 'couple'|'parent_child'|'sibling'|'godparent'|'other', person1_id?, person2_id?, subtype?, notes, created_at, updated_at }
EventParticipant { id, event_id, person_id, role: 'primary'|'spouse'|'parent'|'child'|'witness'|'godparent'|'officiant'|'other' }
GenealogyEvent   { id, event_type, date_type, date_value?, date_value_end?, date_original, place_id?, description, relationship_id?, created_at, updated_at }
Place            { id, name, normalized_name, place_type?, parent_place_id?, latitude?, longitude?, date_from?, date_to?, notes }
Source           { id, title, author, publication_info, repository, url, source_type, created_at, updated_at }
Citation         { id, source_id, page, date_accessed, confidence: 0-3, transcription, notes, event_id?, person_id?, relationship_id?, place_id?, created_at }
Assertion        { id, citation_id, subject_type, subject_id, attribute, value, value_original, confidence, is_accepted, notes, created_at } // schema only, UI deferred
```

## Database Schema

9 tables with foreign keys and cascade deletes. Schema in `src/api/schema.ts`, applied via `initializeSchema(db)` (idempotent).

| Table | Key Columns | FK Cascades |
|-------|-------------|-------------|
| `persons` | id, sex, living, notes | — |
| `person_names` | person_id, given_name, surname, name_type, sort_order | person_id → CASCADE |
| `relationships` | type, person1_id, person2_id, subtype, notes | person1/person2 → CASCADE |
| `events` | event_type, date_type, date_value, date_value_end, date_original, place_id, description, relationship_id | relationship → SET NULL, place → SET NULL |
| `event_participants` | event_id, person_id, role (UNIQUE event+person) | both → CASCADE |
| `places` | name, normalized_name, place_type, latitude, longitude, parent_place_id, date_from, date_to, notes | parent → SET NULL |
| `sources` | title, author, publication_info, repository, url, source_type | — |
| `citations` | source_id, page, confidence, transcription, notes, event_id, person_id, relationship_id, place_id | source → CASCADE, event/person/relationship → SET NULL |
| `assertions` | citation_id, subject_type, subject_id, attribute, value, confidence, is_accepted | citation → CASCADE |

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

### sources.ts
```
createSource(db, { title?, author?, publication_info?, repository?, url?, source_type? }) → Source
getSource(db, id) → Source | null
listSources(db) → Source[]
updateSource(db, id, { ...partial fields }) → Source | null
deleteSource(db, id) → boolean
createCitation(db, { source_id, event_id?, person_id?, relationship_id?, place_id?, page?, confidence?, transcription?, notes?, date_accessed? }) → Citation
getCitation(db, id) → Citation | null
getCitationsForSource(db, sourceId) → Citation[]
getCitationsForEvent(db, eventId) → Citation[]
deleteCitation(db, id) → boolean
```

---

## IPC Bridge

### How it works

1. **Main process** (`src/main/ipc.ts`): `wrapHandler(channel, fn)` registers an `ipcMain.handle()` with logging
2. **Preload** (`src/preload/index.ts`): Maps channels to `window.api.*` via `contextBridge`
3. **Renderer**: Vue components call `window.api.persons.create(...)` etc.

### Complete `window.api` Surface

This is what Vue components call. Every method returns a `Promise`.

```typescript
window.api.persons.create(data)            // → Person
window.api.persons.get(id)                 // → Person | null
window.api.persons.list()                  // → (Person & { given_name, surname })[]
window.api.persons.update(id, data)        // → Person | null
window.api.persons.delete(id)              // → boolean
window.api.persons.search(query)           // → (Person & { given_name, surname })[]
window.api.persons.addName(personId, data) // → PersonName
window.api.persons.getNames(personId)      // → PersonName[]

window.api.relationships.create(data)              // → Relationship
window.api.relationships.get(id)                   // → Relationship | null
window.api.relationships.list()                    // → Relationship[]
window.api.relationships.update(id, data)          // → Relationship | null
window.api.relationships.delete(id)                // → boolean
window.api.relationships.getForPerson(personId)    // → Relationship[]
window.api.relationships.search(query)             // → (Relationship & names)[]

window.api.eventParticipants.add(data)             // → EventParticipant
window.api.eventParticipants.getForEvent(eventId)  // → EventParticipant[]
window.api.eventParticipants.remove(id)            // → boolean

window.api.events.create(data)             // → GenealogyEvent
window.api.events.get(id)                  // → GenealogyEvent | null
window.api.events.forPerson(personId)      // → GenealogyEvent[]  (via event_participants)
window.api.events.forRelationship(relId)   // → GenealogyEvent[]
window.api.events.update(id, data)         // → GenealogyEvent | null
window.api.events.delete(id)               // → boolean

window.api.sources.create(data)            // → Source
window.api.sources.get(id)                 // → Source | null
window.api.sources.list()                  // → Source[]
window.api.sources.update(id, data)        // → Source | null
window.api.sources.delete(id)              // → boolean

window.api.citations.create(data)          // → Citation
window.api.citations.get(id)               // → Citation | null
window.api.citations.forSource(sourceId)   // → Citation[]
window.api.citations.forEvent(eventId)     // → Citation[]
window.api.citations.delete(id)            // → boolean
```

### IPC Channel → API Function Mapping

| IPC Channel | API Function |
|-------------|-------------|
| `persons:create` | `persons.createPerson(db, data)` |
| `persons:get` | `persons.getPerson(db, id)` |
| `persons:list` | `persons.listPersons(db)` |
| `persons:update` | `persons.updatePerson(db, id, data)` |
| `persons:delete` | `persons.deletePerson(db, id)` |
| `persons:search` | `persons.searchPersons(db, query)` |
| `persons:addName` | `persons.addPersonName(db, personId, data)` |
| `persons:getNames` | `persons.getPersonNames(db, personId)` |
| `relationships:create` | `relationships.createRelationship(db, data)` |
| `relationships:get` | `relationships.getRelationship(db, id)` |
| `relationships:list` | `relationships.listRelationships(db)` |
| `relationships:update` | `relationships.updateRelationship(db, id, data)` |
| `relationships:delete` | `relationships.deleteRelationship(db, id)` |
| `relationships:getForPerson` | `relationships.getRelationshipsOfPerson(db, personId)` |
| `relationships:search` | `relationships.searchRelationships(db, query)` |
| `eventParticipants:add` | `relationships.addEventParticipant(db, data)` |
| `eventParticipants:getForEvent` | `relationships.getEventParticipants(db, eventId)` |
| `eventParticipants:remove` | `relationships.removeEventParticipant(db, id)` |
| `events:create` | `events.createEvent(db, data)` |
| `events:get` | `events.getEvent(db, id)` |
| `events:forPerson` | `events.getEventsForPerson(db, personId)` |
| `events:forRelationship` | `events.getEventsForRelationship(db, relationshipId)` |
| `events:update` | `events.updateEvent(db, id, data)` |
| `events:delete` | `events.deleteEvent(db, id)` |
| `sources:create` | `sources.createSource(db, data)` |
| `sources:get` | `sources.getSource(db, id)` |
| `sources:list` | `sources.listSources(db)` |
| `sources:update` | `sources.updateSource(db, id, data)` |
| `sources:delete` | `sources.deleteSource(db, id)` |
| `citations:create` | `sources.createCitation(db, data)` |
| `citations:get` | `sources.getCitation(db, id)` |
| `citations:forSource` | `sources.getCitationsForSource(db, sourceId)` |
| `citations:forEvent` | `sources.getCitationsForEvent(db, eventId)` |
| `citations:delete` | `sources.deleteCitation(db, id)` |

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
- Embedded EventList component for events
- "Back" link to list view

### Shared Components

| Component | Props | Emits | Description |
|-----------|-------|-------|-------------|
| `PersonPicker` | `modelValue: string\|null`, `placeholder?: string` | `update:modelValue`, `select(person)` | Searchable autocomplete for selecting a person. 150ms debounced search via `window.api.persons.search()`. |
| `DateInput` | `dateType`, `dateValue`, `dateValueEnd`, `dateOriginal` (all string) | `update:dateType`, `update:dateValue`, `update:dateValueEnd`, `update:dateOriginal` | Compound date input. Shows `date_value_end` only when type is "between". Preserves original source text. |
| `EventForm` | `personId?: string`, `relationshipId?: string`, `editingEvent?: object\|null` | `close`, `saved` | Modal for creating/editing events. Uses DateInput. Shows PERSON_EVENT_TYPES or RELATIONSHIP_EVENT_TYPES based on context. When creating a person event, also adds an event_participant. |
| `EventList` | `personId?: string`, `relationshipId?: string` | — | Event table with edit/delete. Embeds EventForm. Exposes `reload()` method via `defineExpose`. |
| `CitationForm` | `sourceId?: string`, `eventId?: string`, `personId?: string` | `close`, `saved` | Modal for adding citations. Loads all sources into dropdown. Confidence dropdown with GEDCOM QUAY labels. |

### Constants (`src/renderer/constants/eventTypes.ts`)

```typescript
EVENT_TYPE_VALUES              // 22 GEDCOM event types: birth, death, marriage, divorce, ...
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
npm test               # Run unit tests (Vitest, 37 tests)
npx playwright test    # Run E2E tests (app launch + MCP server)
npm run package        # Package for current platform
npm run make           # Build distributable installers
npm run lint           # Run ESLint
npx tsx src/mcp/server.ts  # Run MCP server standalone
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

**Person tools:** `create_person`, `get_person`, `list_persons`, `search_persons`, `update_person`, `delete_person`, `add_person_name`, `get_person_names`

**Relationship tools:** `create_relationship`, `get_relationship`, `list_relationships`, `update_relationship`, `delete_relationship`, `get_relationships_of_person`, `search_relationships`

**Event participant tools:** `add_event_participant`, `get_event_participants`, `remove_event_participant`

**Event tools:** `add_event`, `get_event`, `get_events_for_person`, `get_events_for_relationship`, `update_event`, `delete_event`

**Source/citation tools:** `add_source`, `get_source`, `list_sources`, `update_source`, `delete_source`, `search_sources`, `add_citation`, `get_citation`, `get_citations_for_source`, `get_citations_for_event`, `delete_citation`

**UI tools** (requires Electron app running): `ui_screenshot`, `ui_navigate`, `ui_get_dom`, `ui_click`, `ui_execute_js`

---

## Adding New Features

Follow this checklist in order:

1. Define types in `src/api/types.ts`
2. Add/update schema in `src/api/schema.ts` (idempotent DDL)
3. Implement CRUD functions in `src/api/*.ts` (pure TS, db as first arg)
4. Write unit tests in `tests/unit/` using `createTestDb()`
5. Register IPC handlers in `src/main/ipc.ts` using `wrapHandler(channel, fn)`
6. Expose via preload in `src/preload/index.ts`
7. Add MCP tools in `src/mcp/server.ts` (thin wrapper, Zod schema, JSON response)
8. Build Vue UI in `src/renderer/` (Composition API, `<script setup>`)
9. Run `npm test && npx playwright test`
10. **Update documentation**: `README.md`, `CLAUDE.md`, `.claude/PLAN.md`

### Adding a New IPC Channel

```typescript
// 1. src/main/ipc.ts — add handler
wrapHandler('things:create', (data) => things.createThing(getDatabase(), data));

// 2. src/preload/index.ts — add to api object
things: {
  create: (data) => ipcRenderer.invoke('things:create', data),
},

// 3. Vue component — call it
await window.api.things.create({ name: 'test' });
```

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
| `.claude/DATA_MODEL.md` | Both | Schema design, GEDCOM compatibility |
| `.claude/MCP.md` | Both | MCP server tools and UI bridge reference |
| `.claude/napkin.md` | Agents | Per-repo runbook with recurring gotchas |

## Skills

### Project Skills (`.claude/skills/` — checked into repo)

| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/commit` | When committing | Always `git add -A`, compose message, never skip files |
| `/test` | When running/writing tests | Unit test patterns (Vitest), E2E patterns (Playwright) |
| `/electron-dev` | When launching/debugging the app | Dev mode, IPC debugging, common issues |
| `/mcp-dev` | When adding/testing MCP tools | Tool patterns, server testing, checklist |
| `/data-modeling` | Schema design questions | Genealogy data model guidance |
| `/gedcom` | GEDCOM import/export | GEDCOM 5.5.1/7.0 parsing, validation |
| `/interview-synthesis` | Processing user research | Extract insights from interviews |
| `/web-research` | Competitive analysis | Research genealogy platforms |

### Required Global Skills (`~/.claude/skills/`)

Install on each machine:

```bash
npx skills add anthropics/skills --skill frontend-design -y -g
npx skills add browserbase/skills -y -g
```

### Built-in Skills

`napkin`, `simplify`, `anthropic-skills:skill-creator`, `anthropic-skills:pdf`, `anthropic-skills:docx`, `anthropic-skills:xlsx`, `anthropic-skills:pptx`

## Conventions

- **UUIDs (v4)** for all primary keys
- **ISO date strings** in DB; genealogy dates use `date_type` + `date_original` to preserve uncertainty
- **SQLite WAL mode** with foreign keys enforced
- **No global DB singletons** in api/ — always pass `db` as parameter
- **Modal dialogs** for create/edit forms — reserve page navigation for detail views
- **Always keep documentation up to date** — After finishing a feature, update `README.md`, `CLAUDE.md`, and `.claude/PLAN.md`
- **Always commit ALL files** — Use `git add -A`. Never selectively skip files.
- **Write plans to files, not context** — Persist plans/specs to disk immediately. Context can be lost.
