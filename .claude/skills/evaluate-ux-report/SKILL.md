---
name: evaluate-ux-report
description: Triage a UX report (beta tester feedback, GitHub issue, user request) against the product principles (CLAUDE.md), reproduce against the running app via dev MCP, and produce one of three outcomes — "ship in next polish batch", "needs design", or "close with reasoned reply". Use whenever the user pastes feedback like Ben's reports, when a GitHub issue arrives, or when an idea is proposed and the question is "is this worth doing?"
---

# Evaluate UX Report Skill

**Announce at start:** "Evaluating UX report against the product principles."

The triage gate. Replaces "every report becomes a plan." Most reports are wording, affordance, or scope drift; a few are real bugs; some are at-odds with the app's intent. This skill outputs a triage verdict the agent acts on, not a plan to write.

## Inputs

- The report (pasted, linked, or referenced).
- If it's an existing GitHub issue: the issue number; the skill fetches via `gh issue view`.
- If it's a beta-tester report: the report number (e.g. "Rapport 106") and the verbatim Swedish/English text.

## Five-step evaluation

### Step 1 — Restate as a user goal

Translate the report into the user's plain-language outcome:

> *"After this ships, the user can <do X> instead of <current behavior>."*

If the report is in mechanism language ("change the X icon to Y"), translate up to intent ("the user can tell delete from close at a glance"). The translation IS the triage — if the user goal can't be stated without mechanism, the report is mechanism-only and probably wording-shaped (Tier 2 polish at most).

### Step 2 — Score against the product principles

For each product-principle dimension (`CLAUDE.md`), answer yes/no:

- Does this make the local archive **more accurate**?
- Does this make the local archive **more accessible**?
- Does this make the local archive **more portable**?
- Does this make the local archive **more durable**?

Zero yes → at-odds candidate. Pass to Step 4.
One or more yes → in-scope. Pass to Step 3.

Also check the explicit rejections in the product principles:
- Does the report ask for cloud, AI in-app, recommendation, social, DNA, mobile, telemetry, inferred-persist, or auto-mutating data?
- If yes → at-odds, regardless of accuracy/accessibility scoring.

### Step 3 — Reproduce on current code

For any report flagged in-scope, **reproduce on the running app** via dev MCP. The mandate is Tier 1: the agent has the tools, must use them, must not defer to the human.

- Bug-shaped report → drive the UI flow via `ui_navigate` / `ui_click` / `ui_fill` / `ui_eval` and observe whether the bug manifests.
- Wording / affordance report → take a screenshot via `ui_screenshot` of the relevant surface and read it back.
- Workflow report → walk the steps; capture screenshots at each.

Outcomes:
- **Reproduces** → the report is live on HEAD. Severity scored in Step 4.
- **Doesn't reproduce** → the report describes a state the codebase has since fixed (or never had). Close with evidence: "verified non-reproducible on `<version>` via dev MCP, `<date>`." Mark in PLAN.md "Considered, not now" with reopen trigger.
- **Partial / context-dependent** → reproduce minimally, document the exact surface where it fires, then severity scored in Step 4.

### Step 4 — Severity + verdict

Three buckets:

| Verdict | When | Action |
|---|---|---|
| **Polish batch** | Wording, affordance, label drift, minor ordering. Reproduces. Score against the principles positive. | Add to the active polish plan (or create one). No design spec needed. |
| **Needs design** | Behavior change, new surface, schema impact, GEDCOM round-trip impact, multi-modal flow. Reproduces. Scope is substantive (> ~1 day). | Write a `-design.md` spec; surface the design question to the user. Don't write the implementation plan until the design lands. |
| **Close with reasoned reply** | At-odds with the principles (Step 2 returned "rejects"), OR doesn't reproduce on current code, OR mechanism-only request that scores zero against the principles. | Write the reply, surface it in `docs/PLAN.md` "Considered, not now" with reopen trigger, do NOT write a plan. |

The verdict is the agent's call per `.claude/rules/mandate.md` Tier 2: surface the call with reasoning, execute unless told no.

### Step 5 — Act on the verdict

- **Polish batch:** add to the active polish plan's Scope section. If none exists, write a new polish plan (User goal + Scope + Verification). Use `superpowers:writing-plans` if the batch is > 3 items; otherwise inline.
- **Needs design:** invoke `superpowers:brainstorming` if the user goal needs sharpening; otherwise write the `-design.md` spec directly. Commit immediately per `.claude/rules/plans.md`.
- **Close with reply:** add an entry to `docs/PLAN.md` "Considered, not now" with the reasoning + reopen trigger. If the report came from a beta tester, draft a reply for the user to send (don't send it directly — Tier 3 escalation).

## Outputs

A structured triage record committed to the project. Format:

```markdown
## UX triage: <report name / source>

**User goal (restated):** <one sentence in user's words>
**Scope score:** accurate=Y/N, accessible=Y/N, portable=Y/N, durable=Y/N. Rejects-check: <clean / hit on X>.
**Reproduces on <version>:** yes / no / partial (<surface>)
**Severity:** polish / design-needed / at-odds / non-reproducible
**Verdict:** <one sentence>
**Action taken:** <plan reference / spec reference / closed entry>
```

Land it in:
- The relevant plan's Scope (if polish-bound), OR
- A `-design.md` spec (if design-needed), OR
- `docs/PLAN.md` "Considered, not now" (if closed).

## What this skill does NOT do

- It doesn't write the implementation plan (that's `superpowers:writing-plans`).
- It doesn't reply to the beta tester (Tier 3 — drafts a reply, surfaces to user).
- It doesn't change the product principles in `CLAUDE.md` (Tier 3 — if a pattern of reports challenges them, that's a separate escalation).
- It doesn't decide priority between in-scope reports (Tier 3 — the user picks order).

## Failure modes

- **Skipping Step 3 (reproduce on current code).** The dominant past failure: "if 106 reproduces…" — the agent must reproduce, not punt. The dev MCP is non-optional infrastructure.
- **Restating mechanism as user goal poorly.** If the user goal still names a function, file, or icon → keep translating up.
- **Treating Step 2 as a tally.** Scope scoring is asymmetric: a single "rejects" hit kills the report; "more accurate" is enough to ship. It's a gate, not a vote.
- **Defaulting to "needs design" when the call is "polish" or "close".** When in doubt, the smaller verdict wins. Substantial work needs an explicit reason.
- **Writing a triage record without an action.** Every triage commits to one of three actions. "We should think about this" is not an action.

## Examples (from real reports)

| Report | Reproduces? | Scope score | Verdict |
|---|---|---|---|
| Rapport 100 §1 — "Hänvisning" → "Källhänvisning" | yes (label text in sv.ts) | accessible (clearer Swedish) | Polish batch |
| Rapport 101 §2 — `✕` vs trash icon | yes (visual in EventModal) | accessible (icon legibility) | Polish batch |
| Rapport 104 — Media can have a citation | n/a (missing feature) | portable (depends on framing) | Needs design |
| Rapport 102 §5 — add second resident fails | **no** (reproduced 2026-05-31; modal scrollable on current build) | n/a | Close, non-reproducible |
| Rapport 106 — relationship event update | **no** (reproduced 2026-05-31; events.update succeeds) | n/a | Close, non-reproducible |
| Hypothetical: "Add cloud sync" | n/a | rejects-hit: cloud-sync | Close, at-odds principles |
| Hypothetical: "Add AI auto-suggestions" | n/a | rejects-hit: in-app-AI | Close, at-odds principles |

## Related rules

- `CLAUDE.md` “Product principles” — the scoring rubric.
- `.claude/rules/mandate.md` — triage is Tier 1 (own), executing the resulting plan is Tier 1, escalating disputes is Tier 3.
- `.claude/rules/plans.md` — Plan ↔ product-principles alignment rule (this skill is the implementation).
- `superpowers:brainstorming` — for design-needed reports that need intent sharpening.
- `superpowers:writing-plans` — for polish or implementation plans that result.
