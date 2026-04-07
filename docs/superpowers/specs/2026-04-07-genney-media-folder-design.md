# Genney Media Folder Support — Design

**Date:** 2026-04-07
**Status:** Approved

## Problem

Genney stores media references (FILEREFs) as Windows absolute paths in its Derby database (e.g. `C:\Users\linda\Documents\Genney\media\JA Nord.jpg`). When imported on macOS these paths are broken. Two Genney formats bundle media; one does not:

| Format | Media situation |
|--------|----------------|
| `.backup` | `media/` folder bundled inside archive — files available after extraction |
| `.gcc` | Derby DB only — FILEREFs point to external files not included |
| `.ged` | GEDCOM OBJE FILE tags with Windows paths — files not bundled |

URLs (http/https) also appear in FILEREF and must be passed through unchanged.

## Goals

- `.backup`: auto-remap FILEREFs using the extracted `media/` folder — no user action required
- `.gcc`: optional media folder picker, same UX as Holger/OurKind
- `.ged` (Genney GEDCOM): optional media folder picker before the one-step import

## Non-goals

- Copying media files into the app database directory (out of scope)
- Validating that remapped paths exist on disk

---

## UI Design

`GenneyImportSection.vue` is reorganised into **three distinct sub-sections** (boxes), one per Genney format:

### Box 1 — Genney Backup (.backup)
- "Pick .backup file" button
- After selection, shows filename + "Media: bundled, imported automatically"
- "Import" button (enabled after file picked)
- No media folder picker — auto-detected from extracted `media/` dir

### Box 2 — Genney Kompaktfil (.gcc)
- "Pick .gcc file" button
- "Pick media folder (optional)" button — same pattern as Holger
- Shows selected file path + media dir (if set)
- "Import" button (enabled after file picked)

### Box 3 — Genney GEDCOM (.ged)
- "Pick media folder (optional)" button — stores path in component state
- Shows media dir if set
- "Import GEDCOM" button — opens file dialog + runs import (existing one-step flow), passing `mediaDir` if set

The import result modal (counts + warnings + skipped) is shared across all three flows via existing `genneyReport` state.

---

## Backend Design

### Path remapping function (`transform.ts`)

New local helper:

```ts
function remapGenneyMediaPath(ref: string, mediaDir: string): string {
  if (ref.startsWith('http://') || ref.startsWith('https://')) return ref;
  const idx = ref.search(/[Mm]edia[/\\]/);
  if (idx === -1) return ref; // cannot remap — leave as-is
  const afterMedia = ref.slice(idx + 6).replace(/\\/g, '/');
  return `${mediaDir.replace(/\/$/, '')}/${afterMedia}`;
}
```

Applied in the media import loop (step 10 of `transformGenney`):

```ts
let fileRef = m.FILEREF ?? null;
if (fileRef && opts.mediaDir) fileRef = remapGenneyMediaPath(fileRef, opts.mediaDir);
stmts.insertMedia.run([id, fileRef, ...]);
```

### `transform.ts` — options

Add `mediaDir?: string` to the transform options object passed to `transformGenney`.

### `genney/index.ts` — archive extraction

After `extractArchive()` succeeds:
1. Check if `path.join(tempDir, 'media')` exists
2. If yes → use as `autoMediaDir` and pass to `transformGenney`
3. If `options.mediaDir` is explicitly provided (user-picked for .gcc), that takes precedence

Add `mediaDir?: string` to `GenneyImportOptions`.

### `ipc.ts` — new handler

```ts
wrapHandler('import:genneySelectMedia', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Genney media folder (optional)',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  return { canceled: false, path: result.filePaths[0] };
});
```

Accept `mediaDir?: string` in the `genneyRun` opts and pass it to `importFromGenney()`.

### `.ged` flow — no new IPC needed

`gedcom:import` already accepts `ImportOptions.mediaDir`. The renderer passes:

```ts
window.api.gedcom.import({ profile: 'genney', mediaDir: genneyGedMediaDir.value || undefined })
```

---

## Data Flow

```
.backup picked
  → extractArchive() → tempDir/
      ├── media/         ← auto-detected as mediaDir
      ├── gedcom/
      └── oplc/ (Derby)
  → transformGenney(db, tables, { mediaDir: tempDir/media })
  → remapGenneyMediaPath(fileRef, mediaDir) per MEDIA row

.gcc picked + optional media folder picked
  → extractArchive() → tempDir/ (no media/ dir)
  → transformGenney(db, tables, { mediaDir: user-picked or undefined })

.ged: optional media folder picked, then Import clicked
  → gedcom:import({ profile: 'genney', mediaDir })
  → importGedcom() → existing remapHolgerMediaPath() (reused)
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/import/genney/transform.ts` | Add `remapGenneyMediaPath()`, add `mediaDir` to options, apply in media loop |
| `src/import/genney/index.ts` | Add `mediaDir` to `GenneyImportOptions`, auto-detect from extracted `tempDir/media`, pass to transform |
| `src/main/ipc.ts` | Add `import:genneySelectMedia` handler; accept `mediaDir` in `genneyRun` opts |
| `src/preload/index.ts` | Expose `import.genneySelectMedia` via contextBridge |
| `src/renderer/components/import/GenneyImportSection.vue` | Reorganise into 3 sub-sections with separate file/media pickers |

---

## Testing

- Unit: `remapGenneyMediaPath` with Windows paths, URLs, paths with subdirs, paths without `media\` segment
- Manual: import `genney.backup` → verify `file_ref` values point into extracted `media/` dir; import `Linda_Ahnstedt.gcc` with media folder → verify remapping; import a Genney `.ged` with media folder → verify OBJE FILE remapping via existing Holger path
