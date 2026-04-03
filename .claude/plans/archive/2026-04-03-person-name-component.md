# Plan: PersonName Component & Consistent Preferred Name Underline

**Date:** 2026-04-03
**Status:** Done

## Problem

Preferred name (tilltalsnamn) underline was duplicated in `PersonsView` and `PersonDetailView` only. All other places displaying person names — RelationshipsView, SearchView, VisualizationView header, PersonPicker dropdown, and all three SVG charts — used plain string concatenation with no underline.

## Scope

Extract the underline rendering into a shared component (`PersonName.vue`) and a shared utility (`nameUtils.ts`), then replace all name-rendering sites.

## File Map

| File | Change |
|------|--------|
| `src/renderer/utils/nameUtils.ts` | **New** — `givenNameParts`, `fullNameParts`, `truncateNameParts` |
| `src/renderer/components/PersonName.vue` | **New** — Vue component; takes `givenName`, `surname?`, `preferredName`; renders tokens with `<u class="preferred-token">` |
| `src/renderer/utils/chartLayout.ts` | Add `preferredName: string \| null` to `PersonNode` |
| `src/renderer/utils/chartData.ts` | Fetch `preferred_name` from name records; pass to `PersonNode` |
| `src/renderer/components/charts/PedigreeChart.vue` | Replace `<text>{{ truncate(personName(...)) }}</text>` with `<tspan>` loop; import `fullNameParts`/`truncateNameParts` |
| `src/renderer/components/charts/HourglassChart.vue` | Same |
| `src/renderer/components/charts/TimelineChart.vue` | Same |
| `src/renderer/views/PersonsView.vue` | Replace `givenNameParts()` fn + template with `<PersonName>`; remove duplicate CSS |
| `src/renderer/views/PersonDetailView.vue` | Same |
| `src/renderer/views/RelationshipsView.vue` | Expand `RelRow` to store per-person given/surname/preferred_name; refactor `getPersonName → getPersonNameRow`; use `<PersonName>` |
| `src/renderer/views/SearchView.vue` | Add `preferred_name` to `PersonResult`/`RelationshipResult`; use `<PersonName>` |
| `src/renderer/views/VisualizationView.vue` | Replace `focalName: string` with `focalGivenName/focalSurname/focalPreferredName`; use `<PersonName>` in header |
| `src/renderer/components/PersonPicker.vue` | Import `PersonName`; use in dropdown items |

## Key Decisions

- SVG charts cannot use the HTML `PersonName` component directly — used `<tspan text-decoration="underline">` via the shared `nameUtils` functions instead.
- `PersonName` renders `surname` only if the prop is provided, covering both "given name only" (separate column in lists) and "full name in one cell" (relationships, search) use cases.
- Removed the duplicate `givenNameParts()` function and `.preferred-token` CSS from both views.
