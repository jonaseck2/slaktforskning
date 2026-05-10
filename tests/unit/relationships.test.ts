import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createPerson } from '../../src/api/persons';
import {
  createRelationship,
  getRelationship,
  listRelationships,
  updateRelationship,
  deleteRelationship,
  getRelationshipsOfPerson,
  searchRelationships,
  addEventParticipant,
  getEventParticipants,
  removeEventParticipant,
  countRelationships,
  listRelationshipsPage,
} from '../../src/api/relationships';
import { createEvent, deleteEvent } from '../../src/api/events';
import { createTestDb } from './helpers';

let db: Database.Database;

beforeEach(async () => {
  db = await createTestDb();
});

describe('relationships', async () => {
  it('creates a couple relationship', async () => {
    const a = await createPerson(db, { given_name: 'Erik', surname: 'A', sex: 'M' });
    const b = await createPerson(db, { given_name: 'Anna', surname: 'B', sex: 'F' });
    const rel = await createRelationship(db, {
      type: 'couple',
      person1_id: a.id,
      person2_id: b.id,
      subtype: 'marriage',
    });
    expect(rel.id).toBeDefined();
    expect(rel.type).toBe('couple');
    expect(rel.person1_id).toBe(a.id);
    expect(rel.person2_id).toBe(b.id);
    expect(rel.subtype).toBe('marriage');
  });

  it('creates a parent_child relationship', async () => {
    const parent = await createPerson(db, { given_name: 'Parent', surname: 'P' });
    const child = await createPerson(db, { given_name: 'Child', surname: 'P' });
    const rel = await createRelationship(db, {
      type: 'parent_child',
      person1_id: parent.id,
      person2_id: child.id,
      subtype: 'biological',
    });
    expect(rel.type).toBe('parent_child');
    expect(rel.subtype).toBe('biological');
  });

  it('creates a relationship with no persons', async () => {
    const rel = await createRelationship(db, { type: 'couple' });
    expect(rel.person1_id).toBeNull();
    expect(rel.person2_id).toBeNull();
  });

  it('gets and lists relationships', async () => {
    await createRelationship(db, { type: 'couple', subtype: 'marriage' });
    await createRelationship(db, { type: 'parent_child', subtype: 'biological' });
    const list = await listRelationships(db);
    expect(list).toHaveLength(2);
    expect(await getRelationship(db, list[0].id)).not.toBeNull();
  });

  it('updates a relationship', async () => {
    const rel = await createRelationship(db, { type: 'couple', subtype: 'unknown' });
    const updated = await updateRelationship(db, rel.id, { subtype: 'marriage', notes: 'test' });
    expect(updated!.subtype).toBe('marriage');
    expect(updated!.notes).toBe('test');
  });

  it('coerces null notes to empty string on update (NOT NULL column)', async () => {
    const rel = await createRelationship(db, { type: 'parent_child', subtype: 'biological' });
    const updated = await updateRelationship(db, rel.id, {
      subtype: 'adopted',
      notes: null as unknown as string,
    });
    expect(updated!.subtype).toBe('adopted');
    expect(updated!.notes).toBe('');
  });

  it('deletes a relationship', async () => {
    const rel = await createRelationship(db, { type: 'couple' });
    expect(await deleteRelationship(db, rel.id)).toBe(true);
    expect(await getRelationship(db, rel.id)).toBeNull();
  });

  it('getRelationship returns null for nonexistent id', async () => {
    expect(await getRelationship(db, 'nonexistent')).toBeNull();
  });

  it('deleteRelationship returns false for nonexistent id', async () => {
    expect(await deleteRelationship(db, 'nonexistent')).toBe(false);
  });

  it('gets relationships of a person (as person1 and person2)', async () => {
    const person = await createPerson(db, { given_name: 'Test', surname: 'T' });
    const other1 = await createPerson(db, { given_name: 'Other1', surname: 'O' });
    const other2 = await createPerson(db, { given_name: 'Other2', surname: 'O' });
    await createRelationship(db, { type: 'couple', person1_id: person.id, person2_id: other1.id });
    await createRelationship(db, { type: 'parent_child', person1_id: other2.id, person2_id: person.id });

    const rels = await getRelationshipsOfPerson(db, person.id);
    expect(rels).toHaveLength(2);
  });

  it('searches relationships by person name', async () => {
    const a = await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const b = await createPerson(db, { given_name: 'Anna', surname: 'Larsson', sex: 'F' });
    await createRelationship(db, { type: 'couple', person1_id: a.id, person2_id: b.id, subtype: 'marriage' });
    await createRelationship(db, { type: 'couple' }); // no persons

    const results = await searchRelationships(db, 'Svensson');
    expect(results).toHaveLength(1);
    expect(results[0].person1_given_name).toBe('Erik');

    const byPerson2 = await searchRelationships(db, 'Larsson');
    expect(byPerson2).toHaveLength(1);

    const noMatch = await searchRelationships(db, 'zzz_nomatch');
    expect(noMatch).toHaveLength(0);
  });
});

describe('event_participants', async () => {
  it('adds a participant to an event', async () => {
    const person = await createPerson(db, { given_name: 'Test', surname: 'T' });
    const event = await createEvent(db, { event_type: 'birth' });
    const participant = await addEventParticipant(db, {
      event_id: event.id,
      person_id: person.id,
      role: 'primary',
    });
    expect(participant.id).toBeDefined();
    expect(participant.event_id).toBe(event.id);
    expect(participant.person_id).toBe(person.id);
    expect(participant.role).toBe('primary');
  });

  it('gets participants for an event', async () => {
    const person1 = await createPerson(db, { given_name: 'A', surname: 'A' });
    const person2 = await createPerson(db, { given_name: 'B', surname: 'B' });
    const event = await createEvent(db, { event_type: 'marriage' });
    await addEventParticipant(db, { event_id: event.id, person_id: person1.id, role: 'primary' });
    await addEventParticipant(db, { event_id: event.id, person_id: person2.id, role: 'spouse' });

    const participants = await getEventParticipants(db, event.id);
    expect(participants).toHaveLength(2);
  });

  it('removes a participant', async () => {
    const person = await createPerson(db, { given_name: 'Test', surname: 'T' });
    const event = await createEvent(db, { event_type: 'birth' });
    const participant = await addEventParticipant(db, { event_id: event.id, person_id: person.id });
    expect(await removeEventParticipant(db, participant.id)).toBe(true);
    expect(await getEventParticipants(db, event.id)).toHaveLength(0);
  });

  it('enforces unique event+person constraint', async () => {
    const person = await createPerson(db, { given_name: 'Test', surname: 'T' });
    const event = await createEvent(db, { event_type: 'birth' });
    await addEventParticipant(db, { event_id: event.id, person_id: person.id });
    await expect(async () => await addEventParticipant(db, { event_id: event.id, person_id: person.id })).rejects.toThrow();
  });

  it('cascades on event delete', async () => {
    const person = await createPerson(db, { given_name: 'Test', surname: 'T' });
    const event = await createEvent(db, { event_type: 'birth' });
    await addEventParticipant(db, { event_id: event.id, person_id: person.id });
    expect(await getEventParticipants(db, event.id)).toHaveLength(1);

    // Delete the event — participants should be cascade-deleted
    await deleteEvent(db, event.id);
    expect(await getEventParticipants(db, event.id)).toHaveLength(0);
  });
});

describe('countRelationships', async () => {
  it('returns 0 for empty database', async () => {
    expect(await countRelationships(db)).toBe(0);
  });

  it('returns correct count', async () => {
    const a = await createPerson(db, { given_name: 'Erik', surname: 'A' });
    const b = await createPerson(db, { given_name: 'Anna', surname: 'B' });
    const c = await createPerson(db, { given_name: 'Olof', surname: 'C' });
    await createRelationship(db, { type: 'couple', person1_id: a.id, person2_id: b.id });
    await createRelationship(db, { type: 'parent_child', person1_id: a.id, person2_id: c.id });
    expect(await countRelationships(db)).toBe(2);
  });
});

describe('listRelationshipsPage', async () => {
  it('returns relationships with person name data', async () => {
    const a = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = await createPerson(db, { given_name: 'Anna', surname: 'Berg' });
    await createRelationship(db, { type: 'couple', person1_id: a.id, person2_id: b.id });

    const page = await listRelationshipsPage(db, 100, 0);
    expect(page).toHaveLength(1);
    expect(page[0].person1_given_name).toBe('Erik');
    expect(page[0].person1_surname).toBe('Svensson');
    expect(page[0].person2_given_name).toBe('Anna');
    expect(page[0].person2_surname).toBe('Berg');
  });

  it('handles relationship with null person_id', async () => {
    await createRelationship(db, { type: 'couple' }); // both null
    const page = await listRelationshipsPage(db, 100, 0);
    expect(page).toHaveLength(1);
    expect(page[0].person1_given_name).toBe('');
    expect(page[0].person2_given_name).toBe('');
  });

  it('respects limit and offset', async () => {
    const persons = Array.from({ length: 5 }, async (_, i) =>
      await createPerson(db, { given_name: `P${i}`, surname: 'Test' })
    );
    for (let i = 0; i < 4; i++) {
      await createRelationship(db, { type: 'sibling', person1_id: persons[i].id, person2_id: persons[i + 1].id });
    }
    const page1 = await listRelationshipsPage(db, 2, 0);
    const page2 = await listRelationshipsPage(db, 2, 2);
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1[0].id).not.toBe(page2[0].id);
  });
});
