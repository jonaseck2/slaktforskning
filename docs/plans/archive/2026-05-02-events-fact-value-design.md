# Events Fact-Value Round-Trip — Design Spec

**Status:** Draft (2026-05-02)
**Implementation plan:** `2026-05-02-events-fact-value.md` (sibling, to be written next)

## User goal

A genealogist who imports a GEDCOM file containing facts like `1 OCCU Carpenter` with notes, places, and dates can:

1. Open the imported event in the UI and see the occupation name **"Carpenter"** in a dedicated field, separately from any free-form notes.
2. Edit either field independently. Adding "Carpenter" to a new event from scratch produces an OCCU event whose value is "Carpenter" — not buried in a notes field.
3. Re-export to GEDCOM and get back `1 OCCU Carpenter` with the same notes, place, and date — byte-for-byte equivalent on the value/notes/cause lines for fact-shaped events.
4. Trust that *no authored data is silently dropped* anywhere in the cycle. The current behavior — where importing `1 OCCU Carpenter` discards "Carpenter" because the importer ignores the line value — ends with this change.

The same applies to every fact-shaped GEDCOM 5.5.1 attribute: `OCCU` (occupation), `EDUC` (education), `RELI` (religion), `TITL` (title), `DSCR` (physical description), `PROP` (property), `NATI` (nationality), `NCHI` (number of children), `NMR` (number of marriages), `SSN`, `IDNO`, `CAST`, `FACT`, `EVEN` (custom events).

## Scope

This is a vertical slice across schema, importer, exporter, modal, list rendering, MCP, and tests. The driver is GEDCOM round-trip fidelity; everything else falls out of getting that right.

### In scope

1. **Schema migration** (`src/api/schema.ts`)
   - `ALTER TABLE events ADD COLUMN value TEXT` — new column for GEDCOM-X `Fact.value` / GEDCOM 5.5.1 line value. Default null.
   - `ALTER TABLE events RENAME COLUMN description TO notes` — semantic rename. The column always *was* free-form notes channel; "description" is the misleading name that conflates `Fact.value` with `Fact.notes`.
   - `cause` column unchanged (it is the `DEAT.CAUS` qualifier, conceptually `Fact.qualifier:Cause`).
   - Migration block added to `initializeSchema()` after the existing v0.7.0 block. Idempotent: check `PRAGMA table_info(events)` for column presence.

2. **Type updates** (`src/api/types.ts`, `src/api/events.ts`)
   - `GenealogyEvent` gains `value: string | null`, renames `description: string` → `notes: string`. Keep the type field non-nullable (default `''`) to match column default of empty string after rename — or change the column default to NULL during the rename and make notes nullable. Decision: **make `notes` nullable (`TEXT NULL`)** and update all writers to pass `null` instead of `''` when empty. Aligns with `value`, `cause`, and avoids the subtle `'' !== null` comparison hazards in JSON export.
   - `createEvent`/`updateEvent` accept both fields.
   - All existing callers in `src/api/` updated.

3. **Importer** (`src/import/gedcom/event-importer.ts`)
   - Define `FACT_TAGS = new Set(['OCCU','RELI','EDUC','TITL','PROP','NATI','NCHI','NMR','SSN','IDNO','CAST','DSCR','FACT','EVEN'])` keyed by GEDCOM tag (the inverse of `EVENT_TYPE_TO_TAG`). Justification: the source of truth for "does this tag have a meaningful line value" is the GEDCOM spec, not our internal event_type names.
   - For events whose GEDCOM tag is in `FACT_TAGS`: `evNode.value?.trim() || null` becomes `value`.
   - For events whose GEDCOM tag is NOT in `FACT_TAGS` but whose `evNode.value` is non-empty (defensive — non-standard input): append the line value to `notes` with a leading separator (`\n\n` if notes already non-empty), and emit a warning in the import report (`unmappedData` array). Never drop silently.
   - The existing `TYPE` sub-tag concatenation into notes (`${typeValue}: ${noteRaw}`) goes away for `EVEN`/`FACT`. The TYPE sub-tag continues to drive `event_type` mapping (existing logic in `import-core.ts`); when TYPE doesn't map to a known event_type, the original TYPE string is preserved by appending `[TYPE: <val>]` to `notes` so users can see what the source GEDCOM intended.
   - The existing `2 CAUS` handling stays as-is.

4. **Exporter** (`src/gedcom/exporter.ts:277,289` and `:430,441`)
   - Change `lines.push(`1 ${tag}`)` → `lines.push(`1 ${tag}${ev.value ? ' ' + ev.value : ''}`)` at both call sites (person-owned events and relationship-owned events).
   - Change `if (includeNotes && ev.description)` → `if (includeNotes && ev.notes)` and ``2 NOTE ${ev.description}`` → ``2 NOTE ${ev.notes}``.
   - `cause` emission unchanged.
   - Long values that span multiple lines: GEDCOM 5.5.1 uses CONT/CONC for line continuation. The exporter already has helpers for NOTE multi-line; reuse the same helper for `value` if it contains a newline (rare, but possible for DSCR / FACT). Concretely: if `ev.value.includes('\\n')`, emit the first line as the line value and continuation lines as `2 CONT <rest>`. Verified against the existing `emitNoteLines` helper and adapted.

5. **EventModal** (`src/renderer/components/modals/EventModal.vue`)
   - Add a "Value" `<input>` field, shown only when `form.event_type` maps to a `FACT_TAGS` GEDCOM tag (we keep this lookup in a renderer-side helper that mirrors `EVENT_TYPE_TO_TAG` — extracted into a shared module under `src/api/events_gedcom.ts` so importer, exporter, and renderer all use one source of truth).
   - Type-aware label via i18n keys:
     - `events.value.occupation` → "Yrke / Occupation"
     - `events.value.education` → "Examen / Degree"
     - `events.value.religion` → "Trossamfund / Religion"
     - `events.value.title` → "Titel / Title"
     - `events.value.description_dscr` → "Beskrivning (DSCR) / Physical description"
     - `events.value.property` → "Egendom / Property"
     - `events.value.nationality` → "Nationalitet / Nationality"
     - `events.value.children_count` → "Antal barn / Number of children"
     - `events.value.marriages_count` → "Antal äktenskap / Number of marriages"
     - `events.value.id_number` → "Identifierare / ID number"
     - `events.value.ssn` → "Personnummer / SSN"
     - `events.value.caste` → "Kast / Caste"
     - `events.value.fact` → "Värde / Value" (generic)
     - `events.value.event` → "Värde / Value" (generic, EVEN)
   - Add a "Notes" `<textarea>` shown for *all* event types. Multi-line, free-form. Replaces the missing description input that motivated this change.
   - **Prime Directive enforcement in save handler**: the form payload always sends `value: form.value || null` and `notes: form.notes || null` regardless of whether the field is currently visible. A previously-authored value or notes string MUST NOT be nulled out by toggling the event type to one that hides the value field. Concretely: if a user opens an OCCU event with `value="Carpenter"`, switches type to `MARR` (hides the value field), and saves, the `value` is preserved in form state and re-emitted as null only if they explicitly clear it. Test: switching event type does not mutate `form.value` or `form.notes`.

6. **EventList rendering** (`src/renderer/components/EventList.vue`)
   - Replace the single "Description" column with a richer cell that renders both `value` and `notes`:
     - Line 1 (bold): `event.value` if present.
     - Line 2 (muted, truncated to one line, ellipsis on overflow): `event.notes` if present.
     - Cause appended in parentheses on line 1 if present (current behavior preserved for DEAT).
   - Column header changes to `events.factColumn` ("Uppgift / Fact") to reflect that both value and notes live there.
   - The `EventRow` interface gains `value: string | null` and renames `description` → `notes`.

7. **MCP tools** (`src/mcp/createProdServer.ts`, `src/mcp/createDevServer.ts`)
   - `record_event` tool schema: add optional `value`, rename `description` → `notes`.
   - `update_event` tool schema: same.
   - Tool descriptions document that `value` is the GEDCOM 5.5.1 line value (occupation name, religion, etc.) and `notes` is free-form prose.
   - Backwards-compat shim: if a caller passes `description`, treat it as `notes` and emit a deprecation warning in the response. Justification: existing AI agents in the wild may pass `description`; we don't want their next call to silently lose data. Remove shim after one minor version.

8. **Archive (JSON) import/export** (`src/api/archive_export.ts`, `src/api/archive_import.ts`)
   - Export: serialize `value` and `notes` with new names. Bump archive schema version.
   - Import: handle both old archives (where `description` exists, no `value`) and new archives. For old archives, `description` → `notes`, `value` stays null. Document in the archive schema version notes.

9. **CSV export** (`src/api/csv_export.ts`)
   - Add a `value` column. Rename `description` column to `notes`.

10. **HTML site export** (`src/api/html_site/`)
    - Render `value` and `notes` per event in the timeline / fact list templates. Mirrors the EventList rendering choice.

11. **Other importers**
    - **Holger** (`src/import/holger/`) — Holger's "occupation" field is a known mapping target. Map Holger's occupation string to `value` (not `notes`). Same for education degree, religion if present.
    - **Genney** (`src/import/genney/`) — same review pass; map Genney fact-shaped fields into `value`.

12. **i18n** — both `sv.ts` and `en.ts`:
    - `events.value.*` keys (14 type-aware labels listed above).
    - `events.notes` ("Anteckningar / Notes").
    - `events.factColumn` ("Uppgift / Fact").
    - Existing `events.description` key: keep but mark deprecated; remove after one minor version.

13. **Documentation**
    - `docs/DATA_MODEL.md` — update events table description.
    - `docs/IPC_REFERENCE.md` — events functions signatures.
    - `docs/MCP.md` — `record_event`, `update_event` tool documentation.
    - `docs/UX_INVENTORY.md` — EventModal entry.

14. **Test updates** — every test touching `events.description` (~80 hits expected). Each migrated to use `notes`. New tests added for `value`. Round-trip tests added (see Verification).

### Scope deviations (explicit)

- **No multi-row qualifiers table.** GEDCOM-X `Fact.qualifiers[]` supports arbitrary `{name, value}` pairs (Age, Cause, Religion, Transport, Witness, etc.). This codebase only models `Cause` (via the dedicated `events.cause` column for DEAT). Adding a polymorphic `event_qualifiers` table would let us round-trip `2 AGE`, `2 RELI` (under non-RELI events), etc. — but is out of scope for this change. The current change does not regress qualifier handling; it just doesn't extend it. Reason: risk surface and migration complexity. Tracked as a follow-up in `docs/PLAN.md`.

- **No automatic legacy migration of `description` content into `value`.** Existing rows where `description` actually holds an occupation name (e.g. "Carpenter") stay in `notes` after rename. We do not run a heuristic ("if event_type=occupation and notes is short and single-line, move to value") because that's *inference* — exactly what Prime Directive forbids. Users with legacy data can either (a) manually move the text via the EventModal value field, or (b) re-import the original GEDCOM (new importer reads OCCU line value into `value` correctly). Reason: Prime Directive non-negotiable. Round-trip is *not regressed* — pre-migration round-trip already lost the line value, post-migration round-trip is symmetric for new imports.

- **No "fix legacy data" UI button in v1.** Out of scope to ship a Settings → Maintenance "Move legacy occupation strings to value" tool. Reason: a manual heuristic UI carries Prime Directive risk; deferred until the user requests it after seeing how often it hurts in practice. Tracked as a follow-up.

- **GEDCOM 7.0 export is unchanged in structure.** GEDCOM 7.0 also uses line values for fact-shaped events. The exporter currently shares code paths — verify GEDCOM 7.0 round-trip in tests but no new branching logic.

- **No new event_type constants.** The existing 26 values in `EVENT_TYPE_VALUES` cover the GEDCOM tags we care about. Tags like `NCHI`, `NMR`, `SSN`, `CAST` map to `event_type='other'` with the GEDCOM tag preserved via TYPE sub-tag on import (existing behavior). Reason: avoid widening the event_type enum mid-refactor; widen later if user-observable need arises.

- **`cause` column stays DEAT-specific by convention.** GEDCOM allows `2 CAUS` under any event; our UI exposes it only for DEAT. The importer reads CAUS into the column for any event type (existing behavior is preserved — verify in test). The modal continues to show the cause field only for DEAT. Reason: matches existing UX; broader cause exposure is its own UX decision.

## Architecture

### Data flow — round-trip

```
GEDCOM file
  │   1 OCCU Carpenter
  │   2 DATE 1885
  │   2 PLAC Stockholm
  │   2 NOTE Worked at the shipyard
  │
  ▼ event-importer.ts
events row { event_type:'occupation', value:'Carpenter', notes:'Worked at the shipyard',
              date_value:'1885', place_id:<stockholm_uuid>, cause:null }
  │
  ▼ EventModal renders
  ┌─ Type:    [Occupation v]
  ├─ Date:    1885
  ├─ Place:   Stockholm
  ├─ Yrke:    Carpenter        ← `value` field, type-aware label
  └─ Notes:   Worked at the shipyard
  │
  ▼ exporter.ts
  1 OCCU Carpenter
  2 DATE 1885
  2 PLAC Stockholm
  2 NOTE Worked at the shipyard
```

Round-trip property: `parse(export(import(parse(file)))) === parse(file)` for the four lines above (modulo whitespace normalization).

### Shared GEDCOM tag map

Currently `EVENT_TYPE_TO_TAG` lives in `src/gedcom/exporter.ts`. The importer derives from the same mapping via `import-core.ts`. The renderer needs to know the inverse to decide when to show the value field.

**Extract** to `src/api/events_gedcom.ts`:

```typescript
// GEDCOM 5.5.1 / 7.0 tag <-> event_type bidirectional map.
// Source of truth for both round-trip and renderer-side fact-shape detection.
export const EVENT_TYPE_TO_GEDCOM_TAG: Record<string, string> = {
  birth: 'BIRT', death: 'DEAT', christening: 'CHR', burial: 'BURI',
  baptism: 'BAPM', confirmation: 'CONF', occupation: 'OCCU',
  residence: 'RESI', education: 'EDUC', emigration: 'EMIG',
  immigration: 'IMMI', naturalization: 'NATU', census: 'CENS',
  probate: 'PROB', will: 'WILL', graduation: 'GRAD', retirement: 'RETI',
  marriage: 'MARR', divorce: 'DIV', engagement: 'ENGA', adoption: 'ADOP',
  ordination: 'ORDN', military: '_MILT', mention: 'EVEN',
  wedding: 'MARR', foster_placement: 'EVEN', travel: 'EVEN',
  other: 'EVEN',
};

// Tags whose line value is meaningful per GEDCOM 5.5.1 spec.
// These are GEDCOM-X-style "Fact.value" — the primary value of the fact.
export const FACT_VALUE_GEDCOM_TAGS = new Set([
  'OCCU', 'RELI', 'EDUC', 'TITL', 'PROP', 'NATI',
  'NCHI', 'NMR', 'SSN', 'IDNO', 'CAST', 'DSCR',
  'FACT', 'EVEN',
]);

export function eventTypeHasFactValue(eventType: string): boolean {
  const tag = EVENT_TYPE_TO_GEDCOM_TAG[eventType];
  return tag ? FACT_VALUE_GEDCOM_TAGS.has(tag) : false;
}

// i18n key suffix for the value-field label, given an event_type.
export function valueFieldI18nKey(eventType: string): string {
  const tag = EVENT_TYPE_TO_GEDCOM_TAG[eventType];
  switch (tag) {
    case 'OCCU': return 'events.value.occupation';
    case 'EDUC': return 'events.value.education';
    case 'RELI': return 'events.value.religion';
    case 'TITL': return 'events.value.title';
    case 'DSCR': return 'events.value.description_dscr';
    case 'PROP': return 'events.value.property';
    case 'NATI': return 'events.value.nationality';
    case 'NCHI': return 'events.value.children_count';
    case 'NMR':  return 'events.value.marriages_count';
    case 'SSN':  return 'events.value.ssn';
    case 'IDNO': return 'events.value.id_number';
    case 'CAST': return 'events.value.caste';
    case 'FACT': return 'events.value.fact';
    case 'EVEN': return 'events.value.event';
    default:       return 'events.value.event';
  }
}
```

**Pure TypeScript, no Electron deps** — same `src/api/` rules as the rest of the layer.

### Migration safety property

Three correctness invariants the migration must satisfy, in addition to "schema columns exist":

1. **No row content moves**: every row's old `description` value is readable as `notes` after migration. Pure column rename.
2. **No row is created or deleted** by the migration block.
3. **`value` is null for every pre-migration row.** Newly-imported events post-migration may have non-null `value`. Pre-existing events are untouched.

Verified in test by snapshotting a fixture DB before and after migration:
- `(SELECT id, description FROM events ORDER BY id)` before == `(SELECT id, notes FROM events ORDER BY id)` after.
- `(SELECT COUNT(*) FROM events WHERE value IS NOT NULL)` after migration of a legacy DB == 0.

## Verification

The user goal is verifiable end-to-end through three concentric checks. **Lint + unit tests passing is hygiene, not verification** — per `.claude/rules/plans.md`.

### 1. Round-trip golden test (the gate)

`tests/unit/gedcom-roundtrip-fact-value.test.ts` — new file.

Three fixture GEDCOM files under `tests/fixtures/gedcom/fact-value/`:
- `occupation-with-notes.ged` — `1 OCCU Carpenter / 2 DATE 1885 / 2 PLAC Stockholm / 2 NOTE Worked at the shipyard`
- `mixed-facts.ged` — one INDI with OCCU, EDUC, RELI, TITL, DSCR, FACT (with TYPE), and a custom EVEN (with TYPE).
- `death-with-cause-and-notes.ged` — `1 DEAT / 2 DATE 1902 / 2 PLAC Stockholm / 2 CAUS Tuberculosis / 2 NOTE He was sick for years.`

For each fixture, the test:
1. `parse(fixture)` → AST_a
2. `import(db, AST_a)` → DB rows
3. `export(db)` → text_b
4. `parse(text_b)` → AST_b
5. Assert `AST_a` and `AST_b` are structurally equal on the four canonical lines per event: TAG (with line value), DATE, PLAC, NOTE, CAUS — modulo whitespace normalization and ordering of independent sub-tags.
6. **Triple-trip variant**: `import(db2, AST_b) → export(db2) → parse → AST_c`. Assert `AST_b === AST_c` exactly. Idempotence: after one round, subsequent rounds change nothing.

Failure of this test means a row in the round-trip is dropping or mangling authored data — Prime Directive violation. Blocks merge.

### 2. Manual UI smoke check (the user-observable proof)

Captured as a checklist in the implementation plan:

- [ ] Start the app, switch to a fresh test DB.
- [ ] Import `tests/fixtures/gedcom/fact-value/mixed-facts.ged` via Settings → Import.
- [ ] Open the imported person; expand Events.
- [ ] Open the OCCU event in EventModal. **Expected:** "Yrke / Occupation" field shows "Carpenter"; Notes field shows the note text. Date and place populated.
- [ ] Edit value to "Master Carpenter", add a sentence to notes, save.
- [ ] Re-export to GEDCOM via Settings → Export.
- [ ] Open the exported file in a text editor. **Expected:** `1 OCCU Master Carpenter` on the OCCU line (not `1 OCCU` with the value moved to a NOTE).
- [ ] Import the exported file into a second fresh DB. **Expected:** field-for-field match with what was just exported.
- [ ] In EventModal, switch the event type from OCCU to MARR. **Expected:** Yrke field disappears. Save. Re-open. Switch back to OCCU. **Expected:** value of "Master Carpenter" still present (Prime Directive — no silent drop on type toggle).

### 3. Migration safety test

`tests/unit/events-fact-value-migration.test.ts` — new file.

- Build a database at the pre-migration schema (clone of `schema.ts` minus the new migration block — fixture or inline).
- Insert 5 events with non-null `description`, varied `cause`, varied `event_type`.
- Snapshot rows.
- Run the migration block (call `initializeSchema(db)` on the now-old DB).
- Re-read rows. Assert:
  - Every snapshot's `description` is now readable as `notes`.
  - `value IS NULL` for every row.
  - Row count, ids, and all other columns unchanged.

## Failure modes / RCA reference

This plan addresses two known failure classes that have bitten this codebase:

1. **Silent data loss on import** — The current `event-importer.ts:67-83` reads `evNode.value` from PLAC, DATE, CAUS, and TYPE sub-tags but never from the parent event node itself. For every fact-shaped tag the line value is silently discarded. This is a Prime Directive violation that has been live since the GEDCOM importer was added. The round-trip golden test in §Verification is the regression guard going forward.

2. **Modal save dropping authored data on UI mode change** — CLAUDE.md explicitly cites `cause: form.event_type === 'death' ? form.cause : null` as a Prime Directive violation pattern. The new `value` field is at risk of the same anti-pattern (`value: eventTypeHasFactValue(form.event_type) ? form.value : null`). The implementation plan must include a test that mounts EventModal, sets `value` and `notes`, switches `event_type` from OCCU to MARR, saves, and asserts the persisted row still has the original `value` and `notes` — never silently nulled.

## Migration ordering (for the implementation plan)

Order tasks so the schema migration lands first and the renderer last. Concretely:

1. Schema + types + `events_gedcom.ts` shared module.
2. API layer (`src/api/events.ts` + tests).
3. Importer changes + round-trip test (the gate).
4. Exporter changes (already covered by the round-trip test).
5. MCP tool schemas + tests.
6. Archive + CSV + HTML site export.
7. EventModal (with the type-toggle Prime Directive test).
8. EventList rendering.
9. i18n + docs.
10. Final manual smoke check.

Each task is independently testable. A worker can pause between any two without leaving the app in a broken state — except between (1) and (2), which must land in the same commit (schema rename without code update breaks the build).
