/**
 * Negative-assertion (NO X) emitter — T06 implementation.
 *
 * GEDCOM 7.0 introduces the `NO X` family of structures to record that an
 * event explicitly did *not* happen (e.g. `NO BIRT` = "the indexed person
 * was not born in this period / place"). 5.5.1 has no equivalent; on 5.5.1
 * we drop the negation event and push a per-row disclosure warning into
 * the export report's `warnings` array.
 *
 * The owning entity is whatever has the negation-event row — typically an
 * INDI (via `event_participants.role='primary'`) or a FAM (via
 * `events.relationship_id`).
 */

import type { Database } from 'node-sqlite3-wasm';
import { getEventsForPerson, getEventsForRelationship } from '../../api/events';

// T06: reuse the canonical event-type → tag mapping. Kept inline here to
// avoid a circular import with the main exporter.ts module.
const EVENT_TYPE_TO_TAG: Record<string, string> = {
  birth: 'BIRT', death: 'DEAT', christening: 'CHR', burial: 'BURI',
  baptism: 'BAPM', confirmation: 'CONF', occupation: 'OCCU',
  residence: 'RESI', education: 'EDUC', emigration: 'EMIG',
  immigration: 'IMMI', naturalization: 'NATU', census: 'CENS',
  probate: 'PROB', will: 'WILL', graduation: 'GRAD', retirement: 'RETI',
  marriage: 'MARR', divorce: 'DIV', engagement: 'ENGA', adoption: 'ADOP',
  cremation: 'CREM', bar_mitzvah: 'BARM', bas_mitzvah: 'BASM',
  annulment: 'ANUL', marriage_license: 'MARL', separation: '_SEPR',
  ordination: 'ORDN', military: '_MILT',
  title: 'TITL', religion: 'RELI', description: 'DSCR', fact: 'FACT',
  other: 'EVEN',
};

/**
 * Emit `NO <event-tag>` substructures for events with `is_negation = 1`
 * attached to the given owner. Each negation row produces:
 *
 *     <baseLevel>   NO <eventTag>
 *     <baseLevel+1> DATE FROM <date_value> TO <date_value_end>
 *                                    (or `DATE <date_value>` when only one)
 *     <baseLevel+1> NOTE <notes>     (optional, multi-line via CONT)
 *
 * GEDCOM 7.0 only — on 5.5.1 the function emits nothing and pushes one
 * disclosure warning per dropped negation event into `warnings`.
 */
export async function emitNegationsForEntity(
  db: Database,
  ownerEntityType: 'person' | 'relationship',
  ownerEntityId: string,
  baseLevel: number,
  version: '5.5.1' | '7.0',
  lines: string[],
  warnings?: string[],
  prefetchedEvents?: Awaited<ReturnType<typeof getEventsForPerson>>,
): Promise<void> {
  const events = prefetchedEvents ?? (ownerEntityType === 'person'
    ? await getEventsForPerson(db, ownerEntityId)
    : await getEventsForRelationship(db, ownerEntityId));
  const negations = events.filter(ev => Boolean(ev.is_negation));
  if (negations.length === 0) return;

  for (const ev of negations) {
    const negType = ev.negation_event_type || ev.event_type || '';
    const tag = EVENT_TYPE_TO_TAG[negType] ?? null;
    if (!tag) {
      // Unknown event type — can't render as NO X; push a warning if available.
      warnings?.push(
        `Negation event with unknown type "${negType}" for ${ownerEntityType} ${ownerEntityId} dropped (no GEDCOM tag).`,
      );
      continue;
    }

    if (version === '5.5.1') {
      warnings?.push(
        `Negation event "${negType}" for ${ownerEntityType} ${ownerEntityId} dropped (5.5.1 spec has no NO tag).`,
      );
      continue;
    }

    // 7.0 emission.
    lines.push(`${baseLevel} NO ${tag}`);
    const from = ev.date_value ?? '';
    const to = ev.date_value_end ?? '';
    if (from && to) {
      lines.push(`${baseLevel + 1} DATE FROM ${from} TO ${to}`);
    } else if (from) {
      lines.push(`${baseLevel + 1} DATE ${from}`);
    } else if (to) {
      lines.push(`${baseLevel + 1} DATE TO ${to}`);
    }
    if (ev.notes && ev.notes.length > 0) {
      const noteLines = ev.notes.split(/\r?\n/);
      lines.push(`${baseLevel + 1} NOTE ${noteLines[0]}`);
      for (let i = 1; i < noteLines.length; i++) {
        lines.push(`${baseLevel + 2} CONT ${noteLines[i]}`);
      }
    }
  }
}
