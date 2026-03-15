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
