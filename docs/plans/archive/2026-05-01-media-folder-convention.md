# Media Folder Convention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every import path copy referenced media into the per-database `<dbname>-media/` folder and rewrite `file_ref` values to be relative to the database directory, so databases are self-contained and portable.

**Architecture:**
- Centralise the convention in a single helper `getMediaDir(dbPath)` exported from `src/api/media.ts` (so api/ + main/ipc share one definition).
- Add `consolidateMediaFolder(db, dbPath)` in `src/api/media.ts` — a post-import sweep that walks all `media` rows, copies any absolute-path `file_ref` whose target file exists into `<dbname>-media/`, and rewrites the row to a relative ref. Idempotent.
- IPC handlers for GEDCOM, Holger, Genney, Archive imports call `consolidateMediaFolder` after a successful import. Genney `.backup` keeps its up-front bulk copy, but uses the helper for the destination path instead of the hardcoded `genney-media/` literal.
- Pure import logic (`src/import/...`) is unchanged in shape; it still writes whatever `file_ref` it computes. Consolidation runs once at the end on the main thread (where `dbPath` is known).
- Add `.claude/rules/media.md` documenting the convention, and reference it from the `gedcom` skill.

**Tech Stack:** TypeScript, Node `fs`, node-sqlite3-wasm, Vitest.

**Prime Directive note:** Consolidation rewrites `file_ref` from an absolute path to a relative one inside the per-DB media folder. This is a deterministic relocation of an authored value (the user explicitly imported the file), not an inference. The original ref is replaced because the original location is no longer authoritative for this database — the file now lives in `<dbname>-media/`.

---

## File Structure

**Created:**
- `src/api/media_consolidate.ts` — `consolidateMediaFolder(db, dbPath)` + small helpers. Pure function; no Electron imports.
- `tests/unit/media_consolidate.test.ts` — covers absolute→relative rewrite, idempotency, missing file handling, name conflicts, no-op cases.
- `.claude/rules/media.md` — convention reference.
- `docs/plans/2026-05-01-media-folder-convention.md` — this plan.

**Modified:**
- `src/api/media.ts` — re-export `getMediaDir(dbPath)` (currently only available as `mediaFolderName` on main thread).
- `src/main/ipc/media.ts` — `mediaFolderName` becomes a thin re-export of the api helper. Update call sites.
- `src/main/ipc/import.ts` — call `media.consolidateMediaFolder(...)` after each import; replace `genney-media` literal with `getMediaDir(dbPath)`.
- `tests/unit/import-holger.test.ts` — update existing assertion to expect the post-consolidate relative ref when copying is in scope (or keep the unit test scoped to the importer-only path).
- `.claude/skills/gedcom/SKILL.md` — short pointer to `.claude/rules/media.md`.

---

## Task 1: Centralised media dir helper

**Files:**
- Modify: `src/api/media.ts` (add export)
- Modify: `src/main/ipc/media.ts` (re-export, update call site)
- Test: `tests/unit/media.test.ts` (or new `tests/unit/media_helpers.test.ts`)

- [x] **Step 1: Read existing media helpers**

Run:
```bash
grep -n "mediaFolderName\|^export" src/main/ipc/media.ts src/api/media.ts | head -30
```

- [x] **Step 2: Write failing test**

Add to `tests/unit/media.test.ts` (or new file):

```typescript
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { getMediaDir, getMediaFolderName } from '../../src/api/media';

describe('media folder convention helpers', () => {
  it('derives folder name from db filename', () => {
    expect(getMediaFolderName('/abs/foo.db')).toBe('foo-media');
    expect(getMediaFolderName('/abs/My Tree.db')).toBe('My Tree-media');
    expect(getMediaFolderName('relative/bar.db')).toBe('bar-media');
  });

  it('returns absolute media dir alongside db', () => {
    expect(getMediaDir('/abs/foo.db')).toBe(path.join('/abs', 'foo-media'));
  });
});
```

- [x] **Step 3: Run test to confirm failure**

Run: `npx vitest run tests/unit/media.test.ts -t "media folder convention helpers"`
Expected: FAIL — `getMediaDir`/`getMediaFolderName` not exported from `src/api/media.ts`.

- [x] **Step 4: Implement helpers in `src/api/media.ts`**

Add at top of `src/api/media.ts` (after imports):

```typescript
import * as path from 'path';

/** Folder name convention: `foo.db` -> `foo-media`. Pure function of dbPath. */
export function getMediaFolderName(dbPath: string): string {
  const base = path.basename(dbPath, path.extname(dbPath));
  return `${base}-media`;
}

/** Absolute path to the per-database media folder, sibling to the .db file. */
export function getMediaDir(dbPath: string): string {
  return path.join(path.dirname(dbPath), getMediaFolderName(dbPath));
}
```

- [x] **Step 5: Re-export from `src/main/ipc/media.ts` and remove duplicate**

Replace the existing `mediaFolderName` definition in `src/main/ipc/media.ts` with:

```typescript
export { getMediaFolderName as mediaFolderName, getMediaDir } from '../../api/media';
```

(Keep the `mediaFolderName` alias for one release to avoid touching every caller — both names point at the same function.)

- [x] **Step 6: Run tests**

Run: `npx vitest run tests/unit/media.test.ts`
Expected: PASS.

- [x] **Step 7: Run lint + typecheck on touched files**

Run: `npm run lint -- src/api/media.ts src/main/ipc/media.ts tests/unit/media.test.ts`
Expected: 0 errors.

- [x] **Step 8: Commit**

```bash
git add src/api/media.ts src/main/ipc/media.ts tests/unit/media.test.ts
git commit -m "refactor(media): centralise getMediaDir/getMediaFolderName in api"
```

---

## Task 2: Fix Genney `.backup` to use `<dbname>-media/`

**Files:**
- Modify: `src/main/ipc/import.ts:187-208`
- Test: `tests/unit/ipc-import-genney-backup.test.ts` (new — only if a unit-testable seam exists; otherwise skip and rely on manual + integration verification)

- [x] **Step 1: Read current handler**

```bash
sed -n '187,210p' src/main/ipc/import.ts
```

- [x] **Step 2: Replace hardcoded `genney-media`**

Find:
```typescript
    const destMediaDir = isBackup
      ? path.join(path.dirname(getCurrentDatabasePath()), 'genney-media')
      : undefined;
```

Replace with:
```typescript
    const destMediaDir = isBackup
      ? media.getMediaDir(getCurrentDatabasePath())
      : undefined;
```

Add to imports at top of file:
```typescript
import * as media from '../../api/media';
```
(only if not already imported; prefer namespace import to keep call sites readable.)

- [x] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [x] **Step 4: Verify lint**

Run: `npm run lint -- src/main/ipc/import.ts`
Expected: 0 errors.

- [x] **Step 5: Commit**

```bash
git add src/main/ipc/import.ts
git commit -m "fix(import): genney .backup writes to <dbname>-media/ not genney-media"
```

---

## Task 3: `consolidateMediaFolder` API + tests (the core)

**Files:**
- Create: `src/api/media_consolidate.ts`
- Create: `tests/unit/media_consolidate.test.ts`

- [x] **Step 1: Write failing tests**

Create `tests/unit/media_consolidate.test.ts`:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from './helpers';
import { createMedia, getMedia } from '../../src/api/media';
import { consolidateMediaFolder } from '../../src/api/media_consolidate';

describe('consolidateMediaFolder', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-consol-'));
    dbPath = path.join(tmpDir, 'family.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('copies absolute-path file_ref into <dbname>-media/ and rewrites ref', () => {
    const db = createTestDb();
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    const srcFile = path.join(srcDir, 'photo.jpg');
    fs.writeFileSync(srcFile, 'JPEG-DATA');

    const m = createMedia(db, { file_ref: srcFile, title: 'photo' });
    const result = consolidateMediaFolder(db, dbPath);

    expect(result.copied).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.missing).toBe(0);

    const updated = getMedia(db, m.id);
    expect(updated?.file_ref).toBe(path.join('family-media', 'photo.jpg'));

    const destFile = path.join(tmpDir, 'family-media', 'photo.jpg');
    expect(fs.existsSync(destFile)).toBe(true);
    expect(fs.readFileSync(destFile, 'utf8')).toBe('JPEG-DATA');
  });

  it('is idempotent — already-relative refs in <dbname>-media/ are skipped', () => {
    const db = createTestDb();
    const m = createMedia(db, { file_ref: path.join('family-media', 'p.jpg') });
    const result = consolidateMediaFolder(db, dbPath);
    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(getMedia(db, m.id)?.file_ref).toBe(path.join('family-media', 'p.jpg'));
  });

  it('marks missing files (does not crash, does not mutate)', () => {
    const db = createTestDb();
    const m = createMedia(db, { file_ref: '/no/such/file.jpg' });
    const result = consolidateMediaFolder(db, dbPath);
    expect(result.missing).toBe(1);
    expect(result.copied).toBe(0);
    expect(getMedia(db, m.id)?.file_ref).toBe('/no/such/file.jpg');
  });

  it('handles name conflicts by appending a numeric suffix', () => {
    const db = createTestDb();
    const srcA = path.join(tmpDir, 'a', 'p.jpg');
    const srcB = path.join(tmpDir, 'b', 'p.jpg');
    fs.mkdirSync(path.dirname(srcA), { recursive: true });
    fs.mkdirSync(path.dirname(srcB), { recursive: true });
    fs.writeFileSync(srcA, 'AAA');
    fs.writeFileSync(srcB, 'BBB');

    const mA = createMedia(db, { file_ref: srcA });
    const mB = createMedia(db, { file_ref: srcB });

    consolidateMediaFolder(db, dbPath);

    const refA = getMedia(db, mA.id)?.file_ref ?? '';
    const refB = getMedia(db, mB.id)?.file_ref ?? '';
    expect(refA).not.toBe(refB);
    expect(fs.existsSync(path.join(tmpDir, refA))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, refB))).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, refA), 'utf8')).toBe('AAA');
    expect(fs.readFileSync(path.join(tmpDir, refB), 'utf8')).toBe('BBB');
  });

  it('skips null/empty file_ref', () => {
    const db = createTestDb();
    createMedia(db, { file_ref: null, title: 'no file' });
    const result = consolidateMediaFolder(db, dbPath);
    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('handles a relative ref that points outside <dbname>-media/ by treating as already-authored (no copy)', () => {
    // External relative refs are unusual; safest is to leave them alone.
    const db = createTestDb();
    const m = createMedia(db, { file_ref: 'other-folder/p.jpg' });
    const result = consolidateMediaFolder(db, dbPath);
    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(getMedia(db, m.id)?.file_ref).toBe('other-folder/p.jpg');
  });
});
```

- [x] **Step 2: Run tests to confirm failure**

Run: `npx vitest run tests/unit/media_consolidate.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `consolidateMediaFolder`**

Create `src/api/media_consolidate.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import type { Database } from 'node-sqlite3-wasm';
import { getMediaDir, getMediaFolderName } from './media';

export interface ConsolidateResult {
  /** Files newly copied + ref rewritten */
  copied: number;
  /** Refs left untouched (already inside dbDir, null, relative-external, etc.) */
  skipped: number;
  /** Absolute refs whose target file does not exist */
  missing: number;
}

/**
 * Walk all media rows; for any `file_ref` that is an absolute path to an existing
 * file, copy it into `<dbname>-media/` (creating the folder if needed) and rewrite
 * the row to the relative `<dbname>-media/<filename>` form.
 *
 * Idempotent. Safe to call multiple times. Pure function of (db, dbPath).
 */
export function consolidateMediaFolder(db: Database, dbPath: string): ConsolidateResult {
  const result: ConsolidateResult = { copied: 0, skipped: 0, missing: 0 };
  const folderName = getMediaFolderName(dbPath);
  const mediaDir = getMediaDir(dbPath);

  type Row = { id: string; file_ref: string | null };
  const rows = db.all('SELECT id, file_ref FROM media') as Row[];
  if (rows.length === 0) return result;

  let folderEnsured = false;
  const ensureFolder = () => {
    if (folderEnsured) return;
    fs.mkdirSync(mediaDir, { recursive: true });
    folderEnsured = true;
  };

  const update = db.prepare('UPDATE media SET file_ref = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') WHERE id = ?');
  try {
    for (const row of rows) {
      const ref = row.file_ref;
      if (!ref) { result.skipped++; continue; }
      if (!path.isAbsolute(ref)) { result.skipped++; continue; }
      if (!fs.existsSync(ref)) { result.missing++; continue; }

      ensureFolder();
      const filename = path.basename(ref);
      let dest = path.join(mediaDir, filename);
      if (fs.existsSync(dest) && !sameFile(ref, dest)) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        let n = 1;
        while (fs.existsSync(dest = path.join(mediaDir, `${base}_${n}${ext}`))) n++;
      }
      if (!fs.existsSync(dest)) fs.copyFileSync(ref, dest);
      const newRef = path.join(folderName, path.basename(dest));
      update.run([newRef, row.id]);
      result.copied++;
    }
  } finally {
    update.finalize();
  }
  return result;
}

function sameFile(a: string, b: string): boolean {
  try {
    const sa = fs.statSync(a);
    const sb = fs.statSync(b);
    return sa.size === sb.size && sa.ino === sb.ino && sa.dev === sb.dev;
  } catch { return false; }
}
```

- [x] **Step 4: Run tests**

Run: `npx vitest run tests/unit/media_consolidate.test.ts`
Expected: PASS (all 6).

- [x] **Step 5: Run full unit suite to catch regressions**

Run: `npx vitest run tests/unit/media`
Expected: PASS.

- [x] **Step 6: Lint**

Run: `npm run lint -- src/api/media_consolidate.ts tests/unit/media_consolidate.test.ts`
Expected: 0 errors.

- [x] **Step 7: Commit**

```bash
git add src/api/media_consolidate.ts tests/unit/media_consolidate.test.ts
git commit -m "feat(media): consolidateMediaFolder copies refs into <dbname>-media/"
```

---

## Task 4: Wire consolidate into all import IPC handlers

**Files:**
- Modify: `src/main/ipc/import.ts` (add post-import call to consolidate inside `gedcom:import`, `import:holgerRun`, `import:genneyRun`, `archive:import`)

- [x] **Step 1: Verify import**

Confirm `src/main/ipc/import.ts` already imports `media` namespace (added in Task 2). If not, add:

```typescript
import * as media from '../../api/media';
import { consolidateMediaFolder } from '../../api/media_consolidate';
```

- [x] **Step 2: Add consolidation to `gedcom:import`**

Find the success branch inside the `gedcom:import` handler (after `const report = importGedcom(...)`):

```typescript
      const report = importGedcom(getDb(), tree, options);
      return { imported: true, filePath: gedPath, report };
```

Replace with:

```typescript
      const report = importGedcom(getDb(), tree, options);
      consolidateMediaFolder(getDb(), getCurrentDatabasePath());
      return { imported: true, filePath: gedPath, report };
```

- [x] **Step 3: Add consolidation to `import:genneyRun`**

Find:
```typescript
    if (result.gedcomFallbackPath) {
      return { gedcomFallback: true, gedcomPath: result.gedcomFallbackPath };
    }
    return { imported: true, summary: result.summary };
```

Replace with:
```typescript
    if (result.gedcomFallbackPath) {
      return { gedcomFallback: true, gedcomPath: result.gedcomFallbackPath };
    }
    consolidateMediaFolder(getDb(), getCurrentDatabasePath());
    return { imported: true, summary: result.summary };
```

- [x] **Step 4: Add consolidation to `import:holgerRun`**

Find:
```typescript
      return { success: true, report: result.report };
```

Replace with:
```typescript
      consolidateMediaFolder(getDb(), getCurrentDatabasePath());
      return { success: true, report: result.report };
```

- [x] **Step 5: Add consolidation to `archive:import`**

Find:
```typescript
      const report = importArchive(getDb(), archivePath, mediaDir);
      return { imported: true, filePath: archivePath, report };
```

Replace with:
```typescript
      const report = importArchive(getDb(), archivePath, mediaDir);
      consolidateMediaFolder(getDb(), getCurrentDatabasePath());
      return { imported: true, filePath: archivePath, report };
```

(Archive import already places files into `<dbname>-media/`; consolidate is a cheap no-op for those rows but catches any embedded absolute refs.)

- [x] **Step 6: Run typecheck + lint**

Run: `npx tsc --noEmit && npm run lint -- src/main/ipc/import.ts`
Expected: 0 errors.

- [x] **Step 7: Run full test suite for regressions**

Run: `npx vitest run`
Expected: PASS. If `tests/unit/import-holger.test.ts` fails because the post-import file_ref shape changed, update its assertion to expect either the relative form (after consolidate) or split the test scope so the importer-only behaviour is verified separately. Document the choice in the commit message.

- [x] **Step 8: Commit**

```bash
git add src/main/ipc/import.ts tests/
git commit -m "feat(import): consolidate media into <dbname>-media/ after every import"
```

---

## Task 5: Document the convention

**Files:**
- Create: `.claude/rules/media.md`
- Modify: `.claude/skills/gedcom/SKILL.md` (add pointer)

- [x] **Step 1: Write `.claude/rules/media.md`**

Create with:

```markdown
# Media Storage Convention

Loads when working on media imports, file_ref handling, or anything writing to
`<dbname>-media/`.

## The convention

Every database has a sibling folder named `<dbname>-media/`:

- `family.db` → `family-media/` (in the same directory)
- Helper: `getMediaDir(dbPath)` and `getMediaFolderName(dbPath)` in `src/api/media.ts`

The `media.file_ref` column stores either:
- A relative path: `"<dbname>-media/photo.jpg"` — resolved against the dbDir at read time
- `null` — record exists but no file (e.g. citation-only)

`file_ref` should NEVER be an absolute path in a settled database. Absolute
paths only appear transiently mid-import and are normalised to relative refs
by `consolidateMediaFolder` before the import handler returns.

## Where files get copied

| Path | Behaviour |
|---|---|
| `media:attach` (UI) | Copies file to `<dbname>-media/`, writes relative ref |
| `archive:import` (.zip) | Copies bundled `media/` contents to `<dbname>-media/` |
| `gedcom:import` | OBJE FILE refs stored as-is, then `consolidateMediaFolder` copies + rewrites |
| `import:holgerRun` | Same — importer remaps Windows paths, consolidate copies + rewrites |
| `import:genneyRun` (.gcc) | Same |
| `import:genneyRun` (.backup) | Bulk-copies extracted `media/` into `<dbname>-media/` up front, then consolidate is a no-op |

## When adding a new import path

1. Run the importer; let it write whatever `file_ref` shape is convenient
2. After success, on the main thread, call:
   ```ts
   import { consolidateMediaFolder } from '../../api/media_consolidate';
   consolidateMediaFolder(getDb(), getCurrentDatabasePath());
   ```
3. Done. No need to thread `mediaDir` plumbing through the importer.

## What NOT to do

- Do NOT hardcode folder names like `'genney-media'`, `'media'`, `'photos'`. Always use `getMediaDir(dbPath)`.
- Do NOT write absolute `file_ref` values back to the DB after an import handler returns. Consolidate must run first.
- Do NOT skip consolidate for "small" imports — it is O(n_media), idempotent, and a no-op when refs are already relative.

## Prime Directive

Consolidating an absolute path into a relative one inside `<dbname>-media/` is
a deterministic relocation of an authored value, not an inference. It is the
ONLY transformation of `file_ref` allowed outside an explicit user action.
```

- [x] **Step 2: Add pointer in gedcom skill**

In `.claude/skills/gedcom/SKILL.md`, find the OBJE/multimedia section and add right below the limitations table line:

```markdown
**Media storage:** Imported OBJE FILE references are normalised to relative `<dbname>-media/...` refs by `consolidateMediaFolder`. See `.claude/rules/media.md`.
```

- [x] **Step 3: Commit**

```bash
git add .claude/rules/media.md .claude/skills/gedcom/SKILL.md
git commit -m "docs(media): document <dbname>-media/ convention in rules + gedcom skill"
```

---

## Task 6: Final verification

- [x] **Step 1: Run full test + lint**

```bash
npx vitest run
npm run lint
npx tsc --noEmit
```

Expected: 0 failures, 0 lint errors, 0 type errors.

- [x] **Step 2: Manual smoke (electron-dev skill)**

Launch the app, import a small GEDCOM with at least one OBJE FILE pointing at an existing local image. Verify:
- The file appears in `<dbname>-media/`
- The DB row\'s `file_ref` is `<dbname>-media/<filename>`

Skip if no test GEDCOM with media is handy — tests cover the behaviour.

- [x] **Step 3: Push branch + open PR**

```bash
git push -u origin fix/media-folder-convention
gh pr create --title "fix(media): unify <dbname>-media/ convention across imports" --body "..."
```
