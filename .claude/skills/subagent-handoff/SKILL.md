---
name: subagent-handoff
description: Use whenever dispatching subagents in this project — implementer, spec-reviewer, or code-quality-reviewer. Wraps the upstream `superpowers:subagent-driven-development` skill with project-local prompt templates that center user goals (not just spec compliance) and require the dispatcher to verify user-observable outcomes before marking work done.
---

# Subagent Handoff (project-local)

Project-local override of the upstream `superpowers:subagent-driven-development` prompt templates. Use this skill's templates instead of the upstream ones for any subagent dispatch in this repo. The upstream skill's process flow (implementer → spec review → code quality review → mark done) still applies — only the prompt templates change.

## Why this exists

The panel-composables refactor (v0.190.0–v0.190.2) shipped half-consistent panels because:
1. Subagent prompts were spec-paragraph-only, no user-goal preamble. Subagents had no way to recognize when the spec drifted from the goal.
2. Spec-reviewer prompts asked "matches spec?" not "matches goal?". Reviewers ✅d work that matched the plan but missed the user-observable outcome.
3. Dispatcher (Opus controller) marked tasks done on subagent reports alone. "All tests pass" was treated as "feature works."

These four rules close those gaps. They live in this skill and in the four prompt templates beside it.

## Rules (each rule has a six-field justification — see `.claude/rules/plans.md` for the form)

### B1 — Every subagent prompt opens with "User goal"

The upstream prompt template starts with task description. Project-local templates prepend a "User goal" section that the dispatcher copies verbatim from the plan's User goal (per `.claude/rules/plans.md`). The subagent must report whether the task as specified actually serves that goal — and stop / escalate (status `BLOCKED` or `NEEDS_CONTEXT`) if not.

**Anti-pattern:** dispatcher pastes task paragraph straight from plan without the goal preamble. Faster, but the subagent has no scope-check anchor.

### B2 — Spec-reviewer also checks user goal alignment

Spec-reviewer's first question is "does the work satisfy the user goal?" Failure to satisfy = ❌ regardless of spec match. Spec-reviewer reports must have a **User goal alignment** section before the spec-compliance section.

**Anti-pattern:** spec-reviewer ✅s because diff matches plan, never opens the running app or runs the user-observable check.

### B3 — Dispatcher verifies user-observable outcomes before marking done

For any task whose user goal is user-observable (UI, MCP tool output, file output, gazetteer resolution, anything the user touches), the dispatcher does NOT mark done on subagent report alone. Required: dispatcher runs an explicit verification step BEFORE marking done — DOM read, MCP call, file read, gazetteer resolution check, etc. `vitest passes` and `lint clean` are hygiene, not user-goal verification.

**Anti-pattern:** dispatcher takes `✅ DONE — all tests pass` at face value for a feature whose user goal is user-observable. (Both the panel-composables 320px bug and the Afrika gazetteer issue shipped broken because of this.)

### B4 — Subagent reports answer three explicit questions

Implementer and reviewer reports must each answer:
1. **What I implemented / verified** (the structural what).
2. **How I verified the user goal** — not just "tests pass". Name the user-observable check actually performed; if none was performed because environment didn't allow, say so explicitly.
3. **What I assumed / where I deviated** from the spec or user goal.

Dispatcher rejects reports missing any of the three and re-dispatches with the question.

**Anti-pattern:** terse "DONE — see commit X" reports. Dispatcher has no info to verify.

### B5 — Subagent prompts ALWAYS instruct rebase + branch verification

Every dispatch prompt MUST tell the subagent:
1. **Before starting:** `git -C <worktree> fetch && git -C <worktree> rebase main` so the worktree base matches current `main`. Otherwise the subagent's "Tasks 1-N done in main" mental model is wrong and they may redo or undo committed work.
2. **Before EVERY commit:** verify `git -C <worktree> rev-parse --abbrev-ref HEAD` reports `worktree-agent-*`, NOT `main`. If it reports `main`, the subagent has CWD-drifted out of its worktree — stop, abort the commit, fix.

This addresses the most common dispatch failure mode: subagents reading "Tasks 1-7 done in main" as "you work directly on main too" and pushing commits to the wrong branch. The 2026-05-14 audit batch had at least two agents commit to main when their isolation worktree was the intended target.

**Anti-pattern:** prompt says "Tasks 1-N done in main" without naming a specific commit SHA. Subagents interpret "in main" as "work on main."

### B6 — Prompt wording: name the SHA, not "in main"

Replace any "Tasks 1-N done in main" phrasing with: **"Main is at commit `<sha>`; rebase your worktree onto it. Commits 1-N from previous waves provide [list of artifacts]."** The SHA gives the agent a concrete anchor; "in main" doesn't.

**Anti-pattern:** "Tasks 1-7 done in main" / "previous round landed in main" / "main has the X commit" — all of these read as "work on main."

## How to use

When dispatching a subagent (implementer, spec-reviewer, or code-quality-reviewer):

1. Use the local prompt template at `.claude/skills/subagent-handoff/<role>-prompt.md`. Each is a minimal fork of the upstream template — preserves the upstream structure, adds the project-local sections.
2. Copy the plan's "User goal" section verbatim into the prompt.
3. After the subagent reports back, run the dispatcher verification step (B3) before marking the task done in TodoWrite.

## Templates (in this directory)

- `implementer-prompt.md` — fork of upstream implementer-prompt.md
- `spec-reviewer-prompt.md` — fork of upstream spec-reviewer-prompt.md
- `code-quality-reviewer-prompt.md` — fork of upstream code-quality-reviewer-prompt.md

Each template is short — it cites the upstream template, then lists the project-local sections to prepend / append. Future upstream improvements to the base templates still apply.

## Verification (per `.claude/rules/plans.md` Rule A3)

The verification of this skill is the next subagent dispatch in this repo. If the next dispatch's prompt opens with "User goal," if the next spec-reviewer report has a "User goal alignment" section, and if the dispatcher runs an explicit verification step before marking done — the skill works. If any of these fail, the skill is wrong, not the dispatch; iterate.
