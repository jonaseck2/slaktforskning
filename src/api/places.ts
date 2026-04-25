import { Database } from 'node-sqlite3-wasm';
import { Place } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
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
  return runSqlChanges(db, 'DELETE FROM places WHERE id = ?', [id]) > 0;
}

export function findOrCreatePlace(db: Database, name: string): Place {
  const norm = normalize(name);
  const existing = queryOne<Place>(db, 'SELECT * FROM places WHERE normalized_name = ? LIMIT 1', [norm]);
  if (existing) return existing;
  return createPlace(db, { name: name.trim() });
}

export function getPersonsForPlace(
  db: Database,
  placeId: string
): { id: string; sex: string; given_name: string; surname: string; event_count: number }[] {
  return queryAll(db, `
    SELECT p.id, p.sex,
      COALESCE(pn.given_name, '') AS given_name,
      COALESCE(pn.surname, '') AS surname,
      COUNT(DISTINCT e.id) AS event_count
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    JOIN persons p ON p.id = ep.person_id
    LEFT JOIN person_names pn ON pn.person_id = p.id AND pn.sort_order = (
      SELECT MIN(pn2.sort_order) FROM person_names pn2 WHERE pn2.person_id = p.id
    )
    WHERE e.place_id = ?
    GROUP BY p.id
    ORDER BY pn.surname, pn.given_name
  `, [placeId]);
}
