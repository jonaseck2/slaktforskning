import { describe, it, expect } from 'vitest';
import { createTestDb } from './helpers';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';

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

const HOLGER_MARR_AND_ENGA_GED = `
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
1 ENGA
2 DATE 20 DEC 1983
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

describe('holger profile — MARR+ENGA', () => {
  it('imports engagement event when FAM has both MARR and ENGA', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_MARR_AND_ENGA_GED), { profile: 'holger' });
    const row = db.get('SELECT COUNT(*) as n FROM events WHERE event_type=?', ['engagement']) as { n: number };
    expect(row.n).toBe(1);
  });
});

const HOLGER_FOSTER_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME AlfredFoster /Svensson/
1 SEX M
0 @I2@ INDI
1 NAME BertaFoster /Nilsson/
1 SEX F
0 @I3@ INDI
1 NAME KidFoster /Svensson/
1 SEX M
1 ADOP
2 TYPE Fosterbarn
2 FAMC @F1@
3 ADOP BOTH
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
1 CHIL @I3@
0 TRLR
`.trim();

describe('holger profile — ADOP parent-child subtype', () => {
  it('maps ADOP TYPE Fosterbarn → foster on parent_child relationships', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_FOSTER_GED), { profile: 'holger' });
    const rows = db.all('SELECT subtype FROM relationships WHERE type=?', ['parent_child']) as { subtype: string }[];
    expect(rows.length).toBe(2); // one per parent
    expect(rows.every(r => r.subtype === 'foster')).toBe(true);
  });
});

const HOLGER_MEDIA_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Kalle /Svensson/
1 SEX M
1 OBJE
2 FORM JPG
2 TITL
2 FILE C:\\OurKind\\Media\\P12\\&SvenssonKalle(f1945).jpg
2 NOTE Portrait of Kalle.
0 TRLR
`.trim();

describe('holger profile — media path remapping', () => {
  it('remaps Windows OBJE FILE path to local mediaDir', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_MEDIA_GED), { profile: 'holger', mediaDir: '/local/Media' });
    const row = db.get('SELECT file_ref FROM media LIMIT 1') as { file_ref: string } | undefined;
    expect(row?.file_ref).toBe('/local/Media/P12/&SvenssonKalle(f1945).jpg');
  });

  it('keeps path as-is when no mediaDir provided', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_MEDIA_GED), { profile: 'holger' });
    const row = db.get('SELECT file_ref FROM media LIMIT 1') as { file_ref: string } | undefined;
    expect(row?.file_ref).toContain('SvenssonKalle');
  });
});
