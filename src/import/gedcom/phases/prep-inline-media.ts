// ── Phase 0.4: pre-resolve inline OBJE (media inside INDI/FAM/events) ──────

import { basename } from 'path';
import { bulkCreateMedia } from '../../../api/media';
import type { ImportContext } from '../import-types';
import { getChild } from '../node-utils';
import { remapHolgerMediaPath } from '../obje-importer';

/**
 * Walk the tree, find every *inline* OBJE node (i.e. OBJE without an xref
 * and without an `@ref@` value — these are media records embedded under
 * INDI / FAM / event nodes, not top-level OBJE records). Pre-generate
 * UUIDs and bulk-INSERT them in one batched call.
 *
 * Holger imports are inline-OBJE heavy — the user's reference file has
 * 11k+ inline OBJE records and zero top-level OBJE. Without this phase,
 * every `importObjeNode` inside an event loop pays one IPC roundtrip for
 * `createMedia`; this collapses 11k calls into 1.
 *
 * `inlineMediaMap` is keyed by the GedcomNode reference itself — node
 * identity is stable across the import because the tree is read-only
 * after parsing. `importObjeNode` consults it first; on cache hit it
 * returns the pre-allocated mediaId without any IPC.
 */
export async function phasePrepInlineMedia(ctx: ImportContext): Promise<void> {
  const inlineNodes: typeof ctx.tree = [];
  function walk(nodes: typeof ctx.tree): void {
    for (const n of nodes) {
      if (n.tag === 'OBJE' && !n.xref && !n.value?.startsWith('@')) {
        inlineNodes.push(n);
      }
      if (n.children.length > 0) walk(n.children);
    }
  }
  walk(ctx.tree);
  if (inlineNodes.length === 0) return;

  const inlineMediaMap = new Map<typeof ctx.tree[number], string>();
  ctx.inlineMediaMap = inlineMediaMap;

  ctx.options?.onProgress?.(`Förbereder inbäddade media (0 / ${inlineNodes.length})`);
  const mediaDir = ctx.options?.mediaDir;
  const rows: Array<{
    id: string; file_ref: string | null; title: string; format: string | null;
    notes: string; is_printable: boolean; is_missing: boolean;
  }> = new Array(inlineNodes.length);
  for (let i = 0; i < inlineNodes.length; i++) {
    const node = inlineNodes[i];
    let file = getChild(node, 'FILE')?.value ?? '';
    if (file && mediaDir) {
      file = remapHolgerMediaPath(file, mediaDir);
    }
    const form = getChild(node, 'FORM')?.value ?? null;
    const titl = getChild(node, 'TITL')?.value ?? null;
    const noteVal = getChild(node, 'NOTE')?.value ?? '';
    const id = crypto.randomUUID();
    inlineMediaMap.set(node, id);
    rows[i] = {
      id,
      file_ref: file || null,
      title: titl ?? (file ? basename(file) : ''),
      format: form,
      notes: noteVal,
      is_printable: false,
      is_missing: !file,
    };
    if ((i + 1) % 1000 === 0 || (i + 1) === inlineNodes.length) {
      ctx.options?.onProgress?.(`Förbereder inbäddade media (${i + 1} / ${inlineNodes.length})`);
    }
  }
  ctx.options?.onProgress?.(`Sparar ${rows.length} inbäddade mediaposter (1 / 1)…`);
  await bulkCreateMedia(ctx.db, rows);
  console.log(`[import-timing]     phasePrepInlineMedia: resolved ${inlineNodes.length} inline OBJE`);
}
