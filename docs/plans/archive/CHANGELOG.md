# Archived Changelog

Release notes trimmed out of the top-level [CHANGELOG.md](../../../CHANGELOG.md) under the "last 10 versions" rule. New entries are appended at the top as the rolling CHANGELOG ages out; pre-launch entries (≤ 0.215.x) live at the bottom. The companion [PLAN.md](PLAN.md) holds richer per-milestone prose (design rationale, RCA write-ups); git log holds the commit-level detail.

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
## 0.264.10 — 2026-05-21

- fix(ci): Linux AppImage bundling sets `APPIMAGE_EXTRACT_AND_RUN=1` — ubuntu-24.04 dropped libfuse2, so linuxdeploy needs extract-and-run mode

## 0.264.9 — 2026-05-21

- fix(ci): Linux build installs `libgbm-dev` — `xcap` v0.9 links against `libgbm` and `rust-lld` was failing with "unable to find library -lgbm"

## 0.264.8 — 2026-05-21

- feat: GEDCOM 5.5.1 + 7.0 exports of the demo `examples/swedish-royals.db` ship alongside the .db itself, with the AI-agent attribution surfaced in the description

## 0.264.7 — 2026-05-21

- feat: ship `examples/swedish-royals.db` — a populated demo of the Swedish royal House of Holstein-Gottorp (10 persons, portraits, face tags, sources). Open the .db from Settings → Database

## 0.264.6 — 2026-05-21

- chore: bundle identifier renamed to `io.github.jonaseck2.slaktforskning` — drops the misleading `com.slaktforskning.*` reverse-DNS claim and removes the macOS "`.app` suffix" warning. App data dir moves accordingly; dev installs need a one-time `mv` of the old folder

## 0.264.5 — 2026-05-21

- fix(ci): Windows build no longer fails on `npx ENOENT` — sidecar bundling now uses `shell: true` so `npx.cmd` resolves
- fix(ci): Linux build now installs `libpipewire-0.3-dev` so the Tauri screen-capture crate compiles

## 0.264.4 — 2026-05-21

- docs: trim two pre-launch bug-fix references from MANUAL.md's Troubleshooting & FAQ — v0.264.0 ships with those fixes baked in

## 0.264.3 — 2026-05-21

- docs: CHANGELOG trimmed to the last 10 version blocks — earlier release notes archived

## 0.264.2 — 2026-05-21

- docs: quickstart moved to QUICKSTART.md — README points to it from a short "Getting started" section, keeping the README skimmable

## 0.264.1 — 2026-05-21

- docs: README quickstart and MANUAL.md now include 20 inline screenshots — 8 step-by-step in the quickstart, 12 across the manual sections

## 0.264.0 — Public OSS launch (2026-05-21)

The first publicly released version of Släktforskning ("genealogy" in Swedish). A local-first, cross-platform desktop genealogy app — your family tree, your data, your machine.

- feat: native cross-platform app on Tauri 2 — system WebView, single-digit MB binaries (macOS / Windows / Linux)
- feat: full GEDCOM 5.5.1 and 7.0 round-trip fidelity — every authored field survives export/import
- feat: native importers for Genney, Holger, RootsMagic, Gramps, plus GEDCOM 5.5.1 / 7.0
- feat: 29 bundled gazetteers — pins land at the actual famous city even across languages
- feat: HTML website export — turn your database into a static keepsake site you can host anywhere

For the full pre-launch development history (~50 internal patch releases consolidated into this launch), see [PLAN.md](PLAN.md).

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

- fix(places): the map sheet no longer overflows its column when the center is squeezed narrow (small windows, default panel widths, static-export preview iframe)

## 0.212.0

- feat(person-modal): the Save button in "Lägg till ny person" stays disabled until the user types at least one name field; no more accidental nameless persons. Existing nameless rows in user databases are surfaced via a new `PERSON_NO_NAME` quality check (notice severity).
- feat(persons): every server-side path that creates a person row now refuses to do so without a name — `persons.create`, `persons.createWithEvent`, MCP `create_person`, MCP `add_child`. Importers (GEDCOM, Holger, Genney, archive .zip) opt in via an explicit `allowNameless: true` and append a warning to the import report when an INDI/PERSON record carries no NAME tag, preserving the source's reference graph without silent drops.

## 0.211.3

- fix: foster/adoptive/step relationships render natural Swedish labels (Fosterförälder, not Förälder + Foster)
