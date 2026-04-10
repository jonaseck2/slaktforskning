# Fix: Consistent person name rendering across all views

## Problem
Person names were displayed inconsistently depending on where they appeared:
- Charts (pedigree, hourglass, timeline) ignored `nickname` even though `fullNameParts()` supports it
- `RelationshipsView`, `PersonPanel`, `SearchView` rendered via `PersonName` component but omitted `nickname`
- Reports (`FamilyGroupSheet`, `IndividualSummary`, `AncestorChartReport`) and string utilities (`ReportsView.getPersonName`, `SourceDetailView`) used raw `given_name` instead of `preferred_name`, producing "Elisabeth Cathrina Surname" instead of "Elisabeth Surname"
- `ResearchTasksView` stored a pre-formatted string (`person_name`) and displayed it as plain text instead of using the `PersonName` component
- `searchRelationships()` API did not return `preferred_name` or `nickname` columns

## Root Cause
The `PersonName` component and `fullNameParts()` utility already correctly support `preferred_name`, `nickname`, and underline rendering. The inconsistencies were purely in the callers:

1. **Data not fetched**: `chartData.ts` `RawName` type omitted `nickname`; `PersonNode` had no `nickname` field
2. **Props not passed**: Several components fetched the data but did not forward `nickname` to `PersonName`
3. **API gap**: `searchRelationships()` `SELECT` omitted `preferred_name` and `nickname` columns
4. **Wrong field in strings**: Report/audit code used `[given_name, surname].join(' ')` instead of `preferred_name ?? given_name.split(' ')[0]`

## Fix

- **`nameUtils.ts`**: Added `formatPersonName()` — a plain-string formatter that uses `preferred_name ?? first_token_of_given_name` + surname, for report and audit contexts
- **`chartLayout.ts`**: Added `nickname: string | null` to `PersonNode` interface
- **`chartData.ts`**: Added `nickname` to `RawName` type; passed through to returned `PersonNode`
- **Chart components** (PedigreeChart, HourglassChart, TimelineChart): Added `nickname` argument to `fullNameParts()` calls
- **`relationships.ts`**: `searchRelationships()` now selects `preferred_name` and `nickname` for both persons
- **`RelationshipsView.vue`**: Added `nickname` to `NameRow`, `RelRow`, `getPersonNameRow()` return, and `PersonName` props
- **`PersonPanel.vue`**: Added `nickname` to `NameData`, `PersonName` prop
- **`SearchView.vue`**: Added `nickname` to `PersonResult`, `RelationshipResult`, and all `PersonName` props
- **`ResearchTasksView.vue`**: Replaced pre-formatted `person_name` string with raw fields (`person_given_name`, `person_surname`, `person_preferred_name`, `person_nickname`); template now uses `PersonName` component
- **`ReportsView.vue`**: `getPersonName()` now uses `preferred_name ?? first_token`
- **`FamilyGroupSheet.vue`**: `primaryName()` now uses `preferred_name ?? first_token`
- **`IndividualSummary.vue`**: `primaryName()` now uses `preferred_name ?? first_token`
- **`AncestorChartReport.vue`**: `focalName` computed + person rows now use `preferred_name ?? first_token`
- **`SourceDetailView.vue`**: Both `personName` computations now use `preferred_name ?? first_token`

## Files Changed
- `src/api/relationships.ts` — `searchRelationships`: added preferred_name + nickname columns
- `src/renderer/utils/nameUtils.ts` — added `formatPersonName()`
- `src/renderer/utils/chartLayout.ts` — added `nickname` to `PersonNode`
- `src/renderer/utils/chartData.ts` — added `nickname` to `RawName`, passed to `PersonNode`
- `src/renderer/components/charts/PedigreeChart.vue` — nickname in fullNameParts
- `src/renderer/components/charts/HourglassChart.vue` — nickname in fullNameParts
- `src/renderer/components/charts/TimelineChart.vue` — nickname in fullNameParts
- `src/renderer/components/PersonPanel.vue` — nickname in NameData + PersonName
- `src/renderer/views/RelationshipsView.vue` — nickname throughout
- `src/renderer/views/SearchView.vue` — nickname in PersonResult, RelationshipResult, PersonName
- `src/renderer/views/ResearchTasksView.vue` — raw name fields + PersonName component
- `src/renderer/views/ReportsView.vue` — preferred_name in getPersonName
- `src/renderer/views/SourceDetailView.vue` — preferred_name in personName strings
- `src/renderer/components/reports/FamilyGroupSheet.vue` — preferred_name in primaryName
- `src/renderer/components/reports/IndividualSummary.vue` — preferred_name in primaryName
- `src/renderer/components/reports/AncestorChartReport.vue` — preferred_name in name strings
