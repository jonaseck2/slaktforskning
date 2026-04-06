/**
 * Holger ElevateDB → Släktforskning transform.
 *
 * Reads the NDJSON emitted by EDBExtractor.py (one row per line, type field
 * identifies source table: 'perstab' | 'vigtab' | 'anmtab') and writes to the
 * SQLite database via the api/ layer.
 *
 * Perstab column → our model mapping:
 *   fornamn                → PersonName.given_name (birth)
 *   patronym               → PersonName with patronym_base (if non-empty)
 *   efternamn              → PersonName.surname (birth)
 *   konkod ('M'/'K')      → Person.sex ('M'/'F'/'U')
 *   fodat + fodatkod       → birth GenealogyEvent
 *   fodort + fodfs         → birth event place_address
 *   dopdat                 → baptism GenealogyEvent
 *   dodat                  → death GenealogyEvent + Person.living=false
 *   dodort + dodfs         → death event place_address
 *   dodors                 → death event cause
 *   begdat                 → burial GenealogyEvent
 *   yrke                   → occupation GenealogyEvent
 *   hemort + hemfs         → residence GenealogyEvent
 *   anm1 + anm2            → Person.notes (concatenated)
 *
 * Vigtab rows (couple events) are currently emitted but not imported because
 * the FK link to person RowIDs requires decoding the .EDBIdx index, which is
 * deferred to a future task.
 *
 * Anmtab rows carry a fktabell (FK → Perstab.__RowID) but the rich-text blob
 * content lives in Anmtab.EDBBlb which is not yet decoded. Only the FK link
 * is used to associate future blob content with persons.
 */

import type { Database } from 'node-sqlite3-wasm';
import { createPerson, addPersonName } from '../../api/persons';
import { createEvent } from '../../api/events';
import { addEventParticipant } from '../../api/relationships';
import { findOrCreatePlace } from '../../api/places';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// NDJSON row shapes emitted by EDBExtractor.py
// ---------------------------------------------------------------------------

export interface PerstabRow {
  type: 'perstab';
  __RowID: number;
  fornamn?: string;
  patronym?: string;
  efternamn?: string;
  konkod?: string;     // 'M' = male, 'K' = kvinna (female)
  fodat?: string;      // birth date ISO YYYY-MM-DD
  dopdat?: string;     // baptism date
  fodort?: string;     // birth place
  fodfs?: string;      // birth parish (födelseförsamling)
  dodat?: string;      // death date
  dodort?: string;     // death place
  dodfs?: string;      // death parish
  dodors?: string;     // cause of death (dödsorsak)
  begdat?: string;     // burial date
  yrke?: string;       // occupation
  hemort?: string;     // home place
  hemfs?: string;      // home parish
  anm1?: string;       // inline note 1
  anm2?: string;       // inline note 2
}

export interface VigtabRow {
  type: 'vigtab';
  __RowID: number;
  __person1_id: number;
  __person2_id: number;
  vigdat?: string;     // marriage/union date
  vigort?: string;     // marriage place
}

export interface AnmtabRow {
  type: 'anmtab';
  __RowID: number;
  fktabell: number;    // FK → Perstab.__RowID
}

export type EdbRow = PerstabRow | VigtabRow | AnmtabRow;

// ---------------------------------------------------------------------------
// Import result summary
// ---------------------------------------------------------------------------

export interface EdbImportSummary {
  persons: number;
  events: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map OurKind sex code to our Person.sex value. */
function mapSex(konkod: string | undefined): 'M' | 'F' | 'U' {
  if (konkod === 'M') return 'M';
  if (konkod === 'K') return 'F'; // K = kvinna (woman) in Swedish
  return 'U';
}

/**
 * Build a place_address string from separate place + parish fields.
 * Returns undefined if both are empty.
 */
function buildPlaceAddress(ort: string | undefined, fs: string | undefined): string | undefined {
  const parts = [ort, fs].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * Map an ISO date string (YYYY-MM-DD) from the EDB to our date_value format.
 * OurKind stores dates as ISO strings; we keep them as-is since our schema
 * also uses ISO for exact dates.
 *
 * Returns { date_type, date_value, date_original }.
 */
function mapDate(isoDate: string | undefined): {
  date_type: string;
  date_value: string;
  date_original: string;
} | null {
  if (!isoDate || isoDate.trim() === '') return null;
  const trimmed = isoDate.trim();
  return {
    date_type: 'exact',
    date_value: trimmed,
    date_original: trimmed,
  };
}

// ---------------------------------------------------------------------------
// Main transform
// ---------------------------------------------------------------------------

export function transformHolgerEdb(
  db: Database,
  rows: EdbRow[],
  onProgress?: (msg: string) => void,
): EdbImportSummary {
  const progress = (msg: string) => onProgress?.(msg);

  // Pre-compile statements for performance (avoid per-row db.prepare() cost)
  const stmtInsertPerson = db.prepare(`
    INSERT INTO persons (id, sex, living, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  const stmtInsertName = db.prepare(`
    INSERT INTO person_names (id, person_id, given_name, surname, name_type,
      patronymic_base, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const stmtInsertEvent = db.prepare(`
    INSERT INTO events (id, event_type, date_type, date_value, date_original,
      place_address, cause, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, COALESCE(?, ''), ?, ?, COALESCE(?, ''), datetime('now'), datetime('now'))
  `);
  const stmtInsertParticipant = db.prepare(`
    INSERT OR IGNORE INTO event_participants (id, event_id, person_id, role)
    VALUES (?, ?, ?, 'primary')
  `);

  // Map from Perstab __RowID → our persons.id (UUID) — for Anmtab/Vigtab lookup
  const rowIdToPersonId = new Map<number, string>();

  let personCount = 0;
  let eventCount = 0;
  let skipped = 0;

  const perstabRows = rows.filter((r): r is PerstabRow => r.type === 'perstab');
  const anmtabRows = rows.filter((r): r is AnmtabRow => r.type === 'anmtab');

  progress(`Importing ${perstabRows.length.toLocaleString()} persons…`);

  // --- Phase 1: Insert persons + names + events ---
  for (const row of perstabRows) {
    const { __RowID, fornamn, patronym, efternamn, konkod, anm1, anm2 } = row;

    // Skip records with no name at all
    if (!fornamn && !efternamn) {
      skipped++;
      continue;
    }

    // Determine living status: deceased if death date present
    const living = !row.dodat;

    // Build notes from inline annotation fields
    const notesParts: string[] = [];
    if (anm1) notesParts.push(anm1.trim());
    if (anm2) notesParts.push(anm2.trim());
    const notes = notesParts.join('\n') || '';

    // Insert person
    const personId = uuidv4();
    stmtInsertPerson.run([personId, mapSex(konkod), living ? 1 : 0, notes]);
    rowIdToPersonId.set(__RowID, personId);
    personCount++;

    // Insert primary name (birth name)
    const nameId = uuidv4();
    stmtInsertName.run([
      nameId,
      personId,
      fornamn ?? null,
      efternamn ?? null,
      'birth',
      patronym ?? null,  // stored as patronymic_base
      0,                 // sort_order 0 = primary
    ]); // no created_at column in person_names schema

    // --- Events ---

    // Birth event
    const birthDate = mapDate(row.fodat);
    if (birthDate || row.fodort || row.fodfs) {
      const placeAddr = buildPlaceAddress(row.fodort, row.fodfs);
      const eventId = uuidv4();
      stmtInsertEvent.run([
        eventId, 'birth',
        birthDate?.date_type ?? 'unknown',
        birthDate?.date_value ?? null,
        birthDate?.date_original ?? null,
        placeAddr ?? null,
        null, null,
      ]);
      stmtInsertParticipant.run([uuidv4(), eventId, personId]);
      eventCount++;
    }

    // Baptism event
    const baptismDate = mapDate(row.dopdat);
    if (baptismDate) {
      const eventId = uuidv4();
      stmtInsertEvent.run([
        eventId, 'baptism',
        baptismDate.date_type, baptismDate.date_value, baptismDate.date_original,
        null, null, null,
      ]);
      stmtInsertParticipant.run([uuidv4(), eventId, personId]);
      eventCount++;
    }

    // Death event
    const deathDate = mapDate(row.dodat);
    if (deathDate || row.dodort || row.dodfs || row.dodors) {
      const placeAddr = buildPlaceAddress(row.dodort, row.dodfs);
      const eventId = uuidv4();
      stmtInsertEvent.run([
        eventId, 'death',
        deathDate?.date_type ?? 'unknown',
        deathDate?.date_value ?? null,
        deathDate?.date_original ?? null,
        placeAddr ?? null,
        row.dodors ?? null,  // cause of death
        null,
      ]);
      stmtInsertParticipant.run([uuidv4(), eventId, personId]);
      eventCount++;
    }

    // Burial event
    const burialDate = mapDate(row.begdat);
    if (burialDate) {
      const eventId = uuidv4();
      stmtInsertEvent.run([
        eventId, 'burial',
        burialDate.date_type, burialDate.date_value, burialDate.date_original,
        null, null, null,
      ]);
      stmtInsertParticipant.run([uuidv4(), eventId, personId]);
      eventCount++;
    }

    // Occupation event
    if (row.yrke) {
      const eventId = uuidv4();
      stmtInsertEvent.run([
        eventId, 'occupation',
        'unknown', null, null,
        null, null, row.yrke,
      ]);
      stmtInsertParticipant.run([uuidv4(), eventId, personId]);
      eventCount++;
    }

    // Residence event (hemort / hemfs)
    if (row.hemort || row.hemfs) {
      const placeAddr = buildPlaceAddress(row.hemort, row.hemfs);
      const eventId = uuidv4();
      stmtInsertEvent.run([
        eventId, 'residence',
        'unknown', null, null,
        placeAddr ?? null, null, null,
      ]);
      stmtInsertParticipant.run([uuidv4(), eventId, personId]);
      eventCount++;
    }
  }

  // --- Phase 2: Anmtab metadata (link person IDs for future blob import) ---
  // Currently just a count; blob content extraction is deferred.
  let anmtabLinked = 0;
  for (const row of anmtabRows) {
    if (rowIdToPersonId.has(row.fktabell)) {
      anmtabLinked++;
    }
  }

  // Finalize prepared statements to release WASM memory
  stmtInsertPerson.finalize();
  stmtInsertName.finalize();
  stmtInsertEvent.finalize();
  stmtInsertParticipant.finalize();

  progress(
    `Done: ${personCount.toLocaleString()} persons, ` +
    `${eventCount.toLocaleString()} events` +
    (skipped > 0 ? `, ${skipped} skipped` : '') +
    (anmtabLinked > 0 ? `, ${anmtabLinked} notes linked` : ''),
  );

  return { persons: personCount, events: eventCount, skipped };
}

// ---------------------------------------------------------------------------
// NDJSON parser (used in worker thread — no imports allowed there)
// ---------------------------------------------------------------------------

export function parseEdbNdjson(ndjson: string): EdbRow[] {
  const rows: EdbRow[] = [];
  for (const line of ndjson.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed) as EdbRow);
    } catch {
      // skip malformed lines
    }
  }
  return rows;
}
