# Changelog

## Unreleased

- feat(website-export): preview iframe now actually renders the static SPA, with inlined photo thumbnails and the editor's tree subject as the landing page (v0.161.0). The previous `app-preview://` custom-protocol approach was scrapped — Electron's `protocol.handle` choked on a U+FFFD glyph buried in the SPA bundle (`TypeError: Cannot convert argument to a ByteString — character at index 89 has a value of 65533`), and the next attempt at `<iframe srcdoc>` hit Chromium's silent attribute-size limit on the 1.5 MB inlined HTML and fell back to loading the parent renderer URL (full editor inception inside the iframe). The new path: `website:buildPreviewHtml` reads `dist-static/index.html`, replaces `<script src="./data.js"></script>` with an inline `<script>window.__SNAPSHOT__=…</script>` (closing-tag-safe via `<\/script` escape), and returns the HTML; the renderer wraps it in a `Blob` via `URL.createObjectURL` and points the iframe at the resulting `blob:` URL. No size limit, no scheme registration, same boot path as the exported site. The IPC also resizes the first 24 image media items to 400px JPEGs @ 70% via Electron's `nativeImage` and stuffs them into `snapshot.meta.previewMediaDataUrls` (5 MB total budget); `static-api.media.readAsDataUrl` returns those inlined data URLs instead of unreachable file:// paths so the gallery shows real photos. `snapshot.media`/`mediaLinks`/`mediaRegions` are trimmed to the inlined IDs so the gallery doesn't scroll past the subset into broken images. `buildSnapshot` also writes `settings.default_person_id = focusPersonId` (when the focal person survived scope/living filters) so both the preview and the actual exported site land on the editor's tree subject. Defensive shims that fell out of debugging this: `useDefaultPerson` and `chartData.resolvePersonPhotoUrl` no longer throw when `window.api` is missing; `cropImageToDataUrl` skips `crossOrigin` for file:// sources (Chromium has no CORS there) and falls back to the original src when the canvas is tainted by toDataURL; renderer `App.vue`'s `onMounted` uses optional chaining for `db.onSwitched`/`undo.onPerformed`/`undo.onChanged`/`onDataChanged`; `MapView`'s `<LGeoJson>` is now gated on `mapInitialized` so Leaflet's canvas renderer can't race with `_addPath` and throw on undefined `_ctx.clearRect`. The `Cmd+N` new-window preload exposes `window.api.website.buildPreviewHtml`.

- feat(dev): hold-Alt component & i18n inspector in dev mode (v0.160.0). New `src/renderer/dev/component-inspector.ts` is wired in from `main.ts` behind `import.meta.env.DEV` so it's stripped from packaged builds. Holding Alt swaps the cursor to a crosshair and outlines whatever the user is hovering — a tooltip near the cursor names the nearest meaningful Vue component (skipping `RouterView`/`Transition`/etc.), shows the source file under `src/`, and lists any i18n keys whose translated value matches the hovered text (current locale + fallback, rebuilt when the locale changes). Clicking while Alt is held copies a paste-ready block (`Component: …`, `File: …`, `i18n: …`, `Text: …`) to the clipboard and shows a small toast — designed so users describing UI to Claude can paste an exact identifier instead of guessing what to call a panel/modal/section. Releasing Alt removes the overlay; no listeners fire on hover or click outside inspect mode. DOM is built via `replaceChildren` + `textContent` (no `innerHTML`).

- feat(website-export): live preview of the exported site rendered next to the configuration panel (v0.159.0). Adds a custom `app-preview://` Electron protocol backed by the static SPA bundle; the renderer keeps a debounced snapshot watcher that pre-builds the preview snapshot in the worker (`website:previewSnapshot`) and stashes the full payload in main (`website:setPreviewSnapshot`) so the iframe can pick it up with no extra IPC. The right-side panel drops the FilterChips tab bar — the five blocks (Subject, Scope, Privacy, Include, Site) are now a single flat list of collapsible sections via `usePanelSections`, matching the rest of the app. Snapshot generation gets a bulk-living-derivation refactor in `personLiving.ts` (`loadLivingDerivation` + `isLivingDerived`) so "everyone" scope no longer fires a correlated subquery per person — preview is ~15ms even on large databases, fast enough to auto-refresh on field changes.

- fix(router): last-route restore on dev hot reload no longer races against the `/` → `/persons` redirect (v0.158.7). Previously the redirect's `afterEach` clobbered `slaktforskning-last-route` with `/persons` before `main.ts` could read the saved value, so reloads always landed on Persons. Now we read `lastRoute` and `router.push()` it before mounting, then `await router.isReady()` so the initial nav goes straight to the saved route. Hash deep-links (e.g. from MCP `ui_navigate`) still take precedence.

- fix(gazetteers): place resolver now prefers the stem over the leaf when the same name appears at multiple depths (v0.158.6). "California, USA" used to resolve to the tiny CDP "California" inside Saint Mary's County, Maryland, instead of California the state — both candidates fully matched the input but the leaf-preferring depth tiebreaker won. Both `pickBest` and `isBetterCandidate` now prefer the shallower (stem) path when contradictions and unmatched components are equal; the boundary resolver got the same fix. Also: deduped match candidates by anchor node identity, made the `lastComponentMatched` check positional (so duplicate component strings don't poison the flag), removed dead `treeDepth`, and dropped the no-op `fuzzyEqual` helper.

- fix(panels): every right-side entity panel and every left-side list column now reserves the same 28px slot for its `▶`/`◀` collapse tab, so the tab no longer clips against the panel's rounded corner on Place/Group/ResearchTask/Source/Relationship/Report/Media (v0.158.5). PersonPanel already had this; the other seven panels were missing it. Refactored: extracted `.side-panel` and `.list-column` into shared.css so the layout/surface/padding is defined once instead of duplicated in eight scoped style blocks. PlacesView and MediaView list columns also pick up the shared 28px right-padding through `.list-column`.

- fix(media): the left list column in MediaView now infinite-scrolls on its own (v0.158.4). Previously only the gallery sentinel triggered `loadMore()`, so scrolling the list past the first page had no effect — it just bottomed out at whatever the gallery had already paged in. Adds a second sentinel inside `.media-list-content` and a second `IntersectionObserver` rooted in the list's own scroll container, with cleanup on unmount.

- fix(media): gallery card thumbnails switch from a fixed 140px height to `aspect-ratio: 1 / 1.35`, giving them face-like portrait proportions that scale with column width (v0.158.3).

- fix(media): gallery cards bias the photo crop toward the top (`object-position: 50% 25%`) so faces, which usually sit in the upper third of a portrait, stay visible instead of being centred away (v0.158.2).

- fix(media): selecting a media item now scrolls both the left list and the gallery so the selected card stays visible (v0.158.1). Each gallery card and list row carries a `data-media-id` attribute; a watch on `selectedMediaId` calls `scrollIntoView({ block: 'nearest', behavior: 'smooth' })` on every match. Selecting a row in the list now reveals the corresponding gallery card without manual scrolling.

- feat(panels): every right-side panel now has a `▶` collapse tab on its left edge instead of an `×` close button in the header (v0.158.0). PlacePanel, GroupPanel, ResearchTaskPanel, SourcePanel, RelationshipPanel and ReportPanel match the existing PersonPanel pattern. PlacesView gains the matching `◀` reopen button it was missing, and the left-list collapse tab in PlacesView now mirrors PersonsView's direction (rounded inward, anchored at the column's right edge) instead of sticking outward. ReportsView/PrintsView gain a panelOpen state so the right panel can fully collapse and be reopened (persisted under `reports-panel-open`). The four other views (Groups/ResearchTasks/Sources/Relationships) keep their existing reopen buttons but switch the arrow from `▶` to `◀` so direction matches the new convention.

- feat(media): MediaView gets a permanent left-side list column (compact thumb + title) with the same `◀`/`▶` collapse tab pattern as PersonsView and PlacesView. The center stays as the gallery cards; the table view and gallery/list view-toggle are removed since the list is now always visible to the left of the gallery. Search filter moves from the gallery header into the list column. The right MediaPanel is now collapsible via the new `▶` tab. List width persists under `media-list-width`, list-open under `media-list-open`, panel-open under `media-panel-open`.

- fix(nav): horizontal top-bar search uses the same PersonPicker typeahead as the vertical sidebar (v0.157.9). Selecting a person opens the panel for that person and routes to `/persons/...` — same behaviour in both nav orientations. Cmd+F focuses the picker in either mode. The plain `<input>` + `submitSearch` form that routed to `/search` is dropped.

- fix(views): collapse-list reopen button (▶) anchors to the view's left edge, not the window's. PersonsView and PlacesView were missing `position: relative`, so the absolutely-positioned `.list-open-btn` escaped to the viewport — in vertical-nav mode it landed at the window edge, behind the sidebar. Both views now position relatively, putting the button flush with the right side of the nav.

- fix(persons): rename "focus person" to "tree subject" and split the role from the panel selection (v0.157.8). The tree subject is now solely the chart's URL person — `/persons/:id` — and is the export anchor: setting it persists `default_person_id`, the same setting GEDCOM SUBM uses. The PersonPanel button reads "🌳 Sätt som trädsubjekt" / "🌳 Set as tree subject", and once the panel target equals the tree subject it switches to a non-interactive "🌳 Trädsubjekt" / "🌳 Tree subject" chip instead. The chart no longer paints any visual highlight on the tree subject — the selected box (panel target, set by clicking) gets the highlight colour instead via Pedigree/Hourglass/Descendant's existing `selectedPersonId` prop. The redundant `useFocusStore` is removed: every previous reader (App, ReportsView, MediaView, PersonsListTab, SearchView) now uses `useSelectedPersonStore` for the panel target and reads `default_person_id` directly when it needs the tree subject. The horizontal-nav top-bar's "Vald person" chip (which sat next to the search box and duplicated the URL) is removed since the tree subject has no visual presence outside the panel. i18n updates: `nav.focusPerson` → `nav.treeSubject`; `panel.focus` → `panel.setAsTreeSubject` + new `panel.treeSubject`; "Fokusperson" / "Focal Person" become "Trädsubjekt" / "Tree subject" across the visualization tab, the no-tree-subject empty state, the database settings hint, and the website-export options.

- feat(persons,places): permanent left list column. PersonsView and PlacesView lose their list/tree (resp. list/map) tab toggle — the list is now always visible to the left of the chart/map, with a ▶/◀ collapse button and a drag-resize handle. Two `usePanelResize` instances per view (left list + right detail) stay independent in `localStorage` (`persons-list-open`/`-width`, `places-list-open`/`-width`). `usePanelResize` gains a `side: 'left' | 'right'` option; existing right-side calls are unchanged. List clicks call the same `navigateTo` as chart clicks, so selecting a row refocuses the chart, opens the right panel, and updates the sidebar's selected-person indicator in one click. PersonsView component-test scoped to `.viz-tabs .chip-btn` to avoid counting the embedded list's own filter chips. Closes the list-on-left half of `docs/plans/archive/2026-04-26-nav-orientation.md`.

- fix(avatars): square every profile picture and switch tree boxes to the cropped tagged face (v0.157.7). `AppAvatar` now uses `--radius-sm` instead of `--radius-full`, so the photos in list rows, panel headers and mini-cards stop being circles and instead match the rounded-square portrait area inside tree boxes — the same shape the cropping math always produced. The fallback initials placeholder follows suit. Two new sizes are added per the docs: `2xl` (64×64) and `auto` (parent-sized via width/height + `aspect-ratio: 1/1`). Trees previously rendered the *raw* media via `media.forEntity` + `readAsDataUrl` — for a wide group photo, `xMidYMid slice` would just show the middle of the picture. They now go through `media.profilePicRef`, which returns the same `(mediaId, region)` pair the avatar store uses, then `cropImageToDataUrl` produces a square crop centred on the tagging region (no aspect-ratio change to the original image — the existing `computeSquareCropRectPx` math is reused). Cache is keyed per person, so siblings sharing one family portrait get one IPC fetch but a separate crop each. The `profilePic` Pinia store's `invalidatePerson` / `invalidateAll` now also clear the chart-data photo cache so list/panel avatars and tree boxes stay in sync after a profile-pic change. **Untagged profile media no longer renders as a center-cropped square in either avatars or trees** — without a face tag, both the avatar store and `chartData` skip the photo and the box falls through to the sex-coloured initials placeholder. The previous behaviour (centre-crop the whole image) read as "showing the whole media" because the face was rarely centred. To get a tree photo, tag the face in the media item; the same tag drives every avatar and every tree box. MediaView and MediaViewer still render the raw media (they read `media.readAsDataUrl` directly, not through `chartData`).

- feat(nav): main menu can now be either a left sidebar (default) or a top bar. The toggle lives in two places that stay in sync: the 🎨 popover (new "Meny" row at the top) and a new "Utseende" tab in `/settings` with two preview cards (mini-SVG renderings of each layout). Horizontal mode shows two rows — brand · search · "Vald person" chip on row 1, four section dropdowns (Forskning / Organisera / Granska / Presentera) + spacer + Import · Inställningar · 🎨 on row 2. The Organisera section renders flat (its two items inline next to a small "ORGANISERA" tag) so the most-used pages are one click away; the other three sections collapse behind dropdowns. The dropdowns reuse the same nav grouping as the sidebar, badges intact. `App.vue` exposes the orientation ref via `provide('appearance-store', …)` so both control points read/write a single source. Persisted in `localStorage` under `slaktforskning-nav-orientation`. New i18n keys `settings.menuLayout`, `settings.menuLayoutHint`, `settings.menuVertical`, `settings.menuHorizontal` (sv + en). WCAG test still passes — the top bar uses the same `--sidebar-*` token palette as the sidebar.

- fix(panels): align the close × in PersonPanel and MediaPanel with the panel title (v0.157.5). Both panels were adding `padding: var(--space-md) 0 var(--space-md) var(--space-lg)` to `.panel-header`, which stacked with the shared `.panel-close-btn` `margin-top: var(--space-sm)` and pushed the × ~12px below the avatar/thumbnail. Match PlacePanel's pattern: `.panel-header` carries no top/bottom padding, the avatar/thumbnail and `.panel-header-content` / `.media-info` carry their own `var(--space-md)` margins/padding instead.

- fix(persons): the "🌳 Visa i träd" button on the Person panel's lifelines row now sits next to the * / † dates instead of being pushed to the right edge — the row uses `justify-content: flex-start` so the button reads as part of the dates cluster rather than a separate header action.

- fix(media): the ✕ delete button in the Media list's table view now right-aligns. The table's actions column was using a 40px-wide `<col>` and neither the `<th>` nor `<td>` had the `actions-cell` class, so the button sat left-aligned inside an oversized cell. Drop the fixed width and add `class="actions-cell"` to both, matching every other entity list.

- refactor(media): extract a single `FaceTagBox` shared component used by both the MediaViewer overlay (`FaceTagOverlay`) and the chronological media gallery in reports (`MediaChronological`), so face-tag styling stays consistent everywhere (v0.157.6). Both views now share identical geometry: a 3px dashed bounding box with a solid name pill below it (`--space-sm var(--space-md)` padding, `--radius-sm` corners). Two props drive the differences: `visibility="always"` keeps the box visible at all times in the MediaViewer, while `visibility="hover"` hides the box and label until the pointer hovers in reports; `themed=true` (MediaViewer) uses `--accent` so face tags pick up the active theme (Forest/Nordic/Twilight) on top of the existing light/dark/high-contrast appearance overrides, while `themed=false` (reports) uses a fixed neutral blue so prints don't shift colour with the active theme. The hover/edit shadow lift is removed — the box is now plain at all times in the MediaViewer.

- fix(panels): make the close button consistent across every side panel and clean up the Person/Media headers (v0.157.4). The × was missing entirely on PlacePanel and rendered as a stretched full-height column on Person/Media — now it's a single shared rule in `shared.css` (`.panel-close-btn`, anchored top-right via `align-self: flex-start` + `margin: var(--space-sm) var(--space-sm) 0 0`) used by every panel (Person, Media, Place, Source, Group, Relationship, Research Task). Per-component scoped copies are removed; their higher specificity used to outrank the shared rule. PersonPanel: "🌳 Visa i träd" / "Show in tree" moves off the name row and onto the dates row, with the * / † lifelines on the left and the button anchored to the right of the same row. MediaPanel: the open-viewer button moves off the title row onto the format row and is renamed "Visa" / "View" via a new `panel.view` i18n key — so the title input gets the full row and the button sits next to the uppercase format text. The frontend-design skill is updated to document the shared rule and the no-scoped-redefinition rule.

- fix(nav): replace the sidebar's free-text search box with a `PersonPicker` that sets the selected person (panel target) without changing the chart focal. Picking a person from the sidebar now opens their panel and highlights their box if visible in the tree, but leaves the tree rooted on the previous focal — refocusing remains an explicit "🌳 Visa i träd" action. Lifts `selectedPersonId` out of `PersonsView` into a new `useSelectedPersonStore` so the sidebar can write to it; the store is session-only and resets on app reload. Cmd/Ctrl+F still focuses the picker. Also removes the "Fokusperson" indicator that sat above the nav in both the desktop app and the static SPA — selection is now expressed by the panel itself, not by a separate sidebar label.

- fix(persons): restore the separate "selected person" / "focal person" concept that was lost in v0.156.0. Clicking a person in the tree view now opens their panel without re-rooting the chart — the tree only refocuses when you click the "🌳 Visa i träd" button in the panel header. This fixes the regression where every click in the tree caused a full layout redraw, making it impossible to inspect ancestors without losing your bearings. Restores `selectedPersonId` ref, `selectNode`/`showInTree` helpers, the panel-header refocus button (relabelled "🌳 Visa i träd" / "🌳 Show in tree" with a small visual lift over the previous "Fokusera"/"Focus" wording), the `showTreeBtn` prop and `show-in-tree` event on `PersonPanel`, and the "Fokusperson" sidebar label.

- fix(charts): split the single "+ Barn" outline placeholder into "+ Son" and "+ Dotter" in all three tree charts (Pedigree, Hourglass, Descendant) — this part of v0.154.0 was lost during a rebase. `injectOutlines` now pushes two sex-typed child placeholders (`son` with M, `daughter` with F) instead of one generic `child`, so clicking either opens PersonModal with sex pre-filled and skips the in-modal sex picker. The role union widens to `father | mother | son | daughter | spouse` in `chart-layout/types.ts`, `hourglass-tree.ts`, and the placeholder extractors in `pedigree.ts` / `hourglass.ts` / `descendant.ts`. PersonModal's second-parent picker (introduced for "+ Child") now also fires for `son` / `daughter` so opening from the chart still offers the partner dropdown when the focal has couple relationships. The PersonPanel "+ Barn" button is unchanged — it keeps the in-modal sex picker since the panel button itself doesn't carry sex.

- feat(modals): entity-modal headings are more visible and now state who or what you're working on. The colored entity band (and every in-line section header inside a modal) gets a full 1px border on all sides instead of just a bottom rule, so each colored heading reads as an enclosed pill against the modal body. The titles also pick up context from the surrounding entity: `EventModal` shows "Birth of John Doe" / "Marriage of John & Jane" when opened from a person or relationship panel; `PersonModal` (related-person mode), `PersonNameModal`, `PersonIdentifierModal`, `ResearchTaskModal` show "… for {person}"; `CitationModal` shows "{source} for {event/person/relationship/place}"; `PlaceModal` shows "New place in {parent}". Once a real name is typed into the form, that takes over the title as before. Source/Group/LinkRule modals are unchanged because they have no natural parent context.

- fix(reports): the Hourglass and Descendant generations sliders in the report side panel were capped at `max="8"`, while the chart's own `+` button (visible in the Persons tree view) has no cap. The chart's own button is hidden in the report preview, so the slider was the only visible control there — and because both controls write to the same shared `hourglassGenerations` / `descendantGenerations` ref, setting e.g. 14 in the tree view and then clicking the slider track in the report panel snapped the value back down to whatever 0–8 position was clicked, collapsing the rendered chart (and the saved SVG) to that depth. The slider max is bumped to 20 for both charts so the panel control matches what the chart can actually render.

- fix(media): clicking "Draw" on the face-tags section in the MediaPanel now opens the media in the full viewer so the user can immediately draw the box on the image. Previously draw mode flipped on but only the viewer hosts the `FaceTagOverlay`, so nothing happened until the viewer was opened manually. Also moves Face Tags to sit directly after Linked Persons in the panel section order (before Linked Places / Linked Events) so the people-related controls cluster together.

- refactor(avatars): consolidate every profile picture in the app onto a single base component. `AppAvatar` is now square (`--radius-sm`, matching the chart and report style) and gains `2xl` (64px) and `auto` (parent-sized) variants. `PersonMiniCard` no longer rolls its own portrait loader — it composes `AppAvatar` so reports get the same face-tag-cropped image as the rest of the app. `LifeOnOnePageReport` switches its larger portrait to the cropped face source via `cropImageToDataUrl(…, region, 512)` and watches the profilePic store, so it re-renders on tag changes. The Pedigree / Hourglass / Descendant charts now read the face-cropped photo from `chartData.fetchPersonNode` (was: first linked media, no crop). `profilePicStore.invalidatePerson` / `invalidateAll` now also flush the chart-side photo cache, so all existing tag-mutation sites (PersonMediaSection, MediaPanel, MediaView, mediaProfile.ts) keep charts and avatars in sync without further wiring. Net effect: every profile picture in the app — list rows, panels, mini cards, reports, charts — now (a) looks like a rounded square and (b) shows the face-cropped image from the same source, updating automatically when face tags or media order change.

- fix(persons): drop the stored `living` flag — `_LIVING` was a non-standard GEDCOM tag (note the leading underscore), and persisting it diverged from the standard convention that deceased status is implied by a death event. The `persons.living` column is dropped (with an idempotent `ALTER TABLE DROP COLUMN` migration), the GEDCOM exporter no longer emits `_LIVING Y`, the GEDCOM importer ignores it, and the Genney importer no longer carries `LIVING=1` into a synthetic flag. `Person.living` is still exposed everywhere it was displayed (charts, reports, redaction, panel header, SearchView), but it is now derived at read time via a new `livingSqlExpr()` helper: a person is living unless they have a `death`/`burial`/`cremation` event, or a `birth` event more than 120 years before today. The Living/Deceased toggle is removed from PersonModal and PersonDetailsSection (now read-only), the `living` parameter is removed from `create_person` / `update_person` MCP tools, and three quality checks that were tautologies under the new derivation rule are dropped: `LIVING_WITH_DEATH_EVENT`, `NOT_LIVING_WITHOUT_DEATH`, `LIVING_OVER_120`. Behavior change for Genney imports: persons that were marked as deceased in Genney without an accompanying death event will appear as living after import — adding a death event is the standard way to mark them deceased.

- fix(charts): clicking a person in the tree view (Pedigree / Hourglass / Descendant) or in the embedded person list now refocuses the chart on that person, syncs the sidebar's "Fokusperson:" indicator, and shows that person's panel — all in one click. Previously click-to-select only updated the side panel; the chart kept the old focal and the sidebar indicator stayed stale until the user pressed "Fokusera". `navigateTo()` now pushes the route immediately and `load()` is the single point that syncs `focalPerson`, `selectedPersonId`, and `focusStore` when the route changes — so direct-URL nav, sidebar links, and click-to-navigate all behave identically. List-mode clicks now also push the route via `navigateTo` instead of the old in-page-only `selectNode`.

- fix(charts): remove the floating hover tooltip from the tree views (Pedigree / Hourglass / Descendant). Hovering a person box no longer shows a name/dates popover — names are already legible inside the box, and the panel shows full details on click, so the tooltip was redundant noise that flickered across the screen as the user navigated. `ChartTooltip`, `tooltipRef`, and `hoveredPersonId` removed from all three chart components. FanChart still uses `ChartTooltip` (different layout, smaller segments) — left unchanged.

- feat(events): marriage / wedding / engagement / divorce events created from a person panel now offer a "Andra personen" picker that lists existing partners (couple-relationship counterparts) as suggestions, falls back to a free PersonPicker for any other existing person, and includes a "+ Lägg till ny person" link that opens PersonModal as a subpanel in spouse mode. The chosen second person is attached to the saved event with `event_participants.add({ role: 'spouse' })`, so couple events are properly two-person from the start.

- feat(events): birth events now include optional **Dopdatum** + **Faddrar** fields when creating a new birth from a person panel. If filled in, a separate `baptism` event is created with the same place and primary participant, and current citations on the birth event are copied over so the source carries through. Subsequent saves keep the baptism in sync. Hidden in edit mode to avoid duplicate baptisms. Adds `'baptism'` to the EventModal quick-type bar (now: Födelse / Dop / Vigsel / Död) so genealogists can pick it without opening the full type list.

- feat(persons): adding a child to a person who has couple-relationship partners now shows a "Andra föräldern" picker. With one partner, they're auto-pre-selected; with multiple, all partners list as options + "Ingen". On save, a second `parent_child` relationship is created between the chosen partner and the new child so both parents are linked in one step.

- feat(persons): when adding a partner via the new-person path from a tree view (Hourglass/Pedigree/Descendant), the sex segmented control now defaults to the opposite of the focused person's sex (M→F, F→M, U→U) — `personSex`/`personSurname` is now passed through from `HourglassChart` to PersonModal, matching the behavior PersonPanel and the other two charts already had.

- feat(persons): "Skapa ny person" is now fully separated from event creation. The embedded "+ Skapa händelse" details section (event type / date / place / cause / citation) and its `prefillPlaceId` prop are removed from PersonModal — the modal saves only person fields. Events get added afterwards via the dedicated EventModal subpanel, matching how the rest of the app already worked. Reduces the modal's footprint, drops `DateInput`/`PlacePicker`/`CitationFields`/`suggestNextEventType`/`useSourceSession` from PersonModal's import surface.

- feat(persons): reorder the "Lägg till ny person" form fields to **Kön → Levande → Relationstyp → Namn**. Sex/living/subtype are decisions the user makes regardless of name; pulling them above the name input lets the modal communicate "what kind of person are we adding" before "what is their name", which matches the new son/dotter/okänt-first flow for children.

- feat(charts): the preferred-name (tilltalsnamn) marker is now visible in all three tree views (Hourglass / Pedigree / Descendant). Names render as multi-segment SVG `<tspan>` blocks with `text-decoration="underline"` on the preferred token — same visual cue the `PersonName` component already uses in lists and panels. New `wrapFullNameSegments()` helper in `chart-layout/measure.ts` returns wrapped lines as `NamePart[][]`, with `xml:space="preserve"` on the parent `<text>` so spaces between tokens render correctly.

- feat(relationships): RelationshipModal now labels the two PersonPickers as **Förälder / Barn** when the type is `parent_child` (instead of generic Person 1 / Person 2), so it's clear which person ends up as the parent and which as the child. Save now validates that both pickers are filled and that the two persons differ — previously the modal silently saved a relationship with `null` person IDs and the user had no feedback for an empty picker. Adds `relationships.parent` / `relationships.child` / `relationships.pickBothPersons` / `relationships.differentPersons` i18n keys.

- fix(persons): clicking a son/dotter/okänt button in child mode now auto-focuses the given-name input via `nextTick` so the user can start typing immediately. Previously the form fields appeared but focus stayed on the no-longer-rendered sex button, leaving the user typing into nothing until they clicked the input themselves.

- feat(persons): "Lägg till barn" now opens a son/dotter/okänt picker before the person form when adding a new person, so the child's sex is set up front (matches how the existing father/mother flows pre-fill sex from role). The "Ny person / Befintlig person" toggle is now visible from the very first frame of every "add related" flow so the existing-person path is reachable for child mode too. New i18n keys `persons.son` / `persons.daughter` (sv + en).

- feat(charts): father/mother outline placeholders are now hidden in the tree views (Hourglass / Pedigree / Descendant) when the person already has a real parent of that sex — the chart no longer invites a second father/mother where one already exists. Additional parents (step, foster, etc.) can still be added via the relationships panel.

- fix(persons): the cancel button and click-outside on the "Add father / mother / spouse / child" PersonModal now actually closes the modal. Previously only `@close` was wired up in PersonPanel and the three chart components, so clicking "Cancel" emitted an unhandled event and left the modal open. Added `@cancel` listeners alongside `@close` in `PersonPanel.vue`, `HourglassChart.vue`, `PedigreeChart.vue`, `DescendantChart.vue`.

- fix(i18n): rename couple subtype "Äktenskap" → "Gift" in Swedish — shorter, matches how genealogists actually phrase it on event cards ("gift med …").

- fix(quality): the entity-type chips in QualityView (Person / Plats / Media / Källa) now use the same theme-aware entity color tokens as the modal headers — set via `data-entity` instead of hardcoded fan-branch chart colors, so a Person chip matches PersonModal's indigo, a Place chip matches PlaceModal's cyan, a Source chip matches SourceModal's purple. Also fills in the gap by adding a new Media entity to the registry: `--entity-media-text/-bg/-border` (rose) in light/dark/HC modes, `[data-entity="media"]` alias, `media` added to `EntityType`/`ENTITY_META`/WCAG-test entity list (12 entities × 9 mode combinations now contrast-tested = 316 assertions).

- fix(panels): notes monospace toggle ("iWi") no longer overrides font size and weight, so it matches the surrounding "Notes" heading instead of bulging above it. Only the proportional/monospace `font-family` swap remains, which is the visual signal the toggle needs.

- docs(skills): document the single-field date-input pattern in `frontend-design`, `add-feature`, and the `CLAUDE.md` shared-components table. New rule: use `DateInput`/`SimpleDateInput` for any date entry — never roll separate Y / M / D inputs or a sibling calendar button.

- fix(modals): event/citation modals now open wider (default 480px) and the resize lower-bound no longer snaps to the full content height. The previous `minH = bodyEl.scrollHeight + chrome` defeated the body's `overflow-y: auto` — once the modal had grown to fit its content you couldn't pull it back below that "half empty" size, and the cramped 320px default left the source/place dropdowns clipped. Replaced with fixed `MIN_W=360`, `MIN_H=220`; `loadPos`/`loadSubPos` also clamp existing localStorage entries up to the new minimums so users with a saved-too-narrow width get bumped on next open.

- feat(citations): two-phase CitationModal. When opened from a panel without a preset source (PlacePanel, RelationshipPanel) the modal now starts in a "Choose a source" phase that shows only the source picker — the save button is hidden until a source is picked or created, so the primary action of the standalone flow is the first thing on screen. Once a source is set (either by phase A, by a preset from EventModal/SourcePanel, or by editing an existing citation), the modal switches to the citation fields (page, confidence, transcription, notes, date accessed) and renders the source as an entity-styled card at the bottom — clearly contextual rather than a form field. The card has ✎ to edit the source and (in standalone-create only) a "Change" button to step back to phase A. Pre-fill from `sourceSession.lastSourceId` still skips phase A on the common path.

- fix(forms): single-field date input — `DateInput` and `SimpleDateInput` now render `YYYY-MM-DD` in one monospace field with the calendar icon embedded on the right edge, matching the native `<input type="date">` look used elsewhere (e.g. citation "Date Accessed"). Replaces the previous Y / M / D split with separate calendar button. Partial dates (`1842`, `1842-03`) are still accepted; sizing/border/radius now match `.ep-input` for visual consistency in modals.

- fix(a11y): every row-level delete/unlink button now exposes an `aria-label` so screen reader / TTS mode announces what is about to be removed instead of staying silent on a bare `✕`. Added across `EventList`, `ResearchTasksTable`, `PersonIdentifiersSection`, `PersonMediaSection`, `EntityMediaSection`, `RelationshipsList`, `GroupsTable`, `LinkedPersonsSection`, `LinkedPlacesSection`, `LinkedMediaSection`, `SourcesView`, `PlacesView`, `PersonsListTab`, `MediaView` (gallery + table + viewer close), `QualityIssuesTable` (ignore/unignore toggle), and `DatabaseView` (clear tree subject). Most reuse the existing `a11y.deleteItem` template with the row's name/title/event-type as the item — destructive actions are no longer silent.

- fix(forms): unify input/select/textarea backgrounds across the app on the panel pattern (gray-rest `--surface-bg`, white-on-focus `--surface`, `--surface-border` borders). Modal forms previously rendered white-always while side-panel `.ep-*` inputs used the gray-rest pattern, and one-offs in `DateInput`/`SimpleDateInput`/`PersonPicker`/`SourcePicker`/`GroupPicker`/`MediaPicker`/`PersonDetailsSection`/`DatabaseView`/`CsvExportSection`/`HtmlSiteExportSection`/`AppInput` hardcoded `#ccc` borders or `--surface` backgrounds, breaking theme cohesion when a `DateInput` was dropped into a panel. All inputs now share a single resting tone and a consistent focus affordance. `MediaPanel.media-title-input` is intentionally exempt — it's an in-place title editor, not a form field.

- fix(a11y): align low-contrast UI elements with the high-viz token system. The sidebar count chip (`.error-badge`, e.g. open-task / quality-issue counts) now renders dark-red text on the soft `--error-bg` pink instead of inverting white-on-`--error-text`, which collapsed in dark/HC. AppButton's `soft` variant (e.g. PersonPanel "Fokusera") and the citation row reference link (`.entity-link`) now use `--color-link` instead of `--accent` — `--accent` is a button-background token and was failing AA when used as text on `--surface*`. Twilight gets an explicit `--color-link: #5343b8` so its purple accent doesn't break AA on muted surfaces in light mode. `wcagContrast.test.ts` now resolves `var(--…)` chains, pulls `:root` from `shared.css`, and adds three new pairs (`color-link` on surface / surface-bg / surface-hover) — 307 contrast assertions pass across all 9 theme×appearance combinations.

- fix(panels): drop the duplicate "+ X" action button from empty-state placeholders in side-panel sections (Events, Identifiers, Media). The section header above already renders the same "+ Händelse" / "+ Lägg till" / "+ Bifoga" button — showing it twice cluttered the empty state. `SectionEmpty` now shows the message only; the header button is the single entry point. Frontend-design skill updated with the rule.

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
