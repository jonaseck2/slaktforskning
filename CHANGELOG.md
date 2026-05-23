# Changelog

## 0.264.19 — 2026-05-23

- fix: remove the undo/redo buttons from the nav bar — Cmd+Z / Cmd+Shift+Z and the macOS Edit menu still trigger undo/redo, so the toolbar buttons were redundant clutter

## 0.264.18 — 2026-05-22

- chore(ci): the Release workflow now auto-publishes the draft once every matrix leg has uploaded — no more "release sat as a draft until someone clicked Publish"

## 0.264.17 — 2026-05-21

- chore(ci): drop the macOS Intel (macos-13) Release leg — GitHub's free `macos-13` queue was 2½ hours per push, blocking every release. arm64-only matches what the pre-Tauri Electron releases shipped; Intel users can still build from source

## 0.264.16 — 2026-05-21

- feat: Linux now ships as `.deb` + `.rpm` (was `.AppImage`) — matches the pre-Tauri Electron releases and works on every modern distro without FUSE

## 0.264.15 — 2026-05-21

- fix(ci): rapid pushes no longer fire N parallel CI/Release matrices — `concurrency` groups now cancel the older in-flight run when a newer one queues

## 0.264.14 — 2026-05-21

- chore(ci): Release waits for CI to pass before running the 4-OS bundle matrix — saves ~30 minutes of runner time on every red push
- chore(ci): macOS .app + .dmg now ship unsigned (no Apple Developer certificate) — Gatekeeper shows "unidentified developer" on first launch; right-click → Open to bypass

## 0.264.13 — 2026-05-21

- fix(ci): Release workflow uploads to a **draft** release so all platform legs can attach their artifacts before publishing — previous runs were marked immutable on the first leg's publish and the other platforms failed to upload

## 0.264.12 — 2026-05-21

- chore(ci): CI bundle matrix only runs on pull-requests — on push to main the Release workflow already builds the same artifacts (~30 min of runner time saved per push)

## 0.264.11 — 2026-05-21

- fix(ci): Linux AppImage bundling also installs `libfuse2t64` — the EXTRACT_AND_RUN env var alone wasn't enough; linuxdeploy still needs the FUSE library present

## 0.264.10 — 2026-05-21

- fix(ci): Linux AppImage bundling sets `APPIMAGE_EXTRACT_AND_RUN=1` — ubuntu-24.04 dropped libfuse2, so linuxdeploy needs extract-and-run mode

---

*Earlier release notes archived. See [docs/plans/archive/CHANGELOG.md](docs/plans/archive/CHANGELOG.md) for older entries; the complete per-milestone development history (commit-level detail, RCA write-ups, design rationale) lives in [docs/plans/archive/PLAN.md](docs/plans/archive/PLAN.md) and the git log.*
