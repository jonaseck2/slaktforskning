# GEDCOM lossless: groups + group_links via custom `_GROUP` records

> Subagent dispatch: use `subagent-handoff`.

## User goal

A genealogist who organizes their tree using **groups** ("Maternal grandfather's emigrant cousins", "People I still need to verify", "Photos from the 1920 reunion") can export the database to GEDCOM, re-import it, and find every group and every group membership intact. Today both `groups` and `group_links` rows are dropped on export — the user is told via `ExportReport.excluded` (so the failure isn't silent), but the data is still gone, and a user who relied on groups for navigation has to rebuild them after every offboarding round-trip.

## Scope

The pattern this plan introduces is "carry an entire entity that has no GEDCOM equivalent via a top-level `_`-prefixed custom record + per-link sub-records." Full enumeration:

- `groups` table (id, name, notes) — top-level `_GROUP` record carrying name + notes.
- `group_links` table (id, group_id, entity_type ∈ person/place/media, entity_id, sort_order) — `_GROUP_LINK` sub-record under each `_GROUP` referencing the host entity by xref. Entity type is encoded in the sub-record kind so a person link, a place link, and a media link are visibly distinct in the file.

**In scope:** both tables, both v551 and v70. The custom tag is identical across versions; both 5.5.1 and 7.0 tolerate `_`-prefixed top-level records.

**Scope deviations:**
- `groups.created_at` stays excluded (audit timestamp). Already covered by `AUDIT_TS_EXCLUDED`.
- `group_links.created_at` same.
- `group_links.sort_order` rides along — emit position drives import position; if the registry already declares this lossy, promote it as part of this plan since the new format makes it trivially lossless.

## Verification

1. Per-field round-trip via the fidelity harness. After this plan, every non-audit `groups.*` and `group_links.*` entry is `lossless-via:_GROUP` (or `_GROUP_LINK`) and the harness exercises round-trip for each.
2. Golden-DB-seed test: seed two groups with three persons + one place + two media items each, round-trip, assert DB equivalence on the entire `groups` and `group_links` tables.
3. **User-observable:** open a real database with active groups; export to GEDCOM; re-import into a fresh database; navigate to the groups view — every group reappears with the same members, in the same order.

## Failure modes / RCA reference

- The current registry text reads "groups have no GEDCOM 5.5.1 representation" — that's the carrier-not-wired version of the truth, not a real spec limit. Custom records are explicitly allowed by the GEDCOM 5.5.1 spec (Appendix A: "user-defined tags") and 7.0 has formal extension-tag rules. Don't take the registry's current "no representation" wording at face value.
- **Polymorphic entity_id:** `group_links.entity_id` references persons, places, or media depending on `entity_type`. The exporter must emit GEDCOM xrefs that point into whichever entity the link targets; the importer must resolve those xrefs back into entity ids. Use the existing exporter's xref map (the `INDI`/`PLAC`/`OBJE` xref tables built during phase 1 of export) — do not invent a parallel mapping.
- **ExportReport.excluded must drop these entries** once they're no longer excluded. Failing to update the export report would leave the user thinking groups were dropped when they weren't.

## Tasks

### Task 1: Exporter — emit `_GROUP` records

**Files:** `src/gedcom/exporter.ts`, `tests/unit/gedcom.test.ts`

- [ ] After the standard records are written (HEAD, INDI, FAM, OBJE, PLAC, SOUR, REPO, NOTE, TRLR is last), insert a new emit phase before TRLR that walks `groups` rows. For each group, emit:
  ```
  0 @G001@ _GROUP
  1 NAME <group.name>
  1 NOTE <group.notes>
  ```
  Allocate xrefs `@G001@`, `@G002@` … via the existing xref-allocator pattern (used by INDI, FAM, etc.).
- [ ] Inside each `_GROUP` block, walk the group's `group_links` rows ordered by `sort_order`. For each link, emit a sub-record naming the entity host:
  ```
  1 _GROUP_LINK
  2 TYPE person|place|media
  2 REF @I042@   (or @P017@, @M005@)
  ```
  The xref must resolve to the same record in the file (the importer relies on the existing xref maps to dereference).
- [ ] Update `ExportReport.excluded` so that groups and group_links are no longer reported as excluded. The previously-emitted excluded message goes away once `_GROUP` is emitted.
- [ ] Unit test: export a database with two groups (each with mixed-type members) and assert the GEDCOM output contains `0 @G001@ _GROUP`, `1 NAME …`, the right number of `1 _GROUP_LINK` blocks, and resolved xrefs to the right hosts.

### Task 2: Importer — read `_GROUP` records

**Files:** `src/import/gedcom/groups.ts` (new file in the import pipeline) or extend an existing phase

- [ ] Add a new import phase that runs after persons, places, and media (so xrefs resolve). For each top-level `_GROUP` record:
  - Insert a `groups` row with `id` = freshly-generated UUID, `name` = the NAME child, `notes` = NOTE child (CONT/CONC unwrapped).
  - For each `_GROUP_LINK` sub-record, resolve `REF` against the appropriate xref map (`person` → INDI map, `place` → PLAC map, `media` → OBJE map). Skip links whose xref doesn't resolve and surface them via `ImportReport.warnings` (don't silently drop).
  - Insert a `group_links` row using the resolved entity id and the link's emit position as `sort_order`.
- [ ] Wire the new phase into the import pipeline at the right place.
- [ ] Unit test: import a hand-crafted GEDCOM with two `_GROUP` records and verify the DB has two `groups` rows and the expected number of `group_links` rows pointing at the right entities.

### Task 3: Registry promotion + bump

**Files:** `src/api/gedcom_fidelity_registry.ts`, `tests/unit/gedcom-fidelity-registry.test.ts`

- [ ] Promote every non-audit `groups.*` and `group_links.*` entry from `lossy` to `lossless-via:_GROUP` (or `_GROUP_LINK` for sub-record-carried fields). Include `group_links.sort_order` in the promotion if currently lossy.
- [ ] Run the fidelity harness; all per-field round-trip cases for groups + group_links pass.
- [ ] Run the golden-DB-seed test; full DB equivalence for the `groups` and `group_links` tables.
- [ ] Minor bump (this is a feature: round-trip-fidelity capability that didn't exist).
- [ ] CHANGELOG `## Unreleased`: "GEDCOM round-trip: groups and group memberships are now preserved via custom `_GROUP` / `_GROUP_LINK` records under both 5.5.1 and 7.0."
- [ ] Update PLAN.md (remove backlog block); append archive PLAN.md entry.
- [ ] `git mv` plan + sibling design (none here) to archive.
- [ ] Final commit + merge.
