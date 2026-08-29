// ── Phase 0.5: OBJE top-level records ──────────────────────────────────────

import { basename } from 'path';
import { bulkCreateMedia } from '../../../api/media';
import type { ImportContext } from '../import-types';
import { getChild } from '../node-utils';
import { readObjeFormAndTitle, remapHolgerMediaPath } from '../obje-importer';
import { markConsumed } from '../tag-accounting';

export async function phaseObje(ctx: ImportContext): Promise<void> {
  // Two-pass: parse + collect; bulk INSERT once at the end. The Tauri
  // build pays one IPC per `createMedia` call; for a Holger import with
  // 22k OBJE records that's 22k IPC. Batched INSERT is one call.
  const objeNodes: typeof ctx.tree = [];
  for (const n of ctx.tree) if (n.tag === 'OBJE' && n.xref) { markConsumed(n); objeNodes.push(n); }
  const total = objeNodes.length;
  if (total === 0) return;

  ctx.options?.onProgress?.(`Importerar media (0 / ${total})`);
  const rows: Array<{ id: string; file_ref: string | null; title: string; format: string | null; notes: string; is_printable: boolean; is_missing: boolean }> = new Array(total);
  let withFile = 0;
  for (let i = 0; i < total; i++) {
    const node = objeNodes[i];
    const fileNode = getChild(node, 'FILE');
    let file = fileNode?.value ?? '';
    if (file && ctx.options?.mediaDir) {
      file = remapHolgerMediaPath(file, ctx.options.mediaDir);
    }
    if (file) withFile++;
    const { form, title: titl } = readObjeFormAndTitle(node, fileNode);
    const note = getChild(node, 'NOTE')?.value ?? '';
    const id = crypto.randomUUID();
    ctx.objeMap.set(node.xref!, id);
    // is_missing is the inverse of "we have a file_ref"; whether that file
    // is actually on disk is decided later by consolidateMediaFolder via a
    // single recursive readdir of the dest folder.
    rows[i] = {
      id,
      file_ref: file || null,
      title: titl ?? (file ? basename(file) : ''),
      format: form,
      notes: note,
      is_printable: false,
      is_missing: !file,
    };
    if ((i + 1) % 500 === 0 || (i + 1) === total) {
      ctx.options?.onProgress?.(`Importerar media (${i + 1} / ${total})`);
    }
  }
  ctx.options?.onProgress?.(`Sparar ${total} mediaposter…`);
  await bulkCreateMedia(ctx.db, rows);
  console.log(`[import-timing]     phaseObje: total=${total} withFile=${withFile}`);
}
