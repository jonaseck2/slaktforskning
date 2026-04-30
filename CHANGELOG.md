# Changelog

## v0.162.6 — Bengt feedback round: labels, event-type cleanup, About menu

- fix(events): the "Källa (valfritt)" label is now just "Källa", "Orsak" reads "Dödsorsak" on death events, "Pension/Medborgarskap/Yrke" → "Pensionering / Nytt medborgarskap / Yrke/Anställning", and the "..." quick-pick button is labelled "Övriga händelser"
- fix(media): the notes section in the media panel is now titled "Bildtext"
- fix(events): "Dop" no longer appears twice — `baptism` and `christening` collapse to a single `christening` type, with a one-shot migration for existing rows and updated GEDCOM/Genney importers
- fix(events): adding a new event no longer pre-selects a type when smart defaults are off
- fix(events): editing an existing event shows a soft warning if you change its type — registration data may be inconsistent
- fix(events): the "Övriga händelser" dropdown shows only types not in the quick row, and starts blank
- fix(main): production launch no longer auto-opens the DevTools panel
- feat(menu): Help → About OurLegacy shows the live version with a GitHub link

## v0.162.5 — Polymorphic link helpers

- refactor(api): consolidate "get linked entities" SQL queries into 2 helpers — internal only

## v0.162.4 — Website export

- fix(website-export): static site no longer ships broken-image entries for media whose source files are missing

## v0.162.3 — Stale-load race fix

- fix(panels): rapidly switching between entities no longer leaves a panel showing stale data
- fix(static-export): exported sites opened over `file://` no longer flood DevTools with CORS, Leaflet, and router errors

## v0.162.2 — Website export polish

- fix(website-export): media list footer reads "Mediaregistret" instead of mislabeled "Personregistret"
- fix(website-export): preview-iframe media truncation now explained where the truncation happens

## v0.162.1 — Preload regression fix

- fix(build): startup OOM caused by preload bundle pulling in the full api layer

## v0.162.0 — IPC channel registry

- refactor(ipc): one `defineChannel` entry replaces synchronized edits across main / worker / preload — internal only

## v0.161.0 — Live preview iframe

- feat(website-export): export view now renders the actual static site in an iframe, with inlined photo thumbnails and the editor's tree subject as the landing page

## v0.160.0 — Component inspector

- feat(dev): hold-Alt component & i18n inspector for describing UI to Claude (dev mode only)

## v0.159.0 — Auto-refresh export preview

- feat(website-export): right panel is a flat list of collapsible sections; live preview auto-refreshes on field changes

## v0.158.7 — Last-route restore

- fix(router): reload no longer always lands on Persons; the last route is restored before the redirect can clobber it

## v0.158.6 — Place resolver

- fix(gazetteers): "California, USA" resolves to the state, not a tiny CDP of the same name

## v0.158.5 — Panel collapse-tab alignment

- fix(panels): every panel and list column reserves the same slot for its `▶`/`◀` collapse tab

## v0.158.4 — Media list infinite scroll

- fix(media): left list column infinite-scrolls on its own instead of bottoming out at the gallery's page size

## v0.158.3 — Media gallery aspect

- fix(media): gallery cards use a portrait 1:1.35 thumbnail that scales with column width

## v0.158.2 — Media gallery face crop

- fix(media): gallery cards bias the photo crop toward the top so faces stay visible

## v0.158.1 — Selected card scroll-into-view

- fix(media): selecting a media item scrolls both the list and the gallery so it stays visible

## v0.158.0 — Collapsible side panels everywhere

- feat(panels): every right-side panel gains a `▶` collapse tab on its left edge (was: PersonPanel only)
- feat(panels): PlacesView gets the matching `◀` reopen button it was missing
- feat(panels): Reports/Prints panels can now fully collapse

## v0.157.10 — Permanent media list

- feat(media): MediaView always shows a left-side list column with collapse tab and resize handle, alongside the gallery
- fix(media): search filter moves into the list column; right MediaPanel is now collapsible

## v0.157.9 — Top-bar search picker

- fix(nav): horizontal top-bar search uses the same PersonPicker typeahead as the sidebar

## v0.157.8 — Tree subject vs. selected person

- feat(persons): rename "focus person" to "tree subject" and split the role from panel selection — clicking a person opens their panel without re-rooting the tree
- feat(persons): "🌳 Set as tree subject" is the only action that changes the chart's root

## v0.157.7 — Square avatars, face-cropped tree photos

- feat(avatars): every profile picture is a rounded square matching the tree-box style
- feat(charts): tree boxes show the same face-cropped photo the avatars use; untagged media falls through to sex-coloured initials

## v0.157.6 — Consistent face-tag styling

- refactor(media): face-tag boxes look identical in the viewer and in reports

## v0.157.5 — Panel close button alignment

- fix(panels): the × in PersonPanel and MediaPanel now lines up with the panel title

## v0.157.4 — Consistent panel close buttons

- fix(panels): every side panel shares one close-button style anchored top-right
- fix(persons): "🌳 Show in tree" moves to the dates row in PersonPanel
- fix(media): MediaPanel renames the open-viewer button to "View" and moves it to the format row

## v0.157.3 — Sidebar PersonPicker

- feat(nav): sidebar search replaced with a PersonPicker that opens a person's panel without re-rooting the tree
- fix(nav): remove the "Fokusperson" label above the sidebar

## v0.157.2 — Restore separate selected vs. focal person

- fix(persons): clicking in the tree opens the panel without re-rooting; only "🌳 Show in tree" refocuses the chart

## v0.157.1 — Sex-typed child placeholders

- fix(charts): "+ Barn" outline split into "+ Son" and "+ Dotter" in all three tree charts; clicking either pre-fills sex

## v0.157.0 — Modal context in headings

- feat(modals): entity-modal headings state who or what you're working on (e.g. "Birth of John Doe", "Marriage of John & Jane", "New place in Stockholm")

## v0.156.5 — Report panel slider caps

- fix(reports): Hourglass and Descendant generations sliders go up to 20, matching the tree view's `+` button

## v0.156.4 — Draw face tag opens viewer

- fix(media): clicking "Draw" on the Face Tags section opens the media viewer so the box can be drawn immediately
- fix(media): Face Tags section moves directly after Linked Persons

## v0.156.3 — Consolidated avatars

- refactor(avatars): every profile picture in the app uses the same face-cropped image source and updates automatically when face tags or media order change

## v0.156.2 — Drop the stored "living" flag

- fix(persons): living/deceased is now derived (no death event AND birth within last 120 years) — the Living/Deceased toggle is removed from PersonModal
- **breaking**: Genney persons marked deceased without a death event now appear as living after import — add a death event to mark them deceased

## v0.156.1 — Click-to-refocus tree

- fix(charts): clicking a person in the tree refocuses the chart, syncs the sidebar, and shows the panel — all in one click

## v0.156.0 — Drop chart hover tooltip

- fix(charts): remove the floating hover tooltip from Pedigree / Hourglass / Descendant — names are already legible inside boxes

## v0.155.4 — Marriage events: pick second person

- feat(events): marriage / wedding / engagement / divorce events from a person panel offer a partner picker (existing partners suggested, free PersonPicker for anyone else, "+ Add new person" inline)

## v0.155.3 — Birth events: optional baptism

- feat(events): birth events include optional Dopdatum + Faddrar fields — a separate baptism event is created when filled

## v0.155.2 — Add child: pick the other parent

- feat(persons): adding a child shows an "Other parent" picker; with one partner they're auto-selected, with multiple all are listed plus "None"

## v0.155.1 — Partner sex defaults to opposite

- feat(persons): when adding a partner from a tree view, sex defaults to the opposite of the focused person's sex (M→F, F→M, U→U)

## v0.155.0 — PersonModal no longer creates events

- feat(persons): "Create new person" is fully separated from event creation — events are added afterwards via EventModal

## v0.154.5 — Reorder add-person fields

- feat(persons): new-person form is now Sex → Living → Relationship type → Name

## v0.154.4 — Preferred name underline in trees

- feat(charts): preferred-name marker is visible in all three tree views, matching lists and panels

## v0.154.3 — Parent/child labelled relationship pickers

- feat(relationships): RelationshipModal labels its pickers as Parent / Child for `parent_child` type
- fix(relationships): saving validates both pickers are filled and different — was silently saving nulls

## v0.154.2 — Auto-focus child name input

- fix(persons): clicking a son/dotter/unknown button auto-focuses the given-name input

## v0.154.1 — Add child: pick sex up front

- feat(persons): "Add child" opens a son/dotter/unknown picker before the person form
- feat(persons): "New / Existing person" toggle visible from the first frame in every "add related" flow

## v0.154.0 — Hide redundant parent placeholders

- feat(charts): father/mother outline placeholders hidden when the person already has a real parent of that sex

## v0.153.1 — Cancel actually closes Add Related modals

- fix(modals): the cancel button and click-outside on Add father / mother / spouse / child now close the modal

## v0.153.0 — Swedish couple-subtype rename

- fix(i18n): "Äktenskap" → "Gift" in Swedish

## v0.152.4 — Theme-aware quality chips

- fix(quality): entity-type chips use the same theme-aware colors as modal headers; new Media entity color (rose)

## v0.152.3 — Notes monospace toggle

- fix(panels): notes monospace toggle ("iWi") only swaps font-family — no more bulging above the heading

## v0.152.2 — Wider event/citation modals

- fix(modals): event and citation modals open at 480px and can be resized below the content height

## v0.152.1 — Two-phase citation modal

- feat(citations): CitationModal opens on "Choose a source" when no source is preset; once picked, the source renders as an entity-styled card

## v0.152.0 — Single-field date input

- feat(forms): DateInput renders YYYY-MM-DD in one monospace field with the calendar icon embedded on the right edge — partial dates (`1842`, `1842-03`) still work

## v0.151.3 — Accessible delete buttons

- fix(a11y): every row-level delete/unlink button now has an `aria-label` so screen readers announce what is about to be removed

## v0.151.2 — Unified input styling

- fix(forms): all inputs across modals and panels share one resting/focus look

## v0.151.1 — High-contrast count chips

- fix(a11y): sidebar count chips, soft-button variant, and citation reference links now meet AA in dark and high-contrast modes

## v0.151.0 — Cleaner empty states

- fix(panels): empty-state placeholders drop the duplicate "+ X" button — the section header is the single entry point

## v0.150.4 — Print-safe chart reports

- fix(reports): chart report previews hide zoom controls, drop the timeline-marker text halo, and stop picking up dark / high-contrast surface colors
- fix(reports): long person names in the timeline report no longer clip at the SVG's left edge

## v0.150.3 — Narration coverage

- feat(a11y): Source / Group / Media pickers, modal headers, and the MediaViewer narrate to screen readers
- feat(a11y): face tag regions are keyboard-focusable

## v0.150.2 — Theme-aware entity colors

- feat(theming): per-entity colors flip with appearance and theme automatically; entity color regressions fail CI

## v0.150.1 — Side-panel table polish

- fix(panels): hide column headers on side-panel tables (avatar + name link is self-evident)
- fix(panels): drop fixed table layout that was squashing identifier / relationship / media / task tables

## v0.150.0 — Unified panel shell

- refactor(panels): all 8 entity side panels share one shell with consistent header padding and full-height close buttons
- fix(panels): PersonPanel and MediaPanel gain a close button they were missing
- fix(panels): MediaPanel and ReportPanel persist section state across reloads

## v0.149.0 — Multi-entity tasks and groups

- feat(tasks/groups): research tasks and groups can now link to multiple persons, places, and media items (was: tasks → 1 person, groups → persons only)

## v0.148.0 — Nav rename

- feat(nav): "Research Tasks" → "Tasks" / "Uppgifter"
- feat(reports): "Framable prints" → "Charts" / "Diagram"

## v0.147.x — Static export polish

- feat(website-export): PersonPanel, PlacePanel, and MediaPanel are back in the static export, with add/edit/delete affordances gated on readonly
- fix(website-export): static site shows charts, maps, and media; CartoDB Voyager tiles work over `file://`
- fix(website-export): gazetteer-resolved coordinates baked into the snapshot so places appear on the map
- feat(website-export): privacy option to drop media that's only attached to events / places / sources / relationships
- fix(charts): zoom controls and click-to-select work in readonly mode (navigation, not editing)
- fix(map): backdrop uses the surface color, no surrounding border
- feat(media): viewer previews the report-style caption ("From left: …" + notes) under the picture

## v0.146.0 — App-look website export

- feat(website-export): export now produces a read-only Vue SPA that visually matches the application — same sidebar, design tokens, detail layouts, minus editing
- feat(website-export): focus-person + N ancestor / M descendant scope filter
- feat(website-export): living-person privacy controls (exclude or redact to decade)
- feat(website-export): pre-rendered keepsake reports and frameable chart prints in the bundle
- fix(website-export): no longer locks up on libraries with thousands of media files

## v0.145.0 — Universal side panels

- feat(panels): every entity-list view (persons, relationships, sources, places, groups, research tasks) hosts its own resizable side panel
- feat(panels): new SourcePanel, RelationshipPanel, GroupPanel, ResearchTaskPanel
- feat(routing): `:id` routes navigate to the list view with the panel pre-selected
- chore: removed all DetailView components — editing happens through modals from inside panels

## v0.144.0 — Split Present nav

- feat(nav): Present section now has Reports (keepsake), Framable prints, and Website as separate items
- chore: HTML site export removed from Import / Export tabs

## v0.143.0 — Universal entity-panel modals

- feat(modals): every modal uses BaseSubPanel with `mode='standalone'|'subpanel'`
- feat(modals): new LinkRuleModal, PersonIdentifierModal; add-related-person folded into PersonModal
- feat(citations): CitationModal supports inline source picking when no source is preset

## v0.142.x — Modal redesign and panel polish

- feat(modals): unified PersonModal / EventModal / CitationModal / SourceModal replace AddPersonModal / EventForm / CitationForm
- fix(panels): PlacePanel no longer reloads when switching list↔map
- fix(modals): standalone BaseSubPanel simplified; dropdowns capped at 5 results

## v0.141.x — Nav and focal defaults

- feat(nav): Sources and Relationships moved to Review, Reports moved to Present
- fix(persons): visualization focal person reads `default_person_id` setting before falling back to first person
- fix(modals): AddResearchTaskModal shows PersonPicker when opened without a pre-passed personId
- fix(charts): descendant and hourglass connectors share one horizontal segment height per generation
- fix(media): empty state gains an "Attach media" action button

## v0.141.0 — Independent fan chart settings

- feat(reports): Your Ancestors panel gets a dedicated "Fan Chart" section with independent arc span, color mode, and generation limit
- feat(reports): ancestor pages can go up to 10 generations independently of the embedded fan chart

## v0.140.0 — Empty states + chart outline fixes

- feat(ui): two-tier empty state system — `SectionEmpty` for in-section, `AppEmptyState` for full-view
- fix(charts): pedigree and descendant placeholder children no longer affect real-node placement
- fix(map): always renders the map; "no places" / "no matches" become floating pill overlays
- fix(modals): titles read "Add [Entity]"
- fix(i18n): standardised Swedish "plats", "Hänvisning" for citations, "Forskningsuppgift" for tasks
- fix(quality): checks defer 1500ms after navigation to avoid contention with main data load

## v0.139.0 — Multilingual historical gazetteer

- feat(gazetteers): "Sovjetunionen", "Sowjetunion", "União Soviética" etc. now resolve correctly via all-language Wikidata translations for ~1,391 historical entities

## v0.138.0 — Your Ancestors photos

- feat(reports): Photos checkbox in Your Ancestors actually renders per-ancestor photo pages (was silently ignored)
- feat(reports): Captions and Photo Notes checkboxes added

## v0.137.x — Report and print fixes

- fix(reports): anchor links no longer trigger Vue Router warnings
- feat(reports): fan chart segments scroll to matching ancestor section on click
- fix(reports): map previews are static (no pan/zoom)
- fix(print): chart colors now appear when printing
- feat(reports): ReportPanel replaces ChartExportControls; ReportsView is panel + preview with drag handle
- fix(reports): keepsake PDF right margin no longer cropped
- fix(reports): framable prints tab labels match visualization chart names

## v0.136.5 — Timeline chart improvements

- fix(timeline): tick labels below axis with mirrored top axis above
- fix(timeline): today label and event markers no longer clip
- fix(timeline): per-event marker tooltips
- fix(timeline): tooltip width adapts to long names; height grows with event count
- fix(timeline): birth/death year labels inline with symbol

## v0.136.x — Build, install, CI

- fix(build): downgrade `@electron/fuses` to satisfy Forge peer dep
- fix(make): comment out Linux RPM/DEB makers (incompatible with rpmbuild on Debian trixie)
- fix(ci): e2e smoke timeout 30s → 90s
- feat(mcp): `search_persons` gains optional `limit` parameter (1–200, default 20)

## v0.135.x — Devcontainer and release workflow

- fix(devcontainer): `xvfb-start.sh` exports `DISPLAY=:99` so `source` works
- fix(devcontainer): postCreateCommand chowns `~/.claude` for named-volume permissions
- fix(ci): claude.yml uses `claude_code_oauth_token` for Claude Max compatibility
- fix(ci): release workflow compares against the last git tag instead of `HEAD~1`
- feat(reports): ReportsView uses the standard paneled layout with drag-resize ReportPanel

## v0.132.0 — Cropped face-tag profile pictures

- feat(avatars): every avatar shows a person's starred face tag as a cropped square — no new media blobs, computed at render time and cached per person
- feat(avatars): live updates when tags are starred, reassigned, reordered, or unlinked

## v0.131.0 — Keepsake reports redesign

Reports view rebuilt around family-facing keepsake narratives.

- feat(reports): **A Life** — life map, visual timeline, family, events, notes, photos, sources appendix
- feat(reports): **A Marriage** — dual life map, shared timeline, couple, children grid, narrative, photos
- feat(reports): **Place Chronicle** — boundary map, persons, events, description, photos, child places
- feat(reports): **Your Ancestors** — fan chart cover, full-page fan, per-ancestor pages, surname index
- feat(reports): **Life on One Page** — single framable sheet
- feat(reports): **Family in Year X** — snapshot of everyone alive in a target year
- feat(reports): **Photo Album** — chronological media gallery (person / couple / place / all)
- chore(reports): removed Individual Summary and Family Group Sheet (use A Life / A Marriage); tabular Ancestor Sheet replaced by Pedigree Print
- feat(reports): new `researcher_name` setting for "Compiled by …" attribution
- feat(privacy): identifiers always hidden for living persons; per-report "Redact living persons" toggle replaces birth year with decade
