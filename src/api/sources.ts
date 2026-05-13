import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { Source, Citation } from './types';
import { queryOne, queryAll, runSql, runSqlChanges, runBatch } from './db';
import { getCitationsByOwner } from './links';
import { deleteIgnoredDuplicatesForSource } from './duplicates';

export async function createSource(
  db: Database,
  data: Partial<Omit<Source, 'id' | 'created_at' | 'updated_at'>>
): Promise<Source> {
  const id = uuid();
  // Include `abstract` and `call_number` — both are declared on the Source
  // type and accepted by the MCP `add_source` tool's inputSchema. The
  // previous INSERT silently dropped them, which produced the same
  // Prime-Directive violation as `add_place`'s leafProps drop. Surfaced
  // by the 2026-05-09 Bernadotte test session and listed as gap #8 in
  // docs/plans/2026-05-09-bernadotte-test-findings.md.
  await runSql(db, `
    INSERT INTO sources (id, title, author, publication_info, repository, url, source_type, call_number, abstract)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    data.title ?? '',
    data.author ?? '',
    data.publication_info ?? '',
    data.repository ?? '',
    data.url ?? '',
    data.source_type ?? '',
    data.call_number ?? null,
    data.abstract ?? null,
  ]);
  return (await getSource(db, id))!;
}

/**
 * Bulk-insert source rows. One batched INSERT for N rows — used by the
 * GEDCOM importer's phaseSources to collapse N IPC roundtrips to one.
 *
 * Each row may supply its own `id`; otherwise a v4 UUID is generated. Caller
 * needing the id ahead of time (importer xref maps) MUST supply it.
 */
export async function bulkCreateSources(
  db: Database,
  rows: Array<Partial<Omit<Source, 'created_at' | 'updated_at'>>>,
): Promise<string[]> {
  if (rows.length === 0) return [];
  const ids: string[] = new Array(rows.length);
  const params: unknown[][] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = r.id ?? uuid();
    ids[i] = id;
    params[i] = [
      id,
      r.title ?? '',
      r.author ?? '',
      r.publication_info ?? '',
      r.repository ?? '',
      r.url ?? '',
      r.source_type ?? '',
      r.call_number ?? null,
      r.abstract ?? null,
    ];
  }
  await runBatch(
    db,
    'INSERT INTO sources (id, title, author, publication_info, repository, url, source_type, call_number, abstract) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params,
  );
  return ids;
}

export async function getSource(db: Database, id: string): Promise<Source | null> {
  return (await queryOne<Source>(db, `SELECT * FROM sources WHERE id = ?`, [id])) ?? null;
}

export async function listSources(db: Database): Promise<Source[]> {
  return await queryAll<Source>(db, `SELECT * FROM sources ORDER BY title`);
}

export type ListSourcesSortBy = 'title' | 'author' | 'source_type';
export type ListSourcesSortDir = 'asc' | 'desc';

function buildSourcesFilterClause(query: string | undefined): { where: string; params: unknown[] } {
  const q = (query ?? '').trim();
  if (!q) return { where: '', params: [] };
  const like = `%${q}%`;
  return {
    where: 'WHERE title LIKE ? OR author LIKE ? OR publication_info LIKE ?',
    params: [like, like, like],
  };
}

export async function listSourcesPage(
  db: Database,
  limit: number,
  offset: number,
  sortBy: ListSourcesSortBy = 'title',
  sortDir: ListSourcesSortDir = 'asc',
  query?: string,
): Promise<Source[]> {
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  const col = sortBy === 'author' ? 'author' : sortBy === 'source_type' ? 'source_type' : 'title';
  const orderBy = `COALESCE(${col},'') ${dir}, title ASC`;
  const filter = buildSourcesFilterClause(query);
  return await queryAll<Source>(db, `
    SELECT * FROM sources
    ${filter.where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `, [...filter.params, limit, offset]);
}

export async function countSources(db: Database, query?: string): Promise<number> {
  const filter = buildSourcesFilterClause(query);
  if (!filter.where) {
    return (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM sources'))?.n ?? 0;
  }
  return (await queryOne<{ n: number }>(db, `SELECT COUNT(*) as n FROM sources ${filter.where}`, filter.params))?.n ?? 0;
}

export async function updateSource(
  db: Database,
  id: string,
  data: Partial<Omit<Source, 'id' | 'created_at' | 'updated_at'>>
): Promise<Source | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value ?? '');
  }
  if (fields.length === 0) return await getSource(db, id);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  await runSql(db, `UPDATE sources SET ${fields.join(', ')} WHERE id = ?`, values);
  return await getSource(db, id);
}

export async function searchSources(db: Database, query: string): Promise<Source[]> {
  const like = `%${query}%`;
  return await queryAll<Source>(db, `
    SELECT * FROM sources
    WHERE title LIKE ? OR author LIKE ? OR publication_info LIKE ?
    ORDER BY title
  `, [like, like, like]);
}

export async function deleteSource(db: Database, id: string): Promise<boolean> {
  // v0.220.0: ignored_duplicates is polymorphic — clean source-typed pairs
  // so a tombstoned id doesn't keep an "ignored" entry pointing at nothing.
  // Mirrors the pattern in deletePerson / deletePlace.
  await deleteIgnoredDuplicatesForSource(db, id);
  return (await runSqlChanges(db, `DELETE FROM sources WHERE id = ?`, [id])) > 0;
}

export async function createCitation(
  db: Database,
  data: {
    source_id: string;
    event_id?: string | null;
    person_id?: string | null;
    relationship_id?: string | null;
    place_id?: string | null;
    person_name_id?: string | null;
    page?: string;
    confidence?: number;
    transcription?: string;
    notes?: string;
    date_accessed?: string;
  }
): Promise<Citation> {
  const id = uuid();
  await runSql(db, `
    INSERT INTO citations (id, source_id, page, date_accessed, confidence, transcription, notes, event_id, person_id, relationship_id, place_id, person_name_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, data.source_id, data.page ?? '', data.date_accessed ?? '', data.confidence ?? 0,
    data.transcription ?? '', data.notes ?? '', data.event_id ?? null, data.person_id ?? null,
    data.relationship_id ?? null, data.place_id ?? null, data.person_name_id ?? null
  ]);
  return (await getCitation(db, id))!;
}

/**
 * Bulk-insert citations rows. One batched INSERT for N rows — used by the
 * GEDCOM importer to collapse per-event / per-name / per-person SOUR loop
 * IPC into one call.
 */
export async function bulkCreateCitations(
  db: Database,
  rows: Array<{
    source_id: string;
    event_id?: string | null;
    person_id?: string | null;
    relationship_id?: string | null;
    place_id?: string | null;
    person_name_id?: string | null;
    page?: string;
    confidence?: number;
    transcription?: string;
    notes?: string;
    date_accessed?: string;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  const params: unknown[][] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    params[i] = [
      uuid(),
      r.source_id,
      r.page ?? '',
      r.date_accessed ?? '',
      r.confidence ?? 0,
      r.transcription ?? '',
      r.notes ?? '',
      r.event_id ?? null,
      r.person_id ?? null,
      r.relationship_id ?? null,
      r.place_id ?? null,
      r.person_name_id ?? null,
    ];
  }
  await runBatch(
    db,
    'INSERT INTO citations (id, source_id, page, date_accessed, confidence, transcription, notes, event_id, person_id, relationship_id, place_id, person_name_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params,
  );
}

export async function getCitation(db: Database, id: string): Promise<Citation | null> {
  return (await queryOne<Citation>(db, `SELECT * FROM citations WHERE id = ?`, [id])) ?? null;
}

export async function getCitationsForSource(db: Database, sourceId: string): Promise<Citation[]> {
  return await getCitationsByOwner<Citation>(db, 'source', sourceId);
}

export async function getCitationsForEvent(db: Database, eventId: string): Promise<Citation[]> {
  return await getCitationsByOwner<Citation>(db, 'event', eventId);
}

export async function getCitationsForPerson(db: Database, personId: string): Promise<Citation[]> {
  return await getCitationsByOwner<Citation>(db, 'person', personId);
}

export async function getCitationsForRelationship(db: Database, relationshipId: string): Promise<Citation[]> {
  return await getCitationsByOwner<Citation>(db, 'relationship', relationshipId);
}

export async function getCitationsForPlace(db: Database, placeId: string): Promise<Citation[]> {
  return await getCitationsByOwner<Citation>(db, 'place', placeId);
}

export async function getCitationsForPersonName(db: Database, personNameId: string): Promise<Citation[]> {
  return await getCitationsByOwner<Citation>(db, 'person_name', personNameId);
}

export async function deleteCitation(db: Database, id: string): Promise<boolean> {
  return (await runSqlChanges(db, `DELETE FROM citations WHERE id = ?`, [id])) > 0;
}

export async function updateCitation(
  db: Database,
  id: string,
  updates: Partial<Pick<Citation, 'source_id' | 'page' | 'confidence' | 'transcription' | 'notes' | 'date_accessed'>>
): Promise<Citation | null> {
  const allowed = ['source_id', 'page', 'confidence', 'transcription', 'notes', 'date_accessed'] as const;
  const fields = allowed.filter(k => k in updates);
  if (fields.length === 0) return await getCitation(db, id);
  const setClauses = fields.map(f => `${f} = ?`).join(', ');
  const vals = fields.map(f => (updates as Record<string, unknown>)[f]);
  await runSql(db, `UPDATE citations SET ${setClauses} WHERE id = ?`, [...vals, id]);
  return await getCitation(db, id);
}
