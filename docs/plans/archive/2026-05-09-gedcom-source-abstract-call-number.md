# GEDCOM lossless: sources.abstract + sources.call_number via `_ABSTRACT` / `_CALL`

> Subagent dispatch: use `subagent-handoff`.

## User goal

A genealogist who fills in a source's **Abstract** ("Photographic copies of the Stockholm city archive's parish records, microfilmed 1987–1992") or **Call number** ("KA-SE-SSA/0001/F-IIa-7-1843") in the source modal can export the database to GEDCOM and re-import it — anywhere — and find both fields still attached to the source. Today both fields silently disappear; the registry says so explicitly.

## Scope

Two columns on the `sources` table that are flagged `lossy` in the registry under both v551 and v70 because the exporter never wired tags for them:

- `sources.abstract` (TEXT) — long-form description of what the source contains.
- `sources.call_number` (TEXT) — repository-issued shelf/microfilm/box identifier.

**In scope:** both columns, both GEDCOM versions. Promote `lossy` → `lossless-via:_ABSTRACT` / `lossless-via:_CALL`.

**Scope deviations:** `repositories.call_number` is a separate column (different table) flagged with the same problem. Out of scope here — call it out for a follow-up because the repository emit path lives in a different exporter phase and the carrier tag (under REPO) differs from the one under SOUR. Tracked in PLAN.md as a related backlog row to keep this plan focused.

## Verification

1. **Per-field round-trip test:** registry entries for both columns become `lossless-via:_ABSTRACT` and `lossless-via:_CALL`; harness exercises them.
2. **Golden-DB-seed test:** seed a source with a known abstract and call_number, round-trip, assert equality.
3. **User-observable:** type both fields in the source modal, export, re-import into a fresh database, reopen the source — both fields show their typed values.

## Tasks

### Task 1: Exporter

**Files:** `src/gedcom/exporter.ts`, `tests/unit/gedcom.test.ts`

- [x] Inside the SOUR emit block, after the existing AUTH/TITL/PUBL lines, conditionally emit:
  ```
  1 _ABSTRACT <source.abstract>
  1 _CALL <source.call_number>
  ```
  Each line guarded by truthy/non-empty check.
- [x] Long abstracts may need CONT continuation lines; reuse the existing exporter helper that wraps NOTE values (look for the function the exporter uses for `NOTE` long-text emission — same pattern applies here).
- [x] Unit test: export a source with both fields set; assert both lines appear with the right level and value (long abstract: assert CONT continuation rebuilds correctly).

### Task 2: Importer

**Files:** `src/import/gedcom/source.ts` (or equivalent SOUR-record phase)

- [x] In the SOUR-record import phase, look for `_ABSTRACT` and `_CALL` children. Copy their joined value (CONT/CONC unwrapping via the existing helper) into `source.abstract` and `source.call_number`. If absent, leave null.
- [x] Unit test: import a SOUR record with both custom tags; assert both columns hold the expected values.

### Task 3: Registry + bump + archive

- [x] Promote both registry entries to lossless-via.
- [x] Run the fidelity harness; both per-field round-trip cases pass.
- [x] Patch bump, CHANGELOG entry, archive plan, update PLAN.md.
