# Changelog

## Unreleased

- fix(reports): chart report previews now hide zoom/control bars, drop the SVG-stroke text halo on timeline event markers (was illegible in dark/HC), and stop the timeline picking up dark/high-contrast surface + bar/grid/text colors. `useChartColors` and `tlColors` now read from each chart's own outer element so `.export-scope` / `.print-preview` token pins propagate via CSS-variable inheritance; chart-domain (`--chart-*`, `--tl-*`) tokens are pinned to print neutrals inside both scopes. Long person names in the timeline report no longer clip at the SVG's left edge (`overflow: visible` on the report-scoped timeline svg). The `exportTextColorInvariance` test gains 20 chart-token assertions across both scopes.

- feat(a11y): narration coverage for the 3 missing pickers (Source/Group/Media), modal headers, and the MediaViewer (image/caption/face tags). Adds 4 new builders in `narration.ts` (Media/Place/Event/Citation) following the existing `narratePerson` pattern, plus ~25 i18n keys per locale under `narration.*`. BaseSubPanel headers now announce "{Entity} modal: {Title}" instead of falling back to visible text. Face tag regions are now keyboard-focusable (`tabindex=0` + `role=button`) so a screen-reader user can tab through tagged people in a photo. Closes the last systemic gap from the appearance audit.

- feat(theming): entity colors are now CSS tokens with dark + high-contrast variants. Per-entity tokens (`--entity-{person,event,source,…}-text/-bg`) live in `tokens.css` (light) and `shared.css` (dark + HC); entity borders stay as decorative pastel accents (no theme-specific WCAG requirement). `BaseSubPanel` and 6 modal sub-section headers consume them via a `data-entity="<type>"` attribute selector that aliases `--entity-text/-bg/-border` for the modal subtree, so headers and save buttons flip with mode + theme automatically. The `.ep-*` modal chrome (~33 hex literals) now uses surface/text/accent tokens that already have dark + HC variants. `entityColors.ts` renamed to `entityMeta.ts` with color fields removed (icon + labelKey only). The WCAG contrast test gained ~99 assertions covering all 11 entities × 9 (theme × mode) combinations for text-on-bg pairs — entity-color regressions now fail CI.

- fix(panels): hide `<thead>` column labels on every side-panel table — narrow panels with self-evident row content (avatar + name link, date badge, action ✕) read denser and more consistent without the redundant headings.
- fix(panels): drop `table-layout: fixed` (it was squashing identifier / relationship / media / task tables into stacked vertical columns); replace with `min-width: 0` on `.panel-section` + `overflow-x: hidden` on `.panel-section-body` to clip residual overflow, plus `word-break: break-word` on cells so long source titles / URLs wrap naturally.
- feat(panels): unify all 8 entity side panels onto one shell — new `usePanelSections` composable replaces the per-panel `localStorage` boilerplate (and deletes the redundant `useSectionState` / `usePlacePanelSections`); MediaPanel and ReportPanel now persist section state across reloads. Header padding is now identical (`var(--space-md) var(--space-lg)` on `.panel-header-content`) and the close button stretches the full header height in every panel. PersonPanel and MediaPanel gain a close button they were missing. MediaPanel section padding aligns with the rest (`var(--space-lg)`).
- fix(layout): tighten list-view scroll containers — drop the `.filter-chips-bar` wrapper around chart-type tabs in PersonsView and PlacesView; wrap MediaView's list rows in a scrolling inner container so the header stays put
- fix(website-export): drop "+ thumbnails" from the includeMedia label since thumbnails are no longer generated (the static site reads from media/full/ directly)
- feat(tasks/groups): research tasks and groups can now link to multiple persons, places, and media items. New `task_links` and `group_links` polymorphic tables replace the single `research_tasks.person_id` column and the persons-only `group_members` table. Existing data migrated in place. ResearchTaskPanel and GroupPanel rewritten with separate Persons / Places / Media sections (new `LinkedPersonsSection` / `LinkedPlacesSection` / `LinkedMediaSection` shared components and a new `MediaPicker`). MCP `add_research_task` now takes `person_ids` / `place_ids` / `media_ids` arrays. Genney import preserves the persons-only semantics.
- feat(nav): renamed "Research Tasks" / "Forskningsuppgifter" → "Tasks" / "Uppgifter" in the navigation and headings; internal i18n / IPC / route names kept stable.
- feat(reports): renamed "Framable prints" / "Inramningsbara diagram" → "Charts" / "Diagram" in the reports view tab group.
- fix(charts): clicking a person box in pedigree, hourglass, descendant, and timeline charts now selects that person in the side panel even in readonly mode (the click handler was gated by `!readonly` — same mistake as the zoom controls; navigation isn't editing). Fan chart already worked.
- fix(website-export): per-row delete (✕) buttons in panel sub-tables (PersonNamesTable, GroupsTable, ResearchTasksTable, PersonIdentifiersSection, PersonMediaSection, EntityMediaSection in PlacePanel) now hidden in readonly mode. PersonMediaSection also drops its star/reorder column. PersonPanel/PlacePanel pass `:readonly` through to all the sub-tables that needed it.
- fix(map): map backdrop uses `var(--surface)` instead of Leaflet's default grey, and removed the border around the map container so it blends with the surrounding sheet
- feat(website-export): side panels (PersonPanel, PlacePanel, MediaPanel) are back in the static export — visitors get the full app-like experience with charts/maps + entity details. Add/edit/delete affordances are gated on `readonly`: the per-section "+ Add" buttons, delete (✕) buttons, picker action labels, and inline editors all disappear in static mode. The title input + notes textarea on MediaPanel render as plain text. Face-tag rows render as router-links to the tagged person. Panel sections also default to open in static so visitors don't have to click each one.
- fix(charts): zoom controls now visible on pedigree, hourglass, descendant, and timeline charts even in readonly mode (they're navigation, not editing — were previously gated by `v-if="!readonly"` and only fan chart had them unconditionally)
- feat(media): viewer now previews the report-style caption ("From left: …" + notes) under the picture, using the same MediaCaption component the reports use — extracted from MediaChronological so the look stays in sync
- fix(timeline): render labels on top of stems; make axis line black
- fix(media): refresh profile picture immediately after setting from face region; auto-create media link when only tagged via region
- fix(media): show "Media" heading in viewer/tagging mode; media list table is now read-only; title editing moved to side panel
- fix(website-export): static site now actually shows charts, maps, and media — switched to the main PersonsView/PlacesView/MediaView and rewrote static-api to match the real preload surface (forEntity, forPerson, listPage→items, profilePicRef, etc.)
- fix(website-export): hide entity side panels in static mode — the chart/map area now uses the full width
- fix(website-export): hide all add/edit/delete controls in static mode — "+ Add Person/Place/Media" buttons, per-row delete buttons, chart placeholder outlines, inline edit fields
- fix(website-export): use CartoDB Voyager tiles in static mode — OSM blocks tile requests without a referrer, which file:// can't send
- fix(website-export): hide MediaPanel in static mode (was still appearing on media row click)
- fix(website-export): bake gazetteer-resolved lat/lon into the snapshot so places appear on the map even when coordinates aren't stored on the place row (the static site can't run the resolver itself — gazetteers don't ship in the bundle)
- feat(website-export): new privacy option "Only include media linked to a person" — drops media that's only attached to events/places/sources/relationships, useful when you want to share faces without random documents
- fix(website-export): app no longer locks up / crashes on libraries with thousands of media files. Removed the per-file thumbnail generation step (the static site reads from media/full/ directly — thumbnails were never used) and switched to async file I/O with periodic event-loop yields so the main thread stays responsive during 700MB+ exports

## v0.146.0 — App-look website export

The website export (Present → Website) now produces a read-only Vue SPA that visually matches the application — same sidebar, search, design tokens, detail layouts — minus editing affordances. Features: focus-person + N ancestor / M descendant generation scope filter; living-person privacy controls (exclude entirely or redact to decade-only birth year); optional media (full + thumbnail), pre-rendered keepsake reports, and frameable chart prints. The old standalone HTML generator has been removed.

## v0.145.0 — universal side panels

- feat: every entity-list view (persons, relationships, sources, places, groups, research tasks) now hosts its own resizable side panel — no DetailView components remain
- feat: new panels — `SourcePanel`, `RelationshipPanel`, `GroupPanel`, `ResearchTaskPanel` (joining the existing `PersonPanel`, `PlacePanel`)
- feat: `:id` routes navigate to the list view with the panel pre-selected (e.g. `/sources/abc` opens `SourcesView` with `SourcePanel` showing source `abc`)
- feat: `usePanelResize` composable powers drag-resize on every panel-hosting view; per-view localStorage keys for selected id, panel open state, and width
- feat: cross-entity links navigate to the related entity's list view (which auto-opens its panel) — no inline cross-entity editing
- feat: `VisualizationView` renamed to `PersonsView` — same view now hosts tree, list, and `PersonPanel`; legacy `/visualisering` and `/visualisering/:personId` routes redirect to `/persons` and `/persons/:personId`
- chore: deleted `PersonDetailView`, `RelationshipDetailView`, `SourceDetailView`, `GroupDetailView`, `PlaceDetailView` — all editing now happens through modals opened from inside panels
- chore: removed `router.back()` calls and back buttons across all views — navigation is via the sidebar
- chore: `ResearchTasksTable` row click now selects the task in the panel instead of inline-expanding
- docs: refreshed CLAUDE.md (routes table, file map, panel components), `.claude/skills/{test,frontend-design,add-feature}/SKILL.md`, `.claude/agents/{ux-reviewer,vue-ui-builder}.md` for the side-panel pattern

## v0.144.0 — split Present nav: Reports / Framable prints / Website

- feat: PRESENT section now has three nav items — Reports (keepsake), Framable prints, and Website
- feat: new `/prints` route reuses `ReportsView` in framable mode; new `/website` route hosts the HTML site exporter as a standalone view
- chore: `ReportsView` accepts a `mode` prop (`keepsake` | `framable`) and shows only the matching tab group
- chore: HTML site export removed from Import / Export tabs (now its own nav item)

## v0.143.0 — modal redesign phase 2 — universal entity-panel modals

- feat: every modal now uses the `BaseSubPanel` shell with `mode='standalone'|'subpanel'` for one consistent visual language across the app
- feat: new modals — `LinkRuleModal`, `PersonIdentifierModal`, fold of add-related-person into `PersonModal`
- feat: `MergePersonsModal`, `ConfirmModal`, and the 5 import sections (Archive, Gedcom Import/Export, Genney, Holger) refactored onto `BaseSubPanel`
- feat: `BaseSubPanel` extended with `tone`, `icon`, `hideSave`, and `cancelLabel` props for informational and danger dialogs
- feat: `CitationModal` now supports inline source picking via `SourcePicker` when no `sourceId` is preset (with `useSourceSession` pre-fill)
- chore: removed legacy `EventForm`, `EventFormBody`, `CitationForm` components and their tests — fully replaced by `EventModal`/`CitationModal` standalone

## v0.142.2 — panel layout polish

- fix: PlacePanel no longer reloads when switching list↔map — panel is now owned by PlacesView across both modes (MapView gets `noPanel` prop)
- fix: PlacesView list padding reduced from 24px to 16px to match map/tree view
- fix: VisualizationView list mode no longer double-pads the header (outer padding removed, inner header padding preserved)

## v0.142.1 — modal polish

- fix: standalone BaseSubPanel simplified to plain modal with ep-host-row layout
- fix: dropdowns (PlacePicker, EventModal source search) capped at 5 results, positioned absolute
- fix: BaseModal accepts modalClass prop for panel-host layout
- fix: "Open ›" label trimmed to "›" in PersonModal and EventModal section headers

## v0.142.0 — Modal redesign: PersonModal, EventModal, CitationModal, SourceModal

- feat: unified entity modals — PersonModal, EventModal, CitationModal, SourceModal replace AddPersonModal, EventForm, CitationForm for keyboard-first entity entry with inline source citation flow

## v0.141.6 — minor UI fixes

- fix: minor UI fixes across views (routing, PlacesView, PersonsView embedded mode)

## v0.141.5 — track .superpowers in git

- fix: remove .superpowers/ from .gitignore and worktree copies so brainstorm state is tracked

## v0.141.4 — nav reorganisation

- fix: move Sources and Relationships to Review section, Reports to new Present section

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
