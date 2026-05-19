// ── Phase (T02 stub): SOUR DATA/EVEN coverage events ──────────────────────
//
// GEDCOM 5.5.1 + 7.0 SOUR DATA/EVEN records what events / date ranges /
// places a source covers — distinct from inline SOUR citations which
// attach a source to a specific authored event.
//
// Stub: parses zero DATA/EVEN blocks. T08 implements:
//   - walk SOUR records, find DATA / EVEN children
//   - extract event_type, date_value_from, date_value_to, place_id, notes
//   - bulk-insert into source_coverage_events via runBatch
//
// Wired into import-core.ts after phaseSources (so sources rows exist).

import type { ImportContext } from '../import-types';

export async function phaseCoverage(_ctx: ImportContext): Promise<void> {
  // T08 implements.
}
