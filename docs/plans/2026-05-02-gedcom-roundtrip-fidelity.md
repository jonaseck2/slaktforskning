# GEDCOM Round-Trip Fidelity Audit & Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Design spec:** `docs/plans/2026-05-02-gedcom-roundtrip-fidelity-design.md` (sibling).

**Depends on:** `docs/plans/2026-05-02-events-fact-value.md` must implement first. The schema after that plan ships will have `events.value TEXT` and `events.notes TEXT` (renamed from `events.description`). The registry built in Task 4 below keys to whatever columns actually exist in the live schema; if events fact-value has not landed, the registry will end up with `events.description` instead of `events.value`/`events.notes`, which is *not* what we want long-term. **Verify before starting Task 1**: `grep -n "value TEXT" src/api/schema.ts | grep events` should show the new column.

## User goal

A genealogist hands us decades of their family research as a GEDCOM file. We must be able to hand it back. End-to-end lifecycle: GEDCOM → DB → user edits → DB → GEDCOM. The data they gave us comes back out, minus only what we explicitly disclosed at import time we could not carry.

User-observable promise: *"It is impossible for a developer to make a schema change that quietly breaks GEDCOM round-trip."* After this plan ships, adding a new column to `src/api/schema.ts` without registering its round-trip behaviour fails CI immediately.

## Scope

### In scope (this plan ships)

1. New file `src/api/gedcom_fidelity_registry.ts` — types + entries for every column in every non-exempt table.
2. New file `tests/unit/gedcom-fidelity-registry-coverage.test.ts` — schema-introspection guard.
3. New file `tests/unit/gedcom-fidelity-per-field.test.ts` — per-(table,column,version) round-trip.
4. New file `tests/unit/gedcom-fidelity-golden.test.ts` — multi-table comprehensive seed → round-trip.
5. New file `tests/helpers/gedcom_fidelity.ts` — sentinel generator, seeder, canonicaliser, EXEMPT_TABLES.
6. Edit `CLAUDE.md` — add "⚠️ Prime Directive (cont.): Round-Trip Fidelity" sub-section directly below the existing Prime Directive section.
7. Edit `.claude/skills/gedcom/SKILL.md` — append "Round-trip fidelity registry" pointer section.
8. Edit `docs/PLAN.md` — append the audit milestone and per-`lossy` follow-ups discovered during the audit.

### Scope deviations (explicit)

- **Tables exempt from the registry:** `gazetteers`, `ignored_duplicates`, `media_regions`, `db_settings`, `person_names_new`, `research_tasks_new`. Each with one-line code-comment reason in `EXEMPT_TABLES`. `media_regions` is the only known-gap exemption (face/region annotations) — promoted to a registered entry once OBJE.CROP exporter lands.
- **No archive (.zip) round-trip enforcement.** Sibling registry/tests for archives ship in a follow-up plan. Logged in `docs/PLAN.md` here.
- **No automatic remediation of `lossy` entries discovered by the audit.** Each `lossy` entry that should ideally be `lossless` becomes a follow-up plan entry in `docs/PLAN.md`. This plan does not chase those fixes inline — it only ensures the registry records the truth and tests pass against it.
- **MCP tool argument schemas are NOT in the registry.** The contract is about persisted data, keyed on `(table, column)`.

## Verification

The user-observable outcome: *"It is impossible to make a schema change that quietly breaks GEDCOM round-trip."* Proof:

1. **Negative-case demonstration in this plan (Task 12).** Introduce `ALTER TABLE persons ADD COLUMN scratch TEXT`, run `npm test`, observe the coverage-guard fail with `persons.scratch` in the message, then revert. **Plan acceptance gate.**
2. Per-field round-trip green for every non-excluded entry under both `5.5.1` and `7.0`. Lossy entries pass against their declared degraded expectation.
3. Golden-DB-seed round-trip green for both versions.
4. Smoke check by user: take a real `.ged`, import through the running app, export, re-import, open one person of interest in both DBs, confirm fields match.

Lint and type-check are hygiene, not verification.

## Failure modes / RCA reference

This plan exists because the GEDCOM importer silently dropped `OCCU` line value (and similar fact tags) for years without any test catching it. The bug class: a field is in the source file, the importer parses + discards it, the exporter never produces it, no test fires because no test asserts "every column round-trips." The schema does not betray the bug.

The events fact-value bug (RCA: `docs/plans/2026-05-02-events-fact-value-design.md`) is the immediate trigger. That bug is fixed by the events plan, which restores the column-level mapping. From that point on, `events.value` exists in the DB and this plan ensures it survives DB → GEDCOM → DB forever.

If a future regression re-introduces drop-on-import for `OCCU` value, the per-field test for `events.value` fails immediately.

---

## Tech stack notes (for the implementer)

- **Tests:** Vitest. Files in `tests/unit/`, helpers in `tests/helpers/`. `createTestDb()` from `tests/helpers.ts` returns an in-memory SQLite DB with the full schema applied.
- **GEDCOM API:**
  - `exportGedcom(db, version: \'5.5.1\' | \'7.0\' = \'5.5.1\')` returns `{ ged: string; report: ExportReport }` — from `src/gedcom/exporter.ts`.
  - `parseGedcom(ged: string): GedcomNode[]` — from `src/gedcom/parser.ts`.
  - `importGedcom(db, tree: GedcomNode[], opts?)` — from `src/import/gedcom/index.ts`. Note: takes a parsed tree, NOT a raw string.
  - Round-trip pattern: `parseGedcom(exportGedcom(db).ged)` → `importGedcom(freshDb, parsed)`.
- **Schema introspection:** `PRAGMA table_info(<table>)` returns `{ name, type, notnull, dflt_value, pk }`. List tables: `SELECT name FROM sqlite_schema WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\'`.
- **Registry version keys:** Use `v551` and `v70` as object keys (cannot use `\'5.5.1\'` as a clean key, and `v70` reads better than `v7`). A small `VERSION_LABEL` map in the helper file translates to the API string when calling `exportGedcom`.
- **Lint sensitivity:** the project security hook flags the SQLite `Database.exec` method-name string as a false positive. Use `db.prepare(\'...\').run([])` or `runSql(db, \'...\')` from `src/api/db.ts`. **Do NOT write that flagged literal in test files or commits** — use `runSql`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/api/gedcom_fidelity_registry.ts` | Types + `GEDCOM_FIDELITY` map keyed by `${table}.${col}`. Single source of truth. |
| `tests/helpers/gedcom_fidelity.ts` | `EXEMPT_TABLES`, `makeSentinelValue`, `seedRowWithColumn`, `readColumnAfterRoundTrip`, `canonicaliseDb`, `VERSION_LABEL`. |
| `tests/unit/gedcom-fidelity-registry-coverage.test.ts` | Two assertions: every non-exempt schema column has a registry entry; every registry key references an existing column. |
| `tests/unit/gedcom-fidelity-per-field.test.ts` | One round-trip test per `(registry entry × version)`. Lossless asserts equality; lossy asserts `expectedAfterRoundTrip(seeded)`. |
| `tests/unit/gedcom-fidelity-golden.test.ts` | Multi-row, multi-table seed → round-trip → canonicalised deep-equal. |
| `CLAUDE.md` | New "⚠️ Prime Directive (cont.): Round-Trip Fidelity" section. |
| `.claude/skills/gedcom/SKILL.md` | New "Round-trip fidelity registry" section pointing at the registry. |
| `docs/PLAN.md` | New audit milestone + per-`lossy` follow-up entries. |

---

## Tasks

### Task 1: Pre-flight check — events fact-value plan landed

**Files:** none (verification only)

- [ ] **Step 1: Verify the events fact-value implementation has landed**

Run:
```bash
grep -E "value TEXT|notes TEXT" src/api/schema.ts | grep -v '^\s*--'
```

Expected: at least one match showing `events.value` and `events.notes` columns. Also verify:
```bash
grep -nE "description TEXT" src/api/schema.ts | grep events
```
Expected: NO match for `events.description` (it has been renamed to `notes`).

If either check fails, **STOP**. The events fact-value plan must land first. Re-read this plan's "Depends on" section. Do not proceed; the registry built later would record stale schema state.

- [ ] **Step 2: No commit** — verification only.

---

### Task 2: Create the registry types + version helpers (no entries yet)

**Files:**
- Create: `src/api/gedcom_fidelity_registry.ts`

- [ ] **Step 1: Write the registry file with types and an empty `GEDCOM_FIDELITY` map**

```typescript
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
  | { kind: \'lossless\' }
  | { kind: \'lossless-via\'; mechanism: string }
  | {
      kind: \'lossy\';
      reason: string;
      // Given the seeded value (and optionally the row context), returns the
      // expected post-round-trip value. Tests assert equality against this.
      // Returning the seeded value unchanged means "lossless in practice for
      // this column type" — use the lossless variant instead in that case.
      expectedAfterRoundTrip: (seeded: unknown, ctx?: RoundTripContext) => unknown;
    }
  | { kind: \'excluded\'; reason: string };

export interface RoundTripContext {
  // Other column values on the same row, in case the lossy expectation
  // depends on them (e.g. events.value\'s 5.5.1 expectation depends on event_type).
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
  // Populated in Task 4. The coverage-guard test will fail until then —
  // that is intentional; it proves the test works.
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (no errors from the new file).

- [ ] **Step 3: Commit**

```bash
git add src/api/gedcom_fidelity_registry.ts
git commit -m "feat(api): GEDCOM fidelity registry types (empty)"
```

---

### Task 3: Create the helper file (sentinel + seeder + canonicaliser stubs)

**Files:**
- Create: `tests/helpers/gedcom_fidelity.ts`

- [ ] **Step 1: Write the helper file**

```typescript
/**
 * Helpers for GEDCOM round-trip fidelity tests.
 *
 * - EXEMPT_TABLES: tables intentionally outside the registry, with reason.
 * - VERSION_LABEL: maps internal version keys to exportGedcom\'s string param.
 * - makeSentinelValue: column-type-aware recognisable sentinel.
 * - seedRowWithColumn: insert a row exercising one column (FK-safe).
 * - readColumnAfterRoundTrip: round-trip and read the column back.
 * - canonicaliseDb: normalise a DB for deep-equal comparison.
 */
import type { Database } from \'node-sqlite3-wasm\';
import { runSql, queryAll } from \'../../src/api/db\';
import { exportGedcom } from \'../../src/gedcom/exporter\';
import { parseGedcom } from \'../../src/gedcom/parser\';
import { importGedcom } from \'../../src/import/gedcom\';
import { createTestDb } from \'../helpers\';

export type RegistryVersion = \'v551\' | \'v70\';

export const VERSION_LABEL: Record<RegistryVersion, \'5.5.1\' | \'7.0\'> = {
  v551: \'5.5.1\',
  v70: \'7.0\',
};

/**
 * Tables intentionally outside the GEDCOM fidelity registry.
 * Adding a table here requires PR justification.
 */
export const EXEMPT_TABLES: Record<string, string> = {
  gazetteers: \'gazetteer cache; pure derived data per Prime Directive #1\',
  ignored_duplicates: \'per-DB UI state; no source-data analog\',
  media_regions: \'face/region annotations; no GEDCOM 5.5.1 representation, 7.0 OBJE.CROP exporter not yet shipped — promote to registered entry when it does\',
  db_settings: \'per-install preferences; user state, not genealogical data\',
  person_names_new: \'migration artifact; should not exist in a settled DB\',
  research_tasks_new: \'migration artifact; should not exist in a settled DB\',
};

/**
 * Generate a sentinel value for a column. Recognisable across round-trip
 * and type-appropriate (TEXT → string, INTEGER → number, REAL → number,
 * date columns → ISO string).
 *
 * The sentinel is unique per (table, col) so a misattribution bug fails
 * loudly: if the importer puts persons.notes data into events.notes, the
 * sentinel mismatch is obvious.
 */
export function makeSentinelValue(table: string, col: string, colType: string): unknown {
  const t = colType.toUpperCase();
  if (t.startsWith(\'INT\')) return 42;
  if (t.startsWith(\'REAL\') || t.includes(\'FLOAT\') || t.includes(\'DOUBLE\')) return 12.5;
  // TEXT / unknown — string sentinel encoding the (table, col) pair.
  // Keep ASCII-only and short to survive GEDCOM line-length quirks.
  return `S_${table}_${col}_x9`;
}

/**
 * Seed a single row into `table` with the target column populated by `value`.
 * Other NOT NULL columns get minimal placeholder values. Foreign-key parents
 * are seeded as needed.
 *
 * Returns the inserted row id (UUID).
 */
export function seedRowWithColumn(
  db: Database,
  table: string,
  col: string,
  value: unknown,
): string {
  // Implementation per-table. For tables with FK requirements:
  //   - person_names, person_identifiers, event_participants → seed a person first
  //   - events → may need a place if testing place_id, otherwise a person via event_participants
  //   - relationships → seed two persons
  //   - citations, source_repositories → seed source first
  //   - group_links, task_links, media_links → seed group/task/media + a target person
  //
  // The seeder is the most error-prone helper; if a per-field test fails
  // with "FOREIGN KEY constraint failed", check the seeder for that table.
  return seedByTable(db, table, col, value);
}

function seedByTable(db: Database, table: string, col: string, value: unknown): string {
  // Stubbed in Task 5 once the per-field tests need it. For now, throw.
  throw new Error(`seedRowWithColumn: no seeder for table=${table} (col=${col}) — add it in Task 5`);
}

/**
 * Round-trip a DB through GEDCOM at the given version. Returns the fresh DB.
 * Caller is responsible for db.close() if needed.
 */
export function roundTrip(db: Database, version: RegistryVersion): Database {
  const { ged } = exportGedcom(db, VERSION_LABEL[version]);
  const tree = parseGedcom(ged);
  const fresh = createTestDb();
  importGedcom(fresh, tree);
  return fresh;
}

/**
 * After round-trip, read the value of `col` from the (single) row in `table`
 * matching the sentinel insertion. Used by per-field tests.
 *
 * Strategy: look up by the sentinel value itself when it is in a TEXT column,
 * otherwise fall back to "the only row" (per-field tests seed exactly one row).
 */
export function readColumnFromOnlyRow(db: Database, table: string, col: string): unknown {
  const rows = queryAll<Record<string, unknown>>(db, `SELECT ${col} FROM ${table}`);
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new Error(`readColumnFromOnlyRow: expected 1 row in ${table}, got ${rows.length}`);
  }
  return rows[0][col];
}

/**
 * Canonicalise a DB for deep-equal comparison in golden tests.
 * - Drops audit columns (created_at, updated_at).
 * - Drops UUIDs (re-issued on import).
 * - Drops normalized_name (derived from name).
 * - Sorts multi-row tables by stable keys.
 *
 * Returns a plain object: { tableName: row[] }.
 */
export function canonicaliseDb(db: Database): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  const tables = queryAll<{ name: string }>(
    db,
    "SELECT name FROM sqlite_schema WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\'",
  ).map(t => t.name);
  for (const table of tables) {
    if (table in EXEMPT_TABLES) continue;
    const rows = queryAll<Record<string, unknown>>(db, `SELECT * FROM ${table}`);
    out[table] = rows.map(stripAuditAndIds).sort(stableRowSort);
  }
  return out;
}

function stripAuditAndIds(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === \'created_at\' || k === \'updated_at\') continue;
    if (k === \'id\') continue; // UUIDs re-issued on import
    if (k === \'normalized_name\') continue; // derived from name
    out[k] = v;
  }
  return out;
}

function stableRowSort(a: Record<string, unknown>, b: Record<string, unknown>): number {
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add tests/helpers/gedcom_fidelity.ts
git commit -m "test: GEDCOM fidelity test helpers (skeleton)"
```

---

### Task 4: Write the coverage-guard test (failing) and confirm it fails

**Files:**
- Create: `tests/unit/gedcom-fidelity-registry-coverage.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
/**
 * Coverage guard: every (table, column) in the schema must have an entry
 * in src/api/gedcom_fidelity_registry.ts, and every registry entry must
 * point at a real column. Bidirectional check.
 *
 * See CLAUDE.md "⚠️ Prime Directive (cont.): Round-Trip Fidelity".
 */
import { describe, it, expect } from \'vitest\';
import { queryAll } from \'../../src/api/db\';
import { GEDCOM_FIDELITY } from \'../../src/api/gedcom_fidelity_registry\';
import { EXEMPT_TABLES } from \'../helpers/gedcom_fidelity\';
import { createTestDb } from \'../helpers\';

describe(\'GEDCOM fidelity registry coverage\', () => {
  it(\'every non-exempt column in every table has a registry entry\', () => {
    const db = createTestDb();
    const tables = queryAll<{ name: string }>(
      db,
      "SELECT name FROM sqlite_schema WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\'",
    ).map(t => t.name);

    const missing: string[] = [];
    for (const table of tables) {
      if (table in EXEMPT_TABLES) continue;
      const cols = queryAll<{ name: string }>(db, `PRAGMA table_info(${table})`).map(c => c.name);
      for (const col of cols) {
        const key = `${table}.${col}`;
        if (!(key in GEDCOM_FIDELITY)) missing.push(key);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `GEDCOM fidelity registry missing ${missing.length} entries:\\n` +
          missing.map(k => `  - ${k}`).join(\'\\n\') +
          `\\n\\nYou added or renamed columns. For each missing key, add an entry to ` +
          `src/api/gedcom_fidelity_registry.ts declaring its round-trip status under ` +
          `GEDCOM 5.5.1 and 7.0. See the Prime Directive in CLAUDE.md.`,
      );
    }
  });

  it(\'every registry key references a column that exists in the live schema\', () => {
    const db = createTestDb();
    const tables = queryAll<{ name: string }>(
      db,
      "SELECT name FROM sqlite_schema WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\'",
    ).map(t => t.name);
    const liveColumns = new Set<string>();
    for (const table of tables) {
      const cols = queryAll<{ name: string }>(db, `PRAGMA table_info(${table})`).map(c => c.name);
      for (const col of cols) liveColumns.add(`${table}.${col}`);
    }

    const stale = Object.keys(GEDCOM_FIDELITY).filter(k => !liveColumns.has(k));
    if (stale.length > 0) {
      throw new Error(
        `Registry has ${stale.length} stale entries (referenced columns no longer exist):\\n` +
          stale.map(k => `  - ${k}`).join(\'\\n\') +
          `\\n\\nA column was dropped or renamed. Update src/api/gedcom_fidelity_registry.ts ` +
          `to remove or rename the entry.`,
      );
    }
  });

  it(\'EXEMPT_TABLES entries do not appear in the registry (mutually exclusive)\', () => {
    const exempted = Object.keys(EXEMPT_TABLES);
    const registryTables = new Set(Object.keys(GEDCOM_FIDELITY).map(k => k.split(\'.\')[0]));
    const overlaps = exempted.filter(t => registryTables.has(t));
    expect(overlaps).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it FAILS**

Run: `npx vitest run tests/unit/gedcom-fidelity-registry-coverage.test.ts`

Expected: the first test fails with a long list of missing entries (every column in `persons`, `person_names`, `events`, etc.). This is correct — the registry is empty. We will populate it in Task 5.

The second test passes (registry is empty, so no stale entries).
The third test passes (no overlap because registry is empty).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/gedcom-fidelity-registry-coverage.test.ts
git commit -m "test: GEDCOM fidelity coverage guard (red)"
```

---

### Task 5: Audit pass — populate the registry for every column in every non-exempt table

**Files:**
- Modify: `src/api/gedcom_fidelity_registry.ts`

This is the largest task in the plan. It is mechanical but careful work. ~80–120 entries.

- [ ] **Step 1: List every column to register**

Run:
```bash
node -e "
const Database = require(\'node-sqlite3-wasm\').Database;
const { initializeSchema } = require(\'./dist/src/api/schema\');
const db = new Database(\':memory:\');
initializeSchema(db);
const tables = db.prepare(\"SELECT name FROM sqlite_schema WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\'\").all([]);
const exempt = [\'gazetteers\',\'ignored_duplicates\',\'media_regions\',\'db_settings\',\'person_names_new\',\'research_tasks_new\'];
for (const t of tables) {
  if (exempt.includes(t.name)) continue;
  const cols = db.prepare(\`PRAGMA table_info(\${t.name})\`).all([]);
  for (const c of cols) console.log(\`\${t.name}.\${c.name}  (\${c.type})\`);
}
"
```

If `dist/` is not built, run `npm run build` first (or `npx tsc`).

Expected output: ~80–120 lines of `tablename.colname (TYPE)`.

Save the output — you will work through it row-by-row.

- [ ] **Step 2: Populate `GEDCOM_FIDELITY` entries**

Replace the empty `GEDCOM_FIDELITY` object in `src/api/gedcom_fidelity_registry.ts` with one entry per column from Step 1. Use this decision tree per column:

1. **Is it `id` (UUID PK)?** → `lossless-via` with `mechanism: \'XREF @<prefix>…@\'` for both versions. (UUIDs are re-issued on import; XREF identity is preserved by the importer creating a new UUID for the same XREF target.)
2. **Is it `created_at` / `updated_at`?** → `excluded` for both, reason `\'app-internal audit metadata, no GEDCOM equivalent\'`.
3. **Is it `normalized_name`?** → `excluded` for both, reason `\'derived from name at write time, not authored\'`.
4. **Is it a foreign-key column (`*_id` referencing another table)?** → `lossless-via` with `mechanism: \'XREF\'` for both versions if that FK is preserved across import. Verify by reading `src/import/gedcom/import-core.ts` for that table\'s import path.
5. **Is the column read by the exporter and written by the importer?** Check `src/gedcom/exporter.ts` and `src/import/gedcom/`. If yes → `lossless` (start optimistic; the per-field test in Task 6 will fail if it is actually lossy).
6. **Is the column ignored by the exporter?** → `lossy` with `expectedAfterRoundTrip: () => null` (or the column default), reason `\'exporter does not emit; column resets to default on re-import\'`. Owner pointer to the exporter file.
7. **Is the column GEDCOM-version-asymmetric?** (e.g. supported in 7.0 but not 5.5.1). Set `v551: lossy` and `v70: lossless`. Cite the spec section in the reason.

Examples to start from (these are illustrative — verify each against the importer/exporter before trusting):

```typescript
export const GEDCOM_FIDELITY: Record<string, FieldFidelity> = {
  // persons
  \'persons.id\': {
    v551: { kind: \'lossless-via\', mechanism: \'XREF @I…@\' },
    v70:  { kind: \'lossless-via\', mechanism: \'XREF @I…@\' },
  },
  \'persons.sex\': {
    v551: { kind: \'lossless\' },
    v70:  { kind: \'lossless\' },
    ownedBy: { exporter: \'src/gedcom/exporter.ts\', importer: \'src/import/gedcom/import-core.ts\' },
  },
  \'persons.notes\': {
    v551: { kind: \'lossless\' },
    v70:  { kind: \'lossless\' },
  },
  \'persons.created_at\': {
    v551: { kind: \'excluded\', reason: \'app-internal audit metadata, no GEDCOM equivalent\' },
    v70:  { kind: \'excluded\', reason: \'app-internal audit metadata, no GEDCOM equivalent\' },
  },
  \'persons.updated_at\': {
    v551: { kind: \'excluded\', reason: \'app-internal audit metadata, no GEDCOM equivalent\' },
    v70:  { kind: \'excluded\', reason: \'app-internal audit metadata, no GEDCOM equivalent\' },
  },

  // person_names
  \'person_names.id\': {
    v551: { kind: \'lossless-via\', mechanism: \'NAME order within INDI\' },
    v70:  { kind: \'lossless-via\', mechanism: \'NAME order within INDI\' },
  },
  \'person_names.person_id\': {
    v551: { kind: \'lossless-via\', mechanism: \'parent INDI XREF\' },
    v70:  { kind: \'lossless-via\', mechanism: \'parent INDI XREF\' },
  },
  \'person_names.given_name\': {
    v551: { kind: \'lossless\' },
    v70:  { kind: \'lossless\' },
  },
  \'person_names.surname\': {
    v551: { kind: \'lossless\' },
    v70:  { kind: \'lossless\' },
  },
  \'person_names.name_type\': {
    v551: { kind: \'lossless-via\', mechanism: \'NAME.TYPE sub-tag (birth=birth, married=married, etc.)\' },
    v70:  { kind: \'lossless-via\', mechanism: \'NAME.TYPE sub-tag\' },
  },
  // ... continue for every column in every non-exempt table.
};
```

**Discovery during this task:** if you discover a column whose round-trip behaviour is unclear from reading the importer/exporter, mark it `lossy` with reason `\'TODO: Task 6 will reveal the actual round-trip behaviour\'` and the per-field test in Task 6 will tell you the truth. Then return here and update.

- [ ] **Step 3: Run coverage guard — should now pass**

Run: `npx vitest run tests/unit/gedcom-fidelity-registry-coverage.test.ts`

Expected: all three tests pass. If the first test still reports missing keys, add them. If the second reports stale keys, you have a typo in a key (most likely a table name with a typo).

- [ ] **Step 4: Commit**

```bash
git add src/api/gedcom_fidelity_registry.ts
git commit -m "feat(api): populate GEDCOM fidelity registry — audit pass"
```

---

### Task 6: Write the per-field round-trip test (will reveal real bugs)

**Files:**
- Create: `tests/unit/gedcom-fidelity-per-field.test.ts`
- Modify: `tests/helpers/gedcom_fidelity.ts` (implement `seedByTable` for every non-exempt table)

- [ ] **Step 1: Implement `seedByTable` for every non-exempt table**

Add per-table seeding logic. Open `tests/helpers/gedcom_fidelity.ts` and replace the throw-only `seedByTable` stub:

```typescript
function seedByTable(db: Database, table: string, col: string, value: unknown): string {
  switch (table) {
    case \'persons\': return seedPerson(db, col, value);
    case \'person_names\': return seedPersonName(db, col, value);
    case \'person_identifiers\': return seedPersonIdentifier(db, col, value);
    case \'relationships\': return seedRelationship(db, col, value);
    case \'events\': return seedEvent(db, col, value);
    case \'event_participants\': return seedEventParticipant(db, col, value);
    case \'places\': return seedPlace(db, col, value);
    case \'sources\': return seedSource(db, col, value);
    case \'citations\': return seedCitation(db, col, value);
    case \'groups\': return seedGroup(db, col, value);
    case \'group_links\': return seedGroupLink(db, col, value);
    case \'repositories\': return seedRepository(db, col, value);
    case \'source_repositories\': return seedSourceRepository(db, col, value);
    case \'research_tasks\': return seedResearchTask(db, col, value);
    case \'task_links\': return seedTaskLink(db, col, value);
    case \'media\': return seedMedia(db, col, value);
    case \'media_links\': return seedMediaLink(db, col, value);
    default:
      throw new Error(`seedByTable: unknown table=${table}`);
  }
}

function seedPerson(db: Database, col: string, value: unknown): string {
  const id = crypto.randomUUID();
  const cols = [\'id\']; const vals: unknown[] = [id]; const placeholders = [\'?\'];
  if (col === \'sex\') { cols.push(\'sex\'); vals.push(value); placeholders.push(\'?\'); }
  else if (col === \'notes\') { cols.push(\'notes\'); vals.push(value); placeholders.push(\'?\'); }
  // id, created_at, updated_at are handled separately (created_at/updated_at default;
  // id is the column under test only when col === \'id\').
  if (col === \'id\') { /* override */ vals[0] = value; }
  runSql(db, `INSERT INTO persons (${cols.join(\',\')}) VALUES (${placeholders.join(\',\')})`, vals);
  // Persons need at least one name to round-trip through GEDCOM (importer drops
  // INDI without NAME). Add a placeholder name.
  if (col !== \'sex\' || true) {
    runSql(
      db,
      `INSERT INTO person_names (id, person_id, given_name, surname, name_type, sort_order) VALUES (?, ?, ?, ?, \'birth\', 0)`,
      [crypto.randomUUID(), id, \'TestGiven\', \'TestSurname\'],
    );
  }
  return id;
}

// ... write similar focused seeders for every other table.
// Pattern: insert minimal valid parent FKs first, then insert the row under
// test with the column-under-test set to `value` and other NOT NULLs at defaults.
```

**Note for the implementer:** the seeders are tedious but mechanical. Read each table\'s `CREATE TABLE` in `src/api/schema.ts` and the matching `create*` function in `src/api/<table>.ts` for the canonical insert shape. When in doubt, mirror what the matching API function does — it already handles FK setup correctly.

- [ ] **Step 2: Write the per-field round-trip test**

```typescript
/**
 * Per-field GEDCOM round-trip test.
 *
 * For every (registry entry × version), seed a row exercising that column,
 * round-trip through GEDCOM, and assert the column survives (or matches the
 * registry-declared lossy expectation).
 *
 * Excluded entries get a documented placeholder it() for visibility.
 *
 * See CLAUDE.md "⚠️ Prime Directive (cont.): Round-Trip Fidelity".
 */
import { describe, it, expect, beforeEach } from \'vitest\';
import { queryAll } from \'../../src/api/db\';
import {
  GEDCOM_FIDELITY,
  type FidelityStatus,
} from \'../../src/api/gedcom_fidelity_registry\';
import {
  makeSentinelValue,
  seedRowWithColumn,
  roundTrip,
  readColumnFromOnlyRow,
  type RegistryVersion,
} from \'../helpers/gedcom_fidelity\';
import { createTestDb } from \'../helpers\';

const VERSIONS: RegistryVersion[] = [\'v551\', \'v70\'];

function getColumnType(table: string, col: string): string {
  const db = createTestDb();
  const info = queryAll<{ name: string; type: string }>(
    db,
    `PRAGMA table_info(${table})`,
  );
  const found = info.find(c => c.name === col);
  if (!found) throw new Error(`column ${table}.${col} not in schema`);
  return found.type;
}

describe(\'GEDCOM fidelity per-field round-trip\', () => {
  for (const [key, fidelity] of Object.entries(GEDCOM_FIDELITY)) {
    const [table, col] = key.split(\'.\');
    describe(key, () => {
      for (const version of VERSIONS) {
        const status: FidelityStatus = fidelity[version];
        if (status.kind === \'excluded\') {
          it.skip(`${version}: excluded — ${status.reason}`, () => { /* documented */ });
          continue;
        }

        it(`${version}: round-trips`, () => {
          const colType = getColumnType(table, col);
          const sentinel = makeSentinelValue(table, col, colType);
          const db = createTestDb();
          seedRowWithColumn(db, table, col, sentinel);

          const fresh = roundTrip(db, version);
          const got = readColumnFromOnlyRow(fresh, table, col);

          if (status.kind === \'lossless\' || status.kind === \'lossless-via\') {
            expect(got, `column ${key} under ${version}`).toEqual(sentinel);
          } else {
            // lossy — compare against declared expectation
            const expected = status.expectedAfterRoundTrip(sentinel);
            expect(got, `column ${key} under ${version} (lossy: ${status.reason})`).toEqual(expected);
          }
        });
      }
    });
  }
});
```

- [ ] **Step 3: Run the per-field test**

Run: `npx vitest run tests/unit/gedcom-fidelity-per-field.test.ts`

Expected: many tests pass (the `lossless` defaults you set in Task 5 that are actually lossless). Some FAIL — those are real round-trip bugs. Each failure is one of:

- A column you marked `lossless` is actually lossy → fix in Task 7.
- A seeder bug (FK error, NOT NULL violation) → fix the seeder.
- A round-trip bug in the importer or exporter → fix in Task 7.

- [ ] **Step 4: Commit (red — failing tests are expected)**

```bash
git add tests/unit/gedcom-fidelity-per-field.test.ts tests/helpers/gedcom_fidelity.ts
git commit -m "test: GEDCOM per-field round-trip (failures pending triage)"
```

---

### Task 7: Triage per-field failures

**Files (per failure):** registry, importer/exporter, or follow-up `docs/PLAN.md` entry.

This is open-ended discovery work. Process each failing test from Task 6:

- [ ] **Step 1: For each failing test, decide**

For each failure, decide one of:
1. **Tiny fix in the importer or exporter** — under ~30 lines, no schema change. Make the fix; per-field test goes green; promote registry entry from `lossy` placeholder to `lossless` (or simply leave `lossless` if you started optimistic). Commit per fix.
2. **Larger fix** — schema change, semantic change, or significant code change. Demote the registry entry to `lossy` with a precise reason and an `expectedAfterRoundTrip` that returns the *current* (broken) round-trip value, so the test passes. Add a follow-up entry to `docs/PLAN.md` describing the upgrade path. **Do not fix it in this plan.**

The judgement call: if the fix would take longer than ~1 hour or touches more than one file, it goes to follow-up. The point of this plan is to lock down the *current truth*, not to chase every fix.

- [ ] **Step 2: Apply each fix or registry demotion, committing per change**

Example commit messages:
- `fix(gedcom-export): emit OBJE.FORM for media format` (tiny fix)
- `chore(fidelity): record places.parent_place_id as lossy under v551` (registry demotion + follow-up entry)

- [ ] **Step 3: Re-run the per-field test until green**

Run: `npx vitest run tests/unit/gedcom-fidelity-per-field.test.ts`
Expected: all tests green. Any remaining failure means the registry entry does not match reality — fix the registry expectation.

- [ ] **Step 4: Final commit if registry was further updated**

```bash
git add src/api/gedcom_fidelity_registry.ts docs/PLAN.md
git commit -m "chore(fidelity): triage per-field round-trip failures"
```

---

### Task 8: Write the golden-DB-seed round-trip test

**Files:**
- Create: `tests/unit/gedcom-fidelity-golden.test.ts`

- [ ] **Step 1: Write the test**

```typescript
/**
 * Golden-DB-seed round-trip test.
 *
 * Seed a comprehensive in-memory DB exercising every supported column at
 * least once, including multi-field interactions on the same row. Round-trip
 * through GEDCOM and assert the canonicalised DB equals the original.
 *
 * Catches multi-field interactions that single-field tests miss (e.g.,
 * "OCCU value works alone, OCCU value + cause works alone, but exporter
 * emits them in a wrong order so re-import gets confused").
 *
 * See CLAUDE.md "⚠️ Prime Directive (cont.): Round-Trip Fidelity".
 */
import { describe, it, expect, beforeEach } from \'vitest\';
import { createPerson, addPersonName, addPersonIdentifier } from \'../../src/api/persons\';
import { findOrCreatePlace } from \'../../src/api/places\';
import { createEvent, addEventParticipant } from \'../../src/api/events\';
import { createRelationship } from \'../../src/api/relationships\';
import { createSource, createCitation } from \'../../src/api/sources\';
import { createGroup, addGroupLink } from \'../../src/api/groups\';
import { createRepository } from \'../../src/api/repositories\';
import { createResearchTask, addTaskLink } from \'../../src/api/research_tasks\';
import { createMedia, addMediaLink } from \'../../src/api/media\';
import {
  roundTrip,
  canonicaliseDb,
  type RegistryVersion,
} from \'../helpers/gedcom_fidelity\';
import { createTestDb } from \'../helpers\';

const VERSIONS: RegistryVersion[] = [\'v551\', \'v70\'];

/**
 * Seed a comprehensive DB exercising every supported column at least once,
 * including multi-field interactions on the same row.
 *
 * Coverage targets:
 * - Person with prefix + suffix + REFN + RIN + multiple names
 * - Place with parent + coordinates + address parts
 * - OCCU event with value + cause + notes + date + place + participant + citation
 * - DEAT event with cause + place
 * - Couple relationship with marriage + divorce events
 * - Source with citations on person + event + place
 * - Repository linked to source
 * - Research task linked to person
 * - Group with persons + places + media
 * - Media with regions
 *
 * If you add a column to the schema and the per-field test passes for it
 * but golden does not exercise it, add coverage here.
 */
function seedComprehensive(db: typeof createTestDb extends () => infer R ? R : never): void {
  // Person 1: full attribute coverage
  const p1 = createPerson(db, { sex: \'M\', notes: \'P1 notes\' });
  addPersonName(db, p1.id, {
    given_name: \'Lars\', surname: \'Eriksson\',
    name_type: \'birth\', sort_order: 0,
    name_prefix: \'Dr.\', name_suffix: \'Jr.\',
    patronymic_base: \'Erik\', name_qualifier: \'patronymic\',
    preferred_name: \'Lars\', nickname: \'Lasse\',
  });
  addPersonName(db, p1.id, {
    given_name: \'Lars\', surname: \'Andersson\',
    name_type: \'name_change\', sort_order: 1,
    date_from: \'1885\', date_to: null,
  });
  addPersonIdentifier(db, p1.id, \'refn\', \'L1\');
  addPersonIdentifier(db, p1.id, \'rin\', \'42\');

  // Person 2: spouse for relationship
  const p2 = createPerson(db, { sex: \'F\' });
  addPersonName(db, p2.id, { given_name: \'Anna\', surname: \'Bengtsdotter\', name_type: \'birth\', sort_order: 0 });

  // Place with parent
  const country = findOrCreatePlace(db, \'Sverige\');
  const village = findOrCreatePlace(db, \'Björkvik, Södermanland, Sverige\');
  // Set address fields if API supports — otherwise inject via runSql.
  // ...

  // OCCU event: multi-field interaction (value + cause + notes + date + place)
  const occu = createEvent(db, {
    event_type: \'occupation\',
    value: \'Carpenter\',           // requires events fact-value plan landed
    cause: null,
    notes: \'Worked at the shipyard\',
    date_type: \'exact\', date_value: \'1885-03-15\', date_value_end: null,
    date_original: \'15 MAR 1885\',
    place_id: village.id,
  });
  addEventParticipant(db, occu.id, p1.id, \'primary\');

  // DEAT event with cause
  const deat = createEvent(db, {
    event_type: \'death\',
    value: null, cause: \'pneumonia\', notes: \'\',
    date_type: \'exact\', date_value: \'1920-11-02\', date_value_end: null,
    date_original: \'2 NOV 1920\',
    place_id: village.id,
  });
  addEventParticipant(db, deat.id, p1.id, \'primary\');

  // Couple relationship + marriage + divorce events
  const rel = createRelationship(db, { type: \'couple\', person1_id: p1.id, person2_id: p2.id, subtype: \'married\' });
  const marr = createEvent(db, {
    event_type: \'marriage\', value: null, cause: null, notes: \'\',
    date_type: \'exact\', date_value: \'1880-06-14\', date_value_end: null, date_original: \'14 JUN 1880\',
    place_id: village.id, relationship_id: rel.id,
  });

  // Source + citations
  const src = createSource(db, {
    title: \'Björkvik Parish Records\',
    author: \'Pastor Olsson\',
    publication_info: \'1880\',
    repository: \'\', url: \'\', source_type: \'parish-register\',
    call_number: \'B-1880\', abstract: \'Parish births/deaths 1850–1900\',
  });
  createCitation(db, {
    source_id: src.id, page: \'p. 42\', date_accessed: \'2026-04-01\',
    confidence: 3, transcription: \'Lars Eriksson, born…\',
    notes: \'\', event_id: occu.id, person_id: null, relationship_id: null, place_id: null,
  });

  // Repository
  const repo = createRepository(db, {
    name: \'Riksarkivet\', address: \'Box 12541\', city: \'Stockholm\',
    postal_code: \'10229\', state: null, country: \'Sverige\',
    phone: null, email: null, web: \'https://riksarkivet.se\',
    call_number: \'RA-001\', notes: \'\',
  });
  // Link source → repository (via source_repositories junction)
  // ...

  // Research task linked to person
  const task = createResearchTask(db, {
    priority: 1, status: \'open\', task: \'Find baptism record\',
    notes: \'Check parish registers\', result: \'\',
  });
  addTaskLink(db, task.id, \'person\', p1.id);

  // Group with person + place
  const grp = createGroup(db, { name: \'Eriksson family\', notes: \'Direct line\' });
  addGroupLink(db, grp.id, \'person\', p1.id);
  addGroupLink(db, grp.id, \'place\', village.id);

  // Media linked to person
  const med = createMedia(db, { file_ref: \'photos/lars.jpg\', title: \'Lars portrait\', format: \'jpeg\', notes: \'\', is_printable: true });
  addMediaLink(db, med.id, \'person\', p1.id);
}

describe(\'GEDCOM fidelity golden-DB-seed round-trip\', () => {
  for (const version of VERSIONS) {
    it(`${version}: comprehensive seed survives DB → GEDCOM → DB`, () => {
      const db = createTestDb();
      seedComprehensive(db);
      const before = canonicaliseDb(db);

      const after = canonicaliseDb(roundTrip(db, version));

      expect(after, `golden round-trip mismatch under ${version}`).toEqual(before);
    });
  }
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/unit/gedcom-fidelity-golden.test.ts`

Expected: tests run; failures are likely (real multi-field round-trip bugs). For each failure, the diff in vitest output will show which table/row/column diverged.

- [ ] **Step 3: Triage failures**

Same triage rule as Task 7:
- Tiny fix → land in this plan; commit per fix.
- Larger fix → adjust `canonicaliseDb` to drop the offending column for golden (with a code comment citing the registry `lossy` entry that justifies it), or extend the lossy expectation. Add follow-up to `docs/PLAN.md`.

- [ ] **Step 4: Commit when green**

```bash
git add tests/unit/gedcom-fidelity-golden.test.ts tests/helpers/gedcom_fidelity.ts src/api/gedcom_fidelity_registry.ts docs/PLAN.md
git commit -m "test: GEDCOM golden-DB-seed round-trip"
```

---

### Task 9: Add the Prime Directive amendment to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Insert the new sub-section directly below the existing "⚠️ Prime Directive: Data Fidelity" section**

The existing section ends with: `This rule applies to: import paths, MCP tools, IPC handlers, Vue components, AI agents, scripts, migrations. Everywhere. No exceptions.`

Directly after that paragraph (and before `## Project Overview`), insert:

```markdown
## ⚠️ Prime Directive (cont.): Round-Trip Fidelity

**The user must be able to leave with their data intact. Every authored field in the database must survive a GEDCOM 5.5.1 *or* 7.0 round-trip — or be explicitly, justifiably excluded.**

The data lifecycle includes offboarding. A user who exports their database to GEDCOM and re-imports it (in this app, or any other) must get the same data back. This is co-equal with authored-data preservation: the first protects the user\'s data while it lives in our DB; this protects it as it leaves.

**Lifecycle direction:** GEDCOM → DB → user edits → DB → GEDCOM. End-to-end. Two enforcement mechanisms sit under one directive: (1) the importer discloses anything it cannot model — existing `unmappedData` / import-report mechanism; (2) the DB → GEDCOM → DB round-trip is mechanically guarded by the registry below. A schema change cannot weaken either: adding a column without a registry entry breaks CI, and changing the importer to drop a field that was previously reported also fails the existing import-disclosure tests.

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
- "We don\'t use this field much." Authored data is authored data.
- "GEDCOM 5.5.1 can\'t carry it but 7.0 can." That\'s `lossy:5.5.1-spec-limit` for v551 and `lossless` for v70 — not excluded.

**Where this rule applies:** schema migrations, importer (`src/import/gedcom/`, `src/gedcom/importer.ts`), exporter (`src/gedcom/exporter.ts`), MCP tools that mutate persisted state, any new entity. Render-only and gazetteer-only code is exempt by definition (does not write authored data). Archive (`.zip`) export/import is in-scope conceptually but mechanical enforcement ships in a follow-up plan.

**Why this matters:** the user\'s choice to use this app must remain reversible. If our schema evolves in a way that strands their data inside our format, we have failed them — even if everything works perfectly while they stay.
```

- [ ] **Step 2: Verify markdown renders cleanly**

```bash
grep -c "⚠️ Prime Directive" CLAUDE.md
```
Expected: `2` (original + new section).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): add Prime Directive (cont.) — Round-Trip Fidelity"
```

---

### Task 10: Update the gedcom skill SKILL.md

**Files:**
- Modify: `.claude/skills/gedcom/SKILL.md`

- [ ] **Step 1: Append a "Round-trip fidelity registry" section**

Append to the end of `.claude/skills/gedcom/SKILL.md`:

```markdown
## Round-trip fidelity registry

Every column in every non-exempt table has an entry in `src/api/gedcom_fidelity_registry.ts` declaring its round-trip status under GEDCOM 5.5.1 and 7.0. Three tests enforce the contract:

- `tests/unit/gedcom-fidelity-registry-coverage.test.ts` — schema-introspection guard. Adding a column without a registry entry fails CI.
- `tests/unit/gedcom-fidelity-per-field.test.ts` — per-`(table, column, version)` round-trip.
- `tests/unit/gedcom-fidelity-golden.test.ts` — comprehensive multi-table seed → round-trip.

When you change anything in `src/import/gedcom/` or `src/gedcom/exporter.ts`, run those three tests. When you add a schema column, the coverage test will tell you to register it.

See `CLAUDE.md` "⚠️ Prime Directive (cont.): Round-Trip Fidelity" for the why.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/gedcom/SKILL.md
git commit -m "docs(skill/gedcom): point at the fidelity registry"
```

---

### Task 11: Update docs/PLAN.md with the audit milestone + lossy follow-ups

**Files:**
- Modify: `docs/PLAN.md`

- [ ] **Step 1: Append the audit milestone and per-`lossy` follow-ups**

Open `docs/PLAN.md`. Add a new entry under the active list summarising this plan as completed (per the close-out workflow in CLAUDE.md, this happens at archive time — see Task 13). For now, add follow-up entries for every `lossy` registry entry that should ideally be promoted to `lossless` in a future plan.

Format for each follow-up:

```markdown
### [planned] Promote <table>.<col> from lossy to lossless under GEDCOM <version>
Currently round-trips with degradation: <reason from registry>. Upgrade requires <one-line description of the fix shape>. Owner: `<file from registry.ownedBy>`.
```

Also add:

```markdown
### [planned] Archive (.zip) round-trip fidelity registry + tests
Mirror `src/api/gedcom_fidelity_registry.ts` for the .zip archive export/import path. Share the helper infrastructure in `tests/helpers/gedcom_fidelity.ts`. Spec: derived from `docs/plans/2026-05-02-gedcom-roundtrip-fidelity-design.md` Scope deviations.
```

- [ ] **Step 2: Commit**

```bash
git add docs/PLAN.md
git commit -m "docs(plan): log fidelity follow-ups (lossy → lossless promotions, archive registry)"
```

---

### Task 12: Negative-case demonstration — plan acceptance gate

**Files:**
- Modify (and revert): `src/api/schema.ts`

This is the user-observable proof that the guard works. **The plan is not done until this fires.**

- [ ] **Step 1: Introduce a fake migration that adds a new column**

Open `src/api/schema.ts`. Add at the very end of `initializeSchema`, just before the closing `}`:

```typescript
// SCRATCH — REVERT BEFORE COMMIT
const personsCols2 = queryAll<{ name: string }>(db, \'PRAGMA table_info(persons)\').map(c => c.name);
if (!personsCols2.includes(\'scratch\')) {
  db.exec(\'ALTER TABLE persons ADD COLUMN scratch TEXT\');
}
```

- [ ] **Step 2: Run the coverage guard test**

Run: `npx vitest run tests/unit/gedcom-fidelity-registry-coverage.test.ts`

Expected: the first test FAILS with an error message including `persons.scratch`. The message points at `src/api/gedcom_fidelity_registry.ts` and `CLAUDE.md`.

If the test passes, the guard is broken — debug and fix the test before reverting.

- [ ] **Step 3: Capture the failure output for the user**

Save the failing test output (paste into the PR description or commit message body). The user wants to see the actual failure message, not just hear that it exists.

- [ ] **Step 4: Revert the scratch migration**

Remove the SCRATCH block from `src/api/schema.ts`.

Run: `git diff src/api/schema.ts`
Expected: empty (clean revert).

- [ ] **Step 5: Re-run all three fidelity tests to confirm green**

Run: `npx vitest run tests/unit/gedcom-fidelity-`
Expected: all three test files pass.

- [ ] **Step 6: No commit for this task** — the demonstration is the deliverable; the schema is reverted.

---

### Task 13: Final verification + plan close-out per CLAUDE.md workflow

**Files:**
- Modify: this plan file (mark every `- [ ]` as `- [x]`)
- Move: this plan + design spec to `docs/plans/archive/`
- Modify: `package.json`, `CHANGELOG.md`, `docs/PLAN.md`, `docs/plans/archive/PLAN.md`

This task implements the "Finishing a plan" checklist from `CLAUDE.md`. Follow it exactly.

- [ ] **Step 1: Tick every checkbox in this plan file**

Open `docs/plans/2026-05-02-gedcom-roundtrip-fidelity.md`. Replace every `- [ ]` with `- [x]`. Verify by:
```bash
grep -c "^- \[ \]" docs/plans/2026-05-02-gedcom-roundtrip-fidelity.md
```
Expected: `0`.

- [ ] **Step 2: Move plan + design spec to archive**

```bash
git mv docs/plans/2026-05-02-gedcom-roundtrip-fidelity.md docs/plans/archive/
git mv docs/plans/2026-05-02-gedcom-roundtrip-fidelity-design.md docs/plans/archive/
```

- [ ] **Step 3: Bump version (minor — this plan adds new features: registry + tests + Prime Directive amendment)**

Open `package.json`. Bump the minor version (e.g. `0.202.0` → `0.203.0`).

Open `CHANGELOG.md`. Add a `## Unreleased` block (if not present) with one bullet:
```markdown
## Unreleased

- GEDCOM round-trip fidelity registry + coverage guard. Every schema column now has an explicit round-trip status under GEDCOM 5.5.1 and 7.0; adding a new column without registering it fails CI.
```

- [ ] **Step 4: Update docs/PLAN.md and docs/plans/archive/PLAN.md**

Remove this milestone\'s `[planned]` / `[in-progress]` block from `docs/PLAN.md` (the entries you added in Task 11 about *follow-ups* stay; only the entry about *this plan* is removed).

Append a one-paragraph entry to `docs/plans/archive/PLAN.md` matching the existing format:
```markdown
### GEDCOM Round-Trip Fidelity Audit & Guard
Codified GEDCOM round-trip fidelity as a Prime Directive. Built `src/api/gedcom_fidelity_registry.ts` declaring round-trip status for every schema column under both 5.5.1 and 7.0; added schema-coverage, per-field, and golden-DB-seed tests that fail CI when a new column is added without a registry entry. Spec: `docs/plans/archive/2026-05-02-gedcom-roundtrip-fidelity-design.md`. Plan: `docs/plans/archive/2026-05-02-gedcom-roundtrip-fidelity.md`.
```

Verify `docs/PLAN.md` contains zero `[done]` entries:
```bash
grep -c "\[done\]" docs/PLAN.md
```
Expected: `0`.

- [ ] **Step 5: Commit close-out**

```bash
git add docs/plans/archive/2026-05-02-gedcom-roundtrip-fidelity.md \\
        docs/plans/archive/2026-05-02-gedcom-roundtrip-fidelity-design.md \\
        package.json CHANGELOG.md docs/PLAN.md docs/plans/archive/PLAN.md
git commit -m "chore: archive completed gedcom-roundtrip-fidelity"
```

- [ ] **Step 6: Hand off to `superpowers:finishing-a-development-branch`**

Per CLAUDE.md workflow, invoke the finishing skill to merge → main, delete the branch, remove the worktree.
