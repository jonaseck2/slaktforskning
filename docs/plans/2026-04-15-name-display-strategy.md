# Plan: Name Display Strategy for Charts and Lists

**Status:** Planning
**Date:** 2026-04-15
**Feedback:** Bengt — tilltalsnamn should be primary in charts; maiden vs current name question; charts get crowded with full names.

## Problem

Currently all views show the full given_name + surname consistently. This works for detail views but creates clutter in space-constrained contexts (charts, lists, circle chart). Users expect:

1. **Charts:** Show tilltalsnamn (preferred_name) only, or tilltalsnamn + surname — not all given names
2. **Lists/tables:** Show abbreviated names but indicate tilltalsnamn
3. **Detail views:** Show everything, with tilltalsnamn highlighted
4. **Presentation name:** When a person has multiple names (birth → married → name change), which one is the "display name"?

## Current State

- `preferred_name` field exists on `person_names` — stores the calling name
- `nameUtils.ts` has `formatPersonName()` that formats display names
- Asterisk notation (`Bengt *Gunnar`) auto-sets preferred_name during input
- Charts use `given_name + surname` from the primary (sort_order=0) name

## Design Questions

### Q1: Which name record is the "display name"?

Options:
- **A) Always the primary (sort_order=0) name** — typically the birth name
- **B) The most recent name** (highest sort_order) — shows married/changed name
- **C) User-selectable "display name"** — add a flag to person_names
- **D) Context-dependent** — birth name for genealogy charts, current name for contact-style views

### Q2: How to abbreviate in charts?

Options:
- **A) preferred_name + surname** — e.g. "Gunnar Persson" instead of "Bengt Gunnar Persson"
- **B) First given name + surname** — simpler but ignores tilltalsnamn
- **C) User setting** — let user choose between full/abbreviated/tilltalsnamn-only

### Q3: How to indicate tilltalsnamn in full name display?

Options:
- **A) Bold/italic** the tilltalsnamn within the full name string
- **B) Underline** (Holger convention)
- **C) Small-caps** for non-tilltalsnamn given names
- **D) Show tilltalsnamn first**, rest in parentheses: "Gunnar (Bengt) Persson"

## Recommendation

1. **Display name = most recent name** (highest sort_order) for lists and charts — this shows married/changed names. Birth name shown in detail view.
2. **Charts use preferred_name + surname** when preferred_name exists, falling back to first given name + surname.
3. **Detail views** show full name with preferred_name in **bold** or *italic*.
4. Add a user setting (Settings view) for "Chart name format": Full / Abbreviated / Tilltalsnamn only.

## Implementation Sketch

1. Add `getDisplayName(names: PersonName[])` utility — returns the name record to use for display (latest by sort_order)
2. Add `formatChartName(name: PersonName)` — returns abbreviated name using preferred_name
3. Update chart layouts to use `formatChartName` instead of raw `given_name + surname`
4. Update `PersonNamesTable` to visually indicate tilltalsnamn (bold/underline)
5. Optional: Add chart name format setting to Settings/Database view

## Checklist

- [ ] Discuss with user: which name should be "display name" (birth vs latest)?
- [ ] Discuss with user: preferred abbreviation style for charts
- [ ] Implement `getDisplayName` + `formatChartName` utilities
- [ ] Update chart box rendering
- [ ] Update circle chart rendering
- [ ] Update PersonNamesTable visual indicator
- [ ] Add settings option (if desired)
- [ ] Test with real multi-name persons
