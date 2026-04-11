# MCP Workflows: Getting Started

Slaktforskning includes a built-in MCP (Model Context Protocol) server that lets AI agents like Claude read and write your genealogy data directly. This guide covers setup, verification, and links to example workflows.

## What the MCP Server Does

The MCP server exposes 80+ tools for working with your genealogy database: creating and searching persons, managing relationships, recording events and sources, importing/exporting GEDCOM files, running quality checks, and more. All data stays in your local SQLite database.

## Setting Up with Claude Desktop

1. **Locate your Claude Desktop config file:**

   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

   Create the file if it doesn't exist.

2. **Add the Slaktforskning MCP server:**

   ```json
   {
     "mcpServers": {
       "slaktforskning": {
         "command": "npx",
         "args": ["tsx", "src/mcp/server.ts"],
         "cwd": "/path/to/slaktforskning",
         "env": {
           "SLAKTFORSKNING_DB": "/path/to/your/database.db"
         }
       }
     }
   }
   ```

   Replace `/path/to/slaktforskning` with the actual path to the project directory. Replace `/path/to/your/database.db` with the path to your SQLite database file (or remove the `env` block to use the default location in your OS app data directory).

3. **Restart Claude Desktop** to pick up the new configuration.

## Verifying the Connection

After restarting Claude Desktop, you should see a hammer icon in the chat input area indicating MCP tools are available. To verify everything works:

> "List all persons in my family tree."

Claude will call `list_persons` and show you the results. If you see your data, the connection is working.

If you have an empty database, try:

> "Create a person named Johan Andersson, male, born in 1845."

Claude will call `create_person`, then `add_event` with event_type "birth", confirming the full round-trip works.

## Setting Up with Claude Code

Claude Code picks up MCP servers from the project's `.mcp.json` file automatically. The project already includes this file, so no configuration is needed. Just run Claude Code from the project directory and the tools will be available.

For the cowork agent mode, the same `.mcp.json` applies. You can use the MCP tools alongside code editing to explore your tree, find gaps, and test changes.

## Available Tool Categories

| Category | Example Tools | Count |
|----------|--------------|-------|
| Persons | `create_person`, `search_persons`, `get_person`, `add_person_name` | 14 |
| Relationships | `create_relationship`, `get_relationships_of_person` | 7 |
| Events | `add_event`, `get_events_for_person`, `add_event_participant` | 9 |
| Sources & Citations | `add_source`, `add_citation`, `get_citations_for_person` | 13 |
| Places | `add_place`, `search_places`, `get_place` | 6 |
| Groups | `create_group`, `add_group_member`, `get_groups_for_person` | 9 |
| Repositories | `create_repository`, `link_source_repository` | 8 |
| Research Tasks | `create_research_task`, `list_research_tasks` | 6 |
| Media | `create_media`, `add_media_link`, `get_media_for_entity` | 7 |
| Duplicates | `find_duplicates`, `merge_persons` | 2 |
| Quality Checks | `run_checks`, `run_checks_for_person` | 2 |
| Import/Export | `import_gedcom`, `import_genney`, `import_holger`, `export_gedcom` | 4 |
| Database | `get_current_database`, `switch_database` | 2 |

See [docs/MCP.md](../MCP.md) for the complete tool reference.

## Example Workflows

- [Generate a Research Report](research-report.md) -- Gather data about a person and produce a structured research summary
- [Write a Family History Narrative](family-history.md) -- Build a multi-generation story from your tree data
- [Audit Source Coverage](source-audit.md) -- Find unsourced facts and prioritize sourcing work
- [Check and Fix Data Quality](data-quality.md) -- Run quality checks and resolve issues
- [Photo Tagging with AI](photo-tagging.md) -- Use Claude's vision to identify people in photos

## Troubleshooting

**"No tools available" in Claude Desktop:**
- Check that the `cwd` path points to the project root (where `package.json` is)
- Make sure `npx` is on your PATH (try running `npx tsx src/mcp/server.ts` manually from the project directory)
- Check Claude Desktop logs for connection errors

**"Database not found" errors:**
- If using `SLAKTFORSKNING_DB`, verify the file exists at that path
- Without `SLAKTFORSKNING_DB`, the server creates a new database in your OS app data directory

**Tools return empty results:**
- The database might be empty. Try `list_persons` first. If it returns an empty array, import data with `import_gedcom` or create persons manually.

**Import fails:**
- GEDCOM files must be `.ged` format. For Genney backups, use `import_genney`. For Holger/OurKind exports, use `import_holger`.
- All import tools return a report with warnings about any data that couldn't be mapped.
