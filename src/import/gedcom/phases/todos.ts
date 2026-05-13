// ── Phase 6: _TODO records (Genney only) ───────────────────────────────────

import { createResearchTask, addTaskLink } from '../../../api/research_tasks';
import type { ImportContext } from '../import-types';
import { getChild, resolveNote } from '../node-utils';

export async function phaseTodos(ctx: ImportContext): Promise<void> {
  if (!ctx.isGenney) return;
  for (const node of ctx.tree) {
    if (node.tag !== '_TODO') continue;
    const targXref = getChild(node, '_TARG')?.value ?? '';
    const person_id = ctx.personMap.get(targXref) ?? null;
    const statVal = getChild(node, '_STAT')?.value ?? '0';
    const status: 'open' | 'done' = statVal === '1' ? 'done' : 'open';
    const priority = parseInt(getChild(node, '_PRIO')?.value ?? '1', 10);
    const task = getChild(node, '_TASK')?.value ?? '';
    const notes = resolveNote(node, ctx.noteMap);
    const created = await createResearchTask(ctx.db, { task, notes: notes || undefined, priority, status });
    if (person_id) await addTaskLink(ctx.db, created.id, 'person', person_id);
  }
}
