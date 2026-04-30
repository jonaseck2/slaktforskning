import { describe, it, expect, beforeEach } from 'vitest';
import { addChildWorkflow, addRelationshipWorkflow } from '../../src/mcp/tools/prod/families';
import * as personApi from '../../src/api/persons';
import * as relationshipApi from '../../src/api/relationships';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
  db = createTestDb();
});

describe('addChildWorkflow', () => {
  it('creates child person + parent_child relationship', () => {
    const parent = personApi.createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });

    const result = addChildWorkflow(db, {
      parent_id: parent.id,
      given_name: 'Anna',
      surname: 'Svensson',
    });

    expect(result.child.id).toBeTruthy();
    const names = personApi.getPersonNames(db, result.child.id);
    expect(names[0].given_name).toBe('Anna');
    expect(names[0].surname).toBe('Svensson');

    expect(result.relationships).toHaveLength(1);
    const rel = result.relationships[0];
    expect(rel.type).toBe('parent_child');
    expect(rel.person1_id).toBe(parent.id);
    expect(rel.person2_id).toBe(result.child.id);
  });

  it('creates two parent_child relationships when other_parent_id is provided', () => {
    const father = personApi.createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const mother = personApi.createPerson(db, { given_name: 'Maja', surname: 'Johansson', sex: 'F' });

    const result = addChildWorkflow(db, {
      parent_id: father.id,
      other_parent_id: mother.id,
      given_name: 'Lars',
      surname: 'Svensson',
    });

    expect(result.relationships).toHaveLength(2);
    const parentIds = result.relationships.map(r => r.person1_id);
    expect(parentIds).toContain(father.id);
    expect(parentIds).toContain(mother.id);
    for (const rel of result.relationships) {
      expect(rel.type).toBe('parent_child');
      expect(rel.person2_id).toBe(result.child.id);
    }
  });

  it('creates birth event when birth_date is provided', () => {
    const parent = personApi.createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });

    const result = addChildWorkflow(db, {
      parent_id: parent.id,
      given_name: 'Britta',
      surname: 'Svensson',
      birth_date: '1875',
      birth_date_type: 'exact',
      birth_place: 'Stockholm',
    });

    expect(result.birth_event).not.toBeNull();
    expect(result.birth_event?.event_type).toBe('birth');
    expect(result.birth_event?.date_value).toBe('1875');

    // Verify child is participant
    const participants = relationshipApi.getEventParticipants(db, result.birth_event!.id);
    const childParticipant = participants.find(p => p.person_id === result.child.id);
    expect(childParticipant).toBeDefined();
    expect(childParticipant?.role).toBe('primary');
  });

  it('creates citation when source_title is provided', () => {
    const parent = personApi.createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });

    const result = addChildWorkflow(db, {
      parent_id: parent.id,
      given_name: 'Karin',
      surname: 'Svensson',
      birth_date: '1880',
      source_title: 'Husförhörslängd',
      source_page: 'p. 42',
    });

    expect(result.citation).not.toBeNull();
    expect(result.citation?.page).toBe('p. 42');
  });
});

describe('addRelationshipWorkflow', () => {
  it('creates a relationship between two persons', () => {
    const p1 = personApi.createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const p2 = personApi.createPerson(db, { given_name: 'Maja', surname: 'Johansson', sex: 'F' });

    const result = addRelationshipWorkflow(db, {
      person1_id: p1.id,
      person2_id: p2.id,
      type: 'couple',
    });

    expect(result.relationship.type).toBe('couple');
    expect(result.relationship.person1_id).toBe(p1.id);
    expect(result.relationship.person2_id).toBe(p2.id);
    expect(result.event).toBeNull();
  });

  it('creates marriage event when event_type and event_date are provided', () => {
    const p1 = personApi.createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const p2 = personApi.createPerson(db, { given_name: 'Maja', surname: 'Johansson', sex: 'F' });

    const result = addRelationshipWorkflow(db, {
      person1_id: p1.id,
      person2_id: p2.id,
      type: 'couple',
      subtype: 'marriage',
      event_type: 'marriage',
      event_date: '15 Jun 1900',
      event_date_type: 'exact',
      event_place: 'Göteborg',
    });

    expect(result.relationship.subtype).toBe('marriage');
    expect(result.event).not.toBeNull();
    expect(result.event?.event_type).toBe('marriage');
    expect(result.event?.date_value).toBe('15 Jun 1900');
    expect(result.event?.relationship_id).toBe(result.relationship.id);
  });

  it('creates relationship with notes', () => {
    const p1 = personApi.createPerson(db, { given_name: 'Per', surname: 'Nilsson', sex: 'M' });
    const p2 = personApi.createPerson(db, { given_name: 'Lisa', surname: 'Andersson', sex: 'F' });

    const result = addRelationshipWorkflow(db, {
      person1_id: p1.id,
      person2_id: p2.id,
      type: 'couple',
      notes: 'Married in church',
    });

    expect(result.relationship.notes).toBe('Married in church');
  });

  it('creates sibling relationship', () => {
    const p1 = personApi.createPerson(db, { given_name: 'Lars', surname: 'Berg', sex: 'M' });
    const p2 = personApi.createPerson(db, { given_name: 'Elin', surname: 'Berg', sex: 'F' });

    const result = addRelationshipWorkflow(db, {
      person1_id: p1.id,
      person2_id: p2.id,
      type: 'sibling',
    });

    expect(result.relationship.type).toBe('sibling');
  });
});
