import type { Database } from 'node-sqlite3-wasm';
import * as personApi from './persons';
import * as eventApi from './events';
import * as relationshipApi from './relationships';
import * as placeApi from './places';
import * as sourceApi from './sources';
import type { Citation, GenealogyEvent, Person } from './types';

export interface PersonEventInput {
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end?: string | null;
  date_original: string;
  place_id: string | null;
  /** If place_id is null and place_name is provided, findOrCreatePlace is called. */
  place_name?: string | null;
  notes: string;
  cause: string | null;
}

export interface CreatePersonWithEventArgs {
  given_name?: string;
  surname?: string;
  sex?: Person['sex'];
  notes?: string;
  event?: PersonEventInput;
  citation?: {
    source_id: string;
    page?: string;
    confidence?: number;
    transcription?: string;
    notes?: string;
    date_accessed?: string;
  };
}

export interface CreatePersonWithEventResult {
  person: Person;
  event: GenealogyEvent | null;
  citation: Citation | null;
}

function _core(db: Database, args: CreatePersonWithEventArgs): CreatePersonWithEventResult {
  const person = personApi.createPerson(db, {
    given_name: args.given_name,
    surname: args.surname,
    sex: args.sex,
    notes: args.notes,
  });

  let event: GenealogyEvent | null = null;
  let citation: Citation | null = null;

  if (args.event) {
    let place_id: string | null = args.event.place_id;
    if (!place_id && args.event.place_name && args.event.place_name.trim()) {
      const place = placeApi.findOrCreatePlace(db, args.event.place_name.trim());
      place_id = place.id;
    }

    event = eventApi.createEvent(db, {
      event_type: args.event.event_type,
      date_type: args.event.date_type as GenealogyEvent['date_type'],
      date_value: args.event.date_value,
      date_value_end: args.event.date_value_end ?? null,
      date_original: args.event.date_original,
      place_id,
      notes: args.event.notes,
      cause: args.event.cause,
    });

    relationshipApi.addEventParticipant(db, {
      event_id: event.id,
      person_id: person.id,
      role: 'primary',
    });

    if (args.citation) {
      citation = sourceApi.createCitation(db, {
        source_id: args.citation.source_id,
        event_id: event.id,
        person_id: person.id,
        page: args.citation.page ?? '',
        confidence: args.citation.confidence ?? 2,
        transcription: args.citation.transcription ?? '',
        notes: args.citation.notes ?? '',
        date_accessed: args.citation.date_accessed ?? '',
      });
    }
  }

  return { person, event, citation };
}

export function createPersonWithEventWorkflow(
  db: Database,
  args: CreatePersonWithEventArgs,
): CreatePersonWithEventResult {
  db.exec('BEGIN');
  try {
    const result = _core(db, args);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
