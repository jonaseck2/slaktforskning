import type { Database } from 'node-sqlite3-wasm';
import type { Group, GroupMember } from './types';

export function createGroup(db: Database, data: { name: string; notes?: string }): Group {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO groups (id, name, notes) VALUES (?, ?, ?)').run([id, data.name, data.notes ?? '']);
  return db.prepare('SELECT * FROM groups WHERE id = ?').get([id]) as Group;
}

export function getGroup(db: Database, id: string): Group | null {
  return (db.prepare('SELECT * FROM groups WHERE id = ?').get([id]) ?? null) as Group | null;
}

export function listGroups(db: Database): Group[] {
  return db.prepare('SELECT * FROM groups ORDER BY name').all([]) as Group[];
}

export function updateGroup(db: Database, id: string, data: { name?: string; notes?: string }): Group | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
  if (fields.length === 0) return getGroup(db, id);
  values.push(id);
  db.prepare(`UPDATE groups SET ${fields.join(', ')} WHERE id = ?`).run(values);
  return getGroup(db, id);
}

export function deleteGroup(db: Database, id: string): boolean {
  return ((db.prepare('DELETE FROM groups WHERE id = ?').run([id]) as { changes: number }).changes) > 0;
}

export function addGroupMember(db: Database, groupId: string, personId: string): GroupMember {
  const id = crypto.randomUUID();
  db.prepare('INSERT OR IGNORE INTO group_members (id, group_id, person_id) VALUES (?, ?, ?)').run([id, groupId, personId]);
  return db.prepare('SELECT * FROM group_members WHERE group_id = ? AND person_id = ?').get([groupId, personId]) as GroupMember;
}

export function removeGroupMember(db: Database, groupId: string, personId: string): boolean {
  return ((db.prepare('DELETE FROM group_members WHERE group_id = ? AND person_id = ?').run([groupId, personId]) as { changes: number }).changes) > 0;
}

export function getGroupMembers(db: Database, groupId: string): GroupMember[] {
  return db.prepare('SELECT * FROM group_members WHERE group_id = ?').all([groupId]) as GroupMember[];
}

export function getGroupsForPerson(db: Database, personId: string): Group[] {
  return db.prepare(`
    SELECT g.* FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.person_id = ?
    ORDER BY g.name
  `).all([personId]) as Group[];
}
