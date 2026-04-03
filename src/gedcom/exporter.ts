import type { Database } from 'node-sqlite3-wasm';
import { listPersons, getPersonNames, getPersonIdentifiers } from '../api/persons';
import { listRelationships } from '../api/relationships';
import { getEventsForPerson, getEventsForRelationship } from '../api/events';
import { listSources, getCitationsForEvent } from '../api/sources';
import { getPlace } from '../api/places';
import { formatGedcomDate } from './date';

const EVENT_TYPE_TO_TAG: Record<string, string> = {
  birth: 'BIRT', death: 'DEAT', christening: 'CHR', burial: 'BURI',
  baptism: 'BAPM', confirmation: 'CONF', occupation: 'OCCU',
  residence: 'RESI', education: 'EDUC', emigration: 'EMIG',
  immigration: 'IMMI', naturalization: 'NATU', census: 'CENS',
  probate: 'PROB', will: 'WILL', graduation: 'GRAD', retirement: 'RETI',
  marriage: 'MARR', divorce: 'DIV', other: 'EVEN',
};

export function exportGedcom(db: Database): string {
  const lines: string[] = [];

  lines.push('0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8');

  // Sources
  const sources = listSources(db);
  const sourceXref = new Map<string, string>();
  sources.forEach((src, i) => {
    const xr = `@S${i + 1}@`;
    sourceXref.set(src.id, xr);
    lines.push(`0 ${xr} SOUR`);
    if (src.title) lines.push(`1 TITL ${src.title}`);
    if (src.author) lines.push(`1 AUTH ${src.author}`);
    if (src.publication_info) lines.push(`1 PUBL ${src.publication_info}`);
  });

  // Persons
  const persons = listPersons(db);
  const personXref = new Map<string, string>();
  persons.forEach((p, i) => {
    const xr = `@I${i + 1}@`;
    personXref.set(p.id, xr);
    lines.push(`0 ${xr} INDI`);

    const names = getPersonNames(db, p.id);
    for (const n of names) {
      const given = n.given_name ?? '';
      const sur = n.surname ? `/${n.surname}/` : '';
      const nameStr = `${given} ${sur}`.trim();
      lines.push(`1 NAME ${nameStr}`);
      if (n.name_prefix) lines.push(`2 NPFX ${n.name_prefix}`);
      if (n.name_suffix) lines.push(`2 NSFX ${n.name_suffix}`);
      if (n.name_type && n.name_type !== 'birth') {
        lines.push(`2 TYPE ${n.name_type.toUpperCase()}`);
      }
    }

    lines.push(`1 SEX ${p.sex}`);
    if (p.notes) lines.push(`1 NOTE ${p.notes}`);

    // Person events (exclude family events — those have relationship_id)
    const events = getEventsForPerson(db, p.id);
    for (const ev of events) {
      if (ev.relationship_id) continue;
      const tag = EVENT_TYPE_TO_TAG[ev.event_type] ?? 'EVEN';
      const dateStr = formatGedcomDate(ev.date_type, ev.date_value, ev.date_value_end, ev.date_original);
      lines.push(`1 ${tag}`);
      if (dateStr) lines.push(`2 DATE ${dateStr}`);
      if (ev.place_id) {
        const place = getPlace(db, ev.place_id);
        if (place) lines.push(`2 PLAC ${place.name}`);
      }
      if (ev.description) lines.push(`2 NOTE ${ev.description}`);
      const citations = getCitationsForEvent(db, ev.id);
      for (const cit of citations) {
        const srcXr = sourceXref.get(cit.source_id);
        if (srcXr) {
          lines.push(`2 SOUR ${srcXr}`);
          if (cit.page) lines.push(`3 PAGE ${cit.page}`);
          lines.push(`3 QUAY ${cit.confidence}`);
          if (cit.transcription) lines.push(`3 DATA`, `4 TEXT ${cit.transcription}`);
        }
      }
    }

    // External identifiers
    const identifiers = getPersonIdentifiers(db, p.id);
    for (const ident of identifiers) {
      if (ident.identifier_type === 'refn') lines.push(`1 REFN ${ident.identifier_value}`);
      if (ident.identifier_type === 'rin') lines.push(`1 RIN ${ident.identifier_value}`);
    }
  });

  // Families (couple relationships)
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

    // Children: find all parent_child rels where parent is person1 or person2
    const childIds = new Set<string>();
    for (const r of relationships) {
      if (r.type !== 'parent_child') continue;
      if (r.person2_id && (r.person1_id === rel.person1_id || r.person1_id === rel.person2_id)) {
        childIds.add(r.person2_id);
      }
    }
    for (const childId of childIds) {
      const cxr = personXref.get(childId);
      if (cxr) lines.push(`1 CHIL ${cxr}`);
    }

    // Family events
    const famEvents = getEventsForRelationship(db, rel.id);
    for (const ev of famEvents) {
      const tag = EVENT_TYPE_TO_TAG[ev.event_type] ?? 'EVEN';
      const dateStr = formatGedcomDate(ev.date_type, ev.date_value, ev.date_value_end, ev.date_original);
      lines.push(`1 ${tag}`);
      if (dateStr) lines.push(`2 DATE ${dateStr}`);
      if (ev.place_id) {
        const place = getPlace(db, ev.place_id);
        if (place) lines.push(`2 PLAC ${place.name}`);
      }
      if (ev.description) lines.push(`2 NOTE ${ev.description}`);
    }
  });

  lines.push('0 TRLR');
  return lines.join('\n') + '\n';
}
