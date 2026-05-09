# GEDCOM lossless: relationships.notes for non-couple types via `_RELA_NOTE` on ASSO

> Subagent dispatch: use `subagent-handoff`.

## User goal

A genealogist who writes a note on a sibling, godparent, or "other" relationship — e.g. "half-siblings, same mother" or "godfather and lifelong friend" — can export to GEDCOM, re-import, and find the note still attached to the relationship. Today only `couple` relationship notes survive (carried by the existing `_COUPLE_NOTE` on FAM); every other relationship's note is silently dropped. Genealogists who care enough to write the note often care more than the average user about preserving the qualitative context.

## Scope

- `relationships.notes` for relationships where `type !== 'couple'`. The couple branch already round-trips losslessly via `_COUPLE_NOTE`. The non-couple branch (sibling / godparent / other) emits an ASSO and ASSO has no standard NOTE child the importer reads back.

**In scope:** ASSO emit gets a custom `_RELA_NOTE` child sub-tag carrying the note value; importer reads it back into `relationships.notes`. Both v551 and v70.

**Scope deviations:** `parent_child` relationships are modeled via FAMC/FAMS, not ASSO — their notes (if any) ride existing FAMC/FAMS NOTE handling. Confirm during execution that FAMC/FAMS NOTE round-trips losslessly today; if not, file as a follow-up rather than expanding this plan.

## Verification

1. Per-field round-trip via fidelity harness for `relationships.notes` — must pass for all relationship types.
2. Targeted golden test: seed a sibling relationship with notes, round-trip, assert notes preserved. Same for `godparent` and `other`.
3. User-observable: write a note on a sibling relationship in the UI, export, re-import, reopen — note text matches.

## Failure modes / RCA reference

- The current registry entry conflates couple (lossless via `_COUPLE_NOTE`) with non-couple (lossy). After this plan, the entry needs to be either a single `lossless-via:_COUPLE_NOTE|_RELA_NOTE` or split into per-subtype entries — pick whichever matches the registry's existing precedent for "different status by relationship subtype." Inspect the registry's existing `relationships.subtype` entry for the established pattern before writing the new entry.

## Tasks

### Task 1: Exporter

**Files:** `src/gedcom/exporter.ts`

- [ ] In the ASSO emit phase (where sibling / godparent / other relationships are written), if `relationship.notes` is non-empty, emit:
  ```
  2 _RELA_NOTE <notes>
  ```
  Use the existing CONT/CONC long-text helper so multi-line notes survive.

### Task 2: Importer

**Files:** `src/import/gedcom/relationship.ts` (or whichever phase parses ASSO)

- [ ] When parsing ASSO, look for `_RELA_NOTE` child. Copy its joined value into `relationships.notes` for the resulting row.

### Task 3: Registry + bump

- [ ] Update `relationships.notes` registry entry to reflect the new lossless-via status (with multi-carrier note: `_COUPLE_NOTE` for couples, `_RELA_NOTE` on ASSO for the rest).
- [ ] Run harness; per-field round-trip passes for all relationship types.
- [ ] Patch bump, CHANGELOG, archive.
