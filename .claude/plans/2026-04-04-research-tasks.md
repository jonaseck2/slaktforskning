# Plan: Research Tasks

## Context
Genney has a TODO table (14 rows in the test backup). Research tasks are person-scoped items with priority, status, task text, notes, and result. They are a key workflow tool for genealogists: marking "I'm here", "can't find more", "belongs to subproject X", etc.

The schema, API, IPC, and preload are already wired (v0.7.0 import). This plan covers the full UI feature.

## Data Model (already implemented)

```sql
research_tasks (id, person_id, priority INTEGER, status TEXT, task TEXT, notes TEXT, result TEXT, created_at, updated_at)
-- status: 'open' | 'in_progress' | 'done' | 'stopped'
```

API: `createResearchTask`, `getResearchTask`, `listResearchTasks`, `getResearchTasksForPerson`, `updateResearchTask`, `deleteResearchTask`

IPC: `researchTasks:list`, `researchTasks:get`, `researchTasks:forPerson`, `researchTasks:create`, `researchTasks:update`, `researchTasks:delete`

## Tasks

- [x] **MCP tools** — `create_research_task`, `get_research_task`, `list_research_tasks`, `get_research_tasks_for_person`, `update_research_task`, `delete_research_task` *(implemented v0.8.0)*
- [ ] **ResearchTasksView** — global list at `/research-tasks`
  - Table: priority badge, status chip, person name (linked), task text, created date
  - Filter chips: Open / In Progress / Done / Stopped + person picker
  - "Add task" modal: person picker (optional), priority (0–3 slider or select), task text, notes
  - Clicking row opens inline expansion (not new route) to show/edit all fields + result
  - Bulk status change (checkbox select → set status)
- [ ] **PersonDetailView integration** — section "Forskningstips" below events
  - Inline task list (compact: status chip + task text + result if set)
  - "Add task" button opens modal pre-filled with this person
- [ ] **Sidebar entry** — "Forskning" with badge showing count of open+in_progress tasks
- [ ] **i18n** — sv.ts + en.ts for all new strings
- [ ] **Unit tests** — `tests/unit/research_tasks.test.ts`
- [ ] **Docs** — update CLAUDE.md, IPC_REFERENCE.md, DATA_MODEL.md, PLAN.md

## Priority mapping from Genney
- Genney priority: integer, higher = more urgent. Map directly to our `priority` field.
- Genney status values: normalize to our enum on import (already done in transform.ts).

## UX notes
- Tasks are a "resumption aid" not a formal GPS workflow. Keep the UI lightweight.
- Status transitions should be one-click (chip toggle), not a form.
- Result field is for brief notes on what was found — not a full citation workflow.
