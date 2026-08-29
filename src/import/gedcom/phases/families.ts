// ── Phase 3: FAM records ───────────────────────────────────────────────────

import { v4 as uuid } from 'uuid';
import { bulkCreateRelationships } from '../../../api/relationships';
import { bulkCreateCitations } from '../../../api/sources';
import { bulkAddExternalIdentifiers, type ExternalIdentifierInput } from '../../../api/external_identifiers';
import { bulkAddMediaLinks } from '../../../api/media';
import { bulkCreateEvents } from '../../../api/events';
import { holgerEngaSubtype } from '../profiles/holger';
import type { ImportContext } from '../import-types';
import { getChild, getChildren } from '../node-utils';
import { importObjeNode } from '../obje-importer';
import { collectEventNode } from '../event-importer';
import type { EventCollectResult } from '../event-importer';
import { markConsumed } from '../tag-accounting';
import { parentRelSubtype } from '../profiles/arkivdigital';
import { FAMILY_EVENT_TAGS } from './shared';

const KNOWN_FAM_TAGS = new Set([
  'HUSB', 'WIFE', 'CHIL', 'SOUR', 'NOTE', '_SUBTYPE', '_RELNOTES', 'CHAN',
  // FAMILY_EVENT_TAGS keys:
  'MARR', 'DIV', 'CENS', 'ENGA', 'EVEN',
  'ANUL', 'MARL', '_SEPR',
  'OBJE',
  // T06: NO X negative-assertion blocks — imported by phaseNegations.
  'NO',
]);

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
  for (const n of ctx.tree) if (n.tag === 'FAM') { markConsumed(n); famNodes.push(n); }
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
        citationExternalIdBuffer.push(...collected.citationExternalIds);
        mediaLinkBuffer.push(...collected.mediaLinkRows);
      }
    }

    // Children → parent_child rows.
    for (const chil of getChildren(node, 'CHIL')) {
      const childId = ctx.personMap.get(chil.value);
      if (!childId) continue;
      // A missing PEDI stays biological: GEDCOM 5.5.1 §PEDI names `birth` as
      // the assumed value, so that is the file's statement, not our guess.
      // A PEDI that IS present goes through the vocabulary check — it used to
      // be written into `subtype` verbatim, which put SEALING, OTHER, _ENUMVAL
      // and _ENUM2 (all present in the sample corpus) into the column.
      const pedi = getChild(chil, 'PEDI')?.value;
      let childSubtype: string = pedi ? parentRelSubtype(pedi) : 'biological';
      if (ctx.isHolger) {
        const adopSubtype = ctx.holgerAdoptionMap.get(chil.value)?.get(node.xref ?? '');
        if (adopSubtype) childSubtype = adopSubtype;
      }
      // ArkivDigital states the relation to each parent separately, so the
      // father row and the mother row can carry different subtypes.
      const frel = getChild(chil, '_FREL')?.value;
      const mrel = getChild(chil, '_MREL')?.value;
      const fatherSubtype = frel ? parentRelSubtype(frel) : childSubtype;
      const motherSubtype = mrel ? parentRelSubtype(mrel) : childSubtype;
      if (person1Id) parentChildRows.push({ type: 'parent_child', person1_id: person1Id, person2_id: childId, subtype: fatherSubtype });
      if (person2Id) parentChildRows.push({ type: 'parent_child', person1_id: person2Id, person2_id: childId, subtype: motherSubtype });
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
        const citationId = uuid();
        citationBuffer.push({
          id: citationId,
          source_id: srcId,
          relationship_id: coupleId,
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
  // One bulk call for the whole pass — `.claude/rules/performance.md`, never
  // per citation.
  if (citationExternalIdBuffer.length > 0) {
    await bulkAddExternalIdentifiers(ctx.db, citationExternalIdBuffer);
  }
  if (mediaLinkBuffer.length > 0) {
    ctx.options?.onProgress?.(`Skriver ${mediaLinkBuffer.length} familje-medialänkar (1 / 1)…`);
    await bulkAddMediaLinks(ctx.db, mediaLinkBuffer);
  }
}
