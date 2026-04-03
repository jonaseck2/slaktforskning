import { Database } from 'node-sqlite3-wasm';
import { Place } from './types';

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
  db.prepare(`
    INSERT INTO places (id, name, normalized_name, place_type, parent_place_id, latitude, longitude, date_from, date_to, notes, street, postal_code, city, country)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run([
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
  return (db.prepare('SELECT * FROM places WHERE id = ?').get([id]) as Place | undefined) ?? null;
}

export function listPlaces(db: Database): Place[] {
  return db.prepare('SELECT * FROM places ORDER BY name ASC').all([]) as Place[];
}

export function searchPlaces(db: Database, query: string): Place[] {
  const q = `%${normalize(query)}%`;
  return db.prepare(
    'SELECT * FROM places WHERE normalized_name LIKE ? ORDER BY name ASC LIMIT 20'
  ).all([q]) as Place[];
}

export function updatePlace(
  db: Database,
  id: string,
  data: Partial<Omit<Place, 'id' | 'normalized_name'>>
): Place | null {
  const existing = getPlace(db, id);
  if (!existing) return null;
  const name = data.name ?? existing.name;
  db.prepare(`
    UPDATE places SET
      name = ?, normalized_name = ?, place_type = ?,
      parent_place_id = ?, latitude = ?, longitude = ?,
      date_from = ?, date_to = ?, notes = ?,
      street = ?, postal_code = ?, city = ?, country = ?
    WHERE id = ?
  `).run([
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
  return db.prepare('DELETE FROM places WHERE id = ?').run([id]).changes > 0;
}

export function findOrCreatePlace(db: Database, name: string): Place {
  const norm = normalize(name);
  const existing = db.prepare('SELECT * FROM places WHERE normalized_name = ? LIMIT 1').get([norm]) as Place | undefined;
  if (existing) return existing;
  return createPlace(db, { name: name.trim() });
}
