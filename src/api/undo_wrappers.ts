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

export async function createPersonUndo(
  db: Database,
  data: Parameters<typeof persons.createPerson>[1]
): Promise<Person> {
  const result = await persons.createPerson(db, data);
  const id = result.id;
  const snapshot = JSON.parse(JSON.stringify(data));
  undoManager.push({
    label: 'undo.createPerson',
    undo: async () => { await persons.deletePerson(db, id); },
    redo: async () => { await persons.createPerson(db, snapshot); },
  });
  return result;
}

export async function updatePersonUndo(
  db: Database,
  id: string,
  data: Parameters<typeof persons.updatePerson>[2]
): Promise<Person | null> {
  const old = await persons.getPerson(db, id);
  if (!old) return null;
  const oldData = { sex: old.sex, notes: old.notes };
  const result = await persons.updatePerson(db, id, data);
  const newData = { ...data };
  undoManager.push({
    label: 'undo.updatePerson',
    undo: async () => { await persons.updatePerson(db, id, oldData); },
    redo: async () => { await persons.updatePerson(db, id, newData); },
  });
  return result;
}

export async function deletePersonUndo(
  db: Database,
  id: string
): Promise<boolean> {
  const person = await persons.getPerson(db, id);
  if (!person) return false;
  const names = await persons.getPersonNames(db, id);
  const rels = await relationships.getRelationshipsOfPerson(db, id);
  const personEvents = await events.getEventsForPerson(db, id);
  const participantsByEvent: Record<string, EventParticipant[]> = {};
  for (const ev of personEvents) {
    participantsByEvent[ev.id] = await relationships.getEventParticipants(db, ev.id);
  }
  const identifiers = await persons.getPersonIdentifiers(db, id);

  const result = await persons.deletePerson(db, id);
  if (!result) return false;

  undoManager.push({
    label: 'undo.deletePerson',
    undo: async () => {
      // Restore the row exactly as it was, including display_id — undo means
      // "as if the delete never happened", not "create a new row with similar
      // data". The unique partial index on display_id permits this because
      // the delete freed the integer; if a concurrent write took it
      // (extremely unlikely on this single-user DB) the restore errors loudly,
      // which is the right behavior.
      await runSql(db,
        `INSERT INTO persons (id, sex, notes, display_id) VALUES (?, ?, ?, ?)`,
        [person.id, person.sex, person.notes, person.display_id]
      );
      for (const name of names) {
        await runSql(db,
          `INSERT INTO person_names (id, person_id, given_name, surname, name_type, date_from, date_to, sort_order, name_prefix, name_suffix, patronymic_base, name_qualifier, preferred_name, nickname) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [name.id, name.person_id, name.given_name, name.surname, name.name_type, name.date_from, name.date_to, name.sort_order, name.name_prefix, name.name_suffix, name.patronymic_base, name.name_qualifier, name.preferred_name, name.nickname]
        );
      }
      for (const ident of identifiers) {
        await runSql(db,
          `INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value, created_at) VALUES (?, ?, ?, ?, ?)`,
          [ident.id, ident.person_id, ident.identifier_type, ident.identifier_value, ident.created_at]
        );
      }
      for (const rel of rels) {
        const existing = await relationships.getRelationship(db, rel.id);
        if (!existing) {
          await runSql(db,
            `INSERT INTO relationships (id, type, person1_id, person2_id, subtype, notes) VALUES (?, ?, ?, ?, ?, ?)`,
            [rel.id, rel.type, rel.person1_id, rel.person2_id, rel.subtype, rel.notes]
          );
        }
      }
      for (const ev of personEvents) {
        const existing = await events.getEvent(db, ev.id);
        if (!existing) {
          await runSql(db,
            `INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, place_address, cause, value, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ev.id, ev.event_type, ev.relationship_id, ev.date_type, ev.date_value, ev.date_value_end, ev.date_original, ev.place_id, ev.place_address, ev.cause, ev.value, ev.notes]
          );
        }
        const parts = participantsByEvent[ev.id] || [];
        for (const p of parts) {
          try {
            await runSql(db,
              `INSERT INTO event_participants (id, event_id, person_id, role) VALUES (?, ?, ?, ?)`,
              [p.id, p.event_id, p.person_id, p.role]
            );
          } catch {
            // Participant may already exist
          }
        }
      }
    },
    redo: async () => { await persons.deletePerson(db, id); },
  });
  return true;
}

export async function createPersonWithEventUndo(
  db: Database,
  args: CreatePersonWithEventArgs,
): Promise<CreatePersonWithEventResult> {
  const result = await createPersonWithEventWorkflow(db, args);
  const personId = result.person.id;
  const eventId = result.event?.id ?? null;
  const citationId = result.citation?.id ?? null;
  const snapshot = JSON.parse(JSON.stringify(args)) as CreatePersonWithEventArgs;
  undoManager.push({
    label: 'undo.createPersonWithEvent',
    undo: async () => {
      if (citationId) await sources.deleteCitation(db, citationId);
      if (eventId) await events.deleteEvent(db, eventId);
      await persons.deletePerson(db, personId);
    },
    redo: async () => { await createPersonWithEventWorkflow(db, snapshot); },
  });
  return result;
}

// ---- PersonName ----

export async function addPersonNameUndo(
  db: Database,
  personId: string,
  data: Parameters<typeof persons.addPersonName>[2]
): Promise<PersonName> {
  const result = await persons.addPersonName(db, personId, data);
  const nameId = result.id;
  const snapshot = JSON.parse(JSON.stringify(data));
  undoManager.push({
    label: 'undo.addPersonName',
    undo: async () => { await persons.deletePersonName(db, nameId); },
    redo: async () => { await persons.addPersonName(db, personId, snapshot); },
  });
  return result;
}

export async function updatePersonNameUndo(
  db: Database,
  id: string,
  data: Parameters<typeof persons.updatePersonName>[2]
): Promise<PersonName | null> {
  const oldName = await queryOne<PersonName>(db, `SELECT * FROM person_names WHERE id = ?`, [id]);
  if (!oldName) return null;
  const oldData: Record<string, unknown> = {};
  for (const key of Object.keys(data) as string[]) {
    oldData[key] = (oldName as Record<string, unknown>)[key];
  }
  const result = await persons.updatePersonName(db, id, data);
  const newData = { ...data };
  undoManager.push({
    label: 'undo.updatePersonName',
    undo: async () => { await persons.updatePersonName(db, id, oldData as Parameters<typeof persons.updatePersonName>[2]); },
    redo: async () => { await persons.updatePersonName(db, id, newData); },
  });
  return result;
}

export async function deletePersonNameUndo(
  db: Database,
  id: string
): Promise<boolean> {
  const old = await queryOne<PersonName>(db, `SELECT * FROM person_names WHERE id = ?`, [id]);
  if (!old) return false;
  const result = await persons.deletePersonName(db, id);
  if (!result) return false;
  undoManager.push({
    label: 'undo.deletePersonName',
    undo: async () => {
      await runSql(db,
        `INSERT INTO person_names (id, person_id, given_name, surname, name_type, date_from, date_to, sort_order, name_prefix, name_suffix, patronymic_base, name_qualifier, preferred_name, nickname) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [old.id, old.person_id, old.given_name, old.surname, old.name_type, old.date_from, old.date_to, old.sort_order, old.name_prefix, old.name_suffix, old.patronymic_base, old.name_qualifier, old.preferred_name, old.nickname]
      );
    },
    redo: async () => { await persons.deletePersonName(db, id); },
  });
  return true;
}

// ---- Event ----

export async function createEventUndo(
  db: Database,
  data: Parameters<typeof events.createEvent>[1]
): Promise<GenealogyEvent> {
  const result = await events.createEvent(db, data);
  const id = result.id;
  const snapshot = JSON.parse(JSON.stringify(data));
  undoManager.push({
    label: 'undo.createEvent',
    undo: async () => { await events.deleteEvent(db, id); },
    redo: async () => { await events.createEvent(db, snapshot); },
  });
  return result;
}

export async function updateEventUndo(
  db: Database,
  id: string,
  data: Parameters<typeof events.updateEvent>[2]
): Promise<GenealogyEvent | null> {
  const old = await events.getEvent(db, id);
  if (!old) return null;
  const oldData: Record<string, unknown> = {};
  for (const key of Object.keys(data) as string[]) {
    oldData[key] = (old as Record<string, unknown>)[key];
  }
  const result = await events.updateEvent(db, id, data);
  const newData = { ...data };
  undoManager.push({
    label: 'undo.updateEvent',
    undo: async () => { await events.updateEvent(db, id, oldData as Parameters<typeof events.updateEvent>[2]); },
    redo: async () => { await events.updateEvent(db, id, newData); },
  });
  return result;
}

export async function deleteEventUndo(
  db: Database,
  id: string
): Promise<boolean> {
  const old = await events.getEvent(db, id);
  if (!old) return false;
  const participants = await relationships.getEventParticipants(db, id);
  const result = await events.deleteEvent(db, id);
  if (!result) return false;
  undoManager.push({
    label: 'undo.deleteEvent',
    undo: async () => {
      await runSql(db,
        `INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, place_address, cause, value, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [old.id, old.event_type, old.relationship_id, old.date_type, old.date_value, old.date_value_end, old.date_original, old.place_id, old.place_address, old.cause, old.value, old.notes]
      );
      for (const p of participants) {
        try {
          await runSql(db,
            `INSERT INTO event_participants (id, event_id, person_id, role) VALUES (?, ?, ?, ?)`,
            [p.id, p.event_id, p.person_id, p.role]
          );
        } catch {
          // ignore if person no longer exists
        }
      }
    },
    redo: async () => { await events.deleteEvent(db, id); },
  });
  return true;
}

// ---- EventParticipant ----

export async function addEventParticipantUndo(
  db: Database,
  data: Parameters<typeof relationships.addEventParticipant>[1]
): Promise<EventParticipant> {
  const result = await relationships.addEventParticipant(db, data);
  const id = result.id;
  const snapshot = JSON.parse(JSON.stringify(data));
  undoManager.push({
    label: 'undo.addEventParticipant',
    undo: async () => { await relationships.removeEventParticipant(db, id); },
    redo: async () => { await relationships.addEventParticipant(db, snapshot); },
  });
  return result;
}

export async function removeEventParticipantUndo(
  db: Database,
  id: string
): Promise<boolean> {
  const old = await queryOne<EventParticipant>(db, `SELECT * FROM event_participants WHERE id = ?`, [id]);
  if (!old) return false;
  const result = await relationships.removeEventParticipant(db, id);
  if (!result) return false;
  undoManager.push({
    label: 'undo.removeEventParticipant',
    undo: async () => {
      await runSql(db,
        `INSERT INTO event_participants (id, event_id, person_id, role) VALUES (?, ?, ?, ?)`,
        [old.id, old.event_id, old.person_id, old.role]
      );
    },
    redo: async () => { await relationships.removeEventParticipant(db, id); },
  });
  return true;
}

// ---- Relationship ----

export async function createRelationshipUndo(
  db: Database,
  data: Parameters<typeof relationships.createRelationship>[1]
): Promise<Relationship> {
  const result = await relationships.createRelationship(db, data);
  const id = result.id;
  const snapshot = JSON.parse(JSON.stringify(data));
  undoManager.push({
    label: 'undo.createRelationship',
    undo: async () => { await relationships.deleteRelationship(db, id); },
    redo: async () => { await relationships.createRelationship(db, snapshot); },
  });
  return result;
}

export async function updateRelationshipUndo(
  db: Database,
  id: string,
  data: Parameters<typeof relationships.updateRelationship>[2]
): Promise<Relationship | null> {
  const old = await relationships.getRelationship(db, id);
  if (!old) return null;
  const oldData: Record<string, unknown> = {};
  for (const key of Object.keys(data) as string[]) {
    oldData[key] = (old as Record<string, unknown>)[key];
  }
  const result = await relationships.updateRelationship(db, id, data);
  const newData = { ...data };
  undoManager.push({
    label: 'undo.updateRelationship',
    undo: async () => { await relationships.updateRelationship(db, id, oldData as Parameters<typeof relationships.updateRelationship>[2]); },
    redo: async () => { await relationships.updateRelationship(db, id, newData); },
  });
  return result;
}

export async function deleteRelationshipUndo(
  db: Database,
  id: string
): Promise<boolean> {
  const old = await relationships.getRelationship(db, id);
  if (!old) return false;
  const relEvents = await events.getEventsForRelationship(db, id);
  const result = await relationships.deleteRelationship(db, id);
  if (!result) return false;
  undoManager.push({
    label: 'undo.deleteRelationship',
    undo: async () => {
      await runSql(db,
        `INSERT INTO relationships (id, type, person1_id, person2_id, subtype, notes) VALUES (?, ?, ?, ?, ?, ?)`,
        [old.id, old.type, old.person1_id, old.person2_id, old.subtype, old.notes]
      );
      for (const ev of relEvents) {
        const existing = await events.getEvent(db, ev.id);
        if (!existing) {
          await runSql(db,
            `INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, place_address, cause, value, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ev.id, ev.event_type, ev.relationship_id, ev.date_type, ev.date_value, ev.date_value_end, ev.date_original, ev.place_id, ev.place_address, ev.cause, ev.value, ev.notes]
          );
        }
      }
    },
    redo: async () => { await relationships.deleteRelationship(db, id); },
  });
  return true;
}

// ---- Source ----

export async function createSourceUndo(
  db: Database,
  data: Parameters<typeof sources.createSource>[1]
): Promise<Source> {
  const result = await sources.createSource(db, data);
  const id = result.id;
  const snapshot = JSON.parse(JSON.stringify(data));
  undoManager.push({
    label: 'undo.createSource',
    undo: async () => { await sources.deleteSource(db, id); },
    redo: async () => { await sources.createSource(db, snapshot); },
  });
  return result;
}

export async function updateSourceUndo(
  db: Database,
  id: string,
  data: Parameters<typeof sources.updateSource>[2]
): Promise<Source | null> {
  const old = await sources.getSource(db, id);
  if (!old) return null;
  const oldData: Record<string, unknown> = {};
  for (const key of Object.keys(data) as string[]) {
    oldData[key] = (old as Record<string, unknown>)[key];
  }
  const result = await sources.updateSource(db, id, data);
  const newData = { ...data };
  undoManager.push({
    label: 'undo.updateSource',
    undo: async () => { await sources.updateSource(db, id, oldData as Parameters<typeof sources.updateSource>[2]); },
    redo: async () => { await sources.updateSource(db, id, newData); },
  });
  return result;
}

export async function deleteSourceUndo(
  db: Database,
  id: string
): Promise<boolean> {
  const old = await sources.getSource(db, id);
  if (!old) return false;
  const citations = await sources.getCitationsForSource(db, id);
  const result = await sources.deleteSource(db, id);
  if (!result) return false;
  undoManager.push({
    label: 'undo.deleteSource',
    undo: async () => {
      await runSql(db,
        `INSERT INTO sources (id, title, author, publication_info, url, source_type, call_number, abstract) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [old.id, old.title, old.author, old.publication_info, old.url, old.source_type, old.call_number, old.abstract]
      );
      for (const c of citations) {
        await runSql(db,
          `INSERT INTO citations (id, source_id, page, date_accessed, confidence, transcription, notes, event_id, person_id, relationship_id, place_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.id, c.source_id, c.page, c.date_accessed, c.confidence, c.transcription, c.notes, c.event_id, c.person_id, c.relationship_id, c.place_id]
        );
      }
    },
    redo: async () => { await sources.deleteSource(db, id); },
  });
  return true;
}

// ---- Citation ----

export async function createCitationUndo(
  db: Database,
  data: Parameters<typeof sources.createCitation>[1]
): Promise<Citation> {
  const result = await sources.createCitation(db, data);
  const id = result.id;
  const snapshot = JSON.parse(JSON.stringify(data));
  undoManager.push({
    label: 'undo.createCitation',
    undo: async () => { await sources.deleteCitation(db, id); },
    redo: async () => { await sources.createCitation(db, snapshot); },
  });
  return result;
}

export async function updateCitationUndo(
  db: Database,
  id: string,
  data: Parameters<typeof sources.updateCitation>[2]
): Promise<Citation | null> {
  const old = await sources.getCitation(db, id);
  if (!old) return null;
  const oldData: Record<string, unknown> = {};
  for (const key of Object.keys(data) as string[]) {
    oldData[key] = (old as Record<string, unknown>)[key];
  }
  const result = await sources.updateCitation(db, id, data);
  const newData = { ...data };
  undoManager.push({
    label: 'undo.updateCitation',
    undo: async () => { await sources.updateCitation(db, id, oldData as Parameters<typeof sources.updateCitation>[2]); },
    redo: async () => { await sources.updateCitation(db, id, newData); },
  });
  return result;
}

export async function deleteCitationUndo(
  db: Database,
  id: string
): Promise<boolean> {
  const old = await sources.getCitation(db, id);
  if (!old) return false;
  const result = await sources.deleteCitation(db, id);
  if (!result) return false;
  undoManager.push({
    label: 'undo.deleteCitation',
    undo: async () => {
      await runSql(db,
        `INSERT INTO citations (id, source_id, page, date_accessed, confidence, transcription, notes, event_id, person_id, relationship_id, place_id, person_name_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [old.id, old.source_id, old.page, old.date_accessed, old.confidence, old.transcription, old.notes, old.event_id, old.person_id, old.relationship_id, old.place_id, old.person_name_id]
      );
    },
    redo: async () => { await sources.deleteCitation(db, id); },
  });
  return true;
}

// Re-export for convenience
export { undoManager } from './undo';
