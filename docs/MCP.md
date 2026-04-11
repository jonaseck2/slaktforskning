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

### Media AI

| Tool | Description |
|------|-------------|
| get_media_file_base64 | Get a media file as base64 for vision processing. Optionally downscale large images. |
| get_untagged_media | List media items with no person links, ordered by connection count. Use for batch photo tagging workflows. |
| get_media_for_person_context | Find media that might contain a specific person based on event and relationship links. |

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
