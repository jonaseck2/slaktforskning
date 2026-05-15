/**
 * Imports — Task 5 of e2e-expansion.
 *
 * Boots the packaged Tauri app, invokes each importer against a real fixture
 * via `window.api`, and asserts the expected number of persons landed in the
 * DB via `window.api.persons.list()`. Catches build-system regressions
 * (sidecar pkg, async/ESM holes, fs/dialog wiring) and importer logic
 * regressions in one pass.
 *
 * USER GOAL: "When I introduce an importer regression, a test fails before I
 *             see the bug in the running app."
 *
 * The recent history of importer breakage — Holger bulk-batching regressions,
 * unawaited Statement.run/get/all, media/checks polyfill gaps — was every
 * single time discovered by importing a real file. No test caught them. This
 * file is the regression net for that class.
 *
 * SCOPE: covers what real fixtures we have. The e2e-expansion plan listed
 * seven importers; only GEDCOM (5.5.1 + 7.0) and the dialect-flavoured
 * GEDCOM exports from Holger/RootsMagic/Gramps are exercised here, because
 * native binary fixtures (`.gcc`, `.backup`, `.rmgc`/`.rmtree`, `.gramps`,
 * `.gpkg`) don't yet exist in `tests/fixtures/`. Hand-authoring those is
 * deferred to a follow-up plan — TODOs are marked inline below.
 *
 * Each test owns its own Tauri instance + temp DB; teardown removes them so
 * regression nets stay independent (no cross-pollution between formats).
 */

import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  startApp,
  teardownApp,
  AppDriver,
  PROJECT_ROOT,
  type AppInstance,
} from './fixture';

const PORT = 19254;

interface ImportCase {
  /** Stable, filesystem-safe identifier used in the temp-DB tag + test name. */
  format: string;
  /** Path to the fixture, relative to PROJECT_ROOT. */
  fixture: string;
  /**
   * Dot-path against `window.api` (e.g. `'gedcom.import'`, `'import.holgerRun'`).
   * The renderer's tauri-window-api.ts mounts these via the auto-walked
   * channel shape.
   */
  apiCall: string;
  /**
   * Build the args object for the api call. Different importers take
   * different shapes:
   *   - gedcom.import:        { filePath, profile? }
   *   - import.holgerRun:     { sourcePath, mediaDir? }
   *   - import.rootsmagicRun: { sourcePath } (or { filePath })
   *   - import.grampsRun:     { filePath }
   */
  buildArgs: (absPath: string) => Record<string, unknown>;
  /**
   * Person count after import. Re-derived from the fixture's INDI records
   * minus any non-INDI `0 @...@` records (SUBM, etc.).
   */
  expectedPersons: number;
  /**
   * Spot-check substring that must appear among the imported persons'
   * names (verified against `window.api.persons.list()`). Optional —
   * leave undefined if the fixture has no reliably-readable names.
   */
  spotCheckName?: string;
}

// Deferred coverage — native binary importer formats
// ===================================================
// The cases below cover each importer's GEDCOM-export dialect path via
// gedcom.import (and import.holgerRun for the holger profile). That covers
// the importer LOGIC, where almost all regressions actually happen.
//
// Native binary format DECODING is NOT covered here:
//   - Genney .gcc / .backup (XML inside a zip)
//   - RootsMagic .rmgc / .rmtree (SQLite database file)
//   - Gramps .gramps / .gpkg (XML, optionally zipped with media)
//   - Holger .zip with embedded media (the bare-.ged case below skips the
//     zip-extract + Windows-path-remap branch)
//
// Un-defer trigger (one is enough):
//   (a) A native-format regression escapes into production and a user
//       reports it. Add the failing case + minimal fixture as a regression
//       test (this is the canonical "test the bug we just fixed" path).
//   (b) A contributor with the source apps wants to author fixtures.
//       Spec: a tiny 3-person family tree exported from each app to its
//       native binary format, committed under
//       tests/e2e/fixtures/imports/<format>.
//
// Until then, the GEDCOM-dialect cases below are the right cost/value point.
const CASES: ImportCase[] = [
  // --- GEDCOM 5.5.1 -------------------------------------------------------
  // tests/fixtures/gedcom/minimal.ged has 1 INDI ("Anna Svensson") + 1 SUBM.
  // Smallest possible 5.5.1 happy-path.
  {
    format: 'gedcom-551-minimal',
    fixture: 'tests/fixtures/gedcom/minimal.ged',
    apiCall: 'gedcom.import',
    buildArgs: (p) => ({ filePath: p }),
    expectedPersons: 1,
    spotCheckName: 'Anna',
  },
  // tests/fixtures/gedcom/large_family.ged has 24 INDI records — exercises
  // multi-person families, relationships, and the bulk insert path.
  {
    format: 'gedcom-551-large-family',
    fixture: 'tests/fixtures/gedcom/large_family.ged',
    apiCall: 'gedcom.import',
    buildArgs: (p) => ({ filePath: p }),
    expectedPersons: 24,
    spotCheckName: 'Anders',
  },

  // --- GEDCOM 7.0 ---------------------------------------------------------
  // Hand-authored 3-person family for the 7.0 happy path (covered in detect.ts).
  {
    format: 'gedcom-70',
    fixture: 'tests/e2e/fixtures/imports/gedcom-70.ged',
    apiCall: 'gedcom.import',
    buildArgs: (p) => ({ filePath: p }),
    expectedPersons: 3,
    spotCheckName: 'Anna',
  },

  // --- Holger (GEDCOM-export flavour) -------------------------------------
  // The native Holger export is a .zip-containing-.ged, which `import.holgerRun`
  // handles via `holger_extract_ged` + remap-Windows-paths. The dialect fixture
  // is a bare .ged authored to mirror Holger 8's export shape; running it
  // through `import.holgerRun` exercises the holger-profile importGedcom path.
  {
    format: 'holger-dialect',
    fixture: 'tests/fixtures/gedcom/dialects/holger.ged',
    apiCall: 'import.holgerRun',
    buildArgs: (p) => ({ sourcePath: p }),
    expectedPersons: 2,
  },
  // TODO: needs a tiny Holger .zip fixture (`.ged` + Windows-style OBJE FILE
  // refs) to exercise the zip-extract + path-remap branch of holgerRun.

  // --- Gramps (GEDCOM-export flavour) -------------------------------------
  // The native Gramps importer reads `.gramps` (XML, sometimes gzipped) or
  // `.gpkg` (zipped XML+media). We don't yet have a tiny fixture for either,
  // so we exercise gramps's GEDCOM-export dialect through `gedcom.import`
  // (gramps's `gramps.ged` dialect fixture exists and has 2 INDI records).
  {
    format: 'gramps-dialect',
    fixture: 'tests/fixtures/gedcom/dialects/gramps.ged',
    apiCall: 'gedcom.import',
    buildArgs: (p) => ({ filePath: p }),
    expectedPersons: 2,
  },
  // TODO: needs a tiny `.gramps` XML fixture to exercise `import.grampsRun`'s
  // native path (importFromGrampsBytes + fs_read_bytes_base64 round-trip).

  // --- RootsMagic (GEDCOM-export flavour) ---------------------------------
  // Native rootsmagic import reads `.rmgc` / `.rmtree` as a secondary SQLite
  // DB. No tiny SQLite fixture exists. The dialect fixture (3 INDI) exercises
  // the rootsmagic-flavour GEDCOM through `gedcom.import`.
  {
    format: 'rootsmagic-dialect',
    fixture: 'tests/fixtures/gedcom/dialects/rootsmagic.ged',
    apiCall: 'gedcom.import',
    buildArgs: (p) => ({ filePath: p }),
    expectedPersons: 3,
  },
  // TODO: needs a tiny `.rmgc` SQLite fixture (≤ 20 rows) to exercise
  // `import.rootsmagicRun`'s native path (fs_read_bytes_base64 → temp file →
  // SecondaryDatabase.open → importFromRootsMagicDb).

  // --- Genney ------------------------------------------------------------
  // The .gcc fixture is a zip containing only `export.ged` — exercises the
  // Bun-sidecar spawn (resource-path resolution under `tauri build
  // --no-bundle`) AND the encrypted-archive / no-Derby-DB GEDCOM-fallback
  // branch (sidecar copies the extracted .ged out of its short-lived tempDir
  // to a sibling temp path, returns that path, renderer reads it back via
  // fs_read_bytes_base64, runs the existing GEDCOM importer, and cleans up
  // via fs_remove_file). Bug found by this test on 2026-05-15: the
  // importer's `finally` deleted the tempDir while the fallback path still
  // pointed inside it, so the renderer's subsequent read failed with `read:
  // No such file or directory (os error 2)`. Fixed in
  // docs/plans/2026-05-15-genney-e2e-path-resolution.md by copying the .ged
  // to a stable sibling temp file before cleanup.
  {
    format: 'genney-gcc',
    fixture: 'tests/e2e/fixtures/imports/genney-small.gcc',
    apiCall: 'import.genneyRun',
    buildArgs: (p) => ({ sourcePath: p }),
    expectedPersons: 3,
  },
  // TODO: needs a tiny `.backup` fixture that contains an unencrypted Derby
  // DB (not just a .ged), to exercise the Bun-sidecar → Docker/Java → Derby
  // extractor → transformGenney path. Authoring requires either a Genney
  // install or a minimal Derby DB hand-built from the SCHEMA the Genney
  // importer's transform.ts expects. Deferred until a contributor with
  // Genney can drop one in.
];

for (const c of CASES) {
  test(`imports: ${c.format} round-trips into the DB`, async () => {
    let app: AppInstance | undefined;
    try {
      app = await startApp(PORT, c.format);
      const driver = new AppDriver(PORT);
      await driver.setLocale('en');

      // Sanity — fresh DB has zero persons.
      const beforeCount = await driver.executeJs<number>(
        `(async () => (await window.api.persons.list()).length)()`,
      );
      expect(beforeCount, 'fresh e2e DB unexpectedly has persons').toBe(0);

      // Run the import. The Tauri shim returns either the report payload
      // (success) or `{ success: false, error }` (failure); both shapes are
      // serialised back from /eval.
      const absPath = path.join(PROJECT_ROOT, c.fixture);
      const args = c.buildArgs(absPath);
      const result = await driver.executeJs<{ success?: boolean; error?: string } | unknown>(
        `window.api.${c.apiCall}(${JSON.stringify(args)})`,
      );
      if (
        result &&
        typeof result === 'object' &&
        'success' in result &&
        (result as { success?: boolean }).success === false
      ) {
        throw new Error(
          `import returned failure envelope: ${(result as { error?: string }).error ?? 'unknown'}`,
        );
      }

      // Poll the person count until the import's data-changed event has
      // propagated. The renderer's `useEntityData`/`usePagedList` debounce
      // ~150-200 ms; we poll up to 5 s before failing.
      let persons: Array<{ given_name?: string; surname?: string; preferred_name?: string }> = [];
      for (let i = 0; i < 50; i++) {
        persons = await driver.executeJs<typeof persons>(`window.api.persons.list()`);
        if (persons.length >= c.expectedPersons) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      expect(
        persons.length,
        `${c.format}: expected ${c.expectedPersons} persons, got ${persons.length}`,
      ).toBe(c.expectedPersons);

      if (c.spotCheckName) {
        // Build a flat string of every name-shaped field on every person row
        // and assert the spot-check substring appears. Tolerant to whichever
        // column (given_name / surname / preferred_name / name) the importer
        // populates.
        const allNames = persons
          .map((p) => [
            p.given_name,
            p.surname,
            p.preferred_name,
            (p as Record<string, unknown>).name,
          ].filter((s): s is string => typeof s === 'string' && s.length > 0).join(' '))
          .join(' | ');
        expect(
          allNames,
          `${c.format}: imported persons do not contain spot-check name "${c.spotCheckName}"`,
        ).toContain(c.spotCheckName);
      }
    } finally {
      await teardownApp(app);
    }
  });
}
