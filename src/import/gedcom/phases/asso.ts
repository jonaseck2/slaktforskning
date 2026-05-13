// ── Phase 4: Post-process ASSO blocks ──────────────────────────────────────

import type { Relationship, RelationshipType, EventParticipantRole } from '../../../api/types';
import { createRelationship, addEventParticipant, getRelationshipsOfPerson } from '../../../api/relationships';
import type { ImportContext } from '../import-types';
import { getChild } from '../node-utils';

export async function phaseAsso(ctx: ImportContext): Promise<void> {
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
        await addEventParticipant(ctx.db, {
          event_id: newEventId,
          person_id: otherPersonId,
          role: rela as EventParticipantRole,
        });
      }
    } else {
      // Sibling / godparent / other relationship -- deduplicate before creating
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
}
