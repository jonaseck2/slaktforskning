import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
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
import { createTestDb } from './helpers';

// ---- UndoManager unit tests ----

describe('UndoManager', async () => {
  let mgr: UndoManager;

  beforeEach(async () => {
    mgr = new UndoManager();
  });

  it('starts empty', async () => {
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(false);
    expect(mgr.getUndoLabel()).toBeNull();
    expect(mgr.getRedoLabel()).toBeNull();
  });

  it('push + undo + redo', async () => {
    let val = 1;
    mgr.push({
      label: 'set to 1',
      undo: () => { val = 0; },
      redo: () => { val = 1; },
    });
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.getUndoLabel()).toBe('set to 1');

    const label = await mgr.undo();
    expect(label).toBe('set to 1');
    expect(val).toBe(0);
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(true);

    const redoLabel = await mgr.redo();
    expect(redoLabel).toBe('set to 1');
    expect(val).toBe(1);
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.canRedo()).toBe(false);
  });

  it('undo returns null when empty', async () => {
    expect(await mgr.undo()).toBeNull();
  });

  it('redo returns null when empty', async () => {
    expect(await mgr.redo()).toBeNull();
  });

  it('new push clears redo stack', async () => {
    let _val = 0;
    mgr.push({ label: 'a', undo: () => { _val = 0; }, redo: () => { _val = 1; } });
    await mgr.undo();
    expect(mgr.canRedo()).toBe(true);

    mgr.push({ label: 'b', undo: () => { _val = 10; }, redo: () => { _val = 20; } });
    expect(mgr.canRedo()).toBe(false);
  });

  it('respects maxDepth of 100', async () => {
    for (let i = 0; i < 110; i++) {
      mgr.push({ label: `action-${i}`, undo: () => {}, redo: () => {} });
    }
    // Should have at most 100
    let count = 0;
    while (mgr.canUndo()) { await mgr.undo(); count++; }
    expect(count).toBe(100);
  });

  it('clear empties both stacks', async () => {
    mgr.push({ label: 'a', undo: () => {}, redo: () => {} });
    await mgr.undo();
    expect(mgr.canRedo()).toBe(true);
    mgr.clear();
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(false);
  });

  it('getState returns correct state', async () => {
    mgr.push({ label: 'test-action', undo: () => {}, redo: () => {} });
    const state = mgr.getState();
    expect(state.canUndo).toBe(true);
    expect(state.canRedo).toBe(false);
    expect(state.undoLabel).toBe('test-action');
    expect(state.redoLabel).toBeNull();
  });

  describe('groups', async () => {
    it('groups multiple actions into single undo step', async () => {
      let a = 0, b = 0;
      mgr.beginGroup('compound');
      mgr.push({ label: 'inc-a', undo: () => { a = 0; }, redo: () => { a = 1; } });
      a = 1;
      mgr.push({ label: 'inc-b', undo: () => { b = 0; }, redo: () => { b = 1; } });
      b = 1;
      mgr.endGroup();

      expect(mgr.getUndoLabel()).toBe('compound');

      // Single undo should revert both
      await mgr.undo();
      expect(a).toBe(0);
      expect(b).toBe(0);

      // Single redo should re-apply both
      await mgr.redo();
      expect(a).toBe(1);
      expect(b).toBe(1);
    });

    it('empty group pushes nothing', async () => {
      mgr.beginGroup('empty');
      mgr.endGroup();
      expect(mgr.canUndo()).toBe(false);
    });

    it('undoes group actions in reverse order', async () => {
      const order: string[] = [];
      mgr.beginGroup('ordered');
      mgr.push({ label: 'first', undo: () => { order.push('undo-first'); }, redo: () => { order.push('redo-first'); } });
      mgr.push({ label: 'second', undo: () => { order.push('undo-second'); }, redo: () => { order.push('redo-second'); } });
      mgr.endGroup();

      await mgr.undo();
      expect(order).toEqual(['undo-second', 'undo-first']);

      order.length = 0;
      await mgr.redo();
      expect(order).toEqual(['redo-first', 'redo-second']);
    });
  });
});

// ---- Undo wrappers integration tests ----

describe('Undo wrappers', async () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDb();
    undoManager.clear();
  });

  describe('Person', async () => {
    it('undo createPerson deletes the person', async () => {
      const person = await createPersonUndo(db, { given_name: 'Test', surname: 'Person' });
      expect(await persons.getPerson(db, person.id)).not.toBeNull();

      await undoManager.undo();
      expect(await persons.getPerson(db, person.id)).toBeNull();
    });

    it('redo createPerson re-creates a person', async () => {
      await createPersonUndo(db, { given_name: 'Test', surname: 'Person' });
      await undoManager.undo();
      await undoManager.redo();
      // A new person was created (different ID since we can't restore the original with the simple wrapper)
      const all = await persons.listPersons(db);
      expect(all.length).toBe(1);
    });

    it('undo updatePerson restores old values', async () => {
      const person = await createPersonUndo(db, { sex: 'M', given_name: 'Test' });
      undoManager.clear(); // clear the create action
      await updatePersonUndo(db, person.id, { sex: 'F' });
      expect((await persons.getPerson(db, person.id))!.sex).toBe('F');

      await undoManager.undo();
      expect((await persons.getPerson(db, person.id))!.sex).toBe('M');
    });

    it('undo deletePerson restores person + names', async () => {
      const person = await createPersonUndo(db, { given_name: 'John', surname: 'Doe' });
      undoManager.clear();
      await deletePersonUndo(db, person.id);
      expect(await persons.getPerson(db, person.id)).toBeNull();

      await undoManager.undo();
      expect(await persons.getPerson(db, person.id)).not.toBeNull();
      const names = await persons.getPersonNames(db, person.id);
      expect(names.length).toBe(1);
      expect(names[0].given_name).toBe('John');
    });
  });

  describe('PersonName', async () => {
    it('undo addPersonName removes the name', async () => {
      const person = await persons.createPerson(db, {}, { allowNameless: true });
      const name = await addPersonNameUndo(db, person.id, { given_name: 'Extra', surname: 'Name' });
      expect((await persons.getPersonNames(db, person.id)).length).toBeGreaterThanOrEqual(1);

      await undoManager.undo();
      const remaining = await persons.getPersonNames(db, person.id);
      expect(remaining.find(n => n.id === name.id)).toBeUndefined();
    });

    it('undo deletePersonName restores the name', async () => {
      const person = await persons.createPerson(db, { given_name: 'A', surname: 'B' });
      const names = await persons.getPersonNames(db, person.id);
      const nameId = names[0].id;

      undoManager.clear();
      await deletePersonNameUndo(db, nameId);
      expect((await persons.getPersonNames(db, person.id)).length).toBe(0);

      await undoManager.undo();
      const restored = await persons.getPersonNames(db, person.id);
      expect(restored.length).toBe(1);
      expect(restored[0].given_name).toBe('A');
    });
  });

  describe('Event', async () => {
    it('undo createEvent deletes the event', async () => {
      const ev = await createEventUndo(db, { event_type: 'birth' });
      expect(await events.getEvent(db, ev.id)).not.toBeNull();

      await undoManager.undo();
      expect(await events.getEvent(db, ev.id)).toBeNull();
    });

    it('undo deleteEvent restores event + participants', async () => {
      const person = await persons.createPerson(db, {}, { allowNameless: true });
      const ev = await events.createEvent(db, { event_type: 'birth' });
      await relationships.addEventParticipant(db, { event_id: ev.id, person_id: person.id, role: 'primary' });

      undoManager.clear();
      await deleteEventUndo(db, ev.id);
      expect(await events.getEvent(db, ev.id)).toBeNull();

      await undoManager.undo();
      expect(await events.getEvent(db, ev.id)).not.toBeNull();
      const parts = await relationships.getEventParticipants(db, ev.id);
      expect(parts.length).toBe(1);
    });

    it('undo updateEvent restores old values', async () => {
      const ev = await createEventUndo(db, { event_type: 'birth', notes: 'original' });
      undoManager.clear();
      await updateEventUndo(db, ev.id, { notes: 'changed' });
      expect((await events.getEvent(db, ev.id))!.notes).toBe('changed');

      await undoManager.undo();
      expect((await events.getEvent(db, ev.id))!.notes).toBe('original');
    });
  });

  describe('EventParticipant', async () => {
    it('undo addEventParticipant removes the participant', async () => {
      const person = await persons.createPerson(db, {}, { allowNameless: true });
      const ev = await events.createEvent(db, { event_type: 'birth' });
      const ep = await addEventParticipantUndo(db, { event_id: ev.id, person_id: person.id });

      await undoManager.undo();
      const parts = await relationships.getEventParticipants(db, ev.id);
      expect(parts.find(p => p.id === ep.id)).toBeUndefined();
    });

    it('undo removeEventParticipant restores the participant', async () => {
      const person = await persons.createPerson(db, {}, { allowNameless: true });
      const ev = await events.createEvent(db, { event_type: 'birth' });
      const ep = await relationships.addEventParticipant(db, { event_id: ev.id, person_id: person.id });

      undoManager.clear();
      await removeEventParticipantUndo(db, ep.id);
      expect((await relationships.getEventParticipants(db, ev.id)).length).toBe(0);

      await undoManager.undo();
      expect((await relationships.getEventParticipants(db, ev.id)).length).toBe(1);
    });
  });

  describe('Relationship', async () => {
    it('undo createRelationship deletes it', async () => {
      const p1 = await persons.createPerson(db, {}, { allowNameless: true });
      const p2 = await persons.createPerson(db, {}, { allowNameless: true });
      const rel = await createRelationshipUndo(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });
      expect(await relationships.getRelationship(db, rel.id)).not.toBeNull();

      await undoManager.undo();
      expect(await relationships.getRelationship(db, rel.id)).toBeNull();
    });

    it('undo deleteRelationship restores it', async () => {
      const p1 = await persons.createPerson(db, {}, { allowNameless: true });
      const p2 = await persons.createPerson(db, {}, { allowNameless: true });
      const rel = await relationships.createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });

      undoManager.clear();
      await deleteRelationshipUndo(db, rel.id);
      expect(await relationships.getRelationship(db, rel.id)).toBeNull();

      await undoManager.undo();
      expect(await relationships.getRelationship(db, rel.id)).not.toBeNull();
    });

    it('undo updateRelationship restores old values', async () => {
      const p1 = await persons.createPerson(db, {}, { allowNameless: true });
      const p2 = await persons.createPerson(db, {}, { allowNameless: true });
      const rel = await createRelationshipUndo(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id, notes: 'old' });
      undoManager.clear();
      await updateRelationshipUndo(db, rel.id, { notes: 'new' });
      expect((await relationships.getRelationship(db, rel.id))!.notes).toBe('new');

      await undoManager.undo();
      expect((await relationships.getRelationship(db, rel.id))!.notes).toBe('old');
    });
  });

  describe('Source', async () => {
    it('undo createSource deletes it', async () => {
      const src = await createSourceUndo(db, { title: 'Test Source' });
      expect(await sources.getSource(db, src.id)).not.toBeNull();

      await undoManager.undo();
      expect(await sources.getSource(db, src.id)).toBeNull();
    });

    it('undo deleteSource restores source + citations', async () => {
      const src = await sources.createSource(db, { title: 'My Source' });
      await sources.createCitation(db, { source_id: src.id, page: 'p.42' });

      undoManager.clear();
      await deleteSourceUndo(db, src.id);
      expect(await sources.getSource(db, src.id)).toBeNull();

      await undoManager.undo();
      expect(await sources.getSource(db, src.id)).not.toBeNull();
      const cits = await sources.getCitationsForSource(db, src.id);
      expect(cits.length).toBe(1);
      expect(cits[0].page).toBe('p.42');
    });

    it('undo updateSource restores old values', async () => {
      const src = await createSourceUndo(db, { title: 'Original' });
      undoManager.clear();
      await updateSourceUndo(db, src.id, { title: 'Changed' });
      expect((await sources.getSource(db, src.id))!.title).toBe('Changed');

      await undoManager.undo();
      expect((await sources.getSource(db, src.id))!.title).toBe('Original');
    });
  });

  describe('Citation', async () => {
    it('undo createCitation deletes it', async () => {
      const src = await sources.createSource(db, { title: 'S' });
      const cit = await createCitationUndo(db, { source_id: src.id, page: 'p1' });
      expect(await sources.getCitation(db, cit.id)).not.toBeNull();

      await undoManager.undo();
      expect(await sources.getCitation(db, cit.id)).toBeNull();
    });

    it('undo deleteCitation restores it', async () => {
      const src = await sources.createSource(db, { title: 'S' });
      const cit = await sources.createCitation(db, { source_id: src.id, page: 'p1', confidence: 2 });

      undoManager.clear();
      await deleteCitationUndo(db, cit.id);
      expect(await sources.getCitation(db, cit.id)).toBeNull();

      await undoManager.undo();
      const restored = await sources.getCitation(db, cit.id);
      expect(restored).not.toBeNull();
      expect(restored!.page).toBe('p1');
      expect(restored!.confidence).toBe(2);
    });

    it('undo updateCitation restores old values', async () => {
      const src = await sources.createSource(db, { title: 'S' });
      const cit = await sources.createCitation(db, { source_id: src.id, page: 'p1' });

      undoManager.clear();
      await updateCitationUndo(db, cit.id, { page: 'p2' });
      expect((await sources.getCitation(db, cit.id))!.page).toBe('p2');

      await undoManager.undo();
      expect((await sources.getCitation(db, cit.id))!.page).toBe('p1');
    });
  });

  // ---- Redo path tests ----

  describe('Redo paths', async () => {
    it('redo deleteSource re-deletes the source', async () => {
      const src = await sources.createSource(db, { title: 'Redo Source' });
      undoManager.clear();
      await deleteSourceUndo(db, src.id);
      await undoManager.undo();
      expect(await sources.getSource(db, src.id)).not.toBeNull();

      await undoManager.redo();
      expect(await sources.getSource(db, src.id)).toBeNull();
    });

    it('redo createCitation re-creates a citation', async () => {
      const src = await sources.createSource(db, { title: 'S' });
      const cit = await createCitationUndo(db, { source_id: src.id, page: 'redo-page' });
      await undoManager.undo();
      expect(await sources.getCitation(db, cit.id)).toBeNull();

      await undoManager.redo();
      const allCits = await sources.getCitationsForSource(db, src.id);
      expect(allCits.length).toBe(1);
    });

    it('redo updateCitation re-applies the update', async () => {
      const src = await sources.createSource(db, { title: 'S' });
      const cit = await sources.createCitation(db, { source_id: src.id, page: 'original' });
      undoManager.clear();
      await updateCitationUndo(db, cit.id, { page: 'updated' });
      await undoManager.undo();
      expect((await sources.getCitation(db, cit.id))!.page).toBe('original');

      await undoManager.redo();
      expect((await sources.getCitation(db, cit.id))!.page).toBe('updated');
    });

    it('redo deleteCitation re-deletes the citation', async () => {
      const src = await sources.createSource(db, { title: 'S' });
      const cit = await sources.createCitation(db, { source_id: src.id, page: 'p1' });
      undoManager.clear();
      await deleteCitationUndo(db, cit.id);
      await undoManager.undo();
      expect(await sources.getCitation(db, cit.id)).not.toBeNull();

      await undoManager.redo();
      expect(await sources.getCitation(db, cit.id)).toBeNull();
    });

    it('redo createSource re-creates a source', async () => {
      await createSourceUndo(db, { title: 'Redo Test' });
      await undoManager.undo();
      await undoManager.redo();
      const all = await sources.listSources(db);
      expect(all.length).toBe(1);
    });

    it('redo updateSource re-applies the update', async () => {
      const src = await createSourceUndo(db, { title: 'Original' });
      undoManager.clear();
      await updateSourceUndo(db, src.id, { title: 'Changed' });
      await undoManager.undo();
      expect((await sources.getSource(db, src.id))!.title).toBe('Original');

      await undoManager.redo();
      expect((await sources.getSource(db, src.id))!.title).toBe('Changed');
    });
  });

  // ---- Null / not-found branch tests ----

  describe('Null branches', async () => {
    it('updatePersonUndo returns null for nonexistent id', async () => {
      const result = await updatePersonUndo(db, 'nonexistent', { sex: 'F' });
      expect(result).toBeNull();
      expect(undoManager.canUndo()).toBe(false);
    });

    it('deletePersonUndo returns false for nonexistent id', async () => {
      const result = await deletePersonUndo(db, 'nonexistent');
      expect(result).toBe(false);
      expect(undoManager.canUndo()).toBe(false);
    });

    it('updatePersonNameUndo returns null for nonexistent id', async () => {
      const result = await updatePersonNameUndo(db, 'nonexistent', { given_name: 'X' });
      expect(result).toBeNull();
    });

    it('deletePersonNameUndo returns false for nonexistent id', async () => {
      const result = await deletePersonNameUndo(db, 'nonexistent');
      expect(result).toBe(false);
    });

    it('updateEventUndo returns null for nonexistent id', async () => {
      const result = await updateEventUndo(db, 'nonexistent', { notes: 'X' });
      expect(result).toBeNull();
    });

    it('deleteEventUndo returns false for nonexistent id', async () => {
      const result = await deleteEventUndo(db, 'nonexistent');
      expect(result).toBe(false);
    });

    it('removeEventParticipantUndo returns false for nonexistent id', async () => {
      const result = await removeEventParticipantUndo(db, 'nonexistent');
      expect(result).toBe(false);
    });

    it('updateRelationshipUndo returns null for nonexistent id', async () => {
      const result = await updateRelationshipUndo(db, 'nonexistent', { notes: 'X' });
      expect(result).toBeNull();
    });

    it('deleteRelationshipUndo returns false for nonexistent id', async () => {
      const result = await deleteRelationshipUndo(db, 'nonexistent');
      expect(result).toBe(false);
    });

    it('updateSourceUndo returns null for nonexistent id', async () => {
      const result = await updateSourceUndo(db, 'nonexistent', { title: 'X' });
      expect(result).toBeNull();
    });

    it('deleteSourceUndo returns false for nonexistent id', async () => {
      const result = await deleteSourceUndo(db, 'nonexistent');
      expect(result).toBe(false);
    });

    it('updateCitationUndo returns null for nonexistent id', async () => {
      const result = await updateCitationUndo(db, 'nonexistent', { page: 'X' });
      expect(result).toBeNull();
    });

    it('deleteCitationUndo returns false for nonexistent id', async () => {
      const result = await deleteCitationUndo(db, 'nonexistent');
      expect(result).toBe(false);
    });
  });

  // ---- Undo deletePerson restores identifiers ----

  describe('deletePerson with identifiers', async () => {
    it('undo deletePerson restores person identifiers', async () => {
      const person = await persons.createPerson(db, { given_name: 'Test', surname: 'Ident' });
      await persons.addPersonIdentifier(db, person.id, { identifier_type: 'familysearch', identifier_value: 'FS-123' });

      undoManager.clear();
      await deletePersonUndo(db, person.id);
      expect(await persons.getPerson(db, person.id)).toBeNull();

      await undoManager.undo();
      expect(await persons.getPerson(db, person.id)).not.toBeNull();
      const idents = await persons.getPersonIdentifiers(db, person.id);
      expect(idents).toHaveLength(1);
      expect(idents[0].identifier_value).toBe('FS-123');
    });
  });

  // ---- Undo deleteRelationship restores events ----

  describe('deleteRelationship with events', async () => {
    it('undo deleteRelationship restores relationship and its events', async () => {
      const p1 = await persons.createPerson(db, {}, { allowNameless: true });
      const p2 = await persons.createPerson(db, {}, { allowNameless: true });
      const rel = await relationships.createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });
      const ev = await events.createEvent(db, { event_type: 'marriage', relationship_id: rel.id, date_original: '1900-01-01' });

      undoManager.clear();
      await deleteRelationshipUndo(db, rel.id);
      expect(await relationships.getRelationship(db, rel.id)).toBeNull();
      // Event still exists but relationship_id was SET NULL
      expect((await events.getEvent(db, ev.id))?.relationship_id).toBeNull();

      await undoManager.undo();
      expect(await relationships.getRelationship(db, rel.id)).not.toBeNull();
      expect((await relationships.getRelationship(db, rel.id))!.type).toBe('couple');
    });
  });
});
