import { describe, it, expect } from 'vitest';
import { createTestDb } from './helpers';
import { createPerson } from '../../src/api/persons';
import { createGroup, addGroupMember } from '../../src/api/groups';
import { createResearchTask } from '../../src/api/research_tasks';
import { exportGedcom } from '../../src/gedcom/exporter';

describe('GEDCOM export — ExportReport', () => {
  it('reports excluded Research Tasks', () => {
    const db = createTestDb();
    const p = createPerson(db, { given_name: 'Lars' });
    createResearchTask(db, { task: 'Find birth record', person_id: p.id });
    const { report } = exportGedcom(db);
    const entry = report.excluded.find(e => e.category.includes('Research'));
    expect(entry).toBeTruthy();
    expect(entry!.count).toBe(1);
  });

  it('reports excluded Groups', () => {
    const db = createTestDb();
    const p = createPerson(db, { given_name: 'Lars' });
    const g = createGroup(db, { name: 'Emigrants' });
    addGroupMember(db, g.id, p.id);
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
