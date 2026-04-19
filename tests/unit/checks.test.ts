import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { runAllChecks, runChecksForPerson } from '../../src/api/checks';
import { createPerson, updatePerson } from '../../src/api/persons';
import { createRelationship, addEventParticipant } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { addPersonName } from '../../src/api/persons';
import { createSource, createCitation } from '../../src/api/sources';
import { createMedia, addMediaLink } from '../../src/api/media';
import { createTestDb } from './helpers';

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

// ---------------------------------------------------------------------------
// Category G — Data Validation
// ---------------------------------------------------------------------------

describe('INVALID_DATE', () => {
  it('fires for month > 12', () => {
    const p = createPerson(db, {});
    const e = createEvent(db, { event_type: 'death', date_type: 'exact', date_value: '1727-14-10' });
    addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'INVALID_DATE' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].messageParams?.reason).toContain('månad');
  });

  it('fires for day > 31', () => {
    const p = createPerson(db, {});
    const e = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1953-03-90' });
    addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'INVALID_DATE' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].messageParams?.reason).toContain('dag');
  });

  it('fires for day 31 in a 30-day month', () => {
    const p = createPerson(db, {});
    const e = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1990-04-31' });
    addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'INVALID_DATE' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for valid dates', () => {
    const { person } = personWithBirth(db, '1990-02-28');
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'INVALID_DATE' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(0);
  });

  it('does not fire for year-only dates', () => {
    const p = createPerson(db, {});
    const e = createEvent(db, { event_type: 'birth', date_type: 'about', date_value: '1800' });
    addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'INVALID_DATE' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(0);
  });
});

describe('UNRELATED_PERSON', () => {
  it('fires for a person with no relationships', () => {
    const p = createPerson(db, {});
    addPersonName(db, p.id, { given_name: 'Tord', surname: 'Hulinder' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'UNRELATED_PERSON' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for a person in a relationship', () => {
    const p1 = createPerson(db, {});
    const p2 = createPerson(db, {});
    createRelationship(db, { type: 'parent_child', person1_id: p1.id, person2_id: p2.id });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'UNRELATED_PERSON' && (r.personIds.includes(p1.id) || r.personIds.includes(p2.id)));
    expect(hit).toHaveLength(0);
  });
});

describe('MEDIA_FILE_MISSING', () => {
  it('fires for a media record pointing to a non-existent file', () => {
    const p = createPerson(db, {});
    const m = createMedia(db, { title: 'Photo', file_ref: '/nonexistent/path/photo.jpg', is_missing: true });
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'MEDIA_FILE_MISSING');
    expect(hit).toHaveLength(1);
    expect(hit[0].mediaIds).toContain(m.id);
    // Media-file-missing is a media-scoped issue, not a person-scoped one.
    expect(hit[0].personIds).toEqual([]);
  });

  it('does not fire for media without file_ref', () => {
    createMedia(db, { title: 'Photo without ref' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'MEDIA_FILE_MISSING');
    expect(hit).toHaveLength(0);
  });
});

describe('ORPHANED_SOURCE', () => {
  it('fires for a source with no citations', () => {
    createSource(db, { title: 'Kyrkobok' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'ORPHANED_SOURCE');
    expect(hit).toHaveLength(1);
    expect(hit[0].messageParams?.title).toBe('Kyrkobok');
  });

  it('does not fire for a source with citations', () => {
    const s = createSource(db, { title: 'Kyrkobok' });
    createCitation(db, { source_id: s.id, page: '42' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'ORPHANED_SOURCE');
    expect(hit).toHaveLength(0);
  });
});

describe('TEXT_CONTROL_CHARS', () => {
  it('fires for control characters in person names', () => {
    const p = createPerson(db, {});
    addPersonName(db, p.id, { given_name: 'Anna\x01', surname: 'Svensson' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'TEXT_CONTROL_CHARS' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for normal text with newlines', () => {
    const p = createPerson(db, { notes: 'Line 1\nLine 2\tTabbed' });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Svensson' });
    // Add a relationship so UNRELATED_PERSON doesn't fire
    const p2 = createPerson(db, {});
    createRelationship(db, { type: 'parent_child', person1_id: p.id, person2_id: p2.id });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'TEXT_CONTROL_CHARS' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(0);
  });

  it('fires for control characters in person notes', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Test', notes: 'Some note\x02here' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'TEXT_CONTROL_CHARS' && r.personIds.includes(p.id));
    expect(hit.length).toBeGreaterThanOrEqual(1);
  });

  it('fires for control characters in event descriptions', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Test' });
    const e = createEvent(db, { event_type: 'birth', description: 'Born\x03here' });
    addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'TEXT_CONTROL_CHARS' && r.eventIds?.includes(e.id));
    expect(hit).toHaveLength(1);
  });

  it('fires for control characters in source titles', () => {
    createSource(db, { title: 'Bad\x04Source' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'TEXT_CONTROL_CHARS' && r.message.includes('Källtitel'));
    expect(hit).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Additional parenthood age edge cases
// ---------------------------------------------------------------------------

describe('PARENT_VERY_YOUNG', () => {
  it('fires when parent was 10-14 years old at child birth', () => {
    const { person: parent } = personWithBirth(db, '1930-01-01');
    const { person: child } = personWithBirth(db, '1942-01-01'); // 12 years gap
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARENT_VERY_YOUNG' && r.personIds.includes(parent.id));
    expect(hit).toHaveLength(1);
  });
});

describe('PARENT_YOUNG', () => {
  it('fires when parent was 15-17 years old at child birth', () => {
    const { person: parent } = personWithBirth(db, '1930-01-01');
    const { person: child } = personWithBirth(db, '1946-01-01'); // 16 years gap
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARENT_YOUNG' && r.personIds.includes(parent.id));
    expect(hit).toHaveLength(1);
  });
});

describe('MOTHER_TOO_OLD', () => {
  it('fires when mother was over 58 at child birth', () => {
    const { person: mother } = personWithBirth(db, '1890-01-01', { sex: 'F' });
    const { person: child } = personWithBirth(db, '1960-01-01'); // mother was 70
    createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: child.id, subtype: 'biological' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'MOTHER_TOO_OLD' && r.personIds.includes(mother.id));
    expect(hit).toHaveLength(1);
  });
});

describe('FATHER_TOO_OLD', () => {
  it('fires when father was over 90 at child birth', () => {
    const { person: father } = personWithBirth(db, '1850-01-01', { sex: 'M' });
    const { person: child } = personWithBirth(db, '1950-01-01'); // father was 100
    createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: child.id, subtype: 'biological' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'FATHER_TOO_OLD' && r.personIds.includes(father.id));
    expect(hit).toHaveLength(1);
  });
});

describe('CHILD_BORN_AFTER_PARENT_DEATH', () => {
  it('fires when child is born more than 1 year after mother death', () => {
    const { person: mother } = personWithBirth(db, '1890-01-01', { sex: 'F' });
    addDeathEvent(db, mother.id, '1920-01-01');
    const { person: child } = personWithBirth(db, '1922-01-01');
    createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: child.id, subtype: 'biological' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'CHILD_BORN_AFTER_PARENT_DEATH' && r.personIds.includes(mother.id));
    expect(hit).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Marriage checks edge cases
// ---------------------------------------------------------------------------

describe('MARRIED_BEFORE_16', () => {
  it('fires when married at age 12-15', () => {
    const { person } = personWithBirth(db, '1900-01-01');
    const marriageEvent = createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1913-06-01' });
    addEventParticipant(db, { event_id: marriageEvent.id, person_id: person.id, role: 'primary' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'MARRIED_BEFORE_16' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });
});

describe('MARRIAGE_AFTER_DEATH', () => {
  it('fires when marriage date is after death date', () => {
    const { person } = personWithBirth(db, '1900-01-01');
    addDeathEvent(db, person.id, '1950-06-01');
    const marriageEvent = createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1960-01-01' });
    addEventParticipant(db, { event_id: marriageEvent.id, person_id: person.id, role: 'primary' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'MARRIAGE_AFTER_DEATH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });
});

describe('MARRIAGE_BEFORE_BIRTH', () => {
  it('fires when marriage date is before birth date', () => {
    const { person } = personWithBirth(db, '1920-01-01');
    const marriageEvent = createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1910-01-01' });
    addEventParticipant(db, { event_id: marriageEvent.id, person_id: person.id, role: 'primary' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'MARRIAGE_BEFORE_BIRTH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });
});

describe('BAPTISM_LATE', () => {
  it('fires when baptism is more than 10 years after birth', () => {
    const { person } = personWithBirth(db, '1800-01-01');
    const baptismEvent = createEvent(db, { event_type: 'baptism', date_type: 'exact', date_value: '1815-06-01' });
    addEventParticipant(db, { event_id: baptismEvent.id, person_id: person.id, role: 'primary' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'BAPTISM_LATE' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });
});

describe('EVENT_AFTER_DEATH', () => {
  it('fires when a non-death event occurs after death', () => {
    const { person } = personWithBirth(db, '1900-01-01');
    addDeathEvent(db, person.id, '1950-01-01');
    const census = createEvent(db, { event_type: 'census', date_type: 'exact', date_value: '1960-01-01' });
    addEventParticipant(db, { event_id: census.id, person_id: person.id, role: 'primary' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'EVENT_AFTER_DEATH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });
});

describe('BURIAL_BEFORE_DEATH', () => {
  it('fires when burial date is before death date', () => {
    const { person } = personWithBirth(db, '1900-01-01');
    addDeathEvent(db, person.id, '1970-06-15');
    const burial = createEvent(db, { event_type: 'burial', date_type: 'exact', date_value: '1970-06-10' });
    addEventParticipant(db, { event_id: burial.id, person_id: person.id, role: 'primary' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'BURIAL_BEFORE_DEATH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });
});

describe('DEATH_WITHOUT_BIRTH', () => {
  it('fires for a person with death event but no birth event', () => {
    const p = createPerson(db, { given_name: 'No', surname: 'Birth' });
    addDeathEvent(db, p.id, '1950-01-01');
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DEATH_WITHOUT_BIRTH' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });
});

describe('NOT_LIVING_WITHOUT_DEATH', () => {
  it('fires for a deceased person without death event', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Dead', living: false });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'NOT_LIVING_WITHOUT_DEATH' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });
});

describe('DUPLICATE_RELATIONSHIP', () => {
  it('fires when two identical relationships exist between same persons', () => {
    const p1 = createPerson(db, { given_name: 'A', surname: 'Test' });
    const p2 = createPerson(db, { given_name: 'B', surname: 'Test' });
    createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });
    createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_RELATIONSHIP');
    expect(hit).toHaveLength(1);
  });
});

describe('UNSOURCED_BIRTH / UNSOURCED_DEATH', () => {
  it('fires UNSOURCED_BIRTH for birth event without citation', () => {
    const { person } = personWithBirth(db, '1900-01-01');
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'UNSOURCED_BIRTH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });

  it('fires UNSOURCED_DEATH for death event without citation', () => {
    const p = createPerson(db, { given_name: 'A', surname: 'B' });
    addDeathEvent(db, p.id, '1950-01-01');
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'UNSOURCED_DEATH' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire UNSOURCED_BIRTH when birth has citation', () => {
    const { person, birthEvent } = personWithBirth(db, '1900-01-01');
    const s = createSource(db, { title: 'Kyrkobok' });
    createCitation(db, { source_id: s.id, event_id: birthEvent.id });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'UNSOURCED_BIRTH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(0);
  });
});

describe('INVALID_DATE edge cases', () => {
  it('fires for invalid date_value_end', () => {
    const p = createPerson(db, {});
    const e = createEvent(db, { event_type: 'census', date_type: 'between', date_value: '1900-01-01', date_value_end: '1900-13-01' });
    addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'INVALID_DATE' && r.eventIds?.includes(e.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].message).toContain('slutdatum');
  });
});

describe('MULTIPLE_BIRTH_NAMES', () => {
  it('fires when a person has two name_type=birth entries', () => {
    const p = createPerson(db, {});
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Eriksson', name_type: 'birth' });
    addPersonName(db, p.id, { given_name: 'Anna Maria', surname: 'Eriksson', name_type: 'birth' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'MULTIPLE_BIRTH_NAMES' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
  });

  it('does not fire when person has one birth name and one married name', () => {
    const p = createPerson(db, {});
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Eriksson', name_type: 'birth' });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Svensson', name_type: 'married' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'MULTIPLE_BIRTH_NAMES')).toHaveLength(0);
  });
});

describe('PARTIAL_NAME', () => {
  it('fires when a person has only given_name', () => {
    const p = createPerson(db, { given_name: 'Solo' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARTIAL_NAME' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('notice');
  });

  it('fires when a person has only surname', () => {
    const p = createPerson(db, {});
    addPersonName(db, p.id, { given_name: '', surname: 'Nilsson', name_type: 'birth' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARTIAL_NAME' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire when both names present', () => {
    const p = createPerson(db, { given_name: 'Anna', surname: 'Eriksson' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'PARTIAL_NAME' && r.personIds.includes(p.id))).toHaveLength(0);
  });
});

describe('LIVING_OVER_120', () => {
  it('fires when a living person was born more than 120 years ago', () => {
    const ancientYear = new Date().getFullYear() - 121;
    const { person } = personWithBirth(db, `${ancientYear}-01-01`, { living: true });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'LIVING_OVER_120' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
  });

  it('does not fire when living person is within 120 years', () => {
    const recentYear = new Date().getFullYear() - 50;
    const { person } = personWithBirth(db, `${recentYear}-01-01`, { living: true });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'LIVING_OVER_120' && r.personIds.includes(person.id))).toHaveLength(0);
  });

  it('does not fire when person is not living', () => {
    const ancientYear = new Date().getFullYear() - 130;
    const { person } = personWithBirth(db, `${ancientYear}-01-01`, { living: false });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'LIVING_OVER_120' && r.personIds.includes(person.id))).toHaveLength(0);
  });
});
