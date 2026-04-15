# Plan: Media Detail/Editor Rework

**Status:** Planning
**Date:** 2026-04-15
**Feedback:** Bengt — "Can I add media text to a media item? I can't find that option."

## Problem

The current media UI is attachment-oriented: attach files to entities, view thumbnails, open/unlink. There's no dedicated media editor for viewing and editing media metadata (title, notes, format). The `notes` field exists in the schema but isn't easily accessible.

## Goals

- Let users view and edit media metadata (title, notes, format) inline
- Provide a table-based media list view (similar to QualityView pattern)
- Support editing media text/description easily

## Design Options

### Option A: Table-Based MediaView (dedicated route)

A new `/media` route with a table listing all media items. Columns: thumbnail, title, format, linked entities, file status. Click a row to expand inline editor or open a detail panel.

**Pros:** Consistent with other list views (PersonsView, SourcesView). Full overview of all media.
**Cons:** Requires new route, sidebar entry.

### Option B: Right-Hand Side Panel (PersonPanel-style)

When clicking a media item anywhere in the app, open a MediaPanel on the right side showing full details + edit form.

**Pros:** Contextual editing without leaving current view. Familiar pattern from PersonPanel.
**Cons:** More complex to wire up from multiple entry points.

### Option C: Modal Editor

Click a media item → modal with metadata fields (title, notes, format) + preview.

**Pros:** Simplest to implement. Reusable from any context.
**Cons:** Modals are limiting for rich editing.

## Recommendation

**Start with Option A** (table-based MediaView) as the primary media management interface. This gives users a dedicated place to manage all media, consistent with the existing pattern for persons, sources, places. Add inline editing for title/notes fields.

Consider Option B as a future enhancement for contextual editing from charts and detail views.

## Implementation Sketch

1. Add `/media` route + `MediaView.vue` (table: thumbnail, title, format, linked entities, notes preview)
2. Add `media:update` IPC handler (already exists in API: `updateMedia` if available, otherwise add)
3. Inline edit for title + notes columns (blur-to-save, like PersonDetailView fields)
4. Media detail expansion: click row to show full notes editor + linked entities list
5. Add "Media" entry to sidebar navigation
6. Update i18n for media management strings

## Open Questions

- Should MediaView support bulk operations (multi-select delete, re-link)?
- Should there be a media gallery view (grid of thumbnails) as an alternative to table?
- How to handle orphaned media (no entity links)?

## Checklist

- [ ] Brainstorm session with user on table vs panel vs modal
- [ ] Design mockup / wireframe
- [ ] Implement MediaView table
- [ ] Add inline edit for title/notes
- [ ] Add sidebar navigation entry
- [ ] Update i18n
- [ ] Test with real data
