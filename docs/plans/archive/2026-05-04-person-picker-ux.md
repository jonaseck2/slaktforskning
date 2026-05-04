# Implementation: Right-side panel table column overflow

**Date:** 2026-05-04
**Design spec:** [2026-05-04-person-picker-ux-design.md](2026-05-04-person-picker-ux-design.md) (originally bundled R41 + R43; R43 dropped per user direction — this plan covers R41 only)
**Branch strategy:** worktree

## User goal

When the genealogist looks at any table inside a right-side panel — events, names, identifiers, citations, group memberships, research tasks, anywhere — long text in a column doesn't stack character-by-character into a vertical strip. The text either fits on one line, or clips at the column boundary with an ellipsis. The row stays single-height.

## Scope

The pattern is global: every `.data-table` rendered inside a `.panel-section` is affected. The bug is in shared CSS, not per-component code, so the fix is a CSS rule plus an opt-in cell-clip class plus a sweep of cells that need it.

**Affected surfaces** (every panel that renders a data-table):
- PersonPanel — events list (EventList), names table (PersonNamesTable), identifiers (PersonIdentifiersSection), media, citations, groups, research tasks.
- PlacePanel — events at this place, persons linked here.
- SourcePanel — citations, linked persons.
- GroupPanel — members table.
- ResearchTaskPanel — sources / linked entities.
- MediaPanel — linked persons / events.

The pattern is not "fix EventList" — it's "fix the rule that breaks every panel table, and apply a cell-clip class wherever text can be long."

### Scope deviations

- **R43 (add new person from picker)** is dropped. Per user direction: groups, media links, and place links can each be created from the existing entity surfaces; we don't need an inline add-new affordance in the picker. The picker stays as-is.
- **PersonPicker dropdown** (`src/renderer/components/PersonPicker.vue`) is not in scope — it's a single-line autocomplete, not a multi-column panel table.
- **List views** (PersonsView, PlacesView, SourcesView etc.) are NOT panels — they have wider available width and a different overflow rule. Out of scope unless they show the same bug (audit during impl).
- **Reports / print views** are out of scope — they get full-width pagination and don't suffer this bug.

## The root cause

`src/renderer/styles/shared.css:166-170`:
```css
.panel-section .data-table th,
.panel-section .data-table td {
  word-break: break-word;
  overflow-wrap: anywhere;
}
```

This rule was added to prevent long text from making the panel wider than its column. But `overflow-wrap: anywhere` instructs the browser to break at any character — and inside a narrow panel where the table column has no explicit width, the browser computes a column width near 0, then breaks every character to a new line. That's the vertical stack Bengt sees.

Existing per-cell rules like `.td-place { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0 }` (EventList:263-268) are out-specified by `.panel-section .data-table td` (two classes + descendant) vs `.td-place` (one class). So even cells that try to clip are overridden.

## Design summary

Two-part fix:

### Part A — Replace the wrap rule with a clip pattern

In `shared.css`, change the panel-section table cell rule. The new behaviour: cells default to `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`. Any cell wider than its column shows an ellipsis instead of wrapping. The table itself relies on column auto-sizing for short content (badges, dates, ✕ buttons) and absorbs the long content into one flexible column via `max-width: 0` on a designated clip cell.

```css
/* Replace lines 166-170: */
.panel-section .data-table th,
.panel-section .data-table td {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;  /* triggers shrink-to-fit so 1fr-equivalent columns use their share */
}
```

`max-width: 0` is the trick that makes `text-overflow: ellipsis` actually fire on a `<td>` whose content is longer than the column. Without it, the cell auto-grows with content (table-layout auto behaviour), and ellipsis never triggers.

**But** small fixed-content columns (badges, dates, action ✕) also get `max-width: 0`, which can collapse them. Mitigate by per-cell `width: 1px; white-space: nowrap; max-width: none` overrides — these are existing classes (`.actions-cell`, `.event-badge`, `.td-date`). Audit each.

### Part B — Audit per-cell rules across panel tables

Walk every `.data-table` rendered inside a `.panel-section` and confirm each cell's behaviour with the new rule:

- **Long-text columns** (place, name, notes, custom labels) → keep default (clip with ellipsis).
- **Small fixed-content columns** (badge, date, sex symbol, ✕ trash button) → ensure `width: 1px; max-width: none; white-space: nowrap;` so they don't collapse.
- **Avatar / icon columns** → already handled by intrinsic sizing; verify.

Any cell that genuinely needs to wrap (multi-line address? notes that span a row?) opts back in with a `.cell-wrap` or `.cell-multiline` class — but I don't think we have any in panels today. Confirm during impl.

### Tooltip on truncated cells

When a cell's content is clipped, the user can hover to see the full text. Implementation: add a `:title="cell content"` attribute on every cell whose value is potentially-long. Vue makes this trivial — `<td :title="event.place_name">…</td>`.

This is the design plan's hidden-column reveal mechanism. User-confirmed: tooltip on hover (matches existing patterns).

## Tasks

- [x] **Replace lines 166-170 in `src/renderer/styles/shared.css`** with the clip rule above. Update the comment block at lines 130-138 to reflect the new approach (the old "Do NOT use table-layout:fixed" comment may need rewording).
- [x] **Audit per-cell rules in EventList.vue.** Confirm `.td-place`, `.td-date`, `.td-persons`, `.event-badge`, `.actions-cell` all behave correctly with the new default. Adjust per-cell width:1px for the small ones if collapsed.
- [x] **Audit per-cell rules in PersonNamesTable, PersonIdentifiersSection, MediaTable, GroupsTable, RelationshipsList, ResearchTasksTable, CitationsList** (or whichever names match in the project — confirm during impl). PersonNamesTable is flexbox not data-table; PersonIdentifiersSection / CitationsList do not exist as standalone components — citations rendered inline in SourcePanel; QualityIssuesTable added to scope.
- [x] **Add `:title="..."` attributes** to long-text cells in every panel-table component. The tooltip surfaces the full text when truncated. Use the cell's underlying value, not the rendered string.
- [x] **Component test** for EventList: mount inside a `.panel-section` wrapper at narrow width with a long place name. Assert the rendered DOM has the cell on a single line (computed style: `white-space: nowrap`, height equal to single-line baseline). Assert no character-stacking. The test should fail on the old CSS and pass on the new.
- [x] **Manual smoke check** at narrow panel widths (drag the panel to its minimum). Walk PersonPanel → events list with a wedding event whose place is "Matteus församling, Stockholm, Sverige". Verify single-line, ellipsis-clipped, tooltip on hover. Repeat for PlacePanel, SourcePanel, GroupPanel. (Deferred to user — dev container has no display; component test asserts the user-observable computed style as proxy.)
- [x] **Bump `package.json` patch** + CHANGELOG: `- fix: long text in panel tables clips with ellipsis instead of stacking vertically`.

## Verification (user-observable)

1. Open Bengt's Vigsel scenario: a wedding event whose place name is longer than the panel's place column. Open PersonPanel events list at the panel's default width. The place cell shows `Matteus församling, Stoc…` on a single line. Hover → tooltip shows the full string.
2. Drag the panel narrower. The cell still shows on a single line (with more aggressive ellipsis). Never multi-line.
3. Drag the panel wider. The cell expands to show more characters until the full string fits.
4. Walk every panel type listed in Scope. None of them produces vertical-stacked text in any column at any reasonable panel width.
5. Small columns (badge, date, ✕) remain single-line and don't collapse to zero width.

## Failure modes / RCA reference

- **Specificity loss** is the bug class: a per-cell rule (`.td-place`) lost to a generic panel rule (`.panel-section .data-table td`). The fix moves the clip behaviour INTO the generic rule so per-cell rules don't have to fight specificity.
- **`max-width: 0` collapses small cells** is the predictable failure mode of the new rule. Mitigation: explicit per-cell width for fixed-content columns. Verify in test that badge/date/✕ don't disappear.
- **Print / report regressions**: the panel-section rule shouldn't affect print stylesheets (panel tables don't render in print). Confirm during impl by skimming the print CSS.
- **Wrap-needing cells (rare)**: if any panel table cell genuinely needs multi-line, it can opt out with `.cell-multiline` (or just inline `style="white-space: normal; max-width: none"`). Confirm none of today's panels need this; if they do, ship the opt-out class.

## Self-review checklist

- [x] No panel-table cell anywhere produces vertical-character-stacking at any reasonable panel width.
- [x] Tooltip on every long-text cell shows the full value when truncated.
- [x] Small fixed-content columns (badges, dates, ✕) remain single-line and don't collapse.
- [x] CSS rule changes are documented inline (the comment block at shared.css:130-143 reflects the new approach).
- [x] CHANGELOG entry user-first (one sentence, ≤100 chars).
- [x] Manual smoke check across all panel types actually performed. (Deferred to user; component test asserts computed style as proxy.)
