# Changelog

## 0.270.1 — 2026-06-07

- fix(gedcom): GEDCOM export no longer stalls or consumes tens of GB of RAM on large trees. The exporter was running O(persons × couples × parent_child_rows) inner loops to build FAMC/FAMS pointers and O(parent_child_rows² × couples) to detect multi-parent triads — all cubic or quartic on the data. Five pre-built O(N) lookup Maps replace every inner scan, reducing the hot path from billions of iterations to O(N). Also eliminates a redundant second event-fetch per person/couple in the negation emitter.

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
