// T06: GEDCOM `NO X` round-trip — negative event assertions.
//
// User goal: an authored "this event did NOT happen" row survives a 7.0
// round-trip cleanly; on 5.5.1 it drops with a disclosure warning so the
// user knows what was lost.

import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { createPerson, listPersons } from '../../src/api/persons';
import { createEvent, getEventsForPerson } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

async function seedAliceWithNoMarriage(): Promise<{ aliceId: string }> {
  const alice = await createPerson(db, { sex: 'F', given_name: 'Alice', surname: 'A' });
  const ev = await createEvent(db, {
    event_type: 'marriage',
    date_type: 'between',
    date_value: '1850',
    date_value_end: '1900',
    notes: 'No record',
    is_negation: true,
    negation_event_type: 'marriage',
  });
  await addEventParticipant(db, { event_id: ev.id, person_id: alice.id, role: 'primary' });
  return { aliceId: alice.id };
}

describe('GEDCOM NO X round-trip (T06)', () => {
  it('7.0 export emits 1 NO MARR + 2 DATE FROM..TO + 2 NOTE', async () => {
    await seedAliceWithNoMarriage();
    const { ged } = await exportGedcom(db, '7.0');
    expect(ged).toContain('1 NO MARR');
    expect(ged).toContain('2 DATE FROM 1850 TO 1900');
    expect(ged).toContain('2 NOTE No record');
  });

  it('7.0 round-trip preserves is_negation + negation_event_type + dates + notes', async () => {
    await seedAliceWithNoMarriage();
    const { ged } = await exportGedcom(db, '7.0');

    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const persons = await listPersons(db2);
    const alice = persons.find(p => /Alice/.test(p.given_name ?? ''));
    expect(alice).toBeDefined();
    const events = await getEventsForPerson(db2, alice!.id);
    const negation = events.find(e => Boolean(e.is_negation));
    expect(negation).toBeDefined();
    expect(negation!.negation_event_type).toBe('marriage');
    expect(negation!.event_type).toBe('marriage');
    expect(negation!.date_value).toBe('1850');
    expect(negation!.date_value_end).toBe('1900');
    expect(negation!.notes).toBe('No record');
  });

  it('5.5.1 export drops negation rows AND pushes a disclosure warning', async () => {
    await seedAliceWithNoMarriage();
    const { ged, report } = await exportGedcom(db, '5.5.1');
    expect(ged).not.toContain(' NO MARR');
    expect(ged).not.toContain('NO MARR\n');
    expect(report.warnings.some(w => /negation/i.test(w) && /5\.5\.1/.test(w))).toBe(true);
  });

  it('5.5.1 re-import has no negation event (warning was the user notification)', async () => {
    await seedAliceWithNoMarriage();
    const { ged } = await exportGedcom(db, '5.5.1');
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const persons = await listPersons(db2);
    const alice = persons.find(p => /Alice/.test(p.given_name ?? ''));
    expect(alice).toBeDefined();
    const events = await getEventsForPerson(db2, alice!.id);
    const negation = events.filter(e => Boolean(e.is_negation));
    expect(negation).toHaveLength(0);
  });
});
