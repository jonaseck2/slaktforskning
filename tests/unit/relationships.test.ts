import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers';
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
} from '../../src/api/relationships';
import { createEvent, deleteEvent } from '../../src/api/events';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

describe('relationships', () => {
  it('creates a couple relationship', () => {
    const a = createPerson(db, { given_name: 'Erik', surname: 'A', sex: 'M' });
    const b = createPerson(db, { given_name: 'Anna', surname: 'B', sex: 'F' });
    const rel = createRelationship(db, {
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

  it('creates a parent_child relationship', () => {
    const parent = createPerson(db, { given_name: 'Parent', surname: 'P' });
    const child = createPerson(db, { given_name: 'Child', surname: 'P' });
    const rel = createRelationship(db, {
      type: 'parent_child',
      person1_id: parent.id,
      person2_id: child.id,
      subtype: 'biological',
    });
    expect(rel.type).toBe('parent_child');
    expect(rel.subtype).toBe('biological');
  });

  it('creates a relationship with no persons', () => {
    const rel = createRelationship(db, { type: 'couple' });
    expect(rel.person1_id).toBeNull();
    expect(rel.person2_id).toBeNull();
  });

  it('gets and lists relationships', () => {
    createRelationship(db, { type: 'couple', subtype: 'marriage' });
    createRelationship(db, { type: 'parent_child', subtype: 'biological' });
    const list = listRelationships(db);
    expect(list).toHaveLength(2);
    expect(getRelationship(db, list[0].id)).not.toBeNull();
  });

  it('updates a relationship', () => {
    const rel = createRelationship(db, { type: 'couple', subtype: 'unknown' });
    const updated = updateRelationship(db, rel.id, { subtype: 'marriage', notes: 'test' });
    expect(updated!.subtype).toBe('marriage');
    expect(updated!.notes).toBe('test');
  });

  it('deletes a relationship', () => {
    const rel = createRelationship(db, { type: 'couple' });
    expect(deleteRelationship(db, rel.id)).toBe(true);
    expect(getRelationship(db, rel.id)).toBeNull();
  });

  it('gets relationships of a person (as person1 and person2)', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'T' });
    const other1 = createPerson(db, { given_name: 'Other1', surname: 'O' });
    const other2 = createPerson(db, { given_name: 'Other2', surname: 'O' });
    createRelationship(db, { type: 'couple', person1_id: person.id, person2_id: other1.id });
    createRelationship(db, { type: 'parent_child', person1_id: other2.id, person2_id: person.id });

    const rels = getRelationshipsOfPerson(db, person.id);
    expect(rels).toHaveLength(2);
  });

  it('searches relationships by person name', () => {
    const a = createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const b = createPerson(db, { given_name: 'Anna', surname: 'Larsson', sex: 'F' });
    createRelationship(db, { type: 'couple', person1_id: a.id, person2_id: b.id, subtype: 'marriage' });
    createRelationship(db, { type: 'couple' }); // no persons

    const results = searchRelationships(db, 'Svensson');
    expect(results).toHaveLength(1);
    expect(results[0].person1_given_name).toBe('Erik');

    const byPerson2 = searchRelationships(db, 'Larsson');
    expect(byPerson2).toHaveLength(1);

    const noMatch = searchRelationships(db, 'zzz_nomatch');
    expect(noMatch).toHaveLength(0);
  });
});

describe('event_participants', () => {
  it('adds a participant to an event', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'T' });
    const event = createEvent(db, { event_type: 'birth' });
    const participant = addEventParticipant(db, {
      event_id: event.id,
      person_id: person.id,
      role: 'primary',
    });
    expect(participant.id).toBeDefined();
    expect(participant.event_id).toBe(event.id);
    expect(participant.person_id).toBe(person.id);
    expect(participant.role).toBe('primary');
  });

  it('gets participants for an event', () => {
    const person1 = createPerson(db, { given_name: 'A', surname: 'A' });
    const person2 = createPerson(db, { given_name: 'B', surname: 'B' });
    const event = createEvent(db, { event_type: 'marriage' });
    addEventParticipant(db, { event_id: event.id, person_id: person1.id, role: 'primary' });
    addEventParticipant(db, { event_id: event.id, person_id: person2.id, role: 'spouse' });

    const participants = getEventParticipants(db, event.id);
    expect(participants).toHaveLength(2);
  });

  it('removes a participant', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'T' });
    const event = createEvent(db, { event_type: 'birth' });
    const participant = addEventParticipant(db, { event_id: event.id, person_id: person.id });
    expect(removeEventParticipant(db, participant.id)).toBe(true);
    expect(getEventParticipants(db, event.id)).toHaveLength(0);
  });

  it('enforces unique event+person constraint', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'T' });
    const event = createEvent(db, { event_type: 'birth' });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    expect(() => addEventParticipant(db, { event_id: event.id, person_id: person.id })).toThrow();
  });

  it('cascades on event delete', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'T' });
    const event = createEvent(db, { event_type: 'birth' });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    expect(getEventParticipants(db, event.id)).toHaveLength(1);

    // Delete the event — participants should be cascade-deleted
    deleteEvent(db, event.id);
    expect(getEventParticipants(db, event.id)).toHaveLength(0);
  });
});
