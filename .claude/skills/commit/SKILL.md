---
name: commit
description: Stage the files belonging to the current concern and create a git commit. Always use this instead of manual git add/commit.
---

# Commit Skill

**Bump decision:** see Version bumping below. Same code = same version. Bump each manifest only when its code changed. Pure docs / `.claude/**` / repo-meta → no bump (`docs(claude):` / `docs(plan):` / `chore:`).

When asked to commit, or when a commit is appropriate after completing work:

1. **Stage by explicit path. `git add -A` is FORBIDDEN — no exceptions, no conditions.** Run `git status`, then `git add <file1> <file2> ...` naming every file in your concern. Inside the same concern, never selectively skip a file — bundle every file your change touched (sources, tests, CHANGELOG, package.json, CLAUDE.md, docs). If unsure whether a modified file belongs to your concern, ask the user before committing.

   The same ban covers `git add .`, `git add -u`, `git add :/`, and `git commit -a`/`-am`. Anything that stages by tree shape instead of by name is the forbidden pattern, whatever it is spelled.
2. Run `git status` to review what will be committed.
3. Run `git diff --cached --stat` to see a summary of changes.
4. **Bump only what changed** (see Version bumping). Bumped manifests + a `## X.Y.Z — YYYY-MM-DD` CHANGELOG block ship in the same commit. No `## Unreleased`. CI auto-publishes a GH release at `vX.Y.Z` (keyed on `package.json` today) once a bumped commit hits `main`.
5. Compose a clear commit message:
   - First line: concise summary (imperative mood, under 72 chars)
   - Blank line, then details if the change is non-trivial
   - End with: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
6. Run `git commit` using **separate `-m` flags on a single line** — each `-m` becomes one paragraph. The whole command must fit on one line; never split across lines with backslash-newline:

```bash
git commit -m "Summary line here" -m "Optional details here." -m "Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

Why single-line and multi-`-m`:
- **No heredoc** (`-m "$(cat <<'EOF' ... EOF)"`): works in interactive Claude Code but corrupts under headless `claude -p` (the bash wrapper drops the EOF terminator).
- **No backslash-newline continuations**: the headless bash wrapper inserts a literal `\n` arg at every continuation, turning `git commit \⏎ -m "..."` into `git commit \n -m "..."` where `\n` becomes a pathspec/positional arg.

Same single-line, multi-`-m` form works in both interactive and headless modes.

7. Verify with `git status` that the working tree is clean.

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
git -C /abs/path/to/worktree add src/foo.ts tests/unit/foo.test.ts
git -C /abs/path/to/worktree commit -m "summary"
git -C /abs/path/to/worktree status

# FORBIDDEN — the cd-compound (permission friction)
cd /abs/path/to/worktree && git add src/foo.ts && git commit -m "summary"

# FORBIDDEN — staging by tree shape (steals parallel work)
git -C /abs/path/to/worktree add -A
```

**Why this is strict:** the user explicitly flagged the `cd`-compound pattern as a workflow blocker — every compound variation needs its own permission approval, and the resulting prompt spam breaks concentration. `git -C` eliminates the need for `cd` entirely.

**Scope:** this rule is for the **controller** running verification, staging, or commit commands from the main-repo cwd. Subagents dispatched INTO a worktree already have their cwd set there; they use normal `git add / git commit` without `-C`.

## Merging a long-running feature branch back to main

Long-running worktrees (multi-task plans taking hours/days) collide with whatever landed on main in the meantime. Expect conflicts on a predictable set of files; resolve them with these defaults:

**`package.json` + `package-lock.json` (version conflict):** Main probably has one or more patch bumps; the feature has a minor bump set when the release task ran. Take the feature's minor bump IF it's still higher than main. If main has overshot (e.g. main released v0.131.x while the feature targeted v0.131.0), bump the feature again to the next unused minor (v0.132.0). Never take main's version — that drops the feature's release semantics.

**`CHANGELOG.md`:** Take the feature's `## X.Y.Z` block verbatim (only the feature knows the release's full scope) and place it at the top, above main's entries. If the trim rule (below) puts you over 10 versioned blocks, move the oldest one(s) to `docs/plans/archive/CHANGELOG.md`.

**`docs/PLAN.md` Roadmap section:** Remove the feature's `[planned]` or `[in progress]` entry — it's now Done and recorded in CHANGELOG.md. Keep any parallel-work `[done]` entries that landed on main.

**`CLAUDE.md`:** Usually both branches added rows to shared-component / composable tables. Keep main's updated descriptions for entries both branches modified (main is newer), and append the feature's net-new rows.

**`CHANGELOG.md`:** If the feature wrote a release entry, take it verbatim (only the feature knows the release's full scope).

**Archived plan/spec paths (`docs/plans/` ↔ `docs/plans/archive/`):** If main consolidated/archived the same files the feature archived, treat the feature's archive path as the tiebreaker — the feature's completion is what moved the file to archive.

**Modify/delete conflicts on archived plans under `.claude/plans/` or `docs/superpowers/specs/`:** Accept main's deletion. The consolidation commit on main is authoritative.

**Fixture/test spec-path comments (`// Spec: docs/plans/...`):** Prefer the `plans/archive/...` path if both the plan and spec are archived.

Run `npm test` and `npm run lint` on the merged index before completing the merge commit. If either fails, resolve before `git commit --no-edit`.

## Rules

- **Stage by explicit path, always.** `git add <path> <path> ...` naming each file. Never `git add -A` / `.` / `-u` / `:/` / `commit -a`. Inside one concern, every file gets committed — sources, tests, CHANGELOG, package.json, CLAUDE.md, docs. Never selectively skip a file inside the same concern.

  **Why unconditional.** The old rule allowed `git add -A` "if the tree is clean of unrelated WIP". That condition is evaluated when you read `git status` and applied when you run `git add` — and in this repo the user commits, switches branches and merges PRs in between. A rule whose safety depends on the tree not changing between two commands is not a rule.

  **The incident that made it unconditional (2026-08-23).** Two `git add -A` calls in one session, both after a `git status` that looked clean. The first swept nine files of the user's in-flight binding-envelope work — `lib.rs`, `bindings.ts`, `tauri-window-api.ts`, `main.ts`, `GedcomImportSection.vue`, two e2e files and two new test files — into a commit titled "docs: make importer tag accounting a mechanical contract". It reached `origin/main` via a PR merge before anyone noticed. Nothing was lost, but a docs commit now carries source changes its message never mentions, and the history is wrong forever because rewriting merged history costs more than it fixes. The second, on a `--amend`, swept in `ArchiveSection-flow.test.ts`; that commit was still local, so it was repaired. **The branch itself changed under the session** — `main` at the start, a feature branch by the end.
- **Ship the obvious fix first; queue the speculative one separately.** When investigating a single symptom uncovers two independent root causes, don't bundle them. The bigger fix blocks validation of the small risk-free one and pollutes blast-radius diagnosis. CHANGELOG entries for unverified fixes are premature too.
- **`git status` before every non-trivial commit.** The user often commits in parallel during multi-hour sessions (gazetteer/import work, prose sweeps). Symptoms: `fatal: Exiting because of an unresolved conflict` on `git add`; `D` + `A` instead of `R` after a `git mv` you did at the start; a file you `Write`'d silently disappears because a merge dropped staged-but-not-committed content. Always `git status` + `git diff --cached` before committing to confirm the staged shape matches intent. If a merge wiped a file you wrote, recreate it from context.
- **NEVER amend** unless explicitly asked — always create a new commit. When an amend *is* asked for, re-stage by explicit path: `--amend` re-reads the index, so a stray file staged since the original commit rides along silently.
- **Re-run `git status` immediately before `git commit`, not just before `git add`.** The tree can change between the two. If anything appeared that you did not stage yourself, unstage it before committing.
- **NEVER skip hooks** (no `--no-verify`)
- **Run lint and tests BEFORE committing** — `npm run lint && npm test`. Never commit first and test after. If lint or tests fail, fix them before committing. If the commit removes an import (refactor, rename, dead-code), also `NODE_OPTIONS=--max-old-space-size=8192 npx vue-tsc --noEmit --ignoreDeprecations 6.0` — a removed-but-still-referenced symbol is a runtime ReferenceError, not a lint error, and `npm run lint` won't catch it.
- **Verify UI changes in the running app BEFORE committing** — if the change involves Vue components, modals, or visual behavior, confirm it works via the UI server (`curl -s http://127.0.0.1:19241/status`) or Chrome DevTools MCP. Take a screenshot (`POST /screenshot`) and verify visually. Never commit UI changes based solely on unit tests passing — they don't cover the rendering stack. See the `/electron-dev` skill for the full verification workflow.
- **Branch strategy depends on scope:**
  - **Small fixes** (typo, i18n tweak, single-file bug fix, anything without a plan file) → commit directly to `main`.
  - **Plan-driven work** (anything with a `docs/plans/*.md` file, multi-task features, refactors) → work in a git worktree and merge back to `main` when done. See `superpowers:using-git-worktrees`.
  - No long-lived feature branches. Worktrees exist only for the duration of the plan.
- Do not commit files that contain secrets (.env, credentials). Warn the user if such files are staged.
- **Review `git status` carefully** — if unexpected files appear (build artifacts, generated files not in `.gitignore`), flag them to the user before committing rather than silently including them.

## Version bumping

**Two concepts, not three manifests.** The *app/release version* and the *Rust crate version* are separate; conflating them is what caused the 0.268.0–0.269.1 phantom-update lag.

**1. App / release version — `package.json` + `src-tauri/tauri.conf.json`, ALWAYS equal.** Bump them together to the same number for any shippable change.
- `package.json` is what `release.yml` reads to **detect + tag** the release (`vX.Y.Z`).
- `tauri.conf.json` is what gets baked into the bundle and what the in-app **auto-updater reports** as the running version.
- If they diverge, the bundle ships tagged `vX.Y.Z` but self-reports the other number → the updater shows a phantom "update available" on a current install. Guarded by `tests/unit/release-version-consistency.test.ts`.

**2. Rust crate version — `src-tauri/Cargo.toml` (+ `Cargo.lock`).** Internal metadata. NOT the release tag, NOT the delivered/updater version. **Bump it only when `src-tauri/` actually changed** — bumping the crate version forces a local Rust recompile + app restart during `npm start`, for zero delivery benefit. It may legitimately lag the app version.

Fix → patch (0.x.Y → 0.x.Y+1). Feature → minor (0.X.0 → 0.X+1.0). Major stays at 0.

**No bump** for changes that don't ship: `.claude/**`, `docs/**`, `tests/**`-only, `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`, `README.md`, `.gitignore`, `.editorconfig`, lockfile-only churn. Commit as `docs(claude):` / `docs(plan):` / `docs:` / `chore:`.

**A Rust-only fix you want released still bumps the app version.** `release.yml` keys on `package.json`, so bump `package.json` + `tauri.conf.json` (the app version) to publish it; bump `Cargo.toml`/`Cargo.lock` too since `src-tauri/` changed. Never bump Cargo *without* a src-tauri change just to "keep numbers aligned" — that's a needless local rebuild.

**CHANGELOG.** Whenever any manifest bumps, add a `## X.Y.Z — YYYY-MM-DD` block at the top per `oss-release`, using the bundle version (`tauri.conf.json`). Same commit as the bump. Verify:

```bash
grep -E '"version"|^version' package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
```

The three values may differ — that's the point.

## Plan + Roadmap sync

**Path convention (overrides superpowers defaults):** All plans and design specs in this repo live under `docs/plans/` — never `docs/superpowers/specs/` or `.claude/plans/`. Design spec → `-design.md` suffix; implementation plan → no suffix; both archive to `docs/plans/archive/` when done. If a commit contains files under `docs/superpowers/` or `.claude/plans/`, that's a bug — move them before committing.

**Every version-bumped commit gets a new `## X.Y.Z — YYYY-MM-DD` block at the top of `CHANGELOG.md`** — no Unreleased section, ≤10 blocks visible, oldest demoted to `docs/plans/archive/CHANGELOG.md` on rollover. Block structure, bullet style, anti-bloat rules, and examples are owned by `oss-release` — read that skill before touching CHANGELOG.md. The commit, the block, and any archive trim ship in the same commit.

If the commit completes a milestone (or part of one) that has a plan file in `docs/plans/`:
- Mark the completed task checkboxes in the plan file (`- [x]`)
- Update `docs/PLAN.md` roadmap section accordingly
- Include these doc updates in the same commit

If the commit **fully completes** a milestone:
- Move the plan file to `docs/plans/archive/` (mark all checkboxes done)
- Add a `## X.Y.Z — YYYY-MM-DD` block to `CHANGELOG.md` per `oss-release`
- **Remove the milestone's heading and checkbox list from the `docs/PLAN.md` Roadmap section** — the CHANGELOG block is the permanent record; the Roadmap holds only future work
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

Add the `## X.Y.Z — YYYY-MM-DD` block per `oss-release` with a `- fix: short description` line. No Roadmap entry is needed for fixes.
