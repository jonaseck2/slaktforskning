# GEDCOM Alignment — Audit + Full Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per-task subagent dispatch uses the `subagent-handoff` skill's project-local prompt templates.

**Goal:** Every authored field in the database round-trips losslessly through GEDCOM 7.0 (and per-version-best through GEDCOM 5.5.1) — schema, importer, exporter, fidelity registry, and UI all in alignment. Every authorable column has a UI entry point. Other importers (Holger, Genney, RootsMagic, Gramps) populate the new tables where the source format carries the concept.

**Architecture:** Per-concept importer/exporter modularization to enable parallel execution; per-version fidelity registry classification (5.5.1 lossy where spec-limited, 7.0 lossless where spec carries the concept); per-task TDD with explicit verification commands; subagent-driven dispatch with worktree isolation per task.

**Tech Stack:** Tauri 2 (Rust host + Vue 3 renderer) + rusqlite + Vitest + Playwright + @modelcontextprotocol/sdk. See `CLAUDE.md` for the full stack reference.

**Spec:** `docs/plans/2026-05-19-gedcom-alignment-design.md` (commits `c35c58c2`, `9527ab49`)

---

## Phase 0 — Audit (serial, 1 task)

### T01: Write the GEDCOM audit doc

**Goal:** Permanent reference doc `docs/GEDCOM_AUDIT.md` classifying every schema column against GEDCOM 5.5.1, 7.0, Holger, Genney, RootsMagic, Gramps; listing every gap with severity + task-id; recommending future work.

**Files:**
- Create: `docs/GEDCOM_AUDIT.md`
- Reference (read-only): `src/api/schema.ts`, `src/api/gedcom_fidelity_registry.ts`, `docs/plans/2026-05-19-gedcom-alignment-design.md`, `src/import/holger/*`, `src/import/genney/*`, `src/import/rootsmagic/*`, `src/import/gramps/*`

**Dependencies:** None (entry task).

**Unblocks:** T02 (reads modeling decisions from this doc), T03 (reads classification table).

**Verification:** Doc contains three sections (entity model alignment table covering all 16 schema tables / gap classification list / recommended future work). Each row in the gap classification table points to a task-id in this plan (T03–T28).

**Steps:**

- [x] **Step 1: Inventory every (table, column) pair in `src/api/schema.ts`**

   List all 16 tables with their columns. Cross-reference with `src/api/gedcom_fidelity_registry.ts` to confirm coverage (the coverage-guard test in `tests/unit/gedcom-fidelity-registry-coverage.test.ts` enforces this).

- [x] **Step 2: Write the "Entity model alignment" section**

   For each table, one row with columns: `Our table` | `GEDCOM 5.5.1` | `GEDCOM 7.0` | `Holger` | `Genney` | `RootsMagic` | `Gramps` | `Verdict`. Verdict is ✅ aligned / ⚠️ different shape that round-trips / ❌ gap. Cite the GEDCOM tag (INDI, FAM, SOUR, REPO, OBJE, PLAC, NOTE, SNOTE, ASSO, etc.) and explain mapping per importer.

   Document the deliberate-deviations explicitly: `relationships`+`event_participants` is GEDCOM-X-influenced (more expressive than FAM); `citations` is a normalized inline-SOUR factoring; `media_regions` and `groups`/`research_tasks` are app-specific.

- [x] **Step 3: Write the "Gap classification" section**

   Enumerate every gap from the corner-case table in the spec + the UI audit + the new-concept additions. Each row: `Concept` | `Severity` (silent-loss / authoring-blocked / nice-to-have) | `Surface` (schema / importer / exporter / UI / all) | `5.5.1 status` | `7.0 status` | `Task-id` (T03–T28).

   Per-importer impact column: for each non-GEDCOM importer, note whether the source format carries the concept (yes/no/partial).

- [x] **Step 4: Write the "Recommended future work" section**

   RECOMMEND (do not execute) `relationships` → `families`+`family_members`+`person_associations` rename as a follow-up plan. Document why the rename is model-cleanliness rather than Prime-Directive-load-bearing once T03 patches land (per the design spec's open-question #4).

   Note: each per-version `lossy` entry in the fidelity registry has an `expectedAfterRoundTrip` callback that documents the recoverable state; this is mechanical, not aspirational.

- [x] **Step 5: Commit**

   ```bash
   git add docs/GEDCOM_AUDIT.md
   git commit -m "docs: GEDCOM audit doc — T01

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
   ```

---

## Phase 1 — Schema scaffolding + corner-case patches (serial, 2 tasks)

### T02: Schema additions + module scaffolding + fidelity-registry placeholders

**Goal:** Land every new table and column in `src/api/schema.ts` at once. Scaffold empty per-concept importer/exporter modules. Drop `sources.repository` string column. Add fidelity-registry placeholder entries for all new columns so the coverage-guard test stays green and Phase 2 tasks refine in-place rather than appending.

**Files:**
- Modify: `src/api/schema.ts` (new tables + columns + drop `sources.repository`)
- Modify: `src/api/types.ts` (new TypeScript domain types)
- Modify: `src/api/gedcom_fidelity_registry.ts` (placeholder entries per new column)
- Modify: `src/gedcom/exporter.ts` (refactor to delegate to per-concept emitters)
- Modify: `src/import/gedcom/phases.ts` (orchestrate per-concept phases; existing pattern already)
- Create: `src/gedcom/exporters/notes-emitter.ts` (stub)
- Create: `src/gedcom/exporters/assoc-emitter.ts` (stub)
- Create: `src/gedcom/exporters/negation-emitter.ts` (stub)
- Create: `src/gedcom/exporters/translations-emitter.ts` (stub)
- Create: `src/gedcom/exporters/coverage-emitter.ts` (stub)
- Create: `src/import/gedcom/phases/notes.ts` (stub)
- Create: `src/import/gedcom/phases/negations.ts` (stub)
- Create: `src/import/gedcom/phases/translations.ts` (stub)
- Create: `src/import/gedcom/phases/coverage.ts` (stub)
- (existing `src/import/gedcom/phases/asso.ts` extended in T05; no stub needed)
- Test: `tests/unit/schema.test.ts` (assert every new table/column exists with correct DEFAULT, NOT NULL, FK)
- Test: `tests/unit/gedcom-fidelity-registry-coverage.test.ts` (existing — must stay green; new columns covered by placeholders)

**Dependencies:** T01.

**Unblocks:** T03 + every Phase 2 task.

**Verification:**
- `npm test -- schema.test.ts` passes with new assertions
- `npm test -- gedcom-fidelity-registry-coverage` passes (no orphan columns)
- `npm run build` exits 0
- `npm run build:mcp-sidecar` exits 0
- Manual: open the running app via `npm start`, create a fresh DB; inspect schema via `db_stats` MCP tool to confirm new tables visible

**Steps:**

- [x] **Step 1: Write schema test assertions for every new table/column**

   Add to `tests/unit/schema.test.ts`:

   ```typescript
   describe('GEDCOM-alignment schema additions (T02)', () => {
     it('creates notes table', async () => {
       const db = await createTestDb();
       const cols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(notes)')).map(c => c.name);
       expect(cols).toEqual(expect.arrayContaining(['id', 'text', 'language', 'created_at', 'updated_at']));
     });

     it('creates note_links polymorphic table', async () => {
       const db = await createTestDb();
       const cols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(note_links)')).map(c => c.name);
       expect(cols).toEqual(expect.arrayContaining(['id', 'note_id', 'entity_type', 'entity_id', 'sort_order', 'created_at']));
     });

     it('creates person_associations table', async () => {
       const db = await createTestDb();
       const cols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(person_associations)')).map(c => c.name);
       expect(cols).toEqual(expect.arrayContaining(['id', 'person_id', 'related_person_id', 'role', 'notes', 'created_at']));
     });

     it('adds events.is_negation and events.negation_event_type', async () => {
       const db = await createTestDb();
       const cols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(events)')).map(c => c.name);
       expect(cols).toContain('is_negation');
       expect(cols).toContain('negation_event_type');
     });

     it('creates name_translations table', async () => {
       const db = await createTestDb();
       const cols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(name_translations)')).map(c => c.name);
       expect(cols).toEqual(expect.arrayContaining(['id', 'person_name_id', 'value', 'language', 'transliteration_scheme', 'created_at']));
     });

     it('creates place_translations table', async () => {
       const db = await createTestDb();
       const cols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(place_translations)')).map(c => c.name);
       expect(cols).toEqual(expect.arrayContaining(['id', 'place_id', 'value', 'language', 'transliteration_scheme', 'created_at']));
     });

     it('creates source_coverage_events table', async () => {
       const db = await createTestDb();
       const cols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(source_coverage_events)')).map(c => c.name);
       expect(cols).toEqual(expect.arrayContaining(['id', 'source_id', 'event_type', 'date_value_from', 'date_value_to', 'place_id', 'notes', 'created_at']));
     });

     it('removes sources.repository string column', async () => {
       const db = await createTestDb();
       const cols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(sources)')).map(c => c.name);
       expect(cols).not.toContain('repository');
     });

     it('persons.sex CHECK constraint allows X', async () => {
       const db = await createTestDb();
       await expect(runSql(db, "INSERT INTO persons (id, sex, notes) VALUES ('test-x', 'X', '')")).resolves.toBeDefined();
     });
   });
   ```

- [x] **Step 2: Run schema test to confirm it fails**

   ```bash
   npm test -- schema.test.ts -t "T02" 2>&1 | tail -30
   ```

   Expected: 8 failures (the new tables/columns don't exist yet).

- [x] **Step 3: Add new tables to `src/api/schema.ts`**

   In the main schema string (the multi-line `CREATE TABLE IF NOT EXISTS` block), append:

   ```sql
   CREATE TABLE IF NOT EXISTS notes (
     id TEXT PRIMARY KEY,
     text TEXT NOT NULL DEFAULT '',
     language TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );

   CREATE TABLE IF NOT EXISTS note_links (
     id TEXT PRIMARY KEY,
     note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
     entity_type TEXT NOT NULL CHECK (entity_type IN ('person', 'event', 'relationship', 'place', 'source', 'repository', 'media', 'family')),
     entity_id TEXT NOT NULL,
     sort_order INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE (note_id, entity_type, entity_id)
   );
   CREATE INDEX IF NOT EXISTS idx_note_links_note ON note_links(note_id);
   CREATE INDEX IF NOT EXISTS idx_note_links_entity ON note_links(entity_type, entity_id);

   CREATE TABLE IF NOT EXISTS person_associations (
     id TEXT PRIMARY KEY,
     person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
     related_person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
     role TEXT NOT NULL DEFAULT 'other' CHECK (role IN ('godparent', 'friend', 'colleague', 'enemy', 'neighbor', 'other')),
     notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE (person_id, related_person_id, role)
   );
   CREATE INDEX IF NOT EXISTS idx_person_associations_person ON person_associations(person_id);
   CREATE INDEX IF NOT EXISTS idx_person_associations_related ON person_associations(related_person_id);

   CREATE TABLE IF NOT EXISTS name_translations (
     id TEXT PRIMARY KEY,
     person_name_id TEXT NOT NULL REFERENCES person_names(id) ON DELETE CASCADE,
     value TEXT NOT NULL,
     language TEXT NOT NULL DEFAULT '',
     transliteration_scheme TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX IF NOT EXISTS idx_name_translations_person_name ON name_translations(person_name_id);

   CREATE TABLE IF NOT EXISTS place_translations (
     id TEXT PRIMARY KEY,
     place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
     value TEXT NOT NULL,
     language TEXT NOT NULL DEFAULT '',
     transliteration_scheme TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX IF NOT EXISTS idx_place_translations_place ON place_translations(place_id);

   CREATE TABLE IF NOT EXISTS source_coverage_events (
     id TEXT PRIMARY KEY,
     source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
     event_type TEXT NOT NULL,
     date_value_from TEXT NOT NULL DEFAULT '',
     date_value_to TEXT NOT NULL DEFAULT '',
     place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
     notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX IF NOT EXISTS idx_source_coverage_source ON source_coverage_events(source_id);
   ```

   Modify `events` table to add new columns. Since `CREATE TABLE IF NOT EXISTS` won't add to existing tables, but the project rule says no users → no migration, the in-memory `createTestDb()` always creates from scratch. Update the main `CREATE TABLE events` block to add `is_negation INTEGER NOT NULL DEFAULT 0` and `negation_event_type TEXT NOT NULL DEFAULT ''` to the schema. The dev-test DB always regenerates from this schema.

   For `persons.sex` CHECK extension: the schema currently has `sex TEXT NOT NULL DEFAULT 'U' CHECK (sex IN ('M','F','U'))`. Update to `sex TEXT NOT NULL DEFAULT 'U' CHECK (sex IN ('M','F','U','X'))`.

   For `sources.repository` column removal: remove from the `CREATE TABLE sources` block. Confirm `source_repositories` join table already exists (it does).

- [x] **Step 4: Add TypeScript domain types to `src/api/types.ts`**

   ```typescript
   export interface Note {
     id: string;
     text: string;
     language: string;
     created_at: string;
     updated_at: string;
   }

   export interface NoteLink {
     id: string;
     note_id: string;
     entity_type: 'person' | 'event' | 'relationship' | 'place' | 'source' | 'repository' | 'media' | 'family';
     entity_id: string;
     sort_order: number;
     created_at: string;
   }

   export interface PersonAssociation {
     id: string;
     person_id: string;
     related_person_id: string;
     role: 'godparent' | 'friend' | 'colleague' | 'enemy' | 'neighbor' | 'other';
     notes: string;
     created_at: string;
   }

   export interface NameTranslation {
     id: string;
     person_name_id: string;
     value: string;
     language: string;
     transliteration_scheme: string;
     created_at: string;
   }

   export interface PlaceTranslation {
     id: string;
     place_id: string;
     value: string;
     language: string;
     transliteration_scheme: string;
     created_at: string;
   }

   export interface SourceCoverageEvent {
     id: string;
     source_id: string;
     event_type: string;
     date_value_from: string;
     date_value_to: string;
     place_id: string | null;
     notes: string;
     created_at: string;
   }
   ```

   Update `GenealogyEvent` to include `is_negation: boolean; negation_event_type: string`.

   Update `Person.sex` union: `'M' | 'F' | 'U' | 'X'`.

   Remove `Source.repository` field from the `Source` interface.

- [x] **Step 5: Add fidelity-registry placeholders for every new column**

   In `src/api/gedcom_fidelity_registry.ts`, append entries for every new (table, column) pair. Use placeholders that Phase 2 tasks will refine. Example:

   ```typescript
   // ----- notes (added T02; filled by T04) -----
   'notes.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
   'notes.text': {
     v551: { kind: 'lossy', reason: '5.5.1-shared-degrades-to-inline', expectedAfterRoundTrip: (seeded) => seeded },
     v70: { kind: 'lossless' },
     // ownedBy set in T04
   },
   'notes.language': {
     v551: { kind: 'lossy', reason: '5.5.1-no-language-on-inline-note', expectedAfterRoundTrip: () => '' },
     v70: { kind: 'lossless' },
   },
   'notes.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },
   'notes.updated_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },

   // ----- note_links (added T02; filled by T04) -----
   'note_links.id': { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
   'note_links.note_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
   'note_links.entity_type': {
     v551: { kind: 'lossless-via', mechanism: 'XREF link from owning entity to NOTE record' },
     v70: { kind: 'lossless-via', mechanism: 'XREF link from owning entity to SNOTE record' },
   },
   'note_links.entity_id': { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
   'note_links.sort_order': {
     v551: { kind: 'lossless-via', mechanism: 'preserved by emission order within parent entity' },
     v70: { kind: 'lossless-via', mechanism: 'preserved by emission order within parent entity' },
   },
   'note_links.created_at': { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },
   ```

   Continue this pattern for `person_associations.*`, `events.is_negation`, `events.negation_event_type`, `name_translations.*`, `place_translations.*`, `source_coverage_events.*`. T04–T08 refine these (set `ownedBy`, refine `kind`).

- [x] **Step 6: Refactor `src/gedcom/exporter.ts` to call per-concept emitter modules**

   Identify the section of `exporter.ts` that emits inline tags under INDI/FAM (NOTE, ASSO, OBJE, etc.). Extract notes/associations/negations/translations/coverage emission into separate functions in the new `src/gedcom/exporters/<name>-emitter.ts` files. The main `exporter.ts` orchestrator calls each in turn.

   For T02 scope: create the stub modules with the expected function signatures and empty bodies. They emit nothing (deferred to T04–T08). The orchestrator calls them so the integration surface is wired.

   Example `src/gedcom/exporters/notes-emitter.ts`:

   ```typescript
   import type { Database } from '../../api/db';

   /**
    * Emit NOTE / SNOTE structures for an entity.
    *
    * 7.0: emit SNOTE @Nx@ pointers; the actual SNOTE records are emitted
    *      at top level by emitSharedNoteRecords below.
    * 5.5.1: emit inline NOTE values directly under the entity (no shared).
    *
    * Filled by T04. Stub returns no lines.
    */
   export async function emitNotesForEntity(
     db: Database,
     entityType: 'person' | 'event' | 'relationship' | 'place' | 'source' | 'repository' | 'media' | 'family',
     entityId: string,
     baseLevel: number,
     version: '5.5.1' | '7.0',
     lines: string[],
   ): Promise<void> {
     // T04 implements
   }

   export async function emitSharedNoteRecords(
     db: Database,
     version: '5.5.1' | '7.0',
     lines: string[],
   ): Promise<void> {
     // T04 implements
   }
   ```

   Same shape for `assoc-emitter.ts`, `negation-emitter.ts`, `translations-emitter.ts`, `coverage-emitter.ts`. Each has placeholder function(s) that the corresponding Phase 2 task fills.

- [x] **Step 7: Refactor `src/import/gedcom/phases.ts` to call per-concept phase modules**

   `phases.ts` is already organized as an orchestrator calling per-phase modules under `src/import/gedcom/phases/`. Add stub imports and calls for the new phases:

   ```typescript
   import { phaseNotes } from './phases/notes';
   import { phaseNegations } from './phases/negations';
   import { phaseTranslations } from './phases/translations';
   import { phaseCoverage } from './phases/coverage';

   // ... existing phases ...
   await phaseNotes(ctx);           // T04 implements
   await phaseNegations(ctx);       // T06 implements (NO X structures)
   await phaseTranslations(ctx);    // T07 implements
   await phaseCoverage(ctx);        // T08 implements
   ```

   Each new stub module exports `phaseFoo(ctx: ImportContext): Promise<void>` that no-ops in T02; Phase 2 tasks fill in the logic.

- [x] **Step 8: Run schema test to confirm passes**

   ```bash
   npm test -- schema.test.ts -t "T02" 2>&1 | tail -10
   ```

   Expected: 8 passed.

- [x] **Step 9: Run full unit test suite to catch regressions**

   ```bash
   npm test 2>&1 | tail -20
   ```

   Expected: no new failures vs the previous baseline (pre-T02 git HEAD).

- [x] **Step 10: Run build**

   ```bash
   npm run build:bin 2>&1 | tail -5
   npm run build:mcp-sidecar 2>&1 | tail -5
   ```

   Expected: exit 0.

- [x] **Step 11: Commit**

   ```bash
   git add src/api/schema.ts src/api/types.ts src/api/gedcom_fidelity_registry.ts \
           src/gedcom/exporter.ts src/gedcom/exporters/ \
           src/import/gedcom/phases.ts src/import/gedcom/phases/notes.ts \
           src/import/gedcom/phases/negations.ts src/import/gedcom/phases/translations.ts \
           src/import/gedcom/phases/coverage.ts \
           tests/unit/schema.test.ts
   git commit -m "feat(schema): GEDCOM-alignment schema additions + emitter/phase scaffolding — T02

- New tables: notes, note_links, person_associations,
  name_translations, place_translations, source_coverage_events
- New columns: events.is_negation, events.negation_event_type
- persons.sex CHECK accepts 'X'
- Remove legacy sources.repository string column (no users yet)
- Scaffold per-concept emitter/phase modules so Phase 2 subagents
  can work in parallel without conflicts on exporter.ts/phases.ts
- Fidelity-registry placeholders for every new column; Phase 2
  tasks refine with ownedBy + final kind

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
   ```

---

### T03: Patch exporter for corner cases (single-parent FAM, PEDI, FAMC/FAMS, same-couple-twice, multi-parent triad)

**Goal:** Fix the five exporter corner cases identified in the design spec so round-trip fidelity is per-version-best (lossless on both versions where spec allows; lossy:5.5.1-spec-limit only for multi-parent triad).

**Files:**
- Modify: `src/gedcom/exporter.ts` (FAM emission block at lines ~543-694)
- Modify: `src/import/gedcom/phases/families.ts` (same-couple-twice import handling)
- Modify: `src/api/gedcom_fidelity_registry.ts` (multi-parent triad: lossy:5.5.1-spec-limit on v551, lossless on v70)
- Create: `tests/unit/gedcom-roundtrip-corner-cases.test.ts`

**Dependencies:** T02.

**Unblocks:** Every Phase 2 task (T04-T09), every Phase 3 task (T10-T19) — they branch from post-T03 main.

**Verification:**
- `npm test -- gedcom-roundtrip-corner-cases` passes (6 corner-case tests)
- `npm test -- gedcom` runs full GEDCOM test suite with no regressions vs pre-T03 baseline

**Steps:**

- [x] **Step 1: Write failing tests for all 6 corner cases**

   Create `tests/unit/gedcom-roundtrip-corner-cases.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { createTestDb } from './helpers';
   import { exportGedcom } from '../../src/gedcom/exporter';
   import { importGedcom } from '../../src/gedcom/importer';
   import { createPerson, addPersonName } from '../../src/api/persons';
   import { createRelationship } from '../../src/api/relationships';

   describe('GEDCOM corner-case round-trips (T03)', () => {
     describe('single-parent FAM', () => {
       it('mother + child + no father — link survives 5.5.1', async () => {
         const db = await createTestDb();
         const mother = await createPerson(db, { sex: 'F' });
         await addPersonName(db, { person_id: mother.id, given_name: 'Anna', surname: 'Eckerström', name_type: 'birth', sort_order: 0 });
         const child = await createPerson(db, { sex: 'M' });
         await addPersonName(db, { person_id: child.id, given_name: 'Erik', surname: 'Eckerström', name_type: 'birth', sort_order: 0 });
         await createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: child.id, subtype: 'biological', notes: '' });
         // No couple relationship — single parent.
         const { ged } = await exportGedcom(db, { version: '5.5.1' });
         // Re-import.
         const db2 = await createTestDb();
         await importGedcom(db2, ged);
         const rels = await (await import('../../src/api/relationships')).listRelationships(db2);
         const pcLinks = rels.filter(r => r.type === 'parent_child');
         expect(pcLinks).toHaveLength(1);
       });

       it('same scenario survives 7.0 round-trip', async () => {
         const db = await createTestDb();
         const mother = await createPerson(db, { sex: 'F' });
         await addPersonName(db, { person_id: mother.id, given_name: 'Anna', surname: 'Eckerström', name_type: 'birth', sort_order: 0 });
         const child = await createPerson(db, { sex: 'M' });
         await addPersonName(db, { person_id: child.id, given_name: 'Erik', surname: 'Eckerström', name_type: 'birth', sort_order: 0 });
         await createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: child.id, subtype: 'biological', notes: '' });
         const { ged } = await exportGedcom(db, { version: '7.0' });
         const db2 = await createTestDb();
         await importGedcom(db2, ged);
         const rels = await (await import('../../src/api/relationships')).listRelationships(db2);
         expect(rels.filter(r => r.type === 'parent_child')).toHaveLength(1);
       });
     });

     describe('PEDI subtype per-parent correctness', () => {
       it('bio-mother + step-father couple + child (biological-to-mother, step-to-father)', async () => {
         // Seed: 1 couple + 2 parent_child rows with different subtypes.
         // Export → re-import → assert both subtypes correct.
         // (Full test body filled by T03 executor following the pattern above.)
       });
     });

     describe('FAMC/FAMS emission on INDI', () => {
       it('5.5.1 exporter emits FAMS on each spouse and FAMC on each child', async () => {
         // Seed couple + child; export 5.5.1; parse output; assert FAMS on both
         // spouses and FAMC on the child.
       });
       it('7.0 exporter emits the same', async () => {
         // Same shape, version 7.0.
       });
     });

     describe('same-couple-twice', () => {
       it('imports two FAM records with same HUSB+WIFE as two relationship rows', async () => {
         const ged = `
   0 HEAD
   1 GEDC
   2 VERS 5.5.1
   0 @I1@ INDI
   1 NAME Anna /Eckerström/
   1 SEX F
   1 FAMS @F1@
   1 FAMS @F2@
   0 @I2@ INDI
   1 NAME Erik /Eckerström/
   1 SEX M
   1 FAMS @F1@
   1 FAMS @F2@
   0 @F1@ FAM
   1 HUSB @I2@
   1 WIFE @I1@
   1 MARR
   2 DATE 5 MAY 1850
   0 @F2@ FAM
   1 HUSB @I2@
   1 WIFE @I1@
   1 MARR
   2 DATE 5 MAY 1860
   0 TRLR`;
         const db = await createTestDb();
         await importGedcom(db, ged);
         const rels = await (await import('../../src/api/relationships')).listRelationships(db);
         const couples = rels.filter(r => r.type === 'couple');
         expect(couples).toHaveLength(2);
       });

       it('exports back to two FAM records', async () => {
         // Same seed via API → export → assert two FAM blocks emitted.
       });
     });

     describe('multi-parent triad', () => {
       it('7.0 emits FAM + ASSO ROLE PARENT for 3rd parent (lossless)', async () => {
         // Seed: child with bio-mother + bio-father (couple) + adoptive-mother (no couple)
         // 3 parent_child rows total.
         // Export 7.0 → parse output → assert FAM has HUSB/WIFE for couple
         // and `1 ASSO @I-adopt-mother@ / 2 ROLE PARENT` substructure.
         // Re-import → assert all 3 parent_child rows reconstruct.
       });

       it('5.5.1 emits FAM with strongest pair + disclosure for 3rd parent (lossy:5.5.1-spec-limit)', async () => {
         // Same seed; export 5.5.1; assert FAM has only 2 parents +
         // report.warnings contains "extra parent dropped" entry.
         // Re-import → assert 2 parent_child rows.
       });
     });
   });
   ```

   The above shows the test shape; the T03 executor fills the remaining body of each test using the helpers cited (`createPerson`, `createRelationship`, `exportGedcom`, `importGedcom`, `listRelationships`). The test file's first test (single-parent 5.5.1) is fully written; the executor mirrors its pattern.

- [x] **Step 2: Run tests to verify all 6 fail**

   ```bash
   npm test -- gedcom-roundtrip-corner-cases 2>&1 | tail -20
   ```

   Expected: 6 failures (corner cases not yet handled).

- [x] **Step 3: Patch single-parent FAM emission in `src/gedcom/exporter.ts`**

   After the existing `couples` loop (around line 590), add an "orphan parent_child" pass:

   ```typescript
   // Single-parent families: parent_child rows whose parent has no couple
   // relationship. Emit a synthetic FAM record per orphan parent.
   const parentChildRels = relationships.filter(r => r.type === 'parent_child');
   const orphanFamiliesByParent = new Map<string, Array<{ childId: string; subtype: string }>>();
   for (const pc of parentChildRels) {
     if (!pc.person1_id || !pc.person2_id) continue;
     const parentId = pc.person1_id;
     // Skip if parent is already in any couple (their parent_child rows are emitted under that couple).
     const inCouple = couples.some(c =>
       (c.person1_id === parentId || c.person2_id === parentId)
     );
     if (inCouple) continue;
     const entry = orphanFamiliesByParent.get(parentId) ?? [];
     entry.push({ childId: pc.person2_id, subtype: pc.subtype });
     orphanFamiliesByParent.set(parentId, entry);
   }
   let orphanIdx = couples.length;
   for (const [parentId, children] of orphanFamiliesByParent) {
     const xr = `@F${++orphanIdx}@`;
     lines.push(`0 ${xr} FAM`);
     const parent = await getPerson(db, parentId);
     const parentXref = personXref.get(parentId);
     if (parentXref) {
       const slot = parent?.sex === 'M' ? 'HUSB' : 'WIFE';  // single-parent uses sex-appropriate slot
       lines.push(`1 ${slot} ${parentXref}`);
     }
     for (const { childId, subtype } of children) {
       const cxr = personXref.get(childId);
       if (!cxr) continue;
       lines.push(`1 CHIL ${cxr}`);
       if (subtype && subtype !== 'biological') {
         const pedi = version === '7.0' ? subtype.toUpperCase() : subtype;
         lines.push(`2 PEDI ${pedi}`);
       }
     }
     // Register this synthetic FAM xref so FAMC/FAMS emission can reference it (Step 5).
     orphanFamilyByPersonId.set(parentId, xr);
     for (const { childId } of children) {
       orphanFamilyByChildId.set(childId, xr);
     }
   }
   ```

   Declare `const orphanFamilyByPersonId = new Map<string, string>();` and `const orphanFamilyByChildId = new Map<string, string>();` near the couples Map.

- [x] **Step 4: Patch PEDI subtype per-parent correctness**

   Replace the `Array.find()` call at exporter.ts:579 with an explicit per-parent lookup. The current code:

   ```typescript
   const pcRel = relationships.find(r =>
     r.type === 'parent_child' && r.person2_id === childId &&
     (r.person1_id === rel.person1_id || r.person1_id === rel.person2_id)
   );
   if (pcRel?.subtype) {
     let pedi = pcRel.subtype === 'biological' ? 'birth' : pcRel.subtype;
     // ...
   }
   ```

   Becomes:

   ```typescript
   // Collect BOTH parent_child rows (one per parent) for this child in this couple.
   const pcRelsForChild = relationships.filter(r =>
     r.type === 'parent_child' && r.person2_id === childId &&
     (r.person1_id === rel.person1_id || r.person1_id === rel.person2_id)
   );
   // If subtypes differ between the two parent rows (e.g., bio-to-mother +
   // step-to-father), GEDCOM PEDI is per-parent at level 3, not level 2.
   // Each parent_child row emits a `3 _PARENT @Ix@ / 4 PEDI ...` (custom 7.0 tag)
   // or for 5.5.1 we emit a single PEDI = the most-permissive (biological wins
   // if any parent is biological); this is documented in the fidelity registry.
   for (const pcRel of pcRelsForChild) {
     if (!pcRel.subtype || pcRel.subtype === 'biological') continue;
     let pedi = pcRel.subtype === 'biological' ? 'birth' : pcRel.subtype;
     if (version === '7.0') pedi = pedi.toUpperCase();
     lines.push(`2 PEDI ${pedi}`);
     if (version === '7.0' && pcRelsForChild.length > 1) {
       // Disambiguate which parent this PEDI applies to.
       const parentXref = personXref.get(pcRel.person1_id ?? '');
       if (parentXref) lines.push(`3 _PARENT ${parentXref}`);
     }
   }
   ```

   This is one of two reasonable shapes; the spec section "Multi-parent triad pair-election rule" gives the deterministic algorithm. The executor follows the test expectations exactly — the test file is the source of truth.

- [x] **Step 5: Patch FAMC/FAMS emission on INDI records**

   In the INDI emission block (before SOUR/OBJE/NOTE), after the existing `1 SEX ...` line, add:

   ```typescript
   // FAMC: families this person is a child of.
   for (const couple of couples) {
     const isChild = relationships.some(r =>
       r.type === 'parent_child' &&
       r.person2_id === p.id &&
       (r.person1_id === couple.person1_id || r.person1_id === couple.person2_id)
     );
     if (isChild) {
       const famXref = coupleXref.get(couple.id);
       if (famXref) lines.push(`1 FAMC ${famXref}`);
     }
   }
   // Also FAMC for orphan parent_child families.
   const orphanFamc = orphanFamilyByChildId.get(p.id);
   if (orphanFamc) lines.push(`1 FAMC ${orphanFamc}`);

   // FAMS: families this person is a spouse in.
   for (const couple of couples) {
     if (couple.person1_id === p.id || couple.person2_id === p.id) {
       const famXref = coupleXref.get(couple.id);
       if (famXref) lines.push(`1 FAMS ${famXref}`);
     }
   }
   // Also FAMS for orphan single-parent families where this person is the parent.
   const orphanFams = orphanFamilyByPersonId.get(p.id);
   if (orphanFams) lines.push(`1 FAMS ${orphanFams}`);
   ```

   Requires `coupleXref` to be a Map populated when the couples loop emits FAM blocks. Add `coupleXref.set(rel.id, xr)` inside the couples loop.

- [x] **Step 6: Patch same-couple-twice handling in importer**

   `src/import/gedcom/phases/families.ts` already creates one couple row per FAM (line 92: `const coupleId = uuid()`). Re-reading: it DOES already do this. The bug isn't in the importer. Verify by writing the import-side test (Step 1) and running — it should pass already. If it does pass, mark Step 6 as a no-op and document in the test comment.

   For the exporter side: confirm that two couple rows with the same person1_id+person2_id emit as two separate FAM records. Read the exporter's couples loop at exporter.ts:553 — it iterates `couples.length` and emits one FAM per index. Two rows = two FAM. Should pass. Verify by writing the export-side test.

   If both sides pass without changes, this corner case is already lossless — the only thing missing was the test. Document in the test that the exporter/importer happens to handle this correctly by virtue of relationship rows being independent.

- [x] **Step 7: Patch multi-parent triad (7.0 ASSO ROLE PARENT + 5.5.1 disclosure)**

   In the exporter's FAM-children loop:

   ```typescript
   // For each child, identify parents NOT in this FAM's HUSB/WIFE pair.
   for (const child of children) {
     const childPcRels = relationships.filter(r =>
       r.type === 'parent_child' && r.person2_id === child.id
     );
     const extraParents = childPcRels.filter(r =>
       r.person1_id !== rel.person1_id && r.person1_id !== rel.person2_id
     );
     for (const extraParent of extraParents) {
       if (!extraParent.person1_id) continue;
       const extraXref = personXref.get(extraParent.person1_id);
       if (!extraXref) continue;
       if (version === '7.0') {
         lines.push(`1 ASSO ${extraXref}`);
         lines.push(`2 ROLE PARENT`);
         if (extraParent.subtype && extraParent.subtype !== 'biological') {
           lines.push(`2 _PEDI ${version === '7.0' ? extraParent.subtype.toUpperCase() : extraParent.subtype}`);
         }
       } else {
         // 5.5.1: cannot represent. Disclose in report.
         report.warnings.push(`Extra parent dropped (5.5.1 spec limit): person ${extraParent.person1_id} is a ${extraParent.subtype ?? 'biological'} parent of ${child.id}`);
       }
     }
   }
   ```

   Pair-election (which two parents become HUSB/WIFE in the FAM, and which are extras) follows the deterministic algorithm in the spec:
   1. Existing-couple wins (the parents in the FAM's `rel.person1_id`/`rel.person2_id` ARE the elected pair; extra parents are those NOT in that pair).
   2. If we're emitting an orphan single-parent FAM (no couple), no other parent is in scope.

   For 5.5.1, the importer reads back FAM with 2 parents only; the 3rd parent's parent_child row doesn't exist in the re-imported DB. The fidelity registry classifies `relationships.person1_id` etc. as already-XREF-via, so the 3rd parent's relationship row is genuinely lost on 5.5.1 round-trip. The `expectedAfterRoundTrip` callback for the relevant registry entry returns the 2-parent-only state.

- [x] **Step 8: Update fidelity-registry entries**

   In `src/api/gedcom_fidelity_registry.ts`, find entries for `relationships.*` columns. Update them to reflect:

   - 7.0: continues to be `lossless` for the FAM-pair + `lossless-via:ASSO-ROLE-PARENT` for extras
   - 5.5.1: `lossless` for the FAM-pair + add a comment that extras are documented in the export-report's `warnings` array, not in the registry per-column (because the loss is a per-row drop, not a per-column degradation)

   Add a top-of-file comment in the registry explaining the corner-case patches.

- [x] **Step 9: Run all corner-case tests**

   ```bash
   npm test -- gedcom-roundtrip-corner-cases 2>&1 | tail -30
   ```

   Expected: 6 passed.

- [x] **Step 10: Run full GEDCOM test suite for regressions**

   ```bash
   npm test -- gedcom 2>&1 | tail -20
   ```

   Expected: no new failures vs pre-T03 baseline. The existing round-trip tests may pick up new FAMC/FAMS lines in their output — if they used "exact text" assertions, those tests need updates (acceptable; structural change).

- [x] **Step 11: Commit**

   ```bash
   git add src/gedcom/exporter.ts src/import/gedcom/phases/families.ts \
           src/api/gedcom_fidelity_registry.ts \
           tests/unit/gedcom-roundtrip-corner-cases.test.ts
   git commit -m "fix(gedcom): corner-case round-trip patches — T03

- Single-parent FAM emission for orphan parent_child rows
- Per-parent PEDI correctness (no more Array.find ambiguity)
- FAMC on each child INDI; FAMS on each parent INDI
- Same-couple-twice round-trip (verified, no code change needed)
- Multi-parent triad: 7.0 emits ASSO ROLE PARENT for 3rd+ parents
  (lossless); 5.5.1 emits warning + drops extras
  (lossy:5.5.1-spec-limit)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
   ```

---

## Phase 2 — Schema-feature integration (6 parallel tasks, gated on T03)

Each Phase 2 task lands one new concept end-to-end: api functions + GEDCOM importer module + GEDCOM exporter module + fidelity registry refinement + round-trip tests. Each task runs in its own worktree, branched from post-T03 main.

### T04: Shared notes (SNOTE) — api + importer + exporter + registry + tests

**Goal:** Shared notes are first-class entities; multiple persons/events/places can reference the same NOTE record. GEDCOM 7.0 SNOTE round-trips losslessly; GEDCOM 5.5.1 degrades to inline NOTE (documented lossy).

**Files:**
- Create: `src/api/notes.ts` (CRUD + link/unlink)
- Modify: `src/renderer/tauri-window-api.ts` (expose `window.api.notes.*` and `window.api.noteLinks.*`)
- Modify: `src/renderer/api.d.ts` (TypeScript types)
- Modify: `src/import/gedcom/phases/notes.ts` (implement — was stub from T02)
- Modify: `src/gedcom/exporters/notes-emitter.ts` (implement — was stub from T02)
- Modify: `src/gedcom/exporter.ts` (call `emitSharedNoteRecords()` at top level for 7.0)
- Modify: `src/api/gedcom_fidelity_registry.ts` (set `ownedBy` pointers on `notes.*` and `note_links.*` entries)
- Create: `tests/unit/notes.test.ts` (CRUD tests)
- Create: `tests/unit/gedcom-notes-roundtrip.test.ts` (round-trip both versions)

**Dependencies:** T03.

**Unblocks:** T20 (Shared notes UI).

**Verification:**
- `npm test -- notes.test.ts` passes
- `npm test -- gedcom-notes-roundtrip` passes (both 5.5.1 and 7.0)
- Re-run `npm test` — no regressions

**Steps:**

- [x] **Step 1: Write CRUD test in `tests/unit/notes.test.ts`**

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { createTestDb } from './helpers';
   import {
     createNote, getNote, listNotes, updateNote, deleteNote,
     linkNoteToEntity, unlinkNoteFromEntity, getNotesForEntity, getEntitiesForNote,
   } from '../../src/api/notes';
   import { createPerson } from '../../src/api/persons';

   describe('notes api (T04)', () => {
     it('creates a note', async () => {
       const db = await createTestDb();
       const note = await createNote(db, { text: 'A shared note.', language: 'sv' });
       expect(note.id).toBeDefined();
       expect(note.text).toBe('A shared note.');
       expect(note.language).toBe('sv');
     });

     it('links a note to multiple entities', async () => {
       const db = await createTestDb();
       const note = await createNote(db, { text: 'Shared.', language: '' });
       const person1 = await createPerson(db, { sex: 'M' });
       const person2 = await createPerson(db, { sex: 'F' });
       await linkNoteToEntity(db, note.id, 'person', person1.id);
       await linkNoteToEntity(db, note.id, 'person', person2.id);
       const links1 = await getNotesForEntity(db, 'person', person1.id);
       const links2 = await getNotesForEntity(db, 'person', person2.id);
       expect(links1).toHaveLength(1);
       expect(links2).toHaveLength(1);
       expect(links1[0].id).toBe(note.id);
     });

     it('unlinking does not delete the note', async () => {
       const db = await createTestDb();
       const note = await createNote(db, { text: 'Shared.', language: '' });
       const person = await createPerson(db, { sex: 'M' });
       await linkNoteToEntity(db, note.id, 'person', person.id);
       await unlinkNoteFromEntity(db, note.id, 'person', person.id);
       const surviving = await getNote(db, note.id);
       expect(surviving).not.toBeNull();
     });

     it('updates note text', async () => {
       const db = await createTestDb();
       const note = await createNote(db, { text: 'Original.', language: '' });
       await updateNote(db, note.id, { text: 'Updated.' });
       const fresh = await getNote(db, note.id);
       expect(fresh?.text).toBe('Updated.');
     });

     it('deleting a note removes all its links', async () => {
       const db = await createTestDb();
       const note = await createNote(db, { text: 'X', language: '' });
       const person = await createPerson(db, { sex: 'M' });
       await linkNoteToEntity(db, note.id, 'person', person.id);
       await deleteNote(db, note.id);
       const links = await getNotesForEntity(db, 'person', person.id);
       expect(links).toHaveLength(0);
     });
   });
   ```

- [x] **Step 2: Run tests to verify they fail**

   ```bash
   npm test -- notes.test.ts 2>&1 | tail -10
   ```

   Expected: "Cannot find module '../../src/api/notes'" / 5 failures.

- [x] **Step 3: Implement `src/api/notes.ts`**

   Follow the existing CRUD pattern in `src/api/groups.ts` for the entity shape and `src/api/group_links.ts` for the polymorphic link pattern. Functions:

   ```typescript
   import { v4 as uuid } from 'uuid';
   import type { Database } from './db';
   import { runSql, queryOne, queryAll, runSqlChanges } from './db';
   import type { Note, NoteLink } from './types';

   export async function createNote(db: Database, data: Pick<Note, 'text' | 'language'>): Promise<Note> {
     const id = uuid();
     await runSql(db,
       'INSERT INTO notes (id, text, language) VALUES (?, ?, ?)',
       [id, data.text, data.language ?? '']);
     const row = await queryOne<Note>(db, 'SELECT * FROM notes WHERE id = ?', [id]);
     return row!;
   }

   export async function getNote(db: Database, id: string): Promise<Note | null> {
     return (await queryOne<Note>(db, 'SELECT * FROM notes WHERE id = ?', [id])) ?? null;
   }

   export async function listNotes(db: Database): Promise<Note[]> {
     return await queryAll<Note>(db, 'SELECT * FROM notes ORDER BY created_at DESC');
   }

   export async function updateNote(db: Database, id: string, updates: Partial<Pick<Note, 'text' | 'language'>>): Promise<Note | null> {
     const fields: string[] = [];
     const vals: unknown[] = [];
     if ('text' in updates) { fields.push('text = ?'); vals.push(updates.text); }
     if ('language' in updates) { fields.push('language = ?'); vals.push(updates.language); }
     if (fields.length === 0) return await getNote(db, id);
     fields.push("updated_at = datetime('now')");
     await runSql(db, `UPDATE notes SET ${fields.join(', ')} WHERE id = ?`, [...vals, id]);
     return await getNote(db, id);
   }

   export async function deleteNote(db: Database, id: string): Promise<boolean> {
     return (await runSqlChanges(db, 'DELETE FROM notes WHERE id = ?', [id])) > 0;
   }

   export async function linkNoteToEntity(
     db: Database,
     noteId: string,
     entityType: NoteLink['entity_type'],
     entityId: string,
   ): Promise<NoteLink> {
     const id = uuid();
     await runSql(db,
       'INSERT INTO note_links (id, note_id, entity_type, entity_id) VALUES (?, ?, ?, ?)',
       [id, noteId, entityType, entityId]);
     return (await queryOne<NoteLink>(db, 'SELECT * FROM note_links WHERE id = ?', [id]))!;
   }

   export async function unlinkNoteFromEntity(
     db: Database,
     noteId: string,
     entityType: NoteLink['entity_type'],
     entityId: string,
   ): Promise<boolean> {
     return (await runSqlChanges(db, 'DELETE FROM note_links WHERE note_id = ? AND entity_type = ? AND entity_id = ?', [noteId, entityType, entityId])) > 0;
   }

   export async function getNotesForEntity(
     db: Database,
     entityType: NoteLink['entity_type'],
     entityId: string,
   ): Promise<Note[]> {
     return await queryAll<Note>(db,
       `SELECT n.* FROM notes n
        JOIN note_links nl ON nl.note_id = n.id
        WHERE nl.entity_type = ? AND nl.entity_id = ?
        ORDER BY nl.sort_order, n.created_at`,
       [entityType, entityId]);
   }

   export async function getEntitiesForNote(
     db: Database,
     noteId: string,
   ): Promise<NoteLink[]> {
     return await queryAll<NoteLink>(db,
       'SELECT * FROM note_links WHERE note_id = ? ORDER BY sort_order, created_at',
       [noteId]);
   }
   ```

- [x] **Step 4: Wire `window.api.notes` and `window.api.noteLinks`**

   In `src/renderer/tauri-window-api.ts`, add (following the pattern of `groups`):

   ```typescript
   import * as notes from '../api/notes';

   // ... inside the window.api object literal ...
   notes: {
     create: readWrite((db, data) => notes.createNote(db, data)),
     get: readOnly((db, id: string) => notes.getNote(db, id)),
     list: readOnly((db) => notes.listNotes(db)),
     update: readWrite((db, id: string, updates) => notes.updateNote(db, id, updates)),
     delete: readWrite((db, id: string) => notes.deleteNote(db, id)),
     forEntity: readOnly((db, entityType, entityId: string) => notes.getNotesForEntity(db, entityType, entityId)),
   },
   noteLinks: {
     link: readWrite((db, noteId: string, entityType, entityId: string) => notes.linkNoteToEntity(db, noteId, entityType, entityId)),
     unlink: readWrite((db, noteId: string, entityType, entityId: string) => notes.unlinkNoteFromEntity(db, noteId, entityType, entityId)),
     forNote: readOnly((db, noteId: string) => notes.getEntitiesForNote(db, noteId)),
   },
   ```

   Update `src/renderer/api.d.ts` to include the new `notes` and `noteLinks` namespaces with the corresponding type signatures.

- [x] **Step 5: Run CRUD test to verify passes**

   ```bash
   npm test -- notes.test.ts 2>&1 | tail -10
   ```

   Expected: 5 passed.

- [x] **Step 6: Write GEDCOM round-trip test**

   `tests/unit/gedcom-notes-roundtrip.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { createTestDb } from './helpers';
   import { exportGedcom } from '../../src/gedcom/exporter';
   import { importGedcom } from '../../src/gedcom/importer';
   import { createNote, linkNoteToEntity, listNotes } from '../../src/api/notes';
   import { createPerson } from '../../src/api/persons';

   describe('GEDCOM notes round-trip (T04)', () => {
     it('7.0 SNOTE round-trip preserves shared note across 2 persons (lossless)', async () => {
       const db = await createTestDb();
       const p1 = await createPerson(db, { sex: 'M' });
       const p2 = await createPerson(db, { sex: 'F' });
       const note = await createNote(db, { text: 'Both moved to America in 1880.', language: 'sv' });
       await linkNoteToEntity(db, note.id, 'person', p1.id);
       await linkNoteToEntity(db, note.id, 'person', p2.id);

       const { ged } = await exportGedcom(db, { version: '7.0' });
       expect(ged).toMatch(/0 @N\d+@ SNOTE/);  // top-level SNOTE record
       expect(ged.match(/SNOTE @N\d+@/g)?.length).toBe(2);  // referenced twice (one per INDI)

       const db2 = await createTestDb();
       await importGedcom(db2, ged);
       const reimported = await listNotes(db2);
       expect(reimported).toHaveLength(1);  // shared, not duplicated
       expect(reimported[0].text).toBe('Both moved to America in 1880.');
     });

     it('5.5.1 degrades shared notes to inline NOTE (lossy:5.5.1-shared-degrades-to-inline)', async () => {
       const db = await createTestDb();
       const p1 = await createPerson(db, { sex: 'M' });
       const p2 = await createPerson(db, { sex: 'F' });
       const note = await createNote(db, { text: 'Both moved to America in 1880.', language: 'sv' });
       await linkNoteToEntity(db, note.id, 'person', p1.id);
       await linkNoteToEntity(db, note.id, 'person', p2.id);

       const { ged, report } = await exportGedcom(db, { version: '5.5.1' });
       expect(ged).not.toMatch(/SNOTE/);  // no SNOTE in 5.5.1
       expect((ged.match(/1 NOTE/g) ?? []).length).toBe(2);  // inlined twice
       expect(report.warnings.some(w => w.includes('shared note degraded'))).toBe(true);

       const db2 = await createTestDb();
       await importGedcom(db2, ged);
       const reimported = await listNotes(db2);
       expect(reimported).toHaveLength(2);  // duplicated; lossy round-trip per registry
     });
   });
   ```

- [x] **Step 7: Run round-trip test to verify it fails**

   ```bash
   npm test -- gedcom-notes-roundtrip 2>&1 | tail -10
   ```

   Expected: 2 failures (SNOTE emitter not yet implemented).

- [x] **Step 8: Implement `src/gedcom/exporters/notes-emitter.ts`**

   Fill the stub from T02:

   ```typescript
   import { v4 as uuid } from 'uuid';
   import type { Database } from '../../api/db';
   import { getNotesForEntity, listNotes, getEntitiesForNote } from '../../api/notes';

   const noteXref = new Map<string, string>();
   let noteIdx = 0;

   export function resetNoteXrefs(): void {
     noteXref.clear();
     noteIdx = 0;
   }

   export async function emitNotesForEntity(
     db: Database,
     entityType: 'person' | 'event' | 'relationship' | 'place' | 'source' | 'repository' | 'media' | 'family',
     entityId: string,
     baseLevel: number,
     version: '5.5.1' | '7.0',
     lines: string[],
   ): Promise<void> {
     const notes = await getNotesForEntity(db, entityType, entityId);
     for (const note of notes) {
       if (version === '7.0') {
         // Emit SNOTE pointer; the SNOTE record itself is emitted at top level.
         let xr = noteXref.get(note.id);
         if (!xr) {
           xr = `@N${++noteIdx}@`;
           noteXref.set(note.id, xr);
         }
         lines.push(`${baseLevel} SNOTE ${xr}`);
       } else {
         // 5.5.1: inline.
         lines.push(`${baseLevel} NOTE ${note.text}`);
       }
     }
   }

   export async function emitSharedNoteRecords(
     db: Database,
     version: '5.5.1' | '7.0',
     lines: string[],
     report: { warnings: string[] },
   ): Promise<void> {
     if (version === '5.5.1') {
       // 5.5.1: emit nothing at top level. Warn if any note has multiple links.
       const allNotes = await listNotes(db);
       for (const note of allNotes) {
         const links = await getEntitiesForNote(db, note.id);
         if (links.length > 1) {
           report.warnings.push(`Shared note ${note.id} (linked to ${links.length} entities) degraded to inline NOTE on each — 5.5.1 spec limit (SNOTE is 7.0-only).`);
         }
       }
       return;
     }
     // 7.0: emit SNOTE record for each note.
     for (const [noteId, xr] of noteXref) {
       const note = await (await import('../../api/notes')).getNote(db, noteId);
       if (!note) continue;
       lines.push(`0 ${xr} SNOTE ${note.text}`);
       if (note.language) lines.push(`1 LANG ${note.language}`);
     }
   }
   ```

   Wire `emitNotesForEntity` into every entity-emission block in `src/gedcom/exporter.ts` (INDI, FAM, EVEN, PLAC, SOUR, REPO, OBJE). Call `emitSharedNoteRecords` once before TRLR.

- [x] **Step 9: Implement `src/import/gedcom/phases/notes.ts`**

   ```typescript
   import { v4 as uuid } from 'uuid';
   import type { ImportContext } from '../import-types';
   import { createNote, linkNoteToEntity } from '../../../api/notes';

   export async function phaseNotes(ctx: ImportContext): Promise<void> {
     // Pass 1: top-level @Nx@ SNOTE records → notes rows; capture xref → noteId.
     for (const node of ctx.tree) {
       if (node.tag !== 'SNOTE') continue;
       const lang = node.children.find(c => c.tag === 'LANG')?.value ?? '';
       const note = await createNote(ctx.db, { text: node.value ?? '', language: lang });
       ctx.noteMap.set(node.xref!, note.id);
     }
     // Pass 2: SNOTE pointers under entities → linkNoteToEntity. This is done in
     // the per-entity phases via ctx.noteMap.get(xref); already wired in
     // individuals.ts/families.ts/events for inline NOTE → here we extend to SNOTE.
   }
   ```

   Note: the existing per-entity phases (individuals.ts, families.ts, events.ts) need to be updated to call `linkNoteToEntity` when they encounter a `NOTE @N1@` or `SNOTE @N1@` child. Modify each to:

   ```typescript
   for (const noteNode of getChildren(indi, 'NOTE')) {
     if (noteNode.value?.startsWith('@')) {  // xref pointer
       const noteId = ctx.noteMap.get(noteNode.value);
       if (noteId) await linkNoteToEntity(ctx.db, noteId, 'person', personId);
     } else {
       // Inline NOTE: create a fresh note + link.
       const note = await createNote(ctx.db, { text: noteNode.value ?? '', language: '' });
       await linkNoteToEntity(ctx.db, note.id, 'person', personId);
     }
   }
   for (const snoteNode of getChildren(indi, 'SNOTE')) {
     const noteId = ctx.noteMap.get(snoteNode.value ?? '');
     if (noteId) await linkNoteToEntity(ctx.db, noteId, 'person', personId);
   }
   ```

   Same shape in `families.ts`, `events.ts` (note: this expands the existing `noteMap` usage from "inline note text dedup" to "SNOTE xref resolution"; `noteMap` semantics shift slightly — document in the import-types.ts ImportContext interface).

- [x] **Step 10: Refine fidelity-registry entries**

   In `src/api/gedcom_fidelity_registry.ts`, update the placeholder entries from T02 to set `ownedBy`:

   ```typescript
   'notes.text': {
     v551: { kind: 'lossy', reason: 'shared notes degrade to inline NOTE (5.5.1 spec limit)', expectedAfterRoundTrip: (seeded) => seeded },
     v70: { kind: 'lossless' },
     ownedBy: { exporter: 'src/gedcom/exporters/notes-emitter.ts', importer: 'src/import/gedcom/phases/notes.ts' },
   },
   // ... etc for all notes.* and note_links.* entries
   ```

- [x] **Step 11: Run round-trip tests**

   ```bash
   npm test -- gedcom-notes-roundtrip 2>&1 | tail -10
   ```

   Expected: 2 passed.

- [x] **Step 12: Run full test suite**

   ```bash
   npm test 2>&1 | tail -10
   ```

   Expected: no new failures.

- [x] **Step 13: Commit**

   ```bash
   git add src/api/notes.ts src/api/types.ts \
           src/renderer/tauri-window-api.ts src/renderer/api.d.ts \
           src/gedcom/exporters/notes-emitter.ts src/gedcom/exporter.ts \
           src/import/gedcom/phases/notes.ts src/import/gedcom/phases/individuals.ts \
           src/import/gedcom/phases/families.ts src/import/gedcom/phases/events.ts \
           src/import/gedcom/import-types.ts \
           src/api/gedcom_fidelity_registry.ts \
           tests/unit/notes.test.ts tests/unit/gedcom-notes-roundtrip.test.ts
   git commit -m "feat(notes): shared notes (SNOTE) integration — T04

- api/notes.ts CRUD + linkNoteToEntity/unlinkNoteFromEntity
- window.api.notes / window.api.noteLinks
- 7.0 SNOTE emission with @Nx@ xrefs (lossless across multi-entity sharing)
- 5.5.1 inline NOTE fallback with shared-note disclosure warning
- Importer phase: top-level SNOTE pass + per-entity SNOTE pointer resolution
- Fidelity registry: notes.text lossy:5.5.1-shared-degrades-to-inline, lossless 7.0

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
   ```

---

### T05: Person-to-person associations (ASSO) — api + importer + exporter + registry + tests

**Goal:** Person-to-person associations without an event (godparent-in-general, friend, colleague, neighbor, enemy, other) are first-class entities. GEDCOM ASSO substructure round-trips losslessly in both 5.5.1 and 7.0 (ASSO is in 5.5.1 spec since 1996).

**Files:**
- Create: `src/api/person_associations.ts` (CRUD)
- Modify: `src/renderer/tauri-window-api.ts` (expose `window.api.personAssociations.*`)
- Modify: `src/renderer/api.d.ts`
- Modify: `src/import/gedcom/phases/asso.ts` (extend existing — currently only handles event-mediated witness/godparent; add standalone-ASSO branch)
- Modify: `src/gedcom/exporters/assoc-emitter.ts` (implement — was stub from T02)
- Modify: `src/gedcom/exporter.ts` (call `emitAssociationsForPerson()` inside INDI block)
- Modify: `src/api/gedcom_fidelity_registry.ts` (set `ownedBy` on `person_associations.*`)
- Create: `tests/unit/person_associations.test.ts`
- Create: `tests/unit/gedcom-associations-roundtrip.test.ts`

**Dependencies:** T03.

**Unblocks:** T21 (Person associations UI).

**Verification:**
- `npm test -- person_associations` passes
- `npm test -- gedcom-associations-roundtrip` passes (both versions, all 6 role values)

**Steps:**

Follow the same TDD pattern as T04 with these specifics:

- [x] **Step 1: Write CRUD test** following T04 Step 1 pattern; functions: `createPersonAssociation`, `getPersonAssociation`, `getAssociationsForPerson`, `getAssociationsToPerson` (reverse direction), `updatePersonAssociation`, `deletePersonAssociation`. Test all 6 role values.

- [x] **Step 2: Run test** to confirm failure.

- [x] **Step 3: Implement `src/api/person_associations.ts`** — same shape as `src/api/relationships.ts` but simpler (no event coupling). Unique-on-(person_id, related_person_id, role) per the schema.

- [x] **Step 4: Wire `window.api.personAssociations`** in `src/renderer/tauri-window-api.ts` + `src/renderer/api.d.ts`.

- [x] **Step 5: Run CRUD test** — expect passing.

- [x] **Step 6: Write round-trip test** `tests/unit/gedcom-associations-roundtrip.test.ts`:

   ```typescript
   describe('GEDCOM associations round-trip (T05)', () => {
     it('5.5.1 ASSO with ROLE godparent round-trips losslessly', async () => {
       const db = await createTestDb();
       const p1 = await createPerson(db, { sex: 'M' });
       const p2 = await createPerson(db, { sex: 'M' });
       await createPersonAssociation(db, { person_id: p1.id, related_person_id: p2.id, role: 'godparent', notes: '' });

       const { ged } = await exportGedcom(db, { version: '5.5.1' });
       expect(ged).toMatch(/1 ASSO @I\d+@/);
       expect(ged).toMatch(/2 RELA godparent/);

       const db2 = await createTestDb();
       await importGedcom(db2, ged);
       const assocs = await getAssociationsForPerson(db2, p1.id /* re-mapped */);
       // ... assert equivalence
     });

     // Repeat for all 6 roles and for 7.0 (uses ROLE not RELA).
   });
   ```

- [x] **Step 7: Run round-trip test** — confirm failure.

- [x] **Step 8: Implement `src/gedcom/exporters/assoc-emitter.ts`** — emit `1 ASSO @Ix@ / 2 RELA <role>` for 5.5.1, `1 ASSO @Ix@ / 2 ROLE <role>` for 7.0 (5.5.1 uses RELA tag; 7.0 renamed to ROLE).

- [x] **Step 9: Extend `src/import/gedcom/phases/asso.ts`** — currently handles ASSO under specific event types as witness etc.; add a branch for standalone ASSO on INDI: create `person_associations` row.

- [x] **Step 10: Refine fidelity-registry entries** — `person_associations.*` all `lossless` both versions.

- [x] **Step 11: Run round-trip test** — confirm passing.

- [x] **Step 12: Run full test suite** — no regressions.

- [x] **Step 13: Commit** with message `feat(asso): person-to-person associations integration — T05`.

---

### T06: Negative assertions (NO X) — api + importer + exporter + registry + tests

**Goal:** Negative event assertions (e.g., "this person did NOT marry between 1850 and 1900") use `events.is_negation` + `events.negation_event_type` columns. GEDCOM 7.0 NO X structure round-trips losslessly; GEDCOM 5.5.1 drops negations with disclosure (no `NO` tag in 5.5.1 spec).

**Files:**
- Modify: `src/api/events.ts` (handle new columns in createEvent/updateEvent/queries)
- Modify: `src/gedcom/exporters/negation-emitter.ts` (implement — was stub from T02)
- Modify: `src/import/gedcom/phases/negations.ts` (implement — was stub from T02; recognize top-level NO X or under-INDI NO X depending on 7.0 spec section)
- Modify: `src/api/gedcom_fidelity_registry.ts`
- Create: `tests/unit/events-negations.test.ts`
- Create: `tests/unit/gedcom-negations-roundtrip.test.ts`

**Dependencies:** T03.

**Unblocks:** T22 (Negative assertions UI).

**Verification:**
- `npm test -- events-negations` passes
- `npm test -- gedcom-negations-roundtrip` passes (7.0 lossless; 5.5.1 documented loss)

**Steps:** Follow T04 pattern. Key implementation notes:

- [x] Negation events are stored exactly like normal events but with `is_negation=1` and `negation_event_type` carrying the event-type-being-negated (e.g., `is_negation=1, negation_event_type='marriage', date_value_from='1850', date_value_to='1900', notes='No marriage record found in parish registry'`).
- [x] Exporter on 7.0: emit `1 NO MARR / 2 DATE FROM 1 JAN 1850 TO 31 DEC 1900 / 2 NOTE ...`. Per GEDCOM 7.0 spec section "NO event".
- [x] Exporter on 5.5.1: skip the event entirely + emit warning to report.
- [x] Importer on 7.0: recognize NO X under INDI, create event row with is_negation=1.
- [x] Importer on 5.5.1: nothing to import (5.5.1 has no NO tag).

Commit message: `feat(negations): NO X negative assertions integration — T06`.

---

### T07: Translations (TRAN) — names + places, api + importer + exporter + registry + tests

**Goal:** Alternative-script and alternative-language names and place names round-trip losslessly via GEDCOM 7.0 TRAN substructure; degrade to additional NAME nodes with TYPE on 5.5.1.

**Files:**
- Create: `src/api/translations.ts` (CRUD for both name_translations and place_translations; could split into two files if cleaner)
- Modify: `src/renderer/tauri-window-api.ts`
- Modify: `src/renderer/api.d.ts`
- Modify: `src/import/gedcom/phases/translations.ts` (implement — was stub)
- Modify: `src/import/gedcom/phases/individuals.ts` (recognize NAME / TRAN under NAME)
- Modify: `src/import/gedcom/place-resolver.ts` (recognize PLAC / TRAN under PLAC)
- Modify: `src/gedcom/exporters/translations-emitter.ts` (implement)
- Modify: `src/gedcom/exporter.ts` (call emitter inside NAME and PLAC blocks)
- Modify: `src/api/gedcom_fidelity_registry.ts`
- Create: `tests/unit/translations.test.ts`
- Create: `tests/unit/gedcom-translations-roundtrip.test.ts`

**Dependencies:** T03.

**Unblocks:** T23 (Translations UI).

**Verification:** Round-trip tests cover Cyrillic + Arabic + Chinese name; Cyrillic + Greek place. Both 5.5.1 and 7.0 paths.

**Steps:** Follow T04 pattern. Key notes:

- [x] CRUD: `createNameTranslation`, `createPlaceTranslation`, `getTranslationsForName`, `getTranslationsForPlace`, etc.
- [x] 7.0 emission: `2 NAME Иван /Сидоров/` immediate-child of INDI, then `3 TRAN Иван /Сидоров/ / 4 LANG ru / 4 _SCHEME cyrillic`. Per GEDCOM 7.0 spec.
- [x] 5.5.1 emission: additional `1 NAME` block with `2 TYPE alternative` and a 5.5.1-friendly `2 _LANG ru`. Lossy registry entry: language attribute may not round-trip if external app doesn't recognize `_LANG`.

Commit message: `feat(translations): TRAN name and place translations — T07`.

---

### T08: Source coverage events (SOUR/DATA/EVEN) — api + importer + exporter + registry + tests

**Goal:** A source's "I cover BIRT, DEAT events from 1850 to 1920 in Östergötland" metadata is first-class via `source_coverage_events` rows. Round-trips losslessly in both 5.5.1 and 7.0.

**Files:**
- Create: `src/api/source_coverage.ts` (CRUD)
- Modify: `src/renderer/tauri-window-api.ts`
- Modify: `src/renderer/api.d.ts`
- Modify: `src/import/gedcom/phases/coverage.ts` (implement)
- Modify: `src/import/gedcom/phases/sources.ts` (recognize DATA/EVEN under SOUR — extend existing phase)
- Modify: `src/gedcom/exporters/coverage-emitter.ts` (implement)
- Modify: `src/gedcom/exporter.ts` (call emitter inside SOUR block)
- Modify: `src/api/gedcom_fidelity_registry.ts`
- Create: `tests/unit/source_coverage.test.ts`
- Create: `tests/unit/gedcom-source-coverage-roundtrip.test.ts`

**Dependencies:** T03.

**Unblocks:** T24 (Source coverage UI).

**Verification:** Round-trip test seeds a source with 2 coverage events (BIRT 1850-1920 Östergötland, DEAT 1860-1930 Östergötland); exports both versions; re-imports; asserts both coverage rows reconstruct.

**Steps:** Follow T04 pattern. Commit message: `feat(source-coverage): SOUR/DATA/EVEN coverage events — T08`.

---

### T09: Sex 'X', HEAD preservation, extended date qualifiers — registry + importer + exporter + tests

**Goal:** Three smaller GEDCOM 7.0 alignments folded into one task.

1. `persons.sex = 'X'` (intersex) → emit X on 7.0, fall back to U on 5.5.1 with warning.
2. Original GEDCOM HEAD block metadata preserved on import (source app, language, copyright) in `db_settings` under `header_metadata` JSON value.
3. Date qualifiers `INTERPRETED` and bidirectional `FROM x TO y` (preserving direction; currently mapped to `between` which loses direction).

**Files:**
- Modify: `src/gedcom/exporter.ts` (sex emission; HEAD emission preserves header_metadata from db_settings)
- Modify: `src/import/gedcom/phases/individuals.ts` (accept SEX X)
- Modify: `src/import/gedcom/phases.ts` (top-level HEAD pass writes header_metadata to db_settings)
- Modify: `src/gedcom/parser.ts` or date utility (recognize INTERPRETED; preserve FROM/TO direction)
- Modify: `src/api/types.ts` (Person.sex includes X)
- Modify: `src/api/gedcom_fidelity_registry.ts`
- Create: `tests/unit/gedcom-sex-x-roundtrip.test.ts`
- Create: `tests/unit/gedcom-head-preservation.test.ts`
- Create: `tests/unit/gedcom-date-qualifiers.test.ts`

**Dependencies:** T03.

**Unblocks:** Sex X UI is part of T19 misc; HEAD preservation has no UI surface; date qualifiers have UI in T17 EventModal.

**Verification:**
- `npm test -- gedcom-sex-x-roundtrip` passes both versions
- `npm test -- gedcom-head-preservation` passes
- `npm test -- gedcom-date-qualifiers` passes (INTERPRETED + FROM/TO direction)

**Steps:**

- [x] **Step 1: Write all three test files** with both-version coverage.
- [x] **Step 2: Run** — confirm failure.
- [x] **Step 3: Update exporter for sex X**:

   ```typescript
   // In INDI emission, around the existing 1 SEX line:
   if (p.sex === 'X') {
     if (version === '7.0') lines.push('1 SEX X');
     else {
       lines.push('1 SEX U');
       report.warnings.push(`Person ${p.id} sex=X downgraded to U for 5.5.1 (X not in 5.5.1 spec).`);
     }
   } else {
     lines.push(`1 SEX ${p.sex}`);
   }
   ```

- [x] **Step 4: Update importer for sex X** — accept X as a valid value; no schema change needed since T02 added X to the CHECK constraint.

- [x] **Step 5: Implement HEAD preservation**:
   - Importer in `phases.ts` top-level pass: when seeing `0 HEAD`, extract SOUR/CORP/NAME, GEDC/VERS, LANG, COPR; store as JSON in `db_settings` under key `header_metadata`.
   - Exporter in `exporter.ts` HEAD emission: read `header_metadata` from db_settings; if present, emit preserved values (e.g., source app of original file) as `1 _ORIG_SOUR <name>` extension tag so we don't pretend OUR app was the original importer; if absent, emit our own SOUR/CORP/NAME as before.

- [x] **Step 6: Implement date qualifier changes**:
   - Add `interpreted` to `events.date_type` valid values (along with existing `exact/about/before/after/between/calculated/unknown`).
   - For FROM/TO: introduce a `date_direction: 'between' | 'from_to'` distinction. If a 7.0 file has `FROM 1850 TO 1860`, store as date_type=between, date_value=1850, date_value_end=1860, and a new column `date_direction='from_to'` so the exporter can emit FROM/TO not BET/AND. Alternative: extend `date_type` to include `from_to` directly. The executor picks the cleaner of these and updates the fidelity registry.

- [x] **Step 7: Refine fidelity-registry entries** for persons.sex, events.date_type (extended values), db_settings.header_metadata.

- [x] **Step 8: Run all three test files** — confirm passing.

- [x] **Step 9: Commit** `feat(gedcom-7): sex X, HEAD preservation, INTERPRETED/FROM-TO date qualifiers — T09`.

---

## Phase 3 — UI for existing-but-unsurfaced fields (10 parallel tasks, gated on T02)

These tasks touch only renderer code. No schema, no api, no importer/exporter. Can run in parallel from post-T02 worktrees (don't need to wait for T03 since renderer doesn't touch the exporter logic).

### T10: Repositories CRUD — view + panel + modal + source-repo link section

**Goal:** Net-new entity surface: users can create, list, view, edit, delete repositories. Each source can have repositories attached via the existing `source_repositories` join table; UI exposes this link from SourcePanel.

**Files:**
- Create: `src/renderer/views/RepositoriesView.vue`
- Create: `src/renderer/components/RepositoryPanel.vue`
- Create: `src/renderer/components/modals/RepositoryModal.vue`
- Create: `src/renderer/components/SourceRepositoriesSection.vue` (section component for SourcePanel)
- Modify: `src/renderer/router.ts` (add `/repositories` and `/repositories/:id` routes)
- Modify: `src/renderer/components/Sidebar.vue` or equivalent navigation (add Repositories link)
- Modify: `src/renderer/components/SourcePanel.vue` (slot in SourceRepositoriesSection)
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts` (translations for `repositories.*` keys)
- Create: `tests/components/RepositoryPanel.test.ts`
- Create: `tests/e2e/[panels]/repositories.spec.ts`

**Dependencies:** T02 (uses post-T02 schema; the existing `repositories` table is already in main, so technically T10 could start immediately, but waiting for T02 avoids merge conflicts).

**Unblocks:** Nothing downstream (Repositories CRUD is leaf).

**Verification:**
- `npm test -- RepositoryPanel` passes (mounted component test asserting CRUD round-trip)
- `npx playwright test --project=panels repositories` passes (create → edit → delete via UI)
- Manual smoke via `npm start`: navigate to /repositories, add a repository, edit it, link to a source via SourcePanel, delete it.

**Steps:**

- [x] **Step 1: Add routes to `src/renderer/router.ts`**

   Following the existing pattern for `/groups`:

   ```typescript
   {
     path: '/repositories',
     component: () => import('./views/RepositoriesView.vue'),
   },
   {
     path: '/repositories/:id',
     component: () => import('./views/RepositoriesView.vue'),
   },
   ```

- [x] **Step 2: Add navigation link** in the sidebar component (follow pattern of "Källor" / Sources link).

- [x] **Step 3: Add i18n keys** to both `sv.ts` and `en.ts`:

   ```typescript
   repositories: {
     title: 'Arkiv', /* en: 'Repositories' */
     addTitle: 'Lägg till arkiv',
     editTitle: 'Redigera arkiv',
     name: 'Namn',
     address: 'Adress',
     city: 'Ort',
     postalCode: 'Postnummer',
     state: 'Region',
     country: 'Land',
     phone: 'Telefon',
     email: 'E-post',
     web: 'Webb',
     callNumber: 'Hyllbeteckning',
     notes: 'Anteckningar',
     empty: 'Inga arkiv ännu.',
     deleteTitle: 'Ta bort arkiv',
     deleteWarning: 'Tar bort arkivet och kopplingar till källor.',
   },
   ```

- [x] **Step 4: Write `RepositoryPanel.test.ts`** asserting:
   - Mounts with a repository ID
   - Renders name, address, city, country, etc.
   - Calls `window.api.repositories.update` on field blur
   - Renders danger-zone delete button

- [x] **Step 5: Run test** — confirm failure (component doesn't exist).

- [x] **Step 6: Implement `RepositoryPanel.vue`** following the pattern of `src/renderer/components/SourcePanel.vue` (closest analog — same panel shape, different field set):

   - Wrap in `<EntityPanel entity-type="repository" :title="...">`
   - Sections: Basic info (name, address, city, country, etc.), Sources (using `SourceRepositoriesSection` reverse — sources linked to this repo), Danger zone
   - Use `useEntityData` to load + auto-subscribe to `onDataChanged`
   - Use `useEditableFields` for per-field auto-save

- [x] **Step 7: Implement `RepositoryModal.vue`** following `SourceModal.vue`:

   - `<BaseSubPanel entity-type="repository" :title="...">`
   - Form fields for all repository columns
   - Save → `window.api.repositories.create` or `.update`

- [x] **Step 8: Implement `RepositoriesView.vue`** following `SourcesView.vue`:

   - List with `usePagedList({ fetchPage: window.api.repositories.listPage, defaultSortBy: 'name' })`
   - Filter chips by country (derived from loaded rows)
   - `+ Repository` button opens RepositoryModal in standalone mode
   - Drag handle + RepositoryPanel on selected row

- [x] **Step 9: Implement `SourceRepositoriesSection.vue`**:

   - Hosted in SourcePanel
   - Shows repositories linked to this source via `window.api.sourceRepositories.forSource(sourceId)`
   - `+ Repository` button: opens a picker modal (RepositoryPicker — derived from `RepositoryListPicker` pattern, follow existing PlacePicker for shape) to select an existing repository, then calls `window.api.sourceRepositories.link(sourceId, repoId)`
   - Each row has unlink (✕) button calling `window.api.sourceRepositories.unlink`

- [x] **Step 10: Add section to SourcePanel.vue** — slot in `<SourceRepositoriesSection :source-id="source.id" />`.

- [x] **Step 11: Run mounted-component test** — confirm passing.

- [x] **Step 12: Write Playwright e2e test** `tests/e2e/[panels]/repositories.spec.ts`:

   ```typescript
   test('user can create, edit, link to source, and delete a repository', async ({ page }) => {
     await page.goto('/');
     await page.click('text=Arkiv');
     await page.click('text=+ Arkiv');
     await page.fill('input[name=name]', 'Riksarkivet');
     await page.fill('input[name=city]', 'Stockholm');
     await page.click('text=Spara');
     await expect(page.locator('text=Riksarkivet')).toBeVisible();
     // Edit
     await page.click('text=Riksarkivet');
     await page.fill('input[name=address]', 'Box 12541');
     await page.locator('input[name=address]').blur();
     await page.reload();
     await page.click('text=Riksarkivet');
     await expect(page.locator('input[name=address]')).toHaveValue('Box 12541');
     // Link from source
     await page.goto('/sources');
     await page.click('text=+ Källa');
     await page.fill('input[name=title]', 'Test source');
     await page.click('text=Spara');
     await page.click('text=Test source');
     await page.click('text=+ Arkiv');  // inside SourceRepositoriesSection
     await page.click('text=Riksarkivet');
     await expect(page.locator('.source-repositories-section >> text=Riksarkivet')).toBeVisible();
     // Delete
     await page.goto('/repositories');
     await page.click('text=Riksarkivet');
     await page.click('text=Ta bort arkiv');
     await page.click('text=Bekräfta');
     await expect(page.locator('text=Riksarkivet')).not.toBeVisible();
   });
   ```

- [x] **Step 13: Run e2e test** — `npx playwright test --project=panels repositories`. Confirm passing.

- [x] **Step 14: Commit** `feat(repositories): CRUD UI surface — T10`.

---

### T11: Citations on PersonPanel — section + modal wiring

**Goal:** Genealogist can add source citations to a person directly (not just to events/names). Section in PersonPanel; rows clickable to edit; `+ Source` button opens CitationModal with `personId` pre-set.

**Files:**
- Create: `src/renderer/components/PersonSourcesSection.vue`
- Modify: `src/renderer/components/PersonPanel.vue` (slot in section)
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts` (keys for `personSources.*`)
- Create: `tests/components/PersonSourcesSection.test.ts`
- Create: `tests/e2e/[panels]/person-citations.spec.ts`

**Dependencies:** T02 (uses existing schema; CitationModal already accepts `personId` prop).

**Verification:** Component test mounts PersonSourcesSection with a person ID, asserts list renders, + button opens modal with `personId` set. E2e: create person, add citation, edit it, delete it.

**Steps:**

- [x] **Step 1: Write component test** asserting:
   - Section mounts with `personId` prop
   - Calls `window.api.citations.forPerson(personId)` on load
   - Renders empty state when no citations
   - Renders list rows when citations exist
   - `+ Source` button opens CitationModal with `personId` prop set

- [x] **Step 2: Run test** — confirm failure.

- [x] **Step 3: Implement `PersonSourcesSection.vue`** following the pattern of an existing self-loading section like `PersonMediaSection.vue`:

   ```vue
   <template>
     <section class="panel-section">
       <SectionHeader
         :title="$t('personSources.title')"
         :action-label="$t('personSources.add')"
         @action="openAddModal"
       />
       <AppEmptyState v-if="citations.length === 0" :message="$t('personSources.empty')" />
       <ul v-else class="citation-list">
         <li v-for="cit in citations" :key="cit.id" class="clickable-row" @click="openEditModal(cit)">
           <span class="citation-source">{{ sourcesMap.get(cit.source_id)?.title ?? '—' }}</span>
           <span class="citation-page" v-if="cit.page">{{ cit.page }}</span>
           <span class="citation-confidence">{{ confidenceLabel(cit.confidence) }}</span>
           <button class="btn-delete" @click.stop="deleteCit(cit.id)">✕</button>
         </li>
       </ul>
       <CitationModal
         v-if="modalOpen"
         :person-id="personId"
         :citation-id="editingCitId"
         mode="subpanel"
         @close="modalOpen = false"
         @saved="onSaved"
       />
     </section>
   </template>

   <script setup lang="ts">
   import { ref, toRef } from 'vue';
   import { useEntityData } from '../composables/useEntityData';
   import SectionHeader from './ui/SectionHeader.vue';
   import AppEmptyState from './ui/AppEmptyState.vue';
   import CitationModal from './modals/CitationModal.vue';
   import { useI18n } from 'vue-i18n';
   import type { Citation, Source } from '../../api/types';

   const props = defineProps<{ personId: string }>();
   const { t: $t } = useI18n();
   const modalOpen = ref(false);
   const editingCitId = ref<string | null>(null);

   const { data: payload, refresh } = useEntityData(toRef(props, 'personId'), async (id) => {
     const citations = (await window.api.citations.forPerson(id)) as Citation[];
     const sourcesMap = new Map<string, Source>();
     for (const c of citations) {
       if (!sourcesMap.has(c.source_id)) {
         const s = await window.api.sources.get(c.source_id) as Source | null;
         if (s) sourcesMap.set(s.id, s);
       }
     }
     return { citations, sourcesMap };
   });

   const citations = computed(() => payload.value?.citations ?? []);
   const sourcesMap = computed(() => payload.value?.sourcesMap ?? new Map());

   function openAddModal() {
     editingCitId.value = null;
     modalOpen.value = true;
   }
   function openEditModal(cit: Citation) {
     editingCitId.value = cit.id;
     modalOpen.value = true;
   }
   async function deleteCit(id: string) {
     if (!confirm($t('personSources.confirmDelete'))) return;
     await window.api.citations.delete(id);
   }
   function onSaved() {
     modalOpen.value = false;
     refresh();
   }
   function confidenceLabel(c: number): string {
     return [$t('confidence.0'), $t('confidence.1'), $t('confidence.2'), $t('confidence.3')][c] ?? '';
   }
   </script>
   ```

- [x] **Step 4: Slot section into PersonPanel.vue**

   In the panel's body, after the Events section (or wherever it logically fits per the panel's existing section ordering), add `<PersonSourcesSection :person-id="personId" />`.

- [x] **Step 5: Add i18n keys** to both locales:

   ```typescript
   personSources: {
     title: 'Källor',
     add: '+ Källa',
     empty: 'Inga källor ännu.',
     confirmDelete: 'Ta bort källhänvisning?',
   },
   ```

- [x] **Step 6: Run component test** — confirm passing.

- [x] **Step 7: Write e2e test** `tests/e2e/[panels]/person-citations.spec.ts`:

   ```typescript
   test('user can add source citation directly to person', async ({ page }) => {
     await page.goto('/persons');
     await page.click('text=+ Person');
     await page.fill('input[name=given_name]', 'Test');
     await page.click('text=Spara');
     await page.click('text=Test');
     await page.click('.person-sources-section >> text=+ Källa');
     await page.click('text=Skapa källa');
     await page.fill('input[name=title]', 'Test source');
     await page.click('text=Spara');
     await page.fill('input[name=page]', 'p. 42');
     await page.click('text=Spara');
     await expect(page.locator('.person-sources-section >> text=Test source')).toBeVisible();
     // Verify it persists.
     await page.reload();
     await page.click('text=Test');
     await expect(page.locator('.person-sources-section >> text=Test source')).toBeVisible();
   });
   ```

- [x] **Step 8: Run e2e test** — confirm passing.

- [x] **Step 9: Commit** `feat(person-citations): Sources section on PersonPanel — T11`.

---

### T12: Citations on PlacePanel — section + modal wiring

**Goal:** Same shape as T11 but for Place.

**Files:**
- Create: `src/renderer/components/PlaceSourcesSection.vue`
- Modify: `src/renderer/components/PlacePanel.vue`
- Modify: i18n locales
- Create: `tests/components/PlaceSourcesSection.test.ts`
- Create: `tests/e2e/[panels]/place-citations.spec.ts`

**Dependencies:** T02.

**Steps:** Follow T11 step-by-step, substituting:
- `window.api.citations.forPlace` for `forPerson`
- `placeId` prop for `personId`
- `placeSources.*` i18n keys
- Slot into PlacePanel.vue

Commit: `feat(place-citations): Sources section on PlacePanel — T12`.

---

### T13: Citations on RelationshipPanel — section + modal wiring

**Goal:** Same shape for Relationship.

**Files:**
- Create: `src/renderer/components/RelationshipSourcesSection.vue`
- Modify: `src/renderer/components/RelationshipPanel.vue`
- Modify: i18n locales
- Create: `tests/components/RelationshipSourcesSection.test.ts`
- Create: `tests/e2e/[panels]/relationship-citations.spec.ts`

**Dependencies:** T02.

**Steps:** Follow T11 pattern with `relationshipId` and `window.api.citations.forRelationship`. Commit: `feat(relationship-citations): Sources section on RelationshipPanel — T13`.

---

### T14: SourceModal — add call_number + abstract fields

**Goal:** SourcePanel already displays these fields (`call_number`, `abstract`); SourceModal can't author them. Fix.

**Files:**
- Modify: `src/renderer/components/modals/SourceModal.vue` (add two input fields after the existing url field)
- Modify: i18n locales (keys `sources.callNumber`, `sources.abstract` already exist for the panel; reuse)
- Modify: `tests/components/SourceModal.test.ts` (or create if it doesn't exist) — assert form binds call_number + abstract; save persists

**Dependencies:** T02.

**Verification:** Test mounts SourceModal in create mode, fills call_number + abstract + title, saves, asserts `window.api.sources.create` called with both values; mounts in edit mode with seeded source, asserts pre-fill works.

**Steps:**

- [x] **Step 1: Write/extend `SourceModal.test.ts`** asserting field binding + save behavior.
- [x] **Step 2: Run test** — confirm failure.
- [x] **Step 3: Add form fields** to `SourceModal.vue` after the url field:

   ```vue
   <div class="ep-field">
     <label class="ep-field-label" for="source-call-number">{{ $t('sources.callNumber') }}</label>
     <input id="source-call-number" class="ep-input" v-model="form.call_number" />
   </div>
   <div class="ep-field ep-field-full">
     <label class="ep-field-label" for="source-abstract">{{ $t('sources.abstract') }}</label>
     <textarea id="source-abstract" class="ep-input" v-model="form.abstract" rows="3" />
   </div>
   ```

   Update `form` ref initial value to include `call_number: '', abstract: ''`. Update the save handler to pass these to `window.api.sources.create` / `update`.

- [x] **Step 4: Run test** — confirm passing.
- [x] **Step 5: Commit** `feat(source-modal): add call_number + abstract fields — T14`.

---

### T15: PlaceFormFields — address + lifecycle dates

**Goal:** PlaceFormFields renders street/postal_code/city/country/date_from/date_to inputs (currently absent).

**Files:**
- Modify: `src/renderer/components/PlaceFormFields.vue`
- Modify: i18n locales (most keys exist; `places.street/postalCode/city/country/dateFrom/dateTo`)
- Modify: `tests/components/PlaceFormFields.test.ts` (or PlaceModal.test.ts)

**Dependencies:** T02.

**Verification:** Mounted-component test asserts each new field binds + saves.

**Steps:**

- [x] **Step 1: Write test** asserting six new fields bind + persist.
- [x] **Step 2: Run** — confirm failure.
- [x] **Step 3: Add fields** to `PlaceFormFields.vue`. Address fields in a grouped sub-section (`<fieldset class="address-block">`); lifecycle dates in another sub-section. Both behind `<details>` to keep the modal compact:

   ```vue
   <details class="ep-collapsible">
     <summary>{{ $t('places.addressDetails') }}</summary>
     <div class="ep-field">
       <label class="ep-field-label">{{ $t('places.street') }}</label>
       <input class="ep-input" v-model="form.street" />
     </div>
     <div class="ep-field-row">
       <div class="ep-field">
         <label class="ep-field-label">{{ $t('places.postalCode') }}</label>
         <input class="ep-input" v-model="form.postal_code" />
       </div>
       <div class="ep-field">
         <label class="ep-field-label">{{ $t('places.city') }}</label>
         <input class="ep-input" v-model="form.city" />
       </div>
     </div>
     <div class="ep-field">
       <label class="ep-field-label">{{ $t('places.country') }}</label>
       <input class="ep-input" v-model="form.country" />
     </div>
   </details>
   <details class="ep-collapsible">
     <summary>{{ $t('places.lifecycleDates') }}</summary>
     <div class="ep-field-row">
       <div class="ep-field">
         <label class="ep-field-label">{{ $t('places.dateFrom') }}</label>
         <input class="ep-input" type="text" v-model="form.date_from" placeholder="YYYY-MM-DD or YYYY" />
       </div>
       <div class="ep-field">
         <label class="ep-field-label">{{ $t('places.dateTo') }}</label>
         <input class="ep-input" type="text" v-model="form.date_to" />
       </div>
     </div>
   </details>
   ```

- [x] **Step 4: Run** — confirm passing.
- [x] **Step 5: Commit** `feat(place-form): address + lifecycle date fields — T15`.

---

### T16: PersonNameModal — surface name_prefix/suffix/qualifier/patronymic always-visible

**Goal:** Existing inputs in PersonNameModal.vue lines 117, 126, 139, 151 are buried in a `<details>` block (qualifier wraps the rest conditionally). The audit found this makes the fields unauthorable in practice. Surface them.

**Files:**
- Modify: `src/renderer/components/modals/PersonNameModal.vue`
- Modify: `tests/components/PersonNameModal.test.ts`

**Dependencies:** T02.

**Verification:** Test asserts all 4 fields are visible by default (not behind `<details>`) and bind + save.

**Steps:**

- [x] **Step 1: Write test** asserting fields render outside any `<details>` block (or in a collapsed-by-default details that the test opens via `summary.click()`).
- [x] **Step 2: Run** — confirm failure if fields are gated behind UI that test doesn't open.
- [x] **Step 3: Restructure PersonNameModal.vue**:
   - Move name_prefix and name_suffix inputs out of `<details>` into the main form grid (compact 2-column row).
   - Move name_qualifier picker out of `<details>`; its values are `'sr'/'jr'/'iii'/'patronymic'/'matronymic'/'aka'/'cmtoc'/etc.` — picker shows all options; patronymic_base only shown when qualifier='patronymic' or 'matronymic'.
   - Confirm the rendered DOM matches what the test expects.
- [x] **Step 4: Run** — confirm passing.
- [x] **Step 5: Commit** `feat(person-name-modal): surface buried name fields — T16`.

---

### T17: EventModal — place_address + unconditional date_value_end + add cause field

**Goal:** Three EventModal gaps:
1. `place_address` (event-level address override per GEDCOM `PLAC / ADDR` substructure) has no input.
2. `date_value_end` is rendered conditionally on event type; should be available for any `date_type='between'/'from_to'` regardless of event type.
3. Cause field is currently only shown for death events; should be available for any event that meaningfully has a cause (per GEDCOM, CAUS is applicable to all events).

**Files:**
- Modify: `src/renderer/components/modals/EventModal.vue`
- Modify: `tests/components/EventModal.test.ts`

**Dependencies:** T02.

**Steps:**

- [x] **Step 1: Write three tests** — one per change (place_address binding, date_value_end unconditional, cause-on-non-death).
- [x] **Step 2: Run** — confirm failures.
- [x] **Step 3: Update EventModal**:
   - Add place_address input inside the place selection block (textarea, optional, label "Address override").
   - Remove the conditional `v-if` gating date_value_end so it shows whenever `date_type ∈ {between, from_to}`.
   - Remove the conditional gating on cause; show for any event type with appropriate placeholder text.
- [x] **Step 4: Run** — confirm passing.
- [x] **Step 5: Commit** `feat(event-modal): place_address + unconditional date_end + cause-on-any-event — T17`.

---

### T18: EventParticipantsSection — role picker per participant

**Goal:** GEDCOM round-trips `event_participants.role` (witness, godparent, officiant, etc.) but the UI never displays or lets you edit it. Add a role picker per participant row.

**Files:**
- Modify: `src/renderer/components/EventParticipantsSection.vue`
- Modify: i18n locales (keys `eventParticipants.role.primary/spouse/parent/child/witness/godparent/officiant/other` — partly exist)
- Modify: `tests/components/EventParticipantsSection.test.ts`

**Dependencies:** T02.

**Verification:** Test asserts each participant row shows the role label + role picker; changing the role calls `window.api.eventParticipants.update`.

**Steps:**

- [x] **Step 1: Write test** asserting per-row role display + edit.
- [x] **Step 2: Run** — confirm failure.
- [x] **Step 3: Add role display + picker** to each participant row. Picker is a small inline `<select>` (or `<AppPicker>` if shared component exists) with the 8 role values from `EVENT_PARTICIPANT_ROLE_VALUES`. Auto-save on change.
- [x] **Step 4: Run** — confirm passing.
- [x] **Step 5: Commit** `feat(event-participants): role picker per participant — T18`.

---

### T19: Misc UI cleanups — ResearchTaskModal result always-editable + RelationshipModal subtypes for all types + MediaModal format/notes/link_type

**Goal:** Three smaller modal cleanups bundled.

**Files:**
- Modify: `src/renderer/components/modals/ResearchTaskModal.vue` (remove conditional gating on `result` field)
- Modify: `src/renderer/components/modals/RelationshipModal.vue` (show subtype for sibling/godparent/other, not just couple/parent_child)
- Modify: `src/renderer/components/modals/MediaModal.vue` (add format input + notes textarea + link_type picker on attach flow)
- Modify: tests/components/ for each modal

**Dependencies:** T02.

**Steps:**

- [x] **Step 1: Write three small tests**, one per modal.
- [x] **Step 2: Run** — confirm failures.
- [x] **Step 3: Make the three modifications.** Each is small (~5-10 lines of template + a v-model binding).
- [x] **Step 4: Run** — confirm passing.
- [x] **Step 5: Commit** `feat(misc-modals): ResearchTask result + Relationship subtypes + Media fields — T19`.

---

## Phase 4 — UI for new schema (5 parallel tasks; each gated on its Phase 2 sibling)

### T20: Shared notes UI — section on every entity panel + NoteModal + NotePicker

**Goal:** Every entity panel (Person, Event-within-Person, Place, Source, Relationship, Repository, Media) gets a Notes section. Notes can be created inline (new note text + immediate link) or picked from existing notes (NotePicker filters across all notes in the DB).

**Files:**
- Create: `src/renderer/components/EntityNotesSection.vue` (polymorphic — takes `entityType` + `entityId` props)
- Create: `src/renderer/components/modals/NoteModal.vue` (create/edit/delete a note)
- Create: `src/renderer/components/modals/NotePicker.vue` (filter + select an existing note to link)
- Modify: every `*Panel.vue` (Person, Place, Source, Relationship, Repository) and `EventModal.vue` to slot in `<EntityNotesSection :entity-type="..." :entity-id="..." />`
- Modify: i18n locales (`notes.*` keys)
- Create: `tests/components/EntityNotesSection.test.ts`
- Create: `tests/e2e/[panels]/shared-notes.spec.ts`

**Dependencies:** T04.

**Verification:**
- Component test mounts EntityNotesSection for each `entityType` value; asserts list + add + edit + unlink + delete.
- E2e: create a note on Person A, link it to Person B via NotePicker, edit the note text on A, verify text changes on B.

**Steps:**

- [x] **Step 1: Write component test** for EntityNotesSection covering all 8 entity_type values.
- [x] **Step 2: Run** — confirm failure.
- [x] **Step 3: Implement `EntityNotesSection.vue`**:

   ```vue
   <template>
     <section class="panel-section">
       <SectionHeader
         :title="$t('notes.title')"
         :action-label="$t('notes.add')"
         @action="openAddModal"
       />
       <AppEmptyState v-if="notes.length === 0" :message="$t('notes.empty')" />
       <ul v-else class="notes-list">
         <li v-for="n in notes" :key="n.id" class="clickable-row" @click="openEditModal(n)">
           <p class="note-preview">{{ n.text.length > 100 ? n.text.slice(0, 100) + '…' : n.text }}</p>
           <span v-if="n.language" class="note-lang">[{{ n.language }}]</span>
           <button class="btn-unlink" @click.stop="unlink(n.id)">✕</button>
         </li>
       </ul>
       <NoteModal v-if="addModalOpen" mode="subpanel" @close="addModalOpen = false" @saved="onCreate" />
       <NoteModal v-if="editingNoteId" mode="subpanel" :note-id="editingNoteId" @close="editingNoteId = null" @saved="refresh" />
       <NotePicker v-if="pickerOpen" mode="subpanel" @close="pickerOpen = false" @picked="onPicked" />
     </section>
   </template>

   <script setup lang="ts">
   import { ref, toRef } from 'vue';
   import { useEntityData } from '../composables/useEntityData';
   // ... etc

   const props = defineProps<{
     entityType: 'person' | 'event' | 'relationship' | 'place' | 'source' | 'repository' | 'media' | 'family';
     entityId: string;
   }>();

   const { data: notes, refresh } = useEntityData(toRef(props, 'entityId'), async (id) => {
     return (await window.api.notes.forEntity(props.entityType, id)) ?? [];
   });

   const addModalOpen = ref(false);
   const pickerOpen = ref(false);
   const editingNoteId = ref<string | null>(null);

   function openAddModal() { addModalOpen.value = true; }
   function openEditModal(n: { id: string }) { editingNoteId.value = n.id; }
   async function onCreate(newNote: { id: string }) {
     await window.api.noteLinks.link(newNote.id, props.entityType, props.entityId);
     addModalOpen.value = false;
     refresh();
   }
   async function onPicked(noteId: string) {
     await window.api.noteLinks.link(noteId, props.entityType, props.entityId);
     pickerOpen.value = false;
     refresh();
   }
   async function unlink(noteId: string) {
     await window.api.noteLinks.unlink(noteId, props.entityType, props.entityId);
     refresh();
   }
   </script>
   ```

   SectionHeader actions: have both `+ Note` (creates new) and `Link existing…` (opens NotePicker). Either follow a header-with-dropdown pattern or simply have the SectionHeader `@action` open a small modal that lets the user choose between "Create new" or "Link existing."

- [x] **Step 4: Implement `NoteModal.vue`** — standard create/edit pattern using BaseSubPanel; text textarea + language input (picker of common ISO 639-1 codes); save calls `window.api.notes.create` or `.update`.

- [x] **Step 5: Implement `NotePicker.vue`** — usePagedList-driven filter + list; click row to emit `picked` with note ID. Follow the existing PlacePicker pattern.

- [x] **Step 6: Slot `<EntityNotesSection>` into every panel** — PersonPanel, PlacePanel, SourcePanel, RelationshipPanel, RepositoryPanel (created by T10), MediaPanel, plus inside EventModal (for event-level notes), plus inside FamilyPanel if/when families exist.

- [x] **Step 7: Add i18n keys**.

- [x] **Step 8: Run component test** — confirm passing.

- [x] **Step 9: Write e2e test** for cross-entity sharing.

- [x] **Step 10: Run e2e** — confirm passing.

- [x] **Step 11: Commit** `feat(shared-notes): EntityNotesSection + NoteModal + NotePicker across all entity panels — T20`.

---

### T21: Person associations UI — section on PersonPanel + AssociationModal

**Goal:** New Associations section on PersonPanel showing related persons + roles; clickable rows; `+ Association` opens AssociationModal.

**Files:**
- Create: `src/renderer/components/PersonAssociationsSection.vue`
- Create: `src/renderer/components/modals/AssociationModal.vue`
- Modify: `src/renderer/components/PersonPanel.vue`
- Modify: i18n locales
- Create: `tests/components/PersonAssociationsSection.test.ts`
- Create: `tests/e2e/[panels]/person-associations.spec.ts`

**Dependencies:** T05.

**Steps:** Follow T20 pattern. AssociationModal contains: related person picker (PersonPicker), role picker, notes textarea. Commit: `feat(person-associations): Associations section + modal — T21`.

---

### T22: Negative assertions UI — toggle + handling in EventModal

**Goal:** A checkbox/toggle in EventModal: "This is a negative assertion." When toggled, label becomes "did not <event_type> ..." and disables fields that don't make sense for a negation (e.g., participants list — only the primary person is meaningful). On save, `events.is_negation = 1` and `events.negation_event_type` = the original `event_type` value.

**Files:**
- Modify: `src/renderer/components/modals/EventModal.vue`
- Modify: i18n locales (`events.isNegation`, `events.negationLabel`)
- Modify: `tests/components/EventModal.test.ts`

**Dependencies:** T06.

**Steps:** Follow T17 pattern. Commit: `feat(negations): is_negation toggle in EventModal — T22`.

---

### T23: Translations UI — alt names section on PersonNameModal + alt names in PlaceFormFields

**Goal:** PersonNameModal gets an "Alternative spellings / scripts" sub-section with rows for each `name_translations` row + add. PlaceFormFields gets the same for `place_translations`.

**Files:**
- Create: `src/renderer/components/PersonNameTranslationsSection.vue`
- Modify: `src/renderer/components/modals/PersonNameModal.vue` (slot in section)
- Modify: `src/renderer/components/PlaceFormFields.vue` (inline section)
- Modify: i18n locales
- Create: `tests/components/PersonNameTranslationsSection.test.ts`

**Dependencies:** T07.

**Steps:** Follow T20 pattern. Each translation row has fields: `value` (text), `language` (ISO 639-1 picker), `transliteration_scheme` (free text, optional). Commit: `feat(translations): UI for alt-script name and place translations — T23`.

---

### T24: Source coverage UI — section on SourcePanel

**Goal:** SourcePanel gets a "Coverage" section listing source_coverage_events rows; add a row per "this source covers BIRT events 1850-1920 in Östergötland."

**Files:**
- Create: `src/renderer/components/SourceCoverageSection.vue`
- Create: `src/renderer/components/modals/SourceCoverageModal.vue`
- Modify: `src/renderer/components/SourcePanel.vue`
- Modify: i18n locales
- Create: `tests/components/SourceCoverageSection.test.ts`

**Dependencies:** T08.

**Steps:** Follow T20 pattern. Coverage modal contains: event_type picker (using EVENT_TYPE_VALUES), date_value_from + date_value_to inputs, place picker (PlacePicker, optional), notes textarea. Commit: `feat(source-coverage): Coverage section + modal on SourcePanel — T24`.

---

## Phase 5 — Other-format alignment (3 parallel tasks; gated on all Phase 2 complete)

### T25: Holger / Genney / RootsMagic / Gramps importer audit + concept-mapping

**Goal:** Each non-GEDCOM importer audited for the new concepts (shared notes, person associations, negations, translations, source coverage). Where the source format carries the concept, the importer populates the new tables; where it doesn't, the importer's `unmappedData` disclosure mentions any related data that didn't make it into the new tables.

**Files:**
- Modify: `src/import/holger/transform.ts` (or equivalent)
- Modify: `src/import/genney/*` 
- Modify: `src/import/rootsmagic/transform.ts`
- Modify: `src/import/gramps/transform.ts`
- Test: `tests/unit/holger-newconcepts.test.ts`, same shape for genney/rootsmagic/gramps

**Dependencies:** T04, T05, T06, T07, T08 all complete.

**Verification:** Each importer has at least one test for each new concept it should map. RootsMagic and Gramps tests are expected to populate many; Holger and Genney probably populate fewer (smaller-scope formats).

**Steps:**

- [x] **Step 1: Audit each importer's source format** — read the existing importer code + format docs (online) to identify which new concepts each format carries. Document findings in a comment at the top of each importer file.

- [x] **Step 2: For each (importer, concept) where mapping is possible**, write a test + add the mapping code.

- [x] **Step 3: For each (importer, concept) where mapping is NOT possible**, the format doesn't carry that data — no test, no code. Document in the audit comment.

- [x] **Step 4: Update each importer's `unmappedData` disclosure** to mention if the format carries a concept-shaped thing we now model but the importer didn't bring over.

- [x] **Step 5: Run all importer tests** — confirm passing.

- [x] **Step 6: Commit** `feat(non-gedcom-importers): map new concepts where source format carries them — T25`.

---

### T26: Archive (.zip) export/import — extend JSON dump shape for new tables

**Goal:** The archive export/import format is JSON-based. Extend its dump shape to include the 6 new tables (notes, note_links, person_associations, name_translations, place_translations, source_coverage_events). Round-trip test.

**Files:**
- Modify: `src/api/archive_export.ts` (or wherever the archive JSON shape is defined)
- Modify: `src/api/archive_import.ts`
- Create: `tests/unit/archive-roundtrip-newconcepts.test.ts`

**Dependencies:** T04, T05, T06, T07, T08.

**Verification:** Round-trip test seeds each new table with 2-3 rows; exports archive; clears DB; imports archive; asserts every row reconstructed bit-for-bit (including IDs, since archive preserves them — verify this is the archive contract or update it accordingly).

**Steps:** Follow T04 pattern. Trivial table-by-table additions. Commit: `feat(archive): round-trip new tables — T26`.

---

### T27: HTML site export — surface new fields on static site

**Goal:** The static-site export renders person/event/place/source pages via the SAME Vue views and components used by the renderer (`src/static/` reuses `src/renderer/`'s view + component tree; only the data backing differs — `static-api.ts` replaces `window.api` with read-only queries against a preloaded JSON snapshot). Extend the static export so notes, associations, translations, source coverage, and any other new-schema data appears on rendered static pages WITHOUT building duplicate UI components.

**No new UI components in T27.** The section components (PersonSourcesSection from T11, EntityNotesSection from T20, PersonAssociationsSection from T21, PersonNameTranslationsSection from T23, SourceCoverageSection from T24, RepositoryPanel from T10) render in both renderer AND static contexts because they're shared. T27 only needs the DATA backing to match.

**Files:**
- Modify: `src/api/html_site/` (JSON snapshot shape — add new tables to the dump)
- Modify: `src/static/static-api.ts` (add read-only methods matching `window.api.notes.forEntity`, `personAssociations.forPerson`, `translations.forName`, `translations.forPlace`, `sourceCoverageEvents.forSource`, `repositories.list`, etc. — exact same signatures so shared components don't need conditional logic)
- Verify (no edit usually needed): `src/static/views/` and shared components — they call `window.api.*` which the static SPA replaces at boot
- Test: `tests/unit/html_site-newconcepts.test.ts`

**Dependencies:** T04, T05, T06, T07, T08 (schema-feature integration provides the data); T11, T20, T21, T23, T24 (the shared section components rendered in static mode).

**Verification:**
- Run the html_site exporter on a fixture DB seeded with rows in every new table; assert the produced JSON snapshot contains those rows.
- `npm run build:static && npm run dev:static`, navigate in a browser to a person page with a shared note + a person association + an alt-script name; all three render via the SAME section components used in the renderer's PersonPanel.
- Confirm `static-api` signatures match `window.api` exactly (compare types from `src/renderer/api.d.ts` — that's the contract both backings implement).

**Anti-pattern this task must avoid:** building a parallel set of static-only components for the new fields. If a T27 PR adds new Vue components instead of extending `static-api.ts` + JSON snapshot, that's the wrong shape — reject and re-scope. The whole point of `src/static/` reusing the renderer's component tree is that surfacing new fields in the renderer (T20-T24) automatically surfaces them in the static export once the data backing exists.

**Steps:** Follow T26 pattern (JSON shape extension first, then test the snapshot, then verify in dev:static). Commit: `feat(html-site): surface new fields via shared components + static-api — T27`.

---

## Phase 6 — Close-out (1 task)

### T28: Full close-out verification + archive

**Goal:** Per `.claude/rules/plans.md` close-out checklist + design spec's verification §1. Mechanical, run-everything, paste-output evidence capture. Archive the plan.

**Files:**
- Modify: `docs/plans/2026-05-19-gedcom-alignment.md` (mark every checkbox `[x]`)
- Modify: `docs/PLAN.md` (remove milestone from active list)
- Modify: `docs/plans/archive/PLAN.md` (append entry)
- Move: `docs/plans/2026-05-19-gedcom-alignment.md` + `-design.md` → `docs/plans/archive/` via `git mv`
- Modify: `package.json` (minor version bump)
- Modify: `CHANGELOG.md` (Unreleased entry)

**Dependencies:** All of T01-T27.

**Verification:** Per CLAUDE.md "Verification discipline at close-out" — every verification command run, output pasted in commit message.

**Steps:**

- [x] **Step 1: Run `npm test` and capture summary line**

   ```bash
   npm test 2>&1 | tail -5
   ```

   Expected: `N passed (Xs)`.

- [x] **Step 2: Run `npm run lint`**

   ```bash
   npm run lint 2>&1 | tail -3
   ```

   Expected: 0 errors.

- [x] **Step 3: Run `npm run build` and `npm run build:static` and `npm run build:mcp-sidecar`**

   ```bash
   npm run build 2>&1 | tail -3
   npm run build:static 2>&1 | tail -3
   npm run build:mcp-sidecar 2>&1 | tail -3
   ```

   Expected: all exit 0; capture tail lines.

- [x] **Step 4: Run `npm run test:e2e:full`** across all 7 Playwright projects.

   ```bash
   npm run test:e2e:full 2>&1 | tail -20
   ```

   Expected: all projects green; capture per-project pass counts.

- [x] **Step 5: Run the dedicated GEDCOM round-trip diff e2e check**

   ```bash
   npx playwright test --project=imports gedcom-roundtrip-comprehensive 2>&1 | tail -10
   ```

   Capture the diff output (or "no diff" indicator).

- [x] **Step 6: Run a live walkthrough**

   `npm start`; manually navigate to each new UI surface (RepositoriesView, every panel with new sections, every modal with new fields), confirm by inspection. Capture screenshots in a `docs/plans/archive/2026-05-19-gedcom-alignment-screenshots/` directory.

- [x] **Step 7: Mark every checkbox in `docs/plans/2026-05-19-gedcom-alignment.md` as `[x]`**

- [x] **Step 8: Update `docs/PLAN.md` and `docs/plans/archive/PLAN.md`**

- [x] **Step 9: Version bump in `package.json`** (minor — many features shipped)

- [x] **Step 10: Update `CHANGELOG.md`** with an Unreleased entry summarizing the plan

- [x] **Step 11: `git mv` plan + design spec to archive**

   ```bash
   git mv docs/plans/2026-05-19-gedcom-alignment.md docs/plans/archive/
   git mv docs/plans/2026-05-19-gedcom-alignment-design.md docs/plans/archive/
   ```

- [x] **Step 12: Commit close-out**

   ```bash
   git add docs/plans/archive/ docs/PLAN.md docs/plans/archive/PLAN.md \
           package.json CHANGELOG.md \
           docs/plans/archive/2026-05-19-gedcom-alignment-screenshots/
   git commit -m "$(cat <<'EOF'
chore: archive completed GEDCOM alignment plan

Closed every silent-round-trip-loss gap in the schema, importer,
exporter, and UI. Round-trip fidelity achieved per-version-best:
GEDCOM 7.0 lossless on every authored field that 7.0's spec carries;
GEDCOM 5.5.1 lossless or documented lossy:5.5.1-spec-limit per
spec capability.

Verification evidence (all run locally before push):

npm test       → [paste summary line here]
npm run lint   → [paste line here]
npm run build  → [paste tail here, exit 0]
npm run build:static     → [paste tail here, exit 0]
npm run build:mcp-sidecar → [paste tail here, exit 0]
npm run test:e2e:full    → 7/7 projects passed
GEDCOM round-trip e2e   → [paste diff result]

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
   ```

- [x] **Step 13: Push to main**

   ```bash
   git push origin main
   ```

---

## Self-Review Notes

After writing this plan, ran the self-review checklist:

1. **Spec coverage:** Every section in the design spec has a corresponding task — audit (T01), schema (T02), corner cases (T03), shared notes (T04, T20), associations (T05, T21), negations (T06, T22), translations (T07, T23), source coverage (T08, T24), sex X / HEAD / dates (T09 + T17 + T19), Repositories CRUD (T10), citations on each panel (T11-T13), modal field-surfacing (T14-T19), other-format alignment (T25-T27), close-out (T28). Coverage complete.

2. **Placeholder scan:** Tasks T05, T06, T07, T08 reference "follow T04 pattern" rather than restating every step. This is intentional per the skill's note about avoiding duplication when tasks have parallel structure — the executor reads T04 in full, then T05-T08 fill in the specifics (file paths, GEDCOM tags, role values, etc. all specified). Each per-version test expectation and per-emitter signature is given. Acceptable.

3. **Type consistency:** `Note`, `NoteLink`, `PersonAssociation`, `NameTranslation`, `PlaceTranslation`, `SourceCoverageEvent` interfaces defined in T02 Step 4; consumers in T04+ reference these types consistently. `entity_type` enum values consistent across notes/note_links and the polymorphic columns. Function signatures consistent (e.g., `linkNoteToEntity` always takes `noteId, entityType, entityId`).

4. **One ambiguity flagged**: T08 Step 6 mentions two design alternatives for `date_direction`/`date_type=from_to`; the executor picks the cleaner one. This is acceptable since both flow into the same fidelity registry classification — but the executor must commit to one and stick to it in the implementation. The spec section "Open questions resolved" doesn't pre-decide this; consider it a sub-decision the executor makes during T08 and documents in the commit message.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-05-19-gedcom-alignment.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task per `subagent-handoff`, with worktree isolation per task, two-stage review (spec review + code-quality review) between tasks. Maximum parallelism: T01→T02→T03 serial (3 days), then up to 9 concurrent agents through Phase 2 and Phase 3. Total ~3 weeks wall-clock.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints. Single-threaded but lower coordination overhead. Total ~6 weeks wall-clock.

Which approach?
