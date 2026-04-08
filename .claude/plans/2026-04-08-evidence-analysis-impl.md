# Evidence Analysis (GPS) — Phase 1 & 2 Implementation Plan

> Implements assertion CRUD, conflict detection, IPC/MCP, and full UI.

## Task Overview

### Task 1: Schema migration + API (`src/api/assertions.ts`)
- Add `evidence_type TEXT` column to assertions table in schema.ts
- Full CRUD: create, get, update, delete
- Query functions: getAssertionsForSubject, getAssertionsForAttribute, getAssertionsForCitation
- Conflict functions: getConflicts, getConflictsForPerson
- Unit tests in `tests/unit/assertions.test.ts`

### Task 2: IPC + Preload
- 9 IPC handlers in `src/main/ipc.ts`
- 9 preload channels in `src/preload/index.ts`
- Type declarations in `src/preload/api.d.ts`

### Task 3: MCP tools
- 9 tools in `src/mcp/createServer.ts`

### Task 4: i18n keys
- Swedish + English labels for assertions UI

### Task 5: AssertionFormModal component
- Create/edit assertion modal
- Fields: attribute, value, value_original, confidence, evidence_type, notes

### Task 6: AssertionBadge + AssertionsSummary on EventList
- Badge showing assertion count per event
- Expandable inline table showing assertions grouped by attribute
- Accept/reject toggle, conflict highlighting

### Task 7: PersonEvidenceSection
- Self-loading component for PersonDetailView + PersonPanel
- Groups assertions by attribute, shows conflict counts

### Task 8: SourceDetailView assertion column
- Assertions count on citation rows, expandable inline

### Task 9: Quality check integration
- New "unresolved conflicts" check in checks.ts

### Task 10: Docs sync
- Update CLAUDE.md, PLAN.md, version bump
