# Investigation: GEDCOM Citation Roundtrip

## Resolution (2026-04-05)

**Decision: keep current GEDCOM importer and exporter behavior unchanged. No code changes.**

Rationale: Without auditing real GEDCOM files from target apps (MacFamilyTree, Family Tree Maker, Gramps), changing importer behavior risks breaking roundtrip. The UI impact is already resolved by removing the cite buttons — INDI.SOUR and FAM.SOUR citations exist in the schema as import artifacts but are not surfaced as user actions. Changing the importer to convert INDI.SOUR to MENTION events would inflate event counts and could lose per-person citation context (transcription, notes) that doesn't map cleanly to a generic MENTION event.

| Question | Decision |
|----------|----------|
| Q1 INDI.SOUR import | Keep as `person_id` citation (current behavior). Import artifact only — no UI action. |
| Q2 FAM.SOUR import | Keep as `relationship_id` citation (current behavior). Import artifact only — no UI action. |
| Q3 FAM.SOUR export | Keep current behavior — not emitted. Revisit if a specific roundtrip problem is reported. |

Revisit this if: a user reports that a specific GEDCOM file loses citation data they care about, or if we audit real GEDCOM files and find a clear pattern to optimize.

---

## Context

The evidence model simplification (`.claude/plans/2026-04-05-evidence-model-simplification.md`) resolved several citation UX questions: direct cite buttons for persons, relationships, and places are removed from the UI; the `mention` event type handles intentional person-level sourcing; and the Genney importer converts person-owned citations to MENTION events.

Two GEDCOM-specific questions were deferred here because they involve format compatibility decisions with non-obvious trade-offs.

---

## Deferred Questions

### Q1: GEDCOM import — should `INDI.SOUR` become a MENTION event?

**Current behavior:** When importing a GEDCOM file, `INDI.SOUR` tags (person-level citations) create `citations` rows with `person_id` set and `event_id` null.

**Proposed change:** Instead, each `INDI.SOUR` on import would create a MENTION event on the person, then cite that event — matching the new Genney behavior.

**Arguments for:**
- Consistent: all citations flow through events, regardless of import format.
- No dead-end `person_id` citations that users can't interact with via the UI.
- The GEDCOM spec itself acknowledges `INDI.SOUR` is vague — many genealogy apps write it as a catch-all.

**Arguments against:**
- `INDI.SOUR` on export would need to be re-derived from MENTION events, since the original `person_id` citation would no longer exist.
- Creates extra MENTION events for every person that has a source, inflating the event count.
- Some `INDI.SOUR` citations in real GEDCOM files carry transcription and notes that are specific to the person, not to any single event — converting them to a MENTION event may lose semantic context.

**Real-world data question:** How commonly do popular apps (MacFamilyTree, Family Tree Maker, Gramps) write `INDI.SOUR` vs. event-level `SOUR` tags? If most apps only write event-level citations, `INDI.SOUR` is rare enough to treat as a legacy artifact.

---

### Q2: GEDCOM import — should `FAM.SOUR` cite the marriage event?

**Current behavior:** `FAM.SOUR` tags (family/couple-level citations) create `citations` rows with `relationship_id` set.

**Proposed change:** On import, `FAM.SOUR` would instead be attached to the marriage event for that couple (if one exists), or to a new MENTION-style event if no marriage event is present.

**Arguments for:**
- Consistent with the event-centric model.
- `FAM.SOUR` typically documents the marriage or the family record — the marriage event is the natural home.

**Arguments against:**
- A couple may have no marriage event (cohabitation, civil union) — `FAM.SOUR` would need to cite a different event, or create one.
- If the family has multiple events (marriage, divorce, census), which event gets the citation?

---

### Q3: GEDCOM export — should marriage event citations emit as `FAM.SOUR`?

**Current behavior:** The exporter emits `FAM.MARR` with a `SOUR` tag for citations attached to the marriage event. It does not emit a top-level `FAM.SOUR`.

**Proposed change:** When exporting a couple relationship, collect all citations from the marriage event and emit them as `FAM.SOUR` in the FAM record.

**Arguments for:**
- Roundtrip fidelity: if another app wrote `FAM.SOUR` and we import it as a marriage event citation, we should re-emit it as `FAM.SOUR` on export.
- Some GEDCOM consumers (especially older ones) look for `FAM.SOUR` specifically.

**Arguments against:**
- Marriage event citations are already emitted under `MARR.SOUR` — duplicating them as `FAM.SOUR` could cause double-counting in other apps.
- Not all couple relationships have a marriage event (cohabitation, civil union) — should the FAM get citations from the first event? All events?

---

## Before Deciding

1. **Audit real GEDCOM files.** Check 2-3 real GEDCOM exports from MacFamilyTree, Ancestry, and Gramps:
   - How many `INDI.SOUR` tags do they write per person?
   - Do they use `FAM.SOUR`, or only `MARR.SOUR`?
   - Are `INDI.SOUR` citations meaningfully different from `MARR.SOUR` citations on the same person?

2. **Check the GEDCOM 7.0 spec.** GEDCOM 7.0 (`gedcom.io`) changed citation handling. Does it support `INDI.SOUR`? Does it have guidance on `FAM.SOUR` vs. event-level citations?

3. **Consider lossless extension tags.** The app already has extended roundtrip support (v0.6.4). Could `INDI.SOUR` citations be preserved as a custom tag on import without converting to MENTION events, and re-emitted on export?

---

## Decision Gate

Resolve before implementing any change to the GEDCOM importer's `INDI.SOUR` or `FAM.SOUR` handling. The Genney importer is already updated independently (all person citations → MENTION events). GEDCOM is a separate decision because of roundtrip fidelity requirements.
