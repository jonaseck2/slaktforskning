# Tauri Port — Completion Implementation Plan

Companion to `docs/plans/2026-05-10-tauri-port-completion-audit.md`. The audit enumerates the gaps; this plan groups them into parallel-executable clusters and assigns each cluster to a single subagent + worktree.

## User goal

By the end of this plan, **a Tauri-built `0.250.0-tauri.0` pre-release runs on macOS + Windows + Linux with feature parity to Electron `0.249.x`**, including: every preload `window.api.*` method either polyfilled or auto-walked (no `throws` / `MISSING` in the audit's §1 table), an MCP sidecar that works without `npx`, signed binaries, in-app auto-update, and beta-tester-validated GEDCOM round-trips for the Holger reference user (Ben).

The functional cut from this plan is what the user *uses*: Settings → Backup works, the Reports view's Save SVG / Save PDF buttons work, the Media library renders thumbnails on first open, the About panel shows real version + license attributions, and importing a Holger GEDCOM doesn't crash.

## Scope

Every audit §1 row marked `MISSING`, `throws`, or `partial`. Every audit §6 "Must-do for v0.250.0" item (#1–#24). Skills updates per §3. Legacy delete (§4) is **out of scope** — sequenced as post-launch follow-up because nothing can be deleted until the gap-closing work has zero references to it.

### Scope deviations

- **Genney import (#3)** is deferred to post-launch follow-up. The `.gcc` path is doable in pure Rust (zip + sqlite-on-sqlite); the `.backup` path needs Java sidecar / Apache Derby Rust port and is a multi-week investigation. Beta testers can stay on Electron `0.249.x` for Genney workflows during the pre-release period (per audit §5 recommendation (c)).
- **Native PDF rendering (#16/#29)** ships as the `window.print()` regression. Documented in the release notes; ideal Rust-side fix is post-launch follow-up. Acceptable for v0.250.0 if `print.exportPdf` route logs a one-time toast directing the user to the print dialog's "Save as PDF" option.
- **Test migration (#22)** executes per its own plan (`2026-05-10-tauri-test-migration.md`). This plan only references it; doesn't duplicate the work.

## Verification

The release is shippable when:

1. **Manual walk of `src/preload/index.ts`** against the running Tauri app shows zero crashes. (Audit §1 table goes from "14 missing + 7 throws + 6 partial" to "0 missing + 0 throws + ≤2 documented partials" — Genney + native PDF.)
2. **`tauri-channel-coverage.test.ts`** (test-migration plan Bucket D) passes — every registry channel has a renderer-side polyfill or auto-walk path; every preload method has a Tauri equivalent.
3. **Holger reference user (Ben) imports his OurKind GEDCOM** (the same file already verified via `mcp__slaktforskning__import_file` this session) via the *UI* (not the MCP), and the resulting tree round-trips through GEDCOM export → re-import unchanged.
4. **Cross-platform smoke (audit §5)**: 10 highest-traffic flows pass on macOS + Windows + Linux. Metrics captured against the original plan's percentage-improvement targets (≥50% on disk, idle RAM, loaded RAM, cold start, list scroll).
5. **MCP sidecar bundled** — external `claude` CLI connects to `0.250.0-tauri.0` without `npx tsx` on PATH; `tools/list` returns ≥34 prod tools.
6. **Signed binaries** — Gatekeeper / SmartScreen do not warn on first run.
7. **Auto-updater detected → downloaded → applied** going from a packaged `0.250.0-tauri.0` to a `0.250.0-tauri.1`.

## Failure modes / RCA reference

This plan's predecessors (`2026-05-10-tauri-full-port.md` + `-notes.md`) shipped most channels via auto-walk + ~30 polyfills, but the audit revealed 14 channels nobody had thought to check. The class-of-bug: relying on the channel-registry walk to cover everything, when the registry only enumerates worker channels — main-only channels (dialogs, fs, native shell) need explicit polyfills.

This plan guards by enumerating gaps **per audit §1 cell**, not "per domain", so no row gets skipped.

A second class of past failure: tasks marked done because hygiene tests pass (lint/vitest green) while the user-observable behavior is broken. Verification #3 (Holger user can import via UI) is the goal-anchor — every cluster is done when its subset of #3's flow works, not when its tests pass in isolation.

## Cluster structure

Each cluster gets its own worktree (auto-isolated by the Agent tool), branches off `tauri-full-port`, and lands as a single commit (or a tight series). Clusters are designed to **not touch the same files** so they can land in parallel without merge conflicts.

The cluster letter conventions: `Q` quick wins, `M` media, `A` archive, `L` licenses, `S` skills, `R-H` Holger, `R-RM` RootsMagic. (Genney + distribution + tests + cut are sequenced separately, see "Out of this plan's parallelization" below.)

### Cluster Q — Quick-win polyfills (single agent, all S-effort §1 items)

**Audit items:** 6, 7, 8, 10, 11, 12, 13, 15.

**Files touched:**
- `src/renderer/tauri-window-api.ts` (~8 new polyfills)
- `src-tauri/src/lib.rs` (1-2 new commands: `app_version`, possibly recent-files store)
- `src/api/db_settings.ts` may grow keys for `recent_dbs` and `onboarding_seen`

**No conflicts with other clusters** because every other cluster touches a different file region in `tauri-window-api.ts` (M touches the media block, A touches archive, L touches app block — but `app.getVersion` is so small Q owns it).

**Effort:** 1 day.

### Cluster M — Media surface (single agent)

**Audit items:** 5 (`media.openFile`, `media.thumbnailDataUrl`, `media.createFromFile`), 14 (`website.buildPreviewHtml`).

**Why grouped:** all four need a Rust-side thumbnail-generation command using the `image` crate (already in Cargo.toml). One Rust file (`src-tauri/src/media.rs` new), one renderer file (the media + website blocks of `tauri-window-api.ts`).

**Files touched:**
- `src-tauri/src/lib.rs` (register new commands)
- `src-tauri/src/media.rs` (new — thumbnail + open-in-OS)
- `src/renderer/tauri-window-api.ts` (media + website blocks)

**Effort:** 2-3 days.

### Cluster A — Archive zip in/out (single agent)

**Audit items:** 4 (`archive.export`, `archive.import`).

**Why on its own:** the api/ functions (`api/archive_export.ts`, `api/archive_import.ts`) need refactoring to take an injected file-bytes reader/writer (mirroring the Gramps `importFromGrampsBytes` shape). Self-contained refactor + renderer polyfill.

**Files touched:**
- `src/api/archive_export.ts` (extract `exportArchiveToBytes(db, dbDir, readMediaBytes)`)
- `src/api/archive_import.ts` (extract `importArchiveFromBytes(db, zipBytes, dbDir, writeMediaBytes)`)
- `src/renderer/tauri-window-api.ts` (replace the two `notWired` stubs with real polyfills that wire `fs_read_bytes_base64` / `fs_write_bytes_base64`)
- `src-tauri/src/lib.rs` (add `fs_write_bytes_base64` if not present)

**Effort:** 2-3 days.

### Cluster L — Third-party licenses + version (sub-cluster of Q if Q runs first)

**Audit items:** 9 (`app.readThirdPartyLicenses`).

**Why separate:** needs a real `Cargo.lock`-aware license walker on top of the existing `scripts/build-third-party-licenses.mjs` (which only walks the npm tree). The output also needs to be bundled as a Tauri resource (`tauri.conf.json` `bundle.resources`) so the renderer can read it via `fs_read_text` at a known path.

**Files touched:**
- `scripts/build-third-party-licenses.mjs` (extend to read Cargo.lock + cargo-license output)
- `src-tauri/tauri.conf.json` (add `THIRD_PARTY_LICENSES.txt` to `bundle.resources`)
- `src/renderer/tauri-window-api.ts` (`api.app.readThirdPartyLicenses` reads via Rust command)
- `src-tauri/src/lib.rs` (add `read_bundled_resource` command)

**Effort:** 2 days.

### Cluster R-H — Holger import (single agent, largest)

**Audit item:** 1.

**Why on its own:** the Holger importer reads `.ged` (we have that wired) plus extracts media from a separate zip / folder. The current `src/import/holger/index.ts` does directory walking + zip extraction in Node fs. Tauri equivalent: Rust command for `.zip` extraction + folder walk; renderer-side polyfill that calls it.

**Files touched:**
- `src-tauri/src/import.rs` (new — `holger_extract_zip`, `holger_walk_media_folder`)
- `src-tauri/src/lib.rs` (register)
- `src/import/holger/index.ts` (extract a `runHolgerImportFromBytes(db, gedBytes, mediaIndex)` variant — same pattern as Gramps)
- `src/renderer/tauri-window-api.ts` (replace `notWired('Holger')` with real polyfill)

**Effort:** 1 week. **Critical** — Ben (beta tester) is the Holger reference user; release blocked on this.

### Cluster R-RM — RootsMagic import (single agent)

**Audit item:** 2.

**Why on its own:** RootsMagic `.rmgc` is sqlite-on-sqlite. In Electron, the importer opens the .rmgc as a second `node-sqlite3-wasm` connection. In Tauri, options: (a) open via rusqlite from a Rust command and stream rows back to the renderer, (b) read the .rmgc bytes via `fs_read_bytes_base64`, write to a temp file via Rust, then re-open via... actually rusqlite would have to do it. So (a).

**Files touched:**
- `src-tauri/src/import.rs` (extends — new `rootsmagic_open` + `rootsmagic_query` commands)
- `src/import/rootsmagic/index.ts` (refactor to use injected query function)
- `src/renderer/tauri-window-api.ts` (replace `notWired('RootsMagic')`)

**Effort:** 3-5 days.

### Cluster S — Skills audit execution (single agent)

**Audit items:** §3 update + retire + new skill recommendations. Maps to audit §6 item 25 (post-launch) but pulled forward because the skill content is internally consistent and benefits from landing while the architecture is fresh.

**Files touched:**
- `.claude/skills/add-feature/SKILL.md` (update — Tauri auto-walk vs polyfill path)
- `.claude/skills/import-format-add/SKILL.md` (update — Gramps as reference impl)
- `.claude/skills/slaktforskning-mcp-dev/SKILL.md` (update — bridge architecture)
- `.claude/skills/reports/SKILL.md` (update — print path regression)
- `.claude/skills/undo-redo-patterns/SKILL.md` (update — fireDataChanged not mutating())
- `.claude/skills/sqlite-wal/SKILL.md` (update — DELETE journaling canonical)
- `.claude/skills/performance-profiling/SKILL.md` (update — Rust profile path)
- `.claude/skills/worker-thread-ipc-split/SKILL.md` (retire — move body to docs/plans/archive/)
- `.claude/skills/electron-dev/SKILL.md` (retire or rewrite as `tauri-dev`)
- `.claude/skills/tauri-bridge/SKILL.md` (new)
- `.claude/skills/rusqlite-patterns/SKILL.md` (new)

**No conflicts** with code clusters.

**Effort:** 1-2 days.

## Out of this plan's parallelization

These items are sequential or sit outside the parallel grid and run after the parallel clusters finish:

- **Cluster T (test migration)** — already planned in `2026-05-10-tauri-test-migration.md`. Executes alongside or after the polyfill clusters; gates the release cut.
- **Distribution sequence (audit §6 #17–#21)** — MCP sidecar, signing, auto-update, cross-platform smoke. These build on each other (sidecar before signing; signing before auto-update manifest; everything before cross-platform smoke). One agent, sequential.
- **Beta rollout + cut mainline (#23–#24)** — last steps. Tagged `0.250.0-tauri.0` after all blockers cleared; promoted to `0.250.0` mainline after Holger user (Ben) confirms his round-trip works.

## Worktree dispatch

Each cluster gets its own worktree off `tauri-full-port`. The Agent tool's `isolation: "worktree"` flag handles creation. Each subagent commits to its own branch; the parent worktree cherry-picks or merges back when the cluster lands.

Order of dispatch (all parallel, today):
1. Cluster Q
2. Cluster M
3. Cluster A
4. Cluster L
5. Cluster S
6. Cluster R-RM

Cluster R-H (Holger) is the largest single piece and depends on no other cluster's output, but its scope (1 week) is too big for a single dispatch in this session — recommend dispatching after R-RM lands so the Rust-side import patterns are established.

## Tasks discovered during execution

(Empty until execution starts.)
