/**
 * Undo-aware wrappers around API mutation functions.
 * Each wrapper: snapshots old state -> calls original -> pushes UndoAction.
 * These are called from IPC handlers instead of the raw API functions.
 */
import type { Database } from 'node-sqlite3-wasm';
import type { Person, PersonName, GenealogyEvent, Relationship, Source, Citation, EventParticipant } from './types';
import * as persons from './persons';
import * as relationships from './relationships';
import * as events from './events';
import * as sources from './sources';
import { createPersonWithEventWorkflow, type CreatePersonWithEventArgs, type CreatePersonWithEventResult } from './persons_workflows';
import { queryOne, runSql } from './db';
import { undoManager } from './undo';

// ---- Person ----

export function createPersonUndo(
  db: Database,
  data: Parameters<typeof persons.createPerson>[1]
): Person {
  const result = persons.createPerson(db, data);
  const id = result.id;
  const snapshot = JSON.parse(JSON.stringify(data));
  undoManager.push({
    label: 'undo.createPerson',
    undo: () => { persons.deletePerson(db, id); },
    redo: () => { persons.createPerson(db, snapshot); },
  });
  return result;
}

export function updatePersonUndo(
  db: Database,
  id: string,
  data: Parameters<typeof persons.updatePerson>[2]
): Person | null {
  const old = persons.getPerson(db, id);
  if (!old) return null;
  const oldData = { sex: old.sex, living: old.living, notes: old.notes };
  const result = persons.updatePerson(db, id, data);
  const newData = { ...data };
  undoManager.push({
    label: 'undo.updatePerson',
    undo: () => { persons.updatePerson(db, id, oldData); },
    redo: () => { persons.updatePerson(db, id, newData); },
  });
  return result;
}

export function deletePersonUndo(
  db: Database,
  id: string
): boolean {
  const person = persons.getPerson(db, id);
  if (!person) return false;
  const names = persons.getPersonNames(db, id);
  const rels = relationships.getRelationshipsOfPerson(db, id);
  const personEvents = events.getEventsForPerson(db, id);
  const participantsByEvent: Record<string, EventParticipant[]> = {};
  for (const ev of personEvents) {
    participantsByEvent[ev.id] = relationships.getEventParticipants(db, ev.id);
  }
  const identifiers = persons.getPersonIdentifiers(db, id);

  const result = persons.deletePerson(db, id);
  if (!result) return false;

  undoManager.push({
    label: 'undo.deletePerson',
    undo: () => {
      runSql(db,
        `INSERT INTO persons (id, sex, living, notes) VALUES (?, ?, ?, ?)`,
        [person.id, person.sex, person.living ? 1 : 0, person.notes]
      );
      for (const name of names) {
        runSql(db,
          `INSERT INTO person_names (id, person_id, given_name, surname, name_type, date_from, date_to, sort_order, name_prefix, name_suffix, patronymic_base, name_qualifier, preferred_name, nickname) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [name.id, name.person_id, name.given_name, name.surname, name.name_type, name.date_from, name.date_to, name.sort_order, name.name_prefix, name.name_suffix, name.patronymic_base, name.name_qualifier, name.preferred_name, name.nickname]
        );
      }
      for (const ident of identifiers) {
        runSql(db,
          `INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value, created_at) VALUES (?, ?, ?, ?, ?)`,
          [ident.id, ident.person_id, ident.identifier_type, ident.identifier_value, ident.created_at]
        );
      }
      for (const rel of rels) {
        const existing = relationships.getRelationship(db, rel.id);
        if (!existing) {
          runSql(db,
            `INSERT INTO relationships (id, type, person1_id, person2_id, subtype, notes) VALUES (?, ?, ?, ?, ?, ?)`,
            [rel.id, rel.type, rel.person1_id, rel.person2_id, rel.subtype, rel.notes]
          );
        }
      }
      for (const ev of personEvents) {
        const existing = events.getEvent(db, ev.id);
        if (!existing) {
          runSql(db,
            `INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, place_address, cause, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ev.id, ev.event_type, ev.relationship_id, ev.date_type, ev.date_value, ev.date_value_end, ev.date_original, ev.place_id, ev.place_address, ev.cause, ev.description]
          );
        }
        const parts = participantsByEvent[ev.id] || [];
        for (const p of parts) {
          try {
            runSql(db,
              `INSERT INTO event_participants (id, event_id, person_id, role) VALUES (?, ?, ?, ?)`,
              [p.id, p.event_id, p.person_id, p.role]
            );
          } catch {
            // Participant may already exist
          }
        }
      }
    },
    redo: () => { persons.deletePerson(db, id); },
  });
  return true;
}

export function createPersonWithEventUndo(
  db: Database,
  args: CreatePersonWithEventArgs,
): CreatePersonWithEventResult {
  const result = createPersonWithEventWorkflow(db, args);
  const personId = result.person.id;
  const eventId = result.event?.id ?? null;
  const citationId = result.citation?.id ?? null;
  const snapshot = JSON.parse(JSON.stringify(args)) as CreatePersonWithEventArgs;
  undoManager.push({
    label: 'undo.createPersonWithEvent',
    undo: () => {
      if (citationId) sources.deleteCitation(db, citationId);
      if (eventId) events.deleteEvent(db, eventId);
      persons.deletePerson(db, personId);
    },
    redo: () => { createPersonWithEventWorkflow(db, snapshot); },
  });
  return result;
}

// ---- PersonName ----

export function addPersonNameUndo(
  db: Database,
  personId: string,
  data: Parameters<typeof persons.addPersonName>[2]
): PersonName {
  const result = persons.addPersonName(db, personId, data);
  const nameId = result.id;
  const snapshot = JSON.parse(JSON.stringify(data));
  undoManager.push({
    label: 'undo.addPersonName',
    undo: () => { persons.deletePersonName(db, nameId); },
    redo: () => { persons.addPersonName(db, personId, snapshot); },
  });
  return result;
}

export function updatePersonNameUndo(
  db: Database,
  id: string,
  data: Parameters<typeof persons.updatePersonName>[2]
): PersonName | null {
  const oldName = queryOne<PersonName>(db, `SELECT * FROM person_names WHERE id = ?`, [id]);
  if (!oldName) return null;
  const oldData: Record<string, unknown> = {};
  for (const key of Object.keys(data) as string[]) {
    oldData[key] = (oldName as Record<string, unknown>)[key];
  }
  const result = persons.updatePersonName(db, id, data);
  const newData = { ...data };
  undoManager.push({
    label: 'undo.updatePersonName',
    undo: () => { persons.updatePersonName(db, id, oldData as Parameters<typeof persons.updatePersonName>[2]); },
    redo: () => { persons.updatePersonName(db, id, newData); },
  });
  return result;
}

export function deletePersonNameUndo(
  db: Database,
  id: string
): boolean {
  const old = queryOne<PersonName>(db, `SELECT * FROM person_names WHERE id = ?`, [id]);
  if (!old) return false;
  const result = persons.deletePersonName(db, id);
  if (!result) return false;
  undoManager.push({
    label: 'undo.deletePersonName',
    undo: () => {
      runSql(db,
        `INSERT INTO person_names (id, person_id, given_name, surname, name_type, date_from, date_to, sort_order, name_prefix, name_suffix, patronymic_base, name_qualifier, preferred_name, nickname) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [old.id, old.person_id, old.given_name, old.surname, old.name_type, old.date_from, old.date_to, old.sort_order, old.name_prefix, old.name_suffix, old.patronymic_base, old.name_qualifier, old.preferred_name, old.nickname]
      );
    },
    redo: () => { persons.deletePersonName(db, id); },
  });
  return true;
}

// ---- Event ----

export function createEventUndo(
  db: Database,
  data: Parameters<typeof events.createEvent>[1]
): GenealogyEvent {
  const result = events.createEvent(db, data);
  const id = result.id;
  const snapshot = JSON.parse(JSON.stringify(data));
  undoManager.push({
    label: 'undo.createEvent',
    undo: () => { events.deleteEvent(db, id); },
    redo: () => { events.createEvent(db, snapshot); },
  });
  return result;
}

export function updateEventUndo(
  db: Database,
  id: string,
  data: Parameters<typeof events.updateEvent>[2]
): GenealogyEvent | null {
  const old = events.getEvent(db, id);
  if (!old) return null;
  const oldData: Record<string, unknown> = {};
  for (const key of Object.keys(data) as string[]) {
    oldData[key] = (old as Record<string, unknown>)[key];
  }
  const result = events.updateEvent(db, id, data);
  const newData = { ...data };
  undoManager.push({
    label: 'undo.updateEvent',
    undo: () => { events.updateEvent(db, id, oldData as Parameters<typeof events.updateEvent>[2]); },
    redo: () => { events.updateEvent(db, id, newData); },
  });
  return result;
}

export function deleteEventUndo(
  db: Database,
  id: string
): boolean {
  const old = events.getEvent(db, id);
  if (!old) return false;
  const participants = relationships.getEventParticipants(db, id);
  const result = events.deleteEvent(db, id);
  if (!result) return false;
  undoManager.push({
    label: 'undo.deleteEvent',
    undo: () => {
      runSql(db,
        `INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, place_address, cause, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [old.id, old.event_type, old.relationship_id, old.date_type, old.date_value, old.date_value_end, old.date_original, old.place_id, old.place_address, old.cause, old.description]
      );
      for (const p of participants) {
        try {
          runSql(db,
            `INSERT INTO event_participants (id, event_id, person_id, role) VALUES (?, ?, ?, ?)`,
            [p.id, p.event_id, p.person_id, p.role]
          );
        } catch {
          // ignore if person no longer exists
        }
      }
    },
    redo: () => { events.deleteEvent(db, id); },
  });
  return true;
}

// ---- EventParticipant ----

export function addEventParticipantUndo(
  db: Database,
  data: Parameters<typeof relationships.addEventParticipant>[1]
): EventParticipant {
  const result = relationships.addEventParticipant(db, data);
  const id = result.id;
  const snapshot = JSON.parse(JSON.stringify(data));
  undoManager.push({
    label: 'undo.addEventParticipant',
    undo: () => { relationships.removeEventParticipant(db, id); },
    redo: () => { relationships.addEventParticipant(db, snapshot); },
  });
  return result;
}

export function removeEventParticipantUndo(
  db: Database,
  id: string
): boolean {
  const old = queryOne<EventParticipant>(db, `SELECT * FROM event_participants WHERE id = ?`, [id]);
  if (!old) return false;
  const result = relationships.removeEventParticipant(db, id);
  if (!result) return false;
  undoManager.push({
    label: 'undo.removeEventParticipant',
    undo: () => {
      runSql(db,
        `INSERT INTO event_participants (id, event_id, person_id, role) VALUES (?, ?, ?, ?)`,
        [old.id, old.event_id, old.person_id, old.role]
      );
    },
    redo: () => { relationships.removeEventParticipant(db, id); },
  });
  return true;
}

// ---- Relationship ----

export function createRelationshipUndo(
  db: Database,
  data: Parameters<typeof relationships.createRelationship>[1]
): Relationship {
  const result = relationships.createRelationship(db, data);
  const id = result.id;
  const snapshot = JSON.parse(JSON.stringify(data));
  undoManager.push({
    label: 'undo.createRelationship',
    undo: () => { relationships.deleteRelationship(db, id); },
    redo: () => { relationships.createRelationship(db, snapshot); },
  });
  return result;
}

export function updateRelationshipUndo(
  db: Database,
  id: string,
  data: Parameters<typeof relationships.updateRelationship>[2]
): Relationship | null {
  const old = relationships.getRelationship(db, id);
  if (!old) return null;
  const oldData: Record<string, unknown> = {};
  for (const key of Object.keys(data) as string[]) {
    oldData[key] = (old as Record<string, unknown>)[key];
  }
  const result = relationships.updateRelationship(db, id, data);
  const newData = { ...data };
  undoManager.push({
    label: 'undo.updateRelationship',
    undo: () => { relationships.updateRelationship(db, id, oldData as Parameters<typeof relationships.updateRelationship>[2]); },
    redo: () => { relationships.updateRelationship(db, id, newData); },
  });
  return result;
}

export function deleteRelationshipUndo(
  db: Database,
  id: string
): boolean {
  const old = relationships.getRelationship(db, id);
  if (!old) return false;
  const relEvents = events.getEventsForRelationship(db, id);
  const result = relationships.deleteRelationship(db, id);
  if (!result) return false;
  undoManager.push({
    label: 'undo.deleteRelationship',
    undo: () => {
      runSql(db,
        `INSERT INTO relationships (id, type, person1_id, person2_id, subtype, notes) VALUES (?, ?, ?, ?, ?, ?)`,
        [old.id, old.type, old.person1_id, old.person2_id, old.subtype, old.notes]
      );
      for (const ev of relEvents) {
        const existing = events.getEvent(db, ev.id);
        if (!existing) {
          runSql(db,
            `INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, place_address, cause, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ev.id, ev.event_type, ev.relationship_id, ev.date_type, ev.date_value, ev.date_value_end, ev.date_original, ev.place_id, ev.place_address, ev.cause, ev.description]
          );
        }
      }
    },
    redo: () => { relationships.deleteRelationship(db, id); },
  });
  return true;
}

// ---- Source ----

export function createSourceUndo(
  db: Database,
  data: Parameters<typeof sources.createSource>[1]
): Source {
  const result = sources.createSource(db, data);
  const id = result.id;
  const snapshot = JSON.parse(JSON.stringify(data));
  undoManager.push({
    label: 'undo.createSource',
    undo: () => { sources.deleteSource(db, id); },
    redo: () => { sources.createSource(db, snapshot); },
  });
  return result;
}

export function updateSourceUndo(
  db: Database,
  id: string,
  data: Parameters<typeof sources.updateSource>[2]
): Source | null {
  const old = sources.getSource(db, id);
  if (!old) return null;
  const oldData: Record<string, unknown> = {};
  for (const key of Object.keys(data) as string[]) {
    oldData[key] = (old as Record<string, unknown>)[key];
  }
  const result = sources.updateSource(db, id, data);
  const newData = { ...data };
  undoManager.push({
    label: 'undo.updateSource',
    undo: () => { sources.updateSource(db, id, oldData as Parameters<typeof sources.updateSource>[2]); },
    redo: () => { sources.updateSource(db, id, newData); },
  });
  return result;
}

export function deleteSourceUndo(
  db: Database,
  id: string
): boolean {
  const old = sources.getSource(db, id);
  if (!old) return false;
  const citations = sources.getCitationsForSource(db, id);
  const result = sources.deleteSource(db, id);
  if (!result) return false;
  undoManager.push({
    label: 'undo.deleteSource',
    undo: () => {
      runSql(db,
        `INSERT INTO sources (id, title, author, publication_info, repository, url, source_type, call_number, abstract) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [old.id, old.title, old.author, old.publication_info, old.repository, old.url, old.source_type, old.call_number, old.abstract]
      );
      for (const c of citations) {
        runSql(db,
          `INSERT INTO citations (id, source_id, page, date_accessed, confidence, transcription, notes, event_id, person_id, relationship_id, place_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.id, c.source_id, c.page, c.date_accessed, c.confidence, c.transcription, c.notes, c.event_id, c.person_id, c.relationship_id, c.place_id]
        );
      }
    },
    redo: () => { sources.deleteSource(db, id); },
  });
  return true;
}

// ---- Citation ----

export function createCitationUndo(
  db: Database,
  data: Parameters<typeof sources.createCitation>[1]
): Citation {
  const result = sources.createCitation(db, data);
  const id = result.id;
  const snapshot = JSON.parse(JSON.stringify(data));
  undoManager.push({
    label: 'undo.createCitation',
    undo: () => { sources.deleteCitation(db, id); },
    redo: () => { sources.createCitation(db, snapshot); },
  });
  return result;
}

export function updateCitationUndo(
  db: Database,
  id: string,
  data: Parameters<typeof sources.updateCitation>[2]
): Citation | null {
  const old = sources.getCitation(db, id);
  if (!old) return null;
  const oldData: Record<string, unknown> = {};
  for (const key of Object.keys(data) as string[]) {
    oldData[key] = (old as Record<string, unknown>)[key];
  }
  const result = sources.updateCitation(db, id, data);
  const newData = { ...data };
  undoManager.push({
    label: 'undo.updateCitation',
    undo: () => { sources.updateCitation(db, id, oldData as Parameters<typeof sources.updateCitation>[2]); },
    redo: () => { sources.updateCitation(db, id, newData); },
  });
  return result;
}

export function deleteCitationUndo(
  db: Database,
  id: string
): boolean {
  const old = sources.getCitation(db, id);
  if (!old) return false;
  const result = sources.deleteCitation(db, id);
  if (!result) return false;
  undoManager.push({
    label: 'undo.deleteCitation',
    undo: () => {
      runSql(db,
        `INSERT INTO citations (id, source_id, page, date_accessed, confidence, transcription, notes, event_id, person_id, relationship_id, place_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [old.id, old.source_id, old.page, old.date_accessed, old.confidence, old.transcription, old.notes, old.event_id, old.person_id, old.relationship_id, old.place_id]
      );
    },
    redo: () => { sources.deleteCitation(db, id); },
  });
  return true;
}

// Re-export for convenience
export { undoManager } from './undo';
