// ── Phase 2: INDI records ──────────────────────────────────────────────────

import { v4 as uuid } from 'uuid';
import type { PersonIdentifier } from '../../../api/types';
import { bulkCreatePersons, bulkAddPersonNames, bulkAddPersonIdentifiers } from '../../../api/persons';
import { bulkAddEventParticipants } from '../../../api/relationships';
import { bulkCreateCitations } from '../../../api/sources';
import { bulkAddExternalIdentifiers, type ExternalIdentifierInput } from '../../../api/external_identifiers';
import { bulkAddMediaLinks } from '../../../api/media';
import { bulkCreateEvents } from '../../../api/events';
import { addGroupLink } from '../../../api/groups';
import { getPatronymicBase } from '../profiles/genney';
import { parseHolgerAdoptionSubtypes } from '../profiles/holger';
import type { ImportContext } from '../import-types';
import { getChild, getChildren, resolveNote } from '../node-utils';
import { importObjeNode } from '../obje-importer';
import { collectEventNode } from '../event-importer';
import type { EventCollectResult } from '../event-importer';
import { markConsumed } from '../tag-accounting';
import { PERSON_EVENT_TAGS } from './shared';

const KNOWN_INDI_TAGS = new Set([
  'NAME', 'SEX', '_LIVING', 'NOTE', 'SOUR', 'ASSO', 'REFN', 'RIN',
  'AFN', 'SSN', 'FSID',
  '_UID', 'UID', '_FSI', '_ANID', '_RAID', '_PNUMMER', '_YHAPLOGROUP', '_MHAPLOGROUP', '_GRP',
  'FAMC', 'FAMS', 'CHAN',
  // PERSON_EVENT_TAGS keys:
  'BIRT', 'DEAT', 'CHR', 'BURI', 'BAPM', 'CONF', 'OCCU', 'RESI', 'EDUC',
  'EMIG', 'IMMI', 'NATU', 'CENS', 'PROB', 'WILL', 'GRAD', 'RETI', 'ENGA', 'ADOP', 'EVEN',
  'CREM', 'BARM', 'BASM', 'ORDN', '_MILT',
  'TITL', '_TITLE', 'RELI', 'DSCR', 'FACT', 'OBJE',
  // T06: NO X negative-assertion blocks — imported by phaseNegations.
  'NO',
  // Holger custom tags imported as notes:
  'REMA', 'MISC',
]);

export async function phaseIndividuals(ctx: ImportContext): Promise<void> {
  // Two-pass collect-then-flush. The Tauri build pays ~1 ms IPC per
  // singular createPerson / addPersonName / addPersonIdentifier; for a
  // 22k-person Holger import that's 5+ minutes of pure IPC. We pre-parse
  // every INDI into batched-INSERT buffers, generate UUIDs in JS so
  // downstream rows can reference them, and flush in one bulk call each.
  // Pass 2 then handles per-row work that's hard to batch (event chains,
  // citations, media links, ASSO collection, tag counts).
  const indiNodes: typeof ctx.tree = [];
  for (const n of ctx.tree) if (n.tag === 'INDI' && n.xref) { markConsumed(n); indiNodes.push(n); }
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

    // Normalize SEX to schema's M / F / U / X vocabulary. Per GEDCOM 5.5.1
    // only M/F/U are valid; GEDCOM 7.0 adds X (intersex). T09: X preserved
    // lossless on 7.0 round-trip; the schema CHECK already allows X.
    // Anything outside M/F/X maps to U; lossy — disclosed via skippedTags.
    const rawSex = getChild(node, 'SEX')?.value?.trim().toUpperCase() ?? '';
    const sex: 'M' | 'F' | 'U' | 'X' =
      rawSex === 'M' ? 'M' : rawSex === 'F' ? 'F' : rawSex === 'X' ? 'X' : 'U';
    if (rawSex && rawSex !== 'M' && rawSex !== 'F' && rawSex !== 'U' && rawSex !== 'X') {
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
          markConsumed(child);
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
    id?: string;
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
  // Citation-level ArkivDigital image pointers collected alongside the
  // citations they belong to, flushed once for the whole pass.
  const citationExternalIdBuffer: ExternalIdentifierInput[] = [];
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
        const citationId = uuid();
        citationBuffer.push({
          id: citationId,
          source_id: srcId,
          person_name_id: pn.id,
          page,
          confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
          notes: citNotes || undefined,
          transcription: transcription || undefined,
          date_accessed: date_accessed || undefined,
        });
        // ArkivDigital's image pointer on this citation. Zero occurrences
        // across the four real exports at this host, but `*.SOUR._AID` is a
        // wildcard declaration: reading it on one host and not the others
        // would re-open the silent drop.
        const imageAid = getChild(sour, '_AID')?.value?.trim();
        if (imageAid) {
          citationExternalIdBuffer.push({
            entity_type: 'citation', entity_id: citationId,
            system: 'arkivdigital.image', value: imageAid,
          });
        }
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
        citationExternalIdBuffer.push(...collected.citationExternalIds);
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
        const citationId = uuid();
        citationBuffer.push({
          id: citationId,
          source_id: srcId,
          person_id: personId,
          page,
          confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
          notes: citNotes || undefined,
          transcription: transcription || undefined,
          date_accessed: date_accessed || undefined,
        });
        // ArkivDigital's image pointer on this citation. Zero occurrences
        // across the four real exports at this host, but `*.SOUR._AID` is a
        // wildcard declaration: reading it on one host and not the others
        // would re-open the silent drop.
        const imageAid = getChild(sour, '_AID')?.value?.trim();
        if (imageAid) {
          citationExternalIdBuffer.push({
            entity_type: 'citation', entity_id: citationId,
            system: 'arkivdigital.image', value: imageAid,
          });
        }
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
          try {
            await addGroupLink(ctx.db, groupId, 'person', personId);
          } catch (err) {
            // Duplicate membership is expected wire input; anything else surfaces.
            if (!String(err).includes('UNIQUE constraint failed')) throw err;
          }
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
      // T06: NO blocks are now imported by phaseNegations (which is the
      // authoritative counter source). Skip the legacy ctx.noCount++ here
      // to avoid double-counting.
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
  // One bulk call for the whole pass — `.claude/rules/performance.md`, never
  // per citation.
  if (citationExternalIdBuffer.length > 0) {
    await bulkAddExternalIdentifiers(ctx.db, citationExternalIdBuffer);
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
