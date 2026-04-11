import type { Database } from 'node-sqlite3-wasm';
import * as fs from 'fs';
import * as path from 'path';
import { zipSync } from 'fflate';
import { exportGedcom } from '../gedcom/exporter';
import { listMedia } from './media';

export interface ArchiveExportReport {
  mediaCount: number;
  missingMedia: string[];
  gedcomReport: {
    persons: number;
    families: number;
    events: number;
    sources: number;
    excluded: { category: string; count: number; reason: string }[];
  };
}

/**
 * Export the database as a zip archive containing:
 * - family_tree.ged (GEDCOM file with rewritten media paths)
 * - media/ directory with all referenced media files
 */
export function exportArchive(
  db: Database,
  outputPath: string,
  dbDir: string,
  options?: { gedcomVersion?: '5.5.1' | '7.0' },
): ArchiveExportReport {
  const version = options?.gedcomVersion ?? '5.5.1';
  const { ged, report: gedcomReport } = exportGedcom(db, version);

  const allMedia = listMedia(db);
  const zipEntries: Record<string, Uint8Array> = {};
  let mediaCount = 0;
  const missingMedia: string[] = [];

  // Build a map of original file_ref -> archive path for GEDCOM rewriting
  const pathRewrites = new Map<string, string>();

  // Track filenames to handle duplicates
  const usedNames = new Set<string>();

  for (const m of allMedia) {
    if (!m.file_ref) continue;

    const absPath = path.resolve(dbDir, m.file_ref);
    if (!fs.existsSync(absPath)) {
      missingMedia.push(m.file_ref);
      continue;
    }

    let filename = path.basename(m.file_ref);
    // Handle duplicate filenames by appending a suffix
    if (usedNames.has(filename.toLowerCase())) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      let counter = 1;
      while (usedNames.has(`${base}_${counter}${ext}`.toLowerCase())) {
        counter++;
      }
      filename = `${base}_${counter}${ext}`;
    }
    usedNames.add(filename.toLowerCase());

    const archivePath = `media/${filename}`;
    pathRewrites.set(m.file_ref, archivePath);

    const fileData = fs.readFileSync(absPath);
    zipEntries[archivePath] = new Uint8Array(fileData);
    mediaCount++;
  }

  // Rewrite FILE paths in GEDCOM content
  let rewrittenGed = ged;
  for (const [original, archivePath] of pathRewrites) {
    // GEDCOM FILE lines look like: "2 FILE media/photo.jpg"
    // Replace all occurrences of the original file_ref with the archive-relative path
    rewrittenGed = rewrittenGed.split(original).join(archivePath);
  }

  // Add GEDCOM file
  zipEntries['family_tree.ged'] = new Uint8Array(Buffer.from(rewrittenGed, 'utf-8'));

  // Create zip archive
  const zipData = zipSync(zipEntries, { level: 6 });
  fs.writeFileSync(outputPath, zipData);

  return { mediaCount, missingMedia, gedcomReport };
}
