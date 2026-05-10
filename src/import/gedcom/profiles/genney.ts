/**
 * Genney 4.1-specific import profile.
 *
 * Genney extensions handled here:
 *  - Swedish hierarchical place resolution (findOrCreateSwedishPlace)
 *  - Patronymic detection from surnames (extractPatronymic)
 *  - Preferred-name asterisk notation in given names
 *  - _UID → person_identifiers (Genney internal ID)
 *  - _YHAPLOGROUP / _MHAPLOGROUP → notes
 *
 * These features are enabled when ImportOptions.profile === 'genney'.
 */

import type { Database } from 'node-sqlite3-wasm';
import type { Place } from '../../../api/types';
import { findOrCreateSwedishPlace } from '../../../gedcom/swedishPlace';
import { extractPatronymic } from '../../../gedcom/swedishNames';

export { extractPatronymic };

/**
 * Place-resolution function for Genney imports.
 * Uses Swedish hierarchical place resolution instead of the generic findOrCreate.
 */
export async function resolvePlaceFn(db: Database, name: string): Promise<Place> {
  return await findOrCreateSwedishPlace(db, name);
}

/**
 * Given a raw surname string, return the patronymic base (or null).
 * Called for every name when profile === 'genney'.
 */
export function getPatronymicBase(surname: string | null): string | null {
  return surname ? extractPatronymic(surname) : null;
}
