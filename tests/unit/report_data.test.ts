import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createRelationship, addEventParticipant } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { createPlace, findOrCreatePlace } from '../../src/api/places';
import { createSource, createCitation } from '../../src/api/sources';
import { createGroup, addGroupLink } from '../../src/api/groups';
import { createResearchTask, addTaskLink } from '../../src/api/research_tasks';
import {
  getPersonSummary,
  getFamilyUnit,
  getAncestorTree,
  getPlaceHistory,
  getResearchGaps,
  getTimeline,
  getAliveInYear,
} from '../../src/api/report_data';
import type { TimelineRelationshipLabel } from '../../src/api/report_data';
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
    addGroupLink(db, group.id, 'person', person.id);

    const rt = createResearchTask(db, { task: 'Find death record' });
    addTaskLink(db, rt.id, 'person', person.id);

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
    // Living is now derived from birth/death events: an old birth (>120y ago) without
    // a death event is presumed deceased.
    const person = createPerson(db, { given_name: 'Nils', surname: 'Karlsson', sex: 'M' });
    const birth = createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
    addEventParticipant(db, { event_id: birth.id, person_id: person.id });
    const event = createEvent(db, { event_type: 'census', date_original: '1880' });
    addEventParticipant(db, { event_id: event.id, person_id: person.id });

    const gaps = getResearchGaps(db, person.id);
    expect(gaps).not.toBeNull();
    expect(gaps!.missing_birth).toBe(false);
    expect(gaps!.missing_death).toBe(true);
    expect(gaps!.missing_parents).toBe(true);
    expect(gaps!.unsourced_events).toHaveLength(2);
    expect(gaps!.events_without_places).toHaveLength(2);
  });

  it('does not flag death as missing for living person', () => {
    const person = createPerson(db, { given_name: 'Eva', surname: 'Lindgren', sex: 'F' });

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

  it('omits non-family relationship types (godparent / other) from the life timeline', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
    const other = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M' });
    createRelationship(db, { type: 'godparent', person1_id: person.id, person2_id: other.id });

    const otherBirth = createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
    addEventParticipant(db, { event_id: otherBirth.id, person_id: other.id });

    const timeline = getTimeline(db, person.id);
    expect(timeline).not.toBeNull();
    // Godparent relationships are not part of the subject's life story — Erik's
    // events should not appear in Anna's timeline.
    const otherEntry = timeline!.find(e => e.person_id === other.id);
    expect(otherEntry).toBeUndefined();
  });

  it('labels parent_child correctly when person is the parent', () => {
    // Task 4: child sex 'M' → label 'son'.
    const parent = createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
    const child = createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });

    const childBirth = createEvent(db, { event_type: 'birth', date_value: '1870-01-01', date_original: '1870' });
    addEventParticipant(db, { event_id: childBirth.id, person_id: child.id });

    const timeline = getTimeline(db, parent.id);
    expect(timeline).not.toBeNull();
    const childEntry = timeline!.find(e => e.relationship_label === 'son');
    expect(childEntry).toBeDefined();
    expect(childEntry!.person_given_name).toBe('Erik');
  });

  it('emits sex-derived parent label when person is the child (parent dies during lifetime)', () => {
    // Task 3: parents emit only 'death' events with label derived from sex.
    // Use sex 'U' here so the label falls through to the generic 'parent'.
    const parent = createPerson(db, { given_name: 'Pat', surname: 'Eriksson', sex: 'U' });
    const child = createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });

    // Child lifetime: 1870 → 1940. Parent dies 1880 (during lifetime).
    const childBirth = createEvent(db, { event_type: 'birth', date_value: '1870-01-01', date_original: '1870' });
    addEventParticipant(db, { event_id: childBirth.id, person_id: child.id });
    const childDeath = createEvent(db, { event_type: 'death', date_value: '1940-01-01', date_original: '1940' });
    addEventParticipant(db, { event_id: childDeath.id, person_id: child.id });
    const parentDeath = createEvent(db, { event_type: 'death', date_value: '1880-05-15', date_original: '1880' });
    addEventParticipant(db, { event_id: parentDeath.id, person_id: parent.id });

    const timeline = getTimeline(db, child.id);
    expect(timeline).not.toBeNull();
    const parentEntry = timeline!.find(e => e.relationship_label === 'parent');
    expect(parentEntry).toBeDefined();
    expect(parentEntry!.person_given_name).toBe('Pat');
    expect(parentEntry!.event.event_type).toBe('death');
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
    expect(timeline![0].relationship_label).toBe('self'); // own event

    expect(timeline![1].event.date_value).toBe('1845-06-15');
    expect(timeline![1].relationship_label).toBe('spouse');

    expect(timeline![2].event.date_value).toBe('1870-03-20');
    // Task 4: child sex 'M' → 'son'.
    expect(timeline![2].relationship_label).toBe('son');
  });

  describe('getTimeline relationship_label vocabulary', () => {
    it('emits stable labels for parent/spouse/child/sibling and own', () => {
      const subject = createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
      const father = createPerson(db, { given_name: 'Per', surname: 'Test', sex: 'M' });
      const mother = createPerson(db, { given_name: 'Maja', surname: 'Test', sex: 'F' });
      const spouse = createPerson(db, { given_name: 'Erik', surname: 'Other', sex: 'M' });
      const child = createPerson(db, { given_name: 'Lars', surname: 'Other', sex: 'M' });
      const sibling = createPerson(db, { given_name: 'Karin', surname: 'Test', sex: 'F' });

      // father / mother → parent_child where SUBJECT is person2_id (i.e. parent is "other")
      createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: subject.id });
      createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: subject.id });
      // spouse
      createRelationship(db, { type: 'couple', person1_id: subject.id, person2_id: spouse.id });
      // child → parent_child where SUBJECT is person1_id
      createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: child.id });
      // sibling
      createRelationship(db, { type: 'sibling', person1_id: subject.id, person2_id: sibling.id });

      // own event
      const ownBirth = createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
      addEventParticipant(db, { event_id: ownBirth.id, person_id: subject.id });
      // father death (within subject's lifetime — relevant family event)
      const fatherDeath = createEvent(db, { event_type: 'death', date_value: '1880-04-10', date_original: '1880' });
      addEventParticipant(db, { event_id: fatherDeath.id, person_id: father.id });
      // mother death (within subject's lifetime)
      const motherDeath = createEvent(db, { event_type: 'death', date_value: '1885-08-22', date_original: '1885' });
      addEventParticipant(db, { event_id: motherDeath.id, person_id: mother.id });
      // spouse death (within subject's lifetime)
      const spouseDeath = createEvent(db, { event_type: 'death', date_value: '1890-02-14', date_original: '1890' });
      addEventParticipant(db, { event_id: spouseDeath.id, person_id: spouse.id });
      // child birth (within subject's lifetime)
      const childBirth = createEvent(db, { event_type: 'birth', date_value: '1875-01-01', date_original: '1875' });
      addEventParticipant(db, { event_id: childBirth.id, person_id: child.id });
      // sibling birth (within subject's lifetime)
      const siblingBirth = createEvent(db, { event_type: 'birth', date_value: '1852-01-01', date_original: '1852' });
      addEventParticipant(db, { event_id: siblingBirth.id, person_id: sibling.id });

      const timeline = getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();

      const allowed: Array<TimelineRelationshipLabel> = [
        'self',
        'father',
        'mother',
        'parent',
        'spouse',
        'son',
        'daughter',
        'child',
        'sibling',
      ];
      for (const entry of timeline!) {
        expect(allowed).toContain(entry.relationship_label);
      }

      // Self
      const selfEntry = timeline!.find(e => e.person_id === subject.id);
      expect(selfEntry).toBeDefined();
      expect(selfEntry!.relationship_label).toBe('self');

      // Spouse
      const spouseEntry = timeline!.find(e => e.person_id === spouse.id);
      expect(spouseEntry!.relationship_label).toBe('spouse');

      // Sibling
      const siblingEntry = timeline!.find(e => e.person_id === sibling.id);
      expect(siblingEntry!.relationship_label).toBe('sibling');

      // Parent + child labels are within the allowed vocabulary (Tasks 3 & 4 will
      // narrow them to father/mother/son/daughter; for now the existing emissions
      // 'parent' / 'child' must still be members of the typed union).
      const parentEntries = timeline!.filter(e => e.person_id === father.id || e.person_id === mother.id);
      expect(parentEntries.length).toBe(2);
      for (const e of parentEntries) {
        expect(['parent', 'father', 'mother']).toContain(e.relationship_label);
      }
      const childEntry = timeline!.find(e => e.person_id === child.id);
      expect(['child', 'son', 'daughter']).toContain(childEntry!.relationship_label);
    });
  });

  describe('getTimeline lifetime filtering', () => {
    it('drops parent death that occurred before subject birth', () => {
      // subject born 1900; father died 1899 → father death NOT in timeline
      const subject = createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
      const father = createPerson(db, { given_name: 'Per', surname: 'Test', sex: 'M' });
      createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: subject.id });

      const subjectBirth = createEvent(db, { event_type: 'birth', date_value: '1900-01-01', date_original: '1900' });
      addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });

      const fatherDeath = createEvent(db, { event_type: 'death', date_value: '1899-06-15', date_original: '1899' });
      addEventParticipant(db, { event_id: fatherDeath.id, person_id: father.id });

      const timeline = getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();
      const fatherDeathEntry = timeline!.find(
        e => e.person_id === father.id && e.event.event_type === 'death'
      );
      expect(fatherDeathEntry).toBeUndefined();
    });

    it('keeps child birth up to 9 months after subject death', () => {
      // subject died 1880-03-15; child born 1880-12-10 → child birth IS in timeline
      // subject died 1880-03-15; child born 1881-01-15 → child birth NOT in timeline
      const subject = createPerson(db, { given_name: 'Per', surname: 'Test', sex: 'M' });
      const childInWindow = createPerson(db, { given_name: 'InWindow', surname: 'Test', sex: 'M' });
      const childOutsideWindow = createPerson(db, { given_name: 'Outside', surname: 'Test', sex: 'M' });
      createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: childInWindow.id });
      createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: childOutsideWindow.id });

      const subjectBirth = createEvent(db, { event_type: 'birth', date_value: '1830-01-01', date_original: '1830' });
      addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = createEvent(db, { event_type: 'death', date_value: '1880-03-15', date_original: '1880' });
      addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      const inBirth = createEvent(db, { event_type: 'birth', date_value: '1880-12-10', date_original: '1880' });
      addEventParticipant(db, { event_id: inBirth.id, person_id: childInWindow.id });

      const outBirth = createEvent(db, { event_type: 'birth', date_value: '1881-01-15', date_original: '1881' });
      addEventParticipant(db, { event_id: outBirth.id, person_id: childOutsideWindow.id });

      const timeline = getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();

      const inWindowEntry = timeline!.find(
        e => e.person_id === childInWindow.id && e.event.event_type === 'birth'
      );
      expect(inWindowEntry).toBeDefined();

      const outsideWindowEntry = timeline!.find(
        e => e.person_id === childOutsideWindow.id && e.event.event_type === 'birth'
      );
      expect(outsideWindowEntry).toBeUndefined();
    });

    it('drops spouse death that occurred after subject death', () => {
      const subject = createPerson(db, { given_name: 'Per', surname: 'Test', sex: 'M' });
      const spouse = createPerson(db, { given_name: 'Maja', surname: 'Test', sex: 'F' });
      createRelationship(db, { type: 'couple', person1_id: subject.id, person2_id: spouse.id });

      const subjectBirth = createEvent(db, { event_type: 'birth', date_value: '1830-01-01', date_original: '1830' });
      addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = createEvent(db, { event_type: 'death', date_value: '1880-03-15', date_original: '1880' });
      addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      const spouseDeath = createEvent(db, { event_type: 'death', date_value: '1890-05-20', date_original: '1890' });
      addEventParticipant(db, { event_id: spouseDeath.id, person_id: spouse.id });

      const timeline = getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();
      const spouseDeathEntry = timeline!.find(
        e => e.person_id === spouse.id && e.event.event_type === 'death'
      );
      expect(spouseDeathEntry).toBeUndefined();
    });

    it('drops child death that occurred after subject death', () => {
      const subject = createPerson(db, { given_name: 'Per', surname: 'Test', sex: 'M' });
      const child = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M' });
      createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: child.id });

      const subjectBirth = createEvent(db, { event_type: 'birth', date_value: '1830-01-01', date_original: '1830' });
      addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = createEvent(db, { event_type: 'death', date_value: '1880-03-15', date_original: '1880' });
      addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      const childDeath = createEvent(db, { event_type: 'death', date_value: '1900-07-04', date_original: '1900' });
      addEventParticipant(db, { event_id: childDeath.id, person_id: child.id });

      const timeline = getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();
      const childDeathEntry = timeline!.find(
        e => e.person_id === child.id && e.event.event_type === 'death'
      );
      expect(childDeathEntry).toBeUndefined();
    });
  });

  describe('getTimeline parent deaths', () => {
    it('emits father/mother labels and parent deaths within subject lifetime', () => {
      // Subject (child) with two parents — one male, one female.
      // Subject lifetime: 1870-01-01 → 1940-12-31.
      const subject = createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });
      const father = createPerson(db, { given_name: 'Per', surname: 'Andersson', sex: 'M' });
      const mother = createPerson(db, { given_name: 'Maria', surname: 'Larsdotter', sex: 'F' });
      createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: subject.id });
      createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: subject.id });

      const subjectBirth = createEvent(db, { event_type: 'birth', date_value: '1870-01-01', date_original: '1870' });
      addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = createEvent(db, { event_type: 'death', date_value: '1940-12-31', date_original: '1940' });
      addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      // Both parents die during subject's lifetime.
      const fatherDeath = createEvent(db, { event_type: 'death', date_value: '1900-06-01', date_original: '1900' });
      addEventParticipant(db, { event_id: fatherDeath.id, person_id: father.id });
      const motherDeath = createEvent(db, { event_type: 'death', date_value: '1910-08-15', date_original: '1910' });
      addEventParticipant(db, { event_id: motherDeath.id, person_id: mother.id });

      // Father has a birth event during lifetime — must NOT appear (narrowed to death only).
      // Note: lifetime constraint requires the event to be within subject's life,
      // so use a birth date that falls within 1870-1940.
      const fatherBirthDuringLifetime = createEvent(db, {
        event_type: 'birth',
        date_value: '1875-03-03',
        date_original: '1875',
      });
      addEventParticipant(db, { event_id: fatherBirthDuringLifetime.id, person_id: father.id });

      const timeline = getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();

      const fatherEntry = timeline!.find(e => e.person_id === father.id);
      expect(fatherEntry).toBeDefined();
      expect(fatherEntry!.relationship_label).toBe('father');
      expect(fatherEntry!.event.event_type).toBe('death');

      const motherEntry = timeline!.find(e => e.person_id === mother.id);
      expect(motherEntry).toBeDefined();
      expect(motherEntry!.relationship_label).toBe('mother');
      expect(motherEntry!.event.event_type).toBe('death');

      // Parent BIRTH event within subject's lifetime must NOT be on the timeline.
      const fatherBirthEntry = timeline!.find(
        e => e.person_id === father.id && e.event.event_type === 'birth',
      );
      expect(fatherBirthEntry).toBeUndefined();
    });

    it('labels parent with sex U as "parent" when they die during subject lifetime', () => {
      const subject = createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
      const unknownParent = createPerson(db, { given_name: 'Pat', surname: 'Test', sex: 'U' });
      createRelationship(db, {
        type: 'parent_child',
        person1_id: unknownParent.id,
        person2_id: subject.id,
      });

      const subjectBirth = createEvent(db, { event_type: 'birth', date_value: '1880-01-01', date_original: '1880' });
      addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = createEvent(db, { event_type: 'death', date_value: '1950-01-01', date_original: '1950' });
      addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });
      const parentDeath = createEvent(db, { event_type: 'death', date_value: '1900-01-01', date_original: '1900' });
      addEventParticipant(db, { event_id: parentDeath.id, person_id: unknownParent.id });

      const timeline = getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();
      const parentEntry = timeline!.find(e => e.person_id === unknownParent.id);
      expect(parentEntry).toBeDefined();
      expect(parentEntry!.relationship_label).toBe('parent');
      expect(parentEntry!.event.event_type).toBe('death');
    });
  });

  describe('getTimeline children events', () => {
    it('emits child birth with sex-typed label and posthumous window', () => {
      // Subject: born 1850-01-01, died 1880-03-15
      const subject = createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
      const subjectBirth = createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
      addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = createEvent(db, { event_type: 'death', date_value: '1880-03-15', date_original: '1880' });
      addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      // Child A (son, M): born 1875-06-01 → IN timeline, label 'son'
      const son = createPerson(db, { given_name: 'Anders', surname: 'Persson', sex: 'M' });
      createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: son.id });
      const sonBirth = createEvent(db, { event_type: 'birth', date_value: '1875-06-01', date_original: '1875' });
      addEventParticipant(db, { event_id: sonBirth.id, person_id: son.id });

      // Child B (daughter, F): born 1880-12-10 (within +9mo of subject death) → IN, 'daughter'
      const daughter = createPerson(db, { given_name: 'Sara', surname: 'Persdotter', sex: 'F' });
      createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: daughter.id });
      const daughterBirth = createEvent(db, { event_type: 'birth', date_value: '1880-12-10', date_original: '1880' });
      addEventParticipant(db, { event_id: daughterBirth.id, person_id: daughter.id });

      // Child C (sex U): born 1881-01-15 (>9mo posthumous) → NOT in timeline
      const childU = createPerson(db, { given_name: 'Pat', surname: 'Persson', sex: 'U' });
      createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: childU.id });
      const childUBirth = createEvent(db, { event_type: 'birth', date_value: '1881-01-15', date_original: '1881' });
      addEventParticipant(db, { event_id: childUBirth.id, person_id: childU.id });

      const timeline = getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();

      const sonEntry = timeline!.find(e => e.person_id === son.id);
      expect(sonEntry).toBeDefined();
      expect(sonEntry!.relationship_label).toBe('son');
      expect(sonEntry!.event.event_type).toBe('birth');

      const daughterEntry = timeline!.find(e => e.person_id === daughter.id);
      expect(daughterEntry).toBeDefined();
      expect(daughterEntry!.relationship_label).toBe('daughter');
      expect(daughterEntry!.event.event_type).toBe('birth');

      const childUEntry = timeline!.find(e => e.person_id === childU.id);
      expect(childUEntry).toBeUndefined();
    });

    it('emits child death within subject lifetime, NOT in posthumous window', () => {
      // Task 5: child deaths use the STRICT death upper bound — the +9mo
      // posthumous window applies only to births and foster_placements.
      const subject = createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
      const subjectBirth = createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
      addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = createEvent(db, { event_type: 'death', date_value: '1880-03-15', date_original: '1880' });
      addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      // Child A (son): died 1879 → IN timeline, label 'son'
      const sonInLifetime = createPerson(db, { given_name: 'Anders', surname: 'Persson', sex: 'M' });
      createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: sonInLifetime.id });
      const sonInLifetimeBirth = createEvent(db, { event_type: 'birth', date_value: '1872-01-01', date_original: '1872' });
      addEventParticipant(db, { event_id: sonInLifetimeBirth.id, person_id: sonInLifetime.id });
      const sonInLifetimeDeath = createEvent(db, { event_type: 'death', date_value: '1879-08-12', date_original: '1879' });
      addEventParticipant(db, { event_id: sonInLifetimeDeath.id, person_id: sonInLifetime.id });

      // Child B (daughter): died 1880-06-01 (after subject death, within +9mo) → NOT in timeline
      const daughterPosthumous = createPerson(db, { given_name: 'Sara', surname: 'Persdotter', sex: 'F' });
      createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: daughterPosthumous.id });
      const daughterPosthumousBirth = createEvent(db, { event_type: 'birth', date_value: '1875-01-01', date_original: '1875' });
      addEventParticipant(db, { event_id: daughterPosthumousBirth.id, person_id: daughterPosthumous.id });
      const daughterPosthumousDeath = createEvent(db, { event_type: 'death', date_value: '1880-06-01', date_original: '1880' });
      addEventParticipant(db, { event_id: daughterPosthumousDeath.id, person_id: daughterPosthumous.id });

      // Child C: died 1882 → NOT in timeline
      const sonAfter = createPerson(db, { given_name: 'Lars', surname: 'Persson', sex: 'M' });
      createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: sonAfter.id });
      const sonAfterBirth = createEvent(db, { event_type: 'birth', date_value: '1876-01-01', date_original: '1876' });
      addEventParticipant(db, { event_id: sonAfterBirth.id, person_id: sonAfter.id });
      const sonAfterDeath = createEvent(db, { event_type: 'death', date_value: '1882-04-04', date_original: '1882' });
      addEventParticipant(db, { event_id: sonAfterDeath.id, person_id: sonAfter.id });

      const timeline = getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();

      const inLifetimeDeathEntry = timeline!.find(
        e => e.person_id === sonInLifetime.id && e.event.event_type === 'death',
      );
      expect(inLifetimeDeathEntry).toBeDefined();
      expect(inLifetimeDeathEntry!.relationship_label).toBe('son');

      const posthumousDeathEntry = timeline!.find(
        e => e.person_id === daughterPosthumous.id && e.event.event_type === 'death',
      );
      expect(posthumousDeathEntry).toBeUndefined();

      const afterDeathEntry = timeline!.find(
        e => e.person_id === sonAfter.id && e.event.event_type === 'death',
      );
      expect(afterDeathEntry).toBeUndefined();
    });

    it('excludes child christening and burial events (narrowed to birth + foster_placement + death)', () => {
      const subject = createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
      const subjectBirth = createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
      addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = createEvent(db, { event_type: 'death', date_value: '1900-12-31', date_original: '1900' });
      addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      const child = createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });
      createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: child.id });

      const childChristening = createEvent(db, { event_type: 'christening', date_value: '1875-02-01', date_original: '1875' });
      addEventParticipant(db, { event_id: childChristening.id, person_id: child.id });
      const childBurial = createEvent(db, { event_type: 'burial', date_value: '1880-09-09', date_original: '1880' });
      addEventParticipant(db, { event_id: childBurial.id, person_id: child.id });

      const timeline = getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();
      expect(timeline!.find(e => e.person_id === child.id && e.event.event_type === 'christening')).toBeUndefined();
      expect(timeline!.find(e => e.person_id === child.id && e.event.event_type === 'burial')).toBeUndefined();
    });

    it('emits foster_placement as a child birth-equivalent within posthumous window', () => {
      // Subject alive (born 1850, died 1880-03-15); foster_placement during lifetime → IN timeline.
      const subject = createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
      const subjectBirth = createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
      addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = createEvent(db, { event_type: 'death', date_value: '1880-03-15', date_original: '1880' });
      addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      const fosterDaughter = createPerson(db, { given_name: 'Lina', surname: 'Persdotter', sex: 'F' });
      createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: fosterDaughter.id });
      const fosterEvent = createEvent(db, {
        event_type: 'foster_placement',
        date_value: '1875-04-01',
        date_original: '1875',
      });
      addEventParticipant(db, { event_id: fosterEvent.id, person_id: fosterDaughter.id });

      const timeline = getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();
      const fosterEntry = timeline!.find(
        e => e.person_id === fosterDaughter.id && e.event.event_type === 'foster_placement',
      );
      expect(fosterEntry).toBeDefined();
      expect(fosterEntry!.relationship_label).toBe('daughter');
    });
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
    expect(result.persons.find(x => x.id === p.id)?.placeName).not.toBe('Ödeshög');
  });

  it('places persons without couple relationships in unattached', () => {
    const p = createPerson(db, { sex: 'M', given_name: 'Solo', surname: 'Person' });
    addBirth(p.id, 1850);
    const result = getAliveInYear(db, 1900);
    expect(result.unattached.some(x => x.id === p.id)).toBe(true);
    expect(result.families.every(f =>
      f.parents.every(x => x.id !== p.id) && f.children.every(x => x.id !== p.id)
    )).toBe(true);
  });

  it('includes half-couples with only one known partner', () => {
    const wife = createPerson(db, { sex: 'F', given_name: 'Widow', surname: 'Half' });
    addBirth(wife.id, 1850);
    const couple = createRelationship(db, { type: 'couple', person1_id: wife.id, person2_id: null });
    const result = getAliveInYear(db, 1900);
    const family = result.families.find(f => f.relationshipId === couple.id);
    // Half-couple should still be represented — either as a family with one parent,
    // or in unattached if the implementation chose that. Wife must be in the result.
    const inAnyFamily = result.families.some(f => f.parents.some(p => p.id === wife.id));
    const inUnattached = result.unattached.some(p => p.id === wife.id);
    expect(inAnyFamily || inUnattached).toBe(true);
    if (family) expect(family.parents.some(p => p.id === wife.id)).toBe(true);
  });

  it('exposes the living flag per person', () => {
    const livingP = createPerson(db, { sex: 'F', given_name: 'Alive', surname: 'Now', living: true });
    addBirth(livingP.id, 1985);
    const deceasedP = createPerson(db, { sex: 'M', given_name: 'Passed', surname: 'Away', living: false });
    addBirth(deceasedP.id, 1940);
    addDeath(deceasedP.id, 2010);
    const result = getAliveInYear(db, 2000);
    const alive = result.persons.find(x => x.id === livingP.id);
    const deceased = result.persons.find(x => x.id === deceasedP.id);
    expect(alive?.living).toBe(true);
    expect(deceased?.living).toBe(false);
  });
});
