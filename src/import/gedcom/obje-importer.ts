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
 * `FORM` and `TITL` for a media object, read at either level GEDCOM puts them.
 *
 * 5.5.1's original shape hangs both directly off OBJE; 5.5.1's later form and
 * 7.0 hang them off the FILE instead:
 *
 *   1 OBJE                 1 OBJE
 *   2 FORM jpeg            2 FILE photo.jpg
 *   2 FILE photo.jpg       3 FORM image/jpeg
 *                          3 TITL Bröllopet 1928
 *
 * The importer read only the first. Measured 2026-08-29 over the 36 real .ged
 * files in export-import/samples: 199 `OBJE.FILE.FORM` and 175
 * `OBJE.FILE.TITL` against **0** of either at OBJE level — so `media.format`
 * was null for every top-level OBJE in the corpus, and `media.title` fell back
 * to the file's basename on all 174 records that stated a title.
 *
 * The OBJE-level value wins when both are present: it describes the record,
 * and the per-file one describes one of its files. An OBJE with several FILEs
 * each carrying a title collapses to the first — `media.title` is per record.
 * 2 of 174 such records in the corpus have more than one FILE.
 */
export function readObjeFormAndTitle(
  objeNode: GedcomNode,
  fileNode: GedcomNode | undefined,
): { form: string | null; title: string | null } {
  const at = (node: GedcomNode | undefined, tag: string): string | null =>
    (node ? getChild(node, tag)?.value ?? null : null);
  return {
    form: at(objeNode, 'FORM') ?? at(fileNode, 'FORM'),
    title: at(objeNode, 'TITL') ?? at(fileNode, 'TITL'),
  };
}

/**
 * Import a single OBJE node (inline or top-level reference) and return the media UUID.
 * Returns null if the node cannot be resolved.
 *
 * **This function does not read `external_identifiers`, deliberately.** Both
 * branches that return here hand back a media row somebody else created:
 * `phaseObje` for the `@`-pointer branch, `phasePrepInlineMedia` for the
 * cache-hit branch. Those two phases read the identifiers, buffered and
 * flushed once each. Reading them here as well would re-write the same rows
 * once per link — a media on twelve people, twelve times.
 *
 * The inline-creation branch below looks like the remaining gap, but it is
 * unreachable through `import-core`: `phasePrepInlineMedia` runs third, walks
 * the whole tree, and populates `inlineMediaMap` for every inline OBJE, so the
 * cache hit above always wins. Measured 2026-08-29 with a console probe on
 * both branches across the full unit suite — cache-hit 4, inline-create 0.
 * If a future caller reaches it, the identifiers are read by neither path and
 * that caller needs its own accumulator.
 */
export async function importObjeNode(
  db: Database,
  objeNode: GedcomNode,
  objeMap: Map<string, string>,
  options?: ImportOptions,
  inlineMediaMap?: Map<GedcomNode, string>,
): Promise<string | null> {
  // Reference to a previously imported top-level OBJE record: `1 OBJE @M1@`
  if (objeNode.value?.startsWith('@')) {
    return objeMap.get(objeNode.value) ?? null;
  }
  // Fast path: this inline OBJE was pre-resolved in phasePrepInlineMedia
  // and its row is already in the DB. Skip the per-event IPC.
  if (inlineMediaMap) {
    const cached = inlineMediaMap.get(objeNode);
    if (cached) return cached;
  }
  // Inline embedded OBJE
  const fileNode = getChild(objeNode, 'FILE');
  let file = fileNode?.value ?? '';
  if (file && options?.mediaDir) {
    file = remapHolgerMediaPath(file, options.mediaDir);
  }
  const { form, title: titl } = readObjeFormAndTitle(objeNode, fileNode);
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
