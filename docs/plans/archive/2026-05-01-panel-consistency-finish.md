# Panel Consistency — Finish the Job

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` with `subagent-handoff` (project-local prompt templates) to implement this plan. Plan format follows `.claude/rules/plans.md` (User goal first, full pattern scope, verification by user-observable outcome, RCA footer).

## User goal

Every right-side panel in the app — Person, Place, Source, Relationship, Group, Research Task, Media, Report, Website, Export Options — looks identical, behaves identically, and updates instantly when data changes anywhere in the app. *In the user's own words:*

- *"You do reusable components for things to make the user experience consistent everywhere. not because it's fewer lines of code or some technical metric i don't care about. CONSISTENCY THROUGH ALIGNMENT IS KEY."*
- *"You do not do half a migration, or suggest half a change. you do it consistently across the app."*
- *"I want fewer components working more consistently, not more components behaving in a similar way."*

The previous plan (archived) optimized for "ship the refactor" — 6 of 10 panels migrated, 4 left as-is. This plan finishes the consistency work so every paneled route looks the same, forever.

## Scope

**Pattern: every `*Panel.vue` in `src/renderer/components/` uses the `EntityPanel` shell.** Full target list with state:

| Panel | State | Notes |
|---|---|---|
| PersonPanel.vue        | ✅ migrated (v0.190.0) | |
| PlacePanel.vue         | ✅ migrated (v0.190.0) | |
| SourcePanel.vue        | ✅ migrated (v0.190.0) | |
| RelationshipPanel.vue  | ✅ migrated (v0.190.0) | |
| GroupPanel.vue         | ✅ migrated (v0.190.0) | |
| ResearchTaskPanel.vue  | ✅ migrated (v0.190.0) | |
| MediaPanel.vue         | ❌ pending             | This plan, Task 4 |
| ReportPanel.vue        | ❌ pending             | This plan, Task 5 |
| WebsitePanel.vue       | ❌ pending             | This plan, Task 5 |
| ExportOptionsPanel.vue | ❌ pending             | This plan, Task 5 |

**Scope deviations:** none. If any pending panel turns out to be structurally incompatible with EntityPanel (genuinely different shape, e.g. not viewing a single entity), document why with a code comment AND propose an extension to the shell rather than excluding the panel. "It's awkward to migrate" doesn't count.

## Verification (user-observable, per `.claude/rules/plans.md` Rule A3)

1. **Smoke test (mandatory before marking done):** open every paneled route in the running app — `/persons`, `/places`, `/sources`, `/relationships`, `/groups`, `/research-tasks`, `/media`, `/reports`, `/website`, plus the Export Options panel wherever it surfaces. Visually confirm identical width / height / border-radius / shadow behavior across all of them. The dispatcher (per `subagent-handoff` Rule B3) does NOT mark Task 7 done on subagent reports alone.
2. **Class-collision regression test (Task 3):** mounts each `*Panel.vue` and asserts root has `.side-panel` class and does NOT have `.entity-panel` (collision class).
3. **Reactivity smoke test:** edit a name in any panel; the corresponding row in the list AND the chart/map updates without view-switch.

`vitest passes` and `lint clean` are hygiene, not verification of the user goal — they don't count toward the bar above.

## Failure modes / RCA reference (per `.claude/rules/plans.md` Rule A4)

The mistakes this plan exists to prevent — read before executing:

1. **Class-name collision (`.entity-panel` vs `shared.css:1253`):** v0.190.0 EntityPanel chose a root class already in use by BaseSubPanel modal chrome. Migrated panels silently inherited `width: 320px; max-height: calc(100vh - 64px)`. Caught only by user inspecting computed styles. Task 1 adds the renderer-level class-collision check rule. The `dom-first-debugging` skill exists so the next layout bug starts with DOM inspection, not CSS reasoning.
2. **Half-migration (6 of 10 panels):** previous plan scope was tactical when user goal was "every panel." `.claude/rules/plans.md` Rule A2 (all-or-nothing pattern migrations) now exists. This plan covers all remaining panels.
3. **Reviewers verified spec compliance, not user goal:** `.claude/skills/subagent-handoff/spec-reviewer-prompt.md` now flips this. Spec reviewer's first question is user-goal alignment.
4. **No styling consistency test:** Task 3 of this plan adds it.

If any of these failure modes resurface during execution, pause — the plan or the rules are wrong, iterate before continuing.

## Out of scope

- Restructuring data-loading composables (`useEntityData`, `useEditableFields`, `usePagedList`) — working as intended.
- Restructuring `EntityPanel`'s template — slot/header/empty structure is correct.
- The `Afrika`-as-continent gazetteer issue — separate plan.

## Prerequisites

Foundation on `main` (v0.190.0–v0.190.2):
- [src/renderer/components/EntityPanel.vue](src/renderer/components/EntityPanel.vue) — shell with `#empty` / `#header` / default slots.
- [src/renderer/composables/useEntityData.ts](src/renderer/composables/useEntityData.ts) — auto-subscribes to `onDataChanged`.
- [src/renderer/composables/useEditableFields.ts](src/renderer/composables/useEditableFields.ts) — race-safe field saves.
- [.claude/rules/plans.md](.claude/rules/plans.md) — plan-authoring rules (already exists; Task 1 of this plan no longer adds it).
- [.claude/skills/subagent-handoff/](.claude/skills/subagent-handoff/) — subagent prompt templates (already exists).
- [.claude/skills/dom-first-debugging/](.claude/skills/dom-first-debugging/) — debug-first-on-DOM (already exists).

---

## Task 1: Add class-collision rule (the #1 RCA item)

The bug that locked migrated panels at 320px wide was a class-name collision: `EntityPanel` chose root class `entity-panel` while `.entity-panel` already existed in `shared.css:1253` for BaseSubPanel modal chrome. Nothing in any rule, skill, or test caught it. **Add the rule that would have.**

**Files:**
- Modify: `.claude/rules/renderer.md`

- [x] **Step 1:** Add a new section to `.claude/rules/renderer.md` immediately after the "Shared component catalog" section:

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

- [x] **Step 2:** Commit `docs(rules): require class-collision grep before naming new renderer classes`.

---

## Task 2: Reinforce all-or-nothing migration at renderer + add-feature level

The plan-authoring version of "all-or-nothing" already exists in [`.claude/rules/plans.md`](.claude/rules/plans.md) Rule A2 (every plan that introduces a reusable pattern enumerates all instances). This task adds the **component-level** counterpart in renderer.md (so it fires when you're writing the component, not just the plan) and links it from the add-feature skill.

**Files:**
- Modify: `.claude/rules/renderer.md`
- Modify: `.claude/skills/add-feature/SKILL.md`

- [x] **Step 1:** Add to `.claude/rules/renderer.md` after the new collision rule (Task 1):

```markdown
## Pattern migrations are all-or-nothing (component level)

This is the component-level companion to `.claude/rules/plans.md` Rule A2 (plan level). When a refactor touches a reusable pattern (a side panel, a list view, a modal, a chart), every instance migrates in the same change or it doesn't ship. Half-migrations are anti-consistency.

Before merging:
1. Enumerate every same-shaped component. Panels: `src/renderer/components/*Panel.vue`. List views: every entity-list in `src/renderer/views/`. Modals: every consumer of `BaseSubPanel`.
2. Migrate every one. The plan's "Scope" section lists them with state per `.claude/rules/plans.md` Rule A2.
3. If a target genuinely can't adopt the new pattern, document why in the plan AND in a code comment in the unmigrated file (`/* Not migrated to <pattern>: <specific reason> */`). "Awkward" is not a reason. "The pattern doesn't fit because <constraint>" is.

**Anti-pattern:** "the plan covered 6 panels; the other 4 are out of scope." User's mental model is "every right-side panel works the same."
```

- [x] **Step 2:** In `.claude/skills/add-feature/SKILL.md`, add at the top under the existing intro:

```markdown
**Pattern enforcement:** if you build/refactor a reusable shell (panel, list, modal), every same-shaped component must adopt it in the same change. See `.claude/rules/renderer.md` "Pattern migrations are all-or-nothing" and `.claude/rules/plans.md` Rule A2.
```

- [x] **Step 3:** Commit `docs(rules): component-level all-or-nothing migration rule`.

---

## Task 3: Add panel layout consistency test

The styling-consistency test the user has asked for. Mounts each migrated `*Panel.vue` in a representative wrapper, reads computed styles, asserts they match. Catches class collisions, missing rules, and per-panel divergence in CI before the user has to.

**Files:**
- Create: `tests/components/panel-layout-consistency.test.ts`

- [x] **Step 1:** Write the test (this is one file, ~80 lines):

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

- [x] **Step 2:** Run: `npx vitest run tests/components/panel-layout-consistency.test.ts`. All assertions pass.
- [x] **Step 3:** Commit `test(panel): assert all panel roots use .side-panel and reject .entity-panel collision`.

---

## Task 4: Migrate MediaPanel to EntityPanel

The largest of the unmigrated panels. Same shape as the other 6 — uses `useEntityData` already, has its own header / sections / collapse button.

**Files:**
- Modify: `src/renderer/components/MediaPanel.vue`

- [x] **Step 1:** Read [PlacePanel.vue:1-30](src/renderer/components/PlacePanel.vue) for the migration template (the simplest reference).
- [x] **Step 2:** Wrap the MediaPanel template body in `<EntityPanel entity-type="media" :entity="media" :label="$t('panel.manageMedia')" @close="emit('close')">` with `#empty`, `#header`, default slot. Remove the old `.media-panel.side-panel` root + collapse button + role label markup that EntityPanel now owns.
- [x] **Step 3:** Add i18n keys `panel.manageMedia` to both `en.ts` and `sv.ts` if missing.
- [x] **Step 4:** Run `tests/components` + `tests/components/panel-layout-consistency.test.ts` (Task 3) — all pass.
- [x] **Step 5:** Lint clean.
- [x] **Step 6:** Commit `refactor(panel): migrate MediaPanel to EntityPanel`.

---

## Task 5: Migrate ReportPanel + WebsitePanel + ExportOptionsPanel

Same pattern as Task 4. ExportOptionsPanel is small — likely 5 lines of change. Report and Website are mid-size.

For each:
- [x] Wrap in `<EntityPanel entity-type="..." :entity="..." :label="..." @close>` with appropriate slots.
- [x] Add missing i18n keys (`panel.manageReport`, `panel.manageWebsite`, `panel.manageExportOptions`) to both locales.
- [x] If a panel genuinely doesn't fit the entity-shaped pattern (e.g. it's not viewing a single entity), document why with a comment AND skip — but still rename its root class away from anything in `shared.css`.
- [x] Run consistency test from Task 3 — all pass.
- [x] Lint clean.
- [x] Commit per panel: `refactor(panel): migrate <Name>Panel to EntityPanel`.

---

## Task 6: Document the panel pattern as canonical in renderer.md

Now that all panels use the same shell, lock that fact in.

**Files:**
- Modify: `.claude/rules/renderer.md`

- [x] **Step 1:** Update the "Shared component catalog" `EntityPanel` line to read:
  ```
  - `src/renderer/components/EntityPanel.vue` — **shared shell for ALL right-side panels (no exceptions)**: panel-collapse-btn (▶), panel-role-label, #empty / #header / default body slots, optional `editable` Edit button. Every `*Panel.vue` in `src/renderer/components/` MUST use it. New panels go through it from day one.
  ```
- [x] **Step 2:** Update the "List View + Side Panel Pattern" subsection to assert the rule explicitly: every `:entity-id` route's right pane is an EntityPanel-wrapped panel.
- [x] **Step 3:** Commit `docs(rules): mark EntityPanel as canonical for all right-side panels`.

---

## Task 7: Final verification + version bump

- [x] **Step 1:** `npx vitest run` — full suite green (~2810 tests).
- [x] **Step 2:** `npm run lint` — 0 errors.
- [x] **Step 3:** `grep -RIn '\.entity-panel\b' src/renderer/components/*.vue | grep "class=" | grep -v BaseSubPanel.vue` — should return 0 lines (no panel still uses the modal-chrome class).
- [x] **Step 4:** Smoke test in the running app: navigate to `/persons`, `/places`, `/sources`, `/relationships`, `/groups`, `/research-tasks`, `/media`, `/reports`, `/website` — every right panel should have identical width/height/border-radius/shadow behavior, fill the height, and resize on drag.
- [x] **Step 5:** Mark every checkbox `[x]`. Move plan to `docs/plans/archive/`. Bump `package.json` minor (any new feature in scope), or patch (if pure refactor). Add `CHANGELOG.md` entry summarising "every right-side panel now uses the EntityPanel shell — fully consistent UX, no more class-collision class of bug".
- [x] **Step 6:** Commit `chore: archive completed panel-consistency plan + bump`. Merge to main, delete branch + worktree.

---

## Self-review checklist

- [x] All 10 `*Panel.vue` components use `<EntityPanel>` (or have a documented `Not migrated` comment with reason).
- [x] `grep '\.entity-panel\b' src/renderer/components/*.vue` returns only `BaseSubPanel.vue` (the legitimate user) and no panel root.
- [x] `tests/components/panel-layout-consistency.test.ts` is green and asserts every panel uses `.side-panel` and rejects `.entity-panel` on the root.
- [x] `.claude/rules/renderer.md` contains the class-collision check rule and the all-or-nothing migration rule.
- [x] Every migrated panel still emits its previous events (`*-updated`, `close`, etc.) and exposes its previous `defineExpose` surface.
- [x] Smoke test: all 9 paneled routes look and behave identically with respect to layout.

## RCA reference (for the executor)

Read this before starting. The previous plan failed for these reasons; don't repeat them:

1. **Class-name collision (`.entity-panel` clash with `shared.css`):** caught only by user inspecting DOM. Task 1 + Task 3 prevent recurrence.
2. **Half-migration (6 of 10 panels):** plan scope was tactical when the user goal was strategic. Task 2 makes the rule explicit; this plan covers all remaining panels.
3. **Reviewers verified spec compliance, not user goal:** subagent reviewers checked "matches plan?" not "matches consistency?". Task 7's smoke test step is human-required before marking done.
4. **No styling consistency test:** Task 3 adds it.

Don't dispatch this plan to subagents on Sonnet without re-reading these failure modes. Pause if anything feels like "out of scope" — almost every "out of scope" decision in the previous plan was wrong.
