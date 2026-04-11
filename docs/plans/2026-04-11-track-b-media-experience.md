# Track B: Media Experience

Source: [competitor gap analysis](2026-04-11-competitor-gap-analysis.md)

Step-by-step evolution from file table to rich media management. Each milestone builds on the previous.

---

## B1: Media Viewer Redesign [feature]

Entity-oriented media experience with lightbox, thumbnails, and multi-entity linking.

### Steps

- [x] Redesign MediaView.vue — replace file table with responsive grid/gallery layout
- [x] Thumbnail generation: use Electron nativeImage to create thumbnails on media attach, store in app data dir
- [x] Show entity badges on each media card (linked persons, events, places, sources with counts)
- [x] Create MediaLightbox.vue — full-size image overlay with:
  - [x] Prev/next navigation (arrow keys)
  - [x] Escape to close
  - [x] Title, format, notes display
  - [x] Linked entities panel with clickable router-links
  - [x] Link/unlink entity controls (PersonPicker, PlacePicker for adding links)
- [x] Non-image media: show file icon with type label, "Open in system app" button
- [x] Update PersonMediaSection to open lightbox on click
- [x] Update media cards across all entity detail views to use lightbox
- [x] Gallery filtering: filter by entity type, search by title
- [x] i18n for all new UI elements
- [x] Keyboard navigation in gallery grid (arrow keys to move, Enter to open lightbox)

### Dependencies
None — works with existing media schema.

### Key decisions
- Thumbnails are generated locally and cached in app data (not stored in DB)
- Lightbox is a shared component used everywhere media appears
- Non-image media (audio, video, PDF) get appropriate icons, not broken image previews
- Entity badges show at-a-glance what each media item is linked to

---

## B2: Media-Bundled Portable Archive [feature]

Export GEDCOM + all referenced media files as a single .zip archive. Import detects and unpacks archives.

### Steps

- [x] Add `archiver` (or `jszip`) dependency for zip creation
- [x] Create `src/api/archive_export.ts`:
  - [x] `exportArchive(db, outputPath, options?)` — generates GEDCOM + copies media files into zip
  - [x] Media organized in `media/` subdirectory within archive
  - [x] GEDCOM OBJE FILE references rewritten to relative paths (`media/filename.jpg`)
  - [x] Apply export content options (from A2) if available
- [x] Create `src/api/archive_import.ts`:
  - [x] Detect .zip files in import dialog
  - [x] Extract archive to temp directory
  - [x] Find .ged file within archive
  - [x] Import GEDCOM as normal
  - [x] Copy media files from archive to app's media directory
  - [x] Re-link media file_ref paths to new locations
- [x] IPC channels: `archive:export`, `archive:import`
- [x] Preload: expose `window.api.archive.export()`, `window.api.archive.import()`
- [x] Vue: export button in ImportExportView with "Include media" checkbox
- [x] Import: file dialog accepts .zip in addition to .ged
- [x] Progress indicator for large archives (many media files)
- [x] MCP tools: `export_archive`, `import_archive`
- [x] Unit tests: round-trip test (export archive → import into fresh DB → verify media links intact)
- [x] Handle edge cases: duplicate filenames, missing media files (warn but continue), very large archives

### Dependencies
Existing GEDCOM export/import infrastructure.

### Key decisions
- Standard .zip format — no proprietary archive format
- Media paths in GEDCOM are relative, making the archive self-contained
- Import copies files (doesn't reference archive location) so archive can be deleted after import
- Missing media files produce warnings, not errors

---

## B3: Media Timeline [feature]

Chronological media display across a person's life or a place's history.

### Steps

- [x] Create `src/api/media_timeline.ts`:
  - [x] `getMediaTimeline(db, entityType, entityId)` — returns media items with associated dates
  - [x] For persons: media linked to person or their events, dated by event date
  - [x] For places: media linked to events at this place, dated by event date
  - [x] Sort by date, group undated media separately
- [x] IPC channel: `media:getTimeline`
- [x] Create MediaTimeline.vue component:
  - [x] Horizontal scrollable timeline with year markers
  - [x] Thumbnail cards positioned by date along the timeline
  - [x] Undated section at the end
  - [x] Click thumbnail to open lightbox (B1)
  - [x] Hover shows event type + date
- [x] Add as tab/section in PersonDetailView ("Media Timeline" tab)
- [x] Add as section in PlaceDetailView
- [x] Wire into PersonPanel (collapsible section)
- [x] i18n for timeline labels and empty states
- [x] Handle date ranges: "between" dates span a range on the timeline
- [x] Handle approximate dates: "about 1920" shown with fuzzy positioning

### Dependencies
B1 (lightbox component for click-to-view).

### Key decisions
- Timeline is entity-scoped (per person or per place), not a global media timeline
- Dating comes from linked events, not from media metadata (we don't parse EXIF here)
- Undated media is shown but clearly separated, not mixed in

---

## B4: Face/Region Tagging — Manual [feature]

Select a rectangle in a photo, link it to a person, optionally use as profile picture.

### Steps

- [ ] Schema: add `media_regions` table:
  ```sql
  CREATE TABLE IF NOT EXISTS media_regions (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    label TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  ```
- [ ] API: `src/api/media_regions.ts`:
  - [ ] `createMediaRegion(db, { media_id, person_id?, x, y, width, height, label? })`
  - [ ] `getMediaRegions(db, mediaId)`
  - [ ] `getRegionsForPerson(db, personId)`
  - [ ] `deleteMediaRegion(db, id)`
  - [ ] `updateMediaRegion(db, id, { person_id?, label? })`
- [ ] IPC channels for all region CRUD operations
- [ ] Preload: expose `window.api.mediaRegions.*`
- [ ] Lightbox enhancement: region drawing mode
  - [ ] Click "Tag face" button to enter drawing mode
  - [ ] Click and drag to draw rectangle overlay
  - [ ] PersonPicker popup to assign the region to a person
  - [ ] Show existing regions as labeled overlays (person name badges)
  - [ ] Click region to edit/delete
- [ ] "Use as profile" button on a region — crops and sets as profile media
- [ ] Profile thumbnail generation: canvas crop of region → save as new media or update existing
- [ ] MCP tools: `create_media_region`, `get_media_regions`, `delete_media_region`, `get_regions_for_person`
- [ ] i18n for tagging UI
- [ ] Unit tests for region CRUD
- [ ] Update GEDCOM export to include region data as custom tags (if no standard exists)

### Dependencies
B1 (lightbox is the host for the tagging UI).

### Key decisions
- Coordinates are stored as fractions (0.0–1.0) of image dimensions for resolution independence
- Person assignment is optional — regions can exist without a linked person
- Profile picture from region is a convenience feature, not a separate system

---

## B5: Face/Region Tagging — MCP for AI [feature]

MCP tools for AI agents to suggest face bounding boxes and person assignments.

### Steps

- [ ] MCP tool `get_media_file_base64` — returns media file as base64 string for agent vision processing
- [ ] MCP tool `get_media_metadata` — returns file size, dimensions, format (EXIF if available)
- [ ] MCP tool `get_untagged_media` — list media items with zero regions, ordered by linked person count (most connected first)
- [ ] MCP tool `suggest_media_regions` — agent provides array of `{ x, y, width, height, person_id?, confidence? }`, creates regions
- [ ] MCP tool `get_persons_for_matching` — returns persons with existing region crops (base64) for face comparison
- [ ] Document agent workflow: step-by-step guide for using Claude Desktop to batch-tag photos
- [ ] Example prompt templates for face detection and person matching
- [ ] Unit tests for each MCP tool
- [ ] Rate considerations: document image size limits and recommend downscaling for large photos

### Dependencies
B4 (media_regions table and API).

### Key decisions
- Agent does ALL vision processing — app has zero AI/ML dependencies
- `suggest_media_regions` creates regions directly (agent has already made the decision)
- Confidence field is optional metadata, not used for filtering (agent decides what to submit)
- Workflow docs are as important as the tools — users need to know how to use this
