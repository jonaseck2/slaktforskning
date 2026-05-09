import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { getDbSetting, setDbSetting, deleteDbSetting } from '../../src/api/db_settings';
import { createTestDb } from './helpers';

const LDS_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Lars /Eriksson/
1 SEX M
1 BAPL
2 DATE 15 MAR 1990
1 SLGC
2 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
0 TRLR
`.trim();

const TRAN_GED = `
0 HEAD
1 GEDC
2 VERS 7.0
0 @I1@ INDI
1 NAME Lars /Eriksson/
2 TRAN Lars /Eriksson/
3 LANG sv
0 TRLR
`.trim();

const NO_GED = `
0 HEAD
1 GEDC
2 VERS 7.0
0 @I1@ INDI
1 NAME Lars /Eriksson/
1 NO CHIL
0 TRLR
`.trim();

const ASSO_GED = `
0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Lars /Eriksson/
1 SEX M
1 ASSO @I2@
2 RELA Neighbour
0 @I2@ INDI
1 NAME Karin /Svensson/
1 SEX F
0 TRLR
`.trim();

describe('GEDCOM import — ASSO reporting', () => {
  it('reports dropped ASSO associations in unmappedData', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(ASSO_GED));
    const entry = report.unmappedData.find(u => u.category.includes('ASSO'));
    expect(entry).toBeTruthy();
    expect(entry!.count).toBe(1);
  });
});

describe('GEDCOM import — data integrity reporting', () => {
  it('reports LDS ordinances in unmappedData with descriptive category', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(LDS_GED));
    const entry = report.unmappedData.find(u => u.category.includes('LDS'));
    expect(entry).toBeTruthy();
    expect(entry!.count).toBeGreaterThan(0);
  });

  it('reports TRAN translations in warnings', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(TRAN_GED));
    expect(report.warnings.some(w => w.includes('TRAN') || w.includes('translation'))).toBe(true);
  });

  it('reports NO negative assertions in unmappedData', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(NO_GED));
    const entry = report.unmappedData.find(u => u.category.includes('NO') || u.category.includes('negat'));
    expect(entry).toBeTruthy();
    expect(entry!.count).toBeGreaterThan(0);
  });

  // Plan 2026-05-04-new-person-dialog-hardening: nameless INDIs are preserved
  // (the source's reference graph may need them) but the user is disclosed via
  // a warning so the PERSON_NO_NAME quality check finds them.
  it('preserves a NAME-less INDI as a nameless person and warns the user', () => {
    const NAMELESS_GED = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 SEX M
0 @I2@ INDI
1 NAME Lars /Eriksson/
1 SEX M
0 TRLR
`.trim();
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(NAMELESS_GED));
    expect(report.persons).toBe(2);
    // Both persons exist...
    const personRows = (db.prepare('SELECT id FROM persons').all([]) as Array<{ id: string }>);
    expect(personRows).toHaveLength(2);
    // ...but only one has a names row attached.
    const nameRows = (db.prepare('SELECT person_id FROM person_names').all([]) as Array<{ person_id: string }>);
    expect(nameRows).toHaveLength(1);
    // And the import report disclosed the nameless person.
    const namelessWarn = report.warnings.find(w => /NAME tag/.test(w) && /nameless/.test(w));
    expect(namelessWarn).toBeTruthy();
    expect(namelessWarn).toMatch(/1 INDI record\(s\)/);
  });
});

describe('db_settings API', () => {
  it('returns null for missing key', () => {
    const db = createTestDb();
    expect(getDbSetting(db, 'nonexistent')).toBeNull();
  });
  it('stores and retrieves a value', () => {
    const db = createTestDb();
    setDbSetting(db, 'foo', 'bar');
    expect(getDbSetting(db, 'foo')).toBe('bar');
  });
  it('overwrites an existing value', () => {
    const db = createTestDb();
    setDbSetting(db, 'foo', 'first');
    setDbSetting(db, 'foo', 'second');
    expect(getDbSetting(db, 'foo')).toBe('second');
  });
  it('deletes a value', () => {
    const db = createTestDb();
    setDbSetting(db, 'foo', 'bar');
    deleteDbSetting(db, 'foo');
    expect(getDbSetting(db, 'foo')).toBeNull();
  });
});

const REPO_GED = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @R1@ REPO
1 NAME Riksarkivet
1 ADDR Box 12541
2 CITY Stockholm
2 POST 10229
2 CTRY Sweden
1 EMAIL riksarkivet@riksarkivet.se
0 @S1@ SOUR
1 TITL Mantalslangder
1 REPO @R1@
0 TRLR
`.trim();

describe('GEDCOM import - REPO records', () => {
  it('imports REPO records as repositories', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(REPO_GED));
    expect(report.repositories).toBe(1);
  });

  it('links source to imported repository', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(REPO_GED));
    const stmt = db.prepare('SELECT r.name FROM repositories r JOIN source_repositories sr ON sr.repository_id = r.id JOIN sources s ON s.id = sr.source_id WHERE s.title = ?');
    const row = stmt.get(['Mantalslangder']) as { name: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(row?.name).toBe('Riksarkivet');
  });

  it('does not report REPO records in unmappedData', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(REPO_GED));
    expect(report.unmappedData.find(u => u.category.includes('REPO'))).toBeUndefined();
  });
});

const GRP_GED = `
0 HEAD
1 SOUR Genney
0 @G1@ _GRP
1 NAME Bouppteckning - klar
1 NOTE Sokt och funnit bouppteckning
0 @G2@ _GRP
1 NAME Emigration
0 @I1@ INDI
1 NAME Lars /Eriksson/
1 _GRP @G1@
1 _GRP @G2@
0 @I2@ INDI
1 NAME Karin /Svensson/
1 _GRP @G1@
0 TRLR
`.trim();

describe('GEDCOM import - _GRP records (Genney)', () => {
  it('imports _GRP records as groups', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(GRP_GED), { profile: 'genney' });
    expect(report.groups).toBe(2);
  });

  it('creates group memberships from 1 _GRP links on INDI', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(GRP_GED), { profile: 'genney' });
    const stmt = db.prepare(`SELECT COUNT(*) as n FROM group_links WHERE entity_type = 'person'`);
    const { n } = stmt.get([]) as { n: number };
    (stmt as unknown as { finalize(): void }).finalize();
    expect(n).toBe(3); // Lars in 2 groups, Karin in 1
  });

  it('does not import _GRP records without genney profile', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(GRP_GED));
    expect(report.groups).toBe(0);
  });
});

const TODO_GED = `
0 HEAD
1 SOUR Genney
0 @I1@ INDI
1 NAME Lars /Eriksson/
0 @I2@ INDI
1 NAME Karin /Svensson/
0 @Z1@ _TODO
1 _TARG @I1@
1 _PRIO 1
1 _STAT 0
1 _TASK Mantalslangder
1 NOTE Spara via mantalslangder
0 @Z2@ _TODO
1 _TARG @I2@
1 _PRIO 2
1 _STAT 1
1 _TASK Spara bakat
0 @Z3@ _TODO
1 _PRIO 0
1 _STAT 0
1 _TASK Generell uppgift utan person
0 TRLR
`.trim();

describe('GEDCOM import - _TODO records (Genney)', () => {
  it('imports _TODO records as research tasks', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(TODO_GED), { profile: 'genney' });
    expect(report.researchTasks).toBe(3);
  });

  it('maps _STAT 0 to open and _STAT 1 to done', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(TODO_GED), { profile: 'genney' });
    const stmt = db.prepare('SELECT status FROM research_tasks WHERE task = ?');
    const openRow = stmt.get(['Mantalslangder']) as { status: string } | undefined;
    const doneRow = stmt.get(['Spara bakat']) as { status: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(openRow?.status).toBe('open');
    expect(doneRow?.status).toBe('done');
  });

  it('links tasks to persons via _TARG', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(TODO_GED), { profile: 'genney' });
    const stmt = db.prepare(`SELECT COUNT(*) as n FROM task_links WHERE entity_type = 'person'`);
    const { n } = stmt.get([]) as { n: number };
    (stmt as unknown as { finalize(): void }).finalize();
    expect(n).toBe(2);
  });

  it('does not import _TODO records without genney profile', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(TODO_GED));
    expect(report.researchTasks).toBe(0);
  });
});

const SUBM_GED = `
0 HEAD
1 SOUR Genney
0 @1@ SUBM
1 NAME Lars Eriksson
0 @I1@ INDI
1 NAME Lars /Eriksson/
1 SEX M
0 @I2@ INDI
1 NAME Karin /Svensson/
1 SEX F
0 TRLR
`.trim();

const SUBM_AMBIGUOUS_GED = `
0 HEAD
0 @1@ SUBM
1 NAME Lars Eriksson
0 @I1@ INDI
1 NAME Lars /Eriksson/
0 @I2@ INDI
1 NAME Lars /Eriksson/
0 TRLR
`.trim();

describe('GEDCOM import - SUBM to default_person_id', () => {
  it('stores default_person_id when submitter name matches exactly one person', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(SUBM_GED));
    const defaultId = getDbSetting(db, 'default_person_id');
    expect(defaultId).not.toBeNull();
    const stmt = db.prepare('SELECT given_name FROM person_names WHERE person_id = ?');
    const row = stmt.get([defaultId!]) as { given_name: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(row?.given_name).toContain('Lars');
  });

  it('does not store default_person_id when name matches multiple persons', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(SUBM_AMBIGUOUS_GED));
    expect(getDbSetting(db, 'default_person_id')).toBeNull();
  });

  it('does not report SUBM in unmappedData', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(SUBM_GED));
    expect(report.unmappedData.find(u => u.category.includes('SUBM'))).toBeUndefined();
  });

  it('matches given-name-only SUBM name to a single person', () => {
    const SUBM_GIVEN_ONLY = `
0 HEAD
0 @1@ SUBM
1 NAME Lars
0 @I1@ INDI
1 NAME Lars /Eriksson/
1 SEX M
0 @I2@ INDI
1 NAME Karin /Svensson/
1 SEX F
0 TRLR
`.trim();
    const db = createTestDb();
    importGedcom(db, parseGedcom(SUBM_GIVEN_ONLY));
    const defaultId = getDbSetting(db, 'default_person_id');
    expect(defaultId).not.toBeNull();
    const stmt = db.prepare('SELECT given_name FROM person_names WHERE person_id = ?');
    const row = stmt.get([defaultId!]) as { given_name: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(row?.given_name).toContain('Lars');
  });

  it('does not match given-name-only SUBM when multiple persons share the name', () => {
    const SUBM_GIVEN_AMBIG = `
0 HEAD
0 @1@ SUBM
1 NAME Lars
0 @I1@ INDI
1 NAME Lars /Eriksson/
0 @I2@ INDI
1 NAME Lars /Svensson/
0 TRLR
`.trim();
    const db = createTestDb();
    importGedcom(db, parseGedcom(SUBM_GIVEN_AMBIG));
    expect(getDbSetting(db, 'default_person_id')).toBeNull();
  });
});

const SUBM_FULL_CONTACT_GED = `
0 HEAD
1 GEDC
2 VERS 5.5.1
1 SUBM @S1@
0 @S1@ SUBM
1 NAME Bengt Sareld
1 ADDR Inneby kobbväg 10
2 CONT 18495 Ljusterö
2 CONT Sverige
1 PHON 0733-415330
1 EMAIL bengt@sareld.se
0 @I1@ INDI
1 NAME Bengt /Sareld/
1 SEX M
0 @I2@ INDI
1 NAME Anna /Sareld/
1 SEX F
0 TRLR
`.trim();

describe('GEDCOM import - SUBM contact info → researcher_* settings', () => {
  it('populates researcher_name/address/phone/email from SUBM record', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(SUBM_FULL_CONTACT_GED));
    expect(getDbSetting(db, 'researcher_name')).toBe('Bengt Sareld');
    expect(getDbSetting(db, 'researcher_address')).toBe('Inneby kobbväg 10\n18495 Ljusterö\nSverige');
    expect(getDbSetting(db, 'researcher_phone')).toBe('0733-415330');
    expect(getDbSetting(db, 'researcher_email')).toBe('bengt@sareld.se');
  });

  it('does not overwrite researcher_* settings the user has already typed', () => {
    const db = createTestDb();
    setDbSetting(db, 'researcher_name', 'Pre-existing Name');
    setDbSetting(db, 'researcher_email', 'mine@example.com');
    importGedcom(db, parseGedcom(SUBM_FULL_CONTACT_GED));
    expect(getDbSetting(db, 'researcher_name')).toBe('Pre-existing Name');
    expect(getDbSetting(db, 'researcher_email')).toBe('mine@example.com');
    // Settings that were empty are still populated from SUBM.
    expect(getDbSetting(db, 'researcher_address')).toBe('Inneby kobbväg 10\n18495 Ljusterö\nSverige');
    expect(getDbSetting(db, 'researcher_phone')).toBe('0733-415330');
  });

  it('still matches SUBM NAME against persons (tree subject) alongside contact import', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(SUBM_FULL_CONTACT_GED));
    const defaultId = getDbSetting(db, 'default_person_id');
    expect(defaultId).not.toBeNull();
    const stmt = db.prepare('SELECT given_name FROM person_names WHERE person_id = ?');
    const row = stmt.get([defaultId!]) as { given_name: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(row?.given_name).toContain('Bengt');
  });

  it('round-trips researcher_* settings through export → re-import', () => {
    // Seed source DB with researcher info, export, parse + re-import into fresh DB.
    const src = createTestDb();
    setDbSetting(src, 'researcher_name', 'Jonas Ahnstedt');
    setDbSetting(src, 'researcher_address', 'Storgatan 1\n123 45 Lund');
    setDbSetting(src, 'researcher_phone', '+46 70 123 45 67');
    setDbSetting(src, 'researcher_email', 'jonas@example.se');
    const { ged } = exportGedcom(src);

    const dst = createTestDb();
    importGedcom(dst, parseGedcom(ged));

    expect(getDbSetting(dst, 'researcher_name')).toBe('Jonas Ahnstedt');
    expect(getDbSetting(dst, 'researcher_address')).toBe('Storgatan 1\n123 45 Lund');
    expect(getDbSetting(dst, 'researcher_phone')).toBe('+46 70 123 45 67');
    expect(getDbSetting(dst, 'researcher_email')).toBe('jonas@example.se');
  });
});

const FALLBACK_DEFAULT_PERSON_GED = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Astrid /Lindgren/
1 SEX F
0 @I2@ INDI
1 NAME Karin /Nyman/
1 SEX F
0 TRLR
`.trim();

describe('GEDCOM import - default_person_id fallback to firstPersonId', () => {
  it('persists default_person_id from firstPersonId when SUBM is missing (Holger profile)', () => {
    // Holger profile tracks firstPersonId as a fallback; verify it now flows
    // into db_settings.default_person_id (was previously only returned in
    // the report, so the chart was empty after the user navigated away).
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(FALLBACK_DEFAULT_PERSON_GED), { profile: 'holger' });
    expect(report.defaultPersonId).toBeTruthy();
    expect(getDbSetting(db, 'default_person_id')).toBe(report.defaultPersonId);
  });

  it('does not overwrite an existing default_person_id when re-importing', () => {
    const db = createTestDb();
    // Pre-populate the setting (simulating a user importing into a populated DB).
    setDbSetting(db, 'default_person_id', 'pre-existing-id');
    importGedcom(db, parseGedcom(FALLBACK_DEFAULT_PERSON_GED), { profile: 'holger' });
    expect(getDbSetting(db, 'default_person_id')).toBe('pre-existing-id');
  });
});

const EVEN_TYPE_GED = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Eva /Lindqvist/
1 EVEN
2 TYPE Efternamnsbyte
2 DATE 1986
0 TRLR
`.trim();

describe('GEDCOM import - EVEN TYPE preservation', () => {
  it('stores EVEN TYPE value in event notes (with marker for round-trip)', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(EVEN_TYPE_GED));
    const stmt = db.prepare("SELECT notes FROM events WHERE event_type = 'other'");
    const row = stmt.get([]) as { notes: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    // GEDCOM TYPE sub-tag is preserved as a `TYPE: <value>` marker so the
    // exporter can re-emit it as `2 TYPE Efternamnsbyte` on round-trip.
    expect(row?.notes).toBe('TYPE: Efternamnsbyte');
  });

  it('maps EVEN to event_type other', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(EVEN_TYPE_GED));
    const stmt = db.prepare("SELECT COUNT(*) as n FROM events WHERE event_type = 'other'");
    const { n } = stmt.get([]) as { n: number };
    (stmt as unknown as { finalize(): void }).finalize();
    expect(n).toBe(1);
  });
});

// ── GEDCOM 5.5.1 import — full ImportReport field coverage ───────────────────

const FULL_GED = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Lars /Eriksson/
1 SEX M
1 BIRT
2 DATE 12 JUN 1850
2 PLAC Stockholm, Sverige
1 DEAT
2 DATE 5 MAR 1921
0 @I2@ INDI
1 NAME Anna /Magnusson/
1 SEX F
0 @I3@ INDI
1 NAME Petter /Eriksson/
1 SEX M
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 14 AUG 1875
2 PLAC Uppsala, Sverige
1 CHIL @I3@
0 @S1@ SOUR
1 TITL Husförhörslängd 1850-1860
1 AUTH Riksarkivet
0 @S2@ SOUR
1 TITL Dödboken 1921
0 TRLR
`.trim();

describe('GEDCOM 5.5.1 import — full ImportReport field coverage', () => {
  it('reports correct counts for all ImportReport fields', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(FULL_GED));
    expect(report.persons).toBe(3);
    expect(report.families).toBe(1);
    expect(report.sources).toBe(2);
    expect(report.places).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(report.warnings)).toBe(true);
    expect(Array.isArray(report.skipped)).toBe(true);
    expect(Array.isArray(report.unmappedData)).toBe(true);
    // No unexpected data loss for a clean standard GEDCOM
    expect(report.unmappedData).toHaveLength(0);
  });

  it('report.events contains birth, death, marriage counts', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(FULL_GED));
    expect(typeof report.events).toBe('object');
    expect(report.events['birth']).toBeGreaterThanOrEqual(1);
    expect(report.events['death']).toBeGreaterThanOrEqual(1);
    expect(report.events['marriage']).toBeGreaterThanOrEqual(1);
  });

  it('report.version reflects the GEDCOM version header', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(FULL_GED));
    // GedcomVersion is a string type: '5.5.1' | '5.5.5' | '7.0' | 'unknown'
    expect(report.version).toBe('5.5.1');
  });
});
