/**
 * RootsMagic .rmgc → Släktforskning transform.
 *
 * RootsMagic ships its database as a stock SQLite file with a publicly
 * documented schema. This makes the importer cleaner than the GEDCOM or
 * Genney paths: open the file, query each table, write our entities. No
 * dialect parsing, no Java/Docker, no NDJSON pipeline.
 *
 * Pure logic: no Electron / IPC / UI dependencies. The orchestrator at
 * src/import/rootsmagic/index.ts is responsible for opening the .rmgc
 * file and handing the queries off here.
 *
 * Schema reference: tested against RootsMagic 7+ databases (same schema
 * used in v8/v9/v10). Tables consumed: PersonTable, NameTable, EventTable,
 * FactTypeTable, FamilyTable, ChildTable, PlaceTable, SourceTable,
 * CitationTable, MultimediaTable, MediaLinkTable, WitnessTable.
 */

import type { Database } from 'node-sqlite3-wasm';
import { createPerson, addPersonName, addPersonIdentifier } from '../../api/persons';
import { createRelationship, addEventParticipant } from '../../api/relationships';
import { createEvent } from '../../api/events';
import { findOrCreatePlace } from '../../api/places';
import { createSource, createCitation } from '../../api/sources';
import { createMedia, addMediaLink } from '../../api/media';
import { queryAll, runSql } from '../../api/db';

// ── RootsMagic row shapes ──────────────────────────────────────────────────

interface RmPerson {
  PersonID: number;
  UniqueID: string | null;
  Sex: number;          // 0=M, 1=F, 2=U
  Living: number;
  Note: string | null;
}

interface RmName {
  NameID: number;
  OwnerID: number;        // → PersonID
  Surname: string | null;
  Given: string | null;
  Prefix: string | null;
  Suffix: string | null;
  Nickname: string | null;
  NameType: number;       // 0=primary, 2=AKA, 3=married, 4=alias, 6=birth
  IsPrimary: number;
}

interface RmEvent {
  EventID: number;
  EventType: number;      // → FactTypeID
  OwnerType: number;      // 0=person, 1=family
  OwnerID: number;        // → PersonID or FamilyID depending on OwnerType
  PlaceID: number;
  Date: string | null;    // RootsMagic's proprietary date format
  Details: string | null;
  Note: string | null;
}

interface RmFactType {
  FactTypeID: number;
  OwnerType: number;      // 0=person, 1=family
  Name: string;
  GedcomTag: string;      // e.g. 'BIRT', 'DEAT', 'MARR'
}

interface RmFamily {
  FamilyID: number;
  FatherID: number;       // 0 = unknown
  MotherID: number;
  Note: string | null;
}

interface RmChild {
  ChildID: number;
  FamilyID: number;
  RelFather: number;      // 0=birth, 1=adopted, 2=step, 3=foster, 4=guardian, 5=sealed, 7=related
  RelMother: number;
}

interface RmPlace {
  PlaceID: number;
  Name: string | null;
  Latitude: number;       // integer × 10⁷
  Longitude: number;
  Note: string | null;
}

interface RmSource {
  SourceID: number;
  Name: string | null;
  RefNumber: string | null;
  ActualText: string | null;
  Comments: string | null;
}

interface RmCitation {
  CitationID: number;
  OwnerType: number;      // 0=person, 2=family-event, 4=event, etc.
  OwnerID: number;
  SourceID: number;
  Quality: string | null; // typically '0'..'3'
  Comments: string | null;
  ActualText: string | null;
  RefNumber: string | null;
}

interface RmMedia {
  MediaID: number;
  MediaPath: string | null;
  MediaFile: string | null;
  Caption: string | null;
  Description: string | null;
}

interface RmMediaLink {
  LinkID: number;
  MediaID: number;
  OwnerType: number;
  OwnerID: number;
  IsPrimary: number;
  SortOrder: number;
  Caption: string | null;
}

interface RmWitness {
  WitnessID: number;
  EventID: number;
  PersonID: number;
  Role: number;           // role-table FK
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface RootsMagicImportSummary {
  persons: number;
  coupleRelationships: number;
  parentChildRelationships: number;
  events: number;
  places: number;
  sources: number;
  citations: number;
  media: number;
  warnings: string[];
  skipped: { category: string; count: number; reason: string }[];
}

export function emptyRootsMagicSummary(): RootsMagicImportSummary {
  return {
    persons: 0, coupleRelationships: 0, parentChildRelationships: 0,
    events: 0, places: 0, sources: 0, citations: 0, media: 0,
    warnings: [], skipped: [],
  };
}

/**
 * Transform an opened RootsMagic SQLite database into our schema.
 *
 * @param ourDb     destination — our app's SQLite database
 * @param rmDb      source — the RootsMagic .rmgc file opened as SQLite
 */
export async function transformRootsMagic(ourDb: Database, rmDb: Database): Promise<RootsMagicImportSummary> {
  const summary = emptyRootsMagicSummary();

  // ── Phase 1: build lookups ─────────────────────────────────────────────
  // FactTypeTable: maps EventType IDs to GEDCOM tags so we know which
  // event_type to write. The OwnerType column distinguishes person vs
  // family events with the same FactTypeID (yes, the column overload
  // is unfortunate — but that's the schema).
  const factTypes = await queryAll<RmFactType>(rmDb,
    'SELECT FactTypeID, OwnerType, Name, GedcomTag FROM FactTypeTable'
  );
  const factTypeById = new Map<number, RmFactType>(factTypes.map(f => [f.FactTypeID, f]));

  // PlaceTable: build a RM PlaceID → our Place row map.
  const rmPlaces = await queryAll<RmPlace>(rmDb,
    'SELECT PlaceID, Name, Latitude, Longitude, Note FROM PlaceTable'
  );
  const placeMap = new Map<number, string>();   // RM PlaceID → our place.id
  for (const rp of rmPlaces) {
    if (!rp.Name?.trim()) continue;
    // RootsMagic prefixes places with a 5-char abbrev (e.g. "ABA - Aba Nigeria").
    // Strip if present and the suffix has the same root.
    const cleanName = rp.Name.replace(/^[A-Z0-9]{2,5}\s*-\s*/, '').trim() || rp.Name.trim();
    const place = await findOrCreatePlace(ourDb, cleanName);
    placeMap.set(rp.PlaceID, place.id);
    // Update lat/lon if RootsMagic has them and we don't (lossy: lat/lon are
    // stored as integers × 10⁷ in RootsMagic).
    if (rp.Latitude !== 0 || rp.Longitude !== 0) {
      const lat = rp.Latitude / 1e7;
      const lng = rp.Longitude / 1e7;
      await runSql(ourDb,
        'UPDATE places SET latitude = COALESCE(latitude, ?), longitude = COALESCE(longitude, ?) WHERE id = ?',
        [lat, lng, place.id]
      );
    }
    summary.places++;
  }

  // SourceTable: copy each source. RootsMagic stores them with a free-text
  // Name plus optional ActualText (transcription), Comments, RefNumber.
  const rmSources = await queryAll<RmSource>(rmDb,
    'SELECT SourceID, Name, RefNumber, ActualText, Comments FROM SourceTable'
  );
  const sourceMap = new Map<number, string>();
  for (const rs of rmSources) {
    if (!rs.Name?.trim()) continue;
    const src = await createSource(ourDb, {
      title: rs.Name.trim(),
      author: '',
      publication_info: '',
      url: '',
      source_type: 'other',
      call_number: rs.RefNumber || undefined,
      abstract: rs.ActualText || undefined,
    });
    sourceMap.set(rs.SourceID, src.id);
    summary.sources++;
  }

  // ── Phase 2: persons ───────────────────────────────────────────────────
  const rmPersons = await queryAll<RmPerson>(rmDb,
    'SELECT PersonID, UniqueID, Sex, Living, Note FROM PersonTable'
  );
  const personMap = new Map<number, string>();
  for (const rp of rmPersons) {
    const sex: 'M' | 'F' | 'U' = rp.Sex === 0 ? 'M' : rp.Sex === 1 ? 'F' : 'U';
    // Names land in phase 3; allowNameless covers persons whose only name
    // row hasn't been seen yet at this point. (Living is derived at read
    // time from death/burial/cremation events; not a stored column.)
    const person = await createPerson(ourDb, { sex, notes: rp.Note ?? '' }, { allowNameless: true });
    personMap.set(rp.PersonID, person.id);

    // Carry the RootsMagic UniqueID over as an external identifier so a
    // future re-export keeps the cross-system handle.
    if (rp.UniqueID?.trim()) {
      await addPersonIdentifier(ourDb, person.id, {
        identifier_type: 'uid',
        identifier_value: rp.UniqueID.trim(),
      });
    }
    summary.persons++;
  }

  // ── Phase 3: names ─────────────────────────────────────────────────────
  const rmNames = await queryAll<RmName>(rmDb,
    'SELECT NameID, OwnerID, Surname, Given, Prefix, Suffix, Nickname, NameType, IsPrimary FROM NameTable ORDER BY OwnerID, IsPrimary DESC, NameID'
  );
  for (const n of rmNames) {
    const personId = personMap.get(n.OwnerID);
    if (!personId) continue;
    const nameType = mapNameType(n.NameType);
    await addPersonName(ourDb, personId, {
      given_name: n.Given || '',
      surname: n.Surname || '',
      name_type: nameType,
      name_prefix: n.Prefix || undefined,
      name_suffix: n.Suffix || undefined,
      nickname: n.Nickname || undefined,
      sort_order: n.IsPrimary ? 0 : 1,
    });
  }

  // ── Phase 4: families & parent-child relationships ─────────────────────
  const rmFamilies = await queryAll<RmFamily>(rmDb,
    'SELECT FamilyID, FatherID, MotherID, Note FROM FamilyTable'
  );
  const familyToCoupleId = new Map<number, string>();   // FamilyID → couple relationship.id
  for (const f of rmFamilies) {
    const fatherId = f.FatherID ? personMap.get(f.FatherID) : undefined;
    const motherId = f.MotherID ? personMap.get(f.MotherID) : undefined;
    if (!fatherId && !motherId) continue;
    if (fatherId && motherId) {
      const couple = await createRelationship(ourDb, {
        type: 'couple',
        person1_id: fatherId,
        person2_id: motherId,
        notes: f.Note ?? '',
      });
      familyToCoupleId.set(f.FamilyID, couple.id);
      summary.coupleRelationships++;
    }
  }

  // ChildTable rows define each parent_child link with a relationship type.
  const rmChildren = await queryAll<RmChild>(rmDb,
    'SELECT ChildID, FamilyID, RelFather, RelMother FROM ChildTable'
  );
  for (const c of rmChildren) {
    const childId = personMap.get(c.ChildID);
    const family = rmFamilies.find(f => f.FamilyID === c.FamilyID);
    if (!childId || !family) continue;
    if (family.FatherID) {
      const fatherId = personMap.get(family.FatherID);
      if (fatherId) {
        await createRelationship(ourDb, {
          type: 'parent_child',
          person1_id: fatherId,
          person2_id: childId,
          subtype: mapChildRel(c.RelFather),
        });
        summary.parentChildRelationships++;
      }
    }
    if (family.MotherID) {
      const motherId = personMap.get(family.MotherID);
      if (motherId) {
        await createRelationship(ourDb, {
          type: 'parent_child',
          person1_id: motherId,
          person2_id: childId,
          subtype: mapChildRel(c.RelMother),
        });
        summary.parentChildRelationships++;
      }
    }
  }

  // ── Phase 5: events ────────────────────────────────────────────────────
  const rmEvents = await queryAll<RmEvent>(rmDb,
    'SELECT EventID, EventType, OwnerType, OwnerID, PlaceID, Date, Details, Note FROM EventTable'
  );
  const eventMap = new Map<number, string>();   // RM EventID → our event.id
  for (const ev of rmEvents) {
    const fact = factTypeById.get(ev.EventType);
    if (!fact) continue;
    const eventType = mapEventType(fact.GedcomTag, fact.OwnerType);
    const placeId = ev.PlaceID ? placeMap.get(ev.PlaceID) : undefined;
    const parsed = parseRmDate(ev.Date);
    const ownerOurId =
      ev.OwnerType === 0
        ? personMap.get(ev.OwnerID)
        : ev.OwnerType === 1
          ? familyToCoupleId.get(ev.OwnerID)
          : undefined;
    if (!ownerOurId) continue;

    const created = await createEvent(ourDb, {
      event_type: eventType,
      date_type: parsed.dateType,
      date_value: parsed.dateValue,
      date_value_end: parsed.dateValueEnd,
      date_original: ev.Date ?? '',
      place_id: placeId,
      notes: ev.Note ?? '',
      value: ev.Details ?? '',
      relationship_id: ev.OwnerType === 1 ? ownerOurId : undefined,
    });
    eventMap.set(ev.EventID, created.id);

    if (ev.OwnerType === 0) {
      await addEventParticipant(ourDb, {
        event_id: created.id,
        person_id: ownerOurId,
        role: 'primary',
      });
    }
    summary.events++;
  }

  // WitnessTable: extra event participants (witness, godparent, officiant).
  const rmWitnesses = await queryAll<RmWitness>(rmDb,
    'SELECT WitnessID, EventID, PersonID, Role FROM WitnessTable'
  );
  for (const w of rmWitnesses) {
    const eventId = eventMap.get(w.EventID);
    const personId = personMap.get(w.PersonID);
    if (!eventId || !personId) continue;
    await addEventParticipant(ourDb, {
      event_id: eventId,
      person_id: personId,
      role: 'witness',
    });
  }

  // ── Phase 6: citations ─────────────────────────────────────────────────
  const rmCitations = await queryAll<RmCitation>(rmDb,
    'SELECT CitationID, OwnerType, OwnerID, SourceID, Quality, Comments, ActualText, RefNumber FROM CitationTable'
  );
  for (const c of rmCitations) {
    const sourceId = sourceMap.get(c.SourceID);
    if (!sourceId) continue;
    // OwnerType: 0=person, 2=family-event, 4=event, 5=place. We map the
    // common cases; non-event citations (e.g. on a name) are dropped.
    let attach: { person_id?: string; event_id?: string; relationship_id?: string; place_id?: string } = {};
    if (c.OwnerType === 0) {
      const pid = personMap.get(c.OwnerID);
      if (!pid) continue;
      attach = { person_id: pid };
    } else if (c.OwnerType === 2 || c.OwnerType === 4) {
      const eid = eventMap.get(c.OwnerID);
      if (!eid) continue;
      attach = { event_id: eid };
    } else if (c.OwnerType === 5) {
      const plid = placeMap.get(c.OwnerID);
      if (!plid) continue;
      attach = { place_id: plid };
    } else {
      continue;
    }

    const quality = c.Quality ? Math.min(3, Math.max(0, parseInt(c.Quality, 10) || 0)) : 2;
    await createCitation(ourDb, {
      source_id: sourceId,
      page: c.RefNumber || '',
      confidence: quality as 0 | 1 | 2 | 3,
      transcription: c.ActualText || '',
      notes: c.Comments || '',
      ...attach,
    });
    summary.citations++;
  }

  // ── Phase 7: media ─────────────────────────────────────────────────────
  const rmMedia = await queryAll<RmMedia>(rmDb,
    'SELECT MediaID, MediaPath, MediaFile, Caption, Description FROM MultimediaTable'
  );
  const mediaMap = new Map<number, string>();
  for (const m of rmMedia) {
    const fileRef = m.MediaPath && m.MediaFile
      ? `${m.MediaPath.replace(/\\/g, '/').replace(/\/$/, '')}/${m.MediaFile}`
      : (m.MediaFile ?? null);
    if (!fileRef && !m.Caption) continue;
    const mediaRow = await createMedia(ourDb, {
      title: m.Caption || m.MediaFile || '',
      file_ref: fileRef,
      notes: m.Description ?? '',
    });
    mediaMap.set(m.MediaID, mediaRow.id);
    summary.media++;
  }

  const rmMediaLinks = await queryAll<RmMediaLink>(rmDb,
    'SELECT LinkID, MediaID, OwnerType, OwnerID, IsPrimary, SortOrder, Caption FROM MediaLinkTable'
  );
  for (const ml of rmMediaLinks) {
    const mediaOurId = mediaMap.get(ml.MediaID);
    if (!mediaOurId) continue;
    let entityType: 'person' | 'event' | 'relationship' | 'place' | 'source' | undefined;
    let entityId: string | undefined;
    if (ml.OwnerType === 0) { entityType = 'person'; entityId = personMap.get(ml.OwnerID); }
    else if (ml.OwnerType === 2 || ml.OwnerType === 4) { entityType = 'event'; entityId = eventMap.get(ml.OwnerID); }
    else if (ml.OwnerType === 1) { entityType = 'relationship'; entityId = familyToCoupleId.get(ml.OwnerID); }
    else if (ml.OwnerType === 3) { entityType = 'source'; entityId = sourceMap.get(ml.OwnerID); }
    else if (ml.OwnerType === 5) { entityType = 'place'; entityId = placeMap.get(ml.OwnerID); }
    if (!entityType || !entityId) continue;
    await addMediaLink(ourDb, {
      media_id: mediaOurId,
      entity_type: entityType,
      entity_id: entityId,
      sort_order: ml.SortOrder ?? 0,
    });
  }

  return summary;
}

// ── Mapping helpers ────────────────────────────────────────────────────────

function mapNameType(rmType: number): 'birth' | 'married' | 'aka' | 'alias' {
  switch (rmType) {
    case 3: return 'married';
    case 2: return 'aka';
    case 4: return 'alias';
    default: return 'birth';   // 0 (primary), 6 (birth), and unknowns
  }
}

function mapChildRel(rmRel: number): 'biological' | 'adopted' | 'foster' | 'step' | 'unknown' {
  switch (rmRel) {
    case 1: return 'adopted';
    case 2: return 'step';
    case 3: return 'foster';
    case 0: return 'biological';
    default: return 'unknown';   // 4=guardian, 5=sealed (LDS), 7=related — closest match
  }
}

const GEDCOM_TAG_TO_EVENT_TYPE: Record<string, string> = {
  BIRT: 'birth', DEAT: 'death', CHR: 'christening', BURI: 'burial',
  CREM: 'cremation', ADOP: 'adoption', BAPM: 'christening',
  BARM: 'bar_mitzvah', BASM: 'bas_mitzvah', BLES: 'other',
  CHRA: 'christening', CONF: 'confirmation', FCOM: 'other',
  ORDN: 'ordination', NATU: 'naturalization', EMIG: 'emigration',
  IMMI: 'immigration', CENS: 'census', PROB: 'probate', WILL: 'will',
  GRAD: 'graduation', RETI: 'retirement', DSCR: 'description',
  EDUC: 'education', NATI: 'religion', OCCU: 'occupation',
  PROP: 'fact', RELI: 'religion', RESI: 'residence',
  TITL: 'title', EVEN: 'other',
  MARR: 'marriage', DIV: 'divorce', ENGA: 'engagement',
  ANUL: 'annulment', MARL: 'marriage_license', MARC: 'other',
  EVENT_FAM: 'other',
};

function mapEventType(gedcomTag: string, _ownerType: number): string {
  return GEDCOM_TAG_TO_EVENT_TYPE[gedcomTag] ?? 'other';
}

// ── RootsMagic date format parser ──────────────────────────────────────────
// Format: <type>.<sign><yyyymmdd><qualifier><sign><yyyymmdd><qualifier>
//   type:      D = single date, R = range, etc.
//   sign:      + AD, - BC
//   qualifier: . (none), A (about), B (before), F (after), E (estimated)
// Examples observed:
//   "D.+19551002..+00000000.."           → exact, 1955-10-02
//   "D.+19100000.A+00000000.."           → about, year 1910 (m/d unknown)
//   "D.+19000000..+00000000.."           → exact, year 1900 (m/d unknown)
// Empty / unparseable falls back to date_type='unknown'.
export function parseRmDate(raw: string | null): {
  dateType: 'exact' | 'about' | 'before' | 'after' | 'between' | 'calculated' | 'unknown';
  dateValue: string | null;
  dateValueEnd: string | null;
} {
  if (!raw || !raw.trim()) return { dateType: 'unknown', dateValue: null, dateValueEnd: null };
  // Format: <type>.<sign><yyyymmdd>.<qualifier><sign><yyyymmdd>.<qualifier>
  // The qualifier suffix is `.<X>` where <X> is `.` (none) or A/B/F/E/etc.
  // Consuming the leading `.` here lets the qualifier capture be a single char.
  const m = raw.match(/^([DRYM])\.([+-])(\d{8})\.([A-Z.])([+-])(\d{8})\.([A-Z.])/);
  if (!m) return { dateType: 'unknown', dateValue: null, dateValueEnd: null };
  const [, , sign1, ymd1, q1, sign2, ymd2] = m;
  const date1 = ymdToIso(ymd1, sign1 === '-');
  const date2 = ymdToIso(ymd2, sign2 === '-');

  let dateType: ReturnType<typeof parseRmDate>['dateType'] = 'exact';
  if (q1 === 'A') dateType = 'about';
  else if (q1 === 'B') dateType = 'before';
  else if (q1 === 'F') dateType = 'after';
  else if (q1 === 'E') dateType = 'calculated';
  else if (date2 && date2 !== '0000') dateType = 'between';

  return {
    dateType,
    dateValue: date1,
    dateValueEnd: dateType === 'between' ? date2 : null,
  };
}

function ymdToIso(ymd: string, bc: boolean): string | null {
  const yyyy = ymd.slice(0, 4);
  const mm = ymd.slice(4, 6);
  const dd = ymd.slice(6, 8);
  if (yyyy === '0000') return null;
  const year = bc ? `-${yyyy}` : yyyy;
  if (mm === '00') return year;
  if (dd === '00') return `${year}-${mm}`;
  return `${year}-${mm}-${dd}`;
}
