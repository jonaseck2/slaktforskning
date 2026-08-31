import type { Database } from 'node-sqlite3-wasm';
import type { Repository } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';
import { deleteExternalIdentifiersFor } from './external_identifiers';

export async function createRepository(db: Database, data: {
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
}): Promise<Repository> {
  const id = crypto.randomUUID();
  await runSql(db, `
    INSERT INTO repositories (id, name, address, city, postal_code, state, country, phone, email, web, call_number, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, data.name,
    data.address ?? null, data.city ?? null, data.postal_code ?? null,
    data.state ?? null, data.country ?? null,
    data.phone ?? null, data.email ?? null, data.web ?? null,
    data.call_number ?? null, data.notes ?? '',
  ]);
  return (await queryOne<Repository>(db, 'SELECT * FROM repositories WHERE id = ?', [id]))!;
}

export async function getRepository(db: Database, id: string): Promise<Repository | null> {
  return (await queryOne<Repository>(db, 'SELECT * FROM repositories WHERE id = ?', [id])) ?? null;
}

export async function listRepositories(db: Database): Promise<Repository[]> {
  return await queryAll<Repository>(db, 'SELECT * FROM repositories ORDER BY name');
}

export async function updateRepository(db: Database, id: string, data: Partial<Omit<Repository, 'id' | 'created_at'>>): Promise<Repository | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  const allowed = ['name','address','city','postal_code','state','country','phone','email','web','call_number','notes'] as const;
  for (const key of allowed) {
    if (key in data) { fields.push(`${key} = ?`); values.push((data as Record<string, unknown>)[key] ?? null); }
  }
  if (fields.length === 0) return await getRepository(db, id);
  values.push(id);
  await runSql(db, `UPDATE repositories SET ${fields.join(', ')} WHERE id = ?`, values);
  return await getRepository(db, id);
}

export async function deleteRepository(db: Database, id: string): Promise<boolean> {
  // The table spans five entity types with no FK, so nothing cascades for us.
  await deleteExternalIdentifiersFor(db, 'repository', id);
  return (await runSqlChanges(db, 'DELETE FROM repositories WHERE id = ?', [id])) > 0;
}

export async function linkSourceRepository(db: Database, sourceId: string, repositoryId: string): Promise<void> {
  await runSql(db, 'INSERT OR IGNORE INTO source_repositories (source_id, repository_id) VALUES (?, ?)', [sourceId, repositoryId]);
}

export async function unlinkSourceRepository(db: Database, sourceId: string, repositoryId: string): Promise<boolean> {
  return (await runSqlChanges(db, 'DELETE FROM source_repositories WHERE source_id = ? AND repository_id = ?', [sourceId, repositoryId])) > 0;
}

export async function getRepositoriesForSource(db: Database, sourceId: string): Promise<Repository[]> {
  return await queryAll<Repository>(db, `
    SELECT r.* FROM repositories r
    JOIN source_repositories sr ON sr.repository_id = r.id
    WHERE sr.source_id = ?
    ORDER BY r.name
  `, [sourceId]);
}
