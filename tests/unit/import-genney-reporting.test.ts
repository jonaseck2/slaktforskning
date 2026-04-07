/**
 * Tests for Genney import warnings/skipped reporting.
 * Calls transformGenney() directly with minimal fixture data
 * to trigger each silent-data-loss condition.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { transformGenney, GenneyTables } from '../../src/import/genney/transform';
import type { Database } from 'node-sqlite3-wasm';

function emptyTables(): GenneyTables {
  return {
    PERSON: [], FAMILY: [], COUPLE_FAMILY: [], SPOUSE_FAMILY: [],
    EVENT: [], EVENT_PLACE: [], OWNER_EVENT: [], SPLACE: [], SOURCE: [],
    CITATION: [], CITATION_SOURCE: [], OWNER_CITATION: [], REMARK: [],
    REPO: [], SOURCE_REPO: [], GROUPS: [], GROUP_MEMBER: [],
    MEDIA: [], OWNER_MEDIA: [], TODO: [],
  };
}

let db: Database;
beforeEach(() => {
  db = createTestDb();
});

describe('Genney import reporting', () => {
  it('summary has warnings and skipped arrays', () => {
    const tables = emptyTables();
    const summary = transformGenney(db, tables);
    expect(Array.isArray(summary.warnings)).toBe(true);
    expect(Array.isArray(summary.skipped)).toBe(true);
    expect(summary.warnings).toHaveLength(0);
    expect(summary.skipped).toHaveLength(0);
  });

  it('orphaned events (no OWNER_EVENT entry) appear in skipped', () => {
    const tables = emptyTables();
    // Event with TYPE BIRT but no OWNER_EVENT and no EVENT.OWNER
    tables.EVENT = [{ RID: 'E1', TYPE: 'BIRT', DATE: null, DESCRIPTION: null, NOTE: null, CAUSE: null, ADDRESS: null, OWNER: null, PLACE: null }];
    // No OWNER_EVENT entries
    const summary = transformGenney(db, tables);
    const entry = summary.skipped.find(s => /orphan/i.test(s.category) || /owner/i.test(s.category) || /event/i.test(s.category));
    expect(entry).toBeDefined();
    expect(entry!.count).toBeGreaterThan(0);
  });

  it('citations with no CITATION_SOURCE entry are counted in skipped', () => {
    const tables = emptyTables();
    // Citation exists but has no CITATION_SOURCE link → no source_id → silently skipped
    tables.CITATION = [{ RID: 'C1', WHEREINTEXT: 'p.1', TEXT: null, NOTE: null, CERTAINTY: 2, DATE: null }];
    // No CITATION_SOURCE entries → sourceRid will be undefined
    const summary = transformGenney(db, tables);
    const entry = summary.skipped.find(s => /orphan/i.test(s.category) || /citation/i.test(s.category));
    expect(entry).toBeDefined();
    expect(entry!.count).toBeGreaterThanOrEqual(1);
  });

  it('unknown EVENT.TYPE values appear in warnings', () => {
    const tables = emptyTables();
    tables.PERSON = [{ RID: 'I1', SEX: 0 }];
    // EVENT with an unrecognised TYPE
    tables.EVENT = [{ RID: 'E1', TYPE: 'UNKNOWNTYPE', DATE: null, DESCRIPTION: null, NOTE: null, CAUSE: null, ADDRESS: null, OWNER: 'I1', PLACE: null }];
    tables.OWNER_EVENT = [{ OWNER: 'I1', EVENT: 'E1', COUPLEFAMILY: null }];
    const summary = transformGenney(db, tables);
    const warning = summary.warnings.find(w => /UNKNOWNTYPE/i.test(w));
    expect(warning).toBeDefined();
  });

  it('COUPLE_FAMILY rows with null link type appear in skipped', () => {
    const tables = emptyTables();
    tables.PERSON = [
      { RID: 'I1', SEX: 0 }, // father
      { RID: 'I2', SEX: 0 }, // child
    ];
    // COUPLE_FAMILY with FATHER present but FATHERLINK is null → should be skipped
    tables.COUPLE_FAMILY = [{ PERSON: 'I2', FATHER: 'I1', MOTHER: null, FATHERLINK: null, MOTHERLINK: null }];
    const summary = transformGenney(db, tables);
    const entry = summary.skipped.find(s => /parent/i.test(s.category) || /link/i.test(s.category) || /couple/i.test(s.category));
    expect(entry).toBeDefined();
    expect(entry!.count).toBeGreaterThan(0);
  });

  it('unreferenced SPLACEs appear in skipped', () => {
    const tables = emptyTables();
    // Two places; neither is referenced by any EVENT_PLACE
    tables.SPLACE = [
      { RID: 1, NAME: 'Parish A', PARENT: null, LATITUD: null, LONGITUD: null },
      { RID: 2, NAME: 'Town B', PARENT: null, LATITUD: null, LONGITUD: null },
    ];
    const summary = transformGenney(db, tables);
    const entry = summary.skipped.find(s => /place/i.test(s.category) || /unreferenced/i.test(s.category));
    expect(entry).toBeDefined();
    expect(entry!.count).toBe(2);
  });

  it('source NOTE field drops appear in warnings', () => {
    const tables = emptyTables();
    tables.SOURCE = [
      { RID: 'S1', TITLE: 'Source with note', NOTE: 'Important note content' },
      { RID: 'S2', TITLE: 'Source without note', NOTE: null },
    ];
    const summary = transformGenney(db, tables);
    const warning = summary.warnings.find(w => /note/i.test(w) || /source/i.test(w));
    expect(warning).toBeDefined();
    expect(warning).toMatch(/1 source/);
  });
});
