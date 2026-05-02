/**
 * Coverage guard: every (table, column) in the schema must have an entry
 * in src/api/gedcom_fidelity_registry.ts, and every registry entry must
 * point at a real column. Bidirectional check.
 *
 * See CLAUDE.md "⚠️ Prime Directive (cont.): Round-Trip Fidelity".
 */
import { describe, it, expect } from 'vitest';
import { queryAll } from '../../src/api/db';
import { GEDCOM_FIDELITY } from '../../src/api/gedcom_fidelity_registry';
import { EXEMPT_TABLES } from '../helpers/gedcom_fidelity';
import { createTestDb } from './helpers';

describe('GEDCOM fidelity registry coverage', () => {
  it('every non-exempt column in every table has a registry entry', () => {
    const db = createTestDb();
    const tables = queryAll<{ name: string }>(
      db,
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    ).map(t => t.name);

    const missing: string[] = [];
    for (const table of tables) {
      if (table in EXEMPT_TABLES) continue;
      const cols = queryAll<{ name: string }>(db, `PRAGMA table_info(${table})`).map(c => c.name);
      for (const col of cols) {
        const key = `${table}.${col}`;
        if (!(key in GEDCOM_FIDELITY)) missing.push(key);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `GEDCOM fidelity registry missing ${missing.length} entries:\n` +
          missing.map(k => `  - ${k}`).join('\n') +
          `\n\nYou added or renamed columns. For each missing key, add an entry to ` +
          `src/api/gedcom_fidelity_registry.ts declaring its round-trip status under ` +
          `GEDCOM 5.5.1 and 7.0. See the Prime Directive in CLAUDE.md.`,
      );
    }
  });

  it('every registry key references a column that exists in the live schema', () => {
    const db = createTestDb();
    const tables = queryAll<{ name: string }>(
      db,
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    ).map(t => t.name);
    const liveColumns = new Set<string>();
    for (const table of tables) {
      const cols = queryAll<{ name: string }>(db, `PRAGMA table_info(${table})`).map(c => c.name);
      for (const col of cols) liveColumns.add(`${table}.${col}`);
    }

    const stale = Object.keys(GEDCOM_FIDELITY).filter(k => !liveColumns.has(k));
    if (stale.length > 0) {
      throw new Error(
        `Registry has ${stale.length} stale entries (referenced columns no longer exist):\n` +
          stale.map(k => `  - ${k}`).join('\n') +
          `\n\nA column was dropped or renamed. Update src/api/gedcom_fidelity_registry.ts ` +
          `to remove or rename the entry.`,
      );
    }
  });

  it('EXEMPT_TABLES entries do not appear in the registry (mutually exclusive)', () => {
    const exempted = Object.keys(EXEMPT_TABLES);
    const registryTables = new Set(Object.keys(GEDCOM_FIDELITY).map(k => k.split('.')[0]));
    const overlaps = exempted.filter(t => registryTables.has(t));
    expect(overlaps).toEqual([]);
  });
});
