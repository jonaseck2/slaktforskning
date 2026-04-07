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

const HOLGER_REMA_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Kalle /Svensson/
1 SEX M
1 REMA Född i Karolinska sjukhuset.
1 _HDP 6,0,n,n,,PKalleSven1945M,2010-11-03,2026-04-05,0,0,0,P,,1945-03-13,,,
1 _H8P 0,0,0,0
0 TRLR
`.trim();

const HOLGER_REMA_EXISTING_NOTE_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Kalle /Svensson/
1 SEX M
1 NOTE Befintlig anteckning.
2 CONT Fortsättning.
1 REMA Extra notering.
0 TRLR
`.trim();

const HOLGER_MISC_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Kalle /Svensson/
1 SEX M
1 MISC Totalt 15 barn, alla med Johan
0 TRLR
`.trim();

describe('holger profile — REMA/MISC → notes, _HDP/_H8P suppression', () => {
  it('imports REMA as person notes', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_REMA_GED), { profile: 'holger' });
    const row = db.get('SELECT notes FROM persons LIMIT 1') as { notes: string } | undefined;
    expect(row?.notes).toContain('Född i Karolinska sjukhuset.');
  });

  it('appends REMA to existing notes with double newline separator', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_REMA_EXISTING_NOTE_GED), { profile: 'holger' });
    const row = db.get('SELECT notes FROM persons LIMIT 1') as { notes: string } | undefined;
    expect(row?.notes).toContain('Befintlig anteckning.');
    expect(row?.notes).toContain('Extra notering.');
    expect(row?.notes).toMatch(/\n\n/);
  });

  it('imports MISC as person notes', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_MISC_GED), { profile: 'holger' });
    const row = db.get('SELECT notes FROM persons LIMIT 1') as { notes: string } | undefined;
    expect(row?.notes).toContain('Totalt 15 barn');
  });

  it('lists _HDP and _H8P in skipped tags (not silently ignored)', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(HOLGER_REMA_GED), { profile: 'holger' });
    const tags = report.skipped.map(s => s.tag);
    expect(tags).toContain('_HDP');
    expect(tags).toContain('_H8P');
  });

  it('adds unmappedData entry for _HDP/_H8P with descriptive category', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(HOLGER_REMA_GED), { profile: 'holger' });
    const entry = report.unmappedData?.find(u => u.category.includes('_HDP'));
    expect(entry).toBeTruthy();
    expect(entry?.category).toMatch(/internal metadata/i);
  });

  it('adds a warnings entry summarising REMA/MISC as imported notes', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(HOLGER_REMA_GED), { profile: 'holger' });
    expect(report.warnings.some(w => w.includes('REMA') && w.includes('note'))).toBe(true);
  });
});

const HOLGER_SUBM_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @S1@ SUBM
1 NAME Bengt Sareld
0 @I1@ INDI
1 NAME Bengt Gunnar/Sareld/
1 SEX M
0 @I2@ INDI
1 NAME Anna /Sareld/
1 SEX F
0 TRLR
`.trim();

describe('holger profile — defaultPersonId from first INDI', () => {
  it('sets defaultPersonId to the DB id of the first INDI', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(HOLGER_SUBM_GED), { profile: 'holger' });
    expect(report.defaultPersonId).toBeTruthy();
    const row = db.get('SELECT id FROM persons WHERE id=?', [report.defaultPersonId]) as { id: string } | undefined;
    expect(row?.id).toBe(report.defaultPersonId);
  });
});

describe('holger profile — ImportReport structure', () => {
  it('returns ImportReport with correct persons and families counts', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(HOLGER_MARR_AND_ENGA_GED), { profile: 'holger' });
    expect(report.persons).toBe(2);
    expect(report.families).toBe(1);
    expect(Array.isArray(report.warnings)).toBe(true);
    expect(Array.isArray(report.skipped)).toBe(true);
  });

  it('media is imported with correct file_ref when mediaDir is provided', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(HOLGER_MEDIA_GED), { profile: 'holger', mediaDir: '/local/Media' });
    const stmt = db.prepare('SELECT file_ref FROM media LIMIT 1');
    const row = stmt.get([]) as { file_ref: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(row?.file_ref).toContain('/local/Media');
    expect(row?.file_ref).toContain('SvenssonKalle');
  });

  it('media is imported even without mediaDir (path kept as-is)', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(HOLGER_MEDIA_GED), { profile: 'holger' });
    expect(report.persons).toBe(1);
    const stmt = db.prepare('SELECT file_ref FROM media LIMIT 1');
    const row = stmt.get([]) as { file_ref: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(row).toBeDefined();
  });
});
