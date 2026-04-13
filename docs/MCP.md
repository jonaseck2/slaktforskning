# MCP Server

The MCP server runs standalone (`npx tsx src/mcp/server.ts`) and provides tools for AI agents to read/write genealogy data and control the GUI.

The server shares the same SQLite database as the Electron app. Override the DB path with `SLAKTFORSKNING_DB` env var.

## Data Tools

### Persons

| Tool | Description |
|------|-------------|
| create_person | Create person with name and sex |
| get_person | Get person by ID |
| list_persons | List all persons |
| search_persons | Search by name |
| update_person | Update sex, living, notes |
| delete_person | Delete a person |
| add_person_name | Add an alternate name (married, alias, aka) |
| get_person_names | Get all names for a person |

### Relationships

| Tool | Description |
|------|-------------|
| create_relationship | Create a relationship (couple, parent_child, sibling, godparent, other) |
| get_relationship | Get relationship by ID |
| list_relationships | List all relationships |
| update_relationship | Update type, persons, subtype, notes |
| delete_relationship | Delete a relationship |
| get_relationships_of_person | Get all relationships for a person |
| search_relationships | Search relationships by person name |

### Event Participants

| Tool | Description |
|------|-------------|
| add_event_participant | Add a person as participant in an event (with role) |
| get_event_participants | Get all participants for an event |
| remove_event_participant | Remove a participant from an event |

### Events

| Tool | Description |
|------|-------------|
| add_event | Add life event (optionally linked to a relationship) |
| get_event | Get event by ID |
| get_events_for_person | Get all events for a person (via event_participants) |
| get_events_for_relationship | Get all events for a relationship |
| update_event | Update event fields |
| delete_event | Delete an event |

### Sources & Citations

| Tool | Description |
|------|-------------|
| add_source | Create a source record |
| get_source | Get source by ID |
| list_sources | List all sources |
| update_source | Update source fields |
| delete_source | Delete a source |
| search_sources | Search sources by title, author, or publication info |
| add_citation | Link source to event/person/relationship/place with transcription and confidence |
| get_citation | Get citation by ID |
| get_citations_for_source | Get all citations for a source |
| get_citations_for_event | Get all citations for an event |
| get_citations_for_person | Get all citations attached to a person |
| get_citations_for_relationship | Get all citations attached to a relationship |
| get_citations_for_place | Get all citations attached to a place |
| delete_citation | Delete a citation |

### Places

| Tool | Description |
|------|-------------|
| add_place | Create a place record (name, place_type, parent_place_id, lat/lon, date_from/to, notes, street, postal_code, city, country) |
| get_place | Get place by ID |
| list_places | List all places |
| search_places | Search places by name |
| update_place | Update place fields including address fields |
| delete_place | Delete a place |

### Groups

| Tool | Description |
|------|-------------|
| create_group | Create a group |
| get_group | Get group by ID |
| list_groups | List all groups |
| update_group | Update group name or notes |
| delete_group | Delete a group |
| add_group_member | Add a person to a group |
| remove_group_member | Remove a person from a group |
| get_group_members | Get all members of a group |
| get_groups_for_person | Get all groups a person belongs to |

### Repositories

| Tool | Description |
|------|-------------|
| create_repository | Create a repository (archive, library, etc.) |
| get_repository | Get repository by ID |
| list_repositories | List all repositories |
| update_repository | Update repository fields |
| delete_repository | Delete a repository |
| link_source_repository | Link a source to a repository |
| unlink_source_repository | Remove the link between a source and a repository |
| get_repositories_for_source | Get all repositories linked to a source |

### Research Tasks

| Tool | Description |
|------|-------------|
| create_research_task | Create a research task (optionally linked to a person) |
| get_research_task | Get research task by ID |
| list_research_tasks | List all research tasks |
| get_research_tasks_for_person | Get all research tasks for a person |
| update_research_task | Update task, status, priority, notes, or result |
| delete_research_task | Delete a research task |

### Media

| Tool | Description |
|------|-------------|
| create_media | Create a media record (title, file_ref, format, notes, is_printable) |
| get_media | Get media by ID |
| list_media | List all media records |
| delete_media | Delete a media record |
| add_media_link | Link media to an entity (person, event, relationship, place, source) |
| get_media_for_entity | Get all media linked to an entity |
| remove_media_link | Remove a media link by its link ID |

### Report / Narrative Data

Higher-level tools that return denormalized data optimized for AI narrative generation. One call returns everything needed — no follow-up queries required.

| Tool | Description |
|------|-------------|
| get_person_summary | Get a comprehensive summary: all names, events (with places), relationships (with partner names), citations (with source titles), groups, research tasks |
| get_family_unit | Get a family unit: couple + both persons with birth/death events + all children with their birth/death events |
| get_ancestor_tree | Get a nested ancestor tree up to N generations with birth/death/marriage events per node |
| get_place_history | Get all events at a place chronologically, with participant names and roles |
| get_research_gaps | Analyze a person for missing data: no birth, no death (if not living), no parents, unsourced events, events without places |
| get_timeline | Get a chronological timeline of a person's events merged with key family events (spouse/children births and deaths) |

### Media AI

| Tool | Description |
|------|-------------|
| get_media_file_base64 | Get a media file as base64 for vision processing. Optionally downscale large images. |
| get_untagged_media | List media items with no person links, ordered by connection count. Use for batch photo tagging workflows. |
| get_media_for_person_context | Find media that might contain a specific person based on event and relationship links. |

### Media Regions (Face/Region Tagging)

| Tool | Description |
|------|-------------|
| create_media_region | Create a face/region tag on a media item. Coordinates are fractions 0.0-1.0 of image dimensions. |
| get_media_regions | Get all face/region tags for a media item. |
| get_regions_for_person | Get all face/region tags linked to a specific person. |
| update_media_region | Update a face/region tag (person assignment, label, or coordinates). |
| delete_media_region | Delete a face/region tag. |
| suggest_media_regions | Create multiple face/region tags at once. Used by AI agents after vision processing to batch-submit detected faces. |
| get_persons_for_matching | Get persons with existing face region tags and coordinates. Use for face comparison against known faces. |
| get_media_tagging_status | Get overview of tagging progress: total, tagged, untagged media counts and total region count. |

### Gazetteers

| Tool | Description |
|------|-------------|
| get_gazetteer_schema | Get the JSON Schema for the gazetteer format, for use when creating or validating a gazetteer file |
| list_gazetteers | List all gazetteers available (bundled + imported), with id, name, locale, node count, and source |
| import_gazetteer | Import a gazetteer from a JSON string; stores it in the database for use in place resolution |
| export_gazetteer | Export an imported gazetteer as a JSON string by ID |
| delete_gazetteer | Delete an imported gazetteer from the database by ID |
| resolve_place | Resolve a place name string against available gazetteers and return coordinates + matched node |
| search_gazetteer | Search gazetteer nodes by name prefix, returning matching place names with coordinates |

### Database

| Tool | Description |
|------|-------------|
| get_current_database | Get the path and filename of the currently open database |
| switch_database | Close the current database and open a different one (creates file if needed); all subsequent tools operate on the new database |

## UI Tools (requires Electron app to be running)

When the Electron app is running, it starts a local HTTP server on port 19241 (override with `SLAKTFORSKNING_UI_PORT`). The MCP server's UI tools call this HTTP bridge to observe and control the live app window.

| Tool | Description |
|------|-------------|
| ui_screenshot | Capture the current window as a PNG image |
| ui_navigate | Navigate to a route path (e.g. `/search?q=Erik`) |
| ui_get_dom | Get the full rendered HTML of the current view |
| ui_click | Click an element by CSS selector |
| ui_execute_js | Run arbitrary JavaScript in the renderer and return the result |

### UI Server Architecture

The Electron main process starts an HTTP server (`src/main/ui-server.ts`) that wraps `webContents` APIs. The standalone MCP server calls `http://127.0.0.1:19241` for UI operations. If the app is not running, UI tools return a descriptive error. The renderer exposes `window.__vue_router` so `ui_navigate` can push Vue Router routes cleanly.

This enables agentic GUI testing workflows: seed data with data tools → navigate to the relevant view → assert the rendered DOM or screenshot matches expectations.

## Workflows

Step-by-step guides for using the MCP tools with Claude Desktop or Claude Code:

- [Getting Started](mcp-workflows/README.md) -- Setup guide for Claude Desktop and Claude Code
- [Generate a Research Report](mcp-workflows/research-report.md) -- Gather person data and produce a structured research summary
- [Write a Family History Narrative](mcp-workflows/family-history.md) -- Build a multi-generation story from tree data
- [Audit Source Coverage](mcp-workflows/source-audit.md) -- Find unsourced facts and prioritize sourcing work
- [Check and Fix Data Quality](mcp-workflows/data-quality.md) -- Run quality checks and resolve issues
- [Photo Tagging with AI](mcp-workflows/photo-tagging.md) -- Link photos to persons and events using Claude's vision
