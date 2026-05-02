/**
 * GEDCOM round-trip fidelity registry.
 *
 * For every (table, column) pair in the schema, declares whether the value
 * survives DB → GEDCOM → DB round-trip under each GEDCOM version, and what
 * the expected post-round-trip value is for lossy fields.
 *
 * See: docs/plans/2026-05-02-gedcom-roundtrip-fidelity-design.md
 * See: CLAUDE.md "⚠️ Prime Directive (cont.): Round-Trip Fidelity"
 *
 * Adding or renaming a column to schema.ts requires updating this file.
 * The coverage-guard test in tests/unit/gedcom-fidelity-registry-coverage.test.ts
 * fails CI if a column is missing here.
 */

export type FidelityStatus =
  | { kind: 'lossless' }
  | { kind: 'lossless-via'; mechanism: string }
  | {
      kind: 'lossy';
      reason: string;
      // Given the seeded value (and optionally the row context), returns the
      // expected post-round-trip value. Tests assert equality against this.
      // Returning the seeded value unchanged means "lossless in practice for
      // this column type" — use the lossless variant instead in that case.
      expectedAfterRoundTrip: (seeded: unknown, ctx?: RoundTripContext) => unknown;
    }
  | { kind: 'excluded'; reason: string };

export interface RoundTripContext {
  // Other column values on the same row, in case the lossy expectation
  // depends on them (e.g. events.value's 5.5.1 expectation depends on event_type).
  row: Record<string, unknown>;
}

export interface FieldFidelity {
  v551: FidelityStatus;
  v70: FidelityStatus;
  // Optional pointers to the code that owns this round-trip. Surfaced in
  // failure messages so a regression points the developer at the right file.
  ownedBy?: { exporter?: string; importer?: string };
}

export const GEDCOM_FIDELITY: Record<string, FieldFidelity> = {
  // Populated in Task 5. The coverage-guard test will fail until then —
  // that is intentional; it proves the test works.
};
