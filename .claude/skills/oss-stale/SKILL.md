---
name: oss-stale
description: Close stale GitHub issues and PRs that have had no activity for 60+ days. Comment before closing to explain why. Use whenever the user says "clean up stale issues", "close old issues", "handle stale PRs", "prune inactive issues", or asks to close issues with no recent activity.
---

# OSS Stale

Find open issues and PRs with no activity in 60+ days, comment explaining the closure, and close them.

## Step 1 — Calculate the cutoff date

Stale threshold: **60 days** of no activity (no comments, no label changes, no commits on a PR branch).

```bash
date -v-60d +%Y-%m-%d   # macOS
# or
date -d "60 days ago" +%Y-%m-%d  # Linux
```

## Step 2 — Find stale issues

```bash
gh issue list --state open --search "updated:<CUTOFF_DATE" --json number,title,updatedAt,labels,url --limit 200
```

Skip issues that are already labeled `stale` — they were already warned (close them, see Step 4).

## Step 3 — Find stale PRs

```bash
gh pr list --state open --search "updated:<CUTOFF_DATE" --json number,title,updatedAt,author,url --limit 200
```

Skip draft PRs unless they're more than 90 days old — drafts are often long-lived WIPs.

## Step 4 — Close stale issues

For each stale issue, post a comment and close it in one command:

```bash
gh issue close <number> --comment "Closing due to 60 days of inactivity. If this is still relevant, please open a new issue with updated details — we're happy to revisit it."
```

## Step 5 — Close stale PRs

For each stale PR, post a comment explaining the closure, then close:

```bash
gh pr close <number> --comment "Closing this PR due to 60 days of inactivity. If you'd like to continue the work, feel free to reopen or open a new PR — we'd be glad to review it."
```

If a PR has an associated branch that was created specifically for it (not `main`/`master`/`develop`), offer to delete the branch too, but don't do it automatically.

## Step 6 — Report

```
Closed N stale items:
  - X issues (last activity: oldest to newest dates)
  - X PRs (last activity: oldest to newest dates)
```

List each item with its number, title, and last-activity date so the user can spot anything that should have been kept open.