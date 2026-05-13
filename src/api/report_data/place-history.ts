import type { Database } from 'node-sqlite3-wasm';
import { getPersonNames } from '../persons';
import { getEventParticipants } from '../relationships';
import { getPlace, getPlacePath } from '../places';
import { queryAll } from '../db';
import type { GenealogyEvent, PersonName } from '../types';
import type { EventWithPlace } from './types';

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

// ── Local helpers ──
// Duplicated from `report_data.ts` during the split; Task 11 of the plan will
// extract genuinely-shared scaffolding to `shared.ts` if ≥2 reports use it
// with identical shape.

async function resolveEventPlace(db: Database, event: GenealogyEvent): Promise<EventWithPlace> {
  let place_name: string | null = null;
  let place_path: string | null = null;
  if (event.place_id) {
    const place = await getPlace(db, event.place_id);
    place_name = place?.name ?? null;
    place_path = await getPlacePath(db, event.place_id);
  }
  return { ...event, place_name, place_path };
}

function getPrimaryName(names: PersonName[]): { given_name: string; surname: string } {
  if (names.length === 0) return { given_name: '', surname: '' };
  const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  return { given_name: sorted[0].given_name ?? '', surname: sorted[0].surname ?? '' };
}

/**
 * Display-only helper: returns the lowest-`sort_order` `birth`-type record's
 * surname when distinct from the primary record's surname, else null.
 */
function getBirthSurnameForDisplay(names: PersonName[]): string | null {
  if (names.length === 0) return null;
  const primarySorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  const primary = primarySorted[0];
  const births = names.filter(n => n.name_type === 'birth')
    .sort((a, b) => a.sort_order - b.sort_order);
  const birth = births[0];
  if (!birth) return null;
  if (birth.id === primary.id) return null;
  const birthSurname = (birth.surname ?? '').trim();
  if (!birthSurname) return null;
  if (birthSurname === (primary.surname ?? '').trim()) return null;
  return birthSurname;
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
