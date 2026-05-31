---
name: close-out
description: Walks the CLAUDE.md "Finishing a plan" 6-step checklist as one command, refusing partial work. Use when a plan's last task is `[x]`, when archiving any plan, or when "we shipped feature X" — the canonical replacement for human-walked archive flows. Catches the dominant failure mode: stale plans left in docs/plans/ because the 6 steps weren't run in order.
---

# Close-Out Skill

**Announce at start:** "Running /close-out on `<plan-filename>`."

Canonical implementation of CLAUDE.md "Finishing a plan (every time, not optional)." Refuses to proceed if any prerequisite is missing. Every step produces evidence; nothing is "trust me."

## When this fires

- Last task in a plan flips from `[ ]` to `[x]`.
- Drift sweep finds a plan in `docs/plans/` with all tasks `[x]`.
- User says "we're done with X" / "ship X" / "archive X".
- `inventory` skill flags drift.

If the plan has any unchecked task and the user invokes close-out anyway, surface that and refuse:

```
REFUSED: <plan> has N unchecked tasks. Either:
  - mark them [x] if they're done (evidence required per task)
  - delete them if they're out of scope (with reasoning in commit message)
  - explicitly carve them into a follow-up plan (with a new file committed first)
```

## Prerequisites (the agent verifies before any commit)

The skill refuses with a clear message if any prerequisite fails. No partial close-outs.

1. **Verification evidence captured.** Per `.claude/rules/plans.md` "Verification discipline at close-out":
   - `npm test` ran, exit 0, summary line captured.
   - `npm run build` ran, exit 0, tail captured.
   - `npm run test:e2e:full` ran for UI/importer/`data-changed`-touching plans (or `npm run test:e2e` for non-UI plans), per-project counts captured.
   - User-observable Verification §1 criteria walked (UI screenshot, MCP call, file output, whatever the plan declares).
2. **Working tree clean** OR the only modifications are the close-out artifacts about to be committed.
3. **Plan file exists** at `docs/plans/<filename>.md`.
4. **All checkboxes are `[x]`** — `grep -c '\[ \]' <plan-file>` returns 0.
5. **No `// TODO` in any plan task** that points back to incomplete work.

## The 6 steps

Each step is a single mechanical action with a verifiable output. Skip none.

### Step 0 — Evidence capture (already done by prerequisites)

Compose the evidence paragraph for the close-out commit message:

```
Verification evidence:
- npm test → N passed (Xs)
- npm run build → built in Xs (exit 0)
- npm run test:e2e:full → N passed (Xs) across 7 projects
- <plan-specific UX evidence>
```

If any line is "skipped because <reason>", the close-out refuses. Empty placeholders are violations.

### Step 1 — Mark every checkbox `[x]` (verify, don't add)

Re-grep the plan file for `[ ]`. If any exist, refuse and surface which ones. Self-review checklist items count.

### Step 2 — Move the plan to archive

```bash
git mv docs/plans/<plan>.md docs/plans/archive/
# Move any -design.md sibling too:
git mv docs/plans/<plan>-design.md docs/plans/archive/ 2>/dev/null
```

### Step 3 — Version bump + CHANGELOG block

Per `oss-release` skill:
- Feature plan → minor bump.
- Fix-only plan → patch bump.
- Skill / doc-only plan → no bump (`docs(claude):` / `docs(plan):` / `chore:`).

Add a `## X.Y.Z — YYYY-MM-DD` block at the top of `CHANGELOG.md` summarizing what shipped. Bullet style per oss-release; trim the rolling 10-block window if needed.

### Step 4 — Update `docs/PLAN.md`

- Remove the plan's entry from "Planned".
- If the plan was the only entry under "Blocked" → "Considered, not now" → another section, update.
- `docs/PLAN.md` MUST contain zero references to archived plan files. Greppable check:
  ```bash
  for f in docs/plans/archive/*.md; do
    base=$(basename "$f" .md)
    grep -l "$base" docs/PLAN.md && echo "DRIFT: $base still referenced in PLAN.md"
  done
  ```

### Step 5 — Append to `docs/plans/archive/PLAN.md`

A one-paragraph entry matching the existing format:

```markdown
### <Plan Title> (YYYY-MM-DD)
<One paragraph: what shipped, what the user goal was, what tests cover it, key decision deltas. End with the evidence from Step 0.> — [plan](<plan-filename>.md)
```

If the plan has a `-design.md` sibling, link both.

### Step 6 — Commit

Single commit with all close-out artifacts. Per the `commit` skill conventions. Message body:

```
chore: archive completed <plan-name>

<one-line summary of what shipped>

<Verification evidence block from Step 0>
```

The commit stages exactly the close-out artifacts:
- `docs/plans/<plan>.md` → moved
- `docs/plans/<plan>-design.md` → moved (if exists)
- `docs/PLAN.md` → modified
- `docs/plans/archive/PLAN.md` → modified
- `package.json` → bumped (if applicable)
- `CHANGELOG.md` → new block (if applicable)

No unrelated changes ride along. If the working tree has unrelated WIP, the skill stages by path, not `git add -A`.

## Step 7 — Post-close hygiene (Tier 1 mandate)

After the commit lands, the skill also runs these mechanical sweeps (no permission needed):

- **Skill / README sweep:** if the closed plan changed an IPC surface, a renderer convention, or a workflow rule, the agent greps related skill files and surfaces a "skill X should be updated" finding. If the update is mechanical, the agent makes it in a follow-up commit; otherwise surfaces for the user.
- **Memory sweep:** if any memory file under `.claude/projects/.../memory/` references a path or symbol the plan removed or renamed, the agent updates or deletes the memory.
- **Inventory sweep:** runs `/inventory` post-archive to confirm no new drift was introduced.

These are not optional. They are the difference between "the plan shipped" and "the plan's effects propagated through the workflow."

## What this skill does NOT do

- It doesn't write the plan (that's `superpowers:writing-plans`).
- It doesn't execute plan tasks (that's `superpowers:subagent-driven-development` or inline execution).
- It doesn't decide whether the plan is *worth* archiving (that's INTENT.md + the human).
- It doesn't merge to `main` from a worktree (that's the executor's call per `.claude/rules/plans.md` "CI catches PRs, executor catches direct-to-main").

This skill owns ONLY the archival mechanics. Everything upstream (writing, executing, verifying) and everything downstream (push, merge, release) is a separate concern.

## Failure modes

- **Calling close-out before tests run.** The verification-evidence prereq refuses. The skill is the gate; the gate must be honored.
- **Pasting "tests pass" without exit code + summary.** Per `.claude/rules/plans.md` "evidence not assertion." The agent re-runs and captures.
- **Letting unrelated WIP ride along in the close-out commit.** Per the `commit` skill: stage by concern, not by tree. Close-out commits touch the close-out artifacts only.
- **Skipping Step 7 because "the close-out commit landed."** The downstream propagation (skills, memory, inventory) is part of close-out, not separate from it. A plan whose effects don't propagate is half-shipped.
- **Mistaking a workflow rule update for a feature plan.** Workflow changes are doc-only commits; no version bump unless they ship code.

## Related rules

- `.claude/rules/plans.md` — plan format + verification discipline + lifecycle rule.
- `.claude/rules/mandate.md` — close-out is Tier 1 (own outright). The skill is the implementation of that tier.
- `CLAUDE.md` — the original 6-step checklist this skill canonicalizes.
- `oss-release` skill — CHANGELOG mechanics inside Step 3.
- `commit` skill — staging-by-concern inside Step 6.
- `inventory` skill — drift detection that *triggers* close-out (Step 7 also runs it).
