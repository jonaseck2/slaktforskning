---
name: subagent-handoff
description: Use whenever dispatching subagents in this project — implementer, spec-reviewer, or code-quality-reviewer. Wraps the upstream `superpowers:subagent-driven-development` skill with project-local prompt templates that center user goals (not just spec compliance) and require the dispatcher to verify user-observable outcomes before marking work done.
---

# Subagent Handoff (project-local)

Project-local override of upstream `superpowers:subagent-driven-development` prompt templates. Use this skill's templates instead of upstream for any subagent dispatch in this repo. Upstream process flow (implementer → spec review → code quality review → mark done) still applies — only the prompt templates change.

## Rules

### B1 — Every subagent prompt opens with "User goal"

Project-local templates prepend a "User goal" section that the dispatcher copies verbatim from the plan's User goal. The subagent must report whether the task as specified actually serves that goal — and stop / escalate (status `BLOCKED` or `NEEDS_CONTEXT`) if not.

### B2 — Spec-reviewer also checks user goal alignment

Spec-reviewer's first question is "does the work satisfy the user goal?" Failure = ❌ regardless of spec match. Spec-reviewer reports must have a **User goal alignment** section before the spec-compliance section.

### B3 — Dispatcher verifies user-observable outcomes before marking done

For any task whose user goal is user-observable (UI, MCP tool output, file output, gazetteer resolution), the dispatcher does NOT mark done on subagent report alone. Required: dispatcher runs an explicit verification step BEFORE marking done — DOM read, MCP call, file read, gazetteer resolution check. `vitest passes` and `lint clean` are hygiene, not user-goal verification.

### B4 — Subagent reports answer three explicit questions

Implementer and reviewer reports must each answer:
1. **What I implemented / verified** (the structural what).
2. **How I verified the user goal** — not just "tests pass". Name the user-observable check actually performed; if none was performed, say so explicitly.
3. **What I assumed / where I deviated** from the spec or user goal.

Dispatcher rejects reports missing any of the three and re-dispatches with the question.

### B5 — Subagent prompts ALWAYS instruct rebase + branch verification

Every dispatch prompt MUST tell the subagent:
1. **Before starting:** `git -C <worktree> fetch && git -C <worktree> rebase main` so the worktree base matches current `main`.
2. **Before EVERY commit:** verify `git -C <worktree> rev-parse --abbrev-ref HEAD` reports `worktree-agent-*`, NOT `main`. If it reports `main`, the subagent has CWD-drifted — stop, abort, fix.

### B6 — Prompt wording: name the SHA, not "in main"

Replace "Tasks 1-N done in main" phrasing with: **"Main is at commit `<sha>`; rebase your worktree onto it. Commits 1-N from previous waves provide [list of artifacts]."** SHA gives a concrete anchor; "in main" reads as "work on main."

## How to use

When dispatching a subagent (implementer, spec-reviewer, or code-quality-reviewer):

1. Use the local prompt template at `.claude/skills/subagent-handoff/<role>-prompt.md`. Each is a minimal fork of the upstream template — preserves the upstream structure, adds the project-local sections.
2. Copy the plan's "User goal" section verbatim into the prompt.
3. After the subagent reports back, run the dispatcher verification step (B3) before marking the task done in TodoWrite.

## Templates (in this directory)

- `implementer-prompt.md` — fork of upstream implementer-prompt.md
- `spec-reviewer-prompt.md` — fork of upstream spec-reviewer-prompt.md
- `code-quality-reviewer-prompt.md` — fork of upstream code-quality-reviewer-prompt.md

Each template cites the upstream template, then lists the project-local sections to prepend / append.
