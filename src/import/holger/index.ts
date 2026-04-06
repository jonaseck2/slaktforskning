/**
 * Holger/OurKind import orchestrator.
 *
 * Accepts:
 *   - A .ged file — used directly
 *   - A .zip file — unzipped to a temp dir; the largest .ged inside is used
 *   - A folder — recursively scanned for .ged files; the largest is used
 *
 * In all cases, calls importGedcom() with profile='holger'.
 * If no .ged is found in a zip or folder, throws with instructions for
 * exporting GEDCOM from Holger.
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

export interface HolgerImportOptions {
  /** Path to a .ged file, .zip file, or folder */
  sourcePath: string;
  /**
   * Optional: path to the local OurKind Media directory.
   * If supplied, Windows-style FILE paths in OBJE records are remapped here.
   * Example: '/Users/me/OurKind/Media'
   */
  mediaDir?: string;
  onProgress?: (msg: string) => void;
}

export interface HolgerImportResult {
  report: ImportReport;
  gedPath: string;
}

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
    const text = readGedcomFile(gedPath);
    progress('Parsing GEDCOM…');
    const tree = parseGedcom(text);
    progress('Importing…');
    const report = importGedcom(db, tree, {
      profile: 'holger',
      ...(mediaDir ? { mediaDir } : {}),
    });
    progress(`Done — ${report.persons} persons, ${report.families} families`);
    return { report, gedPath };
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
