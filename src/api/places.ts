import { Database } from 'node-sqlite3-wasm';
import { Place } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';
import { displayedNameIdSql } from './persons';
import { deleteIgnoredDuplicatesForPlace } from './duplicates';

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
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

export function createPlace(
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
): Place {
  const id = crypto.randomUUID();
  runSql(db, `
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
  return getPlace(db, id)!;
}

export function getPlace(db: Database, id: string): Place | null {
  return queryOne<Place>(db, 'SELECT * FROM places WHERE id = ?', [id]) ?? null;
}

export function listPlaces(db: Database): Place[] {
  return queryAll<Place>(db, 'SELECT * FROM places ORDER BY name ASC');
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

export function listPlacesPage(
  db: Database,
  limit: number,
  offset: number,
  sortBy: ListPlacesSortBy = 'name',
  sortDir: ListPlacesSortDir = 'asc',
  query?: string,
): Place[] {
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  const orderBy = sortBy === 'place_type'
    ? `COALESCE(p.place_type,'') ${dir}, p.name ASC`
    : `p.name ${dir}`;
  const filter = buildPlacesFilterClause(query);
  return queryAll<Place>(db, `
    SELECT p.* FROM places p
    ${filter.where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `, [...filter.params, limit, offset]);
}

export function countPlaces(db: Database, query?: string): number {
  const filter = buildPlacesFilterClause(query);
  if (!filter.where) {
    return queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM places')?.n ?? 0;
  }
  return queryOne<{ n: number }>(db, `SELECT COUNT(*) as n FROM places p ${filter.where}`, filter.params)?.n ?? 0;
}

export function searchPlaces(db: Database, query: string): (Place & { parent_name: string | null })[] {
  const q = `%${normalize(query)}%`;
  return queryAll<Place & { parent_name: string | null }>(db, `
    SELECT p.*, parent.name as parent_name
    FROM places p
    LEFT JOIN places parent ON parent.id = p.parent_place_id
    WHERE p.normalized_name LIKE ?
    ORDER BY p.name ASC LIMIT 20
  `, [q]);
}

/** Returns the full path of a place as a comma-separated string, e.g. "Fröderyd, Jönköpings län". */
export function getPlacePath(db: Database, id: string): string {
  const parts: string[] = [];
  let currentId: string | null = id;
  while (currentId) {
    const row = queryOne<{ name: string; parent_place_id: string | null }>(db, 'SELECT name, parent_place_id FROM places WHERE id = ?', [currentId]);
    if (!row) break;
    parts.push(row.name);
    currentId = row.parent_place_id ?? null;
  }
  return parts.join(', ');
}

export function updatePlace(
  db: Database,
  id: string,
  data: Partial<Omit<Place, 'id' | 'normalized_name'>>
): Place | null {
  const existing = getPlace(db, id);
  if (!existing) return null;
  const name = data.name ?? existing.name;
  runSql(db, `
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
  return getPlace(db, id);
}

export function deletePlace(db: Database, id: string): boolean {
  runSqlChanges(db, `DELETE FROM task_links WHERE entity_type = 'place' AND entity_id = ?`, [id]);
  runSqlChanges(db, `DELETE FROM group_links WHERE entity_type = 'place' AND entity_id = ?`, [id]);
  // v0.220.0: ignored_duplicates is polymorphic — clean place-typed pairs
  // so a tombstoned id doesn't keep an "ignored" entry pointing at nothing.
  // Mirrors the pattern in deletePerson.
  deleteIgnoredDuplicatesForPlace(db, id);
  return runSqlChanges(db, 'DELETE FROM places WHERE id = ?', [id]) > 0;
}

export function findOrCreatePlace(db: Database, name: string): Place {
  const norm = normalize(name);
  const existing = queryOne<Place>(db, 'SELECT * FROM places WHERE normalized_name = ? LIMIT 1', [norm]);
  if (existing) return existing;
  return createPlace(db, { name: name.trim() });
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
export function findOrCreatePlaceWithChain(
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
): Place {
  let parentId: string | null = null;
  for (const link of chain) {
    const norm = normalize(link.name);
    // Match within the current parent scope to avoid colliding with
    // unrelated places of the same name elsewhere in the tree.
    const existing: Place | undefined = parentId === null
      ? queryOne<Place>(db, 'SELECT * FROM places WHERE normalized_name = ? AND parent_place_id IS NULL LIMIT 1', [norm])
      : queryOne<Place>(db, 'SELECT * FROM places WHERE normalized_name = ? AND parent_place_id = ? LIMIT 1', [norm, parentId]);
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const created = createPlace(db, {
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
    ? queryOne<Place>(db, 'SELECT * FROM places WHERE normalized_name = ? AND parent_place_id IS NULL LIMIT 1', [leafNorm])
    : queryOne<Place>(db, 'SELECT * FROM places WHERE normalized_name = ? AND parent_place_id = ? LIMIT 1', [leafNorm, parentId]);
  if (existingLeaf) return existingLeaf;
  return createPlace(db, { name: name.trim(), parent_place_id: parentId, ...leafProps });
}

/**
 * Direct children of a place node. Pass `null` for root places (no parent).
 * `hasChildren` is computed via EXISTS so the tree picker can render chevrons
 * without N+1 queries when expanding.
 */
export function listPlaceChildren(
  db: Database,
  parentId: string | null,
): (Place & { hasChildren: boolean })[] {
  if (parentId === null) {
    return queryAll<Place & { hasChildren: boolean }>(db, `
      SELECT p.*,
        EXISTS(SELECT 1 FROM places c WHERE c.parent_place_id = p.id) AS hasChildren
      FROM places p
      WHERE p.parent_place_id IS NULL
      ORDER BY p.name ASC
    `);
  }
  return queryAll<Place & { hasChildren: boolean }>(db, `
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
export function getPlaceAncestors(db: Database, id: string): Place[] {
  const reverseChain: Place[] = [];
  let currentId: string | null = id;
  for (let i = 0; i < MAX_PLACE_ANCESTOR_DEPTH && currentId; i++) {
    const row = queryOne<Place>(db, 'SELECT * FROM places WHERE id = ?', [currentId]);
    if (!row) break;
    reverseChain.push(row);
    currentId = row.parent_place_id ?? null;
  }
  return reverseChain.reverse();
}

export function getPersonsForPlace(
  db: Database,
  placeId: string
): { id: string; sex: string; given_name: string; surname: string; event_count: number; first_year: string | null; last_year: string | null }[] {
  return queryAll(db, `
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
