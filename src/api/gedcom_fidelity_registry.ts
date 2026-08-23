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
 * T09 extension context (2026-05-20 GEDCOM-alignment plan):
 *  - `persons.sex='X'` round-trips lossless on 7.0; on 5.5.1 it downgrades
 *    to 'U' with an ExportReport.warnings entry. Modelled as a per-field
 *    lossy entry below.
 *  - `db_settings.header_metadata`: not a registry entry because db_settings
 *    is row-keyed (key/value), not column-tracked. The originating-app HEAD
 *    block (SOUR/NAME/CORP/VERS/LANG/COPR) is captured at import time and
 *    re-emitted via a custom `1 _ORIG_SOUR <json>` extension on the HEAD
 *    block of both 5.5.1 and 7.0 exports. Round-trip verified by
 *    tests/unit/gedcom-head-preservation.test.ts.
 *  - `events.date_type` adds `interpreted` (GEDCOM INT) and `from_to` (GEDCOM
 *    FROM..TO range with directionality, distinct from BET..AND `between`).
 *
 * T03 corner-case context (2026-05-19 GEDCOM-alignment plan):
 *  - Single-parent FAM: orphan parent_child rows now emit a synthetic FAM
 *    record (HUSB or WIFE chosen by sex). Round-trips on both versions.
 *  - PEDI per-parent: a child can have different parent_child subtypes per
 *    parent in the same FAM. Exporter emits the non-biological subtype
 *    first; the importer reads a single PEDI per CHIL ("first wins"), so
 *    a step + biological pair re-imports as step/step on both rows. The
 *    custom `3 _PARENT` disambiguator (7.0 only) is a write-only audit
 *    trail until the importer reads it.
 *  - Multi-parent triad: a child with 3+ parent_child rows is lossless on
 *    7.0 (extras emit as `1 ASSO @Ix@ / 2 ROLE PARENT` on the couple FAM)
 *    and lossy on 5.5.1 (extras dropped + one warning per row in
 *    ExportReport.warnings — there is no spec slot for a 3rd parent under
 *    a single FAM). The per-row drop is not represented in the registry
 *    because it's a row-existence drop (the parent_child row itself
 *    disappears), not a per-column degradation; the disclosure surface is
 *    `ExportReport.warnings`, which the per-field tests don't consult.
 *    See tests/unit/gedcom-roundtrip-corner-cases.test.ts for the
 *    mechanical assertion.
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
    // T09: GEDCOM 7.0 added 'X' (intersex) as a valid SEX value. 5.5.1 only
    // permits M/F/U — on 5.5.1 export, an authored 'X' downgrades to 'U' and
    // the export report's `warnings[]` discloses the loss.
    v551: {
      kind: 'lossy',
      reason: '5.5.1-spec-limit: SEX X (intersex) not in 5.5.1 vocab (only M/F/U); downgrades to U',
      expectedAfterRoundTrip: (seeded) => (seeded === 'X' ? 'U' : seeded),
    },
    v70: { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'persons.notes': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'persons.display_id': {
    v551: { kind: 'excluded', reason: 'per-database integer ordering label; not GEDCOM-representable, re-assigned on import in created_at order' },
    v70: { kind: 'excluded', reason: 'per-database integer ordering label; not GEDCOM-representable, re-assigned on import in created_at order' },
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

  // ----- external_identifiers -----
  // Round-trip storage for source-format ids. Only two (entity_type, system)
  // pairs have a tag to travel in today: a source's `arkivdigital` id becomes
  // `1 _AID` on the SOUR record, and a place's `arkivdigital.parish` id becomes
  // `_PARISH_AID` inside the reconstructed `_ADPL` block. Both are verified by
  // tests/unit/import-arkivdigital-identifiers.test.ts.
  //
  // Declared `lossy` rather than `lossless` because the columns are generic: a
  // row with any other system — a Gramps handle, a Genney RID — has no tag to
  // carry it yet and does not come back. Claiming lossless here would be an
  // overclaim the per-field test correctly refuses.
  'external_identifiers.id':          { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'external_identifiers.entity_id':   { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'external_identifiers.entity_type': {
    v551: { kind: 'lossy', reason: 'only source + place rows have an emitting tag; other entity types are dropped', expectedAfterRoundTrip: () => null },
    v70:  { kind: 'lossy', reason: 'only source + place rows have an emitting tag; other entity types are dropped', expectedAfterRoundTrip: () => null },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'external_identifiers.system': {
    v551: { kind: 'lossy', reason: 'only the arkivdigital and arkivdigital.parish systems have an emitting tag', expectedAfterRoundTrip: () => null },
    v70:  { kind: 'lossy', reason: 'only the arkivdigital and arkivdigital.parish systems have an emitting tag', expectedAfterRoundTrip: () => null },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  // The value itself round-trips: it is the payload of `_AID` / `_PARISH_AID`.
  // What is lossy is which (entity_type, system) pairs have a tag at all.
  'external_identifiers.value': {
    v551: { kind: 'lossless' },
    v70:  { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'external_identifiers.created_at':  { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

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
        "Multi-carrier note: couple notes emit via custom 1 _RELNOTES under FAM; " +
        "sibling / godparent / other notes emit via custom 2 _RELA_NOTE under ASSO. " +
        "Multi-line notes are split across CONT continuation lines on export and rejoined " +
        "by the parser on import, so embedded newlines round-trip byte-identical for those " +
        "four types. parent_child notes remain lossy — the parent_child relationship rides " +
        "FAMC/FAMS in GEDCOM and has no current NOTE carrier on those structures (tracked " +
        "as a follow-up).",
      expectedAfterRoundTrip: (seeded, ctx) => {
        const t = ctx?.row.type;
        if (t === 'couple' || t === 'sibling' || t === 'godparent' || t === 'other') return seeded;
        // parent_child: no carrier yet
        return '';
      },
    },
    v70: {
      kind: 'lossy',
      reason:
        "Multi-carrier note: couple notes emit via custom 1 _RELNOTES under FAM; " +
        "sibling / godparent / other notes emit via custom 2 _RELA_NOTE under ASSO. " +
        "Multi-line notes are split across CONT continuation lines on export and rejoined " +
        "by the parser on import, so embedded newlines round-trip byte-identical for those " +
        "four types. parent_child notes remain lossy — the parent_child relationship rides " +
        "FAMC/FAMS in GEDCOM and has no current NOTE carrier on those structures (tracked " +
        "as a follow-up).",
      expectedAfterRoundTrip: (seeded, ctx) => {
        const t = ctx?.row.type;
        if (t === 'couple' || t === 'sibling' || t === 'godparent' || t === 'other') return seeded;
        return '';
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
      kind: 'lossless-via',
      mechanism:
        'custom _PLAC_ADDR sub-tag — emitted under PLAC at level 3 when a place is attached, ' +
        'else directly under the event at level 2. Distinct from the place\'s standalone ADDR, ' +
        'which carries the place\'s mailing address (not the event-specific address).',
    },
    v70: {
      kind: 'lossless-via',
      mechanism:
        'custom _PLAC_ADDR sub-tag — emitted under PLAC at level 3 when a place is attached, ' +
        'else directly under the event at level 2. Distinct from the place\'s standalone ADDR, ' +
        'which carries the place\'s mailing address (not the event-specific address).',
    },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_EVENTS },
  },
  // T06: NO X negative-assertion structure. 7.0 carries it losslessly via
  // `1 NO <tag> / 2 DATE FROM…TO… / 2 NOTE …`; 5.5.1 has no NO concept and
  // drops with a disclosure warning per row.
  'events.is_negation': {
    v551: {
      kind: 'lossy',
      reason: '5.5.1 spec has no NO structure; negation events dropped entirely with a disclosure warning on the export report. Reading the column after re-import returns null (no row at all).',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossless',
      ownedBy: {
        exporter: 'src/gedcom/exporters/negation-emitter.ts',
        importer: 'src/import/gedcom/phases/negations.ts',
      },
    },
  },
  'events.negation_event_type': {
    v551: {
      kind: 'lossy',
      reason: '5.5.1 spec has no NO structure; negation_event_type dropped with disclosure warning. Reading the column after re-import returns null (no row at all).',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossless',
      ownedBy: {
        exporter: 'src/gedcom/exporters/negation-emitter.ts',
        importer: 'src/import/gedcom/phases/negations.ts',
      },
    },
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
  // T02: sources.repository free-text column was dropped. Repository
  // affiliation now rides the structured source_repositories junction
  // (entries below); the importer synthesizes Repository rows from
  // _REPO_TEXT for back-compat with files exported by older versions.
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
      kind: 'lossless-via',
      mechanism:
        'custom 1 _CALL sub-tag under SOUR. Distinct from REPO.CALN, which carries ' +
        'the repository\'s own call-number (a different column on a different table).',
    },
    v70: {
      kind: 'lossless-via',
      mechanism:
        'custom 1 _CALL sub-tag under SOUR. Distinct from REPO.CALN, which carries ' +
        'the repository\'s own call-number (a different column on a different table).',
    },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'sources.abstract': {
    v551: {
      kind: 'lossless-via',
      mechanism:
        'custom 1 _ABSTRACT sub-tag under SOUR — multi-line values are split across ' +
        'CONT continuation lines on export; the parser rejoins them on import so ' +
        'embedded newlines survive byte-identical.',
    },
    v70: {
      kind: 'lossless-via',
      mechanism:
        'custom 1 _ABSTRACT sub-tag under SOUR — multi-line values are split across ' +
        'CONT continuation lines on export; the parser rejoins them on import so ' +
        'embedded newlines survive byte-identical.',
    },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
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
        'event-level and name-level citations round-trip transcription via standard DATA/TEXT. Person-level, ' +
        'family-level and place-level citation phases do NOT read DATA/TEXT back, and 5.5.1 is stricter about ' +
        'unknown sub-tags inside SOUR cites — third-party 5.5.1 consumers historically reject custom tags at ' +
        'this level — so we intentionally do not emit a custom carrier here. Promoting v5.5.1 would be a ' +
        'separate plan focused on testing custom-tag tolerance against a panel of 5.5.1-consuming apps.',
      expectedAfterRoundTrip: (seeded, ctx) => {
        return (ctx?.row.event_id || ctx?.row.person_name_id) ? seeded : '';
      },
    },
    v70: {
      kind: 'lossless-via',
      mechanism:
        'standard DATA/TEXT under SOUR for event-level and name-level citations; custom 2 _TRANS sub-tag under ' +
        'SOUR for person-level, family-level (relationship_id) and place-level citations — covers all four ' +
        'host kinds, multi-line transcriptions ride CONT continuation under _TRANS so embedded newlines ' +
        'round-trip byte-identical.',
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
  // Name-level citations: emitted as SOUR sub-tag under the NAME line (allowed
  // by both 5.5.1 and 7.0 NAME_PIECE structure). Importer reads SOUR under NAME
  // and routes to person_name_id. The literal UUID is re-issued on import; the
  // graph identity (citation attached to *the same* NAME row) is preserved
  // because NAME emit order is stable and the importer creates names in the
  // same order.
  'citations.person_name_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },

  // ----- groups -----
  'groups.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'groups.name': {
    v551: { kind: 'lossless-via', mechanism: 'custom 0 _GROUP top-level record + 1 NAME sub-tag' },
    v70: { kind: 'lossless-via', mechanism: 'custom 0 _GROUP top-level record + 1 NAME sub-tag' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'groups.notes': {
    v551: { kind: 'lossless-via', mechanism: 'custom 0 _GROUP top-level record + 1 NOTE sub-tag (multi-line via CONT)' },
    v70: { kind: 'lossless-via', mechanism: 'custom 0 _GROUP top-level record + 1 NOTE sub-tag (multi-line via CONT)' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'groups.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- group_links -----
  'group_links.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'group_links.group_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'group_links.entity_type': {
    v551: { kind: 'lossless-via', mechanism: 'custom 1 _GROUP_LINK / 2 TYPE sub-record under _GROUP' },
    v70: { kind: 'lossless-via', mechanism: 'custom 1 _GROUP_LINK / 2 TYPE sub-record under _GROUP' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'group_links.entity_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'group_links.sort_order': {
    // Membership order within a group is preserved by emit order — the
    // exporter walks getGroupLinks (which orders by entity_type, sort_order,
    // created_at) and the importer's addGroupLink rebases sort_order to
    // (per-type MAX + 1) on insert. The literal integer doesn't survive
    // because the importer rebases per (group, entity_type) starting from 0
    // — but the *relative* order does. Match the precedent of
    // person_names.sort_order: declare lossy with expectedAfterRoundTrip = 0
    // (the column resets, the visible order is preserved by emit position).
    v551: {
      kind: 'lossy',
      reason: '_GROUP_LINK emit order preserves visible membership order, but sort_order column itself rebases to 0 on import',
      expectedAfterRoundTrip: () => 0,
    },
    v70: {
      kind: 'lossy',
      reason: '_GROUP_LINK emit order preserves visible membership order, but sort_order column itself rebases to 0 on import',
      expectedAfterRoundTrip: () => 0,
    },
    ownedBy: { importer: IMPORTER_PHASES },
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
        'sees the OBJE, not preserved from the exporter side. person/event/relationship ' +
        "links derive from inline OBJE under INDI/event/FAM; entity_type='source' links " +
        'derive from OBJE under SOUR (wired 2026-06; the exporter previously emitted none, ' +
        'so the source link was silently dropped — a Round-Trip Fidelity violation now ' +
        'closed). The golden round-trip test EXCLUDES media_links, so it does NOT cover ' +
        'this column; source links are covered by tests/unit/media-source-link-roundtrip.test.ts.',
    },
    v70: {
      kind: 'excluded',
      reason:
        'derived at import from the parent GEDCOM record nesting the OBJE block; ' +
        'the literal value of the entity_type column is determined by where the importer ' +
        'sees the OBJE, not preserved from the exporter side. person/event/relationship ' +
        "links derive from inline OBJE under INDI/event/FAM; entity_type='source' links " +
        'derive from OBJE under SOUR (wired 2026-06; the exporter previously emitted none, ' +
        'so the source link was silently dropped — a Round-Trip Fidelity violation now ' +
        'closed). The golden round-trip test EXCLUDES media_links, so it does NOT cover ' +
        'this column; source links are covered by tests/unit/media-source-link-roundtrip.test.ts.',
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

  // ── T02 GEDCOM-alignment placeholder entries ─────────────────────────────
  // Final `kind`, `ownedBy`, and where applicable `expectedAfterRoundTrip`
  // are refined by the corresponding Phase 2 task. The placeholders are
  // conservative — anything authored on these columns is declared lossy
  // until the emitter/phase pair lands, so the per-field round-trip tests
  // (added in T04–T08) start from a known-honest baseline.

  // ----- notes (T04) -----
  // GEDCOM 7.0: lossless via top-level SNOTE records + SNOTE @Nx@ pointers.
  // GEDCOM 5.5.1: lossy — no SNOTE record concept exists; shared notes
  // degrade to repeated inline NOTE under each owning entity (disclosure
  // warning emitted per shared note on export).
  'notes.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'notes.text': {
    v551: {
      kind: 'lossy',
      reason: '5.5.1 has no SNOTE record concept. Shared notes degrade to inline NOTE under each linked entity; the importer absorbs that inline text into the entity\'s own `notes` column (persons.notes, repositories.notes, etc.), not into the shared `notes` table. The first-class shared-note row identity is therefore lost on 5.5.1 round-trip — the round-tripped DB has zero rows in `notes`. Export to GEDCOM 7.0 to preserve the sharing.',
      expectedAfterRoundTrip: () => null,
    },
    v70: { kind: 'lossless' },
    ownedBy: {
      exporter: 'src/gedcom/exporters/notes-emitter.ts',
      importer: 'src/import/gedcom/phases/notes.ts',
    },
  },
  'notes.language': {
    v551: {
      kind: 'lossy',
      reason: '5.5.1 has no SNOTE record (see notes.text); the notes row is lost entirely on round-trip, so language goes with it.',
      expectedAfterRoundTrip: () => null,
    },
    v70: { kind: 'lossless' },
    ownedBy: {
      exporter: 'src/gedcom/exporters/notes-emitter.ts',
      importer: 'src/import/gedcom/phases/notes.ts',
    },
  },
  'notes.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },
  'notes.updated_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- note_links (T04) -----
  // Note↔entity attachments. Lossless on 7.0 (each SNOTE @Nx@ pointer
  // round-trips to a note_links row). Lossy on 5.5.1 — the link target is
  // preserved in spirit (inline NOTE under the same entity), but the
  // first-class link identity is lost (no shared `notes` row to link to).
  'note_links.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'note_links.note_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'note_links.entity_type': {
    v551: {
      kind: 'lossy',
      reason: '5.5.1 has no SNOTE record concept; note↔entity sharing collapses to inline NOTE per entity. The shared `notes` + `note_links` row pair is lost on round-trip — inline NOTE text lands on the entity\'s own `notes` column, not on a fresh note_links row.',
      expectedAfterRoundTrip: () => null,
    },
    v70: { kind: 'lossless' },
    ownedBy: {
      exporter: 'src/gedcom/exporters/notes-emitter.ts',
      importer: 'src/import/gedcom/phases/notes.ts',
    },
  },
  'note_links.entity_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'note_links.sort_order': {
    v551: {
      kind: 'lossy',
      reason: '5.5.1 has no SNOTE record (see note_links.entity_type) — link row is lost on round-trip, so sort_order goes with it.',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossy',
      reason: 'GEDCOM 7.0 SNOTE @Nx@ pointer order is preserved on a per-entity basis, but the cross-entity `sort_order` value the app stores is recomputed on import (MAX+1 per entity). The link round-trips losslessly in its other columns; only the integer is reseeded from zero.',
      expectedAfterRoundTrip: () => 0,
    },
    ownedBy: {
      exporter: 'src/gedcom/exporters/notes-emitter.ts',
      importer: 'src/import/gedcom/phases/notes.ts',
    },
  },
  'note_links.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- person_associations (T05) -----
  // GEDCOM 5.5.1: emits `1 ASSO @Ix@ / 2 RELA <role>` under the owning INDI.
  // GEDCOM 7.0:   emits `1 ASSO @Ix@ / 2 ROLE <role>` (the 7.0 spec renamed
  //               the role tag from RELA to ROLE under ASSO). Both versions
  //               carry the six role values losslessly.
  // The on-wire lowercase role value is the importer signal that routes the
  // ASSO to `person_associations` (vs the legacy `relationships` path which
  // emits capitalized `RELA Godparent/Sibling/Other`).
  'person_associations.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'person_associations.person_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'person_associations.related_person_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'person_associations.role': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: {
      exporter: 'src/gedcom/exporters/assoc-emitter.ts',
      importer: 'src/import/gedcom/phases/asso.ts',
    },
  },
  'person_associations.notes': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: {
      exporter: 'src/gedcom/exporters/assoc-emitter.ts',
      importer: 'src/import/gedcom/phases/asso.ts',
    },
  },
  'person_associations.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- name_translations (T07) -----
  // 7.0: lossless via NAME/TRAN with LANG (+ _SCHEME custom tag).
  // 5.5.1: lossy — degrades to additional `1 NAME <value>` with `2 TYPE <lang>`.
  //        Language survives ONLY if the secondary NAME's TYPE matches a
  //        recognized BCP-47 short code; the transliteration scheme is dropped.
  //        The "additional NAME" row also lands in person_names (sort_order >0)
  //        on import — the round-trip yields *some* person_names row that
  //        carries the translation value, but the first-class name_translations
  //        row identity is recreated by the secondary-NAME→TRAN heuristic.
  'name_translations.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'name_translations.person_name_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'name_translations.value': {
    v551: {
      kind: 'lossy',
      reason: '5.5.1 has no NAME/TRAN substructure. Emitted as an additional `1 NAME <value>` with `2 TYPE <lang>` under the same INDI. Re-imported into name_translations only when the TYPE matches a known BCP-47 short code (ru, zh, ja, ar, he, el, …) — the same-exporter round-trip recovers the value, but interop with non-language-aware 5.5.1 tools may surface the value as an extra alias instead.',
      expectedAfterRoundTrip: (seeded: unknown) => seeded,
    },
    v70: { kind: 'lossless' },
    ownedBy: {
      exporter: 'src/gedcom/exporters/translations-emitter.ts',
      importer: 'src/import/gedcom/phases/translations.ts',
    },
  },
  'name_translations.language': {
    v551: {
      kind: 'lossy',
      reason: '5.5.1 carries the language as `2 TYPE <lang>` under the additional NAME (degraded path). Survives a same-exporter / same-importer round-trip when the value is a recognized BCP-47 short code; arbitrary language strings would not be re-recognised on import.',
      expectedAfterRoundTrip: (seeded: unknown) => seeded,
    },
    v70: { kind: 'lossless' },
    ownedBy: {
      exporter: 'src/gedcom/exporters/translations-emitter.ts',
      importer: 'src/import/gedcom/phases/translations.ts',
    },
  },
  'name_translations.transliteration_scheme': {
    v551: {
      kind: 'lossy',
      reason: '5.5.1 has no slot for a transliteration scheme on the degraded `1 NAME / 2 TYPE` shape. Dropped on 5.5.1 export.',
      expectedAfterRoundTrip: () => '',
    },
    v70: {
      kind: 'lossless-via',
      mechanism: 'custom `_SCHEME` sub-tag under TRAN (the 7.0 spec does not name a canonical tag for transliteration scheme; the custom tag is round-trip-safe within this app)',
    },
    ownedBy: {
      exporter: 'src/gedcom/exporters/translations-emitter.ts',
      importer: 'src/import/gedcom/phases/translations.ts',
    },
  },
  'name_translations.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- place_translations (T07) -----
  // 7.0: lossless via PLAC/TRAN with LANG (+ _SCHEME custom tag).
  // 5.5.1: fully lossy — 5.5.1 has no PLAC translation slot. The row is dropped
  //        on export with a per-row warning surfaced via the export report.
  'place_translations.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'place_translations.place_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'place_translations.value': {
    v551: {
      kind: 'lossy',
      reason: '5.5.1 has no PLAC/TRAN substructure or equivalent. Row is dropped on export with a warning; the round-tripped DB has zero rows for this place.',
      expectedAfterRoundTrip: () => null,
    },
    v70: { kind: 'lossless' },
    ownedBy: {
      exporter: 'src/gedcom/exporters/translations-emitter.ts',
      importer: 'src/import/gedcom/phases/translations.ts',
    },
  },
  'place_translations.language': {
    v551: {
      kind: 'lossy',
      reason: '5.5.1 has no PLAC/TRAN/LANG slot (see place_translations.value).',
      expectedAfterRoundTrip: () => null,
    },
    v70: { kind: 'lossless' },
    ownedBy: {
      exporter: 'src/gedcom/exporters/translations-emitter.ts',
      importer: 'src/import/gedcom/phases/translations.ts',
    },
  },
  'place_translations.transliteration_scheme': {
    v551: {
      kind: 'lossy',
      reason: '5.5.1 has no PLAC/TRAN slot of any kind, so the scheme has no carrier.',
      expectedAfterRoundTrip: () => null,
    },
    v70: {
      kind: 'lossless-via',
      mechanism: 'custom `_SCHEME` sub-tag under PLAC/TRAN (same pattern as name_translations)',
    },
    ownedBy: {
      exporter: 'src/gedcom/exporters/translations-emitter.ts',
      importer: 'src/import/gedcom/phases/translations.ts',
    },
  },
  'place_translations.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

  // ----- source_coverage_events (T08) -----
  // SOUR/DATA/EVEN substructure is identical on 5.5.1 and 7.0 — all columns
  // round-trip losslessly on both versions. Event types are emitted verbatim
  // as the `EVEN <type>` value (no enum gating). Dates use `DATE FROM x TO y`
  // (degrades to FROM-only or TO-only when one endpoint is missing). Place
  // resolves via `findOrCreatePlace(name)` on re-import, matching the same
  // semantics every other importer phase uses.
  'source_coverage_events.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
  'source_coverage_events.source_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'source_coverage_events.event_type': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: {
      exporter: 'src/gedcom/exporters/coverage-emitter.ts',
      importer: 'src/import/gedcom/phases/coverage.ts',
    },
  },
  'source_coverage_events.date_value_from': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: {
      exporter: 'src/gedcom/exporters/coverage-emitter.ts',
      importer: 'src/import/gedcom/phases/coverage.ts',
    },
  },
  'source_coverage_events.date_value_to': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: {
      exporter: 'src/gedcom/exporters/coverage-emitter.ts',
      importer: 'src/import/gedcom/phases/coverage.ts',
    },
  },
  'source_coverage_events.place_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
  'source_coverage_events.notes': {
    v551: { kind: 'lossless' },
    v70: { kind: 'lossless' },
    ownedBy: {
      exporter: 'src/gedcom/exporters/coverage-emitter.ts',
      importer: 'src/import/gedcom/phases/coverage.ts',
    },
  },
  'source_coverage_events.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },
};
