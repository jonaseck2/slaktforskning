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
import { eventTypeHasFactValue } from '../../api/events_gedcom';

// ── Genney row shapes ──────────────────────────────────────────────────────

export interface PersonRow {
  RID: string;             // "I123"
  UID?: string | null;
  SEX?: number | null;     // 0=M, 1=F, null=U
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
  CAUSE?: string | null;
  ADDRESS?: string | null; // free-text event address
  OWNER?: string | null;   // "I123" (person) or "F123" (family)
  PLACE?: string | null;   // denormalized text (ignored if EVENT_PLACE exists)
  [key: string]: unknown;
}

export interface EventPlaceRow {
  EVENT?: string | null;  // EVENT.RID
  PLACE?: number | null;  // SPLACE.RID
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
  // Address fields — present in some Genney databases (analogous to REPO table)
  STREET?: string | null;
  POSTALCODE?: string | null;
  CITY?: string | null;
  COUNTRY?: string | null;
  [key: string]: unknown;
}

export interface SourceRow {
  RID: string;             // "S123"
  TITLE?: string | null;
  ABBREVIATION?: string | null;
  AUTHOR?: string | null;
  PUBLICATION?: string | null;
  CALLNUMBER?: string | null;
  TEXT?: string | null;    // source abstract
  MEDIATYPE?: number | null;
  NOTE?: string | null;
  [key: string]: unknown;
}

export interface RepoRow {
  RID: string;
  NAME?: string | null;
  ADDRESS?: string | null;
  ADDRESS1?: string | null;
  ADDRESS2?: string | null;
  CITY?: string | null;
  POSTALCODE?: string | null;
  STATE?: string | null;
  COUNTRY?: string | null;
  PHONE1?: string | null;
  PHONE2?: string | null;
  EMAIL?: string | null;
  WEB?: string | null;
  CALLNUMBER?: string | null;
  NOTE?: string | null;
  [key: string]: unknown;
}

export interface SourceRepoRow {
  SOURCE?: string | null; // SOURCE.RID
  REPO?: string | null;   // REPO.RID
  [key: string]: unknown;
}

export interface GroupRow {
  RID: string;
  NAME?: string | null;
  NOTE?: string | null;
  [key: string]: unknown;
}

export interface GroupMemberRow {
  GROUPS?: string | null;  // GROUP.RID
  PERSON?: string | null;  // PERSON.RID
  [key: string]: unknown;
}

export interface MediaRow {
  RID: string;
  FILEREF?: string | null;
  TITLE?: string | null;
  FORMAT?: string | null;
  NOTE?: string | null;
  ISPRINTABLE?: number | null;
  [key: string]: unknown;
}

export interface OwnerMediaRow {
  OWNER?: string | null;  // "I123", "E123", "F123", "S123"
  MEDIA?: string | null;  // MEDIA.RID
  LINKTYPE?: number | null;
  [key: string]: unknown;
}

export interface TodoRow {
  RID: string;
  PERSON?: string | null;   // PERSON.RID
  PRIORITY?: number | null;
  STATUS?: string | number | null;   // Genney status (string or integer)
  TASK?: string | null;
  NOTE?: string | null;
  RESULT?: string | null;
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

export interface OwnerEventRow {
  OWNER?: string | null;        // "I123" (person) or "F123" (family)
  EVENT?: string | null;        // EVENT.RID
  COUPLEFAMILY?: string | null; // COUPLE_FAMILY link (unused for now)
  [key: string]: unknown;
}

export interface RemarkRow {
  OWNER?: string | null;    // PERSON.RID
  NOTE?: string | null;
  [key: string]: unknown;
}

export interface GenneyTables {
  PERSON: PersonRow[];
  FAMILY: FamilyRow[];
  COUPLE_FAMILY: CoupleFamilyRow[];
  SPOUSE_FAMILY: SpouseFamilyRow[];
  EVENT: EventRow[];
  EVENT_PLACE: EventPlaceRow[];
  OWNER_EVENT: OwnerEventRow[];
  SPLACE: SPlaceRow[];
  SOURCE: SourceRow[];
  CITATION: CitationRow[];
  CITATION_SOURCE: CitationSourceRow[];
  OWNER_CITATION: OwnerCitationRow[];
  REMARK: RemarkRow[];
  REPO: RepoRow[];
  SOURCE_REPO: SourceRepoRow[];
  GROUPS: GroupRow[];
  GROUP_MEMBER: GroupMemberRow[];
  MEDIA: MediaRow[];
  OWNER_MEDIA: OwnerMediaRow[];
  TODO: TodoRow[];
}

export interface ImportSummary {
  persons: number;
  coupleRelationships: number;
  parentChildRelationships: number;
  events: number;
  places: number;
  sources: number;
  citations: number;
  groups: number;
  repositories: number;
  researchTasks: number;
  media: number;
  warnings: string[];
  skipped: { category: string; count: number; reason: string }[];
}

// ── Mapping helpers ────────────────────────────────────────────────────────

const GENNEY_EVENT_TYPE: Record<string, string> = {
  BIRT: 'birth', DEAT: 'death', MARR: 'marriage', DIV: 'divorce',
  // BAPM collapses to christening — single canonical type for Swedish "Dop".
  CHR: 'christening', BURI: 'burial', BAPM: 'christening', CONF: 'confirmation',
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

/** Extract preferred_name from * or ! marker notation inline (mirrors nameUtils.ts). */
function parseAsterisk(raw: string): { given: string; preferred: string | null } {
  const match = raw.match(/[*!]/);
  if (!match) return { given: raw.trim(), preferred: null };
  const idx = match.index!;
  const beforeMarker = raw.slice(0, idx).trimEnd();
  const afterMarker = raw.slice(idx + 1).trimStart();
  const tokens = beforeMarker.split(/\s+/).filter(Boolean);
  const preferred = tokens[tokens.length - 1] ?? null;
  const given = (beforeMarker + (afterMarker ? ' ' + afterMarker : '')).replace(/\s+/g, ' ').trim();
  return { given: given || raw.trim(), preferred };
}

/**
 * Remap a Genney FILEREF Windows path to a local mediaDir.
 * URLs (http/https) are passed through unchanged.
 * Paths without a 'media[/\]' segment are returned as-is (cannot remap).
 */
export function remapGenneyMediaPath(ref: string, mediaDir: string): string {
  if (ref.startsWith('http://') || ref.startsWith('https://')) return ref;
  const idx = ref.search(/[Mm]edia[/\\]/);
  if (idx === -1) return ref;
  const afterMedia = ref.slice(idx + 6).replace(/\\/g, '/');
  return `${mediaDir.replace(/\/$/, '')}/${afterMedia}`;
}

// ── Main transform ─────────────────────────────────────────────────────────

export function transformGenney(db: Database, tables: GenneyTables, opts: { mediaDir?: string } = {}): ImportSummary {
  const summary: ImportSummary = {
    persons: 0, coupleRelationships: 0, parentChildRelationships: 0,
    events: 0, places: 0, sources: 0, citations: 0,
    groups: 0, repositories: 0, researchTasks: 0, media: 0,
    warnings: [], skipped: [],
  };

  // ── Data-loss counters (populated throughout, reported at end) ───────────
  let orphanedEvents = 0;
  let orphanedCitations = 0;
  const unknownEventTypes = new Set<string>();
  let skippedParentLinks = 0;
  let sourceNoteCount = 0;

  // Pre-compile all INSERT statements once.
  // Each db.prepare() crosses the JS→WASM boundary and compiles SQL.
  // Reusing prepared statements avoids ~31,000 redundant compilations that
  // would otherwise saturate the CPU for a typical Genney database.
  const stmts = {
    insertPlace: db.prepare(
      `INSERT INTO places (id, name, normalized_name, place_type, parent_place_id, latitude, longitude, notes, street, postal_code, city, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    insertPerson: db.prepare(
      `INSERT INTO persons (id, sex, notes) VALUES (?, ?, ?)`
    ),
    insertPersonName: db.prepare(
      `INSERT INTO person_names (id, person_id, given_name, surname, name_type, sort_order, name_prefix, name_suffix, preferred_name, nickname) VALUES (?, ?, ?, ?, 'birth', 0, ?, ?, ?, ?)`
    ),
    insertPersonIdentifier: db.prepare(
      `INSERT OR IGNORE INTO person_identifiers (id, person_id, identifier_type, identifier_value, created_at) VALUES (?, ?, ?, ?, ?)`
    ),
    insertSource: db.prepare(
      `INSERT INTO sources (id, title, author, publication_info, source_type, call_number, abstract) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ),
    insertRelationship: db.prepare(
      `INSERT INTO relationships (id, type, person1_id, person2_id, subtype, notes) VALUES (?, ?, ?, ?, ?, ?)`
    ),
    insertEvent: db.prepare(
      `INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, place_address, cause, value, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    insertRepository: db.prepare(
      `INSERT INTO repositories (id, name, address, city, postal_code, state, country, phone, email, web, call_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    insertSourceRepo: db.prepare(
      `INSERT OR IGNORE INTO source_repositories (source_id, repository_id) VALUES (?, ?)`
    ),
    insertGroup: db.prepare(
      `INSERT INTO groups (id, name, notes) VALUES (?, ?, ?)`
    ),
    insertGroupLink: db.prepare(
      `INSERT OR IGNORE INTO group_links (id, group_id, entity_type, entity_id, sort_order) VALUES (?, ?, 'person', ?, 0)`
    ),
    insertMedia: db.prepare(
      `INSERT INTO media (id, file_ref, title, format, notes, is_printable) VALUES (?, ?, ?, ?, ?, ?)`
    ),
    insertMediaLink: db.prepare(
      `INSERT INTO media_links (id, media_id, entity_type, entity_id, link_type) VALUES (?, ?, ?, ?, ?)`
    ),
    insertResearchTask: db.prepare(
      `INSERT INTO research_tasks (id, priority, status, task, notes, result) VALUES (?, ?, ?, ?, ?, ?)`
    ),
    insertTaskLink: db.prepare(
      `INSERT OR IGNORE INTO task_links (id, task_id, entity_type, entity_id, sort_order) VALUES (?, ?, 'person', ?, 0)`
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
    if (ep.PLACE != null) referencedSplaceIds.add(ep.PLACE);
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
      sp.STREET ?? null, sp.POSTALCODE ?? null, sp.CITY ?? null, sp.COUNTRY ?? null,
    ]);
    splaceFlatMap.set(rid, id);
    importedSplaces.add(rid);
    summary.places++;
  }
  for (const rid of referencedSplaceIds) importSplace(rid);

  // Build event→SPLACE lookup
  const eventToSplace = new Map<string, number>();
  for (const ep of tables.EVENT_PLACE) {
    if (ep.EVENT && ep.PLACE != null) eventToSplace.set(ep.EVENT, ep.PLACE);
  }

  // ── 2. Import persons ────────────────────────────────────────────────────
  const personMap = new Map<string, string>(); // Genney I-ID → UUID
  const remarkByOwner = new Map<string, string>();
  for (const r of tables.REMARK) {
    if (r.OWNER && r.NOTE) remarkByOwner.set(r.OWNER, r.NOTE);
  }

  for (const p of tables.PERSON) {
    let given: string | null = p.GIVENNAME ?? null;
    let preferred_name: string | null = null;
    if (given && given.includes('*')) {
      const parsed = parseAsterisk(given);
      given = parsed.given;
      preferred_name = parsed.preferred;
    }

    const sex: 'M' | 'F' | 'U' = p.SEX === 0 ? 'M' : p.SEX === 1 ? 'F' : 'U';
    const remark = remarkByOwner.get(p.RID);
    const noteParts = [p.NOTE, remark].filter(Boolean);
    const notes = noteParts.length > 0 ? noteParts.join('\n') : '';

    const id = crypto.randomUUID();
    stmts.insertPerson.run([id, sex, notes]);
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

  // Count sources with non-empty NOTE (NOTE field is not mapped to any app field)
  sourceNoteCount = tables.SOURCE.filter(s => s.NOTE?.trim()).length;

  for (const src of tables.SOURCE) {
    const title = (src.TITLE || src.ABBREVIATION || '').trim();
    const id = crypto.randomUUID();
    stmts.insertSource.run([
      id, title, src.AUTHOR ?? '', src.PUBLICATION ?? '', mapSourceType(src.MEDIATYPE),
      src.CALLNUMBER ?? null, src.TEXT ?? null,
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

    // Only import parent links where the link type is explicitly set.
    // Rows with null FATHERLINK/MOTHERLINK appear in some Genney databases as
    // chronologically impossible artifacts (parent born decades after child)
    // that Genney's own GEDCOM exporter silently drops.
    if (cf.FATHER && cf.FATHERLINK) {
      const fatherId = personMap.get(cf.FATHER);
      if (fatherId) {
        stmts.insertRelationship.run([
          crypto.randomUUID(), 'parent_child', fatherId, childId,
          mapParentChildSubtype(cf.FATHERLINK) ?? null, '',
        ]);
        summary.parentChildRelationships++;
      }
    } else if (cf.FATHER && !cf.FATHERLINK) {
      skippedParentLinks++;
    }

    if (cf.MOTHER && cf.MOTHERLINK) {
      const motherId = personMap.get(cf.MOTHER);
      if (motherId) {
        stmts.insertRelationship.run([
          crypto.randomUUID(), 'parent_child', motherId, childId,
          mapParentChildSubtype(cf.MOTHERLINK) ?? null, '',
        ]);
        summary.parentChildRelationships++;
      }
    } else if (cf.MOTHER && !cf.MOTHERLINK) {
      skippedParentLinks++;
    }
  }

  // ── 6. Import events ─────────────────────────────────────────────────────
  // Build canonical event→owners map from OWNER_EVENT (preferred over EVENT.OWNER).
  // OWNER is "I123" (person) or "F123" (family). One event can have multiple owners.
  const ownerEventMap = new Map<string, string[]>(); // EVENT.RID → [OWNER, ...]
  for (const oe of tables.OWNER_EVENT) {
    if (!oe.EVENT || !oe.OWNER) continue;
    if (!ownerEventMap.has(oe.EVENT)) ownerEventMap.set(oe.EVENT, []);
    ownerEventMap.get(oe.EVENT)!.push(oe.OWNER);
  }

  const eventMap = new Map<string, string>(); // Genney E-ID → UUID

  for (const ev of tables.EVENT) {
    // Track unknown event types (those not in GENNEY_EVENT_TYPE map, excluding null/empty)
    if (ev.TYPE && !GENNEY_EVENT_TYPE[ev.TYPE.toUpperCase()]) {
      unknownEventTypes.add(ev.TYPE);
    }
    const event_type = mapEventType(ev.TYPE);
    const dateStr = ev.DATE ?? '';
    const parsedDate = dateStr ? parseGedcomDate(dateStr) : null;

    const splaceRid = eventToSplace.get(ev.RID);
    const place_id = splaceRid != null ? splaceFlatMap.get(splaceRid) ?? null : null;

    // For fact-shaped events (occupation, religion, education, title, …), Genney's
    // DESCRIPTION field carries the GEDCOM-X Fact.value (e.g. "Carpenter"). Route it
    // to events.value so the UI can render it as the headline. For non-fact events,
    // DESCRIPTION is prose — concatenate with NOTE and store in events.notes.
    const isFactShaped = eventTypeHasFactValue(event_type);
    const value = isFactShaped ? (ev.DESCRIPTION ?? null) : null;
    const descParts = isFactShaped
      ? [ev.NOTE].filter(Boolean)
      : [ev.DESCRIPTION, ev.NOTE].filter(Boolean);
    const notes = descParts.length > 0 ? descParts.join('\n') : '';

    // Use OWNER_EVENT as canonical source; fall back to EVENT.OWNER if missing
    const owners = ownerEventMap.get(ev.RID) ?? (ev.OWNER ? [ev.OWNER] : []);
    if (owners.length === 0) orphanedEvents++;
    const familyOwner = owners.find(o => o.startsWith('F'));
    const rel_id = familyOwner ? familyMap.get(familyOwner) ?? null : null;

    const id = crypto.randomUUID();
    stmts.insertEvent.run([
      id, event_type, rel_id,
      parsedDate?.date_type ?? 'unknown',
      parsedDate?.date_value ?? null,
      parsedDate?.date_value_end ?? null,
      parsedDate?.date_original ?? dateStr,
      place_id, ev.ADDRESS ?? null, ev.CAUSE ?? null,
      value,
      notes,
    ]);
    eventMap.set(ev.RID, id);

    // Add participants: all person owners get role 'primary'
    for (const owner of owners) {
      if (!owner.startsWith('I')) continue;
      const person_id = personMap.get(owner);
      if (person_id) stmts.insertParticipant.run([crypto.randomUUID(), id, person_id, 'primary']);
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
    if (!sourceRid) { orphanedCitations++; continue; }
    const source_id = sourceMap.get(sourceRid);
    if (!source_id) { orphanedCitations++; continue; }

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
      let event_id = owner.startsWith('E') ? eventMap.get(owner) ?? null : null;
      const relationship_id = owner.startsWith('F') ? familyMap.get(owner) ?? null : null;

      if (owner.startsWith('I')) {
        const person_id = personMap.get(owner);
        if (person_id) {
          const mentionId = crypto.randomUUID();
          stmts.insertEvent.run([mentionId, 'mention', null, 'unknown', null, null, '', null, null, null, null, '']);
          stmts.insertParticipant.run([crypto.randomUUID(), mentionId, person_id, 'primary']);
          event_id = mentionId;
          summary.events++;
        }
      }

      stmts.insertCitation.run([
        crypto.randomUUID(), source_id, event_id, null, relationship_id,
        cit.WHEREINTEXT ?? '', mapConfidence(cit.CERTAINTY),
        cit.TEXT ?? '', cit.NOTE ?? '', cit.DATE ?? '',
      ]);
      summary.citations++;
    }
  }

  // ── 8. Import repositories ───────────────────────────────────────────────
  const repoMap = new Map<string, string>(); // Genney REPO.RID → UUID

  for (const repo of tables.REPO) {
    if (!repo.RID) continue;
    const id = crypto.randomUUID();
    const addressLine = [repo.ADDRESS, repo.ADDRESS1, repo.ADDRESS2].filter(Boolean).join(', ') || null;
    stmts.insertRepository.run([
      id, repo.NAME ?? repo.RID,
      addressLine, repo.CITY ?? null, repo.POSTALCODE ?? null,
      repo.STATE ?? null, repo.COUNTRY ?? null,
      repo.PHONE1 ?? null, repo.EMAIL ?? null, repo.WEB ?? null,
      repo.CALLNUMBER ?? null, repo.NOTE ?? '',
    ]);
    repoMap.set(repo.RID, id);
    summary.repositories++;
  }

  // Link sources to repositories
  for (const sr of tables.SOURCE_REPO) {
    if (!sr.SOURCE || !sr.REPO) continue;
    const source_id = sourceMap.get(sr.SOURCE);
    const repo_id = repoMap.get(sr.REPO);
    if (source_id && repo_id) stmts.insertSourceRepo.run([source_id, repo_id]);
  }

  // ── 9. Import groups + memberships ──────────────────────────────────────
  const groupMap = new Map<string, string>(); // Genney GROUP.RID → UUID

  for (const grp of tables.GROUPS) {
    if (!grp.RID) continue;
    const id = crypto.randomUUID();
    stmts.insertGroup.run([id, grp.NAME ?? grp.RID, grp.NOTE ?? '']);
    groupMap.set(grp.RID, id);
    summary.groups++;
  }

  for (const gm of tables.GROUP_MEMBER) {
    if (!gm.GROUPS || !gm.PERSON) continue;
    const group_id = groupMap.get(gm.GROUPS);
    const person_id = personMap.get(gm.PERSON);
    if (group_id && person_id) {
      stmts.insertGroupLink.run([crypto.randomUUID(), group_id, person_id]);
    }
  }

  // ── 10. Import media + links ─────────────────────────────────────────────
  const mediaMap = new Map<string, string>(); // Genney MEDIA.RID → UUID

  for (const m of tables.MEDIA) {
    if (!m.RID) continue;
    const id = crypto.randomUUID();
    let fileRef = m.FILEREF ?? null;
    if (fileRef && opts.mediaDir) fileRef = remapGenneyMediaPath(fileRef, opts.mediaDir);
    stmts.insertMedia.run([
      id, fileRef, m.TITLE ?? '', m.FORMAT ?? null,
      m.NOTE ?? '', m.ISPRINTABLE === 1 ? 1 : 0,
    ]);
    mediaMap.set(m.RID, id);
    summary.media++;
  }

  for (const om of tables.OWNER_MEDIA) {
    if (!om.OWNER || !om.MEDIA) continue;
    const media_id = mediaMap.get(om.MEDIA);
    if (!media_id) continue;

    let entity_type: string | null = null;
    let entity_id: string | null = null;

    if (om.OWNER.startsWith('I')) { entity_type = 'person'; entity_id = personMap.get(om.OWNER) ?? null; }
    else if (om.OWNER.startsWith('E')) { entity_type = 'event'; entity_id = eventMap.get(om.OWNER) ?? null; }
    else if (om.OWNER.startsWith('F')) { entity_type = 'relationship'; entity_id = familyMap.get(om.OWNER) ?? null; }
    else if (om.OWNER.startsWith('S')) { entity_type = 'source'; entity_id = sourceMap.get(om.OWNER) ?? null; }

    if (entity_type && entity_id) {
      stmts.insertMediaLink.run([crypto.randomUUID(), media_id, entity_type, entity_id, om.LINKTYPE ?? null]);
    }
  }

  // ── 11. Import research tasks (TODO) ─────────────────────────────────────
  const GENNEY_TODO_STATUS: Record<string, string> = {
    'open': 'open', 'in progress': 'in_progress', 'done': 'done', 'stopped': 'stopped',
  };

  for (const todo of tables.TODO) {
    if (!todo.RID) continue;
    const taskId = crypto.randomUUID();
    const person_id = todo.PERSON ? personMap.get(todo.PERSON) ?? null : null;
    const status = GENNEY_TODO_STATUS[String(todo.STATUS ?? '').toLowerCase()] ?? 'open';
    stmts.insertResearchTask.run([
      taskId,
      todo.PRIORITY ?? 0, status,
      todo.TASK ?? '', todo.NOTE ?? '', todo.RESULT ?? '',
    ]);
    if (person_id) {
      stmts.insertTaskLink.run([crypto.randomUUID(), taskId, person_id]);
    }
    summary.researchTasks++;
  }

  // ── Populate warnings and skipped ────────────────────────────────────────
  const unrefPlaceCount = splacesById.size - importedSplaces.size;

  if (orphanedEvents > 0) {
    summary.skipped.push({
      category: 'Events with no owner (no OWNER_EVENT entry)',
      count: orphanedEvents,
      reason: 'Event not linked to any person or family — orphaned in source data',
    });
  }
  if (orphanedCitations > 0) {
    summary.skipped.push({
      category: 'Citations with no linked source (CITATION_SOURCE missing or source not found)',
      count: orphanedCitations,
      reason: 'Citation could not be imported because the source it references was not found',
    });
  }
  if (unknownEventTypes.size > 0) {
    summary.warnings.push(
      `${[...unknownEventTypes].join(', ')} event type(s) not recognised — mapped to 'other'`
    );
  }
  if (skippedParentLinks > 0) {
    summary.skipped.push({
      category: 'Parent-child relationships with missing link type',
      count: skippedParentLinks,
      reason: 'FATHERLINK or MOTHERLINK is null — relationship not importable',
    });
  }
  if (unrefPlaceCount > 0) {
    summary.skipped.push({
      category: 'Unreferenced places (no events in those locations)',
      count: unrefPlaceCount,
      reason: 'Place hierarchy entries with no associated events — not imported',
    });
  }
  if (sourceNoteCount > 0) {
    summary.warnings.push(`${sourceNoteCount} source(s) have a NOTE field — not mapped to any app field, content not imported`);
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
    EVENT: [], EVENT_PLACE: [], OWNER_EVENT: [], SPLACE: [], SOURCE: [],
    CITATION: [], CITATION_SOURCE: [], OWNER_CITATION: [], REMARK: [],
    REPO: [], SOURCE_REPO: [], GROUPS: [], GROUP_MEMBER: [],
    MEDIA: [], OWNER_MEDIA: [], TODO: [],
    ...tables,
  } as GenneyTables;
}
