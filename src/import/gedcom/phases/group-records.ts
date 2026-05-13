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

import { getPlace } from '../../../api/places';
import { createGroup, addGroupLink } from '../../../api/groups';
import type { ImportContext } from '../import-types';
import { getChild, getChildren, resolveNote } from '../node-utils';

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
