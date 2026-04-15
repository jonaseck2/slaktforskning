# Design: MCP Server Overhaul — Prod/Dev Split + Workflow Tools

**Date:** 2026-04-15
**Status:** Approved for implementation
**Scope:** Replace 114 CRUD tools with ~35 workflow tools (prod), add ~15 dev tools with chart inspection, split into two MCP server entry points

---

## Motivation

The current MCP server has three problems:

1. **Missing dev tools** — No way to inspect chart state (visible persons, selected person, layout info). Debugging chart layout issues requires the user to take screenshots and relay findings manually. The agent cannot self-serve.
2. **Tool sprawl** — 114 CRUD tools expose internal join tables (event_participants, media_links) that agents should not need to know about. Adding a birth record requires 3-4 separate tool calls.
3. **No dev/prod separation** — UI automation tools (click, navigate, screenshot) ship alongside research tools. Production agents see tools they should not use; dev agents are missing tools they need.

## Architecture

### Two Entry Points, Shared Codebase

```
src/mcp/
├── createProdServer.ts      # Prod server — workflow tools only
├── createDevServer.ts       # Dev server — prod tools + dev-only tools
├── server.ts                # Entry: prod (stdio transport)
├── devServer.ts             # Entry: dev (stdio transport, HTTP bridge)
└── tools/
    ├── prod/                # Workflow-oriented tools (~35)
    │   ├── persons.ts       # Person lifecycle
    │   ├── families.ts      # Relationships, children, ancestor trees
    │   ├── events.ts        # Record events with participants + citations
    │   ├── sources.ts       # Sources and citations
    │   ├── places.ts        # Places and gazetteer resolution
    │   ├── research.ts      # Research tasks, gaps, quality checks
    │   ├── media.ts         # Media attachment and tagging
    │   └── data-management.ts # Import/export, database switching
    └── dev/                 # Dev-only tools (~15)
        ├── ui.ts            # Navigate, screenshot, click, fill, DOM
        ├── chart.ts         # Chart inspection, person selection
        ├── seed.ts          # Test data factories
        └── inspect.ts       # App status, DB stats
```

### Claude Config

```json
{
  "mcpServers": {
    "slaktforskning": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"]
    },
    "slaktforskning-dev": {
      "command": "npx",
      "args": ["tsx", "src/mcp/devServer.ts"]
    }
  }
}
```

The dev server registers ALL prod tools plus dev-only tools. During development, an agent has both research capabilities and UI debugging in one server.

### Renamed Files

| Current | New | Notes |
|---------|-----|-------|
| `src/mcp/createServer.ts` | `src/mcp/createProdServer.ts` | Registers only prod workflow tools |
| `src/mcp/server.ts` | `src/mcp/server.ts` | Unchanged name, calls `createProdServer` |
| — | `src/mcp/createDevServer.ts` | New. Calls `createProdServer` then adds dev tools |
| — | `src/mcp/devServer.ts` | New. DB setup + HTTP bridge + `createDevServer` |
| `src/mcp/tools/*.ts` | `src/mcp/tools/prod/*.ts` | Rewritten as workflow tools |
| — | `src/mcp/tools/dev/*.ts` | New dev tools |

---

## Prod Workflow Tools (~35)

### Persons (8 tools)

| Tool | Description | Replaces |
|------|-------------|----------|
| `create_person` | Create person with name in one call. Optional birth date/place/source creates birth event + participant + citation automatically. | `create_person` + `add_person_name` + `add_event` + `add_event_participant` + `add_citation` |
| `search_persons` | Search persons by name query. | `search_persons` (unchanged) |
| `get_person_summary` | Full person profile: names, events, relationships, citations, groups, tasks. | `get_person` + `get_person_names` + `get_events_for_person` + `get_relationships_of_person` + `get_person_identifiers` + `get_groups_for_person` + `get_research_tasks_for_person` |
| `update_person` | Update person fields and/or primary name. | `update_person` + `update_person_name` |
| `delete_person` | Delete person and all related data. | `delete_person` (unchanged) |
| `add_person_name` | Add alternate name (married, alias, aka). | `add_person_name` (unchanged) |
| `merge_persons` | Merge duplicate persons. | `merge_persons` (unchanged) |
| `find_duplicates` | Find potential duplicate persons. | `find_duplicates` (unchanged) |

#### `create_person` Input Schema

```typescript
{
  // Required
  given_name: z.string(),
  surname: z.string(),
  sex: z.enum(['M', 'F', 'U']).optional(),
  // Optional — creates birth event if any provided
  birth_date?: z.string(),
  birth_date_type?: z.enum(['exact', 'about', 'before', 'after', 'between', 'calculated', 'unknown']),
  birth_place?: z.string(),       // findOrCreate
  // Optional — creates citation if source provided
  source_title?: z.string(),      // findOrCreate source by title
  source_page?: z.string(),
  // Other
  living?: z.boolean(),
  notes?: z.string(),
}
```

### Families (4 tools)

| Tool | Description | Replaces |
|------|-------------|----------|
| `add_relationship` | Create relationship between two persons. Optional marriage/event date/place. | `create_relationship` + `add_event` |
| `add_child` | Create child person + parent_child relationship + optional birth event. | `create_person` + `create_relationship` + `add_event` + `add_event_participant` |
| `get_family_unit` | Couple + both persons + children with birth/death events. | `get_family_unit` (unchanged) |
| `get_ancestor_tree` | Nested ancestor tree to N generations. | `get_ancestor_tree` (unchanged) |

#### `add_relationship` Input Schema

```typescript
{
  person1_id: z.string(),
  person2_id: z.string(),
  type: z.enum(['couple', 'parent_child', 'sibling', 'godparent', 'other']),
  subtype?: z.string(),
  // Optional — creates event if date provided
  event_type?: z.string(),        // e.g. 'marriage', 'divorce'
  event_date?: z.string(),
  event_date_type?: z.string(),
  event_place?: z.string(),       // findOrCreate
  notes?: z.string(),
}
```

#### `add_child` Input Schema

```typescript
{
  // Parent(s)
  parent_id: z.string(),
  other_parent_id?: z.string(),   // creates second parent_child relationship
  // Child
  given_name: z.string(),
  surname: z.string(),
  sex?: z.enum(['M', 'F', 'U']),
  // Optional birth
  birth_date?: z.string(),
  birth_place?: z.string(),
  source_title?: z.string(),
  source_page?: z.string(),
}
```

### Events (3 tools)

| Tool | Description | Replaces |
|------|-------------|----------|
| `record_event` | Record a life event with participants and optional citation. | `add_event` + `add_event_participant` (xN) + `add_citation` |
| `get_timeline` | Chronological person + family events. | `get_timeline` (unchanged) |
| `update_event` | Update event fields. | `update_event` (unchanged) |

#### `record_event` Input Schema

```typescript
{
  event_type: z.string(),         // birth, death, marriage, census, etc.
  // Participants — at least one required
  person_id?: z.string(),         // added as 'primary' role
  person_ids?: z.array(z.object({ id: z.string(), role: z.string() })),
  relationship_id?: z.string(),   // for marriage/divorce events
  // Date
  date_value?: z.string(),
  date_type?: z.string(),
  date_original?: z.string(),
  // Place
  place?: z.string(),             // findOrCreate
  // Source
  source_title?: z.string(),
  source_page?: z.string(),
  confidence?: z.number(),
  // Other
  description?: z.string(),
  cause?: z.string(),
}
```

### Sources & Citations (4 tools)

| Tool | Description | Replaces |
|------|-------------|----------|
| `add_source` | Create a source record. | `add_source` (unchanged) |
| `search_sources` | Search sources by title/author. | `search_sources` (unchanged) |
| `cite` | Attach a citation to an event, person, relationship, or place. Finds or creates source by title. | `add_citation` + optional `add_source` |
| `get_citations_for_person` | All citations linked to a person. | `get_citations_for_person` (unchanged) |

#### `cite` Input Schema

```typescript
{
  // Target — exactly one required
  event_id?: z.string(),
  person_id?: z.string(),
  relationship_id?: z.string(),
  place_id?: z.string(),
  // Source — either source_id or source_title
  source_id?: z.string(),
  source_title?: z.string(),      // findOrCreate
  // Citation details
  page?: z.string(),
  confidence?: z.number(),        // 0-3 GEDCOM QUAY
  transcription?: z.string(),
  notes?: z.string(),
}
```

### Places (4 tools)

| Tool | Description | Replaces |
|------|-------------|----------|
| `add_place` | Create a place with optional coordinates and parent. | `add_place` (unchanged) |
| `search_places` | Search places by name. | `search_places` (unchanged) |
| `get_place_history` | All events at a place with participants. | `get_place_history` (unchanged) |
| `resolve_place` | Look up a place name against gazetteers. | `resolve_place` (unchanged) |

### Research (4 tools)

| Tool | Description | Replaces |
|------|-------------|----------|
| `get_research_gaps` | Missing birth/death/parents, unsourced events. | `get_research_gaps` (unchanged) |
| `add_research_task` | Create a research task linked to a person. | `create_research_task` (unchanged) |
| `update_research_task` | Update task status, notes, result. | `update_research_task` (unchanged) |
| `run_checks` | Run quality checks. Optional person_id to scope. | `run_checks` + `run_checks_for_person` (merged) |

### Media (3 tools)

| Tool | Description | Replaces |
|------|-------------|----------|
| `attach_media` | Create media record and link to entity in one call. | `create_media` + `add_media_link` |
| `tag_person_in_media` | Tag a person's face/area in a media item. | `create_media_region` |
| `get_media_for_person_context` | All media linked to a person with context. | `get_media_for_person_context` (unchanged) |

#### `attach_media` Input Schema

```typescript
{
  title: z.string(),
  file_ref?: z.string(),
  format?: z.string(),
  notes?: z.string(),
  // Link target — exactly one required
  entity_type: z.enum(['person', 'event', 'relationship', 'place', 'source']),
  entity_id: z.string(),
  link_type?: z.string(),
}
```

### Data Management (4 tools)

| Tool | Description | Replaces |
|------|-------------|----------|
| `import_file` | Unified import. Required `file_path` param. Optional `format` param: `'gedcom'` (default for .ged), `'genney'` (.backup/.gcc or folder), `'holger'` (.ged/.zip with Holger conventions). Auto-detects from extension when `format` is omitted (.backup/.gcc -> genney, .ged -> gedcom). Genney .ged files must use explicit `format: 'genney'`. Optional `media_dir` for Holger imports. | `import_gedcom` + `import_genney` + `import_holger` |
| `export_gedcom` | Export database as GEDCOM. | `export_gedcom` (unchanged) |
| `get_current_database` | Current database path. | `get_current_database` (unchanged) |
| `switch_database` | Switch to a different database file. | `switch_database` (unchanged) |

**Prod total: 34 tools** (down from 114)

### Dropped Tools (80 tools removed)

**Covered by `get_person_summary`:**
`get_person`, `get_person_names`, `get_person_identifiers`, `get_events_for_person`, `get_relationships_of_person`, `get_groups_for_person`, `get_research_tasks_for_person`, `get_events_for_relationship`

**Join table management (internal implementation detail):**
`add_event_participant`, `remove_event_participant`, `get_event_participants`

**Full-table listing (search is better):**
`list_persons`, `list_relationships`, `list_sources`, `list_places`, `list_media`, `list_groups`, `list_repositories`, `list_research_tasks`, `list_gazetteers`

**Low-frequency entity CRUD (rarely needed independently by agents):**
All individual get/update/delete for relationships, sources, events, places, groups, repositories, gazetteers, citations, media regions, person identifiers, and person names.

**UI tools (moved to dev server):**
`ui_screenshot`, `ui_navigate`, `ui_get_dom`, `ui_click`, `ui_execute_js`

---

## Dev Tools (~15)

### UI Automation (5 tools)

| Tool | Description |
|------|-------------|
| `ui_screenshot` | Take a screenshot of the current app window. Returns PNG. |
| `ui_navigate` | Navigate to a route path (e.g. `/persons/123`, `/search?q=Erik`). |
| `ui_click` | Click an element by CSS selector. |
| `ui_fill` | Fill an input field by CSS selector with a value. |
| `ui_get_dom` | Get rendered HTML of current view. |

**Dropped:** `ui_execute_js` — flaky and a footgun. If we need something, build a proper endpoint.

### Chart Inspection (5 tools)

New tools requiring HTTP bridge expansion.

| Tool | HTTP Endpoint | Description |
|------|---------------|-------------|
| `chart_list_persons` | `POST /chart/persons` | List all visible persons in the current chart: id, name, x, y, isSelected, isFocal |
| `chart_select_person` | `POST /chart/select` | Select a person by ID or name in the chart |
| `chart_focus_person` | `POST /chart/focus` | Set a person as the focal/root of the chart |
| `chart_get_layout` | `GET /chart/layout` | Chart type, focal person, selected person, generation count, box count |
| `chart_screenshot_person` | `POST /chart/screenshot` | Cropped screenshot centered on a specific person's box |

### Test Data Seeding (3 tools)

| Tool | Description |
|------|-------------|
| `seed_family` | Create a multi-generation test family. Params: `generations`, `children_per_family`, `include_events`, `include_sources` |
| `seed_person` | Create a single test person with optional birth/death events |
| `clear_test_data` | Delete all persons created by seed tools (tracked via `__test__` group) |

### App Inspection (2 tools)

| Tool | Description |
|------|-------------|
| `app_status` | App running? Current route, window size, database path |
| `db_stats` | Quick counts: persons, relationships, events, places, sources, media |

**Dev total: 15 tools**

---

## HTTP Bridge Expansion

The chart tools need new endpoints on the existing HTTP bridge (port 19241).

### Communication Path

```
Dev MCP tool  ->  HTTP POST  ->  main process  ->  IPC to renderer  ->  Vue component state  ->  response
```

### New IPC Channels

| Endpoint | IPC Channel | Renderer Returns |
|----------|-------------|------------------|
| `POST /chart/persons` | `chart:getVisiblePersons` | `{ id, name, x, y, isSelected, isFocal }[]` |
| `POST /chart/select` | `chart:selectPerson` | `{ ok: true }` or `{ error: string }` |
| `POST /chart/focus` | `chart:focusPerson` | `{ ok: true }` or `{ error: string }` |
| `GET /chart/layout` | `chart:getLayout` | `{ chartType, focalId, selectedId, boxCount, generations }` |
| `POST /chart/screenshot` | `chart:screenshotPerson` | `{ data: base64png }` |

### Renderer Implementation

VisualizationView (or a `useChartBridge` composable) registers IPC handlers when the chart is mounted and unregisters on unmount. If no chart is active, handlers return `{ error: "No chart is currently displayed" }`.

### `chart_select_person` Behavior

Accepts either `person_id` (exact) or `name` (fuzzy match against visible persons). If by name, matches against visible persons only — does not search the database. Returns error if the person is not visible in the current chart.

### `chart_focus_person` Behavior

Changes the root/focal person of the chart. This triggers a full data reload and relayout. Equivalent to the user clicking "View as focal" in the UI.

---

## Chrome DevTools MCP — Division of Labor

| Concern | Owner | Examples |
|---------|-------|---------|
| App-specific UI | Dev MCP | Navigate routes, click app buttons, chart state, seed data |
| Browser diagnostics | Chrome DevTools MCP | Console errors, performance profiling, a11y audits, network |
| App-aware screenshots | Dev MCP | Chart cropping, person centering |
| Generic screenshots | Chrome DevTools MCP | Full-page, viewport, element-level |

### Development Workflow

After implementing a feature:

1. Dev MCP: `ui_navigate` -> seed data -> `ui_screenshot` (verify renders)
2. Chrome DevTools: `list_console_messages` (check for errors)
3. Chrome DevTools: `lighthouse_audit` (accessibility check)
4. Dev MCP: `chart_list_persons` -> `chart_select_person` (verify chart)
5. Chrome DevTools: `performance_start_trace` / `performance_stop_trace` (if slow)

No code changes to chrome-devtools-mcp itself. Skills (`mcp-dev`, `electron-dev`) updated to reference it in development workflows.

---

## Implementation Notes

### Workflow Tool Pattern

Each workflow tool calls multiple `src/api/` functions in sequence. The tool is the composition layer — `src/api/` stays granular.

### Transaction Safety

Workflow tools that create multiple records should wrap in a transaction so partial failures do not leave orphaned data. Use `db.exec('BEGIN'); ... db.exec('COMMIT');` with try/catch rollback.

### Migration Path

The old `src/mcp/tools/*.ts` files are deleted, not renamed. The new `src/mcp/tools/prod/*.ts` files are written from scratch using the workflow patterns. The `src/api/` layer is unchanged — all existing functions remain available for the workflow tools to compose.

### Testing

- Existing unit tests for `src/api/` functions remain unchanged
- New unit tests for workflow composition (e.g., `create_person` with birth event creates person + name + event + participant)
- E2E test updated: MCP server initialize handshake works for both `server.ts` and `devServer.ts`
- Chart bridge: manual testing via dev MCP tools in a running app

---

## Files Changed

### New Files

- `src/mcp/createProdServer.ts` — prod server factory
- `src/mcp/createDevServer.ts` — dev server factory (extends prod)
- `src/mcp/devServer.ts` — dev entry point with HTTP bridge
- `src/mcp/tools/prod/persons.ts`
- `src/mcp/tools/prod/families.ts`
- `src/mcp/tools/prod/events.ts`
- `src/mcp/tools/prod/sources.ts`
- `src/mcp/tools/prod/places.ts`
- `src/mcp/tools/prod/research.ts`
- `src/mcp/tools/prod/media.ts`
- `src/mcp/tools/prod/data-management.ts`
- `src/mcp/tools/dev/ui.ts`
- `src/mcp/tools/dev/chart.ts`
- `src/mcp/tools/dev/seed.ts`
- `src/mcp/tools/dev/inspect.ts`
- `src/renderer/composables/useChartBridge.ts`

### Modified Files

- `src/mcp/server.ts` — calls `createProdServer` instead of `createServer`
- `src/main/index.ts` — add chart HTTP bridge endpoints
- `src/preload/index.ts` — add chart IPC channels
- `src/renderer/views/VisualizationView.vue` — use `useChartBridge` composable
- `.claude/settings.local.json` — add `slaktforskning-dev` server entry
- `.claude/skills/mcp-dev/SKILL.md` — update for prod/dev split
- `.claude/skills/electron-dev/SKILL.md` — reference chrome-devtools-mcp workflow

### Deleted Files

- `src/mcp/createServer.ts`
- `src/mcp/tools/persons.ts`
- `src/mcp/tools/relationships.ts`
- `src/mcp/tools/events.ts`
- `src/mcp/tools/sources.ts`
- `src/mcp/tools/places.ts`
- `src/mcp/tools/media.ts`
- `src/mcp/tools/import-export.ts`
- `src/mcp/tools/utility.ts`
- `src/mcp/tools/gazetteers.ts`
- `src/mcp/tools/types.ts`
