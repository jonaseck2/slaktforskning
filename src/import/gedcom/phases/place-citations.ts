// ── Phase 5: _PLAC records for place-level citations ───────────────────────

import { createCitation } from '../../../api/sources';
import { getPlace } from '../../../api/places';
import {
  bulkAddExternalIdentifiers, type ExternalIdentifierInput,
} from '../../../api/external_identifiers';
import type { ImportContext } from '../import-types';
import { getChild, getChildren } from '../node-utils';
import { readExternalIds } from '../../../gedcom/external-id-tags';
import { markConsumed } from '../tag-accounting';

export async function phasePlaceCitations(ctx: ImportContext): Promise<void> {
  // Source-format ids on the place-level citations this phase creates, and on
  // the places those citations hang off. One array for the whole phase,
  // flushed once after the tree walk — `.claude/rules/performance.md`. The
  // `createCitation` call in the loop is already per-row and predates this
  // work; the identifier write adds no second.
  const externalIdRows: ExternalIdentifierInput[] = [];
  for (const node of ctx.tree) {
    if (node.tag !== '_PLAC') continue;
    markConsumed(node);
    const oldPlaceId = getChild(node, '_PLAC_ID')?.value;
    if (!oldPlaceId) continue;

    const newPlaceId = ctx.placeIdMap.get(oldPlaceId) ?? oldPlaceId;
    let place = await getPlace(ctx.db, newPlaceId);

    if (!place) {
      // UUID not found (cross-DB import, or place only exists via this _PLAC record).
      // Fall back to name-based find-or-create using the NAME tag we write in the exporter.
      const placeName = getChild(node, 'NAME')?.value;
      if (!placeName) continue;
      place = await ctx.resolvePlaceFn(ctx.db, placeName);
      ctx.placeIdMap.set(oldPlaceId, place.id);
    }

    // The place's own ids. A place reachable only through a place-level
    // citation gets no `PLAC` block anywhere in the file, so `prep-places.ts`
    // never sees it and the `_PLAC` record is its only carrier. The exporter
    // writes every system here, `arkivdigital.parish` included, because this
    // record emits no `_ADPL` block for `_PARISH_AID` to live in.
    externalIdRows.push(
      ...readExternalIds(node, ['_EXID'], 'place', place.id, getChild, getChildren),
    );

    for (const sour of getChildren(node, 'SOUR')) {
      const srcId = ctx.sourceMap.get(sour.value);
      if (!srcId) continue;
      const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
      const page = getChild(sour, 'PAGE')?.value ?? '';
      const citNotes = getChild(sour, 'NOTE')?.value ?? '';
      const date_accessed = getChild(sour, '_ACCESSED')?.value ?? '';
      // _TRANS carrier — see person-level citation block in phaseIndividuals.
      const transcription = getChild(sour, '_TRANS')?.value ?? '';
      const cit = await createCitation(ctx.db, {
        source_id: srcId,
        place_id: place.id,
        page,
        confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
        notes: citNotes || undefined,
        transcription: transcription || undefined,
        date_accessed: date_accessed || undefined,
      });
      // This host reads no `_AID` — an ArkivDigital file has no place-level
      // citation — so `_EXID` is the only carrier here. Without this read the
      // tag would land in `unaccountedFor` on a re-import of our own export.
      externalIdRows.push(
        ...readExternalIds(sour, ['_EXID'], 'citation', cit.id, getChild, getChildren),
      );
    }
  }

  if (externalIdRows.length > 0) {
    await bulkAddExternalIdentifiers(ctx.db, externalIdRows);
  }
}
