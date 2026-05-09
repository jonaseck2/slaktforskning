# Duplicates Panel — Places, Sources, Media — design spec

> Pair with the `2026-05-09-duplicates-panel.md` implementation plan. This file is the design — what the user sees and why; the implementation plan is the build sequence.

## User goal

A genealogist who has imported the same data twice (a fresh GEDCOM export of an archive they already imported, two GEDCOMs from different cousins covering the same families, an old database merged with a new one) ends up with duplicate **places** ("Stockholm" + "Stockholm, Stockholms län"), duplicate **sources** ("Adolf Fredrik C:I:6, 1798-1812" entered twice with slightly different titles), and duplicate **media** (the same scan attached as two `media` rows). They want to find each pair, compare them side-by-side with full context, and merge them — same workflow they already use for persons. Today the `/duplicates` view shows only person duplicates; for the others the user has to spelunk through list views.

The destination state: `/duplicates` is the canonical landing page for *every* `DUPLICATE_*` quality-check row. Clicking a place duplicate, a source duplicate, or a media duplicate from the quality view (or from anywhere a `DUPLICATE_*` finding surfaces) lands on the same view, scoped to the right entity tab, with the right pair highlighted. Inside the tab the experience mirrors persons: list of candidate pairs (sorted by score), click a pair, side-by-side compare modal, choose target and merge.

## Scope

The pattern this design extends is "duplicate finding and merging." The destination has four tabs:

- **Persons** — exists today. No behavior change; included in the new tab shell.
- **Places** — net-new. `findDuplicatePlaces` + `mergePlaces`.
- **Sources** — net-new. `findDuplicateSources` + `mergeSources`.
- **Media** — net-new. `findDuplicateMedia` + `mergeMedia`.

**Scope deviations:**
- **Repositories.** Also a candidate (multiple "Stockholms stadsarkiv" entries are realistic). Out of scope here — the user pain is lower (repositories aren't displayed prominently in the chart, list, or panel) and the find-merge surface area mirrors sources almost exactly. Listed as a follow-up that can copy this shape.
- **Persons-and-relationships co-merge.** Already handled by the existing `mergePersons` API.

## CTAs and surfaces (against the surface contract)

The view is hosted on entity *type* (the tab is the host concept, not a row). The four checks from `CLAUDE.md`'s Surface contract apply:

1. **Host entity flows in.** Each tab is its own "surface." The compare modal opened from a tab receives the two candidate IDs **and** the tab's entity type — there is no risk of a "merge persons" modal opening from the places tab because each tab dispatches its own typed handler. ✅
2. **Title/handler match.** Each tab's row is a duplicate-pair row; clicking it opens a compare-and-merge modal scoped to that entity. The "Ignore" CTA on a row marks the pair as ignored — same as the persons tab today. The header has no "+ Add" CTA because adding new entities isn't what this view is for.
3. **Lifecycle visible from the surface.** Merge confirmation summary lists every related entity that will move from source → target (events, citations, media links, group_links, task_links). Ignore-and-undo: ignored pairs stay queryable via a "Show ignored" toggle so the user can undo a misclick. **Host-level lifecycle is N/A** — this view doesn't host a single editable entity; the danger-zone affordance lives on the entity's own panel.
4. **No silent state degradation.** Switching tabs does not refilter the persons list. Search/filter inside a tab queries both the live duplicate set *and* explicitly-ignored pairs (the toggle), never silently shrinking the queried set.

## Visual / UX shape

- View is `/duplicates`, route already exists. Replace its single-table body with a tab strip: Persons / Places / Sources / Media. Each tab loads its own list lazily.
- Each tab body is a list of pairs, mirroring `DuplicatesView.vue`'s current persons table: name(s) / score / last-seen-at columns adapted to the entity. For places: "Name" + "Parent path"; for sources: "Title" + "Author"; for media: "Title" + "File ref".
- Click a pair → compare modal modeled on `MergePersonsModal.vue`. Two columns side-by-side, every authored field listed, target/source toggle, "Merge into target" CTA at the bottom.
- Confirmation: a `ConfirmModal` summary names what will move (events, citations, links) before the merge runs. Mirrors the persons flow.

## Data model and API additions (for cross-reference)

Per-entity API additions (full spec in implementation plan):

- `findDuplicatePlaces(db, limit, offset)` — heuristic on normalized name + parent_place_id. Returns `DuplicatePlaceCandidate[]` with score.
- `mergePlaces(db, targetId, sourceId)` — moves events, citations, group_links, task_links from source → target; deletes source. Undoable (UndoAction).
- `findDuplicateSources(db, ...)` — heuristic on normalized title + author.
- `mergeSources(db, ...)` — moves citations, source_repositories from source → target.
- `findDuplicateMedia(db, ...)` — heuristic on file_ref equality + title similarity.
- `mergeMedia(db, ...)` — moves media_links, media_regions from source → target. If both rows have non-null `file_ref` pointing at the same file, the merge is a no-brainer; if they point at different files, the user must explicitly pick which file to keep (the unpicked file is deleted from the media folder).

All three new merge functions follow the same shape as `mergePersons` (in `src/api/duplicates.ts`). Reuse `recordIgnoredDuplicate` machinery.

## Verification (mirrors the implementation-plan verification)

1. **User-observable:** import a database that contains known duplicate places, sources, and media; navigate to `/duplicates`; switch through the four tabs; merge one pair in each non-persons tab; confirm the duplicate disappears from the list and the related events/citations/links now point at the surviving target.
2. **Quality-check landing:** trigger a `DUPLICATE_PLACE` finding from the quality run, click it; the duplicates view opens at the Places tab with the pair highlighted/scrolled-into-view.
3. **Per-merge integration test:** for each new merge function, set up a small fixture (target + source + 2 events + 1 citation + 1 link), call merge, assert source row gone, all related rows now reference target, undo restores the prior state.

## Failure modes / RCA reference

- **Polymorphic merge gotcha.** `mergePersons` had to remember to migrate every table referencing `persons.id`. The same trap exists for places (events, group_links, task_links, citations, parent_place_id self-reference), sources (citations, source_repositories), media (media_links, media_regions). Each merge function must enumerate its referencing tables in a comment and a unit test should grep `schema.ts` for foreign keys to assert nothing is missed. The implementation plan has a task for this enumeration.
- **Media file ownership.** When merging two media rows that point at *different* files on disk, the merge UI must force the user to pick one to keep. Silently deleting either is a Prime Directive violation; silently keeping both leaves an orphan file the user can't see. The compare modal handles this with an explicit "keep this file / discard this file" radio per side.
- **Ignored-pair model.** The existing `recordIgnoredDuplicate` table likely keys on `(entity_type, id1, id2)`. If it currently assumes `entity_type = 'person'`, the schema needs a generalization — call this out in the implementation plan as the first migration to land before the per-entity APIs.
