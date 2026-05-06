# Implementation: Place-tree picker icon — clearer affordance + tooltip

**Date:** 2026-05-06
**Branch strategy:** main (small UI / i18n change)
**Source:** Beta tester report 76 (v0.215.2)

## User goal

When editing an event's place, there's a small icon at the end of the field that opens a hierarchical tree of places. The user doesn't recognize the icon (described as "looks like a car battery") and the tooltip "Bläddra plats i träd" doesn't tell them what they'll see when they click. They click, see a list, and don't understand where the entries come from.

The genealogist wants:

1. The tooltip to tell them what the click does, in a way that primes them for what they'll see ("Browse the place hierarchy" or similar).
2. The icon to either be replaced with a clearer one OR augmented with a label.
3. The opened panel itself to signal what its rows are — *places already in this database*, organized as a parent-child tree (city under county under country) — versus, say, gazetteer suggestions.

## Investigation needed

- Where is the icon? Likely in `src/renderer/components/PlacePicker.vue` or a sibling button. Find the actual SVG / glyph and its `title` attribute.
- What does the panel show? Trace the click handler to the panel component (probably `PlaceTreePickerModal.vue` or similar). Understand whether it shows database-only rows, gazetteer rows, or both.
- Per the Surface contract section in CLAUDE.md, point 4 ("no silent degradation across state"), the picker shouldn't silently filter out gazetteer suggestions when the user types vs when they browse the tree.

## Scope

Two surfaces:

1. **The icon button** at the end of the place input — change the icon (or label it), update the tooltip. File: `PlacePicker.vue`.
2. **The opened panel** — make its purpose self-explanatory. File: `PlaceTreePickerModal.vue` (or whatever the actual component is named — confirm during audit).

### Scope deviations

- **Switching to a different picker UX entirely** (e.g. an inline expanding tree, no separate modal): out of scope. Keep the modal pattern; just clarify what it shows.

## Design summary

### Icon + tooltip

Replace the unclear glyph with one of:

- A folder-tree icon (▼ over horizontal lines, or `IconFolderTree` from existing icon set).
- A simple 🌳 / breadcrumb / `IconHierarchy`.

If the existing icon set doesn't carry a clean tree glyph, use a small "▼" + "🌳" combo or just a "▼" indicating a dropdown-into-tree. Audit `src/renderer/components/icons/` (or wherever icons live) for what's available before inventing.

Tooltip update (i18n key `placePicker.browseTreeTooltip`):

- SV: `"Bläddra bland platser som redan finns i databasen"`
- EN: `"Browse places already in this database"`

### Panel header

Inside the opened panel, add a one-line header explaining the rows: "Platser registrerade i denna databas, ordnade hierarkiskt" / "Places already registered in this database, ordered hierarchically".

If the panel ALSO shows gazetteer suggestions (per Surface contract point 4 — confirm during impl), the header should be split: "Platser i databasen" + "Förslag från gazetteer" as labeled groups.

### Discoverability checklist

Per the Surface contract:
1. The CTA's promise (browse a tree) matches what the user sees on click.
2. The panel's contents are signposted.
3. Filtering inside the panel doesn't silently drop a category of rows.

## Tasks

- [ ] **Audit** — `grep "browseTreeTooltip\|Bläddra plats"` to find the i18n key and consumer; locate the icon and current tooltip.
- [ ] **Audit the opened panel** — confirm what it shows (database places only, gazetteer only, or both). If both, make sure typing in the search field still queries both (Surface contract #4).
- [ ] **Replace / annotate the icon** — pick a clearer glyph from the existing set; if none fits, keep the current icon + add a small hover-revealed text label.
- [ ] **Update tooltip i18n** in both locales.
- [ ] **Add panel header** — one line explaining the rows; group labels if both database + gazetteer rows are shown.
- [ ] **Patch bump** + CHANGELOG: `- fix: place-tree picker icon and tooltip explain what the panel shows`.

## Verification (user-observable)

1. Edit an event's place. Hover the small icon at the right end of the field. Tooltip reads "Browse places already in this database" (or its localized equivalent).
2. Click the icon. The opened panel has a header line explaining what the rows are.
3. Search inside the panel by typing. The result set narrows but does NOT drop categories silently — if both database and gazetteer rows were visible at empty filter, both kinds remain visible after typing (just narrowed).
4. Pick a row. The event's place field updates and closes the panel.

## Failure modes / RCA reference

- **Same as Surface contract #4**: typing in a picker must narrow display, never narrow the data source. Confirm the picker doesn't silently drop a category when the search string is non-empty.
- **Icon set divergence**: don't add a one-off SVG inline. Use the project's icon set.
- **Tooltip and label mismatch**: the panel's title and the icon's tooltip should be consistent — both describe the same "browse places already in the database" concept.
