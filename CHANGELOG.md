# Changelog

## 0.267.0 — 2026-06-02

- feat(media): a media item can now record which sources it came from — the Media panel has a new "Källor" section listing the sources the media is linked to, with link-an-existing-source, create-and-link-in-one-step, and unlink. The link round-trips through GEDCOM 5.5.1 **and** 7.0 (emitted as `OBJE` under the `SOUR` record and read back on import — previously it was silently dropped on export), and shows reciprocally in the source's own Media section. Implements Framing B of the rapport-104 media-citations design; per-media page/confidence/transcription (Framing A) stays deferred.

## 0.266.1 — 2026-06-02

- fix(media): tagging a face whose person isn't already linked no longer lags before the tag appears — adding the media↔person link fired a full media-gallery re-query (`listPage` with its link/face COUNT joins) that contended with the panel's own reload on the single SQLite connection. The gallery's "N linked" badge now updates in place from a signed delta carried on `link-changed`; no extra DB round-trip on the critical path.

## 0.266.0 — 2026-05-31

- feat(updater): switch to the official `@tauri-apps/plugin-updater` JS wrapper and surface download progress — the About dialog now shows a "12.3 MB of 78 MB" bar while installing, instead of a fire-and-restart invoke with no feedback. Removes the unused `window.api.app.checkForUpdates` / `downloadAndInstallUpdate` polyfill in favour of a `useAppUpdater` composable that imports the wrapper directly.

## 0.265.0 — 2026-05-23

- feat(updater): About dialog now shows whether an update is available + a "Check for updates" / "Install update" pair, and a toast surfaces when the boot check finds a new version — previously the renderer logged "[updater] update available" to the console and there was no way for a user to install without DevTools

## 0.264.21 — 2026-05-23

- fix(deps): patch 7 runtime npm advisories (1 high `fast-uri`, plus moderate `hono` / `ip-address` / `qs` / `uuid` / `ws`) via lockfile-only `npm audit fix`
- chore(ci): `npm run audit` (`npm audit --omit=dev --audit-level=moderate`) now runs in the CI test job — new runtime vulnerabilities fail the build instead of sliding past us

## 0.264.20 — 2026-05-23

- fix: remove the undo/redo buttons from the nav bar — Cmd+Z / Cmd+Shift+Z and the macOS Edit menu still trigger undo/redo, so the toolbar buttons were redundant clutter

## 0.264.19 — 2026-05-22

- fix(places): scaffolding levels ("World" + continent) no longer appear in rendered place paths — paths now read "Sverige › Stockholms län › Stockholm" instead of "World › Europe › Sweden › Stockholms län › Stockholm". The scaffolding stays in gazetteer data (still disambiguates Georgia-country vs Georgia-state) and is shown in GazetteersView's Test Lookup.

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

---

*Earlier release notes archived. See [docs/plans/archive/CHANGELOG.md](docs/plans/archive/CHANGELOG.md) for older entries; the complete per-milestone development history (commit-level detail, RCA write-ups, design rationale) lives in [docs/plans/archive/PLAN.md](docs/plans/archive/PLAN.md) and the git log.*
