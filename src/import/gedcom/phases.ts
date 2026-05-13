/**
 * GEDCOM import phases.
 *
 * Each phase function mutates the ImportContext (maps, counters) and writes to
 * the database. The orchestrator in import-core.ts calls them in order.
 *
 * Phases:
 *   0   NOTE top-level records -> noteMap
 *   0.5 OBJE top-level records -> objeMap
 *   0.7 REPO records -> repoMap
 *   0.8 _GRP records (Genney only) -> grpMap
 *   1   SOUR records -> sourceMap
 *   2   INDI records -> personMap (+ holgerAdoptionMap for Holger)
 *   3   FAM records -> couple + parent_child relationships + family events
 *   4   ASSO post-processing -> event participants + sibling/godparent relationships
 *   5   _PLAC records -> place-level citations
 *   6   _TODO records (Genney only) -> research tasks
 *   SUBM  Submitter name collection
 */

import { v4 as uuid } from 'uuid';
import { basename } from 'path';
import type { Relationship, RelationshipType, EventParticipantRole, PersonIdentifier } from '../../api/types';
import { bulkCreatePersons, bulkAddPersonNames, bulkAddPersonIdentifiers } from '../../api/persons';
import { createRelationship, addEventParticipant, bulkAddEventParticipants, bulkCreateRelationships, getRelationshipsOfPerson } from '../../api/relationships';
import { createCitation, bulkCreateSources, bulkCreateCitations } from '../../api/sources';
import { bulkCreateMedia, bulkAddMediaLinks } from '../../api/media';
import { bulkCreateEvents } from '../../api/events';
import { getPlace, bulkResolvePlaces } from '../../api/places';
import { createRepository, linkSourceRepository } from '../../api/repositories';
import { createGroup, addGroupLink } from '../../api/groups';
import { createResearchTask, addTaskLink } from '../../api/research_tasks';
import { getPatronymicBase } from './profiles/genney';
import { holgerEngaSubtype, parseHolgerAdoptionSubtypes } from './profiles/holger';
import type { ImportContext } from './import-types';
import { getChild, getChildren, resolveNote } from './node-utils';
import { importObjeNode, remapHolgerMediaPath } from './obje-importer';
import { collectEventNode } from './event-importer';
import type { EventCollectResult } from './event-importer';
import { PERSON_EVENT_TAGS, FAMILY_EVENT_TAGS } from './phases/shared';

// ── Tag maps ────────────────────────────────────────────────────────────────
// PERSON_EVENT_TAGS and FAMILY_EVENT_TAGS live in ./phases/shared and are
// re-exported here for callers that still import from './phases'.
export { PERSON_EVENT_TAGS, FAMILY_EVENT_TAGS };

const KNOWN_INDI_TAGS = new Set([
  'NAME', 'SEX', '_LIVING', 'NOTE', 'SOUR', 'ASSO', 'REFN', 'RIN',
  'AFN', 'SSN', 'FSID',
  '_UID', 'UID', '_FSI', '_ANID', '_RAID', '_PNUMMER', '_YHAPLOGROUP', '_MHAPLOGROUP', '_GRP',
  'FAMC', 'FAMS', 'CHAN',
  // PERSON_EVENT_TAGS keys:
  'BIRT', 'DEAT', 'CHR', 'BURI', 'BAPM', 'CONF', 'OCCU', 'RESI', 'EDUC',
  'EMIG', 'IMMI', 'NATU', 'CENS', 'PROB', 'WILL', 'GRAD', 'RETI', 'ENGA', 'ADOP', 'EVEN',
  'CREM', 'BARM', 'BASM', 'ORDN', '_MILT',
  'TITL', 'RELI', 'DSCR', 'FACT', 'OBJE',
  // Holger custom tags imported as notes:
  'REMA', 'MISC',
]);

const KNOWN_FAM_TAGS = new Set([
  'HUSB', 'WIFE', 'CHIL', 'SOUR', 'NOTE', '_SUBTYPE', '_RELNOTES', 'CHAN',
  // FAMILY_EVENT_TAGS keys:
  'MARR', 'DIV', 'CENS', 'ENGA', 'EVEN',
  'ANUL', 'MARL', '_SEPR',
  'OBJE',
]);

// ── Phase 0: NOTE records ───────────────────────────────────────────────────
// phaseNotes lives in ./phases/notes and is re-exported here for callers that
// still import from './phases'.
export { phaseNotes } from './phases/notes';

// ── Phase 0.3: pre-resolve places ──────────────────────────────────────────
// phasePrepPlaces lives in ./phases/prep-places and is re-exported here for
// callers that still import from './phases'.
export { phasePrepPlaces } from './phases/prep-places';

// ── Phase 0.4: pre-resolve inline OBJE (media inside INDI/FAM/events) ──────
// phasePrepInlineMedia lives in ./phases/prep-inline-media and is re-exported
// here for callers that still import from './phases'.
export { phasePrepInlineMedia } from './phases/prep-inline-media';

// ── Phase 0.5: OBJE top-level records ──────────────────────────────────────
// phaseObje lives in ./phases/obje and is re-exported here for callers that
// still import from './phases'.
export { phaseObje } from './phases/obje';

// ── Phase 0.7: REPO records ────────────────────────────────────────────────
// phaseRepo lives in ./phases/repo and is re-exported here for callers that
// still import from './phases'.
export { phaseRepo } from './phases/repo';

// ── Phase 0.8: _GRP records (Genney only) ──────────────────────────────────
// phaseGroups lives in ./phases/groups and is re-exported here for callers
// that still import from './phases'.
export { phaseGroups } from './phases/groups';

// ── Phase 1: SOUR records ──────────────────────────────────────────────────

export async function phaseSources(ctx: ImportContext): Promise<void> {
  // Two-pass: parse + collect; bulk INSERT once; then per-row repo links.
  const sourNodes: typeof ctx.tree = [];
  for (const n of ctx.tree) if (n.tag === 'SOUR' && n.xref) sourNodes.push(n);
  const total = sourNodes.length;
  if (total === 0) return;

  ctx.options?.onProgress?.(`Importerar källor (0 / ${total})`);
  type SourceRow = {
    id: string;
    title: string; author: string; publication_info: string; repository: string;
    url: string; source_type: string;
    abstract: string | null; call_number: string | null;
  };
  const rows: SourceRow[] = new Array(total);
  // Repo-link pairs to flush after the bulk source insert (still per-row IPC
  // because there are typically few repository links; not the hot path).
  const repoLinks: Array<{ sourceId: string; repoXref: string }> = [];
  for (let i = 0; i < total; i++) {
    const node = sourNodes[i];
    const id = uuid();
    ctx.sourceMap.set(node.xref!, id);
    rows[i] = {
      id,
      title: getChild(node, 'TITL')?.value ?? '',
      author: getChild(node, 'AUTH')?.value ?? '',
      publication_info: getChild(node, 'PUBL')?.value ?? '',
      repository: (() => {
        const repoText = getChild(node, '_REPO_TEXT')?.value;
        if (repoText) return repoText;
        const repoVal = getChild(node, 'REPO')?.value ?? '';
        return repoVal.startsWith('@') ? '' : repoVal;
      })(),
      url: getChild(node, '_URL')?.value ?? '',
      source_type: getChild(node, '_STYPE')?.value ?? '',
      abstract: getChild(node, '_ABSTRACT')?.value ?? null,
      call_number: getChild(node, '_CALL')?.value ?? null,
    };
    const repoVal = getChild(node, 'REPO')?.value ?? '';
    if (repoVal.startsWith('@')) repoLinks.push({ sourceId: id, repoXref: repoVal });
    if ((i + 1) % 200 === 0 || (i + 1) === total) {
      ctx.options?.onProgress?.(`Importerar källor (${i + 1} / ${total})`);
    }
  }
  ctx.options?.onProgress?.(`Sparar ${total} källor…`);
  await bulkCreateSources(ctx.db, rows);

  // Repo links — small set; per-row is fine.
  for (const { sourceId, repoXref } of repoLinks) {
    const repoId = ctx.repoMap.get(repoXref);
    if (repoId) await linkSourceRepository(ctx.db, sourceId, repoId);
  }
}

// ── Phase 2: INDI records ──────────────────────────────────────────────────

export async function phaseIndividuals(ctx: ImportContext): Promise<void> {
  // Two-pass collect-then-flush. The Tauri build pays ~1 ms IPC per
  // singular createPerson / addPersonName / addPersonIdentifier; for a
  // 22k-person Holger import that's 5+ minutes of pure IPC. We pre-parse
  // every INDI into batched-INSERT buffers, generate UUIDs in JS so
  // downstream rows can reference them, and flush in one bulk call each.
  // Pass 2 then handles per-row work that's hard to batch (event chains,
  // citations, media links, ASSO collection, tag counts).
  const indiNodes: typeof ctx.tree = [];
  for (const n of ctx.tree) if (n.tag === 'INDI' && n.xref) indiNodes.push(n);
  const total = indiNodes.length;
  if (total === 0) return;

  type ParsedName = {
    id: string;
    nameNode: typeof ctx.tree[number];
    given_name: string | null;
    surname: string | null;
    name_prefix: string | null;
    name_suffix: string | null;
    name_type: 'birth' | 'married' | 'name_change' | 'alias' | 'aka';
    patronymic_base: string | null;
    preferred_name: string | null;
    nickname: string | null;
    name_qualifier: string | null;
    date_from: string | null;
    date_to: string | null;
  };

  const personRows: Array<{ id: string; sex: 'M' | 'F' | 'U'; notes: string }> = [];
  const nameRows: Array<{
    id: string; person_id: string;
    given_name: string | null; surname: string | null;
    name_prefix: string | null; name_suffix: string | null;
    name_type: ParsedName['name_type'];
    patronymic_base: string | null;
    preferred_name: string | null;
    nickname: string | null;
    name_qualifier: string | null;
    date_from: string | null;
    date_to: string | null;
  }> = [];
  const identifierRows: Array<{
    person_id: string;
    identifier_type: PersonIdentifier['identifier_type'];
    identifier_value: string;
  }> = [];
  const parsedNamesByXref = new Map<string, ParsedName[]>();

  // ─── Pass 1: parse every INDI; populate ctx.personMap up-front ──────────
  ctx.options?.onProgress?.(`Importing persons (0 / ${total})`);
  for (let i = 0; i < indiNodes.length; i++) {
    const node = indiNodes[i];
    const xref = node.xref!;
    const personId = uuid();
    ctx.personMap.set(xref, personId);
    if (ctx.isHolger && ctx.firstPersonId === null) ctx.firstPersonId = personId;

    // Normalize SEX to schema's M / F / U vocabulary. Per GEDCOM 5.5.1 only
    // M/F/U are valid; GEDCOM 7.0 adds X / N; some files emit bare or lowercase.
    // Anything outside M/F maps to U so the importer doesn't crash on the
    // schema's CHECK constraint. Lossy — disclosed via skippedTags below.
    const rawSex = getChild(node, 'SEX')?.value?.trim().toUpperCase() ?? '';
    const sex: 'M' | 'F' | 'U' = rawSex === 'M' ? 'M' : rawSex === 'F' ? 'F' : 'U';
    if (rawSex && rawSex !== 'M' && rawSex !== 'F' && rawSex !== 'U') {
      ctx.skippedTags.set(`SEX=${rawSex}`, (ctx.skippedTags.get(`SEX=${rawSex}`) ?? 0) + 1);
    }

    let notes = resolveNote(node, ctx.noteMap);
    if (ctx.isGenney) {
      const yHaplo = getChild(node, '_YHAPLOGROUP')?.value;
      const mHaplo = getChild(node, '_MHAPLOGROUP')?.value;
      if (yHaplo) notes = notes ? `${notes}\nY-DNA: ${yHaplo}` : `Y-DNA: ${yHaplo}`;
      if (mHaplo) notes = notes ? `${notes}\nmtDNA: ${mHaplo}` : `mtDNA: ${mHaplo}`;
    }
    if (ctx.isHolger) {
      const extras: string[] = [];
      for (const child of node.children) {
        if (child.tag === 'REMA' || child.tag === 'MISC') {
          const val = child.value?.trim();
          if (val) extras.push(val);
        }
      }
      if (extras.length > 0) {
        ctx.holgerRemarkCount += extras.length;
        const extra = extras.join('\n');
        notes = notes ? `${notes}\n\n${extra}` : extra;
      }
    }
    personRows.push({ id: personId, sex, notes });

    if (ctx.isHolger) {
      const subtypeMap = parseHolgerAdoptionSubtypes(node);
      if (subtypeMap.size > 0) ctx.holgerAdoptionMap.set(xref, subtypeMap);
    }

    // Names — parse + assign UUIDs now so name-level citations in Pass 2
    // can reference them.
    const nameNodes = getChildren(node, 'NAME');
    if (nameNodes.length === 0) ctx.namelessPersonCount += 1;
    const parsedNames: ParsedName[] = [];
    for (const nameNode of nameNodes) {
      const raw = nameNode.value ?? '';
      const surnameMatch = raw.match(/^(.*?)\/(.+?)\/(.*)$/);
      let given = (surnameMatch ? surnameMatch[1] : raw).trim() || null;
      const surname = surnameMatch ? surnameMatch[2].trim() || null : null;
      const prefix = getChild(nameNode, 'NPFX')?.value ?? null;
      const suffix = getChild(nameNode, 'NSFX')?.value ?? null;
      const rawType = getChild(nameNode, 'TYPE')?.value?.toUpperCase();
      const name_type: ParsedName['name_type'] =
        rawType === 'MARRIED' ? 'married'
        : rawType === 'NAME_CHANGE' ? 'name_change'
        : rawType === 'AKA' ? 'aka'
        : rawType === 'ALIAS' ? 'alias'
        : 'birth';

      const explicitPatr = getChild(nameNode, '_PATR')?.value ?? null;
      const patronymic_base = explicitPatr ?? (ctx.isGenney ? getPatronymicBase(surname) : null);

      // Preferred name (tilltalsnamn) marked with * (Genney) or ! (Holger).
      const nickname = getChild(nameNode, 'NICK')?.value ?? null;
      let preferred_name: string | null = null;
      const markerMatch = given ? given.match(/[*!]/) : null;
      if (given && markerMatch) {
        const markerIdx = markerMatch.index!;
        const beforeMarker = given.slice(0, markerIdx).trimEnd();
        const afterMarker = given.slice(markerIdx + 1).trimStart();
        const tokens = beforeMarker.split(/\s+/);
        preferred_name = tokens[tokens.length - 1] ?? null;
        given = (beforeMarker + (afterMarker ? ' ' + afterMarker : '')).replace(/\s+/g, ' ').trim() || null;
      }
      if (ctx.isHolger && !preferred_name) {
        const fore = getChild(nameNode, 'FORE')?.value ?? null;
        if (fore) preferred_name = fore;
      }

      const nameId = uuid();
      const parsed: ParsedName = {
        id: nameId,
        nameNode,
        given_name: given,
        surname,
        name_prefix: prefix,
        name_suffix: suffix,
        name_type,
        patronymic_base,
        preferred_name,
        nickname,
        name_qualifier: (getChild(nameNode, '_NQUAL')?.value ?? null) as string | null,
        date_from: getChild(nameNode, '_DATE_FROM')?.value ?? null,
        date_to: getChild(nameNode, '_DATE_TO')?.value ?? null,
      };
      parsedNames.push(parsed);
      nameRows.push({
        id: nameId,
        person_id: personId,
        given_name: parsed.given_name,
        surname: parsed.surname,
        name_prefix: parsed.name_prefix,
        name_suffix: parsed.name_suffix,
        name_type: parsed.name_type,
        patronymic_base: parsed.patronymic_base,
        preferred_name: parsed.preferred_name,
        nickname: parsed.nickname,
        name_qualifier: parsed.name_qualifier,
        date_from: parsed.date_from,
        date_to: parsed.date_to,
      });
    }
    parsedNamesByXref.set(xref, parsedNames);

    // Identifiers — REFN with TYPE → typed; plain REFN → 'refn'.
    for (const refn of getChildren(node, 'REFN')) {
      if (!refn.value) continue;
      const ltype = (getChild(refn, 'TYPE')?.value?.trim() ?? '').toLowerCase();
      const identifier_type: PersonIdentifier['identifier_type'] =
        ltype === 'familysearch' ? 'familysearch'
        : ltype === 'ancestry' ? 'ancestry'
        : ltype === 'riksarkivet' ? 'riksarkivet'
        : ltype === 'personnummer' ? 'personnummer'
        : ltype === 'other' ? 'other'
        : 'refn';
      identifierRows.push({ person_id: personId, identifier_type, identifier_value: refn.value });
    }
    const rin = getChild(node, 'RIN');
    if (rin?.value) identifierRows.push({ person_id: personId, identifier_type: 'rin', identifier_value: rin.value });
    // _UID (GEDCOM 5.5 non-standard, ubiquitous) and bare UID (GEDCOM 7.0 standard).
    const uidNode = getChild(node, '_UID') ?? getChild(node, 'UID');
    if (uidNode?.value) identifierRows.push({ person_id: personId, identifier_type: 'uid', identifier_value: uidNode.value });
    const afn = getChild(node, 'AFN');
    if (afn?.value) identifierRows.push({ person_id: personId, identifier_type: 'afn', identifier_value: afn.value });
    // SSN — Privacy-sensitive but the Prime Directive says preserve authored data.
    const ssn = getChild(node, 'SSN');
    if (ssn?.value) identifierRows.push({ person_id: personId, identifier_type: 'ssn', identifier_value: ssn.value });
    const fsid = getChild(node, 'FSID');
    if (fsid?.value) identifierRows.push({ person_id: personId, identifier_type: 'familysearch', identifier_value: fsid.value });
    // Legacy custom tags — read for backward compat with old exports.
    const fsi = getChild(node, '_FSI');
    if (fsi?.value) identifierRows.push({ person_id: personId, identifier_type: 'familysearch', identifier_value: fsi.value });
    const anid = getChild(node, '_ANID');
    if (anid?.value) identifierRows.push({ person_id: personId, identifier_type: 'ancestry', identifier_value: anid.value });
    const raid = getChild(node, '_RAID');
    if (raid?.value) identifierRows.push({ person_id: personId, identifier_type: 'riksarkivet', identifier_value: raid.value });
    const pnummer = getChild(node, '_PNUMMER');
    if (pnummer?.value) identifierRows.push({ person_id: personId, identifier_type: 'personnummer', identifier_value: pnummer.value });

    if ((i + 1) % 200 === 0 || (i + 1) === total) {
      ctx.options?.onProgress?.(`Importing persons (${i + 1} / ${total})`);
    }
  }

  // ─── Flush: persons → names → identifiers (FK topo order) ──────────────
  ctx.options?.onProgress?.(`Writing ${personRows.length} persons (1 / ${total})…`);
  await bulkCreatePersons(ctx.db, personRows);
  ctx.options?.onProgress?.(`Writing ${nameRows.length} names…`);
  await bulkAddPersonNames(ctx.db, nameRows);
  if (identifierRows.length > 0) {
    ctx.options?.onProgress?.(`Writing ${identifierRows.length} identifiers…`);
    await bulkAddPersonIdentifiers(ctx.db, identifierRows);
  }

  // ─── Pass 2: events, citations, ASSO, media, tag counts ────────────────
  // Buffers for batched-INSERT at end of pass. `collectEventNode` returns
  // event + citation + event-media-link specs with pre-allocated UUIDs and
  // does zero IPC for the row inserts; we flush each buffer once at the
  // bottom. For a 22k-person Holger import this collapses ~200k per-event
  // IPC calls (events + their citations + their event-level media links)
  // into ~4 bulk calls total.
  const eventRowBuffer: EventCollectResult['eventRow'][] = [];
  const citationBuffer: Array<{
    source_id: string;
    event_id?: string | null;
    person_id?: string | null;
    relationship_id?: string | null;
    place_id?: string | null;
    person_name_id?: string | null;
    page?: string;
    confidence?: number;
    transcription?: string;
    notes?: string;
    date_accessed?: string;
  }> = [];
  const participantBuffer: Array<{ event_id: string; person_id: string; role?: 'primary' }> = [];
  const mediaLinkBuffer: Array<{
    media_id: string;
    entity_type: 'person' | 'event' | 'relationship' | 'place' | 'source';
    entity_id: string;
    sort_order: number;
  }> = [];

  const LDS_TAGS = new Set(['BAPL', 'SLGC', 'CONL', 'ENDL', 'SLGS']);
  ctx.options?.onProgress?.(`Importing person events (0 / ${total})`);
  for (let i = 0; i < indiNodes.length; i++) {
    const node = indiNodes[i];
    const xref = node.xref!;
    const personId = ctx.personMap.get(xref)!;
    const parsedNames = parsedNamesByXref.get(xref) ?? [];

    // Name-level citations — buffered for bulk insert. DATA/TEXT carries
    // the transcription on event-level and name-level cites.
    for (const pn of parsedNames) {
      for (const sour of getChildren(pn.nameNode, 'SOUR')) {
        const srcId = ctx.sourceMap.get(sour.value) ?? ctx.sourceMap.get(sour.xref ?? '');
        if (!srcId) continue;
        const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
        const page = getChild(sour, 'PAGE')?.value ?? '';
        const citNotes = getChild(sour, 'NOTE')?.value ?? '';
        const date_accessed = getChild(sour, '_ACCESSED')?.value ?? '';
        const dataNode = getChild(sour, 'DATA');
        const transcription = dataNode ? (getChild(dataNode, 'TEXT')?.value ?? '') : '';
        citationBuffer.push({
          source_id: srcId,
          person_name_id: pn.id,
          page,
          confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
          notes: citNotes || undefined,
          transcription: transcription || undefined,
          date_accessed: date_accessed || undefined,
        });
      }
    }

    // Person events — buffer the event row, its citations, its media-link
    // rows, plus a participant row tying the event to this person. All four
    // buffers flush in one bulk INSERT each at the end of the pass.
    for (const [gedTag, appType] of Object.entries(PERSON_EVENT_TAGS)) {
      for (const evNode of getChildren(node, gedTag)) {
        const collected = await collectEventNode(ctx.db, evNode, appType, ctx.sourceMap, {}, ctx.resolvePlaceFn, ctx.placeIdMap, ctx.eventIdMap, ctx.noteMap, ctx.objeMap, ctx.options, ctx.inlineMediaMap);
        eventRowBuffer.push(collected.eventRow);
        citationBuffer.push(...collected.citationRows);
        mediaLinkBuffer.push(...collected.mediaLinkRows);
        participantBuffer.push({ event_id: collected.eventRow.id, person_id: personId, role: 'primary' });
      }
    }

    // Person-level citations (SOUR directly on INDI, not under an event).
    // _TRANS carries the transcription for non-event/non-name hosts in v7.0;
    // multi-line CONT continuation is unwrapped by the parser.
    for (const sour of getChildren(node, 'SOUR')) {
      const srcId = ctx.sourceMap.get(sour.value) ?? ctx.sourceMap.get(sour.xref ?? '');
      if (srcId) {
        const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
        const page = getChild(sour, 'PAGE')?.value ?? '';
        const citNotes = getChild(sour, 'NOTE')?.value ?? '';
        const date_accessed = getChild(sour, '_ACCESSED')?.value ?? '';
        const transcription = getChild(sour, '_TRANS')?.value ?? '';
        citationBuffer.push({
          source_id: srcId,
          person_id: personId,
          page,
          confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
          notes: citNotes || undefined,
          transcription: transcription || undefined,
          date_accessed: date_accessed || undefined,
        });
      }
    }

    // Collect ASSO blocks for Phase 4.
    for (const assoNode of getChildren(node, 'ASSO')) {
      ctx.assoData.push({ personId, assoNode });
    }

    // Genney: _GRP → group memberships.
    if (ctx.isGenney) {
      for (const grpNode of getChildren(node, '_GRP')) {
        const groupId = ctx.grpMap.get(grpNode.value ?? '');
        if (groupId) {
          try { await addGroupLink(ctx.db, groupId, 'person', personId); } catch { /* ignore duplicate */ }
        }
      }
    }

    // Person-level media — same buffering as participants: importObjeNode
    // is now Map.get on the inline-media-cache, and the addMediaLink calls
    // get bulk-flushed at the end of Pass 2.
    let personMediaOrder = 0;
    for (const objeNode of getChildren(node, 'OBJE')) {
      const mediaId = await importObjeNode(ctx.db, objeNode, ctx.objeMap, ctx.options, ctx.inlineMediaMap);
      if (mediaId) {
        mediaLinkBuffer.push({ media_id: mediaId, entity_type: 'person', entity_id: personId, sort_order: personMediaOrder });
        personMediaOrder++;
      }
    }

    // Tag counts — LDS / TRAN / NO / unrecognised top-level INDI children.
    for (const child of node.children) {
      if (LDS_TAGS.has(child.tag)) ctx.ldsCount++;
      if (child.tag === 'TRAN') ctx.tranCount++;
      for (const grandchild of child.children) {
        if (grandchild.tag === 'TRAN') ctx.tranCount++;
      }
      if (child.tag === 'NO') ctx.noCount++;
      if (!KNOWN_INDI_TAGS.has(child.tag)) {
        ctx.skippedTags.set(child.tag, (ctx.skippedTags.get(child.tag) ?? 0) + 1);
      }
    }

    if ((i + 1) % 200 === 0 || (i + 1) === total) {
      ctx.options?.onProgress?.(`Importing person events (${i + 1} / ${total})`);
    }
  }

  // Bulk-flush the buffers built during Pass 2. FK topo order:
  //   events → citations (FK event_id) + participants (FK event_id) + media_links (FK by event_id on link rows).
  if (eventRowBuffer.length > 0) {
    ctx.options?.onProgress?.(`Skriver ${eventRowBuffer.length} händelser (1 / 1)…`);
    await bulkCreateEvents(ctx.db, eventRowBuffer);
  }
  if (citationBuffer.length > 0) {
    ctx.options?.onProgress?.(`Skriver ${citationBuffer.length} källhänvisningar (1 / 1)…`);
    await bulkCreateCitations(ctx.db, citationBuffer);
  }
  if (participantBuffer.length > 0) {
    ctx.options?.onProgress?.(`Skriver ${participantBuffer.length} deltagare (1 / 1)…`);
    await bulkAddEventParticipants(ctx.db, participantBuffer);
  }
  if (mediaLinkBuffer.length > 0) {
    ctx.options?.onProgress?.(`Skriver ${mediaLinkBuffer.length} medialänkar (1 / 1)…`);
    await bulkAddMediaLinks(ctx.db, mediaLinkBuffer);
  }
}

// ── Phase 3: FAM records ───────────────────────────────────────────────────

export async function phaseFamilies(ctx: ImportContext): Promise<void> {
  // Collect-then-flush: same shape as phaseIndividuals. Each FAM produces:
  //   - 1 couple row (relationships, type='couple')
  //   - up to N family events (each via collectEventNode → event +
  //     citations + media-links)
  //   - 1-2 parent_child rows per CHIL
  //   - per-FAM citations + media links
  // The per-FAM IPC count was relationship + (events × ~3 IPC each) +
  // (2 × children) + sour + obje per FAM — for 10k families with ~3 events
  // each that's ~50-100k IPC under Tauri. All collapsed to a small constant
  // by the bulk flushes at the end.
  const famNodes: typeof ctx.tree = [];
  for (const n of ctx.tree) if (n.tag === 'FAM') famNodes.push(n);
  const famTotal = famNodes.length;
  if (famTotal === 0) return;
  ctx.options?.onProgress?.(`Importerar familjer (0 / ${famTotal})`);

  const coupleRows: Array<{
    id: string; type: 'couple'; person1_id: string | null; person2_id: string | null;
    subtype: string; notes: string;
  }> = [];
  const parentChildRows: Array<{
    type: 'parent_child'; person1_id: string; person2_id: string; subtype: string;
  }> = [];
  const eventRowBuffer: EventCollectResult['eventRow'][] = [];
  const citationBuffer: Array<{
    source_id: string;
    event_id?: string | null;
    person_id?: string | null;
    relationship_id?: string | null;
    place_id?: string | null;
    person_name_id?: string | null;
    page?: string;
    confidence?: number;
    transcription?: string;
    notes?: string;
    date_accessed?: string;
  }> = [];
  const mediaLinkBuffer: Array<{
    media_id: string;
    entity_type: 'relationship' | 'event' | 'person' | 'place' | 'source';
    entity_id: string;
    sort_order: number;
  }> = [];
  // _RELNOTES updates the couple row after-the-fact. We can fold it into the
  // initial INSERT instead — collect the notes value and stamp it on the row.
  // No extra UPDATE pass needed.

  for (let i = 0; i < famNodes.length; i++) {
    const node = famNodes[i];
    const husbXref = getChild(node, 'HUSB')?.value;
    const wifeXref = getChild(node, 'WIFE')?.value;
    const person1Id = husbXref ? ctx.personMap.get(husbXref) ?? null : null;
    const person2Id = wifeXref ? ctx.personMap.get(wifeXref) ?? null : null;

    const extSubtype = getChild(node, '_SUBTYPE')?.value;
    const hasMarr = getChildren(node, 'MARR').length > 0;
    let coupleSubtype: string;
    if (extSubtype) {
      coupleSubtype = extSubtype;
    } else if (hasMarr) {
      coupleSubtype = 'marriage';
    } else if (ctx.isHolger) {
      const engaNodes = getChildren(node, 'ENGA');
      coupleSubtype = engaNodes.length > 0 ? holgerEngaSubtype(engaNodes[0]) : 'unknown';
    } else {
      coupleSubtype = 'unknown';
    }
    const coupleId = uuid();
    const relnotes = getChild(node, '_RELNOTES')?.value ?? '';
    coupleRows.push({
      id: coupleId,
      type: 'couple',
      person1_id: person1Id,
      person2_id: person2Id,
      subtype: coupleSubtype,
      notes: relnotes,
    });

    // Family events.
    for (const [gedTag, appType] of Object.entries(FAMILY_EVENT_TAGS)) {
      if (ctx.isHolger && gedTag === 'ENGA' && !hasMarr) continue;
      for (const evNode of getChildren(node, gedTag)) {
        const collected = await collectEventNode(ctx.db, evNode, appType, ctx.sourceMap, { relationship_id: coupleId }, ctx.resolvePlaceFn, ctx.placeIdMap, ctx.eventIdMap, ctx.noteMap, ctx.objeMap, ctx.options, ctx.inlineMediaMap);
        eventRowBuffer.push(collected.eventRow);
        citationBuffer.push(...collected.citationRows);
        mediaLinkBuffer.push(...collected.mediaLinkRows);
      }
    }

    // Children → parent_child rows.
    for (const chil of getChildren(node, 'CHIL')) {
      const childId = ctx.personMap.get(chil.value);
      if (!childId) continue;
      const pedi = getChild(chil, 'PEDI')?.value;
      let childSubtype = pedi ? (pedi === 'birth' ? 'biological' : pedi) : 'biological';
      if (ctx.isHolger) {
        const adopSubtype = ctx.holgerAdoptionMap.get(chil.value)?.get(node.xref ?? '');
        if (adopSubtype) childSubtype = adopSubtype;
      }
      if (person1Id) parentChildRows.push({ type: 'parent_child', person1_id: person1Id, person2_id: childId, subtype: childSubtype });
      if (person2Id) parentChildRows.push({ type: 'parent_child', person1_id: person2Id, person2_id: childId, subtype: childSubtype });
    }

    // Family-level citations (SOUR directly on FAM).
    for (const sour of getChildren(node, 'SOUR')) {
      const srcId = ctx.sourceMap.get(sour.value) ?? ctx.sourceMap.get(sour.xref ?? '');
      if (srcId) {
        const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
        const page = getChild(sour, 'PAGE')?.value ?? '';
        const citNotes = getChild(sour, 'NOTE')?.value ?? '';
        const date_accessed = getChild(sour, '_ACCESSED')?.value ?? '';
        const transcription = getChild(sour, '_TRANS')?.value ?? '';
        citationBuffer.push({
          source_id: srcId,
          relationship_id: coupleId,
          page,
          confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
          notes: citNotes || undefined,
          transcription: transcription || undefined,
          date_accessed: date_accessed || undefined,
        });
      }
    }

    // Family-level media.
    let relMediaOrder = 0;
    for (const objeNode of getChildren(node, 'OBJE')) {
      const mediaId = await importObjeNode(ctx.db, objeNode, ctx.objeMap, ctx.options, ctx.inlineMediaMap);
      if (mediaId) {
        mediaLinkBuffer.push({ media_id: mediaId, entity_type: 'relationship', entity_id: coupleId, sort_order: relMediaOrder });
        relMediaOrder++;
      }
    }

    // Count unrecognised top-level FAM tags.
    for (const child of node.children) {
      if (!KNOWN_FAM_TAGS.has(child.tag)) {
        ctx.skippedTags.set(child.tag, (ctx.skippedTags.get(child.tag) ?? 0) + 1);
      }
    }

    if ((i + 1) % 200 === 0 || (i + 1) === famTotal) {
      ctx.options?.onProgress?.(`Importerar familjer (${i + 1} / ${famTotal})`);
    }
  }

  // Bulk-flush. FK topo order:
  //   relationships (couples + parent_child) → events → citations / media_links.
  if (coupleRows.length > 0) {
    ctx.options?.onProgress?.(`Skriver ${coupleRows.length} familjer (1 / 1)…`);
    await bulkCreateRelationships(ctx.db, coupleRows);
  }
  if (parentChildRows.length > 0) {
    ctx.options?.onProgress?.(`Skriver ${parentChildRows.length} föräldra/barn-länkar (1 / 1)…`);
    await bulkCreateRelationships(ctx.db, parentChildRows);
  }
  if (eventRowBuffer.length > 0) {
    ctx.options?.onProgress?.(`Skriver ${eventRowBuffer.length} familjehändelser (1 / 1)…`);
    await bulkCreateEvents(ctx.db, eventRowBuffer);
  }
  if (citationBuffer.length > 0) {
    ctx.options?.onProgress?.(`Skriver ${citationBuffer.length} familje-källhänvisningar (1 / 1)…`);
    await bulkCreateCitations(ctx.db, citationBuffer);
  }
  if (mediaLinkBuffer.length > 0) {
    ctx.options?.onProgress?.(`Skriver ${mediaLinkBuffer.length} familje-medialänkar (1 / 1)…`);
    await bulkAddMediaLinks(ctx.db, mediaLinkBuffer);
  }
}

// ── Phase 4: Post-process ASSO blocks ──────────────────────────────────────
// phaseAsso lives in ./phases/asso and is re-exported here for callers that
// still import from './phases'.
export { phaseAsso } from './phases/asso';

// ── Phase 5: _PLAC records for place-level citations ───────────────────────
// phasePlaceCitations lives in ./phases/place-citations and is re-exported here
// for callers that still import from './phases'.
export { phasePlaceCitations } from './phases/place-citations';

// ── Phase 5b: _GROUP records (groups + group_links) ────────────────────────
//
// Counterpart to the exporter's _GROUP / _GROUP_LINK emission. Runs AFTER
// phaseIndividuals (populates personMap), phaseObje (populates objeMap), and
// phasePlaceCitations (populates placeIdMap for places carried by _PLAC
// records) so that every _GROUP_LINK REF can dereference into the new DB.
//
// _GROUP_LINK shape:
//   1 _GROUP_LINK
//   2 TYPE person|place|media
//   2 REF @I042@   (or @P017@, @M005@)
//
// Resolution rules:
//   - person → personMap (built by phaseIndividuals from INDI xrefs).
//   - place  → walk all _PLAC top-level records here to build a local xref→
//              place_id map (placeIdMap stores oldPlaceId → newPlaceId, NOT
//              xref → newPlaceId — different lookup).
//   - media  → objeMap (built by phaseObje from OBJE xrefs).
//
// Unresolved REFs are reported via ctx.warnings rather than silently dropped,
// so a corrupted GEDCOM (dangling xref) doesn't lose the user's group
// membership without disclosure. See CLAUDE.md "Round-Trip Fidelity".
export async function phaseGroupRecords(ctx: ImportContext): Promise<void> {
  // Build a local xref → DB place_id map by walking every _PLAC record.
  // The exporter writes a 1 _PLAC_ID <uuid> sub-tag on each _PLAC record;
  // phasePlaceCitations (which has already run by this point) has populated
  // placeIdMap[oldPlaceId] = currentDbPlaceId for every _PLAC record that
  // mentions a `_PLAC_ID`. We translate that into xref → DB-place-id here.
  const placeXrefToId = new Map<string, string>();
  for (const node of ctx.tree) {
    if (node.tag !== '_PLAC' || !node.xref) continue;
    const oldPlaceId = getChild(node, '_PLAC_ID')?.value;
    if (!oldPlaceId) continue;
    // Try the placeIdMap first (set by phasePlaceCitations); fall back to a
    // direct lookup against the source UUID for the rare case where the
    // place existed in a same-DB reimport and the map skipped it.
    const dbPlaceId = ctx.placeIdMap.get(oldPlaceId) ?? oldPlaceId;
    if (await getPlace(ctx.db, dbPlaceId)) {
      placeXrefToId.set(node.xref, dbPlaceId);
    } else {
      // Place wasn't created yet (no citation seeded it AND _GROUP wants it).
      // Create from NAME fallback now so the group link can resolve.
      const placeName = getChild(node, 'NAME')?.value;
      if (placeName) {
        const place = await ctx.resolvePlaceFn(ctx.db, placeName);
        ctx.placeIdMap.set(oldPlaceId, place.id);
        placeXrefToId.set(node.xref, place.id);
      }
    }
  }

  for (const node of ctx.tree) {
    if (node.tag !== '_GROUP' || !node.xref) continue;
    const name = getChild(node, 'NAME')?.value ?? '';
    const notes = resolveNote(node, ctx.noteMap) || undefined;
    const group = await createGroup(ctx.db, { name, notes });

    let linkPosition = 0;
    for (const linkNode of getChildren(node, '_GROUP_LINK')) {
      const type = getChild(linkNode, 'TYPE')?.value ?? '';
      const ref = getChild(linkNode, 'REF')?.value ?? '';
      if (!type || !ref) continue;

      let entityId: string | undefined;
      let entityType: 'person' | 'place' | 'media' | null = null;
      if (type === 'person') {
        entityId = ctx.personMap.get(ref);
        entityType = 'person';
      } else if (type === 'place') {
        entityId = placeXrefToId.get(ref);
        entityType = 'place';
      } else if (type === 'media') {
        entityId = ctx.objeMap.get(ref);
        entityType = 'media';
      }

      if (!entityId || !entityType) {
        ctx.groupLinkWarnings.push(
          `_GROUP_LINK in group "${name}" has unresolved REF ${ref} (type=${type || '?'})`,
        );
        continue;
      }
      try {
        await addGroupLink(ctx.db, group.id, entityType, entityId);
        linkPosition++;
      } catch {
        // Duplicate row (UNIQUE on group_id, entity_type, entity_id) — ignore.
      }
    }
    void linkPosition; // sort_order is assigned by addGroupLink (per-type MAX+1)
  }
}

// ── Phase 6: _TODO records (Genney only) ───────────────────────────────────
// phaseTodos lives in ./phases/todos and is re-exported here for callers that
// still import from './phases'.
export { phaseTodos } from './phases/todos';

// ── SUBM: collect submitter name + contact info ───────────────────────────
//
// SUBM identifies the submitter — the genealogist filing the file. The
// exporter writes our researcher_* settings out as a single SUBM record with
// NAME / ADDR / PHON / EMAIL; the importer mirrors that.
//
// • NAME values feed person-matching to set default_person_id (tree subject).
// • The first SUBM that has a NAME also contributes contact info to populate
//   researcher_address / researcher_phone / researcher_email at end-of-import
//   (only if those settings are currently empty — see import-core.ts).

export async function phaseSubmitters(ctx: ImportContext): Promise<void> {
  for (const node of ctx.tree) {
    if (node.tag !== 'SUBM') continue;
    const name = getChild(node, 'NAME')?.value;
    if (!name) continue;
    ctx.submitterNames.push(name.trim());
    if (!ctx.submitterContact) {
      // Parser already joined CONT lines into ADDR's value with '\n'.
      const addr = getChild(node, 'ADDR')?.value?.trim();
      const phone = getChild(node, 'PHON')?.value?.trim();
      const email = getChild(node, 'EMAIL')?.value?.trim();
      ctx.submitterContact = {
        address: addr || undefined,
        phone: phone || undefined,
        email: email || undefined,
      };
    }
  }
}
