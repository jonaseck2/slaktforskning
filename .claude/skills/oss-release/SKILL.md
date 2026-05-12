---
name: oss-release
description: Cut a new release — bump version, update CHANGELOG.md, commit, tag, push, and publish a GitHub release. Use whenever the user says "cut a release", "ship a release", "release v1.2.3", "publish a new version", or asks to tag and release the current state of main.
---

# OSS Release

Fully automated release: version bump → changelog → commit → tag → push → publish.

## Step 1 — Determine what changed

Get the last published tag and collect commits since then:

```bash
git describe --tags --abbrev=0        # last tag
git log <last-tag>..HEAD --pretty=format:"%s" --no-merges
```

Parse commit subjects using conventional commit prefixes:

| Prefix | Bump |
|--------|------|
| `feat:`, `feat(...):`  | minor |
| `fix:`, `fix(...):`, `perf:`, `refactor:` | patch |
| `BREAKING CHANGE` in body, or `!` after type | major |
| `docs:`, `chore:`, `style:`, `test:` | patch (if no feat/fix, still ship) |

Take the highest bump across all commits. If there are no conventional commits, default to patch.

This repo keeps major at 0 until the first official release. Never bump major.

## Step 2 — Calculate new version

Read current version from `package.json`. Apply the bump:
- minor: x.Y.0 (reset patch to 0)
- patch: x.y.Z

## Step 3 — Update CHANGELOG.md

Prepend a new section after `## Unreleased` (or at the top if no Unreleased section):

```markdown
## vX.Y.Z — YYYY-MM-DD

### Features
- feat: description (from commit subjects)

### Fixes
- fix: description

### Other
- chore/docs/etc
```

Group commits by type. Omit `chore:` and `style:` unless there's nothing else. Use the commit subject verbatim, stripping the type prefix.

## Step 4 — Bump version in all three manifests

The version lives in **three files** that must move in lockstep — `package.json` is the npm package, `src-tauri/Cargo.toml` is the Rust crate (this is what `cargo build` prints as `Compiling slaktforskning v…`), and `src-tauri/tauri.conf.json` is what the packaged installer reports. Drift between them means the build banner, the bundle metadata, and `package.json` disagree.

Update all three:

1. `package.json` — `"version": "X.Y.Z"`
2. `src-tauri/Cargo.toml` — `version = "X.Y.Z"` (under `[package]`)
3. `src-tauri/tauri.conf.json` — `"version": "X.Y.Z"` (top-level field)

Then run `cargo update -p slaktforskning --manifest-path src-tauri/Cargo.toml` (or just `cargo build --manifest-path src-tauri/Cargo.toml` once) so `src-tauri/Cargo.lock` picks up the new crate version. The lock-file change must be in the release commit too — otherwise the next CI build re-touches it.

Verify before committing:

```bash
grep '"version"' package.json
grep '^version' src-tauri/Cargo.toml
grep '"version"' src-tauri/tauri.conf.json
grep -A1 'name = "slaktforskning"' src-tauri/Cargo.lock | grep version
```

All four lines must show the same `X.Y.Z`.

## Step 5 — Commit, tag, push

```bash
git add -A
git commit -m "chore: release vX.Y.Z

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

git tag vX.Y.Z
git push
git push --tags
```

Run `npm run lint && npm test` before committing. If either fails, stop and report what failed — do not release broken code.

## Step 6 — Publish GitHub release

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
  --notes "$(cat <<'EOF'
<paste the changelog section here>
EOF
)"
```

Do not use `--draft` — publish immediately.

## Step 7 — Report

```
Released vX.Y.Z
  Tag: vX.Y.Z
  Commits included: N
  Bump type: minor/patch
  GitHub release: <url>
```
