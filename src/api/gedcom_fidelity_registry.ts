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
 *
 * Authoring guidance for new entries:
 *  - `lossless`     — column survives unchanged. Add ownedBy pointers to the
 *                     exporter/importer files that carry the value.
 *  - `lossless-via` — survives via an indirect mechanism (XREF identity, derived
 *                     relink, etc). Spell out the mechanism.
 *  - `lossy`        — column does not survive verbatim. `expectedAfterRoundTrip`
 *                     must return the value that *will* be present after
 *                     round-trip; the per-field test asserts equality.
 *  - `excluded`     — out of scope on purpose (audit metadata, derived columns).
 *                     Reason must explain why the column has no GEDCOM analog.
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

// ── Common shorthand statuses ─────────────────────────────────────────────────

const AUDIT_TS_EXCLUDED: FidelityStatus = {
  kind: 'excluded',
  reason: 'app-internal audit timestamp; no GEDCOM equivalent',
};
// PK / FK UUID columns: the LITERAL UUID string never survives a round-trip
// (the importer always issues fresh UUIDs). What IS preserved is the XREF
// cross-reference graph — "the FK still points to the same logical row".
// That graph-level identity is verified indirectly by every per-field test
// on a non-id column on a row that is reachable via FK from another row
// (for example, person_names.given_name passing implies the NAME survived
// under its INDI XREF, which means person_names.person_id resolves to the
// correct person). Per-field equality on the UUID string itself is therefore
// meaningless and the column is excluded here.
const UUID_PK_VIA_XREF: FidelityStatus = {
  kind: 'excluded',
  reason:
    'UUID re-issued on import; XREF cross-reference identity is preserved separately ' +
    '(any non-id column passing on a related row implicitly proves the link).',
};
const UUID_FK_VIA_XREF: FidelityStatus = {
  kind: 'excluded',
  reason:
    'FK target UUID re-issued on import; the XREF link to the related row is preserved ' +
    '(any non-id column passing on the related row implicitly proves the link).',
};

const EXPORTER = 'src/gedcom/exporter.ts';
const IMPORTER_PHASES = 'src/import/gedcom/phases.ts';
const IMPORTER_EVENTS = 'src/import/gedcom/event-importer.ts';
const IMPORTER_PLACE = 'src/import/gedcom/place-resolver.ts';
const IMPORTER_OBJE = 'src/import/gedcom/obje-importer.ts';

export const GEDCOM_FIDELITY: Record<string, FieldFidelity> = {
  // ----- persons -----
  'persons.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'persons.sex': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'persons.notes': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'persons.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },
  'persons.updated_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- person_names -----
  'person_names.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'person_names.person_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'person_names.given_name': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'person_names.surname': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'person_names.name_type': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'person_names.date_from': {
    v551: { kind: 'lossless-via', mechanism: 'custom 2 _DATE_FROM sub-tag' },
    v70: { kind: 'lossless-via', mechanism: 'custom 2 _DATE_FROM sub-tag' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'person_names.date_to': {
    v551: { kind: 'lossless-via', mechanism: 'custom 2 _DATE_TO sub-tag' },
    v70: { kind: 'lossless-via', mechanism: 'custom 2 _DATE_TO sub-tag' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'person_names.sort_order': {
    v551: {
      kind: 'lossy',
      reason: 'NAME order in INDI is preserved by emit order, but sort_order column itself resets to 0 on import',
      expectedAfterRoundTrip: () => 0,
    },
    v70: {
      kind: 'lossy',
      reason: 'NAME order in INDI is preserved by emit order, but sort_order column itself resets to 0 on import',
      expectedAfterRoundTrip: () => 0,
    },
    ownedBy: { importer: IMPORTER_PHASES },
  },
  'person_names.name_prefix': {
    v551: { kind: 'lossless-via', mechanism: 'standard 2 NPFX sub-tag' },
    v70: { kind: 'lossless-via', mechanism: 'standard 2 NPFX sub-tag' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'person_names.name_suffix': {
    v551: { kind: 'lossless-via', mechanism: 'standard 2 NSFX sub-tag' },
    v70: { kind: 'lossless-via', mechanism: 'standard 2 NSFX sub-tag' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'person_names.patronymic_base': {
    v551: { kind: 'lossless-via', mechanism: 'custom 2 _PATR sub-tag' },
    v70: { kind: 'lossless-via', mechanism: 'custom 2 _PATR sub-tag' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'person_names.name_qualifier': {
    v551: { kind: 'lossless-via', mechanism: 'custom 2 _NQUAL sub-tag' },
    v70: { kind: 'lossless-via', mechanism: 'custom 2 _NQUAL sub-tag' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'person_names.preferred_name': {
    v551: {
      kind: 'lossless-via',
      mechanism: "asterisk marker after the preferred token in given_name (e.g. 'Eva Linda* Marie')",
    },
    v70: {
      kind: 'lossless-via',
      mechanism: "asterisk marker after the preferred token in given_name (e.g. 'Eva Linda* Marie')",
    },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'person_names.nickname': {
    v551: { kind: 'lossless-via', mechanism: 'standard 2 NICK sub-tag' },
    v70: { kind: 'lossless-via', mechanism: 'standard 2 NICK sub-tag' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },

  // ----- person_identifiers -----
  'person_identifiers.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'person_identifiers.person_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'person_identifiers.identifier_type': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'person_identifiers.identifier_value': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'person_identifiers.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- relationships -----
  'relationships.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'relationships.type': {
    v551: {
      kind: 'lossless-via',
      mechanism: "couple → FAM record; sibling/godparent/other → ASSO with RELA",
    },
    v70: {
      kind: 'lossless-via',
      mechanism: "couple → FAM record; sibling/godparent/other → ASSO with RELA",
    },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'relationships.person1_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'relationships.person2_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'relationships.subtype': {
    v551: {
      kind: 'lossy',
      reason:
        "couple subtype emitted via custom 1 _SUBTYPE; parent_child subtype via PEDI under FAM CHIL. " +
        "Non-couple/non-parent_child relationship subtypes (sibling/godparent/other) are NOT emitted to GEDCOM " +
        "and reset to null on import.",
      expectedAfterRoundTrip: (seeded, ctx) => {
        const t = ctx?.row.type;
        if (t === 'couple') return seeded;
        if (t === 'parent_child') {
          // Exporter maps 'biological' → 'birth' and round-trips standard PEDI values verbatim.
          if (seeded === 'biological') return 'birth';
          return seeded ?? null;
        }
        return null;
      },
    },
    v70: {
      kind: 'lossy',
      reason:
        "couple subtype emitted via custom 1 _SUBTYPE; parent_child subtype via PEDI under FAM CHIL. " +
        "Non-couple/non-parent_child relationship subtypes (sibling/godparent/other) are NOT emitted to GEDCOM " +
        "and reset to null on import.",
      expectedAfterRoundTrip: (seeded, ctx) => {
        const t = ctx?.row.type;
        if (t === 'couple') return seeded;
        if (t === 'parent_child') {
          if (seeded === 'biological') return 'BIRTH';
          return typeof seeded === 'string' ? seeded.toUpperCase() : (seeded ?? null);
        }
        return null;
      },
    },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'relationships.notes': {
    v551: {
      kind: 'lossy',
      reason:
        "Couple notes emitted via custom 1 _RELNOTES under FAM and round-tripped. " +
        "Non-couple relationship notes (sibling/godparent/other and parent_child) are NOT emitted " +
        "and reset to '' on import.",
      expectedAfterRoundTrip: (seeded, ctx) => {
        return ctx?.row.type === 'couple' ? seeded : '';
      },
    },
    v70: {
      kind: 'lossy',
      reason:
        "Couple notes emitted via custom 1 _RELNOTES under FAM and round-tripped. " +
        "Non-couple relationship notes (sibling/godparent/other and parent_child) are NOT emitted " +
        "and reset to '' on import.",
      expectedAfterRoundTrip: (seeded, ctx) => {
        return ctx?.row.type === 'couple' ? seeded : '';
      },
    },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'relationships.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },
  'relationships.updated_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- places -----
  'places.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'places.name': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PLACE },
  },
  'places.normalized_name': {
    v551: {
      kind: 'excluded',
      reason: 'derived from name at write time (lowercase + strip diacritics); not authored',
    },
    v70: {
      kind: 'excluded',
      reason: 'derived from name at write time (lowercase + strip diacritics); not authored',
    },
  },
  'places.place_type': {
    v551: { kind: 'lossless-via', mechanism: 'custom _PTYPE sub-tag under PLAC' },
    v70: { kind: 'lossless-via', mechanism: 'custom _PTYPE sub-tag under PLAC' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PLACE },
  },
  'places.latitude': {
    v551: { kind: 'lossless-via', mechanism: 'standard MAP/LATI sub-tag under PLAC (5-decimal precision)' },
    v70: { kind: 'lossless-via', mechanism: 'standard MAP/LATI sub-tag under PLAC (5-decimal precision)' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PLACE },
  },
  'places.longitude': {
    v551: { kind: 'lossless-via', mechanism: 'standard MAP/LONG sub-tag under PLAC (5-decimal precision)' },
    v70: { kind: 'lossless-via', mechanism: 'standard MAP/LONG sub-tag under PLAC (5-decimal precision)' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PLACE },
  },
  'places.parent_place_id': {
    v551: {
      kind: 'lossy',
      reason:
        'place hierarchy is encoded only in the comma-separated PLAC name; the explicit parent FK is not emitted ' +
        'and is rebuilt on import only when name parsing produces a parent place. Direct FK round-trip is not guaranteed.',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason:
        'place hierarchy is encoded only in the comma-separated PLAC name; the explicit parent FK is not emitted ' +
        'and is rebuilt on import only when name parsing produces a parent place. Direct FK round-trip is not guaranteed.',
      expectedAfterRoundTrip: () => null,
    },
  },
  'places.date_from': {
    v551: { kind: 'lossless-via', mechanism: 'custom _DATE_FROM sub-tag under PLAC' },
    v70: { kind: 'lossless-via', mechanism: 'custom _DATE_FROM sub-tag under PLAC' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PLACE },
  },
  'places.date_to': {
    v551: { kind: 'lossless-via', mechanism: 'custom _DATE_TO sub-tag under PLAC' },
    v70: { kind: 'lossless-via', mechanism: 'custom _DATE_TO sub-tag under PLAC' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PLACE },
  },
  'places.notes': {
    v551: { kind: 'lossless-via', mechanism: 'custom _PNOTES sub-tag under PLAC' },
    v70: { kind: 'lossless-via', mechanism: 'custom _PNOTES sub-tag under PLAC' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PLACE },
  },
  'places.street': {
    v551: { kind: 'lossless-via', mechanism: 'standard ADDR/ADR1 sub-tag under PLAC' },
    v70: { kind: 'lossless-via', mechanism: 'standard ADDR/ADR1 sub-tag under PLAC' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PLACE },
  },
  'places.postal_code': {
    v551: { kind: 'lossless-via', mechanism: 'standard ADDR/POST sub-tag under PLAC' },
    v70: { kind: 'lossless-via', mechanism: 'standard ADDR/POST sub-tag under PLAC' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PLACE },
  },
  'places.city': {
    v551: { kind: 'lossless-via', mechanism: 'standard ADDR/CITY sub-tag under PLAC' },
    v70: { kind: 'lossless-via', mechanism: 'standard ADDR/CITY sub-tag under PLAC' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PLACE },
  },
  'places.country': {
    v551: { kind: 'lossless-via', mechanism: 'standard ADDR/CTRY sub-tag under PLAC' },
    v70: { kind: 'lossless-via', mechanism: 'standard ADDR/CTRY sub-tag under PLAC' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PLACE },
  },

  // ----- events -----
  'events.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'events.event_type': {
    v551: { kind: 'lossless-via', mechanism: 'EVENT_TYPE_TO_TAG mapping (e.g. birth → BIRT)' },
    v70: { kind: 'lossless-via', mechanism: 'EVENT_TYPE_TO_TAG mapping (e.g. birth → BIRT)' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_EVENTS },
  },
  'events.date_type': {
    v551: { kind: 'lossless-via', mechanism: 'GEDCOM DATE keyword (ABT/BEF/AFT/BET/CAL) parsed back into date_type' },
    v70: { kind: 'lossless-via', mechanism: 'GEDCOM DATE keyword (ABT/BEF/AFT/BET/CAL) parsed back into date_type' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_EVENTS },
  },
  'events.date_value': {
    v551: { kind: 'lossless-via', mechanism: 'reformatted via formatGedcomDate / parseGedcomDate' },
    v70: { kind: 'lossless-via', mechanism: 'reformatted via formatGedcomDate / parseGedcomDate' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_EVENTS },
  },
  'events.date_value_end': {
    v551: { kind: 'lossless-via', mechanism: 'BET..AND date range parsed back to date_value/date_value_end' },
    v70: { kind: 'lossless-via', mechanism: 'BET..AND date range parsed back to date_value/date_value_end' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_EVENTS },
  },
  'events.date_original': {
    v551: { kind: 'lossless-via', mechanism: 'emitted as DATE line value; re-parsed back into date_original' },
    v70: { kind: 'lossless-via', mechanism: 'GEDCOM 7.0 DATE PHRASE for non-standard dates; line value otherwise' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_EVENTS },
  },
  'events.place_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'events.value': {
    v551: {
      kind: 'lossy',
      reason:
        'For fact-shaped event types (occupation, religion, education, title, description, fact) the value ' +
        'is emitted on the same line as the tag and round-trips. For other event types (birth, death, etc.) ' +
        "the value is emitted but the importer doesn't accept stray line values for non-fact tags — they get " +
        "appended to notes as '[unmapped line value: ...]' instead, so events.value resets to null.",
      expectedAfterRoundTrip: (seeded, ctx) => {
        // Mirror the FACT_VALUE_GEDCOM_TAGS / EVENT_TYPE_TO_TAG behaviour:
        // fact-shaped event types preserve value, others lose it.
        const factTypes = new Set(['occupation', 'religion', 'education', 'title', 'description', 'fact']);
        const t = ctx?.row.event_type;
        return typeof t === 'string' && factTypes.has(t) ? seeded : null;
      },
    },
    v70: {
      kind: 'lossy',
      reason:
        'Same as 5.5.1: only fact-shaped event types preserve the line value. Non-fact tags lose events.value ' +
        'because the importer treats stray line values as unmapped and routes them into notes.',
      expectedAfterRoundTrip: (seeded, ctx) => {
        const factTypes = new Set(['occupation', 'religion', 'education', 'title', 'description', 'fact']);
        const t = ctx?.row.event_type;
        return typeof t === 'string' && factTypes.has(t) ? seeded : null;
      },
    },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_EVENTS },
  },
  'events.notes': {
    v551: { kind: 'lossless-via', mechanism: 'standard NOTE sub-tag (TYPE prefix marker stripped on round-trip)' },
    v70: { kind: 'lossless-via', mechanism: 'standard NOTE sub-tag (TYPE prefix marker stripped on round-trip)' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_EVENTS },
  },
  'events.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },
  'events.updated_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },
  'events.relationship_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'events.cause': {
    v551: { kind: 'lossless-via', mechanism: 'standard CAUS sub-tag' },
    v70: { kind: 'lossless-via', mechanism: 'standard CAUS sub-tag' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_EVENTS },
  },
  'events.place_address': {
    v551: {
      kind: 'lossy',
      reason:
        'exporter does not emit place_address (no GEDCOM tag wired up; ExportReport.excluded surfaces the loss). ' +
        'Column resets to null on import.',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason:
        'exporter does not emit place_address (no GEDCOM tag wired up). Column resets to null on import.',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },

  // ----- event_participants -----
  'event_participants.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'event_participants.event_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'event_participants.person_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'event_participants.role': {
    v551: { kind: 'lossless-via', mechanism: "ASSO RELA value (or implicit 'primary' for the INDI owning the event)" },
    v70: { kind: 'lossless-via', mechanism: "ASSO RELA value (or implicit 'primary' for the INDI owning the event)" },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },

  // ----- sources -----
  'sources.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'sources.title': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'sources.author': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'sources.publication_info': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'sources.repository': {
    v551: { kind: 'lossless-via', mechanism: 'custom 1 _REPO_TEXT sub-tag (free-text repository name on the source)' },
    v70: { kind: 'lossless-via', mechanism: 'custom 1 _REPO_TEXT sub-tag (free-text repository name on the source)' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'sources.url': {
    v551: { kind: 'lossless-via', mechanism: 'custom 1 _URL sub-tag' },
    v70: { kind: 'lossless-via', mechanism: 'custom 1 _URL sub-tag' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'sources.source_type': {
    v551: { kind: 'lossless-via', mechanism: 'custom 1 _STYPE sub-tag' },
    v70: { kind: 'lossless-via', mechanism: 'custom 1 _STYPE sub-tag' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'sources.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },
  'sources.updated_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },
  'sources.call_number': {
    v551: {
      kind: 'lossy',
      reason: 'exporter does not emit sources.call_number; column resets to null on import',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'exporter does not emit sources.call_number; column resets to null on import',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'sources.abstract': {
    v551: {
      kind: 'lossy',
      reason: 'exporter does not emit sources.abstract; column resets to null on import',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'exporter does not emit sources.abstract; column resets to null on import',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },

  // ----- citations -----
  'citations.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'citations.source_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'citations.page': {
    v551: { kind: 'lossless-via', mechanism: 'standard PAGE sub-tag under SOUR' },
    v70: { kind: 'lossless-via', mechanism: 'standard PAGE sub-tag under SOUR' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'citations.date_accessed': {
    v551: { kind: 'lossless-via', mechanism: 'custom _ACCESSED sub-tag under SOUR' },
    v70: { kind: 'lossless-via', mechanism: 'custom _ACCESSED sub-tag under SOUR' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'citations.confidence': {
    v551: { kind: 'lossless-via', mechanism: 'standard QUAY sub-tag under SOUR (clamped 0..3)' },
    v70: { kind: 'lossless-via', mechanism: 'standard QUAY sub-tag under SOUR (clamped 0..3)' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'citations.transcription': {
    v551: {
      kind: 'lossy',
      reason:
        'event-level citations round-trip transcription via DATA/TEXT. Person-level, family-level and place-level ' +
        'citation phases do NOT read DATA/TEXT back, so transcription is preserved only when the citation is ' +
        'attached to an event.',
      expectedAfterRoundTrip: (seeded, ctx) => {
        return ctx?.row.event_id ? seeded : '';
      },
    },
    v70: {
      kind: 'lossy',
      reason:
        'event-level citations round-trip transcription via DATA/TEXT. Person/family/place citation phases ' +
        'do not read DATA/TEXT back, so transcription is preserved only when the citation is attached to an event.',
      expectedAfterRoundTrip: (seeded, ctx) => {
        return ctx?.row.event_id ? seeded : '';
      },
    },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_EVENTS },
  },
  'citations.notes': {
    v551: { kind: 'lossless-via', mechanism: 'standard NOTE sub-tag under SOUR' },
    v70: { kind: 'lossless-via', mechanism: 'standard NOTE sub-tag under SOUR' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'citations.event_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'citations.person_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'citations.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },
  'citations.relationship_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'citations.place_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },

  // ----- groups -----
  'groups.id': {
    v551: {
      kind: 'lossy',
      reason: 'groups have no GEDCOM 5.5.1 representation; entire row is dropped on export. Surfaced in ExportReport.excluded.',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'groups have no GEDCOM 7.0 representation; entire row is dropped on export.',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'groups.name': {
    v551: {
      kind: 'lossy',
      reason: 'groups not emitted to GEDCOM; row is dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'groups not emitted to GEDCOM; row is dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'groups.notes': {
    v551: {
      kind: 'lossy',
      reason: 'groups not emitted to GEDCOM; row is dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'groups not emitted to GEDCOM; row is dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'groups.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- group_links -----
  'group_links.id': {
    v551: {
      kind: 'lossy',
      reason: 'group memberships are not emitted to GEDCOM; row is dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'group memberships are not emitted to GEDCOM; row is dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'group_links.group_id': {
    v551: {
      kind: 'lossy',
      reason: 'group memberships not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'group memberships not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'group_links.entity_type': {
    v551: {
      kind: 'lossy',
      reason: 'group memberships not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'group memberships not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'group_links.entity_id': {
    v551: {
      kind: 'lossy',
      reason: 'group memberships not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'group memberships not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'group_links.sort_order': {
    v551: {
      kind: 'lossy',
      reason: 'group memberships not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'group memberships not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'group_links.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- repositories -----
  'repositories.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'repositories.name': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'repositories.address': {
    v551: { kind: 'lossless-via', mechanism: 'standard 1 ADDR line value (or ADR1 sub-tag)' },
    v70: { kind: 'lossless-via', mechanism: 'standard 1 ADDR line value (or ADR1 sub-tag)' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'repositories.city': {
    v551: { kind: 'lossless-via', mechanism: 'standard 2 CITY sub-tag under ADDR' },
    v70: { kind: 'lossless-via', mechanism: 'standard 2 CITY sub-tag under ADDR' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'repositories.postal_code': {
    v551: { kind: 'lossless-via', mechanism: 'standard 2 POST sub-tag under ADDR' },
    v70: { kind: 'lossless-via', mechanism: 'standard 2 POST sub-tag under ADDR' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'repositories.state': {
    v551: { kind: 'lossless-via', mechanism: 'standard 2 STAE sub-tag under ADDR' },
    v70: { kind: 'lossless-via', mechanism: 'standard 2 STAE sub-tag under ADDR' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'repositories.country': {
    v551: { kind: 'lossless-via', mechanism: 'standard 2 CTRY sub-tag under ADDR' },
    v70: { kind: 'lossless-via', mechanism: 'standard 2 CTRY sub-tag under ADDR' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'repositories.phone': {
    v551: { kind: 'lossless-via', mechanism: 'standard 1 PHON sub-tag' },
    v70: { kind: 'lossless-via', mechanism: 'standard 1 PHON sub-tag' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'repositories.email': {
    v551: { kind: 'lossless-via', mechanism: 'standard 1 EMAIL sub-tag' },
    v70: { kind: 'lossless-via', mechanism: 'standard 1 EMAIL sub-tag' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'repositories.web': {
    v551: { kind: 'lossless-via', mechanism: 'standard 1 WWW sub-tag' },
    v70: { kind: 'lossless-via', mechanism: 'standard 1 WWW sub-tag' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'repositories.call_number': {
    v551: {
      kind: 'lossy',
      reason: 'exporter does not emit repositories.call_number; column resets to null on import',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'exporter does not emit repositories.call_number; column resets to null on import',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'repositories.notes': {
    v551: { kind: 'lossless-via', mechanism: 'standard 1 NOTE sub-tag under REPO' },
    v70: { kind: 'lossless-via', mechanism: 'standard 1 NOTE sub-tag under REPO' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'repositories.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- source_repositories -----
  'source_repositories.source_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'source_repositories.repository_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },

  // ----- research_tasks -----
  'research_tasks.id': {
    v551: {
      kind: 'lossy',
      reason: 'research tasks have no standard GEDCOM 5.5.1 representation; row is dropped on export. ExportReport.excluded surfaces the loss.',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'research tasks have no standard GEDCOM 7.0 representation; row is dropped on export.',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'research_tasks.priority': {
    v551: {
      kind: 'lossy',
      reason: 'research tasks not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'research tasks not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'research_tasks.status': {
    v551: {
      kind: 'lossy',
      reason: 'research tasks not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'research tasks not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'research_tasks.task': {
    v551: {
      kind: 'lossy',
      reason: 'research tasks not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'research tasks not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'research_tasks.notes': {
    v551: {
      kind: 'lossy',
      reason: 'research tasks not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'research tasks not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'research_tasks.result': {
    v551: {
      kind: 'lossy',
      reason: 'research tasks not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'research tasks not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'research_tasks.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },
  'research_tasks.updated_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- task_links -----
  'task_links.id': {
    v551: {
      kind: 'lossy',
      reason: 'task links not emitted (research tasks are dropped); row is dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'task links not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'task_links.task_id': {
    v551: {
      kind: 'lossy',
      reason: 'task links not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'task links not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'task_links.entity_type': {
    v551: {
      kind: 'lossy',
      reason: 'task links not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'task links not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'task_links.entity_id': {
    v551: {
      kind: 'lossy',
      reason: 'task links not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'task links not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'task_links.sort_order': {
    v551: {
      kind: 'lossy',
      reason: 'task links not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'task links not emitted; row dropped',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'task_links.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- media -----
  'media.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'media.file_ref': {
    v551: { kind: 'lossless-via', mechanism: 'standard 2 FILE sub-tag under OBJE' },
    v70: { kind: 'lossless-via', mechanism: 'standard 2 FILE sub-tag under OBJE' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_OBJE },
  },
  'media.title': {
    v551: { kind: 'lossless-via', mechanism: 'standard 2 TITL sub-tag under OBJE' },
    v70: { kind: 'lossless-via', mechanism: 'standard 2 TITL sub-tag under OBJE' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_OBJE },
  },
  'media.format': {
    v551: { kind: 'lossless-via', mechanism: 'standard 2 FORM sub-tag under OBJE' },
    v70: { kind: 'lossless-via', mechanism: 'standard 2 FORM sub-tag under OBJE' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_OBJE },
  },
  'media.notes': {
    v551: { kind: 'lossless-via', mechanism: 'standard 2 NOTE sub-tag under OBJE' },
    v70: { kind: 'lossless-via', mechanism: 'standard 2 NOTE sub-tag under OBJE' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_OBJE },
  },
  'media.is_printable': {
    v551: {
      kind: 'lossy',
      reason: "exporter does not emit is_printable; importer always sets it to false (0). User-authored value is lost on round-trip.",
      expectedAfterRoundTrip: () => 0,
    },
    v70: {
      kind: 'lossy',
      reason: "exporter does not emit is_printable; importer always sets it to false (0).",
      expectedAfterRoundTrip: () => 0,
    },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_OBJE },
  },
  'media.is_missing': {
    v551: {
      kind: 'excluded',
      reason: 'derived at import time from filesystem existsSync(file_ref); not authored by the user',
    },
    v70: {
      kind: 'excluded',
      reason: 'derived at import time from filesystem existsSync(file_ref); not authored by the user',
    },
  },
  'media.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- media_links -----
  'media_links.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'media_links.media_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'media_links.entity_type': {
    v551: {
      kind: 'excluded',
      reason:
        'derived at import from the parent GEDCOM record nesting the OBJE block; ' +
        'the literal value of the entity_type column is determined by where the importer ' +
        'sees the OBJE, not preserved from the exporter side. The link as a whole is verified ' +
        'by golden round-trip tests.',
    },
    v70: {
      kind: 'excluded',
      reason:
        'derived at import from the parent GEDCOM record nesting the OBJE block; ' +
        'the literal value of the entity_type column is determined by where the importer ' +
        'sees the OBJE, not preserved from the exporter side. The link as a whole is verified ' +
        'by golden round-trip tests.',
    },
  },
  'media_links.entity_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'media_links.link_type': {
    v551: {
      kind: 'lossy',
      reason: 'exporter does not emit media_links.link_type; column resets to null on import',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'exporter does not emit media_links.link_type; column resets to null on import',
      expectedAfterRoundTrip: () => null,
    },
    ownedBy: { exporter: EXPORTER },
  },
  'media_links.sort_order': {
    v551: {
      kind: 'lossy',
      reason:
        'relative ordering between sibling OBJE blocks under the same parent IS preserved (the exporter ' +
        'emits OBJE in DB sort_order and the importer assigns sort_order from emit position 0..n-1), but the ' +
        'absolute integer value of sort_order is NOT preserved — re-import always restarts numbering from 0. ' +
        'Use the relative golden test to verify ordering; the per-field test asserts the post-import 0-based number.',
      expectedAfterRoundTrip: () => 0,
    },
    v70: {
      kind: 'lossy',
      reason:
        'relative ordering between sibling OBJE blocks IS preserved; absolute integer value is NOT — ' +
        'importer always re-numbers from 0 on import.',
      expectedAfterRoundTrip: () => 0,
    },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'media_links.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },
};
