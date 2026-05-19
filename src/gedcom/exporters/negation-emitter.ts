/**
 * Negative-assertion (NO X) emitter — T02 scaffold; filled by T06.
 *
 * GEDCOM 7.0 introduces the `NO X` family of structures to record that an
 * event explicitly did *not* happen (e.g. `NO BIRT` = "the indexed person
 * was not born in this period / place"). 5.5.1 has no equivalent; this
 * column is lossy on 5.5.1 by design.
 *
 * The owning entity is whatever has the negation-event row — typically an
 * INDI or FAM, identified by the negation event's participants /
 * relationship_id.
 */

import type { Database } from 'node-sqlite3-wasm';

/**
 * Emit `NO <event-tag>` substructures for events with `is_negation = 1`
 * attached to the given owner. Each negation row produces:
 *
 *     <baseLevel>   NO <eventTag>      (eventTag derived from
 *                                       negation_event_type via EVENT_TYPE_TO_TAG)
 *     <baseLevel+1> DATE <range>       (optional, from date_value /
 *                                       date_value_end)
 *     <baseLevel+1> NOTE <notes>       (optional)
 *
 * **T02 stub:** no emission. T06 implements.
 */
export async function emitNegationsForEntity(
  _db: Database,
  _ownerEntityType: 'person' | 'relationship',
  _ownerEntityId: string,
  _baseLevel: number,
  _version: '5.5.1' | '7.0',
  _lines: string[],
): Promise<void> {
  // T06 implements.
}
