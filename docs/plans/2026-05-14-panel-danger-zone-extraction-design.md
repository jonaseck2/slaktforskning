# Design — Panel danger-zone extraction

**Roadmap reference:** [2026-05-14-audit-followup-roadmap.md](2026-05-14-audit-followup-roadmap.md) §3.7 (reframed).

## User goal

When the project decides to change the entity-deletion UX (e.g., add a "type the name to confirm" gate, change the cascade-summary format, switch to a different confirm dialog), it changes in *one* place — not six. Every paneled entity (Person, Place, Source, Media, Group, ResearchTask) gets the same danger-zone behavior for free.

After this plan: each of those six panels imports `<PanelDangerZone>`; the ~50 LOC of repeated markup + state per panel is gone.

## Why now — and why the audit's original 3.7 was wrong

The 2026-05-14 audit's 3.7 premise — "panel section scaffold composable" — was **already done**. Re-investigation 2026-05-14 verified:
- [`src/renderer/composables/usePanelSections.ts`](../../src/renderer/composables/usePanelSections.ts) exists.
- 8 of 10 panels use it: GroupPanel, MediaPanel, PersonPanel, PlacePanel, ReportPanel, ResearchTaskPanel, SourcePanel, WebsitePanel.
- 2 documented exceptions: EntityPanel (the shared shell — no sections), ExportOptionsPanel (per CLAUDE.md: "The only documented exception is `ExportOptionsPanel.vue`, which is an embedded options form inside a card").

Section management is already migrated. The audit's "4,936 LOC of section-management boilerplate" claim was wrong — the 4,936 LOC is the panels themselves, dominated by domain-specific section markup and per-entity computed state, not reducible to a section composable.

**Re-investigation** found the actual reducible duplication: six panels (PersonPanel, PlacePanel, SourcePanel, MediaPanel, GroupPanel, ResearchTaskPanel) each implement an identical `panel-danger-zone` block — verified via `grep -l panel-danger-zone`:
- Same markup: `<div class="panel-danger-zone"><AppButton><IconTrash /></AppButton></div>`.
- Same state: `showDeleteConfirm = ref(false)`.
- Same modal: `<ConfirmModal>` with entity-typed label + cascade-summary.
- Same handler: call `window.api.<entity>.delete(id)` + emit close + route back to list.

Per CLAUDE.md "Surface contract" Check 3 (host-level lifecycle), every entity panel **must** offer panel-level delete. The six panels comply but each rolls its own implementation. Risk: drift. If one panel's deletion flow gets a UX improvement, the other five fall behind.

## Scope

Extract the danger-zone pattern into a `<PanelDangerZone>` component at [`src/renderer/components/PanelDangerZone.vue`](../../src/renderer/components/PanelDangerZone.vue) that accepts:

- `entityType: 'person' | 'place' | 'source' | 'media' | 'group' | 'research-task'`
- `entityId: string`
- `entityLabel: string` (for the confirm dialog)
- `cascadeSummary: string[]` (lines to render in the confirm dialog body)
- `readonly?: boolean` — hides the component when the parent is read-only.
- emits `deleted` — parent uses to close the panel + navigate.

The component renders the danger-zone div + AppButton + IconTrash + ConfirmModal entirely. Six panels go from ~50 LOC of inline danger-zone to one `<PanelDangerZone>` element.

### Why a component, not a composable

A composable that returns just state (`{ showDeleteConfirm, openConfirm, confirmDelete }`) leaves identical markup in six places. A component owns markup + state + modal — one canonical implementation. The markup duplication is the bulk of the LOC; the component pattern eliminates both layers.

### Scope deviations

- **`ReportPanel`, `WebsitePanel`, `ExportOptionsPanel`** don't have danger zones — they're report-/export-mode panels, not entity panels. Not in scope.
- **`EntityPanel.vue`** (the shared shell) doesn't host the danger-zone — it's a slot/structure component, not an entity-specific one. Panels render `<PanelDangerZone>` inside `EntityPanel`'s default slot.
- **Cascade-summary content stays panel-specific.** Each entity has different cascade impacts ("this person, their 3 events, their 12 citations…"). Parent panel still computes the `cascadeSummary` strings; `PanelDangerZone` just renders them.
- **Per-entity delete API dispatch.** `PanelDangerZone` calls `window.api.persons.delete`, `.places.delete`, etc. based on `entityType`. The dispatcher is internal to the component; renaming an `entityType` value produces a TS error (typed as a union literal). Alternative: accept an `onDelete` callback. **Decision: internal dispatcher** — cleaner call sites, types catch typos.
- **i18n keys consistent.** All six panels use identical i18n key shape for confirm-dialog title/body (`confirmModal.deleteEntity.title` with `{entity}` interpolation). This **is a UX change** — some current panels have slightly different wording. Document in close-out; verify each entity-name interpolation reads naturally.

## Approach

Single PR. All six entity panels migrate together per [`.claude/rules/renderer.md`](../../.claude/rules/renderer.md) §"Pattern migrations are all-or-nothing."

Order of execution:
1. Build `<PanelDangerZone>` with one entity panel using it (PersonPanel as reference).
2. Verify behavior matches the current PersonPanel danger-zone exactly: confirm dialog text, cascade summary rendering, deletion flow, navigation post-delete.
3. Migrate remaining five panels.
4. Verify each panel's deletion flow in the running app.

## Verification

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) user-goal-falsifiability check:

1. **`<PanelDangerZone>` exists.** [`src/renderer/components/PanelDangerZone.vue`](../../src/renderer/components/PanelDangerZone.vue) implements the danger-zone markup + state + confirm modal.
2. **Six panels import it.** `grep -l PanelDangerZone src/renderer/components/{Person,Place,Source,Media,Group,ResearchTask}Panel.vue` returns all six paths.
3. **Per-panel LOC drops.** Each migrated panel's LOC reduces by ~30–50 vs pre-refactor. Capture exact numbers in close-out.
4. **No more inline `panel-danger-zone` blocks.** `grep 'panel-danger-zone' src/renderer/components/{Person,Place,Source,Media,Group,ResearchTask}Panel.vue` returns empty (the CSS class is now only inside `PanelDangerZone.vue`).
5. **`npm test` exits 0** with same test count.
6. **All six deletion flows work in the running app.** Spot-test: for each of the six entities, open it, click the trash button, confirm modal appears with correct cascade summary, click delete, entity disappears, navigation routes back to list.
7. **i18n keys unified.** Every consumer reads the same key shape; the close-out notes any user-visible string change.

Falsifiability check: if every item passes, can a future deletion-UX change require touching all six panels? **No** — items 2, 4 enforce single source of truth.

### Dependencies

None. Independent of all other plans.

## Failure modes / RCA reference

- **Cascade-summary divergence.** Each panel currently formats cascade impacts differently. `<PanelDangerZone>` accepts the summary as already-formatted strings (rendered as a list) so per-entity formatting stays in the parent. Don't compute cascade impacts inside the shared component — that's domain-specific knowledge that belongs in the parent panel.
- **Reactive prop staleness.** `entityId` changes when the user navigates between entities. The component must re-trigger its internal state correctly on prop changes. Test: click through three persons → close trashes; expect no stale state from the previous person.
- **i18n drift.** Current panels' confirm-dialog text varies — "Delete this person?" vs "Are you sure you want to delete X?" Migration unifies them. **User-visible UX change.** Note in close-out; verify each entity-type interpolation reads naturally in both `sv.ts` and `en.ts`.
- **Audit premise was wrong.** This plan's existence is a reminder that re-investigation matters — the original 3.7 (section composable) was already done; investigation found a real target (danger-zone). Future plans that follow audit findings should be similarly re-verified.

## Effort

1.5 days.
- 0.5 day: build `<PanelDangerZone>`, migrate PersonPanel as reference.
- 0.5 day: migrate the other five panels.
- 0.5 day: i18n unification, in-app verification, close-out evidence.

## Tasks (high-level)

- [ ] Audit each of the six panels' current danger-zone implementations for behavioral differences (confirm text, cascade summary shape, delete API call, post-delete navigation).
- [ ] Define `<PanelDangerZone>` API: props + emits + (no slots needed; cascade-summary is a prop).
- [ ] Build `src/renderer/components/PanelDangerZone.vue` with internal entityType dispatcher.
- [ ] Migrate PersonPanel; verify behavior unchanged in-app.
- [ ] Migrate PlacePanel, SourcePanel, MediaPanel, GroupPanel, ResearchTaskPanel.
- [ ] Unify i18n keys (`confirmModal.deleteEntity.*` with `{entity}` interpolation) in both `sv.ts` and `en.ts`.
- [ ] Spot-test all six deletion flows in the running app.
- [ ] `npm test` + `tsc --noEmit` pass.
- [ ] Document i18n string changes in close-out.
- [ ] Self-review checklist.
