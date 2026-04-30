---
paths:
  - "src/mcp/**/*.ts"
  - "tests/unit/mcp.test.ts"
---

# MCP Server Rules

Loads when working in the MCP server. The `/mcp-dev` skill is the canonical reference for adding tools, the prime directive (pass-through, never synthesize defaults), and testing patterns.

## Two entry points, two tool sets

The MCP server has two entry points. DB path: `SLAKTFORSKNING_DB` env var, or platform's app data dir by default.

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

**Gazetteer tools (prod server):** `get_gazetteer_schema`, `list_gazetteers`, `import_gazetteer`, `export_gazetteer`, `delete_gazetteer`, `resolve_place`, `search_gazetteer`

### Development Server (`src/mcp/createDevServer.ts`)

All 34 prod tools PLUS 15 dev-only tools for UI automation, chart inspection, test data seeding, and app inspection.

Entry point: `npx tsx src/mcp/devServer.ts`

**UI Automation (5):** `ui_screenshot`, `ui_navigate`, `ui_click`, `ui_fill`, `ui_get_dom`

**Chart Inspection (5):** `chart_list_persons`, `chart_select_person`, `chart_focus_person`, `chart_get_layout`, `chart_screenshot_person`

**Seed (3):** `seed_person` (realistic test person with events), `seed_family` (couple + children), `clear_test_data`

**Inspect (2):** `app_status` (Electron running, UI bridge reachable, DB path), `db_stats` (table row counts)

## Adding a new tool

The full template, prime directive (no synthesizing defaults — pass agent input straight through), the `registerTool()` API, and the `tests/unit/mcp.test.ts` `call()` helper are all in `/mcp-dev`. Quick reminders:

- The MCP tool is a **thin wrapper** — all logic stays in `src/api/`.
- Use `registerTool()` not `tool()` (the 4-arg overload is deprecated).
- Add `.describe()` to every Zod parameter.
- Return JSON via `JSON.stringify(result, null, 2)` in `content[0].text`.
- Handle not-found cases with a human-readable message.

`docs/MCP.md` has the full prose tool reference.
