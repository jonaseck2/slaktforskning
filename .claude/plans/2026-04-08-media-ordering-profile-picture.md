# Media Ordering, Profile Picture & Export Fix

**Date:** 2026-04-08
**Status:** Approved

## Summary

Add sort_order to media_links so users can control media display order. The first media for a person becomes the profile picture, shown in the person detail header and used as the primary image in exports. Fix the ancestor book report to not crop images to square.

## 1. Data Layer

### Schema change
Add `sort_order INTEGER NOT NULL DEFAULT 0` to `media_links` table.

### API changes (src/api/media.ts)
- `reorderMediaLink(db, linkId, newSortOrder)` — update sort_order for a single link
- `getMediaForEntity` — change ORDER BY from `m.title` to `ml.sort_order, ml.created_at`
- `addMediaLink` — auto-assign sort_order as max(sort_order)+1 for that entity

### Migration
ALTER TABLE media_links ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0.
In schema.ts, add the column to CREATE TABLE and add a migration in initializeSchema.

## 2. Import — Preserve GEDCOM OBJE ordering

In import-core.ts, when importing OBJE nodes for a person, assign sort_order based on encounter order (0, 1, 2, ...). This preserves the original file ordering so the first OBJE becomes the profile picture.

## 3. UI — PersonMediaSection reordering

Add up/down arrow buttons to each media row in PersonMediaSection. The first row shows a subtle "Profile" badge. Moving up/down swaps sort_order values and re-fetches.

IPC: add `media:reorder` channel mapping to `reorderMediaLink`.
Preload: add `window.api.media.reorder(linkId, newSortOrder)`.
MCP: add `reorder_media_link` tool.

## 4. UI — Profile picture in PersonDetailView header

Add a thumbnail to the left of the person name in the detail-header. Load the first media for the person via `media:forEntity` + `media:readAsDataUrl`. Show a sex-based placeholder icon when no media.

Layout: flex row with thumbnail (80x80, object-fit: contain, rounded) on left, existing header-info on right.

Also show profile picture in PersonPanel header area.

## 5. Export fix — AncestorBookReport

Change .ab-photo-img from:
- `width: 160px; height: 120px; object-fit: cover` (crops to rectangle)
To:
- `max-width: 160px; max-height: 200px; object-fit: contain; width: auto; height: auto` (preserves aspect ratio)

## 6. GEDCOM export — media ordering

`emitMediaBlocks` already calls `getMediaForEntity`, which will now return in sort_order. No changes needed — the first OBJE emitted will be the profile picture.

## Non-goals

- Drag-and-drop reordering (up/down buttons are sufficient)
- Parsing OBJE DATA tag dimensions (browser handles aspect from image data)
- Cropping/editing images in-app
