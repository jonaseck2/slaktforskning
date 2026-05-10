/**
 * Holger/OurKind import orchestrator.
 *
 * Accepts:
 *   - A .ged file → used directly with profile='holger'
 *   - A .zip file → unzipped to a temp dir; the largest .ged inside is used
 *   - A folder → recursively scanned for .ged files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { unzipSync } from 'fflate';
import type { Database } from 'node-sqlite3-wasm';
import { readGedcomFile } from '../../gedcom/encoding';
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
    });
    console.log(`[import-timing] importGedcom — ${Date.now() - tImport}ms — persons=${report.persons} families=${report.families} places=${report.places}`);
    progress(`Done — ${report.persons} persons, ${report.families} families`);
    return { report, gedPath };
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

