// ── Phase (T02 stub): NAME / PLAC TRAN translations ───────────────────────
//
// GEDCOM 7.0 NAME and PLAC both accept TRAN substructures with LANG and
// TYPE (transliteration scheme) qualifiers. Stub: parses zero TRAN blocks.
//
// T07 implements:
//   - walk INDI NAMEs, collect TRAN children, insert into name_translations
//   - walk PLAC nodes (both event-level and top-level _PLAC), collect TRAN
//     children, insert into place_translations
//   - bulk-insert via runBatch
//
// Wired into import-core.ts after phaseIndividuals + phasePlaceCitations
// (so person_names + places exist to attach to).

import type { ImportContext } from '../import-types';

export async function phaseTranslations(_ctx: ImportContext): Promise<void> {
  // T07 implements.
}
