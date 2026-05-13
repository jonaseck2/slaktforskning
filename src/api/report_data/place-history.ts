import type { Database } from 'node-sqlite3-wasm';
import { getPersonNames } from '../persons';
import { getEventParticipants } from '../relationships';
import { getPlace, getPlacePath } from '../places';
import { queryAll } from '../db';
import type { GenealogyEvent } from '../types';
import type { EventWithPlace } from './types';
import { resolveEventPlace, getPrimaryName, getBirthSurnameForDisplay } from './shared';

export interface PlaceEventRecord {
  event: EventWithPlace;
  participants: Array<{
    person_id: string;
    given_name: string;
    surname: string;
    /**
     * Birth-type record's surname when distinct from `surname`.
     * Display-only — composed at render time as "(f. …)" / "(b. …)" when the
     * Place Chronicle report's birth-name toggle is on. See plan
     * birth-name-display-and-quality-check.
     */
    birth_surname: string | null;
    role: string;
  }>;
}

export interface PlaceHistory {
  place_id: string;
  place_name: string;
  place_path: string;
  events: PlaceEventRecord[];
}

/**
 * Returns all events at a place, chronologically, with participant names and roles.
 */
export async function getPlaceHistory(db: Database, placeId: string): Promise<PlaceHistory | null> {
  const place = await getPlace(db, placeId);
  if (!place) return null;

  const rawEvents = await queryAll<GenealogyEvent>(db,
    `SELECT * FROM events WHERE place_id = ? ORDER BY date_value ASC`,
    [placeId]
  );

  const events: PlaceEventRecord[] = [];
  for (const event of rawEvents) {
    const eventWithPlace = await resolveEventPlace(db, event);
    const rawParticipants = await getEventParticipants(db, event.id);
    const participants = [];
    for (const ep of rawParticipants) {
      const names = await getPersonNames(db, ep.person_id);
      const primary = getPrimaryName(names);
      const birthSurname = getBirthSurnameForDisplay(names);
      participants.push({
        person_id: ep.person_id,
        given_name: primary.given_name,
        surname: primary.surname,
        birth_surname: birthSurname,
        role: ep.role,
      });
    }
    events.push({ event: eventWithPlace, participants });
  }

  return {
    place_id: placeId,
    place_name: place.name,
    place_path: await getPlacePath(db, placeId),
    events,
  };
}
