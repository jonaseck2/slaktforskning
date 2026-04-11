---
title: PlacePanel — Map Side Panel for Places
date: 2026-04-11
status: approved
---

# PlacePanel — Map Side Panel for Places

## Overview

Add a side panel to MapView that shows comprehensive place details when a map pin is clicked. Mirrors the PersonPanel pattern in VisualizationView. Places become a first-class citizen alongside persons.

## Architecture

### Component: PlacePanel.vue

New component at `src/renderer/components/PlacePanel.vue`, modeled on PersonPanel.

- **Props:** `placeId: string | null`
- **Section state:** `useSectionState` composable with localStorage prefix `map-panel-section-`
- **Data loading:** Watcher on `placeId` (not `onMounted`), same pattern as PersonPanel

**Header:** Place name + place type badge + close button. Router-link to full `/places/:id` detail view.

### Sections

| # | Section | Default Open | Data Source | Component Strategy |
|---|---------|-------------|------------|-------------------|
| 1 | Place | yes | `getPlace()` | Inline editable fields (name, type, parent, coords) — same pattern as PlaceDetailView |
| 2 | Address | no | Same place object | Inline editable fields (street, postal code, city, country) |
| 3 | Child Places | no | `listPlaces()` filtered by `parent_place_id` | Simple list with router-links |
| 4 | Persons | yes | New API: `getPersonsForPlace(db, placeId)` | New `PlacePersonsSection` component |
| 5 | Events | yes | EventList with new `placeId` prop | Reuse `EventList` component |
| 6 | Citations | no | `getCitationsForPlace(db, placeId)` | New `PlaceCitationsSection` component |
| 7 | Media | no | `getMediaForEntity("place", placeId)` | New `PlaceMediaSection` or adapt PersonMediaSection pattern |
| 8 | Media Timeline | no | `getMediaTimeline("place", placeId)` | Reuse `MediaTimeline` component directly (already supports places) |

### MapView Integration

- **Layout:** Flex — map on left, PlacePanel on right (when open)
- **Pin click:** Sets `selectedPlaceId` reactive ref instead of navigating to `/places/:id`
- **Drag handle:** Between map and panel for resizing, reuse VisualizationView drag pattern
- **Persistence:** Panel open state (`map-panel-open`) and width in localStorage
- **Toggle:** Close button (arrow-left) collapses panel; reopen button (arrow-right) on map edge

## New API Function

### `getPersonsForPlace(db, placeId)` in `src/api/places.ts`

Returns unique persons linked to events at the place, with primary name and event role.

SQL: JOIN `events` -> `event_participants` -> `persons` -> `person_names` WHERE `events.place_id = ?`.

Returns: `(Person & { given_name, surname, event_count: number })[]`

## IPC / Preload Changes

### New IPC channel: `events:forPlace`

- **Main handler:** Calls existing `getEventsForPlace(db, placeId)` from `src/api/events.ts`
- **Preload:** `window.api.events.forPlace(placeId)`

### New IPC channel: `places:getPersons`

- **Main handler:** Calls new `getPersonsForPlace(db, placeId)`
- **Preload:** `window.api.places.getPersons(placeId)`

## EventList Changes

Add optional `placeId` prop to `EventList.vue`. When set, load events via `window.api.events.forPlace(placeId)` instead of person/relationship paths. Only one of `personId`, `relationshipId`, or `placeId` should be set.

## MCP Server

No new MCP tools needed — existing `get_place_history` and `get_citations_for_place` cover the data. The `getPersonsForPlace` API function will be available if an MCP tool is added later.

## Reuse Summary

| Existing Component | Reused In |
|-------------------|-----------|
| `EventList` | Events section (with new `placeId` prop) |
| `MediaTimeline` | Media Timeline section (already supports places) |
| `useSectionState` | All collapsible sections |
| Drag handle pattern from VisualizationView | Panel resize |
| PlaceDetailView field layout | Place + Address sections |

| New Component | Purpose |
|--------------|---------|
| `PlacePanel.vue` | The side panel container |
| `PlacePersonsSection.vue` | Persons linked to events at the place |
| `PlaceCitationsSection.vue` | Citations linked to the place |
