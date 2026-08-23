// ── Phase 0.8: _GRP records (Genney only) ──────────────────────────────────

import { createGroup } from '../../../api/groups';
import type { ImportContext } from '../import-types';
import { getChild, resolveNote } from '../node-utils';
import { markConsumed } from '../tag-accounting';

export async function phaseGroups(ctx: ImportContext): Promise<void> {
  if (!ctx.isGenney) return;
  for (const node of ctx.tree) {
    if (node.tag !== '_GRP' || !node.xref) continue;
    markConsumed(node);
    const group = await createGroup(ctx.db, {
      name: getChild(node, 'NAME')?.value ?? '',
      notes: resolveNote(node, ctx.noteMap) || undefined,
    });
    ctx.grpMap.set(node.xref, group.id);
  }
}
