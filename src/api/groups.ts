import type { Database } from 'node-sqlite3-wasm';
import type { Group, GroupMember } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

export function createGroup(db: Database, data: { name: string; notes?: string }): Group {
  const id = crypto.randomUUID();
  runSql(db, 'INSERT INTO groups (id, name, notes) VALUES (?, ?, ?)', [id, data.name, data.notes ?? '']);
  return queryOne<Group>(db, 'SELECT * FROM groups WHERE id = ?', [id])!;
}

export function getGroup(db: Database, id: string): Group | null {
  return queryOne<Group>(db, 'SELECT * FROM groups WHERE id = ?', [id]) ?? null;
}

export function listGroups(db: Database): Group[] {
  return queryAll<Group>(db, 'SELECT * FROM groups ORDER BY name');
}

export function updateGroup(db: Database, id: string, data: { name?: string; notes?: string }): Group | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
  if (fields.length === 0) return getGroup(db, id);
  values.push(id);
  runSql(db, `UPDATE groups SET ${fields.join(', ')} WHERE id = ?`, values);
  return getGroup(db, id);
}

export function deleteGroup(db: Database, id: string): boolean {
  return runSqlChanges(db, 'DELETE FROM groups WHERE id = ?', [id]) > 0;
}

export function addGroupMember(db: Database, groupId: string, personId: string): GroupMember {
  const id = crypto.randomUUID();
  runSql(db, 'INSERT OR IGNORE INTO group_members (id, group_id, person_id) VALUES (?, ?, ?)', [id, groupId, personId]);
  return queryOne<GroupMember>(db, 'SELECT * FROM group_members WHERE group_id = ? AND person_id = ?', [groupId, personId])!;
}

export function removeGroupMember(db: Database, groupId: string, personId: string): boolean {
  return runSqlChanges(db, 'DELETE FROM group_members WHERE group_id = ? AND person_id = ?', [groupId, personId]) > 0;
}

export function getGroupMembers(db: Database, groupId: string): GroupMember[] {
  return queryAll<GroupMember>(db, 'SELECT * FROM group_members WHERE group_id = ?', [groupId]);
}

export function getGroupsForPerson(db: Database, personId: string): Group[] {
  return queryAll<Group>(db, `
    SELECT g.* FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.person_id = ?
    ORDER BY g.name
  `, [personId]);
}
