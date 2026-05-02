# Events Fact-Value Round-Trip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use `subagent-handoff` skill for dispatch templates.

**Design spec:** [`2026-05-02-events-fact-value-design.md`](./2026-05-02-events-fact-value-design.md) (sibling). Read it first — this plan assumes the design is settled.

**Goal:** Implement GEDCOM 5.5.1 round-trip fidelity for fact-shaped events (occupation, education, religion, title, etc.) by separating GEDCOM-X `Fact.value` from `Fact.notes`. Schema gains a `value` column, `description` is renamed to `notes`, and the importer/exporter symmetry is restored.

**Architecture:** Schema migration (idempotent), shared `events_gedcom.ts` module for tag mapping, modal Prime-Directive-safe save handler, round-trip golden test as the merge gate.

**Tech Stack:** TypeScript, node-sqlite3-wasm, Vue 3, Vitest.

---

## Pre-flight

- [ ] **Verify worktree** — work happens in a worktree off `main`. Skip if already in one.
  ```bash
  git worktree add .worktrees/events-fact-value -b events-fact-value
  cd .worktrees/events-fact-value
  ```

- [ ] **Read the design spec** end-to-end. Internalize the Prime Directive callouts in §Failure Modes.

- [ ] **Verify clean baseline:**
  ```bash
  npm run lint
  npx vitest run --reporter=dot 2>&1 | tail -5
  ```
  Both should pass cleanly. If not, fix or rebase before starting.

---

## Task 1: Shared GEDCOM tag module

**Why first:** Importer, exporter, and renderer all need the same fact-value detection. Single source of truth before any change that consumes it.

**Files:**
- Create: `src/api/events_gedcom.ts`
- Test: `tests/unit/events-gedcom.test.ts`

- [ ] **Step 1: Write the failing test** at `tests/unit/events-gedcom.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  EVENT_TYPE_TO_GEDCOM_TAG,
  FACT_VALUE_GEDCOM_TAGS,
  eventTypeHasFactValue,
  valueFieldI18nKey,
} from '../../src/api/events_gedcom';

describe('events_gedcom', () => {
  it('maps occupation event_type to OCCU tag', () => {
    expect(EVENT_TYPE_TO_GEDCOM_TAG.occupation).toBe('OCCU');
  });

  it('OCCU is a fact-value tag', () => {
    expect(FACT_VALUE_GEDCOM_TAGS.has('OCCU')).toBe(true);
  });

  it('BIRT is not a fact-value tag', () => {
    expect(FACT_VALUE_GEDCOM_TAGS.has('BIRT')).toBe(false);
  });

  it('eventTypeHasFactValue: occupation -> true', () => {
    expect(eventTypeHasFactValue('occupation')).toBe(true);
  });

  it('eventTypeHasFactValue: birth -> false', () => {
    expect(eventTypeHasFactValue('birth')).toBe(false);
  });

  it('eventTypeHasFactValue: unknown -> false', () => {
    expect(eventTypeHasFactValue('not_a_real_type')).toBe(false);
  });

  it('valueFieldI18nKey: occupation -> events.value.occupation', () => {
    expect(valueFieldI18nKey('occupation')).toBe('events.value.occupation');
  });

  it('valueFieldI18nKey: education -> events.value.education', () => {
    expect(valueFieldI18nKey('education')).toBe('events.value.education');
  });

  it('valueFieldI18nKey: birth -> events.value.event (fallback)', () => {
    expect(valueFieldI18nKey('birth')).toBe('events.value.event');
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run tests/unit/events-gedcom.test.ts
```
Expected: fails with module-not-found.

- [ ] **Step 3: Create `src/api/events_gedcom.ts`:**

```typescript
// GEDCOM 5.5.1 / 7.0 tag <-> event_type bidirectional map.
// Source of truth for both round-trip and renderer-side fact-shape detection.
// Pure TypeScript, no Electron dependencies — safe for src/api/.

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

// GEDCOM tags whose line value is meaningful per the GEDCOM 5.5.1 spec.
// These map to GEDCOM-X "Fact.value" — the primary value of the fact.
// Events whose tag is NOT in this set should not have a non-empty line value.
export const FACT_VALUE_GEDCOM_TAGS = new Set<string>([
  'OCCU', 'RELI', 'EDUC', 'TITL', 'PROP', 'NATI',
  'NCHI', 'NMR', 'SSN', 'IDNO', 'CAST', 'DSCR',
  'FACT', 'EVEN',
]);

export function eventTypeHasFactValue(eventType: string): boolean {
  const tag = EVENT_TYPE_TO_GEDCOM_TAG[eventType];
  return tag ? FACT_VALUE_GEDCOM_TAGS.has(tag) : false;
}

// Returns the i18n key to use as the label of the value field for a given event type.
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
    default:     return 'events.value.event';
  }
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run tests/unit/events-gedcom.test.ts
```
Expected: 9 passing.

- [ ] **Step 5: Commit**

```bash
git add src/api/events_gedcom.ts tests/unit/events-gedcom.test.ts
git commit -m "feat(api): shared GEDCOM tag map for fact-value detection"
```

---

## Task 2: Schema migration + types + API (atomic commit)

**Why atomic:** the column rename `description → notes` breaks every reader and writer in the codebase. Schema, type, and api/events.ts must land in one commit or `npm test` is broken between them.

**Files:**
- Modify: `src/api/schema.ts` — add migration block at end
- Modify: `src/api/types.ts:59-73` — `GenealogyEvent`
- Modify: `src/api/events.ts` — `createEvent`, `updateEvent`, all readers
- Modify: every other `src/api/*.ts` reading `events.description` (audit grep below)

- [ ] **Step 1: Audit existing references**

```bash
grep -rn "\.description\b" src/api/ src/main/ src/preload/ src/mcp/ src/import/ src/gedcom/ src/static/ src/renderer/ \
  | grep -i "event" | head -50
```

Make a list of every file that touches `event.description` or `events.description`. Expect ~20 files. Save the list to a scratch note — every file in the list gets its rename in this task or a later task that explicitly flags it.

- [ ] **Step 2: Update `src/api/schema.ts`** — append a new migration block AFTER the existing `v0.162.6` block at the end of `initializeSchema()`:

```typescript
  // v0.203.0 events: add `value` column (GEDCOM-X Fact.value / GEDCOM 5.5.1 line value)
  // and rename `description` -> `notes` so the column name reflects what it always
  // semantically held (free-form notes), now distinct from the fact's primary value.
  // See docs/plans/archive/2026-05-02-events-fact-value-design.md
  const eventColsV203 = queryAll<{ name: string }>(db, 'PRAGMA table_info(events)').map(c => c.name);
  if (!eventColsV203.includes('value')) {
    runSql(db, 'ALTER TABLE events ADD COLUMN value TEXT');
  }
  if (eventColsV203.includes('description') && !eventColsV203.includes('notes')) {
    runSql(db, 'ALTER TABLE events RENAME COLUMN description TO notes');
  }
```

Also update the CREATE TABLE statement (around line 75) so fresh DBs match: rename the `description` column to `notes` (keep TEXT NOT NULL DEFAULT '' for backward compatibility — null-vs-empty handling is downstream) and add a new `value TEXT` column:

```typescript
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      date_type TEXT NOT NULL DEFAULT 'unknown' CHECK(date_type IN ('exact', 'about', 'before', 'after', 'between', 'calculated', 'unknown')),
      date_value TEXT,
      date_value_end TEXT,
      date_original TEXT NOT NULL DEFAULT '',
      place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
      value TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
```

- [ ] **Step 3: Update `src/api/types.ts:59-73`** — `GenealogyEvent`:

```typescript
export interface GenealogyEvent {
  id: string;
  event_type: string;
  date_type: 'exact' | 'about' | 'before' | 'after' | 'between' | 'calculated' | 'unknown';
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  place_address: string | null;
  cause: string | null;
  value: string | null;
  notes: string;
  relationship_id: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Update `src/api/events.ts:6-37`** — `createEvent`:

```typescript
export function createEvent(
  db: Database,
  data: {
    event_type: string;
    relationship_id?: string | null;
    date_type?: GenealogyEvent['date_type'];
    date_value?: string | null;
    date_value_end?: string | null;
    date_original?: string;
    place_id?: string | null;
    cause?: string | null;
    value?: string | null;
    notes?: string;
  }
): GenealogyEvent {
  const id = uuid();
  runSql(db, `
    INSERT INTO events (id, event_type, relationship_id, date_type, date_value, date_value_end, date_original, place_id, cause, value, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    data.event_type,
    data.relationship_id ?? null,
    data.date_type ?? 'unknown',
    data.date_value ?? null,
    data.date_value_end ?? null,
    data.date_original ?? '',
    data.place_id ?? null,
    data.cause ?? null,
    data.value ?? null,
    data.notes ?? ''
  ]);
  return getEvent(db, id)!;
}
```

Note: `value` is nullable (`string | null`), `notes` retains the empty-string default to match the column's `NOT NULL DEFAULT ''`. Migrating notes to nullable is a deferred change not covered by this plan — see design spec scope deviations.

- [ ] **Step 5: Update every other `src/api/*.ts`** that references `events.description`:

```bash
grep -ln "\.description" src/api/ | xargs grep -l "event\|EVENT"
```

For each file, replace `description` with `notes` **in event contexts only**. **Do NOT rename `gazetteers.description`** — that's a separate column on a different table and stays as-is. Common files:
- `src/api/report_data.ts` — timeline rendering
- `src/api/csv_export.ts` (Task 9 will revisit)
- `src/api/archive_export.ts` / `archive_import.ts` (Task 6 will revisit)
- `src/api/html_site/*.ts` (Task 10 will revisit)

For this task, a search-and-replace is OK: every `event.description` and `events.description` becomes `event.notes` / `events.notes`. Add `value` field where the consumer needs it (most don't yet — that's later tasks).

- [ ] **Step 6: Run unit tests, fix until green**

```bash
npx vitest run --reporter=dot
```

Expected failures will come from `tests/unit/events.test.ts` (Task 3) and any other test asserting against `description`. For now, fix only the production code; tests are next task.

- [ ] **Step 7: Run TypeScript check**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | tail -20
```

Fix every error. Common fixes: rename `.description` to `.notes` on `GenealogyEvent` consumers in `src/main/`, `src/preload/`, `src/mcp/`. Renderer code is updated in later tasks but `tsc --noEmit` will flag it now — fix the ones that reference `events.description` from a `GenealogyEvent` type.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(events): split fact value from notes (schema + types + api)

- ALTER TABLE events ADD COLUMN value TEXT
- RENAME COLUMN description TO notes (semantic clarity)
- GenealogyEvent.value: string | null
- createEvent/updateEvent accept both fields
- Migration is idempotent and preserves all authored data"
```

---

## Task 3: Update existing events tests

**Files:**
- Modify: `tests/unit/events.test.ts`
- Modify: any other test referencing `events.description` (audit below)

- [ ] **Step 1: Audit test references**

```bash
grep -ln "description" tests/ | xargs grep -l "event\|createEvent"
```

- [ ] **Step 2: Update `tests/unit/events.test.ts`** — replace every `description:` field in `createEvent` calls with `notes:`. Also add a test for the new `value` field:

```typescript
it('creates an occupation event with fact value', () => {
  const event = createEvent(db, {
    event_type: 'occupation',
    date_value: '1885',
    value: 'Carpenter',
    notes: 'Worked at the Stockholm shipyard',
  });
  const fetched = getEvent(db, event.id);
  expect(fetched).not.toBeNull();
  expect(fetched!.value).toBe('Carpenter');
  expect(fetched!.notes).toBe('Worked at the Stockholm shipyard');
});

it('value defaults to null when omitted', () => {
  const event = createEvent(db, { event_type: 'birth', date_value: '1800-01-01' });
  expect(event.value).toBeNull();
});

it('updateEvent can set and clear value', () => {
  const event = createEvent(db, { event_type: 'occupation', value: 'Smith' });
  updateEvent(db, event.id, { value: 'Master Smith' });
  expect(getEvent(db, event.id)!.value).toBe('Master Smith');
  updateEvent(db, event.id, { value: null });
  expect(getEvent(db, event.id)!.value).toBeNull();
});
```

- [ ] **Step 3: Update other affected tests** — apply the same `description → notes` rename. Run after each file:

```bash
npx vitest run tests/unit/events.test.ts
```

- [ ] **Step 4: Verify migration on a fixture DB** — write `tests/unit/events-migration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import { initializeSchema } from '../../src/api/schema';
import { runSql, queryAll } from '../../src/api/db';

describe('events migration v0.203.0', () => {
  it('preserves description content as notes after migration', () => {
    const db = new Database(':memory:');
    // Build a pre-migration schema manually
    runSql(db, `
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        date_type TEXT NOT NULL DEFAULT 'unknown',
        date_value TEXT,
        date_value_end TEXT,
        date_original TEXT NOT NULL DEFAULT '',
        place_id TEXT,
        description TEXT NOT NULL DEFAULT '',
        cause TEXT,
        place_address TEXT,
        relationship_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    runSql(db, "INSERT INTO events (id, event_type, description, cause) VALUES ('e1', 'death', 'He died peacefully.', 'old age')");
    runSql(db, "INSERT INTO events (id, event_type, description) VALUES ('e2', 'occupation', 'Carpenter — apprenticed at 14')");

    // Run the full schema initialization (which includes the migration block)
    initializeSchema(db);

    const rows = queryAll<{ id: string; notes: string; value: string | null; cause: string | null }>(
      db, 'SELECT id, notes, value, cause FROM events ORDER BY id', []
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'e1', notes: 'He died peacefully.', value: null, cause: 'old age' });
    expect(rows[1]).toMatchObject({ id: 'e2', notes: 'Carpenter — apprenticed at 14', value: null });
  });

  it('is idempotent (running twice does not error)', () => {
    const db = new Database(':memory:');
    initializeSchema(db);
    initializeSchema(db);  // second run must not throw
    const cols = queryAll<{ name: string }>(db, 'PRAGMA table_info(events)', []).map(c => c.name);
    expect(cols).toContain('value');
    expect(cols).toContain('notes');
    expect(cols).not.toContain('description');
  });
});
```

- [ ] **Step 5: Run full unit suite — must pass**

```bash
npx vitest run --reporter=dot
```

- [ ] **Step 6: Commit**

```bash
git add tests/unit/
git commit -m "test(events): cover value field and migration idempotency"
```

---

## Task 4: GEDCOM importer — read line value into `value`

**Files:**
- Modify: `src/import/gedcom/event-importer.ts:67-83`

- [ ] **Step 1: Update `event-importer.ts`** — read line value when the GEDCOM tag is in `FACT_VALUE_GEDCOM_TAGS`:

Replace the block at lines 67-83 with:

```typescript
import { FACT_VALUE_GEDCOM_TAGS, EVENT_TYPE_TO_GEDCOM_TAG } from '../../api/events_gedcom';
// ... existing imports

  const causeValue = getChild(evNode, 'CAUS')?.value ?? null;
  const typeValue = getChild(evNode, 'TYPE')?.value ?? '';
  const noteRaw = resolveNote(evNode, noteMap);

  // GEDCOM 5.5.1 line value: for fact-shaped tags (OCCU/RELI/EDUC/etc.) this
  // is the Fact.value (occupation name, religion, etc.). For other event tags
  // any non-empty line value is non-standard input — append to notes with a
  // warning rather than dropping silently (Prime Directive: never drop authored data).
  const gedcomTag = evNode.tag;
  const lineValue = evNode.value?.trim() || null;
  const isFactTag = FACT_VALUE_GEDCOM_TAGS.has(gedcomTag);
  const value = isFactTag ? lineValue : null;

  // Notes assembly:
  //  - For EVEN/FACT, the TYPE sub-tag is consumed as event_type routing input
  //    upstream — do NOT prepend it to notes there.
  //  - For other tags where TYPE was emitted (rare), preserve it in notes so
  //    users can see what the source GEDCOM intended.
  //  - For non-fact tags with a stray line value, append it to notes.
  const noteParts: string[] = [];
  if (typeValue && gedcomTag !== 'EVEN' && gedcomTag !== 'FACT') {
    noteParts.push(`TYPE: ${typeValue}`);
  }
  if (noteRaw) noteParts.push(noteRaw);
  if (!isFactTag && lineValue) {
    noteParts.push(`[unmapped line value: ${lineValue}]`);
  }
  const notes = noteParts.join('\n\n') || '';

  const event = createEvent(db, {
    event_type: appType,
    date_type: parsed.date_type,
    date_value: parsed.date_value,
    date_value_end: parsed.date_value_end,
    date_original: parsed.date_original,
    place_id: place?.id ?? null,
    relationship_id: opts.relationship_id ?? null,
    cause: causeValue,
    value,
    notes,
  });
```

Note: `evNode.tag` is the raw GEDCOM tag (`OCCU`, `BIRT`, etc.) — the importer already has it. `appType` is the mapped internal `event_type`. We use `evNode.tag` (raw) for fact-tag detection because it's the spec-driven decision; `appType` is for our DB.

- [ ] **Step 2: Run existing import tests**

```bash
npx vitest run tests/unit/gedcom-import.test.ts tests/unit/import-occu.test.ts 2>/dev/null
```

Some may fail — check whether the fixture had `1 OCCU Carpenter` style data. If yes, the test expectation needs updating in Task 5 (add round-trip test) which is the place to assert the new behavior.

- [ ] **Step 3: Commit**

```bash
git add src/import/gedcom/event-importer.ts
git commit -m "fix(gedcom-import): preserve fact-value line value (OCCU/RELI/EDUC/etc.)

The importer was silently dropping the line value of fact-shaped events,
losing the occupation name and similar primary-value strings. Now the line
value is read into events.value when the GEDCOM tag is a fact-shaped tag
per the spec. For non-fact tags with a stray value (non-standard input),
append it to notes with a marker rather than dropping silently.

Prime Directive: no authored data is dropped on import."
```

---

## Task 5: GEDCOM exporter — emit `value` as line value

**Files:**
- Modify: `src/gedcom/exporter.ts:277-290` (person-owned events) and `:430-442` (relationship-owned events)

- [ ] **Step 1: Update `exporter.ts`** — both event-emit locations.

At line 277-290 (search for `const tag = EVENT_TYPE_TO_TAG[ev.event_type] ?? 'EVEN';` first occurrence):

```typescript
      const tag = EVENT_TYPE_TO_TAG[ev.event_type] ?? 'EVEN';
      const lineValue = ev.value ? ` ${ev.value.replace(/\r?\n.*/s, '')}` : '';  // first line only; CONT below
      lines.push(`1 ${tag}${lineValue}`);
      emitDate(lines, ev.date_type, ev.date_value, ev.date_value_end, ev.date_original, 2, version);
      lines.push(`2 _EVID ${ev.id}`);
      if (ev.place_id) {
        const place = getPlace(db, ev.place_id);
        if (place) {
          lines.push(`2 PLAC ${place.name}`);
          emitPlaceSubTags(lines, place, 3);
        }
      }
      // Multi-line value continuation: any newlines in ev.value beyond the first
      // line emit as `2 CONT <rest>` per GEDCOM 5.5.1.
      if (ev.value && ev.value.includes('\n')) {
        const continuationLines = ev.value.split(/\r?\n/).slice(1);
        for (const cont of continuationLines) lines.push(`2 CONT ${cont}`);
      }
      if (includeNotes && ev.notes) lines.push(`2 NOTE ${ev.notes}`);
      if (ev.cause) lines.push(`2 CAUS ${ev.cause}`);
```

Apply the same change at the second location (around line 430-442) — the relationship-owned-events code path.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep exporter
```
Expected: 0 errors.

- [ ] **Step 3: Run existing GEDCOM export tests**

```bash
npx vitest run tests/unit/gedcom-export-70.test.ts tests/unit/gedcom-export-subm.test.ts tests/unit/export-gedcom-reporting.test.ts
```

Some tests likely break because they assert against the old `1 OCCU\n2 NOTE Carpenter` shape. Update each affected test to assert the new `1 OCCU Carpenter` shape — this is the expected behavior change.

- [ ] **Step 4: Commit**

```bash
git add src/gedcom/exporter.ts tests/unit/gedcom-export*.test.ts
git commit -m "fix(gedcom-export): emit fact value as line value

For OCCU/RELI/EDUC/TITL/etc., events.value is now emitted on the same
line as the tag (matching what GEDCOM 5.5.1 readers expect). NOTE
sub-tag continues to come from events.notes."
```

---

## Task 6: Round-trip golden test (the merge gate)

**Files:**
- Create: `tests/fixtures/gedcom/fact-value/occupation-with-notes.ged`
- Create: `tests/fixtures/gedcom/fact-value/mixed-facts.ged`
- Create: `tests/fixtures/gedcom/fact-value/death-with-cause-and-notes.ged`
- Create: `tests/unit/gedcom-roundtrip-fact-value.test.ts`

- [ ] **Step 1: Create fixture `occupation-with-notes.ged`:**

```
0 HEAD
1 SOUR ManualFixture
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Anders /Andersson/
1 SEX M
1 OCCU Carpenter
2 DATE 1885
2 PLAC Stockholm
2 NOTE Worked at the Stockholm shipyard
0 TRLR
```

- [ ] **Step 2: Create fixture `mixed-facts.ged`:**

```
0 HEAD
1 SOUR ManualFixture
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Eva /Eriksson/
1 SEX F
1 OCCU Schoolteacher
2 DATE 1900
1 EDUC Bachelor of Arts
2 DATE 1898
2 PLAC Uppsala
1 RELI Lutheran
1 TITL Doctor
1 DSCR Tall, dark hair
1 FACT Volunteer firefighter 1905-1920
2 TYPE Volunteer
1 EVEN Joined Masonic Lodge
2 TYPE Membership
2 DATE 1905
0 TRLR
```

- [ ] **Step 3: Create fixture `death-with-cause-and-notes.ged`:**

```
0 HEAD
1 SOUR ManualFixture
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Old /Person/
1 SEX M
1 DEAT
2 DATE 1902
2 PLAC Stockholm
2 CAUS Tuberculosis
2 NOTE Sick for many years
0 TRLR
```

- [ ] **Step 4: Create the round-trip test** at `tests/unit/gedcom-roundtrip-fact-value.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom/import-core';
import { exportGedcom } from '../../src/gedcom/exporter';
import { createTestDb } from './helpers';

const FIXTURES = join(__dirname, '..', 'fixtures', 'gedcom', 'fact-value');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

// Extract a normalized AST that ignores ordering of independent sub-tags
// and whitespace differences. The point of comparison is "same facts" not
// "byte-equal stream".
interface NormalizedFact {
  tag: string;
  lineValue: string;
  date?: string;
  place?: string;
  notes?: string;
  cause?: string;
  type?: string;
}

function normalizeFacts(gedcomText: string): NormalizedFact[] {
  const ast = parseGedcom(gedcomText);
  const facts: NormalizedFact[] = [];
  for (const root of ast) {
    if (root.tag !== 'INDI') continue;
    for (const child of root.children) {
      // Only fact-shaped or known event tags
      if (child.level !== 1) continue;
      if (['NAME', 'SEX', 'FAMC', 'FAMS', 'CHAN'].includes(child.tag)) continue;
      const fact: NormalizedFact = { tag: child.tag, lineValue: child.value || '' };
      for (const sub of child.children) {
        if (sub.tag === 'DATE') fact.date = sub.value;
        if (sub.tag === 'PLAC') fact.place = sub.value;
        if (sub.tag === 'NOTE') fact.notes = sub.value;
        if (sub.tag === 'CAUS') fact.cause = sub.value;
        if (sub.tag === 'TYPE') fact.type = sub.value;
      }
      facts.push(fact);
    }
  }
  return facts;
}

function roundTrip(gedcomText: string): string {
  const db = createTestDb();
  importGedcom(db, gedcomText);
  return exportGedcom(db, { version: '5.5.1' }).ged;
}

describe('GEDCOM fact-value round-trip', () => {
  it('preserves OCCU line value through import → export', () => {
    const original = loadFixture('occupation-with-notes.ged');
    const exported = roundTrip(original);

    const factsA = normalizeFacts(original);
    const factsB = normalizeFacts(exported);

    expect(factsB).toEqual(factsA);
  });

  it('preserves multiple fact-shaped events with mixed sub-tags', () => {
    const original = loadFixture('mixed-facts.ged');
    const exported = roundTrip(original);

    const factsA = normalizeFacts(original).sort((a, b) => a.tag.localeCompare(b.tag));
    const factsB = normalizeFacts(exported).sort((a, b) => a.tag.localeCompare(b.tag));

    expect(factsB).toEqual(factsA);
  });

  it('preserves DEAT with CAUS and NOTE (no fact value)', () => {
    const original = loadFixture('death-with-cause-and-notes.ged');
    const exported = roundTrip(original);

    const factsA = normalizeFacts(original);
    const factsB = normalizeFacts(exported);

    expect(factsB).toEqual(factsA);
  });

  it('triple-trip is idempotent (export, import, export same)', () => {
    const original = loadFixture('mixed-facts.ged');
    const onceExported = roundTrip(original);
    const twiceExported = roundTrip(onceExported);

    const factsB = normalizeFacts(onceExported).sort((a, b) => a.tag.localeCompare(b.tag));
    const factsC = normalizeFacts(twiceExported).sort((a, b) => a.tag.localeCompare(b.tag));

    expect(factsC).toEqual(factsB);
  });
});
```

- [ ] **Step 5: Run the round-trip test**

```bash
npx vitest run tests/unit/gedcom-roundtrip-fact-value.test.ts
```

If it fails: debug. The most likely cause is an importer or exporter edge case. Common: `evNode.value` having trailing whitespace, or the exporter splitting a single-line value on a `\n` that wasn't there.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/gedcom/fact-value/ tests/unit/gedcom-roundtrip-fact-value.test.ts
git commit -m "test(gedcom): round-trip golden test for fact-value events

Three fixtures + 4 tests verifying OCCU/EDUC/RELI/TITL/DSCR/FACT/EVEN
events preserve line value and notes through import → export → import.
The triple-trip variant guards against drift on subsequent re-exports."
```

---

## Task 7: MCP `record_event` and `update_event`

**Files:**
- Modify: `src/mcp/tools/prod/events.ts`
- Modify: `tests/unit/mcp-events.test.ts` (or wherever record_event is tested)

- [ ] **Step 1: Update `record_event` interface** in `src/mcp/tools/prod/events.ts:13-27`:

```typescript
export interface RecordEventArgs {
  event_type: string;
  person_id?: string;
  person_ids?: { id: string; role?: string }[];
  relationship_id?: string;
  date_value?: string;
  date_type?: string;
  date_original?: string;
  place?: string;
  source_title?: string;
  source_page?: string;
  confidence?: number;
  value?: string;
  notes?: string;
  /** @deprecated use `notes` */
  description?: string;
  cause?: string;
}
```

- [ ] **Step 2: Update `recordEventWorkflow` body (lines 34-96):**

```typescript
    // Backwards-compat: callers passing `description` get treated as `notes`.
    // Both routes preserve the data; the field name in the DB is `notes`.
    const notesValue = args.notes ?? args.description;

    const event = eventApi.createEvent(db, {
      event_type: args.event_type,
      relationship_id: args.relationship_id ?? null,
      date_original: args.date_original ?? args.date_value ?? '',
      date_type: args.date_type as GenealogyEvent['date_type'] | undefined,
      date_value: args.date_type ? args.date_value ?? null : null,
      place_id,
      value: args.value,
      notes: notesValue,
      cause: args.cause,
    });
```

- [ ] **Step 3: Update `record_event` Zod schema (lines 101-124):**

```typescript
  server.registerTool('record_event', {
    description: 'Record a life event for one or more persons, optionally with place and source citation in one step. For fact-shaped events (occupation, education, religion, title, etc.) pass the primary value via `value` (e.g. "Carpenter") and free-form notes via `notes`. The `description` field is deprecated; use `notes` instead.',
    inputSchema: {
      event_type: z.string().describe('Event type (e.g. birth, death, marriage, census, baptism, occupation)'),
      person_id: z.string().optional().describe('Primary participant person ID (use this for a single person)'),
      person_ids: z.array(z.object({
        id: z.string().describe('Person ID'),
        role: z.string().optional().describe('Role: primary, spouse, parent, child, witness, godparent, officiant, other'),
      })).optional().describe('Multiple participants with roles (use instead of person_id when multiple persons are involved)'),
      relationship_id: z.string().optional().describe('Relationship ID to attach event to'),
      date_value: z.string().optional().describe('Date value (ISO format for exact, otherwise free text)'),
      date_type: z.string().optional().describe('Date type: exact, about, before, after, between, calculated, unknown'),
      date_original: z.string().optional().describe('Original date text as it appears in the source'),
      place: z.string().optional().describe('Place name — creates or reuses an existing place'),
      source_title: z.string().optional().describe('Source document title; reuses existing source if title matches'),
      source_page: z.string().optional().describe('Page or reference within the source'),
      confidence: z.number().min(0).max(3).optional().describe('Source confidence: 0=Unreliable, 1=Questionable, 2=Secondary, 3=Primary'),
      value: z.string().optional().describe('Fact value — the primary value of fact-shaped events. For occupation: the occupation name (e.g. "Carpenter"). For religion: the denomination. For education: the degree. Empty for non-fact-shaped events (birth, death, marriage).'),
      notes: z.string().optional().describe('Free-form notes about the event'),
      description: z.string().optional().describe('DEPRECATED — use `notes`. Treated as notes if provided.'),
      cause: z.string().optional().describe('Cause (e.g. cause of death)'),
    },
  }, async (args) => {
    const result = recordEventWorkflow(getDb(), args as RecordEventArgs);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });
```

- [ ] **Step 4: Update `update_event` Zod schema and handler (lines 141-166):**

```typescript
  server.registerTool('update_event', {
    description: 'Update fields on an existing event. Place string is resolved to a place_id via findOrCreate. For fact-shaped events use `value`; the deprecated `description` field is treated as `notes` for backwards compatibility.',
    inputSchema: {
      id: z.string().describe('Event ID'),
      event_type: z.string().optional().describe('Event type'),
      date_value: z.string().optional().describe('Date value'),
      date_type: z.string().optional().describe('Date type: exact, about, before, after, between, calculated, unknown'),
      date_original: z.string().optional().describe('Original date text as it appears in the source'),
      place: z.string().optional().describe('Place name — resolved to place_id via findOrCreate'),
      value: z.string().optional().describe('Fact value (occupation name, etc.). Pass empty string to clear.'),
      notes: z.string().optional().describe('Free-form notes about the event'),
      description: z.string().optional().describe('DEPRECATED — use `notes`. Treated as notes if provided.'),
      cause: z.string().optional().describe('Cause (e.g. cause of death)'),
    },
  }, async (args) => {
    const db = getDb();
    const { id, place, description, ...rest } = args;

    const updates: Parameters<typeof eventApi.updateEvent>[2] = { ...rest };
    if (description !== undefined && updates.notes === undefined) {
      updates.notes = description;
    }

    if (place !== undefined) {
      const p = placeApi.findOrCreatePlace(db, place);
      updates.place_id = p.id;
    }

    const event = eventApi.updateEvent(db, id, updates);
    return { content: [{ type: 'text', text: event ? JSON.stringify(event, null, 2) : 'Event not found' }] };
  });
```

- [ ] **Step 5: Add a test** asserting fact-value flow through MCP. Locate the existing MCP test file (likely `tests/unit/mcp.test.ts`):

```typescript
it('record_event with fact value persists to value column', async () => {
  await call('create_person', { given_name: 'Anders', surname: 'Andersson', sex: 'M' });
  const persons = JSON.parse((await call('search_persons', { query: 'Anders' })).text);
  const personId = persons[0].id;

  const result = JSON.parse((await call('record_event', {
    event_type: 'occupation',
    person_id: personId,
    date_value: '1885',
    date_type: 'about',
    value: 'Carpenter',
    notes: 'Worked at the shipyard',
  })).text);

  expect(result.event.value).toBe('Carpenter');
  expect(result.event.notes).toBe('Worked at the shipyard');
});

it('record_event with deprecated description is mapped to notes', async () => {
  // ... setup person ...
  const result = JSON.parse((await call('record_event', {
    event_type: 'birth',
    person_id: personId,
    description: 'Born at home',
  })).text);

  expect(result.event.notes).toBe('Born at home');
  expect(result.event.value).toBeNull();
});
```

- [ ] **Step 6: Run MCP tests**

```bash
npx vitest run tests/unit/mcp.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/mcp/tools/prod/events.ts tests/unit/mcp.test.ts
git commit -m "feat(mcp): record_event/update_event accept value + notes

The deprecated `description` field is still accepted and routed to `notes`
for backwards compatibility with existing AI agents."
```

---

## Task 8: Archive (JSON) export/import

**Files:**
- Modify: `src/api/archive_export.ts`
- Modify: `src/api/archive_import.ts`
- Test: `tests/unit/archive-roundtrip.test.ts` (existing)

- [ ] **Step 1: Read** `archive_export.ts` and find the events serialization. The shape is JSON; rename `description` → `notes` and add `value`. Bump archive schema version (look for a version constant near the top of `archive_export.ts`).

- [ ] **Step 2: Update** `archive_import.ts` to read both old (`description`) and new (`notes` + `value`) shapes. For old archives, route `description` → `notes`, leave `value` as null.

- [ ] **Step 3: Update tests** — add an archive round-trip case asserting `value` survives.

- [ ] **Step 4: Commit**

```bash
git add src/api/archive_export.ts src/api/archive_import.ts tests/unit/archive-roundtrip.test.ts
git commit -m "feat(archive): events.value and renamed notes column"
```

---

## Task 9: Holger and Genney importers

**Files:**
- Modify: `src/import/holger/index.ts` (or wherever events are created)
- Modify: `src/import/genney/index.ts`

- [ ] **Step 1: Holger** — find where occupation strings are mapped onto events. Map them to `value`, not `notes`. Same for any other fact-shaped Holger field (religion, education).

- [ ] **Step 2: Genney** — same audit. Find the .gcc / .backup importers' event-creation paths.

- [ ] **Step 3: Run Holger and Genney tests**

```bash
npx vitest run tests/unit/holger.test.ts tests/unit/genney.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/import/holger/ src/import/genney/ tests/unit/holger.test.ts tests/unit/genney.test.ts
git commit -m "fix(holger,genney): import occupation/religion as fact value"
```

---

## Task 10: CSV export

**Files:**
- Modify: `src/api/csv_export.ts`
- Test: `tests/unit/csv-export.test.ts`

- [ ] **Step 1: Update CSV columns** — split `description` into `value` + `notes`. Update the events CSV header and row builder.

- [ ] **Step 2: Update test** — assert both columns exist with correct content.

- [ ] **Step 3: Commit**

```bash
git add src/api/csv_export.ts tests/unit/csv-export.test.ts
git commit -m "feat(csv-export): events.value and events.notes as separate columns"
```

---

## Task 11: HTML site export

**Files:**
- Modify: `src/api/html_site/*.ts` (whichever file renders event lists / fact lists)
- Test: `tests/unit/html-site-export.test.ts` (or equivalent)

- [ ] **Step 1: Audit** — `grep -n "description" src/api/html_site/`

- [ ] **Step 2: Update templates** to render `value` (bold) and `notes` (regular) per event. For fact-shaped events the value is the headline; for non-fact events only notes show.

- [ ] **Step 3: Run HTML site tests**

```bash
npx vitest run tests/unit/html-site-export.test.ts 2>/dev/null
```

- [ ] **Step 4: Commit**

```bash
git add src/api/html_site/ tests/unit/
git commit -m "feat(html-site): render events.value separately from notes"
```

---

## Task 12: i18n keys (sv.ts + en.ts)

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add `events.value.*`, `events.notes`, `events.factColumn`** in BOTH files. Keep the old `events.description` key (mark `// deprecated, removed in v0.205` in a comment) so any straggler lookups don't 500.

Swedish (`sv.ts`):
```typescript
// Inside the events block:
notes: 'Anteckningar',
factColumn: 'Uppgift',
description: 'Anteckningar',  // deprecated alias — remove in v0.205
value: {
  occupation: 'Yrke',
  education: 'Examen',
  religion: 'Trossamfund',
  title: 'Titel',
  description_dscr: 'Beskrivning',
  property: 'Egendom',
  nationality: 'Nationalitet',
  children_count: 'Antal barn',
  marriages_count: 'Antal äktenskap',
  ssn: 'Personnummer',
  id_number: 'Identifierare',
  caste: 'Kast',
  fact: 'Värde',
  event: 'Värde',
},
```

English (`en.ts`):
```typescript
// Inside the events block:
notes: 'Notes',
factColumn: 'Fact',
description: 'Notes',  // deprecated alias — remove in v0.205
value: {
  occupation: 'Occupation',
  education: 'Degree',
  religion: 'Religion',
  title: 'Title',
  description_dscr: 'Physical description',
  property: 'Property',
  nationality: 'Nationality',
  children_count: 'Number of children',
  marriages_count: 'Number of marriages',
  ssn: 'Social security number',
  id_number: 'ID number',
  caste: 'Caste',
  fact: 'Value',
  event: 'Value',
},
```

- [ ] **Step 2: Verify both files type-check**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep i18n
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "i18n: add events.value.* and events.notes keys"
```

---

## Task 13: EventModal — value field + Prime Directive guard

**Files:**
- Modify: `src/renderer/components/modals/EventModal.vue`
- Test: `tests/components/EventModal-fact-value.test.ts` (new)

- [ ] **Step 1: Write failing component test** at `tests/components/EventModal-fact-value.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import EventModal from '../../src/renderer/components/modals/EventModal.vue';

// Mock window.api minimally — events.create / events.update return the input.
beforeEach(() => {
  (window as any).api = {
    events: {
      create: vi.fn(async (input: any) => ({ ...input, id: 'new-id' })),
      update: vi.fn(async (id: string, input: any) => ({ ...input, id })),
    },
    places: { search: vi.fn(async () => []) },
    sources: { search: vi.fn(async () => []) },
    persons: { search: vi.fn(async () => []) },
  };
});

describe('EventModal — fact-value field', () => {
  it('shows value field for occupation event_type', async () => {
    const wrapper = mount(EventModal, {
      props: { mode: 'standalone', personId: 'p1' },
    });
    // Set event_type to occupation via the segmented control or dropdown
    await wrapper.find('[data-event-type="occupation"]').trigger('click').catch(() => { /* fallback if control name differs */ });
    expect(wrapper.find('[data-testid="event-value-field"]').exists()).toBe(true);
  });

  it('hides value field for marriage event_type', async () => {
    const wrapper = mount(EventModal, {
      props: { mode: 'standalone', personId: 'p1' },
    });
    await wrapper.find('[data-event-type="marriage"]').trigger('click').catch(() => {});
    expect(wrapper.find('[data-testid="event-value-field"]').exists()).toBe(false);
  });

  it('preserves value across event_type toggle (Prime Directive)', async () => {
    const wrapper = mount(EventModal, {
      props: {
        mode: 'standalone',
        personId: 'p1',
        editingEvent: { id: 'e1', event_type: 'occupation', value: 'Carpenter', notes: '...', date_type: 'unknown' } as any,
      },
    });
    // Switch type to marriage (hides field)
    await wrapper.find('[data-event-type="marriage"]').trigger('click').catch(() => {});
    // Switch back
    await wrapper.find('[data-event-type="occupation"]').trigger('click').catch(() => {});
    // Value should still be 'Carpenter' in the form state
    const valueInput = wrapper.find<HTMLInputElement>('[data-testid="event-value-field"] input');
    expect(valueInput.element.value).toBe('Carpenter');
  });

  it('save sends value AND notes regardless of UI visibility', async () => {
    const wrapper = mount(EventModal, {
      props: {
        mode: 'standalone',
        personId: 'p1',
        editingEvent: { id: 'e1', event_type: 'occupation', value: 'Carpenter', notes: 'Notes', date_type: 'unknown' } as any,
      },
    });
    await wrapper.find('[data-event-type="marriage"]').trigger('click').catch(() => {});
    await wrapper.find('[data-testid="save-btn"]').trigger('click');
    const updateCall = (window as any).api.events.update.mock.calls[0];
    expect(updateCall[1].value).toBe('Carpenter');  // Not nulled by type toggle
    expect(updateCall[1].notes).toBe('Notes');
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run tests/components/EventModal-fact-value.test.ts
```

- [ ] **Step 3: Update `EventModal.vue`** — three changes:

1. Add a `value` field to `form` state. Initialize from `editingEvent?.value ?? null`. NEVER null on type toggle.
2. Render the value `<input>` with `v-if="showFactValueField"` and a type-aware label using `valueFieldI18nKey(form.event_type)`.
3. Render a `notes` `<textarea>` always shown.
4. Save handler always sends `value: form.value || null` and `notes: form.notes || null` regardless of `showFactValueField`.

```vue
<!-- After existing fields, before the cause field, add: -->
<div v-if="showFactValueField" class="ep-field" data-testid="event-value-field">
  <span class="ep-field-label">{{ $t(valueLabelKey) }}</span>
  <input class="ep-input" v-model="form.value" :placeholder="$t('events.valuePlaceholder')" />
</div>

<!-- After existing fields (cause/spouse/etc.), always: -->
<div class="ep-field">
  <span class="ep-field-label">{{ $t('events.notes') }}</span>
  <textarea class="ep-input" v-model="form.notes" rows="3" />
</div>
```

In `<script setup>`:

```typescript
import { eventTypeHasFactValue, valueFieldI18nKey } from '../../api/events_gedcom';

// Add to form reactive object:
const form = reactive({
  // ... existing ...
  value: props.editingEvent?.value ?? null as string | null,
  notes: props.editingEvent?.notes ?? '',
});

// Derived flag — drives field visibility ONLY, never gates persistence.
const showFactValueField = computed(() => eventTypeHasFactValue(form.event_type));
const valueLabelKey = computed(() => valueFieldI18nKey(form.event_type));

// In handleSave (or equivalent), the payload ALWAYS includes both:
//   value: form.value || null,
//   notes: form.notes || null,
// regardless of showFactValueField. This is the Prime Directive guard.
```

For the `data-event-type` attributes on the segmented control, find the existing buttons and add `:data-event-type="et"` so the test selectors work. Also add `data-testid="save-btn"` on the BaseSubPanel save button (or update test selector to match what's already there).

- [ ] **Step 4: Run component test, verify pass**

```bash
npx vitest run tests/components/EventModal-fact-value.test.ts
```

- [ ] **Step 5: Manual smoke check**

```bash
npm start
# In the app: open a person, add an occupation event, fill value="Carpenter",
# notes="Worked at shipyard", save. Re-open. Verify both fields populated.
# Switch type to marriage. Save. Re-open. Switch back to occupation.
# Verify value="Carpenter" still present (Prime Directive proof).
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/modals/EventModal.vue tests/components/EventModal-fact-value.test.ts
git commit -m "feat(EventModal): show value field for fact-shaped events

Type-aware label per GEDCOM tag (Yrke for OCCU, Examen for EDUC, etc.).
Notes textarea now always shown — replaces the missing description field
that previously made authored notes invisible to users.

Prime Directive guard: switching event type does not null the value or
notes form state. Save handler always sends both fields regardless of
the value field's UI visibility."
```

---

## Task 14: EventList rendering — show value + notes

**Files:**
- Modify: `src/renderer/components/EventList.vue`

- [ ] **Step 1: Update `EventRow` interface** at line 93-106:

```typescript
interface EventRow {
  id: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  place_name: string | null;
  value: string | null;
  notes: string;
  cause: string | null;
  citation_count: number;
  participant_names?: string;
}
```

- [ ] **Step 2: Update the description column** at lines 15 and 37:

```vue
<!-- Header (line 15): -->
<th>{{ $t('events.factColumn') }}</th>

<!-- Cell (line 37): -->
<td class="td-fact">
  <div v-if="event.value" class="fact-value">{{ event.value }}</div>
  <div v-if="event.notes" class="fact-notes" :class="{ 'has-value': !!event.value }">{{ event.notes }}</div>
  <span v-if="event.cause" class="event-cause"> ({{ $t('events.cause') }}: {{ event.cause }})</span>
</td>
```

- [ ] **Step 3: Add styles to the `<style scoped>` block:**

```css
.td-fact { max-width: 280px; }
.fact-value { font-weight: var(--font-weight-medium); color: var(--text-primary); }
.fact-notes {
  color: var(--text-secondary);
  font-size: var(--font-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fact-notes.has-value { margin-top: 2px; }
```

- [ ] **Step 4: Manual smoke check** — open the events list on a person with mixed events; verify occupation rows show "Carpenter" bold + notes muted underneath; death rows show notes + cause inline; birth rows with empty notes look clean (no extra whitespace).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/EventList.vue
git commit -m "feat(EventList): render fact value bold over muted notes line"
```

---

## Task 15: Documentation

**Files:**
- Modify: `docs/DATA_MODEL.md`
- Modify: `docs/IPC_REFERENCE.md`
- Modify: `docs/MCP.md`
- Modify: `docs/UX_INVENTORY.md`

- [ ] **Step 1: `docs/DATA_MODEL.md`** — find the events table section. Update column list to include `value TEXT` and rename `description → notes`. Add a paragraph explaining the GEDCOM-X mapping.

- [ ] **Step 2: `docs/IPC_REFERENCE.md`** — update `events.create`, `events.update`, `events.forPerson`, etc. signatures to show `value` and `notes`.

- [ ] **Step 3: `docs/MCP.md`** — update `record_event` and `update_event` tool docs. Mark `description` parameter as deprecated.

- [ ] **Step 4: `docs/UX_INVENTORY.md`** — update the EventModal entry's CTA grid to include the value field.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs: events.value and notes column rename"
```

---

## Task 16: Self-review checklist

Per `.claude/rules/plans.md` Rule A4:

- [ ] **All design-spec scope items implemented or explicitly deferred.** Re-read the design spec scope (14 numbered items + 6 deviations). Confirm every numbered item has a corresponding task above. Deviations are unchanged.
- [ ] **No silent data drops.** Search the diff for new `if (event_type === ...)` gates that null fields. Compare to the Prime Directive callouts — none should null `value` or `notes` based on UI mode.
- [ ] **Round-trip golden test passes.** `npx vitest run tests/unit/gedcom-roundtrip-fact-value.test.ts` — green.
- [ ] **Migration test passes.** `npx vitest run tests/unit/events-migration.test.ts` — green.
- [ ] **All EventModal-fact-value tests pass.** Including the type-toggle Prime Directive test.
- [ ] **`npm test` and `npm run lint` clean.** Zero failures, zero warnings.

---

## Task 17: Manual end-to-end smoke check

Per the design spec's Verification §2:

- [ ] Start the app with a fresh test DB: `SLAKTFORSKNING_DB=/tmp/fact-value-smoke.db npm start`
- [ ] Settings → Import → load `tests/fixtures/gedcom/fact-value/mixed-facts.ged`
- [ ] Open Eva Eriksson; expand Events
- [ ] Open the Occupation event
  - Expected: "Yrke" field shows "Schoolteacher"; Date 1900; Notes empty
- [ ] Edit value to "Senior Schoolteacher", add notes "Taught for 30 years", save
- [ ] Settings → Export → save as GEDCOM 5.5.1
- [ ] Open exported file in editor; find the OCCU line
  - Expected: `1 OCCU Senior Schoolteacher` (not `1 OCCU` with the value moved to NOTE)
  - Expected: `2 NOTE Taught for 30 years` follows
- [ ] Switch DB to a fresh one; import the exported GEDCOM
- [ ] Open Eva Eriksson again; verify the values match what was just exported
- [ ] In EventModal, switch event type from Occupation to Marriage
  - Expected: Yrke field disappears
- [ ] Save (without changing anything else); re-open; switch type back to Occupation
  - Expected: "Senior Schoolteacher" still in the value field (Prime Directive proof)

If all checks pass, the user goal is verified end-to-end.

---

## Task 18: Finishing the branch

Per `CLAUDE.md` "Finishing a plan" checklist:

- [ ] Mark every checkbox in this plan file as `[x]`.
- [ ] `git mv docs/plans/2026-05-02-events-fact-value-design.md docs/plans/archive/`
- [ ] `git mv docs/plans/2026-05-02-events-fact-value.md docs/plans/archive/`
- [ ] Bump `package.json` version: minor bump (this is a feature) → e.g. `0.202.0 → 0.203.0`.
- [ ] Add `## Unreleased` (or under existing) entry to `CHANGELOG.md`:
  ```markdown
  ### v0.203.0
  - **GEDCOM round-trip fidelity for fact-shaped events.** Occupation, education, religion, title, etc. now preserve the line value through import/export. Added a dedicated value field to EventModal with a type-aware label (Yrke / Examen / Trossamfund / etc.). The events table column `description` is renamed to `notes`.
  ```
- [ ] Update `docs/PLAN.md` — remove this plan from the active milestones list (if present).
- [ ] Append entry to `docs/plans/archive/PLAN.md` matching existing format.
- [ ] Commit: `chore: archive completed events-fact-value plan + bump v0.203.0`
- [ ] Use `superpowers:finishing-a-development-branch` (Option 1 — merge to main): merge worktree to main, delete branch, remove worktree.

---

## Failure modes / RCA reference

This plan addresses two known failure classes (per the design spec §Failure Modes):

1. **Silent line-value drop on import** — `event-importer.ts:67-83` was reading PLAC, DATE, CAUS, TYPE sub-tags but never the parent event node's line value. Task 4's importer change + Task 6's round-trip test are the regression guard.

2. **Modal save dropping authored data on UI mode change** — Task 13 explicitly tests that switching event_type from OCCU to MARR does NOT null the form's `value` or `notes`, and that save sends both regardless of which fields are visible. CLAUDE.md flags this anti-pattern by name.
