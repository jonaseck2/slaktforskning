import { describe, it, expect } from 'vitest';
import { createTestDb } from './helpers';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/gedcom/importer';

const HOLGER_SAMBO_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Kalle /Svensson/
1 SEX M
0 @I2@ INDI
1 NAME Stina /Nilsson/
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 ENGA
2 TYPE Sambo
0 TRLR
`.trim();

const HOLGER_MARR_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Kalle /Svensson/
1 SEX M
0 @I2@ INDI
1 NAME Stina /Nilsson/
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 15 JUN 1985
0 TRLR
`.trim();

describe('holger profile — couple subtype', () => {
  it('maps ENGA TYPE Sambo → cohabitation', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_SAMBO_GED), { profile: 'holger' });
    const row = db.get('SELECT subtype FROM relationships WHERE type=?', ['couple']) as { subtype: string } | undefined;
    expect(row?.subtype).toBe('cohabitation');
  });

  it('does not create an engagement event for Holger ENGA couples', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_SAMBO_GED), { profile: 'holger' });
    const row = db.get('SELECT COUNT(*) as n FROM events WHERE event_type=?', ['engagement']) as { n: number };
    expect(row.n).toBe(0);
  });

  it('still uses marriage subtype for MARR families', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_MARR_GED), { profile: 'holger' });
    const row = db.get('SELECT subtype FROM relationships WHERE type=?', ['couple']) as { subtype: string } | undefined;
    expect(row?.subtype).toBe('marriage');
  });
});
