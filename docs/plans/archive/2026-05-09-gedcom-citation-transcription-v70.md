# GEDCOM 7.0: promote citations.transcription to lossless via `_TRANS`

> Subagent dispatch: use `subagent-handoff`.

## User goal

A genealogist who pastes the **transcription** of a parish-record snippet into a citation ("Petrus Andersson, hustru Cathrina Mårtensdotter, dotter Maria, döpt i Adolf Fredrik 1786-04-12, faddrar…") can export to GEDCOM 7.0 and re-import — anywhere — and find the transcription still attached to the citation. Today the transcription survives only when the citation is attached to an event or a name; person/family/place-level citations silently drop it. Under 7.0 we can do better with a custom `_TRANS` carrier.

## Scope

The pattern this plan introduces is "split a registry entry by GEDCOM version when the carrier capability differs." Full enumeration of the affected column:

- `citations.transcription` for citation hosts where the standard DATA/TEXT path is not currently round-tripped: `person_id`, `relationship_id`, `place_id`. Today the registry treats both v551 and v70 as the same (lossy with the same caveat). This plan splits them: keep v551 as `lossy:5.5.1-no-carrier-on-non-event-citations`, promote v70 to `lossless-via:_TRANS`.

**Scope deviations:**
- v551 stays lossy. Reason: GEDCOM 5.5.1 is stricter about extension tags inside SOUR cites (parsers historically reject unknown sub-tags at certain levels), and the user's most likely v551 import target is a third-party app that won't honor the custom tag anyway. The registry will explicitly say so. Promoting v551 would be a separate plan focused on testing custom-tag tolerance against a panel of v551-consuming apps.
- Event-level and name-level transcription: already lossless under both versions via DATA/TEXT — leave them alone.

## Verification

1. Per-field round-trip harness exercises `citations.transcription` for all four host kinds (event, name, person, place). Under v70, all four pass; under v551, event and name pass while the others remain at their declared lossy expectation.
2. Targeted unit test: seed a person-level citation with a non-empty transcription, export to v70, re-import, assert preserved. Repeat for relationship-level and place-level.
3. User-observable: paste a transcription on a person-level citation, export to v70, re-import into a fresh DB, reopen the citation — transcription text matches.

## Failure modes / RCA reference

- The fidelity registry was added precisely so version-by-version capability can be declared explicitly. Do not "while we're here" promote v551 — that's a different test surface and a different risk profile.
- **Prime Directive (Round-Trip Fidelity):** transcription is high-value genealogy data. The registry currently flags this as lossy under both versions, which is honest but not a destination — the destination is to make at least one supported export format carry it losslessly.

## Tasks

### Task 1: Exporter

**Files:** `src/gedcom/exporter.ts`

- [x] In the citation emit path for v70 (the exporter already branches on version where appropriate — find the existing version switch or add one near where DATA/TEXT is emitted), when the host is a person/relationship/place and `citation.transcription` is non-empty, emit:
  ```
  2 _TRANS <transcription>
  ```
  Use CONT/CONC for long values.
- [x] When the host is event or name, the existing DATA/TEXT path stays — don't double-emit. (Or do double-emit and let the v70 importer prefer `_TRANS`; pick whichever is simpler to reason about, document the choice in the exporter comment.)

  **Decision:** option A — `_TRANS` is emitted ONLY for person/relationship/place hosts under v7.0; event/name hosts continue to use standard DATA/TEXT and never get `_TRANS` alongside. Removes "which one wins on import" ambiguity. Documented in `emitCitationBlock`'s doc comment.

### Task 2: Importer

**Files:** `src/import/gedcom/citation.ts` (or whichever phase parses SOUR cites under person/family/place hosts)

- [x] In v70 mode, in person-level / relationship-level / place-level citation phases, look for a `_TRANS` child on the SOUR cite and copy the joined value into `citations.transcription`. Today these phases skip DATA/TEXT entirely; this is the new code path.

  **Implementation note:** the actual phases live in `src/import/gedcom/phases.ts` (person-level in `phaseIndividuals`, family-level in `phaseFamilies`, place-level in `phasePlaceCitations`). The version isn't plumbed into the phases — but reading `_TRANS` is unconditional on import, since a v5.5.1 file simply won't carry it (the exporter doesn't emit it under 5.5.1 by design). No version detection needed at the read path.

### Task 3: Registry split + bump

- [x] Edit the `citations.transcription` registry entry: keep v551 lossy with the existing reason, change v70 to `lossless-via:_TRANS` with a reason that names the new carrier and the four-host coverage.
- [x] Run the fidelity harness; the v70 round-trip passes for all four host kinds while v551 retains its declared lossy behavior.
- [x] Patch bump (lossless promotion is a fix), CHANGELOG entry, archive.
