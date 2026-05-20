/**
 * Holger/OurKind import orchestrator.
 *
 * Accepts:
 *   - A .ged file → used directly with profile='holger'
 *   - A .zip file → unzipped to a temp dir; the largest .ged inside is used
 *   - A folder → recursively scanned for .ged files
 *
 * Two entry points:
 *
 * 1. `importFromHolger(db, opts)` — Electron-side. Does its own fs work
 *    (zip extract via fflate, file walks, file reads). Used by the worker
 *    channel in src/shared/channels/import.ts.
 *
 * 2. `importFromHolgerWithBytes(db, gedBytes, options)` — bytes-in, no fs.
 *    Decodes encoding-aware, parses, runs `importGedcom` with the Holger
 *    profile. The Tauri renderer's polyfill calls this after the Rust side
 *    has extracted the .ged from any zip + bulk-copied the media folder
 *    into `<dbname>-media/`. Mirrors `importFromGrampsBytes` shape.
 *
 * ── T25 audit (2026-05-20) ────────────────────────────────────────────────
 * Holger 8 exports plain GEDCOM 5.5.1 (ANSI). All Holger imports go through
 * the standard GEDCOM importer at `src/import/gedcom/` with `profile='holger'`
 * (see `src/import/gedcom/profiles/holger.ts` for the per-profile branches).
 * Consequently every new T02 schema concept that the GEDCOM 5.5.1 importer
 * already handles is automatically handled for Holger too:
 *
 *  - SNOTE shared notes        → Holger 8 emits inline NOTE only (no SNOTE in
 *                                 5.5.1); the GEDCOM importer's `phaseNotes`
 *                                 still handles top-level NOTE records the
 *                                 same way. No additional mapping needed.
 *  - ASSO person associations  → Holger 8 emits ASSO RELA on events (witness-
 *                                 shaped), which the GEDCOM importer routes
 *                                 to `event_participants` with role mapping.
 *                                 Pure-INDI ASSO without event (the
 *                                 `person_associations` shape) is rare in
 *                                 Holger exports but the GEDCOM importer's
 *                                 phaseAsso handles it when it appears.
 *  - NO negative assertions    → Not present in Holger 5.5.1 exports
 *                                 (Holger has no UI for negative assertions).
 *  - NAME/TRAN translations    → Not present (Holger is single-script
 *                                 Swedish; the GEDCOM importer's tranCount
 *                                 stays at 0 for Holger inputs).
 *  - PLAC/TRAN translations    → Not present (same reason).
 *  - SOUR/DATA/EVEN coverage   → Not emitted by Holger; the GEDCOM importer
 *                                 maps it when present in other 5.5.1 files.
 *  - sex='X'                   → Holger UI has M/F/U only; never emits X.
 *  - HEAD preservation         → Holger 5.5.1 HEAD is handled by the GEDCOM
 *                                 importer's phaseHeaderMetadata.
 *  - Extended date qualifiers  → Standard 5.5.1 DATE qualifiers; same shape.
 *
 * Holger-specific custom tags handled in `profiles/holger.ts`:
 *   - ENGA TYPE on FAM         → couple subtype (Sambo/Partner/Parter/Särbo)
 *   - ADOP on INDI with FAMC   → parent_child subtype override
 *   - _NOTE / _TODO / _GROUP   → either rolled into person notes (`REMA`,
 *                                 `MISC` — counted via `holgerRemarkCount`)
 *                                 or surfaced via the GEDCOM importer's
 *                                 vendor-extension warnings.
 *
 * No Holger-specific concepts remain unmapped for the T02 Phase 2 work.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { unzipSync } from 'fflate';
import type { Database } from 'node-sqlite3-wasm';
import { readGedcomFile, decodeGedcomBytes } from '../../gedcom/encoding';
import { parseGedcom } from '../../gedcom/parser';
import { importGedcom } from '../../import/gedcom';
import type { ImportReport } from '../../import/gedcom';

// ---------------------------------------------------------------------------
// GEDCOM path types
// ---------------------------------------------------------------------------

export interface HolgerImportOptions {
  /** Path to a .ged file, .zip file, or folder */
  sourcePath: string;
  /**
   * Optional: path to the local OurKind Media directory.
   * If supplied, Windows-style FILE paths in OBJE records are remapped here.
   */
  mediaDir?: string;
  onProgress?: (msg: string) => void;
}

export interface HolgerImportResult {
  report: ImportReport;
  gedPath: string;
}

// ---------------------------------------------------------------------------
// GEDCOM helpers
// ---------------------------------------------------------------------------

const HOLGER_EXPORT_INSTRUCTIONS =
  'No GEDCOM file found. Export from Holger: Arkiv → Exportera GEDCOM → ' +
  'Generellt format, teckenrepresentation ANSI. Then provide the .ged or .zip file.';

function pickGedFromFolder(folderPath: string): string | null {
  const walk = (dir: string): string[] => {
    let results: string[] = [];
    try {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) results = results.concat(walk(full));
          else if (entry.toLowerCase().endsWith('.ged')) results.push(full);
        } catch { /* skip unreadable entries */ }
      }
    } catch { /* skip unreadable dirs */ }
    return results;
  };
  const files = walk(folderPath).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  return files[0] ?? null;
}

// ---------------------------------------------------------------------------
// GEDCOM import
// ---------------------------------------------------------------------------

export async function importFromHolger(
  db: Database,
  opts: HolgerImportOptions,
): Promise<HolgerImportResult> {
  const { sourcePath, mediaDir, onProgress } = opts;
  const progress = (msg: string) => onProgress?.(msg);

  let gedPath: string;
  let tmpDir: string | null = null;

  const stat = fs.statSync(sourcePath);
  const ext = path.extname(sourcePath).toLowerCase();

  if (stat.isDirectory()) {
    // Folder: scan recursively for .ged files
    const found = pickGedFromFolder(sourcePath);
    if (!found) throw new Error(HOLGER_EXPORT_INSTRUCTIONS);
    gedPath = found;
    progress(`Found ${path.basename(gedPath)} in folder`);
  } else if (ext === '.zip') {
    // Zip: extract to temp dir, find largest .ged
    progress('Extracting zip…');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holger-'));
    const zipBuf = fs.readFileSync(sourcePath);
    const entries = unzipSync(new Uint8Array(zipBuf));
    const gedEntries = Object.entries(entries)
      .filter(([name]) => name.toLowerCase().endsWith('.ged'))
      .sort(([, a], [, b]) => b.length - a.length);
    if (gedEntries.length === 0) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      throw new Error(HOLGER_EXPORT_INSTRUCTIONS);
    }
    const [gedName, gedData] = gedEntries[0];
    gedPath = path.join(tmpDir, path.basename(gedName));
    fs.writeFileSync(gedPath, Buffer.from(gedData));
    progress(`Using ${path.basename(gedPath)} from zip`);
  } else if (ext === '.ged') {
    // Direct .ged file
    gedPath = sourcePath;
  } else {
    throw new Error(`Unsupported file: ${ext}. Provide a .ged or .zip file.`);
  }

  try {
    progress('Reading GEDCOM…');
    const tRead = Date.now();
    const text = readGedcomFile(gedPath);
    console.log(`[import-timing] readGedcomFile — ${Date.now() - tRead}ms — ${text.length} chars`);
    progress('Parsing GEDCOM…');
    const tParse = Date.now();
    const tree = parseGedcom(text);
    console.log(`[import-timing] parseGedcom — ${Date.now() - tParse}ms — ${tree.length} top-level nodes`);
    progress('Importing…');
    const tImport = Date.now();
    const report = await importGedcom(db, tree, {
      profile: 'holger',
      ...(mediaDir ? { mediaDir } : {}),
      onProgress: progress,
    });
    console.log(`[import-timing] importGedcom — ${Date.now() - tImport}ms — persons=${report.persons} families=${report.families} places=${report.places}`);
    progress(`Done — ${report.persons} persons, ${report.families} families`);
    return { report, gedPath };
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Bytes-in entry — used by the Tauri renderer's polyfill
// ---------------------------------------------------------------------------

export interface HolgerImportFromBytesOptions {
  /** Local directory for remapping Windows-style OBJE FILE paths.
   *  e.g. 'C:\\OurKind\\Media\\P12\\photo.jpg' -> '{mediaDir}/P12/photo.jpg' */
  mediaDir?: string;
  onProgress?: (msg: string) => void;
}

/**
 * Run the Holger import against a GEDCOM byte buffer. Pure TS, no fs —
 * the caller (Tauri renderer polyfill) is responsible for any zip extract,
 * any media-folder copy, and post-import media consolidation. Mirrors the
 * same parse + importGedcom flow as `importFromHolger` after step 3, just
 * without the path-based file reads.
 */
export async function importFromHolgerWithBytes(
  db: Database,
  gedBytes: Uint8Array,
  options: HolgerImportFromBytesOptions = {},
): Promise<{ report: ImportReport }> {
  const { mediaDir, onProgress = () => { /* noop */ } } = options;
  onProgress('Decoding GEDCOM…');
  const text = decodeGedcomBytes(gedBytes);
  onProgress('Parsing GEDCOM…');
  const tree = parseGedcom(text);
  onProgress('Importing…');
  const report = await importGedcom(db, tree, {
    profile: 'holger',
    ...(mediaDir ? { mediaDir } : {}),
    onProgress,
  });
  onProgress(`Done — ${report.persons} persons, ${report.families} families`);
  return { report };
}

