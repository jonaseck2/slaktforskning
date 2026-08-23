// ── Phase 1: SOUR records ──────────────────────────────────────────────────

import { v4 as uuid } from 'uuid';
import { bulkCreateSources } from '../../../api/sources';
import { createRepository, linkSourceRepository } from '../../../api/repositories';
import { addMediaLink } from '../../../api/media';
import type { ImportContext } from '../import-types';
import { getChild, getChildren } from '../node-utils';
import { importObjeNode } from '../obje-importer';
import { markConsumed } from '../tag-accounting';

export async function phaseSources(ctx: ImportContext): Promise<void> {
  // Two-pass: parse + collect; bulk INSERT once; then per-row repo links.
  const sourNodes: typeof ctx.tree = [];
  for (const n of ctx.tree) if (n.tag === 'SOUR' && n.xref) { markConsumed(n); sourNodes.push(n); }
  const total = sourNodes.length;
  if (total === 0) return;

  ctx.options?.onProgress?.(`Importerar källor (0 / ${total})`);
  type SourceRow = {
    id: string;
    title: string; author: string; publication_info: string;
    url: string; source_type: string;
    abstract: string | null; call_number: string | null;
  };
  const rows: SourceRow[] = new Array(total);
  // Repo-link pairs to flush after the bulk source insert.
  const repoLinks: Array<{ sourceId: string; repoXref: string }> = [];
  // Free-text repository names (_REPO_TEXT or unbracketed REPO value) get
  // synthesized into proper Repository records + source_repositories links
  // — the free-text sources.repository column was dropped in T02. We
  // deduplicate by name (case-insensitive) so multiple sources that named
  // the same archive share one Repository row.
  const freeTextRepoLinks: Array<{ sourceId: string; repoName: string }> = [];
  // Media→source links (rapport 104, framing B): OBJE under SOUR. Collected
  // during the parse pass, flushed after the bulk source insert — mirrors the
  // repoLinks collect-then-flush. The OBJE / prep-inline-media phases ran
  // before this one, so ctx.objeMap + ctx.inlineMediaMap are populated.
  const mediaLinkPairs: Array<{ media_id: string; entity_id: string }> = [];
  for (let i = 0; i < total; i++) {
    const node = sourNodes[i];
    const id = uuid();
    ctx.sourceMap.set(node.xref!, id);
    rows[i] = {
      id,
      title: getChild(node, 'TITL')?.value ?? '',
      author: getChild(node, 'AUTH')?.value ?? '',
      publication_info: getChild(node, 'PUBL')?.value ?? '',
      url: getChild(node, '_URL')?.value ?? '',
      source_type: getChild(node, '_STYPE')?.value ?? '',
      abstract: getChild(node, '_ABSTRACT')?.value ?? null,
      call_number: getChild(node, '_CALL')?.value ?? null,
    };
    const repoVal = getChild(node, 'REPO')?.value ?? '';
    if (repoVal.startsWith('@')) {
      repoLinks.push({ sourceId: id, repoXref: repoVal });
    } else {
      const freeText = getChild(node, '_REPO_TEXT')?.value || (repoVal && !repoVal.startsWith('@') ? repoVal : '');
      if (freeText) freeTextRepoLinks.push({ sourceId: id, repoName: freeText });
    }
    // OBJE under SOUR → media→source link.
    for (const objeNode of getChildren(node, 'OBJE')) {
      const mediaId = await importObjeNode(ctx.db, objeNode, ctx.objeMap, ctx.options, ctx.inlineMediaMap);
      if (mediaId) mediaLinkPairs.push({ media_id: mediaId, entity_id: id });
    }
    if ((i + 1) % 200 === 0 || (i + 1) === total) {
      ctx.options?.onProgress?.(`Importerar källor (${i + 1} / ${total})`);
    }
  }
  ctx.options?.onProgress?.(`Sparar ${total} källor…`);
  await bulkCreateSources(ctx.db, rows);

  // Flush media→source links (rapport 104, framing B) now the source rows exist.
  for (const { media_id, entity_id } of mediaLinkPairs) {
    await addMediaLink(ctx.db, { media_id, entity_type: 'source', entity_id });
  }

  // XREF-based repo links — small set; per-row is fine.
  for (const { sourceId, repoXref } of repoLinks) {
    const repoId = ctx.repoMap.get(repoXref);
    if (repoId) await linkSourceRepository(ctx.db, sourceId, repoId);
  }

  // Synthesize Repository records from free-text names, deduplicating by
  // case-insensitive name. T02-introduced behavior — previously these were
  // stored verbatim on sources.repository (column now dropped).
  if (freeTextRepoLinks.length > 0) {
    const repoByName = new Map<string, string>(); // lowercase-name → repo id
    for (const { sourceId, repoName } of freeTextRepoLinks) {
      const key = repoName.trim().toLowerCase();
      let repoId = repoByName.get(key);
      if (!repoId) {
        const repo = await createRepository(ctx.db, { name: repoName.trim() });
        repoId = repo.id;
        repoByName.set(key, repoId);
      }
      await linkSourceRepository(ctx.db, sourceId, repoId);
    }
  }
}
