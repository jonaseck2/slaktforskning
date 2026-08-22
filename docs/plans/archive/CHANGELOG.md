# Archived Changelog

Release notes trimmed out of the top-level [CHANGELOG.md](../../../CHANGELOG.md) under the "last 10 versions" rule. New entries are appended at the top as the rolling CHANGELOG ages out; pre-launch entries (≤ 0.215.x) live at the bottom. The companion [PLAN.md](PLAN.md) holds richer per-milestone prose (design rationale, RCA write-ups); git log holds the commit-level detail.

## 0.270.1 — 2026-06-07

- fix(gedcom): export no longer stalls or eats tens of GB of RAM on large trees (cubic inner loops replaced with O(N) lookup maps)

## 0.270.0 — 2026-06-07

- feat(charts): the three family-tree charts — Pedigree, Hourglass, and Descendants — now look and behave identically wherever they share a concept. A person box renders the same in all three (portrait, name, dates, the "+" add-relative button, the focus highlight); selecting a person scrolls it into view in every chart; double-clicking a box re-roots the tree in every chart (previously only Hourglass did); and every chart exposes the same `role="tree"` / `treeitem` accessibility structure with keyboard focus. Behaviour that used to exist in only one chart is now shared by all three.
- feat(charts): arrow-key navigation works in all three charts, oriented to how each chart grows — in Pedigree, → moves toward ancestors and ↑/↓ between siblings; in Hourglass, ↑ goes to ancestors and ↓ to descendants; in Descendants, ↓ goes to descendants — so a keyboard or screen-reader user traverses the tree the natural way in each.
- refactor(charts): the rendering, box-drawing, selection, pan/zoom, collapse, placeholder, and add-relative logic that was copy-pasted across the three chart components now lives in one shared `ChartCanvas` component + `useChartBox` composable, so the charts can no longer drift apart as the code changes. Locked by a `chart-parity` test that mounts the shared canvas and asserts every shared behaviour, plus the 130-test layout property suite proving the layout maths are unchanged.

## 0.269.1 — 2026-06-07

- fix(import): importing a Gramps `.gpkg` package with media through the desktop file picker no longer fails with "fs/promises.mkdir called in renderer". The 0.268.0 `.gpkg` handler called `consolidateMediaFolder` (which uses Node `fs`) in the renderer, where Node fs is unavailable — so any real `.gpkg`-with-media import via the UI threw. The bundled media is already written and its `file_ref` made relative inside the importer (as the `.zip` archive importer does), so the extra call was redundant as well as broken; it's removed. Importing via the MCP `import_file` tool was unaffected.
- test(e2e): the `imports` suite now covers both Gramps native decoder paths with tiny fixtures — `gramps-small.gramps` (gzipped XML) and `gramps-small.gpkg` (tar.gz with a bundled image) — the latter asserting the media row lands with a relative `<dbname>-media/` ref. This new `.gpkg` case is what caught the regression above.

## 0.269.0 — 2026-06-06

- feat(citations): the citation entry form is clearer — its title now reads "Lägg till källhänvisning" / "Redigera källhänvisning", the page field is labelled "Sida / Plats / URL", the confidence section is "Källans tillförlitlighet", and the confidence buttons are ordered most-reliable-first (Primärkälla → Opålitlig). The source field shows a ▾ dropdown affordance so it's obvious it opens a list. (Ben rapport 100)
- feat(events): the event modal's citation count now reads "(1)" instead of a bare "1", and the per-row delete control on both citation and participant rows is a trash icon instead of a ✕ close glyph. (Ben rapport 101)
- feat(events): residence events speak the right language — the date fields read "Inflyttningsdatum" and "Eventuellt utflyttningsdatum", the misleading "single point in time" end-date hint is suppressed, and the participants section is titled "Övriga boende i bostaden". Other event types are unchanged. (Ben rapport 102 §1–§3)
- feat(events): adding a participant to a not-yet-saved event no longer dead-ends on a static hint — the picker is always available, and choosing a person offers "Spara och fortsätt" to save the event and attach the participant in one step. (Ben rapport 102 §4)
- feat(persons): the research-tasks section and sidebar entry are renamed "Fortsatt forskning" (Swedish), and the person panel now orders Tidslinje and Livskarta below the authored data, just before Fortsatt forskning and Kvalitet — authored facts first, derived views last. (Ben rapport 103 + 105)

## 0.268.0 — 2026-06-06

- feat(import): importing a Gramps **`.gpkg`** package now brings in its bundled media. Previously a `.gpkg` (a gzipped tar of the family-tree XML plus a `media/` folder) silently imported nothing — or, for tar.gz files, imported the people but dropped every photo. The importer now unpacks the tar (via `nanotar`), writes each media file into the database's `<dbname>-media/` folder, and stores a relative `file_ref`, so a `.gpkg` import behaves exactly like importing the `.gramps` XML and attaching the photos. Works from both the desktop file picker and the MCP `import_file` tool. The plain `.gramps` XML path is unchanged.

## 0.267.1 — 2026-06-06

- test(docs): close the verification hole on the OSS-launch quickstart — a new `tests/unit/readme-quickstart-coherence.test.ts` parses `QUICKSTART.md` and asserts the README links to it, that all 8 numbered steps each carry a sequentially-numbered screenshot, that every referenced `docs/quickstart/*.png` exists, and that no screenshot is orphaned. The OSS-launch demo + manual themselves shipped across 0.264.x; this completes its planned coverage and archives the plan.
- fix(licenses): the third-party-licenses generator no longer hard-fails after the vue-router 5.1 bump. vue-router 5.1 declares `vite` as an optional peer dependency, which dragged the build toolchain (`vite` → `esbuild` → `@esbuild/<platform>`) into the `npm ls --omit=dev --all` production tree; the platform-binary packages ship no LICENSE file, so `npm run build:third-party-licenses` threw and the `scripts.npmScripts` / `scripts.thirdPartyLicenses` tests went red. The generator now prunes that build-only subtree explicitly (it is never bundled into the shipped app) and logs each prune.

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
