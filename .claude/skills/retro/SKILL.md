---
name: retro
description: Periodic re-read of recent shipped work against the product principles (CLAUDE.md), .claude/rules/plans.md, and .claude/rules/mandate.md. Catches plan-format drift, intent drift, workflow drift, and rules that didn't fire when they should have. Use every 2 weeks, after archiving 3+ plans, or when the user calls "let's retro." Outputs: a list of rule deltas to commit, or "clean — no drift found."
---

# Retro Skill

**Announce at start:** "Running /retro — re-reading the most recent N plans against the product principles and rules."

The retrospective lens. Where `inventory` is "what's hanging *now*?" and `close-out` is "this plan is done", retro is "did the last N plans we shipped honor the workflow we said we follow?"

Cadence: every two weeks (per `.claude/rules/plans.md` "Meta verification"), or after every 3 plans archive, or whenever the user invokes.

## Inputs

- N (default 3) — number of most-recent archived plans to re-read.
- Time horizon (default since last retro) — git log range.

## Five-step retro

### Step 1 — Gather

```bash
# Most recent N archived plans
ls -t docs/plans/archive/*.md | grep -v PLAN.md | head -N

# Commits since last retro
git log --since="2 weeks ago" --oneline main
```

Skim each archived plan + its archive PLAN.md entry + the related commits.

### Step 2 — Plan-format drift check (per `.claude/rules/plans.md`)

For each plan, score:

- Did it open with **User goal** in plain user language, not mechanism? (per §1)
- Was **Scope** explicit, with deviations called out? (per §2)
- Did **Verification** observe the user goal, not structure? (per §3)
- Was the user-goal-falsifiability test passable? (per `.claude/rules/plans.md` "User-goal-falsifiability test")
- Was **close-out evidence** captured in the archive entry — test counts, build exit, e2e tier? (per §"Verification discipline at close-out")
- Did the plan respect **lifecycle hygiene** — archived in the same commit as completion, or did it drift in `docs/plans/`?

Any "no" is a plan-format finding.

### Step 3 — Product-principles alignment check (per `CLAUDE.md`)

For each plan:

- Does the user goal serve at least one of accurate / accessible / portable / durable?
- Did the plan touch any explicit-rejection area (cloud, in-app AI, inference-persist, social, etc.)? If yes, was it acknowledged?
- Was the plan's smallest version shippable? Were intermediate states user-observable?

Any "no" is a product-principles-alignment finding — the plan should have been kill-shaped, not ship-shaped.

### Step 4 — Mandate / workflow drift check (per `.claude/rules/mandate.md`)

Look at the commits and tool calls of the plan's execution:

- Were Tier 1 actions executed without "should I?" questions?
- Were Tier 2 actions surfaced with reasoning + executed promptly (not lingering across sessions)?
- Were Tier 3 actions escalated, not silently done?
- Were Tier 4 inputs waited on, not invented?

Common drift signals (from the 2026-05-31 retro):
- "Want me to spin up the worktree?" (Tier 1 punt)
- "If 106 reproduces…" (Tier 1 punt — dev MCP available)
- "Want me to write the test that would have caught this?" (Tier 2 punt)
- Stale plans surviving across multiple commits without archive

### Step 5 — Output

A structured retro record. Either:

**A. Clean retro** — every plan in scope passed every check.

```markdown
## Retro YYYY-MM-DD — N plans reviewed: clean

Plans reviewed: <list of N filenames>
Period: <since-date> → <today>
No format drift, no product-principles drift, no workflow drift. Next retro in 2 weeks.
```

**B. Findings** — one or more rules/skills need iteration.

```markdown
## Retro YYYY-MM-DD — N plans reviewed: N findings

Plans reviewed: <list>

### Findings

1. **<finding title>** — observed in <plan-file>. <One-sentence description.>
   - Rule that should have fired: `.claude/rules/<rule>.md` §<section>.
   - Why it didn't: <one sentence>.
   - Proposed fix: <skill edit / rule edit / mandate clarification / product-principles sharpening>.

2. <next finding…>

### Rule deltas proposed

- Edit `.claude/rules/plans.md` §<section>: <diff summary>
- Edit `.claude/skills/<skill>/SKILL.md`: <diff summary>
- (etc.)
```

Per `.claude/rules/mandate.md` Tier 2 (workflow rule changes), the retro proposes the deltas with reasoning, then EXECUTES the edits in the same commit unless the user objects. A retro that surfaces findings without committing improvements is a half-retro.

## What this skill does NOT do

- It doesn't re-read individual code commits for quality (that's PR review).
- It doesn't audit code patterns (that's the existing `audit-validation` / `dom-first-debugging` skills).
- It doesn't decide whether to ship more or stabilize — that's strategic priority (Tier 3).
- It doesn't run on every session — too expensive. Cadence is intentional.

## Failure modes

- **Cherry-picking plans that look clean.** Pick by recency, not by perceived quality. Bad plans need finding.
- **Outputting findings without committing rule deltas.** Per Tier 2, the retro is execution-bound: findings → edits → commit. Lingering findings re-fail the next retro.
- **Treating retro as a debate.** If a rule didn't fire, fix the rule. If the rule was right but unused, fix the skill that should have invoked it. If both were right but inattention won, fix the cadence (more retros, smaller batches).
- **Skipping the product-principles alignment step.** Plan-format checks are mechanical; product-principles alignment requires reading the user goal against the product values. The dominant failure mode of the broader workflow is product-principles misalignment dressed up as well-formed plans.

## Related rules + skills

- `CLAUDE.md` “Product principles” — the product anchor.
- `.claude/rules/plans.md` — the plan-format anchor.
- `.claude/rules/mandate.md` — the workflow / authority anchor.
- `inventory` skill — the "what's hanging now" complement (different cadence, different output).
- `close-out` skill — finishes one plan; retro looks at the last N.
- `evaluate-ux-report` skill — retro can find that a report was mis-triaged and propose a triage-rule update.
- `superpowers:writing-skills` — when retro proposes a skill edit, this is the upstream pattern.
