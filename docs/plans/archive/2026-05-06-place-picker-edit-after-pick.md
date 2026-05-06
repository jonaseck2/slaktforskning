# Implementation: Place picker — backspace edits the field, doesn't clear it

**Date:** 2026-05-06
**Branch strategy:** main (small input-handler fix)
**Source:** Beta tester report 73 (v0.215.2)

## User goal

Type "Järfälla" into a place field. The picker dropdown shows resolved suggestions, e.g. "Järfälla, Stockholms län, Sweden, Europe". The user picks the suggestion. The text now reads "Järfälla, Stockholms län, Sweden, Europe". They want to trim the trailing ", Europe" — they put the cursor at the end and press Backspace. **The whole field clears** as if all the text was selected. There's no visual selection; this is unexpected and broken.

The user wants to be able to edit the picked-from-dropdown text the same way they'd edit any other text input.

## Investigation needed

The place picker most likely calls `setSelectionRange(0, value.length)` (or selects the input on focus) after a dropdown pick, leaving the entire text in the "selected" state without a visual highlight. Backspace on an all-selected input deletes everything. Locate:

- `src/renderer/components/PlacePicker.vue` (or whichever component owns the picker UI).
- The "picked from dropdown" handler — check for `select()`, `setSelectionRange`, `el.focus()` calls. Identify whether selection state lingers after the value is set.

The fix usually is one of:

1. After setting the value programmatically, also `setSelectionRange(value.length, value.length)` so the cursor is at the end with no selection.
2. Avoid `select()` after a pick; only `select()` on a Tab-into focus, not on a click-pick.

## Scope

Single file most likely (`PlacePicker.vue` or similar). Audit any other picker that has the same shape (PersonPicker, SourcePicker — typically these don't write back free text, but verify).

### Scope deviations

- Other text fields in the app: out of scope. This is specific to the picker's post-pick handler.

## Tasks

- [x] **Reproduce** in the running app: type "Järfälla" → pick suggestion → backspace at the trailing edge → confirm "all text disappears" matches the report.
- [x] **Audit** the picker's pick-handler for `select()` / `setSelectionRange` calls. Identify the line that leaves the input fully selected.
- [x] **Fix** — collapse the selection after programmatic value set. Move cursor to the end (or wherever the user clicked, if the picker tracks click position).
- [x] **Component test** — mount PlacePicker; simulate type → pick → confirm `input.selectionStart === input.selectionEnd === input.value.length` after pick. Then dispatch a Backspace `keydown` and confirm only the last character is removed.
- [x] **Patch bump** + CHANGELOG: `- fix: typing in a place field after picking from the suggestion list edits the field instead of clearing it`.

## Verification (user-observable)

1. Add a Wedding event. Type "Järf" in Plats. Pick a "Järfälla, …" suggestion from the dropdown.
2. Place the cursor at the end of the field (or use End key).
3. Press Backspace once. Only the last character is removed. The cursor is one position to the left.
4. Repeat with arrow keys, Home/End, mouse-positioned cursor — all behave like a normal text input.

## Failure modes / RCA reference

- **Don't disable the auto-suggest after edit:** the user picked a suggestion AND wants to edit the resulting string. The picker must not snap back to "you've edited, suggestions cleared" — as long as the resolved place id stays linked, free-text trimming should be allowed (it's a label tweak).
- **Resolver implications:** if the picker also stores a `place_id` after the pick, edits to the visible label should not unbind the id unless the edit changes the resolved leaf name materially. Confirm during impl that backspacing ", Europe" does not orphan the place link.
- **Authored vs resolved:** per Prime Directive, the database stores the picked place's id (the canonical leaf). The visible label string is rendered from the place-tree's resolved path at read time. If the user is editing a derived display string and that edit gets persisted as the place's name, that's a Prime Directive violation. Confirm during impl that the picker's text field is for *finding*, not *renaming*.
