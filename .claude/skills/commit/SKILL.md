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

## Rules

- **NEVER use `git add <specific files>`** — always `git add -A`
- **NEVER skip files** — if a file is modified or untracked, it gets committed
- **NEVER amend** unless explicitly asked — always create a new commit
- **NEVER skip hooks** (no `--no-verify`)
- Do not commit files that contain secrets (.env, credentials). Warn the user if such files are staged.
- **Review `git status` carefully** — if unexpected files appear (build artifacts, generated files not in `.gitignore`), flag them to the user before committing rather than silently including them.

## Version bumping

Every commit that completes a milestone or fix must bump `package.json` version:

- **New feature** (new UI, new API surface, new MCP tools) → **minor bump** (e.g. 0.6.9 → 0.7.0, 0.9.3 → 0.10.0)
- **Fix or improvement on existing feature** → **patch bump** (e.g. 0.6.9 → 0.6.10)
- **Major version stays at 0** until the first official release. Minor bumps past 9 go to 10, 11, … — never bump the major.

Steps:
1. Determine bump type from the nature of the change.
2. Read current version from `package.json`.
3. Calculate new version (bump the right segment, reset lower segments to 0 for minor bumps).
4. Update `"version"` in `package.json`.
5. Include `package.json` in the same commit.

The bumped version becomes the canonical version for that milestone — use it in the Implementation Status entry.

## Plan + Roadmap sync

If the commit completes a milestone (or part of one) that has a plan file in `.claude/plans/`:
- Mark the completed task checkboxes in the plan file (`- [x]`)
- Update `.claude/PLAN.md` accordingly
- Include these doc updates in the same commit

If the commit **fully completes** a milestone:
- Move the plan file from `.claude/plans/` to `.claude/plans/archive/`
- Add a row to the **Implementation Status** table in `.claude/PLAN.md`:
  `| vX.Y.Z | Short description | [archive](plans/archive/filename.md) |`
- **Remove the milestone's heading and checkbox list from the Roadmap section** — the Implementation Status row is the permanent record; the Roadmap must only contain future work
- Include all of the above in the same commit

If the commit introduces a new plan file:
- Check that `.claude/PLAN.md` has a matching milestone entry pointing to the plan file
- If missing, add it before committing

## Documenting fixes without a prior plan

Significant bugfixes and unplanned improvements should also be archived, even when no plan file was written beforehand. Write the archive file directly into `.claude/plans/archive/` (skip the `plans/` staging step):

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

Add a `| Fix | Short description | [archive](...) |` row to `.claude/PLAN.md` **Implementation Status**. No Roadmap entry is needed for fixes.
