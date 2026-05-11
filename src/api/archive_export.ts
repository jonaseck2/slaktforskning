import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { Database } from 'node-sqlite3-wasm';
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

export interface ArchiveExportOptions {
  gedcomVersion?: '5.5.1' | '7.0';
}

/**
 * Reader callback signature: given a file_ref relative path (as stored in
 * the DB, e.g. `family-media/photo.jpg`), return the file bytes or `null`
 * if the file is missing. Used by `exportArchiveToBytes` so the pure
 * function doesn't reach for `fs` directly — Electron supplies a Node-fs
 * reader, Tauri supplies an `invoke('fs_read_bytes_base64', ...)` reader.
 */
export type ArchiveMediaReader = (relPath: string) => Promise<Uint8Array | null>;

/**
 * Pure-function variant of `exportArchive` — produces the zip bytes in
 * memory and never touches the filesystem. The caller supplies a media
 * reader (so the caller decides how to read media files: Node fs, Tauri
 * IPC, etc.) and writes the resulting bytes itself.
 */
export async function exportArchiveToBytes(
  db: Database,
  mediaReader: ArchiveMediaReader,
  options?: ArchiveExportOptions,
): Promise<{ zipBytes: Uint8Array; report: ArchiveExportReport }> {
  const version = options?.gedcomVersion ?? '5.5.1';
  const { ged, report: gedcomReport } = await exportGedcom(db, version);

  const allMedia = await listMedia(db);
  const zipEntries: Record<string, Uint8Array> = {};
  let mediaCount = 0;
  const missingMedia: string[] = [];

  // Build a map of original file_ref -> archive path for GEDCOM rewriting
  const pathRewrites = new Map<string, string>();

  // Track filenames to handle duplicates
  const usedNames = new Set<string>();

  for (const m of allMedia) {
    if (!m.file_ref) continue;

    const bytes = await mediaReader(m.file_ref);
    if (!bytes) {
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

    zipEntries[archivePath] = bytes;
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
  const zipBytes = zipSync(zipEntries, { level: 6 });

  return { zipBytes, report: { mediaCount, missingMedia, gedcomReport } };
}

/**
 * Export the database as a zip archive containing:
 * - family_tree.ged (GEDCOM file with rewritten media paths)
 * - media/ directory with all referenced media files
 *
 * Thin Node-fs wrapper around `exportArchiveToBytes` — supplies a
 * `readFile` media reader and writes the resulting bytes to `outputPath`.
 * Used by the Electron worker-thread channel and the MCP `export_archive`
 * tool. The Tauri build calls `exportArchiveToBytes` directly with an
 * `invoke('fs_read_bytes_base64')`-backed reader.
 */
export async function exportArchive(
  db: Database,
  outputPath: string,
  dbDir: string,
  options?: ArchiveExportOptions,
): Promise<ArchiveExportReport> {
  const mediaReader: ArchiveMediaReader = async (relPath) => {
    const absPath = path.resolve(dbDir, relPath);
    try {
      const data = await fsp.readFile(absPath);
      return new Uint8Array(data);
    } catch {
      return null;
    }
  };

  const { zipBytes, report } = await exportArchiveToBytes(db, mediaReader, options);
  fs.writeFileSync(outputPath, zipBytes);
  return report;
}
