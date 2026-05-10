import { describe, it, expect } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { exportGedcom } from '../../src/gedcom/exporter';
import { setDbSetting } from '../../src/api/db_settings';
import { createTestDb } from './helpers';

describe('GEDCOM export — SUBM record', async () => {
  it('writes researcher name/address/phone/email when researcher_* settings are set', async () => {
    const db = await createTestDb();
    await createPerson(db, { given_name: 'Anna', surname: 'Test' });
    await setDbSetting(db, 'researcher_name', 'Jonas Ahnstedt');
    await setDbSetting(db, 'researcher_address', 'Storgatan 1\n123 45 Lund');
    await setDbSetting(db, 'researcher_phone', '+46 70 123 45 67');
    await setDbSetting(db, 'researcher_email', 'jonas@example.se');

    const { ged } = await exportGedcom(db);

    expect(ged).toContain('1 SUBM @SUBM@');
    expect(ged).toContain('0 @SUBM@ SUBM');
    expect(ged).toContain('1 NAME Jonas Ahnstedt');
    expect(ged).toContain('1 ADDR Storgatan 1');
    expect(ged).toContain('2 CONT 123 45 Lund');
    expect(ged).toContain('1 PHON +46 70 123 45 67');
    expect(ged).toContain('1 EMAIL jonas@example.se');
  });

  it('falls back to default_person_id name when researcher_name is unset', async () => {
    const db = await createTestDb();
    const proband = await createPerson(db, { given_name: 'Linda', surname: 'Ahnstedt' });
    await setDbSetting(db, 'default_person_id', proband.id);

    const { ged } = await exportGedcom(db);

    expect(ged).toContain('1 SUBM @SUBM@');
    expect(ged).toContain('1 NAME Linda Ahnstedt');
  });

  it('omits SUBM block entirely when neither researcher info nor proband is set', async () => {
    const db = await createTestDb();
    await createPerson(db, { given_name: 'Sven' });

    const { ged } = await exportGedcom(db);

    expect(ged).not.toContain('1 SUBM @SUBM@');
    expect(ged).not.toContain('0 @SUBM@ SUBM');
  });

  it('does not emit SUBM contact tags when researcher_name is empty', async () => {
    const db = await createTestDb();
    await createPerson(db, { given_name: 'Sven' });
    await setDbSetting(db, 'researcher_name', '   ');
    await setDbSetting(db, 'researcher_email', 'orphan@example.com');

    const { ged } = await exportGedcom(db);

    // Empty name → fall through to proband path; no proband either → no SUBM at all
    expect(ged).not.toContain('orphan@example.com');
  });

  it('does not emit blank ADDR/PHON/EMAIL when individual fields are empty', async () => {
    const db = await createTestDb();
    await setDbSetting(db, 'researcher_name', 'Jonas');
    await setDbSetting(db, 'researcher_address', '');
    await setDbSetting(db, 'researcher_phone', '   ');

    const { ged } = await exportGedcom(db);

    expect(ged).toContain('1 NAME Jonas');
    expect(ged).not.toMatch(/^1 ADDR\s*$/m);
    expect(ged).not.toMatch(/^1 PHON\s*$/m);
  });
});
