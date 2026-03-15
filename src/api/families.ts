import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { Family, PersonFamilyLink } from './types';

export function createFamily(
  db: Database,
  data: { partner_a_id?: string | null; partner_b_id?: string | null; union_type?: Family['union_type']; notes?: string }
): Family {
  const id = uuid();
  db.prepare(
    `INSERT INTO families (id, partner_a_id, partner_b_id, union_type, notes) VALUES (?, ?, ?, ?, ?)`
  ).run([id, data.partner_a_id ?? null, data.partner_b_id ?? null, data.union_type ?? 'unknown', data.notes ?? '']);
  return getFamily(db, id)!;
}

export function getFamily(db: Database, id: string): Family | null {
  return (db.prepare(`SELECT * FROM families WHERE id = ?`).get([id]) as Family) ?? null;
}

export function listFamilies(db: Database): Family[] {
  return db.prepare(`SELECT * FROM families ORDER BY created_at`).all() as Family[];
}

export function updateFamily(
  db: Database,
  id: string,
  data: Partial<Pick<Family, 'partner_a_id' | 'partner_b_id' | 'union_type' | 'notes'>>
): Family | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.partner_a_id !== undefined) { fields.push('partner_a_id = ?'); values.push(data.partner_a_id); }
  if (data.partner_b_id !== undefined) { fields.push('partner_b_id = ?'); values.push(data.partner_b_id); }
  if (data.union_type !== undefined) { fields.push('union_type = ?'); values.push(data.union_type); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
  if (fields.length === 0) return getFamily(db, id);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE families SET ${fields.join(', ')} WHERE id = ?`).run(values);
  return getFamily(db, id);
}

export function deleteFamily(db: Database, id: string): boolean {
  return db.prepare(`DELETE FROM families WHERE id = ?`).run([id]).changes > 0;
}

export function addChildToFamily(
  db: Database,
  familyId: string,
  personId: string,
  relationshipType: PersonFamilyLink['relationship_type'] = 'biological'
): PersonFamilyLink {
  const id = uuid();
  db.prepare(
    `INSERT INTO person_family_links (id, person_id, family_id, relationship_type) VALUES (?, ?, ?, ?)`
  ).run([id, personId, familyId, relationshipType]);
  return db.prepare(`SELECT * FROM person_family_links WHERE id = ?`).get([id]) as PersonFamilyLink;
}

export function getChildrenOfFamily(db: Database, familyId: string): PersonFamilyLink[] {
  return db.prepare(`SELECT * FROM person_family_links WHERE family_id = ?`).all([familyId]) as PersonFamilyLink[];
}

export function getFamiliesOfPerson(db: Database, personId: string): Family[] {
  return db.prepare(`
    SELECT f.* FROM families f
    WHERE f.partner_a_id = ? OR f.partner_b_id = ?
    UNION
    SELECT f.* FROM families f
    JOIN person_family_links pfl ON pfl.family_id = f.id
    WHERE pfl.person_id = ?
  `).all([personId, personId, personId]) as Family[];
}
