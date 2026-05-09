---
paths:
  - "src/mcp/**/*.ts"
  - "tests/unit/mcp.test.ts"
---

# MCP Server Rules

Loads when working in the MCP server. The `/slaktforskning-mcp-dev` skill is the canonical reference for adding tools, the prime directive (pass-through, never synthesize defaults), and testing patterns.

## Two entry points, two tool sets

The MCP server has two entry points. DB path: `SLAKTFORSKNING_DB` env var, or platform's app data dir by default.

### Production Server (`src/mcp/createProdServer.ts`)

77 workflow tools (counted via `grep -c registerTool src/mcp/tools/prod/*.ts`) designed for genealogy research and AI narrative generation. The set was sized for parity: an agent can author and curate every kind of record the renderer can — full CRUD on persons (incl. names + identifiers), relationships, event participants, events, sources, citations, places, repositories, groups, media (incl. links + regions), research tasks, plus GEDCOM and `.zip`-archive backup round-trip. Each workflow tool does more in a single call — creates relationships, resolves places, records citations — so agents need fewer round-trips. Coverage is enforced by `tests/unit/mcp.test.ts` ("registers every tool the agent needs to author + curate a genealogy database").

Entry point: `npx tsx src/mcp/server.ts`

**Persons (13):** `create_person`, `search_persons`, `get_person_summary`, `update_person`, `delete_person`, `add_person_name`, `update_person_name`, `delete_person_name`, `add_person_identifier`, `get_person_identifiers`, `delete_person_identifier`, `merge_persons`, `find_duplicates`

**Families / participants (8):** `add_relationship`, `add_child`, `get_family_unit`, `get_ancestor_tree`, `update_relationship`, `delete_relationship`, `add_event_participant`, `remove_event_participant`

**Events (4):** `record_event` (multi-participant, place findOrCreate, citation, `date_value_end` for ranges), `get_timeline`, `update_event`, `delete_event`

**Sources / citations (8):** `add_source`, `search_sources`, `cite`, `get_citations_for_person`, `update_source`, `delete_source`, `update_citation`, `delete_citation`

**Places (8):** `add_place`, `search_places`, `get_place_history`, `resolve_place`, `list_place_children`, `get_place_ancestors`, `update_place`, `delete_place`

**Research (5):** `get_research_gaps`, `add_research_task`, `update_research_task`, `delete_research_task`, `run_checks`

**Media (10):** `attach_media`, `update_media`, `delete_media`, `link_media`, `unlink_media`, `reorder_media`, `tag_person_in_media`, `update_media_region`, `delete_media_region`, `get_media_for_person_context`

**Groups (7):** `add_group`, `list_groups`, `get_group`, `update_group`, `delete_group`, `add_group_link`, `remove_group_link`

**Repositories (8):** `add_repository`, `list_repositories`, `get_repository`, `update_repository`, `delete_repository`, `link_source_repository`, `unlink_source_repository`, `get_repositories_for_source`

**Data Management (6):** `import_file` (unified — GEDCOM/Genney/Holger), `export_gedcom`, `import_archive` (.zip with media), `export_archive`, `get_current_database`, `switch_database`

### Development Server (`src/mcp/createDevServer.ts`)

All 77 prod tools PLUS 15 dev-only tools for UI automation, chart inspection, test data seeding, and app inspection.

Entry point: `npx tsx src/mcp/devServer.ts`

**UI Automation (5):** `ui_screenshot`, `ui_navigate`, `ui_click`, `ui_fill`, `ui_get_dom`

**Chart Inspection (5):** `chart_list_persons`, `chart_select_person`, `chart_focus_person`, `chart_get_layout`, `chart_screenshot_person`

**Seed (3):** `seed_person` (realistic test person with events), `seed_family` (couple + children), `clear_test_data`

**Inspect (2):** `app_status` (Electron running, UI bridge reachable, DB path), `db_stats` (table row counts)

## Adding a new tool

The full template, prime directive (no synthesizing defaults — pass agent input straight through), the `registerTool()` API, and the `tests/unit/mcp.test.ts` `call()` helper are all in `/slaktforskning-mcp-dev`. Quick reminders:

- The MCP tool is a **thin wrapper** — all logic stays in `src/api/`.
- Use `registerTool()` not `tool()` (the 4-arg overload is deprecated).
- Add `.describe()` to every Zod parameter.
- Return JSON via `JSON.stringify(result, null, 2)` in `content[0].text`.
- Handle not-found cases with a human-readable message.

`docs/MCP.md` has the full prose tool reference.
