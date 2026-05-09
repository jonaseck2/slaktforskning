# Archive (.zip) round-trip fidelity registry + tests

> Subagent dispatch: use `subagent-handoff`.

## User goal

A genealogist who exports their database to a `.zip` archive (the app's "Export → Archive" flow, which bundles the SQLite DB plus the `<dbname>-media/` folder) and re-imports it — into the same app, a fresh install, or an upgraded version — gets every authored field back, byte-for-byte, with no silent loss. Today only the GEDCOM round-trip is mechanically guarded (registry + per-field harness + golden-seed test); the archive path has no equivalent enforcement, so a future schema change or refactor of `archive.ts` could silently start dropping authored data and CI would not catch it.

## Scope

The pattern this plan introduces is the second instance of the GEDCOM fidelity-registry pattern — same shape, different format. Full enumeration of the artifacts the registry pattern must cover:

- **GEDCOM 5.5.1 / 7.0** — registry exists at `src/api/gedcom_fidelity_registry.ts`. Already in scope of the Prime Directive.
- **Archive (.zip)** — registry **does not exist**. **In scope: this plan.**

**Scope deviations:**
- The static SPA / website export is read-only consumption, not a round-trip target — out of scope by definition.
- Per-format granularity is preserved: an `archive_fidelity_registry.ts` is a separate file from the GEDCOM registry, with its own per-field status. A field can legitimately be lossless under archive while lossy under GEDCOM (e.g. `groups` is currently lossy in GEDCOM but trivially lossless in archive because the SQLite file rides intact). The schema-introspection test must assert *each* registry has an entry for *every* column.

**Out of band:** the archive importer/exporter functions don't change as part of this plan — the working hypothesis is that they're already lossless (the SQLite DB and the media folder are bit-for-bit copied). This plan is the *enforcement mechanism* — if the test reveals an existing leak, that leak gets a separate fix-plan.

## Verification

1. **Schema introspection test** asserts every `(table, column)` pair has an entry in `archive_fidelity_registry.ts`. Adding a column to `src/api/schema.ts` without a registry entry breaks CI for the archive registry the same way it already breaks CI for the GEDCOM registry. This is the Prime Directive's mechanical guard.
2. **Per-field round-trip test:** for every non-excluded entry, the harness seeds the column → exports the database to a temp `.zip` → re-imports into a fresh DB → asserts the column equals the seeded value (or matches a registry-declared lossy expectation).
3. **Golden-DB-seed round-trip test:** seed a comprehensive multi-table DB (re-use the existing GEDCOM golden-seed helper if it's format-agnostic, or write a parallel one), export → re-import, assert DB equivalence on every non-excluded table.
4. **Negative-case smoke check:** introduce a deliberate "drop column on import" mutation in the archive importer (in a throwaway branch, never landed) and verify the per-field test detects the regression. Then revert. This is the test of the test — proving the harness has teeth.

## Failure modes / RCA reference

- The GEDCOM registry was added because the user couldn't tell what the import path silently dropped. The archive path has the same failure mode latent — it just hasn't been exercised because nobody's audited it. Don't assume "the SQLite file rides intact" implies "every column round-trips" until the harness says so.
- **Helper sharing:** much of the helper infrastructure in `tests/helpers/gedcom_fidelity.ts` is format-agnostic (seed a column, then run the format's export+import, then read the column). Refactor so the helper takes an `(exporter, importer)` pair and the per-format harness wires it up. **Do not duplicate the helper.** A common copy-paste-shaped failure would be the GEDCOM and archive harnesses drifting in how they verify column equality; fight that by sharing.
- **Archive contains both DB and media folder.** The registry pattern only covers DB columns; media file integrity (does the .jpg byte-match after round-trip?) is a separate concern. Flag in the spec section that media-file fidelity is out of scope for this plan and worth a follow-up sized similarly.

## Tasks

### Task 1: Refactor shared fidelity-test helper

**Files:** `tests/helpers/gedcom_fidelity.ts` (rename → `tests/helpers/fidelity.ts`), update GEDCOM tests to import from new location.

- [ ] Identify the format-specific entry points in the existing helper (likely a function like `roundTripField(db, table, column)` that calls `exportGedcom` then `importGedcom`). Extract those into a `FidelityFormat` interface:
  ```typescript
  interface FidelityFormat {
    name: 'gedcom-5.5.1' | 'gedcom-7.0' | 'archive';
    export: (db: Database) => Buffer | string;
    import: (data: Buffer | string, freshDb: Database) => void;
  }
  ```
- [ ] Rewrite the helper to take a `FidelityFormat` argument so the same code drives both GEDCOM and archive harnesses.
- [ ] Update the existing GEDCOM tests to pass a `gedcom-5.5.1` / `gedcom-7.0` format object. Verify all existing GEDCOM fidelity tests still pass.

### Task 2: Define archive_fidelity_registry.ts

**Files:** `src/api/archive_fidelity_registry.ts` (new)

- [ ] Mirror the structure of `gedcom_fidelity_registry.ts`. For every `(table, column)` pair in `src/api/schema.ts`, add an entry. Default status is `lossless` (since the archive ships the SQLite file intact); audit columns (`created_at`, `updated_at`, `id`) stay `excluded:audit-or-uuid`. Document any per-column deviation discovered during execution.
- [ ] Add a top-of-file comment naming the format — "Archive (.zip): bundles `<dbname>.db` + `<dbname>-media/`. The DB rides bit-for-bit, so column round-trip is lossless by default." — and the schema-introspection-test contract.

### Task 3: Schema-introspection test for archive registry

**Files:** `tests/unit/archive-fidelity-registry.test.ts` (new)

- [ ] Re-use the existing GEDCOM equivalent test as a starting point. Iterate every column in `schema.ts`; assert it has an entry in `archive_fidelity_registry.ts`. CI fails on missing entries.

### Task 4: Per-field + golden-seed round-trip tests

**Files:** `tests/unit/archive-roundtrip-fields.test.ts` (new), `tests/unit/archive-roundtrip-golden.test.ts` (new)

- [ ] Per-field: for every non-excluded archive registry entry, the harness loops through, seeds the column with a representative value, runs export → import, asserts the column equals the seeded value (or the registry's `expectedAfterRoundTrip`).
- [ ] Golden seed: build a comprehensive multi-table fixture (persons, names, identifiers, events with places + addresses, citations on each host kind, sources with abstract/call_number, media with regions and links, groups, research_tasks, repositories), export, re-import, assert DB equivalence on every non-excluded table.
- [ ] Confirm both new tests pass against the current archive importer/exporter. If any column fails round-trip — a real leak — pause the plan, file a follow-up `fix-archive-<column>` plan, mark the column as `lossy:pending-fix` with a TODO link, and continue.

### Task 5: Negative-case smoke check (test-the-test)

- [ ] In a throwaway local commit (never push), deliberately break the importer: e.g. comment out `events.place_address` in the column copy. Confirm the per-field test fails for that column with a clear diff. Revert.
- [ ] Document the test-the-test outcome in the plan or in a comment at the top of the per-field test file so future maintainers know the harness has been verified to fail-on-regression.

### Task 6: Bump + archive

- [ ] Tick all checkboxes.
- [ ] Minor bump (this is a feature: a CI guard the project didn't have before).
- [ ] CHANGELOG `## Unreleased`: "Archive (.zip) round-trip fidelity registry + per-field tests; CI now catches any future column that fails to round-trip through the archive export/import."
- [ ] Update `docs/PLAN.md`: remove the `[planned] Archive (.zip) …` section; mention the new guard exists.
- [ ] Append archive PLAN.md entry.
- [ ] `git mv` plan to archive.
- [ ] Final commit + merge.
