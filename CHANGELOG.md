# Changelog

## Unreleased

- feat: ship `examples/swedish-royals.db` — a populated demo of the Swedish royal House of Holstein-Gottorp (10 persons, portraits, face tags, sources, all authored by an AI agent through the MCP) plus GEDCOM 5.5.1 + 7.0 exports of the same tree. Open the .db from Settings → Database
- chore: bundle identifier renamed to `io.github.jonaseck2.slaktforskning` — drops the misleading `com.slaktforskning.*` reverse-DNS claim and removes the macOS "`.app` suffix" warning. App data dir moves accordingly; dev installs need a one-time `mv` of the old folder
- fix(ci): Windows build no longer fails on `npx ENOENT` — sidecar bundling now uses `shell: true` so `npx.cmd` resolves
- fix(ci): Linux build now installs `libpipewire-0.3-dev` so the Tauri screen-capture crate compiles
- fix(ci): Linux build also installs `libgbm-dev` — `xcap` v0.9 links against `libgbm` and `rust-lld` was failing with "unable to find library -lgbm"
- fix(ci): Linux AppImage bundling now sets `APPIMAGE_EXTRACT_AND_RUN=1` — ubuntu-24.04 (ubuntu-latest) dropped libfuse2, so `linuxdeploy` and its plugins (themselves AppImages) need extract-and-run mode instead of FUSE-mount
- fix(ci): also install `libfuse2t64` (the ubuntu-24.04 transitional package for libfuse2) — the env var alone wasn't enough; linuxdeploy still failed silently without the FUSE library present
- chore(ci): scope the CI bundle matrix to pull-requests only — on push to main the Release workflow already builds and publishes the same artifacts, so the CI matrix was duplicate work (~30 min of runner time per push saved)
- fix(ci): Release Linux pinned to ubuntu-22.04 needs `libfuse2` (already pre-installed), not `libfuse2t64` (which only exists on ubuntu-24.04) — reverting the t64 install from release.yml
- fix(ci): Release workflow now uploads to a **draft** release — every matrix leg appends its artifacts to the same draft, and the human publishes when all platforms are in. The previous `releaseDraft: false` made GitHub mark the release immutable on the first leg's publish, so subsequent legs got "Cannot upload assets to an immutable release"
- chore(ci): Release workflow now triggers via `workflow_run` after CI succeeds (not in parallel on push). If `test` or `e2e` fails, the 4-OS Tauri bundle matrix doesn't run — saves ~30 minutes of runner time per red push
- chore(ci): drop macOS codesigning env vars from Release — we don't ship an Apple Developer certificate. macOS .app + .dmg are produced unsigned; users will see Gatekeeper's "unidentified developer" warning on first launch (right-click → Open to bypass)
- fix(ci): add `concurrency` groups to both CI and Release — rapid pushes (e.g. iterating on CI fixes) no longer fire N parallel matrices; the older in-flight run is cancelled when a newer one queues. Fixes the "Release fires twice in a row" symptom seen when the workflow_run trigger first landed
- feat: Linux now ships as `.deb` + `.rpm` (was `.AppImage`). Matches the pre-Tauri Electron releases. AppImage hadn't actually built successfully in any Tauri-era release — `linuxdeploy` kept failing silently on the runner, and pinning to ubuntu-22.04 didn't help because `libspa` 0.9.x needs libpipewire ≥ 1.0 which is only on Ubuntu 24.04. Switched the Release Linux matrix leg to `ubuntu-24.04` and the bundle targets to `deb` + `rpm`, which don't use linuxdeploy at all
- chore(ci): drop the macOS Intel (macos-13) Release matrix leg — GitHub's free `macos-13` runner queue was sitting at 2½ hours per push, blocking every release from completing. Apple's Intel Mac transition ended in 2020 and the pre-Tauri Electron releases (v0.204.0) also shipped arm64-only, so this matches the historical distribution shape. Intel Mac users can still build from source
- chore(ci): add `publish` job that flips the draft release to published once all matrix legs upload their assets — previous releases stayed as drafts until a human published them manually. On partial failure the draft is left intact for inspection
- docs: trim two pre-launch bug-fix references from MANUAL.md's Troubleshooting & FAQ — v0.264.0 ships with those fixes baked in
- docs: CHANGELOG trimmed to the last 10 version blocks — earlier release notes archived in [docs/plans/archive/PLAN.md](docs/plans/archive/PLAN.md) and the git log
- docs: quickstart moved to QUICKSTART.md — README points to it from a short "Getting started" section, keeping the README skimmable
- docs: README quickstart and MANUAL.md now include 20 inline screenshots — 8 step-by-step in the quickstart, 12 across the manual sections

## 0.264.0 — Public OSS launch (2026-05-21)

The first publicly released version of Släktforskning ("genealogy" in Swedish). A local-first, cross-platform desktop genealogy app — your family tree, your data, your machine.

- feat: native cross-platform app on Tauri 2 — system WebView, single-digit MB binaries (macOS / Windows / Linux)
- feat: full GEDCOM 5.5.1 and 7.0 round-trip fidelity — every authored field survives export/import
- feat: native importers for Genney, Holger, RootsMagic, Gramps, plus GEDCOM 5.5.1 / 7.0
- feat: 29 bundled gazetteers — pins land at the actual famous city even across languages
- feat: HTML website export — turn your database into a static keepsake site you can host anywhere

For the full pre-launch development history (~50 internal patch releases consolidated into this launch), see [docs/plans/archive/PLAN.md](docs/plans/archive/PLAN.md).

## 0.215.2

- fix(chart): multi-partner connector sits a quarter of the gap above the row, no longer overlapping the parent line

## 0.215.1

- fix(chart): multi-partner connector now routes above the row so it doesn't cross children

## 0.215.0

- feat: relations on a person panel render in a deterministic order

## 0.214.0 — Event participants parity + marriage-flow prompts

- feat(events): editing a wedding/marriage/engagement/divorce now shows the "Other person" picker pre-filled — the affordance is symmetric across create and edit
- feat(events): every event type (baptism, funeral, christening, …) now exposes a Deltagare / Participants section, so witnesses, godparents and mourners can be recorded against any event
- feat(relationships): saving a couple+marriage relationship without a wedding event now offers to record the wedding inline; declining writes nothing
- feat(relationships): creating a second partnership while an existing one has no divorce event and the partner is still alive now warns before silent overlap; the user can proceed or cancel

## 0.213.0 — Hourglass chart polish

- feat: siblings and shared children render oldest-leftmost in the family chart
- feat: partner edges no longer cross other partners' boxes when a person has 2+ partners
- feat: shared children visibly hang from the couple connector, not from one parent
- feat: foster parent–child relationships render with a dashed line and a hover label
- feat: clicking a relative pans the chart to keep them on screen

## 0.212.2

- fix: long text in panel tables clips with ellipsis instead of stacking vertically

## 0.212.1

- fix(places): the map sheet no longer overflows its column when the center is squeezed narrow (small windows, default panel widths, static-export preview iframe). `.map-chart-area` was held open at `min-width: 200px` while its parent shrank, so it leaked across the list and panel columns. Now matches `PersonsView`'s `.viz-chart-area` (min-width: 0 + overflow: hidden on the wrapper) — the map shrinks cleanly with its slot.

## 0.212.0

- feat(person-modal): the Save button in "Lägg till ny person" stays disabled until the user types at least one name field; no more accidental nameless persons. Existing nameless rows in user databases are surfaced via a new `PERSON_NO_NAME` quality check (notice severity).
- feat(persons): every server-side path that creates a person row now refuses to do so without a name — `persons.create`, `persons.createWithEvent`, MCP `create_person`, MCP `add_child`. Importers (GEDCOM, Holger, Genney, archive .zip) opt in via an explicit `allowNameless: true` and append a warning to the import report when an INDI/PERSON record carries no NAME tag, preserving the source's reference graph without silent drops.

## 0.211.3

- fix: foster/adoptive/step relationships render natural Swedish labels (Fosterförälder, not Förälder + Foster)


---

*Earlier release notes archived. The complete per-milestone development history (commit-level detail, RCA write-ups, design rationale) lives in [docs/plans/archive/PLAN.md](docs/plans/archive/PLAN.md) and the git log.*
