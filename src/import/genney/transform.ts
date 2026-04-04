/**
 * Genney Derby → Släktforskning transform.
 * Maps Genney schema rows (exported as JSON by DerbyExtractor.java) to our API types.
 * Pure logic: no Electron/IPC/UI dependencies.
 */

import type { Database } from 'node-sqlite3-wasm';
import * as personsApi from '../../api/persons';
import * as relationshipsApi from '../../api/relationships';
import * as eventsApi from '../../api/events';
import * as sourcesApi from '../../api/sources';
import * as placesApi from '../../api/places';
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

function mapSourceType(mediatype: number | null | undefined): string | null {
  // Genney media types are integers; map broadly
  if (mediatype == null) return null;
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

    const parentUuid = sp.PARENT != null ? splaceFlatMap.get(sp.PARENT) : undefined;
    const lat = sp.LATITUD != null && sp.LATITUD !== 0 ? sp.LATITUD : null;
    const lon = sp.LONGITUD != null && sp.LONGITUD !== 0 ? sp.LONGITUD : null;

    const place = placesApi.createPlace(db, {
      name: sp.NAME ?? `Place ${rid}`,
      place_type: mapSplaceType(sp.TYPE),
      parent_place_id: parentUuid ?? null,
      latitude: lat,
      longitude: lon,
      notes: sp.NOTE ?? null,
    });
    splaceFlatMap.set(rid, place.id);
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
    const notes = noteParts.length > 0 ? noteParts.join('\n') : null;

    const person = personsApi.createPerson(db, {
      sex,
      living: p.LIVING === 1 ? true : undefined,
      notes: notes ?? undefined,
    });
    personMap.set(p.RID, person.id);

    if (given || p.SURNAME) {
      personsApi.addPersonName(db, person.id, {
        given_name: given,
        surname: p.SURNAME ?? null,
        name_type: 'birth',
        preferred_name,
        nickname: p.NICKNAME ?? null,
        name_prefix: p.PREFIX ?? null,
        name_suffix: p.SUFFIX ?? null,
      });
    }

    if (p.UID) {
      try {
        personsApi.addPersonIdentifier(db, person.id, {
          identifier_type: 'other',
          identifier_value: String(p.UID),
        });
      } catch {
        // non-fatal
      }
    }

    summary.persons++;
  }

  // ── 3. Import sources ────────────────────────────────────────────────────
  const sourceMap = new Map<string, string>(); // Genney S-ID → UUID

  for (const src of tables.SOURCE) {
    const title = (src.TITLE || src.ABBREVIATION || '').trim();
    const source = sourcesApi.createSource(db, {
      title: title || undefined,
      author: src.AUTHOR ?? null,
      publication_info: src.PUBLICATION ?? null,
      source_type: mapSourceType(src.MEDIATYPE) ?? undefined,
    });
    sourceMap.set(src.RID, source.id);
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
    const p1 = fam.HUSBAND ? personMap.get(fam.HUSBAND) : undefined;
    const p2 = fam.WIFE ? personMap.get(fam.WIFE) : undefined;
    const subtype = mapCoupleSubtype(spouseRelType.get(fam.RID));

    const rel = relationshipsApi.createRelationship(db, {
      type: 'couple',
      person1_id: p1 ?? null,
      person2_id: p2 ?? null,
      subtype,
      notes: fam.NOTE ?? null,
    });
    familyMap.set(fam.RID, rel.id);
    summary.coupleRelationships++;
  }

  // ── 5. Import parent_child relationships ─────────────────────────────────
  for (const cf of tables.COUPLE_FAMILY) {
    const childId = cf.PERSON ? personMap.get(cf.PERSON) : undefined;
    if (!childId) continue;

    if (cf.FATHER) {
      const fatherId = personMap.get(cf.FATHER);
      if (fatherId) {
        relationshipsApi.createRelationship(db, {
          type: 'parent_child',
          person1_id: fatherId,
          person2_id: childId,
          subtype: mapParentChildSubtype(cf.FATHERLINK),
        });
        summary.parentChildRelationships++;
      }
    }

    if (cf.MOTHER) {
      const motherId = personMap.get(cf.MOTHER);
      if (motherId) {
        relationshipsApi.createRelationship(db, {
          type: 'parent_child',
          person1_id: motherId,
          person2_id: childId,
          subtype: mapParentChildSubtype(cf.MOTHERLINK),
        });
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
    const place_id = splaceRid != null ? splaceFlatMap.get(splaceRid) : undefined;

    const descParts = [ev.DESCRIPTION, ev.NOTE].filter(Boolean);
    const description = descParts.length > 0 ? descParts.join('\n') : null;

    const ownerIsFamily = ev.OWNER?.startsWith('F') ?? false;
    const rel_id = ownerIsFamily && ev.OWNER ? familyMap.get(ev.OWNER) : undefined;
    const person_id = !ownerIsFamily && ev.OWNER?.startsWith('I') ? personMap.get(ev.OWNER) : undefined;

    const event = eventsApi.createEvent(db, {
      event_type,
      relationship_id: rel_id ?? null,
      date_type: parsedDate?.date_type ?? 'unknown',
      date_value: parsedDate?.date_value ?? null,
      date_value_end: parsedDate?.date_value_end ?? null,
      date_original: parsedDate?.date_original ?? dateStr,
      place_id: place_id ?? null,
      description,
    });
    eventMap.set(ev.RID, event.id);

    if (person_id) {
      relationshipsApi.addEventParticipant(db, {
        event_id: event.id,
        person_id,
        role: 'primary',
      });
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
      // Unlinked citation — import without owner
      sourcesApi.createCitation(db, {
        source_id,
        page: cit.WHEREINTEXT ?? null,
        confidence: mapConfidence(cit.CERTAINTY),
        transcription: cit.TEXT ?? null,
        notes: cit.NOTE ?? null,
        date_accessed: cit.DATE ?? null,
      });
      summary.citations++;
      continue;
    }

    for (const owner of owners) {
      const event_id = owner.startsWith('E') ? eventMap.get(owner) : undefined;
      const person_id = owner.startsWith('I') ? personMap.get(owner) : undefined;
      const relationship_id = owner.startsWith('F') ? familyMap.get(owner) : undefined;

      sourcesApi.createCitation(db, {
        source_id,
        event_id: event_id ?? null,
        person_id: person_id ?? null,
        relationship_id: relationship_id ?? null,
        page: cit.WHEREINTEXT ?? null,
        confidence: mapConfidence(cit.CERTAINTY),
        transcription: cit.TEXT ?? null,
        notes: cit.NOTE ?? null,
        date_accessed: cit.DATE ?? null,
      });
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
