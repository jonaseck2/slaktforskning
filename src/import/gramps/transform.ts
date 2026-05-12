/**
 * Gramps .gramps → Släktforskning transform.
 *
 * Gramps stores its database as XML (`.gramps` files are plain text per
 * gramps-project.org/xml/1.7/grampsxml.dtd; .gpkg adds a media bundle).
 * The format is regular and shallow per entity, so this importer uses a
 * small purpose-built reader (no XML library) — same approach as the
 * GEDCOM parser, kept narrow to Gramps's actual shape.
 *
 * Pure logic: no Electron / IPC / UI dependencies. The orchestrator at
 * src/import/gramps/index.ts reads the file, optionally gunzips it,
 * and hands the XML text to `transformGramps`.
 */

import type { Database } from 'node-sqlite3-wasm';
import { createPerson, addPersonName, addPersonIdentifier } from '../../api/persons';
import { createRelationship, addEventParticipant } from '../../api/relationships';
import { createEvent } from '../../api/events';
import { findOrCreatePlace } from '../../api/places';
import { createSource, createCitation } from '../../api/sources';
import { createMedia } from '../../api/media';
import { setDbSetting, getDbSetting } from '../../api/db_settings';
import { runBatch } from '../../api/db';

// ── Public API ─────────────────────────────────────────────────────────────

export interface GrampsImportSummary {
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

export function emptyGrampsSummary(): GrampsImportSummary {
  return {
    persons: 0, coupleRelationships: 0, parentChildRelationships: 0,
    events: 0, places: 0, sources: 0, citations: 0, media: 0,
    warnings: [], skipped: [],
  };
}

// ── Parsed-entity types (the shape we extract from the XML) ────────────────

interface GrampsPerson {
  handle: string;
  id: string;
  gender: 'M' | 'F' | 'U';
  names: { type?: string; first?: string; surname?: string }[];
  eventRefs: { hlink: string; role?: string }[];
  parentIn: string[];
  childOf?: string;
  uid?: string;
}

interface GrampsFamily {
  handle: string;
  id: string;
  rel?: string;
  father?: string;
  mother?: string;
  children: string[];
  eventRefs: { hlink: string; role?: string }[];
}

interface GrampsEvent {
  handle: string;
  id: string;
  type?: string;
  dateVal?: string;
  dateRangeStart?: string;
  dateRangeStop?: string;
  dateModifier?: 'about' | 'before' | 'after' | 'between' | 'calculated';
  placeHandle?: string;
  description?: string;
  citationRefs: string[];
}

interface GrampsPlace {
  handle: string;
  id: string;
  title?: string;
  pname?: string;
  parentHandle?: string;
  type?: string;
}

interface GrampsSource {
  handle: string;
  id: string;
  title?: string;
  author?: string;
  pubinfo?: string;
}

interface GrampsCitation {
  handle: string;
  id: string;
  sourceHandle?: string;
  page?: string;
  confidence?: number;
}

interface GrampsObject {
  handle: string;
  id: string;
  fileSrc?: string;
  mime?: string;
  description?: string;
}

interface GrampsResearcher {
  name?: string;
  street?: string;
  locality?: string;
  city?: string;
  state?: string;
  country?: string;
  postal?: string;
  phone?: string;
  email?: string;
}

// ── XML scan ──────────────────────────────────────────────────────────────
// The Gramps DTD is regular: every entity is one element block whose
// children appear in a stable order. We scan via String.match / matchAll;
// no XML library, no nested traversal beyond the entity's own block.

interface ParsedDoc {
  researcher: GrampsResearcher;
  persons: GrampsPerson[];
  families: GrampsFamily[];
  events: GrampsEvent[];
  places: GrampsPlace[];
  sources: GrampsSource[];
  citations: GrampsCitation[];
  objects: GrampsObject[];
}

function attr(line: string, name: string): string | undefined {
  const m = line.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : undefined;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function selfClosed(text: string, tag: string): string[] {
  return [...text.matchAll(new RegExp(`<${tag}\\b[^>]*?/>`, 'g'))].map(m => m[0]);
}

function* blocks(text: string, openTag: string): Generator<string> {
  const openRe = new RegExp(`<${openTag}\\b[^>]*>`, 'g');
  for (const open of text.matchAll(openRe)) {
    if (open[0].endsWith('/>')) continue;
    const start = open.index!;
    const after = start + open[0].length;
    const closeMarker = `</${openTag}>`;
    const closeIdx = text.indexOf(closeMarker, after);
    if (closeIdx < 0) continue;
    yield text.slice(start, closeIdx + closeMarker.length);
  }
}

function firstMatch(text: string, re: RegExp): RegExpMatchArray | null {
  return text.match(re);
}

function parseGrampsXml(xml: string): ParsedDoc {
  const doc: ParsedDoc = {
    researcher: {},
    persons: [], families: [], events: [], places: [],
    sources: [], citations: [], objects: [],
  };

  // ── researcher ──
  const headBlock = [...blocks(xml, 'header')][0];
  if (headBlock) {
    for (const inner of [
      ['resname', 'name'], ['resaddr', 'street'], ['reslocality', 'locality'],
      ['rescity', 'city'], ['resstate', 'state'], ['rescountry', 'country'],
      ['respostal', 'postal'], ['resphone', 'phone'], ['resemail', 'email'],
    ] as const) {
      const m = firstMatch(headBlock, new RegExp(`<${inner[0]}>([\\s\\S]*?)</${inner[0]}>`));
      if (m) doc.researcher[inner[1]] = decodeXml(m[1].trim());
    }
  }

  // ── events ──
  for (const block of blocks(xml, 'event')) {
    const handle = attr(block, 'handle') ?? '';
    const id = attr(block, 'id') ?? '';
    if (!handle) continue;
    const typeM = firstMatch(block, /<type>([\s\S]*?)<\/type>/);
    const dateValM = firstMatch(block, /<dateval\b[^>]*\bval="([^"]*)"[^>]*\/>/);
    const dateValTypeM = firstMatch(block, /<dateval\b[^>]*\btype="([^"]*)"[^>]*\/>/);
    const dateRangeM = firstMatch(block, /<daterange\b[^>]*\bstart="([^"]*)"[^>]*\bstop="([^"]*)"/);
    const dateSpanM = firstMatch(block, /<datespan\b[^>]*\bstart="([^"]*)"[^>]*\bstop="([^"]*)"/);
    const placeM = firstMatch(block, /<place\b[^>]*\bhlink="([^"]*)"/);
    const descM = firstMatch(block, /<description>([\s\S]*?)<\/description>/);
    const citationRefs: string[] = [];
    for (const ref of selfClosed(block, 'citationref')) {
      const h = attr(ref, 'hlink');
      if (h) citationRefs.push(h);
    }
    const dateModifier = (() => {
      const t = dateValTypeM?.[1];
      if (t === 'about') return 'about' as const;
      if (t === 'before') return 'before' as const;
      if (t === 'after') return 'after' as const;
      if (t === 'estimated' || t === 'calculated') return 'calculated' as const;
      return undefined;
    })();
    doc.events.push({
      handle, id,
      type: typeM ? decodeXml(typeM[1].trim()) : undefined,
      dateVal: dateValM ? dateValM[1] : undefined,
      dateRangeStart: dateRangeM?.[1] ?? dateSpanM?.[1],
      dateRangeStop: dateRangeM?.[2] ?? dateSpanM?.[2],
      dateModifier: dateModifier ?? (dateRangeM || dateSpanM ? 'between' : undefined),
      placeHandle: placeM?.[1],
      description: descM ? decodeXml(descM[1].trim()) : undefined,
      citationRefs,
    });
  }

  // ── people ──
  for (const block of blocks(xml, 'person')) {
    const handle = attr(block, 'handle') ?? '';
    const id = attr(block, 'id') ?? '';
    if (!handle) continue;
    const genderM = firstMatch(block, /<gender>([MFU])<\/gender>/);
    const gender: 'M' | 'F' | 'U' = (genderM?.[1] as 'M' | 'F' | 'U') ?? 'U';
    const names: GrampsPerson['names'] = [];
    for (const nblk of blocks(block, 'name')) {
      const type = attr(nblk, 'type');
      const firstM = firstMatch(nblk, /<first>([\s\S]*?)<\/first>/);
      const surnameM = firstMatch(nblk, /<surname>([\s\S]*?)<\/surname>/);
      names.push({
        type,
        first: firstM ? decodeXml(firstM[1].trim()) : undefined,
        surname: surnameM ? decodeXml(surnameM[1].trim()) : undefined,
      });
    }
    const eventRefs: GrampsPerson['eventRefs'] = [];
    for (const ref of selfClosed(block, 'eventref')) {
      const h = attr(ref, 'hlink');
      if (h) eventRefs.push({ hlink: h, role: attr(ref, 'role') });
    }
    const parentIn: string[] = [];
    for (const ref of selfClosed(block, 'parentin')) {
      const h = attr(ref, 'hlink');
      if (h) parentIn.push(h);
    }
    const childOfM = firstMatch(block, /<childof\b[^>]*\bhlink="([^"]*)"/);
    const uidM = firstMatch(block, /<attribute\b[^>]*type="_UID"[^>]*value="([^"]*)"/);
    doc.persons.push({
      handle, id, gender, names, eventRefs, parentIn,
      childOf: childOfM?.[1],
      uid: uidM?.[1],
    });
  }

  // ── families ──
  for (const block of blocks(xml, 'family')) {
    const handle = attr(block, 'handle') ?? '';
    const id = attr(block, 'id') ?? '';
    if (!handle) continue;
    const relM = firstMatch(block, /<rel\b[^>]*\btype="([^"]*)"/);
    const fatherM = firstMatch(block, /<father\b[^>]*\bhlink="([^"]*)"/);
    const motherM = firstMatch(block, /<mother\b[^>]*\bhlink="([^"]*)"/);
    const children: string[] = [];
    for (const ref of selfClosed(block, 'childref')) {
      const h = attr(ref, 'hlink');
      if (h) children.push(h);
    }
    const eventRefs: GrampsFamily['eventRefs'] = [];
    for (const ref of selfClosed(block, 'eventref')) {
      const h = attr(ref, 'hlink');
      if (h) eventRefs.push({ hlink: h, role: attr(ref, 'role') });
    }
    doc.families.push({
      handle, id, rel: relM?.[1],
      father: fatherM?.[1], mother: motherM?.[1],
      children, eventRefs,
    });
  }

  // ── places ──
  for (const block of blocks(xml, 'placeobj')) {
    const handle = attr(block, 'handle') ?? '';
    const id = attr(block, 'id') ?? '';
    if (!handle) continue;
    const titleM = firstMatch(block, /<ptitle>([\s\S]*?)<\/ptitle>/);
    const pnameM = firstMatch(block, /<pname\b[^>]*\bvalue="([^"]*)"/);
    const parentM = firstMatch(block, /<placeref\b[^>]*\bhlink="([^"]*)"/);
    doc.places.push({
      handle, id,
      title: titleM ? decodeXml(titleM[1].trim()) : undefined,
      pname: pnameM ? decodeXml(pnameM[1]) : undefined,
      parentHandle: parentM?.[1],
      type: attr(block, 'type'),
    });
  }

  // ── sources ──
  for (const block of blocks(xml, 'source')) {
    const handle = attr(block, 'handle') ?? '';
    const id = attr(block, 'id') ?? '';
    if (!handle) continue;
    const titleM = firstMatch(block, /<stitle>([\s\S]*?)<\/stitle>/);
    const authorM = firstMatch(block, /<sauthor>([\s\S]*?)<\/sauthor>/);
    const pubM = firstMatch(block, /<spubinfo>([\s\S]*?)<\/spubinfo>/);
    doc.sources.push({
      handle, id,
      title: titleM ? decodeXml(titleM[1].trim()) : undefined,
      author: authorM ? decodeXml(authorM[1].trim()) : undefined,
      pubinfo: pubM ? decodeXml(pubM[1].trim()) : undefined,
    });
  }

  // ── citations ──
  for (const block of blocks(xml, 'citation')) {
    const handle = attr(block, 'handle') ?? '';
    const id = attr(block, 'id') ?? '';
    if (!handle) continue;
    const sourceM = firstMatch(block, /<sourceref\b[^>]*\bhlink="([^"]*)"/);
    const pageM = firstMatch(block, /<page>([\s\S]*?)<\/page>/);
    const confM = firstMatch(block, /<confidence>(\d+)<\/confidence>/);
    doc.citations.push({
      handle, id,
      sourceHandle: sourceM?.[1],
      page: pageM ? decodeXml(pageM[1].trim()) : undefined,
      confidence: confM ? parseInt(confM[1], 10) : undefined,
    });
  }

  // ── objects (media) ──
  for (const block of blocks(xml, 'object')) {
    const handle = attr(block, 'handle') ?? '';
    const id = attr(block, 'id') ?? '';
    if (!handle) continue;
    const fileM = firstMatch(block, /<file\b[^>]*?\bsrc="([^"]*)"[^>]*?(?:\bmime="([^"]*)")?[^>]*?(?:\bdescription="([^"]*)")?/);
    doc.objects.push({
      handle, id,
      fileSrc: fileM?.[1] ? decodeXml(fileM[1]) : undefined,
      mime: fileM?.[2],
      description: fileM?.[3] ? decodeXml(fileM[3]) : undefined,
    });
  }

  return doc;
}

// ── Mapping ───────────────────────────────────────────────────────────────

const GRAMPS_EVENT_TYPE_TO_OURS: Record<string, string> = {
  Birth: 'birth', Death: 'death', Marriage: 'marriage', Divorce: 'divorce',
  Christening: 'christening', Burial: 'burial', Cremation: 'cremation',
  Adoption: 'adoption', Baptism: 'christening',
  'Bar Mitzvah': 'bar_mitzvah', 'Bas Mitzvah': 'bas_mitzvah',
  Confirmation: 'confirmation', Ordination: 'ordination',
  Naturalization: 'naturalization', Emigration: 'emigration',
  Immigration: 'immigration', Census: 'census', Probate: 'probate',
  Will: 'will', Graduation: 'graduation', Retirement: 'retirement',
  Education: 'education', Occupation: 'occupation', Religion: 'religion',
  Residence: 'residence', Engagement: 'engagement',
  Annulment: 'annulment', 'Marriage License': 'marriage_license',
  'Marriage Banns': 'marriage_license', 'Marriage Settlement': 'fact',
  'Cause Of Death': 'fact', Description: 'description',
  'Military Service': 'military', Property: 'fact', Title: 'title',
  Nationality: 'religion',
};

function mapGrampsEventType(t?: string): string {
  if (!t) return 'other';
  return GRAMPS_EVENT_TYPE_TO_OURS[t] ?? 'other';
}

function mapFamilyRel(rel?: string): string | null {
  if (!rel) return null;
  const norm = rel.toLowerCase();
  if (norm === 'married') return 'marriage';
  if (norm === 'unmarried' || norm === 'civil union' || norm === 'civilunion') return 'civil_union';
  if (norm === 'partners') return 'cohabitation';
  return 'unknown';
}

// ── Transform ─────────────────────────────────────────────────────────────

export async function transformGramps(ourDb: Database, xml: string): Promise<GrampsImportSummary> {
  const summary = emptyGrampsSummary();
  const doc = parseGrampsXml(xml);

  // ── researcher → db_settings (only if currently empty) ─────────────────
  const setIfEmpty = async (key: string, value: string | undefined): Promise<void> => {
    if (!value?.trim()) return;
    const existing = await getDbSetting(ourDb, key);
    if (existing && existing.trim()) return;
    await setDbSetting(ourDb, key, value.trim());
  };
  if (doc.researcher.name) await setIfEmpty('researcher_name', doc.researcher.name);
  const addrLines = [
    doc.researcher.street,
    [doc.researcher.postal, doc.researcher.city].filter(Boolean).join(' ').trim() || null,
    doc.researcher.locality,
    doc.researcher.state,
    doc.researcher.country,
  ].filter((s): s is string => Boolean(s?.trim()));
  if (addrLines.length > 0) await setIfEmpty('researcher_address', addrLines.join('\n'));
  await setIfEmpty('researcher_phone', doc.researcher.phone);
  await setIfEmpty('researcher_email', doc.researcher.email);

  // ── places ─────────────────────────────────────────────────────────────
  const placeMap = new Map<string, string>();
  for (const p of doc.places) {
    const name = p.title?.trim() || p.pname?.trim();
    if (!name) continue;
    const place = await findOrCreatePlace(ourDb, name);
    placeMap.set(p.handle, place.id);
    summary.places++;
  }
  // Hook up parent_place_id where parent exists. Collected into a single
  // bulk UPDATE so 1000s of parent links don't pay 1000s of IPC roundtrips.
  const parentLinkParams: unknown[][] = [];
  for (const p of doc.places) {
    if (!p.parentHandle) continue;
    const childOurId = placeMap.get(p.handle);
    const parentOurId = placeMap.get(p.parentHandle);
    if (!childOurId || !parentOurId) continue;
    parentLinkParams.push([parentOurId, childOurId]);
  }
  if (parentLinkParams.length > 0) {
    await runBatch(ourDb, 'UPDATE places SET parent_place_id = ? WHERE id = ?', parentLinkParams);
  }

  // ── sources ────────────────────────────────────────────────────────────
  const sourceMap = new Map<string, string>();
  for (const s of doc.sources) {
    if (!s.title?.trim()) continue;
    const src = await createSource(ourDb, {
      title: s.title.trim(),
      author: s.author ?? '',
      publication_info: s.pubinfo ?? '',
      url: '',
      source_type: 'other',
    });
    sourceMap.set(s.handle, src.id);
    summary.sources++;
  }
  const citationByHandle = new Map(doc.citations.map(c => [c.handle, c]));

  // ── persons ────────────────────────────────────────────────────────────
  const personMap = new Map<string, string>();
  for (const p of doc.persons) {
    const person = await createPerson(ourDb, { sex: p.gender }, { allowNameless: true });
    personMap.set(p.handle, person.id);
    if (p.uid) {
      await addPersonIdentifier(ourDb, person.id, { identifier_type: 'uid', identifier_value: p.uid });
    }
    const sortedNames = p.names.slice().sort((a, b) =>
      (a.type === 'Birth Name' ? -1 : 0) - (b.type === 'Birth Name' ? -1 : 0)
    );
    for (let i = 0; i < sortedNames.length; i++) {
      const n = sortedNames[i];
      const t = (n.type ?? '').toLowerCase();
      const nameType: 'birth' | 'married' | 'aka' | 'alias' =
        t === 'married name' || t === 'married'
          ? 'married'
          : t === 'aka' || t === 'also known as'
            ? 'aka'
            : t === 'alias'
              ? 'alias'
              : 'birth';
      await addPersonName(ourDb, person.id, {
        given_name: n.first ?? '',
        surname: n.surname ?? '',
        name_type: nameType,
        sort_order: i,
      });
    }
    summary.persons++;
  }

  // ── families ───────────────────────────────────────────────────────────
  const familyToCoupleId = new Map<string, string>();
  for (const f of doc.families) {
    const fatherId = f.father ? personMap.get(f.father) : undefined;
    const motherId = f.mother ? personMap.get(f.mother) : undefined;
    if (fatherId && motherId) {
      const subtype = mapFamilyRel(f.rel);
      const couple = await createRelationship(ourDb, {
        type: 'couple',
        person1_id: fatherId,
        person2_id: motherId,
        ...(subtype ? { subtype } : {}),
      });
      familyToCoupleId.set(f.handle, couple.id);
      summary.coupleRelationships++;
    }
    for (const childHandle of f.children) {
      const childId = personMap.get(childHandle);
      if (!childId) continue;
      if (fatherId) {
        await createRelationship(ourDb, {
          type: 'parent_child', person1_id: fatherId, person2_id: childId, subtype: 'biological',
        });
        summary.parentChildRelationships++;
      }
      if (motherId) {
        await createRelationship(ourDb, {
          type: 'parent_child', person1_id: motherId, person2_id: childId, subtype: 'biological',
        });
        summary.parentChildRelationships++;
      }
    }
  }

  // ── events ─────────────────────────────────────────────────────────────
  const ownerByEventHandle = new Map<string, { kind: 'person'; id: string } | { kind: 'family'; id: string }>();
  for (const p of doc.persons) {
    const personOurId = personMap.get(p.handle);
    if (!personOurId) continue;
    for (const ref of p.eventRefs) {
      if (!ownerByEventHandle.has(ref.hlink)) {
        ownerByEventHandle.set(ref.hlink, { kind: 'person', id: personOurId });
      }
    }
  }
  for (const f of doc.families) {
    const coupleId = familyToCoupleId.get(f.handle);
    if (!coupleId) continue;
    for (const ref of f.eventRefs) {
      ownerByEventHandle.set(ref.hlink, { kind: 'family', id: coupleId });
    }
  }

  for (const e of doc.events) {
    const owner = ownerByEventHandle.get(e.handle);
    const placeId = e.placeHandle ? placeMap.get(e.placeHandle) : undefined;
    const dateType: 'exact' | 'about' | 'before' | 'after' | 'between' | 'calculated' | 'unknown' =
      e.dateModifier === 'about' ? 'about'
      : e.dateModifier === 'before' ? 'before'
      : e.dateModifier === 'after' ? 'after'
      : e.dateModifier === 'calculated' ? 'calculated'
      : e.dateModifier === 'between' ? 'between'
      : e.dateVal ? 'exact'
      : 'unknown';
    const dateValue = e.dateVal ?? e.dateRangeStart ?? null;
    const dateValueEnd = e.dateRangeStop ?? null;

    const created = await createEvent(ourDb, {
      event_type: mapGrampsEventType(e.type),
      date_type: dateType,
      date_value: dateValue,
      date_value_end: dateValueEnd,
      date_original: e.dateVal ?? (e.dateRangeStart ? `${e.dateRangeStart}..${e.dateRangeStop ?? ''}` : ''),
      place_id: placeId,
      notes: e.description ?? '',
      relationship_id: owner?.kind === 'family' ? owner.id : undefined,
    });

    if (owner?.kind === 'person') {
      await addEventParticipant(ourDb, {
        event_id: created.id, person_id: owner.id, role: 'primary',
      });
    }

    for (const cHandle of e.citationRefs) {
      const cit = citationByHandle.get(cHandle);
      const sourceId = cit?.sourceHandle ? sourceMap.get(cit.sourceHandle) : undefined;
      if (!sourceId) continue;
      const conf = (cit?.confidence ?? 2) as 0 | 1 | 2 | 3;
      await createCitation(ourDb, {
        source_id: sourceId,
        event_id: created.id,
        page: cit?.page ?? '',
        confidence: Math.min(3, Math.max(0, conf)) as 0 | 1 | 2 | 3,
        transcription: '',
        notes: '',
      });
      summary.citations++;
    }

    summary.events++;
  }

  // ── media (objects) ────────────────────────────────────────────────────
  for (const o of doc.objects) {
    if (!o.fileSrc && !o.description) continue;
    await createMedia(ourDb, {
      file_ref: o.fileSrc ?? null,
      title: o.description ?? '',
      format: o.mime ?? null,
      notes: '',
    });
    summary.media++;
  }

  return summary;
}

export { parseGrampsXml };
