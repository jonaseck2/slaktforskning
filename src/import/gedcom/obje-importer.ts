/**
 * GEDCOM OBJE (media object) import logic.
 */

import { existsSync } from 'fs';
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
export function importObjeNode(
  db: Database,
  objeNode: GedcomNode,
  objeMap: Map<string, string>,
  options?: ImportOptions,
): string | null {
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
  const media = createMedia(db, {
    file_ref: file || null,
    title: titl || (file ? basename(file) : undefined),
    format: form,
    notes: note || undefined,
    is_printable: false,
    is_missing: !file || !existsSync(file),
  });
  return media.id;
}
