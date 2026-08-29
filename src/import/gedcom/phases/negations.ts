// ── Phase (T06): NO X negative-assertion records ──────────────────────────
//
// GEDCOM 7.0 `NO X` substructures (e.g. `NO BIRT`, `NO MARR`) record the
// explicit *absence* of an event. 5.5.1 has no equivalent.
//
// Implementation:
//   - Walk ctx.originalTree for INDI / FAM records.
//   - For each direct `NO <tag>` child, reverse-map the tag → event_type
//     and synthesize an `events` row with `is_negation = 1` and
//     `negation_event_type = <event_type>`.
//   - Pull DATE / NOTE sub-children for the row's date_value /
//     date_value_end / notes fields.
//   - For INDI-owned negations: insert an `event_participants` row with
//     role='primary' so getEventsForPerson returns the row.
//   - For FAM-owned negations: set events.relationship_id to the couple
//     relationship id (looked up by HUSB/WIFE → personMap).
//
// On 5.5.1 input there is no NO tag, so the phase is effectively a no-op.

import type { ImportContext } from '../import-types';
import { createEvent } from '../../../api/events';
import { addEventParticipant, listRelationships } from '../../../api/relationships';
import { getChildren, getChild } from '../node-utils';

// Reverse of the exporter's EVENT_TYPE_TO_TAG map.
const TAG_TO_EVENT_TYPE: Record<string, string> = {
  BIRT: 'birth', DEAT: 'death', CHR: 'christening', BURI: 'burial',
  BAPM: 'baptism', CONF: 'confirmation', OCCU: 'occupation',
  RESI: 'residence', EDUC: 'education', EMIG: 'emigration',
  IMMI: 'immigration', NATU: 'naturalization', CENS: 'census',
  PROB: 'probate', WILL: 'will', GRAD: 'graduation', RETI: 'retirement',
  MARR: 'marriage', DIV: 'divorce', ENGA: 'engagement', ADOP: 'adoption',
  CREM: 'cremation', BARM: 'bar_mitzvah', BASM: 'bas_mitzvah',
  ANUL: 'annulment', MARL: 'marriage_license', _SEPR: 'separation',
  _DOMESTIC_PARTNERSHIP: 'cohabitation',
  ORDN: 'ordination', _MILT: 'military',
  TITL: 'title', RELI: 'religion', DSCR: 'description', FACT: 'fact',
  EVEN: 'other',
};

/** Parse a NO X DATE sub-node value into (from, to) for SQLite columns.
 *  Supports `FROM <d> TO <d>`, `FROM <d>`, `TO <d>`, and bare `<d>`. */
function parseDateRange(raw: string): { from: string; to: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { from: '', to: '' };
  const m = trimmed.match(/^FROM\s+(.+?)\s+TO\s+(.+)$/i);
  if (m) return { from: m[1].trim(), to: m[2].trim() };
  const fromOnly = trimmed.match(/^FROM\s+(.+)$/i);
  if (fromOnly) return { from: fromOnly[1].trim(), to: '' };
  const toOnly = trimmed.match(/^TO\s+(.+)$/i);
  if (toOnly) return { from: '', to: toOnly[1].trim() };
  return { from: trimmed, to: '' };
}

export async function phaseNegations(ctx: ImportContext): Promise<void> {
  const source = ctx.originalTree ?? ctx.tree;

  // Pre-build a FAM xref → couple-id map for FAM-owned negations. Couples
  // are matched by translated (person1_id, person2_id) pair.
  const couples = (await listRelationships(ctx.db)).filter(r => r.type === 'couple');
  const couplesByPair = new Map<string, string>();
  for (const c of couples) {
    if (c.person1_id && c.person2_id) {
      couplesByPair.set(`${c.person1_id}|${c.person2_id}`, c.id);
      couplesByPair.set(`${c.person2_id}|${c.person1_id}`, c.id);
    }
  }
  const famXrefToCoupleId = new Map<string, string>();
  for (const node of source) {
    if (node.tag !== 'FAM' || !node.xref) continue;
    const husb = getChild(node, 'HUSB')?.value;
    const wife = getChild(node, 'WIFE')?.value;
    const husbId = husb ? ctx.personMap.get(husb) : undefined;
    const wifeId = wife ? ctx.personMap.get(wife) : undefined;
    if (husbId && wifeId) {
      const id = couplesByPair.get(`${husbId}|${wifeId}`);
      if (id) famXrefToCoupleId.set(node.xref, id);
    }
  }

  for (const node of source) {
    if (!node.xref) continue;

    if (node.tag === 'INDI') {
      const personId = ctx.personMap.get(node.xref);
      if (!personId) continue;
      for (const noNode of getChildren(node, 'NO')) {
        const tag = (noNode.value ?? '').trim().toUpperCase();
        const eventType = TAG_TO_EVENT_TYPE[tag];
        if (!eventType) {
          ctx.noCount++;
          continue;
        }
        const dateRaw = getChild(noNode, 'DATE')?.value ?? '';
        const { from, to } = parseDateRange(dateRaw);
        const notes = getChild(noNode, 'NOTE')?.value ?? '';
        const dateType: 'between' | 'unknown' | 'exact' =
          from && to ? 'between' : from ? 'exact' : 'unknown';
        const ev = await createEvent(ctx.db, {
          event_type: eventType,
          date_type: dateType,
          date_value: from || null,
          date_value_end: to || null,
          notes,
          is_negation: true,
          negation_event_type: eventType,
        });
        await addEventParticipant(ctx.db, {
          event_id: ev.id,
          person_id: personId,
          role: 'primary',
        });
        ctx.noCount++;
      }
    } else if (node.tag === 'FAM') {
      const couple_id = famXrefToCoupleId.get(node.xref);
      if (!couple_id) continue;
      for (const noNode of getChildren(node, 'NO')) {
        const tag = (noNode.value ?? '').trim().toUpperCase();
        const eventType = TAG_TO_EVENT_TYPE[tag];
        if (!eventType) {
          ctx.noCount++;
          continue;
        }
        const dateRaw = getChild(noNode, 'DATE')?.value ?? '';
        const { from, to } = parseDateRange(dateRaw);
        const notes = getChild(noNode, 'NOTE')?.value ?? '';
        const dateType: 'between' | 'unknown' | 'exact' =
          from && to ? 'between' : from ? 'exact' : 'unknown';
        await createEvent(ctx.db, {
          event_type: eventType,
          relationship_id: couple_id,
          date_type: dateType,
          date_value: from || null,
          date_value_end: to || null,
          notes,
          is_negation: true,
          negation_event_type: eventType,
        });
        ctx.noCount++;
      }
    }
  }
}
