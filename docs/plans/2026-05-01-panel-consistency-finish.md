# Panel Consistency — Finish the Job

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the panel-composables refactor with full UX consistency across **every** right-side panel in the app. The previous plan (`docs/plans/archive/2026-04-28-panel-composables.md`) migrated 6 of 10 panels and left a class-name collision that locked the migrated panels at `width: 320px`. This plan: (1) finishes the remaining 4 panel migrations, (2) adds the rules that should have prevented the collision and the half-migration, (3) adds the styling-consistency test that would have caught the regression in CI.

**Why this matters (read this first, in the user's words):**
- *"You do reusable components for things to make the user experience consistent everywhere. not because it's fewer lines of code or some technical metric i don't care about. CONSISTENCY THROUGH ALIGNMENT IS KEY."*
- *"You do not do half a migration, or suggest half a change. you do it consistently across the app."*
- *"I want fewer components working more consistently, not more components behaving in a similar way."*

The previous plan optimized for "ship the refactor" instead of "every paneled route looks identical, forever." This one fixes that.

---

## Out of scope

- Restructuring the data-loading composables (`useEntityData`, `useEditableFields`, `usePagedList`) — they're working as intended.
- Restructuring `EntityPanel`'s template — the slot/header/empty structure is correct.
- The `Afrika`-as-continent gazetteer issue (separate plan).

## Prerequisites

The previous panel-composables plan landed in v0.190.0–v0.190.2. Foundation is on `main`:
- [src/renderer/components/EntityPanel.vue](src/renderer/components/EntityPanel.vue) — shell component with `#empty`, `#header`, default slot.
- [src/renderer/composables/useEntityData.ts](src/renderer/composables/useEntityData.ts) — auto-subscribes to `onDataChanged`.
- [src/renderer/composables/useEditableFields.ts](src/renderer/composables/useEditableFields.ts) — race-safe field saves.
- 6 panels already migrated (Person, Place, Source, Relationship, Group, ResearchTask).

---

## Task 1: Add class-collision rule (the #1 RCA item)

The bug that locked migrated panels at 320px wide was a class-name collision: `EntityPanel` chose root class `entity-panel` while `.entity-panel` already existed in `shared.css:1253` for BaseSubPanel modal chrome. Nothing in any rule, skill, or test caught it. **Add the rule that would have.**

**Files:**
- Modify: `.claude/rules/renderer.md`

- [ ] **Step 1:** Add a new section to `.claude/rules/renderer.md` immediately after the "Shared component catalog" section:

```markdown
## Class-name collision check (mandatory before naming a new component class)

Before introducing a new CSS class name on any element in `src/renderer/`, grep `shared.css` and every existing `<style scoped>` block for the name. **Class names in `shared.css` are the project's reserved namespace** — picking a name that's already used silently inherits whatever rules `shared.css` set on it.

Required check:
```bash
grep -RIn '\.<new-class-name>\b' src/renderer/styles/ src/renderer/components/ src/renderer/views/ | grep -v ':// '
```

If any hit returns from `shared.css`, **rename your class**. Hits in scoped blocks of unrelated components are usually fine (Vue scoping isolates them) but inspect them first.

**Why:** the panel-composables refactor introduced `EntityPanel` whose root used `class="entity-panel side-panel"`. `.entity-panel` was already in `shared.css:1253` (BaseSubPanel modal chrome — `width: 320px; max-height: calc(100vh - 64px); flex-shrink: 0; overflow: hidden`). Every migrated side panel silently inherited those rules. Tests passed, lint passed, two-stage review approved. The user found it by inspecting computed styles in the running app. This rule exists so the next refactor doesn't repeat that.
```

- [ ] **Step 2:** Commit `docs(rules): require class-collision grep before naming new renderer classes`.

---

## Task 2: Add all-or-nothing migration rule (the #2 RCA item)

The previous plan covered 6 of 10 panels. Media/Reports/Website/ExportOptions were "out of plan scope" but in-app the user saw an inconsistent set of panels. Plans must enforce "every same-shaped component migrates together, full stop."

**Files:**
- Modify: `.claude/rules/renderer.md`
- Modify: `.claude/skills/add-feature/SKILL.md`

- [ ] **Step 1:** Add to `.claude/rules/renderer.md` after the new collision rule:

```markdown
## Pattern migrations are all-or-nothing

If you change how *one* component of a kind works (a side panel, a list view, a modal, a chart), you change all of them at once or you don't ship. Half-migrations create UX inconsistency, which is the thing reusable components are supposed to prevent.

Before merging a refactor that touches a pattern:
1. Enumerate every same-shaped component in the codebase. For panels: every `src/renderer/components/*Panel.vue`. For list views: every entity-list view in `src/renderer/views/`. For modals: every consumer of `BaseSubPanel`.
2. Migrate every one. Plans must list the full target set in their preamble. The plan's checklist must include a row per target.
3. If a target genuinely doesn't fit the new pattern, document why in the plan AND add a comment in the unmigrated file (`/* Not migrated to <pattern>: <reason> */`) so the next refactor doesn't get confused.

**Anti-pattern:** "the plan covered 6 panels; the other 4 are out of scope." The user's mental model is "every right-side panel works the same." Plans must match that model.
```

- [ ] **Step 2:** In `.claude/skills/add-feature/SKILL.md`, add a one-line rule at the top of the file under the existing intro:

```markdown
**Pattern enforcement:** if you build/refactor a reusable shell (panel, list, modal), every same-shaped component in the codebase must adopt it in the same change. See `.claude/rules/renderer.md` "Pattern migrations are all-or-nothing".
```

- [ ] **Step 3:** Commit `docs(rules): pattern migrations are all-or-nothing`.

---

## Task 3: Add panel layout consistency test

The styling-consistency test the user has asked for. Mounts each migrated `*Panel.vue` in a representative wrapper, reads computed styles, asserts they match. Catches class collisions, missing rules, and per-panel divergence in CI before the user has to.

**Files:**
- Create: `tests/components/panel-layout-consistency.test.ts`

- [ ] **Step 1:** Write the test (this is one file, ~80 lines):

```typescript
// tests/components/panel-layout-consistency.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from './setup';
import PersonPanel from '../../src/renderer/components/PersonPanel.vue';
import PlacePanel from '../../src/renderer/components/PlacePanel.vue';
import SourcePanel from '../../src/renderer/components/SourcePanel.vue';
import RelationshipPanel from '../../src/renderer/components/RelationshipPanel.vue';
import GroupPanel from '../../src/renderer/components/GroupPanel.vue';
import ResearchTaskPanel from '../../src/renderer/components/ResearchTaskPanel.vue';
import MediaPanel from '../../src/renderer/components/MediaPanel.vue';
import ReportPanel from '../../src/renderer/components/ReportPanel.vue';
import WebsitePanel from '../../src/renderer/components/WebsitePanel.vue';

// Each panel mounted in its empty state — sufficient to compare structural
// CSS. Mount config stub `window.api` minimally to avoid network calls.
const PANELS = [
  { name: 'PersonPanel',       comp: PersonPanel,        idProp: 'personId' },
  { name: 'PlacePanel',        comp: PlacePanel,         idProp: 'placeId' },
  { name: 'SourcePanel',       comp: SourcePanel,        idProp: 'sourceId' },
  { name: 'RelationshipPanel', comp: RelationshipPanel,  idProp: 'relationshipId' },
  { name: 'GroupPanel',        comp: GroupPanel,         idProp: 'groupId' },
  { name: 'ResearchTaskPanel', comp: ResearchTaskPanel,  idProp: 'taskId' },
  { name: 'MediaPanel',        comp: MediaPanel,         idProp: 'mediaId' },
  { name: 'ReportPanel',       comp: ReportPanel,        idProp: 'reportId' }, // adjust if different
  { name: 'WebsitePanel',      comp: WebsitePanel,       idProp: 'siteId' },   // adjust if different
];

describe('panel layout consistency', () => {
  beforeEach(() => {
    (globalThis as any).window.api = new Proxy({}, { get: () => () => Promise.resolve(null) });
  });

  it.each(PANELS)('$name root has .side-panel class', ({ comp, idProp }) => {
    const w = mount(comp as any, { global: { plugins: [i18n] }, props: { [idProp]: null } });
    const root = w.element as HTMLElement;
    expect(root.classList.contains('side-panel')).toBe(true);
  });

  it.each(PANELS)('$name root does NOT have .entity-panel class (collision guard)', ({ comp, idProp }) => {
    const w = mount(comp as any, { global: { plugins: [i18n] }, props: { [idProp]: null } });
    const root = w.element as HTMLElement;
    expect(root.classList.contains('entity-panel')).toBe(false);
  });

  // For width/height computed-style consistency, run in a real browser
  // environment (component tests use jsdom which doesn't compute layout
  // styles). The class assertions above catch the collision class of bug;
  // computed-style assertions live in tests/e2e/ if needed.
});
```

- [ ] **Step 2:** Run: `npx vitest run tests/components/panel-layout-consistency.test.ts`. All assertions pass.
- [ ] **Step 3:** Commit `test(panel): assert all panel roots use .side-panel and reject .entity-panel collision`.

---

## Task 4: Migrate MediaPanel to EntityPanel

The largest of the unmigrated panels. Same shape as the other 6 — uses `useEntityData` already, has its own header / sections / collapse button.

**Files:**
- Modify: `src/renderer/components/MediaPanel.vue`

- [ ] **Step 1:** Read [PlacePanel.vue:1-30](src/renderer/components/PlacePanel.vue) for the migration template (the simplest reference).
- [ ] **Step 2:** Wrap the MediaPanel template body in `<EntityPanel entity-type="media" :entity="media" :label="$t('panel.manageMedia')" @close="emit('close')">` with `#empty`, `#header`, default slot. Remove the old `.media-panel.side-panel` root + collapse button + role label markup that EntityPanel now owns.
- [ ] **Step 3:** Add i18n keys `panel.manageMedia` to both `en.ts` and `sv.ts` if missing.
- [ ] **Step 4:** Run `tests/components` + `tests/components/panel-layout-consistency.test.ts` (Task 3) — all pass.
- [ ] **Step 5:** Lint clean.
- [ ] **Step 6:** Commit `refactor(panel): migrate MediaPanel to EntityPanel`.

---

## Task 5: Migrate ReportPanel + WebsitePanel + ExportOptionsPanel

Same pattern as Task 4. ExportOptionsPanel is small — likely 5 lines of change. Report and Website are mid-size.

For each:
- [ ] Wrap in `<EntityPanel entity-type="..." :entity="..." :label="..." @close>` with appropriate slots.
- [ ] Add missing i18n keys (`panel.manageReport`, `panel.manageWebsite`, `panel.manageExportOptions`) to both locales.
- [ ] If a panel genuinely doesn't fit the entity-shaped pattern (e.g. it's not viewing a single entity), document why with a comment AND skip — but still rename its root class away from anything in `shared.css`.
- [ ] Run consistency test from Task 3 — all pass.
- [ ] Lint clean.
- [ ] Commit per panel: `refactor(panel): migrate <Name>Panel to EntityPanel`.

---

## Task 6: Document the panel pattern as canonical in renderer.md

Now that all panels use the same shell, lock that fact in.

**Files:**
- Modify: `.claude/rules/renderer.md`

- [ ] **Step 1:** Update the "Shared component catalog" `EntityPanel` line to read:
  ```
  - `src/renderer/components/EntityPanel.vue` — **shared shell for ALL right-side panels (no exceptions)**: panel-collapse-btn (▶), panel-role-label, #empty / #header / default body slots, optional `editable` Edit button. Every `*Panel.vue` in `src/renderer/components/` MUST use it. New panels go through it from day one.
  ```
- [ ] **Step 2:** Update the "List View + Side Panel Pattern" subsection to assert the rule explicitly: every `:entity-id` route's right pane is an EntityPanel-wrapped panel.
- [ ] **Step 3:** Commit `docs(rules): mark EntityPanel as canonical for all right-side panels`.

---

## Task 7: Final verification + version bump

- [ ] **Step 1:** `npx vitest run` — full suite green (~2810 tests).
- [ ] **Step 2:** `npm run lint` — 0 errors.
- [ ] **Step 3:** `grep -RIn '\.entity-panel\b' src/renderer/components/*.vue | grep "class=" | grep -v BaseSubPanel.vue` — should return 0 lines (no panel still uses the modal-chrome class).
- [ ] **Step 4:** Smoke test in the running app: navigate to `/persons`, `/places`, `/sources`, `/relationships`, `/groups`, `/research-tasks`, `/media`, `/reports`, `/website` — every right panel should have identical width/height/border-radius/shadow behavior, fill the height, and resize on drag.
- [ ] **Step 5:** Mark every checkbox `[x]`. Move plan to `docs/plans/archive/`. Bump `package.json` minor (any new feature in scope), or patch (if pure refactor). Add `CHANGELOG.md` entry summarising "every right-side panel now uses the EntityPanel shell — fully consistent UX, no more class-collision class of bug".
- [ ] **Step 6:** Commit `chore: archive completed panel-consistency plan + bump`. Merge to main, delete branch + worktree.

---

## Self-review checklist

- [ ] All 10 `*Panel.vue` components use `<EntityPanel>` (or have a documented `Not migrated` comment with reason).
- [ ] `grep '\.entity-panel\b' src/renderer/components/*.vue` returns only `BaseSubPanel.vue` (the legitimate user) and no panel root.
- [ ] `tests/components/panel-layout-consistency.test.ts` is green and asserts every panel uses `.side-panel` and rejects `.entity-panel` on the root.
- [ ] `.claude/rules/renderer.md` contains the class-collision check rule and the all-or-nothing migration rule.
- [ ] Every migrated panel still emits its previous events (`*-updated`, `close`, etc.) and exposes its previous `defineExpose` surface.
- [ ] Smoke test: all 9 paneled routes look and behave identically with respect to layout.

## RCA reference (for the executor)

Read this before starting. The previous plan failed for these reasons; don't repeat them:

1. **Class-name collision (`.entity-panel` clash with `shared.css`):** caught only by user inspecting DOM. Task 1 + Task 3 prevent recurrence.
2. **Half-migration (6 of 10 panels):** plan scope was tactical when the user goal was strategic. Task 2 makes the rule explicit; this plan covers all remaining panels.
3. **Reviewers verified spec compliance, not user goal:** subagent reviewers checked "matches plan?" not "matches consistency?". Task 7's smoke test step is human-required before marking done.
4. **No styling consistency test:** Task 3 adds it.

Don't dispatch this plan to subagents on Sonnet without re-reading these failure modes. Pause if anything feels like "out of scope" — almost every "out of scope" decision in the previous plan was wrong.
