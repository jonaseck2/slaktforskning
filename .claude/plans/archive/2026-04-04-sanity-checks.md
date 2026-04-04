# Feature: Tree Sanity Checks (Data Quality)

## Summary
Added a data quality check engine with 26 checks across 6 categories.

## Components

### src/api/checks.ts
- `CheckResult` type: code, severity (error/warning/notice), message (Swedish), personIds, eventIds?, relationshipIds?
- `runAllChecks(db)` → all checks merged
- `runChecksForPerson(db, personId)` → filtered to that person
- 26 checks: A (chronological), B (parenthood age), C (family structure), D (relationship integrity), E (geographic/Haversine), F (data completeness)

### IPC/Preload
- `checks:runAll` → `window.api.checks.runAll()`
- `checks:forPerson(id)` → `window.api.checks.forPerson(id)`

### MCP
- `run_checks` tool
- `run_checks_for_person` tool

### UI
- `QualityView.vue` at `/quality` — grouped by severity, filter chips, re-run button
- Sidebar "Datakvalitet" link with red error count badge
- `PersonDetailView.vue` — inline yellow/red banner for errors/warnings

## Files Changed
- `src/api/checks.ts` — new file, full check engine
- `src/main/ipc.ts` — two IPC handlers
- `src/preload/index.ts` — checks namespace
- `src/mcp/createServer.ts` — two MCP tools
- `src/renderer/views/QualityView.vue` — new view
- `src/renderer/router.ts` — /quality route
- `src/renderer/App.vue` — sidebar entry + badge
- `src/renderer/views/PersonDetailView.vue` — inline banner
- `src/renderer/i18n/sv.ts` / `en.ts` — quality.* keys
- `tests/unit/checks.test.ts` — unit tests

## Original Plan
See also `.claude/plans/2026-04-03-sanity-checks.md` (original plan file, superseded by this archive).
