# Bug Fix: Places UI Font Size Consistency

**Date:** 2026-04-03
**Status:** Pending

## Bug

Places UI uses smaller text than the rest of the app:

- `PlacePicker.vue` input has no explicit `font-size` — inherits browser default (~13px) instead of the app standard 14px
- `PlacePicker` dropdown items use `font-size: 13px`, place-type badge uses `font-size: 11px`
- `PlacesView.vue` list uses `font-size: 13px` for table rows (vs 13–14px pattern elsewhere)
- `PlaceDetailView.vue` label font-size and input styles are consistent but the `type-badge` is `12px` (fine)

Compare: `PersonPicker.vue` input uses `font-size: 14px`, dropdown items `14px`, secondary text `12px`.

## Fix

### PlacePicker.vue

Add explicit `font-size: 14px` to the `input` element (via `.place-picker input` scoped rule), and normalize dropdown font sizes:

```css
.place-picker input { font-size: 14px; }
.dropdown-item { font-size: 14px; }   /* was 13px */
.place-type { font-size: 12px; }       /* was 11px */
```

### PlacesView.vue

The `13px` on the list container and table is consistent with other list views (`PersonsView` is also 13px for table rows). No change needed there — this is intentional table density.

However, the Add Place modal form inputs inherit from the page and may look smaller than EventForm modals. Check if `form input[type='text']` explicitly sets `font-size: 14px` — it already does in PlacesView line 140. No change needed.

## Files to Change

- `src/renderer/components/PlacePicker.vue` — add `font-size: 14px` to input, `14px` to dropdown-item, `12px` to place-type

## Testing

Visual — open the app, go to an event's place field. The PlacePicker input and dropdown should match the same size as PersonPicker autocomplete.
