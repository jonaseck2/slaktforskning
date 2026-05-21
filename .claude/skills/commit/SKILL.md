---
name: commit
description: Stage the files belonging to the current concern and create a git commit. Always use this instead of manual git add/commit.
---

# Commit Skill

**Quick-decode user intent → bump type:**
- "commit the fix" / "commit this fix" / "commit the bug fix" / "commit the patch" → **patch bump**
- "commit the feature" / "commit this feature" / "commit the new …" → **minor bump**
- When in doubt, patch. Never skip the bump.

When asked to commit, or when a commit is appropriate after completing work:

1. **Stage by concern, not by tree.** Run `git status` first. If everything in the tree belongs to the current change, `git add -A` is fine. If the tree contains unrelated WIP from a previous session (different feature, different fix, different file family), stage explicitly by path: `git add <file1> <file2> ...`. Inside the same concern, never selectively skip a file — bundle every file your change touched (sources, tests, CHANGELOG, package.json, CLAUDE.md, docs). If unsure whether a modified file belongs to your concern, ask the user before committing.
2. Run `git status` to review what will be committed.
3. Run `git diff --cached --stat` to see a summary of changes.
4. **Bump the version in `package.json`** — every commit that ships a fix or feature MUST bump it. No exceptions, no batching.
   - Fix (bug, i18n, CSS, config) → patch bump (0.x.Y → 0.x.Y+1)
   - Feature (new component, new API, new UI element) → minor bump (0.X.0 → 0.X+1.0)
   - Then add a one-line entry under `## Unreleased` in `CHANGELOG.md`.
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
git -C /abs/path/to/worktree add -A
git -C /abs/path/to/worktree commit -m "summary"
git -C /abs/path/to/worktree status

# FORBIDDEN
cd /abs/path/to/worktree && git add -A && git commit -m "summary" && git status
```

**Why this is strict:** the user explicitly flagged the `cd`-compound pattern as a workflow blocker — every compound variation needs its own permission approval, and the resulting prompt spam breaks concentration. `git -C` eliminates the need for `cd` entirely.

**Scope:** this rule is for the **controller** running verification, staging, or commit commands from the main-repo cwd. Subagents dispatched INTO a worktree already have their cwd set there; they use normal `git add / git commit` without `-C`.

## Merging a long-running feature branch back to main

Long-running worktrees (multi-task plans taking hours/days) collide with whatever landed on main in the meantime. Expect conflicts on a predictable set of files; resolve them with these defaults:

**`package.json` + `package-lock.json` (version conflict):** Main probably has one or more patch bumps; the feature has a minor bump set when the release task ran. Take the feature's minor bump IF it's still higher than main. If main has overshot (e.g. main released v0.131.x while the feature targeted v0.131.0), bump the feature again to the next unused minor (v0.132.0). Never take main's version — that drops the feature's release semantics.

**`CHANGELOG.md`:** Take the feature's entry verbatim (only the feature knows the release's full scope). Place it after the `## Unreleased` header, before main's entries.

**`docs/PLAN.md` Roadmap section:** Remove the feature's `[planned]` or `[in progress]` entry — it's now Done and recorded in CHANGELOG.md. Keep any parallel-work `[done]` entries that landed on main.

**`CLAUDE.md`:** Usually both branches added rows to shared-component / composable tables. Keep main's updated descriptions for entries both branches modified (main is newer), and append the feature's net-new rows.

**`CHANGELOG.md`:** If the feature wrote a release entry, take it verbatim (only the feature knows the release's full scope).

**Archived plan/spec paths (`docs/plans/` ↔ `docs/plans/archive/`):** If main consolidated/archived the same files the feature archived, treat the feature's archive path as the tiebreaker — the feature's completion is what moved the file to archive.

**Modify/delete conflicts on archived plans under `.claude/plans/` or `docs/superpowers/specs/`:** Accept main's deletion. The consolidation commit on main is authoritative.

**Fixture/test spec-path comments (`// Spec: docs/plans/...`):** Prefer the `plans/archive/...` path if both the plan and spec are archived.

Run `npm test` and `npm run lint` on the merged index before completing the merge commit. If either fails, resolve before `git commit --no-edit`.

## Rules

- **Stage by concern.** If the tree is clean of unrelated WIP, `git add -A` is the default. If unrelated WIP is present, `git add <path> <path> ...` for the files in your concern only. Inside one concern, every file gets committed — sources, tests, CHANGELOG, package.json, CLAUDE.md, docs. Never selectively skip a file inside the same concern.
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

**Every commit that ships a fix or feature MUST bump the version in all three manifests.** No exceptions, no batching. If it's worth committing, it's worth versioning.

- **Any feature** (new event type, new component, new API function, new UI element) → **minor bump** (e.g. 0.69.0 → 0.70.0)
- **Any fix** (bug fix, i18n correction, config tweak, user feedback fix) → **patch bump** (e.g. 0.69.0 → 0.69.1)
- **Major version stays at 0** until the first official release. Minor bumps past 9 go to 10, 11, … — never bump the major.

**This applies to small changes too.** Adding one event type, fixing one i18n string, changing a CSS rule — all get a version bump. A stream of unbumped commits makes it impossible to track what changed when.

### Version lives in three files (keep them in lockstep)

The version string is duplicated across three manifests. They MUST move together every commit:

1. `package.json` → `"version": "X.Y.Z"`
2. `src-tauri/Cargo.toml` → `version = "X.Y.Z"` under `[package]` (this is what `cargo build` prints as `Compiling slaktforskning vX.Y.Z` and what shows up in the binary)
3. `src-tauri/tauri.conf.json` → `"version": "X.Y.Z"` (top-level field, used in the bundled installer's metadata)

`src-tauri/Cargo.lock` also pins `name = "slaktforskning" / version = "…"` — update it too (the next `cargo build` would touch it anyway, so doing it in the same commit avoids a churn diff).

**Why all three:** drift means the build banner, the bundle metadata, and `package.json` disagree. The crate version was at `0.1.0` for ~250 commits because only `package.json` was being bumped — every Tauri build banner reported the wrong version, and the packaged installer would have shipped `0.1.0` to users.

Steps:
1. Determine bump type from the nature of the change.
2. Read current version from `package.json`.
3. Calculate new version (bump the right segment, reset lower segments to 0 for minor bumps).
4. Update `"version"` in `package.json`, `version` in `src-tauri/Cargo.toml`, `"version"` in `src-tauri/tauri.conf.json`, and the `version = "…"` line under `name = "slaktforskning"` in `src-tauri/Cargo.lock`.
5. Include all four files in the same commit.

Verify with one grep before committing:

```bash
grep -E '"version"|^version' package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml | head -3
grep -A1 'name = "slaktforskning"' src-tauri/Cargo.lock | grep version | head -1
```

All four lines must show the same `X.Y.Z`. The bumped version becomes the canonical version — use it in the `CHANGELOG.md` entry.

## Plan + Roadmap sync

**Path convention (overrides superpowers defaults):** All plans and design specs in this repo live under `docs/plans/` — never `docs/superpowers/specs/` or `.claude/plans/`. Design spec → `-design.md` suffix; implementation plan → no suffix; both archive to `docs/plans/archive/` when done. If a commit contains files under `docs/superpowers/` or `.claude/plans/`, that's a bug — move them before committing.

**Every version-bumped commit must have an entry in `CHANGELOG.md`.** This includes small fixes — they still get a one-line entry under `## Unreleased`:
```
- fix: cause field restricted to death events
```

### CHANGELOG style

The CHANGELOG is for the **user**, not the engineer. Treat it as a release-notes feed they can skim — not a project log. Follow these rules every time you write or touch an entry.

#### Per-bullet rules (writing each line)

- **Bullet points only.** No paragraphs, no prose blocks, no nested sub-bullets.
- **≤100 characters per bullet** — hard cap. If a bullet won't fit, split it or rephrase.
- **One sentence per bullet.** No semicolons stringing two thoughts together. Period or em-dash, not "; also …".
- **What changes for the user, not how it's implemented.** Talk about behaviour, surfaces, outcomes — not refactors, function names, file paths, line counts, or internal mechanics.
- **Lead with intent.** What was the user pain or goal? Bake the why into the bullet — don't make the reader reverse-engineer it from the diff. Pull intent from the conversation context (bug report, feature request, use case) — the why is almost always upthread.
- **No file paths, function names, class names, SQL fragments, or commit SHAs.** They belong in the commit message body, not CHANGELOG.
- **No "this commit", "this PR", "this release"** — drop the framing word and describe the change.
- **Type prefixes are fine** (`fix:`, `feat:`, `perf:`, `docs:`, `chore:`) — keep them short, skip the parenthetical scope unless it's a real disambiguator.

#### Per-entry rules (writing the whole release block)

- **≤5 bullets per release.** Most releases need 1–3. If you're at 6+, you're listing implementation work as if it were user-facing — collapse or cut.
- **No restating the version title in bullets.** The header already says what the release is about; don't repeat it on the first bullet.
- **Don't enumerate the same change three different ways.** If three bullets all describe slices of the same user-facing thing, collapse to one.
- **Pure-internal version bumps get one short line.** Any release that touches only tests, refactors, build config, agent tooling, lint cleanup, or other stuff a user can't see should look like:
  ```
  ## v0.X.Y — Short title
  - chore: internal only
  ```
  Or fold one specific signal in: `- chore: imports faster, no behaviour change`.

#### Anti-bloat / no-regrowth rules (every time you touch CHANGELOG)

- **Don't backfill detail into old entries.** If you want to preserve detail later, put it in the commit message or in `docs/plans/archive/` — never grow an existing CHANGELOG bullet.
- **When adding a new entry, glance at the last 3–5.** If they're sliding back into engineering detail, trim them in the same commit. Drift compounds; correct it on contact.
- **When shipping multiple related patches close together, prefer one minor bump with a few bullets** over five sequential patch bumps that each get their own entry. The version sequence is permanent; CHANGELOG entries should reflect meaningful units, not git tags.
- **Skim test:** can a non-developer user read 100 entries in 60 seconds and get the gist of how the product evolved? If a single entry takes 30 seconds to read, it's too long.
- **Keep ≤10 version blocks visible.** CHANGELOG.md displays Unreleased + the most recent 10 versioned `## X.Y.Z` blocks. Older entries are trimmed on contact — when you add a new version block, delete the oldest one (or oldest two, etc.) so the total stays ≤10. The footer pointer ("Earlier release notes archived. … see [docs/plans/archive/PLAN.md]") stays at the bottom; engineering-level history lives in the git log and the archive plan index. The first OSS-launch cleanup truncated 100s of pre-launch entries to enforce this; future commits maintain it. **Why ≤10:** any longer and skimmers don't get past the recent stuff that's actually relevant to their version; the archive captures everything for the rare deep-dive reader.

#### Examples

Good (terse, user-facing, one sentence each):
```
- fix: place picker no longer commits on the first row click — press OK to confirm
- feat: Duplicates view shows all candidates with infinite scroll instead of capping at 100
- perf: imports of 50k+ persons now finish in seconds instead of minutes
- chore: internal only
```

Bad (engineering detail, multi-thought, restating the title):
```
- fix(ui): wired stageSelection() through PlaceTreePickerModal's :selected binding so onClick stages instead of immediately calling emit('select')
- feat(api): added countDuplicates(db) and refactored findDuplicates to share collectDuplicateCandidates()
- perf(db): wrap bulk createPerson loop in BEGIN IMMEDIATE / COMMIT, drop redundant prepared-statement compiles; also added test coverage and updated CLAUDE.md
```

Engineering detail from the "bad" examples still belongs in the **commit message body** — just not in CHANGELOG.

If the commit completes a milestone (or part of one) that has a plan file in `docs/plans/`:
- Mark the completed task checkboxes in the plan file (`- [x]`)
- Update `docs/PLAN.md` roadmap section accordingly
- Include these doc updates in the same commit

If the commit **fully completes** a milestone:
- Move the plan file to `docs/plans/archive/` (mark all checkboxes done)
- Add a `## vX.Y.Z — short description` entry to `CHANGELOG.md`
- **Remove the milestone's heading and checkbox list from the `docs/PLAN.md` Roadmap section** — the CHANGELOG entry is the permanent record; the Roadmap must only contain future work
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

Add a `- fix: short description` line to `CHANGELOG.md` under `## Unreleased`. No Roadmap entry is needed for fixes.
