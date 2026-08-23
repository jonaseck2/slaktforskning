// ── Phase 0.7: REPO records ────────────────────────────────────────────────

import { createRepository } from '../../../api/repositories';
import type { ImportContext } from '../import-types';
import { getChild, resolveNote } from '../node-utils';
import { markConsumed } from '../tag-accounting';

export async function phaseRepo(ctx: ImportContext): Promise<void> {
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
  }
}
