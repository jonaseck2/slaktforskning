---
name: oss-release
description: Owns CHANGELOG.md — block structure, bullet style, the 10-block rolling window, and the archive flow. Releases auto-publish per commit via CI; this skill is the changelog discipline around that. Use whenever editing CHANGELOG.md, bumping the version, or asked to "cut a release", "ship a release", "publish a release".
---

# OSS Release

Releases auto-publish. Every commit on `main` that bumps the version triggers `.github/workflows/release.yml`, which builds the Tauri matrix and publishes a GitHub Release tagged `vX.Y.Z`. **There is no manual release ceremony.** This skill owns the CHANGELOG.md discipline around that flow.

## Block contract

1. **One `## X.Y.Z — YYYY-MM-DD` block per version-bumped commit.** Prepend to the top of `CHANGELOG.md`. No `## Unreleased` section — it doesn't exist in this repo; every commit IS a release.
2. **CHANGELOG.md keeps the most recent 10 versioned blocks.** When prepending a new block puts the total over 10, take the oldest block (bottom of file, above the footer pointer) and prepend it to `docs/plans/archive/CHANGELOG.md`. Demote, never delete.
3. **Footer pointer stays at the bottom of `CHANGELOG.md`:**

   ```markdown
   ---

   *Earlier release notes archived. See [docs/plans/archive/CHANGELOG.md](docs/plans/archive/CHANGELOG.md) for older entries; the complete per-milestone development history (commit-level detail, RCA write-ups, design rationale) lives in [docs/plans/archive/PLAN.md](docs/plans/archive/PLAN.md) and the git log.*
   ```

4. **The version bump is a `commit`-skill concern** (`package.json` + `src-tauri/Cargo.toml` + `src-tauri/tauri.conf.json` + `src-tauri/Cargo.lock`, all four in lockstep). This skill owns only the changelog block. They happen in the same commit.

## Bullet style

Per-bullet:
- Bullet list only. No paragraphs, no nested sub-bullets.
- ≤100 chars per bullet. Hard cap. Split or rephrase if longer.
- One sentence. No semicolons stringing two thoughts.
- User-facing language: behaviour, surface, outcome. Not refactor names, function names, file paths, line counts.
- Lead with intent (the pain or goal) — pull it from the conversation, not from the diff.
- No "this commit / this PR / this release" framing.
- Type prefixes OK (`fix:`, `feat:`, `perf:`, `docs:`, `chore:`). Skip the parenthetical scope unless it disambiguates.
- Never reference file paths, function names, SQL fragments, or commit SHAs.

Per-block:
- ≤5 bullets per release. Most blocks are 1–3. If at 6+, you're listing implementation work as user-facing — collapse or cut.
- Don't restate the version title in the first bullet.
- Don't enumerate the same change three ways. Collapse slices of one user-facing thing into one bullet.
- Pure-internal version bumps get one bullet: `- chore: internal only` (or `- chore: imports faster, no behaviour change`).

Anti-bloat:
- Don't backfill detail into old blocks. Detail goes in the commit message body or `docs/plans/archive/PLAN.md`, never into a past CHANGELOG entry.
- When adding a new block, glance at the last 3–5. If they're drifting into engineering detail, trim them in the same commit.
- Prefer one minor-bump block with a few bullets over five sequential patch bumps. Versions are permanent; bullets reflect meaningful units.
- Skim test: a non-developer reads 100 entries in 60 s and gets how the product evolved. A single entry that takes 30 s to read is too long.

## Examples

Good:
```
- fix: place picker no longer commits on the first row click — press OK to confirm
- feat: Duplicates view shows all candidates with infinite scroll instead of capping at 100
- perf: imports of 50k+ persons finish in seconds instead of minutes
- chore: internal only
```

Bad:
```
- fix(ui): wired stageSelection() through PlaceTreePickerModal's :selected binding so onClick stages instead of immediately calling emit('select')
- feat(api): added countDuplicates(db) and refactored findDuplicates to share collectDuplicateCandidates()
- perf(db): wrap bulk createPerson loop in BEGIN IMMEDIATE / COMMIT, drop redundant prepared-statement compiles; also added test coverage and updated CLAUDE.md
```

The engineering detail belongs in the commit message body, not CHANGELOG.

## Procedure

For every version-bumped commit:

1. Bump the four manifests via `commit` skill rules.
2. Prepend a new `## X.Y.Z — YYYY-MM-DD` block to `CHANGELOG.md` with the bullet(s).
3. Count `## ` headers in `CHANGELOG.md`. If > 10, move the oldest block to the top of `docs/plans/archive/CHANGELOG.md`.
4. Stage `CHANGELOG.md`, `docs/plans/archive/CHANGELOG.md` (if touched), and the four manifest files in the same commit as the code change.
5. Push to `main`. `release.yml` reads `package.json` version, builds the matrix, attaches bundles to a draft release, auto-publishes once all legs succeed.

## Auto-release failure

CI matrix red → the draft release at `vX.Y.Z` stays on GitHub for inspection. Fix the underlying issue, push another commit (which bumps the version again), the next push auto-publishes the higher version. **Don't retroactively fix the failing release** — it's superseded by the next bump.

## Anti-patterns

- Appending to `## Unreleased`. No such section exists.
- Skipping the date in the header. `## 0.264.19` alone is half-done.
- Deleting old blocks instead of archiving them.
- Bundling many changes into one block when they shipped in separate commits.
- Backfilling detail into past blocks.

## Out of scope

This skill does not:
- Run `gh release create` (CI does).
- Create git tags (`tauri-action` in `release.yml` does).
- Invoke a release script (there isn't one — version bumps drive everything).
