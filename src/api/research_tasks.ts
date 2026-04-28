import type { Database } from 'node-sqlite3-wasm';
import type { LinkEntityType, ResearchTask, ResearchTaskStatus, TaskLink } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';
import { getLinkedEntities } from './links';

export function createResearchTask(db: Database, data: {
  priority?: number;
  status?: ResearchTaskStatus;
  task: string;
  notes?: string;
  result?: string;
}): ResearchTask {
  const id = crypto.randomUUID();
  runSql(db, `
    INSERT INTO research_tasks (id, priority, status, task, notes, result)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    id, data.priority ?? 0,
    data.status ?? 'open', data.task,
    data.notes ?? '', data.result ?? '',
  ]);
  return queryOne<ResearchTask>(db, 'SELECT * FROM research_tasks WHERE id = ?', [id])!;
}

export function getResearchTask(db: Database, id: string): ResearchTask | null {
  return queryOne<ResearchTask>(db, 'SELECT * FROM research_tasks WHERE id = ?', [id]) ?? null;
}

export function listResearchTasks(db: Database): ResearchTask[] {
  return queryAll<ResearchTask>(db, 'SELECT * FROM research_tasks ORDER BY priority DESC, created_at');
}

const TASK_LINK_CONFIG = {
  linkTable: 'task_links',
  parentTable: 'research_tasks',
  parentFk: 'task_id',
  orderBy: 'rt.priority DESC, rt.created_at',
} as const;

export function getResearchTasksForPerson(db: Database, personId: string): ResearchTask[] {
  return getLinkedEntities<ResearchTask>(db, TASK_LINK_CONFIG, 'person', personId);
}

export function getResearchTasksForPlace(db: Database, placeId: string): ResearchTask[] {
  return getLinkedEntities<ResearchTask>(db, TASK_LINK_CONFIG, 'place', placeId);
}

export function getResearchTasksForMedia(db: Database, mediaId: string): ResearchTask[] {
  return getLinkedEntities<ResearchTask>(db, TASK_LINK_CONFIG, 'media', mediaId);
}

export function updateResearchTask(db: Database, id: string, data: {
  priority?: number;
  status?: ResearchTaskStatus;
  task?: string;
  notes?: string;
  result?: string;
}): ResearchTask | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.task !== undefined) { fields.push('task = ?'); values.push(data.task); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
  if (data.result !== undefined) { fields.push('result = ?'); values.push(data.result); }
  if (fields.length === 0) return getResearchTask(db, id);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  runSql(db, `UPDATE research_tasks SET ${fields.join(', ')} WHERE id = ?`, values);
  return getResearchTask(db, id);
}

export function deleteResearchTask(db: Database, id: string): boolean {
  return runSqlChanges(db, 'DELETE FROM research_tasks WHERE id = ?', [id]) > 0;
}

// ── Links ──────────────────────────────────────────────────────────────────

export function addTaskLink(db: Database, taskId: string, entityType: LinkEntityType, entityId: string): TaskLink {
  const id = crypto.randomUUID();
  const nextOrder = queryOne<{ m: number | null }>(db,
    'SELECT MAX(sort_order) AS m FROM task_links WHERE task_id = ? AND entity_type = ?',
    [taskId, entityType]
  );
  const sort = (nextOrder?.m ?? -1) + 1;
  runSql(db,
    `INSERT OR IGNORE INTO task_links (id, task_id, entity_type, entity_id, sort_order) VALUES (?, ?, ?, ?, ?)`,
    [id, taskId, entityType, entityId, sort]
  );
  return queryOne<TaskLink>(db,
    'SELECT * FROM task_links WHERE task_id = ? AND entity_type = ? AND entity_id = ?',
    [taskId, entityType, entityId]
  )!;
}

export function removeTaskLink(db: Database, linkId: string): boolean {
  return runSqlChanges(db, 'DELETE FROM task_links WHERE id = ?', [linkId]) > 0;
}

export function getTaskLinks(db: Database, taskId: string): TaskLink[] {
  return queryAll<TaskLink>(db,
    'SELECT * FROM task_links WHERE task_id = ? ORDER BY entity_type, sort_order, created_at',
    [taskId]
  );
}
