# Normalize-Boundary Accounting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the import report accounts for every node in the *parsed* GEDCOM tree, including the nodes `normalize.ts` rewrites or removes for a 7.0 file.

**Architecture:** `normalize.ts` rebuilds the tree before the accounting session opens, so the gate walks a tree whose node identities no phase marked. This plan records, for every node `normalize.ts` derives, the node it came from (a provenance map). Marking a derived node then marks its origin, and the gate walks the original tree. The session opens before `detect.ts` and `normalize.ts` so their reads count too.

**Tech Stack:** TypeScript, Vitest, node-sqlite3-wasm.

**Spec:** Part A ("Accounting across the normalize boundary") of [2026-08-23-import-tag-accounting-design.md](2026-08-23-import-tag-accounting-design.md). Part C of that spec (verbatim capture) depends on this plan and is not in it.

## Global Constraints

- **Prime Directive (cont.) clause 1:** the importer accounts for every node in the *parsed* tree. A node is accounted for when a phase reads it or the report names it.
- **Prime Directive:** this plan persists nothing. Provenance lives in memory for one import session.
- `.claude/rules/performance.md`: no extra tree walk per import. `markConsumed` stays O(1) per call. Provenance chains collapse to the root origin, so a mark is two `Set.add` calls at most.
- `.claude/rules/worktrees.md`: `git -C <path>`, `npm --prefix <path>`. Vitest needs `--root <abs-worktree-path>`.
- Stage **by explicit path**. `git add -A` is blocked by a hook.
- `/export-import/` is gitignored real family data. Never commit it and never copy it into `tests/fixtures/`. The 7.0 fixture is synthetic.
- No schema column is added, so no `gedcom_fidelity_registry.ts` entry is needed.
- Commits on the worktree branch may be red between T01 and T04. Nothing reaches `main` until T06.

---

## User goal

A researcher who imports a GEDCOM 7.0 file is told which parts the app did not read, exactly as a 5.5.1 researcher is. A shared note's translation, an external identifier's extra fields and a duplicated given name no longer disappear without a line in the report.

## What the code says today (measured 2026-11-07)

The spec was written 2026-08-23. These figures were re-measured on `main` at `aefc52c5`.

| Claim in the spec | Measured |
|---|---|
| The probe loses `SNOTE.LANG` and `SNOTE.TRAN` | `SNOTE.TRAN` and `.TRAN.LANG` are lost. `SNOTE.LANG` is **read** (`phases/notes.ts:46-50` stores it as the note language), so the spec's "expected new finding `SNOTE.LANG`" is stale. |
| Gated fixtures: 20, with 0 at GEDCOM 7.0 | 20 files. 0 reach `normalize`. `dialects/family-historian.ged` says `VERS 7.0.13`, and `detect.ts:12` matches only the exact string `7.0`, so it detects as `unknown`. |
| The gate has never run with normalize active | True for CI. False for the census script. 22 of the 45 real `.ged` files say `VERS 7.0` exactly (all in `export-import/samples/familysearch-gedcom7/`). Of those 45 files, 3 carry a top-level `SNOTE`, 1 carries `TRAN`, 1 carries `EXID`, 3 carry `PHRASE`. |
| Census: 742 paths over 36 sample files | 690 paths over 36 sample files. Later plans (dialect review, AD profile) declared the rest. |
| Marks on original nodes match nothing | Confirmed in live output. The census reports `INDI.NAME.TRAN` and `SOUR.DATA.EVEN.PLAC.TRAN` (2 each), although `phases/translations.ts` reads both. Those are false positives from the identity split. |
| Verification 3 (5.5.1 `unaccountedFor` unchanged) and Verification 6 (`HEAD.GEDC` now read) | These two contradict each other. `detect.ts` marks `HEAD.GEDC` and `HEAD.GEDC.VERS` in 5.5.1 files too, so the raw list shrinks by exactly those two paths. T01 pins the baseline and T04 asserts that exact difference. |

## Scope

Every `normalize.ts` transformation is a target. There are seven.

| # | Transformation | Provenance rule |
|---|---|---|
| 1 | `buildSnoteMap` + top-level SNOTE filter | the SNOTE record is marked when read. Its children stay unmarked unless a phase reads them. |
| 1b | `inlineSnotes` | the new `NOTE` is derived from the pointer node |
| 2 | `convertExidToRefn` | the new `REFN` is derived from `EXID`. The new `TYPE` is derived from the old one. |
| 4 | `lowercaseTypeValues` | spread copy derived from its origin |
| 5 | `dropConcNodes` | spread copy derived from its origin |
| 6 | `applyDatePhrase` | spread copy derived from its origin. `PHRASE` is marked only when its text replaced the value. |
| 7 | `mergeMultipleGivnSurn` | the merged node is derived from the first duplicate. Other duplicates stay unmarked. |

(Transformation 3 was removed by T07 of the translations work. Its comment block stays.)

Other readers outside the phases: `detect.ts` (reads `HEAD.GEDC.VERS` with raw `.find`) moves onto `node-utils`.

### Scope deviations

- **Verbatim capture (spec Part C) is out of scope.** It depends on this plan, because capture reads the same unaccounted set. Owner: a plan written from Part C after this one archives.
- **Modelling shared-note translations is out of scope.** `SNOTE.TRAN` is declared `unmapped:pending-unmapped-capture`, the existing home for authored data awaiting capture. A `note_translations` table would be a separate plan with its own registry entries.
- **`detect.ts` rejects `VERS 7.0.x` — in scope, fixed in T04.** A file saying `7.0.13` was never normalized, so its SNOTE pointers were not inlined. The user decided the rule (2026-11-07, semver): `7.0.x` is a backwards-compatible patch of 7.0, `7.1` is a minor that extends 7, `8` is not backwards compatible. `detectGedcomVersion` applies that rule by major and holds no list of version strings: majors 5 and 7 are supported, every other major is `'unknown'`. Before this plan only the exact strings `7.0`, `5.5`, `5.5.1` and `5.5.5` matched. **One visible change:** the import report shows the version the file declares. A `5.5` file now reads `GEDCOM 5.5`, where it read `GEDCOM 5.5.1` before. `tests/unit/gedcom-detect.test.ts` (`detects 5.5 as 5.5.1`) and `import-gedcom-reporting.test.ts:751` change with it. Tags that 7.1+ adds and the importer does not read reach the accounting report, so a minor-version extension is named and not dropped. The fix changes DB output for `family-historian.ged` and any real 7.0.1+ file. T04 records that import-output diff in its commit.
- **Closed-schema coverage, the parser malformed-line counter and the `.children` lint rule** (spec Part A items not listed in the spec's "Part 1-3") stay unshipped. They are in the spec's reconciliation table and need their own plan.

## Verification

1. **The probe is a test.** A 7.0 file with a SNOTE carrying `LANG` and `TRAN` reports `SNOTE.TRAN` and `SNOTE.TRAN.LANG` in `unaccountedFor` and does not report `SNOTE.LANG`.
2. **The gate reaches normalize.** The gated corpus contains at least one fixture for which `detectGedcomVersion` returns `'7.0'`.
3. **5.5.1 is stable.** For each of the 20 existing fixtures, the raw `unaccountedFor` list equals the pinned baseline minus `HEAD.GEDC` and `HEAD.GEDC.VERS`.
4. **Provenance is complete.** On the 7.0 fixture, every node a phase reads is marked in the original tree. No false positive remains.
5. **The guard can fail.** A derived node built without `recordOrigin` makes its origin report as unaccounted.
6. **Declarations shrink.** `HEAD.GEDC` and `HEAD.GEDC.VERS` are deleted from `accounting-declared.ts` and the gate stays green. The reasons for `HEAD.CHAR`, `*.NAME.GIVN` and `*.NAME.SURN` are corrected.
7. **The census gets smaller by the false positives.** `scripts/accounting-over-samples.ts export-import/samples` no longer lists `INDI.NAME.TRAN` or `SOUR.DATA.EVEN.PLAC.TRAN`. It gains `SNOTE.*` paths only where the 7.0 samples carry them. Both path counts are pasted into the close-out commit.
8. **Real-user check.** `npm run test:e2e:full` passes across all 8 projects. The importer changed, so `[imports]` is required.

**User-goal-falsifiability check:** if 1-8 pass, can the goal still be unmet? Yes, in two ways. A 7.0 transformation the fixture does not exercise could still drop a node (mitigated by one fixture covering all seven rows above and by the inverted failure direction). A 7.1 file carries a tag the importer has never seen. It is reported and not captured, until Part C lands.

## Review Focus

1. **`applyDatePhrase` marks too much.** Its `getChild(child, 'PHRASE')` would mark `PHRASE` as read even when the DATE already has a value and the phrase is dropped. Expected: that `PHRASE` is reported. Test in T03.
2. **A node derived twice.** `inlineSnotes` then `lowercaseTypeValues` then `dropConcNodes` stack three derivations. Expected: marking the final node marks the parsed origin once. Test in T02.
3. **A dangling SNOTE pointer** (`1 SNOTE @N9@` with no record). Expected: the import finishes, the empty `NOTE` is derived from the pointer, no crash. Test in T04.
4. **`normalize` or `detect` throws before the `try`.** Expected: the next import does not fail with "a session is already active". Test in T04.
5. **Event-level and FAM-level SNOTE pointers** (`INDI.BIRT.SNOTE`, `FAM.SNOTE`). `phaseNoteLinks` reads only top-level INDI/SOUR/REPO/OBJE pointers and skips FAM. Expected: either the inlined `NOTE` read marks the pointer through provenance, or the pointer is reported. Silence is the failure. Test in T04.

## Failure modes / RCA reference

- A gate whose corpus never reaches the code under test (spec "Failure modes"). T01 adds the reach assertion.
- Two identity spaces with no test across the seam. The live proof is `INDI.NAME.TRAN` in the census.
- `excluded` used to hide a mechanism limit. Four declarations say "before the session". T05 deletes two and corrects two.
- Fixing the instance instead of the class. `inlineSnotes` is not patched alone. All seven rows go through one `derive` helper.

---

## File Structure

- Modify `src/import/gedcom/tag-accounting.ts`: provenance map, `recordOrigin`, chain-following `markConsumed`.
- Modify `src/import/gedcom/normalize.ts`: remove the private `getChild`/`getChildren`, add `derive`, record provenance in every rebuild.
- Modify `src/import/gedcom/detect.ts`: read through `node-utils`, and treat every the declared version string, supported by major (5 and 7) per semver, and add `gedcomMajor`.
- Modify `src/import/gedcom/import-core.ts` (about line 452-472): open the session earlier, walk the original tree.
- Modify `src/import/gedcom/phases/notes.ts:46-50`: mark the SNOTE record.
- Modify `src/import/gedcom/accounting-declared.ts`: declarations.
- Create `tests/fixtures/gedcom/gedcom7-normalize.ged`.
- Create `tests/fixtures/gedcom/accounting-baseline-551.json`.
- Create `tests/unit/import-normalize-accounting.test.ts`.
- Modify `tests/unit/import-tag-accounting.test.ts`: reach guard, baseline comparison.
- Modify `tests/unit/import-tag-accounting-declared.test.ts`: declaration changes.

## Tasks

### Task 1 (Tier 1): The 7.0 fixture, the pinned baseline and the red gate

**Files:**
- Create: `tests/fixtures/gedcom/gedcom7-normalize.ged`, `tests/fixtures/gedcom/accounting-baseline-551.json`
- Create: `tests/unit/import-normalize-accounting.test.ts`
- Modify: `tests/unit/import-tag-accounting.test.ts` (the `describe('every shipped fixture …')` block, about line 130-170)

**Interfaces:**
- Produces: fixture path `tests/fixtures/gedcom/gedcom7-normalize.ged`. Baseline file: `Record<fixtureRelativePath, { path: string; count: number }[]>` holding the raw `report.unaccountedFor` of the 20 pre-existing fixtures on unmodified `main`.

- [ ] **Step 1: Generate the baseline before touching any source.** Write a throwaway script in the scratchpad that imports each of the 20 fixtures (same enumeration as `fixtureFiles()`) and dumps raw `unaccountedFor` to `accounting-baseline-551.json`, keys relative to `tests/fixtures/gedcom`. Do not filter declared paths. Run it on unmodified HEAD.

- [ ] **Step 2: Write the fixture.** Synthetic, `VERS 7.0` exactly. It contains, at minimum:
  - `0 @N1@ SNOTE Anteckning om Anna` with children `1 LANG sv`, `1 TRAN Note about Anna`, `2 LANG en`
  - `1 SNOTE @N1@` on an INDI, on a FAM, and `2 SNOTE @N1@` under `1 BIRT`
  - `2 TRAN Anna /Berg/` with `3 LANG en` under an INDI `NAME`
  - `3 TRAN Gefle` with `4 LANG sv` under a `PLAC`
  - `1 EXID abc123` with `2 TYPE https://example.org/ids` and `2 _SRC extra`
  - a `NAME` with two `GIVN` (`Anna`, `Maria`) and two `SURN`
  - `2 DATE` with a `3 PHRASE sometime in spring` child and no value, plus a second `DATE 1900` with a `PHRASE`

- [ ] **Step 3: Write the failing tests** in `import-normalize-accounting.test.ts`:
  - `reports SNOTE.TRAN and SNOTE.TRAN.LANG and not SNOTE.LANG` (Verification 1, inline minimal file from the spec probe). Fails today.
  - `the pre-existing 7.0.x behaviour is pinned`: `family-historian.ged` detects as `'unknown'`. Passes today. T04 flips it to `'7.0'` on purpose.
  - Verification 2 in `import-tag-accounting.test.ts`: `fixtureFiles().some(f => detectGedcomVersion(parseGedcom(read(f))) === '7.0')`. Fails today.
  - Verification 3: raw `unaccountedFor` per fixture equals baseline with `HEAD.GEDC` and `HEAD.GEDC.VERS` removed. Fails today (those two are still present).

- [ ] **Step 4: Run and confirm red.** `npm --prefix <wt> exec -- vitest run --root <wt> tests/unit/import-normalize-accounting.test.ts tests/unit/import-tag-accounting.test.ts`. Expected: the four tests above fail, the pinned-behaviour test passes.

- [ ] **Step 5: Commit** the five paths by explicit name: `test(import): a 7.0 fixture the accounting gate must reach`.

### Task 2 (Tier 1): Provenance in the accounting session

**Files:**
- Modify: `src/import/gedcom/tag-accounting.ts`
- Test: `tests/unit/import-normalize-accounting.test.ts`

**Interfaces:**
- Produces: `recordOrigin(derived: GedcomNode, origin: GedcomNode): void` and `originOf(node: GedcomNode): GedcomNode`. `recordOrigin` stores the **root** origin (`origin` resolved through its own entry), so chains never grow. Both are no-ops or identity outside a session. `markConsumed(node)` adds `node` and, when an origin exists, the origin.

- [ ] **Step 1: Write the failing tests.**
  - `marking a derived node marks its origin`.
  - `a node derived twice marks the parsed origin once` (Review Focus 2).
  - `a derived node with no recordOrigin leaves the origin unmarked` (Verification 5, the guard that can fail).
  - `recordOrigin outside a session is a no-op and does not throw`.

- [ ] **Step 2: Run to confirm failure** (`recordOrigin` is not exported).

- [ ] **Step 3: Implement.** Provenance is a `WeakMap<GedcomNode, GedcomNode>` created in `beginAccounting` and dropped in `endAccounting`, next to `session`. One line of approach: root-collapse on write, single lookup on mark.

- [ ] **Step 4: Run to confirm pass**, then commit `feat(import): accounting records which parsed node a derived node came from`.

### Task 3 (Tier 1): `normalize.ts` records provenance and plays by the marking rule

**Files:**
- Modify: `src/import/gedcom/normalize.ts`
- Test: `tests/unit/import-normalize-accounting.test.ts`, `tests/unit/gedcom-normalize.test.ts` (must stay green unchanged)

**Interfaces:**
- Consumes: `recordOrigin` (T02), `getChild`/`getChildren` from `./node-utils`.
- Produces: `derive(origin: GedcomNode, patch: Partial<GedcomNode>): GedcomNode` (module-private). It builds `{ ...origin, ...patch }`, calls `recordOrigin(result, origin)`, returns it.

- [ ] **Step 1: Write the failing tests.** Inside a session, normalize the T01 fixture tree. For each of the seven rows in Scope assert `originOf(derived)` is the parsed node. Add:
  - `PHRASE is not marked when the DATE already has a value` (Review Focus 1).
  - `the second GIVN stays unmarked`.
  - `SNOTE record is marked, SNOTE.TRAN is not`.

- [ ] **Step 2: Run to confirm failure.**

- [ ] **Step 3: Implement.**
  - Delete the private `getChildren`/`getChild` (lines 16-22). Import the marking ones.
  - Replace every `{ ...node, ... }` and every literal-node rebuild with `derive(origin, patch)`. For synthesized nodes (`NOTE` from a pointer, `REFN` from `EXID`, its `TYPE`) the origin is the node they were built from.
  - In `applyDatePhrase`, look `PHRASE` up with a plain `.find` and call `markConsumed` only on the branch that copies its text into `DATE`.
  - In `buildSnoteMap`, call `markConsumed(node)` on the SNOTE record. Do not mark its children.

- [ ] **Step 4: Run** `gedcom-normalize.test.ts` and the new tests. Expected: all pass.

- [ ] **Step 5: Commit** `feat(import): normalize records provenance for every node it derives`.

### Task 4 (Tier 1): Open the session first, walk the parsed tree

**Files:**
- Modify: `src/import/gedcom/import-core.ts` (lines about 452-472), `src/import/gedcom/detect.ts`, `src/import/gedcom/phases/notes.ts` (lines 46-50)
- Test: `tests/unit/import-normalize-accounting.test.ts`, `tests/unit/import-tag-accounting.test.ts`

**Interfaces:**
- Consumes: provenance-aware `markConsumed` (T02), `derive`-based `normalizeForImport` (T03).
- Produces: unchanged `importGedcom` signature. `report.unaccountedFor` is now computed from `tree` (parsed), not `normalizedTree`.

- [ ] **Step 1: Write the failing tests.**
  - `a throwing normalize does not strand the session`: stub `normalizeForImport` to throw once, import, then import again and expect success (Review Focus 4).
  - `dangling SNOTE pointer imports without a crash` (Review Focus 3).
  - `event-level and FAM-level SNOTE pointers are marked or reported, never silent` on the T01 fixture (Review Focus 5). The assertion lists the actual outcome per path once measured. Record the measured result in the test comment.
  - `7.0 fixture: every node a phase reads is marked` (Verification 4): `unaccountedFor` on the fixture, minus the declared paths, equals the explicit list measured in step 4.
  - `detectGedcomVersion follows semver` in `import-normalize-accounting.test.ts`, table-driven on `GEDC.VERS`. A supported major returns the declared string unchanged: `7.0`, `7.0.13`, `7.1`, `7.2.3`, `5.0`, `5.5`, `5.5.1`, `5.5.5`, `5.6`. Their `gedcomMajor` is 7 or 5. Any other major returns `'unknown'`: `4.0`, `6.0`, `8.0`, `8.1.2`, `10.0`. A malformed string returns `'unknown'`: `7`, `7.`, `7.x`, `70.0`, `5.5.5.1`, empty. A table row per input, so a regression names the version.
  - `normalizeForImport` transforms for `7.0.13` and `7.1` and is a no-op for `5.5`, `5.5.5` and `unknown`.
  - `family-historian.ged detects as 7.0` replaces the T01 pinned-behaviour test.

- [ ] **Step 2: Run to confirm failure.**

- [ ] **Step 3: Implement.**
  - `import-core.ts`: call `beginAccounting()` first, inside the `try` that already ends in `finally { endAccounting() }`, so `detectGedcomVersion` and `normalizeForImport` run inside the session. Compute `collectUnaccounted(tree, …)` on the parsed `tree`.
  - `detect.ts`: replace the three raw `.find` calls with `getChild` from `./node-utils`. Delete the per-version comparisons. `detectGedcomVersion` returns the version string the file declares, trimmed, when it parses as `major.minor[.patch]` and the major is in one `SUPPORTED_MAJORS = new Set([5, 7])` constant. Otherwise it returns `'unknown'`. `GedcomVersion` becomes `string`, with `'unknown'` as the only sentinel. Export `gedcomMajor(v: GedcomVersion): number | null`. Behaviour keys on the major, never on a version label: `normalizeForImport` runs its transformations when `gedcomMajor(version) === 7`. The import report then shows the declared version (`GEDCOM 7.0.13`, `GEDCOM 5.5`), not a label the app invented. Add a comment citing the semver rule: same major is compatible, a new major is not. Adding major 8 later is one number in `SUPPORTED_MAJORS`, plus the transformations its spec needs.
  - Compatibility check before editing: grep `src/` and `tests/` for every comparison against `'5.5.1'`, `'5.5.5'` and `'7.0'` on a detected version (not on the exporter's `version` option, which is the format the user picks). Update each to `gedcomMajor`. Paste the grep output into the T04 commit.
  - Update the T01 baseline expectation for `dialects/family-historian.ged`. It now normalizes, so its raw `unaccountedFor` differs from the pinned baseline. Verification 3 compares the other 19 fixtures to the baseline and compares this one to a new pinned list taken after the fix.
  - Import `family-historian.ged` before and after the `detect.ts` change. Paste the row-count diff per table into the T04 commit message.
  - `notes.ts`: `markConsumed(node)` for the SNOTE record in the loop at line 46.

- [ ] **Step 4: Run the whole accounting suite** and read the fixture's unaccounted list. Expected new paths: `SNOTE.TRAN`, `SNOTE.TRAN.LANG`, `INDI.EXID._SRC`, plus whatever the FAM and event pointers show. Paste the list into the T05 commit.

- [ ] **Step 5: Commit** `fix(import): account for the parsed tree, with the session open before normalize`.

### Task 5 (Tier 2): Settle the declarations and re-measure the census

**Files:**
- Modify: `src/import/gedcom/accounting-declared.ts` (lines about 35-40), `tests/unit/import-tag-accounting-declared.test.ts`

- [ ] **Step 1: Write the failing declaration tests.**
  - `HEAD.GEDC` and `HEAD.GEDC.VERS` are not declared and the gate is green without them (Verification 6).
  - `HEAD.CHAR` reason matches `/consumed before parsing/`.
  - `*.NAME.GIVN` and `*.NAME.SURN` reasons do not contain `folded into the NAME value`.
  - `SNOTE.TRAN` and `SNOTE.TRAN.LANG` match `/^unmapped:pending-unmapped-capture/` and carry `\d+ occurrence` (counts from the 7.0 samples, measured in T04).

- [ ] **Step 2: Run to confirm failure.**

- [ ] **Step 3: Edit the list.** Delete the two `HEAD.GEDC*` entries. Reword the three reasons. Add the `SNOTE.TRAN*` and `EXID` extra-field entries measured in T04. Each new reason states the occurrence count and the denominator (files with 7.0).

- [ ] **Step 4: Run the census.** `npx tsx scripts/accounting-over-samples.ts export-import/samples --out <scratchpad>/census-after.txt`. Compare with the 690-path baseline measured 2026-11-07. Expected: `INDI.NAME.TRAN` and `SOUR.DATA.EVEN.PLAC.TRAN` gone. Paste both path counts. Any new undeclared path on a real 7.0 sample gets a declaration with a reason or a filed follow-up. It does not stay silent.

- [ ] **Step 5: Commit** `docs(import): declarations follow the accounting that now reaches normalize`.

### Task 6 (Tier 1): Close-out

- [ ] **T-final (Tier 1)** — Invoke `/close-out` skill. The skill walks the 6+1 steps, refuses partial, captures evidence. Required evidence: `npm test` summary, `npm run build` tail, `npm run test:e2e:full` across 8 projects, and both census path counts from T05. Also paste the T04 `family-historian.ged` before/after row counts.
