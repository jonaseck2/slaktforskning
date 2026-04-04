# Investigation: Evidence Model — GPS, Assertions, and Source UX

## The Question
Should Släktforskning adopt the Genealogical Proof Standard (GPS) or a formal assertion model? Or should it focus instead on frictionless source attachment that nudges users toward good evidencing habits without imposing a formal process?

## What is GPS?
The Genealogical Proof Standard has five elements:
1. Reasonably exhaustive search
2. Complete and accurate citations
3. Analysis and correlation of evidence
4. Resolution of conflicting evidence
5. Written conclusion

Formal GPS tools implement this as: Source → Citation → Assertion (claim with confidence) → Accepted/Rejected verdict → Conclusion. We have the `assertions` table (schema only, UI deferred).

## The Core Tension

**Formal GPS approach (assertions model)**:
- Every fact about a person is an assertion backed by a citation.
- You don't say "Erik was born 1882" — you say "Citation X claims Erik was born 1882, confidence HIGH, accepted."
- Conflict resolution is explicit: two citations make different birth year claims → researcher adjudicates.
- Very powerful for serious research; used by RootsMagic's TreeShare, Gramps' attribution model.
- **Problem**: High friction. Entering a birth event requires: create event → add citation → create assertion → set confidence → accept. Most users won't do this.

**Person-event model (current approach)**:
- Events are facts. Citations are attached to events (or persons/relationships/places).
- No explicit claim tracking. You just add the event and cite it.
- **Advantage**: Fast, intuitive, matches how genealogists actually work day-to-day.
- **Weakness**: No way to track conflicting evidence, or mark "this event is uncertain".

## What sources relate to in practice

The user's insight is correct: **sources are almost always accessed through events**. The research workflow is:
1. Find a source (e.g., church records, census)
2. Find the event it documents (birth, christening, marriage, death, residence)
3. Attach the citation to that event

Persons and relationships are summary objects; the evidence lives in events.

**Implication**: The citation UX should be most accessible from the event view. A "Cite this event" button directly on each event row (not buried in a detail modal) would drive sourcing behavior better than any formal GPS requirement.

## Recommendation: Source-First UX, Not Formal GPS

### What to build

**1. Deep-link citations from everywhere**
- Every event row in EventList: a `CitationBadge` showing source count — click to open citation panel inline (not a new page).
- PersonDetailView: a "Sources" summary at the top showing all events that have/lack citations — sorted by evidence gap.
- "Unsourced" filter on person list: show persons with 0 citations across all their events.

**2. Make adding a citation frictionless**
- "Add citation" button directly on each event row (not inside EventForm).
- Keyboard shortcut (e.g., `C` when row is focused) to open citation modal.
- Recently-used sources appear at the top of the source picker.
- Quick-cite: if only one source exists in the database, pre-select it.

**3. Confidence as a simple quality signal, not a gate**
- The `confidence` field (0–3) on citations is already there. Show it as a color (red/yellow/green) without requiring the user to understand GEDCOM QUAY semantics.
- Default to 2 (Secondary evidence) for most church records, 3 (Primary) for vital records, 0 for oral tradition.

**4. Conflict detection (lightweight)**
- If two citations make different claims for the same event type on the same person (e.g., two birth dates), surface a "conflicting sources" warning inline — without requiring formal assertion resolution.
- This is the key insight from GPS: you need to notice conflicts, not necessarily resolve them formally.

### What NOT to build (GPS overhead)

- Formal assertion objects per claim (the `assertions` table stays schema-only for now).
- Mandatory acceptance/rejection workflow.
- "Proof summary" documents.
- Correlation reports.

The `assertions` table exists for future use (Assertion GEDCOM export, advanced research tools). It should not be exposed in the main UX until there is clear demand.

## Data model implications

**Keep the person-event model** as primary. It matches how data is imported (GEDCOM, Genney) and how users think.

The assertion model can be layered on top later: an assertion is simply a citation + a specific claimed value for a specific attribute. The current `citations` table with `event_id`, `person_id`, `relationship_id`, `place_id` already captures "this citation supports this entity." Assertions would add granularity ("this citation specifically claims the birth year is 1882").

**Suggested next data model evolution (not for this session)**:
- Add `event_claims` table: `(event_id, citation_id, field, claimed_value, confidence, is_accepted)` — a lightweight assertion that lives on events and integrates naturally with the event view.
- This is simpler than the full `assertions` table and fits the person-event model.

## Immediate action items

- [ ] Add `CitationBadge` to all event rows in EventList (already a shared component, wire `:event-id`)
- [ ] Add "Unsourced" filter to PersonsView (persons with 0 citations on all their events)
- [ ] Make citation modal accessible from EventList row directly (not just inside EventForm)
- [ ] Add recently-used sources to citation source picker
- [ ] Investigate conflict detection: query persons where 2+ citations give different date_value for same event_type — surface as data quality check

## Related plans
- `.claude/plans/2026-04-03-sanity-checks.md` — data quality checks (planned)
- `.claude/plans/2026-04-04-event-cause.md` — cause field design
- `.claude/plans/2026-04-03-printable-output.md` — printable reports that need citations
