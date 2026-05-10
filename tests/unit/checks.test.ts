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
async function personWithBirth(db: ReturnType<typeof createTestDb>, birthDate: string, opts?: Parameters<typeof createPerson>[1]) {
  const p = await createPerson(db, opts ?? {}, { allowNameless: true });
  const e = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: birthDate });
  await addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
  return { person: p, birthEvent: e };
}

// Helper: add a death event to a person
async function addDeathEvent(db: ReturnType<typeof createTestDb>, personId: string, deathDate: string) {
  const e = await createEvent(db, { event_type: 'death', date_type: 'exact', date_value: deathDate });
  await addEventParticipant(db, { event_id: e.id, person_id: personId, role: 'primary' });
  return e;
}

let db: ReturnType<typeof createTestDb>;

beforeEach(async () => {
  db = await createTestDb();
});

// ---------------------------------------------------------------------------
// Category A — Chronological
// ---------------------------------------------------------------------------

describe('BIRTH_AFTER_DEATH', async () => {
  it('fires when birth date is after death date', async () => {
    const { person } = await personWithBirth(db, '1900-01-01');
    await addDeathEvent(db, person.id, '1899-01-01');
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'BIRTH_AFTER_DEATH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire when birth is before death', async () => {
    const { person } = await personWithBirth(db, '1900-01-01');
    await addDeathEvent(db, person.id, '1970-06-15');
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'BIRTH_AFTER_DEATH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(0);
  });

  it('does not fire when birth is full-precision but death is year-only in the same year', async () => {
    // "1777-02-12" > "1777" lexicographically but we cannot say birth is after death
    const { person } = await personWithBirth(db, '1777-02-12');
    await addDeathEvent(db, person.id, '1777');
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'BIRTH_AFTER_DEATH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(0);
  });
});

describe('FUTURE_BIRTH', async () => {
  it('fires when birth date is in the future', async () => {
    const { person } = await personWithBirth(db, '2099-01-01');
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'FUTURE_BIRTH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for a past birth date', async () => {
    const { person } = await personWithBirth(db, '1980-03-15');
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'FUTURE_BIRTH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(0);
  });
});

describe('LIFESPAN checks', async () => {
  it('fires LIFESPAN_OVER_120 and not LIFESPAN_OVER_105 when span > 120 years', async () => {
    const { person } = await personWithBirth(db, '1800-01-01');
    await addDeathEvent(db, person.id, '1930-01-01'); // 130 years
    const results = await runAllChecks(db);
    const over120 = results.filter(r => r.code === 'LIFESPAN_OVER_120' && r.personIds.includes(person.id));
    const over105 = results.filter(r => r.code === 'LIFESPAN_OVER_105' && r.personIds.includes(person.id));
    expect(over120).toHaveLength(1);
    expect(over105).toHaveLength(0);
  });

  it('fires LIFESPAN_OVER_105 and not LIFESPAN_OVER_120 when span is 106-120 years', async () => {
    const { person } = await personWithBirth(db, '1800-01-01');
    await addDeathEvent(db, person.id, '1910-01-01'); // 110 years
    const results = await runAllChecks(db);
    const over120 = results.filter(r => r.code === 'LIFESPAN_OVER_120' && r.personIds.includes(person.id));
    const over105 = results.filter(r => r.code === 'LIFESPAN_OVER_105' && r.personIds.includes(person.id));
    expect(over120).toHaveLength(0);
    expect(over105).toHaveLength(1);
  });

  it('does not fire for normal lifespan', async () => {
    const { person } = await personWithBirth(db, '1900-01-01');
    await addDeathEvent(db, person.id, '1975-01-01'); // 75 years
    const results = await runAllChecks(db);
    const lifespanIssues = results.filter(
      r => ['LIFESPAN_OVER_120', 'LIFESPAN_OVER_105'].includes(r.code) && r.personIds.includes(person.id)
    );
    expect(lifespanIssues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Category B — Parenthood Age
// ---------------------------------------------------------------------------

describe('PARENT_BORN_AFTER_CHILD', async () => {
  it('fires when parent is born after the child', async () => {
    const { person: parent } = await personWithBirth(db, '1950-01-01');
    const { person: child } = await personWithBirth(db, '1940-01-01');
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARENT_BORN_AFTER_CHILD' && r.personIds.includes(parent.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire when parent is older than child', async () => {
    const { person: parent } = await personWithBirth(db, '1920-01-01');
    const { person: child } = await personWithBirth(db, '1950-01-01');
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARENT_BORN_AFTER_CHILD' && r.personIds.includes(parent.id));
    expect(hit).toHaveLength(0);
  });
});

describe('PARENT_TOO_YOUNG', async () => {
  it('fires when parent was under 10 years old at child birth', async () => {
    const { person: parent } = await personWithBirth(db, '1930-01-01');
    const { person: child } = await personWithBirth(db, '1936-01-01'); // 6 years gap
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARENT_TOO_YOUNG' && r.personIds.includes(parent.id));
    expect(hit).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Category C — Family Structure
// ---------------------------------------------------------------------------

describe('DUPLICATE_PARENT_CHILD', async () => {
  it('fires when person1_id = person2_id in parent_child relationship', async () => {
    const p = await createPerson(db, { given_name: 'Self', surname: 'Parent' });
    // Insert directly since createRelationship may prevent same-person
    db.prepare(`INSERT INTO relationships (id, type, person1_id, person2_id, subtype) VALUES (?, ?, ?, ?, ?)`)
      .run([uuidv4(), 'parent_child', p.id, p.id, 'biological']);
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_PARENT_CHILD' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });
});

describe('MULTIPLE_BIRTH_PARENTS', async () => {
  it('fires when a person has more than 2 biological parents', async () => {
    const child = await createPerson(db, { given_name: 'Child', surname: 'Test' });
    for (let i = 0; i < 3; i++) {
      const parent = await createPerson(db, { given_name: `Parent${i}`, surname: 'Test' });
      await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    }
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'MULTIPLE_BIRTH_PARENTS' && r.personIds.includes(child.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire with exactly 2 biological parents', async () => {
    const child = await createPerson(db, { given_name: 'Child', surname: 'Normal' });
    for (let i = 0; i < 2; i++) {
      const parent = await createPerson(db, { given_name: `Parent${i}`, surname: 'Normal' });
      await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    }
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'MULTIPLE_BIRTH_PARENTS' && r.personIds.includes(child.id));
    expect(hit).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Category D — Relationship Integrity
// ---------------------------------------------------------------------------

describe('COUPLE_WITH_SELF', async () => {
  it('fires when person is in a couple relationship with themselves', async () => {
    const p = await createPerson(db, { given_name: 'Solo', surname: 'Test' });
    db.prepare(`INSERT INTO relationships (id, type, person1_id, person2_id) VALUES (?, ?, ?, ?)`)
      .run([uuidv4(), 'couple', p.id, p.id]);
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'COUPLE_WITH_SELF' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for a normal couple', async () => {
    const p1 = await createPerson(db, { given_name: 'Anna', surname: 'Test' });
    const p2 = await createPerson(db, { given_name: 'Lars', surname: 'Test' });
    await createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'COUPLE_WITH_SELF');
    expect(hit).toHaveLength(0);
  });
});

describe('MARRIED_BEFORE_12', async () => {
  it('fires when a person was married before age 12', async () => {
    const { person } = await personWithBirth(db, '1900-01-01');
    const marriageEvent = await createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1908-01-01' });
    await addEventParticipant(db, { event_id: marriageEvent.id, person_id: person.id, role: 'primary' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'MARRIED_BEFORE_12' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for marriage at age 20', async () => {
    const { person } = await personWithBirth(db, '1900-01-01');
    const marriageEvent = await createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1920-06-01' });
    await addEventParticipant(db, { event_id: marriageEvent.id, person_id: person.id, role: 'primary' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'MARRIED_BEFORE_12' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Category F — Data Completeness
// ---------------------------------------------------------------------------

describe('PERSON_NO_NAME', async () => {
  it('fires for a person with no name entries', async () => {
    const p = await createPerson(db, {}, { allowNameless: true }); // no given_name or surname → no person_names row
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'PERSON_NO_NAME' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for a person with a name', async () => {
    const p = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'PERSON_NO_NAME' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// LIKELY_INLINE_BIRTH_NAME — detection of inline (f. X) / (b. X) / (född X) / (born X)
// ---------------------------------------------------------------------------

describe('LIKELY_INLINE_BIRTH_NAME', async () => {
  it('flags surname containing "(f. Svensson)"', async () => {
    const p = await createPerson(db, { given_name: 'Anna', surname: 'Andersson (f. Svensson)' });
    const results = await runAllChecks(db);
    const hits = results.filter(r => r.code === 'LIKELY_INLINE_BIRTH_NAME' && r.personIds.includes(p.id));
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('notice');
  });

  it('flags surname containing "(b. Svensson)"', async () => {
    const p = await createPerson(db, { given_name: 'Anna', surname: 'Andersson (b. Svensson)' });
    const results = await runAllChecks(db);
    const hits = results.filter(r => r.code === 'LIKELY_INLINE_BIRTH_NAME' && r.personIds.includes(p.id));
    expect(hits).toHaveLength(1);
  });

  it('flags given_name containing "(född Svensson)"', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Anna (född Svensson)', surname: 'Andersson', name_type: 'birth' });
    const results = await runAllChecks(db);
    const hits = results.filter(r => r.code === 'LIKELY_INLINE_BIRTH_NAME' && r.personIds.includes(p.id));
    expect(hits).toHaveLength(1);
  });

  it('flags given_name containing "(born Svensson)"', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Anna (born Svensson)', surname: 'Andersson', name_type: 'birth' });
    const results = await runAllChecks(db);
    const hits = results.filter(r => r.code === 'LIKELY_INLINE_BIRTH_NAME' && r.personIds.includes(p.id));
    expect(hits).toHaveLength(1);
  });

  it('does NOT flag a plain surname like "Anderson"', async () => {
    const p = await createPerson(db, { given_name: 'Anna', surname: 'Anderson' });
    const results = await runAllChecks(db);
    const hits = results.filter(r => r.code === 'LIKELY_INLINE_BIRTH_NAME' && r.personIds.includes(p.id));
    expect(hits).toHaveLength(0);
  });

  it('does NOT flag a parenthetical without a trigger word', async () => {
    const p = await createPerson(db, { given_name: 'Anna', surname: "O'Connor (Boston)" });
    const results = await runAllChecks(db);
    const hits = results.filter(r => r.code === 'LIKELY_INLINE_BIRTH_NAME' && r.personIds.includes(p.id));
    expect(hits).toHaveLength(0);
  });

  it('does NOT flag a leading parenthetical (no preceding name token)', async () => {
    const p = await createPerson(db, { given_name: 'Anna', surname: '(f. Svensson) Andersson' });
    const results = await runAllChecks(db);
    const hits = results.filter(r => r.code === 'LIKELY_INLINE_BIRTH_NAME' && r.personIds.includes(p.id));
    expect(hits).toHaveLength(0);
  });

  it('produces two distinct rows for two flagged persons', async () => {
    const p1 = await createPerson(db, { given_name: 'Anna', surname: 'Andersson (f. Svensson)' });
    const p2 = await createPerson(db, { given_name: 'Berta', surname: 'Bengtsson (f. Karlsson)' });
    const results = await runAllChecks(db);
    const hits = results.filter(r => r.code === 'LIKELY_INLINE_BIRTH_NAME');
    const flaggedPersonIds = new Set(hits.flatMap(r => r.personIds));
    expect(flaggedPersonIds.has(p1.id)).toBe(true);
    expect(flaggedPersonIds.has(p2.id)).toBe(true);
    expect(hits).toHaveLength(2);
  });

  it('does NOT flag the well-structured case (separate birth + current name rows)', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Svensson', name_type: 'birth' });
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Andersson', name_type: 'married' });
    const results = await runAllChecks(db);
    const hits = results.filter(r => r.code === 'LIKELY_INLINE_BIRTH_NAME' && r.personIds.includes(p.id));
    expect(hits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// runChecksForPerson — isolation
// ---------------------------------------------------------------------------

describe('runChecksForPerson', async () => {
  it('returns only results for the specified person', async () => {
    // Person A: birth after death (error)
    const { person: personA } = await personWithBirth(db, '1900-01-01');
    await addDeathEvent(db, personA.id, '1899-01-01');

    // Person B: future birth (error)
    const { person: personB } = await personWithBirth(db, '2099-01-01');

    const resultsForA = await runChecksForPerson(db, personA.id);
    const resultsForB = await runChecksForPerson(db, personB.id);

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

  it('returns empty array for a person with no issues (normal data)', async () => {
    const { person } = await personWithBirth(db, '1900-06-01');
    await addPersonName(db, person.id, { given_name: 'Erik', surname: 'Svensson', name_type: 'birth' });
    await addDeathEvent(db, person.id, '1975-01-01');
    await updatePerson(db, person.id, { living: false });

    const results = await runChecksForPerson(db, person.id);
    // Only expected non-error notices are NO_BIRTH_EVENT already covered by having birth
    // Filter to just errors and warnings
    const errorsAndWarnings = results.filter(r => r.severity === 'error' || r.severity === 'warning');
    expect(errorsAndWarnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// False positives — clean family tree
// ---------------------------------------------------------------------------

describe('False positives: clean family', async () => {
  it('produces no errors or warnings for a normally constructed family', async () => {
    // Parent born 1950, child born 1975, couple with normal marriage
    const { person: parent1 } = await personWithBirth(db, '1950-05-01');
    await addPersonName(db, parent1.id, { given_name: 'Lars', surname: 'Svensson', name_type: 'birth' });
    const { person: parent2 } = await personWithBirth(db, '1952-03-10');
    await addPersonName(db, parent2.id, { given_name: 'Maria', surname: 'Svensson', name_type: 'birth' });
    const { person: child } = await personWithBirth(db, '1975-07-20');
    await addPersonName(db, child.id, { given_name: 'Jonas', surname: 'Svensson', name_type: 'birth' });

    // Marriage in 1974
    const coupleRel = await createRelationship(db, { type: 'couple', person1_id: parent1.id, person2_id: parent2.id, subtype: 'marriage' });
    const marriageEvent = await createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1974-08-15', relationship_id: coupleRel.id });
    await addEventParticipant(db, { event_id: marriageEvent.id, person_id: parent1.id, role: 'primary' });
    await addEventParticipant(db, { event_id: marriageEvent.id, person_id: parent2.id, role: 'spouse' });

    // Parent-child relationships
    await createRelationship(db, { type: 'parent_child', person1_id: parent1.id, person2_id: child.id, subtype: 'biological' });
    await createRelationship(db, { type: 'parent_child', person1_id: parent2.id, person2_id: child.id, subtype: 'biological' });

    const results = await runAllChecks(db);

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

describe('INVALID_DATE', async () => {
  it('fires for month > 12', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    const e = await createEvent(db, { event_type: 'death', date_type: 'exact', date_value: '1727-14-10' });
    await addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'INVALID_DATE' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].messageParams?.reason).toContain('månad');
  });

  it('fires for day > 31', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    const e = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1953-03-90' });
    await addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'INVALID_DATE' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].messageParams?.reason).toContain('dag');
  });

  it('fires for day 31 in a 30-day month', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    const e = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1990-04-31' });
    await addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'INVALID_DATE' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for valid dates', async () => {
    const { person } = await personWithBirth(db, '1990-02-28');
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'INVALID_DATE' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(0);
  });

  it('does not fire for year-only dates', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    const e = await createEvent(db, { event_type: 'birth', date_type: 'about', date_value: '1800' });
    await addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'INVALID_DATE' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(0);
  });
});

describe('UNRELATED_PERSON', async () => {
  it('fires for a person with no relationships', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Tord', surname: 'Hulinder' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'UNRELATED_PERSON' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for a person in a relationship', async () => {
    const p1 = await createPerson(db, {}, { allowNameless: true });
    const p2 = await createPerson(db, {}, { allowNameless: true });
    await createRelationship(db, { type: 'parent_child', person1_id: p1.id, person2_id: p2.id });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'UNRELATED_PERSON' && (r.personIds.includes(p1.id) || r.personIds.includes(p2.id)));
    expect(hit).toHaveLength(0);
  });
});

describe('MEDIA_FILE_MISSING', async () => {
  it('fires for a media record pointing to a non-existent file', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    const m = await createMedia(db, { title: 'Photo', file_ref: '/nonexistent/path/photo.jpg', is_missing: true });
    await addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'MEDIA_FILE_MISSING');
    expect(hit).toHaveLength(1);
    expect(hit[0].mediaIds).toContain(m.id);
    // Media-file-missing is a media-scoped issue, not a person-scoped one.
    expect(hit[0].personIds).toEqual([]);
  });

  it('does not fire for media without file_ref', async () => {
    await createMedia(db, { title: 'Photo without ref' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'MEDIA_FILE_MISSING');
    expect(hit).toHaveLength(0);
  });
});

describe('ORPHANED_SOURCE', async () => {
  it('fires for a source with no citations', async () => {
    await createSource(db, { title: 'Kyrkobok' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'ORPHANED_SOURCE');
    expect(hit).toHaveLength(1);
    expect(hit[0].messageParams?.title).toBe('Kyrkobok');
  });

  it('does not fire for a source with citations', async () => {
    const s = await createSource(db, { title: 'Kyrkobok' });
    await createCitation(db, { source_id: s.id, page: '42' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'ORPHANED_SOURCE');
    expect(hit).toHaveLength(0);
  });
});

describe('TEXT_CONTROL_CHARS', async () => {
  it('fires for control characters in person names', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Anna\x01', surname: 'Svensson' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'TEXT_CONTROL_CHARS' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire for normal text with newlines', async () => {
    const p = await createPerson(db, { notes: 'Line 1\nLine 2\tTabbed' }, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Svensson' });
    // Add a relationship so UNRELATED_PERSON doesn't fire
    const p2 = await createPerson(db, {}, { allowNameless: true });
    await createRelationship(db, { type: 'parent_child', person1_id: p.id, person2_id: p2.id });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'TEXT_CONTROL_CHARS' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(0);
  });

  it('fires for control characters in person notes', async () => {
    const p = await createPerson(db, { given_name: 'Erik', surname: 'Test', notes: 'Some note\x02here' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'TEXT_CONTROL_CHARS' && r.personIds.includes(p.id));
    expect(hit.length).toBeGreaterThanOrEqual(1);
  });

  it('fires for control characters in event notes', async () => {
    const p = await createPerson(db, { given_name: 'Erik', surname: 'Test' });
    const e = await createEvent(db, { event_type: 'birth', notes: 'Born\x03here' });
    await addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'TEXT_CONTROL_CHARS' && r.eventIds?.includes(e.id));
    expect(hit).toHaveLength(1);
  });

  it('fires for control characters in source titles', async () => {
    await createSource(db, { title: 'Bad\x04Source' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'TEXT_CONTROL_CHARS' && r.message.includes('Källtitel'));
    expect(hit).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Additional parenthood age edge cases
// ---------------------------------------------------------------------------

describe('PARENT_VERY_YOUNG', async () => {
  it('fires when parent was 10-14 years old at child birth', async () => {
    const { person: parent } = await personWithBirth(db, '1930-01-01');
    const { person: child } = await personWithBirth(db, '1942-01-01'); // 12 years gap
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARENT_VERY_YOUNG' && r.personIds.includes(parent.id));
    expect(hit).toHaveLength(1);
  });
});

describe('PARENT_YOUNG', async () => {
  it('fires when parent was 15-17 years old at child birth', async () => {
    const { person: parent } = await personWithBirth(db, '1930-01-01');
    const { person: child } = await personWithBirth(db, '1946-01-01'); // 16 years gap
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARENT_YOUNG' && r.personIds.includes(parent.id));
    expect(hit).toHaveLength(1);
  });
});

describe('MOTHER_TOO_OLD', async () => {
  it('fires when mother was over 58 at child birth', async () => {
    const { person: mother } = await personWithBirth(db, '1890-01-01', { sex: 'F' });
    const { person: child } = await personWithBirth(db, '1960-01-01'); // mother was 70
    await createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: child.id, subtype: 'biological' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'MOTHER_TOO_OLD' && r.personIds.includes(mother.id));
    expect(hit).toHaveLength(1);
  });
});

describe('FATHER_TOO_OLD', async () => {
  it('fires when father was over 90 at child birth', async () => {
    const { person: father } = await personWithBirth(db, '1850-01-01', { sex: 'M' });
    const { person: child } = await personWithBirth(db, '1950-01-01'); // father was 100
    await createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: child.id, subtype: 'biological' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'FATHER_TOO_OLD' && r.personIds.includes(father.id));
    expect(hit).toHaveLength(1);
  });
});

describe('CHILD_BORN_AFTER_PARENT_DEATH', async () => {
  it('fires when child is born more than 1 year after mother death', async () => {
    const { person: mother } = await personWithBirth(db, '1890-01-01', { sex: 'F' });
    await addDeathEvent(db, mother.id, '1920-01-01');
    const { person: child } = await personWithBirth(db, '1922-01-01');
    await createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: child.id, subtype: 'biological' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'CHILD_BORN_AFTER_PARENT_DEATH' && r.personIds.includes(mother.id));
    expect(hit).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Marriage checks edge cases
// ---------------------------------------------------------------------------

describe('MARRIED_BEFORE_16', async () => {
  it('fires when married at age 12-15', async () => {
    const { person } = await personWithBirth(db, '1900-01-01');
    const marriageEvent = await createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1913-06-01' });
    await addEventParticipant(db, { event_id: marriageEvent.id, person_id: person.id, role: 'primary' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'MARRIED_BEFORE_16' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });
});

describe('MARRIAGE_AFTER_DEATH', async () => {
  it('fires when marriage date is after death date', async () => {
    const { person } = await personWithBirth(db, '1900-01-01');
    await addDeathEvent(db, person.id, '1950-06-01');
    const marriageEvent = await createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1960-01-01' });
    await addEventParticipant(db, { event_id: marriageEvent.id, person_id: person.id, role: 'primary' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'MARRIAGE_AFTER_DEATH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });
});

describe('MARRIAGE_BEFORE_BIRTH', async () => {
  it('fires when marriage date is before birth date', async () => {
    const { person } = await personWithBirth(db, '1920-01-01');
    const marriageEvent = await createEvent(db, { event_type: 'marriage', date_type: 'exact', date_value: '1910-01-01' });
    await addEventParticipant(db, { event_id: marriageEvent.id, person_id: person.id, role: 'primary' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'MARRIAGE_BEFORE_BIRTH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });
});

describe('BAPTISM_LATE', async () => {
  it('fires when christening is more than 10 years after birth', async () => {
    const { person } = await personWithBirth(db, '1800-01-01');
    const baptismEvent = await createEvent(db, { event_type: 'christening', date_type: 'exact', date_value: '1815-06-01' });
    await addEventParticipant(db, { event_id: baptismEvent.id, person_id: person.id, role: 'primary' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'BAPTISM_LATE' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });
});

describe('EVENT_AFTER_DEATH', async () => {
  it('fires when a non-death event occurs after death', async () => {
    const { person } = await personWithBirth(db, '1900-01-01');
    await addDeathEvent(db, person.id, '1950-01-01');
    const census = await createEvent(db, { event_type: 'census', date_type: 'exact', date_value: '1960-01-01' });
    await addEventParticipant(db, { event_id: census.id, person_id: person.id, role: 'primary' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'EVENT_AFTER_DEATH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });
});

describe('BURIAL_BEFORE_DEATH', async () => {
  it('fires when burial date is before death date', async () => {
    const { person } = await personWithBirth(db, '1900-01-01');
    await addDeathEvent(db, person.id, '1970-06-15');
    const burial = await createEvent(db, { event_type: 'burial', date_type: 'exact', date_value: '1970-06-10' });
    await addEventParticipant(db, { event_id: burial.id, person_id: person.id, role: 'primary' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'BURIAL_BEFORE_DEATH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });
});

describe('DEATH_WITHOUT_BIRTH', async () => {
  it('fires for a person with death event but no birth event', async () => {
    const p = await createPerson(db, { given_name: 'No', surname: 'Birth' });
    await addDeathEvent(db, p.id, '1950-01-01');
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'DEATH_WITHOUT_BIRTH' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });
});

describe('DUPLICATE_RELATIONSHIP', async () => {
  it('fires when two identical relationships exist between same persons', async () => {
    const p1 = await createPerson(db, { given_name: 'A', surname: 'Test' });
    const p2 = await createPerson(db, { given_name: 'B', surname: 'Test' });
    await createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });
    await createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_RELATIONSHIP');
    expect(hit).toHaveLength(1);
  });
});

describe('UNSOURCED_BIRTH / UNSOURCED_DEATH', async () => {
  it('fires UNSOURCED_BIRTH for birth event without citation', async () => {
    const { person } = await personWithBirth(db, '1900-01-01');
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'UNSOURCED_BIRTH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
  });

  it('fires UNSOURCED_DEATH for death event without citation', async () => {
    const p = await createPerson(db, { given_name: 'A', surname: 'B' });
    await addDeathEvent(db, p.id, '1950-01-01');
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'UNSOURCED_DEATH' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire UNSOURCED_BIRTH when birth has citation', async () => {
    const { person, birthEvent } = await personWithBirth(db, '1900-01-01');
    const s = await createSource(db, { title: 'Kyrkobok' });
    await createCitation(db, { source_id: s.id, event_id: birthEvent.id });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'UNSOURCED_BIRTH' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(0);
  });
});

describe('INVALID_DATE edge cases', async () => {
  it('fires for invalid date_value_end', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    const e = await createEvent(db, { event_type: 'census', date_type: 'between', date_value: '1900-01-01', date_value_end: '1900-13-01' });
    await addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'INVALID_DATE' && r.eventIds?.includes(e.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].message).toContain('slutdatum');
  });
});

describe('MULTIPLE_BIRTH_NAMES', async () => {
  it('fires when a person has two name_type=birth entries', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Eriksson', name_type: 'birth' });
    await addPersonName(db, p.id, { given_name: 'Anna Maria', surname: 'Eriksson', name_type: 'birth' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'MULTIPLE_BIRTH_NAMES' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
  });

  it('does not fire when person has one birth name and one married name', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Eriksson', name_type: 'birth' });
    await addPersonName(db, p.id, { given_name: 'Anna', surname: 'Svensson', name_type: 'married' });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'MULTIPLE_BIRTH_NAMES')).toHaveLength(0);
  });
});

describe('PARTIAL_NAME', async () => {
  it('fires when a person has only given_name', async () => {
    const p = await createPerson(db, { given_name: 'Solo' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARTIAL_NAME' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('notice');
  });

  it('fires when a person has only surname', async () => {
    const p = await createPerson(db, {}, { allowNameless: true });
    await addPersonName(db, p.id, { given_name: '', surname: 'Nilsson', name_type: 'birth' });
    const results = await runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARTIAL_NAME' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire when both names present', async () => {
    const p = await createPerson(db, { given_name: 'Anna', surname: 'Eriksson' });
    const results = await runAllChecks(db);
    expect(results.filter(r => r.code === 'PARTIAL_NAME' && r.personIds.includes(p.id))).toHaveLength(0);
  });
});

