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

describe('GEDCOM import — ASSO reporting', async () => {
  it('reports dropped ASSO associations in unmappedData', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(ASSO_GED));
    const entry = report.unmappedData.find(u => u.category.includes('ASSO'));
    expect(entry).toBeTruthy();
    expect(entry!.count).toBe(1);
  });
});

describe('GEDCOM import — data integrity reporting', async () => {
  it('reports LDS ordinances in unmappedData with descriptive category', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(LDS_GED));
    const entry = report.unmappedData.find(u => u.category.includes('LDS'));
    expect(entry).toBeTruthy();
    expect(entry!.count).toBeGreaterThan(0);
  });

  it('imports NAME/TRAN as a first-class name_translations row (T07)', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(TRAN_GED));
    // T07: TRAN is now lossless on 7.0 — no warning, the row lands in
    // name_translations attached to the primary person_names row.
    const { listPersons, getPersonNames } = await import('../../src/api/persons');
    const { getTranslationsForName } = await import('../../src/api/translations');
    const persons = await listPersons(db);
    expect(persons).toHaveLength(1);
    const names = await getPersonNames(db, persons[0].id);
    expect(names).toHaveLength(1);
    const trans = await getTranslationsForName(db, names[0].id);
    expect(trans).toHaveLength(1);
    expect(trans[0].language).toBe('sv');
  });

  it('reports NO negative assertions in unmappedData', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(NO_GED));
    const entry = report.unmappedData.find(u => u.category.includes('NO') || u.category.includes('negat'));
    expect(entry).toBeTruthy();
    expect(entry!.count).toBeGreaterThan(0);
  });

  // Plan 2026-05-04-new-person-dialog-hardening: nameless INDIs are preserved
  // (the source's reference graph may need them) but the user is disclosed via
  // a warning so the PERSON_NO_NAME quality check finds them.
  it('preserves a NAME-less INDI as a nameless person and warns the user', async () => {
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
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(NAMELESS_GED));
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

describe('db_settings API', async () => {
  it('returns null for missing key', async () => {
    const db = await createTestDb();
    expect(await getDbSetting(db, 'nonexistent')).toBeNull();
  });
  it('stores and retrieves a value', async () => {
    const db = await createTestDb();
    await setDbSetting(db, 'foo', 'bar');
    expect(await getDbSetting(db, 'foo')).toBe('bar');
  });
  it('overwrites an existing value', async () => {
    const db = await createTestDb();
    await setDbSetting(db, 'foo', 'first');
    await setDbSetting(db, 'foo', 'second');
    expect(await getDbSetting(db, 'foo')).toBe('second');
  });
  it('deletes a value', async () => {
    const db = await createTestDb();
    await setDbSetting(db, 'foo', 'bar');
    await deleteDbSetting(db, 'foo');
    expect(await getDbSetting(db, 'foo')).toBeNull();
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

describe('GEDCOM import - REPO records', async () => {
  it('imports REPO records as repositories', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(REPO_GED));
    expect(report.repositories).toBe(1);
  });

  it('links source to imported repository', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(REPO_GED));
    const stmt = db.prepare('SELECT r.name FROM repositories r JOIN source_repositories sr ON sr.repository_id = r.id JOIN sources s ON s.id = sr.source_id WHERE s.title = ?');
    const row = stmt.get(['Mantalslangder']) as { name: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(row?.name).toBe('Riksarkivet');
  });

  it('does not report REPO records in unmappedData', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(REPO_GED));
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

describe('GEDCOM import - _GRP records (Genney)', async () => {
  it('imports _GRP records as groups', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(GRP_GED), { profile: 'genney' });
    expect(report.groups).toBe(2);
  });

  it('creates group memberships from 1 _GRP links on INDI', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(GRP_GED), { profile: 'genney' });
    const stmt = db.prepare(`SELECT COUNT(*) as n FROM group_links WHERE entity_type = 'person'`);
    const { n } = stmt.get([]) as { n: number };
    (stmt as unknown as { finalize(): void }).finalize();
    expect(n).toBe(3); // Lars in 2 groups, Karin in 1
  });

  it('does not import _GRP records without genney profile', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(GRP_GED));
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

describe('GEDCOM import - _TODO records (Genney)', async () => {
  it('imports _TODO records as research tasks', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(TODO_GED), { profile: 'genney' });
    expect(report.researchTasks).toBe(3);
  });

  it('maps _STAT 0 to open and _STAT 1 to done', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(TODO_GED), { profile: 'genney' });
    const stmt = db.prepare('SELECT status FROM research_tasks WHERE task = ?');
    const openRow = stmt.get(['Mantalslangder']) as { status: string } | undefined;
    const doneRow = stmt.get(['Spara bakat']) as { status: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(openRow?.status).toBe('open');
    expect(doneRow?.status).toBe('done');
  });

  it('links tasks to persons via _TARG', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(TODO_GED), { profile: 'genney' });
    const stmt = db.prepare(`SELECT COUNT(*) as n FROM task_links WHERE entity_type = 'person'`);
    const { n } = stmt.get([]) as { n: number };
    (stmt as unknown as { finalize(): void }).finalize();
    expect(n).toBe(2);
  });

  it('does not import _TODO records without genney profile', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(TODO_GED));
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

describe('GEDCOM import - SUBM to default_person_id', async () => {
  it('stores default_person_id when submitter name matches exactly one person', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(SUBM_GED));
    const defaultId = await getDbSetting(db, 'default_person_id');
    expect(defaultId).not.toBeNull();
    const stmt = db.prepare('SELECT given_name FROM person_names WHERE person_id = ?');
    const row = stmt.get([defaultId!]) as { given_name: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(row?.given_name).toContain('Lars');
  });

  it('does not store default_person_id when name matches multiple persons', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(SUBM_AMBIGUOUS_GED));
    expect(await getDbSetting(db, 'default_person_id')).toBeNull();
  });

  it('does not report SUBM in unmappedData', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(SUBM_GED));
    expect(report.unmappedData.find(u => u.category.includes('SUBM'))).toBeUndefined();
  });

  it('matches given-name-only SUBM name to a single person', async () => {
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
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(SUBM_GIVEN_ONLY));
    const defaultId = await getDbSetting(db, 'default_person_id');
    expect(defaultId).not.toBeNull();
    const stmt = db.prepare('SELECT given_name FROM person_names WHERE person_id = ?');
    const row = stmt.get([defaultId!]) as { given_name: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(row?.given_name).toContain('Lars');
  });

  it('does not match given-name-only SUBM when multiple persons share the name', async () => {
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
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(SUBM_GIVEN_AMBIG));
    expect(await getDbSetting(db, 'default_person_id')).toBeNull();
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

describe('GEDCOM import - SUBM contact info → researcher_* settings', async () => {
  it('populates researcher_name/address/phone/email from SUBM record', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(SUBM_FULL_CONTACT_GED));
    expect(await getDbSetting(db, 'researcher_name')).toBe('Bengt Sareld');
    expect(await getDbSetting(db, 'researcher_address')).toBe('Inneby kobbväg 10\n18495 Ljusterö\nSverige');
    expect(await getDbSetting(db, 'researcher_phone')).toBe('0733-415330');
    expect(await getDbSetting(db, 'researcher_email')).toBe('bengt@sareld.se');
  });

  it('does not overwrite researcher_* settings the user has already typed', async () => {
    const db = await createTestDb();
    await setDbSetting(db, 'researcher_name', 'Pre-existing Name');
    await setDbSetting(db, 'researcher_email', 'mine@example.com');
    await importGedcom(db, parseGedcom(SUBM_FULL_CONTACT_GED));
    expect(await getDbSetting(db, 'researcher_name')).toBe('Pre-existing Name');
    expect(await getDbSetting(db, 'researcher_email')).toBe('mine@example.com');
    // Settings that were empty are still populated from SUBM.
    expect(await getDbSetting(db, 'researcher_address')).toBe('Inneby kobbväg 10\n18495 Ljusterö\nSverige');
    expect(await getDbSetting(db, 'researcher_phone')).toBe('0733-415330');
  });

  it('still matches SUBM NAME against persons (tree subject) alongside contact import', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(SUBM_FULL_CONTACT_GED));
    const defaultId = await getDbSetting(db, 'default_person_id');
    expect(defaultId).not.toBeNull();
    const stmt = db.prepare('SELECT given_name FROM person_names WHERE person_id = ?');
    const row = stmt.get([defaultId!]) as { given_name: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(row?.given_name).toContain('Bengt');
  });

  it('round-trips researcher_* settings through export → re-import', async () => {
    // Seed source DB with researcher info, export, parse + re-import into fresh DB.
    const src = await createTestDb();
    await setDbSetting(src, 'researcher_name', 'Jonas Ahnstedt');
    await setDbSetting(src, 'researcher_address', 'Storgatan 1\n123 45 Lund');
    await setDbSetting(src, 'researcher_phone', '+46 70 123 45 67');
    await setDbSetting(src, 'researcher_email', 'jonas@example.se');
    const { ged } = await exportGedcom(src);

    const dst = await createTestDb();
    await importGedcom(dst, parseGedcom(ged));

    expect(await getDbSetting(dst, 'researcher_name')).toBe('Jonas Ahnstedt');
    expect(await getDbSetting(dst, 'researcher_address')).toBe('Storgatan 1\n123 45 Lund');
    expect(await getDbSetting(dst, 'researcher_phone')).toBe('+46 70 123 45 67');
    expect(await getDbSetting(dst, 'researcher_email')).toBe('jonas@example.se');
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

describe('GEDCOM import - default_person_id fallback to firstPersonId', async () => {
  it('persists default_person_id from firstPersonId when SUBM is missing (Holger profile)', async () => {
    // Holger profile tracks firstPersonId as a fallback; verify it now flows
    // into db_settings.default_person_id (was previously only returned in
    // the report, so the chart was empty after the user navigated away).
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(FALLBACK_DEFAULT_PERSON_GED), { profile: 'holger' });
    expect(report.defaultPersonId).toBeTruthy();
    expect(await getDbSetting(db, 'default_person_id')).toBe(report.defaultPersonId);
  });

  it('does not overwrite an existing default_person_id when re-importing', async () => {
    const db = await createTestDb();
    // Pre-populate the setting (simulating a user importing into a populated DB).
    await setDbSetting(db, 'default_person_id', 'pre-existing-id');
    await importGedcom(db, parseGedcom(FALLBACK_DEFAULT_PERSON_GED), { profile: 'holger' });
    expect(await getDbSetting(db, 'default_person_id')).toBe('pre-existing-id');
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

describe('GEDCOM import - EVEN TYPE preservation', async () => {
  it('stores EVEN TYPE value in event notes (with marker for round-trip)', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(EVEN_TYPE_GED));
    const stmt = db.prepare("SELECT notes FROM events WHERE event_type = 'other'");
    const row = stmt.get([]) as { notes: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    // GEDCOM TYPE sub-tag is preserved as a `TYPE: <value>` marker so the
    // exporter can re-emit it as `2 TYPE Efternamnsbyte` on round-trip.
    expect(row?.notes).toBe('TYPE: Efternamnsbyte');
  });

  it('maps EVEN to event_type other', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(EVEN_TYPE_GED));
    const stmt = db.prepare("SELECT COUNT(*) as n FROM events WHERE event_type = 'other'");
    const { n } = stmt.get([]) as { n: number };
    (stmt as unknown as { finalize(): void }).finalize();
    expect(n).toBe(1);
  });
});

describe('GEDCOM import - extended event types (CREM/BARM/BASM/ANUL/MARL/_SEPR)', async () => {
  // Closes silent-drop gaps surfaced by real-world testing — Heiner's torture
  // test had CREM/BARM/BASM, FTM Habsburg had 18 ANUL + 7 _SEPR + MARL events.
  const EVENT_GED = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Test /Person/
1 CREM
2 DATE 5 JUN 2020
2 PLAC Some Crematorium
1 BARM
2 DATE 15 MAR 1933
0 @I2@ INDI
1 NAME Spouse /Person/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 ANUL
2 DATE 1 JAN 1950
1 MARL
2 DATE 30 DEC 1949
1 _SEPR
2 DATE 12 JUN 1948
0 TRLR
`.trim();

  it('imports CREM, BARM, ANUL, MARL, _SEPR with the correct event_type values', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(EVENT_GED));
    const rows = db.prepare(
      'SELECT event_type FROM events ORDER BY event_type'
    ).all([]) as Array<{ event_type: string }>;
    const types = rows.map(r => r.event_type);
    expect(types).toContain('cremation');
    expect(types).toContain('bar_mitzvah');
    expect(types).toContain('annulment');
    expect(types).toContain('marriage_license');
    expect(types).toContain('separation');
  });

  it('does not list these event tags in the report skipped list', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(EVENT_GED));
    const droppedEventTags = report.skipped.filter(s =>
      ['CREM', 'BARM', 'BASM', 'ANUL', 'MARL', '_SEPR'].includes(s.tag)
    );
    expect(droppedEventTags).toEqual([]);
  });

  it('round-trips the new event types through GEDCOM export', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(EVENT_GED));
    const { exportGedcom } = await import('../../src/gedcom/exporter');
    const { ged } = await exportGedcom(db);
    expect(ged).toMatch(/^1 CREM$/m);
    expect(ged).toMatch(/^1 BARM$/m);
    expect(ged).toMatch(/^1 ANUL$/m);
    expect(ged).toMatch(/^1 MARL$/m);
    expect(ged).toMatch(/^1 _SEPR$/m);
  });
});

describe('GEDCOM import - external identifiers (RIN/_UID/AFN/SSN/FSID)', async () => {
  // Closes silent-drop gaps surfaced by real-world testing against
  // RootsMagic, Family Tree Maker, FamilyOrigins, and PAF exports.
  const IDS_GED = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Test /Person/
1 RIN 12345
1 _UID 8C8B5A7F1234567890ABCDEF12345678
1 AFN ABCD-EFG
1 SSN 123-45-6789
1 FSID L1XK-2YZ
0 TRLR
`.trim();

  it('imports RIN, _UID, AFN, SSN, FSID into person_identifiers with the right types', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(IDS_GED));
    const rows = db.prepare(
      'SELECT identifier_type, identifier_value FROM person_identifiers ORDER BY identifier_type'
    ).all([]) as Array<{ identifier_type: string; identifier_value: string }>;
    const byType = Object.fromEntries(rows.map(r => [r.identifier_type, r.identifier_value]));
    expect(byType.rin).toBe('12345');
    expect(byType.uid).toBe('8C8B5A7F1234567890ABCDEF12345678');
    expect(byType.afn).toBe('ABCD-EFG');
    expect(byType.ssn).toBe('123-45-6789');
    expect(byType.familysearch).toBe('L1XK-2YZ');
  });

  it('does not list these identifier tags in the report skipped list', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(IDS_GED));
    const droppedIdentifierTags = report.skipped.filter(s =>
      ['RIN', '_UID', 'AFN', 'SSN', 'FSID'].includes(s.tag)
    );
    expect(droppedIdentifierTags).toEqual([]);
  });

  it('round-trips _UID, AFN, SSN through GEDCOM export', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(IDS_GED));
    const { exportGedcom } = await import('../../src/gedcom/exporter');
    const { ged } = await exportGedcom(db);
    expect(ged).toMatch(/^1 _UID 8C8B5A7F1234567890ABCDEF12345678$/m);
    expect(ged).toMatch(/^1 AFN ABCD-EFG$/m);
    expect(ged).toMatch(/^1 SSN 123-45-6789$/m);
    expect(ged).toMatch(/^1 RIN 12345$/m);
  });
});

describe('GEDCOM import - SEX value normalization', async () => {
  // Real-world files from FamilySearch GEDCOM 7.0 reference, webtreeprint,
  // and others ship sex values our schema's CHECK (M/F/U) rejects:
  //   - GEDCOM 7.0 introduces X (intersex/non-binary) and N (no entry)
  //   - Some older files emit bare "1 SEX" (empty value)
  //   - Some emit lowercase ("1 SEX m")
  // None of these should crash the importer with a CHECK constraint failure.
  function buildGed(sexLine: string): string {
    return `0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Test /Person/\n${sexLine}\n0 TRLR`;
  }

  it('does not crash on GEDCOM 7.0 SEX X (intersex/non-binary)', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(buildGed('1 SEX X')));
    const row = (db.prepare('SELECT sex FROM persons').get([]) as { sex: string } | undefined);
    expect(row?.sex).toBe('U');
  });

  it('normalizes lowercase sex values to uppercase', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(buildGed('1 SEX m')));
    expect((db.prepare('SELECT sex FROM persons').get([]) as { sex: string }).sex).toBe('M');
  });

  it('treats bare "1 SEX" (empty value) as Unknown', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(buildGed('1 SEX')));
    expect((db.prepare('SELECT sex FROM persons').get([]) as { sex: string }).sex).toBe('U');
  });

  it('discloses unsupported sex values in the report skipped list', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(buildGed('1 SEX X')));
    expect(report.skipped.find(s => s.tag === 'SEX=X')?.count).toBe(1);
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

describe('GEDCOM 5.5.1 import — full ImportReport field coverage', async () => {
  it('reports correct counts for all ImportReport fields', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(FULL_GED));
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

  it('report.events contains birth, death, marriage counts', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(FULL_GED));
    expect(typeof report.events).toBe('object');
    expect(report.events['birth']).toBeGreaterThanOrEqual(1);
    expect(report.events['death']).toBeGreaterThanOrEqual(1);
    expect(report.events['marriage']).toBeGreaterThanOrEqual(1);
  });

  it('report.version reflects the GEDCOM version header', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(FULL_GED));
    // GedcomVersion is a string type: '5.5.1' | '5.5.5' | '7.0' | 'unknown'
    expect(report.version).toBe('5.5.1');
  });
});
