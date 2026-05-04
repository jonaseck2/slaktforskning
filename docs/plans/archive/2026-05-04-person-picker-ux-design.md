# Design: Person picker — column behaviour and add-from-picker

**Date:** 2026-05-04
**Status:** Draft — pending approval before plan
**Sibling implementation plan:** to be written after approval as `2026-05-04-person-picker-ux.md`

## User goal

When the genealogist searches for a person to add (to a group, to an event, as a partner, anywhere) and the picker shows a too-long place name in a too-narrow column, the column doesn't crush itself to one character wide and stretch the row vertically. It either uses available width gracefully or hides on small windows — never makes the picker look broken.

And: when the person they want isn't in the database yet (because they're a non-relative, a witness, a friend), the genealogist can create that person *from inside the picker* without abandoning what they were doing.

## Scope

Every person picker in the renderer. These are the surfaces (confirm full list during plan-writing — search for `<PersonPicker` and `<PersonSearchModal` and any `<…Picker` opening over a person query):

- Group member picker (used by GroupModal)
- Event participant picker (EventModal "Andra personer" section)
- Partner picker (RelationshipModal)
- Source-link person picker (SourceModal — confirm)
- Media tag person picker (MediaModal "tag person in image" flow)
- Any other instance of the same primitive

The fix lives in **the picker primitive itself**, not per-call site. If the picker is currently re-implemented in two places, consolidate as part of this work.

### Scope deviations

If a picker variant has UX-justified differences (e.g. multi-select vs single-select), preserve those — but column behaviour and add-from-picker apply to all variants by construction.

## The two fixes

### Fix 1 — Column behaviour at narrow widths (R41)

**Problem:** Picker rows include columns like Name | Birth | Place. The Place column wraps a long string ("Matteus församling, Stockholm…") into a 1-character-wide stack, forcing the row to grow to many lines tall. Resizing the picker window wider eventually fixes it, but the default state looks broken.

**Design:**
- Each non-essential column has a **minimum width** below which it is hidden, not crushed.
- Hiding is breakpoint-based on the picker dialog's current width. Cascade:
  - Below ~600 px: hide Place column.
  - Below ~480 px: hide Birth column (Name + minimal info only).
  - Name column never hides.
- Hidden columns can still be revealed via tooltip-on-row or a "more" affordance — **decide during plan-writing**: tooltip on hover, or expand-row-on-click. Tooltip is simpler and matches existing patterns.
- Text within visible columns truncates with ellipsis at the column's right edge — never wraps to multiple lines in the row.
- Row height is fixed (single text line, ~36 px including padding), determined by the design tokens already in use.

The picker is a list, not a data grid. Rows must be scannable at a glance. A row that's six lines tall because of one long place name is a layout failure.

### Fix 2 — Add-from-picker (R43)

**Problem:** When the typed name doesn't match any existing person, the genealogist hits a dead end. They have to close the picker, navigate to the Persons view, add the person, return to whatever they were doing, re-open the picker, and search again.

**Design:**
- When the picker's current query string yields zero results (or yields some but the user wants to add a new person anyway), a row at the bottom of the result list reads:
  *"+ Lägg till ny person: '\<query\>'"*
- Clicking that row opens NewPersonModal pre-filled with the query string parsed into name parts (last token → surname, prior tokens → given names — same parsing the existing search uses, applied inversely).
- On NewPersonModal save, the new person is selected in the picker context (added to the group / event / partnership / wherever the picker was opened from) without the user having to re-find them.
- On NewPersonModal cancel, the picker returns to its prior state, query intact.

**Open question for plan-writing:** is NewPersonModal compatible with being opened on top of another modal? If not, the picker may need to close and re-open on the new person — confirm during plan-writing and document the chosen flow.

## Verification (user-observable)

1. **Fix 1**: open every listed picker at a narrow window width. The Place column is absent; rows are single-line; the picker is scannable. Resize wider → Place reappears at the breakpoint; Birth reappears at the wider breakpoint. No row ever stretches to multi-line.
2. **Fix 1 b**: with the Place column visible but a row's place name longer than the column, the row remains single-line, ellipsis-truncated at the column edge. Hovering the row (or whichever affordance is chosen) reveals the full place name.
3. **Fix 2**: from a Group panel, open the Add Member picker. Type a name that doesn't exist. The "+ Lägg till ny person" row appears. Clicking opens NewPersonModal pre-filled. Saving returns to the group panel with the new person added as a member. The new person also exists as a standalone person record in the database.
4. **Fix 2 b**: same flow from EventModal's participant picker, RelationshipModal's partner picker. All four+ pickers behave identically.

## Failure modes / RCA reference

- **The repeating bug class** CLAUDE.md's surface contract guards against: a picker that filters DB rows AND gazetteer rows in one state, but only DB rows after the user types. Apply the same lens here — the typed-query state must offer everything the empty state offers (existing matches), PLUS the add-new affordance. State A (no query) shows existing rows. State B (typed query) shows filtered existing rows + "Add new". State B never offers *less* than A.
- **Picker primitive re-implementation drift**: if the same picker logic is partially re-implemented per call site (which is the project's documented bug pattern), this fix will only land on whichever copy gets edited. Consolidate during plan-writing OR explicitly enumerate all copies in the implementation plan's Scope section.
- **Add-from-picker name parsing**: re-using the search-side name parser inversely is a small cleverness that can drift. Don't infer surnames from query input — show the parsed split in NewPersonModal and let the user correct before save.

## Out of scope

- Adding new column types to the picker.
- Sorting or filtering controls on the picker (beyond the existing query input).
- A dedicated "Add place from picker" flow (R43 specifically asks for *person* picker; the place picker is its own surface).
- Picker pagination / virtual scrolling (separate performance concern).
