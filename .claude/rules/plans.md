# Plan Authoring Rules

Loads when reading or writing files in `docs/plans/`. Project-local override; complements upstream `superpowers:writing-plans` rather than replacing it.

## Why this exists

The panel-composables refactor (v0.190.0–v0.190.2) shipped half-consistent panels because the plan was written mechanism-first ("introduce these composables"), with implicit scope ("the 6 entity panels" rather than "every right-side panel in the app"), and verified against tests that didn't observe the user goal. These rules exist so plans communicate user-goal-first, scope-explicit, verification-by-user-observable-outcome — and so the next refactor doesn't repeat the same drift.

## Required sections, in order

Every plan in `docs/plans/` must open with these sections, in this exact order, before any "Tasks" or implementation detail.

### 1. User goal

The user-observable outcome the plan exists to deliver. **Not** the mechanism. Written so I (the user) can read it and recognize it as what I asked for.

- ✅ "Every right-side panel updates instantly when data changes, looks identical, and behaves identically across all paneled views."
- ❌ "Eliminate ~600 lines of duplicated panel code by extracting three composables and a shared shell."

If you can't write the user goal in plain language without naming a function, file, or composable, you don't yet understand the goal — go back to the user and ask.

### 2. Scope (with deviations explicit at the top)

Every plan that introduces a reusable pattern (shell component, composable, helper, abstraction) must enumerate **every instance of that pattern in the codebase as a migration target**. The default assumption is "all of them." Anything less is a deviation.

- Required: a bullet list of every same-shaped component, file, or call site.
- If you intend to migrate fewer than all of them, add a **"Scope deviations"** subsection listing each non-target with explicit reason. The reason must be specific (not "out of scope" — name *why*).
- A reusable shell that some instances use and others don't is anti-consistency. Flag this loudly at the top so I can override before execution starts.

### 3. Verification

Every plan must end its preamble (or precede each task's checkboxes) with a "Verification" section that names:
1. The user-observable outcome (matches §1).
2. The check that proves it. Tests count only if they observe user goal, not structure. Lint, type-check, and "function exists" assertions do **not** count toward verification of user goal — they're hygiene.

If your only verification is "vitest passes" for a feature whose user goal is user-observable (UI, MCP tool output, file output, gazetteer resolution), the plan is unverified. Add a smoke-check step or a test that exercises the user-observable behavior end-to-end.

### 4. Failure modes / RCA reference (when applicable)

If the plan follows a failed prior attempt — or addresses a class of bug we've hit before — include a "Failure modes / RCA reference" footer at the end of the preamble (before Tasks). This is read-before-execute material so the executor (a fresh session, a subagent) doesn't repeat the same mistake. Cite specific commits or prior plans.

## Anti-patterns this rule rejects

- **Mechanism-first goal.** "Add `useFooBar` composable" instead of "every list refreshes after a save."
- **Implicit scope.** "These six panels" without enumerating the other four and explaining why they're excluded.
- **Hygiene-as-verification.** Marking a UI feature done because vitest is green and lint is clean.
- **Out-of-band scope creep.** Discovering during execution that "actually we should also do X" — that means the plan's scope was wrong from the start; pause, edit the plan, get a nod.
- **Productive-feeling drift.** Writing detailed task lists before the user goal is in writing. Tasks before goal = mechanism before intent.

## Worked example

This is what the panel-composables refactor should have opened with:

> **User goal:** Every right-side panel in the app — Person, Place, Source, Relationship, Group, Research Task, Media, Report, Website, Export Options — looks identical, behaves identically, and updates instantly when data changes anywhere in the app. Never again "I had to switch away and come back to see my edit." Never again "Groups panel looks slightly different from Persons panel because they share 90% of the styling but not the last 10%."
>
> **Scope:** Every `*Panel.vue` in `src/renderer/components/`. Full list (10): PersonPanel, PlacePanel, SourcePanel, RelationshipPanel, GroupPanel, ResearchTaskPanel, MediaPanel, ReportPanel, WebsitePanel, ExportOptionsPanel.
>
> **Scope deviations:** none. If any panel is structurally incompatible with the new shell, document why with a code comment AND propose an extension to the shell rather than excluding the panel.
>
> **Verification:**
> 1. Open every paneled route in the running app. Visually confirm identical width/height/border-radius/shadow behavior.
> 2. A `panel-layout-consistency` test in `tests/components/` mounts each panel and asserts root class membership matches a reference panel.
> 3. After editing a name in any panel, the corresponding entity in the list / chart / map updates without view-switch. Smoke-check by user.

That's the preamble. Tasks come after.

## Verification of these rules (meta)

The verification of *these* rules is the next plan written in this repo. If the next plan opens with mechanism instead of user goal, or scopes implicitly, or verifies via lint+vitest only, the rule didn't fire — the rule is wrong, not the plan. Iterate the rule.

A scheduled audit: every two weeks, re-read the most recent three plans against this file. If any drifted, the rule has decayed; rewrite or strengthen.
