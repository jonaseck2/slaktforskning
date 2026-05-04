# Design: Event participants parity + marriage workflow prompts

**Date:** 2026-05-04
**Status:** Draft — pending approval before plan
**Sibling implementation plan:** to be written after approval as `2026-05-04-event-participants-and-marriage-flow.md`

## User goal

When the genealogist records any life event — wedding, divorce, baptism, christening, funeral — they can name the *other people who were there*, with the same affordance regardless of event type. Wedding guests, witnesses, godparents, mourners: every event lets them be added, and every person they're added to gets the event surfaced in their timeline.

And: when the genealogist creates a marriage relationship, the app gently offers to record a wedding event in the same step, instead of leaving the marriage with no date attached. When they create a new partnership while another partnership has no end date and no death record, the app warns before creating a silent overlap.

## Scope

### Part A — Event participants (R44)

Every event type in the system, when opened in `EventModal`, exposes the "Other persons" / "Andra personer" affordance with the same UX. Today, this affordance is wired for some event types (e.g. divorce) but not others (e.g. marriage).

Full list of event types to audit and align — pulled from `src/api/event-types.ts` (or wherever the canonical list lives — confirm in plan-writing):

- Wedding (Vigsel)
- Divorce (Skilsmässa)
- Engagement
- Baptism (Dop)
- Christening / Confirmation
- Birth, Death, Burial
- Funeral, Memorial
- Adoption, Foster placement
- Census, Migration / Emigration / Immigration
- Residence
- Education, Occupation
- Religious affiliation
- Custom event (user-defined)

Every entry above must accept N participants with optional role text. If any event type *cannot* legitimately have other participants (none come to mind), call it out as a deviation with reason.

### Scope deviations

None expected. The data model already has `event_participants` as a generic join — this is a UI parity question, not a schema question.

### Part B — Optional role on participants (R44 follow-up)

A free-text "Role" / "Roll" field per participant (witness, officiant, marskalk, brudnäbb, mourner, etc.). Optional, never required. Storage: `event_participants.role` (existing? confirm in plan-writing — if absent, schema migration with a `gedcom_fidelity_registry` entry).

GEDCOM round-trip:
- 5.5.1: roles are not first-class on most non-FAMC/FAMS events; flag as `lossy:5.5.1-spec-limit` if so. (Confirm during plan-writing.)
- 7.0: ROLE substructures exist on some events; mark `lossless` where applicable, `lossy` where not.

### Part C — Marriage event prompt (R46)

When the genealogist creates a relationship of subtype "Gifta" (or equivalent marriage subtypes), and the relationship has no linked Vigsel event, the modal closes by **offering** to create a Vigsel event referencing both partners. It does not create the event silently.

**Prime Directive guard:** the app must never write a Vigsel row of its own accord. The flow is:
1. User saves the relationship.
2. App detects "marriage subtype + no event" and shows a non-blocking confirm: *"Vill du registrera vigsel för detta äktenskap?"* (Yes opens EventModal pre-filled with the two persons. No closes the dialog and writes nothing.)
3. The relationship saves either way; the event is opt-in.

Same pattern, in reverse, for divorce: creating a relationship with subtype change to "Skild"/"Frånskild" with no Skilsmässa event → offer.

### Part D — Overlapping partnership warning (R46 follow-up)

When the genealogist creates a new partnership for person X, and X already has a partnership with status:
- no end date, AND
- the existing partner is not deceased (no death event)

…the app shows a non-blocking warning: *"NN har redan en pågående relation. Vill du ändå lägga till ytterligare?"* User can proceed (genealogy regularly involves overlapping or undocumented separations) or cancel.

Warning is informational only. No data is auto-written, no relation auto-ended. User remains in control.

## Verification (user-observable)

1. **Part A — open `EventModal` for every listed event type, in turn. The "Andra personer" section is present, identically positioned, identically styled. Adding a person there saves and shows up in the participant's timeline.**
2. **Part B — adding a participant with role "Marskalk" persists the role; the role appears next to the participant's name in any rendering of the event participants. Round-trip a DB with role-bearing participants through GEDCOM 5.5.1 export+re-import: assert the registry's declared lossy/lossless behaviour holds.**
3. **Part C — creating a marriage relationship triggers the offer; clicking Yes opens EventModal with both persons pre-selected; clicking No closes silently with no event row written. Existing marriages (already with a Vigsel event) do not re-trigger the offer.**
4. **Part D — creating a second partnership for a person whose first partnership has no end date and whose first partner has no death event surfaces the warning. Proceeding writes the second partnership; cancelling does not.**

Component tests assert each event type's `EventModal` instance includes the participant section. Integration test for Part C confirms no event row is written on "No". Integration test for Part D asserts the warning condition fires (via a flag set on the modal under test) only when the overlap criteria are met.

## Open questions (must close before implementation plan starts)

- **Roles on GEDCOM 5.5.1**: which event types support `ROLE` natively? (Witness on FAM events; godparents on christening?) Need spec read before declaring fidelity.
- **Existing `event_participants.role` column?** Schema check during plan-writing. If absent, this becomes a small migration with registry entry.
- **Wording of the marriage-event offer**: confirm Swedish copy with user before plan locks UX.

## Failure modes / RCA reference

- **Prime Directive risk in Part C**: the offer must be *opt-in*. Auto-creating a Vigsel event from a relationship subtype is inferred persistence and would violate the directive. Phrase the spec, the test, and any subagent prompt to make this non-negotiable.
- **Part A risk: silent UI variation across event types.** A panel-style "this event has the field, that one doesn't" is exactly the surface-contract failure CLAUDE.md guards against. Verification must inspect *every* event type, not a sample.
- **Part B risk: role text drifts into structured data over time.** If the field starts as free text and we later want enum-backed roles (with i18n keys per role), today's free text is fine forever — but a future "normalize" step that rewrites authored role text would violate the directive. Document the boundary.

## Out of scope

- Restructuring `event_participants` join semantics.
- Auto-deriving "wedding date" from a relationship's `start_date` (any such derivation is render-only).
- Marriage-event templates beyond pre-filling the two partners and the event subtype.
- A general "relationship lifecycle" overhaul (start/end events, status transitions). Pick this up later if the marriage-event offer pattern proves valuable.
