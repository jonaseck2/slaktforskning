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

### Scope deviations

- **No new importer code.** This plan adds fixtures + activates test cases only. If a fixture surfaces a real regression, that's a separate small-fix PR; the plan's verification (item 5) explicitly includes deliberate-red verification proving the e2e load-bearing.
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

### Task 1: Author the `.gramps` fixture

**Files:**
- Create: `tests/e2e/fixtures/imports/gramps-small.gramps`

- [ ] **Step 1: Install Gramps locally**

```bash
brew install --cask gramps          # macOS
# or: apt install gramps             # Debian/Ubuntu
# or: download from https://gramps-project.org/
```

Verify with `gramps --version`. Any Gramps 5.x or 6.x release works.

- [ ] **Step 2: Author the 3-person family in Gramps GUI**

Open Gramps → File → New Family Tree → name it `slaktforskning-e2e-fixture`. Add three persons:

| Given name | Surname | Sex | Birth date | Birth place |
|---|---|---|---|---|
| Anna | Andersson | F | 1850-01-15 | Stockholm |
| Erik | Andersson | M | 1845-06-20 | Göteborg |
| Lisa | Andersson | F | 1875-03-10 | Stockholm |

Link Erik + Anna as a couple. Link Lisa as their child. Save.

- [ ] **Step 3: Export as `.gramps` package**

File → Export → "Gramps XML (.gramps)" → choose `tests/e2e/fixtures/imports/gramps-small.gramps`. Confirm the file lands at the expected path.

```bash
ls -la tests/e2e/fixtures/imports/gramps-small.gramps
file tests/e2e/fixtures/imports/gramps-small.gramps
```

Expected: ≤ 10 KB, identified as `gzip compressed data`.

- [ ] **Step 4: Sanity-check it parses through our importer**

```bash
npx tsx -e "
import { importFromGramps } from './src/import/gramps/index.ts';
import { createTestDb } from './tests/helpers.ts';
const db = await createTestDb();
const report = await importFromGramps(db, 'tests/e2e/fixtures/imports/gramps-small.gramps');
console.log('persons:', report.persons, 'events:', report.events);
"
```

Expected: `persons: 3, events: ≥3`.

If it errors out, the fixture is malformed — return to Step 2 and re-export.

- [ ] **Step 5: Commit the fixture**

```bash
git add tests/e2e/fixtures/imports/gramps-small.gramps .gitattributes  # if .gitattributes updated
git commit -m "test(e2e): add gramps-small.gramps fixture (3 persons, 1 family)"
```

### Task 2: Author the `.gpkg` fixture (XML + media)

**Files:**
- Create: `tests/e2e/fixtures/imports/gramps-small.gpkg`

- [ ] **Step 1: In Gramps, attach a 1×1 PNG to Anna Andersson**

In the same family tree from Task 1, open Anna Andersson → Gallery tab → "+" → Add a new media object. Use a 1×1 transparent PNG (generate with `python -c "from PIL import Image; Image.new('RGBA', (1, 1)).save('/tmp/blank.png')"` or any 1×1 PNG you have). Title it "Anna portrait placeholder".

- [ ] **Step 2: Export as `.gpkg`**

File → Export → "Gramps package (.gpkg)" → choose `tests/e2e/fixtures/imports/gramps-small.gpkg`.

```bash
ls -la tests/e2e/fixtures/imports/gramps-small.gpkg
file tests/e2e/fixtures/imports/gramps-small.gpkg
unzip -l tests/e2e/fixtures/imports/gramps-small.gpkg  # should show data.gramps + media file
```

Expected: ≤ 20 KB. Identified as `Zip archive`. Contents include both the XML file and the media PNG.

- [ ] **Step 3: Sanity-check it imports through the .gpkg branch**

```bash
npx tsx -e "
import { importFromGramps } from './src/import/gramps/index.ts';
import { createTestDb } from './tests/helpers.ts';
const db = await createTestDb();
const report = await importFromGramps(db, 'tests/e2e/fixtures/imports/gramps-small.gpkg');
console.log('persons:', report.persons, 'media:', report.media);
"
```

Expected: `persons: 3, media: 1`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/fixtures/imports/gramps-small.gpkg
git commit -m "test(e2e): add gramps-small.gpkg fixture (3 persons + 1 media)"
```

### Task 3: Wire the e2e cases + re-shape the deferred-coverage comment

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

### Task 4: Close-out

- [ ] **Step 1: Full verification suite**

```bash
npm test
npm run build
npm run test:e2e:full
```

Capture summary lines for the close-out commit per `.claude/rules/plans.md`.

- [ ] **Step 2: Archive the plan**

```bash
git mv docs/plans/2026-05-31-gramps-binary-fixtures.md docs/plans/archive/
```

Update `docs/PLAN.md` (remove from Planned) and append an entry to `docs/plans/archive/PLAN.md` summarizing what shipped + the deliberate-red evidence.

- [ ] **Step 3: Version bump + CHANGELOG block**

Patch bump (this is hygiene/CI work, not user-facing feature) per `oss-release` skill. Add a CHANGELOG block.

- [ ] **Step 4: Final commit**

```bash
git add CHANGELOG.md package.json docs/plans/archive/2026-05-31-gramps-binary-fixtures.md docs/PLAN.md docs/plans/archive/PLAN.md
git commit -m "chore: archive 2026-05-31-gramps-binary-fixtures

Verification evidence:
- npm test → N passed (Xs)
- npm run build → built in Xs (exit 0)
- npm run test:e2e:full → N passed (Xs) across 7 projects; +2 cases in [imports]
- Deliberate-red: e2e-canary in importFromGramps → both new cases red; revert → both green
"
```
