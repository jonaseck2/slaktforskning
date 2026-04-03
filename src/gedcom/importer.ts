import type { Database } from 'node-sqlite3-wasm';
import type { GedcomNode } from './parser';
import type { Place } from '../api/types';
import { parseGedcomDate } from './date';
import { createPerson, addPersonName, addPersonIdentifier } from '../api/persons';
import { createRelationship, addEventParticipant } from '../api/relationships';
import { createEvent } from '../api/events';
import { createSource, createCitation } from '../api/sources';
import { findOrCreatePlace } from '../api/places';
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

function importEventNode(
  db: Database,
  evNode: GedcomNode,
  appType: string,
  sourceMap: Map<string, string>,
  opts: { relationship_id?: string | null },
  resolvePlaceFn: (db: Database, name: string) => Place
) {
  const dateNode = getChild(evNode, 'DATE');
  const placeName = getChild(evNode, 'PLAC')?.value;
  const parsed = dateNode
    ? parseGedcomDate(dateNode.value)
    : { date_type: 'unknown' as const, date_value: null, date_value_end: null, date_original: '' };
  const place = placeName ? resolvePlaceFn(db, placeName) : null;
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

  // Inline source citations
  for (const sour of getChildren(evNode, 'SOUR')) {
    const srcId = sourceMap.get(sour.value) ?? sourceMap.get(sour.xref ?? '');
    if (srcId) {
      const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
      const page = getChild(sour, 'PAGE')?.value ?? '';
      const dataNode = getChild(sour, 'DATA');
      const transcription = dataNode ? getChild(dataNode, 'TEXT')?.value ?? '' : '';
      createCitation(db, {
        source_id: srcId,
        event_id: event.id,
        page,
        confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
        transcription,
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

  // Phase 1: SOUR records
  const sourceMap = new Map<string, string>(); // xref → app source id
  for (const node of tree) {
    if (node.tag !== 'SOUR' || !node.xref) continue;
    const src = createSource(db, {
      title: getChild(node, 'TITL')?.value ?? '',
      author: getChild(node, 'AUTH')?.value ?? '',
      publication_info: getChild(node, 'PUBL')?.value ?? '',
      repository: getChild(node, 'REPO')?.value ?? '',
    });
    sourceMap.set(node.xref, src.id);
  }

  // Phase 2: INDI records
  const personMap = new Map<string, string>(); // xref → app person id
  for (const node of tree) {
    if (node.tag !== 'INDI' || !node.xref) continue;

    const sex = (getChild(node, 'SEX')?.value ?? 'U') as 'M' | 'F' | 'U';
    let notes = getChild(node, 'NOTE')?.value ?? '';

    // Genney 4.1: haplogroup tags → append to notes
    if (isGenney) {
      const yHaplo = getChild(node, '_YHAPLOGROUP')?.value;
      const mHaplo = getChild(node, '_MHAPLOGROUP')?.value;
      if (yHaplo) notes = notes ? `${notes}\nY-DNA: ${yHaplo}` : `Y-DNA: ${yHaplo}`;
      if (mHaplo) notes = notes ? `${notes}\nmtDNA: ${mHaplo}` : `mtDNA: ${mHaplo}`;
    }

    const person = createPerson(db, { sex, notes: notes || undefined });
    personMap.set(node.xref, person.id);

    // Names
    const nameNodes = getChildren(node, 'NAME');
    for (const nameNode of nameNodes) {
      const raw = nameNode.value ?? '';
      // Parse "Given /Surname/" format
      const surnameMatch = raw.match(/^(.*?)\/(.+?)\/(.*)$/);
      const given = (surnameMatch ? surnameMatch[1] : raw).trim() || null;
      const surname = surnameMatch ? surnameMatch[2].trim() || null : null;
      const prefix = getChild(nameNode, 'NPFX')?.value ?? null;
      const suffix = getChild(nameNode, 'NSFX')?.value ?? null;
      const rawType = getChild(nameNode, 'TYPE')?.value?.toUpperCase();
      const name_type = rawType === 'MARRIED' ? 'married' : rawType === 'AKA' ? 'aka' : rawType === 'ALIAS' ? 'alias' : 'birth';

      // Genney 4.1: detect patronymic surnames
      const patronymic_base = isGenney && surname ? extractPatronymic(surname) : null;

      addPersonName(db, person.id, {
        given_name: given,
        surname,
        name_prefix: prefix,
        name_suffix: suffix,
        name_type: name_type as 'birth' | 'married' | 'alias' | 'aka',
        patronymic_base,
      });
    }

    // External identifiers: REFN, RIN (base GEDCOM)
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

    // Person events
    for (const [gedTag, appType] of Object.entries(PERSON_EVENT_TAGS)) {
      for (const evNode of getChildren(node, gedTag)) {
        const event = importEventNode(db, evNode, appType, sourceMap, {}, resolvePlaceFn);
        addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });
      }
    }
  }

  // Phase 3: FAM records
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

    // Family events
    for (const [gedTag, appType] of Object.entries(FAMILY_EVENT_TAGS)) {
      for (const evNode of getChildren(node, gedTag)) {
        importEventNode(db, evNode, appType, sourceMap, { relationship_id: couple.id }, resolvePlaceFn);
      }
    }

    // Children → parent_child relationships
    for (const chil of getChildren(node, 'CHIL')) {
      const childId = personMap.get(chil.value);
      if (!childId) continue;
      if (person1Id) createRelationship(db, { type: 'parent_child', person1_id: person1Id, person2_id: childId, subtype: 'biological' });
      if (person2Id) createRelationship(db, { type: 'parent_child', person1_id: person2Id, person2_id: childId, subtype: 'biological' });
    }
  }
}
