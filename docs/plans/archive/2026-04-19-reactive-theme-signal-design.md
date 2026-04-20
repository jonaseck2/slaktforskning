# Reactive theme/appearance signal for chart components

## Problem

Chart components (PedigreeChart, HourglassChart, DescendantChart, CircleChart, FanChart; Timeline and others forthcoming) read theme tokens through helpers that call `getComputedStyle(document.documentElement)` inside Vue `computed(...)` blocks:

- `useChartColors(true)` in `src/renderer/composables/useChartColors.ts`
- `readThemeColors()`, `isDarkMode()`, `isHighContrast()` in `src/renderer/utils/circleColors.ts`

Theme and appearance switches mutate `document.documentElement.classList` (see `App.vue:166-178` for `setTheme` / `setAppearance`). CSS-var-driven style properties (`color: var(--text-primary)`) update automatically via the cascade, but inline SVG attributes bound to JS color objects (`:fill="nameColor(box)"`) do not — the `computed` has no reactive dependency on the class list, so its result is cached forever until the component is remounted. Users see the chart stuck in the old palette after switching theme.

Report chart components (CircleChartReport, FanChartReport, future entries) will have the same need.

## Scope

- New composable that publishes a `themeVersion` ref, incremented whenever `document.documentElement`'s class list changes.
- `useChartColors.ts` depends on it so the existing `computed` re-runs on theme change.
- New Circle/Fan wrapper composable that mirrors the pattern for `readThemeColors` + `isDarkMode` + `isHighContrast`.
- Two consumer chart components (CircleChart, FanChart) switched from the raw helpers to the new wrapper.
- Component test exercising theme switches against a mounted chart.

Out of scope: refactoring the pure `circleColors.ts` helpers themselves; changing how charts use color internally; wiring the remaining charts (they already use `useChartColors(true)`, so once the signal is installed they reactivate automatically).

## Architecture

### New file: `src/renderer/composables/useThemeSignal.ts`

```
themeVersion: Ref<number>  // module-level singleton, starts at 0
```

On module load (guarded with `typeof document !== 'undefined'` for SSR/test-env safety), attach a single `MutationObserver` to `document.documentElement` watching the `class` attribute. On every mutation: `themeVersion.value++`. The observer is never disconnected — this is an app-lifetime singleton, not a per-component subscription.

Exports:
- `themeVersion` — the ref itself, suitable for registering as a reactive dependency inside `computed(...)`.
- `useThemeSignal()` — convenience function that returns `themeVersion` (for call-site symmetry with other composables).

### `useChartColors.ts` modification

Inside the existing `computed(...)` in `useChartColors(true)`, read `themeVersion.value` on the first line. No other behaviour changes — the themed branch already does a fresh `getComputedStyle` read each time it runs.

The non-themed branch (`useChartColors(false)`) keeps returning `EXPORT_COLORS` by reference and does NOT depend on `themeVersion` (invariance tests guarantee this stays true).

### New file: `src/renderer/composables/useCircleThemeColors.ts`

Wraps the pure helpers in a `computed` keyed off `themeVersion`:

```
function useCircleThemeColors() {
  return computed(() => {
    themeVersion.value;  // register dep
    return {
      theme: readThemeColors(),
      dark: isDarkMode(),
      highContrast: isHighContrast(),
    };
  });
}
```

Returns a single combined object so callers don't need three separate computeds.

### Consumer updates

- `CircleChart.vue` and `FanChart.vue`: replace the three `computed(() => ...)` calls that wrap `readThemeColors` / `isDarkMode` / `isHighContrast` with a single `const chartTheme = useCircleThemeColors()` and update callsites to `chartTheme.value.theme` / `.dark` / `.highContrast`.

## Data flow

```
user toggles theme in Settings
  → App.vue setTheme/setAppearance mutates html.classList
  → MutationObserver fires
  → themeVersion.value++
  → all computeds depending on themeVersion invalidate
  → useChartColors(true) re-reads getComputedStyle(document.documentElement)
  → useCircleThemeColors() re-reads readThemeColors/isDarkMode/isHighContrast
  → chart `:fill` / `:stroke` attributes re-bind with new values
```

## Testing

One new component test (`tests/components/themeSignal.test.ts`) that:

1. Mounts a minimal wrapper component that exposes `useChartColors(true).value.text` and `useCircleThemeColors().value.dark`.
2. Toggles `document.documentElement.classList` across: no-class, `dark`, `high-contrast`, `theme-nordic`, `theme-nordic dark`.
3. Awaits `nextTick()` after each toggle.
4. Asserts the exposed values actually change (proves reactivity works end-to-end).

Also extend `tests/unit/exportColorInvariance.test.ts` with a case that toggles the class list and asserts `useChartColors(false)` *still* returns `EXPORT_COLORS` by reference (i.e., the reactivity plumbing didn't accidentally make the non-themed branch reactive).

## Success criteria

- Changing theme or appearance in a running app updates every chart's inline SVG color attributes immediately, without remount or navigation.
- All existing tests pass; new tests pass.
- `useChartColors(false)` remains theme-invariant (unit test still green).
