# Shared Place Coordinate Resolution

**Date:** 2026-04-18
**Status:** Design approved

## Problem

The "check raw lat/lon, fall back to gazetteer" pattern is duplicated across PersonMap, MapView, and PersonDetailView. PersonDetailView had an additional bug: its `checkGeoEvents()` only checked raw coordinates, hiding the Life Map section for places that could be resolved via gazetteers. The fix duplicated even more resolution logic.

## Design

### New function: `resolveCoordinates()` in `usePlaceResolver`

Add one function to the existing `usePlaceResolver` composable:

```ts
function resolveCoordinates(
  place: { latitude: number | null; longitude: number | null },
  placePath: string
): { lat: number; lon: number; resolved: boolean } | null
```

**Logic:**
1. If `place.latitude` and `place.longitude` are both non-null, return them with `resolved: false`
2. Otherwise, call the existing `resolve(placePath)` (which is already cached). If it returns a result, return `{ lat, lon, resolved: true }`
3. Otherwise return `null`

No new files, no new composable. Just one more function returned from `usePlaceResolver()`.

### Consumer changes

**PersonMap.vue** — Replace the inline coordinate resolution block (raw lat/lon check + gazetteer fallback at lines 121-148) with a call to `resolveCoordinates(place, fullPath)`. Place fetching and caching stays as-is in the component.

**MapView.vue** — Same replacement. Already uses `usePlaceResolver`; swap the inline resolution logic for `resolveCoordinates()`.

**PersonDetailView.vue** — Remove `checkGeoEvents()`, `hasGeoEvents` ref, and the `v-if="hasGeoEvents"` guard on the Life Map section. Always render `<PersonMap>`. PersonMap already handles the empty state (`<div class="empty-hint">`). Remove the `usePlaceResolver` import that was added for the visibility check.

**PersonPanel.vue** — Already renders `<PersonMap>` unconditionally (added earlier this session). No changes needed.

### Not changed

**PlaceDetailView.vue** — Uses gazetteer resolution to display match quality, matched path, and unmatched components. This is a UI for inspecting the resolution process, not just "give me coordinates." Different use case, left as-is.

## Files modified

| File | Change |
|------|--------|
| `src/renderer/composables/usePlaceResolver.ts` | Add `resolveCoordinates()` to return value |
| `src/renderer/components/PersonMap.vue` | Use `resolveCoordinates()` instead of inline logic |
| `src/renderer/views/MapView.vue` | Use `resolveCoordinates()` instead of inline logic |
| `src/renderer/views/PersonDetailView.vue` | Remove `checkGeoEvents`, always render PersonMap |
