# MCP Server

The MCP server has two entry points — a production server for genealogy research workflows, and a development server that adds UI automation and testing tools on top.

The server shares the same SQLite database as the Electron app. Override the DB path with `SLAKTFORSKNING_DB` env var.

---

## Production MCP Server

Entry point: `npx tsx src/mcp/server.ts`

77 workflow tools designed for genealogy research and AI narrative generation. The set provides full CRUD parity with the desktop app — every record type the renderer can author or curate, an agent can too. Each workflow tool does more in one call — creates relationships, resolves places, records citations — so agents need fewer round-trips. Coverage is enforced by `tests/unit/mcp.test.ts` ("registers every tool the agent needs to author + curate a genealogy database").

### Persons

| Tool | Description |
|------|-------------|
| `create_person` | Create a person. Optional: birth date, birth place, source citation — all resolved in a single call. |
| `search_persons` | Search by name. Returns id, display name, birth year, death year. |
| `get_person_summary` | All names, events (with places), relationships (with partner names), citations, groups, and research tasks for a person. One call, no follow-up queries needed. |
| `update_person` | Update sex or notes. (Living/deceased status is derived from birth/death events, not stored.) |
| `delete_person` | Delete a person and all linked data (cascade). |
| `add_person_name` | Add an alternate name (birth, married, alias, aka) with optional date range. |
| `update_person_name` | Update an existing person_name (retype primary, set date range, add nickname / preferred_name, etc.). |
| `delete_person_name` | Delete a single person_name record without deleting the person. |
| `add_person_identifier` | Attach an external ID (FamilySearch, Ancestry, Riksarkivet, personnummer, REFN/RIN, other). |
| `get_person_identifiers` | List all external identifiers on a person. |
| `delete_person_identifier` | Remove a single identifier. |
| `merge_persons` | Merge two persons: move all relationships, events, names, citations to target, then delete source. |
| `find_duplicates` | Find candidate duplicate persons by name similarity. Returns ranked pairs with score. |

### Families

| Tool | Description |
|------|-------------|
| `add_relationship` | Create a relationship (couple, parent_child, sibling, godparent, other) between two persons. Accepts subtype and notes. |
| `add_child` | Add a child to a couple: creates the person + parent_child relationships to both parents in one call. Optional birth event and citation. |
| `get_family_unit` | Couple + both persons with birth/death events + all children with their birth/death events. |
| `get_ancestor_tree` | Nested ancestor tree up to N generations with birth/death/marriage events per node. |
| `update_relationship` | Update type, subtype, or notes on an existing relationship. |
| `delete_relationship` | Delete a relationship row. Events that referenced it via `relationship_id` are detached but not deleted. |
| `add_event_participant` | Add a person to an existing event with a role (witness, godparent, officiant, primary, spouse, parent, child, other). |
| `remove_event_participant` | Remove a single participant link by `event_participant.id`. |

### Events

| Tool | Description |
|------|-------------|
| `record_event` | Record a life event with participants, place, and an optional citation. Place input: `place` for a single leaf component (e.g. `"Chennai"`), or `place_chain` for an explicit root → leaf hierarchy including the leaf (e.g. `["World", "India", "Chennai"]`) — never both, and never a comma-string in `place`. For fact-shaped events (occupation, religion, education, title, etc.) pass the primary value via `value` (e.g. `"Carpenter"`, `"Lutheran"`); free-form prose goes in `notes`. Date ranges (`date_type: "between"`) use `date_value` for the start and `date_value_end` for the end (e.g. military service 1999–2000). The legacy `description` parameter is accepted as a deprecated alias for `notes`. |
| `get_timeline` | Chronological timeline of a person's events merged with key family events (spouse/children births and deaths). |
| `update_event` | Update event fields. Place can be supplied as a string (resolved to place_id via findOrCreate). Same `value` / `notes` / deprecated `description` semantics as `record_event`. |
| `delete_event` | Delete an event and all of its participant links. |

### Sources

| Tool | Description |
|------|-------------|
| `add_source` | Create a source record (title, author, publication_info, url, source_type, etc.). |
| `search_sources` | Search sources by title, author, or publication info. |
| `cite` | Link a source to an event, person, relationship, or place. Accepts page, confidence, transcription, notes. |
| `get_citations_for_person` | Get all citations attached to events, relationships, and names for a person. |
| `update_source` | Update title, author, publication_info, repository, url, source_type, call_number, abstract. |
| `delete_source` | Delete a source. CASCADE removes all citations referencing it. |
| `update_citation` | Update page, confidence, transcription, notes, date_accessed on an existing citation. |
| `delete_citation` | Detach a citation without removing the underlying source. |

### Places

> **Place input convention.** Every place tool that accepts a name (`add_place`, `update_place`, `record_event`) treats `name` / `place` as a **single geographic component** — `"Chennai"`, `"Mosås"`, `"Sverige"`. Comma-separated paths like `"Chennai, India, World"` are rejected. To express hierarchy, pass `parent_chain` (on `add_place`, root → leaf, EXCLUDING the leaf) or `place_chain` (on `record_event`, root → leaf, INCLUDING the leaf). Missing ancestor rows are created and existing ones reused, matched by parent + normalized name. Coordinates and country come from the gazetteer at render time — persist them only when the user authored them explicitly.

| Tool | Description |
|------|-------------|
| `add_place` | Create a place record. `name` is a single component (no commas). Pass `parent_chain` (root → leaf, excluding the leaf) to express hierarchy — missing ancestors are created. Other fields: place_type, parent_place_id, lat/lon, date_from/to, notes, address fields. |
| `search_places` | Search places by name. Returns id, name, place_type, parent name. |
| `get_place_history` | All events at a place chronologically, with participant names and roles. |
| `resolve_place` | Resolve a place name string against available gazetteers. Returns coordinates and matched node. |
| `list_place_children` | Children of a place (next level down in the hierarchy). |
| `get_place_ancestors` | Ancestor chain (root → self) for a place. |
| `update_place` | Update a place (name, type, parent, coordinates, dates, address fields). `name` must be a single component — re-parent via `parent_place_id`. |
| `delete_place` | Delete a place. Events at this place have place_id NULL'd; child places become orphans. |

### Research

| Tool | Description |
|------|-------------|
| `get_research_gaps` | Analyze a person for missing data: no birth, no death (if not living), no parents, unsourced events, events without places. |
| `add_research_task` | Create a research task optionally linked to a person. Accepts priority, status, notes. |
| `update_research_task` | Update task text, status (open/in_progress/done/stopped), priority, notes, or result. |
| `delete_research_task` | Delete a research task. To preserve a finished task, prefer `update_research_task` with `status="done"`. |
| `run_checks` | Run all quality checks and return findings grouped by severity. |

### Media

| Tool | Description |
|------|-------------|
| `attach_media` | Link a media file to an entity (person, event, relationship, place, source). Creates the media record if needed. `file_ref` must be a path RELATIVE to the database directory (e.g. `claude-media/photo.jpg`); URLs and absolute paths break the renderer. |
| `update_media` | Update an existing media record (title, notes, format, `file_ref`, is_printable). Use to repair a broken `file_ref` after relocating the file into `<dbname>-media/`. |
| `delete_media` | Delete a media record and its links. The underlying file on disk is not removed. |
| `link_media` | Link an existing media row to another entity (one wedding photo can document both spouses, the marriage relationship, the place, and the source). |
| `unlink_media` | Detach a single media→entity link by link_id. |
| `reorder_media` | Reorder media links for one entity by passing the link ids in display order. Position 0 becomes the profile picture. |
| `tag_person_in_media` | Create a face/region tag on a media item linking it to a person. Coordinates are fractions 0.0–1.0 of image dimensions. |
| `update_media_region` | Update an existing face/region tag (move the box, change the tagged person, rename the label). |
| `delete_media_region` | Delete a face/region tag without affecting the underlying media record. |
| `get_media_for_person_context` | Find media that might contain a specific person based on event and relationship links. Returns base64 thumbnails for vision processing. |

### Groups

| Tool | Description |
|------|-------------|
| `add_group` | Create a custom collection (e.g. "Photos pending review"). |
| `list_groups` | List every group. |
| `get_group` | Get one group with its links (persons, places, media). |
| `update_group` | Update a group's name or notes. |
| `delete_group` | Delete a group and all of its membership links. |
| `add_group_link` | Add a person/place/media to a group. |
| `remove_group_link` | Remove a single membership by link id. |

### Repositories

| Tool | Description |
|------|-------------|
| `add_repository` | Create an archive / library / collection record (e.g. "Stockholms stadsarkiv"). |
| `list_repositories` | List every repository. |
| `get_repository` | Get one repository by id. |
| `update_repository` | Update any field. |
| `delete_repository` | Delete a repository (CASCADE removes source-repository link rows; sources remain). |
| `link_source_repository` | Attach a source to a repository (idempotent). |
| `unlink_source_repository` | Remove a source-repository link. |
| `get_repositories_for_source` | List all repositories that hold a given source. |

### Data Management

| Tool | Description |
|------|-------------|
| `import_file` | Unified import: detects GEDCOM / Genney / Holger / RootsMagic / Gramps by file extension (.ged → gedcom; .gcc/.backup → genney; .rmgc/.rmtree → rootsmagic; .gramps/.gpkg → gramps; format=holger to override). Returns ImportReport with warnings and unmapped data. |
| `export_gedcom` | Export the current database as a GEDCOM file. Accepts `version: '5.5.1' \| '7.0'` (default `'5.5.1'`). Returns `{ ged, report }` where report lists excluded entities. |
| `import_archive` | Import a `.zip` archive containing a GEDCOM file plus a `media/` folder. Media files are copied into `<dbname>-media/` and `file_ref` rewritten to the relative path. |
| `export_archive` | Export the database as a `.zip` archive (GEDCOM + media). Pairs with `import_archive` for full backup round-trip. |
| `get_current_database` | Get the path and filename of the currently open database. |
| `switch_database` | Close the current database and open a different one (creates file if needed). All subsequent tools operate on the new database. |

> **Gazetteer admin** is not exposed via MCP. Gazetteers are render-time
> resolver data, not authored genealogy data, and stay UI/IPC-only on
> purpose. Use `resolve_place` to query the resolver from an agent.
> Bundled-gazetteer build scripts live in `src/gazetteer-build/`.

---

## Development MCP Server

Entry point: `npx tsx src/mcp/devServer.ts`

All 77 production tools PLUS 15 dev-only tools for UI automation, chart inspection, test data seeding, and app inspection. Use this server when developing or testing UI features.

### UI Automation (requires Electron app running)

The Electron main process starts an HTTP server (`src/main/ui-server.ts`) on port 19241 (override with `SLAKTFORSKNING_UI_PORT`). The dev MCP server calls this bridge for UI operations. If the app is not running, UI tools return a descriptive error.

| Tool | Description |
|------|-------------|
| `ui_screenshot` | Capture the current window as a PNG image. |
| `ui_navigate` | Navigate to a Vue Router route path (e.g. `/persons/123`). Uses `window.__vue_router` for clean hash-based navigation. |
| `ui_click` | Click an element by CSS selector. |
| `ui_fill` | Fill an input field by CSS selector and trigger Vue reactivity. |
| `ui_get_dom` | Get the full rendered HTML of the current view. |

### Chart Inspection

Five tools wrapping the chart HTTP bridge (`/chart/*` endpoints in `ui-server.ts`). The `useChartBridge` composable in `VisualizationView` exposes the current chart state to the bridge.

| Tool | Description |
|------|-------------|
| `chart_list_persons` | List all persons visible in the current chart with their box positions. |
| `chart_select_person` | Select a person in the chart (shows outline placeholders). |
| `chart_focus_person` | Change the focal person (re-roots the tree). |
| `chart_get_layout` | Get the full chart layout: all boxes with coordinates, lines, and placeholders. |
| `chart_screenshot_person` | Take a screenshot cropped to a specific person's box in the chart. |

### Seed

| Tool | Description |
|------|-------------|
| `seed_person` | Create a realistic test person with randomized name, birth/death events, and optional relationships. Returns person id. |
| `seed_family` | Create a couple with N children, all with realistic events. Returns ids of all created persons. |
| `clear_test_data` | Delete all persons, events, relationships, and sources created during the current test session (tagged with a session marker). |

### Inspect

| Tool | Description |
|------|-------------|
| `app_status` | Check whether the Electron app is running, whether the UI bridge is reachable, and which database is open. |
| `db_stats` | Get row counts for all tables in the current database. |

---

## Workflows

Step-by-step guides for using the MCP tools with Claude Desktop or Claude Code:

- [Getting Started](mcp-workflows/README.md) — Setup guide for Claude Desktop and Claude Code
- [Generate a Research Report](mcp-workflows/research-report.md) — Gather person data and produce a structured research summary
- [Write a Family History Narrative](mcp-workflows/family-history.md) — Build a multi-generation story from tree data
- [Audit Source Coverage](mcp-workflows/source-audit.md) — Find unsourced facts and prioritize sourcing work
- [Check and Fix Data Quality](mcp-workflows/data-quality.md) — Run quality checks and resolve issues
- [Photo Tagging with AI](mcp-workflows/photo-tagging.md) — Link photos to persons and events using Claude's vision
