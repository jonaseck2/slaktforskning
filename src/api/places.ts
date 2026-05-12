import { Database } from 'node-sqlite3-wasm';
import { Place } from './types';
import { queryOne, queryAll, runSql, runSqlChanges, runBatch } from './db';
import { displayedNameIdSql } from './persons';
import { deleteIgnoredDuplicatesForPlace } from './duplicates';

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Pre-resolve places for an importer. Walks a list of raw place-name strings,
 * deduplicates by normalized name, looks up existing rows in one SELECT, and
 * bulk-inserts the missing ones with one batched INSERT.
 *
 * Returns a Map keyed by normalized name → Place row. The importer's
 * `resolvePlaceFn` can then look up from this map and do zero IPC per event.
 *
 * Why this exists: Holger imports do ~3-5 events per person, each with a
 * PLAC tag, hitting `findOrCreatePlace` for every event. That's 60-100k+
 * IPC calls (SELECT + maybe INSERT) — minutes of pure IPC under Tauri.
 * Pre-resolving collapses it to 2 IPC calls total.
 */
export async function bulkResolvePlaces(
  db: Database,
  names: string[],
): Promise<Map<string, Place>> {
  const result = new Map<string, Place>();
  if (names.length === 0) return result;

  // Dedupe by normalized name; keep the first raw spelling for new rows.
  const byNorm = new Map<string, string>();
  for (const raw of names) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const norm = normalize(trimmed);
    if (!byNorm.has(norm)) byNorm.set(norm, trimmed);
  }
  if (byNorm.size === 0) return result;

  const allNorms = [...byNorm.keys()];

  // One SELECT for every normalized name. SQLite caps IN list at 999 binds
  // by default; chunk to stay below.
  const CHUNK = 800;
  for (let i = 0; i < allNorms.length; i += CHUNK) {
    const chunk = allNorms.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await queryAll<Place>(
      db,
      `SELECT * FROM places WHERE normalized_name IN (${placeholders})`,
      chunk,
    );
    for (const row of rows) result.set(row.normalized_name, row);
  }

  // Anything still missing → one bulk INSERT.
  const missing: Array<{ id: string; raw: string; norm: string }> = [];
  for (const [norm, raw] of byNorm) {
    if (result.has(norm)) continue;
    missing.push({ id: crypto.randomUUID(), raw, norm });
  }
  if (missing.length > 0) {
    await runBatch(
      db,
      'INSERT INTO places (id, name, normalized_name) VALUES (?, ?, ?)',
      missing.map((m) => [m.id, m.raw, m.norm]),
    );
    // Read back as full rows so the caller gets the same shape as the SELECT
    // branch (with default values populated by the DB / column defaults).
    for (let i = 0; i < missing.length; i += CHUNK) {
      const chunk = missing.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = await queryAll<Place>(
        db,
        `SELECT * FROM places WHERE id IN (${placeholders})`,
        chunk.map((m) => m.id),
      );
      for (const row of rows) result.set(row.normalized_name, row);
    }
  }
  return result;
}

/**
 * Throws if `name` contains a comma. Used by MCP tool wrappers to enforce
 * that a place name is a single geographic component (e.g. "Chennai"), never
 * a rendered path ("Chennai, India, World"). Hierarchy must be expressed via
 * `parent_place_id` (or `parent_chain` / `place_chain` on the MCP tools).
 *
 * Not used by importers (they preserve whatever the source file contains) or
 * by the renderer (which writes whatever the form/picker yields).
 */
export function assertLeafPlaceName(name: string): void {
  if (name.includes(',')) {
    throw new Error(
      `Place name must be a single component, not a path (got: "${name}"). ` +
      `Commas are rejected. To express hierarchy, use parent_chain on add_place ` +
      `or place_chain on record_event (root → leaf). Example: ` +
      `name: "Chennai", parent_chain: ["World", "India"].`,
    );
  }
}

export async function createPlace(
  db: Database,
  data: {
    name: string;
    place_type?: Place['place_type'];
    parent_place_id?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    date_from?: string | null;
    date_to?: string | null;
    notes?: string;
    street?: string | null;
    postal_code?: string | null;
    city?: string | null;
    country?: string | null;
  }
): Promise<Place> {
  const id = crypto.randomUUID();
  await runSql(db, `
    INSERT INTO places (id, name, normalized_name, place_type, parent_place_id, latitude, longitude, date_from, date_to, notes, street, postal_code, city, country)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, data.name, normalize(data.name),
    data.place_type ?? null, data.parent_place_id ?? null,
    data.latitude ?? null, data.longitude ?? null,
    data.date_from ?? null, data.date_to ?? null,
    data.notes ?? '',
    data.street ?? null, data.postal_code ?? null,
    data.city ?? null, data.country ?? null,
  ]);
  return (await getPlace(db, id))!;
}

export async function getPlace(db: Database, id: string): Promise<Place | null> {
  return (await queryOne<Place>(db, 'SELECT * FROM places WHERE id = ?', [id])) ?? null;
}

export async function listPlaces(db: Database): Promise<Place[]> {
  return await queryAll<Place>(db, 'SELECT * FROM places ORDER BY name ASC');
}

export type ListPlacesSortBy = 'name' | 'place_type';
export type ListPlacesSortDir = 'asc' | 'desc';

function buildPlacesFilterClause(query: string | undefined): { where: string; params: unknown[] } {
  const q = (query ?? '').trim();
  if (!q) return { where: '', params: [] };
  const like = `%${normalize(q)}%`;
  return {
    where: 'WHERE p.normalized_name LIKE ? OR LOWER(COALESCE(p.city,\'\')) LIKE ? OR LOWER(COALESCE(p.country,\'\')) LIKE ?',
    params: [like, like, like],
  };
}

export async function listPlacesPage(
  db: Database,
  limit: number,
  offset: number,
  sortBy: ListPlacesSortBy = 'name',
  sortDir: ListPlacesSortDir = 'asc',
  query?: string,
): Promise<Place[]> {
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  const orderBy = sortBy === 'place_type'
    ? `COALESCE(p.place_type,'') ${dir}, p.name ASC`
    : `p.name ${dir}`;
  const filter = buildPlacesFilterClause(query);
  return await queryAll<Place>(db, `
    SELECT p.* FROM places p
    ${filter.where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `, [...filter.params, limit, offset]);
}

export async function countPlaces(db: Database, query?: string): Promise<number> {
  const filter = buildPlacesFilterClause(query);
  if (!filter.where) {
    return (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM places'))?.n ?? 0;
  }
  return (await queryOne<{ n: number }>(db, `SELECT COUNT(*) as n FROM places p ${filter.where}`, filter.params))?.n ?? 0;
}

export async function searchPlaces(db: Database, query: string): Promise<(Place & { parent_name: string | null })[]> {
  const q = `%${normalize(query)}%`;
  return await queryAll<Place & { parent_name: string | null }>(db, `
    SELECT p.*, parent.name as parent_name
    FROM places p
    LEFT JOIN places parent ON parent.id = p.parent_place_id
    WHERE p.normalized_name LIKE ?
    ORDER BY p.name ASC LIMIT 20
  `, [q]);
}

/** Returns the full path of a place as a comma-separated string, e.g. "Fröderyd, Jönköpings län". */
export async function getPlacePath(db: Database, id: string): Promise<string> {
  const parts: string[] = [];
  let currentId: string | null = id;
  while (currentId) {
    const row = await queryOne<{ name: string; parent_place_id: string | null }>(db, 'SELECT name, parent_place_id FROM places WHERE id = ?', [currentId]);
    if (!row) break;
    parts.push(row.name);
    currentId = row.parent_place_id ?? null;
  }
  return parts.join(', ');
}

export async function updatePlace(
  db: Database,
  id: string,
  data: Partial<Omit<Place, 'id' | 'normalized_name'>>
): Promise<Place | null> {
  const existing = await getPlace(db, id);
  if (!existing) return null;
  const name = data.name ?? existing.name;
  await runSql(db, `
    UPDATE places SET
      name = ?, normalized_name = ?, place_type = ?,
      parent_place_id = ?, latitude = ?, longitude = ?,
      date_from = ?, date_to = ?, notes = ?,
      street = ?, postal_code = ?, city = ?, country = ?
    WHERE id = ?
  `, [
    name, normalize(name),
    data.place_type ?? existing.place_type,
    data.parent_place_id ?? existing.parent_place_id,
    data.latitude ?? existing.latitude,
    data.longitude ?? existing.longitude,
    data.date_from ?? existing.date_from,
    data.date_to ?? existing.date_to,
    data.notes ?? existing.notes,
    data.street ?? existing.street,
    data.postal_code ?? existing.postal_code,
    data.city ?? existing.city,
    data.country ?? existing.country,
    id,
  ]);
  return await getPlace(db, id);
}

export async function deletePlace(db: Database, id: string): Promise<boolean> {
  await runSqlChanges(db, `DELETE FROM task_links WHERE entity_type = 'place' AND entity_id = ?`, [id]);
  await runSqlChanges(db, `DELETE FROM group_links WHERE entity_type = 'place' AND entity_id = ?`, [id]);
  // v0.220.0: ignored_duplicates is polymorphic — clean place-typed pairs
  // so a tombstoned id doesn't keep an "ignored" entry pointing at nothing.
  // Mirrors the pattern in deletePerson.
  await deleteIgnoredDuplicatesForPlace(db, id);
  return (await runSqlChanges(db, 'DELETE FROM places WHERE id = ?', [id])) > 0;
}

export async function findOrCreatePlace(db: Database, name: string): Promise<Place> {
  const norm = normalize(name);
  const existing = await queryOne<Place>(db, 'SELECT * FROM places WHERE normalized_name = ? LIMIT 1', [norm]);
  if (existing) return existing;
  return await createPlace(db, { name: name.trim() });
}

/**
 * findOrCreatePlace plus an ancestor chain. Used by PlacePicker when the user
 * accepts a hierarchical gazetteer suggestion: the deepest matched gazetteer
 * node becomes the leaf's parent (creating intermediate Places only when
 * none exist with that parent + name combination).
 *
 * `chain` is ordered root → leaf: e.g. for "Hörningsholm, Mosås (T)" it would
 * be `[{name:'Sverige', ...}, {name:'Örebro län', ...}, {name:'Örebro kommun', ...}, {name:'Mosås', ...}]`
 * and `name` would be `'Hörningsholm'`. Each link in the chain gets created
 * once (matching by `(parent, normalized_name)`) and reused on subsequent calls.
 */
export async function findOrCreatePlaceWithChain(
  db: Database,
  name: string,
  chain: Array<{
    name: string;
    place_type?: Place['place_type'];
    latitude?: number | null;
    longitude?: number | null;
  }>,
  leafProps?: {
    place_type?: Place['place_type'];
    latitude?: number | null;
    longitude?: number | null;
    date_from?: string | null;
    date_to?: string | null;
    notes?: string;
    street?: string | null;
    postal_code?: string | null;
    city?: string | null;
    country?: string | null;
  },
): Promise<Place> {
  let parentId: string | null = null;
  for (const link of chain) {
    const norm = normalize(link.name);
    // Match within the current parent scope to avoid colliding with
    // unrelated places of the same name elsewhere in the tree.
    const existing: Place | undefined = parentId === null
      ? await queryOne<Place>(db, 'SELECT * FROM places WHERE normalized_name = ? AND parent_place_id IS NULL LIMIT 1', [norm])
      : await queryOne<Place>(db, 'SELECT * FROM places WHERE normalized_name = ? AND parent_place_id = ? LIMIT 1', [norm, parentId]);
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const created = await createPlace(db, {
      name: link.name.trim(),
      place_type: link.place_type,
      parent_place_id: parentId,
      latitude: link.latitude ?? null,
      longitude: link.longitude ?? null,
    });
    parentId = created.id;
  }
  // Now look up / create the leaf under the resolved parent. Only apply
  // leafProps when the leaf is newly created — existing places must not be
  // silently overwritten by a findOrCreate call (use updatePlace explicitly).
  const leafNorm = normalize(name);
  const existingLeaf: Place | undefined = parentId === null
    ? await queryOne<Place>(db, 'SELECT * FROM places WHERE normalized_name = ? AND parent_place_id IS NULL LIMIT 1', [leafNorm])
    : await queryOne<Place>(db, 'SELECT * FROM places WHERE normalized_name = ? AND parent_place_id = ? LIMIT 1', [leafNorm, parentId]);
  if (existingLeaf) return existingLeaf;
  return await createPlace(db, { name: name.trim(), parent_place_id: parentId, ...leafProps });
}

/**
 * Direct children of a place node. Pass `null` for root places (no parent).
 * `hasChildren` is computed via EXISTS so the tree picker can render chevrons
 * without N+1 queries when expanding.
 */
export async function listPlaceChildren(
  db: Database,
  parentId: string | null,
): Promise<(Place & { hasChildren: boolean })[]> {
  if (parentId === null) {
    return await queryAll<Place & { hasChildren: boolean }>(db, `
      SELECT p.*,
        EXISTS(SELECT 1 FROM places c WHERE c.parent_place_id = p.id) AS hasChildren
      FROM places p
      WHERE p.parent_place_id IS NULL
      ORDER BY p.name ASC
    `);
  }
  return await queryAll<Place & { hasChildren: boolean }>(db, `
    SELECT p.*,
      EXISTS(SELECT 1 FROM places c WHERE c.parent_place_id = p.id) AS hasChildren
    FROM places p
    WHERE p.parent_place_id = ?
    ORDER BY p.name ASC
  `, [parentId]);
}

const MAX_PLACE_ANCESTOR_DEPTH = 32;

/**
 * Chain from root to `id` (inclusive). Walks `parent_place_id` upward then
 * reverses. Capped at MAX_PLACE_ANCESTOR_DEPTH to defend against accidental
 * cycles in user data.
 */
export async function getPlaceAncestors(db: Database, id: string): Promise<Place[]> {
  const reverseChain: Place[] = [];
  let currentId: string | null = id;
  for (let i = 0; i < MAX_PLACE_ANCESTOR_DEPTH && currentId; i++) {
    const row = await queryOne<Place>(db, 'SELECT * FROM places WHERE id = ?', [currentId]);
    if (!row) break;
    reverseChain.push(row);
    currentId = row.parent_place_id ?? null;
  }
  return reverseChain.reverse();
}

export async function getPersonsForPlace(
  db: Database,
  placeId: string
): Promise<{ id: string; sex: string; given_name: string; surname: string; event_count: number; first_year: string | null; last_year: string | null }[]> {
  return await queryAll(db, `
    SELECT p.id, p.sex,
      COALESCE(pn.given_name, '') AS given_name,
      COALESCE(pn.surname, '') AS surname,
      COUNT(DISTINCT e.id) AS event_count,
      MIN(substr(e.date_value, 1, 4)) AS first_year,
      MAX(substr(e.date_value, 1, 4)) AS last_year
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    JOIN persons p ON p.id = ep.person_id
    LEFT JOIN person_names pn ON pn.id = ${displayedNameIdSql('p.id')}
    WHERE e.place_id = ? AND ep.role = 'primary'
    GROUP BY p.id
    ORDER BY (first_year IS NULL), first_year, pn.surname, pn.given_name
  `, [placeId]);
}
