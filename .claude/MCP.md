# MCP Server

The MCP server runs standalone (`npx tsx src/mcp/server.ts`) and provides tools for AI agents to read/write genealogy data and control the GUI.

The server shares the same SQLite database as the Electron app. Override the DB path with `SLAKTFORSKNING_DB` env var.

## Data Tools

| Tool | Description |
|------|-------------|
| create_person | Create person with name and sex |
| get_person | Get person by ID |
| list_persons | List all persons |
| search_persons | Search by name |
| update_person | Update sex, living, notes |
| delete_person | Delete a person |
| create_family | Create family unit with partners |
| add_child_to_family | Link a child to a family |
| list_families | List all families |
| add_event | Add life event (birth, death, etc.) |
| get_events_for_person | Get events for a person |
| add_source | Create a source record |
| add_citation | Link source to event/person |
| list_sources | List all sources |

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
