# Website Export Experience Improvements

**Date:** 2026-05-02
**Branch:** `export-webpage-experience`
**Author:** carlomattsson (via Kiro)

## Summary

This document archives the full spec (requirements, design, and implementation plan) for a set of UX improvements to the HTML website export feature in Släktforskning. The changes improve discoverability, add a single-file export mode, fix a pre-existing media path resolution bug, and add a media file counter.

## Changes Delivered

1. **Renamed "Ämne" → "Fokusperson"** — The section header and hint text now clearly communicate that the user should search for and select a person by name.
2. **Validation indicator** — Green checkmark on the section header when a person is selected. Clicking a disabled export button highlights and expands the section.
3. **Media file counter** — Shows the number of media files next to the "Mediafiler" checkbox, derived from the preview snapshot.
4. **Single-file HTML export** — New "Exportera utan mediafiler till webbläsarfil" button that produces one self-contained HTML file via a save-file dialog.
5. **Media path resolution fix** — The standard export now resolves `file_ref` paths relative to the database directory, fixing media copy on setups where paths are stored as relative.
6. **Two independent export buttons** — Standard export always produces folder structure; single-file export always produces one HTML file. No automatic switching.

## Files Changed

- `src/renderer/i18n/en.ts` — Renamed keys, added new keys
- `src/renderer/i18n/sv.ts` — Renamed keys, added new keys
- `src/renderer/components/ui/SectionHeader.vue` — Added `valid` prop
- `src/renderer/components/WebsitePanel.vue` — Validation highlight, media counter, second button
- `src/renderer/views/WebsiteExportView.vue` — Wired new props/events, added exportSingleFile method
- `src/preload/index.ts` — Exposed `exportSingleFile` channel
- `src/main/ipc/website-export.ts` — New handler + media path resolution fix
- `tests/unit/website-export-i18n.test.ts` — New test file
- `tests/unit/website-export-single-file.test.ts` — New test file
- `tests/unit/ipc-worker-coverage.test.ts` — Added new channel
- `tests/unit/static-api-coverage.test.ts` — No change needed (channel is main-only)
- `.gitignore` — Added `.kiro/`

---


# Requirements Document

## Introduction

Improvements to the HTML website export feature ("Webbplats") in the genealogy application. This feature set addresses usability gaps in the export panel: unclear help text for the subject picker, lack of validation feedback when required fields are missing, missing media file count feedback, a new single-file HTML export mode, and a media path resolution bugfix.

## Glossary

- **Export_Panel**: The right-side configuration panel (`WebsitePanel.vue`) that controls website export settings.
- **PersonPicker**: A typeahead input component that lets the user search for and select a person from the database by name.
- **Subject**: The person selected via the PersonPicker whose family tree defines the export scope.
- **Media_Counter**: A UI element displaying the number of media files that will be included in the export.
- **Single_File_Export**: An export mode that produces one self-contained HTML file with all data inlined (no external media folder or separate asset files).
- **Standard_Export**: The existing export mode that copies a `dist-static` bundle, media files, and a `data.js` file into a chosen folder.
- **Snapshot**: The in-memory data structure built by the worker thread containing persons, places, sources, media metadata, and links for the export.

## Requirements

### Requirement 1: Rename Subject Section and Improve Help Text

As a user, I want the section header and hint text to clearly communicate that I should select a person by name.

- Label the section "Fokusperson" (sv) / "Focus person" (en)
- Hint text: "Sök och välj en person vars släktträd ska exporteras."

### Requirement 2: Subject Validation Indicator

- Green checkmark when a person is selected
- Highlight + auto-expand section when clicking disabled export button
- Clear highlight when person is selected

### Requirement 3: Media File Counter

- Show count next to "Mediafiler" checkbox when checked
- Derived from preview snapshot `totals.media`
- Updates reactively with scope/privacy changes

### Requirement 4: Single-File HTML Export

- Separate button: "Exportera utan mediafiler till webbläsarfil"
- Produces one self-contained HTML file via save-file dialog
- No media, no folders, works from file:// protocol
- Both buttons disabled during any export

### Requirement 5: Fix Media Path Resolution

- Resolve `file_ref` relative to database directory
- Handles both absolute and relative paths
- Skip files not found after resolution

### Requirement 6: Separate Export Buttons

- Two independent buttons, two independent code paths
- Standard export always produces folder structure
- Single-file export always produces one HTML file

---

# Design Document

## Architecture

The standard export (`website:export`) is completely unchanged in logic — it always shows a folder picker, copies dist-static, builds snapshot, copies media, writes data.js. The only addition is resolving `file_ref` paths via `path.resolve(dbDir, m.file_ref)`.

The single-file export (`website:exportSingleFile`) is a new, independent IPC handler that shows a save dialog, builds a snapshot with `includeMedia: false`, generates HTML via `buildPreviewHtml`, and writes one file.

## Key Implementation Details

### Media Path Resolution

```typescript
import { getCurrentDatabasePath } from '../database';
const dbDir = path.dirname(getCurrentDatabasePath());
const absPath = path.resolve(dbDir, m.file_ref);
```

### Single-File Export Handler

```typescript
wrapHandler('website:exportSingleFile', async (opts) => {
  const result = await dialog.showSaveDialog({ ... });
  if (result.canceled) return { canceled: true };
  const snapshot = await callWorker('website:buildSnapshot', { ...opts, includeMedia: false });
  const html = await buildPreviewHtml(snapshot);
  await fsp.writeFile(result.filePath, html, 'utf-8');
  return { canceled: false, outputPath: result.filePath };
});
```

---

# Implementation Plan

All tasks completed. See `.kiro/specs/web-export-improvements/tasks.md` for the full task list with requirement traceability.

## Test Coverage

- `tests/unit/website-export-i18n.test.ts` — 14 tests verifying i18n keys
- `tests/unit/website-export-single-file.test.ts` — 21 tests covering snapshot round-trip, media exclusion, conditional directory creation, and integration scenarios
