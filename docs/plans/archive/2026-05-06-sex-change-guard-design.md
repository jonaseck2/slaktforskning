# Design spec: Guard against accidental sex change on existing persons

**Date:** 2026-05-06
**Status:** Design — needs user decision before implementation
**Source:** Beta tester report 80 (v0.215.2)

## User goal

Today switching a person's sex (M ↔ F ↔ U) is a single dropdown change in PersonPanel — and saves immediately with no warning. The genealogist accidentally flipped their own sex while editing and discovered, as a side effect, that their son now had two biological mothers and no father. The flip itself was reversible (one more dropdown change), but the implications for the surrounding family graph weren't surfaced anywhere.

The user is asking for two things:

1. **A confirmation/awareness step** before changing sex on a person who has partners or children. If the person has no relationships, the change is harmless and shouldn't be gated.
2. **First-class support for actual gender transition**, recorded as an authored fact (a `sex_change` / `gender_transition` event), not just a dropdown flip — so the family graph can stay correct (e.g. "born male, transitioned 2020, biological father of children born before that date").

This is a sensitive design surface. The plan defers implementation to a follow-up after the user has confirmed:
- The gating policy (when does the warning fire?)
- The data-model addition (new event type? new column?)
- The UX text in both languages.

## The two cases the user identified

The user themselves split these clearly:

### Case 1 — typo / mis-click correction

Person has been entered with the wrong sex. No relationships established yet (or so few that the effect is trivial). Change should proceed without friction. Today's behavior is fine.

### Case 2 — actual gender transition

Person has been entered correctly, then transitioned. Family graph has them as e.g. biological father of children born before the transition. Switching the sex flag flips them into "biological mother" of those same children — wrong, because biological parenthood is fixed at birth.

## Proposed design (decisions needed)

### A — Detect the case at save time

When the user changes `persons.sex` for an existing row, on save:

1. Query: does this person have any partner relationships OR any parent_child relationships?
2. **If no relationships**: save proceeds silently. (Case 1, low cost.)
3. **If relationships exist**: surface a non-blocking confirmation modal with two paths:
   - **"This is a correction"** — fix the sex flag, save proceeds. Existing relationships are not touched.
   - **"This person transitioned"** — open a new flow: add a `gender_transition` event with a date, optionally add an explanatory note to each affected parent_child relationship, then save the sex flag.
   - **"Cancel"** — abort.

### B — `gender_transition` event type

A new entry in `EVENT_TYPE_VALUES` (per `src/renderer/constants/eventTypes.ts`). Like any event:
- Date (when the transition was legally / socially recorded — user-defined precision).
- Place (optional).
- Notes.
- Source citation.

This event is **a fact about the person**, like a name change. Rendered in PersonPanel → Events / Timeline / Life map.

### C — Family-graph correction options (in case "this person transitioned")

When the user picks the "transitioned" path, the system offers (for each affected parent_child relationship) a per-row explanatory note option:

> "When [child name] was born, [person] was registered as [previous sex with previous primary name]. Their biological parenthood reflects the sex at the time of birth. Recorded gender transition: [date]."

The system suggests this text; the user can accept, edit, or skip per relationship. The note lands in `relationships.notes`.

**Important constraint:** the *relationship row's* labels (Pappa / Mamma) in PersonPanel and reports are display-derived from the parent's CURRENT sex (which is what changes). To avoid the "two biological mothers" misrender, the role-label resolver needs to consult the `gender_transition` event:

- If a child was born BEFORE the parent's transition date, the parent's role label is computed against their *pre-transition* sex.
- After the transition, role labels follow the current sex.

This is a render-time computation, fully consistent with Prime Directive ("compute on render, never persist inferred"). The DB only stores: the parent's current sex, the parent_child relationship, the gender_transition event with a date. The role label is derived.

### D — MCP / API surface

`update_person` (existing tool) gains an optional `confirmGenderTransition: { eventDate: string }` param. Without it, the tool errors when changing sex on a person with relationships, surfacing the same constraint as the UI. The user can either pass `confirmCorrection: true` (case 1) or `confirmGenderTransition: { ... }` (case 2). This forces calling agents to make the choice explicit, just like the UI does.

## Open questions for the user

- **Policy:** does Case 1 (no relationships) really need zero friction, or should the user always see a one-line "are you sure you want to change sex?" toast for awareness? (Default: zero friction in Case 1; the user themselves said it's a low-cost change.)

- **Wording:** the proposed Swedish text is just a sketch. The final wording on the confirmation modal and the per-relationship note should be reviewed before shipping. Suggested first pass:

  > Modal title: *"Du ändrar kön på en person med befintliga relationer"*
  > Body: *"En korrigering av tidigare felregistrering ändrar bara könet. Ett verkligt könsbyte kan påverka hur barn och partners visas i släktträdet — välj nedan."*
  > Buttons: *"Korrigering"* (proceeds, sex changes, no event), *"Könsbyte"* (opens event flow), *"Avbryt"*.

- **Auto-add notes per relationship:** should the system add an explanatory note automatically to each affected parent_child relationship, or surface the option per relationship for the user to accept/edit/skip? (Default: per-relationship review, with a "Skip all" / "Accept suggested text for all" shortcut.)

- **Render-time role resolution:** should the role label resolver consult `gender_transition` events to determine pre-transition vs post-transition labels? **This is the user's "Förslag 2 – Alternativ 2"**. It's the right answer (fully Prime-Directive-compliant) but adds a join to every role-label render. Performance probably fine (events are small per person) but worth measuring.

- **Out of scope for this plan, asking the user:** should `couple` relationships also annotate? (E.g. "This was a heterosexual marriage at the time" if labels show otherwise after one partner transitions.) Default: yes, same render-time resolution; same per-relationship optional note.

## Sequence

1. User reviews this design and locks the decisions above.
2. Implementation plan ships as `2026-05-06-sex-change-guard.md` covering the chosen UX + the new event type + the render-time role resolver.
3. The render-time role resolver itself can be a separate PR if the design plan grows large.

## Failure modes / RCA reference

- **Don't auto-edit existing rows:** changing the sex flag must NEVER auto-rewrite parent_child relationship labels in the DB. Per Prime Directive, the labels are derived. The user said this themselves: the system should *suggest* corrections, not silently make them.
- **Don't strand the user:** the confirmation modal must offer a clean "Cancel" — never a one-way decision tree.
- **Don't conflate sex and gender identity in the data model:** the `persons.sex` column is biological-sex-as-recorded, used for the family graph. The `gender_transition` event is a life event with a date. Don't add a `gender` column that complicates the schema; the event approach is cleaner.
- **MCP boundary:** agents calling `update_person` must hit the same gate. A frontend-only confirmation that the MCP layer skips is a Prime Directive risk (agents can quietly mis-author the family graph).
- **Locale sensitivity:** the suggested per-relationship note is genealogy-cultural — Swedish convention may differ from English. Final text passes a localization review before shipping.
