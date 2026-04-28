import type { Database } from 'node-sqlite3-wasm';
import type { Group, GroupLink, LinkEntityType } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';
import { getLinkedEntities } from './links';

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

// ── Links ──────────────────────────────────────────────────────────────────

export function addGroupLink(db: Database, groupId: string, entityType: LinkEntityType, entityId: string): GroupLink {
  const id = crypto.randomUUID();
  const nextOrder = queryOne<{ m: number | null }>(db,
    'SELECT MAX(sort_order) AS m FROM group_links WHERE group_id = ? AND entity_type = ?',
    [groupId, entityType]
  );
  const sort = (nextOrder?.m ?? -1) + 1;
  runSql(db,
    `INSERT OR IGNORE INTO group_links (id, group_id, entity_type, entity_id, sort_order) VALUES (?, ?, ?, ?, ?)`,
    [id, groupId, entityType, entityId, sort]
  );
  return queryOne<GroupLink>(db,
    'SELECT * FROM group_links WHERE group_id = ? AND entity_type = ? AND entity_id = ?',
    [groupId, entityType, entityId]
  )!;
}

export function removeGroupLink(db: Database, linkId: string): boolean {
  return runSqlChanges(db, 'DELETE FROM group_links WHERE id = ?', [linkId]) > 0;
}

export function removeGroupLinkByEntity(db: Database, groupId: string, entityType: LinkEntityType, entityId: string): boolean {
  return runSqlChanges(db,
    'DELETE FROM group_links WHERE group_id = ? AND entity_type = ? AND entity_id = ?',
    [groupId, entityType, entityId]
  ) > 0;
}

export function getGroupLinks(db: Database, groupId: string): GroupLink[] {
  return queryAll<GroupLink>(db,
    'SELECT * FROM group_links WHERE group_id = ? ORDER BY entity_type, sort_order, created_at',
    [groupId]
  );
}

const GROUP_LINK_CONFIG = {
  linkTable: 'group_links',
  parentTable: 'groups',
  parentFk: 'group_id',
  orderBy: 'g.name',
} as const;

export function getGroupsForPerson(db: Database, personId: string): Group[] {
  return getLinkedEntities<Group>(db, GROUP_LINK_CONFIG, 'person', personId);
}

export function getGroupsForPlace(db: Database, placeId: string): Group[] {
  return getLinkedEntities<Group>(db, GROUP_LINK_CONFIG, 'place', placeId);
}

export function getGroupsForMedia(db: Database, mediaId: string): Group[] {
  return getLinkedEntities<Group>(db, GROUP_LINK_CONFIG, 'media', mediaId);
}
