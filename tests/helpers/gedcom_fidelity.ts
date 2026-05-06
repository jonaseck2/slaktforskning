/**
 * Helpers for GEDCOM round-trip fidelity tests.
 *
 * - EXEMPT_TABLES: tables intentionally outside the registry, with reason.
 * - VERSION_LABEL: maps internal version keys to exportGedcom's string param.
 * - makeSentinelValue: column-type-aware recognisable sentinel.
 * - seedRowWithColumn: insert a row exercising one column (FK-safe).
 * - readColumnFromOnlyRow: round-trip and read the column back.
 * - canonicaliseDb: normalise a DB for deep-equal comparison.
 * - roundTrip: export → parse → import, returning a fresh DB.
 */
import type { Database } from 'node-sqlite3-wasm';
import { queryAll, runSql } from '../../src/api/db';
import { exportGedcom } from '../../src/gedcom/exporter';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { createTestDb } from '../unit/helpers';

export type RegistryVersion = 'v551' | 'v70';

export const VERSION_LABEL: Record<RegistryVersion, '5.5.1' | '7.0'> = {
  v551: '5.5.1',
  v70: '7.0',
};

/**
 * Tables intentionally outside the GEDCOM fidelity registry.
 * Adding a table here requires PR justification.
 */
export const EXEMPT_TABLES: Record<string, string> = {
  gazetteers: 'gazetteer cache; pure derived data per Prime Directive #1',
  ignored_duplicates: 'per-DB UI state; no source-data analog',
  media_regions: 'face/region annotations; no GEDCOM 5.5.1 representation, 7.0 OBJE.CROP exporter not yet shipped — promote to registered entry when it does',
  db_settings: 'per-install preferences; user state, not genealogical data',
  person_names_new: 'migration artifact; should not exist in a settled DB',
  research_tasks_new: 'migration artifact; should not exist in a settled DB',
};

/**
 * Generate a sentinel value for a column. Recognisable across round-trip
 * and type-appropriate (TEXT → string, INTEGER → number, REAL → number).
 *
 * The sentinel is unique per (table, col) so a misattribution bug fails
 * loudly: if the importer puts persons.notes data into events.notes, the
 * sentinel mismatch is obvious.
 */
/**
 * For columns with SQLite CHECK constraints (enum-shaped) or FK targets,
 * a free-form string sentinel violates the constraint. This map gives a
 * stable, valid sentinel for each constrained column so seed/INSERT succeeds.
 *
 * The chosen value is still the exact value the round-trip test asserts —
 * it's just bounded by the schema. Picking a non-default enum value where
 * possible so it's still distinguishable from "fresh row default".
 */
const CONSTRAINED_SENTINELS: Record<string, unknown> = {
  // CHECK enums
  'persons.sex': 'F',
  'person_names.name_type': 'married',
  'person_names.name_qualifier': 'patronymic',
  'person_identifiers.identifier_type': 'familysearch',
  'relationships.type': 'sibling',
  'events.date_type': 'about',
  'group_links.entity_type': 'place',
  'task_links.entity_type': 'place',
  'media_links.entity_type': 'event',
  'research_tasks.status': 'in_progress',
  // events.event_type sentinel must be a value the EVENT_TYPE_TO_TAG map knows
  // — a free-form string would round-trip to 'other'. 'occupation' is a stable
  // mapped type distinguishable from the other-event default.
  'events.event_type': 'occupation',
  // event_participants.role has no CHECK in schema (free TEXT) but the export
  // path encodes role 'primary' as "the INDI owns the event" while non-primary
  // roles emit as ASSO RELA on a separate participant. To exercise round-trip
  // for the role column we must seed a non-primary role plus a primary owner;
  // a recognisable real role (witness) keeps the GEDCOM output well-formed.
  'event_participants.role': 'witness',
  // events.date_value / date_value_end must be GEDCOM-formatted dates so the
  // exporter emits them and the importer round-trips them. A sentinel string
  // would not parse and reset to null. ISO 8601 (YYYY-MM-DD) round-trips via
  // formatGedcomDate / parseGedcomDate.
  'events.date_value': '1789-05-12',
  'events.date_value_end': '1799-08-23',
  // citations.confidence is clamped to 0..3 by QUAY emitter. The default INTEGER
  // sentinel 42 would clamp to 3 and the test would assert literal-equal failure.
  // The user's authored values are always in [0, 3] anyway — use a representative
  // in-range value (3 = direct/primary evidence) so the round-trip is meaningful.
  'citations.confidence': 3,
  // preferred_name encodes as an asterisk after the matching token in given_name.
  // The sentinel must therefore be a substring of given_name; the seeder picks
  // 'Sentinel' as given_name for the row under test, so the preferred-name
  // sentinel must be 'Sentinel'.
  'person_names.preferred_name': 'Sentinel',
};

export function makeSentinelValue(table: string, col: string, colType: string): unknown {
  const key = `${table}.${col}`;
  if (key in CONSTRAINED_SENTINELS) return CONSTRAINED_SENTINELS[key];
  const t = colType.toUpperCase();
  if (t.startsWith('INT')) return 42;
  if (t.startsWith('REAL') || t.includes('FLOAT') || t.includes('DOUBLE')) return 12.5;
  // TEXT / unknown — string sentinel encoding the (table, col) pair.
  // Keep ASCII-only and short to survive GEDCOM line-length quirks.
  return `S_${table}_${col}_x9`;
}

/**
 * Seed a single row into `table` with the target column populated by `value`.
 * Other NOT NULL columns get minimal placeholder values. Foreign-key parents
 * are seeded as needed. Returns the inserted row id (UUID).
 *
 * Implemented in Task 6 — for now, throws so the test files compile but
 * cannot accidentally pass before per-table seeders exist.
 */
export function seedRowWithColumn(
  db: Database,
  table: string,
  col: string,
  value: unknown,
): string {
  return seedByTable(db, table, col, value);
}

// ── Per-table seeders ────────────────────────────────────────────────────────

/**
 * Helper: insert a person + a default name so the person survives GEDCOM
 * round-trip (the importer drops INDI without NAME).
 */
function insertPersonWithDefaultName(db: Database, personId?: string): string {
  const id = personId ?? crypto.randomUUID();
  runSql(db, 'INSERT INTO persons (id, sex, notes) VALUES (?, ?, ?)', [id, 'U', '']);
  runSql(
    db,
    `INSERT INTO person_names (id, person_id, given_name, surname, name_type, sort_order)
     VALUES (?, ?, ?, ?, 'birth', 0)`,
    [crypto.randomUUID(), id, 'Test', 'Person'],
  );
  return id;
}

function seedPersons(db: Database, col: string, value: unknown): string {
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  // Build INSERT with only the column under test as the sentinel,
  // other NOT NULL columns at default.
  const cols: string[] = ['id'];
  const params: unknown[] = [id];
  const overrides: Record<string, unknown> = { sex: 'U', notes: '' };
  if (col !== 'id') overrides[col] = value;
  for (const [k, v] of Object.entries(overrides)) {
    cols.push(k);
    params.push(v);
  }
  runSql(
    db,
    `INSERT INTO persons (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  // Add a default name so the person survives round-trip.
  runSql(
    db,
    `INSERT INTO person_names (id, person_id, given_name, surname, name_type, sort_order)
     VALUES (?, ?, ?, ?, 'birth', 0)`,
    [crypto.randomUUID(), id, 'Test', 'Person'],
  );
  return id;
}

function seedPersonNames(db: Database, col: string, value: unknown): string {
  // We're seeding the only person_name on a person; do NOT use the default-name helper
  // (which would produce 2 rows in person_names and break readColumnFromOnlyRow).
  // For FK column person_id, the parent person id IS the sentinel.
  const personId = col === 'person_id' ? String(value) : crypto.randomUUID();
  runSql(db, 'INSERT INTO persons (id, sex, notes) VALUES (?, ?, ?)', [personId, 'U', '']);
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  const overrides: Record<string, unknown> = {
    person_id: personId,
    given_name: 'Sentinel',
    surname: 'Subject',
    name_type: 'birth',
    sort_order: 1,
  };
  if (col !== 'id' && col !== 'person_id') overrides[col] = value;
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  runSql(
    db,
    `INSERT INTO person_names (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  return id;
}

function seedPersonIdentifiers(db: Database, col: string, value: unknown): string {
  const personId = col === 'person_id'
    ? insertPersonWithDefaultName(db, String(value))
    : insertPersonWithDefaultName(db);
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  const overrides: Record<string, unknown> = {
    person_id: personId,
    identifier_type: 'refn',
    identifier_value: 'placeholder',
  };
  if (col !== 'id' && col !== 'person_id' && col !== 'created_at') overrides[col] = value;
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  if (col === 'created_at') {
    cols.push('created_at');
    params.push(value);
  }
  runSql(
    db,
    `INSERT INTO person_identifiers (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  return id;
}

function seedRelationships(db: Database, col: string, value: unknown): string {
  const p1 = insertPersonWithDefaultName(db);
  const p2 = insertPersonWithDefaultName(db);
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  const overrides: Record<string, unknown> = {
    type: 'couple',
    person1_id: p1,
    person2_id: p2,
    notes: '',
  };
  if (col === 'person1_id') overrides.person1_id = String(value); // not realistic FK; will fail FK check
  if (col === 'person2_id') overrides.person2_id = String(value);
  if (col !== 'id' && col !== 'created_at' && col !== 'updated_at') overrides[col] = value;
  // For person FK columns, route the sentinel into the relationship without FK violation:
  // we cannot use a sentinel string as a FK; instead set the column-under-test to one of
  // the real person ids so the row is insertable. This means person1_id/person2_id round-trip
  // is checked indirectly via XREF identity, so the sentinel here is the real UUID we set.
  if (col === 'person1_id') overrides.person1_id = p1;
  if (col === 'person2_id') overrides.person2_id = p2;
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  runSql(
    db,
    `INSERT INTO relationships (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  return id;
}

function seedPlaces(db: Database, col: string, value: unknown): string {
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  // Default name has NO comma so the import-time hierarchy parser doesn't fight us.
  const overrides: Record<string, unknown> = {
    name: 'Sentinelby',
    normalized_name: 'sentinelby',
    notes: '',
  };
  if (col === 'parent_place_id') {
    // Seed a parent place, then this child references it.
    const parentId = crypto.randomUUID();
    runSql(
      db,
      `INSERT INTO places (id, name, normalized_name, notes) VALUES (?, ?, ?, ?)`,
      [parentId, 'Parentbyn', 'parentbyn', ''],
    );
    overrides.parent_place_id = parentId;
  } else if (col !== 'id' && col !== 'normalized_name') {
    overrides[col] = value;
  }
  // GEDCOM MAP/LATI/LONG must be emitted as a pair; export skips both if either
  // is missing. Seed the partner coordinate so the column under test survives.
  if (col === 'latitude') overrides.longitude = -3.5;
  if (col === 'longitude') overrides.latitude = -3.5;
  if (col === 'name') {
    // Re-normalise to keep DEFAULT-equivalence; name is the sentinel but normalized_name
    // is filled by the importer at read time.
    overrides.normalized_name = String(value).toLowerCase();
  }
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  runSql(
    db,
    `INSERT INTO places (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  // Places are only emitted to GEDCOM when attached to an event (PLAC sub-tag)
  // or when they have a citation (custom _PLAC top-level record). Attach this
  // place to a birth event on a synthetic person so it survives round-trip.
  const personId = insertPersonWithDefaultName(db);
  const eventId = crypto.randomUUID();
  runSql(
    db,
    `INSERT INTO events (id, event_type, date_type, date_original, notes, place_id) VALUES (?, 'birth', 'unknown', '', '', ?)`,
    [eventId, id],
  );
  runSql(
    db,
    `INSERT INTO event_participants (id, event_id, person_id, role) VALUES (?, ?, ?, 'primary')`,
    [crypto.randomUUID(), eventId, personId],
  );
  return id;
}

function seedEvents(db: Database, col: string, value: unknown): string {
  // For an event to round-trip via INDI/FAM, it needs at least one participant.
  // We seed a person and an event_participant in addition to the event.
  const personId = insertPersonWithDefaultName(db);
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  // Default to a fact-shaped event_type so events.value can round-trip when not under test.
  // For events.event_type test, the sentinel becomes the event_type.
  const overrides: Record<string, unknown> = {
    event_type: 'birth',
    date_type: 'unknown',
    date_original: '',
    notes: '',
  };
  if (col === 'place_id') {
    const placeId = crypto.randomUUID();
    runSql(
      db,
      `INSERT INTO places (id, name, normalized_name, notes) VALUES (?, ?, ?, ?)`,
      [placeId, 'Eventplats', 'eventplats', ''],
    );
    overrides.place_id = placeId;
  } else if (col === 'relationship_id') {
    const p2 = insertPersonWithDefaultName(db);
    const relId = crypto.randomUUID();
    runSql(
      db,
      `INSERT INTO relationships (id, type, person1_id, person2_id, notes) VALUES (?, 'couple', ?, ?, ?)`,
      [relId, personId, p2, ''],
    );
    overrides.relationship_id = relId;
    // For couple-event, also need participants on both spouses (FAM events use HUSB/WIFE).
    overrides.event_type = 'marriage';
  } else if (col !== 'id' && col !== 'created_at' && col !== 'updated_at') {
    overrides[col] = value;
  }
  // For specific date_type values, ensure the sentinel is a valid CHECK value.
  if (col === 'date_type') {
    // The CONSTRAINED_SENTINELS entry returns 'about'. The exporter only emits
    // the DATE line if there's an actual date value to format, so add one too.
    overrides.date_type = String(value);
    overrides.date_value = '1789-05-12';
  }
  if (col === 'date_value') {
    // Pair the date_value sentinel (a real ISO date) with date_type='exact'
    // so the exporter emits it and the importer parses it back.
    overrides.date_type = 'exact';
  }
  if (col === 'date_value_end') {
    // BET..AND ranges need date_type='between' and a starting date_value too.
    overrides.date_type = 'between';
    overrides.date_value = '1789-05-12';
  }
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  runSql(
    db,
    `INSERT INTO events (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  // Attach a primary participant so the event is exportable under INDI (or under FAM for marriage).
  if (col === 'relationship_id') {
    // Couple events nest under FAM; no INDI participant required for round-trip.
  } else {
    runSql(
      db,
      `INSERT INTO event_participants (id, event_id, person_id, role) VALUES (?, ?, ?, 'primary')`,
      [crypto.randomUUID(), id, personId],
    );
  }
  return id;
}

function seedEventParticipants(db: Database, col: string, value: unknown): string {
  const personId = insertPersonWithDefaultName(db);
  const eventId = crypto.randomUUID();
  runSql(
    db,
    `INSERT INTO events (id, event_type, date_type, date_original, notes) VALUES (?, 'birth', 'unknown', '', '')`,
    [eventId],
  );
  // For non-primary role tests, the INDI owning the event must be SOMEONE ELSE
  // (a primary participant), and our row-under-test is the ASSO target.
  // The post-roundtrip event_participants table will contain BOTH rows; the
  // per-field reader filters to the non-primary one for `role` tests.
  if (col === 'role' && value !== 'primary') {
    runSql(
      db,
      `INSERT INTO event_participants (id, event_id, person_id, role) VALUES (?, ?, ?, 'primary')`,
      [crypto.randomUUID(), eventId, personId],
    );
  }
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  const overrides: Record<string, unknown> = {
    event_id: eventId,
    person_id: col === 'role' && value !== 'primary'
      ? insertPersonWithDefaultName(db)
      : personId,
    role: 'primary',
  };
  // FK columns: keep real ids; XREF preservation is the round-trip mechanism.
  if (col !== 'id' && col !== 'event_id' && col !== 'person_id') {
    overrides[col] = value;
  }
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  runSql(
    db,
    `INSERT INTO event_participants (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  return id;
}

function seedSources(db: Database, col: string, value: unknown): string {
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  const overrides: Record<string, unknown> = {
    title: 'Sentinel Source',
  };
  if (col !== 'id' && col !== 'created_at' && col !== 'updated_at') {
    overrides[col] = value;
  }
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  runSql(
    db,
    `INSERT INTO sources (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  // Attach a citation referencing this source so the source survives round-trip.
  // Sources without any citation are dropped on import (orphan filter).
  const personId = insertPersonWithDefaultName(db);
  runSql(
    db,
    `INSERT INTO citations (id, source_id, person_id) VALUES (?, ?, ?)`,
    [crypto.randomUUID(), id, personId],
  );
  return id;
}

function seedCitations(db: Database, col: string, value: unknown): string {
  const sourceId = crypto.randomUUID();
  runSql(db, `INSERT INTO sources (id, title) VALUES (?, ?)`, [sourceId, 'Cite Source']);
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  const overrides: Record<string, unknown> = {
    source_id: sourceId,
  };
  // Pick a default attachment for the citation: by default, a person.
  // Some columns under test override this (event_id, relationship_id, place_id).
  let attached = false;
  if (col === 'event_id') {
    const personId = insertPersonWithDefaultName(db);
    const eventId = crypto.randomUUID();
    runSql(
      db,
      `INSERT INTO events (id, event_type, date_type, date_original, notes) VALUES (?, 'birth', 'unknown', '', '')`,
      [eventId],
    );
    runSql(
      db,
      `INSERT INTO event_participants (id, event_id, person_id, role) VALUES (?, ?, ?, 'primary')`,
      [crypto.randomUUID(), eventId, personId],
    );
    overrides.event_id = eventId;
    attached = true;
  } else if (col === 'person_id') {
    const personId = insertPersonWithDefaultName(db);
    overrides.person_id = personId;
    attached = true;
  } else if (col === 'relationship_id') {
    const a = insertPersonWithDefaultName(db);
    const b = insertPersonWithDefaultName(db);
    const relId = crypto.randomUUID();
    runSql(
      db,
      `INSERT INTO relationships (id, type, person1_id, person2_id, notes) VALUES (?, 'couple', ?, ?, ?)`,
      [relId, a, b, ''],
    );
    overrides.relationship_id = relId;
    attached = true;
  } else if (col === 'place_id') {
    const placeId = crypto.randomUUID();
    runSql(
      db,
      `INSERT INTO places (id, name, normalized_name, notes) VALUES (?, ?, ?, ?)`,
      [placeId, 'Citeplats', 'citeplats', ''],
    );
    overrides.place_id = placeId;
    attached = true;
  } else if (col === 'person_name_id') {
    // Seed a person + a single name and attach the citation to that name.
    // The name must be the only one so the importer's NAME-order based
    // re-linking points at the same row after round-trip.
    const personId = crypto.randomUUID();
    runSql(db, 'INSERT INTO persons (id, sex, notes) VALUES (?, ?, ?)', [personId, 'U', '']);
    const nameId = crypto.randomUUID();
    runSql(
      db,
      `INSERT INTO person_names (id, person_id, given_name, surname, name_type, sort_order)
       VALUES (?, ?, ?, ?, 'birth', 0)`,
      [nameId, personId, 'Sentinel', 'Subject'],
    );
    overrides.person_name_id = nameId;
    attached = true;
  }
  if (!attached) {
    // Default: attach to a person so the citation isn't an orphan.
    const personId = insertPersonWithDefaultName(db);
    overrides.person_id = personId;
  }
  if (col !== 'id' && col !== 'source_id' && col !== 'created_at' && !['event_id','person_id','relationship_id','place_id','person_name_id'].includes(col)) {
    overrides[col] = value;
  }
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  runSql(
    db,
    `INSERT INTO citations (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  return id;
}

function seedGroups(db: Database, col: string, value: unknown): string {
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  const overrides: Record<string, unknown> = {
    name: 'Sentinel Group',
    notes: '',
  };
  if (col !== 'id' && col !== 'created_at') overrides[col] = value;
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  runSql(
    db,
    `INSERT INTO groups (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  return id;
}

function seedGroupLinks(db: Database, col: string, value: unknown): string {
  const groupId = crypto.randomUUID();
  runSql(db, `INSERT INTO groups (id, name, notes) VALUES (?, ?, ?)`, [groupId, 'G', '']);
  const personId = insertPersonWithDefaultName(db);
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  const overrides: Record<string, unknown> = {
    group_id: groupId,
    entity_type: 'person',
    entity_id: personId,
    sort_order: 0,
  };
  if (!['id', 'group_id', 'entity_id', 'created_at'].includes(col)) {
    overrides[col] = value;
  }
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  runSql(
    db,
    `INSERT INTO group_links (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  return id;
}

function seedRepositories(db: Database, col: string, value: unknown): string {
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  const overrides: Record<string, unknown> = {
    name: 'Sentinel Repo',
    notes: '',
  };
  if (col !== 'id' && col !== 'created_at') overrides[col] = value;
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  runSql(
    db,
    `INSERT INTO repositories (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  // Attach to a source so the repo survives round-trip (REPO records emitted via SOUR.REPO).
  const sourceId = crypto.randomUUID();
  runSql(db, `INSERT INTO sources (id, title) VALUES (?, ?)`, [sourceId, 'Repo Source']);
  runSql(
    db,
    `INSERT INTO source_repositories (source_id, repository_id) VALUES (?, ?)`,
    [sourceId, id],
  );
  // Citation so the source isn't dropped as orphan.
  const personId = insertPersonWithDefaultName(db);
  runSql(
    db,
    `INSERT INTO citations (id, source_id, person_id) VALUES (?, ?, ?)`,
    [crypto.randomUUID(), sourceId, personId],
  );
  return id;
}

function seedSourceRepositories(db: Database, col: string, _value: unknown): string {
  const sourceId = crypto.randomUUID();
  const repoId = crypto.randomUUID();
  runSql(db, `INSERT INTO sources (id, title) VALUES (?, ?)`, [sourceId, 'SR Source']);
  runSql(db, `INSERT INTO repositories (id, name, notes) VALUES (?, ?, ?)`, [repoId, 'SR Repo', '']);
  runSql(
    db,
    `INSERT INTO source_repositories (source_id, repository_id) VALUES (?, ?)`,
    [sourceId, repoId],
  );
  // Citation so source isn't orphan.
  const personId = insertPersonWithDefaultName(db);
  runSql(
    db,
    `INSERT INTO citations (id, source_id, person_id) VALUES (?, ?, ?)`,
    [crypto.randomUUID(), sourceId, personId],
  );
  // Composite PK — return whichever column is under test as the "row id".
  return col === 'source_id' ? sourceId : repoId;
}

function seedResearchTasks(db: Database, col: string, value: unknown): string {
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  const overrides: Record<string, unknown> = {
    priority: 0,
    status: 'open',
    task: 'Sentinel task',
    notes: '',
    result: '',
  };
  if (col !== 'id' && col !== 'created_at' && col !== 'updated_at') overrides[col] = value;
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  runSql(
    db,
    `INSERT INTO research_tasks (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  return id;
}

function seedTaskLinks(db: Database, col: string, value: unknown): string {
  const taskId = crypto.randomUUID();
  runSql(
    db,
    `INSERT INTO research_tasks (id, priority, status, task, notes, result) VALUES (?, 0, 'open', '', '', '')`,
    [taskId],
  );
  const personId = insertPersonWithDefaultName(db);
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  const overrides: Record<string, unknown> = {
    task_id: taskId,
    entity_type: 'person',
    entity_id: personId,
    sort_order: 0,
  };
  if (!['id', 'task_id', 'entity_id', 'created_at'].includes(col)) {
    overrides[col] = value;
  }
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  runSql(
    db,
    `INSERT INTO task_links (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  return id;
}

function seedMedia(db: Database, col: string, value: unknown): string {
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  const overrides: Record<string, unknown> = {
    file_ref: 'media/placeholder.jpg',
    title: 'Sentinel Media',
    notes: '',
    is_printable: 0,
    is_missing: 0,
  };
  if (col !== 'id' && col !== 'created_at') overrides[col] = value;
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  runSql(
    db,
    `INSERT INTO media (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  // Attach to a person so the OBJE is emitted (un-linked OBJE records may be dropped).
  const personId = insertPersonWithDefaultName(db);
  runSql(
    db,
    `INSERT INTO media_links (id, media_id, entity_type, entity_id, sort_order) VALUES (?, ?, 'person', ?, 0)`,
    [crypto.randomUUID(), id, personId],
  );
  return id;
}

function seedMediaLinks(db: Database, col: string, value: unknown): string {
  const mediaId = crypto.randomUUID();
  runSql(
    db,
    `INSERT INTO media (id, file_ref, title, notes, is_printable, is_missing) VALUES (?, 'media/x.jpg', 'M', '', 0, 0)`,
    [mediaId],
  );
  const personId = insertPersonWithDefaultName(db);
  const id = col === 'id' ? String(value) : crypto.randomUUID();
  const overrides: Record<string, unknown> = {
    media_id: mediaId,
    entity_type: 'person',
    entity_id: personId,
    sort_order: 0,
  };
  if (!['id', 'media_id', 'entity_id', 'created_at'].includes(col)) {
    overrides[col] = value;
  }
  const cols = ['id', ...Object.keys(overrides)];
  const params = [id, ...Object.values(overrides)];
  runSql(
    db,
    `INSERT INTO media_links (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params,
  );
  return id;
}

function seedByTable(db: Database, table: string, col: string, value: unknown): string {
  switch (table) {
    case 'persons': return seedPersons(db, col, value);
    case 'person_names': return seedPersonNames(db, col, value);
    case 'person_identifiers': return seedPersonIdentifiers(db, col, value);
    case 'relationships': return seedRelationships(db, col, value);
    case 'places': return seedPlaces(db, col, value);
    case 'events': return seedEvents(db, col, value);
    case 'event_participants': return seedEventParticipants(db, col, value);
    case 'sources': return seedSources(db, col, value);
    case 'citations': return seedCitations(db, col, value);
    case 'groups': return seedGroups(db, col, value);
    case 'group_links': return seedGroupLinks(db, col, value);
    case 'repositories': return seedRepositories(db, col, value);
    case 'source_repositories': return seedSourceRepositories(db, col, value);
    case 'research_tasks': return seedResearchTasks(db, col, value);
    case 'task_links': return seedTaskLinks(db, col, value);
    case 'media': return seedMedia(db, col, value);
    case 'media_links': return seedMediaLinks(db, col, value);
    default:
      throw new Error(
        `seedRowWithColumn: no seeder for table=${table} (col=${col})`,
      );
  }
}

/**
 * Round-trip a DB through GEDCOM at the given version. Returns the fresh DB.
 */
export function roundTrip(db: Database, version: RegistryVersion): Database {
  const { ged } = exportGedcom(db, VERSION_LABEL[version]);
  const tree = parseGedcom(ged);
  const fresh = createTestDb();
  importGedcom(fresh, tree);
  return fresh;
}

/**
 * After round-trip, read the value of `col` from the (single) row in `table`.
 * Per-field tests seed exactly one row, so this is straightforward.
 */
export function readColumnFromOnlyRow(db: Database, table: string, col: string): unknown {
  // Special case: event_participants.role for non-primary roles requires a
  // primary participant in the seed too (so the event survives export). After
  // round-trip the table contains 2 rows; pick the non-primary one.
  if (table === 'event_participants' && col === 'role') {
    const rows = queryAll<{ role: string }>(
      db,
      `SELECT role FROM event_participants WHERE role != 'primary'`,
    );
    if (rows.length === 0) return null;
    if (rows.length > 1) {
      throw new Error(`readColumnFromOnlyRow: expected 1 non-primary row in event_participants, got ${rows.length}`);
    }
    return rows[0].role;
  }
  const rows = queryAll<Record<string, unknown>>(db, `SELECT ${col} FROM ${table}`);
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new Error(`readColumnFromOnlyRow: expected 1 row in ${table}, got ${rows.length}`);
  }
  return rows[0][col];
}

/**
 * Canonicalise a DB for deep-equal comparison in golden tests.
 * - Drops audit columns (created_at, updated_at).
 * - Drops UUIDs (re-issued on import).
 * - Drops normalized_name (derived from name).
 * - Sorts multi-row tables by stable JSON serialisation.
 *
 * Returns a plain object: { tableName: row[] }.
 */
export function canonicaliseDb(db: Database): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  const tables = queryAll<{ name: string }>(
    db,
    "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ).map(t => t.name);
  for (const table of tables) {
    if (table in EXEMPT_TABLES) continue;
    const rows = queryAll<Record<string, unknown>>(db, `SELECT * FROM ${table}`);
    out[table] = rows.map(stripAuditAndIds).sort(stableRowSort);
  }
  return out;
}

function stripAuditAndIds(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'created_at' || k === 'updated_at') continue;
    if (k === 'id') continue; // UUIDs re-issued on import
    if (k === 'normalized_name') continue; // derived from name
    // Drop FK UUID columns. Per the registry every *_id column carries the
    // UUID_FK_VIA_XREF status: the literal UUID never survives a round-trip
    // because the importer always issues fresh UUIDs, but the XREF graph
    // (i.e. "this row points at THAT logical row") is preserved separately
    // via XREF cross-reference identity. The per-field test verifies XREF
    // graph identity indirectly (any non-id column passing on the related row
    // implicitly proves the link). For the golden test, comparing literal
    // FK UUIDs would always fail; drop them to compare the rest of the row.
    //
    // The set of dropped columns matches every UUID_FK_VIA_XREF / UUID_PK_VIA_XREF
    // entry in src/api/gedcom_fidelity_registry.ts: persons.id, person_names.id,
    // person_names.person_id, person_identifiers.person_id, relationships.person1_id,
    // relationships.person2_id, events.place_id, events.relationship_id,
    // event_participants.event_id, event_participants.person_id,
    // citations.source_id, citations.event_id, citations.person_id,
    // citations.relationship_id, citations.place_id,
    // source_repositories.source_id, source_repositories.repository_id,
    // media_links.media_id, media_links.entity_id (and the polymorphic
    // entity_id columns on group_links/task_links — those tables are skipped
    // from the golden seed but the rule still applies if added later).
    if (k.endsWith('_id')) continue;
    out[k] = v;
  }
  return out;
}

function stableRowSort(a: Record<string, unknown>, b: Record<string, unknown>): number {
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}
