import type { Database } from 'node-sqlite3-wasm';
import type { Repository } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

export function createRepository(db: Database, data: {
  name: string;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  state?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  web?: string | null;
  call_number?: string | null;
  notes?: string;
}): Repository {
  const id = crypto.randomUUID();
  runSql(db, `
    INSERT INTO repositories (id, name, address, city, postal_code, state, country, phone, email, web, call_number, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, data.name,
    data.address ?? null, data.city ?? null, data.postal_code ?? null,
    data.state ?? null, data.country ?? null,
    data.phone ?? null, data.email ?? null, data.web ?? null,
    data.call_number ?? null, data.notes ?? '',
  ]);
  return queryOne<Repository>(db, 'SELECT * FROM repositories WHERE id = ?', [id])!;
}

export function getRepository(db: Database, id: string): Repository | null {
  return queryOne<Repository>(db, 'SELECT * FROM repositories WHERE id = ?', [id]) ?? null;
}

export function listRepositories(db: Database): Repository[] {
  return queryAll<Repository>(db, 'SELECT * FROM repositories ORDER BY name');
}

export function updateRepository(db: Database, id: string, data: Partial<Omit<Repository, 'id' | 'created_at'>>): Repository | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  const allowed = ['name','address','city','postal_code','state','country','phone','email','web','call_number','notes'] as const;
  for (const key of allowed) {
    if (key in data) { fields.push(`${key} = ?`); values.push((data as Record<string, unknown>)[key] ?? null); }
  }
  if (fields.length === 0) return getRepository(db, id);
  values.push(id);
  runSql(db, `UPDATE repositories SET ${fields.join(', ')} WHERE id = ?`, values);
  return getRepository(db, id);
}

export function deleteRepository(db: Database, id: string): boolean {
  return runSqlChanges(db, 'DELETE FROM repositories WHERE id = ?', [id]) > 0;
}

export function linkSourceRepository(db: Database, sourceId: string, repositoryId: string): void {
  runSql(db, 'INSERT OR IGNORE INTO source_repositories (source_id, repository_id) VALUES (?, ?)', [sourceId, repositoryId]);
}

export function unlinkSourceRepository(db: Database, sourceId: string, repositoryId: string): boolean {
  return runSqlChanges(db, 'DELETE FROM source_repositories WHERE source_id = ? AND repository_id = ?', [sourceId, repositoryId]) > 0;
}

export function getRepositoriesForSource(db: Database, sourceId: string): Repository[] {
  return queryAll<Repository>(db, `
    SELECT r.* FROM repositories r
    JOIN source_repositories sr ON sr.repository_id = r.id
    WHERE sr.source_id = ?
    ORDER BY r.name
  `, [sourceId]);
}
