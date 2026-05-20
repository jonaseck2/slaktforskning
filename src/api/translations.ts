/**
 * Name + place translations (T07 — GEDCOM alignment plan).
 *
 * GEDCOM 7.0 NAME and PLAC structures both accept TRAN substructures with
 * LANG and (optional) transliteration scheme qualifiers. We model this as
 * two parallel CRUD surfaces — one per parent table.
 *
 *   name_translations:  attached to person_names.id (CASCADE)
 *   place_translations: attached to places.id        (CASCADE)
 *
 * 5.5.1 has no clean equivalent: name translations degrade to additional
 * `1 NAME <value>` blocks with `2 TYPE <lang>` (a common 5.5.1 convention
 * for alternate-language names — lossy on the transliteration scheme).
 * Place translations are dropped entirely with a disclosure warning.
 * The fidelity registry encodes the lossy-vs-lossless split per version.
 */

import type { Database } from 'node-sqlite3-wasm';
import type { NameTranslation, PlaceTranslation } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

// ── Name translations CRUD ──────────────────────────────────────────────────

export async function createNameTranslation(
  db: Database,
  data: { person_name_id: string; value: string; language?: string; transliteration_scheme?: string },
): Promise<NameTranslation> {
  const id = crypto.randomUUID();
  await runSql(
    db,
    'INSERT INTO name_translations (id, person_name_id, value, language, transliteration_scheme) VALUES (?, ?, ?, ?, ?)',
    [id, data.person_name_id, data.value, data.language ?? '', data.transliteration_scheme ?? ''],
  );
  return (await queryOne<NameTranslation>(db, 'SELECT * FROM name_translations WHERE id = ?', [id]))!;
}

export async function getTranslationsForName(
  db: Database,
  personNameId: string,
): Promise<NameTranslation[]> {
  return await queryAll<NameTranslation>(
    db,
    'SELECT * FROM name_translations WHERE person_name_id = ? ORDER BY created_at ASC, id ASC',
    [personNameId],
  );
}

export async function updateNameTranslation(
  db: Database,
  id: string,
  updates: Partial<Pick<NameTranslation, 'value' | 'language' | 'transliteration_scheme'>>,
): Promise<NameTranslation | null> {
  const fields: string[] = [];
  const vals: unknown[] = [];
  if ('value' in updates) { fields.push('value = ?'); vals.push(updates.value); }
  if ('language' in updates) { fields.push('language = ?'); vals.push(updates.language ?? ''); }
  if ('transliteration_scheme' in updates) { fields.push('transliteration_scheme = ?'); vals.push(updates.transliteration_scheme ?? ''); }
  if (fields.length === 0) return (await queryOne<NameTranslation>(db, 'SELECT * FROM name_translations WHERE id = ?', [id])) ?? null;
  await runSql(db, `UPDATE name_translations SET ${fields.join(', ')} WHERE id = ?`, [...vals, id]);
  return (await queryOne<NameTranslation>(db, 'SELECT * FROM name_translations WHERE id = ?', [id])) ?? null;
}

export async function deleteNameTranslation(db: Database, id: string): Promise<boolean> {
  return (await runSqlChanges(db, 'DELETE FROM name_translations WHERE id = ?', [id])) > 0;
}

// ── Place translations CRUD ─────────────────────────────────────────────────

export async function createPlaceTranslation(
  db: Database,
  data: { place_id: string; value: string; language?: string; transliteration_scheme?: string },
): Promise<PlaceTranslation> {
  const id = crypto.randomUUID();
  await runSql(
    db,
    'INSERT INTO place_translations (id, place_id, value, language, transliteration_scheme) VALUES (?, ?, ?, ?, ?)',
    [id, data.place_id, data.value, data.language ?? '', data.transliteration_scheme ?? ''],
  );
  return (await queryOne<PlaceTranslation>(db, 'SELECT * FROM place_translations WHERE id = ?', [id]))!;
}

export async function getTranslationsForPlace(
  db: Database,
  placeId: string,
): Promise<PlaceTranslation[]> {
  return await queryAll<PlaceTranslation>(
    db,
    'SELECT * FROM place_translations WHERE place_id = ? ORDER BY created_at ASC, id ASC',
    [placeId],
  );
}

export async function updatePlaceTranslation(
  db: Database,
  id: string,
  updates: Partial<Pick<PlaceTranslation, 'value' | 'language' | 'transliteration_scheme'>>,
): Promise<PlaceTranslation | null> {
  const fields: string[] = [];
  const vals: unknown[] = [];
  if ('value' in updates) { fields.push('value = ?'); vals.push(updates.value); }
  if ('language' in updates) { fields.push('language = ?'); vals.push(updates.language ?? ''); }
  if ('transliteration_scheme' in updates) { fields.push('transliteration_scheme = ?'); vals.push(updates.transliteration_scheme ?? ''); }
  if (fields.length === 0) return (await queryOne<PlaceTranslation>(db, 'SELECT * FROM place_translations WHERE id = ?', [id])) ?? null;
  await runSql(db, `UPDATE place_translations SET ${fields.join(', ')} WHERE id = ?`, [...vals, id]);
  return (await queryOne<PlaceTranslation>(db, 'SELECT * FROM place_translations WHERE id = ?', [id])) ?? null;
}

export async function deletePlaceTranslation(db: Database, id: string): Promise<boolean> {
  return (await runSqlChanges(db, 'DELETE FROM place_translations WHERE id = ?', [id])) > 0;
}
