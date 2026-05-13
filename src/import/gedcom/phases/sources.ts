// ── Phase 1: SOUR records ──────────────────────────────────────────────────

import { v4 as uuid } from 'uuid';
import { bulkCreateSources } from '../../../api/sources';
import { linkSourceRepository } from '../../../api/repositories';
import type { ImportContext } from '../import-types';
import { getChild } from '../node-utils';

export async function phaseSources(ctx: ImportContext): Promise<void> {
  // Two-pass: parse + collect; bulk INSERT once; then per-row repo links.
  const sourNodes: typeof ctx.tree = [];
  for (const n of ctx.tree) if (n.tag === 'SOUR' && n.xref) sourNodes.push(n);
  const total = sourNodes.length;
  if (total === 0) return;

  ctx.options?.onProgress?.(`Importerar källor (0 / ${total})`);
  type SourceRow = {
    id: string;
    title: string; author: string; publication_info: string; repository: string;
    url: string; source_type: string;
    abstract: string | null; call_number: string | null;
  };
  const rows: SourceRow[] = new Array(total);
  // Repo-link pairs to flush after the bulk source insert (still per-row IPC
  // because there are typically few repository links; not the hot path).
  const repoLinks: Array<{ sourceId: string; repoXref: string }> = [];
  for (let i = 0; i < total; i++) {
    const node = sourNodes[i];
    const id = uuid();
    ctx.sourceMap.set(node.xref!, id);
    rows[i] = {
      id,
      title: getChild(node, 'TITL')?.value ?? '',
      author: getChild(node, 'AUTH')?.value ?? '',
      publication_info: getChild(node, 'PUBL')?.value ?? '',
      repository: (() => {
        const repoText = getChild(node, '_REPO_TEXT')?.value;
        if (repoText) return repoText;
        const repoVal = getChild(node, 'REPO')?.value ?? '';
        return repoVal.startsWith('@') ? '' : repoVal;
      })(),
      url: getChild(node, '_URL')?.value ?? '',
      source_type: getChild(node, '_STYPE')?.value ?? '',
      abstract: getChild(node, '_ABSTRACT')?.value ?? null,
      call_number: getChild(node, '_CALL')?.value ?? null,
    };
    const repoVal = getChild(node, 'REPO')?.value ?? '';
    if (repoVal.startsWith('@')) repoLinks.push({ sourceId: id, repoXref: repoVal });
    if ((i + 1) % 200 === 0 || (i + 1) === total) {
      ctx.options?.onProgress?.(`Importerar källor (${i + 1} / ${total})`);
    }
  }
  ctx.options?.onProgress?.(`Sparar ${total} källor…`);
  await bulkCreateSources(ctx.db, rows);

  // Repo links — small set; per-row is fine.
  for (const { sourceId, repoXref } of repoLinks) {
    const repoId = ctx.repoMap.get(repoXref);
    if (repoId) await linkSourceRepository(ctx.db, sourceId, repoId);
  }
}
