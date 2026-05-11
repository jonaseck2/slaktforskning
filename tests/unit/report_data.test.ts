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

beforeEach(async () => {
  db = await createTestDb();
});

describe('getPersonSummary', async () => {
  it('returns null for non-existent person', async () => {
    expect(await getPersonSummary(db, 'no-such-id')).toBeNull();
  });

  it('returns complete summary with names, events, relationships, citations', async () => {
    const person = await createPerson(db, { given_name: 'Erik', surname: 'Andersson', sex: 'M' });
    const place = await createPlace(db, { name: 'Stockholm' });
    const birthEvent = await createEvent(db, { event_type: 'birth', date_value: '1850-01-15', date_original: '15 Jan 1850', place_id: place.id });
    await addEventParticipant(db, { event_id: birthEvent.id, person_id: person.id, role: 'primary' });

    const spouse = await createPerson(db, { given_name: 'Anna', surname: 'Svensson', sex: 'F' });
    await createRelationship(db, { type: 'couple', person1_id: person.id, person2_id: spouse.id });

    const source = await createSource(db, { title: 'Church Records' });
    await createCitation(db, { source_id: source.id, person_id: person.id, page: 'p. 42' });

    const group = await createGroup(db, { name: 'Test Group' });
    await addGroupLink(db, group.id, 'person', person.id);

    const rt = await createResearchTask(db, { task: 'Find death record' });
    await addTaskLink(db, rt.id, 'person', person.id);

    const summary = await getPersonSummary(db, person.id);
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

  it('includes event citations in the person summary', async () => {
    const person = await createPerson(db, { given_name: 'Lars', surname: 'Nilsson', sex: 'M' });
    const event = await createEvent(db, { event_type: 'birth', date_original: '1900' });
    await addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const source = await createSource(db, { title: 'Parish Register' });
    await createCitation(db, { source_id: source.id, event_id: event.id });

    const summary = await getPersonSummary(db, person.id);
    expect(summary!.citations).toHaveLength(1);
    expect(summary!.citations[0].source_title).toBe('Parish Register');
  });
});

describe('getFamilyUnit', async () => {
  it('returns null for non-existent relationship', async () => {
    expect(await getFamilyUnit(db, 'no-such-id')).toBeNull();
  });

  it('returns couple with children', async () => {
    const father = await createPerson(db, { given_name: 'Per', surname: 'Johansson', sex: 'M' });
    const mother = await createPerson(db, { given_name: 'Maria', surname: 'Eriksdotter', sex: 'F' });
    const couple = await createRelationship(db, { type: 'couple', person1_id: father.id, person2_id: mother.id });

    await createEvent(db, { event_type: 'marriage', relationship_id: couple.id, date_original: '1870' });

    const child = await createPerson(db, { given_name: 'Johan', surname: 'Persson', sex: 'M' });
    await createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: child.id });
    await createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: child.id });

    const childBirth = await createEvent(db, { event_type: 'birth', date_original: '1871' });
    await addEventParticipant(db, { event_id: childBirth.id, person_id: child.id });

    const unit = await getFamilyUnit(db, couple.id);
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

describe('getAncestorTree', async () => {
  it('returns null for non-existent person', async () => {
    expect(await getAncestorTree(db, 'no-such-id')).toBeNull();
  });

  it('builds a 2-generation tree', async () => {
    const child = await createPerson(db, { given_name: 'Anna', surname: 'Persdotter', sex: 'F' });
    const father = await createPerson(db, { given_name: 'Per', surname: 'Johansson', sex: 'M' });
    const mother = await createPerson(db, { given_name: 'Maria', surname: 'Eriksdotter', sex: 'F' });

    await createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: child.id });
    await createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: child.id });

    const fatherBirth = await createEvent(db, { event_type: 'birth', date_original: '1820' });
    await addEventParticipant(db, { event_id: fatherBirth.id, person_id: father.id });

    const tree = await getAncestorTree(db, child.id, 2);
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

  it('assigns unknown-sex parent to father slot first', async () => {
    const child = await createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
    const parent = await createPerson(db, { given_name: 'Unknown', surname: 'Test', sex: 'U' });
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });

    const tree = await getAncestorTree(db, child.id, 2);
    expect(tree).not.toBeNull();
    expect(tree!.father).not.toBeNull();
    expect(tree!.father!.person.id).toBe(parent.id);
    expect(tree!.mother).toBeNull();
  });

  it('assigns second unknown-sex parent to mother slot', async () => {
    const child = await createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
    const parent1 = await createPerson(db, { given_name: 'Parent1', surname: 'Test', sex: 'U' });
    const parent2 = await createPerson(db, { given_name: 'Parent2', surname: 'Test', sex: 'U' });
    await createRelationship(db, { type: 'parent_child', person1_id: parent1.id, person2_id: child.id });
    await createRelationship(db, { type: 'parent_child', person1_id: parent2.id, person2_id: child.id });

    const tree = await getAncestorTree(db, child.id, 2);
    expect(tree).not.toBeNull();
    expect(tree!.father).not.toBeNull();
    expect(tree!.mother).not.toBeNull();
    const parentIds = [tree!.father!.person.id, tree!.mother!.person.id].sort();
    expect(parentIds).toEqual([parent1.id, parent2.id].sort());
  });

  it('fills mother slot when father already assigned by male parent', async () => {
    const child = await createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
    const father = await createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M' });
    const unknownParent = await createPerson(db, { given_name: 'Other', surname: 'Test', sex: 'U' });
    await createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: child.id });
    await createRelationship(db, { type: 'parent_child', person1_id: unknownParent.id, person2_id: child.id });

    const tree = await getAncestorTree(db, child.id, 2);
    expect(tree).not.toBeNull();
    expect(tree!.father).not.toBeNull();
    expect(tree!.father!.person.id).toBe(father.id);
    expect(tree!.mother).not.toBeNull();
    expect(tree!.mother!.person.id).toBe(unknownParent.id);
  });

  it('respects generation limit of 1', async () => {
    const child = await createPerson(db, { given_name: 'Anna', surname: 'Persdotter', sex: 'F' });
    const father = await createPerson(db, { given_name: 'Per', surname: 'Johansson', sex: 'M' });
    await createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: child.id });

    const tree = await getAncestorTree(db, child.id, 1);
    expect(tree).not.toBeNull();
    expect(tree!.father).toBeNull();
    expect(tree!.mother).toBeNull();
  });
});

describe('getPlaceHistory', async () => {
  it('returns null for non-existent place', async () => {
    expect(await getPlaceHistory(db, 'no-such-id')).toBeNull();
  });

  it('returns events at a place with participants', async () => {
    const place = await createPlace(db, { name: 'Fröderyd' });
    const person = await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });

    const event = await createEvent(db, { event_type: 'birth', place_id: place.id, date_value: '1850-03-12', date_original: '12 Mar 1850' });
    await addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const history = await getPlaceHistory(db, place.id);
    expect(history).not.toBeNull();
    expect(history!.place_name).toBe('Fröderyd');
    expect(history!.events).toHaveLength(1);
    expect(history!.events[0].event.event_type).toBe('birth');
    expect(history!.events[0].participants).toHaveLength(1);
    expect(history!.events[0].participants[0].given_name).toBe('Erik');
    expect(history!.events[0].participants[0].role).toBe('primary');
  });
});

describe('getResearchGaps', async () => {
  it('returns null for non-existent person', async () => {
    expect(await getResearchGaps(db, 'no-such-id')).toBeNull();
  });

  it('identifies missing birth, death, parents, unsourced events', async () => {
    // Living is now derived from birth/death events: an old birth (>120y ago) without
    // a death event is presumed deceased.
    const person = await createPerson(db, { given_name: 'Nils', surname: 'Karlsson', sex: 'M' });
    const birth = await createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
    await addEventParticipant(db, { event_id: birth.id, person_id: person.id });
    const event = await createEvent(db, { event_type: 'census', date_original: '1880' });
    await addEventParticipant(db, { event_id: event.id, person_id: person.id });

    const gaps = await getResearchGaps(db, person.id);
    expect(gaps).not.toBeNull();
    expect(gaps!.missing_birth).toBe(false);
    expect(gaps!.missing_death).toBe(true);
    expect(gaps!.missing_parents).toBe(true);
    expect(gaps!.unsourced_events).toHaveLength(2);
    expect(gaps!.events_without_places).toHaveLength(2);
  });

  it('does not flag death as missing for living person', async () => {
    const person = await createPerson(db, { given_name: 'Eva', surname: 'Lindgren', sex: 'F' });

    const gaps = await getResearchGaps(db, person.id);
    expect(gaps!.missing_death).toBe(false);
  });

  it('does not flag parents as missing when person is child in parent_child', async () => {
    const person = await createPerson(db, { given_name: 'Erik', surname: 'Andersson', sex: 'M' });
    const parent = await createPerson(db, { given_name: 'Anders', surname: 'Nilsson', sex: 'M' });
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: person.id });

    const gaps = await getResearchGaps(db, person.id);
    expect(gaps!.missing_parents).toBe(false);
  });

  it('does not flag sourced events as unsourced', async () => {
    const person = await createPerson(db, { given_name: 'Karin', surname: 'Olsson', sex: 'F' });
    const event = await createEvent(db, { event_type: 'birth', date_original: '1890' });
    await addEventParticipant(db, { event_id: event.id, person_id: person.id });
    const source = await createSource(db, { title: 'Church Book' });
    await createCitation(db, { source_id: source.id, event_id: event.id });

    const gaps = await getResearchGaps(db, person.id);
    expect(gaps!.unsourced_events).toHaveLength(0);
  });
});

describe('getTimeline', async () => {
  it('returns null for non-existent person', async () => {
    expect(await getTimeline(db, 'no-such-id')).toBeNull();
  });

  it('includes sibling death event with correct label when includeSiblingDeaths is set', async () => {
    // Task 7: siblings are excluded from the default timeline. Only sibling
    // deaths within the subject's lifetime appear, and only when the option is
    // explicitly set.
    const person = await createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
    const sibling = await createPerson(db, { given_name: 'Lars', surname: 'Test', sex: 'M' });
    await createRelationship(db, { type: 'sibling', person1_id: person.id, person2_id: sibling.id });

    // Subject lifetime so the sibling death qualifies.
    const subjectBirth = await createEvent(db, { event_type: 'birth', date_value: '1840-01-01', date_original: '1840' });
    await addEventParticipant(db, { event_id: subjectBirth.id, person_id: person.id });
    const subjectDeath = await createEvent(db, { event_type: 'death', date_value: '1900-01-01', date_original: '1900' });
    await addEventParticipant(db, { event_id: subjectDeath.id, person_id: person.id });

    const siblingDeath = await createEvent(db, { event_type: 'death', date_value: '1880-01-01', date_original: '1880' });
    await addEventParticipant(db, { event_id: siblingDeath.id, person_id: sibling.id });

    const timeline = await getTimeline(db, person.id, { includeSiblingDeaths: true });
    expect(timeline).not.toBeNull();
    const siblingEntry = timeline!.find(e => e.relationship_label === 'sibling');
    expect(siblingEntry).toBeDefined();
    expect(siblingEntry!.person_given_name).toBe('Lars');
    expect(siblingEntry!.event.event_type).toBe('death');
  });

  it('omits non-family relationship types (godparent / other) from the life timeline', async () => {
    const person = await createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
    const other = await createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M' });
    await createRelationship(db, { type: 'godparent', person1_id: person.id, person2_id: other.id });

    const otherBirth = await createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
    await addEventParticipant(db, { event_id: otherBirth.id, person_id: other.id });

    const timeline = await getTimeline(db, person.id);
    expect(timeline).not.toBeNull();
    // Godparent relationships are not part of the subject's life story — Erik's
    // events should not appear in Anna's timeline.
    const otherEntry = timeline!.find(e => e.person_id === other.id);
    expect(otherEntry).toBeUndefined();
  });

  it('labels parent_child correctly when person is the parent', async () => {
    // Task 4: child sex 'M' → label 'son'.
    const parent = await createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
    const child = await createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });

    const childBirth = await createEvent(db, { event_type: 'birth', date_value: '1870-01-01', date_original: '1870' });
    await addEventParticipant(db, { event_id: childBirth.id, person_id: child.id });

    const timeline = await getTimeline(db, parent.id);
    expect(timeline).not.toBeNull();
    const childEntry = timeline!.find(e => e.relationship_label === 'son');
    expect(childEntry).toBeDefined();
    expect(childEntry!.person_given_name).toBe('Erik');
  });

  it('emits sex-derived parent label when person is the child (parent dies during lifetime)', async () => {
    // Task 3: parents emit only 'death' events with label derived from sex.
    // Use sex 'U' here so the label falls through to the generic 'parent'.
    const parent = await createPerson(db, { given_name: 'Pat', surname: 'Eriksson', sex: 'U' });
    const child = await createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });

    // Child lifetime: 1870 → 1940. Parent dies 1880 (during lifetime).
    const childBirth = await createEvent(db, { event_type: 'birth', date_value: '1870-01-01', date_original: '1870' });
    await addEventParticipant(db, { event_id: childBirth.id, person_id: child.id });
    const childDeath = await createEvent(db, { event_type: 'death', date_value: '1940-01-01', date_original: '1940' });
    await addEventParticipant(db, { event_id: childDeath.id, person_id: child.id });
    const parentDeath = await createEvent(db, { event_type: 'death', date_value: '1880-05-15', date_original: '1880' });
    await addEventParticipant(db, { event_id: parentDeath.id, person_id: parent.id });

    const timeline = await getTimeline(db, child.id);
    expect(timeline).not.toBeNull();
    const parentEntry = timeline!.find(e => e.relationship_label === 'parent');
    expect(parentEntry).toBeDefined();
    expect(parentEntry!.person_given_name).toBe('Pat');
    expect(parentEntry!.event.event_type).toBe('death');
  });

  it('sorts entries with null date_value using empty string fallback', async () => {
    const person = await createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
    const ev1 = await createEvent(db, { event_type: 'birth', date_value: '1850-01-01' });
    await addEventParticipant(db, { event_id: ev1.id, person_id: person.id });
    const ev2 = await createEvent(db, { event_type: 'census' }); // no date_value
    await addEventParticipant(db, { event_id: ev2.id, person_id: person.id });

    const timeline = await getTimeline(db, person.id);
    expect(timeline).not.toBeNull();
    expect(timeline!.length).toBe(2);
    // Empty string sorts before '1850...', so undated comes first
    expect(timeline![0].event.event_type).toBe('census');
    expect(timeline![1].event.date_value).toBe('1850-01-01');
  });

  it('returns person events and family events merged chronologically', async () => {
    // After Task 6: spouse births are excluded (only spouse deaths emitted).
    // After Task 4: child events get sex-typed labels.
    const person = await createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
    const spouse = await createPerson(db, { given_name: 'Maja', surname: 'Larsdotter', sex: 'F' });
    await createRelationship(db, { type: 'couple', person1_id: person.id, person2_id: spouse.id });

    // Person birth
    const personBirth = await createEvent(db, { event_type: 'birth', date_value: '1840-01-01', date_original: '1840' });
    await addEventParticipant(db, { event_id: personBirth.id, person_id: person.id });

    // Spouse birth (excluded post-Task-6 — spouse only emits deaths)
    const spouseBirth = await createEvent(db, { event_type: 'birth', date_value: '1845-06-15', date_original: '1845' });
    await addEventParticipant(db, { event_id: spouseBirth.id, person_id: spouse.id });

    // Child (sex M → 'son' post-Task-4)
    const child = await createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });
    await createRelationship(db, { type: 'parent_child', person1_id: person.id, person2_id: child.id });

    const childBirth = await createEvent(db, { event_type: 'birth', date_value: '1870-03-20', date_original: '1870' });
    await addEventParticipant(db, { event_id: childBirth.id, person_id: child.id });

    const timeline = await getTimeline(db, person.id);
    expect(timeline).not.toBeNull();

    // Spouse birth is excluded; expect own birth + child birth.
    expect(timeline!.length).toBe(2);
    expect(timeline!.find(e => e.person_id === spouse.id)).toBeUndefined();

    // Should be sorted chronologically
    expect(timeline![0].event.date_value).toBe('1840-01-01');
    expect(timeline![0].relationship_label).toBe('self'); // own event

    expect(timeline![1].event.date_value).toBe('1870-03-20');
    expect(timeline![1].relationship_label).toBe('son');
  });

  describe('getTimeline relationship_label vocabulary', async () => {
    it('emits stable labels for parent/spouse/child/sibling and own', async () => {
      const subject = await createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
      const father = await createPerson(db, { given_name: 'Per', surname: 'Test', sex: 'M' });
      const mother = await createPerson(db, { given_name: 'Maja', surname: 'Test', sex: 'F' });
      const spouse = await createPerson(db, { given_name: 'Erik', surname: 'Other', sex: 'M' });
      const child = await createPerson(db, { given_name: 'Lars', surname: 'Other', sex: 'M' });
      const sibling = await createPerson(db, { given_name: 'Karin', surname: 'Test', sex: 'F' });

      // father / mother → parent_child where SUBJECT is person2_id (i.e. parent is "other")
      await createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: subject.id });
      await createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: subject.id });
      // spouse
      await createRelationship(db, { type: 'couple', person1_id: subject.id, person2_id: spouse.id });
      // child → parent_child where SUBJECT is person1_id
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: child.id });
      // sibling
      await createRelationship(db, { type: 'sibling', person1_id: subject.id, person2_id: sibling.id });

      // own event
      const ownBirth = await createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
      await addEventParticipant(db, { event_id: ownBirth.id, person_id: subject.id });
      // father death (within subject's lifetime — relevant family event)
      const fatherDeath = await createEvent(db, { event_type: 'death', date_value: '1880-04-10', date_original: '1880' });
      await addEventParticipant(db, { event_id: fatherDeath.id, person_id: father.id });
      // mother death (within subject's lifetime)
      const motherDeath = await createEvent(db, { event_type: 'death', date_value: '1885-08-22', date_original: '1885' });
      await addEventParticipant(db, { event_id: motherDeath.id, person_id: mother.id });
      // spouse death (within subject's lifetime)
      const spouseDeath = await createEvent(db, { event_type: 'death', date_value: '1890-02-14', date_original: '1890' });
      await addEventParticipant(db, { event_id: spouseDeath.id, person_id: spouse.id });
      // child birth (within subject's lifetime)
      const childBirth = await createEvent(db, { event_type: 'birth', date_value: '1875-01-01', date_original: '1875' });
      await addEventParticipant(db, { event_id: childBirth.id, person_id: child.id });
      // sibling death (within subject's lifetime) — Task 7: siblings only
      // appear at all when includeSiblingDeaths is set, and only deaths.
      const siblingDeath = await createEvent(db, { event_type: 'death', date_value: '1880-01-01', date_original: '1880' });
      await addEventParticipant(db, { event_id: siblingDeath.id, person_id: sibling.id });

      const timeline = await getTimeline(db, subject.id, { includeSiblingDeaths: true });
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

  describe('getTimeline lifetime filtering', async () => {
    it('drops parent death that occurred before subject birth', async () => {
      // subject born 1900; father died 1899 → father death NOT in timeline
      const subject = await createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
      const father = await createPerson(db, { given_name: 'Per', surname: 'Test', sex: 'M' });
      await createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: subject.id });

      const subjectBirth = await createEvent(db, { event_type: 'birth', date_value: '1900-01-01', date_original: '1900' });
      await addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });

      const fatherDeath = await createEvent(db, { event_type: 'death', date_value: '1899-06-15', date_original: '1899' });
      await addEventParticipant(db, { event_id: fatherDeath.id, person_id: father.id });

      const timeline = await getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();
      const fatherDeathEntry = timeline!.find(
        e => e.person_id === father.id && e.event.event_type === 'death'
      );
      expect(fatherDeathEntry).toBeUndefined();
    });

    it('keeps child birth up to 9 months after subject death', async () => {
      // subject died 1880-03-15; child born 1880-12-10 → child birth IS in timeline
      // subject died 1880-03-15; child born 1881-01-15 → child birth NOT in timeline
      const subject = await createPerson(db, { given_name: 'Per', surname: 'Test', sex: 'M' });
      const childInWindow = await createPerson(db, { given_name: 'InWindow', surname: 'Test', sex: 'M' });
      const childOutsideWindow = await createPerson(db, { given_name: 'Outside', surname: 'Test', sex: 'M' });
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: childInWindow.id });
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: childOutsideWindow.id });

      const subjectBirth = await createEvent(db, { event_type: 'birth', date_value: '1830-01-01', date_original: '1830' });
      await addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = await createEvent(db, { event_type: 'death', date_value: '1880-03-15', date_original: '1880' });
      await addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      const inBirth = await createEvent(db, { event_type: 'birth', date_value: '1880-12-10', date_original: '1880' });
      await addEventParticipant(db, { event_id: inBirth.id, person_id: childInWindow.id });

      const outBirth = await createEvent(db, { event_type: 'birth', date_value: '1881-01-15', date_original: '1881' });
      await addEventParticipant(db, { event_id: outBirth.id, person_id: childOutsideWindow.id });

      const timeline = await getTimeline(db, subject.id);
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

    it('drops spouse death that occurred after subject death', async () => {
      const subject = await createPerson(db, { given_name: 'Per', surname: 'Test', sex: 'M' });
      const spouse = await createPerson(db, { given_name: 'Maja', surname: 'Test', sex: 'F' });
      await createRelationship(db, { type: 'couple', person1_id: subject.id, person2_id: spouse.id });

      const subjectBirth = await createEvent(db, { event_type: 'birth', date_value: '1830-01-01', date_original: '1830' });
      await addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = await createEvent(db, { event_type: 'death', date_value: '1880-03-15', date_original: '1880' });
      await addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      const spouseDeath = await createEvent(db, { event_type: 'death', date_value: '1890-05-20', date_original: '1890' });
      await addEventParticipant(db, { event_id: spouseDeath.id, person_id: spouse.id });

      const timeline = await getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();
      const spouseDeathEntry = timeline!.find(
        e => e.person_id === spouse.id && e.event.event_type === 'death'
      );
      expect(spouseDeathEntry).toBeUndefined();
    });

    it('drops child death that occurred after subject death', async () => {
      const subject = await createPerson(db, { given_name: 'Per', surname: 'Test', sex: 'M' });
      const child = await createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M' });
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: child.id });

      const subjectBirth = await createEvent(db, { event_type: 'birth', date_value: '1830-01-01', date_original: '1830' });
      await addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = await createEvent(db, { event_type: 'death', date_value: '1880-03-15', date_original: '1880' });
      await addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      const childDeath = await createEvent(db, { event_type: 'death', date_value: '1900-07-04', date_original: '1900' });
      await addEventParticipant(db, { event_id: childDeath.id, person_id: child.id });

      const timeline = await getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();
      const childDeathEntry = timeline!.find(
        e => e.person_id === child.id && e.event.event_type === 'death'
      );
      expect(childDeathEntry).toBeUndefined();
    });
  });

  describe('getTimeline parent deaths', async () => {
    it('emits father/mother labels and parent deaths within subject lifetime', async () => {
      // Subject (child) with two parents — one male, one female.
      // Subject lifetime: 1870-01-01 → 1940-12-31.
      const subject = await createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });
      const father = await createPerson(db, { given_name: 'Per', surname: 'Andersson', sex: 'M' });
      const mother = await createPerson(db, { given_name: 'Maria', surname: 'Larsdotter', sex: 'F' });
      await createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: subject.id });
      await createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: subject.id });

      const subjectBirth = await createEvent(db, { event_type: 'birth', date_value: '1870-01-01', date_original: '1870' });
      await addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = await createEvent(db, { event_type: 'death', date_value: '1940-12-31', date_original: '1940' });
      await addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      // Both parents die during subject's lifetime.
      const fatherDeath = await createEvent(db, { event_type: 'death', date_value: '1900-06-01', date_original: '1900' });
      await addEventParticipant(db, { event_id: fatherDeath.id, person_id: father.id });
      const motherDeath = await createEvent(db, { event_type: 'death', date_value: '1910-08-15', date_original: '1910' });
      await addEventParticipant(db, { event_id: motherDeath.id, person_id: mother.id });

      // Father has a birth event during lifetime — must NOT appear (narrowed to death only).
      // Note: lifetime constraint requires the event to be within subject's life,
      // so use a birth date that falls within 1870-1940.
      const fatherBirthDuringLifetime = await createEvent(db, {
        event_type: 'birth',
        date_value: '1875-03-03',
        date_original: '1875',
      });
      await addEventParticipant(db, { event_id: fatherBirthDuringLifetime.id, person_id: father.id });

      const timeline = await getTimeline(db, subject.id);
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

    it('labels parent with sex U as "parent" when they die during subject lifetime', async () => {
      const subject = await createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F' });
      const unknownParent = await createPerson(db, { given_name: 'Pat', surname: 'Test', sex: 'U' });
      await createRelationship(db, {
        type: 'parent_child',
        person1_id: unknownParent.id,
        person2_id: subject.id,
      });

      const subjectBirth = await createEvent(db, { event_type: 'birth', date_value: '1880-01-01', date_original: '1880' });
      await addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = await createEvent(db, { event_type: 'death', date_value: '1950-01-01', date_original: '1950' });
      await addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });
      const parentDeath = await createEvent(db, { event_type: 'death', date_value: '1900-01-01', date_original: '1900' });
      await addEventParticipant(db, { event_id: parentDeath.id, person_id: unknownParent.id });

      const timeline = await getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();
      const parentEntry = timeline!.find(e => e.person_id === unknownParent.id);
      expect(parentEntry).toBeDefined();
      expect(parentEntry!.relationship_label).toBe('parent');
      expect(parentEntry!.event.event_type).toBe('death');
    });
  });

  describe('getTimeline children events', async () => {
    it('emits child birth with sex-typed label and posthumous window', async () => {
      // Subject: born 1850-01-01, died 1880-03-15
      const subject = await createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
      const subjectBirth = await createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
      await addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = await createEvent(db, { event_type: 'death', date_value: '1880-03-15', date_original: '1880' });
      await addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      // Child A (son, M): born 1875-06-01 → IN timeline, label 'son'
      const son = await createPerson(db, { given_name: 'Anders', surname: 'Persson', sex: 'M' });
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: son.id });
      const sonBirth = await createEvent(db, { event_type: 'birth', date_value: '1875-06-01', date_original: '1875' });
      await addEventParticipant(db, { event_id: sonBirth.id, person_id: son.id });

      // Child B (daughter, F): born 1880-12-10 (within +9mo of subject death) → IN, 'daughter'
      const daughter = await createPerson(db, { given_name: 'Sara', surname: 'Persdotter', sex: 'F' });
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: daughter.id });
      const daughterBirth = await createEvent(db, { event_type: 'birth', date_value: '1880-12-10', date_original: '1880' });
      await addEventParticipant(db, { event_id: daughterBirth.id, person_id: daughter.id });

      // Child C (sex U): born 1881-01-15 (>9mo posthumous) → NOT in timeline
      const childU = await createPerson(db, { given_name: 'Pat', surname: 'Persson', sex: 'U' });
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: childU.id });
      const childUBirth = await createEvent(db, { event_type: 'birth', date_value: '1881-01-15', date_original: '1881' });
      await addEventParticipant(db, { event_id: childUBirth.id, person_id: childU.id });

      const timeline = await getTimeline(db, subject.id);
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

    it('emits child death within subject lifetime, NOT in posthumous window', async () => {
      // Task 5: child deaths use the STRICT death upper bound — the +9mo
      // posthumous window applies only to births and foster_placements.
      const subject = await createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
      const subjectBirth = await createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
      await addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = await createEvent(db, { event_type: 'death', date_value: '1880-03-15', date_original: '1880' });
      await addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      // Child A (son): died 1879 → IN timeline, label 'son'
      const sonInLifetime = await createPerson(db, { given_name: 'Anders', surname: 'Persson', sex: 'M' });
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: sonInLifetime.id });
      const sonInLifetimeBirth = await createEvent(db, { event_type: 'birth', date_value: '1872-01-01', date_original: '1872' });
      await addEventParticipant(db, { event_id: sonInLifetimeBirth.id, person_id: sonInLifetime.id });
      const sonInLifetimeDeath = await createEvent(db, { event_type: 'death', date_value: '1879-08-12', date_original: '1879' });
      await addEventParticipant(db, { event_id: sonInLifetimeDeath.id, person_id: sonInLifetime.id });

      // Child B (daughter): died 1880-06-01 (after subject death, within +9mo) → NOT in timeline
      const daughterPosthumous = await createPerson(db, { given_name: 'Sara', surname: 'Persdotter', sex: 'F' });
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: daughterPosthumous.id });
      const daughterPosthumousBirth = await createEvent(db, { event_type: 'birth', date_value: '1875-01-01', date_original: '1875' });
      await addEventParticipant(db, { event_id: daughterPosthumousBirth.id, person_id: daughterPosthumous.id });
      const daughterPosthumousDeath = await createEvent(db, { event_type: 'death', date_value: '1880-06-01', date_original: '1880' });
      await addEventParticipant(db, { event_id: daughterPosthumousDeath.id, person_id: daughterPosthumous.id });

      // Child C: died 1882 → NOT in timeline
      const sonAfter = await createPerson(db, { given_name: 'Lars', surname: 'Persson', sex: 'M' });
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: sonAfter.id });
      const sonAfterBirth = await createEvent(db, { event_type: 'birth', date_value: '1876-01-01', date_original: '1876' });
      await addEventParticipant(db, { event_id: sonAfterBirth.id, person_id: sonAfter.id });
      const sonAfterDeath = await createEvent(db, { event_type: 'death', date_value: '1882-04-04', date_original: '1882' });
      await addEventParticipant(db, { event_id: sonAfterDeath.id, person_id: sonAfter.id });

      const timeline = await getTimeline(db, subject.id);
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

    it('excludes child christening and burial events (narrowed to birth + foster_placement + death)', async () => {
      const subject = await createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
      const subjectBirth = await createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
      await addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = await createEvent(db, { event_type: 'death', date_value: '1900-12-31', date_original: '1900' });
      await addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      const child = await createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: child.id });

      const childChristening = await createEvent(db, { event_type: 'christening', date_value: '1875-02-01', date_original: '1875' });
      await addEventParticipant(db, { event_id: childChristening.id, person_id: child.id });
      const childBurial = await createEvent(db, { event_type: 'burial', date_value: '1880-09-09', date_original: '1880' });
      await addEventParticipant(db, { event_id: childBurial.id, person_id: child.id });

      const timeline = await getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();
      expect(timeline!.find(e => e.person_id === child.id && e.event.event_type === 'christening')).toBeUndefined();
      expect(timeline!.find(e => e.person_id === child.id && e.event.event_type === 'burial')).toBeUndefined();
    });

    it('emits foster_placement as a child birth-equivalent within posthumous window', async () => {
      // Subject alive (born 1850, died 1880-03-15); foster_placement during lifetime → IN timeline.
      const subject = await createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
      const subjectBirth = await createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
      await addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = await createEvent(db, { event_type: 'death', date_value: '1880-03-15', date_original: '1880' });
      await addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      const fosterDaughter = await createPerson(db, { given_name: 'Lina', surname: 'Persdotter', sex: 'F' });
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: fosterDaughter.id });
      const fosterEvent = await createEvent(db, {
        event_type: 'foster_placement',
        date_value: '1875-04-01',
        date_original: '1875',
      });
      await addEventParticipant(db, { event_id: fosterEvent.id, person_id: fosterDaughter.id });

      const timeline = await getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();
      const fosterEntry = timeline!.find(
        e => e.person_id === fosterDaughter.id && e.event.event_type === 'foster_placement',
      );
      expect(fosterEntry).toBeDefined();
      expect(fosterEntry!.relationship_label).toBe('daughter');
    });
  });

  describe('getTimeline spouse death', async () => {
    it('emits spouse death only, within subject lifetime; spouse birth excluded', async () => {
      // Task 6: per the user goal "the deaths of their … spouse," spouse
      // events are narrowed to 'death' only.
      const subject = await createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
      const spouse = await createPerson(db, { given_name: 'Maja', surname: 'Larsdotter', sex: 'F' });
      await createRelationship(db, { type: 'couple', person1_id: subject.id, person2_id: spouse.id });

      const subjectBirth = await createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
      await addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = await createEvent(db, { event_type: 'death', date_value: '1900-01-01', date_original: '1900' });
      await addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      // Spouse birth (within subject lifetime by date) — must STILL be excluded
      // by type narrowing.
      const spouseBirth = await createEvent(db, { event_type: 'birth', date_value: '1855-06-15', date_original: '1855' });
      await addEventParticipant(db, { event_id: spouseBirth.id, person_id: spouse.id });
      const spouseDeath = await createEvent(db, { event_type: 'death', date_value: '1880-04-10', date_original: '1880' });
      await addEventParticipant(db, { event_id: spouseDeath.id, person_id: spouse.id });

      const timeline = await getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();

      // Spouse birth excluded by Task 6's relevantTypes narrowing.
      const spouseBirthEntry = timeline!.find(
        e => e.person_id === spouse.id && e.event.event_type === 'birth',
      );
      expect(spouseBirthEntry).toBeUndefined();

      // Spouse death is on the timeline as 'spouse'.
      const spouseDeathEntry = timeline!.find(
        e => e.person_id === spouse.id && e.event.event_type === 'death',
      );
      expect(spouseDeathEntry).toBeDefined();
      expect(spouseDeathEntry!.relationship_label).toBe('spouse');
    });

    it('excludes spouse christening and burial events (narrowed to death only)', async () => {
      const subject = await createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
      const spouse = await createPerson(db, { given_name: 'Maja', surname: 'Larsdotter', sex: 'F' });
      await createRelationship(db, { type: 'couple', person1_id: subject.id, person2_id: spouse.id });

      const subjectBirth = await createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
      await addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = await createEvent(db, { event_type: 'death', date_value: '1900-01-01', date_original: '1900' });
      await addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });

      // Both during subject's lifetime by date — but type is narrowed to 'death' only.
      const spouseChristening = await createEvent(db, { event_type: 'christening', date_value: '1860-02-01', date_original: '1860' });
      await addEventParticipant(db, { event_id: spouseChristening.id, person_id: spouse.id });
      const spouseBurial = await createEvent(db, { event_type: 'burial', date_value: '1880-04-15', date_original: '1880' });
      await addEventParticipant(db, { event_id: spouseBurial.id, person_id: spouse.id });

      const timeline = await getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();
      expect(timeline!.find(e => e.person_id === spouse.id && e.event.event_type === 'christening')).toBeUndefined();
      expect(timeline!.find(e => e.person_id === spouse.id && e.event.event_type === 'burial')).toBeUndefined();
    });
  });

  describe('getTimeline optional categories', async () => {
    async function buildSubjectWithLifetime() {
      // Subject lifetime: 1850-01-01 → 1900-12-31
      const subject = await createPerson(db, { given_name: 'Per', surname: 'Eriksson', sex: 'M' });
      const subjectBirth = await createEvent(db, { event_type: 'birth', date_value: '1850-01-01', date_original: '1850' });
      await addEventParticipant(db, { event_id: subjectBirth.id, person_id: subject.id });
      const subjectDeath = await createEvent(db, { event_type: 'death', date_value: '1900-12-31', date_original: '1900' });
      await addEventParticipant(db, { event_id: subjectDeath.id, person_id: subject.id });
      return subject;
    }

    it('excludes children\'s marriages and sibling deaths by default', async () => {
      const subject = await buildSubjectWithLifetime();

      // Child with a marriage during subject's lifetime
      const child = await createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: child.id });
      const spouseOfChild = await createPerson(db, { given_name: 'Maja', surname: 'Larsdotter', sex: 'F' });
      const childCouple = await createRelationship(db, {
        type: 'couple',
        person1_id: child.id,
        person2_id: spouseOfChild.id,
      });
      const childMarriage = await createEvent(db, {
        event_type: 'marriage',
        date_value: '1880-06-12',
        date_original: '1880',
        relationship_id: childCouple.id,
      });
      await addEventParticipant(db, { event_id: childMarriage.id, person_id: child.id });
      await addEventParticipant(db, { event_id: childMarriage.id, person_id: spouseOfChild.id });

      // Sibling who dies during subject's lifetime
      const sibling = await createPerson(db, { given_name: 'Karin', surname: 'Test', sex: 'F' });
      await createRelationship(db, { type: 'sibling', person1_id: subject.id, person2_id: sibling.id });
      const siblingDeath = await createEvent(db, { event_type: 'death', date_value: '1880-08-08', date_original: '1880' });
      await addEventParticipant(db, { event_id: siblingDeath.id, person_id: sibling.id });

      const timeline = await getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();

      // Child marriage NOT in default timeline.
      const marriageEntry = timeline!.find(e => e.event.event_type === 'marriage');
      expect(marriageEntry).toBeUndefined();

      // Sibling death NOT in default timeline.
      const siblingEntry = timeline!.find(e => e.relationship_label === 'sibling');
      expect(siblingEntry).toBeUndefined();
    });

    it('includes children\'s marriages when includeChildrenMarriages is set', async () => {
      const subject = await buildSubjectWithLifetime();

      const son = await createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: son.id });
      const sonsWife = await createPerson(db, { given_name: 'Maja', surname: 'Larsdotter', sex: 'F' });
      const sonCouple = await createRelationship(db, {
        type: 'couple',
        person1_id: son.id,
        person2_id: sonsWife.id,
      });
      // Marriage during subject lifetime
      const inLifetime = await createEvent(db, {
        event_type: 'marriage',
        date_value: '1880-06-12',
        date_original: '1880',
        relationship_id: sonCouple.id,
      });
      await addEventParticipant(db, { event_id: inLifetime.id, person_id: son.id });
      await addEventParticipant(db, { event_id: inLifetime.id, person_id: sonsWife.id });

      // Daughter with marriage AFTER subject's death — must be excluded.
      const daughter = await createPerson(db, { given_name: 'Sara', surname: 'Persdotter', sex: 'F' });
      await createRelationship(db, { type: 'parent_child', person1_id: subject.id, person2_id: daughter.id });
      const daughterHusband = await createPerson(db, { given_name: 'Anders', surname: 'Other', sex: 'M' });
      const daughterCouple = await createRelationship(db, {
        type: 'couple',
        person1_id: daughter.id,
        person2_id: daughterHusband.id,
      });
      const afterDeath = await createEvent(db, {
        event_type: 'marriage',
        date_value: '1905-04-04',
        date_original: '1905',
        relationship_id: daughterCouple.id,
      });
      await addEventParticipant(db, { event_id: afterDeath.id, person_id: daughter.id });
      await addEventParticipant(db, { event_id: afterDeath.id, person_id: daughterHusband.id });

      const timeline = await getTimeline(db, subject.id, { includeChildrenMarriages: true });
      expect(timeline).not.toBeNull();

      // Son's marriage during subject's lifetime → IN, label 'son'.
      const sonMarriage = timeline!.find(
        e => e.person_id === son.id && e.event.event_type === 'marriage',
      );
      expect(sonMarriage).toBeDefined();
      expect(sonMarriage!.relationship_label).toBe('son');
      expect(sonMarriage!.event.date_value).toBe('1880-06-12');

      // Daughter's marriage after subject's death → NOT in timeline.
      const daughterMarriage = timeline!.find(
        e => e.person_id === daughter.id && e.event.event_type === 'marriage',
      );
      expect(daughterMarriage).toBeUndefined();
    });

    it('includes sibling deaths when includeSiblingDeaths is set', async () => {
      const subject = await buildSubjectWithLifetime();

      // Sibling who dies during subject's lifetime
      const siblingInLife = await createPerson(db, { given_name: 'Karin', surname: 'Test', sex: 'F' });
      await createRelationship(db, { type: 'sibling', person1_id: subject.id, person2_id: siblingInLife.id });
      const inLifetimeDeath = await createEvent(db, {
        event_type: 'death',
        date_value: '1880-08-08',
        date_original: '1880',
      });
      await addEventParticipant(db, { event_id: inLifetimeDeath.id, person_id: siblingInLife.id });
      // Sibling birth + christening + burial during lifetime — must NOT appear
      // even with the option set (sibling emission is narrowed to death only).
      const inLifetimeBirth = await createEvent(db, {
        event_type: 'birth',
        date_value: '1855-01-01',
        date_original: '1855',
      });
      await addEventParticipant(db, { event_id: inLifetimeBirth.id, person_id: siblingInLife.id });
      const inLifetimeChristening = await createEvent(db, {
        event_type: 'christening',
        date_value: '1855-02-01',
        date_original: '1855',
      });
      await addEventParticipant(db, { event_id: inLifetimeChristening.id, person_id: siblingInLife.id });
      const inLifetimeBurial = await createEvent(db, {
        event_type: 'burial',
        date_value: '1880-08-15',
        date_original: '1880',
      });
      await addEventParticipant(db, { event_id: inLifetimeBurial.id, person_id: siblingInLife.id });

      // Sibling who dies AFTER subject's death — must NOT appear.
      const siblingAfter = await createPerson(db, { given_name: 'Lars', surname: 'Test', sex: 'M' });
      await createRelationship(db, { type: 'sibling', person1_id: subject.id, person2_id: siblingAfter.id });
      const afterDeath = await createEvent(db, {
        event_type: 'death',
        date_value: '1910-05-05',
        date_original: '1910',
      });
      await addEventParticipant(db, { event_id: afterDeath.id, person_id: siblingAfter.id });

      const timeline = await getTimeline(db, subject.id, { includeSiblingDeaths: true });
      expect(timeline).not.toBeNull();

      const inLifeEntry = timeline!.find(
        e => e.person_id === siblingInLife.id && e.event.event_type === 'death',
      );
      expect(inLifeEntry).toBeDefined();
      expect(inLifeEntry!.relationship_label).toBe('sibling');

      // Sibling births / christenings / burials are excluded even with the option on.
      expect(timeline!.find(e => e.person_id === siblingInLife.id && e.event.event_type === 'birth')).toBeUndefined();
      expect(timeline!.find(e => e.person_id === siblingInLife.id && e.event.event_type === 'christening')).toBeUndefined();
      expect(timeline!.find(e => e.person_id === siblingInLife.id && e.event.event_type === 'burial')).toBeUndefined();

      // Sibling who died after subject is excluded by lifetime filter.
      expect(timeline!.find(e => e.person_id === siblingAfter.id)).toBeUndefined();
    });

    it('omits siblings entirely from the default emission', async () => {
      const subject = await buildSubjectWithLifetime();
      const sibling = await createPerson(db, { given_name: 'Karin', surname: 'Test', sex: 'F' });
      await createRelationship(db, { type: 'sibling', person1_id: subject.id, person2_id: sibling.id });

      // Sibling birth and death during subject's lifetime
      const siblingBirth = await createEvent(db, { event_type: 'birth', date_value: '1855-01-01', date_original: '1855' });
      await addEventParticipant(db, { event_id: siblingBirth.id, person_id: sibling.id });
      const siblingDeath = await createEvent(db, { event_type: 'death', date_value: '1880-08-08', date_original: '1880' });
      await addEventParticipant(db, { event_id: siblingDeath.id, person_id: sibling.id });

      const timeline = await getTimeline(db, subject.id);
      expect(timeline).not.toBeNull();
      const siblingEntries = timeline!.filter(e => e.relationship_label === 'sibling');
      expect(siblingEntries.length).toBe(0);
    });
  });
});

describe('getAliveInYear', async () => {
  async function addBirth(personId: string, year: number, placeName?: string) {
    const placeId = placeName ? (await findOrCreatePlace(db, placeName)).id : undefined;
    const event = await createEvent(db, {
      event_type: 'birth',
      date_type: 'exact',
      date_value: `${year}-01-01`,
      place_id: placeId,
    });
    await addEventParticipant(db, { event_id: event.id, person_id: personId, role: 'primary' });
  }
  async function addDeath(personId: string, year: number) {
    const event = await createEvent(db, {
      event_type: 'death',
      date_type: 'exact',
      date_value: `${year}-12-31`,
    });
    await addEventParticipant(db, { event_id: event.id, person_id: personId, role: 'primary' });
  }

  it('returns persons with known birth and death bracketing the target year', async () => {
    const p = await createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Andersson' });
    await addBirth(p.id, 1850);
    await addDeath(p.id, 1920);
    const result = await getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(true);
    expect(result.persons.find(x => x.id === p.id)?.age).toBe(50);
  });

  it('excludes persons born after the target year', async () => {
    const p = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Svensson' });
    await addBirth(p.id, 1920);
    await addDeath(p.id, 1990);
    const result = await getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(false);
  });

  it('excludes persons who died before the target year', async () => {
    const p = await createPerson(db, { sex: 'M', given_name: 'Johan', surname: 'Nilsson' });
    await addBirth(p.id, 1800);
    await addDeath(p.id, 1890);
    const result = await getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(false);
  });

  it('includes persons with birth but no death if birth is before target year', async () => {
    const p = await createPerson(db, { sex: 'F', given_name: 'Kristina', surname: 'Larsson' });
    await addBirth(p.id, 1850);
    const result = await getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(true);
  });

  it('excludes persons with only death if death is after 110 years from target year', async () => {
    const p = await createPerson(db, { sex: 'M', given_name: 'Sven', surname: 'Eriksson' });
    await addDeath(p.id, 2050);
    const result = await getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(false);
  });

  it('includes persons with neither birth nor death if they have events in target year', async () => {
    const p = await createPerson(db, { sex: 'M', given_name: 'Olof', surname: 'Persson' });
    const event = await createEvent(db, {
      event_type: 'census',
      date_type: 'exact',
      date_value: '1900-06-15',
    });
    await addEventParticipant(db, { event_id: event.id, person_id: p.id, role: 'primary' });
    const result = await getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(true);
  });

  it('groups persons by family unit (couple relationships)', async () => {
    const husband = await createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Andersson' });
    const wife = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Andersson' });
    const child = await createPerson(db, { sex: 'F', given_name: 'Maja', surname: 'Andersson' });
    await addBirth(husband.id, 1850);
    await addBirth(wife.id, 1855);
    await addBirth(child.id, 1880);

    const couple = await createRelationship(db, { type: 'couple', person1_id: husband.id, person2_id: wife.id });
    await createRelationship(db, { type: 'parent_child', person1_id: husband.id, person2_id: child.id });
    await createRelationship(db, { type: 'parent_child', person1_id: wife.id, person2_id: child.id });

    const result = await getAliveInYear(db, 1900);
    const family = result.families.find(f => f.relationshipId === couple.id);
    expect(family).toBeDefined();
    expect(family?.parents.map(p => p.id).sort()).toEqual([husband.id, wife.id].sort());
    expect(family?.children.map(c => c.id)).toContain(child.id);
  });

  it('returns place name from latest pre-target-year event with a place', async () => {
    const p = await createPerson(db, { sex: 'M', given_name: 'Lars', surname: 'Gustafsson' });
    await addBirth(p.id, 1850, 'Ödeshög');
    const place = await findOrCreatePlace(db, 'Stockholm');
    const event = await createEvent(db, {
      event_type: 'residence',
      date_type: 'exact',
      date_value: '1895-01-01',
      place_id: place.id,
    });
    await addEventParticipant(db, { event_id: event.id, person_id: p.id, role: 'primary' });
    const result = await getAliveInYear(db, 1900);
    expect(result.persons.find(x => x.id === p.id)?.placeName).toBe('Stockholm');
    expect(result.persons.find(x => x.id === p.id)?.placeName).not.toBe('Ödeshög');
  });

  it('places persons without couple relationships in unattached', async () => {
    const p = await createPerson(db, { sex: 'M', given_name: 'Solo', surname: 'Person' });
    await addBirth(p.id, 1850);
    const result = await getAliveInYear(db, 1900);
    expect(result.unattached.some(x => x.id === p.id)).toBe(true);
    expect(result.families.every(f =>
      f.parents.every(x => x.id !== p.id) && f.children.every(x => x.id !== p.id)
    )).toBe(true);
  });

  it('includes half-couples with only one known partner', async () => {
    const wife = await createPerson(db, { sex: 'F', given_name: 'Widow', surname: 'Half' });
    await addBirth(wife.id, 1850);
    const couple = await createRelationship(db, { type: 'couple', person1_id: wife.id, person2_id: null });
    const result = await getAliveInYear(db, 1900);
    const family = result.families.find(f => f.relationshipId === couple.id);
    // Half-couple should still be represented — either as a family with one parent,
    // or in unattached if the implementation chose that. Wife must be in the result.
    const inAnyFamily = result.families.some(f => f.parents.some(p => p.id === wife.id));
    const inUnattached = result.unattached.some(p => p.id === wife.id);
    expect(inAnyFamily || inUnattached).toBe(true);
    if (family) expect(family.parents.some(p => p.id === wife.id)).toBe(true);
  });

  it('exposes the living flag per person', async () => {
    const livingP = await createPerson(db, { sex: 'F', given_name: 'Alive', surname: 'Now', living: true });
    await addBirth(livingP.id, 1985);
    const deceasedP = await createPerson(db, { sex: 'M', given_name: 'Passed', surname: 'Away', living: false });
    await addBirth(deceasedP.id, 1940);
    await addDeath(deceasedP.id, 2010);
    const result = await getAliveInYear(db, 2000);
    const alive = result.persons.find(x => x.id === livingP.id);
    const deceased = result.persons.find(x => x.id === deceasedP.id);
    expect(alive?.living).toBe(true);
    expect(deceased?.living).toBe(false);
  });
});
