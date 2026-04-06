import type { Database } from 'node-sqlite3-wasm';
import { listPersons, getPersonNames, getPersonIdentifiers } from '../api/persons';
import { listRelationships, getRelationshipsOfPerson, getEventParticipants } from '../api/relationships';
import { getEventsForPerson, getEventsForRelationship } from '../api/events';
import {
  listSources,
  getCitationsForEvent,
  getCitationsForPerson,
  getCitationsForRelationship,
  getCitationsForPlace,
} from '../api/sources';
import { getPlace, listPlaces } from '../api/places';
import { getMediaForEntity } from '../api/media';
import { getRepositoriesForSource } from '../api/repositories';
import type { Place, Citation, Repository } from '../api/types';
import { formatGedcomDate } from './date';

const EVENT_TYPE_TO_TAG: Record<string, string> = {
  birth: 'BIRT', death: 'DEAT', christening: 'CHR', burial: 'BURI',
  baptism: 'BAPM', confirmation: 'CONF', occupation: 'OCCU',
  residence: 'RESI', education: 'EDUC', emigration: 'EMIG',
  immigration: 'IMMI', naturalization: 'NATU', census: 'CENS',
  probate: 'PROB', will: 'WILL', graduation: 'GRAD', retirement: 'RETI',
  marriage: 'MARR', divorce: 'DIV', engagement: 'ENGA', adoption: 'ADOP', other: 'EVEN',
};

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Emit MAP/ADDR/custom sub-tags under a PLAC tag. subLevel = level of the sub-tags (PLAC_level + 1). */
function emitPlaceSubTags(lines: string[], place: Place, subLevel: number): void {
  if (place.latitude != null && place.longitude != null) {
    const latDir = place.latitude >= 0 ? 'N' : 'S';
    const lonDir = place.longitude >= 0 ? 'E' : 'W';
    lines.push(`${subLevel} MAP`);
    lines.push(`${subLevel + 1} LATI ${latDir}${Math.abs(place.latitude).toFixed(5)}`);
    lines.push(`${subLevel + 1} LONG ${lonDir}${Math.abs(place.longitude).toFixed(5)}`);
  }
  if (place.street || place.postal_code || place.city || place.country) {
    lines.push(`${subLevel} ADDR`);
    if (place.street) lines.push(`${subLevel + 1} ADR1 ${place.street}`);
    if (place.postal_code) lines.push(`${subLevel + 1} POST ${place.postal_code}`);
    if (place.city) lines.push(`${subLevel + 1} CITY ${place.city}`);
    if (place.country) lines.push(`${subLevel + 1} CTRY ${place.country}`);
  }
  if (place.place_type) lines.push(`${subLevel} _PTYPE ${place.place_type}`);
  if (place.notes) lines.push(`${subLevel} _PNOTES ${place.notes}`);
  if (place.date_from) lines.push(`${subLevel} _DATE_FROM ${place.date_from}`);
  if (place.date_to) lines.push(`${subLevel} _DATE_TO ${place.date_to}`);
  // Always write _PLAC_ID so the importer can deduplicate on re-import
  lines.push(`${subLevel} _PLAC_ID ${place.id}`);
}

/** Emit a SOUR citation block at the given base level (2 for event citations, 1 for person/fam). */
function emitCitationBlock(lines: string[], cit: Citation, srcXr: string, baseLevel: number): void {
  lines.push(`${baseLevel} SOUR ${srcXr}`);
  if (cit.page) lines.push(`${baseLevel + 1} PAGE ${cit.page}`);
  lines.push(`${baseLevel + 1} QUAY ${cit.confidence}`);
  if (cit.transcription) lines.push(`${baseLevel + 1} DATA`, `${baseLevel + 2} TEXT ${cit.transcription}`);
  if (cit.notes) lines.push(`${baseLevel + 1} NOTE ${cit.notes}`);
  if (cit.date_accessed) lines.push(`${baseLevel + 1} _ACCESSED ${cit.date_accessed}`);
}

/** Emit inline OBJE blocks for all media linked to an entity. baseLevel = 1 for INDI/FAM, 2 for events. */
function emitMediaBlocks(lines: string[], db: Database, entityType: 'person' | 'relationship' | 'event', entityId: string, baseLevel: number): void {
  const mediaItems = getMediaForEntity(db, entityType, entityId);
  for (const m of mediaItems) {
    lines.push(`${baseLevel} OBJE`);
    if (m.format) lines.push(`${baseLevel + 1} FORM ${m.format}`);
    if (m.file_ref) lines.push(`${baseLevel + 1} FILE ${m.file_ref}`);
    if (m.title) lines.push(`${baseLevel + 1} TITL ${m.title}`);
    if (m.notes) lines.push(`${baseLevel + 1} NOTE ${m.notes}`);
  }
}

export function exportGedcom(db: Database): string {
  const lines: string[] = [];

  lines.push('0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8');

  // ── Repositories ───────────────────────────────────────────────────────────
  const sources = listSources(db);
  // Collect all repositories used by any source, deduplicated by repo id
  // Cache per-source repository lookups to avoid duplicate queries
  const sourceReposCache = new Map<string, Repository[]>();
  const repoXref = new Map<string, string>();
  const allRepos = new Map<string, Repository>();
  sources.forEach(src => {
    const repos = getRepositoriesForSource(db, src.id);
    sourceReposCache.set(src.id, repos);
    for (const repo of repos) {
      if (!allRepos.has(repo.id)) {
        allRepos.set(repo.id, repo);
      }
    }
  });
  let repoCounter = 0;
  for (const [repoId, repo] of allRepos) {
    repoCounter++;
    const xr = `@R${repoCounter}@`;
    repoXref.set(repoId, xr);
    lines.push(`0 ${xr} REPO`);
    lines.push(`1 NAME ${repo.name}`);
    if (repo.address) lines.push(`1 ADDR ${repo.address}`);
    if (repo.city) lines.push(`2 CITY ${repo.city}`);
    if (repo.postal_code) lines.push(`2 POST ${repo.postal_code}`);
    if (repo.state) lines.push(`2 STAE ${repo.state}`);
    if (repo.country) lines.push(`2 CTRY ${repo.country}`);
    if (repo.phone) lines.push(`1 PHON ${repo.phone}`);
    if (repo.email) lines.push(`1 EMAIL ${repo.email}`);
    if (repo.web) lines.push(`1 WWW ${repo.web}`);
    if (repo.notes) lines.push(`1 NOTE ${repo.notes}`);
  }

  // ── Sources ────────────────────────────────────────────────────────────────
  const sourceXref = new Map<string, string>();
  sources.forEach((src, i) => {
    const xr = `@S${i + 1}@`;
    sourceXref.set(src.id, xr);
    lines.push(`0 ${xr} SOUR`);
    if (src.title) lines.push(`1 TITL ${src.title}`);
    if (src.author) lines.push(`1 AUTH ${src.author}`);
    if (src.publication_info) lines.push(`1 PUBL ${src.publication_info}`);
    if (src.repository) lines.push(`1 _REPO_TEXT ${src.repository}`);
    if (src.url) lines.push(`1 _URL ${src.url}`);
    if (src.source_type) lines.push(`1 _STYPE ${src.source_type}`);
    // Link to structured REPO records (use cached lookup)
    const linkedRepos = sourceReposCache.get(src.id) ?? [];
    for (const repo of linkedRepos) {
      const repoXr = repoXref.get(repo.id);
      if (repoXr) lines.push(`1 REPO ${repoXr}`);
    }
  });

  // ── Persons ────────────────────────────────────────────────────────────────
  const persons = listPersons(db);
  // Build the full xref map BEFORE emitting any INDI records so that ASSO blocks
  // that reference persons appearing later in the list resolve correctly.
  const personXref = new Map<string, string>();
  persons.forEach((p, i) => personXref.set(p.id, `@I${i + 1}@`));

  persons.forEach((p, i) => {
    const xr = `@I${i + 1}@`;
    lines.push(`0 ${xr} INDI`);

    const names = getPersonNames(db, p.id);
    for (const n of names) {
      const rawGiven = n.given_name ?? '';
      // Encode tilltalsnamn as asterisk in NAME for Genney compatibility
      let given = rawGiven;
      if (n.preferred_name && rawGiven) {
        given = rawGiven.replace(
          new RegExp(`(^|\\s)(${n.preferred_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(\\s|$)`),
          `$1$2*$3`,
        ).trimEnd();
      }
      const sur = n.surname ? `/${n.surname}/` : '';
      const nameStr = `${given} ${sur}`.trim();
      lines.push(`1 NAME ${nameStr}`);
      if (n.name_prefix) lines.push(`2 NPFX ${n.name_prefix}`);
      if (n.name_suffix) lines.push(`2 NSFX ${n.name_suffix}`);
      if (n.name_type && n.name_type !== 'birth') {
        lines.push(`2 TYPE ${n.name_type.toUpperCase()}`);
      }
      // Extended name fields — nickname as NICK (standard GEDCOM)
      if (n.nickname) lines.push(`2 NICK ${n.nickname}`);
      if (n.patronymic_base) lines.push(`2 _PATR ${n.patronymic_base}`);
      if (n.name_qualifier) lines.push(`2 _NQUAL ${n.name_qualifier}`);
      if (n.date_from) lines.push(`2 _DATE_FROM ${n.date_from}`);
      if (n.date_to) lines.push(`2 _DATE_TO ${n.date_to}`);
    }

    lines.push(`1 SEX ${p.sex}`);
    if (p.living) lines.push(`1 _LIVING Y`);
    if (p.notes) lines.push(`1 NOTE ${p.notes}`);

    // Person events — only emit events where this person is the PRIMARY participant.
    // Non-primary participant roles are captured as ASSO blocks instead.
    const events = getEventsForPerson(db, p.id);
    const assoLines: string[] = [];
    for (const ev of events) {
      if (ev.relationship_id) continue;
      const participants = getEventParticipants(db, ev.id);
      const isPrimary = participants.some(part => part.person_id === p.id && part.role === 'primary');
      // Skip events where this person is a secondary participant — those events
      // are owned by another person and will be emitted under their INDI.
      if (!isPrimary) continue;

      const tag = EVENT_TYPE_TO_TAG[ev.event_type] ?? 'EVEN';
      const dateStr = formatGedcomDate(ev.date_type, ev.date_value, ev.date_value_end, ev.date_original);
      lines.push(`1 ${tag}`);
      if (dateStr) lines.push(`2 DATE ${dateStr}`);
      // Write _EVID so importer can match ASSO blocks back to this event across databases
      lines.push(`2 _EVID ${ev.id}`);
      if (ev.place_id) {
        const place = getPlace(db, ev.place_id);
        if (place) {
          lines.push(`2 PLAC ${place.name}`);
          emitPlaceSubTags(lines, place, 3);
        }
      }
      if (ev.description) lines.push(`2 NOTE ${ev.description}`);
      if (ev.cause) lines.push(`2 CAUS ${ev.cause}`);
      const citations = getCitationsForEvent(db, ev.id);
      for (const cit of citations) {
        const srcXr = sourceXref.get(cit.source_id);
        if (srcXr) emitCitationBlock(lines, cit, srcXr, 2);
      }
      emitMediaBlocks(lines, db, 'event', ev.id, 2);
      // Collect ASSO blocks for non-primary participants in this event
      for (const part of participants) {
        if (part.person_id === p.id) continue;
        const partXr = personXref.get(part.person_id);
        if (partXr) {
          assoLines.push(
            `1 ASSO ${partXr}`,
            `2 RELA ${capitalizeFirst(part.role)}`,
            `2 _EVID ${ev.id}`,
          );
        }
      }
    }

    // External identifiers
    const identifiers = getPersonIdentifiers(db, p.id);
    for (const ident of identifiers) {
      switch (ident.identifier_type) {
        case 'refn':
          lines.push(`1 REFN ${ident.identifier_value}`);
          break;
        case 'rin':
          lines.push(`1 RIN ${ident.identifier_value}`);
          break;
        case 'familysearch':
          lines.push(`1 REFN ${ident.identifier_value}`);
          lines.push(`2 TYPE FamilySearch`);
          break;
        case 'ancestry':
          lines.push(`1 REFN ${ident.identifier_value}`);
          lines.push(`2 TYPE Ancestry`);
          break;
        case 'riksarkivet':
          lines.push(`1 REFN ${ident.identifier_value}`);
          lines.push(`2 TYPE Riksarkivet`);
          break;
        case 'personnummer':
          lines.push(`1 REFN ${ident.identifier_value}`);
          lines.push(`2 TYPE Personnummer`);
          break;
        default: // 'other'
          lines.push(`1 REFN ${ident.identifier_value}`);
          lines.push(`2 TYPE Other`);
          break;
      }
    }

    // ASSO blocks for sibling / godparent / other relationships
    const personRels = getRelationshipsOfPerson(db, p.id);
    for (const rel of personRels) {
      if (rel.type !== 'sibling' && rel.type !== 'godparent' && rel.type !== 'other') continue;
      const otherId = rel.person1_id === p.id ? rel.person2_id : rel.person1_id;
      if (!otherId) continue;
      const otherXr = personXref.get(otherId);
      if (otherXr) {
        assoLines.push(`1 ASSO ${otherXr}`, `2 RELA ${capitalizeFirst(rel.type)}`);
      }
    }

    // Emit all collected ASSO blocks
    lines.push(...assoLines);

    // Person-level citations (not tied to any specific event)
    const personCitations = getCitationsForPerson(db, p.id);
    for (const cit of personCitations) {
      const srcXr = sourceXref.get(cit.source_id);
      if (srcXr) emitCitationBlock(lines, cit, srcXr, 1);
    }

    // Person-level media
    emitMediaBlocks(lines, db, 'person', p.id, 1);
  });

  // ── Families ───────────────────────────────────────────────────────────────
  const relationships = listRelationships(db);
  const couples = relationships.filter(r => r.type === 'couple');
  couples.forEach((rel, i) => {
    const xr = `@F${i + 1}@`;
    lines.push(`0 ${xr} FAM`);
    if (rel.person1_id) {
      const p1xr = personXref.get(rel.person1_id);
      if (p1xr) lines.push(`1 HUSB ${p1xr}`);
    }
    if (rel.person2_id) {
      const p2xr = personXref.get(rel.person2_id);
      if (p2xr) lines.push(`1 WIFE ${p2xr}`);
    }

    // Children + PEDI sub-tag for non-biological relationships
    const childIds = new Set<string>();
    for (const r of relationships) {
      if (r.type !== 'parent_child') continue;
      if (r.person2_id && (r.person1_id === rel.person1_id || r.person1_id === rel.person2_id)) {
        childIds.add(r.person2_id);
      }
    }
    for (const childId of childIds) {
      const cxr = personXref.get(childId);
      if (cxr) {
        lines.push(`1 CHIL ${cxr}`);
        // Find a parent_child rel for this child to get the subtype
        const pcRel = relationships.find(r =>
          r.type === 'parent_child' && r.person2_id === childId &&
          (r.person1_id === rel.person1_id || r.person1_id === rel.person2_id)
        );
        if (pcRel?.subtype) {
          // Map 'biological' → 'birth' (standard GEDCOM PEDI value)
          const pedi = pcRel.subtype === 'biological' ? 'birth' : pcRel.subtype;
          lines.push(`2 PEDI ${pedi}`);
        }
      }
    }

    // Couple metadata
    if (rel.subtype) lines.push(`1 _SUBTYPE ${rel.subtype}`);
    if (rel.notes) lines.push(`1 _RELNOTES ${rel.notes}`);

    // Family events
    const famEvents = getEventsForRelationship(db, rel.id);
    for (const ev of famEvents) {
      const tag = EVENT_TYPE_TO_TAG[ev.event_type] ?? 'EVEN';
      const dateStr = formatGedcomDate(ev.date_type, ev.date_value, ev.date_value_end, ev.date_original);
      lines.push(`1 ${tag}`);
      if (dateStr) lines.push(`2 DATE ${dateStr}`);
      lines.push(`2 _EVID ${ev.id}`);
      if (ev.place_id) {
        const place = getPlace(db, ev.place_id);
        if (place) {
          lines.push(`2 PLAC ${place.name}`);
          emitPlaceSubTags(lines, place, 3);
        }
      }
      if (ev.description) lines.push(`2 NOTE ${ev.description}`);
      if (ev.cause) lines.push(`2 CAUS ${ev.cause}`);
      const citations = getCitationsForEvent(db, ev.id);
      for (const cit of citations) {
        const srcXr = sourceXref.get(cit.source_id);
        if (srcXr) emitCitationBlock(lines, cit, srcXr, 2);
      }
      emitMediaBlocks(lines, db, 'event', ev.id, 2);
    }

    // Relationship-level citations
    const relCitations = getCitationsForRelationship(db, rel.id);
    for (const cit of relCitations) {
      const srcXr = sourceXref.get(cit.source_id);
      if (srcXr) emitCitationBlock(lines, cit, srcXr, 1);
    }

    // Relationship-level media
    emitMediaBlocks(lines, db, 'relationship', rel.id, 1);
  });

  // ── Place-level citations via custom top-level _PLAC records ───────────────
  // Other apps skip unrecognised level-0 record types per GEDCOM 5.5.1 spec.
  const allPlaces = listPlaces(db);
  let placeCounter = 0;
  for (const place of allPlaces) {
    const placeCitations = getCitationsForPlace(db, place.id);
    if (placeCitations.length === 0) continue;
    placeCounter++;
    lines.push(`0 @P${placeCounter}@ _PLAC`);
    // NAME allows the importer to create the place by name when UUID lookup fails (cross-DB import)
    lines.push(`1 NAME ${place.name}`);
    lines.push(`1 _PLAC_ID ${place.id}`);
    for (const cit of placeCitations) {
      const srcXr = sourceXref.get(cit.source_id);
      if (srcXr) emitCitationBlock(lines, cit, srcXr, 1);
    }
  }

  lines.push('0 TRLR');
  return lines.join('\n') + '\n';
}
