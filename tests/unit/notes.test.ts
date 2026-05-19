// Shared-notes CRUD tests (T04 — GEDCOM alignment plan).
//
// User goal (verbatim): shared notes are first-class entities. Multiple
// persons/events/places can reference the same NOTE record. CRUD + link
// surface mirrors the groups / group_links pattern so reactivity and
// surface-contract checks compose with the rest of the app.

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import {
  createNote, getNote, listNotes, updateNote, deleteNote,
  linkNoteToEntity, unlinkNoteFromEntity, getNotesForEntity, getEntitiesForNote,
} from '../../src/api/notes';
import { createPerson } from '../../src/api/persons';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

describe('notes api (T04)', () => {
  it('creates a note', async () => {
    const note = await createNote(db, { text: 'A shared note.', language: 'sv' });
    expect(note.id).toBeDefined();
    expect(note.text).toBe('A shared note.');
    expect(note.language).toBe('sv');
  });

  it('links a note to multiple entities', async () => {
    const note = await createNote(db, { text: 'Shared.', language: '' });
    const person1 = await createPerson(db, { sex: 'M', given_name: 'A' });
    const person2 = await createPerson(db, { sex: 'F', given_name: 'B' });
    await linkNoteToEntity(db, note.id, 'person', person1.id);
    await linkNoteToEntity(db, note.id, 'person', person2.id);
    const links1 = await getNotesForEntity(db, 'person', person1.id);
    const links2 = await getNotesForEntity(db, 'person', person2.id);
    expect(links1).toHaveLength(1);
    expect(links2).toHaveLength(1);
    expect(links1[0].id).toBe(note.id);
    const ents = await getEntitiesForNote(db, note.id);
    expect(ents).toHaveLength(2);
  });

  it('unlinking does not delete the note', async () => {
    const note = await createNote(db, { text: 'Shared.', language: '' });
    const person = await createPerson(db, { sex: 'M', given_name: 'P' });
    await linkNoteToEntity(db, note.id, 'person', person.id);
    await unlinkNoteFromEntity(db, note.id, 'person', person.id);
    const surviving = await getNote(db, note.id);
    expect(surviving).not.toBeNull();
    const links = await getNotesForEntity(db, 'person', person.id);
    expect(links).toHaveLength(0);
  });

  it('updates note text', async () => {
    const note = await createNote(db, { text: 'Original.', language: '' });
    await updateNote(db, note.id, { text: 'Updated.' });
    const fresh = await getNote(db, note.id);
    expect(fresh?.text).toBe('Updated.');
  });

  it('deleting a note removes all its links (CASCADE)', async () => {
    const note = await createNote(db, { text: 'X', language: '' });
    const person = await createPerson(db, { sex: 'M', given_name: 'Q' });
    await linkNoteToEntity(db, note.id, 'person', person.id);
    await deleteNote(db, note.id);
    const links = await getNotesForEntity(db, 'person', person.id);
    expect(links).toHaveLength(0);
  });

  it('lists all notes', async () => {
    await createNote(db, { text: 'one', language: '' });
    await createNote(db, { text: 'two', language: '' });
    const notes = await listNotes(db);
    expect(notes).toHaveLength(2);
  });
});
