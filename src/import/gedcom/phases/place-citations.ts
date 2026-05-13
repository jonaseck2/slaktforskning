// ── Phase 5: _PLAC records for place-level citations ───────────────────────

import { createCitation } from '../../../api/sources';
import { getPlace } from '../../../api/places';
import type { ImportContext } from '../import-types';
import { getChild, getChildren } from '../node-utils';

export async function phasePlaceCitations(ctx: ImportContext): Promise<void> {
  for (const node of ctx.tree) {
    if (node.tag !== '_PLAC') continue;
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

    for (const sour of getChildren(node, 'SOUR')) {
      const srcId = ctx.sourceMap.get(sour.value);
      if (!srcId) continue;
      const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
      const page = getChild(sour, 'PAGE')?.value ?? '';
      const citNotes = getChild(sour, 'NOTE')?.value ?? '';
      const date_accessed = getChild(sour, '_ACCESSED')?.value ?? '';
      // _TRANS carrier — see person-level citation block in phaseIndividuals.
      const transcription = getChild(sour, '_TRANS')?.value ?? '';
      await createCitation(ctx.db, {
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
