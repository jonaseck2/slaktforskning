# Changelog

## 0.271.0 — 2026-06-17

- feat: exporting (GEDCOM, website, or archive) now shows a live progress line while it runs, so a large export no longer looks frozen
- perf: GEDCOM export of large trees no longer runs a separate database query per person and event for notes, associations, and name/place translations — they are fetched in bulk up front (on a 22 000-person tree this removes ~150 000 tiny queries)
- fix: exporting GEDCOM from the app now respects the GEDCOM 7.0 choice and your export options, which were previously ignored

## 0.270.6 — 2026-06-17

- perf: editing data (a name, a date, a place) now updates the family-tree chart, lists, and panels right away even on databases with tens of thousands of people — the sidebar Quality and Duplicates badge counts no longer trigger a full-database scan on every edit (they refresh when you open those pages). Previously a single edit could take ~5 seconds to show up in the chart on a large tree.

## 0.270.5 — 2026-06-17

- fix: the search box no longer loses focus after each letter you type — you can type a query straight through without re-clicking the field

## 0.270.4 — 2026-06-14

- fix: the map in the Place Chronicle report no longer shows a dead blank box — it resolves the place location from the gazetteer (the same path the Places map uses) and always renders, centering a single place at a readable zoom

## 0.270.3 — 2026-06-14

- fix: searching the person list down to zero matches keeps the search box and shows a "no matches" message instead of the welcome screen, so you can refine or clear the search

## 0.270.2 — 2026-06-10

- perf: GEDCOM export fetches each table once instead of one query per person, event, and source
- fix: GEDCOM import no longer silently swallows real errors when linking associations and groups
- fix: media reorder and place photo buttons gain screen-reader labels; name badges now translatable
- test: the Repositories e2e suite is wired into the full tier (it was defined but never ran)

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

---

*Earlier release notes archived. See [docs/plans/archive/CHANGELOG.md](docs/plans/archive/CHANGELOG.md) for older entries; the complete per-milestone development history (commit-level detail, RCA write-ups, design rationale) lives in [docs/plans/archive/PLAN.md](docs/plans/archive/PLAN.md) and the git log.*
