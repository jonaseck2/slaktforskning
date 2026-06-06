# 2026-06-06 — Gramps `.gpkg` archive import (design spec)

> **Status:** design spec. Implementation plan: `2026-06-06-gramps-gpkg-archive-import.md` (sibling, written after this spec is approved).
> **Unblocks:** `2026-05-31-gramps-binary-fixtures.md` Task 2 (the `.gpkg` e2e fixture becomes honestly testable once a real unpack branch exists).

## Problem

A Gramps **`.gpkg`** ("Gramps package") export is a **gzipped tar** containing the family-tree XML plus a `media/` folder. The current importer (`src/import/gramps/index.ts`) only does **gunzip-or-utf8 → parse as XML**. There is no tar/zip extraction and no media-folder unpack anywhere in the Gramps path.

Empirically (importer run against three forms, 2026-06-06):

| `.gpkg` form | importer result | reality |
|---|---|---|
| zip (`PK…`) | `persons=0 events=0 media=0`, **no error** | `PK` ≠ gzip magic → raw zip bytes `.toString('utf-8')` → regex parser finds nothing. **Silent empty import.** |
| tar.gz (real Gramps) | `persons=3 events=3 media=1` | gunzip → tar bytes → regex parser *accidentally* scans tar-bytes-as-string and finds the embedded XML tags. `media=1` is from the `<object>` XML tag only — **the actual media file is never extracted to disk.** |

So `.gpkg` import is effectively broken: zip-form imports nothing; tar.gz-form "works" by accident and drops every media file. The "`.gpkg` unpack-and-remap-media branch" that the fixtures plan's user goal names does not exist.

## User goal

When a user imports a Gramps `.gpkg` package, the persons/events/etc. import **and** the bundled media files land in `<dbname>-media/` with relative `file_ref`s — exactly as if they'd imported the `.gramps` XML and attached the photos. Works from both the desktop file picker (`import.grampsRun`) and the MCP `import_file` tool.

## Approaches considered

- **(A) `mediaWriter`-callback core, injected per caller — chosen.** Mirrors the existing `src/api/archive_import.ts` pattern. The runtime-neutral importer extracts archive entries and pipes media bytes through a caller-supplied `(filename, bytes) => Promise<void>` writer. Keeps `src/import/` free of `fs`; works for both the renderer (no Node fs) and MCP (has fs).
- **(B) Extract in the renderer IPC handler only — rejected.** Leaves the MCP `import_file` path dropping media.
- **(C) Untar in Rust — rejected.** Adds a Rust dependency + a new command for a problem solvable in TS with `nanotar` + `fflate`. Over-engineered.

## Architecture (Approach A)

### Dependency

Add **`nanotar`** (`^0.3.0`, zero-dependency, ESM+CJS, bundled types) for tar parsing. `fflate` (already a dep) handles gzip; `nanotar` handles the tar layer. `parseTar(data: Uint8Array) → { name: string, data: Uint8Array, ... }[]`.

### Extraction core — `src/import/gramps/`

1. **Container detection (magic bytes), in `index.ts`:**
   - gzip magic `1f 8b` → `gunzipSync` (fflate or `node:zlib`).
   - If the (gunzipped) bytes parse as a tar with ≥1 entry → **`.gpkg`** path.
   - Otherwise → existing **`.gramps`** XML path, **unchanged**.
2. **`.gpkg` path:**
   - `parseTar(bytes)` → entries.
   - **XML entry:** the lone non-`media/` entry (commonly `data.gramps`). If it carries gzip magic, gunzip it again (inner XML may be plain or gzipped). Throw a clear `read:`-prefixed error if no XML entry is found.
   - **Media entries:** every `media/<basename>` entry.
   - Parse XML via existing `transformGramps` (reused unchanged).
   - For each media entry, `await mediaWriter(basename, bytes)`.
   - **file_ref rewrite:** after transform, rewrite media `file_ref` to `<mediaFolderName>/<basename>` via SQL `UPDATE`, exactly like `archive_import.ts:88-98`. Refs become relative per `media.md`.
3. **Signature change:** the importer accepts an optional `mediaWriter` + `mediaFolderName` (mirrors `importArchiveFromBytes`). When absent (e.g. plain `.gramps`), media handling is unchanged from today.

### Callers

- **Renderer** (`import.grampsRun`, `src/renderer/tauri-window-api.ts`): inject a writer that base64-encodes bytes → `commands.fsWriteBytesBase64(getMediaDir(dbPath)+'/'+filename, b64)`; pass `getMediaFolderName(dbPath)`. After import, call `consolidateMediaFolder` as the idempotent safety-net (per `media.md`).
- **MCP / path variant** (`importFromGramps`, used by `import_file`): inject an `fs`-backed writer (the sidecar has Node fs) writing into `getMediaDir`. Shared extraction core.

## Out of scope / unchanged

- `.gramps` (plain or gzipped XML) path — unchanged; existing unit tests stay green.
- Schema — **no new columns** → no `gedcom_fidelity_registry` change.
- `transform.ts` media parsing — reused; the `file_ref` folder rewrite lives in `index.ts` post-transform (SQL `UPDATE`), not in `transform.ts`.
- Zip-form `.gpkg` — out of scope. Real Gramps writes tar.gz; a non-standard zip `.gpkg` is not a target.

## Data fidelity

Relocating the user's own `.gpkg` media into `<dbname>-media/` and rewriting its `file_ref` to a relative path is a **deterministic relocation of an authored value** — the same allowance `media.md`'s Prime Directive grants `archive_import` and Genney `.backup`. No inference; nothing computed is persisted beyond the relative path the convention requires.

## Error handling

- Media entry that can't be read/written → skip + record in `summary.mediaSkipped` (mirror `archive_import`'s `mediaSkipped[]`); do not abort the whole import.
- No XML entry found in the tar → throw `read: no Gramps XML found in .gpkg`.
- `nanotar` long-name (GNU/PAX) entries: verify `nanotar` surfaces the real `media/<name>`; covered by the unit test using a realistic filename.

## Testing & verification

### Unit (`tests/unit/`)
Build a tar.gz `.gpkg` in-test (gzip a tar of `data.gramps` + `media/blank.png`), run `importFromGramps`/core with an **in-memory writer**, assert:
- `summary.persons === 3`, `summary.media === 1`.
- the media row's `file_ref === '<folder>/blank.png'` (relative, rewritten).
- the in-memory writer received `blank.png` with the PNG bytes.
- the existing `.gramps` XML cases still pass (regression).

### User-observable (the real goal)
- MCP `import_file` on a real tar.gz `.gpkg` → `persons=3` **and** the PNG physically exists at `<dbname>-media/blank.png`. Verifiable via a unit/integration test with a real fs writer, or via dev MCP against the running app.
- **Deliberate-red:** break the untar step (`throw` before `parseTar`) → the `.gpkg` test goes red with that message; revert.

### CI gates
- `npm test` — new unit test + existing Gramps unit tests green.
- `npm run build` — exits 0.
- `npm run test:e2e:full` — importer touched → required. (The `.gpkg` e2e fixture itself is delivered by the unblocked `2026-05-31-gramps-binary-fixtures.md` plan, not this one.)

## Failure modes / RCA reference

- Parent discovery: this spec exists because executing `2026-05-31-gramps-binary-fixtures.md` Task 2 surfaced that the `.gpkg` branch it assumed does not exist (importer run 2026-06-06).
- Pattern source: `src/api/archive_import.ts` (`ArchiveMediaWriter`, `mediaFolderName` rewrite) and `src/import/genney/index.ts` (`.backup` media-folder extraction) are the established precedents this design follows.
