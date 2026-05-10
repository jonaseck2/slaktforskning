import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from './db';
import { livingSqlExpr } from './personLiving';
import { displayedNameIdSql } from './persons';

// CSV exports the displayed name only — by design.
// CSV is a single-row-per-person flat format and cannot represent multiple
// person_names records (birth + married + alias …). Do NOT bake the
// "Anna (f. Svensson)" parenthetical form into the surname/given_name cells:
// re-importing that CSV would round-trip the parenthetical as a literal
// string, immediately tripping the LIKELY_INLINE_BIRTH_NAME quality check
// against our own export. For lossless multi-name round-trip use GEDCOM
// or the .zip archive (see plan birth-name-display-and-quality-check.md).

export interface CsvOptions {
  delimiter?: string;
  encoding?: 'utf-8' | 'utf-8-bom';
}

function csvRow(fields: (string | number | boolean | null | undefined)[], delimiter: string): string {
  return fields.map(f => {
    if (f == null) return '';
    const s = String(f);
    if (s.includes(delimiter) || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }).join(delimiter);
}

function wrapCsv(lines: string[], options: CsvOptions): string {
  const csv = lines.join('\n') + '\n';
  return options.encoding === 'utf-8-bom' ? '\uFEFF' + csv : csv;
}

export async function exportPersonsCsv(db: Database, options: CsvOptions = {}): Promise<string> {
  const delimiter = options.delimiter ?? ',';
  const headers = ['id', 'given_name', 'surname', 'sex', 'living', 'birth_date', 'birth_place', 'death_date', 'death_place', 'notes'];

  const rows = await queryAll<{
    id: string;
    given_name: string | null;
    surname: string | null;
    sex: string;
    living: number;
    notes: string | null;
    birth_date: string | null;
    birth_place: string | null;
    death_date: string | null;
    death_place: string | null;
  }>(db, `
    SELECT
      p.id,
      pn.given_name,
      pn.surname,
      p.sex,
      ${livingSqlExpr('p')} AS living,
      p.notes,
      (SELECT e.date_value FROM events e JOIN event_participants ep ON ep.event_id = e.id
       WHERE ep.person_id = p.id AND e.event_type = 'birth' LIMIT 1) AS birth_date,
      (SELECT pl.name FROM events e JOIN event_participants ep ON ep.event_id = e.id
       LEFT JOIN places pl ON pl.id = e.place_id
       WHERE ep.person_id = p.id AND e.event_type = 'birth' LIMIT 1) AS birth_place,
      (SELECT e.date_value FROM events e JOIN event_participants ep ON ep.event_id = e.id
       WHERE ep.person_id = p.id AND e.event_type = 'death' LIMIT 1) AS death_date,
      (SELECT pl.name FROM events e JOIN event_participants ep ON ep.event_id = e.id
       LEFT JOIN places pl ON pl.id = e.place_id
       WHERE ep.person_id = p.id AND e.event_type = 'death' LIMIT 1) AS death_place
    FROM persons p
    LEFT JOIN person_names pn ON pn.id = ${displayedNameIdSql('p.id')}
    ORDER BY pn.surname, pn.given_name
  `);

  const lines = [csvRow(headers, delimiter)];
  for (const r of rows) {
    lines.push(csvRow([
      r.id, r.given_name, r.surname, r.sex,
      r.living ? 'true' : 'false',
      r.birth_date, r.birth_place,
      r.death_date, r.death_place,
      r.notes,
    ], delimiter));
  }

  return wrapCsv(lines, options);
}

export async function exportEventsCsv(db: Database, options: CsvOptions = {}): Promise<string> {
  const delimiter = options.delimiter ?? ',';
  const headers = ['id', 'event_type', 'date_type', 'date_value', 'date_original', 'place_name', 'value', 'notes', 'person_names'];

  const events = await queryAll<{
    id: string;
    event_type: string;
    date_type: string | null;
    date_value: string | null;
    date_original: string | null;
    place_name: string | null;
    value: string | null;
    notes: string | null;
  }>(db, `
    SELECT
      e.id,
      e.event_type,
      e.date_type,
      e.date_value,
      e.date_original,
      pl.name AS place_name,
      e.value,
      e.notes
    FROM events e
    LEFT JOIN places pl ON pl.id = e.place_id
    ORDER BY e.date_value, e.event_type
  `);

  // Build participant names map
  const participants = await queryAll<{
    event_id: string;
    given_name: string | null;
    surname: string | null;
  }>(db, `
    SELECT
      ep.event_id,
      pn.given_name,
      pn.surname
    FROM event_participants ep
    JOIN person_names pn ON pn.id = ${displayedNameIdSql('ep.person_id')}
    ORDER BY ep.event_id
  `);

  const namesByEvent = new Map<string, string[]>();
  for (const p of participants) {
    const name = [p.given_name, p.surname].filter(Boolean).join(' ');
    if (!namesByEvent.has(p.event_id)) namesByEvent.set(p.event_id, []);
    namesByEvent.get(p.event_id)!.push(name);
  }

  const lines = [csvRow(headers, delimiter)];
  for (const e of events) {
    const names = namesByEvent.get(e.id)?.join(', ') ?? '';
    lines.push(csvRow([
      e.id, e.event_type, e.date_type, e.date_value,
      e.date_original, e.place_name, e.value, e.notes, names,
    ], delimiter));
  }

  return wrapCsv(lines, options);
}

export async function exportSourcesCsv(db: Database, options: CsvOptions = {}): Promise<string> {
  const delimiter = options.delimiter ?? ',';
  const headers = ['id', 'title', 'author', 'publication_info', 'repository', 'url', 'source_type', 'call_number', 'abstract'];

  const rows = await queryAll<{
    id: string;
    title: string | null;
    author: string | null;
    publication_info: string | null;
    repository: string | null;
    url: string | null;
    source_type: string | null;
    call_number: string | null;
    abstract: string | null;
  }>(db, `SELECT id, title, author, publication_info, repository, url, source_type, call_number, abstract FROM sources ORDER BY title`);

  const lines = [csvRow(headers, delimiter)];
  for (const r of rows) {
    lines.push(csvRow([
      r.id, r.title, r.author, r.publication_info,
      r.repository, r.url, r.source_type, r.call_number, r.abstract,
    ], delimiter));
  }

  return wrapCsv(lines, options);
}

export async function exportPlacesCsv(db: Database, options: CsvOptions = {}): Promise<string> {
  const delimiter = options.delimiter ?? ',';
  const headers = ['id', 'name', 'place_type', 'parent_place_name', 'latitude', 'longitude', 'street', 'postal_code', 'city', 'country'];

  const rows = await queryAll<{
    id: string;
    name: string;
    place_type: string | null;
    parent_place_name: string | null;
    latitude: number | null;
    longitude: number | null;
    street: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
  }>(db, `
    SELECT
      p.id,
      p.name,
      p.place_type,
      pp.name AS parent_place_name,
      p.latitude,
      p.longitude,
      p.street,
      p.postal_code,
      p.city,
      p.country
    FROM places p
    LEFT JOIN places pp ON pp.id = p.parent_place_id
    ORDER BY p.name
  `);

  const lines = [csvRow(headers, delimiter)];
  for (const r of rows) {
    lines.push(csvRow([
      r.id, r.name, r.place_type, r.parent_place_name,
      r.latitude, r.longitude, r.street, r.postal_code,
      r.city, r.country,
    ], delimiter));
  }

  return wrapCsv(lines, options);
}
