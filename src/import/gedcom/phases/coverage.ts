// ── Phase: SOUR DATA/EVEN coverage events (T08) ────────────────────────────
//
// GEDCOM 5.5.1 + 7.0 SOUR DATA/EVEN records what events / date ranges /
// places a source covers — distinct from inline SOUR citations which
// attach a source to a specific authored event. Spec is identical on
// both versions; emission and import are lossless.
//
// Reads from `ctx.originalTree` so we see the raw pre-normalize shape.
// Wired into import-core.ts after phaseSources (so source rows exist).

import type { ImportContext } from '../import-types';
import { getChild, getChildren } from '../node-utils';
import { createSourceCoverageEvent } from '../../../api/source_coverage';
import { findOrCreatePlace } from '../../../api/places';

export async function phaseCoverage(ctx: ImportContext): Promise<void> {
  const tree = ctx.originalTree ?? ctx.tree;

  for (const sourNode of tree) {
    if (sourNode.tag !== 'SOUR') continue;
    const xref = sourNode.xref;
    if (!xref) continue;
    const sourceId = ctx.sourceMap.get(xref);
    if (!sourceId) continue;

    const dataNode = getChild(sourNode, 'DATA');
    if (!dataNode) continue;

    for (const evenNode of getChildren(dataNode, 'EVEN')) {
      const eventType = (evenNode.value ?? '').trim();
      if (!eventType) continue;

      // Parse DATE FROM <from> TO <to> (also handle FROM-only / TO-only).
      let date_value_from = '';
      let date_value_to = '';
      const dateNode = getChild(evenNode, 'DATE');
      if (dateNode?.value) {
        const dv = dateNode.value.trim();
        const fromTo = dv.match(/^FROM\s+(.+?)\s+TO\s+(.+)$/i);
        const fromOnly = dv.match(/^FROM\s+(.+)$/i);
        const toOnly = dv.match(/^TO\s+(.+)$/i);
        if (fromTo) {
          date_value_from = fromTo[1].trim();
          date_value_to = fromTo[2].trim();
        } else if (fromOnly) {
          date_value_from = fromOnly[1].trim();
        } else if (toOnly) {
          date_value_to = toOnly[1].trim();
        } else {
          // Bare date — treat as both endpoints (uncommon but legal).
          date_value_from = dv;
          date_value_to = dv;
        }
      }

      // Resolve PLAC to a place row via findOrCreatePlace (matches the
      // resolution semantics used by every other importer phase — same
      // place name maps to the same row).
      let place_id: string | null = null;
      const placNode = getChild(evenNode, 'PLAC');
      if (placNode?.value) {
        const place = await findOrCreatePlace(ctx.db, placNode.value);
        place_id = place.id;
      }

      // NOTE sub-tag with CONT continuation lines.
      let notes = '';
      const noteNode = getChild(evenNode, 'NOTE');
      if (noteNode) {
        const parts: string[] = [noteNode.value ?? ''];
        for (const cont of getChildren(noteNode, 'CONT')) {
          parts.push(cont.value ?? '');
        }
        notes = parts.join('\n');
      }

      await createSourceCoverageEvent(ctx.db, {
        source_id: sourceId,
        event_type: eventType,
        date_value_from,
        date_value_to,
        place_id,
        notes,
      });
    }
  }
}
