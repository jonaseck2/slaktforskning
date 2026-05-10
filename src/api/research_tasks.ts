import type { Database } from 'node-sqlite3-wasm';
import type { LinkEntityType, ResearchTask, ResearchTaskStatus, TaskLink } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';
import { getLinkedEntities } from './links';

export async function createResearchTask(db: Database, data: {
  priority?: number;
  status?: ResearchTaskStatus;
  task: string;
  notes?: string;
  result?: string;
}): Promise<ResearchTask> {
  const id = crypto.randomUUID();
  await runSql(db, `
    INSERT INTO research_tasks (id, priority, status, task, notes, result)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    id, data.priority ?? 0,
    data.status ?? 'open', data.task,
    data.notes ?? '', data.result ?? '',
  ]);
  return (await queryOne<ResearchTask>(db, 'SELECT * FROM research_tasks WHERE id = ?', [id]))!;
}

export async function getResearchTask(db: Database, id: string): Promise<ResearchTask | null> {
  return (await queryOne<ResearchTask>(db, 'SELECT * FROM research_tasks WHERE id = ?', [id])) ?? null;
}

export async function listResearchTasks(db: Database): Promise<ResearchTask[]> {
  return await queryAll<ResearchTask>(db, 'SELECT * FROM research_tasks ORDER BY priority DESC, created_at');
}

const TASK_LINK_CONFIG = {
  linkTable: 'task_links',
  parentTable: 'research_tasks',
  parentFk: 'task_id',
  orderBy: 'rt.priority DESC, rt.created_at',
} as const;

export async function getResearchTasksForPerson(db: Database, personId: string): Promise<ResearchTask[]> {
  return await getLinkedEntities<ResearchTask>(db, TASK_LINK_CONFIG, 'person', personId);
}

export async function getResearchTasksForPlace(db: Database, placeId: string): Promise<ResearchTask[]> {
  return await getLinkedEntities<ResearchTask>(db, TASK_LINK_CONFIG, 'place', placeId);
}

export async function getResearchTasksForMedia(db: Database, mediaId: string): Promise<ResearchTask[]> {
  return await getLinkedEntities<ResearchTask>(db, TASK_LINK_CONFIG, 'media', mediaId);
}

export async function updateResearchTask(db: Database, id: string, data: {
  priority?: number;
  status?: ResearchTaskStatus;
  task?: string;
  notes?: string;
  result?: string;
}): Promise<ResearchTask | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.task !== undefined) { fields.push('task = ?'); values.push(data.task ?? ''); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes ?? ''); }
  if (data.result !== undefined) { fields.push('result = ?'); values.push(data.result ?? ''); }
  if (fields.length === 0) return await getResearchTask(db, id);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  await runSql(db, `UPDATE research_tasks SET ${fields.join(', ')} WHERE id = ?`, values);
  return await getResearchTask(db, id);
}

export async function deleteResearchTask(db: Database, id: string): Promise<boolean> {
  return (await runSqlChanges(db, 'DELETE FROM research_tasks WHERE id = ?', [id])) > 0;
}

// ── Links ──────────────────────────────────────────────────────────────────

export async function addTaskLink(db: Database, taskId: string, entityType: LinkEntityType, entityId: string): Promise<TaskLink> {
  const id = crypto.randomUUID();
  const nextOrder = await queryOne<{ m: number | null }>(db,
    'SELECT MAX(sort_order) AS m FROM task_links WHERE task_id = ? AND entity_type = ?',
    [taskId, entityType]
  );
  const sort = (nextOrder?.m ?? -1) + 1;
  await runSql(db,
    `INSERT OR IGNORE INTO task_links (id, task_id, entity_type, entity_id, sort_order) VALUES (?, ?, ?, ?, ?)`,
    [id, taskId, entityType, entityId, sort]
  );
  return (await queryOne<TaskLink>(db,
    'SELECT * FROM task_links WHERE task_id = ? AND entity_type = ? AND entity_id = ?',
    [taskId, entityType, entityId]
  ))!;
}

export async function removeTaskLink(db: Database, linkId: string): Promise<boolean> {
  return (await runSqlChanges(db, 'DELETE FROM task_links WHERE id = ?', [linkId])) > 0;
}

export async function getTaskLinks(db: Database, taskId: string): Promise<TaskLink[]> {
  return await queryAll<TaskLink>(db,
    'SELECT * FROM task_links WHERE task_id = ? ORDER BY entity_type, sort_order, created_at',
    [taskId]
  );
}
