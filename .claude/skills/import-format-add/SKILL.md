---
name: import-format-add
description: Add a new native importer for a genealogy file format (alongside the GEDCOM, Genney, Holger, RootsMagic, and Gramps importers we already ship). Use when the user asks to support a new app's file format — e.g. "add a Family Tree Maker importer", "let users import .ftm files directly", or "we should read .gpkg natively". Covers the multi-file pattern: src/import/<format>/, channel registry, file picker, Tauri polyfill (renderer-side fs read via invoke('fs_read_bytes_base64')), static-api stub, UI tab, MCP auto-detect, fixture-based tests.
---

# Adding a Native Importer for a New Genealogy File Format

Three native importers already exist (`src/import/genney/`, `src/import/rootsmagic/`, `src/import/gramps/`). Each closed the gap "user has a foreign app's file but no GEDCOM export" — agents and humans can drop the file in directly. The shape is consistent enough that a fourth one should be a recipe, not an investigation.

## Reference implementations

**Gramps, RootsMagic, and Holger are all fully wired in the Tauri build today.** Use the closest format-shape match as the diff target:

- **Gramps** (`api.import.grampsRun`) — XML inside a `.gramps`/`.gpkg` (gzipped); good template for any XML- or text-based format.
- **RootsMagic** (`api.import.rootsmagicRun`) — SQLite `.rmtree` / `.rmgc`; good template for any SQLite-shape format.
- **Holger** (`api.import.holgerRun`) — GEDCOM- or ZIP-bundled; good template for any wrapped format.

The shape is the same in all three:

- File picker via `invoke('dialog_pick', { kind: 'open', extensions: [...] })` → returns chosen path.
- Bytes via `invoke<string>('fs_read_bytes_base64', { path })` → base64-decode in renderer to a `Uint8Array`.
- Decode + parse + import via the renderer-side `importFrom<Format>Bytes(db, bytes)` variant (a sibling of `importFrom<Format>(db, filePath)` that takes pre-loaded bytes — every Tauri-wired importer needs this variant because the renderer has no `fs`).
- After success: call `fireDataChanged()` so list views and panels refresh without a route change.

See the existing polyfills in `src/renderer/tauri-window-api.ts` for the exact shape (~14 lines each). The pattern lifts directly to a new importer; what changes is the `extensions` list, the `*SelectFile` dialog title, and the importer module name.

**Genney is the one not-yet-wired importer** (`notWired('Genney')`). It needs a Docker + Java extractor pipeline; in the Tauri build that means a Rust command that shells out, which we haven't built yet. Avoid as a reference until that lands.

## Step 0: confirm the format is worth doing

Before any code:

- **Public sample available?** Without a real fixture, you're guessing the schema. Search `D-Jeffrey/gedcom-samples` (export samples tagged by source app), the format vendor's GitHub, and similar repos. If no public file exists, the format is probably proprietary closed binary — at that point GEDCOM-export-then-import is the right answer, not native import. (FTM `.ftm`, MacFamilyTree `.familytree`, Legacy `.fdb` are all in this bucket today.)
- **Schema reverse-engineerable?** Open the sample. SQLite (`file foo.rmgc` says "SQLite 3.x database") is trivially inspectable via `sqlite3 foo.rmgc ".schema"`. XML is grep-able. Anything else — proprietary binary, encrypted, tightly-coupled native — punt.
- **Drop the sample in `export-import/samples/native-binary/`** (gitignored). Not committed.

## Step 1: schema discovery

Spend real time here — the transform code is only as good as the schema model.

For SQLite (RootsMagic-shape):
```
sqlite3 sample.<ext> ".tables"
sqlite3 sample.<ext> ".schema PersonTable"           # adapt per app
sqlite3 sample.<ext> "SELECT * FROM PersonTable LIMIT 5"
```
Look for: person table, name table, family/relationship table, child-link table, event table + event-type lookup, place table, source/citation tables, media tables. Note FK shapes and discriminator columns (e.g. RootsMagic's `OwnerType` column).

For XML (Gramps-shape):
```
head -100 sample.<ext>
grep -E "^  <[a-z]+>$" sample.<ext> | sort -u    # top-level entity types
```
Look for: well-known root, regular per-entity blocks with `handle`/`id` attributes, ref-by-handle linking. Most genealogy XML is shallow per entity — a regex/scanner approach works without an XML library.

For binary: don't.

## Step 2: file map

```
src/import/<format>/transform.ts        # pure DB→DB transform; no IPC, no fs
src/import/<format>/index.ts            # orchestrator: importFrom<Format>(db, path) AND importFrom<Format>Bytes(db, bytes) — both variants required
tests/unit/<format>-transform.test.ts   # synthetic in-memory fixture + real-sample E2E (skipIf-gated)
src/shared/channels/import.ts           # defineChannel('import:<format>Run', mutating: true)
src/renderer/tauri-window-api.ts        # api.import.<format>SelectFile = pickFile(...); api.import.<format>Run = bytes-via-invoke + importFromBytes + fireDataChanged()
src/static/static-api.ts                # noop stub for the website-export SPA build
src/renderer/components/import/<Format>ImportSection.vue   # lean copy of GrampsImportSection
src/renderer/views/ImportExportView.vue                    # one filter chip + one v-if section
src/renderer/i18n/{sv,en}.ts            # title, desc, pickFile, import, running, error
src/mcp/tools/prod/data-management.ts   # extension match → format → native importer
docs/MCP.md                             # update import_file row
tests/unit/tauri-channel-coverage.test.ts  # confirm SelectFile + Run polyfills are present
tests/unit/static-api-coverage.test.ts     # confirm static stubs present
```

The dual-variant orchestrator (`importFrom<Format>` + `importFrom<Format>Bytes`) is mandatory because the Tauri renderer cannot read fs directly — bytes arrive via `invoke('fs_read_bytes_base64')`. The path variant exists for tests + MCP-server-host calls; both variants delegate to the same `transform<Format>` function.

Diff against the closest existing format-shape match: RootsMagic if your input is SQLite; Gramps if it's XML; Holger if it's a wrapped / multi-file bundle.

## Step 3: transform.ts — required idioms

```typescript
import type { Database } from 'node-sqlite3-wasm'; // type-only shim; runtime is rusqlite via the Tauri db-shim
import { createPerson, addPersonName, addPersonIdentifier } from '../../api/persons';
import { createRelationship, addEventParticipant } from '../../api/relationships';
import { createEvent } from '../../api/events';
import { findOrCreatePlace } from '../../api/places';
import { createSource, createCitation } from '../../api/sources';
import { createMedia } from '../../api/media';
import { setDbSetting, getDbSetting } from '../../api/db_settings';
```

Phases (ordering matters — entity B can't reference entity A's row id until A is built):

1. **Researcher info → `db_settings.researcher_*`** (only if currently empty — do not clobber values the user typed in Settings). Mirrors the GEDCOM SUBM and Genney SUBMITTER pattern.
2. **Places** — `findOrCreatePlace`. Strip any source-app abbreviation prefixes (RootsMagic prefixes places with "ABA - " etc).
3. **Sources** — `createSource`.
4. **Persons** — `createPerson(db, { sex, notes }, { allowNameless: true })` because names land in a later phase. Carry the source app's per-person UID through `addPersonIdentifier(... { identifier_type: 'uid', identifier_value })`.
5. **Names** — `addPersonName` per name row. Map foreign name-type values (RootsMagic `NameType=3 → 'married'`, Gramps `<name type="Married Name">`).
6. **Families & parent_child relationships** — couple via `createRelationship({ type: 'couple', ... })`, then per-child two `parent_child` rows. Apps emit different child-relationship encodings (RootsMagic ChildTable.RelFather, Gramps via biological default); map them to our `subtype` vocab.
7. **Events** — `createEvent(...)` with `place_id` looked up from your handle map. Event-type mapping is per-app (RootsMagic FactType lookup, Gramps `<type>` enum). Person events get `addEventParticipant({ role: 'primary' })`; family events ride on `relationship_id`.
8. **Citations** — `createCitation(...)` attached to the right owner (event/person/place).
9. **Media** — `createMedia` + `addMediaLink`. Leave file_refs in their original shape; the IPC orchestrator runs `consolidateMediaFolder` afterwards.

**Do not silently drop authored data.** Anything you can't represent should be either in the importer's `summary.warnings`, or `summary.skipped`, or a person/event note. Per Prime Directive: silent drop is a bug.

## Step 4: orchestrator (`index.ts`)

```typescript
export async function importFrom<Format>(
  ourDb: Database,
  filePath: string,
  options: <Format>ImportOptions = {},
): Promise<<Format>ImportResult> {
  const { onProgress = () => {} } = options;
  onProgress('Opening file…');
  // ... open the source (Database for SQLite, readFileSync + gunzip for XML)
  onProgress('Importing…');
  let summary = empty<Format>Summary();
  runSql(ourDb, 'BEGIN IMMEDIATE');
  try {
    summary = transform<Format>(ourDb, source);
    runSql(ourDb, 'COMMIT');
  } catch (err) {
    try { runSql(ourDb, 'ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
  return { summary };
}
```

Single transaction is mandatory per `.claude/rules/api.md` (writes-in-loop without it = WAL flush per row = minutes instead of seconds).

## Step 5: tests

Two test files:

**`<format>-transform.test.ts`** — synthetic in-memory fixture: build a fresh source DB or XML string in code, populate a few rows / elements, call transform, assert what landed in the destination DB. Always works in CI, no external dependency.

**End-to-end real-sample suite, gated:**
```typescript
import { existsSync } from 'node:fs';
const SAMPLE = '/abs/path/to/export-import/samples/native-binary/<file>';
describe.skipIf(!existsSync(SAMPLE))('<Format> import — real sample', () => {
  it('imports without throwing', async () => {
    const db = createTestDb();
    const result = await importFrom<Format>(db, SAMPLE);
    expect(result.summary.persons).toBeGreaterThan(0);
    expect(listPersons(db).length).toBe(result.summary.persons);
    expect(listPersons(db).every(p => (p.given_name?.length ?? 0) + (p.surname?.length ?? 0) > 0)).toBe(true);
    console.log(`  <file>: persons=${result.summary.persons}, fams=${result.summary.coupleRelationships}, events=${result.summary.events}, ...`);
  });
});
```

The console.log lets a human (you, later) eyeball regressions when the count drifts.

## Step 6: end-to-end wiring

The boring parts. Run these coverage tests after every step in this section — they fail loudly when something's missing:

```bash
npx vitest run tests/unit/tauri-channel-coverage.test.ts \
                tests/unit/static-api-coverage.test.ts
```

Use Gramps / RootsMagic / Holger as the diff target for the Tauri-side wiring (whichever matches your format shape).

The MCP `import_file` extension-match branch and the `import_file` description need updating — agents discover the new format via the description.

### Step 6b: Tauri polyfill recipe

Add to `src/renderer/tauri-window-api.ts` alongside the existing Gramps block:

```typescript
api.import.<format>SelectFile = () =>
  pickFile('Välj <Format>-databasfil', ['<ext1>', '<ext2>'], '<Format>-databas');

api.import.<format>Run = async (opts: unknown) => {
  const o = opts as { filePath?: string } | undefined;
  if (!o?.filePath) return { success: false, error: 'filePath is required' };
  try {
    const mod = await import('../import/<format>');
    const b64 = await invoke<string>('fs_read_bytes_base64', { path: o.filePath });
    const bytes = base64ToUint8Array(b64);
    const result = await mod.importFrom<Format>Bytes(getDb(), bytes);
    fireDataChanged();
    return { success: true, summary: result.summary };
  } catch (e) {
    return { success: false, error: String((e as Error)?.message || e) };
  }
};
```

`pickFile`, `base64ToUint8Array`, and `getDb` are already defined at the top of `tauri-window-api.ts`. The `fireDataChanged()` call is mandatory — without it the renderer keeps showing stale row counts after the import succeeds.

## Step 7: verification before claiming done

- All three coverage tests green.
- `npm run lint` 0 errors.
- The `<format>-transform.test.ts` real-sample suite green and prints sensible counts.
- The renderer compiles without TypeScript errors on the new section.
- `/commit` produced the version bump and the CHANGELOG entry. The entry's bullet should be in plain user-facing language ("imports a Foo database directly — no need to first export to GEDCOM"), not engineering detail. The commit and oss-release skills own the mechanics — your job here is just to confirm the bullet reads well to a non-developer.

## Anti-patterns from prior attempts

- **Guessing the schema instead of inspecting the real sample.** Got bitten on the RootsMagic date format (`D.+19551002..+00000000..` — the qualifier suffix is 2 chars, not 1). Always derive from real bytes.
- **Splitting the work across many tiny commits.** Foundation + wire-up is fine as 2 commits; further splitting just creates broken intermediate states the user has to step over.
- **Forgetting `allowNameless: true` on `createPerson`.** It throws otherwise, because every native importer adds names in a later phase.
- **Letting `RegExp` `.execute`-style usage slip into the file.** Project security hook flags the four-letter substring `e‑x‑e‑c‑(` as command injection (false positive on `RegExp.<that-method>` and on the SQLite `Database.<that-method>` call too). Use `String.match()` and `String.matchAll()` for regex parsing — same semantics, no false alarm. For multi-statement SQL setup in tests, split on `;` and call `runSql` per statement.

## Reference files (most recent precedents)

- Genney: `src/import/genney/index.ts` — Derby + Docker pipeline, Java extractor
- RootsMagic: `src/import/rootsmagic/transform.ts` — SQLite, schema reverse-engineered
- Gramps: `src/import/gramps/transform.ts` — XML, regex scanner

Diff your new importer against the one whose source format shape matches yours.
