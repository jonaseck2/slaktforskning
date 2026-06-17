# Packaged-app import and panel-link fixes

## 1. User goal

In the packaged desktop app:
- Importing a **Gramps `.gpkg`** brings in the people *and* their photos correctly — each photo stored beside the database (a relative `<db>-media/<file>` ref), not left as a broken absolute path.
- Importing a **Genney `.gcc`** succeeds end-to-end (the bundled GEDCOM is read back after the sidecar extracts it) instead of failing with "No such file or directory".
- Linking a source to a media item from the media side shows the link reciprocally on the source side ("Linked Sources").

These are three pre-existing failures in the Tauri-only paths that don't surface in the Node/MCP path.

## 2. Scope

Each is a renderer/Tauri-path defect (the shared core logic is correct — the Gramps importer produces a relative `file_ref` when exercised via the MCP/Node path; verified 2026-06-17). Targets:

- **gramps-gpkg `file_ref`** — `src/renderer/tauri-window-api.ts` `api.import.grampsRun` (the `mediaWriter`/`mediaFolderName` are set only `if (cur)` from `dbCurrentPath()`; when media isn't written the absolute `fileSrc` is never rewritten). Cross-check `src/import/gramps/index.ts` rewrite logic.
- **genney-gcc sidecar read** — the Bun-sidecar GEDCOM-fallback path (`src/import/genney/` + the `import.genneyRun` binding); the extracted `.ged` must survive the sidecar tempdir cleanup before the renderer reads it back (regressed variant of the fix in `docs/plans/archive/2026-05-15-genney-e2e-path-resolution.md`).
- **Media→Source reciprocal link** — `src/renderer/components/...` Media panel "Källor"/source-link section + the source panel "Linked Sources" section; the `[panels]` e2e at `tests/e2e/panel-surface.spec.ts:653`.

**Scope deviations:** these three are independent root causes, grouped only because they're the open Tauri-path e2e reds. Each is verified separately against its e2e project.

## 3. Verification

1. **User-observable:** in the built app, a `.gpkg` import shows photos (relative refs on disk); a `.gcc` import lands its persons; linking a source to media shows on both panels.
2. **The check that proves it:** `npx playwright test --project=imports --project=panels` goes green — specifically the `gramps-gpkg`, `genney-gcc`, and "Media → Source link reciprocal" specs that fail today.
3. Each fix verified against the **packaged Tauri binary** (these defects don't reproduce in unit tests or the MCP/Node path).

## 4. Failure modes / RCA reference

Diagnosed 2026-06-17 while triaging the `test:e2e:full` reds. The Gramps core importer was proven correct via `import_file` on a clean DB (relative `file_ref`), isolating the bug to the renderer `grampsRun` binding. Genney references the prior tempdir-cleanup fix (`archive/2026-05-15-genney-e2e-path-resolution.md`). These need the rebuild-iterate loop (≈10 min bundle + ≈3 min e2e per cycle) — unit tests and the dev MCP cannot reach these paths.

## Tasks

- [ ] **T01 (Tier 1)** — gramps-gpkg: trace why the renderer `grampsRun` leaves an absolute `file_ref` (is `dbCurrentPath()` empty in the harness, or is the rewrite skipped?); fix so the bundled media is written and `file_ref` is rewritten to `<db>-media/<basename>`. Verify `npx playwright test --project=imports -g gramps-gpkg`.
- [ ] **T02 (Tier 1)** — genney-gcc: restore the extracted `.ged` surviving sidecar tempdir cleanup; fix and verify `npx playwright test --project=imports -g genney-gcc`.
- [ ] **T03 (Tier 1)** — Media→Source reciprocal link: trace why "Linked Sources" never appears on the source panel after linking from media; fix and verify `npx playwright test --project=panels -g "link a source from"`.
- [ ] **T04 (Tier 1)** — Run `npm test`, `npm run build`, and `npm run test:e2e:full`; capture per-project pass counts.
- [ ] **T-final (Tier 1)** — Invoke `/close-out` skill.
