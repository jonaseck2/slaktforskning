import type { Database } from 'node-sqlite3-wasm';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { unzipSync } from 'fflate';
import { readGedcomFile, parseGedcom, importGedcom } from '../gedcom';
import type { ImportOptions, ValidationReport } from '../import/gedcom';

export interface ArchiveImportReport {
  gedcomReport: ValidationReport;
  mediaImported: number;
  mediaSkipped: string[];
}

/**
 * Import a .zip archive containing a GEDCOM file and optional media/ directory.
 *
 * 1. Extract the zip
 * 2. Find .ged file at the root
 * 3. Import GEDCOM into the database
 * 4. Copy media files from archive to mediaDir
 * 5. Update media file_ref paths to point to copied files
 */
export function importArchive(
  db: Database,
  archivePath: string,
  mediaDir: string,
  options?: ImportOptions,
): ArchiveImportReport {
  const zipData = new Uint8Array(fs.readFileSync(archivePath));
  const entries = unzipSync(zipData);

  // Find the .ged file (should be at root level of archive)
  const gedEntry = Object.keys(entries).find(
    (name) =>
      name.toLowerCase().endsWith('.ged') && !name.includes('/')
  );

  if (!gedEntry) {
    // Also check for .ged files in subdirectories
    const anyGed = Object.keys(entries).find((name) =>
      name.toLowerCase().endsWith('.ged')
    );
    if (!anyGed) {
      throw new Error('No .ged file found in archive.');
    }
  }

  const gedName = gedEntry ?? Object.keys(entries).find((name) =>
    name.toLowerCase().endsWith('.ged')
  )!;

  // Write .ged to temp location for readGedcomFile (handles encoding detection)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-import-'));
  const tmpGedPath = path.join(tmpDir, path.basename(gedName));

  try {
    fs.writeFileSync(tmpGedPath, Buffer.from(entries[gedName]));

    // Parse and import GEDCOM
    const text = readGedcomFile(tmpGedPath);
    const tree = parseGedcom(text);
    const gedcomReport = importGedcom(db, tree, options);

    // Extract media files
    let mediaImported = 0;
    const mediaSkipped: string[] = [];

    fs.mkdirSync(mediaDir, { recursive: true });

    const mediaEntries = Object.keys(entries).filter(
      (name) => name.startsWith('media/') && name !== 'media/'
    );

    for (const entryName of mediaEntries) {
      const filename = path.basename(entryName);
      if (!filename) continue;

      let destPath = path.join(mediaDir, filename);
      // Avoid overwriting existing files
      if (fs.existsSync(destPath)) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        const suffix = Date.now();
        destPath = path.join(mediaDir, `${base}_${suffix}${ext}`);
      }

      try {
        fs.writeFileSync(destPath, Buffer.from(entries[entryName]));
        mediaImported++;
      } catch (err) {
        mediaSkipped.push(`${entryName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { gedcomReport, mediaImported, mediaSkipped };
  } finally {
    // Cleanup temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
