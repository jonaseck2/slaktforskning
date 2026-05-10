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

import { basename } from 'path';
import type { Relationship, RelationshipType, EventParticipantRole } from '../../api/types';
import { createPerson, addPersonName, addPersonIdentifier } from '../../api/persons';
import { createRelationship, updateRelationship, addEventParticipant, getRelationshipsOfPerson } from '../../api/relationships';
import { createSource, createCitation } from '../../api/sources';
import { createMedia, addMediaLink } from '../../api/media';
import { getPlace } from '../../api/places';
import { createRepository, linkSourceRepository } from '../../api/repositories';
import { createGroup, addGroupLink } from '../../api/groups';
import { createResearchTask, addTaskLink } from '../../api/research_tasks';
import { getPatronymicBase } from './profiles/genney';
import { holgerEngaSubtype, parseHolgerAdoptionSubtypes } from './profiles/holger';
import type { ImportContext } from './import-types';
import { getChild, getChildren, resolveNote } from './node-utils';
import { importObjeNode, remapHolgerMediaPath } from './obje-importer';
import { importEventNode } from './event-importer';

// ── Tag maps ────────────────────────────────────────────────────────────────

export const PERSON_EVENT_TAGS: Record<string, string> = {
  BIRT: 'birth', DEAT: 'death', CHR: 'christening', BURI: 'burial',
  // BAPM (adult/LDS baptism) collapses to christening in our model — single
  // semantic type matching Swedish "Dop". Round-tripping LDS-specific data is
  // out of scope.
  BAPM: 'christening', CONF: 'confirmation', OCCU: 'occupation',
  RESI: 'residence', EDUC: 'education', EMIG: 'emigration',
  IMMI: 'immigration', NATU: 'naturalization', CENS: 'census',
  PROB: 'probate', WILL: 'will', GRAD: 'graduation', RETI: 'retirement',
  ENGA: 'engagement', ADOP: 'adoption',
  // GEDCOM 5.5/5.5.1 standard INDI events. CREM and BARM/BASM are widely
  // emitted by FTM, RootsMagic, Heiner's torture test, etc. ORDN is GEDCOM
  // standard for ordination. _MILT is FTM's non-standard military service tag.
  CREM: 'cremation', BARM: 'bar_mitzvah', BASM: 'bas_mitzvah',
  ORDN: 'ordination', _MILT: 'military',
  // Fact-shaped tags (line value preserved in events.value, not notes).
  // TITL routes through its own event_type rather than the legacy
  // TITL→occupation conversion so round-trip preserves the original tag.
  TITL: 'title', RELI: 'religion', DSCR: 'description', FACT: 'fact',
  EVEN: 'other',
};

export const FAMILY_EVENT_TAGS: Record<string, string> = {
  MARR: 'marriage', DIV: 'divorce', CENS: 'census', ENGA: 'engagement',
  // GEDCOM 5.5/5.5.1 standard FAM events (ANUL, MARL) plus the widely-used
  // non-standard _SEPR for separation. Real-world: FTM Habsburg has 18 ANULs
  // and 7 _SEPRs that were silently dropped before.
  ANUL: 'annulment', MARL: 'marriage_license', _SEPR: 'separation',
  EVEN: 'other',
};

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

export function phaseNotes(ctx: ImportContext): void {
  for (const node of ctx.tree) {
    if (node.tag !== 'NOTE' || !node.xref) continue;
    ctx.noteMap.set(node.xref, node.value ?? '');
  }
}

// ── Phase 0.5: OBJE top-level records ──────────────────────────────────────

export function phaseObje(ctx: ImportContext): void {
  let total = 0, withFile = 0;
  for (const node of ctx.tree) {
    if (node.tag !== 'OBJE' || !node.xref) continue;
    total++;
    let file = getChild(node, 'FILE')?.value ?? '';
    if (file && ctx.options?.mediaDir) {
      file = remapHolgerMediaPath(file, ctx.options.mediaDir);
    }
    if (file) withFile++;
    const form = getChild(node, 'FORM')?.value ?? null;
    const titl = getChild(node, 'TITL')?.value ?? null;
    const note = getChild(node, 'NOTE')?.value ?? '';
    // is_missing is the inverse of "we have a file_ref"; whether that file is
    // actually on disk is decided later by consolidateMediaFolder via a single
    // recursive readdir of the dest folder. Doing it here would mean N
    // sync existsSync() calls (~6s for 12k OBJEs) on the main thread.
    const media = createMedia(ctx.db, {
      file_ref: file || null,
      title: titl || (file ? basename(file) : undefined),
      format: form,
      notes: note || undefined,
      is_printable: false,
      is_missing: !file,
    });
    ctx.objeMap.set(node.xref, media.id);
  }
  console.log(`[import-timing]     phaseObje: total=${total} withFile=${withFile}`);
}

// ── Phase 0.7: REPO records ────────────────────────────────────────────────

export function phaseRepo(ctx: ImportContext): void {
  for (const node of ctx.tree) {
    if (node.tag !== 'REPO' || !node.xref) continue;
    const addrNode = getChild(node, 'ADDR');
    const addrValue = addrNode
      ? (getChild(addrNode, 'ADR1')?.value ?? addrNode.value ?? undefined)
      : undefined;
    const repo = createRepository(ctx.db, {
      name: getChild(node, 'NAME')?.value ?? '',
      // Treat an empty ADDR line value as "no address" so ADDR-as-parent-only
      // emit (used to scope CITY/POST/etc) doesn't fabricate an empty string.
      address: addrValue === '' ? undefined : addrValue,
      city: addrNode ? getChild(addrNode, 'CITY')?.value ?? undefined : undefined,
      postal_code: addrNode ? getChild(addrNode, 'POST')?.value ?? undefined : undefined,
      state: addrNode ? getChild(addrNode, 'STAE')?.value ?? undefined : undefined,
      country: addrNode ? getChild(addrNode, 'CTRY')?.value ?? undefined : undefined,
      phone: getChild(node, 'PHON')?.value ?? undefined,
      email: getChild(node, 'EMAIL')?.value ?? undefined,
      web: getChild(node, 'WWW')?.value ?? undefined,
      notes: resolveNote(node, ctx.noteMap) || undefined,
    });
    ctx.repoMap.set(node.xref, repo.id);
  }
}

// ── Phase 0.8: _GRP records (Genney only) ──────────────────────────────────

export function phaseGroups(ctx: ImportContext): void {
  if (!ctx.isGenney) return;
  for (const node of ctx.tree) {
    if (node.tag !== '_GRP' || !node.xref) continue;
    const group = createGroup(ctx.db, {
      name: getChild(node, 'NAME')?.value ?? '',
      notes: resolveNote(node, ctx.noteMap) || undefined,
    });
    ctx.grpMap.set(node.xref, group.id);
  }
}

// ── Phase 1: SOUR records ──────────────────────────────────────────────────

export function phaseSources(ctx: ImportContext): void {
  for (const node of ctx.tree) {
    if (node.tag !== 'SOUR' || !node.xref) continue;
    const src = createSource(ctx.db, {
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
      // Custom _ABSTRACT / _CALL sub-tags carry the user-authored
      // sources.abstract and sources.call_number fields. Long values are
      // wrapped across CONT continuation lines on export; the parser already
      // unwraps CONT/CONC into the node's joined .value, so reading the
      // value directly preserves embedded newlines. Distinct from the
      // repository's own REPO.CALN (different table, different column).
      abstract: getChild(node, '_ABSTRACT')?.value ?? null,
      call_number: getChild(node, '_CALL')?.value ?? null,
    });
    ctx.sourceMap.set(node.xref, src.id);
    const repoVal = getChild(node, 'REPO')?.value ?? '';
    if (repoVal.startsWith('@')) {
      const repoId = ctx.repoMap.get(repoVal);
      if (repoId) linkSourceRepository(ctx.db, src.id, repoId);
    }
  }
}

// ── Phase 2: INDI records ──────────────────────────────────────────────────

export function phaseIndividuals(ctx: ImportContext): void {
  for (const node of ctx.tree) {
    if (node.tag !== 'INDI' || !node.xref) continue;

    // Normalize SEX to schema's M / F / U vocabulary. Per GEDCOM 5.5.1 only
    // M/F/U are valid; GEDCOM 7.0 adds X (intersex/non-binary) and N (no
    // entry); some real-world files emit bare "1 SEX" (empty) or lowercase.
    // Anything outside M/F maps to U so the importer doesn't crash on the
    // schema's CHECK constraint. This is lossy — see the warning below.
    const rawSex = getChild(node, 'SEX')?.value?.trim().toUpperCase() ?? '';
    const sex: 'M' | 'F' | 'U' = rawSex === 'M' ? 'M' : rawSex === 'F' ? 'F' : 'U';
    if (rawSex && rawSex !== 'M' && rawSex !== 'F' && rawSex !== 'U') {
      ctx.skippedTags.set(`SEX=${rawSex}`, (ctx.skippedTags.get(`SEX=${rawSex}`) ?? 0) + 1);
    }
    let notes = resolveNote(node, ctx.noteMap);

    // Genney 4.1: haplogroup tags -> append to notes
    if (ctx.isGenney) {
      const yHaplo = getChild(node, '_YHAPLOGROUP')?.value;
      const mHaplo = getChild(node, '_MHAPLOGROUP')?.value;
      if (yHaplo) notes = notes ? `${notes}\nY-DNA: ${yHaplo}` : `Y-DNA: ${yHaplo}`;
      if (mHaplo) notes = notes ? `${notes}\nmtDNA: ${mHaplo}` : `mtDNA: ${mHaplo}`;
    }

    // Holger: append REMA and MISC as additional notes
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

    // Look ahead at NAME tags so we know whether to allow a nameless create.
    // The importer always inserts the person row first then appends names via
    // addPersonName below, so createPerson is always called without given/surname.
    // We opt in to the importer-only `allowNameless` flag when (and only when)
    // the source INDI record has no NAME tag — preserving the source's reference
    // graph (this person may be a parent/spouse in a FAM record). The user is
    // disclosed via the import report's `namelessPersonCount`.
    const nameNodes = getChildren(node, 'NAME');

    const person = createPerson(ctx.db, {
      sex,
      notes: notes || undefined,
    }, { allowNameless: true });
    ctx.personMap.set(node.xref, person.id);
    if (ctx.isHolger && ctx.firstPersonId === null) ctx.firstPersonId = person.id;

    if (nameNodes.length === 0) {
      ctx.namelessPersonCount += 1;
    }

    if (ctx.isHolger) {
      const subtypeMap = parseHolgerAdoptionSubtypes(node);
      if (subtypeMap.size > 0) ctx.holgerAdoptionMap.set(node.xref!, subtypeMap);
    }

    // Names
    for (const nameNode of nameNodes) {
      const raw = nameNode.value ?? '';
      const surnameMatch = raw.match(/^(.*?)\/(.+?)\/(.*)$/);
      let given = (surnameMatch ? surnameMatch[1] : raw).trim() || null;
      const surname = surnameMatch ? surnameMatch[2].trim() || null : null;
      const prefix = getChild(nameNode, 'NPFX')?.value ?? null;
      const suffix = getChild(nameNode, 'NSFX')?.value ?? null;
      const rawType = getChild(nameNode, 'TYPE')?.value?.toUpperCase();
      const name_type =
        rawType === 'MARRIED' ? 'married'
        : rawType === 'NAME_CHANGE' ? 'name_change'
        : rawType === 'AKA' ? 'aka'
        : rawType === 'ALIAS' ? 'alias'
        : 'birth';

      // _PATR overrides genney patronymic detection; both can coexist
      const explicitPatr = getChild(nameNode, '_PATR')?.value ?? null;
      const patronymic_base = explicitPatr ?? (ctx.isGenney ? getPatronymicBase(surname) : null);

      // Preferred name (tilltalsnamn) marked with * (Genney) or ! (Holger/OurKind)
      // directly after the token. e.g. "Eva Linda* Marie" -> preferred_name = "Linda"
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

      // Holger/OurKind FORE tag: the tilltalsnamn (preferred name / kallad)
      if (ctx.isHolger && !preferred_name) {
        const fore = getChild(nameNode, 'FORE')?.value ?? null;
        if (fore) preferred_name = fore;
      }

      const personName = addPersonName(ctx.db, person.id, {
        given_name: given,
        surname,
        name_prefix: prefix,
        name_suffix: suffix,
        name_type: name_type as 'birth' | 'married' | 'name_change' | 'alias' | 'aka',
        patronymic_base,
        preferred_name,
        nickname,
        name_qualifier: (getChild(nameNode, '_NQUAL')?.value ?? null) as string | null,
        date_from: getChild(nameNode, '_DATE_FROM')?.value ?? null,
        date_to: getChild(nameNode, '_DATE_TO')?.value ?? null,
      });

      // Name-level citations: SOUR sub-tags under NAME (allowed by GEDCOM
      // 5.5.1 and 7.0 NAME_PIECE structure). Counterpart of the exporter's
      // emitCitationBlock under each NAME line.
      for (const sour of getChildren(nameNode, 'SOUR')) {
        const srcId = ctx.sourceMap.get(sour.value) ?? ctx.sourceMap.get(sour.xref ?? '');
        if (!srcId) continue;
        const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
        const page = getChild(sour, 'PAGE')?.value ?? '';
        const citNotes = getChild(sour, 'NOTE')?.value ?? '';
        const date_accessed = getChild(sour, '_ACCESSED')?.value ?? '';
        const dataNode = getChild(sour, 'DATA');
        const transcription = dataNode ? (getChild(dataNode, 'TEXT')?.value ?? '') : '';
        createCitation(ctx.db, {
          source_id: srcId,
          person_name_id: personName.id,
          page,
          confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
          notes: citNotes || undefined,
          transcription: transcription || undefined,
          date_accessed: date_accessed || undefined,
        });
      }
    }

    // External identifiers: standard GEDCOM
    // REFN with a TYPE sub-tag maps to typed identifiers; plain REFN maps to 'refn'
    for (const refn of getChildren(node, 'REFN')) {
      if (!refn.value) continue;
      const refnType = getChild(refn, 'TYPE')?.value?.trim() ?? '';
      const ltype = refnType.toLowerCase();
      if (ltype === 'familysearch') {
        addPersonIdentifier(ctx.db, person.id, { identifier_type: 'familysearch', identifier_value: refn.value });
      } else if (ltype === 'ancestry') {
        addPersonIdentifier(ctx.db, person.id, { identifier_type: 'ancestry', identifier_value: refn.value });
      } else if (ltype === 'riksarkivet') {
        addPersonIdentifier(ctx.db, person.id, { identifier_type: 'riksarkivet', identifier_value: refn.value });
      } else if (ltype === 'personnummer') {
        addPersonIdentifier(ctx.db, person.id, { identifier_type: 'personnummer', identifier_value: refn.value });
      } else if (ltype === 'other') {
        addPersonIdentifier(ctx.db, person.id, { identifier_type: 'other', identifier_value: refn.value });
      } else {
        // Plain REFN or unknown TYPE -> store as 'refn'
        addPersonIdentifier(ctx.db, person.id, { identifier_type: 'refn', identifier_value: refn.value });
      }
    }
    const rin = getChild(node, 'RIN');
    if (rin?.value) addPersonIdentifier(ctx.db, person.id, { identifier_type: 'rin', identifier_value: rin.value });

    // _UID (GEDCOM 5.5 non-standard, ubiquitous) and bare UID (GEDCOM 7.0
    // standard). RootsMagic, Genney, FTM, MyHeritage all emit one or the other.
    const uid = getChild(node, '_UID') ?? getChild(node, 'UID');
    if (uid?.value) addPersonIdentifier(ctx.db, person.id, { identifier_type: 'uid', identifier_value: uid.value });

    // AFN — Ancestral File Number. GEDCOM 5.5/5.5.1 standard tag.
    const afn = getChild(node, 'AFN');
    if (afn?.value) addPersonIdentifier(ctx.db, person.id, { identifier_type: 'afn', identifier_value: afn.value });

    // SSN — Social Security Number. GEDCOM 5.5 standard tag. Privacy-sensitive
    // but if the user authored it in their source DB, the Prime Directive
    // says preserve it; the user can delete it via the panel if they want.
    const ssn = getChild(node, 'SSN');
    if (ssn?.value) addPersonIdentifier(ctx.db, person.id, { identifier_type: 'ssn', identifier_value: ssn.value });

    // FSID — modern FamilySearch ID. Non-standard tag emitted by FTM and others.
    const fsid = getChild(node, 'FSID');
    if (fsid?.value) addPersonIdentifier(ctx.db, person.id, { identifier_type: 'familysearch', identifier_value: fsid.value });

    // Extended identifiers (legacy custom tags -- kept for backward compat reading old exports)
    const fsi = getChild(node, '_FSI');
    if (fsi?.value) addPersonIdentifier(ctx.db, person.id, { identifier_type: 'familysearch', identifier_value: fsi.value });
    const anid = getChild(node, '_ANID');
    if (anid?.value) addPersonIdentifier(ctx.db, person.id, { identifier_type: 'ancestry', identifier_value: anid.value });
    const raid = getChild(node, '_RAID');
    if (raid?.value) addPersonIdentifier(ctx.db, person.id, { identifier_type: 'riksarkivet', identifier_value: raid.value });
    const pnummer = getChild(node, '_PNUMMER');
    if (pnummer?.value) addPersonIdentifier(ctx.db, person.id, { identifier_type: 'personnummer', identifier_value: pnummer.value });

    // Person events
    for (const [gedTag, appType] of Object.entries(PERSON_EVENT_TAGS)) {
      for (const evNode of getChildren(node, gedTag)) {
        const event = importEventNode(ctx.db, evNode, appType, ctx.sourceMap, {}, ctx.resolvePlaceFn, ctx.placeIdMap, ctx.eventIdMap, ctx.noteMap, ctx.objeMap, ctx.options);
        addEventParticipant(ctx.db, { event_id: event.id, person_id: person.id, role: 'primary' });
      }
    }

    // (TITL is now routed via PERSON_EVENT_TAGS as event_type 'title' so the
    //  line value is preserved in events.value and round-trips through export.)

    // Person-level citations (SOUR directly on INDI, not under an event)
    for (const sour of getChildren(node, 'SOUR')) {
      const srcId = ctx.sourceMap.get(sour.value) ?? ctx.sourceMap.get(sour.xref ?? '');
      if (srcId) {
        const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
        const page = getChild(sour, 'PAGE')?.value ?? '';
        const citNotes = getChild(sour, 'NOTE')?.value ?? '';
        const date_accessed = getChild(sour, '_ACCESSED')?.value ?? '';
        // GEDCOM 7.0 carrier for transcription on non-event/non-name hosts.
        // Standard DATA/TEXT is not read at this level (it's only read for
        // event-level and name-level citations); the exporter writes _TRANS
        // here under v7.0 so person/family/place transcriptions round-trip.
        // Multi-line transcriptions are unwrapped from CONT continuation by
        // the parser into the joined node value.
        const transcription = getChild(sour, '_TRANS')?.value ?? '';
        createCitation(ctx.db, {
          source_id: srcId,
          person_id: person.id,
          page,
          confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
          notes: citNotes || undefined,
          transcription: transcription || undefined,
          date_accessed: date_accessed || undefined,
        });
      }
    }

    // Collect ASSO blocks for post-processing (Phase 4)
    for (const assoNode of getChildren(node, 'ASSO')) {
      ctx.assoData.push({ personId: person.id, assoNode });
    }

    // Genney: _GRP -> group memberships
    if (ctx.isGenney) {
      for (const grpNode of getChildren(node, '_GRP')) {
        const groupId = ctx.grpMap.get(grpNode.value ?? '');
        if (groupId) {
          try { addGroupLink(ctx.db, groupId, 'person', person.id); } catch { /* ignore duplicate */ }
        }
      }
    }

    // Person-level media
    let personMediaOrder = 0;
    for (const objeNode of getChildren(node, 'OBJE')) {
      const mediaId = importObjeNode(ctx.db, objeNode, ctx.objeMap, ctx.options);
      if (mediaId) {
        addMediaLink(ctx.db, { media_id: mediaId, entity_type: 'person', entity_id: person.id, sort_order: personMediaOrder });
        personMediaOrder++;
      }
    }

    // Count LDS ordinance tags on INDI records (not imported -- not relevant for Swedish genealogy)
    const LDS_TAGS = new Set(['BAPL', 'SLGC', 'CONL', 'ENDL', 'SLGS']);
    for (const child of node.children) {
      if (LDS_TAGS.has(child.tag)) ctx.ldsCount++;
    }

    // Count TRAN nodes (GEDCOM 7.0 multi-language translations)
    for (const child of node.children) {
      if (child.tag === 'TRAN') ctx.tranCount++;
      for (const grandchild of child.children) {
        if (grandchild.tag === 'TRAN') ctx.tranCount++;
      }
    }

    // Count NO nodes (GEDCOM 7.0 negative assertions -- not imported)
    for (const child of node.children) {
      if (child.tag === 'NO') ctx.noCount++;
    }

    // Count unrecognised top-level INDI tags
    for (const child of node.children) {
      if (!KNOWN_INDI_TAGS.has(child.tag)) {
        ctx.skippedTags.set(child.tag, (ctx.skippedTags.get(child.tag) ?? 0) + 1);
      }
    }
  }
}

// ── Phase 3: FAM records ───────────────────────────────────────────────────

export function phaseFamilies(ctx: ImportContext): void {
  for (const node of ctx.tree) {
    if (node.tag !== 'FAM') continue;

    const husbXref = getChild(node, 'HUSB')?.value;
    const wifeXref = getChild(node, 'WIFE')?.value;
    const person1Id = husbXref ? ctx.personMap.get(husbXref) ?? null : null;
    const person2Id = wifeXref ? ctx.personMap.get(wifeXref) ?? null : null;

    // Infer couple subtype: _SUBTYPE from extended export takes precedence;
    // fall back to inferring 'marriage' from a MARR event in the FAM record.
    const extSubtype = getChild(node, '_SUBTYPE')?.value;
    const hasMarr = getChildren(node, 'MARR').length > 0;
    let coupleSubtype: string;
    if (extSubtype) {
      coupleSubtype = extSubtype;
    } else if (hasMarr) {
      coupleSubtype = 'marriage';
    } else if (ctx.isHolger) {
      const engaNodes = getChildren(node, 'ENGA');
      // Holger emits at most one ENGA per FAM; take the first if multiple exist
      coupleSubtype = engaNodes.length > 0 ? holgerEngaSubtype(engaNodes[0]) : 'unknown';
    } else {
      coupleSubtype = 'unknown';
    }

    const couple = createRelationship(ctx.db, {
      type: 'couple',
      person1_id: person1Id,
      person2_id: person2Id,
      subtype: coupleSubtype,
    });

    // Extended couple metadata (notes only -- subtype already applied above)
    const relnotes = getChild(node, '_RELNOTES')?.value;
    if (relnotes) {
      updateRelationship(ctx.db, couple.id, { notes: relnotes });
    }

    // Family events
    for (const [gedTag, appType] of Object.entries(FAMILY_EVENT_TAGS)) {
      // Holger: ENGA on a FAM without MARR is a relationship-type tag (see holgerEngaSubtype),
      // not a real engagement event. If both MARR and ENGA are present, the ENGA is a genuine
      // engagement event (pre-marriage) and IS imported normally.
      if (ctx.isHolger && gedTag === 'ENGA' && !hasMarr) continue;
      for (const evNode of getChildren(node, gedTag)) {
        importEventNode(ctx.db, evNode, appType, ctx.sourceMap, { relationship_id: couple.id }, ctx.resolvePlaceFn, ctx.placeIdMap, ctx.eventIdMap, ctx.noteMap, ctx.objeMap, ctx.options);
      }
    }

    // Children -> parent_child relationships with PEDI subtype
    for (const chil of getChildren(node, 'CHIL')) {
      const childId = ctx.personMap.get(chil.value);
      if (!childId) continue;
      const pedi = getChild(chil, 'PEDI')?.value;
      // 'birth' is the GEDCOM term for biological; everything else maps directly
      let childSubtype = pedi ? (pedi === 'birth' ? 'biological' : pedi) : 'biological';
      if (ctx.isHolger) {
        const adopSubtype = ctx.holgerAdoptionMap.get(chil.value)?.get(node.xref ?? '');
        if (adopSubtype) childSubtype = adopSubtype;
      }
      if (person1Id) createRelationship(ctx.db, { type: 'parent_child', person1_id: person1Id, person2_id: childId, subtype: childSubtype });
      if (person2Id) createRelationship(ctx.db, { type: 'parent_child', person1_id: person2Id, person2_id: childId, subtype: childSubtype });
    }

    // Family-level citations (SOUR directly on FAM, not under an event)
    for (const sour of getChildren(node, 'SOUR')) {
      const srcId = ctx.sourceMap.get(sour.value) ?? ctx.sourceMap.get(sour.xref ?? '');
      if (srcId) {
        const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
        const page = getChild(sour, 'PAGE')?.value ?? '';
        const citNotes = getChild(sour, 'NOTE')?.value ?? '';
        const date_accessed = getChild(sour, '_ACCESSED')?.value ?? '';
        // _TRANS carrier — see person-level citation block above for rationale.
        const transcription = getChild(sour, '_TRANS')?.value ?? '';
        createCitation(ctx.db, {
          source_id: srcId,
          relationship_id: couple.id,
          page,
          confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
          notes: citNotes || undefined,
          transcription: transcription || undefined,
          date_accessed: date_accessed || undefined,
        });
      }
    }

    // Family-level media
    let relMediaOrder = 0;
    for (const objeNode of getChildren(node, 'OBJE')) {
      const mediaId = importObjeNode(ctx.db, objeNode, ctx.objeMap, ctx.options);
      if (mediaId) {
        addMediaLink(ctx.db, { media_id: mediaId, entity_type: 'relationship', entity_id: couple.id, sort_order: relMediaOrder });
        relMediaOrder++;
      }
    }

    // Count unrecognised top-level FAM tags
    for (const child of node.children) {
      if (!KNOWN_FAM_TAGS.has(child.tag)) {
        ctx.skippedTags.set(child.tag, (ctx.skippedTags.get(child.tag) ?? 0) + 1);
      }
    }
  }
}

// ── Phase 4: Post-process ASSO blocks ──────────────────────────────────────

export function phaseAsso(ctx: ImportContext): void {
  for (const { personId, assoNode } of ctx.assoData) {
    const otherPersonXref = assoNode.value;
    const otherPersonId = ctx.personMap.get(otherPersonXref);
    if (!otherPersonId) continue;

    const rela = getChild(assoNode, 'RELA')?.value?.toLowerCase() ?? '';
    const evidRef = getChild(assoNode, '_EVID')?.value;

    if (evidRef) {
      // Non-primary event participant: map old event UUID -> new event UUID
      const newEventId = ctx.eventIdMap.get(evidRef);
      if (newEventId) {
        addEventParticipant(ctx.db, {
          event_id: newEventId,
          person_id: otherPersonId,
          role: rela as EventParticipantRole,
        });
      }
    } else {
      // Sibling / godparent / other relationship -- deduplicate before creating
      const relType = rela as RelationshipType;
      if (relType === 'sibling' || relType === 'godparent' || relType === 'other') {
        const existingRels = getRelationshipsOfPerson(ctx.db, personId).filter((r: Relationship) =>
          r.type === relType &&
          ((r.person1_id === personId && r.person2_id === otherPersonId) ||
           (r.person1_id === otherPersonId && r.person2_id === personId))
        );
        if (existingRels.length === 0) {
          // Custom 2 _RELA_NOTE sub-tag under ASSO carries the genealogist's
          // note on the relationship. The parser already unwraps CONT/CONC
          // continuation lines into the joined node value, so multi-line
          // notes (with embedded newlines) survive end-to-end. Couples ride
          // _RELNOTES on FAM; this is the non-couple carrier.
          const notes = getChild(assoNode, '_RELA_NOTE')?.value ?? '';
          createRelationship(ctx.db, {
            type: relType,
            person1_id: personId,
            person2_id: otherPersonId,
            notes,
          });
        }
      } else {
        ctx.assoDropCount++;
      }
    }
  }
}

// ── Phase 5: _PLAC records for place-level citations ───────────────────────

export function phasePlaceCitations(ctx: ImportContext): void {
  for (const node of ctx.tree) {
    if (node.tag !== '_PLAC') continue;
    const oldPlaceId = getChild(node, '_PLAC_ID')?.value;
    if (!oldPlaceId) continue;

    const newPlaceId = ctx.placeIdMap.get(oldPlaceId) ?? oldPlaceId;
    let place = getPlace(ctx.db, newPlaceId);

    if (!place) {
      // UUID not found (cross-DB import, or place only exists via this _PLAC record).
      // Fall back to name-based find-or-create using the NAME tag we write in the exporter.
      const placeName = getChild(node, 'NAME')?.value;
      if (!placeName) continue;
      place = ctx.resolvePlaceFn(ctx.db, placeName);
      ctx.placeIdMap.set(oldPlaceId, place.id);
    }

    for (const sour of getChildren(node, 'SOUR')) {
      const srcId = ctx.sourceMap.get(sour.value);
      if (!srcId) continue;
      const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
      const page = getChild(sour, 'PAGE')?.value ?? '';
      const citNotes = getChild(sour, 'NOTE')?.value ?? '';
      const date_accessed = getChild(sour, '_ACCESSED')?.value ?? '';
      // _TRANS carrier — see person-level citation block in phaseIndividuals.
      const transcription = getChild(sour, '_TRANS')?.value ?? '';
      createCitation(ctx.db, {
        source_id: srcId,
        place_id: place.id,
        page,
        confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
        notes: citNotes || undefined,
        transcription: transcription || undefined,
        date_accessed: date_accessed || undefined,
      });
    }
  }
}

// ── Phase 6: _TODO records (Genney only) ───────────────────────────────────

export function phaseTodos(ctx: ImportContext): void {
  if (!ctx.isGenney) return;
  for (const node of ctx.tree) {
    if (node.tag !== '_TODO') continue;
    const targXref = getChild(node, '_TARG')?.value ?? '';
    const person_id = ctx.personMap.get(targXref) ?? null;
    const statVal = getChild(node, '_STAT')?.value ?? '0';
    const status: 'open' | 'done' = statVal === '1' ? 'done' : 'open';
    const priority = parseInt(getChild(node, '_PRIO')?.value ?? '1', 10);
    const task = getChild(node, '_TASK')?.value ?? '';
    const notes = resolveNote(node, ctx.noteMap);
    const created = createResearchTask(ctx.db, { task, notes: notes || undefined, priority, status });
    if (person_id) addTaskLink(ctx.db, created.id, 'person', person_id);
  }
}

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

export function phaseSubmitters(ctx: ImportContext): void {
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
