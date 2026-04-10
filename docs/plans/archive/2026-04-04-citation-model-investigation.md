# Investigation: Citation Model Rethink

## Resolution (2026-04-05)

Decisions reached after review. Implementation: `docs/plans/2026-04-05-evidence-model-simplification.md`. GEDCOM-specific questions deferred: `docs/plans/2026-04-05-gedcom-citation-roundtrip.md`.

| Question | Decision |
|----------|----------|
| Q1 — Proof of existence event | Add `mention` event type. User-initiated path for "source mentions person without specific life event." |
| Q2 — Name citations | Not addressed — name citations have no current UI surface; deferred. |
| Q3 — Place citations | Drop from UI. Place evidence comes from people's events at that place + notes. Schema column stays for GEDCOM compat. |
| Q4 — Relationship citations | Remove from UI. Evidence flows through events (e.g. marriage event). |
| Q5 — Migration of existing data | No migration. All data comes from imports; fix importers going forward. |
| Q6 — GEDCOM INDI.SOUR | Deferred — see GEDCOM citation roundtrip investigation. |
| Q7 — Assertions | Deferred until user demand. Quality checks handle conflict detection adequately. |
| Q8 — Research tasks | No change. Research tasks remain person-scoped; unsourced queries use event citations. |
| Q9 — MCP tools | No change. `get_citations_for_person` returns person_id citations (import artifacts); still valid. |

Schema columns `person_id`, `relationship_id`, `place_id` on `citations` are kept for GEDCOM import roundtrip. They are not exposed as user actions in the UI.

---

## The Proposal

Replace direct citations on persons, places, and relationships with event-based citations only. Instead of `citations.person_id`, `citations.place_id`, and `citations.relationship_id`, all evidence would be attached to events. This would be a major schema and UX change.

## Current State

The `citations` table has four "anchor" columns — a citation can target any of:
- `event_id` — most common; citation for a specific event (birth, marriage, death, etc.)
- `person_id` — direct citation on a person (e.g. "this source mentions this person exists")
- `relationship_id` — direct citation on a relationship
- `place_id` — direct citation on a place (e.g. "this source describes this location")

Only one anchor is typically set per citation row. The current UI exposes person_id citations in PersonDetailView ("Citera person") and event_id citations via CitationBadge on event rows.

## Related Plans

- `docs/plans/2026-04-04-evidence-model.md` — investigation into GPS, assertions, source UX. Concluded: keep person-event model, skip formal GPS for now; but prioritize event-level citation UX.
- `docs/plans/archive/2026-04-04-event-cause.md` — cause field; kept on events, not as person assertions.
- The `assertions` table exists (schema only, UI deferred) for future claim-level tracking.
- `docs/PLAN.md` Roadmap: "Assertion GEDCOM Export" depends on assertions UI; "Evidence Model & Source UX" covers CitationBadge + quick-cite.

## The Case For This Change

1. **Sources are about events, not entities.** A census record doesn't prove a person exists — it proves they were at a specific place on a specific date (a census event). A baptism record proves the christening happened. Attaching the citation to the event is more precise.

2. **Direct person citations are semantically vague.** What does `citations.person_id` mean? "This source mentions this person"? "This source confirms this person's identity"? Without an event, the claim is undefined.

3. **The event is the natural unit of evidence.** The evidence-model investigation already concluded this: "sources are almost always accessed through events."

4. **Simplification.** Removing three of four anchor columns simplifies the schema, the API, and the MCP tool surface.

## The Case Against (Open Questions)

### Q1: What event represents "proof of identity / existence"?

Some citations don't document a specific life event — they document the person's existence in a record (e.g. a mention in a will as a beneficiary, an index entry). What event type would you use? Would we need a new `MENTION` or `REFERENCE` event type? Or would this be modeled as a different construct entirely?

### Q2: How does this affect name citations?

A person's name change (married name) is documented by a source (e.g. a marriage record). Currently a citation on the person-name row captures this. Would name-level citations move to the marriage event? What if the name source is not a marriage?

### Q3: What happens to place citations?

A place citation (e.g. a historical map that establishes a farm's location) doesn't fit neatly into a person's event. Would place citations simply be dropped, or would there be a new "place evidence" construct?

### Q4: What happens to relationship citations?

A relationship citation (e.g. "this baptism record establishes parenthood") would move to the christening event with the child and parent as participants. This is actually a natural fit. But what about a relationship citation that doesn't correspond to any specific event?

### Q5: Migration — what happens to existing data?

Genney import creates `person_id` citations for person-level mentions and `relationship_id` citations. GEDCOM imports create `event_id` citations. If we remove direct citations, what happens to existing imported data?

- Option A: Convert existing `person_id` citations to a new "Mention" event on that person.
- Option B: Keep them in the DB but hide them from the UI (gradual deprecation).
- Option C: Delete them and accept data loss.

### Q6: GEDCOM compatibility

GEDCOM 5.5.1 has `INDI.SOUR` (person-level citation) and `FAM.SOUR` (family-level citation) in addition to event citations. Removing person/relationship citations breaks GEDCOM roundtrip for these tags. What is the export strategy?

### Q7: Does this belong in the main citation flow, or in assertions?

The evidence-model investigation already proposed `event_claims` as a lightweight assertion layer: `(event_id, citation_id, field, claimed_value, confidence, is_accepted)`. If we ever build that, each claim IS already event-scoped. Perhaps the right framing is: "direct person/relationship/place citations become event citations when an event exists, and otherwise become unanchored claims pending an event."

### Q8: Impact on research tasks and reports

Research tasks (`research_tasks`) are person-scoped. If all evidence is event-scoped, how do "unsourced person" queries work? Currently `getCitationsForPerson` returns both direct person citations and event citations. Would it only return event citations?

### Q9: What does this mean for the MCP tools?

`get_citations_for_person`, `get_citations_for_relationship`, `get_citations_for_place` are currently direct DB queries. If we remove direct citations, these tools either go away or are re-implemented as joins through events. AI agents currently use these to check if evidence exists for a person — the workflow would change.

## Before Deciding

This is a significant architectural change. Recommended next steps before any implementation:

1. **Audit existing Genney import data**: How many `person_id` and `relationship_id` citations does a typical import create? Are they meaningful?
2. **Audit what GEDCOM files contain**: Do real GEDCOM files from other apps use `INDI.SOUR` (person-level) or only event-level citations?
3. **Talk to the user**: Answer Q1–Q9 above before writing any implementation plan.
4. **Consider whether assertions are the right vehicle**: The `assertions` table (`citation_id, subject_type, subject_id, attribute, value`) is already designed to handle claim-level evidence. Maybe the answer is: direct citations stay, but assertions replace the vague "cite this person" concept with "cite this specific claim about this person."

## What This Does NOT Replace

The existing `Evidence Model & Source UX` plan items (CitationBadge on event rows, quick-cite from EventList, unsourced filter) are still valid regardless of this investigation's outcome — they improve the event-citation UX which is already the primary path.

## Decision Gate

This investigation should be resolved before implementing:
- Assertions UI (depends on knowing whether assertions replace or complement citations)
- Assertion GEDCOM Export (schema depends on final citation model)
- Any major Citation UI overhaul

Low-risk improvements (CitationBadge, quick-cite, editable citations in SourceDetailView) are not blocked by this investigation.
