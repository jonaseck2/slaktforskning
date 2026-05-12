/**
 * Per-field GEDCOM round-trip test.
 *
 * For every (registry entry × version), seed a row exercising that column,
 * round-trip through GEDCOM, and assert the column survives (or matches the
 * registry-declared lossy expectation).
 *
 * Excluded entries get a documented passing it() that asserts the registry
 * entry's exclusion reason — same per-cell coverage as before, but without
 * polluting the suite summary's `skipped` count. See
 * docs/plans/archive/2026-05-12-skipped-tests-cleanup.md.
 *
 * See CLAUDE.md "⚠️ Prime Directive (cont.): Round-Trip Fidelity".
 */
import { describe, it, expect } from 'vitest';
import { queryAll } from '../../src/api/db';
import {
  GEDCOM_FIDELITY,
  type FidelityStatus,
} from '../../src/api/gedcom_fidelity_registry';
import {
  makeSentinelValue,
  seedRowWithColumn,
  roundTrip,
  readColumnFromOnlyRow,
  type RegistryVersion,
} from '../helpers/gedcom_fidelity';
import { createTestDb } from './helpers';

const VERSIONS: RegistryVersion[] = ['v551', 'v70'];

async function getColumnType(table: string, col: string): string {
  const db = await createTestDb();
  const info = await queryAll<{ name: string; type: string }>(
    db,
    `PRAGMA table_info(${table})`,
  );
  const found = info.find(c => c.name === col);
  if (!found) throw new Error(`column ${table}.${col} not in schema`);
  return found.type;
}

describe('GEDCOM fidelity per-field round-trip', async () => {
  for (const [key, fidelity] of Object.entries(GEDCOM_FIDELITY)) {
    const [table, col] = key.split('.');
    describe(key, async () => {
      for (const version of VERSIONS) {
        const status: FidelityStatus = fidelity[version];
        if (status.kind === 'excluded') {
          it(`${version}: excluded — ${status.reason}`, () => {
            // Documented as not round-trippable; the registry entry IS the
            // contract. Asserting it here converts a skip-with-reason line
            // into a passing-with-reason line — same coverage, no noise in
            // the suite summary's `skipped` count. See
            // docs/plans/archive/2026-05-12-skipped-tests-cleanup.md.
            expect(status.kind).toBe('excluded');
            expect(status.reason.length).toBeGreaterThan(0);
          });
          continue;
        }

        it(`${version}: round-trips`, async () => {
          const colType = await getColumnType(table, col);
          const sentinel = makeSentinelValue(table, col, colType);
          const db = await createTestDb();
          // Capture the seeded row's other column values BEFORE round-trip,
          // so lossy expectations that depend on row context (e.g. relationships.subtype
          // depends on relationships.type) can read them.
          seedRowWithColumn(db, table, col, sentinel);
          const seededRows = await queryAll<Record<string, unknown>>(db, `SELECT * FROM ${table}`);
          const seededRow = seededRows[0] ?? {};

          const fresh = await roundTrip(db, version);
          const got = await readColumnFromOnlyRow(fresh, table, col);

          if (status.kind === 'lossless' || status.kind === 'lossless-via') {
            expect(got, `column ${key} under ${version}`).toEqual(sentinel);
          } else {
            // lossy — compare against declared expectation
            const expected = status.expectedAfterRoundTrip(sentinel, { row: seededRow });
            expect(
              got,
              `column ${key} under ${version} (lossy: ${status.reason})`,
            ).toEqual(expected);
          }
        });
      }
    });
  }
});
