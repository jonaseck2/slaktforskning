---
name: oss-triage
description: Triage open GitHub issues — auto-label by type, find and close duplicates with a comment linking the original. Use whenever the user says "triage issues", "go through open issues", "handle new issues", or asks you to label/close/organize GitHub issues.
---

# OSS Triage

Triage all open, unlabeled GitHub issues: classify them and close clear duplicates.

## Step 1 — Fetch open issues

```bash
gh issue list --state open --limit 200 --json number,title,body,labels,url
```

Focus on issues that have no labels (or only the `stale` label). Skip issues that already have a type label.

## Step 2 — For each issue, check for duplicates first

Search existing issues (open + closed) by the key noun phrases in the title:

```bash
gh issue list --state all --search "<keyword>" --json number,title,state,url --limit 20
```

A duplicate is likely when:
- The title describes the same bug or request as an existing issue
- The body describes the same root cause or feature

If it's a duplicate:
1. Comment with the original issue URL:
   ```
   Closing as a duplicate of #NNN. Please follow that issue for updates.
   ```
2. Close it:
   ```bash
   gh issue close <number> --comment "Duplicate of #NNN."
   ```

When in doubt, don't close — just label it and move on.

## Step 3 — Label non-duplicates

Classify each issue from its title + body and apply one label. Use your judgment — the exact label name matters less than getting the category right.

| Signal | Label to apply |
|--------|---------------|
| "crash", "error", "broken", "doesn't work", "exception", describes unexpected behavior | `bug` |
| "would be great if", "add support for", "feature request", "it would help to" | `enhancement` |
| "how do I", "is it possible", "does X support" | `question` |
| Missing version, no repro steps, vague description where you can't tell what's wrong | `needs-info` |

Apply the label:
```bash
gh issue edit <number> --add-label "<label>"
```

If the label doesn't exist yet, create it first:
```bash
gh label create "<label>" --color "#0075ca" --description "<short description>"
```

## Step 4 — Comment on needs-info issues

For issues labeled `needs-info`, leave a comment asking for what's missing. Keep it short and specific — ask only for what you actually need to reproduce or understand the issue.

Example:
```
Thanks for the report! Could you share:
- The app version
- Steps to reproduce

That will help us investigate faster.
```

## Step 5 — Report what you did

After finishing, print a summary:

```
Triaged N issues:
  - X closed as duplicates
  - X labeled bug
  - X labeled enhancement
  - X labeled question
  - X labeled needs-info
```