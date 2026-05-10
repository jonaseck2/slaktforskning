import { describe, it, expect } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createGroup, addGroupLink } from '../../src/api/groups';
import { createResearchTask, addTaskLink } from '../../src/api/research_tasks';
import { createRelationship } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { exportGedcom } from '../../src/gedcom/exporter';
import { setDbSetting } from '../../src/api/db_settings';
import { createTestDb } from './helpers';

describe('GEDCOM export — ExportReport', async () => {
  it('reports excluded Research Tasks', async () => {
    const db = await createTestDb();
    const p = await createPerson(db, { given_name: 'Lars' });
    const rt = await createResearchTask(db, { task: 'Find birth record' });
    await addTaskLink(db, rt.id, 'person', p.id);
    const { report } = await exportGedcom(db);
    const entry = report.excluded.find(e => e.category.includes('Research'));
    expect(entry).toBeTruthy();
    expect(entry!.count).toBe(1);
  });

  it('does not report Groups as excluded (now lossless via _GROUP / _GROUP_LINK)', async () => {
    const db = await createTestDb();
    const p = await createPerson(db, { given_name: 'Lars' });
    const g = await createGroup(db, { name: 'Emigrants' });
    await addGroupLink(db, g.id, 'person', p.id);
    const { ged, report } = await exportGedcom(db);
    // No longer reported as excluded — the data is preserved end-to-end.
    expect(report.excluded.find(e => e.category.includes('Group'))).toBeUndefined();
    // And the GEDCOM file actually carries the records.
    expect(ged).toContain('0 @G1@ _GROUP');
    expect(ged).toContain('1 _GROUP_LINK');
  });

  it('returns empty excluded list when no excluded entities exist', async () => {
    const db = await createTestDb();
    const { report } = await exportGedcom(db);
    expect(report.excluded).toEqual([]);
  });

  it('counts persons, families, events, and sources in the report', async () => {
    const db = await createTestDb();
    const p = await createPerson(db, { given_name: 'Anna' });
    expect(p).toBeTruthy();
    const { report } = await exportGedcom(db);
    expect(report.persons).toBe(1);
    expect(typeof report.families).toBe('number');
    expect(typeof report.events).toBe('number');
    expect(typeof report.sources).toBe('number');
  });
});

describe('GEDCOM export — place_address (now lossless via _PLAC_ADDR)', async () => {
  it('emits _PLAC_ADDR sub-tag when an event has a place_address', async () => {
    const db = await createTestDb();
    const p = await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const rel = await createRelationship(db, { type: 'couple', person1_id: p.id });
    const evt = await createEvent(db, {
      event_type: 'marriage',
      relationship_id: rel.id,
    });
    // place_address is not in createEvent API — set it directly via SQL
    db.run('UPDATE events SET place_address = ? WHERE id = ?', ['Tvärgatan 5, 35243 Växjö, Sverige', evt.id]);
    const { ged, report } = await exportGedcom(db);
    expect(ged).toContain('_PLAC_ADDR Tvärgatan 5, 35243 Växjö, Sverige');
    // No longer reported as excluded — the field is now lossless.
    const entry = report.excluded.find(e =>
      e.category.includes('place_address') ||
      e.category.includes('free-text')
    );
    expect(entry).toBeUndefined();
  });

  it('does not emit _PLAC_ADDR when event has no place_address', async () => {
    const db = await createTestDb();
    await createPerson(db, { sex: 'M' }, { allowNameless: true });
    const { ged } = await exportGedcom(db);
    expect(ged).not.toContain('_PLAC_ADDR');
  });
});

describe('GEDCOM export — SUBM record', async () => {
  it('writes SUBM record when default_person_id is set', async () => {
    const db = await createTestDb();
    const p = await createPerson(db, { given_name: 'Lars', surname: 'Eriksson' });
    await setDbSetting(db, 'default_person_id', p.id);
    const { ged } = await exportGedcom(db);
    expect(ged).toContain('1 SUBM @SUBM@');
    expect(ged).toContain('0 @SUBM@ SUBM');
    expect(ged).toContain('1 NAME Lars Eriksson');
  });

  it('omits SUBM when no default_person_id is set', async () => {
    const db = await createTestDb();
    await createPerson(db, { given_name: 'Lars' });
    const { ged } = await exportGedcom(db);
    expect(ged).not.toContain('SUBM');
  });

  it('writes SUBM in GEDCOM 7.0 format too', async () => {
    const db = await createTestDb();
    const p = await createPerson(db, { given_name: 'Anna', surname: 'Svensson' });
    await setDbSetting(db, 'default_person_id', p.id);
    const { ged } = await exportGedcom(db, '7.0');
    expect(ged).toContain('1 SUBM @SUBM@');
    expect(ged).toContain('0 @SUBM@ SUBM');
    expect(ged).toContain('1 NAME Anna Svensson');
  });
});
