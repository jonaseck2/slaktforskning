/**
 * Name / place translation emitter — T02 scaffold; filled by T07.
 *
 * GEDCOM 7.0: `NAME` and `PLAC` both accept `TRAN <value>` substructures
 * with `LANG` and `TYPE` (transliteration scheme) qualifiers. 5.5.1 has
 * neither structure; this column is lossy on 5.5.1 by design.
 */

import type { Database } from 'node-sqlite3-wasm';

/**
 * Emit `${baseLevel} TRAN <value>` blocks for every `name_translations` row
 * attached to `personNameId`. Each row produces:
 *
 *     <baseLevel>   TRAN <value>
 *     <baseLevel+1> LANG <language>            (optional)
 *     <baseLevel+1> TYPE <transliteration_scheme>   (optional)
 *
 * **T02 stub:** no emission. T07 implements.
 */
export async function emitNameTranslations(
  _db: Database,
  _personNameId: string,
  _baseLevel: number,
  _version: '5.5.1' | '7.0',
  _lines: string[],
): Promise<void> {
  // T07 implements.
}

/**
 * Emit `${baseLevel} TRAN <value>` blocks for every `place_translations`
 * row attached to `placeId`. Same shape as `emitNameTranslations`.
 *
 * **T02 stub:** no emission. T07 implements.
 */
export async function emitPlaceTranslations(
  _db: Database,
  _placeId: string,
  _baseLevel: number,
  _version: '5.5.1' | '7.0',
  _lines: string[],
): Promise<void> {
  // T07 implements.
}
