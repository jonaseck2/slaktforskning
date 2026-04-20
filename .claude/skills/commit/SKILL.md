---
name: commit
description: Stage ALL changes and create a git commit. Always use this instead of manual git add/commit.
---

# Commit Skill

When asked to commit, or when a commit is appropriate after completing work:

1. **Always stage ALL files** — run `git add -A`. Never selectively stage files. There is no reason to test the whole app and then commit half of it.
2. Run `git status` to review what will be committed.
3. Run `git diff --cached --stat` to see a summary of changes.
4. Compose a clear commit message:
   - First line: concise summary (imperative mood, under 72 chars)
   - Blank line, then details if the change is non-trivial
   - End with: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
5. Run `git commit` with the message via HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
Summary line here

Optional details here.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

6. Verify with `git status` that the working tree is clean.

If `$ARGUMENTS` is provided, use it as the commit message summary. Otherwise, compose one from the staged changes.

## Working in a worktree (controller-side git) — STRICT

**REQUIRED:** `git -C /absolute/path/to/worktree <cmd>` — a single git command, covered by the `Bash(git:*)` allowlist, zero permission prompts.

**FORBIDDEN:** `cd /path/to/.worktrees/... && git <cmd>` and any other `cd`-compound form targeting a worktree. These trigger permission prompts on every variation (flags, subcommand, extra piping) and repeatedly interrupt the user. Don't use them under any circumstance.

```bash
# REQUIRED — single command, no permission friction
git -C /Users/jonasahnstedt/git/slaktforskning/.worktrees/feature-x log --oneline -5
git -C /Users/jonasahnstedt/git/slaktforskning/.worktrees/feature-x status
git -C /Users/jonasahnstedt/git/slaktforskning/.worktrees/feature-x show HEAD --stat
git -C /Users/jonasahnstedt/git/slaktforskning/.worktrees/feature-x add -A
git -C /Users/jonasahnstedt/git/slaktforskning/.worktrees/feature-x commit -m "..."

# FORBIDDEN — do NOT use. These trigger permission prompts and break the user's flow.
cd /Users/jonasahnstedt/git/slaktforskning/.worktrees/feature-x && git log --oneline -5
cd /Users/jonasahnstedt/git/slaktforskning/.worktrees/feature-x && git commit -m "..."
```

**Chained operations:** run each as a separate `git -C ...` call — never chain with `&&`:

```bash
# REQUIRED
git -C /abs/path/to/worktree add -A
git -C /abs/path/to/worktree commit -m "summary"
git -C /abs/path/to/worktree status

# FORBIDDEN
cd /abs/path/to/worktree && git add -A && git commit -m "summary" && git status
```

**Why this is strict:** the user explicitly flagged the `cd`-compound pattern as a workflow blocker — every compound variation needs its own permission approval, and the resulting prompt spam breaks concentration. `git -C` eliminates the need for `cd` entirely.

**Scope:** this rule is for the **controller** running verification, staging, or commit commands from the main-repo cwd. Subagents dispatched INTO a worktree already have their cwd set there; they use normal `git add / git commit` without `-C`.

## Rules

- **NEVER use `git add <specific files>`** — always `git add -A`
- **NEVER skip files** — if a file is modified or untracked, it gets committed
- **NEVER amend** unless explicitly asked — always create a new commit
- **NEVER skip hooks** (no `--no-verify`)
- **Run lint and tests BEFORE committing** — `npm run lint && npm test`. Never commit first and test after. If lint or tests fail, fix them before committing.
- **Verify UI changes in the running app BEFORE committing** — if the change involves Vue components, modals, or visual behavior, confirm it works via the UI server (`curl -s http://127.0.0.1:19241/status`) or Chrome DevTools MCP. Take a screenshot (`POST /screenshot`) and verify visually. Never commit UI changes based solely on unit tests passing — they don't cover the rendering stack. See the `/electron-dev` skill for the full verification workflow.
- **Branch strategy depends on scope:**
  - **Small fixes** (typo, i18n tweak, single-file bug fix, anything without a plan file) → commit directly to `main`.
  - **Plan-driven work** (anything with a `docs/plans/*.md` file, multi-task features, refactors) → work in a git worktree and merge back to `main` when done. See `superpowers:using-git-worktrees`.
  - No long-lived feature branches. Worktrees exist only for the duration of the plan.
- Do not commit files that contain secrets (.env, credentials). Warn the user if such files are staged.
- **Review `git status` carefully** — if unexpected files appear (build artifacts, generated files not in `.gitignore`), flag them to the user before committing rather than silently including them.

## Version bumping

**Every commit that ships a fix or feature MUST bump `package.json` version.** No exceptions, no batching. If it's worth committing, it's worth versioning.

- **Any feature** (new event type, new component, new API function, new UI element) → **minor bump** (e.g. 0.69.0 → 0.70.0)
- **Any fix** (bug fix, i18n correction, config tweak, user feedback fix) → **patch bump** (e.g. 0.69.0 → 0.69.1)
- **Major version stays at 0** until the first official release. Minor bumps past 9 go to 10, 11, … — never bump the major.

**This applies to small changes too.** Adding one event type, fixing one i18n string, changing a CSS rule — all get a version bump. A stream of unbumped commits makes it impossible to track what changed when.

Steps:
1. Determine bump type from the nature of the change.
2. Read current version from `package.json`.
3. Calculate new version (bump the right segment, reset lower segments to 0 for minor bumps).
4. Update `"version"` in `package.json`.
5. Include `package.json` in the same commit.

The bumped version becomes the canonical version — use it in the Implementation Status entry in `docs/PLAN.md`.

## Plan + Roadmap sync

**Path convention (overrides superpowers defaults):** All plans and design specs in this repo live under `docs/plans/` — never `docs/superpowers/specs/` or `.claude/plans/`. Design spec → `-design.md` suffix; implementation plan → no suffix; both archive to `docs/plans/archive/` when done. If a commit contains files under `docs/superpowers/` or `.claude/plans/`, that's a bug — move them before committing.

**Every version-bumped commit must have a matching row in `docs/PLAN.md` Implementation Status.** This includes small fixes without a plan file — they still get a one-line entry: `| v0.69.1 | Fix: cause field restricted to death events | — |`

If the commit completes a milestone (or part of one) that has a plan file in `docs/plans/`:
- Mark the completed task checkboxes in the plan file (`- [x]`)
- Update `docs/PLAN.md` accordingly
- Include these doc updates in the same commit

If the commit **fully completes** a milestone:
- Move the plan file to `docs/plans/archive/` (mark all checkboxes done)
- Add a row to the **Implementation Status** table in `docs/PLAN.md`:
  `| vX.Y.Z | Short description | [archive](plans/archive/filename.md) |`
- **Remove the milestone's heading and checkbox list from the Roadmap section** — the Implementation Status row is the permanent record; the Roadmap must only contain future work
- Include all of the above in the same commit

If the commit introduces a new plan file:
- Check that `docs/PLAN.md` has a matching milestone entry pointing to the plan file
- If missing, add it before committing

## Documenting fixes without a prior plan

Significant bugfixes and unplanned improvements should also be archived, even when no plan file was written beforehand. Write the archive file directly into `docs/plans/archive/` (skip the `plans/` staging step):

**When to archive a fix:**
- Root cause was non-obvious or took investigation to find
- Fix touches a cross-cutting concern (e.g. IPC lifecycle, transaction handling)
- Future agents would benefit from knowing why the code is written a certain way

**Archive file format:**

```markdown
# Fix: Short title

## Problem
What the bug was and how it manifested.

## Root Cause
The underlying cause, with file:line references where helpful.

## Fix
What was changed and why.

## Files Changed
- `path/to/file.ts` — what changed
```

Add a `| Fix | Short description | [archive](...) |` row to `docs/PLAN.md` **Implementation Status**. No Roadmap entry is needed for fixes.
