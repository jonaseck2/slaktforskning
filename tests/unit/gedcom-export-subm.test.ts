import { describe, it, expect } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { exportGedcom } from '../../src/gedcom/exporter';
import { setDbSetting } from '../../src/api/db_settings';
import { createTestDb } from './helpers';

describe('GEDCOM export — SUBM record', () => {
  it('writes researcher name/address/phone/email when researcher_* settings are set', () => {
    const db = createTestDb();
    createPerson(db, { given_name: 'Anna', surname: 'Test' });
    setDbSetting(db, 'researcher_name', 'Jonas Ahnstedt');
    setDbSetting(db, 'researcher_address', 'Storgatan 1\n123 45 Lund');
    setDbSetting(db, 'researcher_phone', '+46 70 123 45 67');
    setDbSetting(db, 'researcher_email', 'jonas@example.se');

    const { ged } = exportGedcom(db);

    expect(ged).toContain('1 SUBM @SUBM@');
    expect(ged).toContain('0 @SUBM@ SUBM');
    expect(ged).toContain('1 NAME Jonas Ahnstedt');
    expect(ged).toContain('1 ADDR Storgatan 1');
    expect(ged).toContain('2 CONT 123 45 Lund');
    expect(ged).toContain('1 PHON +46 70 123 45 67');
    expect(ged).toContain('1 EMAIL jonas@example.se');
  });

  it('falls back to default_person_id name when researcher_name is unset', () => {
    const db = createTestDb();
    const proband = createPerson(db, { given_name: 'Linda', surname: 'Ahnstedt' });
    setDbSetting(db, 'default_person_id', proband.id);

    const { ged } = exportGedcom(db);

    expect(ged).toContain('1 SUBM @SUBM@');
    expect(ged).toContain('1 NAME Linda Ahnstedt');
  });

  it('omits SUBM block entirely when neither researcher info nor proband is set', () => {
    const db = createTestDb();
    createPerson(db, { given_name: 'Sven' });

    const { ged } = exportGedcom(db);

    expect(ged).not.toContain('1 SUBM @SUBM@');
    expect(ged).not.toContain('0 @SUBM@ SUBM');
  });

  it('does not emit SUBM contact tags when researcher_name is empty', () => {
    const db = createTestDb();
    createPerson(db, { given_name: 'Sven' });
    setDbSetting(db, 'researcher_name', '   ');
    setDbSetting(db, 'researcher_email', 'orphan@example.com');

    const { ged } = exportGedcom(db);

    // Empty name → fall through to proband path; no proband either → no SUBM at all
    expect(ged).not.toContain('orphan@example.com');
  });

  it('does not emit blank ADDR/PHON/EMAIL when individual fields are empty', () => {
    const db = createTestDb();
    setDbSetting(db, 'researcher_name', 'Jonas');
    setDbSetting(db, 'researcher_address', '');
    setDbSetting(db, 'researcher_phone', '   ');

    const { ged } = exportGedcom(db);

    expect(ged).toContain('1 NAME Jonas');
    expect(ged).not.toMatch(/^1 ADDR\s*$/m);
    expect(ged).not.toMatch(/^1 PHON\s*$/m);
  });
});
