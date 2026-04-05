import type { Database } from 'node-sqlite3-wasm';
import type { ResearchTask, ResearchTaskStatus } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

export function createResearchTask(db: Database, data: {
  person_id?: string | null;
  priority?: number;
  status?: ResearchTaskStatus;
  task: string;
  notes?: string;
  result?: string;
}): ResearchTask {
  const id = crypto.randomUUID();
  runSql(db, `
    INSERT INTO research_tasks (id, person_id, priority, status, task, notes, result)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    id, data.person_id ?? null, data.priority ?? 0,
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

export function getResearchTasksForPerson(db: Database, personId: string): ResearchTask[] {
  return queryAll<ResearchTask>(db, 'SELECT * FROM research_tasks WHERE person_id = ? ORDER BY priority DESC, created_at', [personId]);
}

export function updateResearchTask(db: Database, id: string, data: {
  priority?: number;
  status?: ResearchTaskStatus;
  task?: string;
  notes?: string;
  result?: string;
  person_id?: string | null;
}): ResearchTask | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.task !== undefined) { fields.push('task = ?'); values.push(data.task); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
  if (data.result !== undefined) { fields.push('result = ?'); values.push(data.result); }
  if ('person_id' in data) { fields.push('person_id = ?'); values.push(data.person_id ?? null); }
  if (fields.length === 0) return getResearchTask(db, id);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  runSql(db, `UPDATE research_tasks SET ${fields.join(', ')} WHERE id = ?`, values);
  return getResearchTask(db, id);
}

export function deleteResearchTask(db: Database, id: string): boolean {
  return runSqlChanges(db, 'DELETE FROM research_tasks WHERE id = ?', [id]) > 0;
}
