# GEDCOM lossless: events.place_address via custom `_PLAC_ADDR` sub-tag

> Subagent dispatch: use `subagent-handoff` (project-local templates centering user goal over spec compliance).

## User goal

A genealogist who fills in the **street / postal code / city / country** address fields on an event (so the place reads "Adolf Fredrik kyrka, Stockholm" but the actual ceremony was at "Tvärgatan 5, 35243 Växjö, Sverige") can export the database to GEDCOM and re-import it — anywhere — and find that exact address still attached to the event. Today those fields silently disappear on round-trip; the registry says so explicitly and the user has no idea their data didn't leave with them.

## Scope

The pattern this plan introduces is "an events column with no standard GEDCOM tag travels via a `_`-prefixed custom sub-tag under the standard parent tag." Full enumeration of the column it covers:

- `events.place_address` (TEXT) — flat, free-form address string. **In scope** under both GEDCOM 5.5.1 and 7.0. Promote registry entry from `lossy` to `lossless-via:_PLAC_ADDR` for both versions.

**Scope deviations:** none. The custom tag is identical across 5.5.1 and 7.0; both versions tolerate `_`-prefixed extension tags. Standard GEDCOM `ADDR` under EVEN is NOT used for this — the genealogy data model treats `place_address` as the *event-specific* address that may differ from the place's nominal centre, and `ADDR` is reserved for the standalone Place's mailing address. We must not collapse the two into one ADDR or we lose the distinction on re-import.

## Verification

1. **Per-field round-trip test:** the existing fidelity-registry harness in `tests/helpers/gedcom_fidelity.ts` exercises every non-excluded entry. After this plan lands, the entry for `events.place_address` is non-excluded and lossless under both v551 and v70 — the harness loops through it and the round-trip produces an identical column value.
2. **Golden-DB-seed test:** `tests/unit/gedcom-roundtrip-golden.test.ts` (or equivalent) seeds an event with `place_address = 'Tvärgatan 5, 35243 Växjö, Sverige'`, exports, re-imports, asserts equality.
3. **User-observable:** export a real database with addresses on events, re-import the resulting `.ged` into a fresh database, open the event in the UI — the *Address* field on the event modal still shows the typed value.

Lint + vitest passing is hygiene, not verification.

## Failure modes / RCA reference

- The fidelity registry was added precisely to catch this class of regression. The reason `events.place_address` is currently lossy is the exporter never wired the tag up — it's a "we forgot" not a "we couldn't." Don't reintroduce a parallel custom tag elsewhere; reuse `_PLAC_ADDR` under PLAC inside EVEN.
- **Prime Directive (Round-Trip Fidelity):** every authored field must survive a round-trip. The `place_address` column is authored data; today it leaves silently. This plan is the directive's enforcement mechanism in action.

---

## Tasks

### Task 1: Exporter emits `_PLAC_ADDR`

**Files:** `src/gedcom/exporter.ts`, `tests/unit/gedcom.test.ts`

- [x] In the exporter's event emit path, after the existing `2 PLAC <name>` line, add a guarded emit for `_PLAC_ADDR` when `event.place_address` is non-empty:
  ```
  2 PLAC <place name>
  3 _PLAC_ADDR <event.place_address>
  ```
  The custom tag sits under PLAC at level 3 (PLAC is level 2 under EVEN). Use the existing string-escape helper (or whichever util the exporter uses for free-form text) so that newlines and high-Unicode characters survive.
- [x] Add a unit test that exports an event with a known `place_address` value and asserts the line `3 _PLAC_ADDR Tvärgatan 5, 35243 Växjö, Sverige` appears in the GEDCOM output under the PLAC line for that event.

### Task 2: Importer reads `_PLAC_ADDR`

**Files:** `src/import/gedcom/event.ts` (or wherever event PLAC parsing lives), `tests/unit/gedcom.test.ts`

- [x] In the event-importer phase, after parsing the standard PLAC, look for a `_PLAC_ADDR` child node and copy its value into `event.place_address`. If absent, leave `place_address` null (do not infer from ADDR — that's a different field).
- [x] Add a unit test: import a hand-crafted GEDCOM string containing the `_PLAC_ADDR` sub-tag and assert the event row has the expected `place_address` value.

### Task 3: Promote registry entry, run round-trip harness

**Files:** `src/api/gedcom_fidelity_registry.ts`, `tests/helpers/gedcom_fidelity.ts` (no change expected, just verify it picks the entry up), `tests/unit/gedcom-fidelity-registry.test.ts`

- [x] Change the `events.place_address` entry's `v551` and `v70` blocks from `lossy` → `lossless-via:_PLAC_ADDR`. Update the `reason` text to describe the carrier.
- [x] Run the fidelity harness; verify the per-field round-trip case for `events.place_address` now passes.

### Task 4: Bump + archive

- [x] Tick all checkboxes in this plan.
- [x] Bump `package.json` patch (lossless promotion is a fix, not a feature).
- [x] Add CHANGELOG `## Unreleased` entry: "GEDCOM round-trip: `events.place_address` is now preserved via the custom `_PLAC_ADDR` sub-tag under PLAC."
- [x] Update `docs/PLAN.md`: remove the `events.place_address` backlog block.
- [x] Append entry to `docs/plans/archive/PLAN.md`.
- [x] `git mv` this plan to `docs/plans/archive/`.
- [x] Final commit + merge.
