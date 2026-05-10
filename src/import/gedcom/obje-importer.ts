/**
 * GEDCOM OBJE (media object) import logic.
 */

import { basename } from 'path';
import type { Database } from 'node-sqlite3-wasm';
import type { GedcomNode } from '../../gedcom/parser';
import { createMedia } from '../../api/media';
import type { ImportOptions } from './import-core';
import { getChild } from './node-utils';

/**
 * Remap a Windows-style Holger/OurKind media path to a local directory.
 * e.g. 'C:\\OurKind\\Media\\P12\\photo.jpg' -> '{mediaDir}/P12/photo.jpg'
 */
export function remapHolgerMediaPath(winPath: string, mediaDir: string): string {
  // Extract the relative path after 'Media\' or 'Media/' (case-insensitive)
  const idx = winPath.search(/[Mm]edia[/\\]/);
  if (idx === -1) return winPath;
  const afterMedia = winPath.slice(idx + 6); // 'Media\' or 'Media/' are both 6 chars
  const relative = afterMedia.replace(/\\/g, '/');
  return `${mediaDir.replace(/\/$/, '')}/${relative}`;
}

/**
 * Import a single OBJE node (inline or top-level reference) and return the media UUID.
 * Returns null if the node cannot be resolved.
 */
export async function importObjeNode(
  db: Database,
  objeNode: GedcomNode,
  objeMap: Map<string, string>,
  options?: ImportOptions,
): Promise<string | null> {
  // Reference to a previously imported top-level OBJE record: `1 OBJE @M1@`
  if (objeNode.value?.startsWith('@')) {
    return objeMap.get(objeNode.value) ?? null;
  }
  // Inline embedded OBJE
  let file = getChild(objeNode, 'FILE')?.value ?? '';
  if (file && options?.mediaDir) {
    file = remapHolgerMediaPath(file, options.mediaDir);
  }
  const form = getChild(objeNode, 'FORM')?.value ?? null;
  const titl = getChild(objeNode, 'TITL')?.value ?? null;
  const note = getChild(objeNode, 'NOTE')?.value ?? '';
  const media = await createMedia(db, {
    file_ref: file || null,
    title: titl || (file ? basename(file) : undefined),
    format: form,
    notes: note || undefined,
    is_printable: false,
    // Matches phaseObje: on-disk truth is decided later by consolidateMediaFolder
    // (single recursive readdir of dest), not per-OBJE existsSync on the main
    // thread. existsSync was removed when phaseObje dropped it; this call site
    // was missed in v0.210.7.
    is_missing: !file,
  });
  return media.id;
}
