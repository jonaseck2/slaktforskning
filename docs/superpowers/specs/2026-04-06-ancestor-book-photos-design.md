# Ancestor Book — Photos Feature

**Date:** 2026-04-06

## Goal

Show person-linked photos (with notes) inside each person summary in the Ancestor Book report.

## Placement

After the Relationer and Anteckningar subsections, before Källor.

## Data

- Source: `window.api.media.forEntity('person', personId)` — returns all media linked to the person
- File paths: `window.api.media.getFilePath(id)` — returns absolute path or `null` if missing
- Image src: `file://<absolutePath>` (works in Electron renderer and PDF export)
- Skip media items where `getFilePath` returns `null`

## Layout

Flex row, wrapping. Each photo:
- `<img>` max 160px wide, max 120px tall, `object-fit: cover`
- Note text below (11px, `pre-line` for multiline)
- If no note, show `title` in italic as caption
- Section heading "Foton", only rendered if `media.length > 0`

## Changes

### `AncestorBookReport.vue`

1. Add `RawMedia` and `EnrichedMedia` interfaces
2. Add `media: EnrichedMedia[]` field to `AncestorEntry`
3. In `fetchAncestorFullData`: fetch `media.forEntity` + `media.getFilePath` for each item; filter missing files
4. Add `<!-- Foton -->` subsection in the template after Anteckningar, before Källor

## Constraints

- No new IPC handlers needed (`forEntity` and `getFilePath` already exist)
- No schema changes
- Section is invisible for persons with no media
