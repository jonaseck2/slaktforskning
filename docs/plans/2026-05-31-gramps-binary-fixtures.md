# 2026-05-31 — Gramps native binary importer fixtures

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

> **Origin:** unblocked half of the closed [2026-05-14-importer-binary-fixtures.md](archive/2026-05-14-importer-binary-fixtures.md) plan. Holger + RootsMagic halves closed as contributor-driven (paid Windows software). Gramps is open-source, free, multi-platform — the maintainer can author these fixtures directly, so this work is real and bounded.

## User goal

When a regression lands in the Gramps native binary decoding path — the `.gramps` (gzipped XML) extraction or the `.gpkg` (XML + media, zipped) unpack-and-remap-media branch — **a test fails in CI before the user notices broken import**. Today the `imports` e2e project covers Gramps' GEDCOM-export path through our GEDCOM importer's `profile='gramps'` dialect, but the native binary decoder layer that runs when a user picks a `.gramps` or `.gpkg` in the file picker has no e2e coverage. That layer has historically broken silently across Tauri-port / ESM / async sweeps and only surfaced when a user tried a real Gramps file.

## Scope

Two new e2e cases in `tests/e2e/imports.spec.ts`, each backed by a tiny native binary fixture authored by running Gramps locally. After this plan ships, the e2e `imports` project has coverage for both Gramps native decoder paths.

| Fixture | File | Importer entry path | Approx. size |
|---|---|---|---|
| Gramps `.gramps` (XML, gzipped) | `tests/e2e/fixtures/imports/gramps-small.gramps` | `import.grampsRun` → `.gramps` branch | ~3 KB |
| Gramps `.gpkg` (XML + media, zipped) | `tests/e2e/fixtures/imports/gramps-small.gpkg` | `import.grampsRun` → `.gpkg` unpack + media remap | ~10 KB |

Each fixture contains exactly **3 persons** with one event each (birth) and one media file in the `.gpkg` case (a 1×1 px PNG placeholder). Person-count assertion in the e2e step is `count === 3`.

> **⚠️ Task 2 (.gpkg) prerequisite — resolved 2026-06-06.** Executing this plan surfaced that the `.gpkg` native-decoder branch it assumed **did not exist**: the importer only gunzip-or-utf8'd → parsed as XML, with no tar/zip extraction. A zip-form `.gpkg` imported nothing (silently); a tar.gz-form parsed XML by accident and dropped every media file. That branch is now implemented by [2026-06-06-gramps-gpkg-archive-import.md](archive/2026-06-06-gramps-gpkg-archive-import.md) (tar.gz unpack via nanotar → media written into `<dbname>-media/` with relative `file_ref`). Task 2 is therefore now executable — **with one correction: build the `.gpkg` fixture as a tar.gz (`tar czf`), NOT a zip (`zip -r`).** Real Gramps writes tar.gz; the importer expects it. Update Task 2's Step 3 commands accordingly when this plan is resumed.

### Scope deviations

- **No new importer code.** This plan adds fixtures + activates test cases only. For `.gpkg` this assumption proved wrong — the missing native-decoder branch was an unimplemented feature, not a regression, and was delivered by a separate plan (see the note above) before this plan's Task 2 can pass. The plan's verification (item 5) explicitly includes deliberate-red verification proving the e2e load-bearing.
- **Family Tree Maker (.ftm) is out of scope** — no FTM importer exists.
- **Holger (.zip+media) and RootsMagic (.rmtree) are closed as contributor-driven** — see archive entry for the original plan. The `// Deferred coverage` comment in `imports.spec.ts` gets re-shaped to read as a contributor-issue trigger (not maintainer backlog) as part of Task 3 below.

## Verification

### User-observable

1. `npx playwright test --project=imports --grep gramps-gramps` runs as a real test (not skipped, not TODO) and passes against the new `.gramps` fixture: the importer reports `count === 3` and the imported person names match the fixture's names.
2. Same for `npx playwright test --project=imports --grep gramps-gpkg` against the `.gpkg` fixture, additionally asserting the one media row exists post-import with a relative `file_ref` matching `<dbname>-media/...` per [.claude/rules/media.md](../../.claude/rules/media.md).
3. The `// Deferred coverage` comment in `tests/e2e/imports.spec.ts` no longer mentions `.gramps` or `.gpkg`. The remaining Holger + RootsMagic deferral is re-shaped as a contributor-issue trigger paragraph (not "TODO add later"), naming concretely what a contributor would need to do.

### Tests that observe the user goal (not structure)

The user goal is "regressions in the native decoder are caught before users notice." That's only verifiable by:

- **Item 1 + 2** above — the cases run as real tests.
- **Deliberate-red verification** — for at least one of the two fixtures, inject a `throw new Error('e2e-canary')` at the top of the importer's native decoder entry point (e.g. the `.gramps` gzip-extract step in `src/import/gramps/`), confirm the e2e test goes red with the canary message, revert. Captured in close-out evidence.

### CI gates (per .claude/rules/plans.md)

- `npm test` — unchanged (no new unit tests in this plan; the importer logic is already covered by the existing `src/import/gramps/` unit tests).
- `npm run build` — exits 0.
- `npm run test:e2e` — Tier 1 still green; the new `imports` cases run as part of the existing `imports` project. Tier 1 vs Tier 2 unchanged.
- `npm run test:e2e:full` — required per the user-goal-touches-importer rule. The new cases live in the `imports` project which is part of `:full`.

### User-goal-falsifiability

If items 1, 2, 3 pass, can the user goal ("regressions caught before users notice") still be unmet? Two failure modes:

- The fixture is too thin to exercise the real decoder code path (e.g. a 3-person `.gpkg` skips a code path that only fires for 100+ persons). **Mitigation:** the deliberate-red verification (above) confirms the test reaches the importer's native-decoder entry — if the canary fires, the path is exercised by 3 persons.
- The fixture diverges from real Gramps output and exercises a parser branch users don't hit. **Mitigation:** the fixture is generated by running real Gramps (5.2+, open-source, free) on the maintainer's machine — not hand-authored XML — so it matches the real output byte-for-byte.

## Failure modes / RCA reference

- **Prior plan** [2026-05-14-importer-binary-fixtures](archive/2026-05-14-importer-binary-fixtures.md) is the parent — read its Verification section for the deliberate-red approach this plan inherits.
- **Adjacent fix** [2026-05-15-genney-e2e-path-resolution](archive/2026-05-15-genney-e2e-path-resolution.md) — when wiring Genney's native binary path, the `read:` prefix on the failure message located the bug in TypeScript-land faster than enumerating Rust-side resource paths. Same diagnostic pattern applies if Gramps fixtures surface a failure.

---

## File structure

| File | Touch type | What changes |
|---|---|---|
| `tests/e2e/fixtures/imports/gramps-small.gramps` | Create | Tiny 3-person Gramps XML export (gzipped) |
| `tests/e2e/fixtures/imports/gramps-small.gpkg` | Create | Tiny 3-person Gramps package with one 1×1 PNG media file |
| `tests/e2e/imports.spec.ts` | Modify | Add `gramps-gramps` and `gramps-gpkg` cases to `CASES`; rewrite the `// Deferred coverage` comment as a contributor-trigger paragraph naming Holger + RootsMagic |
| `.gitattributes` | Modify (if needed) | Mark `*.gramps` and `*.gpkg` as binary (no diff) |

---

## Tasks

### Task 1 (Tier 1): Author the `.gramps` fixture via XML-direct

**Files:**
- Create: `tests/e2e/fixtures/imports/gramps-small.gramps`
- Create (transient): `tests/e2e/fixtures/imports/gramps-small.xml` (deleted after gzip)

Rewritten 2026-05-31 from "use Gramps GUI" to XML-direct authoring. The Gramps XML schema is documented at https://gramps-project.org/wiki/index.php/Gramps_XML and the importer at `src/import/gramps/` already parses it. A 3-person fixture is small enough to hand-author without installing Gramps. Round-trip through the importer is the test that the XML is valid.

- [ ] **Step 1: Write the XML source**

Create `tests/e2e/fixtures/imports/gramps-small.xml` with three persons (Anna + Erik = couple → Lisa). Minimal Gramps XML schema, only fields the importer reads. Inspect `src/import/gramps/index.ts` first to confirm which fields are required vs ignored.

Template (adjust namespaces / version to match what the project's parser accepts — check `src/import/gramps/` for the version string used in tests):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE database PUBLIC "-//Gramps//DTD Gramps XML 1.7.1//EN" "http://gramps-project.org/xml/1.7.1/grampsxml.dtd">
<database xmlns="http://gramps-project.org/xml/1.7.1/">
  <header>
    <created date="2026-05-31" version="5.2.0"/>
    <researcher><resname>slaktforskning-e2e-fixture</resname></researcher>
  </header>
  <people>
    <person handle="_p0001" id="I0001">
      <gender>F</gender>
      <name type="Birth Name"><first>Anna</first><surname>Andersson</surname></name>
      <eventref hlink="_e0001" role="Primary"/>
    </person>
    <person handle="_p0002" id="I0002">
      <gender>M</gender>
      <name type="Birth Name"><first>Erik</first><surname>Andersson</surname></name>
      <eventref hlink="_e0002" role="Primary"/>
    </person>
    <person handle="_p0003" id="I0003">
      <gender>F</gender>
      <name type="Birth Name"><first>Lisa</first><surname>Andersson</surname></name>
      <eventref hlink="_e0003" role="Primary"/>
      <childof hlink="_f0001"/>
    </person>
  </people>
  <families>
    <family handle="_f0001" id="F0001">
      <rel type="Married"/>
      <father hlink="_p0002"/>
      <mother hlink="_p0001"/>
      <childref hlink="_p0003"/>
    </family>
  </families>
  <events>
    <event handle="_e0001" id="E0001"><type>Birth</type><dateval val="1850-01-15"/></event>
    <event handle="_e0002" id="E0002"><type>Birth</type><dateval val="1845-06-20"/></event>
    <event handle="_e0003" id="E0003"><type>Birth</type><dateval val="1875-03-10"/></event>
  </events>
</database>
```

- [ ] **Step 2: Gzip into `.gramps` (gzipped XML is the .gramps format)**

```bash
gzip -c tests/e2e/fixtures/imports/gramps-small.xml > tests/e2e/fixtures/imports/gramps-small.gramps
rm tests/e2e/fixtures/imports/gramps-small.xml
file tests/e2e/fixtures/imports/gramps-small.gramps  # should report: gzip compressed data
```

- [ ] **Step 3: Sanity-check parsing**

```bash
npx tsx -e "
import { importFromGramps } from './src/import/gramps/index.ts';
import { createTestDb } from './tests/helpers.ts';
const db = await createTestDb();
const report = await importFromGramps(db, 'tests/e2e/fixtures/imports/gramps-small.gramps');
console.log(JSON.stringify({ persons: report.persons, events: report.events }));
"
```

Expected: `{"persons":3,"events":3}`. If the importer rejects the XML (schema-version mismatch, missing required field), adjust the template per the error and re-run Step 2. Iterating against the real importer IS the validation that the hand-authored XML matches a real Gramps export's shape for our purposes.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/fixtures/imports/gramps-small.gramps
git commit -m "test(e2e): add gramps-small.gramps fixture (XML-direct, 3 persons)"
```

### Task 2 (Tier 1): Author the `.gpkg` fixture via XML + zip

**Files:**
- Create: `tests/e2e/fixtures/imports/gramps-small.gpkg`

`.gpkg` is a zip containing `data.gramps` (the gzipped XML) + a `media/` subfolder. We reuse Task 1's gzipped XML and bundle it with a 1×1 PNG.

- [ ] **Step 1: Generate a 1×1 PNG**

The minimum-valid PNG is documented in the spec. Use a known-good byte sequence (gunzipped PNG header + IHDR + IDAT + IEND) instead of generating one via a library — agent-completable without Python/PIL:

```bash
# 67-byte minimum-valid 1x1 transparent PNG
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cb\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > /tmp/blank.png
file /tmp/blank.png  # should report: PNG image data, 1 x 1
```

If the printf-byte form is brittle, fallback: download a pre-existing 1×1 PNG from a known source or commit a tiny PNG to `tests/e2e/fixtures/imports/static/blank.png` once and reuse it.

- [ ] **Step 2: Author the XML with a media reference**

Reuse the Task 1 XML, append a `<media>` block referencing `blank.png` and an `<objref>` on Anna's `<person>`:

```xml
<media>
  <object handle="_m0001" id="O0001">
    <file src="blank.png" mime="image/png"/>
  </object>
</media>
```

Add `<objref hlink="_m0001"/>` inside Anna's `<person>`.

Write this expanded XML to `/tmp/gramps-with-media.xml`, then gzip it to `/tmp/data.gramps`.

- [ ] **Step 3: Bundle the zip**

```bash
mkdir -p /tmp/gpkg-build/media
cp /tmp/data.gramps /tmp/gpkg-build/
cp /tmp/blank.png /tmp/gpkg-build/media/
( cd /tmp/gpkg-build && zip -r ../gramps-small.gpkg . )
mv /tmp/gramps-small.gpkg tests/e2e/fixtures/imports/
rm -rf /tmp/gpkg-build /tmp/data.gramps /tmp/gramps-with-media.xml
file tests/e2e/fixtures/imports/gramps-small.gpkg  # should report: Zip archive
unzip -l tests/e2e/fixtures/imports/gramps-small.gpkg  # should show: data.gramps + media/blank.png
```

- [ ] **Step 4: Sanity-check parsing**

```bash
npx tsx -e "
import { importFromGramps } from './src/import/gramps/index.ts';
import { createTestDb } from './tests/helpers.ts';
const db = await createTestDb();
const report = await importFromGramps(db, 'tests/e2e/fixtures/imports/gramps-small.gpkg');
console.log(JSON.stringify({ persons: report.persons, media: report.media }));
"
```

Expected: `{"persons":3,"media":1}`. Adjust XML / zip layout per error if needed.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/fixtures/imports/gramps-small.gpkg
git commit -m "test(e2e): add gramps-small.gpkg fixture (XML-direct + 1x1 PNG)"
```

### Task 3 (Tier 1): Wire the e2e cases + re-shape the deferred-coverage comment

**Files:**
- Modify: `tests/e2e/imports.spec.ts`

- [ ] **Step 1: Read the existing CASES array**

```bash
grep -n 'CASES\|Deferred coverage' tests/e2e/imports.spec.ts
```

Find the `CASES` array definition and the `// Deferred coverage` comment block above it. Confirm the existing pattern for adding a case (file path, expected person count, optional name match).

- [ ] **Step 2: Add two new cases**

Append to `CASES`:

```typescript
{
  format: 'gramps-gramps',
  fixturePath: 'fixtures/imports/gramps-small.gramps',
  expectedPersons: 3,
  expectedNames: ['Anna Andersson', 'Erik Andersson', 'Lisa Andersson'],
},
{
  format: 'gramps-gpkg',
  fixturePath: 'fixtures/imports/gramps-small.gpkg',
  expectedPersons: 3,
  expectedMediaCount: 1,
  expectedNames: ['Anna Andersson', 'Erik Andersson', 'Lisa Andersson'],
},
```

Match the existing case shape — if `expectedMediaCount` isn't a field today, either add it (small typescript update + assertion) or assert media count inline in the test body.

- [ ] **Step 3: Re-shape the `// Deferred coverage` comment**

Replace the existing deferred block with a contributor-trigger paragraph:

```typescript
// ────────────────────────────────────────────────────────────────
// Contributor-driven coverage gaps
// ────────────────────────────────────────────────────────────────
// Two native binary importer paths have no e2e coverage because the
// source apps that produce them are paid Windows software the maintainer
// doesn't run:
//
//   • Holger .zip (with media/ subfolder) — needs Holger 8+ on Windows.
//   • RootsMagic .rmtree                 — needs RootsMagic 9+ on Windows.
//
// If you use either app and want to harden import coverage, please open
// a GitHub issue with a 3-person test fixture attached (similar shape to
// tests/e2e/fixtures/imports/gramps-small.gramps) and we'll wire it in.
// Family Tree Maker (.ftm) is also uncovered because no FTM importer
// exists yet.
```

- [ ] **Step 4: Run the e2e suite**

```bash
npm run test:e2e -- --grep gramps
```

Expected: both new cases pass.

- [ ] **Step 5: Deliberate-red verification**

Inject a canary at the top of `src/import/gramps/index.ts`'s `importFromGramps` function:

```typescript
export async function importFromGramps(db: Database, filePath: string): Promise<...> {
  throw new Error('e2e-canary');  // ← TEMPORARY
  // … rest of function
}
```

Run:

```bash
npm run test:e2e -- --grep gramps
```

Expected: both new cases fail with the canary message in the error output. Revert the canary. Re-run to confirm green.

Capture the red + green outputs for the close-out commit.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/imports.spec.ts
git commit -m "test(e2e): wire Gramps .gramps + .gpkg cases; re-shape native-binary deferred block as contributor trigger"
```

### Task 4 (Tier 1): Close-out via /close-out skill

- [ ] **Step 1** — Invoke `/close-out` skill. The skill walks the 6+1 steps, refuses partial, captures evidence (npm test / npm run build / npm run test:e2e:full output + the deliberate-red verification from Task 3 Step 5). Patch bump per `oss-release` (hygiene/CI work). Skill handles the archive + PLAN.md + CHANGELOG + commit.
```
