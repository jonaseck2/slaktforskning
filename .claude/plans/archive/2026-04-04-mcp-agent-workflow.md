# Plan: MCP as Agent Development & Testing Tool

## Purpose

The MCP server is not just an API for end users to query genealogy data — it is the primary tool for agents (including Claude in this session) to:
1. **Develop**: seed test data into the running app without touching the UI
2. **Test**: verify that new features actually render correctly in the live app
3. **Research**: query and update data during active genealogy research sessions

This plan defines how the MCP should be integrated into development and testing workflows, what's currently missing, and the target state.

---

## Current MCP Coverage

### Data tools — wired ✓
Persons, relationships, events, places, sources, citations, event participants, person identifiers, person names, database switching.

### Data tools — missing ✗
Groups, repositories, research_tasks, media — all new entities from v0.7.0 have no MCP tools yet.

### UI tools — wired but unused in workflow ✓
`ui_screenshot`, `ui_navigate`, `ui_get_dom`, `ui_click`, `ui_execute_js` — these exist but are not referenced in the `add-feature` skill or the `test` skill.

---

## Three Modes of Use

### Mode 1: Agent-Driven Development (seeding test data)

Instead of manually navigating the app to create test persons and events, use MCP tools:

```
1. create_person(given_name="Erik Nilsson", sex="M")
2. add_event(person_id=..., event_type="birth", date_value="1842-03-15", place_id=...)
3. ui_navigate("/persons/<id>")
4. ui_screenshot()  → verify the detail view renders as expected
5. ui_get_dom()     → assert specific elements exist in the DOM
```

This replaces "run the app, click around, see what breaks" with a repeatable agent-driven verification loop.

### Mode 2: Acceptance Testing After Feature Implementation

After building a UI feature (e.g. ResearchTasksView), the agent should:

1. Seed data via MCP tools (`researchTasks:create`, etc. — once MCP tools are added)
2. Navigate to the new view via `ui_navigate("/research-tasks")`
3. Use `ui_get_dom()` to assert the tasks appear
4. Use `ui_screenshot()` for visual confirmation
5. Use `ui_click()` to test interactions (status change, filter)

This catches regressions in UI rendering without Playwright E2E setup per feature.

### Mode 3: Active Research Session

During genealogy research, the agent can:
- `search_persons(query="Nilsson")` to find candidates
- `get_events_for_person(id=...)` to see what's already known
- `add_event(...)` to record a newly found birth record
- Check research tasks via `researchTasks:get` (once tools are added)

The `get_current_database` and `switch_database` tools allow the agent to confirm which database it's operating on before making changes.

---

## Missing MCP Tools (Required for Full Coverage)

Add these to `src/mcp/createServer.ts`. Each is a thin wrapper:

### groups
- `list_groups`, `get_group`, `create_group`, `update_group`, `delete_group`
- `add_group_member`, `remove_group_member`, `get_group_members`, `get_groups_for_person`

### repositories
- `list_repositories`, `get_repository`, `create_repository`, `update_repository`, `delete_repository`
- `get_repositories_for_source`, `link_source_repository`, `unlink_source_repository`

### research_tasks
- `list_research_tasks`, `get_research_task`, `create_research_task`, `update_research_task`, `delete_research_task`
- `get_research_tasks_for_person`

### media
- `list_media`, `get_media`, `create_media`, `delete_media`
- `add_media_link`, `get_media_for_entity`, `remove_media_link`

---

## Workflow Updates Required

### add-feature skill (Step 9: Verify)
After running `npm test`, the skill should include an **MCP verification step** when the app can be running:

```
After unit tests pass:
1. Start the app: npm start (or confirm it's already running)
2. Use MCP tools to seed representative data into the running app
3. Use ui_navigate() to go to the affected view
4. Use ui_screenshot() and ui_get_dom() to verify rendered output
5. Use ui_click() to exercise the main interactions
```

This is not a replacement for Playwright E2E tests but a faster development loop check.

### test skill
Add a section on **MCP-assisted verification** as an alternative to full Playwright runs during development.

### mcp-dev skill
Add documentation on the three usage modes above and a quick-start for the verification loop.

---

## What the Agent Needs in Each Session

At the start of a session where UI work will be done:
1. Check `get_current_database` to confirm which DB is active
2. If the app is not running, note that UI tools will return errors (graceful, not fatal)
3. Data tools work independently of the Electron app — they go directly to SQLite

**The MCP server shares the same DB as the running app.** Changes made via MCP tools are immediately visible in the app without restart.

---

## Implementation Priority

| Task | Priority | Notes |
|------|----------|-------|
| ~~Add MCP tools for groups/repos/tasks/media~~ | ~~High~~ | Done in v0.8.0 |
| ~~Update `add-feature` skill with MCP verification step~~ | ~~Medium~~ | Done in v0.7.1 |
| ~~Update `mcp-dev` references/tools.md~~ | ~~After above~~ | Done in v0.8.0 |
| Write a quick integration test using MCP | Low | Could be a Playwright test |
