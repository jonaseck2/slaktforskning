import { describe, it, expect } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createGroup, addGroupLink } from '../../src/api/groups';
import { createResearchTask, addTaskLink } from '../../src/api/research_tasks';
import { createRelationship } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { exportGedcom } from '../../src/gedcom/exporter';
import { setDbSetting } from '../../src/api/db_settings';
import { createTestDb } from './helpers';

describe('GEDCOM export — ExportReport', () => {
  it('reports excluded Research Tasks', () => {
    const db = createTestDb();
    const p = createPerson(db, { given_name: 'Lars' });
    const rt = createResearchTask(db, { task: 'Find birth record' });
    addTaskLink(db, rt.id, 'person', p.id);
    const { report } = exportGedcom(db);
    const entry = report.excluded.find(e => e.category.includes('Research'));
    expect(entry).toBeTruthy();
    expect(entry!.count).toBe(1);
  });

  it('reports excluded Groups', () => {
    const db = createTestDb();
    const p = createPerson(db, { given_name: 'Lars' });
    const g = createGroup(db, { name: 'Emigrants' });
    addGroupLink(db, g.id, 'person', p.id);
    const { report } = exportGedcom(db);
    const entry = report.excluded.find(e => e.category.includes('Group'));
    expect(entry).toBeTruthy();
    expect(entry!.count).toBe(1);
  });

  it('returns empty excluded list when no excluded entities exist', () => {
    const db = createTestDb();
    const { report } = exportGedcom(db);
    expect(report.excluded).toEqual([]);
  });

  it('counts persons, families, events, and sources in the report', () => {
    const db = createTestDb();
    const p = createPerson(db, { given_name: 'Anna' });
    expect(p).toBeTruthy();
    const { report } = exportGedcom(db);
    expect(report.persons).toBe(1);
    expect(typeof report.families).toBe('number');
    expect(typeof report.events).toBe('number');
    expect(typeof report.sources).toBe('number');
  });
});

describe('GEDCOM export — place_address (now lossless via _PLAC_ADDR)', () => {
  it('emits _PLAC_ADDR sub-tag when an event has a place_address', () => {
    const db = createTestDb();
    const p = createPerson(db, { sex: 'M' }, { allowNameless: true });
    const rel = createRelationship(db, { type: 'couple', person1_id: p.id });
    const evt = createEvent(db, {
      event_type: 'marriage',
      relationship_id: rel.id,
    });
    // place_address is not in createEvent API — set it directly via SQL
    db.run('UPDATE events SET place_address = ? WHERE id = ?', ['Tvärgatan 5, 35243 Växjö, Sverige', evt.id]);
    const { ged, report } = exportGedcom(db);
    expect(ged).toContain('_PLAC_ADDR Tvärgatan 5, 35243 Växjö, Sverige');
    // No longer reported as excluded — the field is now lossless.
    const entry = report.excluded.find(e =>
      e.category.includes('place_address') ||
      e.category.includes('free-text')
    );
    expect(entry).toBeUndefined();
  });

  it('does not emit _PLAC_ADDR when event has no place_address', () => {
    const db = createTestDb();
    createPerson(db, { sex: 'M' }, { allowNameless: true });
    const { ged } = exportGedcom(db);
    expect(ged).not.toContain('_PLAC_ADDR');
  });
});

describe('GEDCOM export — SUBM record', () => {
  it('writes SUBM record when default_person_id is set', () => {
    const db = createTestDb();
    const p = createPerson(db, { given_name: 'Lars', surname: 'Eriksson' });
    setDbSetting(db, 'default_person_id', p.id);
    const { ged } = exportGedcom(db);
    expect(ged).toContain('1 SUBM @SUBM@');
    expect(ged).toContain('0 @SUBM@ SUBM');
    expect(ged).toContain('1 NAME Lars Eriksson');
  });

  it('omits SUBM when no default_person_id is set', () => {
    const db = createTestDb();
    createPerson(db, { given_name: 'Lars' });
    const { ged } = exportGedcom(db);
    expect(ged).not.toContain('SUBM');
  });

  it('writes SUBM in GEDCOM 7.0 format too', () => {
    const db = createTestDb();
    const p = createPerson(db, { given_name: 'Anna', surname: 'Svensson' });
    setDbSetting(db, 'default_person_id', p.id);
    const { ged } = exportGedcom(db, '7.0');
    expect(ged).toContain('1 SUBM @SUBM@');
    expect(ged).toContain('0 @SUBM@ SUBM');
    expect(ged).toContain('1 NAME Anna Svensson');
  });
});
