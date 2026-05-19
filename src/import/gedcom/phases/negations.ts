// ── Phase (T02 stub): NO X negative-assertion records ─────────────────────
//
// GEDCOM 7.0 NO substructures (e.g. `NO BIRT`, `NO MARR`) record the
// explicit *absence* of an event. 5.5.1 has no equivalent.
//
// Stub: parses zero NO blocks. T06 implements:
//   - read `NO <event-tag>` blocks under each INDI / FAM in ctx.tree
//   - synthesize an event row with `is_negation = 1` and
//     `negation_event_type = <reverse-mapped event_type>`
//   - bulk-insert via bulkCreateEvents (reused from existing event flow)
//   - link participants for INDI-owned negations; relationship_id for
//     FAM-owned negations
//
// Wired into import-core.ts after phaseAsso (so person/relationship rows
// exist to attach to).

import type { ImportContext } from '../import-types';

export async function phaseNegations(_ctx: ImportContext): Promise<void> {
  // T06 implements.
}
