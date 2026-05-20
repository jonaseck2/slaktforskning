// T09: GEDCOM extended date qualifiers — INTERPRETED + FROM/TO.
//
// User goal: two date kinds that were previously lossy now round-trip:
//   • INTERPRETED — "I think this happened in 1850 but the source says
//     'circa mid-century'". Emits GEDCOM `INT 1850 (circa mid-century)`.
//   • FROM/TO — a directional range distinct from BET..AND. Pre-T09,
//     `FROM x TO y` was collapsed onto `date_type='between'` and re-emitted
//     as `BET x AND y`, losing the authored keyword choice.
//
// Plus a regression test: BET/AND still emits as BET/AND (not FROM/TO).

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

async function seedPersonWithEvent(eventData: Parameters<typeof createEvent>[1]): Promise<{ personId: string }> {
  const person = await createPerson(db, { sex: 'F', given_name: 'Alice', surname: 'Test' });
  const ev = await createEvent(db, eventData);
  await addEventParticipant(db, { event_id: ev.id, person_id: person.id, role: 'primary' });
  return { personId: person.id };
}

async function reimportAndGetAliceEvents(ged: string): Promise<Awaited<ReturnType<typeof getEventsForPerson>>> {
  const db2 = await createTestDb();
  await importGedcom(db2, parseGedcom(ged));
  const persons = await listPersons(db2);
  const alice = persons.find(p => /Alice/.test(p.given_name ?? ''));
  expect(alice, 'expected re-imported Alice').toBeDefined();
  return getEventsForPerson(db2, alice!.id);
}

describe('GEDCOM date qualifiers (T09)', () => {
  it('INTERPRETED: emits `INT <date> (<phrase>)` and round-trips', async () => {
    await seedPersonWithEvent({
      event_type: 'birth',
      date_type: 'interpreted',
      date_value: '1850',
      date_original: 'circa mid-century',
    });

    const { ged } = await exportGedcom(db, '7.0');
    expect(ged).toContain('2 DATE INT 1850 (circa mid-century)');

    const events = await reimportAndGetAliceEvents(ged);
    const birth = events.find(e => e.event_type === 'birth');
    expect(birth, 'birth event should re-import').toBeDefined();
    expect(birth!.date_type).toBe('interpreted');
    expect(birth!.date_value).toBe('1850');
    expect(birth!.date_original).toBe('circa mid-century');
  });

  it('FROM/TO: emits `FROM x TO y` (not `BET x AND y`) and round-trips as from_to', async () => {
    await seedPersonWithEvent({
      event_type: 'residence',
      date_type: 'from_to',
      date_value: '1850',
      date_value_end: '1900',
    });

    const { ged } = await exportGedcom(db, '7.0');
    expect(ged).toContain('2 DATE FROM 1850 TO 1900');
    expect(ged).not.toContain('2 DATE BET 1850 AND 1900');

    const events = await reimportAndGetAliceEvents(ged);
    const residence = events.find(e => e.event_type === 'residence');
    expect(residence, 'residence event should re-import').toBeDefined();
    expect(residence!.date_type).toBe('from_to');
    expect(residence!.date_value).toBe('1850');
    expect(residence!.date_value_end).toBe('1900');
  });

  it('BET/AND regression: BET/AND still emits as BET/AND (not FROM/TO)', async () => {
    await seedPersonWithEvent({
      event_type: 'residence',
      date_type: 'between',
      date_value: '1850',
      date_value_end: '1900',
    });

    const { ged } = await exportGedcom(db, '7.0');
    expect(ged).toContain('2 DATE BET 1850 AND 1900');
    expect(ged).not.toContain('2 DATE FROM 1850 TO 1900');

    const events = await reimportAndGetAliceEvents(ged);
    const residence = events.find(e => e.event_type === 'residence');
    expect(residence, 'residence event should re-import').toBeDefined();
    expect(residence!.date_type).toBe('between');
    expect(residence!.date_value).toBe('1850');
    expect(residence!.date_value_end).toBe('1900');
  });
});
