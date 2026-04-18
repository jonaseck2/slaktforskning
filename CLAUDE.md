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
├── gazetteer-build/              # Shared utilities for gazetteer build scripts
│   ├── geo.ts                    # Coordinate rounding, centroid, averaging
│   ├── sparql.ts                 # Wikidata SPARQL fetch, retry, sleep
│   ├── geonames.ts               # GeoNames TSV parsing, dedup
│   ├── wikidata.ts               # WKT parsing, alias generation
│   ├── tree.ts                   # Tree node counting, walking, stats
│   ├── io.ts                     # File write helper, DATA_DIR constant
│   └── index.ts                  # Barrel re-export
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
│   ├── media.ts                  # Media + MediaLink CRUD
│   ├── report_data.ts            # Denormalized report data for AI narrative generation
│   ├── media_ai.ts               # AI media tools: base64 retrieval, untagged discovery, person context, tagging status
│   ├── media_regions.ts          # Media region (face/area tagging) CRUD
│   ├── gazetteers.ts             # Gazetteer import/export/delete CRUD (per-database blob storage)
│   ├── source-linker.ts          # Text-to-link engine: linkify(), resolveRules()
│   ├── link-rules/               # Default link rule sets
│   │   ├── sv.ts                  # Swedish rules (ArkivDigital, Riksarkivet, SVAR, DDB, etc.)
│   │   ├── en.ts                  # English rules (FamilySearch, FindAGrave, Ancestry, MyHeritage, Geni, WikiTree, BillionGraves)
│   │   ├── de.ts                  # German rules (Archion, Matricula, Ancestry.de)
│   │   ├── da.ts                  # Danish rules (Arkivalieronline, KIP)
│   │   ├── no.ts                  # Norwegian rules (Digitalarkivet, Arkivverket)
│   │   └── universal.ts           # Universal rules (plain URLs)
│   └── place-gazetteers/          # Render-time place resolution (coordinates from reference data)
│       ├── types.ts               # GazetteerNode, Gazetteer, PlaceResolveResult, GazetteerConfig
│       ├── resolver.ts            # resolvePlace() — match place strings against gazetteer trees
│       ├── index.ts               # loadGazetteers(), getAllGazetteers()
│       └── data/                    # 25 bundled gazetteers (~40 MB) — 15 point + 8 boundary + 2 language
│           ├── sv-socknar.json      # Swedish socknar (Wikidata)
│           ├── sv-forsamlingar.json # Swedish församlingar (Wikidata)
│           ├── sv-orter.json        # Swedish orter (GeoNames)
│           ├── sv-gardar.json       # Swedish gårdar (Wikidata)
│           ├── sv-kyrkor.json       # Swedish kyrkor (Wikidata)
│           ├── sv-sockenstad-boundaries.json # Swedish parish boundaries (Lantmäteriet)
│           ├── dk-sogne.json        # Danish sogne (Wikidata)
│           ├── dk-sogne-dawa.json   # Danish sogne (DAWA API)
│           ├── dk-sogne-boundaries.json # Danish parish boundaries (ok-dk/dagi)
│           ├── no-kommuner.json     # Norwegian kommuner (GeoNames)
│           ├── no-kommuner-boundaries.json # Norwegian municipality boundaries (Kartverket)
│           ├── fi-kunnat.json       # Finnish kunnat (GeoNames)
│           ├── fi-kunnat-boundaries.json # Finnish municipality boundaries (Statistics Finland)
│           ├── is-sveitarfelog.json  # Icelandic sveitarfélög (GeoNames)
│           ├── is-sveitarfelog-boundaries.json # Icelandic municipality boundaries (LMI WFS)
│           ├── us-immigration-states.json # US immigration states (GeoNames)
│           ├── us-all-states.json   # Full US gazetteer, all 50 states + DC (GeoNames)
│           ├── us-counties-boundaries.json # US county boundaries (Census Bureau)
│           ├── ca-provinces.json    # Canadian provinces/territories (GeoNames)
│           ├── ca-divisions-boundaries.json # Canadian census division boundaries (Statistics Canada)
│           ├── world-countries.json # ~244 countries (GeoNames)
│           ├── world-admin1.json    # ~2,754 admin1 divisions (GeoNames)
│           ├── world-boundaries.json # World country boundaries (Natural Earth)
│           ├── lang-sv-geonames.json  # Swedish place name translations (GeoNames)
│           └── lang-sv-wikidata.json  # Swedish place name translations (Wikidata)
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
│   ├── styles/
│   │   ├── tokens.css            # Design tokens: 3 color themes (Forest/Nordic/Twilight), spacing, typography, shapes
│   │   └── shared.css            # Global design system: shared classes, dark/high-contrast overrides
│   ├── views/
│   │   ├── PersonsView.vue       # Person list + "Add Person" modal
│   │   ├── PersonDetailView.vue  # Person detail: names, events, relationships, notes
│   │   ├── RelationshipsView.vue # Relationship list + "Add Relationship" modal (with PersonPicker)
│   │   ├── RelationshipDetailView.vue # Relationship detail: persons, type/subtype, events
│   │   ├── SourcesView.vue       # Source list + "Add Source" modal
│   │   ├── SourceDetailView.vue  # Source detail: editable fields, citations
│   │   ├── SettingsView.vue      # Settings: theme, appearance, text size, language, database, import/export
│   │   └── MediaView.vue         # Media library browser
│   ├── components/
│   │   ├── ui/                   # Primitive UI components (design system)
│   │   │   ├── AppAvatar.vue       # Person avatar with sex-colored badge
│   │   │   ├── AppBadge.vue        # Semantic badge (info/success/warning/error variants)
│   │   │   ├── AppButton.vue       # Button with variant/size props (primary/ghost/danger)
│   │   │   ├── AppEmptyState.vue   # Empty state placeholder with icon + message
│   │   │   ├── AppInput.vue        # Text input with label + error state
│   │   │   ├── AppLoadingState.vue # Loading spinner placeholder
│   │   │   ├── FilterChips.vue     # Chip bar for filtering lists
│   │   │   └── SectionHeader.vue   # Section header with title + action button slot
│   │   ├── MediaPanel.vue        # Media linking workbench panel (attach media to entities)
│   │   ├── PersonPicker.vue      # Searchable person dropdown (typeahead)
│   │   ├── DateInput.vue         # YYYY-MM-DD date input with auto-advance
│   │   ├── EventForm.vue         # Event create/edit modal
│   │   ├── EventList.vue         # Event table with add/edit/delete
│   │   └── CitationForm.vue      # Citation create modal
│   ├── directives/
│   │   └── narrate.ts              # v-narrate directive (WeakMap + resolveNarration)
│   ├── composables/
│   │   ├── useFocusTrap.ts         # Focus trap for modals (used by BaseModal)
│   │   ├── useTTS.ts               # Text-to-speech via Web Speech API
│   │   ├── useScreenReaderMode.ts  # Screen reader mode: focus narration, hotkeys, live regions
│   │   ├── useChartNavigation.ts   # Arrow-key family tree navigation for charts
│   │   └── useHotkeyRegistry.ts    # Hotkey registration (global + view-scoped)
│   ├── utils/
│   │   ├── chart-layout/
│   │   │   ├── types.ts              # PersonNode, TreePerson, BoxLayout, ChartLayout, PedigreeTree, etc.
│   │   │   ├── constants.ts          # BOX_W, BOX_H, V_GAP, H_GAP, GEN_GAP, PAD, ROW_H
│   │   │   ├── hourglass-tree.ts     # TreePerson builders (buildHourglassTree, buildPedigreeTreePerson, buildDescendantTreePerson) + injectOutlines()
│   │   │   ├── hourglass.ts          # Hourglass layout (vertical: ancestors up, descendants down)
│   │   │   ├── pedigree.ts           # Pedigree layout (horizontal: focal left, ancestors right)
│   │   │   ├── descendant.ts         # Descendant layout (vertical: focal top, children down)
│   │   │   ├── timeline.ts           # Timeline layout (horizontal bar chart)
│   │   │   └── index.ts              # Barrel re-exports
│   │   ├── narration.ts            # Natural-language narration builders for TTS
│   │   └── screenReaderNarration.ts # Narration builders for screen reader mode
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

docs/
├── PLAN.md                       # Vision, implementation status, roadmap
├── DATA_MODEL.md                 # Schema design, GEDCOM compatibility
├── MCP.md                        # MCP server tools and UI bridge reference
├── IPC_REFERENCE.md              # Complete window.api surface + IPC channel mapping
├── napkin.md                     # Per-repo runbook (auto-curated)
├── plans/                        # Implementation plans (active + archive/)
└── superpowers/
    └── specs/                    # Design specs from brainstorming (active + archive/)

.claude/
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
| `/visualisering` | `VisualizationView` | Family tree charts (pedigree, hourglass, descendant) |
| `/settings` | `SettingsView` | Settings: theme, appearance, text size, language, database management, import/export |
| `/quality` | `QualityView` | Data quality checks with per-row fix actions |
| `/reports` | `ReportsView` | AI-generated narrative reports |
| `/research-tasks` | `ResearchTasksView` | Research task list with inline editing |
| `/groups` | `GroupsView` | Person group management |
| `/groups/:id` | `GroupDetailView` | Group detail with member list |
| `/media` | `MediaView` | Media library browser |
| `/database` | redirect | Redirects to `/settings` |
| `/import-export` | redirect | Redirects to `/settings` |
| `/link-rules` | redirect | Redirects to `/settings` |
| `/gazetteers` | redirect | Redirects to `/settings` |
| `/map` | redirect | Redirects to `/places` |

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
Group            { id, name, notes, created_at }
GroupMember      { id, group_id, person_id }
Repository       { id, name, address?, city?, postal_code?, state?, country?, phone?, email?, web?, call_number?, notes, created_at }
ResearchTask     { id, person_id?, priority: number, status: 'open'|'in_progress'|'done'|'stopped', task, notes, result, created_at, updated_at }
Media            { id, file_ref?, title, format?, notes, is_printable: boolean, created_at }
MediaLink        { id, media_id, entity_type: 'person'|'event'|'relationship'|'place'|'source', entity_id, link_type?, sort_order: number, created_at }
MediaRegion      { id, media_id, person_id?, x: number, y: number, width: number, height: number, label?, created_at }
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
| `groups` | name, notes | — |
| `group_members` | group_id, person_id (UNIQUE) | group → CASCADE, person → CASCADE |
| `repositories` | name, address, city, postal_code, state, country, phone, email, web, call_number, notes | — |
| `source_repositories` | source_id, repository_id (UNIQUE) | both → CASCADE |
| `research_tasks` | person_id, priority, status, task, notes, result | person → CASCADE |
| `media` | file_ref, title, format, notes, is_printable | — |
| `media_links` | media_id, entity_type, entity_id, link_type, sort_order | media → CASCADE |
| `media_regions` | media_id, person_id, x, y, width, height, label | media → CASCADE, person → SET NULL |
| `gazetteers` | id, name, locale, description, source_json, data (BLOB), created_at | — |

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
getPersonsForPlace(db, placeId) → { person_id, given_name, surname, event_type, event_date }[]
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
addMediaLink(db, { media_id, entity_type, entity_id, link_type?, sort_order? }) → MediaLink
getMediaForEntity(db, entityType, entityId) → (Media & { link_id, link_type, sort_order })[]
removeMediaLink(db, linkId) → boolean
reorderMediaLinks(db, linkIds: string[]) → void
```

### media_ai.ts
```
getMediaFileBase64(db, mediaId, maxDimension?) → MediaFileBase64Result | null
getUntaggedMedia(db, limit?) → UntaggedMediaItem[]
getMediaForPersonContext(db, personId) → MediaWithContext[]
getPersonsForMatching(db, limit?) → PersonForMatching[]
getMediaTaggingStatus(db) → MediaTaggingStatus
```

### media_regions.ts
```
createMediaRegion(db, { media_id, person_id?, x, y, width, height, label? }) → MediaRegion
getMediaRegions(db, mediaId) → MediaRegion[]
getRegionsForPerson(db, personId) → MediaRegion[]
updateMediaRegion(db, id, { person_id?, label?, x?, y?, width?, height? }) → MediaRegion | null
deleteMediaRegion(db, id) → boolean
```

### gazetteers.ts
```
importGazetteer(db, jsonString) → { id, name, locale, nodeCount }
exportGazetteer(db, id) → string | null
deleteGazetteer(db, id) → boolean
listGazetteers(db) → GazetteerInfo[]
getImportedGazetteers(db) → Gazetteer[]
getGazetteerSchema() → JSON Schema object
```

### duplicates.ts
```
findDuplicates(db, limit?) → DuplicateCandidate[]
mergePersons(db, targetId, sourceId) → { moved: Record<string, number> }
```

### report_data.ts
```
getPersonSummary(db, personId) → PersonSummary | null     // All names, events, relationships, citations, groups, tasks
getFamilyUnit(db, relationshipId) → FamilyUnit | null      // Couple + both persons + children with birth/death events
getAncestorTree(db, personId, generations=4) → AncestorNode | null  // Nested ancestor tree
getPlaceHistory(db, placeId) → PlaceHistory | null         // All events at a place with participants
getResearchGaps(db, personId) → ResearchGaps | null        // Missing birth/death/parents, unsourced events
getTimeline(db, personId) → TimelineEntry[] | null         // Person + family events chronologically
```

---

## IPC Bridge

### How it works

1. **Main process** (`src/main/ipc.ts`): `wrapHandler(channel, fn)` registers an `ipcMain.handle()` with logging
2. **Preload** (`src/preload/index.ts`): Maps channels to `window.api.*` via `contextBridge`
3. **Renderer**: Vue components call `window.api.persons.create(...)` etc.

### window.api Surface + IPC Channel Mapping

See `docs/IPC_REFERENCE.md` for the complete `window.api` surface and IPC channel → API function mapping table.
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

Always use `<BaseModal>` — it handles overlay, Escape key, and focus trap. Click-outside does NOT close modals. Submit buttons use action verbs: `$t('common.create')` for new, `$t('common.save')` for updates.

```vue
<BaseModal v-if="showForm" @close="showForm = false" title-id="modal-title">
  <h3 id="modal-title">Title</h3>
  <form @submit.prevent="handleSubmit">
    <!-- fields -->
    <div class="modal-actions">
      <button type="button" class="btn-cancel" @click="showForm = false">{{ $t('common.cancel') }}</button>
      <button type="submit">{{ $t('common.create') }}</button>
    </div>
  </form>
</BaseModal>
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

**UI Primitives (`src/renderer/components/ui/`):**

| Component | Props | Description |
|-----------|-------|-------------|
| `AppAvatar` | `name?: string`, `sex?: string`, `size?: 'sm'\|'md'\|'lg'` | Person avatar circle with sex-colored background and initials |
| `AppBadge` | `variant?: 'info'\|'success'\|'warning'\|'error'` | Semantic badge pill using design tokens |
| `AppButton` | `variant?: 'primary'\|'ghost'\|'danger'`, `size?: 'sm'\|'md'`, `disabled?` | Button with variant/size system |
| `AppEmptyState` | `icon?: string`, `message: string` | Empty state placeholder with centered icon + text |
| `AppInput` | `modelValue`, `label?`, `error?`, `type?` | Text input with label and error state |
| `AppLoadingState` | `message?: string` | Loading spinner with optional message |
| `FilterChips` | `options`, `modelValue` | Chip bar for list filtering |
| `SectionHeader` | `title` | Section header with slot for action buttons |

**Domain Components:**

| Component | Props | Emits | Description |
|-----------|-------|-------|-------------|
| `PersonPicker` | `modelValue: string\|null`, `placeholder?: string` | `update:modelValue`, `select(person)` | Searchable autocomplete for selecting a person. 150ms debounced search via `window.api.persons.search()`. |
| `DateInput` | `dateType`, `dateValue`, `dateValueEnd`, `dateOriginal` (all string) | `update:dateType`, `update:dateValue`, `update:dateValueEnd`, `update:dateOriginal` | Separate YYYY-MM-DD text inputs with auto-advance (4-digit year → month, 2-digit month → day). Shows end date only when type is "between". Preserves original source text. |
| `EventForm` | `personId?: string`, `relationshipId?: string`, `editingEvent?: object\|null` | `close`, `saved` | Modal for creating/editing events. Uses DateInput. Shows PERSON_EVENT_TYPES or RELATIONSHIP_EVENT_TYPES based on context. When creating a person event, also adds an event_participant. |
| `EventList` | `personId?: string`, `relationshipId?: string`, `placeId?: string`, `readonly?: boolean`, `hideHeader?: boolean`, `showPersons?: boolean` | — | Self-loading event table with edit/delete. Embeds EventForm. Exposes `openAddForm()` via `defineExpose`. `showPersons` adds a participant names column (used in PlacePanel). Uses `watch` for reactive reloading on prop changes. |
| `CitationForm` | `sourceId?: string`, `eventId?: string`, `personId?: string` | `close`, `saved` | Modal for adding citations. Loads all sources into dropdown. Confidence dropdown with GEDCOM QUAY labels. |
| `ConfirmModal` | `visible`, `title`, `message` | `confirm`, `cancel` | Accessible delete confirmation modal |
| `PlacePicker` | `modelValue: string\|null`, `placeholder?: string` | `update:modelValue`, `select(place)` | Searchable autocomplete for places. 150ms debounced search via `window.api.places.search()`. Creates new place inline via `findOrCreate`. |
| `SourcePicker` | `modelValue: string\|null`, `placeholder?: string` | `update:modelValue`, `select(source)` | Searchable autocomplete for sources. 150ms debounced search via `window.api.sources.search()`. Creates new source inline. Shows all sources on focus when field is empty. |
| `PersonNamesTable` | `names: NameRow[]` | `edit(name)`, `delete(nameId)` | Names table with ★ primary indicator. Prop-driven. |
| `PersonNameFormModal` | `personId: string`, `name: NameRow\|null` | `close`, `saved` | Add/edit name modal (`name=null` → add mode). |
| `ResearchTasksTable` | `tasks: ResearchTaskRow[]`, `showPerson?: boolean` | `updated` | Inline-expand-to-edit task rows, status chip cycling, priority badge. Prop-driven. |
| `GroupsTable` | `groups: GroupRow[]`, `showMembers?: boolean` | `remove(id)` | Groups table with clickable rows (→ `/groups/:id`) and remove button. Prop-driven. |
| `PersonIdentifiersSection` | `personId: string` | — | Self-loading identifiers table + add modal. Exposes `openAddForm()`. |
| `PersonMediaSection` | `personId: string` | — | Self-loading media table with open/unlink/reorder (up/down). First item shows "Profile" badge. Emits `profileChanged` when media order changes. Exposes `attach()` and `reload()`. |
| `PersonChecksSection` | `personId: string` | — | Self-loading quality checks table with per-row ignore/restore. Exposes `reload()`. Shares ignore state with QualityView. |
| `PedigreeListView` | `tree: PedigreeTree \| null` | — | Accessible nested list alternative to pedigree chart |
| `LinkedText` | `text: string` | — | Auto-links structured references in text. Loads `link_rules_config` from db settings on mount and applies `resolveRules()` to filter by enabled locales. Renders matches as `<a>` tags that open in system browser via `shell.openExternal`. |
| `AddRelatedPersonModal` | `personId: string`, `mode: 'father'\|'mother'\|'spouse'\|'child'`, `personSex?`, `personSurname?` | `close`, `saved` | Combined person + relationship + birth event creation. Auto-infers sex (father→M, mother→F, spouse→opposite). Pre-fills surname for child mode. Optional birth date/place/source fields in collapsible `<details>`. Uses `useBirthEventCreation` composable. |
| `PlacePanel` | `placeId: string\|null` | `close` | Collapsible side panel showing full place details when a map pin is clicked. 8 sections: info, events, persons, media, citations, child places, notes, coordinates. Mirrors PersonPanel pattern. Used by MapView. |
| `PlacePersonsSection` | `placeId: string` | — | Self-loading table of persons linked to events at a place. Shows person name, event type, and date. |
| `PlaceCitationsSection` | `placeId: string` | — | Self-loading table of citations linked to a place. |
| `EntityMediaSection` | `entityType: string`, `entityId: string` | — | Generic media section for any entity type (person, place, event, etc.). Replaces the hardcoded person-only pattern in PersonMediaSection. Used by PlacePanel. |

**Composables:**
| Composable | Purpose |
|-----------|---------|
| `useBirthEventCreation` | Creates birth event + event_participant + optional citation in one call. Used by AddRelatedPersonModal and PersonsView. |
| `usePlaceResolver` | Render-time place resolution via gazetteers. Loads config from db_settings, caches results in session. Used by MapView, PersonMap, PlaceDetailView. |
| `usePlacePanelSections` | Section open/close state management for PlacePanel. Tracks which of the 8 collapsible sections are expanded. |

**Pinia Stores:**
| Store | Purpose |
|-------|---------|
| `sourceSession` | Remembers last-used source ID and page for citation pre-fill across forms. Session-only (resets on app restart). |

**Person Section Component pattern:** Every per-person data section is a reusable component shared between `PersonDetailView` and `PersonPanel`. Self-loading components (`PersonIdentifiersSection`, `PersonMediaSection`, `PersonChecksSection`, `EventList`) use `watch(() => props.personId, load, { immediate: true })` — never `onMounted` — so they reload when the panel switches person. The parent owns the `<section>` header and action button; the component renders only the table/content. See the `add-feature` skill for the full pattern, templates, and wiring examples.

### UI Design System

**Design tokens** are defined in `src/renderer/styles/tokens.css` (imported first in `main.ts`). Three color themes (Forest, Nordic, Twilight) set sidebar, surface, text, and accent token values. Semantic tokens (`--error-*`, `--warning-*`, `--success-*`, `--info-*`, `--sex-*`) are theme-invariant. Dark and high-contrast modes override tokens in `shared.css`. **Always use token variables** — never hardcode hex colors.

Shared classes are defined **once** in `src/renderer/styles/shared.css` (imported globally in `main.ts`). **Never redefine these in `<style scoped>` blocks** — scoped styles have higher specificity than global styles and will override the CSS variables (`var(--font-sm)` etc.) that power the text-size accessibility feature.

**Shared classes (do NOT copy to scoped blocks):**
- Layout: `.header`, `.count-label`, `.running-hint`, `.empty`, `.empty-hint`, `.scroll-sentinel`
- Table: `.data-table`, `.data-table th/td`, `.clickable-row`, `.clickable-row:hover`
- Filter chips: `.filter-chips`, `.chip`, `.chip:hover`, `.chip.active`
- Buttons: `.btn-add`, `.btn-add:hover`, `.btn-sm`, `.btn-delete`, `.btn-delete:hover`, `.btn-cancel`, `.btn-cancel:hover`
- Modal: `.modal-overlay`, `.modal`, `.modal h3`, `.modal-actions`, `form > label`, `form input/select/textarea`
- Person links: `.person-link`, `.person-link:hover`
- Sex badges: `.sex-badge`, `.sex-M`, `.sex-F`, `.sex-U`
- Tabs: `.tab-bar`, `.tab-btn`, `.tab-btn.active`, `.tab-btn:hover`

**Design token categories** (from `tokens.css`):
```css
/* Sidebar */     --sidebar-bg, --sidebar-text, --sidebar-text-muted, --sidebar-active-bg, --sidebar-active-text, --sidebar-border
/* Surface */     --surface-bg, --surface, --surface-hover, --surface-border, --surface-border-subtle
/* Text */        --text-primary, --text-secondary, --text-muted
/* Accent */      --accent, --accent-hover, --accent-text
/* Semantic */    --error-bg/text, --warning-bg/text, --success-bg/text, --info-bg/text
/* Sex badges */  --sex-m-bg/text, --sex-f-bg/text, --sex-u-bg/text
/* Spacing */     --space-xs(4) --space-sm(8) --space-md(12) --space-lg(16) --space-xl(24) --space-2xl(32)
/* Typography */  --font-xs(11) --font-sm(13) --font-base(14) --font-md(15) --font-lg(16)
/* Shape */       --radius-sm(4) --radius-md(6) --radius-lg(10) --radius-full(9999)
/* Shadows */     --shadow-sm, --shadow-md, --shadow-lg
```

Each view's `<style scoped>` keeps **only** classes unique to that view (badges, layout specific to that view, etc.).

**Person name links:**
Use `<router-link :to="'/persons/' + personId" class="person-link" @click.stop>` in table cells.

**Reference view:** `QualityView.vue` is the canonical implementation.

---

### Chart Outline Placeholders — Separation of Concerns

All three chart types (Pedigree, Hourglass, Descendants) share the same outline architecture via the **TreePerson** data model. When a user selects a person in any chart, outline placeholders show where new relatives can be added.

**Shared data pipeline** (`hourglass-tree.ts`):
1. **Convert** input data to TreePerson: `buildPedigreeTreePerson(PedigreeTree)`, `buildHourglassTree(HourglassTree)`, `buildDescendantTreePerson(DescendantNode)`
2. **Inject** outlines via `injectOutlines(root, selectedPersonId)` — always adds father + mother + child + spouse. No conditions, no branching.
3. **Layout** — each chart's layout algorithm positions all nodes (real + outline) identically
4. **Extract** placeholders — boxes with `PLACEHOLDER_PREFIX` IDs are moved from `boxes[]` to `placeholders[]`, lines touching them become `placeholderLines[]`
5. **Render** — real → solid boxes, outlines → dashed boxes with "+". Click handlers open `AddRelatedPersonModal`.

**Chart-specific layout details:**

| Chart | Orientation | Spouse outline | Child outline | Parent outlines |
|-------|-------------|---------------|---------------|-----------------|
| **Pedigree** | Horizontal (focal left, ancestors right) | Below selected, reserves leaf slot for vertical space | Left of selected (toward focal) | Right of selected (next generation) — via ancestor layout |
| **Hourglass** | Vertical (ancestors up, descendants down) | Beside selected (sex-dependent side) | Below selected | Above selected — via ancestor layout |
| **Descendants** | Vertical (focal top, descendants down) | Beside selected (edge of row) | Below selected — via descendant layout | Above selected |

**Pedigree-specific:** Spouse outlines reserve a leaf slot during `assignLeafSlots()` so the compact vertical layout naturally creates space. The outline is placed at `selBox.y + BOX_H + V_GAP` for tight couple-like spacing.

**Post-layout pass:** All three charts have a post-layout pass that places outline nodes not handled by the main traversal (e.g., spouse outlines for ancestors in pedigree, child outlines for ancestors in hourglass).

**Key rule:** The selected person ≠ the focal person. The focal person controls the tree scope. The selected person controls where outlines appear. These are independent concepts.

---

### Constants (`src/renderer/constants/eventTypes.ts`)

```typescript
EVENT_TYPE_VALUES              // 26 event types: birth, death, marriage, divorce, ..., wedding, foster_placement, other
PERSON_EVENT_TYPE_VALUES       // EVENT_TYPES minus marriage/divorce/wedding
RELATIONSHIP_EVENT_TYPE_VALUES // marriage, divorce, wedding, census, other
DATE_TYPE_VALUES               // exact, about, before, after, between, calculated, unknown
CONFIDENCE_LEVEL_VALUES        // 0=Unreliable, 1=Questionable, 2=Secondary, 3=Primary
SOURCE_TYPE_VALUES             // vital_record, census, church_record, newspaper, ...
RELATIONSHIP_TYPE_VALUES       // couple, parent_child, sibling, godparent, other
COUPLE_SUBTYPE_VALUES          // marriage, civil_union, cohabitation, living_apart, relationship, unknown, other
PARENT_CHILD_SUBTYPE_VALUES    // biological, adopted, foster, step, unknown
EVENT_PARTICIPANT_ROLE_VALUES  // primary, spouse, parent, child, witness, godparent, officiant, other
NAME_TYPE_VALUES               // birth, married, alias, aka
```

### Accessibility / i18n

- `a11y` i18n namespace — skip link label, ARIA labels for charts and controls, TTS button strings
- TTS enabled/disabled via localStorage key `slaktforskning-tts` (set from Settings > Read aloud toggle)

### Screen Reader Mode

A standalone screen reader mode (third Read Aloud option alongside Off and Narrate) that narrates every focused element, provides single-key hotkey navigation, and supports arrow-key family tree traversal.

**Architecture:**
- `v-narrate` Vue directive stores narration text on elements via WeakMap
- `useScreenReaderMode` composable manages mode state, focus-driven narration, hotkeys, and live-region observation
- `useChartNavigation` composable handles arrow-key tree traversal
- `HotkeyRegistry` class manages global + view-scoped keyboard shortcuts
- Narration builders in `src/renderer/utils/screenReaderNarration.ts`

**Global hotkeys (screen reader mode only):**
| Key | Action |
|-----|--------|
| `?` | List available commands |
| `P/R/S/L/T/V/Q/D` | Navigate to Persons/Relationships/Sources/Places/Tasks/Visualization/Quality/Database |
| `F` or `/` | Focus search |
| `H` | Go home |
| `N` | Add new item |
| `E` | Edit focused item |
| `Delete` | Delete focused item |
| `1-6` | Jump to section (detail views) |
| `Arrow keys` | Navigate family tree (charts) |
| `Ctrl+.` | Stop speech |

**Settings:** Three-way Appearance (Light/Dark/High Contrast) and three-way Read Aloud (Off/Narrate/Screen Reader), both independent.

**i18n:** `screenReader.*` namespace (~80 keys) in both sv.ts and en.ts.

---

## Common Commands

```bash
npm start              # Launch Electron app in dev mode (Vite HMR)
./scripts/dev-debug.sh # Launch with Chrome DevTools Protocol (CDP port 9222)
./scripts/dev-debug.sh 9223 19242  # Custom ports for parallel instances
npm run lint           # Run ESLint (must pass with 0 errors before committing)
npm test               # Run unit tests (Vitest, 1159 tests)
npm test -- --coverage # Run with coverage report (80% threshold on src/api/)
npx playwright test    # Run E2E tests (app launch + MCP server)
npm run package        # Package for current platform
npm run make           # Build distributable installers
npx tsx src/mcp/server.ts  # Run MCP server standalone
npx tsx scripts/build-sv-parishes.ts   # Rebuild Swedish parish gazetteer (Wikidata)
npx tsx scripts/build-world.ts         # Rebuild world gazetteers (GeoNames)
# See scripts/build-*.ts and scripts/fetch-*.ts for all 19 gazetteer build scripts
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

The MCP server has two entry points with different tool sets. DB path: `SLAKTFORSKNING_DB` env var, or platform's app data dir by default.

### Production Server (`src/mcp/createProdServer.ts`)

34 workflow tools designed for genealogy research and AI narrative generation. Each tool does more in a single call — creates relationships, resolves places, records citations — so agents need fewer round-trips.

Entry point: `npx tsx src/mcp/server.ts`

**Persons (8):** `create_person` (with optional birth event + citation in one call), `search_persons`, `get_person_summary`, `update_person`, `delete_person`, `add_person_name`, `merge_persons`, `find_duplicates`

**Families (4):** `add_relationship` (couple/parent_child/sibling/godparent), `add_child` (child + parent_child relationship in one call), `get_family_unit`, `get_ancestor_tree`

**Events (3):** `record_event` (multi-participant, place findOrCreate, citation in one call), `get_timeline`, `update_event`

**Sources (4):** `add_source`, `search_sources`, `cite` (link source to event/person/relationship/place), `get_citations_for_person`

**Places (4):** `add_place`, `search_places`, `get_place_history`, `resolve_place`

**Research (4):** `get_research_gaps`, `add_research_task`, `update_research_task`, `run_checks`

**Media (3):** `attach_media` (link file to entity), `tag_person_in_media` (create face/region tag), `get_media_for_person_context`

**Data Management (4):** `import_file` (unified — detects GEDCOM/Genney/Holger by extension and content), `export_gedcom` (version: '5.5.1' | '7.0'), `get_current_database`, `switch_database`

### Development Server (`src/mcp/createDevServer.ts`)

All 34 prod tools PLUS 15 dev-only tools for UI automation, chart inspection, test data seeding, and app inspection.

Entry point: `npx tsx src/mcp/devServer.ts`

**UI Automation (5):** `ui_screenshot`, `ui_navigate`, `ui_click`, `ui_fill`, `ui_get_dom`

**Chart Inspection (5):** `chart_list_persons`, `chart_select_person`, `chart_focus_person`, `chart_get_layout`, `chart_screenshot_person`

**Seed (3):** `seed_person` (realistic test person with events), `seed_family` (couple + children), `clear_test_data`

**Inspect (2):** `app_status` (Electron running, UI bridge reachable, DB path), `db_stats` (table row counts)

### Per-database settings

`src/api/db_settings.ts` provides `getDbSetting(db, key)`, `setDbSetting(db, key, value)`, `deleteDbSetting(db, key)` backed by the `db_settings` table (key TEXT PK, value TEXT). Known keys: `default_person_id` (tree subject — auto-set on GEDCOM import when SUBM NAME matches a person; editable in DatabaseView; used for startup navigation and GEDCOM SUBM export), `link_rules_config` (JSON, link rule overrides), `gazetteer_config` (JSON `{ enabledGazetteers: string[] }`, auto-set to `["sv-parishes"]` on Genney import). Exposed to renderer via `window.api.db.getSetting(key)`, `window.api.db.setSetting(key, value)`, `window.api.db.deleteSetting(key)`.

**Gazetteer tools** (prod server): `get_gazetteer_schema`, `list_gazetteers`, `import_gazetteer`, `export_gazetteer`, `delete_gazetteer`, `resolve_place`, `search_gazetteer`

**Import/export data integrity:** `import_file` and the underlying import functions return a report object with `warnings: string[]` and `unmappedData`/`skipped` arrays documenting what data was lost and why (e.g., LDS ordinances, TRAN translations, NO negative assertions, dropped ASSO associations, orphaned events/citations, unknown event types). `ImportReport` includes `repositories`, `groups`, and `researchTasks` counts. SUBM records are matched to persons and stored as `default_person_id`. `export_gedcom` returns `{ ged: string; report: ExportReport }` with `excluded[]` for entities that cannot be represented in GEDCOM 5.5.1 (Research Tasks, Groups, place_address fields).

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
| `docs/PLAN.md` | Both | Vision, implementation status, roadmap |
| `docs/DATA_MODEL.md` | Both | Schema design, GEDCOM compatibility (also bundled in `/data-modeling` skill) |
| `docs/MCP.md` | Both | MCP server tools (also bundled in `/mcp-dev` skill) |
| `docs/IPC_REFERENCE.md` | Agents | Complete `window.api` surface + IPC channel mapping |
| `docs/napkin.md` | Agents | Per-repo runbook with recurring gotchas |

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
| `/gazetteers` | Adding/debugging gazetteers | Build scripts, resolver, data sources, adding new countries |
| `/gedcom` | GEDCOM import/export | GEDCOM 5.5.1/7.0 parsing, validation |
| `/interview-synthesis` | Processing user research | Extract insights from interviews |
| `/web-research` | Competitive analysis | Research genealogy platforms |
| `/performance-profiling` | CPU saturation / slow operations | Profile, analyze, and fix performance bottlenecks |
| `/a11y` | Adding/modifying interactive UI | ARIA patterns, keyboard nav, focus management, TTS |
| `/tree-layout` | Building/modifying chart layouts | Measurement→placement→connection pipeline, footprint spacing, collision avoidance |

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
- **Always keep documentation up to date** — After finishing a feature, update `README.md`, `CLAUDE.md`, and `docs/PLAN.md`
- **Always commit ALL files** — Use `git add -A`. Never selectively skip files.
- **Persist implementation plans** — Write plans to `docs/plans/` immediately (e.g. `docs/plans/YYYY-MM-DD-description.md`). Context can be lost. When asked to "continue according to plan", look there for the most recent plan file.
- **Keep plan files and roadmap in sync** — When adding a plan file in `docs/plans/`, add a matching milestone to `docs/PLAN.md` roadmap with a pointer to the plan file. When completing a milestone, mark it done in both the plan file (checkboxes) and `docs/PLAN.md`. The roadmap is the index; the plan files are the detail.
- **Archive completed plans** — When a milestone is fully complete, move its plan file from `docs/plans/` to `docs/plans/archive/`. Update the `docs/PLAN.md` pointer to the archived path. This prevents completed plans from being loaded into context unnecessarily. `docs/PLAN.md` Done entries are brief summaries only — full implementation details live in the archived plan files.
- **Archive completed design specs** — Design specs live in `docs/superpowers/specs/`. When a spec is fully implemented, move it to `docs/superpowers/specs/archive/`. Update any `docs/PLAN.md` spec references to the archived path. Add a `[done]` roadmap entry with the archived spec pointer if one doesn't exist.
- **Version bumps only when work is complete** — Features bump minor (x.Y.0) when done. Fixes bump patch (x.y.Z) when done. Never bump version during partial implementation — intermediate commits within a multi-task feature do not get version bumps. Half a feature is not a release. Bump once in the final commit when the work is complete and tested.
