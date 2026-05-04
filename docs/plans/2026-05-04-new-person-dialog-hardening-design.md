# Design: NewPersonModal hardening — disabled Save, no phantom rows, dialog title

**Date:** 2026-05-04
**Status:** Draft — pending approval before plan
**Sibling implementation plan:** to be written after approval as `2026-05-04-new-person-dialog-hardening.md`

## User goal

When the genealogist opens "Lägg till ny person" with no information typed, the Save button is visibly disabled. They cannot accidentally create a person with no name, no birth, no anything — a ghost row that later shows up as a question-mark icon on a chart. And the dialog they're in is named accurately: "Hantera person", not the "Hämta person" typo it currently shows.

## Scope

The new-person creation dialog `src/renderer/components/modals/PersonModal.vue` (in its create mode), plus the audit of any other code path that can write a `persons` row with no `names` row attached.

Existing phantom rows (already in user databases) are addressed by a one-time **Quality check** that surfaces them so the genealogist can decide whether to delete or fill in.

### Scope deviations

None. Every code path that creates a `persons` row must be audited in this plan.

## The three fixes

### Fix 1 — Disable Save until at least one identifying field is filled (R52)

**Problem:** Save is always enabled in NewPersonModal, even when every field is blank. Hitting it creates a person with no name. Bengt found one such ghost in his test DB and could not recall how it got there; the most plausible cause is exactly this.

**Design:**
- Save button is `disabled` until at least one of these is non-empty (whitespace-trimmed):
  - Given name
  - Surname
  - Any other name field the modal exposes (nickname, prefix, suffix — confirm during plan-writing)
- "At least one of" is the bar — the modal does not require both given and surname (genealogy has many records of "Anna of Stockholm" with no surname; we honour that). It just requires *something*.
- Disabled-state styling uses the existing design-token disabled style — greyed out, not active-looking.
- The disabled state is reactive: as soon as the user types one character into any name field, Save enables.

### Fix 2 — Audit all write paths for "person without name" possibility (R51 root cause)

**Problem:** A phantom person can also arise from non-modal paths — bulk import, MCP tool calls, gazetteer migration scripts. We need to find any such path that writes a `persons` row without ensuring a `names` row exists.

**Audit scope:**
- `src/api/persons.ts` — `createPerson()` and any other create-style function.
- `src/api/persons-import.ts` (or similar import helpers).
- `src/import/gedcom/` — does the importer ever create a `persons` row without an accompanying `names` row?
- `src/mcp/createProdServer.ts` — `create_person` MCP tool. Confirm it requires a name.
- Any "shadow person" creation — e.g. an event references a person who doesn't exist yet, and the importer / MCP creates a placeholder.

**Design decision per finding:**
- If a path can create a `persons` row without a `names` row, that's a Prime Directive violation in the inverse — we're inferring a person exists without an authored identifier. The path must either require a name OR write a `names` row with `unknown_marker = true` (or equivalent — confirm during plan-writing whether such a marker exists in the schema).
- "Shadow person" creation paths (importer compatibility): keep them, but the placeholder must carry an explicit "unknown" marker so the rest of the app doesn't render it as a normal anonymous person. The chart's question-mark rendering for nameless persons (which Bengt saw) should only appear for explicitly-marked unknown placeholders, not for accidentally-empty persons.

### Fix 3 — Quality check for existing phantoms

**Problem:** Bengt's database (and likely other early beta users) contains phantom rows. After Fixes 1 + 2, no new phantoms can be created — but old ones remain.

**Design:**
- Add a new check `PERSON_NO_NAME` (or similar code) to the existing QualityView checks pipeline.
- Severity: `notice` (it's the user's data; we surface, we don't force).
- Trigger: a `persons` row with no associated `names` row, OR with all `names` rows having empty `given` AND empty `surname` AND no other identifier.
- Message (Swedish): *"Person utan namn — kontrollera och fyll i, eller ta bort"*
- The check links to the person's panel so the user can act.
- Listed alongside other location/place/source quality checks.

### Fix 4 — Dialog title typo (R42)

**Problem:** A dialog renders "Hämta person" where it should read "Hantera person". (Hämta = fetch; Hantera = manage.)

**Design:**
- Find the offending i18n key. Confirm whether one key serves multiple dialogs or whether two dialogs share a key. Fix the value, not the key (don't break call sites).

## Verification (user-observable)

1. **Fix 1**: open NewPersonModal. Save button is visibly disabled. Type one character in any name field. Save enables. Clear the field. Save disables again.
2. **Fix 2**: with an audit document listing every create-path, every path either (a) requires a non-empty name or (b) explicitly marks the row as an unknown placeholder. Manual + grep test asserting no path slips through.
3. **Fix 3**: import or seed a DB with a known phantom row. Run the quality checks. The phantom appears with `PERSON_NO_NAME` severity `notice`, linking to the person's panel.
4. **Fix 4**: open the previously-mistitled dialog. Title reads "Hantera person".
5. **Closure of the source-of-bug class**: with Fix 1 deployed and Fix 2's audit complete, no new phantom rows can appear. The existence of any new phantom in a fresh DB after this plan ships is a regression.

## Failure modes / RCA reference

- **Past failure**: a UI affordance (Save button) that *appeared* enabled when the underlying action would silently fail or produce garbage data. The fix is "disabled looks disabled" — a tiny visual change that closes a class of data-quality bugs.
- **Inferred-data risk in Fix 2**: a "shadow person" placeholder created by the importer / MCP must carry an explicit unknown marker. Auto-creating a row with `surname = 'Unknown'` would be inferred persistence. Either require the user to identify (in import) or mark the row as unknown structurally (a flag, not a string value).
- **R42 / R51 tie**: the typo and the phantom-person bug were reported separately but live in the same dialog. Fixing both in one plan keeps the dialog change atomic.

## Out of scope

- Redesigning NewPersonModal beyond the disabled-Save change.
- Bulk-deletion tools for phantom rows. The quality check surfaces them; user decides per row.
- Renaming the dialog's i18n key (only the *value* changes).
- Cascading "shadow person" creation logic in the importer (audit only; structural changes there belong in an importer-focused plan).
