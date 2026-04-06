/**
 * Core 5-phase GEDCOM import logic.
 *
 * This file contains the shared import machinery that handles all GEDCOM profiles
 * (standard, Genney, Holger). Profile-specific overrides are injected via the
 * ImportOptions.profile field and the helpers in ./profiles/.
 *
 * Phases:
 *   0   NOTE top-level records → noteMap
 *   0.5 OBJE top-level records → objeMap
 *   1   SOUR records → sourceMap
 *   2   INDI records → personMap (+ holgerAdoptionMap for Holger)
 *   3   FAM records → couple + parent_child relationships + family events
 *   4   ASSO post-processing → event participants + sibling/godparent relationships
 *   5   _PLAC records → place-level citations
 */

import type { Database } from 'node-sqlite3-wasm';
import type { GedcomNode } from '../../gedcom/parser';
import { detectGedcomVersion } from './detect';
import type { GedcomVersion } from './detect';
import { normalizeForImport } from './normalize';
import type { Place, Relationship, RelationshipType, EventParticipantRole } from '../../api/types';
import { parseGedcomDate } from '../../gedcom/date';
import { createPerson, addPersonName, addPersonIdentifier } from '../../api/persons';
import { createRelationship, updateRelationship, addEventParticipant, getRelationshipsOfPerson } from '../../api/relationships';
import { createEvent } from '../../api/events';
import { createSource, createCitation } from '../../api/sources';
import { createMedia, addMediaLink } from '../../api/media';
import { getPlace, findOrCreatePlace, updatePlace } from '../../api/places';
import { resolvePlaceFn as genneyResolvePlaceFn, getPatronymicBase } from './profiles/genney';
import { holgerEngaSubtype, parseHolgerAdoptionSubtypes } from './profiles/holger';

export interface ImportOptions {
  /** Import profile. 'genney' enables Genney 4.1-specific extensions:
   *  Swedish hierarchical places, patronymic detection, _UID/_YHAPLOGROUP/_MHAPLOGROUP tags. */
  profile?: 'genney' | 'holger';
  /** Local directory for remapping Windows-style OBJE FILE paths (Holger exports).
   *  e.g. 'C:\\OurKind\\Media\\P12\\photo.jpg' → '{mediaDir}/P12/photo.jpg' */
  mediaDir?: string;
}

export interface ImportReport {
  version: GedcomVersion;
  persons: number;
  families: number;
  events: Record<string, number>;   // event_type → count
  sources: number;
  places: number;
  citations: number;
  skipped: { tag: string; count: number }[];  // unrecognised level-1 INDI/FAM tags (alias for tagStats)
  warnings: string[];                          // e.g. "12 OBJE records skipped"
}

export interface UnmappedItem {
  category: string;   // e.g. "REPO records", "LDS ordinances", "SUBM records"
  count: number;
  example?: string;   // first occurrence for debugging
}

export interface ValidationReport extends ImportReport {
  // Raw file counts (before import — derived from the node tree)
  rawCounts: {
    individuals: number;
    families: number;
    sources: number;
    repositories: number;   // REPO level-0 records
    notes: number;          // level-0 NOTE/SNOTE records
    objects: number;        // OBJE level-0 records
    submitters: number;     // SUBM records (always dropped)
  };
  // Tags seen in the file that we didn't handle (replaces 'skipped')
  tagStats: {
    tag: string;
    occurrences: number;
  }[];
  // Structured list of data categories that couldn't be stored
  unmappedData: UnmappedItem[];
  // Known model limitations hit during this import
  modelLimitations: string[];
}

const PERSON_EVENT_TAGS: Record<string, string> = {
  BIRT: 'birth', DEAT: 'death', CHR: 'christening', BURI: 'burial',
  BAPM: 'baptism', CONF: 'confirmation', OCCU: 'occupation',
  RESI: 'residence', EDUC: 'education', EMIG: 'emigration',
  IMMI: 'immigration', NATU: 'naturalization', CENS: 'census',
  PROB: 'probate', WILL: 'will', GRAD: 'graduation', RETI: 'retirement',
  ENGA: 'engagement', ADOP: 'adoption',
  EVEN: 'other',
};

const FAMILY_EVENT_TAGS: Record<string, string> = {
  MARR: 'marriage', DIV: 'divorce', CENS: 'census', ENGA: 'engagement', EVEN: 'other',
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
 * Address fields are guarded to prevent overwriting existing place data.
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

  // Get the current place to avoid overwriting existing address fields
  const place = getPlace(db, placeId);

  updatePlace(db, placeId, {
    ...(lat != null && { latitude: lat }),
    ...(lon != null && { longitude: lon }),
    ...(street && !place?.street && { street }),
    ...(postal_code && !place?.postal_code && { postal_code }),
    ...(city && !place?.city && { city }),
    ...(country && !place?.country && { country }),
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

function remapHolgerMediaPath(winPath: string, mediaDir: string): string {
  // Extract the relative path after 'Media\' or 'Media/' (case-insensitive)
  const idx = winPath.search(/[Mm]edia[/\\]/);
  if (idx === -1) return winPath;
  const afterMedia = winPath.slice(idx + 6); // 'Media\' or 'Media/' are both 6 chars
  const relative = afterMedia.replace(/\\/g, '/');
  return `${mediaDir.replace(/\/$/, '')}/${relative}`;
}

function resolveNote(node: GedcomNode, noteMap: Map<string, string>): string {
  const noteNode = getChild(node, 'NOTE');
  if (!noteNode) return '';
  const val = noteNode.value ?? '';
  if (val.startsWith('@') && val.endsWith('@')) {
    return noteMap.get(val) ?? '';
  }
  return val;
}

/**
 * Import a single OBJE node (inline or top-level reference) and return the media UUID.
 * Returns null if the node cannot be resolved.
 */
function importObjeNode(
  db: Database,
  objeNode: GedcomNode,
  objeMap: Map<string, string>,
  options?: ImportOptions,
): string | null {
  // Reference to a previously imported top-level OBJE record: `1 OBJE @M1@`
  if (objeNode.value?.startsWith('@')) {
    return objeMap.get(objeNode.value) ?? null;
  }
  // Inline embedded OBJE
  let file = getChild(objeNode, 'FILE')?.value ?? '';
  if (file && options?.mediaDir) {
    file = remapHolgerMediaPath(file, options.mediaDir);
  }
  const form = getChild(objeNode, 'FORM')?.value ?? null;
  const titl = getChild(objeNode, 'TITL')?.value ?? null;
  const note = getChild(objeNode, 'NOTE')?.value ?? '';
  const media = createMedia(db, {
    file_ref: file || null,
    title: titl ?? file ?? undefined,
    format: form,
    notes: note || undefined,
    is_printable: false,
    is_missing: true,
  });
  return media.id;
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
  noteMap: Map<string, string>,
  objeMap: Map<string, string>,
  importOptions?: ImportOptions,
) {
  const dateNode = getChild(evNode, 'DATE');
  const placNode = getChild(evNode, 'PLAC');
  const parsed = dateNode
    ? parseGedcomDate(dateNode.value)
    : { date_type: 'unknown' as const, date_value: null, date_value_end: null, date_original: '' };
  let place = placNode ? resolvePlace(db, placNode, resolvePlaceFn, placeIdMap) : null;

  // Standard GEDCOM 5.5.1: ADDR can appear directly on the event node (not under PLAC).
  // Apply address fields to the associated place (or create one from ADDR if no PLAC).
  const evAddrNode = getChild(evNode, 'ADDR');
  if (evAddrNode) {
    const street = getChild(evAddrNode, 'ADR1')?.value ?? evAddrNode.value ?? null;
    const postal_code = getChild(evAddrNode, 'POST')?.value ?? null;
    const city = getChild(evAddrNode, 'CITY')?.value ?? null;
    const country = getChild(evAddrNode, 'CTRY')?.value ?? null;
    if (place) {
      // Update existing place with ADDR data (don't overwrite existing non-null values)
      const addrUpdate: Parameters<typeof updatePlace>[2] = {};
      if (street && !place.street) addrUpdate.street = street;
      if (postal_code && !place.postal_code) addrUpdate.postal_code = postal_code;
      if (city && !place.city) addrUpdate.city = city;
      if (country && !place.country) addrUpdate.country = country;
      if (Object.keys(addrUpdate).length > 0) updatePlace(db, place.id, addrUpdate);
    } else if (city || street) {
      // No PLAC but ADDR present — create a place from the address data
      const placeName = city ?? street ?? 'Unknown';
      place = resolvePlaceFn(db, placeName);
      const addrUpdate: Parameters<typeof updatePlace>[2] = {};
      if (street) addrUpdate.street = street;
      if (postal_code) addrUpdate.postal_code = postal_code;
      if (city) addrUpdate.city = city;
      if (country) addrUpdate.country = country;
      if (Object.keys(addrUpdate).length > 0) updatePlace(db, place.id, addrUpdate);
    }
  }

  const causeValue = getChild(evNode, 'CAUS')?.value ?? null;
  const typeValue = getChild(evNode, 'TYPE')?.value ?? '';
  const noteRaw = resolveNote(evNode, noteMap);
  const noteValue = typeValue && noteRaw
    ? `${typeValue}: ${noteRaw}`
    : typeValue || noteRaw;

  const event = createEvent(db, {
    event_type: appType,
    date_type: parsed.date_type,
    date_value: parsed.date_value,
    date_value_end: parsed.date_value_end,
    date_original: parsed.date_original,
    place_id: place?.id ?? null,
    relationship_id: opts.relationship_id ?? null,
    cause: causeValue,
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

  // Event media
  for (const objeNode of getChildren(evNode, 'OBJE')) {
    const mediaId = importObjeNode(db, objeNode, objeMap, importOptions);
    if (mediaId) addMediaLink(db, { media_id: mediaId, entity_type: 'event', entity_id: event.id });
  }

  return event;
}

const KNOWN_INDI_TAGS = new Set([
  'NAME', 'SEX', '_LIVING', 'NOTE', 'SOUR', 'ASSO', 'REFN', 'RIN',
  '_UID', '_FSI', '_ANID', '_RAID', '_PNUMMER', '_YHAPLOGROUP', '_MHAPLOGROUP',
  'FAMC', 'FAMS', 'CHAN',
  // PERSON_EVENT_TAGS keys:
  'BIRT', 'DEAT', 'CHR', 'BURI', 'BAPM', 'CONF', 'OCCU', 'RESI', 'EDUC',
  'EMIG', 'IMMI', 'NATU', 'CENS', 'PROB', 'WILL', 'GRAD', 'RETI', 'ENGA', 'ADOP', 'EVEN',
  'TITL', 'OBJE',
]);

const KNOWN_FAM_TAGS = new Set([
  'HUSB', 'WIFE', 'CHIL', 'SOUR', 'NOTE', '_SUBTYPE', '_RELNOTES', 'CHAN',
  // FAMILY_EVENT_TAGS keys:
  'MARR', 'DIV', 'CENS', 'ENGA', 'EVEN',
  'OBJE',
]);

function doImportGedcom(
  db: Database,
  tree: GedcomNode[],
  options?: ImportOptions,
): { skipped: { tag: string; count: number }[]; warnings: string[]; ldsCount: number; tranCount: number; noCount: number } {
  const isGenney = options?.profile === 'genney';
  const isHolger = options?.profile === 'holger';
  const resolvePlaceFn = isGenney ? genneyResolvePlaceFn : findOrCreatePlace;

  // Maps that survive across phases for post-processing
  const placeIdMap = new Map<string, string>();  // old place UUID → current DB place UUID
  const eventIdMap = new Map<string, string>();  // old event UUID → current DB event UUID
  const assoData: Array<{ personId: string; assoNode: GedcomNode }> = [];

  // Report accumulators
  const skippedTags = new Map<string, number>();
  let ldsCount = 0;   // BAPL/SLGC/CONL/ENDL/SLGS sub-nodes on INDI records
  let tranCount = 0;  // TRAN nodes (GEDCOM 7.0 multi-language translations)
  let noCount = 0;    // NO negative assertion records (GEDCOM 7.0)

  // ── Phase 0: NOTE records ─────────────────────────────────────────────────
  const noteMap = new Map<string, string>();
  for (const node of tree) {
    if (node.tag !== 'NOTE' || !node.xref) continue;
    noteMap.set(node.xref, node.value ?? '');
  }

  // ── Phase 0.5: OBJE top-level records ────────────────────────────────────
  // Build objeMap (GEDCOM xref → app media UUID) before processing INDI/FAM records,
  // so that inline `1 OBJE @Mx@` references resolve correctly.
  const objeMap = new Map<string, string>(); // xref → app media UUID
  for (const node of tree) {
    if (node.tag !== 'OBJE' || !node.xref) continue;
    let file = getChild(node, 'FILE')?.value ?? '';
    if (file && options?.mediaDir) {
      file = remapHolgerMediaPath(file, options.mediaDir);
    }
    const form = getChild(node, 'FORM')?.value ?? null;
    const titl = getChild(node, 'TITL')?.value ?? null;
    const note = getChild(node, 'NOTE')?.value ?? '';
    const media = createMedia(db, {
      file_ref: file || null,
      title: titl ?? file ?? undefined,
      format: form,
      notes: note || undefined,
      is_printable: false,
      is_missing: true,
    });
    objeMap.set(node.xref, media.id);
  }

  // ── Phase 1: SOUR records ──────────────────────────────────────────────────
  const sourceMap = new Map<string, string>(); // xref → app source id
  for (const node of tree) {
    if (node.tag !== 'SOUR' || !node.xref) continue;
    const src = createSource(db, {
      title: getChild(node, 'TITL')?.value ?? '',
      author: getChild(node, 'AUTH')?.value ?? '',
      publication_info: getChild(node, 'PUBL')?.value ?? '',
      repository: (() => {
        const repoText = getChild(node, '_REPO_TEXT')?.value;
        if (repoText) return repoText;
        // Legacy: plain text in REPO (not an xref pointer)
        const repoVal = getChild(node, 'REPO')?.value ?? '';
        return repoVal.startsWith('@') ? '' : repoVal;
      })(),
      url: getChild(node, '_URL')?.value ?? '',
      source_type: getChild(node, '_STYPE')?.value ?? '',
    });
    sourceMap.set(node.xref, src.id);
  }

  // ── Phase 2: INDI records ──────────────────────────────────────────────────
  const personMap = new Map<string, string>(); // xref → app person id
  // Holger: ADOP on INDI → collect subtype override per (personXref, familyXref) pair
  const holgerAdoptionMap = new Map<string, Map<string, string>>(); // personXref → familyXref → subtype
  for (const node of tree) {
    if (node.tag !== 'INDI' || !node.xref) continue;

    const sex = (getChild(node, 'SEX')?.value ?? 'U') as 'M' | 'F' | 'U';
    const living = getChild(node, '_LIVING')?.value === 'Y';
    let notes = resolveNote(node, noteMap);

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

    if (isHolger) {
      const subtypeMap = parseHolgerAdoptionSubtypes(node);
      if (subtypeMap.size > 0) holgerAdoptionMap.set(node.xref!, subtypeMap);
    }

    // Names
    const nameNodes = getChildren(node, 'NAME');
    for (const nameNode of nameNodes) {
      const raw = nameNode.value ?? '';
      const surnameMatch = raw.match(/^(.*?)\/(.+?)\/(.*)$/);
      let given = (surnameMatch ? surnameMatch[1] : raw).trim() || null;
      const surname = surnameMatch ? surnameMatch[2].trim() || null : null;
      const prefix = getChild(nameNode, 'NPFX')?.value ?? null;
      const suffix = getChild(nameNode, 'NSFX')?.value ?? null;
      const rawType = getChild(nameNode, 'TYPE')?.value?.toUpperCase();
      const name_type = rawType === 'MARRIED' ? 'married' : rawType === 'AKA' ? 'aka' : rawType === 'ALIAS' ? 'alias' : 'birth';

      // _PATR overrides genney patronymic detection; both can coexist
      const explicitPatr = getChild(nameNode, '_PATR')?.value ?? null;
      const patronymic_base = explicitPatr ?? (isGenney ? getPatronymicBase(surname) : null);

      // Genney marks the preferred name (tilltalsnamn) with * directly after the token.
      // e.g. "Eva Linda* Marie" → preferred_name = "Linda", given_name = "Eva Linda Marie"
      const nickname = getChild(nameNode, 'NICK')?.value ?? null;
      let preferred_name: string | null = null;
      if (given && given.includes('*')) {
        const starIdx = given.indexOf('*');
        const beforeStar = given.slice(0, starIdx).trimEnd();
        const afterStar = given.slice(starIdx + 1).trimStart();
        const tokens = beforeStar.split(/\s+/);
        preferred_name = tokens[tokens.length - 1] ?? null;
        given = (beforeStar + (afterStar ? ' ' + afterStar : '')).replace(/\s+/g, ' ').trim() || null;
      }

      addPersonName(db, person.id, {
        given_name: given,
        surname,
        name_prefix: prefix,
        name_suffix: suffix,
        name_type: name_type as 'birth' | 'married' | 'alias' | 'aka',
        patronymic_base,
        preferred_name,
        nickname,
        name_qualifier: (getChild(nameNode, '_NQUAL')?.value ?? null) as string | null,
        date_from: getChild(nameNode, '_DATE_FROM')?.value ?? null,
        date_to: getChild(nameNode, '_DATE_TO')?.value ?? null,
      });
    }

    // External identifiers: standard GEDCOM
    // REFN with a TYPE sub-tag maps to typed identifiers; plain REFN maps to 'refn'
    for (const refn of getChildren(node, 'REFN')) {
      if (!refn.value) continue;
      const refnType = getChild(refn, 'TYPE')?.value?.trim() ?? '';
      const ltype = refnType.toLowerCase();
      if (ltype === 'familysearch') {
        addPersonIdentifier(db, person.id, { identifier_type: 'familysearch', identifier_value: refn.value });
      } else if (ltype === 'ancestry') {
        addPersonIdentifier(db, person.id, { identifier_type: 'ancestry', identifier_value: refn.value });
      } else if (ltype === 'riksarkivet') {
        addPersonIdentifier(db, person.id, { identifier_type: 'riksarkivet', identifier_value: refn.value });
      } else if (ltype === 'personnummer') {
        addPersonIdentifier(db, person.id, { identifier_type: 'personnummer', identifier_value: refn.value });
      } else if (ltype === 'other') {
        addPersonIdentifier(db, person.id, { identifier_type: 'other', identifier_value: refn.value });
      } else {
        // Plain REFN or unknown TYPE → store as 'refn'
        addPersonIdentifier(db, person.id, { identifier_type: 'refn', identifier_value: refn.value });
      }
    }
    const rin = getChild(node, 'RIN');
    if (rin?.value) addPersonIdentifier(db, person.id, { identifier_type: 'rin', identifier_value: rin.value });
    // Genney 4.1: _UID → person_identifiers
    if (isGenney) {
      const uid = getChild(node, '_UID');
      if (uid?.value) addPersonIdentifier(db, person.id, { identifier_type: 'other', identifier_value: `Genney UID: ${uid.value}` });
    }

    // Extended identifiers (legacy custom tags — kept for backward compat reading old exports)
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
        const event = importEventNode(db, evNode, appType, sourceMap, {}, resolvePlaceFn, placeIdMap, eventIdMap, noteMap, objeMap, options);
        addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });
      }
    }

    // TITL directly on INDI → occupation event (standalone title/role, no date)
    for (const titlNode of getChildren(node, 'TITL')) {
      if (!titlNode.value) continue;
      const event = createEvent(db, {
        event_type: 'occupation',
        date_type: 'unknown',
        date_value: null,
        date_value_end: null,
        date_original: '',
        place_id: null,
        relationship_id: null,
        description: titlNode.value,
      });
      addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });
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

    // Person-level media
    for (const objeNode of getChildren(node, 'OBJE')) {
      const mediaId = importObjeNode(db, objeNode, objeMap, options);
      if (mediaId) addMediaLink(db, { media_id: mediaId, entity_type: 'person', entity_id: person.id });
    }

    // Count LDS ordinance tags on INDI records (not imported — not relevant for Swedish genealogy)
    const LDS_TAGS = new Set(['BAPL', 'SLGC', 'CONL', 'ENDL', 'SLGS']);
    for (const child of node.children) {
      if (LDS_TAGS.has(child.tag)) ldsCount++;
    }

    // Count TRAN nodes (GEDCOM 7.0 multi-language translations)
    for (const child of node.children) {
      if (child.tag === 'TRAN') tranCount++;
      for (const grandchild of child.children) {
        if (grandchild.tag === 'TRAN') tranCount++;
      }
    }

    // Count unrecognised top-level INDI tags
    for (const child of node.children) {
      if (!KNOWN_INDI_TAGS.has(child.tag)) {
        skippedTags.set(child.tag, (skippedTags.get(child.tag) ?? 0) + 1);
      }
    }
  }

  // ── Phase 3: FAM records ───────────────────────────────────────────────────
  for (const node of tree) {
    if (node.tag !== 'FAM') continue;

    const husbXref = getChild(node, 'HUSB')?.value;
    const wifeXref = getChild(node, 'WIFE')?.value;
    const person1Id = husbXref ? personMap.get(husbXref) ?? null : null;
    const person2Id = wifeXref ? personMap.get(wifeXref) ?? null : null;

    // Infer couple subtype: _SUBTYPE from extended export takes precedence;
    // fall back to inferring 'marriage' from a MARR event in the FAM record.
    const extSubtype = getChild(node, '_SUBTYPE')?.value;
    const hasMarr = getChildren(node, 'MARR').length > 0;
    let coupleSubtype: string;
    if (extSubtype) {
      coupleSubtype = extSubtype;
    } else if (hasMarr) {
      coupleSubtype = 'marriage';
    } else if (isHolger) {
      const engaNodes = getChildren(node, 'ENGA');
      // Holger emits at most one ENGA per FAM; take the first if multiple exist
      coupleSubtype = engaNodes.length > 0 ? holgerEngaSubtype(engaNodes[0]) : 'unknown';
    } else {
      coupleSubtype = 'unknown';
    }

    const couple = createRelationship(db, {
      type: 'couple',
      person1_id: person1Id,
      person2_id: person2Id,
      subtype: coupleSubtype,
    });

    // Extended couple metadata (notes only — subtype already applied above)
    const relnotes = getChild(node, '_RELNOTES')?.value;
    if (relnotes) {
      updateRelationship(db, couple.id, { notes: relnotes });
    }

    // Family events
    for (const [gedTag, appType] of Object.entries(FAMILY_EVENT_TAGS)) {
      // Holger: ENGA on a FAM without MARR is a relationship-type tag (see holgerEngaSubtype),
      // not a real engagement event. If both MARR and ENGA are present, the ENGA is a genuine
      // engagement event (pre-marriage) and IS imported normally.
      if (isHolger && gedTag === 'ENGA' && !hasMarr) continue;
      for (const evNode of getChildren(node, gedTag)) {
        importEventNode(db, evNode, appType, sourceMap, { relationship_id: couple.id }, resolvePlaceFn, placeIdMap, eventIdMap, noteMap, objeMap, options);
      }
    }

    // Children → parent_child relationships with PEDI subtype
    for (const chil of getChildren(node, 'CHIL')) {
      const childId = personMap.get(chil.value);
      if (!childId) continue;
      const pedi = getChild(chil, 'PEDI')?.value;
      // 'birth' is the GEDCOM term for biological; everything else maps directly
      let childSubtype = pedi ? (pedi === 'birth' ? 'biological' : pedi) : 'biological';
      if (isHolger) {
        const adopSubtype = holgerAdoptionMap.get(chil.value)?.get(node.xref ?? '');
        if (adopSubtype) childSubtype = adopSubtype;
      }
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

    // Family-level media
    for (const objeNode of getChildren(node, 'OBJE')) {
      const mediaId = importObjeNode(db, objeNode, objeMap, options);
      if (mediaId) addMediaLink(db, { media_id: mediaId, entity_type: 'relationship', entity_id: couple.id });
    }

    // Count unrecognised top-level FAM tags
    for (const child of node.children) {
      if (!KNOWN_FAM_TAGS.has(child.tag)) {
        skippedTags.set(child.tag, (skippedTags.get(child.tag) ?? 0) + 1);
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

  // Count NO records (GEDCOM 7.0 negative assertions — not imported)
  for (const node of tree) {
    if (node.tag === 'NO') noCount++;
  }

  // Build and return partial report
  const skipped = Array.from(skippedTags.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
  const warnings: string[] = [];
  return { skipped, warnings, ldsCount, tranCount, noCount };
}

/**
 * Wraps a Database so that db.prepare(sql) compiles each unique SQL string only
 * once per import. The ~50k prepare() calls in a large import otherwise dominate
 * CPU time. All SQLite operations here are synchronous and single-threaded, so
 * reusing a compiled statement across calls is safe.
 * BEGIN/COMMIT/ROLLBACK are called on the real db (not the proxy) so they are
 * never cached.
 *
 * IMPORTANT: Call finalize() after the import to release all compiled statements
 * from the WASM heap. node-sqlite3-wasm prepared statements live in WASM memory;
 * JavaScript GC does not free them. Leaving them alive exhausts the WASM heap and
 * causes subsequent SQLite operations to fail with "out of memory".
 */
function withStatementCache(db: Database): { proxy: Database; finalize(): void } {
  const cache = new Map<string, ReturnType<typeof db.prepare>>();
  // Return a proxy wrapper around the real statement that ignores finalize() calls.
  // This lets callers (e.g. src/api/db.ts helpers) safely call finalize() after each
  // use without killing the cached statement. The cache's own finalize() method
  // cleans up all real statements when the import transaction completes.
  function wrapStatement(stmt: ReturnType<typeof db.prepare>) {
    return new Proxy(stmt, {
      get(target, prop) {
        if (prop === 'finalize') return () => { /* no-op: cache owns the lifetime */ };
        const val = (target as unknown as Record<string | symbol, unknown>)[prop];
        return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(target) : val;
      },
    });
  }
  const proxy = new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql: string) => {
          let stmt = cache.get(sql);
          if (!stmt) { stmt = target.prepare(sql); cache.set(sql, stmt); }
          return wrapStatement(stmt);
        };
      }
      const val = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(target) : val;
    },
  }) as unknown as Database;
  return {
    proxy,
    finalize() {
      for (const stmt of cache.values()) {
        try { (stmt as unknown as { finalize(): void }).finalize(); } catch { /* ignore */ }
      }
      cache.clear();
    },
  };
}

/** Prepare, run once, finalize immediately — avoids leaking WASM heap memory. */
function runSql(db: Database, sql: string): void {
  const stmt = db.prepare(sql);
  try { stmt.run([]); } finally { (stmt as unknown as { finalize(): void }).finalize(); }
}
function queryOne<T>(db: Database, sql: string): T {
  const stmt = db.prepare(sql);
  try { return stmt.get([]) as T; }
  finally { (stmt as unknown as { finalize(): void }).finalize(); }
}
function queryAll<T>(db: Database, sql: string): T[] {
  const stmt = db.prepare(sql);
  try { return stmt.all([]) as T[]; }
  finally { (stmt as unknown as { finalize(): void }).finalize(); }
}

/**
 * Imports a parsed GEDCOM tree into the database inside a single transaction.
 * Without a transaction, SQLite auto-commits every statement, causing thousands
 * of WAL flushes (measured at ~1.6 GB for a 70k-line file). One commit at the
 * end reduces disk writes by ~3 orders of magnitude.
 * On error the transaction is rolled back so no partial data is written.
 * Returns a ValidationReport with counts of what was imported and what was skipped.
 */
export function importGedcom(db: Database, tree: GedcomNode[], options?: ImportOptions): ValidationReport {
  // Compute rawCounts from original (pre-normalization) tree
  const rawCounts = {
    individuals: 0,
    families: 0,
    sources: 0,
    repositories: 0,
    notes: 0,
    objects: 0,
    submitters: 0,
  };
  for (const node of tree) {
    switch (node.tag) {
      case 'INDI': rawCounts.individuals++; break;
      case 'FAM':  rawCounts.families++; break;
      case 'SOUR': rawCounts.sources++; break;
      case 'REPO': rawCounts.repositories++; break;
      case 'NOTE':
      case 'SNOTE': rawCounts.notes++; break;
      case 'OBJE': rawCounts.objects++; break;
      case 'SUBM': rawCounts.submitters++; break;
    }
  }

  // Snapshot row counts before import (each statement finalized immediately)
  const personsBefore   = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM persons').n;
  const familiesBefore  = queryOne<{ n: number }>(db, "SELECT COUNT(*) as n FROM relationships WHERE type='couple'").n;
  const sourcesBefore   = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM sources').n;
  const placesBefore    = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM places').n;
  const citationsBefore = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM citations').n;
  const evBeforeRows    = queryAll<{ event_type: string; cnt: number }>(db, 'SELECT event_type, COUNT(*) as cnt FROM events GROUP BY event_type');
  const evBefore        = new Map<string, number>(evBeforeRows.map(r => [r.event_type, r.cnt]));

  const version = detectGedcomVersion(tree);
  const normalizedTree = normalizeForImport(tree, version);

  const { proxy: cachedDb, finalize: finalizeCache } = withStatementCache(db);
  runSql(db, 'BEGIN');
  let partial: { skipped: { tag: string; count: number }[]; warnings: string[]; ldsCount: number; tranCount: number; noCount: number };
  try {
    partial = doImportGedcom(cachedDb, normalizedTree, options);
    runSql(db, 'COMMIT');
  } catch (err) {
    runSql(db, 'ROLLBACK');
    throw err;
  } finally {
    finalizeCache(); // free all compiled statements from the WASM heap
    runSql(db, 'PRAGMA shrink_memory'); // release SQLite page cache back to WASM heap
  }

  // Snapshot row counts after import (each statement finalized immediately)
  const personsAfter   = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM persons').n;
  const familiesAfter  = queryOne<{ n: number }>(db, "SELECT COUNT(*) as n FROM relationships WHERE type='couple'").n;
  const sourcesAfter   = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM sources').n;
  const placesAfter    = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM places').n;
  const citationsAfter = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM citations').n;
  const evAfterRows    = queryAll<{ event_type: string; cnt: number }>(db, 'SELECT event_type, COUNT(*) as cnt FROM events GROUP BY event_type');

  const events: Record<string, number> = {};
  for (const r of evAfterRows) {
    const delta = r.cnt - (evBefore.get(r.event_type) ?? 0);
    if (delta > 0) events[r.event_type] = delta;
  }

  // Build unmappedData
  const unmappedData: UnmappedItem[] = [];
  if (rawCounts.repositories > 0) {
    unmappedData.push({ category: 'REPO records (no importer yet)', count: rawCounts.repositories });
  }
  if (rawCounts.submitters > 0) {
    unmappedData.push({ category: 'SUBM records (no app concept)', count: rawCounts.submitters });
  }
  if (partial.ldsCount > 0) {
    unmappedData.push({ category: 'LDS ordinances (not relevant for Swedish genealogy)', count: partial.ldsCount });
  }

  // Build modelLimitations
  const modelLimitations: string[] = [
    'ASSO associations beyond event participants are dropped',
  ];
  if (version === '7.0' && partial.tranCount > 0) {
    modelLimitations.push('TRAN multi-language name translations stored as aka names only');
  }
  if (version === '7.0' && partial.noCount > 0) {
    modelLimitations.push('NO negative assertions not imported (no app model)');
  }

  // tagStats mirrors skipped (same data, different field name)
  const tagStats = partial.skipped.map(s => ({ tag: s.tag, occurrences: s.count }));

  return {
    version,
    persons:   personsAfter   - personsBefore,
    families:  familiesAfter  - familiesBefore,
    events,
    sources:   sourcesAfter   - sourcesBefore,
    places:    placesAfter    - placesBefore,
    citations: citationsAfter - citationsBefore,
    skipped:   partial.skipped,
    warnings:  partial.warnings,
    rawCounts,
    tagStats,
    unmappedData,
    modelLimitations,
  };
}
