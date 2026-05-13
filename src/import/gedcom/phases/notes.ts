// ── Phase 0: NOTE records ───────────────────────────────────────────────────

import type { ImportContext } from '../import-types';

export async function phaseNotes(ctx: ImportContext): Promise<void> {
  for (const node of ctx.tree) {
    if (node.tag !== 'NOTE' || !node.xref) continue;
    ctx.noteMap.set(node.xref, node.value ?? '');
  }
}
