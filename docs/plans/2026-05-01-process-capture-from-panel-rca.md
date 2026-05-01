# Process Capture from Panel-Composables RCA

> **For agentic workers:** this plan is deliberately small and run by hand, no subagents. Each task ends with a verification artifact you (the user) can audit before moving on. The plan itself is the worked example of the new "user-goal-first" plan template that bucket A produces — read the "User goal" / "Failure mode" / "Why this plan exists" sections before doing anything else.

---

## User goal

> Never lose a session to a half-shipped consistency refactor again.

Concretely: when I (the user) ask for "a reusable thing that makes X consistent across the app," the next session should produce all of (a) a plan that reads like that goal, not like a task list, (b) subagent execution that pushes back when scope drifts, (c) debugging habits that reach the truth (DOM, real artifacts) before reasoning. The verification is: the next refactor of this kind ships in one session, with consistency intact, no class-collision-class of bug.

## Failure mode (what we just lived through, with evidence)

The panel-composables refactor (v0.190.0–v0.190.2) shipped half-consistent panels. Six learnings, with evidence:

1. **DOM is truth.** The 320px-wide bug was a class-name collision visible in computed style. I spent ~hour reasoning about flex/min-height before user found it via DOM inspect in 30 seconds.
2. **Plan scope ≠ user goal scope.** Plan said "6 panels"; user goal was "every right-side panel." I treated the plan as boundary.
3. **Plans were mechanism-first.** "Add useEntityData composable" rather than "every panel updates instantly when data changes." Mechanism leaked, intent stayed implicit.
4. **No styling-consistency tests.** Component tests render in isolation. WCAG test parses tokens. Nothing asserts "every panel renders identical layout properties."
5. **Subagents executed verbatim, didn't push back.** Spec-reviewer asked "matches plan?" not "matches goal?". Code-quality reviewer checked diff cleanliness. No one smoke-tested.
6. **Dispatcher trusted subagent reports.** "All tests pass" ≠ "feature works." For Afrika gazetteer too.

These collapse into three process buckets:

| Bucket | Lessons | Project home (project-local, never upstream) |
|---|---|---|
| **A — Plan authoring** | 2, 3, 4 | `.claude/rules/plans.md` (new) |
| **B — Subagent execution** | 5, 6 | `.claude/skills/subagent-handoff/` (new) |
| **C — Debugging habit** | 1 | `.claude/skills/dom-first-debugging/` (new) |

**No upstream `superpowers:*` skill files are touched.** The upstream skills auto-load project rules and project skills; everything we add lives in this repo and survives plugin updates.

## Discipline for each rule we add

For every concrete rule, fill all six fields below before writing it. If a field is empty, the rule isn't ready.

| Field | Definition |
|---|---|
| User goal | User-observable outcome (not mechanism). |
| Failure mode | Observed evidence. |
| Where it lives | One of: rule file, project skill, prompt template, test. Not all four. |
| Trigger | When it fires. Narrower = more likely to actually fire. |
| Anti-pattern | The productive-feeling shortcut that defeats the rule. Name it. |
| Verification | How we know the rule worked. Test, reviewer step, or "evident on next refactor." |

This six-field form is itself a check on Bucket A discipline (mechanism-first impulse → "where it lives" + "trigger" force you to commit specifics).

---

## Task 1: Bucket A — plan authoring rules

**Files:**
- Create: `.claude/rules/plans.md`

- [ ] **Step 1:** Run the six-field form for each of these rules before writing the file:
  - Rule A1: every plan starts with a "User goal" section, before "Goal/Architecture/Tech Stack."
  - Rule A2: every plan that introduces a reusable pattern lists **all** pattern instances in the codebase as explicit migration targets. Partial scope must be flagged in a "Scope deviations" section at the top with explicit reasons. Default assumption: do all of them.
  - Rule A3: every plan has a "Verification" section that names the user-observable outcome and the test (or smoke check) that proves it. Tests that only assert structure (lint, types, "function exists") don't count toward verification of user goal.
  - Rule A4: every plan has a "Failure modes / RCA reference" footer when it follows a failed prior attempt — read-before-execute material so the executor doesn't repeat.

- [ ] **Step 2:** Write `.claude/rules/plans.md` covering A1–A4. Include a worked example: the panel-composables refactor *as it should have been written* (one paragraph each section, not full plan). Cap file at 150 lines.

- [ ] **Step 3:** Verification artifact: re-read this very plan against the rules. Confirm it complies. If it doesn't, the rule is wrong, not the plan.

- [ ] **Step 4:** Commit `docs(rules): plan authoring requires user goal + full pattern scope + verification`.

---

## Task 2: Bucket B — subagent handoff prompts + dispatcher rule

**Files:**
- Create: `.claude/skills/subagent-handoff/SKILL.md`
- Create: `.claude/skills/subagent-handoff/implementer-prompt.md`
- Create: `.claude/skills/subagent-handoff/spec-reviewer-prompt.md`
- Create: `.claude/skills/subagent-handoff/code-quality-reviewer-prompt.md`

- [ ] **Step 1:** Run the six-field form for each rule before writing:
  - Rule B1: subagent prompts open with "User goal" (verbatim from the plan) above the task description. Subagent must report whether the task as specified actually serves the user goal — and stop / escalate if not.
  - Rule B2: spec-reviewer prompt gains a step: "does the work satisfy the user goal, not just the spec?" Failure to satisfy = ❌ regardless of spec match.
  - Rule B3: dispatcher (Opus controller) does NOT mark a task done on subagent report alone for any task whose user goal is user-observable (UI, MCP tool output, file output). Required: dispatcher runs a verification step (DOM inspect, MCP call, file read) BEFORE marking done. Lint+vitest do not satisfy this for user-observable tasks.
  - Rule B4: subagent reports must answer three questions explicitly: "what I implemented", "how I verified the user goal" (not just "tests pass"), "what I assumed / where I deviated."

- [ ] **Step 2:** Write the SKILL.md (~80 lines) explaining when this skill activates: replaces the upstream `superpowers:subagent-driven-development` prompt templates for this project. SKILL.md cites the upstream skill but uses our local templates.

- [ ] **Step 3:** Write the three prompt templates. Each one differs from upstream in one specific way per the rules above. Don't rewrite the whole template — fork minimally so future upstream improvements still apply.

- [ ] **Step 4:** Verification artifact: dry-run a fake subagent dispatch using the new templates. Walk through what the implementer/spec-reviewer/code-quality-reviewer prompts produce on a hypothetical "migrate the X panels" task. Confirm pushback paths exist where they didn't before.

- [ ] **Step 5:** Commit `docs(skill): subagent-handoff — user-goal-first prompts + dispatcher verification rule`.

---

## Task 3: Bucket C — DOM-first debugging skill

**Files:**
- Create: `.claude/skills/dom-first-debugging/SKILL.md`

- [ ] **Step 1:** Run the six-field form for the single rule:
  - Rule C1: when investigating any layout / visual / "why does this look different" issue, the first action is reading the rendered DOM (or computed styles, or both) — not reasoning about CSS. Reasoning only after the truth is on the table.

- [ ] **Step 2:** Write `.claude/skills/dom-first-debugging/SKILL.md` (~50 lines). Include:
  - The rule.
  - A trigger list: "panel doesn't fill," "X looks different from Y," "spacing is wrong," "border-radius missing," "wrong width."
  - The exact MCP tool calls or browser commands to reach truth fastest (`mcp__slaktforskning-dev__ui_get_dom`, `mcp__plugin_chrome-devtools-mcp_chrome-devtools__evaluate_script` for getComputedStyle, etc.).
  - The anti-pattern (which is what I just did): "I bet it's a flex thing" → spend an hour iterating on flex rules instead of looking at the DOM.

- [ ] **Step 3:** Verification artifact: cite the panel-composables RCA inline. The 320px collision was visible in 30 seconds of DOM inspection. The skill names this as the canonical failure case to learn from.

- [ ] **Step 4:** Commit `docs(skill): dom-first-debugging — read truth before reasoning about CSS`.

---

## Task 4: Cross-link the three new files from existing rules

The three new files exist; nothing yet points at them. Make them discoverable.

- [ ] **Step 1:** In `.claude/rules/renderer.md`, add a one-line pointer at the top: "Plan authoring → see `.claude/rules/plans.md`. Layout debugging → use `dom-first-debugging` skill."
- [ ] **Step 2:** In `CLAUDE.md` "Workflow" section, add a one-liner pointing at `.claude/rules/plans.md` for plan format.
- [ ] **Step 3:** Commit `docs: cross-link new plan-authoring rule + dom-debug skill`.

---

## Task 5: Verify the framework on a real next-step plan

The pre-staged plan `docs/plans/2026-05-01-panel-consistency-finish.md` was written *before* this RCA process. Audit it against the new `.claude/rules/plans.md`.

- [ ] **Step 1:** Read the panel-consistency-finish plan against rules A1–A4. Note every gap (e.g. is "User goal" section explicit enough? Is the migration-target list complete? Is verification user-observable?).
- [ ] **Step 2:** Patch the plan to comply. If the plan can't comply without restructuring, that's evidence the rules are correct.
- [ ] **Step 3:** Commit `docs(plans): apply new plan-authoring rules to panel-consistency-finish`.

---

## Verification (user-observable outcomes, per Rule A3)

- [ ] The next plan I write — for any feature, not just panels — opens with a "User goal" section that names the user-observable outcome before any technical detail. (Audit by re-reading next plan.)
- [ ] The next subagent dispatch in this repo uses the local prompt templates and pushes back when scope deviates from user goal. (Audit by reading subagent reports.)
- [ ] On the next layout / visual bug, the first tool call is a DOM read, not a CSS edit. (Audit by reading session transcript.)
- [ ] The panel-consistency-finish plan, after Task 5, reads like a worked example of the new template — not a retrofit.

If any of these fail on the next opportunity, the rules are still wrong; iterate.

## Failure modes / RCA reference (per Rule A4)

The mistakes this plan exists to prevent:
1. Jumping into skill/rule edits without auditing intent (the meta-trap the user flagged).
2. Writing rules that sound right but don't fire (no trigger, too abstract).
3. Patching upstream `superpowers:*` skills (gets clobbered on plugin update; everything project-local goes in this repo).
4. Treating "rules added" as "rules adopted." Verification is on the next refactor, not on file existence.

Read these before executing. If you find yourself adding a rule without filling the six-field form, stop.

## Out of scope

- Re-running the panel-composables refactor (covered by `docs/plans/2026-05-01-panel-consistency-finish.md`).
- Investigating the Afrika gazetteer issue (separate plan; mention only as evidence of failure mode 6).
- Changes to upstream `superpowers:*` skills (out of bounds; everything stays project-local).
