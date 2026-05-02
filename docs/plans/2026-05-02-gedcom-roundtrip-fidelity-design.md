# GEDCOM Round-Trip Fidelity Audit & Guard — Design Spec

**Status:** Draft (2026-05-02)
**Implementation plan:** `2026-05-02-gedcom-roundtrip-fidelity.md` (sibling, to be written next)
**Depends on:** `2026-05-02-events-fact-value.md` must implement first (the registry keys to whatever columns actually exist in the schema; events fact-value adds `events.value` and renames `events.description` → `events.notes`).

## User goal

A genealogist must be able to leave with their data intact. The data they have *in the database* (after import — with any import-time loss already disclosed by the import report) survives a GEDCOM 5.5.1 *or* 7.0 round-trip and comes back unchanged. This is co-equal with the existing Prime Directive: that one protects authored data while it lives in our DB; this one protects authored data as it leaves.

The contract is mechanical, not aspirational. After this work:

- Adding `events.foo TEXT` to a migration **without** registering it in `src/api/gedcom_fidelity_registry.ts` → unit test fails on next `npm test`, naming the column.
- Renaming a column → coverage test fails on the missing key (forces a registry update in lockstep).
- Changing the exporter to omit a `lossless` column → per-field round-trip test fails, named after the column.
- Changing the importer to drop a `lossless` field on re-import → same test fails.
- Changing several columns at once on the same row in a way that breaks multi-field interaction → golden-DB-seed round-trip test fails.

The user-observable promise: *"It is impossible for a developer (you, me, a subagent, a future maintainer) to make a schema change that quietly breaks GEDCOM round-trip."*

## Scope direction (important)

The contract direction is **DB → GEDCOM → DB**, not GEDCOM → DB → GEDCOM.

- IN scope: every column in every non-exempt table survives `export(db) → import(fresh_db)` losslessly, *or* is registered as `lossy:<reason>` / `excluded:<reason>` with a documented justification.
- OUT of scope: enforcing that every source-file GEDCOM tag survives parse → import. That is the importer's *disclosure* responsibility — the importer's job is to report what it dropped at import time (existing `unmappedData` / import report mechanism), not this audit's job to enforce parity with the source spec.

**Why this direction:** the user accepts the importer's disclosed loss when they choose to import. From that point on, what's in their DB is their data, and they have a non-negotiable right to get it back. The events-fact-value bug discovered yesterday (importer dropping `OCCU` line value) is not directly caught by this audit — it's caught by the *events plan fixing the importer*. This audit guarantees that once `events.value` is `lossless` in the registry, it stays `lossless` forever.

## Scope

### In scope

1. **Prime Directive amendment** in `CLAUDE.md`. New sub-section "⚠️ Prime Directive (cont.): Round-Trip Fidelity" inserted directly below the existing Prime Directive section. Wording in §Prime Directive amendment below.

2. **The registry** — `src/api/gedcom_fidelity_registry.ts`, new file:

   ```ts
   export type FidelityStatus =
     | { kind: 'lossless' }
     | { kind: 'lossless-via'; mechanism: string }
     | {
         kind: 'lossy';
         reason: string;
         // Given the seeded value, what the column SHOULD equal after round-trip.
         // Tests pass against this expectation. If actual diverges from expected,
         // the test fails — preventing silent further degradation beyond what's documented.
         expectedAfterRoundTrip: (seeded: unknown) => unknown;
       }
     | { kind: 'excluded'; reason: string };

   export interface FieldFidelity {
     v551: FidelityStatus;
     v70: FidelityStatus;
     ownedBy?: { exporter?: string; importer?: string };
   }

   export const GEDCOM_FIDELITY: Record<string, FieldFidelity> = {
     'persons.id': {
       v551: { kind: 'lossless-via', mechanism: 'XREF @I…@' },
       v70:  { kind: 'lossless-via', mechanism: 'XREF @I…@' },
     },
     'persons.created_at': {
       v551: { kind: 'excluded', reason: 'app-internal audit metadata, no GEDCOM equivalent' },
       v70:  { kind: 'excluded', reason: 'app-internal audit metadata, no GEDCOM equivalent' },
     },
     'events.value': {
       v551: {
         kind: 'lossy',
         reason: 'only round-trips for FACT_VALUE_GEDCOM_TAGS; for non-fact tags, value is appended to NOTE on export and not recovered to value on re-import',
         expectedAfterRoundTrip: (seeded) => seeded, // placeholder: real fn checks event_type/tag and returns null for non-fact tags
       },
       v70:  { kind: 'lossless' },
       ownedBy: {
         exporter: 'src/gedcom/exporter.ts',
         importer: 'src/import/gedcom/event-importer.ts',
       },
     },
     // ...one entry per column. Audit produces ~80–120 entries.
   };
   ```

   Status semantics:
   - `lossless`: identical bytes after DB → GEDCOM → DB.
   - `lossless-via`: lossless using a non-obvious mechanism (XREF re-issue, NAME.NPFX sub-tag, custom `_TAG`, etc.). The mechanism string is for code-readers, not for tests.
   - `lossy`: round-trips with a documented degradation. The reason names the degradation precisely. Lossy fields are still tested — the test asserts the *expected* degraded value, so silent further degradation still fails.
   - `excluded`: not round-tripped at all by design. The reason must justify why no GEDCOM mapping exists.

3. **Coverage guard test** — `tests/unit/gedcom-fidelity-registry-coverage.test.ts`, new file. Two assertions:
   - For every column in every non-exempt table (via `PRAGMA table_info`), there exists an entry in `GEDCOM_FIDELITY`. Failure message names the missing keys and points the developer at the registry file and the Prime Directive.
   - For every key in `GEDCOM_FIDELITY`, the referenced (table, column) exists in the live schema. Catches stale entries after column drops/renames.

4. **Per-field round-trip test** — `tests/unit/gedcom-fidelity-per-field.test.ts`, new file. For each registry entry × `{v551, v70}`:
   - `kind: 'excluded'` → documented `it()` that does nothing but record the reason in test output.
   - `kind: 'lossless'` / `'lossless-via'` → seed a row with a sentinel value in the target column, export to GEDCOM at the version, re-import into a fresh DB, assert the column equals the sentinel.
   - `kind: 'lossy'` → same, but the assertion compares against the registry-declared expected-degraded value (e.g. for `events.value` under `v551` on a non-fact tag, the expected post-round-trip value is `null` because the importer puts the original line value in NOTE, not back into `value`). The expected-degradation function lives in the registry alongside the reason, so the test never silently slides further away from the documented behaviour.

5. **Golden-DB-seed round-trip test** — `tests/unit/gedcom-fidelity-golden.test.ts`, new file. Per version:
   - Seed a comprehensive in-memory DB exercising every supported column at least once, including multi-field interactions on the same row (e.g., a person with prefix + suffix + REFN + RIN; an OCCU event with value + cause + notes + date + place; a couple relationship with marriage + divorce events).
   - Export → re-import into a fresh DB → assert *all* relevant rows are equal (after canonicalisation: drop `created_at`/`updated_at`, drop UUIDs that are re-issued by import, sort multi-row tables deterministically).
   - Catches multi-field interactions that single-field tests miss (e.g., "value field works alone, value+cause both work alone, but exporter emits them in wrong order so re-import gets confused").

6. **Helpers** — `tests/helpers/gedcom_fidelity.ts`, new file:
   - `seedRowWithColumn(db, table, col, sentinel)` — type-aware insert that satisfies foreign keys.
   - `makeSentinelValue(table, col): unknown` — generates a column-type-aware sentinel (string, int, ISO date, etc.) that is recognisable across round-trip.
   - `canonicaliseDb(db)` — strips audit columns, sorts multi-row tables, returns a deep-equal-friendly object.
   - `EXEMPT_TABLES` — small allowlist with one-line reasons (see Scope deviations).

7. **`.claude/skills/gedcom/SKILL.md`** — append a "Round-trip fidelity registry" section pointing at the new files so future GEDCOM work flows through the registry on every change.

8. **`docs/PLAN.md`** — append the audit milestone, plus a follow-up entry per `lossy`/`excluded` field that should ideally be promoted to `lossless` later.

### Scope deviations (explicit)

- **Tables exempt from the registry:** `gazetteers`, `ignored_duplicates`, `media_regions`, `db_settings`, `person_names_new`, `research_tasks_new`. Rationale per table:
  - `gazetteers` — gazetteer cache; pure derived data per Prime Directive #1.
  - `ignored_duplicates` — per-DB UI state; no source-data analog.
  - `media_regions` — face/region annotations on media; no GEDCOM 5.5.1 representation, and 7.0's `OBJE.CROP` is not yet implemented. **Will be added to the registry** with `lossy` (5.5.1) / `lossless-via:OBJE.CROP` (7.0) once the 7.0 OBJE.CROP exporter lands. For now, exempt with a TODO. *This is the only exemption that is a known gap rather than a category exemption.*
  - `db_settings` — per-install preferences; user-specific state, not genealogical data.
  - `person_names_new`, `research_tasks_new` — migration artifacts; should not exist in a settled DB. The schema-coverage test asserts these tables are empty in any healthy DB.

  Each exemption appears in `EXEMPT_TABLES` with the one-line reason as a code comment. Adding to the list requires PR justification.

- **No archive (.zip) round-trip enforcement.** The Prime Directive amendment names `.zip` archive export/import as conceptually in-scope, but mechanical enforcement is out of scope for this plan. Reason: blast radius. A follow-up plan adds an `ARCHIVE_FIDELITY` registry mirroring this one, sharing the helper infrastructure. Logged in `docs/PLAN.md`.

- **No real-world `.ged` golden source.** The golden tests seed from DB rows, not from a hand-built `.ged` source file. Reason: per the scope-direction note above, the contract is DB → GEDCOM → DB. A hand-built source `.ged` would test the wrong direction.

- **No automatic remediation of `lossy` entries discovered by the audit.** When the audit pass surfaces a column that should ideally be `lossless` but is currently `lossy`, the registry records `lossy:<reason>` and a follow-up plan is opened in `docs/PLAN.md`. This plan does not chase those fixes inline — that would balloon scope unpredictably. Each follow-up promotes the registry entry to `lossless` when it ships, and the per-field test then enforces the stronger guarantee automatically.

- **MCP tool argument schemas are NOT in the registry.** The registry is keyed on `(table, column)`, not on tool input shapes. Reason: the contract is about persisted data, not API surface. MCP tools that accept fields not yet in the schema are caught by other tests.

## Architecture

### Data flow — the contract

```
Seed DB (sentinel values per column)
     │
     ▼  exportGedcom(db, { version: 'v551' | 'v70' })
GEDCOM string
     │
     ▼  importGedcom(freshDb, gedcomString)
Re-imported DB
     │
     ▼  read column / canonicalise table
Compared against seed value (or registry-declared lossy expectation)
```

Three test files, three granularities:
- **Coverage guard** — schema introspection, no I/O. Catches "you added a column."
- **Per-field** — one column at a time. Catches "you broke this one column's round-trip."
- **Golden-DB-seed** — comprehensive multi-row, multi-table seed. Catches "you broke an interaction between columns."

### Registry as source of truth

The registry is the single document that binds schema + import + export behavior. It is read by:
- The coverage guard test (asserts schema and registry match).
- The per-field test (drives test generation).
- The golden test (informs canonicalisation: which columns to drop, which lossy expectations to apply).
- Future code review (a PR that touches `src/api/schema.ts` *should* also touch the registry).

There is no separate `docs/GEDCOM_FIDELITY_AUDIT.md`. The registry *is* the audit. A separate doc would rot the moment the schema changed; the registry rots loudly (test fails) the moment the schema changes.

### Sequencing within this plan

1. Land the registry as a new file with **all current schema columns** registered. This is the audit pass.
2. Land the coverage guard test — should pass on first run because step 1 populated everything.
3. Land the per-field test — many will pass; some will fail (revealing real round-trip bugs in current code). Each failure is triaged: tiny fix lands in this plan with a registry promotion, larger fix is logged as a follow-up and the registry records `lossy:<reason>` so the test passes against the documented behavior.
4. Land the golden-DB-seed test. Same triage rule.
5. **Negative-case demonstration:** introduce a fake `ALTER TABLE persons ADD COLUMN scratch TEXT` migration locally, run `npm test`, observe the coverage guard fail with a clear message naming `persons.scratch`, then revert. This is part of plan acceptance. The plan is not done until I (the user) have seen the guard fire.

## Prime Directive amendment

To be inserted into `CLAUDE.md` directly below the existing "⚠️ Prime Directive: Data Fidelity" section, as a sibling section:

---

**⚠️ Prime Directive (cont.): Round-Trip Fidelity**

**The user must be able to leave with their data intact. Every authored field in the database must survive a GEDCOM 5.5.1 *or* 7.0 round-trip — or be explicitly, justifiably excluded.**

The data lifecycle includes offboarding. A user who exports their database to GEDCOM and re-imports it (in this app, or any other) must get the same data back. This is co-equal with authored-data preservation: the first protects the user's data while it lives in our DB; this protects it as it leaves.

**Contract direction:** DB → GEDCOM → DB. Whatever the user has in their database after import (with import-time loss already disclosed by the import report) round-trips losslessly. This audit does not enforce parity with the source GEDCOM file — that is the importer's *disclosure* responsibility, not this contract.

**The contract is mechanical, not aspirational:**

- Every `(table, column)` pair in the schema has an entry in `src/api/gedcom_fidelity_registry.ts` declaring its round-trip status under both GEDCOM 5.5.1 and 7.0.
- Status values: `lossless` | `lossless-via:<mechanism>` | `lossy:<reason>` | `excluded:<reason>`.
- A schema-introspection unit test asserts that *every* column has an entry. **Adding a column without a registry entry breaks CI.** This is by design.
- Per-field round-trip tests exercise every non-excluded entry: seed a DB column → export to GEDCOM → re-import into a fresh DB → assert column value preserved (or matches the registry-declared lossy expectation).
- Golden-DB-seed round-trip tests seed a comprehensive multi-table DB → export → re-import → assert DB equivalence. Catches multi-field interactions.

**What "excluded" legitimately means:**
- App-internal audit: `created_at`, `updated_at`, `id` (UUID — re-issued on import).
- Derived/cached at render time: gazetteer rows, resolved coordinates, normalised name forms.
- Genuinely unrepresentable in the targeted GEDCOM version. Must cite the spec section it tried to map to.

**What "excluded" does NOT mean:**
- "It would be hard to round-trip." Hard ≠ excluded. `lossy` is fine if recorded; silent drop is not.
- "We don't use this field much." Authored data is authored data.
- "GEDCOM 5.5.1 can't carry it but 7.0 can." That's `lossy:5.5.1-spec-limit` for v551 and `lossless` for v70 — not excluded.

**Where this rule applies:** schema migrations, importer (`src/import/gedcom/`, `src/gedcom/importer.ts`), exporter (`src/gedcom/exporter.ts`), MCP tools that mutate persisted state, any new entity. Render-only and gazetteer-only code is exempt by definition (does not write authored data). Archive (`.zip`) export/import is in-scope conceptually but mechanical enforcement ships in a follow-up plan.

**Why this matters:** the user's choice to use this app must remain reversible. If our schema evolves in a way that strands their data inside our format, we have failed them — even if everything works perfectly while they stay.

---

## Verification

The user-observable outcome is *"it is impossible for me to make a schema change that quietly breaks GEDCOM round-trip."* The check that proves it:

1. **Negative-case demonstration in the plan itself.** The plan's final task is "introduce a fake migration `ALTER TABLE persons ADD COLUMN scratch TEXT`, run `npm test`, observe the coverage-guard test fail with the column name, then revert." This is plan acceptance — not an aside.
2. **Per-field round-trip green** for every non-excluded entry under both `v551` and `v70`. Lossy entries pass against their declared degraded expectation.
3. **Golden-DB-seed round-trip green** for both versions.
4. **Smoke check by user**: take a real `.ged`, import through the running app, export, re-import, open one person of interest in both DBs, confirm fields match. (Catches anything the unit tests' synthetic sentinels miss.)

Lint, type-check, and "function exists" assertions do **not** count toward verification — they're hygiene.

## Failure modes / RCA reference

**The bug class this plan exists to prevent:**

A field exists in the source GEDCOM file → importer parses it → throws it away → exporter never produces it because it was never persisted → no test fires because no test asserts "round-trip preserves the value." The schema doesn't betray the bug because the schema stores what we *do* persist correctly.

**The events fact-value bug** discovered 2026-05-01 (`OCCU Carpenter` line value silently dropped on import; design spec at `2026-05-02-events-fact-value-design.md`) is the immediate trigger. That bug is *not* directly caught by this plan's tests — its loss happens at import time, before anything is in the DB to round-trip. It is caught by the *events plan fixing the importer*. This plan's job: once `events.value` is registered as `lossless` (under v70) and `lossy` (under v551), it stays at those levels forever. Any future regression that re-introduces drop-on-import for `OCCU` value fails the per-field test for `events.value` immediately.

**Class of bug NOT addressed by this plan:**

- "Importer drops a source-file tag we don't model at all." That's importer disclosure, not round-trip. The importer must report it via the existing `unmappedData` / import report mechanism. Audited separately.
- "Exporter emits invalid GEDCOM syntax." Caught by `gedcom-validation.test.ts` already; not this plan's responsibility.
- "Round-trip works in our app but not in another genealogy app." Out of scope — interoperability with third-party software is a wider concern than DB→GEDCOM→DB.

**Why pure golden-fixture testing (rejected Approach 3) doesn't catch the bug class:**

A pure golden fixture is a `.ged` file. Adding a new column to the schema doesn't change the fixture — there's no signal. The new column ships untested. This is exactly how the events fact-value drop survived for years: there was no test asserting *every column round-trips*, only tests asserting specific scenarios round-trip.

**The class of regression this plan WILL catch:**

- Schema column added without registry entry → coverage test fails on column name.
- Schema column renamed without registry update → coverage test fails on stale key.
- Exporter changed to omit a `lossless` column → per-field test fails for that column.
- Importer changed to drop a `lossless` column on re-import → per-field test fails.
- Multi-column interaction broken (e.g., emit order changes such that re-import misattributes a value) → golden-DB-seed test fails.
- A `lossy` field's degradation gets *worse* (further drop beyond what was registered) → per-field test fails because the actual post-round-trip value no longer matches the registered expectation.
