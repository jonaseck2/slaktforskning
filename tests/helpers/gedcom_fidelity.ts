/**
 * Helpers for GEDCOM round-trip fidelity tests.
 *
 * - EXEMPT_TABLES: tables intentionally outside the registry, with reason.
 * - VERSION_LABEL: maps internal version keys to exportGedcom's string param.
 * - makeSentinelValue: column-type-aware recognisable sentinel.
 * - seedRowWithColumn: insert a row exercising one column (FK-safe).
 * - readColumnFromOnlyRow: round-trip and read the column back.
 * - canonicaliseDb: normalise a DB for deep-equal comparison.
 * - roundTrip: export → parse → import, returning a fresh DB.
 */
import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../../src/api/db';
import { exportGedcom } from '../../src/gedcom/exporter';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { createTestDb } from '../unit/helpers';

export type RegistryVersion = 'v551' | 'v70';

export const VERSION_LABEL: Record<RegistryVersion, '5.5.1' | '7.0'> = {
  v551: '5.5.1',
  v70: '7.0',
};

/**
 * Tables intentionally outside the GEDCOM fidelity registry.
 * Adding a table here requires PR justification.
 */
export const EXEMPT_TABLES: Record<string, string> = {
  gazetteers: 'gazetteer cache; pure derived data per Prime Directive #1',
  ignored_duplicates: 'per-DB UI state; no source-data analog',
  media_regions: 'face/region annotations; no GEDCOM 5.5.1 representation, 7.0 OBJE.CROP exporter not yet shipped — promote to registered entry when it does',
  db_settings: 'per-install preferences; user state, not genealogical data',
  person_names_new: 'migration artifact; should not exist in a settled DB',
  research_tasks_new: 'migration artifact; should not exist in a settled DB',
};

/**
 * Generate a sentinel value for a column. Recognisable across round-trip
 * and type-appropriate (TEXT → string, INTEGER → number, REAL → number).
 *
 * The sentinel is unique per (table, col) so a misattribution bug fails
 * loudly: if the importer puts persons.notes data into events.notes, the
 * sentinel mismatch is obvious.
 */
export function makeSentinelValue(table: string, col: string, colType: string): unknown {
  const t = colType.toUpperCase();
  if (t.startsWith('INT')) return 42;
  if (t.startsWith('REAL') || t.includes('FLOAT') || t.includes('DOUBLE')) return 12.5;
  // TEXT / unknown — string sentinel encoding the (table, col) pair.
  // Keep ASCII-only and short to survive GEDCOM line-length quirks.
  return `S_${table}_${col}_x9`;
}

/**
 * Seed a single row into `table` with the target column populated by `value`.
 * Other NOT NULL columns get minimal placeholder values. Foreign-key parents
 * are seeded as needed. Returns the inserted row id (UUID).
 *
 * Implemented in Task 6 — for now, throws so the test files compile but
 * cannot accidentally pass before per-table seeders exist.
 */
export function seedRowWithColumn(
  db: Database,
  table: string,
  col: string,
  value: unknown,
): string {
  return seedByTable(db, table, col, value);
}

function seedByTable(_db: Database, table: string, col: string, _value: unknown): string {
  throw new Error(
    `seedRowWithColumn: no seeder for table=${table} (col=${col}) — add it in Task 6`,
  );
}

/**
 * Round-trip a DB through GEDCOM at the given version. Returns the fresh DB.
 */
export function roundTrip(db: Database, version: RegistryVersion): Database {
  const { ged } = exportGedcom(db, VERSION_LABEL[version]);
  const tree = parseGedcom(ged);
  const fresh = createTestDb();
  importGedcom(fresh, tree);
  return fresh;
}

/**
 * After round-trip, read the value of `col` from the (single) row in `table`.
 * Per-field tests seed exactly one row, so this is straightforward.
 */
export function readColumnFromOnlyRow(db: Database, table: string, col: string): unknown {
  const rows = queryAll<Record<string, unknown>>(db, `SELECT ${col} FROM ${table}`);
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new Error(`readColumnFromOnlyRow: expected 1 row in ${table}, got ${rows.length}`);
  }
  return rows[0][col];
}

/**
 * Canonicalise a DB for deep-equal comparison in golden tests.
 * - Drops audit columns (created_at, updated_at).
 * - Drops UUIDs (re-issued on import).
 * - Drops normalized_name (derived from name).
 * - Sorts multi-row tables by stable JSON serialisation.
 *
 * Returns a plain object: { tableName: row[] }.
 */
export function canonicaliseDb(db: Database): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  const tables = queryAll<{ name: string }>(
    db,
    "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ).map(t => t.name);
  for (const table of tables) {
    if (table in EXEMPT_TABLES) continue;
    const rows = queryAll<Record<string, unknown>>(db, `SELECT * FROM ${table}`);
    out[table] = rows.map(stripAuditAndIds).sort(stableRowSort);
  }
  return out;
}

function stripAuditAndIds(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'created_at' || k === 'updated_at') continue;
    if (k === 'id') continue; // UUIDs re-issued on import
    if (k === 'normalized_name') continue; // derived from name
    out[k] = v;
  }
  return out;
}

function stableRowSort(a: Record<string, unknown>, b: Record<string, unknown>): number {
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}
