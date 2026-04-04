/**
 * Genney Derby → Släktforskning transform.
 * Maps Genney schema rows (exported as JSON by DerbyExtractor.java) to our API types.
 * Pure logic: no Electron/IPC/UI dependencies.
 *
 * Performance note: all INSERT statements are pre-compiled once before the loops.
 * Each db.prepare() call crosses the JS→WASM boundary and compiles SQL. Calling it
 * per row would produce ~31,000 compilations for a typical Genney database (833 persons,
 * 3008 events, 5910 citations), saturating the CPU for minutes. Reusing statements
 * reduces this to ~9 compilations total.
 */

import type { Database } from 'node-sqlite3-wasm';
import { parseGedcomDate } from '../../gedcom/date';

// ── Genney row shapes ──────────────────────────────────────────────────────

export interface PersonRow {
  RID: string;             // "I123"
  UID?: string | null;
  SEX?: number | null;     // 0=F, 1=M, null=U
  GIVENNAME?: string | null;
  SURNAME?: string | null;
  NICKNAME?: string | null;
  PREFIX?: string | null;
  SUFFIX?: string | null;
  NOTE?: string | null;
  LIVING?: number | null;
  [key: string]: unknown;
}

export interface FamilyRow {
  RID: string;             // "F123"
  HUSBAND?: string | null; // PERSON.RID
  WIFE?: string | null;    // PERSON.RID
  NOTE?: string | null;
  MARRIAGEID?: string | null; // EVENT.RID
  [key: string]: unknown;
}

export interface CoupleFamilyRow {
  PERSON?: string | null;  // child PERSON.RID
  FATHER?: string | null;  // parent PERSON.RID
  MOTHER?: string | null;  // parent PERSON.RID
  FATHERLINK?: string | null; // 'birth', 'adopted', etc.
  MOTHERLINK?: string | null;
  [key: string]: unknown;
}

export interface SpouseFamilyRow {
  FAMILY?: string | null;  // FAMILY.RID
  PERSON?: string | null;  // PERSON.RID
  RELATIONTYPE?: number | null; // 1=cohabitation, 2=other, 3=married
  [key: string]: unknown;
}

export interface EventRow {
  RID: string;             // "E123"
  TYPE?: string | null;    // BIRT, DEAT, MARR, etc.
  DATE?: string | null;    // GEDCOM-style date string
  DESCRIPTION?: string | null;
  NOTE?: string | null;
  OWNER?: string | null;   // "I123" (person) or "F123" (family)
  PLACE?: string | null;   // denormalized text (ignored if EVENT_PLACE exists)
  [key: string]: unknown;
}

export interface EventPlaceRow {
  RID?: string | null;     // EVENT.RID
  SPLACEID?: number | null; // SPLACE.RID
  [key: string]: unknown;
}

export interface SPlaceRow {
  RID: number;             // integer PK
  NAME?: string | null;
  PARENT?: number | null;  // self-referential FK
  LATITUD?: number | null;
  LONGITUD?: number | null;
  NOTE?: string | null;
  TYPE?: number | null;    // 2=parish, etc.
  [key: string]: unknown;
}

export interface SourceRow {
  RID: string;             // "S123"
  TITLE?: string | null;
  ABBREVIATION?: string | null;
  AUTHOR?: string | null;
  PUBLICATION?: string | null;
  MEDIATYPE?: number | null;
  NOTE?: string | null;
  [key: string]: unknown;
}

export interface CitationRow {
  RID: string;             // "C123"
  WHEREINTEXT?: string | null; // page
  TEXT?: string | null;    // transcription
  NOTE?: string | null;
  CERTAINTY?: number | null; // -1..3
  DATE?: string | null;    // date_accessed
  [key: string]: unknown;
}

export interface CitationSourceRow {
  CITATION?: string | null; // CITATION.RID
  SOURCE?: string | null;   // SOURCE.RID
  [key: string]: unknown;
}

export interface OwnerCitationRow {
  OWNER?: string | null;    // "E123", "I123", or "F123"
  CITATION?: string | null; // CITATION.RID
  [key: string]: unknown;
}

export interface RemarkRow {
  OWNER?: string | null;    // PERSON.RID
  TEXT?: string | null;
  [key: string]: unknown;
}

export interface GenneyTables {
  PERSON: PersonRow[];
  FAMILY: FamilyRow[];
  COUPLE_FAMILY: CoupleFamilyRow[];
  SPOUSE_FAMILY: SpouseFamilyRow[];
  EVENT: EventRow[];
  EVENT_PLACE: EventPlaceRow[];
  SPLACE: SPlaceRow[];
  SOURCE: SourceRow[];
  CITATION: CitationRow[];
  CITATION_SOURCE: CitationSourceRow[];
  OWNER_CITATION: OwnerCitationRow[];
  REMARK: RemarkRow[];
}

export interface ImportSummary {
  persons: number;
  coupleRelationships: number;
  parentChildRelationships: number;
  events: number;
  places: number;
  sources: number;
  citations: number;
  warnings: string[];
}

// ── Mapping helpers ────────────────────────────────────────────────────────

const GENNEY_EVENT_TYPE: Record<string, string> = {
  BIRT: 'birth', DEAT: 'death', MARR: 'marriage', DIV: 'divorce',
  CHR: 'christening', BURI: 'burial', BAPM: 'baptism', CONF: 'confirmation',
  OCCU: 'occupation', RESI: 'residence', EDUC: 'education', EMIG: 'emigration',
  IMMI: 'immigration', NATU: 'naturalization', CENS: 'census', PROB: 'probate',
  WILL: 'will', GRAD: 'graduation', RETI: 'retirement', EVEN: 'other',
};

const SPLACE_TYPE: Record<number, string> = {
  1: 'county', 2: 'parish', 3: 'city', 4: 'village', 25: 'other',
};

function mapEventType(type: string | null | undefined): string {
  if (!type) return 'other';
  return GENNEY_EVENT_TYPE[type.toUpperCase()] ?? 'other';
}

function mapSplaceType(type: number | null | undefined): string | null {
  if (type == null) return null;
  return SPLACE_TYPE[type] ?? 'other';
}

function mapSourceType(mediatype: number | null | undefined): string {
  if (mediatype == null) return '';
  const map: Record<number, string> = {
    1: 'book', 2: 'vital_record', 3: 'church_record', 4: 'census',
    5: 'newspaper', 6: 'photograph', 7: 'other',
  };
  return map[mediatype] ?? 'other';
}

function mapCoupleSubtype(relationtype: number | null | undefined): string | null {
  if (relationtype == null) return null;
  const map: Record<number, string> = { 3: 'marriage', 1: 'cohabitation', 2: 'other' };
  return map[relationtype] ?? null;
}

function mapParentChildSubtype(link: string | null | undefined): string | null {
  if (!link) return null;
  const l = link.toLowerCase();
  if (l === 'birth' || l === 'biological') return 'biological';
  if (l === 'adopted') return 'adopted';
  if (l === 'foster') return 'foster';
  if (l === 'step') return 'step';
  return null;
}

function mapConfidence(certainty: number | null | undefined): number {
  if (certainty == null || certainty < 0) return 0;
  if (certainty > 3) return 3;
  return certainty;
}

/** Extract preferred_name from asterisk notation inline (mirrors nameUtils.ts). */
function parseAsterisk(raw: string): { given: string; preferred: string | null } {
  const idx = raw.indexOf('*');
  if (idx === -1) return { given: raw.trim(), preferred: null };
  const beforeStar = raw.slice(0, idx).trimEnd();
  const afterStar = raw.slice(idx + 1).trimStart();
  const tokens = beforeStar.split(/\s+/).filter(Boolean);
  const preferred = tokens[tokens.length - 1] ?? null;
  const given = (beforeStar + (afterStar ? ' ' + afterStar : '')).replace(/\s+/g, ' ').trim();
  return { given: given || raw.trim(), preferred };
}

// ── Main transform ─────────────────────────────────────────────────────────

export function transformGenney(db: Database, tables: GenneyTables): ImportSummary {
  const summary: ImportSummary = {
    persons: 0, coupleRelationships: 0, parentChildRelationships: 0,
    events: 0, places: 0, sources: 0, citations: 0, warnings: [],
  };

  // Pre-compile all INSERT statements once.
  // Each db.prepare() crosses the JS→WASM boundary and compiles SQL.
  // Reusing prepared statements avoids ~31,000 redundant compilations that
  // would otherwise saturate the CPU for a typical Genney database.
  const stmts = {
    insertPlace: db.prepare(
      `INSERT INTO places (id, name, normalized_name, place_type, parent_place_id, latitude, longitude, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    insertPerson: db.prepare(
      `INSERT INTO persons (id, sex, living, notes) VALUES (?, ?, ?, ?)`
    ),
    insertPersonName: db.prepare(
      `INSERT INTO person_names (id, person_id, given_name, surname, name_type, sort_order, name_prefix, name_suffix, preferred_name, nickname) VALUES (?, ?, ?, ?, 'birth', 0, ?, ?, ?, ?)`
    ),
    insertPersonIdentifier: db.prepare(
      `INSERT OR IGNORE INTO person_identifiers (id, person_id, identifier_type, identifier_value, created_at) VALUES (?, ?, ?, ?, ?)`
    ),
    insertSource: db.prepare(
      `INSERT INTO sources (id, title, author, publication_info, source_type) VALUES (?, ?, ?, ?, ?)`
    ),
    insertRelationship: db.prepare(
      `INSERT INTO relationships (id, type, person1_id, person2_id, subtype, notes) VALUES (?, ?, ?, ?, ?, ?)`
    ),
    insertEvent: db.prepare(
      `INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    insertParticipant: db.prepare(
      `INSERT OR IGNORE INTO event_participants (id, event_id, person_id, role) VALUES (?, ?, ?, ?)`
    ),
    insertCitation: db.prepare(
      `INSERT INTO citations (id, source_id, event_id, person_id, relationship_id, page, confidence, transcription, notes, date_accessed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
  };

  // ── 1. Import SPLACE records (parents before children) ───────────────────
  const splaceFlatMap = new Map<number, string>(); // SPLACE.RID → place UUID
  const splacesById = new Map<number, SPlaceRow>();
  for (const sp of tables.SPLACE) splacesById.set(sp.RID, sp);

  // Collect only SPLACEs referenced by events (+ their ancestors)
  const referencedSplaceIds = new Set<number>();
  for (const ep of tables.EVENT_PLACE) {
    if (ep.SPLACEID != null) referencedSplaceIds.add(ep.SPLACEID);
  }
  function collectAncestors(rid: number): void {
    const sp = splacesById.get(rid);
    if (!sp || !sp.PARENT) return;
    if (!referencedSplaceIds.has(sp.PARENT)) {
      referencedSplaceIds.add(sp.PARENT);
      collectAncestors(sp.PARENT);
    }
  }
  for (const rid of [...referencedSplaceIds]) collectAncestors(rid);

  const importedSplaces = new Set<number>();
  function importSplace(rid: number): void {
    if (importedSplaces.has(rid)) return;
    const sp = splacesById.get(rid);
    if (!sp) return;
    if (sp.PARENT != null && !importedSplaces.has(sp.PARENT)) importSplace(sp.PARENT);

    const parentUuid = sp.PARENT != null ? splaceFlatMap.get(sp.PARENT) ?? null : null;
    const lat = sp.LATITUD != null && sp.LATITUD !== 0 ? sp.LATITUD : null;
    const lon = sp.LONGITUD != null && sp.LONGITUD !== 0 ? sp.LONGITUD : null;
    const name = sp.NAME ?? `Place ${rid}`;
    const id = crypto.randomUUID();
    stmts.insertPlace.run([
      id, name, name.toLowerCase().trim().replace(/\s+/g, ' '),
      mapSplaceType(sp.TYPE), parentUuid, lat, lon, sp.NOTE ?? '',
    ]);
    splaceFlatMap.set(rid, id);
    importedSplaces.add(rid);
    summary.places++;
  }
  for (const rid of referencedSplaceIds) importSplace(rid);

  // Build event→SPLACE lookup
  const eventToSplace = new Map<string, number>();
  for (const ep of tables.EVENT_PLACE) {
    if (ep.RID && ep.SPLACEID != null) eventToSplace.set(ep.RID, ep.SPLACEID);
  }

  // ── 2. Import persons ────────────────────────────────────────────────────
  const personMap = new Map<string, string>(); // Genney I-ID → UUID
  const remarkByOwner = new Map<string, string>();
  for (const r of tables.REMARK) {
    if (r.OWNER && r.TEXT) remarkByOwner.set(r.OWNER, r.TEXT);
  }

  for (const p of tables.PERSON) {
    let given: string | null = p.GIVENNAME ?? null;
    let preferred_name: string | null = null;
    if (given && given.includes('*')) {
      const parsed = parseAsterisk(given);
      given = parsed.given;
      preferred_name = parsed.preferred;
    }

    const sex: 'M' | 'F' | 'U' = p.SEX === 1 ? 'M' : p.SEX === 0 ? 'F' : 'U';
    const remark = remarkByOwner.get(p.RID);
    const noteParts = [p.NOTE, remark].filter(Boolean);
    const notes = noteParts.length > 0 ? noteParts.join('\n') : '';

    const id = crypto.randomUUID();
    stmts.insertPerson.run([id, sex, p.LIVING === 1 ? 1 : 0, notes]);
    personMap.set(p.RID, id);

    if (given || p.SURNAME) {
      stmts.insertPersonName.run([
        crypto.randomUUID(), id,
        given ?? null, p.SURNAME ?? null,
        p.PREFIX ?? null, p.SUFFIX ?? null,
        preferred_name, p.NICKNAME ?? null,
      ]);
    }

    if (p.UID) {
      stmts.insertPersonIdentifier.run([
        crypto.randomUUID(), id, 'other', String(p.UID), new Date().toISOString(),
      ]);
    }

    summary.persons++;
  }

  // ── 3. Import sources ────────────────────────────────────────────────────
  const sourceMap = new Map<string, string>(); // Genney S-ID → UUID

  for (const src of tables.SOURCE) {
    const title = (src.TITLE || src.ABBREVIATION || '').trim();
    const id = crypto.randomUUID();
    stmts.insertSource.run([
      id, title, src.AUTHOR ?? '', src.PUBLICATION ?? '', mapSourceType(src.MEDIATYPE),
    ]);
    sourceMap.set(src.RID, id);
    summary.sources++;
  }

  // ── 4. Import couple families ────────────────────────────────────────────
  const familyMap = new Map<string, string>(); // Genney F-ID → UUID

  // Build SPOUSE_FAMILY lookup: FAMILY.RID → RELATIONTYPE
  const spouseRelType = new Map<string, number>();
  for (const sf of tables.SPOUSE_FAMILY) {
    if (sf.FAMILY && sf.RELATIONTYPE != null) spouseRelType.set(sf.FAMILY, sf.RELATIONTYPE);
  }

  for (const fam of tables.FAMILY) {
    const p1 = fam.HUSBAND ? personMap.get(fam.HUSBAND) ?? null : null;
    const p2 = fam.WIFE ? personMap.get(fam.WIFE) ?? null : null;
    const subtype = mapCoupleSubtype(spouseRelType.get(fam.RID));

    const id = crypto.randomUUID();
    stmts.insertRelationship.run([id, 'couple', p1, p2, subtype ?? null, fam.NOTE ?? '']);
    familyMap.set(fam.RID, id);
    summary.coupleRelationships++;
  }

  // ── 5. Import parent_child relationships ─────────────────────────────────
  for (const cf of tables.COUPLE_FAMILY) {
    const childId = cf.PERSON ? personMap.get(cf.PERSON) : undefined;
    if (!childId) continue;

    if (cf.FATHER) {
      const fatherId = personMap.get(cf.FATHER);
      if (fatherId) {
        stmts.insertRelationship.run([
          crypto.randomUUID(), 'parent_child', fatherId, childId,
          mapParentChildSubtype(cf.FATHERLINK) ?? null, '',
        ]);
        summary.parentChildRelationships++;
      }
    }

    if (cf.MOTHER) {
      const motherId = personMap.get(cf.MOTHER);
      if (motherId) {
        stmts.insertRelationship.run([
          crypto.randomUUID(), 'parent_child', motherId, childId,
          mapParentChildSubtype(cf.MOTHERLINK) ?? null, '',
        ]);
        summary.parentChildRelationships++;
      }
    }
  }

  // ── 6. Import events ─────────────────────────────────────────────────────
  const eventMap = new Map<string, string>(); // Genney E-ID → UUID

  for (const ev of tables.EVENT) {
    const event_type = mapEventType(ev.TYPE);
    const dateStr = ev.DATE ?? '';
    const parsedDate = dateStr ? parseGedcomDate(dateStr) : null;

    const splaceRid = eventToSplace.get(ev.RID);
    const place_id = splaceRid != null ? splaceFlatMap.get(splaceRid) ?? null : null;

    const descParts = [ev.DESCRIPTION, ev.NOTE].filter(Boolean);
    const description = descParts.length > 0 ? descParts.join('\n') : '';

    const ownerIsFamily = ev.OWNER?.startsWith('F') ?? false;
    const rel_id = ownerIsFamily && ev.OWNER ? familyMap.get(ev.OWNER) ?? null : null;
    const person_id = !ownerIsFamily && ev.OWNER?.startsWith('I') ? personMap.get(ev.OWNER) ?? null : null;

    const id = crypto.randomUUID();
    stmts.insertEvent.run([
      id, event_type, rel_id,
      parsedDate?.date_type ?? 'unknown',
      parsedDate?.date_value ?? null,
      parsedDate?.date_value_end ?? null,
      parsedDate?.date_original ?? dateStr,
      place_id, description,
    ]);
    eventMap.set(ev.RID, id);

    if (person_id) {
      stmts.insertParticipant.run([crypto.randomUUID(), id, person_id, 'primary']);
    }

    summary.events++;
  }

  // ── 7. Import citations ──────────────────────────────────────────────────
  const citSourceMap = new Map<string, string>(); // CITATION.RID → SOURCE.RID
  for (const cs of tables.CITATION_SOURCE) {
    if (cs.CITATION && cs.SOURCE) citSourceMap.set(cs.CITATION, cs.SOURCE);
  }

  const citOwnerMap = new Map<string, string[]>(); // CITATION.RID → [OWNER, ...]
  for (const oc of tables.OWNER_CITATION) {
    if (!oc.CITATION || !oc.OWNER) continue;
    if (!citOwnerMap.has(oc.CITATION)) citOwnerMap.set(oc.CITATION, []);
    citOwnerMap.get(oc.CITATION)!.push(oc.OWNER);
  }

  for (const cit of tables.CITATION) {
    const sourceRid = citSourceMap.get(cit.RID);
    if (!sourceRid) continue;
    const source_id = sourceMap.get(sourceRid);
    if (!source_id) continue;

    const owners = citOwnerMap.get(cit.RID) ?? [];
    if (owners.length === 0) {
      stmts.insertCitation.run([
        crypto.randomUUID(), source_id, null, null, null,
        cit.WHEREINTEXT ?? '', mapConfidence(cit.CERTAINTY),
        cit.TEXT ?? '', cit.NOTE ?? '', cit.DATE ?? '',
      ]);
      summary.citations++;
      continue;
    }

    for (const owner of owners) {
      const event_id = owner.startsWith('E') ? eventMap.get(owner) ?? null : null;
      const person_id = owner.startsWith('I') ? personMap.get(owner) ?? null : null;
      const relationship_id = owner.startsWith('F') ? familyMap.get(owner) ?? null : null;

      stmts.insertCitation.run([
        crypto.randomUUID(), source_id, event_id, person_id, relationship_id,
        cit.WHEREINTEXT ?? '', mapConfidence(cit.CERTAINTY),
        cit.TEXT ?? '', cit.NOTE ?? '', cit.DATE ?? '',
      ]);
      summary.citations++;
    }
  }

  return summary;
}

/** Parse NDJSON lines from DerbyExtractor stdout into GenneyTables. */
export function parseNdJson(output: string): GenneyTables {
  const tables: Partial<GenneyTables> = {};
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as { table: string; rows: unknown[] };
      (tables as Record<string, unknown[]>)[parsed.table] = parsed.rows;
    } catch {
      // skip malformed lines
    }
  }
  return {
    PERSON: [], FAMILY: [], COUPLE_FAMILY: [], SPOUSE_FAMILY: [],
    EVENT: [], EVENT_PLACE: [], SPLACE: [], SOURCE: [],
    CITATION: [], CITATION_SOURCE: [], OWNER_CITATION: [], REMARK: [],
    ...tables,
  } as GenneyTables;
}
