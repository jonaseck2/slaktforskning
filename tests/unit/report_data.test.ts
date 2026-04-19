import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createRelationship, addEventParticipant } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { createPlace, findOrCreatePlace } from '../../src/api/places';
import { createSource, createCitation } from '../../src/api/sources';
import { createGroup, addGroupMember } from '../../src/api/groups';
import { createResearchTask } from '../../src/api/research_tasks';
import {
  getPersonSummary,
  getFamilyUnit,
  getAncestorTree,
  getPlaceHistory,
  getResearchGaps,
  getTimeline,
  getAliveInYear,
} from '../../src/api/report_data';
import { createTestDb } from './helpers';

let db: any;

beforeEach(() => {
  db = createTestDb();
});

describe('getPersonSummary', () => {
  it('returns null for non-existent person', () => {
    expect(getPersonSummary(db, 'no-such-id')).toBeNull();
  });

  it('returns complete summary with names, events, relationships, citations', () => {
    const person = createPerson(db, { given_name: 'Erik', surname: 'Andersson', sex: 'M' });
    const place = createPlace(db, { name: 'Stockholm' });
    const birthEvent = createEvent(db, { event_type: 'birth', date_value: '1850-01-15', date_original: '15 Jan 1850', place_id: place.id });
    addEventParticipant(db, { event_id: birthEvent.id, person_id: person.id, role: 'primary' });

    const spouse = createPerson(db, { given_name: 'Anna', surname: 'Svensson', sex: 'F' });
    createRelationship(db, { type: 'couple', person1_id: person.id, person2_id: spouse.id });

    const source = createSource(db, { title: 'Church Records' });
    createCitation(db, { source_id: source.id, person_id: person.id, page: 'p. 42' });

    const group = createGroup(db, { name: 'Test Group' });
    addGroupMember(db, group.id, person.id);

    createResearchTask(db, { task: 'Find death record', person_id: person.id });

    const summary = getPersonSummary(db, person.id);
    expect(summary).not.toBeNull();
    expect(summary!.person.id).toBe(person.id);
    expect(summary!.names).toHaveLength(1);
    expect(summary!.names[0].given_name).toBe('Erik');
    expect(summary!.events).toHaveLength(1);
    expect(summary!.events[0].event_type).toBe('birth');
    expect(summary!.events[0].place_name).toBe('Stockholm');
    expect(summary!.events[0].place_path).toBe('Stockholm');
    expect(summary!.relationships).toHaveLength(1);
    expect(summary!.relationships[0].other_person_id).toBe(spouse.id);
    expect(summary!.relationships[0].other_person_names).toHaveLength(1);
    expect(summary!.citations).toHaveLength(1);
    expect(summary!.citations[0].source_title).toBe('Church Records');
    expect(summary!.groups).toHaveLength(1);
    expect(summary!.research_tasks).toHaveLength(1);
  });

  it('includes event citations in the person summary', () => {
    const person = createPerson(db, { given_name: 'Lars', surname: 'Nilsson', sex: 'M' });
    const event = createEvent(db, { event_type: 'birth', date_original: '1900' });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const source = createSource(db, { title: 'Parish Register' });
    createCitation(db, { source_id: source.id, event_id: event.id });

    const summary = getPersonSummary(db, person.id);
    expect(summary!.citations).toHaveLength(1);
    expect(summary!.citations[0].source_title).toBe('Parish Register');
  });
});

describe('getFamilyUnit', () => {
  it('returns null for non-existent relationship', () => {
    expect(getFamilyUnit(db, 'no-such-id')).toBeNull();
  });

  it('returns couple with children', () => {
    const father = createPerson(db, { given_name: 'Per', surname: 'Johansson', sex: 'M' });
    const mother = createPerson(db, { given_name: 'Maria', surname: 'Eriksdotter', sex: 'F' });
    const couple = createRelationship(db, { type: 'couple', person1_id: father.id, person2_id: mother.id });

    createEvent(db, { event_type: 'marriage', relationship_id: couple.id, date_original: '1870' });

    const child = createPerson(db, { given_name: 'Johan', surname: 'Persson', sex: 'M' });
    createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: child.id });
    createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: child.id });

    const childBirth = createEvent(db, { event_type: 'birth', date_original: '1871' });
    addEventParticipant(db, { event_id: childBirth.id, person_id: child.id });

    const unit = getFamilyUnit(db, couple.id);
    expect(unit).not.toBeNull();
    expect(unit!.person1).not.toBeNull();
    expect(unit!.person1!.names[0].given_name).toBe('Per');
    expect(unit!.person2).not.toBeNull();
    expect(unit!.person2!.names[0].given_name).toBe('Maria');
    expect(unit!.relationship_events).toHaveLength(1);
    expect(unit!.relationship_events[0].event_type).toBe('marriage');
    expect(unit!.children).toHaveLength(1);
    expect(unit!.children[0].names[0].given_name).toBe('Johan');
    expect(unit!.children[0].birth_event).not.toBeNull();
  });
});

describe('getAncestorTree', () => {
  it('returns null for non-existent person', () => {
    expect(getAncestorTree(db, 'no-such-id')).toBeNull();
  });

  it('builds a 2-generation tree', () => {
    const child = createPerson(db, { given_name: 'Anna', surname: 'Persdotter', sex: 'F' });
    const father = createPerson(db, { given_name: 'Per', surname: 'Johansson', sex: 'M' });
    const mother = createPerson(db, { given_name: 'Maria', surname: 'Eriksdotter', sex: 'F' });

    createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: child.id });
    createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: child.id });

    const fatherBirth = createEvent(db, { event_type: 'birth', date_original: '1820' });
    addEventParticipant(db, { event_id: fatherBirth.id, person_id: father.id });

    const tree = getAncestorTree(db, child.id, 2);
    expect(tree).not.toBeNull();
    expect(tree!.person.id).toBe(child.id);
    expect(tree!.father).not.toBeNull();
    expect(tree!.father!.person.id).toBe(father.id);
    expect(tree!.father!.birth_event).not.toBeNull();
    expect(tree!.mother).not.toBeNull();
    expect(tree!.mother!.person.id).toBe(mother.id);
    // With generations=2, parents should not recurse further
    expect(tree!.father!.father).toBeNull();
    expect(tree!.father!.mother).toBeNull();
  });

  it('assigns unknown-sex parent to father slot first', () => {
    const child = createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
    const parent = createPerson(db, { given_name: 'Unknown', surname: 'Test', sex: 'U' });
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });

    const tree = getAncestorTree(db, child.id, 2);
    expect(tree).not.toBeNull();
    expect(tree!.father).not.toBeNull();
    expect(tree!.father!.person.id).toBe(parent.id);
    expect(tree!.mother).toBeNull();
  });

  it('assigns second unknown-sex parent to mother slot', () => {
    const child = createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
    const parent1 = createPerson(db, { given_name: 'Parent1', surname: 'Test', sex: 'U' });
    const parent2 = createPerson(db, { given_name: 'Parent2', surname: 'Test', sex: 'U' });
    createRelationship(db, { type: 'parent_child', person1_id: parent1.id, person2_id: child.id });
    createRelationship(db, { type: 'parent_child', person1_id: parent2.id, person2_id: child.id });

    const tree = getAncestorTree(db, child.id, 2);
    expect(tree).not.toBeNull();
    expect(tree!.father).not.toBeNull();
    expect(tree!.mother).not.toBeNull();
    const parentIds = [tree!.father!.person.id, tree!.mother!.person.id].sort();
    expect(parentIds).toEqual([parent1.id, parent2.id].sort());
  });

  it('fills mother slot when father already assigned by male parent', () => {
    const child = createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
    const father = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M' });
    const unknownParent = createPerson(db, { given_name: 'Other', surname: 'Test', sex: 'U' });
    createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: child.id });
    createRelationship(db, { type: 'parent_child', person1_id: unknownParent.id, person2_id: child.id });

    const tree = getAncestorTree(db, child.id, 2);
    expect(tree).not.toBeNull();
    expect(tree!.father).not.toBeNull();
    expect(tree!.father!.person.id).toBe(father.id);
    expect(tree!.mother).not.toBeNull();
    expect(tree!.mother!.person.id).toBe(unknownParent.id);
  });

  it('respects generation limit of 1', () => {
    const child = createPerson(db, { given_name: 'Anna', surname: 'Persdotter', sex: 'F' });
    const father = createPerson(db, { given_name: 'Per', surname: 'Johansson', sex: 'M' });
    createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: child.id });

    const tree = getAncestorTree(db, child.id, 1);
    expect(tree).not.toBeNull();
    expect(tree!.father).toBeNull();
    expect(tree!.mother).toBeNull();
  });
});

describe('getPlaceHistory', () => {
  it('returns null for non-existent place', () => {
    expect(getPlaceHistory(db, 'no-such-id')).toBeNull();
  });

  it('returns events at a place with participants', () => {
    const place = createPlace(db, { name: 'Fröderyd' });
    const person = createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });

    const event = createEvent(db, { event_type: 'birth', place_id: place.id, date_value: '1850-03-12', date_original: '12 Mar 1850' });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const history = getPlaceHistory(db, place.id);
    expect(history).not.toBeNull();
    expect(history!.place_name).toBe('Fröderyd');
    expect(history!.events).toHaveLength(1);
    expect(history!.events[0].event.event_type).toBe('birth');
    expect(history!.events[0].participants).toHaveLength(1);
    expect(history!.events[0].participants[0].given_name).toBe('Erik');
    expect(history!.events[0].participants[0].role).toBe('primary');
  });
});

describe('getResearchGaps', () => {
  it('returns null for non-existent person', () => {
    expect(getResearchGaps(db, 'no-such-id')).toBeNull();
  });

  it('identifies missing birth, death, parents, unsourced events', () => {
    const person = createPerson(db, { given_name: 'Nils', surname: 'Karlsson', sex: 'M', living: false });
    // Not living, no death event
    const event = createEvent(db, { event_type: 'census', date_original: '1880' });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });

    const gaps = getResearchGaps(db, person.id);
    expect(gaps).not.toBeNull();
    expect(gaps!.missing_birth).toBe(true);
    expect(gaps!.missing_death).toBe(true);
    expect(gaps!.missing_parents).toBe(true);
    expect(gaps!.unsourced_events).toHaveLength(1);
    expect(gaps!.events_without_places).toHaveLength(1);
  });

  it('does not flag death as missing for living person', () => {
    const person = createPerson(db, { given_name: 'Eva', surname: 'Lindgren', sex: 'F', living: true });

    const gaps = getResearchGaps(db, person.id);
    expect(gaps!.missing_death).toBe(false);
  });

  it('does not flag parents as missing when person is child in parent_child', () => {
    const person = createPerson(db, { given_name: 'Erik', surname: 'Andersson', sex: 'M' });
    const parent = createPerson(db, { given_name: 'Anders', surname: 'Nilsson', sex: 'M' });
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: person.id });

    const gaps = getResearchGaps(db, person.id);
    expect(gaps!.missing_parents).toBe(false);
  });

  it('does not flag sourced events as unsourced', () => {
    const person = createPerson(db, { given_name: 'Karin', surname: 'Olsson', sex: 'F' });
    const event = createEvent(db, { event_type: 'birth', date_original: '1890' });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const source = createSource(db, { title: 'Church Book' });
    createCitation(db, { source_id: source.id, event_id: event.id });

    const gaps = getResearchGaps(db, person.id);
    expect(gaps!.unsourced_events).toHaveLength(0);
  });
});

describe('getTimeline', () => {
  it('returns null for non-existent person', () => {
    expect(getTimeline(db, 'no-such-id')).toBeNull();
  });

  it('includes sibling relationship events with correct label', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
    const sibling = createPerson(db, { given_name: 'Lars', surname: 'Test', sex: 'M' });
    createRelationship(db, { type: 'sibling', person1_id: person.id, person2_id: sibling.id });

    const siblingBirth = createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
    addEventParticipant(db, { event_id: siblingBirth.id, person_id: sibling.id });

    const timeline = getTimeline(db, person.id);
    expect(timeline).not.toBeNull();
    const siblingEntry = timeline!.find(e => e.relationship_label === 'sibling');
    expect(siblingEntry).toBeDefined();
    expect(siblingEntry!.person_given_name).toBe('Lars');
  });

  it('uses relationship type as label for non-standard types', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
    const other = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M' });
    createRelationship(db, { type: 'godparent', person1_id: person.id, person2_id: other.id });

    const otherBirth = createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
    addEventParticipant(db, { event_id: otherBirth.id, person_id: other.id });

    const timeline = getTimeline(db, person.id);
    expect(timeline).not.toBeNull();
    const godparentEntry = timeline!.find(e => e.relationship_label === 'godparent');
    expect(godparentEntry).toBeDefined();
  });

  it('labels parent_child correctly when person is the parent', () => {
    const parent = createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
    const child = createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });

    const childBirth = createEvent(db, { event_type: 'birth', date_value: '1870-01-01', date_original: '1870' });
    addEventParticipant(db, { event_id: childBirth.id, person_id: child.id });

    const timeline = getTimeline(db, parent.id);
    expect(timeline).not.toBeNull();
    const childEntry = timeline!.find(e => e.relationship_label === 'child');
    expect(childEntry).toBeDefined();
    expect(childEntry!.person_given_name).toBe('Erik');
  });

  it('labels parent_child correctly when person is the child', () => {
    const parent = createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
    const child = createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });

    const parentBirth = createEvent(db, { event_type: 'birth', date_value: '1840-01-01', date_original: '1840' });
    addEventParticipant(db, { event_id: parentBirth.id, person_id: parent.id });

    const timeline = getTimeline(db, child.id);
    expect(timeline).not.toBeNull();
    const parentEntry = timeline!.find(e => e.relationship_label === 'parent');
    expect(parentEntry).toBeDefined();
    expect(parentEntry!.person_given_name).toBe('Per');
  });

  it('sorts entries with null date_value using empty string fallback', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
    const ev1 = createEvent(db, { event_type: 'birth', date_value: '1850-01-01' });
    addEventParticipant(db, { event_id: ev1.id, person_id: person.id });
    const ev2 = createEvent(db, { event_type: 'census' }); // no date_value
    addEventParticipant(db, { event_id: ev2.id, person_id: person.id });

    const timeline = getTimeline(db, person.id);
    expect(timeline).not.toBeNull();
    expect(timeline!.length).toBe(2);
    // Empty string sorts before '1850...', so undated comes first
    expect(timeline![0].event.event_type).toBe('census');
    expect(timeline![1].event.date_value).toBe('1850-01-01');
  });

  it('returns person events and family events merged chronologically', () => {
    const person = createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
    const spouse = createPerson(db, { given_name: 'Maja', surname: 'Larsdotter', sex: 'F' });
    createRelationship(db, { type: 'couple', person1_id: person.id, person2_id: spouse.id });

    // Person birth
    const personBirth = createEvent(db, { event_type: 'birth', date_value: '1840-01-01', date_original: '1840' });
    addEventParticipant(db, { event_id: personBirth.id, person_id: person.id });

    // Spouse birth
    const spouseBirth = createEvent(db, { event_type: 'birth', date_value: '1845-06-15', date_original: '1845' });
    addEventParticipant(db, { event_id: spouseBirth.id, person_id: spouse.id });

    // Child
    const child = createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });
    createRelationship(db, { type: 'parent_child', person1_id: person.id, person2_id: child.id });

    const childBirth = createEvent(db, { event_type: 'birth', date_value: '1870-03-20', date_original: '1870' });
    addEventParticipant(db, { event_id: childBirth.id, person_id: child.id });

    const timeline = getTimeline(db, person.id);
    expect(timeline).not.toBeNull();
    expect(timeline!.length).toBeGreaterThanOrEqual(3);

    // Should be sorted chronologically
    expect(timeline![0].event.date_value).toBe('1840-01-01');
    expect(timeline![0].relationship_label).toBeNull(); // own event

    expect(timeline![1].event.date_value).toBe('1845-06-15');
    expect(timeline![1].relationship_label).toBe('spouse');

    expect(timeline![2].event.date_value).toBe('1870-03-20');
    expect(timeline![2].relationship_label).toBe('child');
  });
});

describe('getAliveInYear', () => {
  function addBirth(personId: string, year: number, placeName?: string) {
    const placeId = placeName ? findOrCreatePlace(db, placeName).id : undefined;
    const event = createEvent(db, {
      event_type: 'birth',
      date_type: 'exact',
      date_value: `${year}-01-01`,
      place_id: placeId,
    });
    addEventParticipant(db, { event_id: event.id, person_id: personId, role: 'primary' });
  }
  function addDeath(personId: string, year: number) {
    const event = createEvent(db, {
      event_type: 'death',
      date_type: 'exact',
      date_value: `${year}-12-31`,
    });
    addEventParticipant(db, { event_id: event.id, person_id: personId, role: 'primary' });
  }

  it('returns persons with known birth and death bracketing the target year', () => {
    const p = createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Andersson' });
    addBirth(p.id, 1850);
    addDeath(p.id, 1920);
    const result = getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(true);
    expect(result.persons.find(x => x.id === p.id)?.age).toBe(50);
  });

  it('excludes persons born after the target year', () => {
    const p = createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Svensson' });
    addBirth(p.id, 1920);
    addDeath(p.id, 1990);
    const result = getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(false);
  });

  it('excludes persons who died before the target year', () => {
    const p = createPerson(db, { sex: 'M', given_name: 'Johan', surname: 'Nilsson' });
    addBirth(p.id, 1800);
    addDeath(p.id, 1890);
    const result = getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(false);
  });

  it('includes persons with birth but no death if birth is before target year', () => {
    const p = createPerson(db, { sex: 'F', given_name: 'Kristina', surname: 'Larsson' });
    addBirth(p.id, 1850);
    const result = getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(true);
  });

  it('excludes persons with only death if death is after 110 years from target year', () => {
    const p = createPerson(db, { sex: 'M', given_name: 'Sven', surname: 'Eriksson' });
    addDeath(p.id, 2050);
    const result = getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(false);
  });

  it('includes persons with neither birth nor death if they have events in target year', () => {
    const p = createPerson(db, { sex: 'M', given_name: 'Olof', surname: 'Persson' });
    const event = createEvent(db, {
      event_type: 'census',
      date_type: 'exact',
      date_value: '1900-06-15',
    });
    addEventParticipant(db, { event_id: event.id, person_id: p.id, role: 'primary' });
    const result = getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(true);
  });

  it('groups persons by family unit (couple relationships)', () => {
    const husband = createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Andersson' });
    const wife = createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Andersson' });
    const child = createPerson(db, { sex: 'F', given_name: 'Maja', surname: 'Andersson' });
    addBirth(husband.id, 1850);
    addBirth(wife.id, 1855);
    addBirth(child.id, 1880);

    const couple = createRelationship(db, { type: 'couple', person1_id: husband.id, person2_id: wife.id });
    createRelationship(db, { type: 'parent_child', person1_id: husband.id, person2_id: child.id });
    createRelationship(db, { type: 'parent_child', person1_id: wife.id, person2_id: child.id });

    const result = getAliveInYear(db, 1900);
    const family = result.families.find(f => f.relationshipId === couple.id);
    expect(family).toBeDefined();
    expect(family?.parents.map(p => p.id).sort()).toEqual([husband.id, wife.id].sort());
    expect(family?.children.map(c => c.id)).toContain(child.id);
  });

  it('returns place name from latest pre-target-year event with a place', () => {
    const p = createPerson(db, { sex: 'M', given_name: 'Lars', surname: 'Gustafsson' });
    addBirth(p.id, 1850, 'Ödeshög');
    const place = findOrCreatePlace(db, 'Stockholm');
    const event = createEvent(db, {
      event_type: 'residence',
      date_type: 'exact',
      date_value: '1895-01-01',
      place_id: place.id,
    });
    addEventParticipant(db, { event_id: event.id, person_id: p.id, role: 'primary' });
    const result = getAliveInYear(db, 1900);
    expect(result.persons.find(x => x.id === p.id)?.placeName).toBe('Stockholm');
  });
});
