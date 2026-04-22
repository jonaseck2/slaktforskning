---
name: oss-welcome
description: Welcome first-time contributors who open a PR or issue. Detects whether the author has contributed before and posts a friendly greeting if not. Use whenever the user says "welcome new contributors", "greet first-timers", "check for new contributors", or when reviewing a new PR or issue and wanting to acknowledge first-time contributors.
---

# OSS Welcome

Identify first-time contributors on open PRs and issues, and post a welcome comment to each one.

## Step 1 — Find recently opened PRs and issues

```bash
# PRs opened in the last 7 days
gh pr list --state open --json number,title,author,createdAt --limit 50

# Issues opened in the last 7 days
gh issue list --state open --json number,title,author,createdAt --limit 50
```

Filter to items created within the last 7 days (or pass `$ARGUMENTS` as a date range like `--since 2024-01-01`).

## Step 2 — Check if each author is a first-time contributor

For each unique author, check their contribution history on this repo:

```bash
# Check merged PRs by this author
gh pr list --state merged --author "<username>" --limit 1 --json number

# Check if they've opened issues before
gh issue list --state all --author "<username>" --limit 2 --json number
```

An author is a **first-time contributor** if they have:
- No merged PRs, AND
- This is their first or second issue/PR (they haven't been around long)

If the API doesn't return enough data, use:
```bash
gh api /repos/{owner}/{repo}/commits?author=<username>&per_page=1
```

Skip bots (usernames ending in `[bot]` or containing `-bot`).

## Step 3 — Post a welcome comment

For a **first-time PR contributor**:
```
Welcome, and thanks for your first contribution! 🎉

We'll review this PR soon. In the meantime, make sure tests pass and feel free to ask if you have questions.
```

For a **first-time issue author**:
```
Thanks for opening your first issue! We'll take a look soon. If you're interested in fixing this yourself, let us know — we're happy to guide you through the codebase.
```

Post the comment:
```bash
gh pr comment <number> --body "..."
gh issue comment <number> --body "..."
```

Keep the tone warm but short. Don't over-explain or add a wall of links.

## Step 4 — Optionally suggest a good-first-issue

If the issue author expressed interest in contributing (e.g. "I'd love to fix this"), find an open `good-first-issue` and mention it:

```bash
gh issue list --label "good-first-issue" --state open --limit 5 --json number,title,url
```

Add a line to the comment:
```
If you're looking for something to pick up, here are some good starting points: #N (title), #N (title).
```

## Step 5 — Report

```
Welcomed N first-time contributors:
  - @username on PR #N / issue #N
  - ...
```