# Workflow: Släktforskning

The process artifact. Companion to `docs/INTENT.md` (what to build) and `.claude/rules/mandate.md` (agent's authority). Describes how an idea becomes shipped code without human-walked steps in the middle.

**The workflow is a first-class deliverable.** It ships with the app, versions with the app, breaks if neglected just like the app does. When the workflow degrades, the app degrades on the next release.

This document is the canonical map. The rules in `.claude/rules/*` are the laws; the skills in `.claude/skills/*` are the implementations. This doc is the legend.

---

## The lifecycle

```
   ┌──────────┐
   │  INPUT   │  ← beta tester, GitHub issue, user message, agent proposal
   └────┬─────┘
        │
        ▼
   ┌──────────────────┐
   │  TRIAGE          │  /evaluate-ux-report
   │  vs INTENT.md    │
   └────┬─────────────┘
        │
   ┌────┴──────┬─────────────┬──────────────┐
   ▼           ▼             ▼              ▼
  KILL    POLISH BATCH   DESIGN SPEC    NEEDS-PLAN
   │           │             │              │
   │           │             │              ▼
   │           │             │         ┌─────────────┐
   │           │             │         │  PLAN       │  /writing-plans
   │           │             │         │  (User goal,│
   │           │             │         │   Scope,    │
   │           │             │         │   Verify)   │
   │           │             │         └────┬────────┘
   │           │             ▼              │
   │           │       (returns to triage   │
   │           │        once user picks)    │
   │           ▼                            ▼
   │      ┌────────────────────────────────────┐
   │      │  EXECUTE                           │  /subagent-handoff
   │      │  worktree + subagents + tests      │  /using-git-worktrees
   │      └────────────────────┬───────────────┘
   │                           │
   │                           ▼
   │                    ┌─────────────────┐
   │                    │  VERIFY         │  /verification-before-completion
   │                    │  npm test       │  /e2e-evidence
   │                    │  npm run build  │
   │                    │  e2e:full       │
   │                    │  user-observable│
   │                    └────────┬────────┘
   │                             │
   │                             ▼
   │                    ┌─────────────────┐
   │                    │  CLOSE-OUT      │  /close-out
   │                    │  6 steps + Step 7 hygiene
   │                    └────────┬────────┘
   │                             │
   ▼                             ▼
  PLAN.md "Considered, not now"  CHANGELOG + archive + release
                                 │
                                 ▼
                          ┌─────────────┐
                          │  RETRO      │  /retro (every 2 weeks)
                          │  vs INTENT  │
                          │  vs rules   │
                          └─────────────┘
```

Every node is a skill. Every edge is mechanical (no human-walked sequencing). The diagram is the workflow.

---

## Stages in detail

### 1. INPUT

Where work originates:

- **Beta tester feedback** (today: via user paste; future: direct GitHub issues against a labelled tracker).
- **User message** in a session.
- **GitHub issue** — `oss-triage` skill auto-labels; `evaluate-ux-report` triages individual items.
- **Agent proposal** — the agent surfaces a finding from `inventory`, `retro`, or codebase observation.

Inputs are NOT prioritized at this stage. Prioritization happens in triage.

### 2. TRIAGE — `evaluate-ux-report` skill

Every input passes through INTENT scoring:

- **Accurate / accessible / portable / durable** → keep, continue to plan or polish.
- **Explicit-reject hit** → kill, write reasoned reply, archive in "Considered, not now."
- **Reproduces on current code?** (bug-shaped inputs) — agent uses dev MCP to verify, captures evidence.

Triage output is one of:

- **POLISH BATCH** → wording / affordance / minor UX. Adds to the active polish plan.
- **DESIGN SPEC** → substantive new surface or behavior. Writes `-design.md`, returns to triage once design lands.
- **NEEDS-PLAN** → in-scope and clear enough to plan directly.
- **KILL** → at-odds with INTENT, or non-reproducible bug, or mechanism-only request scoring zero.

This stage is `.claude/rules/mandate.md` Tier 1 (own). The agent triages without asking.

### 3. PLAN — `superpowers:writing-plans` + `.claude/rules/plans.md`

For NEEDS-PLAN inputs: write a plan in `docs/plans/YYYY-MM-DD-<feature>.md`.

Mandatory shape:
- **User goal** in user language, defensible against INTENT.
- **Scope** explicit, with deviations called out (per `.claude/rules/plans.md` §2).
- **Verification** user-observable, falsifiability-tested (per §3).
- **Failure modes / RCA reference** if applicable.

Commit the plan immediately per `.claude/rules/plans.md` "Commit plans and specs immediately."

### 4. EXECUTE — worktree + subagents

Per CLAUDE.md "Plan-driven work → worktree + subagents":

- `superpowers:using-git-worktrees` creates the isolated workspace.
- `superpowers:subagent-driven-development` dispatches implementer + spec-reviewer + code-quality-reviewer per task.
- `.claude/rules/worktrees.md` governs how the controller drives the worktree (no `cd && cmd`; use `git -C`, `npm --prefix`, vitest `--root`).

Small fixes that don't warrant a plan land directly on `main`.

### 5. VERIFY — `superpowers:verification-before-completion` + `e2e-evidence` skill

Before claiming done:
- `npm test` → exit 0, summary captured.
- `npm run build` → exit 0, tail captured.
- `npm run test:e2e:full` for UI/importer/`data-changed` plans (or `npm run test:e2e` for non-UI), per-project counts captured.
- **User-observable Verification §1 walked** — via dev MCP (screenshots, MCP calls), not deferred to the user.

Evidence is captured for the close-out commit. Assertions are not evidence.

### 6. CLOSE-OUT — `close-out` skill

The 6-step CLAUDE.md "Finishing a plan" walked as one command:

0. Evidence assembly (from Stage 5).
1. Mark all `[x]`.
2. `git mv` to archive.
3. Version bump + CHANGELOG block.
4. Update `docs/PLAN.md`.
5. Append to `docs/plans/archive/PLAN.md`.
6. Single commit with everything.

Plus Step 7 — post-close hygiene (skill/README/memory sweep, run `inventory` to confirm no new drift).

Refuses partial. The skill is the gate.

### 7. RELEASE

Per CLAUDE.md and `oss-release` skill: per-commit auto-release once a bumped version lands on `main`.

For direct-to-main: executor has run local-green; the close-out commit message contains exit codes + test counts.
For PRs: CI is the contract; iterate until green.

### 8. RETRO — `retro` skill

Every 2 weeks (or every 3 archives, or on demand): re-read recent shipped work against INTENT + plans.md + mandate.md. Surface findings, commit rule deltas in the same response.

---

## Stages that are continuous, not point-in-time

- **`inventory` skill** — run at session start, after long breaks, or whenever the question is "where are we?"
- **Memory hygiene** — promote project-shape memories to CLAUDE.md / `.claude/rules/`; demote user-shape rules out of CLAUDE.md to memory; delete superseded.
- **Skill / README freshness** — whenever a plan changes an IPC surface, a renderer convention, or a workflow rule, the agent updates the related skill in the same commit as the change (or as a follow-up if separation aids review).

---

## Authority at each stage

Mirrors `.claude/rules/mandate.md` Tier 1/2/3/4:

| Stage | Tier | Notes |
|---|---|---|
| INPUT | 4 | Inputs arrive; agent doesn't originate the genuine new direction. |
| TRIAGE | 1 | Agent triages, picks verdict, executes. |
| PLAN | 1–2 | Writing the plan is Tier 1. Killing a plan as at-odds is Tier 2. |
| EXECUTE | 1 | Worktree, subagents, tests, commits. |
| VERIFY | 1 | Run the commands, capture evidence. Don't defer to user. |
| CLOSE-OUT | 1 | 6+1 steps owned outright. |
| RELEASE (patch/minor) | 1 | Auto on commit. |
| RELEASE (major) | 3 | Escalate. |
| RETRO | 1–2 | Run is Tier 1. Rule edits surface as Tier 2. |

---

## Anti-patterns this workflow eliminates

| Anti-pattern | Pre-workflow symptom | Workflow's answer |
|---|---|---|
| "I'll archive these stale plans next time" | 4 plans from 2026-05-14 surviving to 2026-05-31 | `close-out` skill refuses partial; lifecycle rule in plans.md flags drift. |
| "If 106 reproduces..." | Punting to next user session | TRIAGE Step 3 mandates dev-MCP repro. |
| "Want me to spin up the worktree?" | Stalled execution | Mandate Tier 1 — just do it. |
| Every UX report becomes a plan | docs/plans/ accumulates wording fixes as plan files | TRIAGE outputs: polish / design / kill — only 2 of 3 produce plans. |
| Releases ship without CHANGELOG / archive update | Version bumps with no corresponding archive entry | `close-out` Step 3-5; drift sweep at next session start. |
| Plans drift from INTENT silently | A plan to add cloud sync would have been writable | Plan ↔ INTENT alignment rule in plans.md; agent refuses to write. |
| Stale memories that contradict code | Past incident memories not pruned | `inventory` and `retro` flag stale memory references. |

---

## When the workflow itself needs changing

`docs/WORKFLOW.md` changes the same way `docs/INTENT.md` changes — through retros that surface drift between workflow-as-written and workflow-as-executed. Per `.claude/rules/mandate.md` Tier 2 (workflow rule changes), the agent proposes the diff in a retro and commits it in the same response.

This file is not aspirational. If a stage isn't being executed, the diagram is wrong — fix the diagram or fix the execution, but don't let them diverge silently.

---

## Bootstrap context

This file (and the seven supporting artifacts written in the same change) was created on 2026-05-31 after a retrospective identified that the project was shipping substantial features while the workflow was drifting — four plans from 2026-05-14 stale, PLAN.md out of sync, multiple "if X reproduces..." FELRAPPORTs deferred to user. The structural cause was that the workflow was an unowned artifact: every artifact in the repo had a guardian rule except the workflow itself.

Reading order for a new agent:
1. `docs/INTENT.md` — what the product is.
2. `docs/WORKFLOW.md` — this file. How work flows through.
3. `.claude/rules/mandate.md` — what the agent owns.
4. `.claude/rules/plans.md` — how plans are written, verified, and archived.
5. `CLAUDE.md` — technical Prime Directives and tech stack.
6. The skill catalog — implementations of each workflow stage.

Anything that contradicts these documents is drift. The retro is how drift gets caught.
