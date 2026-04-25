# Changelog

## Unreleased

## v0.141.4 — remove unicode chars from BaseSubPanel comments

- fix: remove unicode box-drawing characters from HTML comments in BaseSubPanel.vue (ESLint compatibility)

## v0.141.3 — lint fix

- fix: fix import order in ipc-worker-coverage test (vitest after node: imports)

## v0.141.2 — AddResearchTaskModal uses PersonPicker

- fix: AddResearchTaskModal now shows PersonPicker when no personId is pre-passed, matching ResearchTasksView inline modal

## v0.141.1 — chart route alignment, i18n cleanup, focal person defaults

- fix: descendant and hourglass connector routes now share one horizontal segment height per generation (routes no longer vary with individual node height, eliminating the cluttered look)
- test: add route alignment unit tests verifying all depth-d→d+1 connectors share the same midY
- fix: visualization focal person now reads `default_person_id` DB setting before falling back to first person in list
- fix: MediaView empty state gets an "Attach media" action button
- fix: EventForm update button uses `common.save` key instead of a bespoke translation
- fix: remove duplicate `back` and unused nav keys from i18n files; standardise delete/cancel buttons to `common.*` keys throughout

## v0.141.0 — separate fan chart settings in Your Ancestors report panel

- feat: add dedicated "Fan Chart" section to Your Ancestors report panel with independent arc span, color mode, and generation limit (3–8)
- feat: rename "Appearance" panel section to "Report" for keepsake reports and "Chart" for chart-print tabs
- feat: Your Ancestors report generations (ancestor pages) now go up to 10 independently of the embedded fan chart

## v0.140.0 — two-tier empty state system + chart outline fixes

- feat: introduce `SectionEmpty` component — compact one-line muted text with optional underlined action link, for sub-section empties inside detail views and panels
- feat: full empty state audit — full-view list empties (Persons, Relationships, Sources, Places, Media, Groups, ResearchTasks, Visualization, Quality, Reports, Map) now use `AppEmptyState` with icon, description, and action CTA; icons match their nav bar icon (👤 🔗 📚 📍 📷 🏷️ 🔬 ⚠️ 🖨️ 🌳 🗺️)
- feat: replace all `<p class="empty-hint">` and inline empty divs in panels and detail views with `SectionEmpty`; action links wired where component exposes a mechanism (`openAddForm`, `attach`)
- feat: MapView always renders the map even when empty — floating pill overlay for "no places" and "no matches" states instead of hiding the map behind AppEmptyState
- fix: chart descendant layout — exclude placeholder children from subtreeExtents and placement loop; track depthOf per node; separate placeholderPaths array so connector lines render dashed
- fix: chart pedigree layout — parent connector paths for placeholder parents go to placeholderPaths (rendered dashed); placeholder parents excluded from focal-person CY averaging
- fix: ReportPanel — fan chart color mode merged into chart print Appearance block; Your Ancestors fan chart gets its own collapsible section with separate `fanGenerations` / `fanArcSpan` props; `yourAncestorsColorMode` drop-down moved to fan chart section
- fix: improve empty states — map, media, visualization, places, and quality views now use AppEmptyState with descriptions and action shortcuts
- fix: quality checks now defer 1500ms after navigation instead of loading immediately, preventing contention with main data loading on detail views

- fix: packaged app crashed on startup with "Cannot find module '../../src/api/place-gazetteers/data/sv-socknar.json'" — Vite's externalize-gazetteers plugin rewrote imports to a src/ path that isn't shipped inside app.asar; imports now point to ./gazetteers/<file>.json and the JSON files are copied into .vite/build/gazetteers/ at build time so they ship alongside index.js

- fix: packaged app DB worker failed the same way (every view toasted "Could not load data" because `checks:runAll` throws when the worker requires bundled gazetteer JSON) — vite.worker.config.ts still emitted the relative ../../src/... path; align it with vite.main.config.ts to emit ./gazetteers/<file>.json so the worker bundle resolves JSON alongside db-worker.js inside app.asar

- fix: prevent quality checks race condition where App.vue badge load cancels QualityView's run and clears Pinia results; worker now returns null for cancelled runs, QualityView preserves cached results on cancellation

- fix: unify map marker style across all map views — white stroke, consistent radius/opacity, solid polylines with reasonable weight
- fix: restore hourglass chart outline connectors and collision-free placement broken by perf commit
- fix: modal titles now say "Add [Entity]" instead of showing a bare noun or a "+" prefix; add buttons keep the short "+ Entity" form; add common.add i18n key reused by all modal h3s
- fix: standardize Swedish place terminology to "plats" throughout (was mixed "ort"/"plats"); fix citation button label "Citering" → "Hänvisning"; fix research task label "Uppgift" → "Forskningsuppgift"; fix English relationships section title "Relations" → "Relationships"
- fix: PersonsView duplicates empty state now uses AppEmptyState component for visual consistency

## v0.139.0 — multilingual historical gazetteer

- feat: add lang-world-historical language gazetteer — all-language translations (70K names) for ~1,391 historical political entities (Soviet Union, Ottoman Empire, etc.) via Wikidata batch label lookups; "Sovjetunionen", "Sowjetunion", "União Soviética" etc. now resolve correctly

## v0.138.0 — Your Ancestors photos + report option wiring tests

- feat: Photos checkbox in Your Ancestors report now renders per-ancestor photo pages (was accepted as a prop but silently ignored)
- feat: add Captions and Photo Notes checkboxes to Your Ancestors report (consistent with A Life, A Marriage, Place Chronicle)
- feat: new PersonPhotoSection primitive — self-loading per-person photo section for report pages
- feat: static analysis test suite (reportOptionWiring) catches prop/binding mismatches across all 12 report components

## v0.137.3 — report link fixes

- fix: report anchor links (#ancestor-N, #event-N, #media-N, #person-N) no longer trigger Vue Router warnings — hash-router was intercepting them as route navigations; replaced with @click.prevent + scrollIntoView
- fix: fan chart segments in YourAncestorsReport now scroll to matching ancestor section on click
- fix: remove external OpenStreetMap href from Leaflet attribution in report maps
- fix: report map previews are now static (no pan/zoom/drag interaction)

## v0.137.1 — print fixes and framable tab rename

- fix: `printBackground: true` so chart colors appear when printing
- fix: framable prints tab labels now match visualization chart names (Pedigree/Hourglass/Descendants/Fan Chart/Timeline), reuse `visualization.tab.*` i18n keys, ordered consistently
- chore: add `/reports` skill covering PDF/SVG export, print CSS, orientation mapping

## v0.137.0 — ReportPanel, reworked ReportsView, PDF margin fix

- feat: replace ChartExportControls with ReportPanel (print-config side panel following PersonPanel pattern)
- feat: rework ReportsView layout — panel + preview split with drag handle
- fix: keepsake PDF right margin no longer cropped (explicit `width: 170mm; margin: 20mm auto` instead of `width: 100%; padding: 20mm`)
- fix: remove computeTileViewBoxes/generateTileSvg (replaced by hidden BrowserWindow PDF approach)
- chore: document printToPDF viewport behaviour in electron-dev skill

## v0.136.5 — timeline chart improvements

- fix: tick labels moved to below axis; mirrored top axis line with labels above
- fix: today label and line no longer clip at SVG top edge
- fix: event markers no longer overlap year tick labels
- fix: tooltip width adapts to long person names (no wrapping)
- fix: tooltip height grows with number of events shown
- fix: per-event marker tooltips (hover ★/†/♥/◆ for individual event info)
- fix: birth/death year labels rendered inline with symbol, left-anchored with 3px nudge to clear adjacent icons
- fix: grid lines clipping through marker text resolved with paint-order stroke knockout

## v0.136.3 — fix npm install and build pipeline

- fix: downgrade @electron/fuses ^2.1.1 → ^1.8.0 to satisfy @electron-forge/plugin-fuses@7.x peer dep (Dependabot bump broke install)
- fix: block Dependabot from re-bumping @electron/fuses past v1.x until forge adds v2 support
- fix: comment out Linux RPM/DEB makers (rpmbuild 4.20 on Debian trixie incompatible with electron-installer-redhat spec template)

## v0.136.1 — reliable e2e CI

- fix(ci): e2e smoke test timeout 30s → 90s; smoke-only on dep bump PRs, workers=2 for code PRs

## v0.136.0 — add optional limit parameter to search_persons MCP tool

- feat: search_persons MCP tool now accepts an optional limit parameter (integer, 1–200, default 20)

## v0.135.2 — devcontainer and Claude workflow fixes

- fix(devcontainer): xvfb-start.sh now exports DISPLAY=:99 (was host.docker.internal:0, broke E2E tests via `source`)
- fix(devcontainer): postCreateCommand chowns ~/.claude to fix named-volume permissions blocking Claude Code session-env
- fix(ci): claude.yml uses claude_code_oauth_token instead of anthropic_api_key (Claude Max compatibility)

## v0.135.1 — fix release workflow to compare against last tag

- fix: resolve ESLint import/order warnings and remove unused type imports
- fix: release workflow now compares package.json version against the last git tag rather than HEAD~1, so batched commits no longer skip the build

## v0.135.0 — ReportsView two-sheet paneled layout with drag resize

- ReportsView now follows the standard paneled layout: left main sheet (flex 1) + draggable handle + right ReportPanel sheet, matching VisualizationView and MapView
- Added `/reports` to PANELED_ROUTES so the view renders its own sheets without outer padding
- Drag handle (`usePanelResize`) allows resizing the ReportPanel; width persists in localStorage
- ReportPanel matches PersonPanel styling: `width/height 100%`, `box-shadow`, `font-size var(--font-sm)`, section padding `0 var(--space-lg)`
- Fixed i18n key `common.person` → `reports.person` in ReportPanel
- Updated `frontend-design` skill with a 5-step paneled-view checklist to capture the complete pattern
- Added paneled-view checklist entry to napkin runbook

## v0.134.1 — fix ReportPanel layout order and preview styling

- ReportPanel now renders before the preview wrapper so it appears to the left of the report preview
- Preview wrapper gets `background`, `border-radius`, and `box-shadow` tokens for consistent sheet appearance
- `.reports-body` gets a small gap between panel and preview

## v0.132.0 — cropped face-tag profile pictures on all avatars

Every `AppAvatar` in the app now shows a person's starred face tag as a cropped square profile picture — no new media blobs, no extra storage. See [plans/archive/2026-04-20-avatar-profile-pic-crop.md](docs/plans/archive/2026-04-20-avatar-profile-pic-crop.md) for full plan.

### What changed
- **Avatars everywhere show the cropped face.** PersonsView list, PersonPanel in the visualization view, GroupDetailView, PlacePersonsSection, RelationshipsList, MediaPanel's linked-persons and face-tag rows, and PersonDetailView's header all now auto-load the cropped profile picture when a person has a face tag on their first media. No face tag → centered square of the full image. No media → sex-colored initials (unchanged).
- **No duplicate files.** Crop is computed at render time from the existing media region via an offscreen `<canvas>`; the output is a 128×128 JPEG data URL cached per person in a Pinia store.
- **Group-photo dedup.** Three people tagged in the same photo share one `readAsDataUrl` call per batch — `ensureBatch` groups by `mediaId` internally.
- **Correct face containment.** Pixel-space crop math (`computeSquareCropRectPx`) picks the square side from `max(region.width × imgW, region.height × imgH)`, so portrait photos with tall face tags keep the whole face, not just the forehead.
- **Live updates on edits.** Profile picture invalidates automatically when the region is starred, reassigned, reordered, unlinked, re-drawn, or moved. Generation counter prevents in-flight async work from writing stale crops after invalidation.

### New API + IPC
- `api/media.ts`: `getPersonProfilePicRef(db, personId)` + batch `getPersonProfilePicRefs(db, ids[])`.
- `window.api.media.profilePicRef` / `profilePicRefs` (read-only).

### New renderer pieces
- `src/renderer/utils/cropImage.ts` — pure pixel-space crop math + canvas helper (10 unit tests covering portrait, landscape, edge-clamping, null-region center crop).
- `src/renderer/stores/profilePic.ts` — Pinia store with per-person cache, generation counter, batch-scoped media dedup.
- `src/renderer/composables/usePersonProfilePic.ts` — reactive wrapper.
- `AppAvatar` accepts a `personId` prop and auto-loads via the composable. Explicit `src` still wins for callers that need a manual override.

### Removed
- `PersonDetailView`'s bespoke `profilePicUrl` + `loadProfilePic` plumbing; the standard `AppAvatar` path now handles it.

## v0.131.0 — keepsake reports redesign

Complete redesign of the Reports view around family-facing keepsake narratives. See [plans/archive/2026-04-19-keepsake-reports-redesign.md](docs/plans/archive/2026-04-19-keepsake-reports-redesign.md) for full plan.

### New reports
- **A Life** (evolves Biography) — life map, visual timeline, family, events, notes, photos, sources appendix.
- **A Marriage** (evolves Family Narrative) — dual life map, shared timeline, couple, children grid, narrative, photos.
- **Place Chronicle** (evolves Place History) — boundary map, persons, events, description, photos, child places.
- **Your Ancestors** (evolves Ancestor Book) — fan chart cover, full-page fan, per-ancestor pages with ahnentafel, surname index.
- **Life on One Page** (new) — single framable sheet with portrait, map, key dates, photo grid, notes snippet.
- **Family in Year X** (new) — snapshot of everyone alive in a target year with family units.
- **Photo Album** (new) — chronological media gallery scoped to person / couple / place / all.

### Removed reports
- **Individual Summary** — redundant with `PersonDetailView`. Use A Life for the keepsake version.
- **Family Group Sheet** — redundant with `RelationshipDetailView`. Use A Marriage.
- **Ancestor Sheet** (tabular) — retired. A new **Pedigree Print** chart takes its place in the framable-prints group.

### Other changes
- New Settings field `researcher_name` powers report attribution ("Compiled by …").
- Reports view split into two tab groups: Keepsake reports + Framable prints.
- New design tokens: `--report-serif-stack`, `--report-prose-leading`, `--report-page-max-width`, `--report-cover-accent-height`.
- New `getAliveInYear(db, year)` API function + IPC channel + types (`AliveInYearPerson`, `AliveInYearFamily`, `AliveInYearResult`).
- New composables: `useLifeMap`, `useMediaChronological`.
- Six new print-safe shared primitives under `src/renderer/components/reports/primitives/`: `ReportCover`, `PersonMiniCard`, `TimelineBar`, `LifeMap`, `PlaceBoundaryMap`, `MediaChronological`.
- Privacy: identifiers unconditionally hidden for living persons; new per-report "Redact living persons" toggle replaces birth year with decade and hides notes/portraits of living persons.
- 14 new component smoke tests + 8 new E2E tests across the seven keepsake reports.
