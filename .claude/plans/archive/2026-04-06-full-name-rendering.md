# Fix: Consistent Full Name Rendering Across Reports

## Problem
Reports showed truncated names — only the preferred name token or the first given name word — instead of the full name with all given names, nickname in quotes, and prefix/suffix.

Examples for a person named "Lena 'Lenny' Maja Holm f. Petersdotter":
- Ancestor chart report title: "Stamtavla för Lena Holm f. Petersdotter"
- Individual summary title: "Lena"
- Ancestor book ahnentafel list: "Lena Holm f. Petersdotter"
- Family group sheet: same truncation

## Root Cause
Four report components each defined a local `primaryName()` or `displayName()` function with the same broken pattern:

```typescript
const first = n.preferred_name ?? n.given_name?.split(' ')[0] ?? '';
return [first, n.surname].filter(Boolean).join(' ');
```

This takes only the **first token** of `given_name` (or the `preferred_name` field, which is also just one token), discarding all other given names, the nickname, and any prefix/suffix.

Additionally, `IndividualSummary.vue` used `data.preferredName` (a single token) as the report title, falling back to `data.primaryName` only when `preferredName` was null.

The root cause was code duplication: `nameUtils.ts` already had `fullNameParts()` that correctly handles all given names + nickname in the right position, but report components never imported it.

## Fix

**`src/renderer/utils/nameUtils.ts`**:
- Added `formatFullName(name)` — the canonical plain-string function for all non-component contexts
- Delegates to the existing `fullNameParts()` to get all given names + nickname in the correct position, then prepends `name_prefix` and appends `name_suffix`
- Deprecated `formatPersonName()` with a JSDoc comment pointing to `formatFullName()`

**`src/renderer/components/reports/FamilyGroupSheet.vue`**:
- Added `nickname`, `name_prefix`, `name_suffix` to `RawName` interface
- Replaced `primaryName()` body with `formatFullName(sorted[0])`
- Added import

**`src/renderer/components/reports/AncestorChartReport.vue`**:
- Added `nickname` to local `PersonNode` interface
- Replaced both inline `first = p.preferredName ?? p.givenName?.split(' ')[0]` patterns with `formatFullName()`
- Added import

**`src/renderer/components/reports/IndividualSummary.vue`**:
- Added `nickname`, `name_prefix`, `name_suffix` to `RawName` interface
- Replaced `primaryName()` body with `formatFullName(sorted[0])`
- Fixed template title: removed `data.preferredName ||` prefix so it always shows the full name
- Removed `preferredName` from `SummaryData` interface (no longer needed)
- Added import

**`src/renderer/components/reports/AncestorBookReport.vue`**:
- Added `nickname`, `name_prefix`, `name_suffix` to `RawName` interface
- Replaced `displayName(p: PersonNode)` with `formatFullName({...p fields})`
- Replaced the separate `resolvePersonName()` first-token pattern with `formatFullName(n)`
- Added import

**`.claude/skills/add-feature/SKILL.md`**:
- Added UI consistency rule: "Always use `formatFullName()` for plain-text name rendering"
- Documents the prohibition on inline first-token logic and local `primaryName()` functions

## Files Changed
- `src/renderer/utils/nameUtils.ts` — add `formatFullName()`, deprecate `formatPersonName()`
- `src/renderer/components/reports/FamilyGroupSheet.vue` — use `formatFullName()`
- `src/renderer/components/reports/AncestorChartReport.vue` — use `formatFullName()`
- `src/renderer/components/reports/IndividualSummary.vue` — use `formatFullName()`, fix title
- `src/renderer/components/reports/AncestorBookReport.vue` — use `formatFullName()`
- `.claude/skills/add-feature/SKILL.md` — document the rule