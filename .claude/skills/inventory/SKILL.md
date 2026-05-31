---
name: inventory
description: Session-start ritual. Walks the project state to produce a single-screen view of what's hanging, what's stale, and what's the proposed next move. Replaces "I start cold from CLAUDE.md + git log." Use at the top of any working session, when context is lost, or when asked "what's the state of the project?"
---

# Inventory Skill

**Announce at start:** "Running /inventory to see what's hanging."

The inventory is the agent's kanban-board read of the project. Cheap to run (< 30 seconds wall clock). Produces a structured summary the agent uses to propose the next action, not a free-text dump.

## What it surfaces

Six categories. Each is mechanical — greppable, file-system observable, git observable. No semantic guessing.

### 1. Active plans

```bash
ls docs/plans/ | grep -v '^archive$' | grep -v '^README'
```

For each plan file, classify:
- **In progress** — at least one `[ ]` exists in the file.
- **Drift** — every checkbox is `[x]` but file is not in `archive/`. Per `.claude/rules/plans.md` lifecycle hygiene, this is a violation. **Action: surface for close-out.**
- **Design-only** — filename ends `-design.md`, no Tasks section. Blocked on the implementation plan being written.
- **Blocked** — has Tasks but the user goal explicitly waits on external input (e.g. "needs Ben's framing answer").

Mechanical check:
```bash
for f in docs/plans/*.md; do
  if [ -f "$f" ] && ! grep -q '\[ \]' "$f"; then echo "DRIFT: $f"; fi
done
```

### 2. PLAN.md ↔ filesystem drift

For every entry under `docs/PLAN.md` "Planned", verify the linked file exists in `docs/plans/`. For every file in `docs/plans/`, verify it appears in PLAN.md. Mismatch is a violation — fix mechanically.

### 3. Version ↔ CHANGELOG ↔ archive coherence

The last 3 entries in `CHANGELOG.md` should each have a corresponding archive entry in `docs/plans/archive/PLAN.md` (linked plan file, archive paragraph). If `package.json` version > last CHANGELOG block, the release was incomplete.

### 4. Stale memories

```bash
ls /Users/jonasahnstedt/.claude/projects/-Users-jonasahnstedt-git-slaktforskning/memory/
```

For each memory file, the agent flags:
- **Project-shape memory** (describes how the codebase works) — should be promoted to `CLAUDE.md` or `.claude/rules/`. User-memory is per-user, doesn't reach subagents.
- **Code-references-stale** — memory names a file/function. If `grep -L` reports it doesn't exist, the memory is wrong. **Action: update or delete.**
- **Decision memories that contradict current state** — older than the most recent plan that touched the same surface; check for conflict.

Cheap heuristic: `grep -l "src/" memory/` flags memories with explicit file references → audit those first.

### 5. Beta-tester / GitHub backlog

Today: no GitHub watch loop. Beta feedback arrives only via the user. The inventory checks:
- Are there any `Rapport N` references in recent commits that need follow-up?
- Are there any "Considered, not now" entries with reopen triggers that should be re-evaluated against current state?

When `gh` CLI is configured: `gh issue list --state=open --label='needs-triage' --json number,title,createdAt` flags issues > 7 days untouched.

### 6. Local repo hygiene

```bash
git stash list                     # old stashes from previous branches
git branch --merged main           # local branches that can be deleted
git log --oneline main..origin/main # commits we're behind on
git log --oneline origin/main..main # commits we're ahead on but haven't pushed
```

Each non-empty result is a hygiene action.

---

## Output format

Single structured response. No exploration prose. Six sections, each with bullet points or "clean".

```
INVENTORY for slaktforskning @ <git short SHA> on <branch>

Active plans (N):
  - <filename> — in progress / drift / blocked / design-only
  - …

PLAN.md drift: clean / <N> mismatches listed

Version coherence: clean / <description of mismatch>

Stale memories: clean / <N flagged>

Backlog: clean / <N items pending action>

Local hygiene: clean / <N actions>

Proposed next move:
  <one sentence, grounded in what was found>
```

The **proposed next move** is the agent's read of the state — not a question. Per `.claude/rules/mandate.md` Tier 1, the agent does not ask "should I work on X?"; it proposes the move and the user redirects if wrong.

---

## When this fires

- **Beginning of any session** with stale context (e.g., after compaction, after a long break).
- **Manually invoked** — `/inventory` slash command.
- **Before any major planning session** — write a plan only after knowing what's already in flight.
- **After a long-running close-out** — verify nothing was orphaned.

Do not run inventory mid-task. It's a session-shape tool, not a coding tool.

---

## What it does NOT do

- It doesn't read every file in the repo (that's not "inventory", that's "audit").
- It doesn't propose code changes (that's the next move's job).
- It doesn't run tests or builds (that's verification, not inventory).
- It doesn't decide priority *between* well-formed alternatives (that's `mandate.md` Tier 3 — escalate to user).

The inventory is the antenna. Acting on what it finds is the rest of the workflow.

---

## Failure modes

- **Running inventory then forgetting to use the output.** The "Proposed next move" must be the seed of the next action; if the agent runs inventory and asks "what should I do?" instead, the skill failed.
- **Treating inventory output as authoritative state without verification.** Inventory is a snapshot; long-running async work (tests, e2e) may invalidate it. Re-run if a session crosses a major change.
- **Confusing inventory with retro.** Inventory is "what's hanging now"; retro is "what did we learn from the last N shipped pieces." Different cadences, different outputs. Both exist; both serve different purposes.
