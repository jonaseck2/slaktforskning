# MCP Server

The MCP server runs standalone (`npx tsx src/mcp/server.ts`) and provides tools for AI agents to read/write genealogy data and control the GUI.

The server shares the same SQLite database as the Electron app. Override the DB path with `SLAKTFORSKNING_DB` env var.

## Data Tools

### Persons

| Tool | Description |
|------|-------------|
| create_person | Create person with name and sex |
| get_person | Get person by ID (includes names, events) |
| list_persons | List all persons |
| search_persons | Search by name |
| update_person | Update sex, living, notes |
| delete_person | Delete a person |
| add_person_name | Add an alternate name (married, alias, aka) |
| get_person_names | Get all names for a person |

### Families

| Tool | Description |
|------|-------------|
| create_family | Create family unit with partners |
| get_family | Get family by ID |
| list_families | List all families |
| update_family | Update partners, union type, notes |
| delete_family | Delete a family |
| add_child_to_family | Link a child to a family |
| get_children_of_family | Get all children linked to a family |
| get_families_of_person | Get all families a person belongs to |
| search_families | Search families by partner name |

### Events

| Tool | Description |
|------|-------------|
| add_event | Add life event (birth, death, etc.) to person or family |
| get_event | Get event by ID |
| get_events_for_person | Get all events for a person |
| get_events_for_family | Get all events for a family |
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
| add_citation | Link source to event/person with transcription and confidence |
| get_citation | Get citation by ID |
| get_citations_for_source | Get all citations for a source |
| get_citations_for_event | Get all citations for an event |
| delete_citation | Delete a citation |

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
