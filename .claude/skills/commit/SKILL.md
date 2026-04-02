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

## Plan + Roadmap sync

If the commit completes a milestone (or part of one) that has a plan file in `.claude/plans/`:
- Mark the completed task checkboxes in the plan file (`- [x]`)
- Update `.claude/PLAN.md` to mark the milestone done or partially done
- Include these doc updates in the same commit

If the commit introduces a new plan file:
- Check that `.claude/PLAN.md` has a matching milestone entry pointing to the plan file
- If missing, add it before committing
