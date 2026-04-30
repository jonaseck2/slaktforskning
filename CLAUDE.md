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

`src/api/` is the single source of truth for all business logic. It has **zero Electron dependencies**. Both the Electron IPC handlers (`src/main/ipc/*.ts`) and the MCP server (`src/mcp/server.ts`) call the same api/ functions. All api/ functions take a `Database` instance as their first argument (dependency injection, no singletons).

**Worker Thread:** All 130+ DB-touching IPC channels run in a dedicated Node.js Worker Thread (`src/main/db-worker.ts`). The Electron main thread handles only Electron-specific operations (dialog, shell, BrowserWindow, printToPDF, fs for import/export). This keeps the main thread unblocked and eliminates click stutter. Worker startup is fire-and-forget; calls are queued until the worker signals `ready`.

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
│   ├── groups.ts                 # Group + GroupLink CRUD (polymorphic links to person/place/media)
│   ├── repositories.ts           # Repository CRUD + source links
│   ├── research_tasks.ts         # ResearchTask + TaskLink CRUD (polymorphic links to person/place/media)
│   ├── media.ts                  # Media + MediaLink CRUD
│   ├── report_data.ts            # Denormalized report data for AI narrative generation
│   ├── media_ai.ts               # AI media tools: base64 retrieval, untagged discovery, person context, tagging status
│   ├── media_regions.ts          # Media region (face/area tagging) CRUD
│   ├── gazetteers.ts             # Gazetteer import/export/delete CRUD (per-database blob storage)
│   ├── chart-export.ts           # Paper-size + SVG tiling utilities for chart export
│   ├── source-linker.ts          # Text-to-link engine: linkify(), resolveRules()
│   ├── link-rules/               # Default link rule sets
│   │   ├── sv.ts                  # Swedish rules (ArkivDigital, Riksarkivet, SVAR, DDB, etc.)
│   │   ├── en.ts                  # English rules (FamilySearch, FindAGrave, Ancestry, MyHeritage, Geni, WikiTree, BillionGraves)
│   │   ├── de.ts                  # German rules (Archion, Matricula, Ancestry.de)
│   │   ├── da.ts                  # Danish rules (Arkivalieronline, KIP)
│   │   ├── no.ts                  # Norwegian rules (Digitalarkivet, Arkivverket)
│   │   └── universal.ts           # Universal rules (plain URLs)
│   ├── html_site/                 # Website export helpers (Node.js only — used by IPC, not renderer)
│   │   ├── snapshot.ts            # Data snapshot builder: serialises DB to data.json
│   │   ├── scope.ts               # Ancestor/descendant scope filter (N generations)
│   │   ├── redact.ts              # Living-person privacy: exclude or decade-redact
│   │   └── thumbnails.ts          # Thumbnail generator (≤800px, uses nativeImage)
│   └── place-gazetteers/          # Render-time place resolution (coordinates from reference data)
│       ├── types.ts               # GazetteerNode, Gazetteer, PlaceResolveResult, GazetteerConfig
│       ├── resolver.ts            # resolvePlace() — match place strings against gazetteer trees
│       ├── index.ts               # loadGazetteers(), getAllGazetteers()
│       └── data/                    # 27 bundled gazetteers (~42 MB) — 16 point + 8 boundary + 3 language
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
│           ├── world-historical.json # ~1,393 historical states/empires (Wikidata)
│           ├── world-boundaries.json # World country boundaries (Natural Earth)
│           ├── lang-sv-geonames.json  # Swedish place name translations (GeoNames)
│           ├── lang-sv-wikidata.json  # Swedish place name translations (Wikidata)
│           └── lang-world-historical.json # All-language translations for historical states (Wikidata)
├── shared/
│   └── channels/                 # Single typed channel registry — one defineChannel() call registers a channel everywhere
│       ├── types.ts              # ChannelDef, WorkerChannelDef, MainChannelDef, ChannelRegistry types
│       ├── registry.ts           # defineChannel(), channelRegistry, listChannels(), getChannel()
│       ├── api-type.ts           # ApiSurface<Reg> — derives typed window.api from registry at compile time
│       ├── index.ts              # Barrel: imports all domain files, re-exports registry helpers
│       ├── persons.ts            # persons:* + personNames:* + personIdentifiers:* channels
│       ├── events.ts             # events:* + eventParticipants:* channels
│       ├── relationships.ts      # relationships:* channels
│       ├── sources.ts            # sources:* + citations:* channels
│       ├── places.ts             # places:* channels
│       ├── groups.ts             # groups:* channels
│       ├── repositories.ts       # repositories:* channels
│       ├── research-tasks.ts     # researchTasks:* channels
│       ├── reports.ts            # reports:* + duplicates:* channels
│       ├── media.ts              # media:* + mediaRegions:* channels (DB-backed only)
│       ├── gazetteers.ts         # gazetteers:* channels
│       ├── database.ts           # db:getSetting / setSetting / deleteSetting channels
│       └── undo.ts               # undo:state, undo:beginGroup, undo:endGroup channels
├── main/                         # Electron main process
│   ├── index.ts                  # App lifecycle, BrowserWindow, menu (Cmd+N new window)
│   ├── database.ts               # SQLite connection, stale lock cleanup, switchDatabase
│   ├── settings.ts               # Persistent settings (lastDatabase, recentDatabases) in userData/settings.json
│   ├── db-worker.ts              # Worker Thread: owns SQLite + UndoManager; dispatches registry channels then legacy fallbacks
│   └── ipc/                      # IPC handlers — registry walk covers most domains; these files handle the rest
│       ├── index.ts              # registerIpcHandlers(): starts worker, walks registry, calls domain register fns
│       ├── worker-client.ts      # startWorker/callWorker/switchWorkerDb — fire-and-forget with call queue
│       ├── wrap-handler.ts       # wrapHandler() — ipcMain.handle() with logging
│       ├── database.ts           # db:getCurrent/getRecent/createNew/switchTo/openExisting, undo:undo/redo, backup:*
│       ├── media.ts              # media:attach, media:openFile (Electron dialog + fs; DB channels are in registry)
│       ├── main-only.ts          # checks:*, chart:*, print:*, csv:export, export:openFolder (can't fit registry pattern)
│       ├── import.ts             # gedcom:*, archive:*, import:* — dialog + fs stay on main
│       └── website-export.ts     # website:export, website:previewSnapshot, website:setPreviewSnapshot
├── preload/                      # contextBridge — exposes window.api
│   └── index.ts                  # Hand-maintained window.api map (one ipcRenderer.invoke per method); preload-coverage.test.ts asserts every registry channel is exposed here
├── renderer/                     # Vue 3 application
│   ├── App.vue                   # Root layout: sidebar (Persons/Relationships/Sources) + <router-view>
│   ├── router.ts                 # Hash-based router with 7 routes
│   ├── main.ts                   # Vue bootstrap (createApp + router)
│   ├── styles/
│   │   ├── tokens.css            # Design tokens: 3 color themes (Forest/Nordic/Twilight), spacing, typography, shapes
│   │   └── shared.css            # Global design system: shared classes, dark/high-contrast overrides
│   ├── views/                    # Each list/tree view hosts its own side panel — no DetailView components
│   │   ├── PersonsView.vue       # Tree + list tabs + PersonPanel (replaces VisualizationView)
│   │   ├── PersonsListTab.vue    # Person list table (used inside PersonsView's list tab)
│   │   ├── RelationshipsView.vue # Relationship list + RelationshipPanel
│   │   ├── SourcesView.vue       # Source list + SourcePanel
│   │   ├── PlacesView.vue        # Map + list tabs + PlacePanel
│   │   ├── GroupsView.vue        # Group list + GroupPanel
│   │   ├── ResearchTasksView.vue # Task list + ResearchTaskPanel
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
│   │   ├── modals/               # All entity modals share BaseSubPanel shell
│   │   │   ├── BaseSubPanel.vue    # Modal shell — mode='standalone'|'subpanel', tone/icon/hideSave/cancelLabel props
│   │   │   ├── PersonModal.vue     # Add/edit person — supports prefill (place, surname, related-person modes)
│   │   │   ├── EventModal.vue      # Create/edit event with embedded citation sub-panel
│   │   │   ├── PlaceModal.vue, RelationshipModal.vue, GroupModal.vue
│   │   │   ├── SourceModal.vue, CitationModal.vue (inline SourcePicker when sourceId not preset)
│   │   │   ├── ResearchTaskModal.vue, PersonNameModal.vue, PersonIdentifierModal.vue
│   │   │   └── LinkRuleModal.vue
│   │   ├── PersonPanel.vue       # Side panel for a person (hosted in PersonsView)
│   │   ├── PlacePanel.vue        # Side panel for a place (hosted in PlacesView)
│   │   ├── SourcePanel.vue       # Side panel for a source: editable fields, citations, repos, media
│   │   ├── RelationshipPanel.vue # Side panel for a relationship: persons, type/subtype, events, citations, media
│   │   ├── GroupPanel.vue        # Side panel for a group: name, notes, members
│   │   ├── ResearchTaskPanel.vue # Side panel for a research task: editable fields + linked person
│   │   ├── MediaPanel.vue        # Side panel for a media item: editable title (input) + Open button, notes, linked persons/places/events, face tags, quality
│   │   ├── MediaViewer.vue       # Full-canvas image viewer with face-tag overlay, ZoomControls overlay, filmstrip, and caption preview that follows the image during zoom/pan
│   │   ├── MediaCaption.vue      # Reusable caption: "From left: …" face list + notes (extracted from MediaChronological so the report and the viewer preview stay in sync)
│   │   ├── FaceTagOverlay.vue    # SVG overlay on top of the viewer image — draggable/resizable face regions with labels, draw mode for new tags
│   │   ├── PersonPicker.vue      # Searchable person dropdown (typeahead)
│   │   ├── DateInput.vue         # Single monospace YYYY-MM-DD field with embedded calendar icon (matches native input type=date)
│   │   └── EventList.vue         # Event table with add/edit/delete (embeds EventModal)
│   ├── directives/
│   │   └── narrate.ts              # v-narrate directive (WeakMap + resolveNarration)
│   ├── composables/
│   │   ├── useFocusTrap.ts         # Focus trap for modals (used by BaseModal)
│   │   ├── useTTS.ts               # Text-to-speech via Web Speech API
│   │   ├── useScreenReaderMode.ts  # Screen reader mode: focus narration, hotkeys, live regions
│   │   ├── useChartNavigation.ts   # Arrow-key family tree navigation for charts
│   │   ├── usePanelResize.ts       # Drag-resize side panels (per-view localStorage key)
│   │   └── useHotkeyRegistry.ts    # Hotkey registration (global + view-scoped)
│   ├── utils/
│   │   ├── chart-layout/
│   │   │   ├── types.ts              # PersonNode, TreePerson, BoxLayout, ChartLayout, PedigreeTree, etc.
│   │   │   ├── constants.ts          # BOX_W, MIN_BOX_H, V_GAP, H_GAP, GEN_GAP, PAD, PORTRAIT_W/H, CURVE_R, TEXT_AREA_W
│   │   │   ├── measure.ts            # wrapName(), measureBoxHeight() — dynamic per-box height via Canvas measureText
│   │   │   ├── connectors.ts         # curvedElbow() — SVG path builder for chart connectors
│   │   │   ├── hourglass-tree.ts     # TreePerson builders (buildHourglassTree, buildPedigreeTreePerson, buildDescendantTreePerson) + injectOutlines()
│   │   │   ├── hourglass.ts          # Hourglass layout (vertical: ancestors up, descendants down)
│   │   │   ├── pedigree.ts           # Pedigree layout (horizontal: focal left, ancestors right)
│   │   │   ├── descendant.ts         # Descendant layout (vertical: focal top, children down)
│   │   │   ├── timeline.ts           # Timeline layout (horizontal bar chart)
│   │   │   └── index.ts              # Barrel re-exports
│   │   ├── narration.ts            # Natural-language narration builders for TTS
│   │   ├── screenReaderNarration.ts # Narration builders for screen reader mode
│   └── constants/
│       └── eventTypes.ts         # GEDCOM event types, date types, confidence levels, etc.
├── static/                       # Static SPA entry (website export target)
│   ├── main.ts                   # Vue bootstrap for static mode
│   ├── App.vue                   # Simplified shell: 5-nav sidebar (People/Places/Media/Reports/Prints)
│   ├── router.ts                 # Reduced route table (no editing routes)
│   ├── static-api.ts             # window.api stub backed by data.json snapshot + lunr search
│   ├── stores/
│   │   └── uiMode.ts             # useUiModeStore — isReadOnly flag for static mode
│   ├── dev/
│   │   └── fixtures.json         # Small dev fixture for npm run dev:static
│   └── views/
│       ├── PersonsListView.vue   # List-only persons view (no panel)
│       ├── PlacesListView.vue    # List-only places view (no panel)
│       ├── PersonDetailView.vue  # Full-page person detail (readonly PersonPanel)
│       ├── PlaceDetailView.vue   # Full-page place detail (readonly PlacePanel)
│       ├── ReportsIndexView.vue  # Links to pre-rendered reports
│       ├── ReportPageView.vue    # iframe + PDF download for one report
│       ├── PrintsIndexView.vue   # Links to pre-rendered frameable prints
│       └── PrintPageView.vue     # iframe + PDF download for one print
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
└── e2e/                          # Playwright — runs against packaged binary
    ├── fixture.ts                # Spawns packaged Electron + UI bridge driver
    ├── app.test.ts               # Smoke: packaged app boot, prod + dev MCP handshake
    ├── crud-roundtrip.test.ts    # Single IPC round-trip across all major entities
    └── website-export.test.ts    # Filesystem round-trip for website:export

docs/
├── PLAN.md                       # Active roadmap (active/planned/backlog only)
├── DATA_MODEL.md                 # Schema design, GEDCOM compatibility
├── MCP.md                        # MCP server tools and UI bridge reference
├── IPC_REFERENCE.md              # Complete window.api surface + IPC channel mapping
└── plans/                        # Implementation plans + design specs (active + archive/)

.claude/
├── napkin.md                     # Per-repo runbook (auto-curated)
└── skills/                       # Claude skills (commit, test, electron-dev, etc.)

.devcontainer/
├── devcontainer.json             # VS Code dev container config (Node 22, extensions)
├── Dockerfile                    # Node 22 + Electron Linux deps + Xvfb
└── xvfb-start.sh                 # Helper: start virtual display before E2E tests
```

### Routes

Every entity-list view hosts its own resizable side panel. All `:id` routes navigate to the **list view with the panel pre-selected** — there are no separate detail-view components. Editing happens in modals opened from within the panel.

| Path | Component | Description |
|------|-----------|-------------|
| `/` | redirect | Redirects to `/persons` |
| `/persons` | `PersonsView` | Tree + list tabs + PersonPanel |
| `/persons/:personId` | `PersonsView` | Same view, panel opened to selected person |
| `/relationships` | `RelationshipsView` | Relationship list + RelationshipPanel |
| `/relationships/:id` | `RelationshipsView` | Same view, panel opened to selected relationship |
| `/sources` | `SourcesView` | Source list + SourcePanel |
| `/sources/:id` | `SourcesView` | Same view, panel opened to selected source |
| `/places` | `PlacesView` | Map + list tabs + PlacePanel |
| `/places/:id` | `PlacesView` | Same view, panel opened to selected place |
| `/groups` | `GroupsView` | Group list + GroupPanel |
| `/groups/:id` | `GroupsView` | Same view, panel opened to selected group |
| `/research-tasks` | `ResearchTasksView` | Task list + ResearchTaskPanel |
| `/research-tasks/:id` | `ResearchTasksView` | Same view, panel opened to selected task |
| `/search` | `SearchView` | Global search across persons, relationships, sources |
| `/settings` | `SettingsView` | Settings: theme, appearance, text size, language, database management, import/export |
| `/quality` | `QualityView` | Data quality checks — row click navigates to entity panel with quality section expanded |
| `/reports` | `ReportsView` | Print-ready reports + framable charts |
| `/media` | `MediaView` | Media library browser |
| `/visualisering`, `/visualisering/:personId` | redirect | Redirect to `/persons`, `/persons/:personId` (legacy) |
| `/database`, `/import-export`, `/link-rules`, `/gazetteers` | redirect | Redirect to `/settings` |
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
GroupLink        { id, group_id, entity_type: 'person'|'place'|'media', entity_id, sort_order, created_at }
Repository       { id, name, address?, city?, postal_code?, state?, country?, phone?, email?, web?, call_number?, notes, created_at }
ResearchTask     { id, priority: number, status: 'open'|'in_progress'|'done'|'stopped', task, notes, result, created_at, updated_at }
TaskLink         { id, task_id, entity_type: 'person'|'place'|'media', entity_id, sort_order, created_at }
Media            { id, file_ref?, title, format?, notes, is_printable: boolean, created_at }
MediaLink        { id, media_id, entity_type: 'person'|'event'|'relationship'|'place'|'source', entity_id, link_type?, sort_order: number, created_at }
MediaRegion      { id, media_id, person_id?, x: number, y: number, width: number, height: number, label?, created_at }
```

## Database Schema

16 tables with foreign keys and cascade deletes. Schema in `src/api/schema.ts`, applied via `initializeSchema(db)` (idempotent).

| Table | Key Columns | FK Cascades |
|-------|-------------|-------------|
| `persons` | id, sex, notes (living is derived from events at read time) | — |
| `person_names` | person_id, given_name, surname, name_type, sort_order, preferred_name, nickname | person_id → CASCADE |
| `relationships` | type, person1_id, person2_id, subtype, notes | person1/person2 → CASCADE |
| `events` | event_type, date_type, date_value, date_value_end, date_original, place_id, place_address, cause, description, relationship_id | relationship → SET NULL, place → SET NULL |
| `event_participants` | event_id, person_id, role (UNIQUE event+person) | both → CASCADE |
| `places` | name, normalized_name, place_type, latitude, longitude, parent_place_id, date_from, date_to, notes, street, postal_code, city, country | parent → SET NULL |
| `sources` | title, author, publication_info, repository, url, source_type, call_number, abstract | — |
| `citations` | source_id, page, confidence, transcription, notes, event_id, person_id, relationship_id, place_id | source → CASCADE, event/person/relationship → SET NULL |
| `groups` | name, notes | — |
| `group_links` | group_id, entity_type ∈ {person\|place\|media}, entity_id, sort_order (UNIQUE on triple) | group → CASCADE; entity_id is polymorphic — cleaned up by `deletePerson`/`deletePlace`/`deleteMedia` |
| `repositories` | name, address, city, postal_code, state, country, phone, email, web, call_number, notes | — |
| `source_repositories` | source_id, repository_id (UNIQUE) | both → CASCADE |
| `research_tasks` | priority, status, task, notes, result | — |
| `task_links` | task_id, entity_type ∈ {person\|place\|media}, entity_id, sort_order (UNIQUE on triple) | task → CASCADE; entity_id is polymorphic — cleaned up by `deletePerson`/`deletePlace`/`deleteMedia` |
| `media` | file_ref, title, format, notes, is_printable | — |
| `media_links` | media_id, entity_type, entity_id, link_type, sort_order | media → CASCADE |
| `media_regions` | media_id, person_id, x, y, width, height, label | media → CASCADE, person → SET NULL |
| `gazetteers` | id, name, locale, description, source_json, data (BLOB), created_at | — |

---

## API Functions (`src/api/`)

Every function takes `db: Database` as its first argument. Returns domain types from `types.ts`.

### persons.ts
```
createPerson(db, { sex?, notes?, given_name?, surname? }) → Person
getPerson(db, id) → Person | null   // Person.living is derived: no death/burial/cremation event AND birth (if any) within last 120 years
listPersons(db) → (Person & { given_name, surname })[]
updatePerson(db, id, { sex?, notes? }) → Person | null
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
addGroupLink(db, groupId, entityType, entityId) → GroupLink
removeGroupLink(db, linkId) → boolean
removeGroupLinkByEntity(db, groupId, entityType, entityId) → boolean
getGroupLinks(db, groupId) → GroupLink[]
getGroupsForPerson(db, personId) → Group[]
getGroupsForPlace(db, placeId) → Group[]
getGroupsForMedia(db, mediaId) → Group[]
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
createResearchTask(db, { task, notes?, result?, priority?, status? }) → ResearchTask
getResearchTask(db, id) → ResearchTask | null
listResearchTasks(db) → ResearchTask[]
getResearchTasksForPerson(db, personId) → ResearchTask[]
getResearchTasksForPlace(db, placeId) → ResearchTask[]
getResearchTasksForMedia(db, mediaId) → ResearchTask[]
updateResearchTask(db, id, { task?, notes?, result?, status?, priority? }) → ResearchTask | null
deleteResearchTask(db, id) → boolean
addTaskLink(db, taskId, entityType, entityId) → TaskLink
removeTaskLink(db, linkId) → boolean
getTaskLinks(db, taskId) → TaskLink[]
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
getAliveInYear(db, year) → { year, persons: AlivePerson[] }  // Everyone alive in target year with computed age + living flag
```

---

## IPC Bridge

### How it works

All ~131 IPC channels are defined once in `src/shared/channels/` via `defineChannel()`. The registry drives three layers automatically:

1. **Main process** (`src/main/ipc/index.ts`): walks `channelRegistry` — worker channels get `wrapHandler('foo:bar', (...args) => callWorker('foo:bar', ...args))`; main-thread channels get `wrapHandler('foo:bar', (...args) => ch.handler(...args))`
2. **Worker dispatch** (`src/main/db-worker.ts`): checks the registry first on every message; registry worker channels are dispatched before the small legacy fallback table
3. **Preload** (`src/preload/index.ts`): **hand-maintained** map of `window.api.<domain>.<method>` to `ipcRenderer.invoke('domain:method', ...)`. Adding a `defineChannel` does NOT auto-expose it here — you must add the matching line in the preload's domain block. `tests/unit/preload-coverage.test.ts` parses the preload as text and fails CI if any registry channel is missing. Mutating channels are wrapped via the local `mutating()` helper so `onDataChanged` listeners fire.
4. **Renderer**: Vue components call `window.api.persons.create(...)` etc. The `window.api` surface is **typed** — `ApiSurface<typeof channelRegistry>` derives the type at compile time, no loose `Record<string, …>` casts needed

A small set of channels cannot fit the registry pattern and are registered separately:
- `src/main/ipc/database.ts`: `db:getCurrent/getRecent/createNew/switchTo/openExisting`, `undo:undo/redo` (need post-call BrowserWindow broadcast), `backup:*`
- `src/main/ipc/media.ts`: `media:attach`, `media:openFile` (Electron dialog + fs); `media:getFilePath`, `media:readAsDataUrl` (worker-local `getDbDir()`)
- `src/main/ipc/main-only.ts`: `checks:*` (worker-local cancellation state), `chart:*`, `print:*`, `csv:export`, `export:openFolder` (Electron dialog / BrowserWindow / fs)
- `src/main/ipc/import.ts`, `src/main/ipc/website-export.ts`: file dialog + fs operations

### Adding a new worker channel

One step: add a `defineChannel` entry to the appropriate `src/shared/channels/<domain>.ts` file:

```typescript
defineChannel({
  name: 'foo:bar',
  thread: 'worker',
  mutating: true,           // set true if this write — triggers onDataChanged in renderer
  handler: (db, arg: string) => api.createFoo(db, arg),
});
```

The registry walk in `index.ts` registers `ipcMain.handle`, the worker dispatch loop calls the handler, and the preload walk adds `window.api.foo.bar` — all automatically. No edits to three separate files.

The domain file must be imported in `src/shared/channels/index.ts` (one line).

### Adding a main-only channel

Same `defineChannel` with `thread: 'main'`. The handler runs on the main thread (no `db` argument). For channels that need Electron APIs unavailable in shared code, register manually via `wrapHandler` in the appropriate `src/main/ipc/*.ts` file instead.

### Enforcement

- `tests/unit/ipc-worker-coverage.test.ts` — every `wrapHandler` call resolves to a worker handler, registry entry, or `MAIN_THREAD_ONLY_CHANNELS`; fails immediately if a channel is registered but has no handler
- `tests/unit/static-api-coverage.test.ts` — the static build's `staticApi` mirrors the registry surface

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

Always use `<BaseSubPanel>` from `src/renderer/components/modals/` — it handles overlay, Escape key, focus trap, and the entity-colored header. Click-outside does NOT close modals. Save labels use action verbs and are auto-derived per entity; override with `save-label` if needed. Use `tone="danger"` for destructive confirmations and `hide-save` for purely informational dialogs.

```vue
<BaseSubPanel
  entity-type="person"
  :title="$t('persons.addTitle')"
  mode="standalone"
  @cancel="$emit('close')"
  @save="handleSave"
  @close="$emit('close')"
>
  <div class="ep-fields">
    <div class="ep-field">
      <span class="ep-field-label">{{ $t('persons.name') }}</span>
      <input class="ep-input" v-model="form.name" />
    </div>
  </div>
</BaseSubPanel>
```

For nested modal flows (e.g. picking a source from inside an event), set `mode="subpanel"` on the inner modal and render it inside the parent's `#subpanels` slot — they appear side-by-side instead of stacking.

### List View + Side Panel Pattern

This is the universal pattern for every entity (persons, relationships, sources, places, groups, research tasks). There are **no DetailView components** — every list/tree view hosts its own resizable side panel, and `:id` routes pre-select the entity inside that view.

**Structure (every list view):**
- Left pane: list/table/map/tree of entities with `selectedId` highlighted
- Drag handle (`<div class="panel-drag-handle">`) bound to `usePanelResize({ storageKey, maxWidthRatio })`
- Right pane: `<EntityPanel :entity-id="selectedId" @close="closePanel" />` rendered when `panelOpen && selectedId`
- "▶" reopen button when panel is closed
- `localStorage` keys: `<entity>-selected-id`, `<entity>-panel-open`, `<entity>-panel-width`

**Routing:** `/entity` shows the list; `/entity/:id` shows the same view with the panel pre-selected. Use `route.params.id` in `onMounted` and `onActivated` to drive `selectId(id)`.

**Cross-entity links:** Clicking a related entity inside a panel navigates to that entity's list view (which auto-opens its panel) — never inline-editing across entity types.

**Editing:** All create/edit happens in modals (`<EntityModal mode="standalone">`) opened from inside the panel header or section action buttons. There are no auto-save fields scattered through the panel — most edits go through the modal.

### Person Section Component Pattern

**Every per-person data section is a reusable component**, shared between `PersonsView` (when used in list mode) and `PersonPanel` (the side panel hosted in PersonsView). **Never inline a section in just one view** — extract it as a component from the start.

Two flavours:

**Self-loading** (`PersonIdentifiersSection`, `PersonMediaSection`, `PersonChecksSection`, `EventList`):
- Takes `personId: string` prop
- Loads its own data with `watch(() => props.personId, load, { immediate: true })` — **never `onMounted`** — so it reacts when the panel switches person without being destroyed/recreated
- Uses `defineExpose({ action })` when the parent's header button must trigger something inside (e.g. open add form, file picker)

**Prop-driven** (`PersonNamesTable`, `ResearchTasksTable`, `GroupsTable`):
- Parent fetches data and passes it as a prop; component emits `updated` / `remove` / `edit` / `delete` back up
- Reusable across list views (e.g. `ResearchTasksTable` is used in `ResearchTasksView` and `PersonPanel`)

Parent structure is always the same — the component renders only the table/content:
```vue
<section class="panel-section">
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
| `AppAvatar` | `personId?: string`, `givenName?: string`, `surname?: string`, `sex?: 'M'\|'F'\|'U'`, `size?: 'sm'\|'md'\|'lg'\|'xl'\|'2xl'\|'auto'`, `src?: string` | The single profile-picture component used everywhere — list rows, panels, mini cards. Square (`--radius-sm`), face-cropped via `useProfilePicStore` when `personId` is set. Falls back to sex-colored initials. Sizes: `sm`=20, `md`=28, `lg`=36, `xl`=56, `2xl`=64; `auto` lets the parent control width/height for arbitrary frames. Charts (Pedigree/Hourglass/Descendant) and the Life-on-One-Page report don't render `AppAvatar` directly (SVG / larger crop) but pull the same face-cropped source via `chartData.fetchPersonNode` / `cropImageToDataUrl`, so they stay in sync — the `profilePic` store's `invalidatePerson` propagates into both layers. |
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
| `DateInput` | `dateType`, `dateValue`, `dateValueEnd`, `dateOriginal` (all string) | `update:dateType`, `update:dateValue`, `update:dateValueEnd`, `update:dateOriginal` | Single monospace `YYYY-MM-DD` text field with the calendar icon embedded on the right edge (matches native `<input type="date">`). Date-type select to its left, original-text row below. Accepts partial dates (`1842`, `1842-03`); clicking the icon opens the native picker. Shows the second field only when type is `between`. |
| `SimpleDateInput` | `modelValue: string` (YYYY-MM-DD or partial) | `update:modelValue` | Same single-field-with-embedded-calendar style as `DateInput`, without the `date_type`/end-date/original rows. Used for plain ISO dates like citation `date_accessed`. |
| `BaseSubPanel` | `entityType: EntityType`, `title: string`, `mode: 'standalone'\|'subpanel'`, `saveLabel?: string`, `cancelLabel?: string`, `hideSave?: boolean`, `tone?: 'info'\|'warning'\|'danger'`, `icon?: string` | `cancel`, `save`, `close` | Universal modal shell driven by `ENTITY_VISUALS` registry. `standalone` renders a centered modal; `subpanel` renders side-by-side inside a `#subpanels` slot. Handles header color, save button, escape, focus trap. Every entity modal in the app uses this. |
| `EventModal` | `personId?`, `relationshipId?`, `editingEvent?: object\|null`, `mode?: 'standalone'\|'subpanel'` | `close`, `cancel`, `saved` | Create/edit event with embedded place picker and citation sub-panel. Replaces the old `EventForm`/`EventFormBody` pair. |
| `EventList` | `personId?: string`, `relationshipId?: string`, `placeId?: string`, `readonly?: boolean`, `hideHeader?: boolean`, `showPersons?: boolean` | — | Self-loading event table with edit/delete. Embeds `EventModal`. Exposes `openAddForm()` via `defineExpose`. `showPersons` adds a participant names column (used in PlacePanel). Uses `watch` for reactive reloading on prop changes. |
| `CitationModal` | `sourceId?: string`, `sourceTitle?: string`, `editingCitation?: object\|null`, `eventId?`/`personId?`/`relationshipId?`/`placeId?: string`, `mode?: 'standalone'\|'subpanel'` | `close`, `cancel`, `saved` | Create/edit citation. When `sourceId` is preset (e.g. from EventModal) shows readonly source field; otherwise embeds `SourcePicker` and pre-fills from `useSourceSession`. |
| `PersonModal` | `prefillPlaceId?`, `prefillSurname?: string`, `relatedTo?: { personId: string, mode: 'father'\|'mother'\|'spouse'\|'child' }` | `close`, `saved(person)` | Add/edit person. When `relatedTo` is set, also creates the relationship + appropriate parent_child link, auto-infers sex (father→M, mother→F, spouse→opposite), pre-fills surname for child mode. Embeds optional first event via inline event details (DateInput + PlacePicker + CitationFields). Submits via `window.api.persons.createWithEvent`. Folds the legacy `AddPersonModal` and `AddRelatedPersonModal`. |
| `PlaceModal`, `RelationshipModal`, `GroupModal`, `SourceModal`, `ResearchTaskModal`, `PersonNameModal`, `PersonIdentifierModal`, `LinkRuleModal`, `MergePersonsModal` | per-entity props, all support `mode?: 'standalone'\|'subpanel'` and `editing*?: object\|null` for edit mode | `close`, `cancel`, `saved` | Per-entity modals built on `BaseSubPanel`. Standalone mode is the default; subpanel mode is used when nested from another modal (e.g. inline source creation from CitationModal). |
| `ConfirmModal` | `visible: boolean`, `title: string`, `message: string`, `tone?: 'info'\|'warning'\|'danger'`, `icon?: string`, `confirmLabel?: string` | `confirm`, `cancel` | Accessible confirmation modal. Default tone is `danger` (red save button) — used for delete confirmations. |
| `PlacePicker` | `modelValue: string\|null`, `placeholder?: string` | `update:modelValue`, `select(place)` | Searchable autocomplete for places. 150ms debounced search via `window.api.places.search()`. Creates new place inline via `findOrCreate`. |
| `SourcePicker` | `modelValue: string\|null`, `placeholder?: string` | `update:modelValue`, `select(source)` | Searchable autocomplete for sources. 150ms debounced search via `window.api.sources.search()`. Creates new source inline. Shows all sources on focus when field is empty. |
| `PersonNamesTable` | `names: NameRow[]` | `edit(name)`, `delete(nameId)` | Names table with ★ primary indicator. Prop-driven. |
| `ResearchTasksTable` | `tasks: ResearchTaskRow[]`, `showPerson?: boolean` | `updated` | Inline-expand-to-edit task rows, status chip cycling, priority badge. Prop-driven. |
| `GroupsTable` | `groups: GroupRow[]`, `showMembers?: boolean` | `remove(id)` | Groups table with clickable rows (→ `/groups/:id`) and remove button. Prop-driven. |
| `PersonIdentifiersSection` | `personId: string` | — | Self-loading identifiers table + add modal. Exposes `openAddForm()`. |
| `PersonMediaSection` | `personId: string` | — | Self-loading media table with open/unlink/reorder (up/down). First item shows "Profile" badge. Emits `profileChanged` when media order changes. Exposes `attach()` and `reload()`. |
| `PersonChecksSection` | `personId: string` | — | Self-loading quality checks table with per-row ignore/restore. Exposes `reload()`. Shares ignore state with QualityView. |
| `PedigreeListView` | `tree: PedigreeTree \| null` | — | Accessible nested list alternative to pedigree chart |
| `LinkedText` | `text: string` | — | Auto-links structured references in text. Loads `link_rules_config` from db settings on mount and applies `resolveRules()` to filter by enabled locales. Renders matches as `<a>` tags that open in system browser via `shell.openExternal`. |
| `PersonPanel` | `personId: string\|null` | `close` | Side panel for a person — host: PersonsView. Collapsible sections (names, events, identifiers, relationships, groups, tasks, media, notes, checks). Edit through PersonModal opened from the header. |
| `PlacePanel` | `placeId: string\|null` | `close` | Side panel for a place — host: PlacesView. 8 collapsible sections: info, events, persons, media, citations, child places, notes, coordinates. |
| `SourcePanel` | `sourceId: string\|null` | `close` | Side panel for a source — host: SourcesView. Sections: source fields, citations (with inline CitationModal), repositories, media, quality. |
| `RelationshipPanel` | `relationshipId: string\|null` | `close` | Side panel for a relationship — host: RelationshipsView. Sections: type/subtype, person1/person2 pickers, events (`EventList` with `relationshipId`), citations, media. |
| `GroupPanel` | `groupId: string\|null` | `close` | Side panel for a group — host: GroupsView. Sections: name/notes, members (PersonPicker add + remove). |
| `ResearchTaskPanel` | `taskId: string\|null` | `close` | Side panel for a research task — host: ResearchTasksView. Sections: task text, notes, result, status, priority, linked person. |
| `MediaPanel` | `mediaId: string\|null`, `drawMode?`, `highlightedRegionId?` | `close`, `link-changed`, `region-deleted`, `media-updated`, `open-viewer`, `start-draw-mode`, `stop-draw-mode`, `highlight-region` | Side panel for a media item — host: MediaView. Header: thumbnail, editable title input, **Open** button (soft, sm — emits `open-viewer`, MediaView routes to `openViewerById`). Sections: notes, linked persons/places/events, face tags (with star → set as profile pic), quality. Emits `media-updated` on title/notes blur so MediaView can patch its items array and the live MediaViewer caption preview updates without reload. |
| `MediaViewer` | `mediaItems: MediaItem[]`, `initialIndex`, `thumbnails`, `drawMode`, `highlightedRegionId` | `close`, `update:currentIndex`, `regionDrawn`, `regionUpdated`, `regionClicked`, `regionHovered` | Full-canvas viewer mode of MediaView. White surface background. Toolbar shows just `current / total` counter (no filename — that's in the panel; close button moved to MediaView heading). Image-stack: image-wrapper (translate+scale via `useImageZoom`) + `MediaCaption` sibling whose `transform` is computed from the same pan/zoom so the caption follows the picture during zoom and pan. `ZoomControls overlay show-fit` floats bottom-right. Filmstrip below for multi-item navigation. Caption click on a name routes `/persons/:id` and emits close. |
| `MediaCaption` | `faceTags: CaptionFaceTag[]`, `notes?`, `inferredDateISO?`, `contextLine?`, `relations?`, `linkedPersonIds?`, `showCaptions?`, `showNotes?`, `hrefBuilder?` | `personClick(personId, event)` | Reusable italic caption block: optional context line + "From left: …" face list + optional date + notes. Used by both `MediaChronological` (report — passes `hrefBuilder = id => '#person-' + id` and scrolls to in-page anchor) and `MediaViewer` (preview — handles personClick by routing to `/persons/:id`). Single source of truth so the report and viewer preview can never drift visually. |
| `FaceTagOverlay` | `regions`, `imageWidth`, `imageHeight`, `drawMode`, `highlightedId` | `region-drawn`, `region-updated`, `region-clicked`, `region-hovered` | SVG overlay that draws blue boxes for each face region on the viewer image. Supports drag-to-create (when `drawMode`), drag-to-resize, hover/click to highlight. Region labels render below each box without a text-shadow halo. |
| `PlacePersonsSection` | `placeId: string` | — | Self-loading table of persons linked to events at a place. Shows person name, event type, and date. |
| `PlaceCitationsSection` | `placeId: string` | — | Self-loading table of citations linked to a place. |
| `EntityMediaSection` | `entityType: string`, `entityId: string` | — | Generic media section for any entity type (person, place, event, source, relationship). Used by every panel that hosts media. |
| `ChartExportControls` | `paperSize`, `orientation`, `colorMode`, `tileCount: {count,rows,cols}\|null` | `update:paperSize`, `update:orientation`, `update:colorMode`, `saveSvg`, `savePdf` | Paper-size, orientation, color-mode, and Save SVG / Save tiled PDF controls. Used in the 4 chart tab headers in `ReportsView` (pedigree/hourglass/descendant/fan). Pure presentational component; parent owns state and handlers. |
| `ReportPanel` | `activeTab: string`, `coupleRelationships: RelationshipOption[]`, `tileCountInfo: {count,rows,cols}\|null` | `print`, `export-pdf`, `save-svg`, `save-chart-pdf` | Right-side print-configuration panel following the PersonPanel/PlacePanel pattern. Sections: Subject (person/couple/place picker), Options (checkboxes), Appearance (selects, ranges, orientation toggle). Print/Export buttons sticky at bottom. All config state lives in useReportConfigStore. Used in ReportsView alongside the report preview. |

**Composables:**
| Composable | Purpose |
|-----------|---------|
| `usePlaceResolver` | Render-time place resolution via gazetteers. Loads config from db_settings, caches results in session. Used by PlacesView (map + PlacePanel) and PersonMap. |
| `usePanelResize` | Drag-resize side panels. Each view passes a `storageKey` (e.g. `persons-panel-width`) and a `maxWidthRatio`. |
| `usePanelSections` | Generic collapsible-section state for every entity panel. Takes a storage prefix + defaults (and optional static-mode defaults), persists per-section open/closed flags in localStorage. Used by PersonPanel/PlacePanel/SourcePanel/RelationshipPanel/GroupPanel/ResearchTaskPanel/MediaPanel/ReportPanel. |
| `useChartExport` | SVG export helpers (`buildExportSvgString`, `wrapWithTitle`). Used by `ReportsView` chart tabs to serialize the rendered chart SVG before calling `window.api.chart.saveSvg` / `saveTiledPdf`. |
| `usePersonProfilePic` | Reactive `{ src, loading }` for a person's cropped profile picture. Wraps `useProfilePicStore`. Used automatically by `AppAvatar` when `personId` is set. |
| `useLifeMap` | Resolves a person's life events into map coordinates via gazetteers. Returns ordered waypoints (birth → marriages → death) with latitude/longitude. Used by `LifeMap` primitive + A Life / A Marriage / Life on One Page reports. |
| `useMediaChronological` | Loads media items sorted by the first dated event each is attached to, falling back to created_at. Returns items with optional caption context (person, event type, date, place). Used by `MediaChronological` primitive + Photo Album / A Life / A Marriage / Place Chronicle reports. |
| `usePagedList` | Server-paged list with debounced filter, stale-response guard, reset-on-filter/sort, and built-in IntersectionObserver wiring. Used by PersonsListTab/PlacesView/SourcesView/MediaView so all four left-list panels filter and sort across the whole DB, not just the loaded page. Each domain exposes a matching `listPage(limit, offset, sortBy, sortDir, query?)` channel returning `{ items, total }`. |

**Reports (`src/renderer/components/reports/`):**

Seven keepsake reports + six framable chart prints, arranged into two tab groups in `ReportsView`. All reports read what the genealogist authored — no inferred prose.

| Report | File | Subject | Description |
|--------|------|---------|-------------|
| **A Life** | `ALifeReport.vue` | person | Life map, visual timeline, family, events, notes, photos, sources appendix |
| **A Marriage** | `AMarriageReport.vue` | relationship | Dual life map, shared timeline, couple, children grid, narrative, photos |
| **Place Chronicle** | `PlaceChronicleReport.vue` | place | Boundary map, persons, events, description, photos, child places |
| **Your Ancestors** | `YourAncestorsReport.vue` | person | Fan chart cover, full-page fan, per-ancestor pages with ahnentafel, surname index |
| **Life on One Page** | `LifeOnOnePageReport.vue` | person | Framable single-sheet: portrait, map, key dates, photo grid, notes snippet |
| **Family in Year X** | `FamilyInYearReport.vue` | year | Snapshot of everyone alive in a target year with family units (uses `getAliveInYear`) |
| **Photo Album** | `PhotoAlbumReport.vue` | person/relationship/place/all | Chronological media gallery with captions |
| Pedigree Print | `PedigreeChartReport.vue` | person | Framable pedigree chart |
| Hourglass Print | `HourglassChartReport.vue` | person | Framable hourglass chart |
| Descendant Print | `DescendantChartReport.vue` | person | Framable descendant chart |
| Fan Chart Print | `FanChartReport.vue` | person | Framable fan chart |
| Timeline Print | `TimelineChartReport.vue` | person | Framable timeline chart |

**Report primitives (`src/renderer/components/reports/primitives/`):**

Six shared print-safe components used across multiple reports. All use `--report-*` design tokens for consistent typography and layout.

| Primitive | Props | Description |
|-----------|-------|-------------|
| `ReportCover` | `title: string`, `subtitle?: string`, `subject?: string`, `researcherName?: string`, `date?: string` | Full-page report cover with accent band, title block, and compiled-by attribution |
| `PersonMiniCard` | `person: PersonSummary`, `redactLiving?: boolean` | Compact portrait + name + dates card for grids (children, ancestors, family snapshots). When `redactLiving` and person is living: decade-only date, no portrait, no notes |
| `TimelineBar` | `events: TimelineEntry[]`, `start?: number`, `end?: number` | Horizontal visual timeline with event markers scaled by year |
| `LifeMap` | `personId: string` (or `personIds: string[]`) | Leaflet map of life waypoints via `useLifeMap`. Used by A Life, A Marriage, Life on One Page |
| `PlaceBoundaryMap` | `placeId: string` | Leaflet map showing boundary polygon + pin for a place. Used by Place Chronicle |
| `MediaChronological` | `personId?`/`relationshipId?`/`placeId?`/`all?: boolean`, `layout?: 'grid'\|'gallery'` | Chronologically ordered media gallery via `useMediaChronological`. Used by Photo Album, A Life, A Marriage, Place Chronicle |

**Pinia Stores:**
| Store | Purpose |
|-------|---------|
| `sourceSession` | Remembers last-used source ID and page for citation pre-fill across forms. Session-only (resets on app restart). |
| `profilePic` | Per-person cached cropped profile picture data URLs. Dedupes `readAsDataUrl` calls across rows (3 people in 1 photo = 1 fetch). Invalidated on region/link mutations. |
| `reportConfig` | All print-configuration state for reports: subject IDs (person/couple/place), per-report toggle flags, appearance settings, couple relationships list. Shared between ReportsView and ReportPanel. |

**Person Section Component pattern:** Every per-person data section is a reusable component used inside `PersonPanel` (the side panel hosted by `PersonsView`). Self-loading components (`PersonIdentifiersSection`, `PersonMediaSection`, `PersonChecksSection`, `EventList`) use `watch(() => props.personId, load, { immediate: true })` — never `onMounted` — so they reload when the panel switches person. The parent owns the `<section>` header and action button; the component renders only the table/content. See the `add-feature` skill for the full pattern, templates, and wiring examples.

### UI Design System

**Design tokens** are defined in `src/renderer/styles/tokens.css` (imported first in `main.ts`). Three color themes (Forest, Nordic, Twilight) set sidebar, surface, text, and accent token values. Semantic tokens (`--error-*`, `--warning-*`, `--success-*`, `--info-*`, `--sex-*`) are theme-invariant *at the base level*, but each appearance mode (dark, high-contrast) can override them. Dark and high-contrast modes override tokens in `shared.css` **per theme** — `html.dark.theme-forest`, `html.high-contrast.theme-nordic`, etc. mirror the base theme's color identity while adjusting luminance and saturation for the mode. **Always use token variables** — never hardcode hex colors.

**WCAG 2.1 AAA compliance** is enforced for high-contrast mode by `tests/unit/wcagContrast.test.ts`, which parses `tokens.css` + `shared.css`, builds the effective palette for every (theme × appearance) combination, and asserts ≥7:1 contrast for body text / ≥4.5:1 for large text / ≥3:1 for non-text UI. Light and dark modes are regression-tested against WCAG AA (≥4.5:1 / ≥3:1). When changing any color token, run `npx vitest run tests/unit/wcagContrast.test.ts` — the failure messages include the exact ratio and what threshold it needs to hit. The WCAG math lives in `src/renderer/utils/wcag.ts` (`contrastRatio(fg, bg)`, `relativeLuminance(hex)`, `wcagThreshold(level, size)`).

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
- Side panels: `.side-panel` (right-side entity panels — bakes in surface/radius/shadow + 28px left padding for the collapse tab), `.list-column` (left-side list columns — bakes in surface/radius/shadow + 28px right padding for the collapse tab)

**Design token categories** (from `tokens.css`):
```css
/* Sidebar */     --sidebar-bg, --sidebar-text, --sidebar-text-muted, --sidebar-active-bg, --sidebar-active-text, --sidebar-border
/* Surface */     --surface-bg, --surface, --surface-hover, --surface-border, --surface-border-subtle
/* Text */        --text-primary, --text-secondary, --text-muted
/* Accent */      --accent, --accent-hover, --accent-text
/* Semantic */    --error-bg/text, --warning-bg/text, --success-bg/text, --info-bg/text
/* Sex badges */  --sex-m-bg/text, --sex-f-bg/text, --sex-u-bg/text
/* Fan branches */--fan-branch-1, --fan-branch-2, --fan-branch-3, --fan-branch-4 (per-theme, read by readThemeColors())
/* Spacing */     --space-xs(4) --space-sm(8) --space-md(12) --space-lg(16) --space-xl(24) --space-2xl(32)
/* Typography */  --font-xs(11) --font-sm(13) --font-base(14) --font-md(15) --font-lg(16)
/* Shape */       --radius-sm(4) --radius-md(6) --radius-lg(10) --radius-full(9999)
/* Shadows */     --shadow-sm, --shadow-md, --shadow-lg
/* Reports */     --report-serif-stack, --report-prose-leading, --report-page-max-width, --report-cover-accent-height
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
5. **Render** — real → solid boxes, outlines → dashed boxes with "+". Click handlers open `PersonModal` with `relatedTo` set.

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
./.devcontainer/dev-debug.sh # Launch with Chrome DevTools Protocol (CDP port 9222)
./.devcontainer/dev-debug.sh 9223 19242  # Custom ports for parallel instances
npm run lint           # Run ESLint (must pass with 0 errors before committing)
npm test               # Run unit + component tests (Vitest, ~2120 tests)
npm test -- --coverage # Run with coverage report (80% threshold on src/api/)
npm run test:e2e       # Package Electron app, then run Playwright (~30s end-to-end)
npx playwright test    # Run E2E directly — assumes `out/` is already built
npm run build:static   # Build static SPA bundle (dist-static/)
npm run dev:static     # Dev server for static SPA at localhost:5174
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
npm run test:e2e                        # Package + E2E tests (requires Xvfb running)
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

Tests live in `tests/e2e/` and run against the **packaged Electron binary**, not `electron-forge start`. `npm run test:e2e` calls `npm run package` first via `pretest:e2e`, then runs Playwright. This avoids Vite-dev contention and matches what users actually run.

Five tests total, all under 20s:
- `app.test.ts` — packaged app boot, prod MCP, dev MCP (3 cases)
- `crud-roundtrip.test.ts` — one IPC round-trip across persons/places/sources/relationships/events/citations (1 case)
- `website-export.test.ts` — filesystem export round-trip (1 case)

Each test uses `startApp(port, tag)` from `fixture.ts`, which spawns the packaged binary with a temp DB and waits for HTTP + Vue mount. UI control via the in-app `ui-server` on `SLAKTFORSKNING_UI_PORT`.

**What e2e does NOT cover** (and shouldn't): UI rendering, modals, filter chips, status cycling, search filtering, badge rendering, theming, form validation, route config — these are in `tests/components/` and `tests/unit/`. The api/ layer is exhaustively unit-tested against in-memory SQLite. E2e exists only for things that can only diverge at runtime (real packaging, real IPC chain, real filesystem).

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

`src/api/db_settings.ts` provides `getDbSetting(db, key)`, `setDbSetting(db, key, value)`, `deleteDbSetting(db, key)` backed by the `db_settings` table (key TEXT PK, value TEXT). Known keys: `default_person_id` (tree subject / proband — auto-set on GEDCOM import when an `_INDI` ID matches; editable in DatabaseView; used for startup navigation), `link_rules_config` (JSON, link rule overrides), `gazetteer_config` (JSON `{ enabledGazetteers: string[] }`, auto-set to `["sv-parishes"]` on Genney import), `event_defaults_config` (JSON `{ smartDefaults: boolean }`, default `true` — controls smart event-type suggestions via `suggestNextEventType` in EventList "+ Add Event" and PersonModal's embedded event section; configurable in Settings → Defaults tab), `researcher_name` (string — genealogist's name used as "Compiled by …" attribution on report covers and in report header/footer; configurable in Settings), `researcher_address` / `researcher_phone` / `researcher_email` (strings — researcher contact details; rendered into report header/footer and emitted as GEDCOM `SUBM` `ADDR` / `PHON` / `EMAIL` on export), `report_show_header_footer` (string `'1'` or `'0'` — whether keepsake reports render the header/footer band; default on). Exposed to renderer via `window.api.db.getSetting(key)`, `window.api.db.setSetting(key, value)`, `window.api.db.deleteSetting(key)`.

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
| `forge.config.ts` | Electron Forge config — two main entries: `index.ts` + `db-worker.ts` |
| `vite.main.config.ts` | Main process build + WASM copy plugin + gazetteer externalization |
| `vite.worker.config.ts` | DB Worker build — same plugins as main (worker imports gazetteer code) |
| `vite.preload.config.ts` | Preload build (`entryFileNames: 'preload.js'` — avoids collision) |
| `vite.renderer.config.ts` | Renderer build (`root: src/renderer`, `outDir` resolves to project root) |
| `vite.static.config.ts` | Static SPA build (VITE_STATIC_MODE=true, outDir=dist-static) |
| `vitest.config.mts` | Unit test config |
| `playwright.config.ts` | E2E test config |
| `tsconfig.json` | TypeScript config |

---

## Related Docs

| File | Audience | Content |
|------|----------|---------|
| `README.md` | Humans | Quick start, features, project structure |
| `CLAUDE.md` | Agents | This file. Complete architecture reference |
| `docs/PLAN.md` | Both | Active roadmap — active/planned/backlog milestones only |
| `docs/DATA_MODEL.md` | Both | Schema design, GEDCOM compatibility (also bundled in `/data-modeling` skill) |
| `docs/MCP.md` | Both | MCP server tools (also bundled in `/mcp-dev` skill) |
| `docs/IPC_REFERENCE.md` | Agents | Complete `window.api` surface + IPC channel mapping |
| `.claude/napkin.md` | Agents | Per-repo runbook with recurring gotchas |

## Skills

### Project Skills (`.claude/skills/` — checked into repo)

| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/commit` | When committing | Stage by explicit path — bundle every file in the same concern, never bundle unrelated WIP |
| `/test` | When running/writing tests | Unit test patterns (Vitest), E2E patterns (Playwright) |
| `/electron-dev` | When launching/debugging the app | Dev mode, IPC debugging, common issues |
| `/add-feature` | Adding any new feature or entity | Full 10-step checklist: schema → API → IPC → MCP → Vue |
| `/mcp-dev` | When adding/testing MCP tools | Tool patterns, server testing, tool reference |
| `/data-modeling` | Schema design questions | GEDCOM-X model, this project's schema reference |
| `/gazetteers` | Adding/debugging gazetteers | Build scripts, resolver, data sources, adding new countries |
| `/gazetteer-testing` | Auditing place resolution on real data | Diagnostic script template, outlier buckets, fix locations — pairs with `/gazetteers` |
| `/gedcom` | GEDCOM import/export | GEDCOM 5.5.1/7.0 parsing, validation |
| `/interview-synthesis` | Processing user research | Extract insights from interviews |
| `/web-research` | Competitive analysis | Research genealogy platforms |
| `/performance-profiling` | CPU saturation / slow operations | Profile, analyze, and fix performance bottlenecks |
| `/a11y` | Adding/modifying interactive UI | ARIA patterns, keyboard nav, focus management, TTS |
| `/tree-layout` | Building/modifying chart layouts | Measurement→placement→connection pipeline, footprint spacing, collision avoidance |
| `/reports` | PDF/SVG export, print button, print CSS, chart orientation, fit-to-page | Print=PDF rule, hidden-window anti-pattern, chart-print CSS, orientation mapping, new tab checklist |

### Required Global Skills (`~/.claude/skills/`)

Install on each machine:

```bash
npx skills add anthropics/skills --skill frontend-design -y -g
npx skills add browserbase/skills -y -g
```

### Built-in Skills

`napkin`, `simplify`, `anthropic-skills:skill-creator`, `anthropic-skills:pdf`, `anthropic-skills:docx`, `anthropic-skills:xlsx`, `anthropic-skills:pptx`

### Execution default

**Plan-driven work → worktree + subagents.** After `writing-plans` finishes, create a git worktree (`superpowers:using-git-worktrees`) and then invoke `superpowers:subagent-driven-development`. Do not present the execution-approach choice to the user. Plans are by definition multi-task work that benefits from isolation and fresh-context subagents.

**Small fixes → main is fine.** One-off typo fixes, i18n tweaks, single-file bug fixes, or any change that doesn't warrant a plan file can be done directly on `main` without a worktree.

### Plan + spec path convention (overrides superpowers defaults)

**All plan and design-spec files live under `docs/plans/` — never `docs/superpowers/specs/` or `.claude/plans/`.**

- Design spec: `docs/plans/YYYY-MM-DD-<topic>-design.md` (with `-design` suffix)
- Implementation plan: `docs/plans/YYYY-MM-DD-<topic>.md` (no suffix)
- When a milestone completes: move both to `docs/plans/archive/`

The `superpowers:brainstorming` and `superpowers:writing-plans` skills default to `docs/superpowers/specs/`. **Always override**. When dispatching those skills (either directly or via subagents), say explicitly: "save the design to `docs/plans/YYYY-MM-DD-<topic>-design.md`" and "save the plan to `docs/plans/YYYY-MM-DD-<topic>.md`". Before committing, if any file lives under `docs/superpowers/` or `.claude/plans/`, move it to `docs/plans/` first.

## Conventions

- **UUIDs (v4)** for all primary keys
- **ISO date strings** in DB; genealogy dates use `date_type` + `date_original` to preserve uncertainty
- **SQLite WAL mode** with foreign keys enforced
- **No global DB singletons** in api/ — always pass `db` as parameter
- **Modal dialogs** for create/edit forms — reserve page navigation for detail views
- **Always keep documentation up to date** — After finishing a feature, update `README.md`, `CLAUDE.md`, and `docs/PLAN.md`
- **Commit only the files that belong together** — One commit = one concern. If the working tree has unrelated WIP from a previous session (different feature, different fix), do NOT bundle it into your commit. Stage explicitly by path. Bundle every file your change touched (sources, tests, CHANGELOG, package.json, CLAUDE.md, docs) — never selectively skip a file inside the same concern. If unsure whether a modified file belongs to your concern, ask.
- **Persist plans and design specs** — Write plans and design specs to `docs/plans/` immediately (e.g. `docs/plans/YYYY-MM-DD-description.md`, `docs/plans/YYYY-MM-DD-description-design.md`) and **commit the file in the same step**. Files that are saved but not committed get orphaned on the source branch the moment a worktree is created (the worktree branches from HEAD and the uncommitted file is left behind). Context can be lost. When asked to "continue according to plan", look in `docs/plans/` for the most recent file.
- **Keep plans and roadmap in sync** — When adding a plan or spec to `docs/plans/`, add a matching milestone to `docs/PLAN.md` roadmap with a pointer. When completing a milestone, mark it done in the plan file (checkboxes) and remove it from `docs/PLAN.md`. The roadmap is active work only; CHANGELOG.md is the permanent record.
- **Archive completed plans and specs** — When a milestone is fully complete, move its plan/spec file from `docs/plans/` to `docs/plans/archive/`. Add a `## vX.Y.Z — description` entry to `CHANGELOG.md`. Remove the milestone heading from `docs/PLAN.md` — completed work does not belong there.
- **Version bumps only when work is complete** — Features bump minor (x.Y.0) when done. Fixes bump patch (x.y.Z) when done. Never bump version during partial implementation — intermediate commits within a multi-task feature do not get version bumps. Half a feature is not a release. Bump once in the final commit when the work is complete and tested.
