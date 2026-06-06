# Gramps `.gpkg` archive import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importing a Gramps `.gpkg` package brings in the persons/events *and* writes the bundled media files into `<dbname>-media/` with relative `file_ref`s — from both the desktop file picker and the MCP `import_file` tool.

**Architecture:** A new runtime-neutral extraction core (`src/import/gramps/archive.ts`) gunzips the file (fflate), detects a USTAR tar (`.gpkg`), and returns `{ xml, media[] }`. The importer pipes media bytes through a caller-supplied `mediaWriter` (renderer → `fs_write_bytes_base64`; MCP → Node `fs`) and rewrites each media `file_ref` to `<mediaFolderName>/<basename>` — mirroring `src/api/archive_import.ts`'s `ArchiveMediaWriter` pattern. Plain `.gramps` XML is unchanged (media list is empty).

**Tech Stack:** TypeScript, `fflate` (gzip, existing dep), `nanotar` (tar, new dep), `node-sqlite3-wasm` (test DB), Vitest.

**Design spec:** [2026-06-06-gramps-gpkg-archive-import-design.md](2026-06-06-gramps-gpkg-archive-import-design.md).

---

## User goal

When a user imports a Gramps `.gpkg` package (the GUI "Gramps package" export — a gzipped tar of the family-tree XML plus a `media/` folder), the persons/events/etc. import **and** the bundled media files land in `<dbname>-media/` with relative `file_ref`s — exactly as if they'd imported the `.gramps` XML and attached the photos. Works from both the desktop file picker (`import.grampsRun`) and the MCP `import_file` tool.

## Scope

The Gramps importer and its two call sites. Full target list:

- `src/import/gramps/archive.ts` — **new** extraction core.
- `src/import/gramps/index.ts` — both entry points (`importFromGramps` path-variant, `importFromGrampsBytes` bytes-variant) route through the shared extraction + media-apply.
- `src/renderer/tauri-window-api.ts` — `import.grampsRun` injects a `fs_write_bytes_base64`-backed writer + calls `consolidateMediaFolder`.
- `src/mcp/tools/prod/data-management.ts` — the `format === 'gramps'` branch injects a Node-`fs` writer.
- `tests/unit/gramps-gpkg.test.ts` — **new** unit coverage.

### Scope deviations

- **`.gramps` XML path unchanged.** Plain/gzipped XML returns `media: []`; existing `tests/unit/gramps-transform.test.ts` stays green. This is the established `.gramps` behavior, not a deviation from full coverage — there is no media folder in a bare `.gramps` file.
- **Zip-form `.gpkg` not supported.** Real Gramps writes tar.gz; a non-standard zip `.gpkg` is out of scope (documented in the design spec).
- **`transform.ts` not modified.** Media parsing (`<object>` → `createMedia`) is reused as-is; the `file_ref` folder-rewrite lives in `index.ts` post-transform.
- **No schema change.** No new columns → no `gedcom_fidelity_registry` entry needed.
- **The `.gpkg` e2e fixture lives in the sibling plan.** `2026-05-31-gramps-binary-fixtures.md` Task 2 owns the e2e fixture; this plan delivers the importer code that makes it pass and is its prerequisite.

## Verification

### User-observable
1. MCP-shaped path: `importFromGramps(db, <real tar.gz .gpkg path>, { mediaWriter: fsWriter, mediaFolderName })` → `summary.persons === 3`, `summary.media === 1`, the media row's `file_ref === '<folder>/blank.png'`, **and the PNG physically exists on disk** in the writer's target dir. (Task 3 fs-writer unit test.)
2. Bytes path (renderer-shaped): `importFromGrampsBytes(db, <gpkg bytes>, { mediaWriter: inMemory, mediaFolderName })` → same counts + the in-memory writer received `blank.png` with the exact PNG bytes. (Task 3 in-memory-writer unit test.)

### Tests that observe the user goal (not structure)
- Tasks 2 + 3 unit tests above exercise the real extraction + media-write + ref-rewrite end-to-end against a tar.gz `.gpkg` built in-test.
- **Deliberate-red** (Task 6): inject `throw new Error('e2e-canary')` before `parseTar` in `archive.ts`; confirm the `.gpkg` unit tests go red with that message; revert. Proves the tests reach the new decoder.

### CI gates (per .claude/rules/plans.md)
- `npm test` — new `gramps-gpkg.test.ts` + existing `gramps-transform.test.ts` green.
- `npm run build` — exits 0.
- `npm run test:e2e:full` — importer touched → required; existing `imports` project stays green. (The new `.gpkg` e2e *case* ships with `2026-05-31-gramps-binary-fixtures.md`.)
- `npx vue-tsc --noEmit --ignoreDeprecations 6.0` — renderer + MCP call sites typecheck.

### User-goal-falsifiability
If all of the above pass, can the user goal be unmet? Only if the renderer/MCP wiring (Tasks 4/5) diverges from the unit-tested core. Mitigation: Tasks 4/5 reuse the exact `importFromGrampsBytes`/`importFromGramps` signatures the unit tests drive, and the renderer mirrors the already-working `api.archive.import` handler verbatim; vue-tsc enforces the call-site shape.

## Failure modes / RCA reference
- Parent: executing `2026-05-31-gramps-binary-fixtures.md` Task 2 surfaced that the `.gpkg` branch it assumed does not exist (importer run 2026-06-06: zip-form `.gpkg` imports nothing; tar.gz-form parses XML by accident and drops all media).
- Pattern source: `src/api/archive_import.ts` (`ArchiveMediaWriter`, `mediaFolderName` rewrite, `mediaSkipped` tolerance) and `src/renderer/tauri-window-api.ts` `api.archive.import` (the `fs_write_bytes_base64` writer + `dbCurrentPath` resolution).

---

## File structure

| File | Touch | Responsibility |
|---|---|---|
| `src/import/gramps/archive.ts` | Create | Pure extraction: bytes → `{ xml, media[] }`. gunzip (fflate) + USTAR detect + `parseTar` (nanotar). No `fs`. |
| `src/import/gramps/index.ts` | Modify | Route both entry points through `extractGrampsArchive`; add `mediaWriter`/`mediaFolderName` options; write media + rewrite `file_ref`. |
| `src/renderer/tauri-window-api.ts` | Modify | `import.grampsRun`: inject `fs_write_bytes_base64` writer + `consolidateMediaFolder`. |
| `src/mcp/tools/prod/data-management.ts` | Modify | `format === 'gramps'`: inject Node-`fs` writer into `getMediaDir(getDbPath())`. |
| `tests/unit/gramps-gpkg.test.ts` | Create | Extraction + bytes-variant (in-memory writer) + path-variant (fs writer) + regression. |
| `package.json` / `package-lock.json` | Modify | Add `nanotar@^0.3.0`. |

---

## Tasks

### Task 1 (Tier 1): Add the `nanotar` dependency

User pre-approved `nanotar` (AskUserQuestion, 2026-06-06). Mechanical add.

**Files:** Modify `package.json`, `package-lock.json`.

- [ ] **Step 1: Install**

```bash
npm install nanotar@^0.3.0 --save --prefix /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import
```

- [ ] **Step 2: Verify it resolves and is zero-dep**

```bash
node -e "console.log(require('/Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import/node_modules/nanotar/package.json').version)"
# Expected: 0.3.0
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import add package.json package-lock.json
git -C /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import commit -m "build(deps): add nanotar for Gramps .gpkg tar extraction"
```

### Task 2 (Tier 1): Extraction core — `src/import/gramps/archive.ts`

**Files:**
- Create: `src/import/gramps/archive.ts`
- Test: `tests/unit/gramps-gpkg.test.ts`

- [ ] **Step 1: Write the failing test for `extractGrampsArchive`**

Create `tests/unit/gramps-gpkg.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTar } from 'nanotar';
import { gzipSync } from 'fflate';
import { extractGrampsArchive } from '../../src/import/gramps/archive';

// 67-byte 1x1 transparent PNG
const PNG = new Uint8Array([
  0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,
  0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1f,0x15,0xc4,
  0x89,0x00,0x00,0x00,0x0d,0x49,0x44,0x41,0x54,0x78,0x9c,0x62,0x00,0x01,0x00,0x00,
  0x05,0x00,0x01,0x0d,0x0a,0x2d,0xb4,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44,0xae,
  0x42,0x60,0x82,
]);

const GPKG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<database xmlns="http://gramps-project.org/xml/1.7.1/">
  <header><created date="2026-06-06" version="5.2.0"/></header>
  <events>
    <event handle="_e1" id="E1"><type>Birth</type><dateval val="1850-01-15"/></event>
    <event handle="_e2" id="E2"><type>Birth</type><dateval val="1845-06-20"/></event>
    <event handle="_e3" id="E3"><type>Birth</type><dateval val="1875-03-10"/></event>
  </events>
  <people>
    <person handle="_p1" id="I1"><gender>F</gender><name type="Birth Name"><first>Anna</first><surname>Andersson</surname></name><eventref hlink="_e1" role="Primary"/><objref hlink="_m1"/></person>
    <person handle="_p2" id="I2"><gender>M</gender><name type="Birth Name"><first>Erik</first><surname>Andersson</surname></name><eventref hlink="_e2" role="Primary"/></person>
    <person handle="_p3" id="I3"><gender>F</gender><name type="Birth Name"><first>Lisa</first><surname>Andersson</surname></name><eventref hlink="_e3" role="Primary"/><childof hlink="_f1"/></person>
  </people>
  <families><family handle="_f1" id="F1"><rel type="Married"/><father hlink="_p2"/><mother hlink="_p1"/><childref hlink="_p3"/></family></families>
  <objects><object handle="_m1" id="O1"><file src="blank.png" mime="image/png"/></object></objects>
</database>`;

export function buildGpkgBytes(xml = GPKG_XML): Uint8Array {
  const tar = createTar([
    { name: 'data.gramps', data: new TextEncoder().encode(xml) },
    { name: 'media/blank.png', data: PNG },
  ]);
  return gzipSync(tar);
}

describe('extractGrampsArchive', () => {
  it('extracts XML + media from a tar.gz .gpkg', () => {
    const { xml, media } = extractGrampsArchive(buildGpkgBytes());
    expect(xml).toContain('<person handle="_p1"');
    expect(media).toHaveLength(1);
    expect(media[0].name).toBe('blank.png');
    expect(media[0].bytes).toEqual(PNG);
  });

  it('returns empty media for plain (un-gzipped) .gramps XML', () => {
    const xmlBytes = new TextEncoder().encode('<?xml version="1.0"?><database><people/></database>');
    const { xml, media } = extractGrampsArchive(xmlBytes);
    expect(xml).toContain('<database>');
    expect(media).toEqual([]);
  });

  it('returns empty media for gzipped .gramps XML', () => {
    const xmlBytes = new TextEncoder().encode('<?xml version="1.0"?><database><people/></database>');
    const { media } = extractGrampsArchive(gzipSync(xmlBytes));
    expect(media).toEqual([]);
  });
});

export { PNG, GPKG_XML };
```

- [ ] **Step 2: Run it; verify it fails**

```bash
npm --prefix /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import exec -- vitest run --root /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import tests/unit/gramps-gpkg.test.ts
```
Expected: FAIL — `Cannot find module '../../src/import/gramps/archive'`.

- [ ] **Step 3: Implement `archive.ts`**

```ts
import { gunzipSync } from 'fflate';
import { parseTar } from 'nanotar';

export interface GrampsMediaEntry {
  name: string;   // basename, e.g. "blank.png"
  bytes: Uint8Array;
}
export interface GrampsArchiveContents {
  xml: string;
  media: GrampsMediaEntry[];
}

const isGzip = (b: Uint8Array): boolean => b.length > 1 && b[0] === 0x1f && b[1] === 0x8b;

// USTAR magic lives at byte offset 257 ("ustar"). Distinguishes a real tar
// (a .gpkg's inner payload) from plain XML, which parseTar would otherwise
// mis-read as garbage entries.
function looksLikeTar(b: Uint8Array): boolean {
  if (b.length < 263) return false;
  const magic = new TextDecoder('latin1').decode(b.subarray(257, 262));
  return magic === 'ustar';
}

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

/**
 * Decode a Gramps file's raw bytes into XML + bundled media.
 *
 * - `.gramps` (plain or gzipped XML) → `{ xml, media: [] }`.
 * - `.gpkg` (gzipped USTAR tar of `data.gramps` + `media/`) → XML from the
 *   lone non-media entry (gunzipped again if it carries gzip magic) and one
 *   `media` entry per `media/<file>`.
 *
 * Pure — no filesystem access; safe in the renderer.
 */
export function extractGrampsArchive(fileBytes: Uint8Array): GrampsArchiveContents {
  const inner = isGzip(fileBytes) ? gunzipSync(fileBytes) : fileBytes;

  if (!looksLikeTar(inner)) {
    return { xml: new TextDecoder().decode(inner), media: [] };
  }

  const entries = parseTar(inner).filter((e) => e.type === 'file' && e.data);

  const xmlEntry =
    entries.find((e) => !e.name.startsWith('media/') && /\.(gramps|xml)$/i.test(e.name)) ??
    entries.find((e) => !e.name.startsWith('media/'));
  if (!xmlEntry?.data) {
    throw new Error('read: no Gramps XML found in .gpkg');
  }
  const xmlBytes = isGzip(xmlEntry.data) ? gunzipSync(xmlEntry.data) : xmlEntry.data;

  const media: GrampsMediaEntry[] = entries
    .filter((e) => e.name.startsWith('media/') && e.data)
    .map((e) => ({ name: baseName(e.name), bytes: e.data! }));

  return { xml: new TextDecoder().decode(xmlBytes), media };
}
```

- [ ] **Step 4: Run it; verify it passes**

```bash
npm --prefix /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import exec -- vitest run --root /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import tests/unit/gramps-gpkg.test.ts
```
Expected: PASS (3 tests in `extractGrampsArchive`).

- [ ] **Step 5: Commit**

```bash
git -C /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import add src/import/gramps/archive.ts tests/unit/gramps-gpkg.test.ts
git -C /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import commit -m "feat(gramps): extract XML + media from .gpkg tar.gz archives"
```

### Task 3 (Tier 1): Media-apply + wire both importer entry points

**Files:**
- Modify: `src/import/gramps/index.ts`
- Test: `tests/unit/gramps-gpkg.test.ts` (add cases)

- [ ] **Step 1: Add the failing importer tests**

Append to `tests/unit/gramps-gpkg.test.ts`:

```ts
import { beforeEach } from 'vitest';
import { writeFileSync, mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importFromGramps, importFromGrampsBytes } from '../../src/import/gramps';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => { db = await createTestDb(); });

describe('importFromGrampsBytes — .gpkg with in-memory writer', () => {
  it('imports 3 persons + 1 media row, writes the media file, rewrites file_ref', async () => {
    const writes: Record<string, Uint8Array> = {};
    const { summary } = await importFromGrampsBytes(db, buildGpkgBytes(), {
      mediaWriter: async (filename, bytes) => { writes[filename] = bytes; },
      mediaFolderName: 'fam-media',
    });
    expect(summary.persons).toBe(3);
    expect(summary.media).toBe(1);
    expect(writes['blank.png']).toEqual(PNG);
    const rows = await queryAll<{ file_ref: string }>(db, 'SELECT file_ref FROM media');
    expect(rows.map((r) => r.file_ref)).toEqual(['fam-media/blank.png']);
  });
});

describe('importFromGramps — .gpkg path variant with fs writer', () => {
  it('writes the media file to disk and rewrites file_ref', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gpkg-test-'));
    const gpkgPath = join(dir, 'sample.gpkg');
    writeFileSync(gpkgPath, buildGpkgBytes());
    const mediaDir = join(dir, 'sample-media');
    const { summary } = await importFromGramps(db, gpkgPath, {
      mediaWriter: async (filename, bytes) => {
        const { mkdirSync, writeFileSync: wf } = await import('node:fs');
        mkdirSync(mediaDir, { recursive: true });
        wf(join(mediaDir, filename), bytes);
      },
      mediaFolderName: 'sample-media',
    });
    expect(summary.persons).toBe(3);
    expect(existsSync(join(mediaDir, 'blank.png'))).toBe(true);
    expect(readFileSync(join(mediaDir, 'blank.png'))).toEqual(Buffer.from(PNG));
    const rows = await queryAll<{ file_ref: string }>(db, 'SELECT file_ref FROM media');
    expect(rows.map((r) => r.file_ref)).toEqual(['sample-media/blank.png']);
  });
});

describe('importFromGramps — plain .gramps regression (no writer)', () => {
  it('still imports persons from gzipped XML with no media options', async () => {
    const xml = GPKG_XML.replace(/<objects>[\s\S]*<\/objects>/, '').replace(/<objref[^/]*\/>/g, '');
    const { summary } = await importFromGrampsBytes(db, gzipSync(new TextEncoder().encode(xml)));
    expect(summary.persons).toBe(3);
    expect(summary.media).toBe(0);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

```bash
npm --prefix /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import exec -- vitest run --root /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import tests/unit/gramps-gpkg.test.ts
```
Expected: FAIL — `importFromGrampsBytes` ignores `mediaWriter`/`mediaFolderName` (no media file written, `file_ref` not rewritten).

- [ ] **Step 3: Rewrite `src/import/gramps/index.ts`**

Replace the entire file with:

```ts
/**
 * Gramps .gramps / .gpkg import orchestrator.
 *
 * `.gramps` is XML (optionally gzipped). `.gpkg` is a gzipped USTAR tar of
 * the XML plus a `media/` folder — `extractGrampsArchive` (archive.ts) pulls
 * both apart. Media bytes are written through a caller-supplied
 * `GrampsMediaWriter` (renderer → fs_write_bytes_base64; MCP → Node fs), then
 * each media `file_ref` is rewritten to `<mediaFolderName>/<basename>` so the
 * refs are relative per .claude/rules/media.md.
 */

import * as fs from 'node:fs';
import { queryAll, runSql } from '../../api/db';
import type { Database } from 'node-sqlite3-wasm';
import { transformGramps, emptyGrampsSummary, type GrampsImportSummary } from './transform';
import { extractGrampsArchive, type GrampsMediaEntry } from './archive';

export type GrampsMediaWriter = (filename: string, bytes: Uint8Array) => Promise<void>;

export interface GrampsImportOptions {
  onProgress?: (msg: string) => void;
  /** Persist a bundled media file. Omit for plain `.gramps` (no media). */
  mediaWriter?: GrampsMediaWriter;
  /** Sibling media folder name (e.g. `family-media`) for file_ref rewrite. */
  mediaFolderName?: string;
}

export interface GrampsImportResult {
  summary: GrampsImportSummary;
}

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

async function applyGrampsMedia(
  db: Database,
  media: GrampsMediaEntry[],
  mediaFolderName: string,
  writer: GrampsMediaWriter,
  onProgress: (msg: string) => void,
): Promise<void> {
  onProgress('Writing media…');
  const written = new Set<string>();
  for (const { name, bytes } of media) {
    try {
      await writer(name, bytes);
      written.add(name);
    } catch {
      // Tolerate a failed write; consolidateMediaFolder is the safety net.
    }
  }
  if (written.size === 0) return;
  const rows = await queryAll<{ id: string; file_ref: string }>(
    db,
    'SELECT id, file_ref FROM media WHERE file_ref IS NOT NULL',
  );
  for (const row of rows) {
    const base = baseName(row.file_ref);
    const target = `${mediaFolderName}/${base}`;
    if (written.has(base) && row.file_ref !== target) {
      await runSql(db, 'UPDATE media SET file_ref = ? WHERE id = ?', [target, row.id]);
    }
  }
}

async function runGrampsImport(
  db: Database,
  fileBytes: Uint8Array,
  options: GrampsImportOptions,
): Promise<GrampsImportResult> {
  const { onProgress = () => { /* noop */ }, mediaWriter, mediaFolderName } = options;

  onProgress('Importing…');
  const { xml, media } = extractGrampsArchive(fileBytes);

  let summary = emptyGrampsSummary();
  await runSql(db, 'BEGIN IMMEDIATE');
  try {
    summary = await transformGramps(db, xml);
    await runSql(db, 'COMMIT');
  } catch (err) {
    try { await runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }

  if (media.length > 0 && mediaWriter && mediaFolderName) {
    await applyGrampsMedia(db, media, mediaFolderName, mediaWriter, onProgress);
  }
  return { summary };
}

export async function importFromGrampsBytes(
  db: Database,
  bytes: Uint8Array,
  options: GrampsImportOptions = {},
): Promise<GrampsImportResult> {
  return runGrampsImport(db, bytes, options);
}

export async function importFromGramps(
  db: Database,
  filePath: string,
  options: GrampsImportOptions = {},
): Promise<GrampsImportResult> {
  const { onProgress = () => { /* noop */ } } = options;
  onProgress('Reading Gramps file…');
  const fileBytes = new Uint8Array(fs.readFileSync(filePath));
  return runGrampsImport(db, fileBytes, options);
}
```

- [ ] **Step 4: Run it; verify it passes**

```bash
npm --prefix /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import exec -- vitest run --root /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import tests/unit/gramps-gpkg.test.ts tests/unit/gramps-transform.test.ts
```
Expected: PASS — all `gramps-gpkg` cases + the unchanged `gramps-transform` suite.

- [ ] **Step 5: Commit**

```bash
git -C /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import add src/import/gramps/index.ts tests/unit/gramps-gpkg.test.ts
git -C /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import commit -m "feat(gramps): write .gpkg media to disk + rewrite file_ref via mediaWriter"
```

### Task 4 (Tier 1): Wire the renderer `import.grampsRun` handler

**Files:** Modify `src/renderer/tauri-window-api.ts` (the `api.import.grampsRun` handler, around line 907).

- [ ] **Step 1: Replace the handler body**

Find `api.import.grampsRun = async (opts: unknown) => {` and replace its body with (mirrors `api.archive.import`, using the `media` helpers already imported at the top of the file):

```ts
  api.import.grampsRun = async (opts: unknown) => {
    const o = opts as { filePath?: string } | undefined;
    if (!o?.filePath) return { success: false, error: 'filePath is required' };
    _importInProgress = true;
    try {
      const grampsMod = await import('../import/gramps');
      const b64 = await unwrap(commands.fsReadBytesBase64(o.filePath));
      const bytes = base64ToUint8Array(b64);

      const cur = await commands.dbCurrentPath();
      let mediaWriter: ((filename: string, b: Uint8Array) => Promise<void>) | undefined;
      let mediaFolderName: string | undefined;
      if (cur) {
        mediaFolderName = media.getMediaFolderName(cur);
        const mediaDir = media.getMediaDir(cur);
        mediaWriter = async (filename, b) => {
          await unwrap(commands.fsWriteBytesBase64(`${mediaDir}/${filename}`, uint8ArrayToBase64(b)));
        };
      }

      const result = await grampsMod.importFromGrampsBytes(getDb(), bytes, {
        onProgress: (m) => fireProgress('gramps', m),
        mediaWriter,
        mediaFolderName,
      });

      if (cur) {
        const { consolidateMediaFolder } = await import('../api/media_consolidate');
        await consolidateMediaFolder(getDb(), cur);
      }
      fireDataChanged();
      return { success: true, summary: result.summary };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    } finally {
      _importInProgress = false;
    }
  };
```

- [ ] **Step 2: Typecheck the renderer**

```bash
npm --prefix /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import exec -- vue-tsc --noEmit --ignoreDeprecations 6.0
```
Expected: exit 0 (no new errors at the `grampsRun` call site). If `media.getMediaFolderName`/`getMediaDir` aren't found, confirm the top-of-file `import * as media from '../api/media'` exists (it does at ~line 21).

- [ ] **Step 3: Commit**

```bash
git -C /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import add src/renderer/tauri-window-api.ts
git -C /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import commit -m "feat(gramps): write .gpkg media into <dbname>-media/ on desktop import"
```

### Task 5 (Tier 1): Wire the MCP `import_file` gramps branch

**Files:** Modify `src/mcp/tools/prod/data-management.ts` (the `if (format === 'gramps')` branch, around line 44).

- [ ] **Step 1: Replace the gramps branch**

`getMediaDir` is already imported (line 13); `nodePath` is already in scope (line 127). Add a Node-`fs/promises` import at the top if absent, then replace the branch:

```ts
    if (format === 'gramps') {
      const messages: string[] = [];
      try {
        const fsp = await import('node:fs/promises');
        const mediaDir = getMediaDir(getDbPath());
        const mediaFolderName = nodePath.basename(mediaDir);
        const result = await importFromGramps(db, args.file_path, {
          onProgress: (msg) => messages.push(msg),
          mediaFolderName,
          mediaWriter: async (filename, bytes) => {
            await fsp.mkdir(mediaDir, { recursive: true });
            await fsp.writeFile(nodePath.join(mediaDir, filename), bytes);
          },
        });
        return { content: [{ type: 'text', text: JSON.stringify({ ...result, progress: messages }, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: JSON.stringify({ error: message, progress: messages }, null, 2) }] };
      }
    }
```

- [ ] **Step 2: Typecheck**

```bash
npm --prefix /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import exec -- vue-tsc --noEmit --ignoreDeprecations 6.0
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git -C /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import add src/mcp/tools/prod/data-management.ts
git -C /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import commit -m "feat(gramps): write .gpkg media via MCP import_file"
```

### Task 6 (Tier 1): Deliberate-red + full CI gates

**Files:** none (verification only).

- [ ] **Step 1: Deliberate-red**

Temporarily edit `src/import/gramps/archive.ts` — add `throw new Error('e2e-canary');` as the first line inside `extractGrampsArchive`. Run:

```bash
npm --prefix /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import exec -- vitest run --root /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import tests/unit/gramps-gpkg.test.ts
```
Expected: the `.gpkg` cases FAIL with `e2e-canary`. **Revert the throw** and re-run → PASS. Capture both outputs for close-out.

- [ ] **Step 2: Full unit suite + lint + build**

```bash
npm test --prefix /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import
npm run lint --prefix /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import
npm run build --prefix /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import
```
Expected: `npm test` summary `N passed`; lint 0 errors; build exits 0. Capture the summary lines.

- [ ] **Step 3: e2e (importer touched → `:full` required)**

```bash
npm run test:e2e:full --prefix /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import
```
Expected: all 7 projects pass; `imports` project green. Capture per-project pass counts.

### Task 7 (Tier 1): Mark the fixtures plan unblocked

**Files:** Modify `docs/plans/2026-05-31-gramps-binary-fixtures.md`.

- [ ] **Step 1: Annotate Task 2's prerequisite**

Add a note under the fixtures plan's Task 2 (and its Scope deviation about "no new importer code") that the `.gpkg` native-decoder branch is delivered by `2026-06-06-gramps-gpkg-archive-import.md` (now merged), so Task 2 is executable: the `.gpkg` fixture must be built as a **tar.gz** (`tar czf`, not `zip`), and the importer extracts media into `<dbname>-media/`.

- [ ] **Step 2: Commit**

```bash
git -C /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import add docs/plans/2026-05-31-gramps-binary-fixtures.md
git -C /Users/jonasahnstedt/git/slaktforskning/.claude/worktrees/gramps-gpkg-import commit -m "docs(plan): mark gramps-binary-fixtures Task 2 unblocked by .gpkg import"
```

### Task 8 (Tier 1): Close-out

- [ ] **T-final (Tier 1)** — Invoke `/close-out` skill. It walks the 6+1 steps, refuses partial, captures evidence (the Task 6 deliberate-red red+green output, `npm test`/`build`/`test:e2e:full` summaries). Minor bump (new feature). Skill handles archive + PLAN.md + CHANGELOG + merge to `main`.
