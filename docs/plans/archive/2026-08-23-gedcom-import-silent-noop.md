# Fix: GEDCOM import did nothing, silently

## Problem

Picking a `.ged` file in Import/Export produced no preview modal, no status line,
no toast, and nothing in the console. The button read as dead. Reported against
`export-import/min släkt/ArkivDigital_Farfars+släktträd.ged` (776 KB, GEDCOM
5.5.1, UTF-8, 206 INDI) with an empty `sanna.db` open.

The file was never the problem. Running the parser standalone over it returned
`{ personCount: 206, relationshipCount: 314, eventCount: 1313, sourceCount: 793,
placeCount: 431 }` with one benign warning (`Unknown top-level tag: SUBN`).

## Root Cause

Two return-envelope mismatches between the renderer bindings and the component,
both introduced when the Electron worker channels were ported to Tauri
(`f98ab956`, `f6fddffd`). The Electron originals are in `4c976586`.

**1. Preview — the reported symptom.** `src/shared/channels/import.ts` returned
`{ canceled: false, filePath, preview }`. The Tauri binding returned the bare
`ImportPreview`. `GedcomImportSection.handlePreviewGedcom` reads:

```ts
if (result.canceled) return;          // undefined → falsy, no return
if (result.preview) { … }             // undefined → block never runs
                                       // no else → function ends silently
```

Neither branch logged anything, so the failure had no observable trace at all.
Confirmed live against the running app before the fix:
`{"hasPreview":false,"hasCanceled":false}`.

**2. Import — masked behind (1).** `gedcom:import` was wrapped in
`withImportLifecycle`, returning `{ success, report, error }`. The Tauri binding
returned `importGedcom`'s raw `ValidationReport`, which has no `success` field.
`proceedImport` would therefore have taken its failure branch on every
successful import: `importError` status plus an error toast, and no report modal.
Every sibling importer binding (`holgerRun`, `genneyRun`, `grampsRun`,
`rootsmagicRun`) returns `{ success: true, … }`; only `gedcom.import` did not.

**3. `.zip` support dropped.** `gedcom.selectFile` filters on
`['ged', 'gedcom', 'zip']`, but the port fed zip bytes straight into
`decodeGedcomBytes`. The Electron handler extracted the largest `.ged` entry
first.

**4. Media consolidation dropped.** The Electron handler called
`consolidateMediaFolder` after import. `.claude/rules/media.md` requires every
import path to do this. Two of the four ArkivDigital files carry `OBJE` refs
(Farmors 2, Mormors 11).

### Why no test caught it

`tests/e2e/imports.spec.ts` threw only when `success === false`, explicitly
documenting that it tolerated "either the report payload or the failure
envelope". A bare report satisfied that check, so nine import cases stayed green
across the regression.

Tightening that assertion exposed two further problems in the e2e harness, each
of which had made the suite unable to catch a renderer regression at all:

- **`packagedBinaryPath()` preferred the bundled `.app` unconditionally.** A
  bundle built 2026-06-17 shadowed every fresh `build:e2e` binary, so for two
  months the suite exercised two-month-old renderer code.
- **`SLAKTFORSKNING_DB` sat below persisted state in the boot chain.**
  `src/renderer/main.ts` resolved the DB as Rust `CURRENT_PATH` →
  `localStorage["slaktforskning-last-db-path"]` → `default_db_path()`, and only
  the last of those honours the env var. The raw binary shares WebKit
  localStorage with the dev app, so an isolated run opened the developer's own
  22 243-person tree: `expect(beforeCount).toBe(0)` → `Received: 22243`.

## Fix

`src/renderer/tauri-window-api.ts` — restore both envelopes, extract `.ged` from
a `.zip` in memory via fflate (no temp file, unlike the Electron path), and call
`holgerConsolidateMedia` after import.

`src/renderer/components/import/GedcomImportSection.vue` — add the missing
`else`: anything that is neither a cancel nor a preview surfaces a status line,
a toast, and a console error. Defence in depth, so a future envelope drift is
visible rather than silent.

`tests/e2e/imports.spec.ts` — require `success === true` rather than merely
tolerating a missing field.

`tests/e2e/fixture.ts` — pick the newest binary by mtime across the bundled
`.app` / AppImage and the raw `--no-bundle` output.

`src-tauri/src/lib.rs` + `src/renderer/main.ts` — new `db_path_override()`
command exposes `SLAKTFORSKNING_DB` to the renderer, and it now sits at the top
of the boot resolution order. An explicit process-level directive outranks
persisted user state.

## Files Changed

- `src/renderer/tauri-window-api.ts` — preview and import envelopes, zip unwrap helper, media consolidation
- `src/renderer/components/import/GedcomImportSection.vue` — error branch instead of a silent return
- `src/renderer/main.ts` — env override at the top of the DB boot chain
- `src-tauri/src/lib.rs` — `db_path_override()` command
- `src/renderer/bindings.ts` — Specta regeneration
- `tests/e2e/fixture.ts` — newest-binary-wins resolution
- `tests/e2e/imports.spec.ts` — require the success envelope
- `tests/unit/tauri-window-api.test.ts` — both envelopes plus zip unwrap
- `tests/components/GedcomImportSection-flow.test.ts` — new: pick → preview → import, plus the silent-no-op guard

## Verification

All six new tests fail against the pre-fix tree.

```
npm test                                4472 passed (49.33s), 305 files
npm run test:e2e:full                    175 passed (2.7m), 8 projects
npx playwright test --project=imports      9 passed (18.8s)
npm run lint                            48 problems (0 errors) — unchanged
vue-tsc                                 0 errors in src/ and tests/
npm run build:e2e                       Finished release profile in 23.96s
```

Live in the running app: the reported file imported into `sanna.db` as 206
persons, 314 relationships, 1313 events, 431 places, 793 sources.
