# Quality Checks Expansion — Design

**Date:** 2026-04-19
**Status:** design, awaiting implementation plan

## Goal

Expand the quality-check suite from its current person- and relationship-centric coverage to include places, media, sources, and cross-entity duplicates. 18 new checks total, organised so each result has a clear resolution path in the existing Quality view.

## Scope

### What this design covers

- 18 new check functions across 4 files
- File reorganisation: split location-heavy and quality-heavy files by entity and move a few existing checks to their natural home
- Row rendering tweak in `QualityIssuesTable` so duplicate rows link to each affected entity
- i18n keys for new check codes
- Unit test cases (≈30) following the existing `tests/unit/checks.test.ts` pattern

### What this design does NOT cover

- Locale-specific validators (Swedish personnummer, URL-shape heuristics)
- Auto-merge / auto-delete fix actions for duplicates
- A dedicated compare UI for non-person duplicates (tracked as v2 roadmap item — see below)
- Schema changes — none are required
- New MCP tools — checks surface only via the existing `run_checks` tool and the Quality view

## Existing state

Checks live under `src/api/checks/`:

- `check-utils.ts` — `CheckResult`, `CheckSeverity`, helpers (`personIdsWithEvent`, `isInvalidDate`, `haversineKm`)
- `checks-chronology.ts` — 8 person chronology checks
- `checks-relationships.ts` — 11 relationship/parenthood checks
- `checks-quality.ts` — 7 person data-quality checks + `ORPHANED_SOURCE`
- `checks-location.ts` — `SIMULTANEOUS_DISTANT_LOCATIONS`, `MEDIA_FILE_MISSING`, `checkGazetteerMatchQuality`
- `index.ts` — registers all checks via `getAllCheckFunctions()`, provides `runAllChecks`, `runChecksForPerson`, `runChecksForPlace`, `runChecksForMedia`

`CheckResult` fields already support arrays of IDs per entity type (`personIds`, `placeIds`, `mediaIds`, `sourceIds`, `eventIds`, `relationshipIds`), so duplicate checks can list all affected entities without a schema change.

`src/renderer/views/QualityView.vue` consumes results via `useQualityStore`, renders them through `QualityIssuesTable.vue`. Row click navigates to the first ID of the primary entity. `FIX_ACTIONS` maps specific codes to query-string actions (`add-birth-event`, `toggle-living`, etc.) on the person detail page.

`src/renderer/views/PersonsView.vue` already has a "possible duplicates" filter, backed by `find_duplicates`/`MergePersonsModal` for persons only. No analogous UI for places, media, or sources.

## Design

### File layout

Reorganise by **entity** for the new checks, while keeping the existing category-based files intact for the checks that naturally group by rule family.

- **New** `src/api/checks/checks-place.ts` — 4 place checks
- **New** `src/api/checks/checks-media.ts` — 4 new media checks + relocated `checkMediaFileMissing`
- **New** `src/api/checks/checks-source.ts` — 2 new source checks + relocated `checkOrphanedSource`
- **New** `src/api/checks/checks-duplicates.ts` — 5 cross-entity duplicate checks
- **Append to** `src/api/checks/checks-quality.ts` — 3 person data-quality checks
- `checks-location.ts` shrinks to just `checkSimultaneousDistantLocations` and `checkGazetteerMatchQuality`

Imports in `src/api/checks/index.ts` update accordingly; no change to the public `runAllChecks` / `runChecksForPerson` / `runChecksForPlace` / `runChecksForMedia` signatures. `runChecksForMedia` gains new results automatically because the per-media filter is based on `r.mediaIds`.

### Checks — Person (3 new, in `checks-quality.ts`)

| Code | Severity | Logic |
|------|----------|-------|
| `MULTIPLE_BIRTH_NAMES` | warning | `SELECT person_id FROM person_names WHERE name_type='birth' GROUP BY person_id HAVING count(*) > 1` |
| `PARTIAL_NAME` | notice | For each `person_names` row: `(given_name is null or empty) XOR (surname is null or empty)`. Emit one result per partial name row. |
| `LIVING_OVER_120` | warning | Persons with `living=1` whose earliest birth event year is > 120 years before today. Uses the same year-from-date helper already present in `checks-chronology.ts`. |

### Checks — Place (4 new, in `checks-place.ts`)

| Code | Severity | Logic |
|------|----------|-------|
| `ORPHANED_PLACE` | notice | Place not referenced by `events.place_id`, `citations.place_id`, `places.parent_place_id`, or `media_links (entity_type='place')`. |
| `CIRCULAR_PLACE_HIERARCHY` | error | In-memory walk from each place following `parent_place_id`; revisit → cycle. Report one result per cycle, listing the full cycle in `placeIds`. |
| `PLACE_COORDINATES_INVALID` | warning | `latitude NOT BETWEEN -90 AND 90 OR longitude NOT BETWEEN -180 AND 180 OR (latitude = 0 AND longitude = 0)`. The null-island case is separate because legitimate places never sit exactly at (0, 0). |
| `PLACE_DATES_INVERTED` | error | `date_from IS NOT NULL AND date_to IS NOT NULL AND date_from > date_to`. |

### Checks — Media (4 new + 1 relocated, in `checks-media.ts`)

| Code | Severity | Logic |
|------|----------|-------|
| `ORPHANED_MEDIA` | notice | `media.id NOT IN (SELECT DISTINCT media_id FROM media_links)`. |
| `MEDIA_REGION_OUT_OF_BOUNDS` | warning | `x < 0 OR y < 0 OR (x + width) > 1 OR (y + height) > 1`. |
| `PHOTO_AFTER_SUBJECT_DEATH` | warning | Join `media_regions.person_id → persons → death event` with `media_links (entity_type='event') → events.date_value`. Flag when any linked-event date is later than the tagged person's death date. Limitation: only catches media linked to events; floating media can't be dated. |
| `PHOTO_BEFORE_SUBJECT_BIRTH` | warning | Mirror of the above. Flag when a linked-event date is earlier than the tagged person's birth date. |
| `MEDIA_FILE_MISSING` (relocated) | warning | Existing check, unchanged. |

### Checks — Source (2 new + 1 relocated, in `checks-source.ts`)

| Code | Severity | Logic |
|------|----------|-------|
| `SOURCE_MISSING_TITLE` | warning | `title IS NULL OR title = ''`. |
| `ORPHANED_REPOSITORY` | notice | `repositories.id NOT IN (SELECT DISTINCT repository_id FROM source_repositories)`. Result carries `messageParams.name` and `messageParams.repositoryId`. `CheckResult` has no `repositoryIds` field today and repositories have no dedicated route, so the row is informational — not clickable. Adding `repositoryIds` / a repositories view is out of scope here. |
| `ORPHANED_SOURCE` (relocated) | notice | Existing check, unchanged. |

### Checks — Duplicates (5 new, in `checks-duplicates.ts`)

Each result lists **all** affected IDs (not just a pair), so the UI can render one link per entity.

| Code | Severity | Logic |
|------|----------|-------|
| `POSSIBLE_DUPLICATE_PERSON` | notice | Wrap `findDuplicates()` (already in `src/api/duplicates.ts`). One result per candidate pair, `personIds: [a, b]`, `messageParams.score`. |
| `DUPLICATE_IDENTIFIER` | warning | `SELECT identifier_type, identifier_value FROM person_identifiers GROUP BY identifier_type, identifier_value HAVING count(*) > 1`. `personIds: all sharing the identifier`. |
| `DUPLICATE_PLACE` | notice | `GROUP BY normalized_name, parent_place_id HAVING count(*) > 1`. `placeIds: all in group`. |
| `DUPLICATE_MEDIA` | notice | `GROUP BY file_ref HAVING count(*) > 1 AND file_ref IS NOT NULL AND file_ref != ''`. `mediaIds: all in group`. |
| `DUPLICATE_SOURCE` | notice | Two passes merged into one result list: (1) group by `url` where url is non-empty; (2) group by `(title, author, publication_info)` where all three are non-empty. De-duplicate results that match on both axes. `sourceIds: all in group`. |

### Registration

In `src/api/checks/index.ts`:

- Import the new entry points; update imports for relocated functions.
- Append the new checks to `getAllCheckFunctions()` in this order: person → place → media (new) → source (new) → duplicates.
- None of the new checks are `global: true`. All are O(N) or O(N log N) over a single table plus bounded joins, so they can safely run per-person and per-place.

### UI change — per-entity links on duplicate rows

`QualityIssuesTable.vue`'s entity column currently renders `entityLabel(r)` as a single non-clickable span. Change:

- When `r.code` starts with `DUPLICATE_` or is `POSSIBLE_DUPLICATE_PERSON`, render each ID in the primary-entity array as its own `<router-link>` using the matching name/title array (e.g., `placeIds[i]` with `placeNames[i]`). Separator: `, `.
- All other rows keep the current single-span rendering.
- Row `@row-click` still fires for non-duplicate rows. For duplicate rows we disable row-level navigation (clicking the whitespace does nothing) since there's no single target.

The row still shows the severity badge, entity-type badge, and message exactly as before. This is the minimal change that lets users reach each affected entity.

### i18n

Add 18 keys to `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts` under `quality.checks.*`. Message-parameter conventions:

- `{count}` for duplicate groups
- `{name}` / `{title}` for entity-specific messages
- `{date}` / `{deathDate}` / `{birthDate}` for photo-date checks
- `{path}` for media file paths

Swedish and English must cover all 18 codes. Match the tone of existing quality messages ("Källa \"{title}\" har inga källhänvisningar" — brief, declarative, no trailing punctuation).

### Tests

One test file per new checks file; extend the existing `tests/unit/checks.test.ts` for person checks.

- `tests/unit/checks-place.test.ts` — ≈8 cases covering positive and negative for each of the 4 checks, plus a cycle-detection test with a 3-node cycle.
- `tests/unit/checks-media.test.ts` — ≈10 cases (2 per check, plus explicit tests that floating media and media without tags don't trigger the photo-date checks). Relocate the existing `MEDIA_FILE_MISSING` case from `checks.test.ts`.
- `tests/unit/checks-source.test.ts` — ≈6 cases. Relocate the existing `ORPHANED_SOURCE` case.
- `tests/unit/checks-duplicates.test.ts` — ≈12 cases. Must assert that each duplicate result contains **all** affected IDs, not just the first two. Include a `DUPLICATE_SOURCE` test where a source matches both the URL pass and the (title, author, publication_info) pass to confirm dedup.
- Extend `tests/unit/checks.test.ts` with ≈6 cases for the 3 person checks.

Each test uses `createTestDb()` from `tests/unit/helpers.ts`.

### Performance

Estimate: all 18 new checks run in well under 1 second on a 10 k-person database. The duplicate checks are dominated by `GROUP BY` passes over small tables; `findDuplicates` is the heaviest and already runs in acceptable time today. `CIRCULAR_PLACE_HIERARCHY` is a single linear pass with an in-memory `Set` per start node — worst case `O(N)` total because memoisation prunes already-walked chains.

No new check is global, so none extend the existing per-person "skip expensive checks" carve-out.

## Out of scope — explicit

- Personnummer checksum validation
- URL-shape heuristics on sources
- Coordinates-far-from-parent check (requires gazetteer knowledge, future work)
- Hierarchy/type mismatch checks on places (requires `place_type` taxonomy work)
- Auto-merge / auto-delete fix actions
- A unified duplicates view

## Roadmap — follow-ups

**v2: Unified compare-and-merge UI for duplicates.** Today `PersonsView` has a duplicate filter and `MergePersonsModal` handles person merges. Places, media, and sources have no analogous UI. v2 should:

1. Extend the merge/compare UI to places, media, and sources (each needs its own merge-target semantics — e.g., media merge consolidates `media_links` and `media_regions`).
2. Make the merge UI the landing target for `DUPLICATE_*` check rows — clicking a row opens the compare view with the two (or more) entities pre-selected.
3. Consider a dedicated `/duplicates` route that aggregates all duplicate types and supersedes the per-entity filter pattern.
