// ── Phase 4: Post-process ASSO blocks ──────────────────────────────────────
//
// Three branches:
//   1. ASSO with `_EVID` sub-tag: event-mediated witness/godparent for a
//      specific event (legacy behavior, unchanged).
//   2. Standalone ASSO whose role tag (RELA in 5.5.1, ROLE in 7.0) carries
//      a *lowercase* value in the T05 person-association vocabulary —
//      `godparent | friend | colleague | enemy | neighbor | other`.
//      Creates a `person_associations` row.
//   3. Legacy fall-through: standalone ASSO whose RELA value is one of the
//      legacy relationships kinds (`Sibling | Godparent | Other`, typically
//      capitalized as emitted by the relationships-table exporter path).
//      Creates a `relationships` row. Existing behavior preserved.
//
// The lowercase-vs-capitalized distinction is the on-wire signal:
//   - T05's `assoc-emitter.ts` writes the role value lowercase
//     (`2 RELA godparent` / `2 ROLE friend`).
//   - The legacy relationships-table exporter (exporter.ts INDI block)
//     writes it capitalized via `capitalizeFirst()`
//     (`2 RELA Godparent` / `2 RELA Sibling`).
// Reading the raw (un-lowercased) value first lets us route reliably.

import type { Relationship, RelationshipType, EventParticipantRole, PersonAssociationRole } from '../../../api/types';
import { createRelationship, addEventParticipant, getRelationshipsOfPerson } from '../../../api/relationships';
import { createPersonAssociation, getAssociationsForPerson } from '../../../api/person_associations';
import type { ImportContext } from '../import-types';
import { getChild } from '../node-utils';

const PERSON_ASSOC_ROLES: ReadonlySet<PersonAssociationRole> = new Set([
  'godparent', 'friend', 'colleague', 'enemy', 'neighbor', 'other',
]);

export async function phaseAsso(ctx: ImportContext): Promise<void> {
  for (const { personId, assoNode } of ctx.assoData) {
    const otherPersonXref = assoNode.value;
    const otherPersonId = ctx.personMap.get(otherPersonXref);
    if (!otherPersonId) continue;

    // GEDCOM 5.5.1 uses RELA; 7.0 renamed it to ROLE under ASSO. We accept
    // both and prefer ROLE when present so cross-version imports work.
    const roleNode = getChild(assoNode, 'ROLE') ?? getChild(assoNode, 'RELA');
    const rawRole = roleNode?.value ?? '';
    const evidRef = getChild(assoNode, '_EVID')?.value;

    if (evidRef) {
      // Non-primary event participant: map old event UUID -> new event UUID
      const newEventId = ctx.eventIdMap.get(evidRef);
      if (newEventId) {
        await addEventParticipant(ctx.db, {
          event_id: newEventId,
          person_id: otherPersonId,
          role: rawRole.toLowerCase() as EventParticipantRole,
        });
      }
      continue;
    }

    // T05 standalone-ASSO branch: lowercase exact match against the
    // person_association vocabulary. The emitter writes lowercase so
    // we can distinguish from the legacy `RELA Godparent`/`Sibling`/`Other`
    // capitalized values produced by the relationships-table exporter.
    if (PERSON_ASSOC_ROLES.has(rawRole as PersonAssociationRole)) {
      const role = rawRole as PersonAssociationRole;
      // Standard ASSO NOTE child carries the genealogist's note. The
      // parser unwraps CONT continuation lines into a joined value.
      const notes = getChild(assoNode, 'NOTE')?.value ?? '';
      // Deduplicate on (person_id, related_person_id, role) — matches the
      // UNIQUE constraint. The exporter writes the ASSO under each
      // endpoint when both rows exist, so the same wire input can arrive
      // twice for a symmetric pair; ignore the duplicate.
      const existing = await getAssociationsForPerson(ctx.db, personId);
      const dup = existing.some(a =>
        a.related_person_id === otherPersonId && a.role === role
      );
      if (!dup) {
        try {
          await createPersonAssociation(ctx.db, {
            person_id: personId,
            related_person_id: otherPersonId,
            role,
            notes,
          });
        } catch {
          // UNIQUE collision under race / re-entrancy — safe to ignore.
        }
      }
      continue;
    }

    // Legacy relationships-table fall-through (capitalized RELA values from
    // the legacy exporter, or any other casing).
    const rela = rawRole.toLowerCase();
    const relType = rela as RelationshipType;
    if (relType === 'sibling' || relType === 'godparent' || relType === 'other') {
      const existingRels = (await getRelationshipsOfPerson(ctx.db, personId)).filter((r: Relationship) =>
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
        await createRelationship(ctx.db, {
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
