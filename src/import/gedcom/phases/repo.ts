// ── Phase 0.7: REPO records ────────────────────────────────────────────────

import { bulkAddExternalIdentifiers } from '../../../api/external_identifiers';
import type { ExternalIdentifierInput } from '../../../api/external_identifiers';
import { createRepository } from '../../../api/repositories';
import { readExternalIds } from '../../../gedcom/external-id-tags';
import type { ImportContext } from '../import-types';
import { getChild, getChildren, resolveNote } from '../node-utils';
import { markConsumed } from '../tag-accounting';

export async function phaseRepo(ctx: ImportContext): Promise<void> {
  // Source-format ids on the repository record. Accumulated across the loop
  // and flushed once — never one write per repository
  // (`.claude/rules/performance.md`).
  const externalIdRows: ExternalIdentifierInput[] = [];
  for (const node of ctx.tree) {
    if (node.tag !== 'REPO' || !node.xref) continue;
    markConsumed(node);
    const addrNode = getChild(node, 'ADDR');
    const addrValue = addrNode
      ? (getChild(addrNode, 'ADR1')?.value ?? addrNode.value ?? undefined)
      : undefined;
    const repo = await createRepository(ctx.db, {
      name: getChild(node, 'NAME')?.value ?? '',
      // Treat an empty ADDR line value as "no address" so ADDR-as-parent-only
      // emit (used to scope CITY/POST/etc) doesn't fabricate an empty string.
      address: addrValue === '' ? undefined : addrValue,
      city: addrNode ? getChild(addrNode, 'CITY')?.value ?? undefined : undefined,
      postal_code: addrNode ? getChild(addrNode, 'POST')?.value ?? undefined : undefined,
      state: addrNode ? getChild(addrNode, 'STAE')?.value ?? undefined : undefined,
      country: addrNode ? getChild(addrNode, 'CTRY')?.value ?? undefined : undefined,
      phone: getChild(node, 'PHON')?.value ?? undefined,
      email: getChild(node, 'EMAIL')?.value ?? undefined,
      web: getChild(node, 'WWW')?.value ?? undefined,
      notes: resolveNote(node, ctx.noteMap) || undefined,
    });
    ctx.repoMap.set(node.xref, repo.id);
    // No vendor tag exists for a repository, so every system arrives on the
    // standard reference tag. `getChildren` marks the nodes consumed, which is
    // what keeps them out of `unaccountedFor`.
    externalIdRows.push(
      ...readExternalIds(node, ['REFN', 'EXID'], 'repository', repo.id, getChild, getChildren),
    );
  }
  if (externalIdRows.length > 0) {
    await bulkAddExternalIdentifiers(ctx.db, externalIdRows);
  }
}
