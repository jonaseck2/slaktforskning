import type { Database } from 'node-sqlite3-wasm';
import type { GedcomNode } from './parser';
import type { Place, Relationship, RelationshipType, EventParticipantRole } from '../api/types';
import { parseGedcomDate } from './date';
import { createPerson, addPersonName, addPersonIdentifier } from '../api/persons';
import { createRelationship, updateRelationship, addEventParticipant, getRelationshipsOfPerson } from '../api/relationships';
import { createEvent } from '../api/events';
import { createSource, createCitation } from '../api/sources';
import { getPlace, findOrCreatePlace, updatePlace } from '../api/places';
import { findOrCreateSwedishPlace } from './swedishPlace';
import { extractPatronymic } from './swedishNames';

const PERSON_EVENT_TAGS: Record<string, string> = {
  BIRT: 'birth', DEAT: 'death', CHR: 'christening', BURI: 'burial',
  BAPM: 'baptism', CONF: 'confirmation', OCCU: 'occupation',
  RESI: 'residence', EDUC: 'education', EMIG: 'emigration',
  IMMI: 'immigration', NATU: 'naturalization', CENS: 'census',
  PROB: 'probate', WILL: 'will', GRAD: 'graduation', RETI: 'retirement',
  EVEN: 'other',
};

const FAMILY_EVENT_TAGS: Record<string, string> = {
  MARR: 'marriage', DIV: 'divorce', CENS: 'census', EVEN: 'other',
};

function getChild(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find(c => c.tag === tag);
}

function getChildren(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter(c => c.tag === tag);
}

/**
 * Update a place record with data from PLAC sub-tags (MAP/ADDR/custom tags).
 * Only writes fields that are actually present in the sub-tags; missing sub-tags
 * preserve the existing values via updatePlace's merge logic.
 */
function updatePlaceFromNode(db: Database, placeId: string, placNode: GedcomNode): void {
  const mapNode = getChild(placNode, 'MAP');
  let lat: number | null = null;
  let lon: number | null = null;
  if (mapNode) {
    const latiStr = getChild(mapNode, 'LATI')?.value ?? '';
    const longStr = getChild(mapNode, 'LONG')?.value ?? '';
    if (latiStr) {
      const dir = latiStr[0];
      const val = parseFloat(latiStr.slice(1));
      if (!isNaN(val)) lat = val * (dir === 'S' ? -1 : 1);
    }
    if (longStr) {
      const dir = longStr[0];
      const val = parseFloat(longStr.slice(1));
      if (!isNaN(val)) lon = val * (dir === 'W' ? -1 : 1);
    }
  }
  const addrNode = getChild(placNode, 'ADDR');
  const street = addrNode ? (getChild(addrNode, 'ADR1')?.value ?? null) : null;
  const postal_code = addrNode ? (getChild(addrNode, 'POST')?.value ?? null) : null;
  const city = addrNode ? (getChild(addrNode, 'CITY')?.value ?? null) : null;
  const country = addrNode ? (getChild(addrNode, 'CTRY')?.value ?? null) : null;
  const place_type = getChild(placNode, '_PTYPE')?.value ?? null;
  const notes = getChild(placNode, '_PNOTES')?.value ?? null;
  const date_from = getChild(placNode, '_DATE_FROM')?.value ?? null;
  const date_to = getChild(placNode, '_DATE_TO')?.value ?? null;

  // Skip the DB write if nothing useful is in the sub-tags
  if (lat == null && lon == null && !street && !postal_code && !city && !country &&
      !place_type && !notes && !date_from && !date_to) return;

  updatePlace(db, placeId, {
    ...(lat != null && { latitude: lat }),
    ...(lon != null && { longitude: lon }),
    ...(street && { street }),
    ...(postal_code && { postal_code }),
    ...(city && { city }),
    ...(country && { country }),
    ...(place_type && { place_type: place_type as Place['place_type'] }),
    ...(notes && { notes }),
    ...(date_from && { date_from }),
    ...(date_to && { date_to }),
  });
}

/**
 * Resolve a PLAC node to a Place record.
 * - If `_PLAC_ID` sub-tag is present and already mapped, returns the mapped place.
 * - If `_PLAC_ID` refers to an existing UUID in this DB, reuses it (same-DB roundtrip).
 * - Otherwise falls back to resolvePlaceFn (name match / create).
 * - Always applies additional data from sub-tags (MAP, ADDR, etc.) to the resolved place.
 * Updates placeIdMap with old→new UUID mapping for later use in _PLAC records.
 */
function resolvePlace(
  db: Database,
  placNode: GedcomNode,
  resolvePlaceFn: (db: Database, name: string) => Place,
  placeIdMap: Map<string, string>,
): Place | null {
  const oldPlaceId = getChild(placNode, '_PLAC_ID')?.value;
  let place: Place | null = null;

  if (oldPlaceId) {
    // Check if we already resolved this old ID in this import session
    const mappedId = placeIdMap.get(oldPlaceId);
    if (mappedId) {
      place = getPlace(db, mappedId);
    } else {
      // Same-DB roundtrip: UUID exists verbatim in this DB
      place = getPlace(db, oldPlaceId);
      if (place) placeIdMap.set(oldPlaceId, oldPlaceId);
    }
  }

  if (!place && placNode.value) {
    place = resolvePlaceFn(db, placNode.value);
    if (oldPlaceId && place) placeIdMap.set(oldPlaceId, place.id);
  }

  if (place) updatePlaceFromNode(db, place.id, placNode);

  return place;
}

function importEventNode(
  db: Database,
  evNode: GedcomNode,
  appType: string,
  sourceMap: Map<string, string>,
  opts: { relationship_id?: string | null },
  resolvePlaceFn: (db: Database, name: string) => Place,
  placeIdMap: Map<string, string>,
  eventIdMap: Map<string, string>,
) {
  const dateNode = getChild(evNode, 'DATE');
  const placNode = getChild(evNode, 'PLAC');
  const parsed = dateNode
    ? parseGedcomDate(dateNode.value)
    : { date_type: 'unknown' as const, date_value: null, date_value_end: null, date_original: '' };
  const place = placNode ? resolvePlace(db, placNode, resolvePlaceFn, placeIdMap) : null;
  const noteValue = getChild(evNode, 'NOTE')?.value ?? '';

  const event = createEvent(db, {
    event_type: appType,
    date_type: parsed.date_type,
    date_value: parsed.date_value,
    date_value_end: parsed.date_value_end,
    date_original: parsed.date_original,
    place_id: place?.id ?? null,
    relationship_id: opts.relationship_id ?? null,
    description: noteValue,
  });

  // Track old→new event ID so ASSO _EVID references resolve across databases
  const oldEvid = getChild(evNode, '_EVID')?.value;
  if (oldEvid) eventIdMap.set(oldEvid, event.id);

  // Inline source citations
  for (const sour of getChildren(evNode, 'SOUR')) {
    const srcId = sourceMap.get(sour.value) ?? sourceMap.get(sour.xref ?? '');
    if (srcId) {
      const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
      const page = getChild(sour, 'PAGE')?.value ?? '';
      const dataNode = getChild(sour, 'DATA');
      const transcription = dataNode ? getChild(dataNode, 'TEXT')?.value ?? '' : '';
      const notes = getChild(sour, 'NOTE')?.value ?? '';
      const date_accessed = getChild(sour, '_ACCESSED')?.value ?? '';
      createCitation(db, {
        source_id: srcId,
        event_id: event.id,
        page,
        confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
        transcription,
        notes: notes || undefined,
        date_accessed: date_accessed || undefined,
      });
    }
  }

  return event;
}

export interface ImportOptions {
  /** Import profile. 'genney' enables Genney 4.1-specific extensions:
   *  Swedish hierarchical places, patronymic detection, _UID/_YHAPLOGROUP/_MHAPLOGROUP tags. */
  profile?: 'genney';
}

export function importGedcom(db: Database, tree: GedcomNode[], options?: ImportOptions): void {
  const isGenney = options?.profile === 'genney';
  const resolvePlaceFn = isGenney ? findOrCreateSwedishPlace : findOrCreatePlace;

  // Maps that survive across phases for post-processing
  const placeIdMap = new Map<string, string>();  // old place UUID → current DB place UUID
  const eventIdMap = new Map<string, string>();  // old event UUID → current DB event UUID
  const assoData: Array<{ personId: string; assoNode: GedcomNode }> = [];

  // ── Phase 1: SOUR records ──────────────────────────────────────────────────
  const sourceMap = new Map<string, string>(); // xref → app source id
  for (const node of tree) {
    if (node.tag !== 'SOUR' || !node.xref) continue;
    const src = createSource(db, {
      title: getChild(node, 'TITL')?.value ?? '',
      author: getChild(node, 'AUTH')?.value ?? '',
      publication_info: getChild(node, 'PUBL')?.value ?? '',
      repository: getChild(node, 'REPO')?.value ?? '',
      url: getChild(node, '_URL')?.value ?? '',
      source_type: getChild(node, '_STYPE')?.value ?? '',
    });
    sourceMap.set(node.xref, src.id);
  }

  // ── Phase 2: INDI records ──────────────────────────────────────────────────
  const personMap = new Map<string, string>(); // xref → app person id
  for (const node of tree) {
    if (node.tag !== 'INDI' || !node.xref) continue;

    const sex = (getChild(node, 'SEX')?.value ?? 'U') as 'M' | 'F' | 'U';
    const living = getChild(node, '_LIVING')?.value === 'Y';
    let notes = getChild(node, 'NOTE')?.value ?? '';

    // Genney 4.1: haplogroup tags → append to notes
    if (isGenney) {
      const yHaplo = getChild(node, '_YHAPLOGROUP')?.value;
      const mHaplo = getChild(node, '_MHAPLOGROUP')?.value;
      if (yHaplo) notes = notes ? `${notes}\nY-DNA: ${yHaplo}` : `Y-DNA: ${yHaplo}`;
      if (mHaplo) notes = notes ? `${notes}\nmtDNA: ${mHaplo}` : `mtDNA: ${mHaplo}`;
    }

    const person = createPerson(db, {
      sex,
      living: living || undefined,
      notes: notes || undefined,
    });
    personMap.set(node.xref, person.id);

    // Names
    const nameNodes = getChildren(node, 'NAME');
    for (const nameNode of nameNodes) {
      const raw = nameNode.value ?? '';
      const surnameMatch = raw.match(/^(.*?)\/(.+?)\/(.*)$/);
      const given = (surnameMatch ? surnameMatch[1] : raw).trim() || null;
      const surname = surnameMatch ? surnameMatch[2].trim() || null : null;
      const prefix = getChild(nameNode, 'NPFX')?.value ?? null;
      const suffix = getChild(nameNode, 'NSFX')?.value ?? null;
      const rawType = getChild(nameNode, 'TYPE')?.value?.toUpperCase();
      const name_type = rawType === 'MARRIED' ? 'married' : rawType === 'AKA' ? 'aka' : rawType === 'ALIAS' ? 'alias' : 'birth';

      // _PATR overrides genney patronymic detection; both can coexist
      const explicitPatr = getChild(nameNode, '_PATR')?.value ?? null;
      const patronymic_base = explicitPatr ?? (isGenney && surname ? extractPatronymic(surname) : null);

      addPersonName(db, person.id, {
        given_name: given,
        surname,
        name_prefix: prefix,
        name_suffix: suffix,
        name_type: name_type as 'birth' | 'married' | 'alias' | 'aka',
        patronymic_base,
        preferred_name: getChild(nameNode, 'NICK')?.value ?? null,
        name_qualifier: (getChild(nameNode, '_NQUAL')?.value ?? null) as string | null,
        date_from: getChild(nameNode, '_DATE_FROM')?.value ?? null,
        date_to: getChild(nameNode, '_DATE_TO')?.value ?? null,
      });
    }

    // External identifiers: standard GEDCOM
    for (const refn of getChildren(node, 'REFN')) {
      if (refn.value) addPersonIdentifier(db, person.id, { identifier_type: 'refn', identifier_value: refn.value });
    }
    const rin = getChild(node, 'RIN');
    if (rin?.value) addPersonIdentifier(db, person.id, { identifier_type: 'rin', identifier_value: rin.value });

    // Genney 4.1: _UID → person_identifiers
    if (isGenney) {
      const uid = getChild(node, '_UID');
      if (uid?.value) addPersonIdentifier(db, person.id, { identifier_type: 'other', identifier_value: `Genney UID: ${uid.value}` });
    }

    // Extended identifiers
    const fsi = getChild(node, '_FSI');
    if (fsi?.value) addPersonIdentifier(db, person.id, { identifier_type: 'familysearch', identifier_value: fsi.value });
    const anid = getChild(node, '_ANID');
    if (anid?.value) addPersonIdentifier(db, person.id, { identifier_type: 'ancestry', identifier_value: anid.value });
    const raid = getChild(node, '_RAID');
    if (raid?.value) addPersonIdentifier(db, person.id, { identifier_type: 'riksarkivet', identifier_value: raid.value });
    const pnummer = getChild(node, '_PNUMMER');
    if (pnummer?.value) addPersonIdentifier(db, person.id, { identifier_type: 'personnummer', identifier_value: pnummer.value });

    // Person events
    for (const [gedTag, appType] of Object.entries(PERSON_EVENT_TAGS)) {
      for (const evNode of getChildren(node, gedTag)) {
        const event = importEventNode(db, evNode, appType, sourceMap, {}, resolvePlaceFn, placeIdMap, eventIdMap);
        addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });
      }
    }

    // Person-level citations (SOUR directly on INDI, not under an event)
    for (const sour of getChildren(node, 'SOUR')) {
      const srcId = sourceMap.get(sour.value) ?? sourceMap.get(sour.xref ?? '');
      if (srcId) {
        const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
        const page = getChild(sour, 'PAGE')?.value ?? '';
        const citNotes = getChild(sour, 'NOTE')?.value ?? '';
        const date_accessed = getChild(sour, '_ACCESSED')?.value ?? '';
        createCitation(db, {
          source_id: srcId,
          person_id: person.id,
          page,
          confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
          notes: citNotes || undefined,
          date_accessed: date_accessed || undefined,
        });
      }
    }

    // Collect ASSO blocks for post-processing (Phase 4)
    for (const assoNode of getChildren(node, 'ASSO')) {
      assoData.push({ personId: person.id, assoNode });
    }
  }

  // ── Phase 3: FAM records ───────────────────────────────────────────────────
  for (const node of tree) {
    if (node.tag !== 'FAM') continue;

    const husbXref = getChild(node, 'HUSB')?.value;
    const wifeXref = getChild(node, 'WIFE')?.value;
    const person1Id = husbXref ? personMap.get(husbXref) ?? null : null;
    const person2Id = wifeXref ? personMap.get(wifeXref) ?? null : null;

    const couple = createRelationship(db, {
      type: 'couple',
      person1_id: person1Id,
      person2_id: person2Id,
      subtype: 'unknown',
    });

    // Extended couple metadata
    const subtype = getChild(node, '_SUBTYPE')?.value;
    const relnotes = getChild(node, '_RELNOTES')?.value;
    if (subtype || relnotes) {
      const updates: Parameters<typeof updateRelationship>[2] = {};
      if (subtype) updates.subtype = subtype;
      if (relnotes) updates.notes = relnotes;
      updateRelationship(db, couple.id, updates);
    }

    // Family events
    for (const [gedTag, appType] of Object.entries(FAMILY_EVENT_TAGS)) {
      for (const evNode of getChildren(node, gedTag)) {
        importEventNode(db, evNode, appType, sourceMap, { relationship_id: couple.id }, resolvePlaceFn, placeIdMap, eventIdMap);
      }
    }

    // Children → parent_child relationships with PEDI subtype
    for (const chil of getChildren(node, 'CHIL')) {
      const childId = personMap.get(chil.value);
      if (!childId) continue;
      const pedi = getChild(chil, 'PEDI')?.value;
      // 'birth' is the GEDCOM term for biological; everything else maps directly
      const childSubtype = pedi ? (pedi === 'birth' ? 'biological' : pedi) : 'biological';
      if (person1Id) createRelationship(db, { type: 'parent_child', person1_id: person1Id, person2_id: childId, subtype: childSubtype });
      if (person2Id) createRelationship(db, { type: 'parent_child', person1_id: person2Id, person2_id: childId, subtype: childSubtype });
    }

    // Family-level citations (SOUR directly on FAM, not under an event)
    for (const sour of getChildren(node, 'SOUR')) {
      const srcId = sourceMap.get(sour.value) ?? sourceMap.get(sour.xref ?? '');
      if (srcId) {
        const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
        const page = getChild(sour, 'PAGE')?.value ?? '';
        const citNotes = getChild(sour, 'NOTE')?.value ?? '';
        const date_accessed = getChild(sour, '_ACCESSED')?.value ?? '';
        createCitation(db, {
          source_id: srcId,
          relationship_id: couple.id,
          page,
          confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
          notes: citNotes || undefined,
          date_accessed: date_accessed || undefined,
        });
      }
    }
  }

  // ── Phase 4: Post-process ASSO blocks ─────────────────────────────────────
  // Two cases: event-participant ASSO (has _EVID) and relationship ASSO (no _EVID).
  for (const { personId, assoNode } of assoData) {
    const otherPersonXref = assoNode.value;
    const otherPersonId = personMap.get(otherPersonXref);
    if (!otherPersonId) continue;

    const rela = getChild(assoNode, 'RELA')?.value?.toLowerCase() ?? '';
    const evidRef = getChild(assoNode, '_EVID')?.value;

    if (evidRef) {
      // Non-primary event participant: map old event UUID → new event UUID
      const newEventId = eventIdMap.get(evidRef);
      if (newEventId) {
        addEventParticipant(db, {
          event_id: newEventId,
          person_id: otherPersonId,
          role: rela as EventParticipantRole,
        });
      }
    } else {
      // Sibling / godparent / other relationship — deduplicate before creating
      const relType = rela as RelationshipType;
      if (relType === 'sibling' || relType === 'godparent' || relType === 'other') {
        const existingRels = getRelationshipsOfPerson(db, personId).filter((r: Relationship) =>
          r.type === relType &&
          ((r.person1_id === personId && r.person2_id === otherPersonId) ||
           (r.person1_id === otherPersonId && r.person2_id === personId))
        );
        if (existingRels.length === 0) {
          createRelationship(db, { type: relType, person1_id: personId, person2_id: otherPersonId });
        }
      }
    }
  }

  // ── Phase 5: Process _PLAC records for place-level citations ───────────────
  // _PLAC records are custom top-level records we emit for places that have
  // direct citations (not tied to any event). The _PLAC_ID sub-tag links back
  // to the place (using placeIdMap to handle cross-database imports).
  for (const node of tree) {
    if (node.tag !== '_PLAC') continue;
    const oldPlaceId = getChild(node, '_PLAC_ID')?.value;
    if (!oldPlaceId) continue;

    const newPlaceId = placeIdMap.get(oldPlaceId) ?? oldPlaceId;
    let place = getPlace(db, newPlaceId);

    if (!place) {
      // UUID not found (cross-DB import, or place only exists via this _PLAC record).
      // Fall back to name-based find-or-create using the NAME tag we write in the exporter.
      const placeName = getChild(node, 'NAME')?.value;
      if (!placeName) continue;
      place = resolvePlaceFn(db, placeName);
      placeIdMap.set(oldPlaceId, place.id);
    }

    for (const sour of getChildren(node, 'SOUR')) {
      const srcId = sourceMap.get(sour.value);
      if (!srcId) continue;
      const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
      const page = getChild(sour, 'PAGE')?.value ?? '';
      const citNotes = getChild(sour, 'NOTE')?.value ?? '';
      const date_accessed = getChild(sour, '_ACCESSED')?.value ?? '';
      createCitation(db, {
        source_id: srcId,
        place_id: place.id,
        page,
        confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
        notes: citNotes || undefined,
        date_accessed: date_accessed || undefined,
      });
    }
  }
}
