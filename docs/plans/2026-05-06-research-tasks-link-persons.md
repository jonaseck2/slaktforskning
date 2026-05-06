# Implementation: Research tasks link to persons (and vice versa)

**Date:** 2026-05-06
**Branch strategy:** main if scope stays small; worktree if PersonPanel section grows
**Source:** Beta tester report 69 (v0.215.2)

## User goal

The genealogist uses Research Tasks ("Uppgifter") to record things that need investigating, completing, or confirming about specific people. They want each task to optionally link to one or more persons, and from PersonPanel they want to see — and jump into — the open tasks attached to that person. Tasks should never appear in printed reports (they're internal todos, not lineage facts).

## Scope

The data model already supports the link (per `.claude/rules/api.md`: `task_links` table with `entity_type ∈ {person|place|media}`). The gap is on the UI side.

Files to audit / wire:

- `src/renderer/components/ResearchTaskPanel.vue` — modal/panel for editing a task. Add a "Linked persons" section with a `PersonPicker` that adds rows to `task_links`. Multi-select.
- `src/renderer/components/PersonPanel.vue` — add a `PersonResearchTasksSection` (self-loading, follows the Person Section Component Pattern from renderer rules). Lists tasks linked to this person; row click navigates to the task panel.
- `src/renderer/views/ResearchTasksView.vue` — when adding a task from PersonPanel's "+ Task" CTA, the panel's host person id flows in as a default link (`Surface contract` rule from CLAUDE.md).
- `src/api/research_tasks.ts` — confirm `getResearchTasksForPerson(db, personId)` exists and returns the linked tasks; if not, add it (mirroring `getGroupsForPerson`).
- Reports: confirm none of the 7 keepsake reports (`src/renderer/components/reports/`) read research_tasks. They don't today (reports are person/place/media-driven). Document in plan that tasks are explicitly excluded from print output by design.

### Scope deviations

- **`task_links` for places + media**: existing model already supports them. Surfacing on PlacePanel + MediaPanel is out of scope here — per-person was the user's specific ask. Open follow-ups if desired.
- **MCP tool path**: `add_research_task` already takes optional `personIds` param per the existing tool. Confirm it links via `task_links` with `entity_type='person'`.

## Design summary

### PersonPanel section

Add `PersonResearchTasksSection.vue` to `src/renderer/components/`. Self-loading via `useEntityData(toRef(props, 'personId'), loader)`. Loader calls `window.api.researchTasks.forPerson(personId)`. Row click routes to `/research-tasks/<taskId>` (the panel pre-selected). SectionHeader's `@action` opens the existing task-create modal with the host person pre-linked.

Place the section after **Notes** and before **Quality** (low-priority surface; not an authored fact).

### ResearchTaskPanel "Linked persons"

A small `PersonPicker`-driven multi-select. Save adds new `task_links` rows with `entity_type='person'` and removes any unchecked. Existing links visible as removable chips.

### CTA fulfillment check (per Surface contract)

The PersonPanel's `+ Task` CTA must:

1. **Promise:** "+ Task" creates a task.
2. **Wiring:** opens the task-create modal, not a sibling create.
3. **Context lift:** the modal opens with `default-person-ids=[currentPerson.id]` so the link is automatic.
4. **Lifecycle parity:** the section row click → edit; trash icon → delete confirm.
5. **Reactivity:** `useEntityData`'s onDataChanged subscription auto-refreshes after save.

## Tasks

- [ ] **API audit** — confirm `getResearchTasksForPerson` exists (or add it) returning `(task, link.created_at)` joined.
- [ ] **`PersonResearchTasksSection.vue`** — new component using `useEntityData`. Empty state when no tasks. Row click navigates.
- [ ] **`PersonPanel.vue`** — register new section between Notes and Quality. SectionHeader `+ Task` opens task modal with host person pre-linked.
- [ ] **`ResearchTaskPanel.vue`** — "Linked persons" section with PersonPicker. Edit/save updates `task_links`.
- [ ] **i18n keys** in both locales: `personPanel.researchTasks` ("Uppgifter" / "Tasks"), `taskPanel.linkedPersons`, `personPanel.researchTasks.empty`.
- [ ] **Reports check** — grep `src/renderer/components/reports/` for any `research_tasks` access; confirm none. Document in plan as excluded by design.
- [ ] **Component test** — mount `PersonResearchTasksSection` with a fixture person who has 2 linked tasks; assert both render with correct text + click-to-navigate.
- [ ] **Component test** — mount PersonPanel; assert section renders. Click "+ Task" → assert modal opens with `default-person-ids` containing the host id.
- [ ] **Minor bump** + CHANGELOG: `- feat: research tasks can be linked to persons; visible from PersonPanel`.

## Verification (user-observable)

1. Open any person in PersonPanel. New "Uppgifter" section visible (empty if no linked tasks).
2. Click "+ Task". Task create modal opens with that person already linked. Save. Section refreshes; new task visible.
3. Click the new task row → navigate to ResearchTasksView with the task panel open. "Länkade personer" section shows the host person.
4. Edit the task; add a second linked person via PersonPicker. Save. Both persons see the task on their PersonPanel.
5. Print any report. No "Uppgifter" section appears anywhere in the output.

## Failure modes / RCA reference

- **Surface contract trap (CLAUDE.md):** `+ Task` must lift the host person id into the modal. A task created from PersonPanel that doesn't auto-link is the same shape as the historical `PlacePanel + Add person` orphan bug.
- **Reports leakage:** if a future report ever joins on `research_tasks`, the user's privacy expectation is violated. Add a code comment in any new report primitive: "Research tasks are intentionally excluded from print/export."
- **Polymorphic `entity_id`:** `task_links` is polymorphic (per api.md). Cleanup on `deletePerson` happens in `deletePerson` already; verify it covers task_links the same way it covers group_links.
