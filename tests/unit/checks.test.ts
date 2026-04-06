import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb } from './helpers';
import { runAllChecks, runChecksForPerson } from '../../src/api/checks';
import { createPerson, updatePerson } from '../../src/api/persons';
import { createRelationship, addEventParticipant } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { addPersonName } from '../../src/api/persons';

// Helper: create a person with a birth event on the given date (YYYY-MM-DD)
function personWithBirth(db: ReturnType<typeof createTestDb>, birthDate: string, opts?: Parameters<typeof createPerson>[1]) {
  const p = createPerson(db, opts ?? {});
  const e = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: birthDate });
  addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
  return { person: p, birthEvent: e };
}

// Helper: add a death event to a person
function addDeathEvent(db: ReturnType<typeof createTestDb>, personId: string, deathDate: string) {
  const e = createEvent(db, { event_type: 'death', date_type: 'exact', date_value: deathDate });
  addEventParticipant(db, { event_id: e.id, person_id: personId, role: 'primary' });
  return e;
}

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
  db = createTestDb();
});

// ---------------------------------------------------------------------------
// Category A — Chronological
// ---------------------------------------------------------------------------

describe('BIRTH_AFTER_DEATH', () => {
  it('fires when birth date is after death date', () => {
    const { person } = personWithBirth(db, '1900-01-01');
    addDeathEvent(db, person.id, '1899-01-01');
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'BIRTH_AFTER_DEATH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire when birth is before death', () => {
    const { person } = personWithBirth(db, '1900-01-01');
    addDeathEvent(db, person.id, '1970-06-15');
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'BIRTH_AFTER_DEATH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(0);
  });

  it('does not fire when birth is full-precision but death is year-only in the same year', () => {
    // "1777-02-12" > "1777" lexicographically but we cannot say birth is after death
    const { person } = personWithBirth(db, '1777-02-12');
    addDeathEvent(db, person.id, '1777');
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'BIRTH_AFTER_DEATH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(0);
  });
});

describe('FUTURE_BIRTH', () => {
  it('fires when birth date is in the future', () => {
    const { person } = personWithBirth(db, '2099-01-01');
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'FUTURE_BIRTH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for a past birth date', () => {
    const { person } = personWithBirth(db, '1980-03-15');
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'FUTURE_BIRTH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(0);
  });
});

describe('LIFESPAN checks', () => {
  it('fires LIFESPAN_OVER_120 and not LIFESPAN_OVER_105 when span > 120 years', () => {
    const { person } = personWithBirth(db, '1800-01-01');
    addDeathEvent(db, person.id, '1930-01-01'); // 130 years
    const results = runAllChecks(db);
    const over120 = results.filter(r => r.code === 'LIFESPAN_OVER_120' && r.personIds.includes(person.id));
    const over105 = results.filter(r => r.code === 'LIFESPAN_OVER_105' && r.personIds.includes(person.id));
    expect(over120).toHaveLength(1);
    expect(over105).toHaveLength(0);
  });

  it('fires LIFESPAN_OVER_105 and not LIFESPAN_OVER_120 when span is 106-120 years', () => {
    const { person } = personWithBirth(db, '1800-01-01');
    addDeathEvent(db, person.id, '1910-01-01'); // 110 years
    const results = runAllChecks(db);
    const over120 = results.filter(r => r.code === 'LIFESPAN_OVER_120' && r.personIds.includes(person.id));
    const over105 = results.filter(r => r.code === 'LIFESPAN_OVER_105' && r.personIds.includes(person.id));
    expect(over120).toHaveLength(0);
    expect(over105).toHaveLength(1);
  });

  it('does not fire for normal lifespan', () => {
    const { person } = personWithBirth(db, '1900-01-01');
    addDeathEvent(db, person.id, '1975-01-01'); // 75 years
    const results = runAllChecks(db);
    const lifespanIssues = results.filter(
      r => ['LIFESPAN_OVER_120', 'LIFESPAN_OVER_105'].includes(r.code) && r.personIds.includes(person.id)
    );
    expect(lifespanIssues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Category B — Parenthood Age
// ---------------------------------------------------------------------------

describe('PARENT_BORN_AFTER_CHILD', () => {
  it('fires when parent is born after the child', () => {
    const { person: parent } = personWithBirth(db, '1950-01-01');
    const { person: child } = personWithBirth(db, '1940-01-01');
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARENT_BORN_AFTER_CHILD' && r.personIds.includes(parent.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire when parent is older than child', () => {
    const { person: parent } = personWithBirth(db, '1920-01-01');
    const { person: child } = personWithBirth(db, '1950-01-01');
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARENT_BORN_AFTER_CHILD' && r.personIds.includes(parent.id));
    expect(hit).toHaveLength(0);
  });
});

describe('PARENT_TOO_YOUNG', () => {
  it('fires when parent was under 10 years old at child birth', () => {
    const { person: parent } = personWithBirth(db, '1930-01-01');
    const { person: child } = personWithBirth(db, '1936-01-01'); // 6 years gap
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARENT_TOO_YOUNG' && r.personIds.includes(parent.id));
    expect(hit).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Category C — Family Structure
// ---------------------------------------------------------------------------

describe('DUPLICATE_PARENT_CHILD', () => {
  it('fires when person1_id = person2_id in parent_child relationship', () => {
    const p = createPerson(db, { given_name: 'Self', surname: 'Parent' });
    // Insert directly since createRelationship may prevent same-person
    db.prepare(`INSERT INTO relationships (id, type, person1_id, person2_id, subtype) VALUES (?, ?, ?, ?, ?)`)
      .run([uuidv4(), 'parent_child', p.id, p.id, 'biological']);
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_PARENT_CHILD' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });
});

describe('MULTIPLE_BIRTH_PARENTS', () => {
  it('fires when a person has more than 2 biological parents', () => {
    const child = createPerson(db, { given_name: 'Child', surname: 'Test' });
    for (let i = 0; i < 3; i++) {
      const parent = createPerson(db, { given_name: `Parent${i}`, surname: 'Test' });
      createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    }
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'MULTIPLE_BIRTH_PARENTS' && r.personIds.includes(child.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire with exactly 2 biological parents', () => {
    const child = createPerson(db, { given_name: 'Child', surname: 'Normal' });
    for (let i = 0; i < 2; i++) {
      const parent = createPerson(db, { given_name: `Parent${i}`, surname: 'Normal' });
      createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    }
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'MULTIPLE_BIRTH_PARENTS' && r.personIds.includes(child.id));
    expect(hit).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Category D — Relationship Integrity
// ---------------------------------------------------------------------------

describe('COUPLE_WITH_SELF', () => {
  it('fires when person is in a couple relationship with themselves', () => {
    const p = createPerson(db, { given_name: 'Solo', surname: 'Test' });
    db.prepare(`INSERT INTO relationships (id, type, person1_id, person2_id) VALUES (?, ?, ?, ?)`)
      .run([uuidv4(), 'couple', p.id, p.id]);
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'COUPLE_WITH_SELF' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for a normal couple', () => {
    const p1 = createPerson(db, { given_name: 'Anna', surname: 'Test' });
    const p2 = createPerson(db, { given_name: 'Lars', surname: 'Test' });
    createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'COUPLE_WITH_SELF');
    expect(hit).toHaveLength(0);
  });
});

describe('MARRIED_BEFORE_12', () => {
  it('fires when a person was married before age 12', () => {
    const { person } = personWithBirth(db, '1900-01-01');
    const marriageEvent = createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1908-01-01' });
    addEventParticipant(db, { event_id: marriageEvent.id, person_id: person.id, role: 'primary' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'MARRIED_BEFORE_12' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for marriage at age 20', () => {
    const { person } = personWithBirth(db, '1900-01-01');
    const marriageEvent = createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1920-06-01' });
    addEventParticipant(db, { event_id: marriageEvent.id, person_id: person.id, role: 'primary' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'MARRIED_BEFORE_12' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Category F — Data Completeness
// ---------------------------------------------------------------------------

describe('NO_NAME', () => {
  it('fires for a person with no name entries', () => {
    const p = createPerson(db, {}); // no given_name or surname → no person_names row
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'NO_NAME' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for a person with a name', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'NO_NAME' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(0);
  });
});

describe('LIVING_WITH_DEATH_EVENT', () => {
  it('fires when a living person has a death event', () => {
    const p = createPerson(db, { given_name: 'Ghost', surname: 'Person', living: true });
    addDeathEvent(db, p.id, '2020-01-01');
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'LIVING_WITH_DEATH_EVENT' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for deceased person with death event', () => {
    const p = createPerson(db, { given_name: 'Dead', surname: 'Person', living: false });
    addDeathEvent(db, p.id, '2020-01-01');
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'LIVING_WITH_DEATH_EVENT' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// runChecksForPerson — isolation
// ---------------------------------------------------------------------------

describe('runChecksForPerson', () => {
  it('returns only results for the specified person', () => {
    // Person A: birth after death (error)
    const { person: personA } = personWithBirth(db, '1900-01-01');
    addDeathEvent(db, personA.id, '1899-01-01');

    // Person B: future birth (error)
    const { person: personB } = personWithBirth(db, '2099-01-01');

    const resultsForA = runChecksForPerson(db, personA.id);
    const resultsForB = runChecksForPerson(db, personB.id);

    // A should have BIRTH_AFTER_DEATH
    expect(resultsForA.some(r => r.code === 'BIRTH_AFTER_DEATH')).toBe(true);
    // A should not have FUTURE_BIRTH for person B
    const futureBirthForA = resultsForA.filter(r => r.code === 'FUTURE_BIRTH');
    expect(futureBirthForA.every(r => r.personIds.includes(personA.id))).toBe(true);

    // B should have FUTURE_BIRTH
    expect(resultsForB.some(r => r.code === 'FUTURE_BIRTH')).toBe(true);
    // B should not have BIRTH_AFTER_DEATH
    expect(resultsForB.some(r => r.code === 'BIRTH_AFTER_DEATH')).toBe(false);
  });

  it('returns empty array for a person with no issues (normal data)', () => {
    const { person } = personWithBirth(db, '1900-06-01');
    addPersonName(db, person.id, { given_name: 'Erik', surname: 'Svensson', name_type: 'birth' });
    addDeathEvent(db, person.id, '1975-01-01');
    updatePerson(db, person.id, { living: false });

    const results = runChecksForPerson(db, person.id);
    // Only expected non-error notices are NO_BIRTH_EVENT already covered by having birth
    // Filter to just errors and warnings
    const errorsAndWarnings = results.filter(r => r.severity === 'error' || r.severity === 'warning');
    expect(errorsAndWarnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// False positives — clean family tree
// ---------------------------------------------------------------------------

describe('False positives: clean family', () => {
  it('produces no errors or warnings for a normally constructed family', () => {
    // Parent born 1950, child born 1975, couple with normal marriage
    const { person: parent1 } = personWithBirth(db, '1950-05-01');
    addPersonName(db, parent1.id, { given_name: 'Lars', surname: 'Svensson', name_type: 'birth' });
    const { person: parent2 } = personWithBirth(db, '1952-03-10');
    addPersonName(db, parent2.id, { given_name: 'Maria', surname: 'Svensson', name_type: 'birth' });
    const { person: child } = personWithBirth(db, '1975-07-20');
    addPersonName(db, child.id, { given_name: 'Jonas', surname: 'Svensson', name_type: 'birth' });

    // Marriage in 1974
    const coupleRel = createRelationship(db, { type: 'couple', person1_id: parent1.id, person2_id: parent2.id, subtype: 'marriage' });
    const marriageEvent = createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1974-08-15', relationship_id: coupleRel.id });
    addEventParticipant(db, { event_id: marriageEvent.id, person_id: parent1.id, role: 'primary' });
    addEventParticipant(db, { event_id: marriageEvent.id, person_id: parent2.id, role: 'spouse' });

    // Parent-child relationships
    createRelationship(db, { type: 'parent_child', person1_id: parent1.id, person2_id: child.id, subtype: 'biological' });
    createRelationship(db, { type: 'parent_child', person1_id: parent2.id, person2_id: child.id, subtype: 'biological' });

    const results = runAllChecks(db);

    const errorsAndWarnings = results.filter(
      r => (r.severity === 'error' || r.severity === 'warning') &&
           (r.personIds.includes(parent1.id) || r.personIds.includes(parent2.id) || r.personIds.includes(child.id))
    );
    expect(errorsAndWarnings).toHaveLength(0);
  });
});
