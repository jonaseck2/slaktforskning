# Bundle Size and Idle Memory Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**User goal:** The installer is meaningfully smaller, the app uses less idle RAM after launch, and place resolution / list rendering / startup time are no slower than before. The user installs a smaller download, sees a familiar app open at the same speed or faster, and notices no regression anywhere — gazetteer-driven place pickers still feel instant, all 34 gazetteers still resolve their respective regions, and import/export still works.

**Non-goal:** This plan does not migrate to Tauri/Electrobun, does not introduce media thumbnails to disk, and does not change multi-window support. The lazy + LRU + pre-warm gazetteer loading discussed in conversation is **deferred to a follow-up plan** — only triggered if measured idle RAM after this plan still warrants it. Two-phase keeps the first change boring.

**Architecture:** Three independent workstreams that share verification but can land separately.
1. **Bundle hygiene** — tighten `forge.config.ts` `packagerConfig.ignore` to drop test fixtures, build scripts, docs, `.claude/`, and other non-runtime files from the packaged asar; add `rollup-plugin-visualizer` to the renderer build and remove any accidentally large imports it surfaces.
2. **Binary gazetteer format** — keep the 34 JSON files in `src/api/place-gazetteers/data/` as canonical contributor source, add a build step that encodes each JSON to a packed binary (`.glb` — Släktforskning Gazetteer Binary, not the GLTF format) with a deduplicated string table, int32 lat/lon, delta-encoded geometry coordinates, and a stable header. Replace the existing gzip-on-build Vite plugin with a binary-emit plugin. Update `bundled.ts`'s `loadGazetteer` to prefer `.glb`, fall back to `.json.gz` (transitional) and finally raw `.json` (dev/test).
3. **Statement cache audit** — sweep every direct `db.prepare()` call site outside of `src/api/db.ts` and the documented `withStatementCache` pattern, ensure each one finalizes via the helpers (`queryOne` / `queryAll` / `runSql` / `runSqlChanges`) or via an explicit `try { … } finally { stmt.finalize() }`. Run a long import, snapshot the WASM heap, confirm no growing prepared-statement count.

**Tech Stack:** TypeScript, Node.js Buffer/DataView for binary encoding, Vite plugin API, node-sqlite3-wasm, existing gazetteer build pipeline (`src/gazetteer-build/`), forge.config.ts, vitest.

---

## Scope

Every code path that ships gazetteer data, every `forge.config.ts` packagerConfig knob, and every direct `db.prepare()` call site outside `src/api/db.ts` is in scope. Concretely:

**Bundle hygiene scope (full enumeration):**
- `forge.config.ts` — `packagerConfig.ignore` is currently absent; add it.
- `vite.renderer.config.ts` — add `rollup-plugin-visualizer` (dev-time, not runtime cost).
- Renderer imports flagged by the visualizer that exceed a 50 KB-per-non-vendor threshold — fix any found by tree-shaking or replacement.

**Binary gazetteer format scope (full enumeration of code paths that read or emit gazetteers):**
- Source of truth: all 34 files in `src/api/place-gazetteers/data/*.json` stay as authored JSON. **Contributors edit JSON.**
- Encoder: new `src/gazetteer-build/binary-codec.ts` — pure functions `encodeGazetteer(gaz: Gazetteer): Buffer` and `decodeGazetteer(buf: Buffer): Gazetteer`. Round-trip identical (modulo float precision documented below).
- Vite emit plugin: replace `compress-bundled-gazetteers` in `vite.main.config.ts` with `emit-bundled-gazetteers-binary`. Emits `<.vite/build>/gazetteers/<id>.glb`.
- Runtime loader: `src/api/place-gazetteers/bundled.ts` — `loadGazetteer` prefers `.glb`, falls back to `.json.gz` (during transition or for any consumer that still emits gz), then raw `.json` (dev/test/source consumers).
- Existing `.json.gz` emit code is **removed** in the same change. No long-tail gzip + binary coexistence in production builds.

**Statement cache audit scope (full enumeration of files with `db.prepare(`):**
- `src/api/media_consolidate.ts`
- `src/api/db_settings.ts`
- `src/api/media.ts`
- `src/import/gedcom/import-core.ts`
- `src/import/genney/transform.ts`
- (`src/api/db.ts` is the helpers themselves — exempt.)

Each file is checked for: every `db.prepare()` is followed by either a guaranteed finalize (helper or `try/finally`), or is in a documented `withStatementCache` block whose cache is itself finalized at the end of the import. Any leak is fixed.

### Scope deviations

**Lazy + LRU + pre-warm gazetteer loading is excluded from this plan.** Reason: ordering risk. Eager-load + binary format already drops both bundle size and idle RAM substantially (the 52 MB raw JSON parse becomes ~3-5 MB binary parse). A second mechanism in the same plan obscures whether the first one met the bar. Verification step 4 measures post-plan idle RAM; if it stays above target, a follow-up plan introduces lazy loading on its own.

**Per-window memory cost not addressed.** The user explicitly wants multi-window kept; each `BrowserWindow` is a Chromium renderer process and that's fixed by Electron's architecture. Out of scope.

**Media thumbnails not added.** The user explicitly rejected disk-cached thumbnails on Prime Directive grounds (no inferred data, no temp-file litter). Out of scope.

**`asar.unpacked` discipline not changed.** Default behavior is fine for current dependencies; `node-sqlite3-wasm.wasm` is already handled by the dedicated copy plugin.

---

## Verification

**The user-observable outcomes that prove the plan met its goal — measured before changes, after Task 6 (post-bundle-hygiene), after Task 14 (post-binary), and after Task 17 (post-audit).**

1. **Installer size** — record the macOS `.zip`, Windows installer, and Linux `.deb` byte sizes from `npm run make` at each checkpoint. Each phase's record should match or beat the previous, and the post-Task-14 size should be at least 2-3 MB smaller than baseline (driven by binary gazetteer format).
2. **Idle RAM** — launch the packaged app on a stock database, wait for first paint, take an Activity Monitor / Task Manager snapshot of all Slaktforskning processes' Real Memory at three checkpoints (baseline / post-binary / post-audit). Idle RAM should drop noticeably (target: −20 MB or more after Task 14).
3. **Cold start** — time `Date.now()` from app launch (`app.whenReady`) to first IPC handler being registered. Log via existing `console.log` in `src/main/index.ts` if it doesn't already exist; otherwise add one log line. Cold start should be **at least as fast** as baseline (target: equal or faster — the binary format parses faster than `JSON.parse(gunzipSync(...))`).
4. **Place resolution still works for every region.** Manually run `resolvePlace` against the running app via the dev MCP (`mcp__slaktforskning-dev__resolve_place`) for one representative input per gazetteer (e.g. "Stockholm, Sverige" → sv-orter; "Roskilde, Danmark" → dk-sogne; "Bayern, Deutschland" → de-gemeinden; "California, USA" → us-all-states; "Pitcairn, Skottland" → gb-civil-divisions; etc.). All 34 gazetteers must produce a sensible match for at least one input.
5. **Existing test suite passes** — `npm test` (the ~2120 unit tests) and `npm run test:e2e` (Playwright) both green. Lint and `tsc --noEmit` clean.
6. **Bundle composition is sane** — `rollup-plugin-visualizer` HTML report from Task 4 is committed (or its summary is — see task) and shows no surprise large dependencies in the renderer.
7. **No prepared-statement leak in import.** Run a 10k-person GEDCOM import via the app, snapshot WASM heap before and after, no growing per-statement allocation count. Manual via dev MCP `app_status` or a heapdump if needed.

**Failure modes / RCA reference:**
- `feedback_no_gazetteer_frankensteins.md` (memory): contract over fixture; structural integrity over fixture passing. The binary codec must be a **pure derivation of the JSON source** — no embedded transformations, no "while we're at it" data fixes. JSON in → encode → decode → original JSON out (modulo float-to-int32 precision documented below).
- `feedback_gazetteers_are_build_outputs.md` (memory): JSON in `data/` is authored truth; `.glb` files are derived snapshots. They are NOT committed to git. Build script regenerates from JSON on every `npm run package`.
- `feedback_no_silent_string_replace.md` (memory): the encoder must throw on any unrecognized field, not silently drop. A future contributor who adds a new optional field on `GazetteerNode` should get a build error pointing them at the codec, not a silent data loss.
- `.claude/rules/api.md` "Worker-thread sync I/O": gazetteer load is module-init only (eager, before any IPC handler registers). Synchronous `readFileSync` is allowed there per the existing exception in `bundled.ts`'s comment. Do not move gazetteer load into a per-handler sync I/O path.

---

## File Structure

**New files:**
- `src/gazetteer-build/binary-codec.ts` — encoder + decoder. Pure functions. ~250-350 lines. Owned by the gazetteer build pipeline because contributors who add a field to `GazetteerNode` should update it.
- `tests/unit/gazetteer-binary-codec.test.ts` — round-trip tests, edge cases.

**Modified files:**
- `forge.config.ts` — add `packagerConfig.ignore`.
- `vite.renderer.config.ts` — add `rollup-plugin-visualizer` plugin (dev-time output to `.vite/visualizer.html`).
- `vite.main.config.ts` — replace `compress-bundled-gazetteers` plugin with `emit-bundled-gazetteers-binary`. Drops the `gzipSync` import.
- `vite.worker.config.ts` — comment update only (no functional change — worker still relies on main's emit).
- `src/api/place-gazetteers/bundled.ts` — `loadGazetteer` prefers `.glb`, falls back to `.json.gz` for backwards compat (covers any in-flight build), then `.json`.
- `src/api/place-gazetteers/types.ts` — no change to `Gazetteer` / `GazetteerNode` shape; document that lat/lon round-trip via int32 (precision: ±5e-7 degrees ≈ ±5 cm at equator) in a comment.
- `src/api/media_consolidate.ts`, `src/api/db_settings.ts`, `src/api/media.ts`, `src/import/gedcom/import-core.ts`, `src/import/genney/transform.ts` — only if the audit finds a missing finalize.
- `package.json` — add `rollup-plugin-visualizer` to `devDependencies`.
- `package-lock.json` — regenerated.
- `CHANGELOG.md` — add `## Unreleased` block.

**Deleted files:** none.

---

## Tasks

### Task 1: Baseline measurements (write before any code change)

**Files:**
- Create: `docs/plans/bundle-and-memory-reduction.measurements.md` (a temporary working file — gitignored or committed as part of the plan; we'll commit it so post-merge readers see what changed).

**Goal:** Capture pre-change numbers for installer size, idle RAM, and cold start. Without this, none of the verification claims later in the plan are checkable.

- [ ] **Step 1: Capture installer sizes**

```bash
npm run make
# Then:
ls -lh out/make/zip/darwin/*/*.zip out/make/squirrel.windows/*/*.exe out/make/deb/x64/*.deb 2>/dev/null
```

Write each size to `bundle-and-memory-reduction.measurements.md` under a `## Baseline (commit <SHA>, <date>)` heading.

- [ ] **Step 2: Capture cold start time**

Add a one-line console.log to `src/main/index.ts` if not already present:

```ts
const t0 = Date.now();
app.whenReady().then(() => {
  console.log(`[startup] ready in ${Date.now() - t0} ms`);
});
```

(If a similar log already exists, use it; do not duplicate.) Run `npm start`, observe the log, record the value in measurements.md. Repeat 3 times, record min/median.

- [ ] **Step 3: Capture idle RAM**

Launch the packaged app (`out/.../slaktforskning`), wait 5 seconds after first paint, run:

```bash
ps -A -o rss,command | grep -i slaktforskning | awk '{sum+=$1} END {print sum/1024 " MB"}'
```

(macOS / Linux. On Windows, use Task Manager and sum all Slaktforskning processes' "Memory (Active Private Working Set)".) Record value.

- [ ] **Step 4: Commit baseline**

```bash
git add docs/plans/bundle-and-memory-reduction.measurements.md src/main/index.ts
git commit -m "chore: record baseline bundle-size and memory measurements"
```

---

### Task 2: Tighten `forge.config.ts` packagerConfig.ignore

**Files:**
- Modify: `forge.config.ts`

**Goal:** Drop test fixtures, build scripts, docs, `.claude/`, and tooling-only files from the packaged asar. None of these are needed at runtime.

- [ ] **Step 1: Survey current packaged contents**

Run `npm run package`, then:

```bash
find out -type d -name '*.app' -print -quit | xargs -I {} npx asar list {}/Contents/Resources/app.asar | head -100
```

Record what's in the asar today in a scratch note (not committed). Look for `tests/`, `docs/`, `.claude/`, `scripts/build-*.ts` (the gazetteer build scripts), `tests/fixtures/`, `*.md`, `coverage/`, `.vite/build/`-only debug files.

- [ ] **Step 2: Add packagerConfig.ignore**

Edit `forge.config.ts`. Add an `ignore` regex array under `packagerConfig`:

```ts
packagerConfig: {
  asar: true,
  executableName: 'slaktforskning',
  extraResource: ['./dist-static', './THIRD_PARTY_LICENSES.txt'],
  ignore: [
    // tests and fixtures
    /^\/tests($|\/)/,
    // build scripts (only run at npm run package time, not at runtime)
    /^\/scripts($|\/)/,
    /^\/src\/gazetteer-build($|\/)/,
    // docs and config
    /^\/docs($|\/)/,
    /^\/\.claude($|\/)/,
    /^\/\.devcontainer($|\/)/,
    /^\/\.github($|\/)/,
    /^\/\.vscode($|\/)/,
    // top-level non-runtime files
    /^\/(README|CONTRIBUTING|CHANGELOG|LICENSE|CLAUDE)\.md$/,
    /^\/playwright\.config\.ts$/,
    /^\/vitest\.config\.mts$/,
    /^\/eslint\.config\.[mt]?js$/,
    /^\/tsconfig\.json$/,
    /^\/forge\.config\.ts$/,
    /^\/vite\.[a-z]+\.config\.ts$/,
    // coverage / build artifacts that aren't the runtime bundle
    /^\/coverage($|\/)/,
    /^\/dist-static($|\/)/, // intentionally — extraResource above ships it explicitly
    /^\/out($|\/)/,
  ],
},
```

NOTE: `dist-static/` is already listed in `extraResource`, so excluding it from asar is correct — it ships as a sibling resource, not inside asar.

- [ ] **Step 3: Verify the build still succeeds and tests pass**

```bash
npm run package
ls -lh out/.../slaktforskning  # confirm executable exists
```

Then verify the asar no longer contains the excluded paths:

```bash
npx asar list out/<platform>/Slaktforskning.app/Contents/Resources/app.asar 2>/dev/null | grep -E '(tests|docs|\.claude|scripts/build-)' || echo "Excluded paths not present (good)"
```

- [ ] **Step 4: Verify the running app still works**

Start the packaged binary, open a database, perform one place resolution from the UI (Place picker, type "Stockholm", confirm gazetteer suggestions appear). This proves no runtime path was excluded by accident.

- [ ] **Step 5: Capture installer sizes after Task 2**

Repeat the size capture from Task 1 Step 1. Append `## After Task 2 (forge ignore)` section to measurements.md.

- [ ] **Step 6: Commit**

```bash
git add forge.config.ts docs/plans/bundle-and-memory-reduction.measurements.md
git commit -m "build: exclude tests, docs, build scripts from packaged asar"
```

---

### Task 3: Add `rollup-plugin-visualizer` to renderer build

**Files:**
- Modify: `vite.renderer.config.ts`
- Modify: `package.json`

**Goal:** A one-time view into the renderer bundle so any accidental large dependency surfaces.

- [ ] **Step 1: Install the plugin**

```bash
npm install --save-dev rollup-plugin-visualizer
```

- [ ] **Step 2: Wire it into the renderer config**

Read the current `vite.renderer.config.ts`. Add the visualizer to the plugin chain, gated on a build env var so it doesn't run on every dev iteration:

```ts
// near the top
import { visualizer } from 'rollup-plugin-visualizer';

// inside defineConfig({...}) plugins array:
plugins: [
  // ... existing plugins ...
  process.env.VISUALIZE === '1' && visualizer({
    filename: '.vite/renderer-bundle-visualizer.html',
    template: 'treemap',
    gzipSize: true,
    brotliSize: true,
  }),
].filter(Boolean),
```

- [ ] **Step 3: Run the visualizer build**

```bash
VISUALIZE=1 npm run package
open .vite/renderer-bundle-visualizer.html  # macOS
# or just inspect the HTML manually
```

Identify any single non-vendor module > 50 KB gzip. Common offenders: full lodash, moment, large icon libraries. **Do not "fix" speculative findings** — only act on real surprises.

- [ ] **Step 4: If a real surprise is found, fix it**

If (and only if) the visualizer surfaces a genuine accidental large import, commit the fix as a separate step before Step 5. If nothing is surprising, skip — clean bundle is the goal, no productive-feeling drift.

- [ ] **Step 5: Commit**

```bash
git add vite.renderer.config.ts package.json package-lock.json
git commit -m "build: add rollup-plugin-visualizer for renderer bundle audits (VISUALIZE=1)"
```

---

### Task 4: Define and write tests for the binary gazetteer codec

**Files:**
- Create: `tests/unit/gazetteer-binary-codec.test.ts`

**Goal:** TDD the codec. Tests come first; the implementation in Task 5 makes them pass. The codec round-trips a Gazetteer through `encode → decode` losslessly (modulo documented float-to-int32 lat/lon precision).

- [ ] **Step 1: Write the round-trip tests**

```ts
// tests/unit/gazetteer-binary-codec.test.ts
import { describe, it, expect } from 'vitest';
import { encodeGazetteer, decodeGazetteer } from '../../src/gazetteer-build/binary-codec';
import type { Gazetteer } from '../../src/api/place-gazetteers/types';

const TINY_GAZ: Gazetteer = {
  id: 'test-tiny',
  name: 'Tiny Test',
  locale: 'en',
  shape: 'scaffolding',
  root: {
    name: 'World',
    type: 'world',
    lat: 0,
    lon: 0,
    children: [
      {
        name: 'Sweden',
        type: 'country',
        lat: 60,
        lon: 15,
        aliases: ['Sverige'],
        children: [
          { name: 'Stockholm', type: 'admin1', lat: 59.3293, lon: 18.0686 },
        ],
      },
    ],
  },
};

describe('gazetteer binary codec', () => {
  it('round-trips a minimal gazetteer', () => {
    const buf = encodeGazetteer(TINY_GAZ);
    const decoded = decodeGazetteer(buf);
    expect(decoded.id).toBe(TINY_GAZ.id);
    expect(decoded.name).toBe(TINY_GAZ.name);
    expect(decoded.locale).toBe(TINY_GAZ.locale);
    expect(decoded.root?.name).toBe('World');
    expect(decoded.root?.children?.[0].name).toBe('Sweden');
    expect(decoded.root?.children?.[0].aliases).toEqual(['Sverige']);
    const stockholm = decoded.root?.children?.[0].children?.[0];
    expect(stockholm?.name).toBe('Stockholm');
    expect(stockholm?.lat).toBeCloseTo(59.3293, 5); // int32 × 1e6 = 5 dp
    expect(stockholm?.lon).toBeCloseTo(18.0686, 5);
  });

  it('preserves geometry round-trip', () => {
    const gaz: Gazetteer = {
      id: 'test-geom',
      name: 'Geom Test',
      locale: 'en',
      kind: 'boundary',
      shape: 'scaffolding',
      root: {
        name: 'World',
        type: 'world',
        lat: 0,
        lon: 0,
        children: [
          {
            name: 'Box',
            type: 'country',
            lat: 1,
            lon: 1,
            geometry: {
              type: 'Polygon',
              coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
            },
          },
        ],
      },
    };
    const decoded = decodeGazetteer(encodeGazetteer(gaz));
    const box = decoded.root?.children?.[0];
    expect(box?.geometry?.type).toBe('Polygon');
    const coords = (box?.geometry as { coordinates: number[][][] }).coordinates;
    expect(coords[0]).toHaveLength(5);
    expect(coords[0][0]).toEqual([0, 0]);
    expect(coords[0][2]).toEqual([1, 1]);
  });

  it('preserves contributions shape', () => {
    const gaz: Gazetteer = {
      id: 'test-contrib',
      name: 'Contrib Test',
      locale: 'sv',
      shape: 'contributions',
      contributions: [
        {
          parentPath: ['World', 'Europe', 'Sweden'],
          nodes: [
            { name: 'Skåne', type: 'admin1', lat: 55.99, lon: 13.59 },
          ],
        },
      ],
    };
    const decoded = decodeGazetteer(encodeGazetteer(gaz));
    expect(decoded.shape).toBe('contributions');
    expect(decoded.contributions).toHaveLength(1);
    expect(decoded.contributions?.[0].parentPath).toEqual(['World', 'Europe', 'Sweden']);
    expect(decoded.contributions?.[0].nodes[0].name).toBe('Skåne');
  });

  it('throws on a bad magic number', () => {
    expect(() => decodeGazetteer(Buffer.from([0, 0, 0, 0, 1, 2, 3, 4]))).toThrow(/magic|format/i);
  });

  it('throws on an unsupported version', () => {
    const buf = Buffer.from([
      0x53, 0x4c, 0x47, 0x00,           // "SLG\0" magic stub
      0xFF, 0x00, 0x00, 0x00,           // version 255
    ]);
    // The actual encoder uses 'SLG1' = [0x53, 0x4c, 0x47, 0x31]; build a buf that
    // has a bad version. The decode error should mention 'version'.
    const realBuf = encodeGazetteer(TINY_GAZ);
    realBuf.writeUInt32LE(99, 4); // overwrite version field
    expect(() => decodeGazetteer(realBuf)).toThrow(/version/i);
  });

  it('round-trips every real bundled gazetteer (smoke)', async () => {
    // Sample a handful — full set runs in Task 6 verification.
    const ids = ['world-countries', 'sv-orter', 'us-immigration-states'];
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    for (const id of ids) {
      const json = JSON.parse(
        readFileSync(resolve('src/api/place-gazetteers/data', `${id}.json`), 'utf8'),
      ) as Gazetteer;
      const decoded = decodeGazetteer(encodeGazetteer(json));
      expect(decoded.id).toBe(json.id);
      // Spot-check: name, locale, root presence
      expect(decoded.name).toBe(json.name);
      expect(decoded.locale).toBe(json.locale);
      if (json.root) expect(decoded.root?.name).toBe(json.root.name);
      if (json.contributions) expect(decoded.contributions?.length).toBe(json.contributions.length);
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/unit/gazetteer-binary-codec.test.ts
```

Expected: all fail with "Cannot find module …/binary-codec".

- [ ] **Step 3: Commit the test file alone**

(This locks the spec before we write the implementation — TDD discipline.)

```bash
git add tests/unit/gazetteer-binary-codec.test.ts
git commit -m "test: add round-trip tests for gazetteer binary codec (failing)"
```

---

### Task 5: Implement the binary gazetteer codec

**Files:**
- Create: `src/gazetteer-build/binary-codec.ts`

**Goal:** Pure-function encoder + decoder that makes Task 4's tests pass. Format:

```
Header (16 bytes):
  magic       : 4 bytes  "SLG1"  (0x53 0x4C 0x47 0x31)
  version     : u32 LE   = 1
  string_table_offset : u32 LE
  body_length : u32 LE   (everything between header end and string table start)

Body (offset 16..16+body_length):
  Gazetteer metadata:
    id          : varstring
    name        : varstring
    locale      : varstring
    description : varstring (may be empty)
    shape       : u8 (0=undefined, 1=scaffolding, 2=contributions, 3=language)
    kind        : u8 (0=undefined, 1=point, 2=boundary, 3=language)
    flags       : u8 (bit0=hasRoot, bit1=hasContributions, bit2=hasSource, bit3=hasNormalize, bit4=hasTranslations)
    [if hasSource]    : Source struct (5 varstrings: name, url, license, fetched, kgmid; +2 vu32 dates as varstring)
    [if hasNormalize] : Normalize struct (3 string-arrays: stripSuffixes, stripPatterns, stripPrefixes)
    [if hasTranslations] : skipped — not used at runtime; round-trip preserves it via JSON-blob fallback (encode as JSON varstring)
    [if hasRoot]      : Node tree (depth-first preorder)
    [if hasContributions] : vu32 count + Contribution structs (parentPath as string-array, nodes as Node array with vu32 count)

Node:
  flags       : u8 (bit0=hasAliases, bit1=hasChildren, bit2=hasGeometry, bit3=hasYearRange)
  type_idx    : vu32 (index into a small fixed type table: 'world'/'continent'/'country'; OR a varstring for admin{N})
  name_idx    : vu32 (index into string table)
  lat_e6      : i32 LE (latitude × 1_000_000)
  lon_e6      : i32 LE (longitude × 1_000_000)
  [if hasAliases]   : vu32 count + vu32 idx[]
  [if hasYearRange] : i32 startYear, i32 endYear (use INT32_MIN as "unset")
  [if hasGeometry]  : Geometry (1 byte type: 1=Polygon, 2=MultiPolygon; rings stored as packed delta-encoded i32 pairs × 1e6)
  [if hasChildren]  : vu32 count + Node[]

String table (offset string_table_offset..end):
  vu32 count
  for each: vu32 length + UTF-8 bytes

vu32: LEB128 varint, unsigned.
varstring: vu32 length + UTF-8 bytes (no null terminator).
```

The encoder builds the string table by interning every name, alias, and free-form string seen during a depth-first walk. The body holds u32 indices into that table — repeated names ("admin1", country names, etc.) cost 1 byte each in the body.

- [ ] **Step 1: Write the encoder**

Create `src/gazetteer-build/binary-codec.ts`. The file is large; here is the critical structure — the implementer fills in the LEB128/varstring helpers and the depth-first walk:

```ts
import type {
  Gazetteer,
  GazetteerNode,
  GazetteerNormalizeRules,
  GazetteerSource,
  GazetteerGeometry,
} from '../api/place-gazetteers/types';

const MAGIC = Buffer.from([0x53, 0x4c, 0x47, 0x31]); // "SLG1"
const VERSION = 1;

const SHAPE_CODE = { undefined: 0, scaffolding: 1, contributions: 2, language: 3 } as const;
const KIND_CODE = { undefined: 0, point: 1, boundary: 2, language: 3 } as const;

// Fixed type indices for compact encoding. admin{N} types use index 255 +
// a separate varstring to carry the level number.
const FIXED_TYPE_CODES: Record<string, number> = {
  'world': 0,
  'continent': 1,
  'country': 2,
};
const TYPE_ADMIN_VARIABLE = 0xFF;

// --- LEB128 helpers ---
function writeVU32(out: number[], n: number): void {
  if (n < 0 || !Number.isInteger(n)) throw new Error(`vu32 expects non-negative int, got ${n}`);
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n & 0x7f);
}

function readVU32(buf: Buffer, cursor: { offset: number }): number {
  let result = 0;
  let shift = 0;
  for (;;) {
    if (cursor.offset >= buf.length) throw new Error('vu32: unexpected EOF');
    const b = buf[cursor.offset++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return result >>> 0;
    shift += 7;
    if (shift > 35) throw new Error('vu32: overflow');
  }
}

// --- String interning ---
class StringTable {
  private indexByValue = new Map<string, number>();
  private values: string[] = [];

  intern(s: string): number {
    const existing = this.indexByValue.get(s);
    if (existing !== undefined) return existing;
    const idx = this.values.length;
    this.values.push(s);
    this.indexByValue.set(s, idx);
    return idx;
  }

  toBuffer(): Buffer {
    const out: number[] = [];
    writeVU32(out, this.values.length);
    for (const v of this.values) {
      const utf8 = Buffer.from(v, 'utf8');
      writeVU32(out, utf8.length);
      for (const b of utf8) out.push(b);
    }
    return Buffer.from(out);
  }

  static read(buf: Buffer, cursor: { offset: number }): string[] {
    const count = readVU32(buf, cursor);
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const len = readVU32(buf, cursor);
      out.push(buf.slice(cursor.offset, cursor.offset + len).toString('utf8'));
      cursor.offset += len;
    }
    return out;
  }
}

// --- Encoder ---
export function encodeGazetteer(gaz: Gazetteer): Buffer {
  const strings = new StringTable();
  const body: number[] = [];

  // Required varstrings
  encodeVarstring(body, strings, gaz.id);
  encodeVarstring(body, strings, gaz.name);
  encodeVarstring(body, strings, gaz.locale);
  encodeVarstring(body, strings, gaz.description ?? '');

  body.push(SHAPE_CODE[(gaz.shape ?? 'undefined') as keyof typeof SHAPE_CODE] ?? 0);
  body.push(KIND_CODE[(gaz.kind ?? 'undefined') as keyof typeof KIND_CODE] ?? 0);

  // Flags
  let flags = 0;
  if (gaz.root) flags |= 0x01;
  if (gaz.contributions) flags |= 0x02;
  if (gaz.source) flags |= 0x04;
  if (gaz.normalize) flags |= 0x08;
  if (gaz.translations) flags |= 0x10;
  body.push(flags);

  if (gaz.source) writeSource(body, strings, gaz.source);
  if (gaz.normalize) writeNormalize(body, strings, gaz.normalize);
  if (gaz.translations) {
    // Translations are rare and structurally heterogeneous; round-trip via JSON
    // string is correct and small. If perf shows up later, replace with a
    // structured encoding.
    encodeVarstring(body, strings, JSON.stringify(gaz.translations));
  }
  if (gaz.root) writeNode(body, strings, gaz.root);
  if (gaz.contributions) writeContributions(body, strings, gaz.contributions);

  const stringBuf = strings.toBuffer();
  const bodyBuf = Buffer.from(body);

  const stringTableOffset = 16 + bodyBuf.length;
  const header = Buffer.alloc(16);
  MAGIC.copy(header, 0);
  header.writeUInt32LE(VERSION, 4);
  header.writeUInt32LE(stringTableOffset, 8);
  header.writeUInt32LE(bodyBuf.length, 12);

  return Buffer.concat([header, bodyBuf, stringBuf]);
}

function encodeVarstring(out: number[], strings: StringTable, s: string): void {
  // Interned-by-value form: vu32 string-table index. Empty string is index 0
  // by convention if encountered.
  writeVU32(out, strings.intern(s));
}

function writeNode(out: number[], strings: StringTable, node: GazetteerNode): void {
  let flags = 0;
  if (node.aliases && node.aliases.length > 0) flags |= 0x01;
  if (node.children && node.children.length > 0) flags |= 0x02;
  if (node.geometry) flags |= 0x04;
  if (node.startYear !== undefined || node.endYear !== undefined) flags |= 0x08;
  out.push(flags);

  if (node.type === 'world' || node.type === 'continent' || node.type === 'country') {
    out.push(FIXED_TYPE_CODES[node.type]);
  } else {
    out.push(TYPE_ADMIN_VARIABLE);
    encodeVarstring(out, strings, node.type);
  }

  writeVU32(out, strings.intern(node.name));
  writeI32LE(out, Math.round(node.lat * 1e6));
  writeI32LE(out, Math.round(node.lon * 1e6));

  if (flags & 0x01) {
    writeVU32(out, node.aliases!.length);
    for (const a of node.aliases!) writeVU32(out, strings.intern(a));
  }
  if (flags & 0x08) {
    writeI32LE(out, node.startYear ?? -2147483648);
    writeI32LE(out, node.endYear ?? -2147483648);
  }
  if (flags & 0x04) writeGeometry(out, node.geometry!);
  if (flags & 0x02) {
    writeVU32(out, node.children!.length);
    for (const c of node.children!) writeNode(out, strings, c);
  }
}

function writeI32LE(out: number[], n: number): void {
  out.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff);
}

function writeGeometry(out: number[], geom: GazetteerGeometry): void {
  if (geom.type === 'Polygon') {
    out.push(1);
    writePolygon(out, geom.coordinates);
  } else {
    out.push(2);
    writeVU32(out, geom.coordinates.length);
    for (const poly of geom.coordinates) writePolygon(out, poly);
  }
}

function writePolygon(out: number[], rings: number[][][]): void {
  writeVU32(out, rings.length);
  for (const ring of rings) {
    writeVU32(out, ring.length);
    let lastLat = 0, lastLon = 0;
    for (const [lon, lat] of ring) {
      // GeoJSON convention: [lon, lat]. Delta-encode against previous point.
      const latI = Math.round(lat * 1e6);
      const lonI = Math.round(lon * 1e6);
      writeI32LE(out, latI - lastLat);
      writeI32LE(out, lonI - lastLon);
      lastLat = latI;
      lastLon = lonI;
    }
  }
}

function writeSource(out: number[], strings: StringTable, src: GazetteerSource): void {
  encodeVarstring(out, strings, src.name);
  encodeVarstring(out, strings, src.url);
  encodeVarstring(out, strings, src.license);
  encodeVarstring(out, strings, src.created ?? '');
  encodeVarstring(out, strings, src.fetched);
  encodeVarstring(out, strings, src.kgmid ?? '');
}

function writeNormalize(out: number[], strings: StringTable, n: GazetteerNormalizeRules): void {
  writeStringArray(out, strings, n.stripSuffixes ?? []);
  writeStringArray(out, strings, n.stripPatterns ?? []);
  writeStringArray(out, strings, n.stripPrefixes ?? []);
}

function writeStringArray(out: number[], strings: StringTable, arr: string[]): void {
  writeVU32(out, arr.length);
  for (const s of arr) encodeVarstring(out, strings, s);
}

function writeContributions(
  out: number[],
  strings: StringTable,
  contribs: NonNullable<Gazetteer['contributions']>,
): void {
  writeVU32(out, contribs.length);
  for (const c of contribs) {
    writeStringArray(out, strings, c.parentPath);
    writeVU32(out, c.nodes.length);
    for (const n of c.nodes) writeNode(out, strings, n);
  }
}

// --- Decoder ---
// (Mirror image of the encoder. Implementer fills in: validate magic + version,
// read string table by seeking to stringTableOffset first, then read body,
// resolve string indices into the table.)

export function decodeGazetteer(buf: Buffer): Gazetteer {
  if (buf.length < 16) throw new Error('binary gazetteer: buffer too short');
  if (buf.compare(MAGIC, 0, 4, 0, 4) !== 0) throw new Error('binary gazetteer: bad magic / not SLG1 format');
  const version = buf.readUInt32LE(4);
  if (version !== VERSION) throw new Error(`binary gazetteer: unsupported version ${version}`);
  const stringTableOffset = buf.readUInt32LE(8);
  // body_length not needed for read but validates header
  buf.readUInt32LE(12);

  // Read string table first so body indices resolve.
  const stCursor = { offset: stringTableOffset };
  const strings = StringTable.read(buf, stCursor);

  const cursor = { offset: 16 };
  const id = readVarstring(buf, cursor, strings);
  const name = readVarstring(buf, cursor, strings);
  const locale = readVarstring(buf, cursor, strings);
  const description = readVarstring(buf, cursor, strings);
  const shapeCode = buf[cursor.offset++];
  const kindCode = buf[cursor.offset++];
  const flags = buf[cursor.offset++];

  const out: Gazetteer = { id, name, locale };
  if (description) out.description = description;
  const shape = invertShape(shapeCode);
  if (shape) out.shape = shape;
  const kind = invertKind(kindCode);
  if (kind) out.kind = kind;

  if (flags & 0x04) out.source = readSource(buf, cursor, strings);
  if (flags & 0x08) out.normalize = readNormalize(buf, cursor, strings);
  if (flags & 0x10) out.translations = JSON.parse(readVarstring(buf, cursor, strings));
  if (flags & 0x01) out.root = readNode(buf, cursor, strings);
  if (flags & 0x02) out.contributions = readContributions(buf, cursor, strings);

  return out;
}

// (Read helpers mirror their write counterparts. Keep them small and one-purpose.)

function readVarstring(buf: Buffer, cursor: { offset: number }, strings: string[]): string {
  const idx = readVU32(buf, cursor);
  if (idx >= strings.length) throw new Error(`binary gazetteer: string index ${idx} out of range`);
  return strings[idx];
}

function invertShape(code: number): Gazetteer['shape'] | undefined {
  return (['undefined', 'scaffolding', 'contributions', 'language'][code] || undefined) as Gazetteer['shape'];
}

function invertKind(code: number): Gazetteer['kind'] | undefined {
  return (['undefined', 'point', 'boundary', 'language'][code] || undefined) as Gazetteer['kind'];
}

// readNode / readSource / readNormalize / readContributions / readPolygon /
// readGeometry / readI32 — straightforward mirrors. Implement them; they should
// total ~80-120 lines.

function readI32LE(buf: Buffer, cursor: { offset: number }): number {
  const v = buf.readInt32LE(cursor.offset);
  cursor.offset += 4;
  return v;
}

function readNode(buf: Buffer, cursor: { offset: number }, strings: string[]): GazetteerNode {
  const flags = buf[cursor.offset++];
  const typeCode = buf[cursor.offset++];
  let type: GazetteerNode['type'];
  if (typeCode === 0) type = 'world';
  else if (typeCode === 1) type = 'continent';
  else if (typeCode === 2) type = 'country';
  else if (typeCode === TYPE_ADMIN_VARIABLE) type = readVarstring(buf, cursor, strings) as GazetteerNode['type'];
  else throw new Error(`binary gazetteer: unknown type code ${typeCode}`);

  const name = readVarstring(buf, cursor, strings);
  const latI = readI32LE(buf, cursor);
  const lonI = readI32LE(buf, cursor);

  const node: GazetteerNode = { name, type, lat: latI / 1e6, lon: lonI / 1e6 };

  if (flags & 0x01) {
    const count = readVU32(buf, cursor);
    const aliases: string[] = [];
    for (let i = 0; i < count; i++) aliases.push(readVarstring(buf, cursor, strings));
    node.aliases = aliases;
  }
  if (flags & 0x08) {
    const sy = readI32LE(buf, cursor);
    const ey = readI32LE(buf, cursor);
    if (sy !== -2147483648) node.startYear = sy;
    if (ey !== -2147483648) node.endYear = ey;
  }
  if (flags & 0x04) node.geometry = readGeometry(buf, cursor);
  if (flags & 0x02) {
    const count = readVU32(buf, cursor);
    const children: GazetteerNode[] = [];
    for (let i = 0; i < count; i++) children.push(readNode(buf, cursor, strings));
    node.children = children;
  }
  return node;
}

function readGeometry(buf: Buffer, cursor: { offset: number }): GazetteerGeometry {
  const t = buf[cursor.offset++];
  if (t === 1) {
    return { type: 'Polygon', coordinates: readPolygon(buf, cursor) };
  } else if (t === 2) {
    const count = readVU32(buf, cursor);
    const polys: number[][][][] = [];
    for (let i = 0; i < count; i++) polys.push(readPolygon(buf, cursor));
    return { type: 'MultiPolygon', coordinates: polys };
  }
  throw new Error(`binary gazetteer: unknown geometry type code ${t}`);
}

function readPolygon(buf: Buffer, cursor: { offset: number }): number[][][] {
  const ringCount = readVU32(buf, cursor);
  const rings: number[][][] = [];
  for (let r = 0; r < ringCount; r++) {
    const pointCount = readVU32(buf, cursor);
    const ring: number[][] = [];
    let lastLat = 0, lastLon = 0;
    for (let p = 0; p < pointCount; p++) {
      const dLat = readI32LE(buf, cursor);
      const dLon = readI32LE(buf, cursor);
      lastLat += dLat;
      lastLon += dLon;
      // GeoJSON convention: [lon, lat]
      ring.push([lastLon / 1e6, lastLat / 1e6]);
    }
    rings.push(ring);
  }
  return rings;
}

function readSource(buf: Buffer, cursor: { offset: number }, strings: string[]): GazetteerSource {
  const name = readVarstring(buf, cursor, strings);
  const url = readVarstring(buf, cursor, strings);
  const license = readVarstring(buf, cursor, strings);
  const created = readVarstring(buf, cursor, strings);
  const fetched = readVarstring(buf, cursor, strings);
  const kgmid = readVarstring(buf, cursor, strings);
  const out: GazetteerSource = { name, url, license, fetched };
  if (created) out.created = created;
  if (kgmid) out.kgmid = kgmid;
  return out;
}

function readNormalize(buf: Buffer, cursor: { offset: number }, strings: string[]): GazetteerNormalizeRules {
  return {
    stripSuffixes: readStringArray(buf, cursor, strings),
    stripPatterns: readStringArray(buf, cursor, strings),
    stripPrefixes: readStringArray(buf, cursor, strings),
  };
}

function readStringArray(buf: Buffer, cursor: { offset: number }, strings: string[]): string[] {
  const count = readVU32(buf, cursor);
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(readVarstring(buf, cursor, strings));
  return out;
}

function readContributions(
  buf: Buffer,
  cursor: { offset: number },
  strings: string[],
): NonNullable<Gazetteer['contributions']> {
  const count = readVU32(buf, cursor);
  const out: NonNullable<Gazetteer['contributions']> = [];
  for (let i = 0; i < count; i++) {
    const parentPath = readStringArray(buf, cursor, strings);
    const nodeCount = readVU32(buf, cursor);
    const nodes: GazetteerNode[] = [];
    for (let n = 0; n < nodeCount; n++) nodes.push(readNode(buf, cursor, strings));
    out.push({ parentPath, nodes });
  }
  return out;
}
```

The code above is intentionally long because the plan is the spec. The implementer should treat this as the contract. Place it in `src/gazetteer-build/binary-codec.ts` verbatim, then iterate to satisfy the tests.

- [ ] **Step 2: Run the tests**

```bash
npx vitest run tests/unit/gazetteer-binary-codec.test.ts
```

Expected: all 6 tests pass. Fix codec until they do.

- [ ] **Step 3: Run the smoke test against every real gazetteer**

Add a one-shot script (do not commit):

```bash
npx tsx -e "
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeGazetteer, decodeGazetteer } from './src/gazetteer-build/binary-codec.ts';
const dir = resolve('src/api/place-gazetteers/data');
let totalJson = 0, totalBin = 0;
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.json')) continue;
  const json = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
  const bin = encodeGazetteer(json);
  const decoded = decodeGazetteer(bin);
  if (decoded.id !== json.id) throw new Error('id mismatch ' + f);
  if (decoded.name !== json.name) throw new Error('name mismatch ' + f);
  totalJson += readFileSync(resolve(dir, f)).length;
  totalBin += bin.length;
  console.log(f.padEnd(45), (readFileSync(resolve(dir, f)).length/1024).toFixed(0).padStart(6), 'KB →', (bin.length/1024).toFixed(0).padStart(6), 'KB');
}
console.log('TOTAL', (totalJson/1024/1024).toFixed(1), 'MB →', (totalBin/1024/1024).toFixed(1), 'MB');
"
```

Record the totals in measurements.md. Expected: meaningful reduction (target 50%+ vs raw JSON).

- [ ] **Step 4: Commit the codec**

```bash
git add src/gazetteer-build/binary-codec.ts
git commit -m "feat(gazetteer): add binary codec for compact bundled format"
```

---

### Task 6: Wire the binary codec into the Vite build

**Files:**
- Modify: `vite.main.config.ts`
- Modify: `vite.worker.config.ts` (comment update only)

**Goal:** Replace the gzip-on-build plugin with a binary-emit plugin so packaged builds ship `.glb` instead of `.json.gz`.

- [ ] **Step 1: Replace the plugin in `vite.main.config.ts`**

Edit `vite.main.config.ts`:

```ts
// at top
import { encodeGazetteer } from './src/gazetteer-build/binary-codec';
// drop:  import { gzipSync } from 'node:zlib';

// inside plugins array:
{
  name: 'emit-bundled-gazetteers-binary',
  closeBundle() {
    mkdirSync(gazetteerDestDir, { recursive: true });
    for (const file of readdirSync(gazetteerSrcDir)) {
      if (!file.endsWith('.json')) continue;
      const json = JSON.parse(readFileSync(resolve(gazetteerSrcDir, file), 'utf8'));
      const bin = encodeGazetteer(json);
      const id = file.replace(/\.json$/, '');
      writeFileSync(resolve(gazetteerDestDir, `${id}.glb`), bin);
    }
  },
},
```

- [ ] **Step 2: Update the comment in `vite.worker.config.ts`**

Change the docblock at the top to reference `.glb` instead of `.json.gz` so a future reader doesn't get misdirected.

- [ ] **Step 3: Build to verify**

```bash
npm run package
ls -lh out/.../app.asar.unpacked 2>/dev/null
ls -lh .vite/build/gazetteers/
```

Expected: 34 `.glb` files, total size markedly smaller than the previous 6.4 MB gzipped total. Record in measurements.md.

- [ ] **Step 4: Commit**

```bash
git add vite.main.config.ts vite.worker.config.ts
git commit -m "build: emit gazetteers as packed binary (.glb) instead of gzipped JSON"
```

---

### Task 7: Switch runtime loader to prefer `.glb`

**Files:**
- Modify: `src/api/place-gazetteers/bundled.ts`

**Goal:** `loadGazetteer` reads `.glb` if present, falls back to `.json.gz` (for any in-flight build), then raw `.json` (for vitest / direct-source consumers).

- [ ] **Step 1: Replace `loadGazetteer`**

In `bundled.ts`, replace the body of `loadGazetteer` and the imports section:

```ts
// At top of file, alongside existing imports
import { decodeGazetteer } from '../../gazetteer-build/binary-codec';

// Replace the loadGazetteer function:
function loadGazetteer(id: string): Gazetteer {
  const binPath = resolve(HERE, 'gazetteers', `${id}.glb`);
  if (existsSync(binPath)) {
    return decodeGazetteer(readFileSync(binPath));
  }
  // Transitional fallback: previously we shipped gzipped JSON. Kept so a
  // user with a partially-rebuilt .vite/build still works.
  const gzPath = resolve(HERE, 'gazetteers', `${id}.json.gz`);
  if (existsSync(gzPath)) {
    return JSON.parse(gunzipSync(readFileSync(gzPath)).toString('utf8')) as Gazetteer;
  }
  // Source fallback: vitest, dev runners, anything reading directly from
  // src/api/place-gazetteers/data/.
  const rawPath = resolve(HERE, 'data', `${id}.json`);
  return JSON.parse(readFileSync(rawPath, 'utf8')) as Gazetteer;
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

All ~2120 tests must pass. Failures here mean the binary codec is dropping data the resolver/index relies on.

- [ ] **Step 3: Lint and type-check**

```bash
npm run lint
npx tsc --noEmit 2>&1 | grep "^src/" | head
```

- [ ] **Step 4: Run the packaged app and resolve places**

`npm run package`, launch the binary, open a database, perform Verification step 4 manually (one resolve per major gazetteer).

- [ ] **Step 5: Capture installer sizes, idle RAM, cold start**

Append `## After Task 7 (binary loader)` section to measurements.md.

- [ ] **Step 6: Commit**

```bash
git add src/api/place-gazetteers/bundled.ts
git commit -m "feat(gazetteer): runtime loader prefers binary .glb over JSON"
```

---

### Task 8: Statement cache audit — `src/api/media_consolidate.ts`

**Files:**
- Modify: `src/api/media_consolidate.ts` (only if a leak is found)

**Goal:** Every `db.prepare()` site has a guaranteed finalize. Use the `sqlite-finalize` skill's patterns.

- [ ] **Step 1: Read the file and inventory each `db.prepare()`**

Read `src/api/media_consolidate.ts` end-to-end. For each `db.prepare(`, write down:
- Line number
- Whether it's wrapped in `try { ... } finally { stmt.finalize() }` or in a `withStatementCache` block
- Whether the result is assigned to a const that's reused (statement cache pattern) or single-use (helper-function-eligible)

- [ ] **Step 2: Fix any single-use prepare without finalize**

If a `db.prepare(...)` is used only to run one query, rewrite to use the appropriate helper from `src/api/db.ts` (`queryOne` / `queryAll` / `runSql` / `runSqlChanges`). Import the helper if not already imported.

- [ ] **Step 3: Verify any cached statement is finalized at end of operation**

If there's a `withStatementCache`-style pattern (cache-then-loop-then-finalize-all), confirm the finalize-all step exists at the end. If not, add it.

- [ ] **Step 4: Run media-related tests**

```bash
npx vitest run tests/unit/media tests/unit/media_consolidate
```

- [ ] **Step 5: Commit if any change was made**

If no change was needed, note "no leaks found in media_consolidate.ts" in measurements.md and move on.

```bash
git add src/api/media_consolidate.ts
git commit -m "fix(media): finalize prepared statements in <function> to avoid WASM heap leak"
```

---

### Task 9: Statement cache audit — `src/api/db_settings.ts`

Same pattern as Task 8 against `src/api/db_settings.ts`. Likely a no-op (it's small and old), but verify.

- [ ] **Step 1: Inventory + fix + verify** (same shape as Task 8 steps 1-3)
- [ ] **Step 2: Run tests** — `npx vitest run tests/unit/db_settings`
- [ ] **Step 3: Commit if changed**

---

### Task 10: Statement cache audit — `src/api/media.ts`

Same pattern as Task 8 against `src/api/media.ts`. This file is bigger and has more direct prepares, so expect to find at least one issue.

- [ ] **Step 1: Inventory + fix + verify**
- [ ] **Step 2: Run tests** — `npx vitest run tests/unit/media`
- [ ] **Step 3: Commit if changed**

---

### Task 11: Statement cache audit — `src/import/gedcom/import-core.ts`

Same pattern. This is a hot path — bulk imports thousands of rows — so verify `withStatementCache` is in use and the cache is finalized.

- [ ] **Step 1: Inventory + fix + verify** (extra attention: any `for (const row of rows) { db.prepare(... ).run(...); }` is a leak)
- [ ] **Step 2: Run a 10k-person import test**

```bash
# Use a fixture if one exists; otherwise import a real-world GEDCOM
# from tests/fixtures/gedcom/ via the import:gedcom IPC manually.
npx vitest run tests/unit/gedcom-import
```

- [ ] **Step 3: Commit if changed**

---

### Task 12: Statement cache audit — `src/import/genney/transform.ts`

Same pattern. Same hot-path attention.

- [ ] **Step 1: Inventory + fix + verify**
- [ ] **Step 2: Run tests** — `npx vitest run tests/unit/genney`
- [ ] **Step 3: Commit if changed**

---

### Task 13: WASM heap leak smoke test

**Files:**
- (No code change — this is a runtime verification step.)

**Goal:** Prove the audit fixed any latent leak by running a real bulk import and watching heap use.

- [ ] **Step 1: Capture pre-import WASM heap**

Launch the packaged app, open or create a fresh database, take a baseline snapshot. The dev MCP tool `mcp__slaktforskning-dev__app_status` may report DB stats; otherwise log in `src/main/db-worker.ts` after `Database` open.

- [ ] **Step 2: Import a large GEDCOM**

Use a 10k-person GEDCOM fixture (any from `tests/fixtures/gedcom/`).

- [ ] **Step 3: Capture post-import WASM heap**

If heap grew by less than ~5 MB above the predicted DB size for the import, no leak. If it grew significantly more, dig in (run with `node --inspect` and look at heap retainers).

- [ ] **Step 4: Record measurements + commit**

Append findings to measurements.md. No code change here unless Step 3 surfaces a new leak.

```bash
git add docs/plans/bundle-and-memory-reduction.measurements.md
git commit -m "chore: record post-audit WASM heap measurements"
```

---

### Task 14: Final verification + final measurements + decide on follow-up

**Files:**
- Modify: `docs/plans/bundle-and-memory-reduction.measurements.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`

**Goal:** Confirm all 7 verification items from the preamble. Decide whether a follow-up lazy + LRU + pre-warm plan is needed.

- [ ] **Step 1: Re-run full verification suite**

For each of the 7 verification items in the preamble: capture the value, write it next to the baseline.

| Metric | Baseline | Final | Δ |
|---|---|---|---|
| macOS .zip installer | … | … | … |
| Windows .exe installer | … | … | … |
| Linux .deb installer | … | … | … |
| Idle RAM (sum of processes) | … | … | … |
| Cold start (median of 3) | … | … | … |
| `npm test` count + pass | … green | … green | — |
| `npm run test:e2e` | green | green | — |
| Place resolution smoke (34 gazetteers) | green | green | — |

- [ ] **Step 2: Decide on follow-up**

If post-plan idle RAM is within target (target: pre-plan minus ≥20 MB), declare success. Otherwise, write a one-line note in measurements.md saying "lazy + LRU + pre-warm follow-up indicated — see new plan: …" and create a stub plan file `docs/plans/lazy-gazetteer-loading.md` (do NOT implement in this plan).

- [ ] **Step 3: Update CHANGELOG.md**

Add an `## Unreleased` block summarizing the user-observable change. Examples:

```md
## Unreleased

### Changed
- Smaller installer (–X MB) and lower idle memory (–Y MB) by switching the
  bundled place gazetteers from gzipped JSON to a packed binary format.
- Tightened packaged-app contents to exclude tests, build scripts, and docs
  that aren't needed at runtime.

### Fixed
- Closed several SQLite prepared-statement leaks in import paths that could
  grow the WASM heap during very large GEDCOM imports.
```

- [ ] **Step 4: Bump version**

Per project convention, "any feature → minor". Binary gazetteer format is a meaningful internal feature even though no UI changed. Bump in `package.json` (e.g. `0.231.0`). Run `npm install` to update lock file.

- [ ] **Step 5: Run the project's full pre-commit gates**

```bash
npm run lint
npm test
```

Both green.

- [ ] **Step 6: Self-review checklist**

- [ ] All 7 verification items pass
- [ ] All `[ ]` checkboxes in this plan are now `[x]`
- [ ] `package.json` version bumped
- [ ] `CHANGELOG.md` Unreleased entry written
- [ ] Plan file moved to `docs/plans/archive/` via `git mv`
- [ ] `docs/plans/archive/PLAN.md` updated with one-paragraph entry
- [ ] No `[done]` entries left in `docs/PLAN.md` (this plan was probably never in `docs/PLAN.md` since it's a follow-up; if it was, remove)

- [ ] **Step 7: Commit + archive**

```bash
git mv docs/plans/bundle-and-memory-reduction.md docs/plans/archive/
git mv docs/plans/bundle-and-memory-reduction.measurements.md docs/plans/archive/
git add CHANGELOG.md package.json package-lock.json docs/plans/archive/PLAN.md
git commit -m "chore: archive completed bundle-and-memory-reduction plan + bump version"
```

---

## Failure modes / RCA reference

This plan was written against four classes of past pain:

1. **`feedback_no_gazetteer_frankensteins.md` (memory).** A binary codec that "helpfully" cleans up data while encoding is a Frankenstein. The codec is a pure structural transformation — names in, names out, no rules applied.
2. **`feedback_gazetteers_are_build_outputs.md` (memory).** The 34 JSON files in `data/` stay as authored truth. `.glb` files are derived; never commit them, never edit them, never read them as the source of truth in dev/test.
3. **`.claude/rules/api.md` "SQLite bulk-write performance" + `sqlite-finalize` skill.** Every prepared statement leaks WASM heap until finalized. The audit (Tasks 8-12) is mandatory hygiene that's been violated before in this codebase (v0.210.x range had multiple bulk-import leaks).
4. **The `superpowers:writing-plans` rule "exact code, no placeholders".** This plan over-specifies the binary codec on purpose because a fresh subagent should not be designing the byte layout from scratch; they should be implementing the contract.

If a future subagent finds the binary format is too rigid (a contributor adds a new optional `GazetteerNode` field), the right fix is to bump the version magic to `SLG2`, write a v2 codec alongside, and have `decodeGazetteer` switch on version. Do NOT add silent skip-on-unknown-flag logic — that's a Frankenstein in waiting.
