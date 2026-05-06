// Polymorphic link helpers.
//
// The codebase had ~11 near-identical "get linked entities" queries
// (getCitationsForPerson/Place/Event/Relationship/Source,
// getGroupsForPerson/Place/Media, getResearchTasksForPerson/Place/Media).
// This file collapses them into two helpers; the per-entity functions
// in groups.ts / research_tasks.ts / sources.ts stay as 1-line wrappers
// so MCP tools and IPC handlers don't need updating.
//
// Two helpers because the schema is different in two ways:
//   - group_links / task_links / media_links use a polymorphic pair
//     (entity_type, entity_id) and a JOIN to the parent table.
//   - citations stores foreign keys as separate columns
//     (person_id, place_id, event_id, relationship_id, source_id) on
//     the citations row itself.

import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from './db';

export type PolymorphicEntityType = 'person' | 'place' | 'media';

export interface PolymorphicLinkConfig {
  /** The link table name (group_links / task_links / media_links). */
  linkTable: 'group_links' | 'task_links' | 'media_links';
  /** The parent table name (groups / research_tasks / media). */
  parentTable: 'groups' | 'research_tasks' | 'media';
  /** Foreign key column on the link table that points to the parent. */
  parentFk: 'group_id' | 'task_id' | 'media_id';
  /** ORDER BY clause for the result, e.g. "g.name" or "rt.priority DESC, rt.created_at". */
  orderBy: string;
}

/**
 * Generic polymorphic link query: returns parent rows linked to a
 * (entityType, entityId) pair via the configured link table.
 */
export function getLinkedEntities<T>(
  db: Database,
  config: PolymorphicLinkConfig,
  entityType: PolymorphicEntityType,
  entityId: string,
): T[] {
  const parentAlias = config.parentTable === 'research_tasks' ? 'rt' : config.parentTable[0];
  const linkAlias = config.parentTable === 'research_tasks' ? 'tl' : config.parentTable[0] + 'l';
  const sql = `
    SELECT ${parentAlias}.* FROM ${config.parentTable} ${parentAlias}
    JOIN ${config.linkTable} ${linkAlias} ON ${linkAlias}.${config.parentFk} = ${parentAlias}.id
    WHERE ${linkAlias}.entity_type = ? AND ${linkAlias}.entity_id = ?
    ORDER BY ${config.orderBy}
  `;
  return queryAll<T>(db, sql, [entityType, entityId]);
}

export type CitationOwnerType = 'person' | 'place' | 'event' | 'relationship' | 'source' | 'person_name';

const CITATION_FK_COLUMN: Record<CitationOwnerType, string> = {
  person: 'person_id',
  place: 'place_id',
  event: 'event_id',
  relationship: 'relationship_id',
  source: 'source_id',
  person_name: 'person_name_id',
};

/**
 * Citations are linked via direct FK columns on the citations row, not
 * through a polymorphic link table. This helper picks the column based
 * on the owner type and returns matching citations.
 */
export function getCitationsByOwner<T>(
  db: Database,
  ownerType: CitationOwnerType,
  ownerId: string,
): T[] {
  const col = CITATION_FK_COLUMN[ownerType];
  return queryAll<T>(db, `SELECT * FROM citations WHERE ${col} = ?`, [ownerId]);
}
