import { Database } from 'node-sqlite3-wasm';
import { queryAll, queryOne, runBatch, runSql } from './db';

/**
 * External identifiers for non-person entities.
 *
 * **This table exists for round-trip, not for deduplication.** Under the
 * registry contract in `CLAUDE.md` a value that GEDCOM can represent cannot be
 * declared `excluded`, and ArkivDigital's `_AID` is a plain custom tag. It has
 * to be stored somewhere to survive DB → GEDCOM → DB. The precedent is
 * `person_identifiers`, which exists for exactly this reason and covers persons
 * only.
 *
 * Nothing in the app reads these values to make a decision. They are source
 * data the importer preserves and the exporter writes back — a render layer may
 * turn an ArkivDigital id into a clickable archive link, but that resolution
 * happens at display time and is never persisted.
 *
 * No `REFERENCES` clause on `entity_id`: the table spans five entity types and
 * SQLite has no polymorphic foreign key. The owning entity's delete path is
 * responsible for cleanup, exactly as with `note_links` and `group_links` — and
 * as of v0.276.1 all 8 such paths actually do it, which this comment asserted
 * without being true for three releases.
 */

export interface ExternalIdentifier {
  id: string;
  entity_type: string;
  entity_id: string;
  system: string;
  value: string;
  created_at: string;
}

export type ExternalIdentifierInput = Omit<ExternalIdentifier, 'id' | 'created_at'>;

const ALLOWED_ENTITY_TYPES = new Set(['source', 'place', 'citation', 'media', 'repository']);

/** SQLite caps bind parameters at 999; four binds per row. */
const ROWS_PER_CHUNK = 200;

/**
 * Insert identifiers in bulk. `INSERT OR IGNORE` against the UNIQUE index makes
 * this idempotent, so an importer can flush the same set twice without growing
 * the table.
 */
export async function bulkAddExternalIdentifiers(
  db: Database,
  rows: ExternalIdentifierInput[],
): Promise<void> {
  if (rows.length === 0) return;

  for (const row of rows) {
    if (!ALLOWED_ENTITY_TYPES.has(row.entity_type)) {
      throw new Error(
        `external_identifiers: unknown entity_type "${row.entity_type}" ` +
        `(allowed: ${[...ALLOWED_ENTITY_TYPES].join(', ')})`,
      );
    }
  }

  for (let i = 0; i < rows.length; i += ROWS_PER_CHUNK) {
    const chunk = rows.slice(i, i + ROWS_PER_CHUNK);
    await runBatch(
      db,
      `INSERT OR IGNORE INTO external_identifiers (id, entity_type, entity_id, system, value)
       VALUES (?, ?, ?, ?, ?)`,
      chunk.map(r => [crypto.randomUUID(), r.entity_type, r.entity_id, r.system, r.value]),
    );
  }
}

export async function getExternalIdentifiers(
  db: Database,
  entityType: string,
  entityId: string,
): Promise<ExternalIdentifier[]> {
  return queryAll<ExternalIdentifier>(
    db,
    `SELECT * FROM external_identifiers
     WHERE entity_type = ? AND entity_id = ?
     ORDER BY system, value`,
    [entityType, entityId],
  );
}

/**
 * Every identifier for a set of entities, grouped by entity id.
 *
 * The exporter must not fetch per entity — `.claude/rules/performance.md`. One
 * query for the whole entity type, grouped in memory.
 */
export async function getExternalIdentifiersByEntityType(
  db: Database,
  entityType: string,
): Promise<Map<string, ExternalIdentifier[]>> {
  const rows = await queryAll<ExternalIdentifier>(
    db,
    `SELECT * FROM external_identifiers WHERE entity_type = ? ORDER BY entity_id, system, value`,
    [entityType],
  );
  const byEntity = new Map<string, ExternalIdentifier[]>();
  for (const row of rows) {
    const list = byEntity.get(row.entity_id) ?? [];
    list.push(row);
    byEntity.set(row.entity_id, list);
  }
  return byEntity;
}

/**
 * Rows moved off a merged-away entity, plus the ones dropped as duplicates of
 * an identifier the survivor already carried. Enough to undo the move exactly.
 */
export interface ExternalIdentifierMove {
  /** Row ids whose `entity_id` was repointed at the survivor. */
  movedIds: string[];
  /** Whole rows deleted because the survivor already stated the same value. */
  deleted: ExternalIdentifier[];
}

/**
 * Repoint one entity's identifiers onto another, ahead of deleting it.
 *
 * A merge that leaves these rows behind orphans them against a deleted
 * `entity_id`, and the consolidation review then re-offers the cluster it just
 * merged, forever. Measured on 2026-08-29: none of the merge or delete paths
 * touched this table, though the table's own comment says the owning entity's
 * delete path is responsible.
 *
 * Repoint rather than delete: an identifier only the merged-away entity carried
 * is authored data, and the Prime Directive does not let a merge discard it by
 * side effect. A row the survivor already carries is a true duplicate under the
 * UNIQUE index and is dropped — the same dedupe-on-move shape `mergeSources`
 * already uses for `source_repositories` and `media_links`.
 *
 * The caller holds the transaction.
 */
export async function repointExternalIdentifiers(
  db: Database,
  entityType: string,
  fromId: string,
  toId: string,
): Promise<ExternalIdentifierMove> {
  const rows = await queryAll<ExternalIdentifier>(
    db,
    'SELECT * FROM external_identifiers WHERE entity_type = ? AND entity_id = ?',
    [entityType, fromId],
  );
  const movedIds: string[] = [];
  const deleted: ExternalIdentifier[] = [];
  for (const row of rows) {
    const clash = await queryOne<{ id: string }>(
      db,
      `SELECT id FROM external_identifiers
        WHERE entity_type = ? AND entity_id = ? AND system = ? AND value = ?`,
      [entityType, toId, row.system, row.value],
    );
    if (clash) {
      deleted.push(row);
      await runSql(db, 'DELETE FROM external_identifiers WHERE id = ?', [row.id]);
    } else {
      await runSql(db, 'UPDATE external_identifiers SET entity_id = ? WHERE id = ?', [toId, row.id]);
      movedIds.push(row.id);
    }
  }
  return { movedIds, deleted };
}

/**
 * Every identifier row an entity carries, removed with it.
 *
 * Returns what it deleted so an undo wrapper can put the rows back without
 * taking its own snapshot — one call, so the delete and the snapshot cannot
 * drift apart. `deleteSource` must also call this for each of its citations:
 * `citations.source_id` is `ON DELETE CASCADE`, so the citation rows vanish
 * with the source and would strand their identifiers.
 *
 * Measured 2026-08-29: of the 8 paths that delete an entity this table spans,
 * the 3 merge paths repoint (v0.275.0) and these 5 leaked, against the table's
 * own comment saying the owning entity's delete path is responsible.
 *
 * The caller holds the transaction.
 */
export async function deleteExternalIdentifiersFor(
  db: Database,
  entityType: string,
  entityId: string,
): Promise<ExternalIdentifier[]> {
  const rows = await queryAll<ExternalIdentifier>(
    db,
    'SELECT * FROM external_identifiers WHERE entity_type = ? AND entity_id = ?',
    [entityType, entityId],
  );
  if (rows.length === 0) return [];
  await runSql(db, 'DELETE FROM external_identifiers WHERE entity_type = ? AND entity_id = ?',
    [entityType, entityId]);
  return rows;
}

/**
 * Put back rows a `deleteExternalIdentifiersFor` removed, ids and timestamps
 * intact. Deleting an entity is an explicit human action and may take its
 * identifiers with it — undoing that action must bring them back, or the undo
 * silently keeps the loss.
 *
 * The caller holds the transaction.
 */
export async function reinsertExternalIdentifiers(
  db: Database,
  rows: readonly ExternalIdentifier[],
): Promise<void> {
  for (const row of rows) {
    await runSql(
      db,
      `INSERT OR IGNORE INTO external_identifiers (id, entity_type, entity_id, system, value, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.id, row.entity_type, row.entity_id, row.system, row.value, row.created_at],
    );
  }
}

/**
 * Put a `repointExternalIdentifiers` move back. Undo half of the pair; the
 * caller holds the transaction.
 */
export async function restoreExternalIdentifiers(
  db: Database,
  fromId: string,
  move: ExternalIdentifierMove,
): Promise<void> {
  for (const id of move.movedIds) {
    await runSql(db, 'UPDATE external_identifiers SET entity_id = ? WHERE id = ?', [fromId, id]);
  }
  for (const row of move.deleted) {
    await runSql(
      db,
      `INSERT OR IGNORE INTO external_identifiers (id, entity_type, entity_id, system, value, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.id, row.entity_type, row.entity_id, row.system, row.value, row.created_at],
    );
  }
}
