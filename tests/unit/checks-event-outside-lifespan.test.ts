import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks, runChecksForEvent } from '../../src/api/checks';
import { createPerson } from '../../src/api/persons';
import { addEventParticipant } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;

beforeEach(async () => {
  db = await createTestDb();
});

async function personWithBirth(date: string) {
  const p = await createPerson(db, {}, { allowNameless: true });
  const birth = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: date });
  await addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
  return { person: p, birth };
}

async function addDeath(personId: string, date: string) {
  const death = await createEvent(db, { event_type: 'death', date_type: 'exact', date_value: date });
  await addEventParticipant(db, { event_id: death.id, person_id: personId, role: 'primary' });
  return death;
}

async function addEvent(
  personId: string,
  type: string,
  date: string | null,
  role: 'primary' | 'witness' | 'godparent' = 'primary',
  date_type: string = 'exact',
) {
  const ev = await createEvent(db, { event_type: type, date_type, date_value: date });
  await addEventParticipant(db, { event_id: ev.id, person_id: personId, role });
  return ev;
}

describe('EVENT_BEFORE_BIRTH', async () => {
  it('fires when an event date is before the birth date (full ISO precision)', async () => {
    const { person } = await personWithBirth('1944-06-15');
    const ev = await addEvent(person.id, 'name_change', '1943-01-01');
    const results = await runAllChecks(db);
    const hit = results.filter(
      (r) => r.code === 'EVENT_BEFORE_BIRTH' && r.eventIds?.includes(ev.id) && r.personIds.includes(person.id),
    );
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
  });

  it('fires when event year is before birth year (year-only precision)', async () => {
    const { person } = await personWithBirth('1944');
    const ev = await addEvent(person.id, 'description', '1943');
    const results = await runAllChecks(db);
    const hit = results.filter((r) => r.code === 'EVENT_BEFORE_BIRTH' && r.eventIds?.includes(ev.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire when event year matches birth year (precision insufficient)', async () => {
    // "1944" vs "1944-06-15" — at year precision they're equal; we cannot
    // say 1944 is strictly before 1944-06-15. False-positive prevention.
    const { person } = await personWithBirth('1944-06-15');
    await addEvent(person.id, 'description', '1944');
    const results = await runAllChecks(db);
    const hit = results.filter((r) => r.code === 'EVENT_BEFORE_BIRTH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(0);
  });

  it('does not fire when no birth event is recorded', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    await addEvent(p.id, 'mention', '1700');
    const results = await runAllChecks(db);
    const hit = results.filter((r) => r.code === 'EVENT_BEFORE_BIRTH' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(0);
  });

  it('uses the earliest birth event when multiple are recorded', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    // Two birth events (typed twice). Earliest = 1944.
    const b1 = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1944-06-15' });
    await addEventParticipant(db, { event_id: b1.id, person_id: p.id, role: 'primary' });
    const b2 = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1950-01-01' });
    await addEventParticipant(db, { event_id: b2.id, person_id: p.id, role: 'primary' });
    // Event in 1945 is before 1950 but after 1944 — should NOT fire (we use earliest birth).
    await addEvent(p.id, 'description', '1945');
    const results = await runAllChecks(db);
    const hit = results.filter((r) => r.code === 'EVENT_BEFORE_BIRTH' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(0);
  });

  it('flags witness/non-primary participants too', async () => {
    const { person: focal } = await personWithBirth('1900');
    const { person: witness } = await personWithBirth('1950'); // born after the event date
    // An event in 1920 — focal is alive (born 1900), witness was not yet born.
    const ev = await createEvent(db, { event_type: 'mention', date_type: 'exact', date_value: '1920' });
    await addEventParticipant(db, { event_id: ev.id, person_id: focal.id, role: 'primary' });
    await addEventParticipant(db, { event_id: ev.id, person_id: witness.id, role: 'witness' });
    const results = await runAllChecks(db);
    // No fire for focal (1900 < 1920)
    expect(results.filter((r) => r.code === 'EVENT_BEFORE_BIRTH' && r.personIds.includes(focal.id))).toHaveLength(0);
    // Fire for witness (born 1950, event 1920 — recorded as a witness before they existed)
    expect(results.filter((r) => r.code === 'EVENT_BEFORE_BIRTH' && r.personIds.includes(witness.id))).toHaveLength(1);
  });
});

describe('EVENT_OUTSIDE_LIFESPAN_AFTER_DEATH', async () => {
  it('fires when an event date is after the death date', async () => {
    const { person } = await personWithBirth('1900');
    await addDeath(person.id, '1980');
    const ev = await addEvent(person.id, 'description', '1985');
    const results = await runAllChecks(db);
    const hit = results.filter(
      (r) => r.code === 'EVENT_OUTSIDE_LIFESPAN_AFTER_DEATH' && r.eventIds?.includes(ev.id),
    );
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
  });

  it('does not fire when no death event is recorded', async () => {
    const { person } = await personWithBirth('1900');
    await addEvent(person.id, 'description', '2050');
    const results = await runAllChecks(db);
    const hit = results.filter(
      (r) => r.code === 'EVENT_OUTSIDE_LIFESPAN_AFTER_DEATH' && r.personIds.includes(person.id),
    );
    expect(hit).toHaveLength(0);
  });

  it('uses the latest death event when multiple are recorded', async () => {
    const { person } = await personWithBirth('1900');
    await addDeath(person.id, '1970');
    await addDeath(person.id, '1980'); // latest
    await addEvent(person.id, 'description', '1975'); // before 1980 → no fire
    const results = await runAllChecks(db);
    const hit = results.filter(
      (r) => r.code === 'EVENT_OUTSIDE_LIFESPAN_AFTER_DEATH' && r.personIds.includes(person.id),
    );
    expect(hit).toHaveLength(0);
  });
});

describe('runChecksForEvent (save-time hook)', async () => {
  it('returns the warning row for an event saved before birth', async () => {
    const { person } = await personWithBirth('1944-06-15');
    const ev = await addEvent(person.id, 'name_change', '1943-01-01');
    const results = await runChecksForEvent(db, ev.id);
    expect(results).toHaveLength(1);
    expect(results[0].code).toBe('EVENT_BEFORE_BIRTH');
    expect(results[0].severity).toBe('warning');
  });

  it('returns the warning row for an event saved after death', async () => {
    const { person } = await personWithBirth('1900');
    await addDeath(person.id, '1980');
    const ev = await addEvent(person.id, 'description', '1985');
    const results = await runChecksForEvent(db, ev.id);
    expect(results).toHaveLength(1);
    expect(results[0].code).toBe('EVENT_OUTSIDE_LIFESPAN_AFTER_DEATH');
  });

  it('returns no rows for an in-lifespan event', async () => {
    const { person } = await personWithBirth('1900');
    await addDeath(person.id, '1980');
    const ev = await addEvent(person.id, 'residence', '1950');
    const results = await runChecksForEvent(db, ev.id);
    expect(results).toHaveLength(0);
  });

  it('returns no rows for an event with no date_value', async () => {
    const { person } = await personWithBirth('1900');
    const ev = await addEvent(person.id, 'mention', null);
    const results = await runChecksForEvent(db, ev.id);
    expect(results).toHaveLength(0);
  });

  it('does not flag the birth event against itself', async () => {
    const { person, birth } = await personWithBirth('1944');
    const results = await runChecksForEvent(db, birth.id);
    expect(results).toHaveLength(0);
  });

  it('flags an after-death event for ALL participants (witnesses, etc.)', async () => {
    const { person: a } = await personWithBirth('1900');
    await addDeath(a.id, '1970'); // a died 1970
    const { person: b } = await personWithBirth('1920');
    // Event in 1980 — a's death is 1970, b is alive.
    const ev = await createEvent(db, { event_type: 'mention', date_type: 'exact', date_value: '1980' });
    await addEventParticipant(db, { event_id: ev.id, person_id: a.id, role: 'primary' });
    await addEventParticipant(db, { event_id: ev.id, person_id: b.id, role: 'witness' });
    const results = await runChecksForEvent(db, ev.id);
    // One row for a (after death), zero for b
    expect(
      results.filter((r) => r.code === 'EVENT_OUTSIDE_LIFESPAN_AFTER_DEATH' && r.personIds.includes(a.id)),
    ).toHaveLength(1);
    expect(
      results.filter((r) => r.code === 'EVENT_OUTSIDE_LIFESPAN_AFTER_DEATH' && r.personIds.includes(b.id)),
    ).toHaveLength(0);
  });
});
