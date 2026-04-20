# GEDCOM Import Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five data-loss gaps in the GEDCOM importer: REPO records, Genney `_GRP` groups, Genney `_TODO` research tasks, SUBM → default person, and EVEN TYPE verification.

**Architecture:** All import logic is added as new phases inside `doImportGedcom` in `src/import/gedcom/import-core.ts`, consistent with the existing phase pattern. Per-database settings (default person) live in a new `db_settings` SQLite table accessed via `src/api/db_settings.ts`. The renderer reads `default_person_id` on startup via a new IPC channel and navigates to that person detail page.

**Tech Stack:** TypeScript, node-sqlite3-wasm, Vue 3 Composition API, Electron IPC, Vitest

**Spec:** `docs/plans/2026-04-07-gedcom-import-gap-closure-design.md`

**Parallelism:** Must run after Holger Import (`2026-04-06-holger-import.md`) — both modify `src/import/gedcom/import-core.ts`.
Can run in parallel with Test Coverage Tasks 1, 2, 3, 5 (`2026-04-07-import-export-test-coverage.md`).
Test Coverage Task 4 must run after this plan — both append to `tests/unit/import-gedcom-reporting.test.ts`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/api/schema.ts` | Modify | Add `db_settings` table to schema |
| `src/api/db_settings.ts` | Create | `getDbSetting`, `setDbSetting`, `deleteDbSetting` |
| `src/import/gedcom/import-core.ts` | Modify | Phases 0.7 (REPO), 0.8 (_GRP), 6 (_TODO); SUBM parsing; `ValidationReport` fields |
| `src/main/ipc.ts` | Modify | Add `db:getSetting` IPC handler |
| `src/preload/index.ts` | Modify | Expose `window.api.db.getSetting` |
| `src/renderer/App.vue` | Modify | Navigate to `default_person_id` on startup |
| `src/renderer/components/import/GedcomImportSection.vue` | Modify | Show repositories, groups, researchTasks counts in report |
| `src/renderer/i18n/en.ts` | Modify | New i18n keys |
| `src/renderer/i18n/sv.ts` | Modify | New i18n keys (Swedish) |
| `tests/unit/import-gedcom-reporting.test.ts` | Modify | Tests for REPO, _GRP, _TODO, SUBM, EVEN TYPE |
---

## Task 1: db_settings schema and API

**Files:**
- Modify: `src/api/schema.ts`
- Create: `src/api/db_settings.ts`
- Modify: `tests/unit/import-gedcom-reporting.test.ts`

- [ ] **Step 1: Add `db_settings` table to schema**

In `src/api/schema.ts`, inside the large `db.exec(...)` block, append after the `media_links` table indexes (before the closing backtick):

```sql
    CREATE TABLE IF NOT EXISTS db_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
```

- [ ] **Step 2: Create `src/api/db_settings.ts`**

```typescript
import type { Database } from 'node-sqlite3-wasm';

export function getDbSetting(db: Database, key: string): string | null {
  const stmt = db.prepare('SELECT value FROM db_settings WHERE key = ?');
  try {
    const row = stmt.get([key]) as { value: string } | undefined;
    return row?.value ?? null;
  } finally {
    (stmt as unknown as { finalize(): void }).finalize();
  }
}

export function setDbSetting(db: Database, key: string, value: string): void {
  const stmt = db.prepare('INSERT OR REPLACE INTO db_settings (key, value) VALUES (?, ?)');
  try {
    stmt.run([key, value]);
  } finally {
    (stmt as unknown as { finalize(): void }).finalize();
  }
}

export function deleteDbSetting(db: Database, key: string): void {
  const stmt = db.prepare('DELETE FROM db_settings WHERE key = ?');
  try {
    stmt.run([key]);
  } finally {
    (stmt as unknown as { finalize(): void }).finalize();
  }
}
```

- [ ] **Step 3: Write failing tests**

Add to `tests/unit/import-gedcom-reporting.test.ts` (add import at the top with other imports):

```typescript
import { getDbSetting, setDbSetting, deleteDbSetting } from '../../src/api/db_settings';
```

```typescript
describe('db_settings API', () => {
  it('returns null for missing key', () => {
    const db = createTestDb();
    expect(getDbSetting(db, 'nonexistent')).toBeNull();
  });

  it('stores and retrieves a value', () => {
    const db = createTestDb();
    setDbSetting(db, 'foo', 'bar');
    expect(getDbSetting(db, 'foo')).toBe('bar');
  });

  it('overwrites an existing value', () => {
    const db = createTestDb();
    setDbSetting(db, 'foo', 'first');
    setDbSetting(db, 'foo', 'second');
    expect(getDbSetting(db, 'foo')).toBe('second');
  });

  it('deletes a value', () => {
    const db = createTestDb();
    setDbSetting(db, 'foo', 'bar');
    deleteDbSetting(db, 'foo');
    expect(getDbSetting(db, 'foo')).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests (should pass after implementation)**

```bash
npm test -- --reporter=verbose tests/unit/import-gedcom-reporting.test.ts
```

Expected: all 4 db_settings tests pass, no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/api/schema.ts src/api/db_settings.ts tests/unit/import-gedcom-reporting.test.ts
git commit -m "feat(schema): add db_settings table + API for per-database key-value settings"
```

---

## Task 2: Import REPO records (Phase 0.7)

**Files:**
- Modify: `src/import/gedcom/import-core.ts`
- Modify: `tests/unit/import-gedcom-reporting.test.ts`

- [ ] **Step 1: Add imports at top of `import-core.ts`**

After the existing `import { createSource, createCitation } from '../../api/sources';` line, add:

```typescript
import { createRepository, linkSourceRepository } from '../../api/repositories';
import { createGroup, addGroupMember } from '../../api/groups';
import { createResearchTask } from '../../api/research_tasks';
import { setDbSetting } from '../../api/db_settings';
```

- [ ] **Step 2: Add Phase 0.7 — REPO records**

In `doImportGedcom`, after the Phase 0.5 (OBJE) block and before Phase 1 (SOUR), add:

```typescript
  // Phase 0.7: REPO records
  const repoMap = new Map<string, string>(); // xref -> app repository id
  for (const node of tree) {
    if (node.tag !== 'REPO' || !node.xref) continue;
    const addrNode = getChild(node, 'ADDR');
    const repo = createRepository(db, {
      name: getChild(node, 'NAME')?.value ?? '',
      address: addrNode ? (getChild(addrNode, 'ADR1')?.value ?? addrNode.value ?? undefined) : undefined,
      city: addrNode ? getChild(addrNode, 'CITY')?.value ?? undefined : undefined,
      postal_code: addrNode ? getChild(addrNode, 'POST')?.value ?? undefined : undefined,
      state: addrNode ? getChild(addrNode, 'STAE')?.value ?? undefined : undefined,
      country: addrNode ? getChild(addrNode, 'CTRY')?.value ?? undefined : undefined,
      phone: getChild(node, 'PHON')?.value ?? undefined,
      email: getChild(node, 'EMAIL')?.value ?? undefined,
      web: getChild(node, 'WWW')?.value ?? undefined,
      notes: resolveNote(node, noteMap) || undefined,
    });
    repoMap.set(node.xref, repo.id);
  }
```

- [ ] **Step 3: Update Phase 1 (SOUR) to link source to repo**

In Phase 1, after `sourceMap.set(node.xref, src.id);`, add:

```typescript
    // Link to repository when REPO sub-tag is an xref pointer
    const repoVal = getChild(node, 'REPO')?.value ?? '';
    if (repoVal.startsWith('@')) {
      const repoId = repoMap.get(repoVal);
      if (repoId) linkSourceRepository(db, src.id, repoId);
    }
```

- [ ] **Step 4: Update `doImportGedcom` return type and return statement**

Change the return type annotation of `doImportGedcom` to add `submitterNames`:

```typescript
): { skipped: { tag: string; count: number }[]; warnings: string[]; ldsCount: number; tranCount: number; noCount: number; assoDrop: number; submitterNames: string[] } {
```

Update the `return` at the bottom of `doImportGedcom` (placeholder; SUBM collection wired in Task 5):

```typescript
  return { skipped, warnings, ldsCount, tranCount, noCount, assoDrop, submitterNames: [] };
```

- [ ] **Step 5: Add `repositories`, `groups`, `researchTasks` to `ImportReport` and `importGedcom`**

In the `ImportReport` interface, add:

```typescript
  repositories: number;
  groups: number;
  researchTasks: number;
```

In `importGedcom`, add before-snapshots after the existing `citationsBefore` line:

```typescript
  const reposBefore         = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM repositories').n;
  const groupsBefore        = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM groups').n;
  const researchTasksBefore = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM research_tasks').n;
```

Add after-snapshots after `citationsAfter`:

```typescript
  const reposAfter         = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM repositories').n;
  const groupsAfter        = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM groups').n;
  const researchTasksAfter = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM research_tasks').n;
```

Remove the `if (rawCounts.repositories > 0)` block from `unmappedData`.

Add to the return statement:

```typescript
    repositories:  reposAfter         - reposBefore,
    groups:        groupsAfter        - groupsBefore,
    researchTasks: researchTasksAfter - researchTasksBefore,
```

Also update `let partial:` type annotation in `importGedcom` to match `doImportGedcom`'s new return.

- [ ] **Step 6: Write failing test for REPO**

Add to `tests/unit/import-gedcom-reporting.test.ts`:

```typescript
const REPO_GED = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @R1@ REPO
1 NAME Riksarkivet
1 ADDR Box 12541
2 CITY Stockholm
2 POST 10229
2 CTRY Sweden
1 EMAIL riksarkivet@riksarkivet.se
0 @S1@ SOUR
1 TITL Mantalslangder
1 REPO @R1@
0 TRLR
`.trim();

describe('GEDCOM import - REPO records', () => {
  it('imports REPO records as repositories', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(REPO_GED));
    expect(report.repositories).toBe(1);
  });

  it('links source to imported repository', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(REPO_GED));
    const stmt = db.prepare('SELECT r.name FROM repositories r JOIN source_repositories sr ON sr.repository_id = r.id JOIN sources s ON s.id = sr.source_id WHERE s.title = ?');
    const row = stmt.get(['Mantalslangder']) as { name: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(row?.name).toBe('Riksarkivet');
  });

  it('does not report REPO records in unmappedData', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(REPO_GED));
    expect(report.unmappedData.find(u => u.category.includes('REPO'))).toBeUndefined();
  });
});
```

- [ ] **Step 7: Run tests**

```bash
npm test -- --reporter=verbose tests/unit/import-gedcom-reporting.test.ts
```

Expected: all 3 REPO tests pass, no regressions.

- [ ] **Step 8: Commit**

```bash
git add src/import/gedcom/import-core.ts tests/unit/import-gedcom-reporting.test.ts
git commit -m "feat(import): import REPO records as repositories and link to sources (Phase 0.7)"
```

---

## Task 3: Import `_GRP` records (Phase 0.8, Genney only)

**Files:**
- Modify: `src/import/gedcom/import-core.ts`
- Modify: `tests/unit/import-gedcom-reporting.test.ts`

- [ ] **Step 1: Add Phase 0.8 — `_GRP` records**

In `doImportGedcom`, after Phase 0.7 (REPO) and before Phase 1 (SOUR), add:

```typescript
  // Phase 0.8: _GRP records (Genney only)
  const grpMap = new Map<string, string>(); // xref -> app group id
  if (isGenney) {
    for (const node of tree) {
      if (node.tag !== '_GRP' || !node.xref) continue;
      const group = createGroup(db, {
        name: getChild(node, 'NAME')?.value ?? '',
        notes: resolveNote(node, noteMap) || undefined,
      });
      grpMap.set(node.xref, group.id);
    }
  }
```

- [ ] **Step 2: Add `_GRP` to `KNOWN_INDI_TAGS`**

In `KNOWN_INDI_TAGS`, add `'_GRP'` to the set (after `'_MHAPLOGROUP'`):

```typescript
  '_UID', '_FSI', '_ANID', '_RAID', '_PNUMMER', '_YHAPLOGROUP', '_MHAPLOGROUP',
  '_GRP',
```

- [ ] **Step 3: Link group members in Phase 2**

In Phase 2, after the `// Collect ASSO blocks for post-processing (Phase 4)` block, add:

```typescript
    // Genney 4.1: _GRP -> group memberships
    if (isGenney) {
      for (const grpNode of getChildren(node, '_GRP')) {
        const groupId = grpMap.get(grpNode.value ?? '');
        if (groupId) {
          try { addGroupMember(db, groupId, person.id); } catch { /* ignore duplicate */ }
        }
      }
    }
```

- [ ] **Step 4: Write failing test**

Add to `tests/unit/import-gedcom-reporting.test.ts`:

```typescript
const GRP_GED = `
0 HEAD
1 SOUR Genney
0 @G1@ _GRP
1 NAME Bouppteckning - klar
1 NOTE Sokt och funnit bouppteckning
0 @G2@ _GRP
1 NAME Emigration
0 @I1@ INDI
1 NAME Lars /Eriksson/
1 _GRP @G1@
1 _GRP @G2@
0 @I2@ INDI
1 NAME Karin /Svensson/
1 _GRP @G1@
0 TRLR
`.trim();

describe('GEDCOM import - _GRP records (Genney)', () => {
  it('imports _GRP records as groups', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(GRP_GED), { profile: 'genney' });
    expect(report.groups).toBe(2);
  });

  it('creates group memberships from 1 _GRP links on INDI', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(GRP_GED), { profile: 'genney' });
    const stmt = db.prepare('SELECT COUNT(*) as n FROM group_members');
    const { n } = stmt.get([]) as { n: number };
    (stmt as unknown as { finalize(): void }).finalize();
    expect(n).toBe(3); // Lars in 2 groups, Karin in 1
  });

  it('does not import _GRP records without genney profile', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(GRP_GED));
    expect(report.groups).toBe(0);
  });
});
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --reporter=verbose tests/unit/import-gedcom-reporting.test.ts
```

Expected: all 3 _GRP tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/import/gedcom/import-core.ts tests/unit/import-gedcom-reporting.test.ts
git commit -m "feat(import): import Genney _GRP records as groups with memberships (Phase 0.8)"
```

---

## Task 4: Import `_TODO` records (Phase 6, Genney only)

**Files:**
- Modify: `src/import/gedcom/import-core.ts`
- Modify: `tests/unit/import-gedcom-reporting.test.ts`

- [ ] **Step 1: Add Phase 6 — `_TODO` records**

In `doImportGedcom`, after Phase 5 (`_PLAC`) and before the `return` statement, add:

```typescript
  // Phase 6: _TODO records (Genney only)
  if (isGenney) {
    for (const node of tree) {
      if (node.tag !== '_TODO') continue;
      const targXref = getChild(node, '_TARG')?.value ?? '';
      const person_id = personMap.get(targXref) ?? null;
      const statVal = getChild(node, '_STAT')?.value ?? '0';
      const status: 'open' | 'done' = statVal === '1' ? 'done' : 'open';
      const priority = parseInt(getChild(node, '_PRIO')?.value ?? '1', 10);
      const task = getChild(node, '_TASK')?.value ?? '';
      const notes = resolveNote(node, noteMap);
      createResearchTask(db, { task, notes: notes || undefined, person_id: person_id ?? undefined, priority, status });
    }
  }
```

- [ ] **Step 2: Write failing test**

Add to `tests/unit/import-gedcom-reporting.test.ts`:

```typescript
const TODO_GED = `
0 HEAD
1 SOUR Genney
0 @I1@ INDI
1 NAME Lars /Eriksson/
0 @I2@ INDI
1 NAME Karin /Svensson/
0 @Z1@ _TODO
1 _TARG @I1@
1 _PRIO 1
1 _STAT 0
1 _TASK Mantalslangder
1 NOTE Spara via mantalslangder
0 @Z2@ _TODO
1 _TARG @I2@
1 _PRIO 2
1 _STAT 1
1 _TASK Spara bakat
0 @Z3@ _TODO
1 _PRIO 0
1 _STAT 0
1 _TASK Generell uppgift utan person
0 TRLR
`.trim();

describe('GEDCOM import - _TODO records (Genney)', () => {
  it('imports _TODO records as research tasks', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(TODO_GED), { profile: 'genney' });
    expect(report.researchTasks).toBe(3);
  });

  it('maps _STAT 0 to open and _STAT 1 to done', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(TODO_GED), { profile: 'genney' });
    const stmt = db.prepare('SELECT status FROM research_tasks WHERE task = ?');
    const openRow = stmt.get(['Mantalslangder']) as { status: string } | undefined;
    const doneRow = stmt.get(['Spara bakat']) as { status: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(openRow?.status).toBe('open');
    expect(doneRow?.status).toBe('done');
  });

  it('links tasks to persons via _TARG', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(TODO_GED), { profile: 'genney' });
    const stmt = db.prepare('SELECT COUNT(*) as n FROM research_tasks WHERE person_id IS NOT NULL');
    const { n } = stmt.get([]) as { n: number };
    (stmt as unknown as { finalize(): void }).finalize();
    expect(n).toBe(2);
  });

  it('does not import _TODO records without genney profile', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(TODO_GED));
    expect(report.researchTasks).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --reporter=verbose tests/unit/import-gedcom-reporting.test.ts
```

Expected: all 4 _TODO tests pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/import/gedcom/import-core.ts tests/unit/import-gedcom-reporting.test.ts
git commit -m "feat(import): import Genney _TODO records as research tasks (Phase 6)"
```

---

## Task 5: SUBM -> default_person_id

**Files:**
- Modify: `src/import/gedcom/import-core.ts`
- Modify: `tests/unit/import-gedcom-reporting.test.ts`

- [ ] **Step 1: Collect SUBM names in `doImportGedcom`**

After Phase 6 (_TODO) and before the `return` statement, add:

```typescript
  // SUBM: collect submitter names for default-person matching
  const submitterNames: string[] = [];
  for (const node of tree) {
    if (node.tag !== 'SUBM') continue;
    const name = getChild(node, 'NAME')?.value;
    if (name) submitterNames.push(name.trim());
  }
```

Replace `submitterNames: []` in the return statement with `submitterNames`.

- [ ] **Step 2: Match submitter and store default_person_id in `importGedcom`**

Update `let partial:` type in `importGedcom` to include `submitterNames: string[]`.

After `runSql(db, 'PRAGMA shrink_memory')`, add:

```typescript
  // Match SUBM name to a person and store as default_person_id
  for (const rawName of partial.submitterNames) {
    const stmt = db.prepare(
      "SELECT person_id FROM person_names " +
      "WHERE lower(trim(coalesce(given_name,'') || ' ' || coalesce(surname,''))) = lower(?) LIMIT 2"
    );
    try {
      const rows = stmt.all([rawName.trim()]) as { person_id: string }[];
      if (rows.length === 1) {
        setDbSetting(db, 'default_person_id', rows[0].person_id);
        break;
      }
    } finally {
      (stmt as unknown as { finalize(): void }).finalize();
    }
  }
```

Remove the `if (rawCounts.submitters > 0)` block from `unmappedData`.

- [ ] **Step 3: Write failing tests**

Add to `tests/unit/import-gedcom-reporting.test.ts`:

```typescript
const SUBM_GED = `
0 HEAD
1 SOUR Genney
0 @1@ SUBM
1 NAME Lars Eriksson
0 @I1@ INDI
1 NAME Lars /Eriksson/
1 SEX M
0 @I2@ INDI
1 NAME Karin /Svensson/
1 SEX F
0 TRLR
`.trim();

const SUBM_AMBIGUOUS_GED = `
0 HEAD
0 @1@ SUBM
1 NAME Lars Eriksson
0 @I1@ INDI
1 NAME Lars /Eriksson/
0 @I2@ INDI
1 NAME Lars /Eriksson/
0 TRLR
`.trim();

describe('GEDCOM import - SUBM to default_person_id', () => {
  it('stores default_person_id when submitter name matches exactly one person', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(SUBM_GED));
    const defaultId = getDbSetting(db, 'default_person_id');
    expect(defaultId).not.toBeNull();
    const stmt = db.prepare('SELECT given_name FROM person_names WHERE person_id = ?');
    const row = stmt.get([defaultId!]) as { given_name: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(row?.given_name).toContain('Lars');
  });

  it('does not store default_person_id when name matches multiple persons', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(SUBM_AMBIGUOUS_GED));
    expect(getDbSetting(db, 'default_person_id')).toBeNull();
  });

  it('does not report SUBM in unmappedData', () => {
    const db = createTestDb();
    const report = importGedcom(db, parseGedcom(SUBM_GED));
    expect(report.unmappedData.find(u => u.category.includes('SUBM'))).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --reporter=verbose tests/unit/import-gedcom-reporting.test.ts
```

Expected: all 3 SUBM tests pass, no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/import/gedcom/import-core.ts tests/unit/import-gedcom-reporting.test.ts
git commit -m "feat(import): match SUBM submitter to person and store as default_person_id"
```

---

## Task 6: IPC handler and preload for `db.getSetting`

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add import in `ipc.ts`**

After `import * as checks from '../api/checks';`, add:

```typescript
import { getDbSetting } from '../api/db_settings';
```

- [ ] **Step 2: Register IPC handler**

Near the other `db:*` handlers (after `db:switchTo`), add:

```typescript
  wrapHandler('db:getSetting', (key) => getDbSetting(getDatabase(), key as string));
```

- [ ] **Step 3: Expose in preload**

In `src/preload/index.ts`, in the `db` object after `onSwitched`, add:

```typescript
    getSetting: (key: string) => ipcRenderer.invoke('db:getSetting', key),
```

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts
git commit -m "feat(ipc): expose db:getSetting for reading per-database settings from renderer"
```

---

## Task 7: Navigate to default person on startup

**Files:**
- Modify: `src/renderer/App.vue`

- [ ] **Step 1: Add `loadDefaultPerson` function**

In `src/renderer/App.vue`, in `<script setup>`, after `autoSetFocusPerson`, add:

```typescript
async function loadDefaultPerson() {
  if (!window.api?.db?.getSetting) return;
  try {
    const defaultId = await window.api.db.getSetting('default_person_id') as string | null;
    if (defaultId && router.currentRoute.value.path === '/') {
      router.push('/persons/' + defaultId);
    }
  } catch { /* ignore */ }
}
```

- [ ] **Step 2: Call in `onMounted`**

Add `loadDefaultPerson()` after `autoSetFocusPerson()` in the `onMounted` block.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.vue
git commit -m "feat(ui): navigate to default person from SUBM on app startup"
```

---

## Task 8: Update import report UI and i18n

**Files:**
- Modify: `src/renderer/components/import/GedcomImportSection.vue`
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`

- [ ] **Step 1: Update `GedcomImportSection.vue` report type**

Add `repositories: number; groups: number; researchTasks: number;` to the `importReport` ref type (after `citations: number`).

- [ ] **Step 2: Add counts to report modal template**

After the citations `<li>` in the `<ul class="report-counts">`, add:

```html
        <li v-if="importReport.repositories > 0">{{ $t('importExport.importReportRepositories', { n: importReport.repositories }) }}</li>
        <li v-if="importReport.groups > 0">{{ $t('importExport.importReportGroups', { n: importReport.groups }) }}</li>
        <li v-if="importReport.researchTasks > 0">{{ $t('importExport.importReportResearchTasks', { n: importReport.researchTasks }) }}</li>
```

Replace the existing rawCounts repositories `<li>` (which said "not imported"):

```html
          <li v-if="importReport.rawCounts.repositories > 0">{{ $t('importExport.importReportRawRepositories', { raw: importReport.rawCounts.repositories, imported: importReport.repositories }) }}</li>
```

- [ ] **Step 3: Add i18n keys to `en.ts`**

After `importReportCitations`:

```typescript
    importReportRepositories: '{n} repositories',
    importReportGroups: '{n} groups',
    importReportResearchTasks: '{n} research tasks',
```

Update existing key:

```typescript
    importReportRawRepositories: 'Repositories: {raw} (imported: {imported})',
```

- [ ] **Step 4: Add i18n keys to `sv.ts`**

After `importReportCitations`:

```typescript
    importReportRepositories: '{n} arkiv',
    importReportGroups: '{n} grupper',
    importReportResearchTasks: '{n} forskningsuppgifter',
```

Update existing key:

```typescript
    importReportRawRepositories: 'Arkiv: {raw} (importerade: {imported})',
```

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/import/GedcomImportSection.vue src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "feat(ui): show repositories, groups, and research tasks counts in GEDCOM import report"
```

---

## Task 9: EVEN TYPE verification test

**Files:**
- Modify: `tests/unit/import-gedcom-reporting.test.ts`

- [ ] **Step 1: Write the test**

Add to `tests/unit/import-gedcom-reporting.test.ts`:

```typescript
const EVEN_TYPE_GED = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Eva /Lindqvist/
1 EVEN
2 TYPE Efternamnsbyte
2 DATE 1986
0 TRLR
`.trim();

describe('GEDCOM import - EVEN TYPE preservation', () => {
  it('stores EVEN TYPE value in event description', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(EVEN_TYPE_GED));
    const stmt = db.prepare("SELECT description FROM events WHERE event_type = 'other'");
    const row = stmt.get([]) as { description: string } | undefined;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(row?.description).toBe('Efternamnsbyte');
  });

  it('maps EVEN to event_type other', () => {
    const db = createTestDb();
    importGedcom(db, parseGedcom(EVEN_TYPE_GED));
    const stmt = db.prepare("SELECT COUNT(*) as n FROM events WHERE event_type = 'other'");
    const { n } = stmt.get([]) as { n: number };
    (stmt as unknown as { finalize(): void }).finalize();
    expect(n).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --reporter=verbose tests/unit/import-gedcom-reporting.test.ts
```

Expected: both EVEN TYPE tests pass (no code change needed).

- [ ] **Step 3: Run full suite and commit**

```bash
npm test
git add tests/unit/import-gedcom-reporting.test.ts
git commit -m "test(import): verify EVEN TYPE sub-tag is preserved in event description"
```

---

## Self-Review

All 19 spec requirements are covered across the 9 tasks. Type consistency verified: `submitterNames` placeholder added Task 2, filled Task 5; `let partial:` updated in same task as return type change; `ImportReport` new fields added Task 2 and consumed in UI Task 8.
