import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import { createTestDb } from './helpers';
import { UndoManager } from '../../src/api/undo';
import * as persons from '../../src/api/persons';
import * as relationships from '../../src/api/relationships';
import * as events from '../../src/api/events';
import * as sources from '../../src/api/sources';
import {
  createPersonUndo, updatePersonUndo, deletePersonUndo,
  addPersonNameUndo, updatePersonNameUndo, deletePersonNameUndo,
  createEventUndo, updateEventUndo, deleteEventUndo,
  addEventParticipantUndo, removeEventParticipantUndo,
  createRelationshipUndo, updateRelationshipUndo, deleteRelationshipUndo,
  createSourceUndo, updateSourceUndo, deleteSourceUndo,
  createCitationUndo, updateCitationUndo, deleteCitationUndo,
} from '../../src/api/undo_wrappers';
import { undoManager } from '../../src/api/undo';

// ---- UndoManager unit tests ----

describe('UndoManager', () => {
  let mgr: UndoManager;

  beforeEach(() => {
    mgr = new UndoManager();
  });

  it('starts empty', () => {
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(false);
    expect(mgr.getUndoLabel()).toBeNull();
    expect(mgr.getRedoLabel()).toBeNull();
  });

  it('push + undo + redo', () => {
    let val = 1;
    mgr.push({
      label: 'set to 1',
      undo: () => { val = 0; },
      redo: () => { val = 1; },
    });
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.getUndoLabel()).toBe('set to 1');

    const label = mgr.undo();
    expect(label).toBe('set to 1');
    expect(val).toBe(0);
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(true);

    const redoLabel = mgr.redo();
    expect(redoLabel).toBe('set to 1');
    expect(val).toBe(1);
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.canRedo()).toBe(false);
  });

  it('undo returns null when empty', () => {
    expect(mgr.undo()).toBeNull();
  });

  it('redo returns null when empty', () => {
    expect(mgr.redo()).toBeNull();
  });

  it('new push clears redo stack', () => {
    let val = 0;
    mgr.push({ label: 'a', undo: () => { val = 0; }, redo: () => { val = 1; } });
    mgr.undo();
    expect(mgr.canRedo()).toBe(true);

    mgr.push({ label: 'b', undo: () => { val = 10; }, redo: () => { val = 20; } });
    expect(mgr.canRedo()).toBe(false);
  });

  it('respects maxDepth of 100', () => {
    for (let i = 0; i < 110; i++) {
      mgr.push({ label: `action-${i}`, undo: () => {}, redo: () => {} });
    }
    // Should have at most 100
    let count = 0;
    while (mgr.canUndo()) { mgr.undo(); count++; }
    expect(count).toBe(100);
  });

  it('clear empties both stacks', () => {
    mgr.push({ label: 'a', undo: () => {}, redo: () => {} });
    mgr.undo();
    expect(mgr.canRedo()).toBe(true);
    mgr.clear();
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(false);
  });

  it('getState returns correct state', () => {
    mgr.push({ label: 'test-action', undo: () => {}, redo: () => {} });
    const state = mgr.getState();
    expect(state.canUndo).toBe(true);
    expect(state.canRedo).toBe(false);
    expect(state.undoLabel).toBe('test-action');
    expect(state.redoLabel).toBeNull();
  });

  describe('groups', () => {
    it('groups multiple actions into single undo step', () => {
      let a = 0, b = 0;
      mgr.beginGroup('compound');
      mgr.push({ label: 'inc-a', undo: () => { a = 0; }, redo: () => { a = 1; } });
      a = 1;
      mgr.push({ label: 'inc-b', undo: () => { b = 0; }, redo: () => { b = 1; } });
      b = 1;
      mgr.endGroup();

      expect(mgr.getUndoLabel()).toBe('compound');

      // Single undo should revert both
      mgr.undo();
      expect(a).toBe(0);
      expect(b).toBe(0);

      // Single redo should re-apply both
      mgr.redo();
      expect(a).toBe(1);
      expect(b).toBe(1);
    });

    it('empty group pushes nothing', () => {
      mgr.beginGroup('empty');
      mgr.endGroup();
      expect(mgr.canUndo()).toBe(false);
    });

    it('undoes group actions in reverse order', () => {
      const order: string[] = [];
      mgr.beginGroup('ordered');
      mgr.push({ label: 'first', undo: () => { order.push('undo-first'); }, redo: () => { order.push('redo-first'); } });
      mgr.push({ label: 'second', undo: () => { order.push('undo-second'); }, redo: () => { order.push('redo-second'); } });
      mgr.endGroup();

      mgr.undo();
      expect(order).toEqual(['undo-second', 'undo-first']);

      order.length = 0;
      mgr.redo();
      expect(order).toEqual(['redo-first', 'redo-second']);
    });
  });
});

// ---- Undo wrappers integration tests ----

describe('Undo wrappers', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
    undoManager.clear();
  });

  describe('Person', () => {
    it('undo createPerson deletes the person', () => {
      const person = createPersonUndo(db, { given_name: 'Test', surname: 'Person' });
      expect(persons.getPerson(db, person.id)).not.toBeNull();

      undoManager.undo();
      expect(persons.getPerson(db, person.id)).toBeNull();
    });

    it('redo createPerson re-creates a person', () => {
      const person = createPersonUndo(db, { given_name: 'Test', surname: 'Person' });
      undoManager.undo();
      undoManager.redo();
      // A new person was created (different ID since we can't restore the original with the simple wrapper)
      const all = persons.listPersons(db);
      expect(all.length).toBe(1);
    });

    it('undo updatePerson restores old values', () => {
      const person = createPersonUndo(db, { sex: 'M' });
      undoManager.clear(); // clear the create action
      updatePersonUndo(db, person.id, { sex: 'F' });
      expect(persons.getPerson(db, person.id)!.sex).toBe('F');

      undoManager.undo();
      expect(persons.getPerson(db, person.id)!.sex).toBe('M');
    });

    it('undo deletePerson restores person + names', () => {
      const person = createPersonUndo(db, { given_name: 'John', surname: 'Doe' });
      undoManager.clear();
      deletePersonUndo(db, person.id);
      expect(persons.getPerson(db, person.id)).toBeNull();

      undoManager.undo();
      expect(persons.getPerson(db, person.id)).not.toBeNull();
      const names = persons.getPersonNames(db, person.id);
      expect(names.length).toBe(1);
      expect(names[0].given_name).toBe('John');
    });
  });

  describe('PersonName', () => {
    it('undo addPersonName removes the name', () => {
      const person = persons.createPerson(db, {});
      const name = addPersonNameUndo(db, person.id, { given_name: 'Extra', surname: 'Name' });
      expect(persons.getPersonNames(db, person.id).length).toBeGreaterThanOrEqual(1);

      undoManager.undo();
      const remaining = persons.getPersonNames(db, person.id);
      expect(remaining.find(n => n.id === name.id)).toBeUndefined();
    });

    it('undo deletePersonName restores the name', () => {
      const person = persons.createPerson(db, { given_name: 'A', surname: 'B' });
      const names = persons.getPersonNames(db, person.id);
      const nameId = names[0].id;

      undoManager.clear();
      deletePersonNameUndo(db, nameId);
      expect(persons.getPersonNames(db, person.id).length).toBe(0);

      undoManager.undo();
      const restored = persons.getPersonNames(db, person.id);
      expect(restored.length).toBe(1);
      expect(restored[0].given_name).toBe('A');
    });
  });

  describe('Event', () => {
    it('undo createEvent deletes the event', () => {
      const ev = createEventUndo(db, { event_type: 'birth' });
      expect(events.getEvent(db, ev.id)).not.toBeNull();

      undoManager.undo();
      expect(events.getEvent(db, ev.id)).toBeNull();
    });

    it('undo deleteEvent restores event + participants', () => {
      const person = persons.createPerson(db, {});
      const ev = events.createEvent(db, { event_type: 'birth' });
      relationships.addEventParticipant(db, { event_id: ev.id, person_id: person.id, role: 'primary' });

      undoManager.clear();
      deleteEventUndo(db, ev.id);
      expect(events.getEvent(db, ev.id)).toBeNull();

      undoManager.undo();
      expect(events.getEvent(db, ev.id)).not.toBeNull();
      const parts = relationships.getEventParticipants(db, ev.id);
      expect(parts.length).toBe(1);
    });

    it('undo updateEvent restores old values', () => {
      const ev = createEventUndo(db, { event_type: 'birth', description: 'original' });
      undoManager.clear();
      updateEventUndo(db, ev.id, { description: 'changed' });
      expect(events.getEvent(db, ev.id)!.description).toBe('changed');

      undoManager.undo();
      expect(events.getEvent(db, ev.id)!.description).toBe('original');
    });
  });

  describe('EventParticipant', () => {
    it('undo addEventParticipant removes the participant', () => {
      const person = persons.createPerson(db, {});
      const ev = events.createEvent(db, { event_type: 'birth' });
      const ep = addEventParticipantUndo(db, { event_id: ev.id, person_id: person.id });

      undoManager.undo();
      const parts = relationships.getEventParticipants(db, ev.id);
      expect(parts.find(p => p.id === ep.id)).toBeUndefined();
    });

    it('undo removeEventParticipant restores the participant', () => {
      const person = persons.createPerson(db, {});
      const ev = events.createEvent(db, { event_type: 'birth' });
      const ep = relationships.addEventParticipant(db, { event_id: ev.id, person_id: person.id });

      undoManager.clear();
      removeEventParticipantUndo(db, ep.id);
      expect(relationships.getEventParticipants(db, ev.id).length).toBe(0);

      undoManager.undo();
      expect(relationships.getEventParticipants(db, ev.id).length).toBe(1);
    });
  });

  describe('Relationship', () => {
    it('undo createRelationship deletes it', () => {
      const p1 = persons.createPerson(db, {});
      const p2 = persons.createPerson(db, {});
      const rel = createRelationshipUndo(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });
      expect(relationships.getRelationship(db, rel.id)).not.toBeNull();

      undoManager.undo();
      expect(relationships.getRelationship(db, rel.id)).toBeNull();
    });

    it('undo deleteRelationship restores it', () => {
      const p1 = persons.createPerson(db, {});
      const p2 = persons.createPerson(db, {});
      const rel = relationships.createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });

      undoManager.clear();
      deleteRelationshipUndo(db, rel.id);
      expect(relationships.getRelationship(db, rel.id)).toBeNull();

      undoManager.undo();
      expect(relationships.getRelationship(db, rel.id)).not.toBeNull();
    });

    it('undo updateRelationship restores old values', () => {
      const p1 = persons.createPerson(db, {});
      const p2 = persons.createPerson(db, {});
      const rel = createRelationshipUndo(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id, notes: 'old' });
      undoManager.clear();
      updateRelationshipUndo(db, rel.id, { notes: 'new' });
      expect(relationships.getRelationship(db, rel.id)!.notes).toBe('new');

      undoManager.undo();
      expect(relationships.getRelationship(db, rel.id)!.notes).toBe('old');
    });
  });

  describe('Source', () => {
    it('undo createSource deletes it', () => {
      const src = createSourceUndo(db, { title: 'Test Source' });
      expect(sources.getSource(db, src.id)).not.toBeNull();

      undoManager.undo();
      expect(sources.getSource(db, src.id)).toBeNull();
    });

    it('undo deleteSource restores source + citations', () => {
      const src = sources.createSource(db, { title: 'My Source' });
      const cit = sources.createCitation(db, { source_id: src.id, page: 'p.42' });

      undoManager.clear();
      deleteSourceUndo(db, src.id);
      expect(sources.getSource(db, src.id)).toBeNull();

      undoManager.undo();
      expect(sources.getSource(db, src.id)).not.toBeNull();
      const cits = sources.getCitationsForSource(db, src.id);
      expect(cits.length).toBe(1);
      expect(cits[0].page).toBe('p.42');
    });

    it('undo updateSource restores old values', () => {
      const src = createSourceUndo(db, { title: 'Original' });
      undoManager.clear();
      updateSourceUndo(db, src.id, { title: 'Changed' });
      expect(sources.getSource(db, src.id)!.title).toBe('Changed');

      undoManager.undo();
      expect(sources.getSource(db, src.id)!.title).toBe('Original');
    });
  });

  describe('Citation', () => {
    it('undo createCitation deletes it', () => {
      const src = sources.createSource(db, { title: 'S' });
      const cit = createCitationUndo(db, { source_id: src.id, page: 'p1' });
      expect(sources.getCitation(db, cit.id)).not.toBeNull();

      undoManager.undo();
      expect(sources.getCitation(db, cit.id)).toBeNull();
    });

    it('undo deleteCitation restores it', () => {
      const src = sources.createSource(db, { title: 'S' });
      const cit = sources.createCitation(db, { source_id: src.id, page: 'p1', confidence: 2 });

      undoManager.clear();
      deleteCitationUndo(db, cit.id);
      expect(sources.getCitation(db, cit.id)).toBeNull();

      undoManager.undo();
      const restored = sources.getCitation(db, cit.id);
      expect(restored).not.toBeNull();
      expect(restored!.page).toBe('p1');
      expect(restored!.confidence).toBe(2);
    });

    it('undo updateCitation restores old values', () => {
      const src = sources.createSource(db, { title: 'S' });
      const cit = sources.createCitation(db, { source_id: src.id, page: 'p1' });

      undoManager.clear();
      updateCitationUndo(db, cit.id, { page: 'p2' });
      expect(sources.getCitation(db, cit.id)!.page).toBe('p2');

      undoManager.undo();
      expect(sources.getCitation(db, cit.id)!.page).toBe('p1');
    });
  });
});
