import { Database } from 'node-sqlite3-wasm';
import { queryAll, runBatch } from './db';

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
 * responsible for cleanup, exactly as with `note_links` and `group_links`.
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
