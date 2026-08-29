# Dialect Tag Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A researcher importing from Family Tree Maker, PAF, Legacy, Family Historian, RootsMagic, Ancestris or Holger keeps the parent-relation types, married names, parish names and citations those programs wrote, and is told plainly about anything the app still does not read.

**Architecture:** Tag accounting already names what the importer drops. This plan works through that list — mapping what maps, declaring what does not, and correcting three places where the existing answer is wrong. Most tasks are independently committable; none depends on the one before it except Task 1, which makes the rest measurable.

**Tech Stack:** TypeScript, Vitest, node-sqlite3-wasm, SQLite.

**Spec:** this file replaces the design spec of the same name. Referent for every `unmapped:pending-dialect-tag-review` reason in `src/import/gedcom/accounting-declared.ts`.

**Depends on:** tag accounting, shipped v0.272.0 by [the importer tag-accounting plan](archive/2026-08-23-importer-tag-accounting.md).

## Global Constraints

- `.claude/rules/api.md`: bulk writes go through `runBatch`. Never `db.prepare(...).run(...)` raw.
- `.claude/rules/performance.md`: no per-row DB call inside a loop over a DB-scale array. Several tasks touch the individuals and families phases, which run once per INDI/FAM.
- **Prime Directive:** nothing inferred is persisted. Two tasks below turn on exactly this — living-ness is derived at render time, so a foreign program's living flag is not ours to store; and a parent relation the file marked *Unknown* must not be stored as *biological*.
- `/export-import/` is gitignored real family data. **Never commit it, never copy it into `tests/fixtures/`.** All committed fixtures are synthetic.
- A parallel session owns `docs/unmapped-capture`. Do not touch `normalize.ts`, do not create an `unmapped_data` table. Rebase before every commit.
- Worktree: `git -C <path>`, `npm --prefix <path>`, **vitest needs `--root <abs-worktree-path>`**.
- Stage **by explicit path**. `git add -A` is blocked by a hook.
- The security hook flags the four-letter substring `e-x-e-c-(`. Use `runSql` / `runBatch`.

---

## User goal

Import a file written by any of the seven programs above, and:

- a child recorded as adopted, step, foster or *relation unknown* keeps that relation — and is never silently promoted to biological,
- a married name stays a married name,
- a Holger parish stays a place,
- and whatever the app still cannot read is named in the import report, with the reason.

## What the measurement changed about this plan

Re-measured 2026-08-27 against the 36 gitignored files in `export-import/samples/` and the 19 shipped fixtures. Three of the design spec's premises did not survive.

### 1. `_FREL` / `_MREL` are already mapped. The fixtures are wrong, not the importer.

Real files write them at **level 2 under `FAM.CHIL`**, which `phases/families.ts` already reads:

```
1 CHIL @I2339@
2 _FREL Natural
2 _MREL Natural
```

45 996 occurrences across the corpus, every one under `FAM.CHIL`. `FAM.CHIL._FREL` does not appear anywhere in the sweep — it is accounted for. The declared paths `INDI._FREL`, `INDI._MREL` and `INDI._FREL._MREL` exist only because the two synthetic fixtures invented an INDI-level shape:

```
tests/fixtures/gedcom/dialects/family-tree-maker.ged:39   1 _FREL @I1@
tests/fixtures/gedcom/dialects/family-tree-maker.ged:40   2 _MREL Adopted
tests/fixtures/gedcom/dialects/paf.ged:33                 1 _FREL Adopted
```

A fixture that does not match the program it is named after tests nothing. Task 2.

### 2. The relation vocabulary silently promotes *Unknown* to *biological*.

`adParentRelSubtype` in `src/import/gedcom/profiles/arkivdigital.ts` handles four lowercase words and defaults everything else to `'biological'`. Real values across the corpus:

| Value | Count | Reached by | Currently stored as | Should be |
|---|---:|---|---|---|
| `Natural` | 45 904 | `default` | biological | biological |
| `Step` | 41 | `case 'step'` | step | step |
| `Adopted` | 20 | `case 'adopted'` | adopted | adopted |
| `Unknown` | 34 | `default` | **biological** | unknown |
| `Private` | 1 | `default` | **biological** | unknown |

45 996 occurrences in total. The switch lowercases before matching, so capitalisation is not the problem — `Step` and `Adopted` land on their arms and are stored correctly. `Natural` reaches the right answer by accident, through a `default` that says *biological* to everything it does not recognise.

That default is the bug. **35 rows assert a biological parent where the file explicitly declined to state one.** Storing an inference the file contradicts is the Prime Directive violation, and the number is small only because this corpus is small. Task 3.

### 3. Two-thirds of what the corpus drops is standard GEDCOM, not vendor extensions.

Of the 165 paths the sweep prints, **110 have a standard leaf tag and 55 are `_`-prefixed**:

```
   154  INDI.NAME.SPFX        surname prefix — standard 5.5.1 and 7.0
   151  INDI.NAME.SOUR.OBJE   media on a citation — standard
   108  SOUR.NOTE             standard
    98  INDI.CHR.AGE          age at event — standard
    89  SUBM.LANG             standard
    56  SOUR.TEXT             standard
```

"Dialect tag review" is now a misnomer for its own scope. The filename stays, because every `unmapped:pending-dialect-tag-review` reason in the code points at it; the framing is corrected here. The standard-tag gap is large enough to be its own plan, filed by Task 11.

### 4. The sweep script cannot show its own findings.

`scripts/accounting-over-samples.ts` prints `.slice(0, 15)` per file and `.slice(0, 30)` in the total. Latest run: **755 distinct undeclared paths, 30 printed — 725 invisible.** A survey that truncates is a report, not a census, which is the exact shape `.claude/rules/evidence.md` exists to catch. Task 1 fixes it first, because every later task's "did I get them all?" depends on it.

## Scope

- `scripts/accounting-over-samples.ts` — full census output.
- Every `unmapped:pending-dialect-tag-review` entry in `src/import/gedcom/accounting-declared.ts`. Current list, 20 entries:
  `INDI._LIVING`, `INDI._FLGS`, `INDI._FLGS._LIVING`, `INDI._FREL`, `INDI._MREL`, `INDI._FREL._MREL`, `INDI._HDP`, `*.PARI`, `INDI.ASSO.SOUR`, `INDI._PHOTO`, `INDI._MTTAG`, `INDI._WEBTAG`, `INDI._CUSTOM`, `OBJE.FILE.FORM`, `OBJE.FILE.FORM.TYPE`, `OBJE.FILE.TITL`, `OBJE.REFN`, `OBJE.REFN.TYPE`, `OBJE.RIN`, `SOUR.ABBR`.
- The fixtures under `tests/fixtures/gedcom/dialects/` that those entries come from.
- `src/import/gedcom/profiles/arkivdigital.ts` — the shared parent-relation vocabulary.
- `src/import/gedcom/phases/individuals.ts` — `KNOWN_INDI_TAGS`, name handling, `_HDP`.
- `src/import/gedcom/phases/prep-places.ts` and `event-importer.ts` — Holger `PARI`.
- `src/import/gedcom/phases/asso.ts` — citation on an association.

### Scope deviations

- **The 110 standard-tag paths are classified, not mapped, in this plan.** Task 11 declares them and files the plan that maps them. Mapping `SOUR.TEXT`, `NAME.SPFX`, `*.SOUR.OBJE` and `*.AGE` is four separate pieces of modelling work and does not belong behind a title that says "dialect".
- **`INDI._CUSTOM` is not mappable by definition.** It is the fixture's stand-in for "a vendor tag nobody has seen". It gets a declaration, never a mapping.
- **No Holger corpus exists.** Holger is Windows-only and paid; the fixture is the only evidence. Task 6 states the risk it takes and the measurement that settles it.
- **ArkivDigital tags stay out.** They carry `unmapped:pending-arkivdigital-profile` or their own plan reasons.

## Verification

1. **User-observable:** import `family-tree-maker.ged` and a child marked `Adopted` appears as adopted, not biological; import a file with `_MREL Unknown` and the relation reads *unknown*, not *biological*. Import `rootsmagic-8.ged`-shaped input and a `_MARNM` value appears as a married name on the person. Import `holger.ged` and the parish is a place, reachable from the event.
2. `npm test -- import-tag-accounting` green with every `unmapped:pending-dialect-tag-review` entry either deleted (mapped) or rewritten to an `excluded:` reason or a new plan reference. **Zero entries carrying the old reason remain.**
3. `npx tsx scripts/accounting-over-samples.ts` writes a complete census file whose line count equals the reported distinct-path count. No truncation.
4. The corpus census contains no `_FREL`, `_MREL`, `_MARNM`, `_LIVING`, `_FLGS` or `PARI` path.
5. A test asserts `_MREL Unknown` produces subtype `unknown` — the Prime Directive check, because the failure mode is a stored inference, not a missing value.

**User-goal-falsifiability check.** If 1–5 pass, can the goal still be unmet? Yes, in one way: the Holger parish hierarchy direction (Task 6) is a judgement no available evidence settles, and a wrong direction is user-visible. That is why Task 6 carries an explicit risk statement and a named unblocking measurement rather than a silent choice.

**Type-checking, measured not asserted.** `npm run typecheck` (`vue-tsc --noEmit --ignoreDeprecations 6.0`) **is not clean on this repo and never has been — 2304 pre-existing errors.** The check is *no new errors*, measured against a baseline taken on the branch point:

```bash
git -C <wt> stash -u
npm --prefix <wt> run typecheck 2>&1 | grep -c 'error TS'   # baseline
git -C <wt> stash pop
npm --prefix <wt> run typecheck 2>&1 | grep -c 'error TS'   # must equal the baseline
npm --prefix <wt> run typecheck 2>&1 | grep '<file you touched>'   # must be empty
```

Do not run it in the main tree for a baseline: that run is swamped by `src-tauri/target/release/**` build artifacts and reports a different, useless number (5840 when the worktree reported 2304).

---

## Tasks

> **Test helper used throughout.** Neither `readFixture` nor `readDialect` exists today —
> `import-gedcom-dialects.test.ts` builds its own `DIALECTS_DIR` and
> `import-arkivdigital-identifiers.test.ts` inlines a template literal. Add this once, in
> `tests/unit/helpers.ts`, and import it where the tests below call it:
>
> ```ts
> // tests/unit/helpers.ts
> import { readFileSync } from 'node:fs';
> import { join } from 'node:path';
>
> /** Read a fixture under tests/fixtures/gedcom/dialects/ by bare filename. */
> export function readDialect(name: string): string {
>   return readFileSync(join(__dirname, '../fixtures/gedcom/dialects', name), 'utf-8');
> }
> ```
>
> `readFixture` in this plan means the same function; use the one name.

### Task 1 (Tier 1): the sweep prints a census, not a top-30

**Files:**
- Modify: `scripts/accounting-over-samples.ts`

**Interfaces:** the script gains an output-file argument. Console output stays a summary; the file is the census.

- [x] **Step 1: Record the before state**

```
$ npx tsx scripts/accounting-over-samples.ts
===== GRAND TOTAL: 755 distinct undeclared paths, 0 files failed to import =====
  … 30 lines …
```

755 distinct, 30 printed. Paste this into the commit message — it is the reason the change exists.

- [x] **Step 2: Implement**

```ts
// scripts/accounting-over-samples.ts
/**
 *   npx tsx scripts/accounting-over-samples.ts [dir] [--out <file>]
 *
 * Console output is a summary. `--out` writes the complete census: every
 * distinct undeclared path with its occurrence count, one per line, sorted by
 * count. `.claude/rules/evidence.md` — a survey that truncates is a report,
 * and a report reflects its author's coverage decisions rather than the data.
 * The previous version printed 30 of 755 paths and the other 725 could not be
 * worked through by anyone.
 */
import { writeFileSync } from 'node:fs';

// … inside main(), replacing both slice() calls …

  // Per file: a count, plus the top few for orientation. The census is the file.
  origLog(`\n### ${file} — ${undeclared.length} undeclared paths`);
  for (const u of undeclared.slice(0, 15)) {
    origLog(`  ${String(u.count).padStart(6)}  ${u.path}`);
  }
  if (undeclared.length > 15) {
    origLog(`  … and ${undeclared.length - 15} more (use --out for the full census)`);
  }

// … after the loop …

  const ranked = [...totals].sort((a, b) => b[1] - a[1]);
  origLog(`\n===== GRAND TOTAL: ${totals.size} distinct undeclared paths, ${failed} files failed to import =====`);
  for (const [path, count] of ranked.slice(0, 30)) {
    origLog(`  ${String(count).padStart(7)}  ${path}`);
  }
  if (outFile) {
    const body = ranked.map(([p, c]) => `${String(c).padStart(8)}  ${p}`).join('\n');
    writeFileSync(outFile, `${body}\n`);
    origLog(`\nCensus written to ${outFile} — ${ranked.length} lines, one per distinct path.`);
  } else {
    origLog(`\n${Math.max(0, ranked.length - 30)} paths not printed. Re-run with --out <file> for the census.`);
  }
```

Parse `--out` from `process.argv` alongside the existing positional `dir`.

- [x] **Step 3: Verify**
  - `npx tsx scripts/accounting-over-samples.ts export-import/samples --out /tmp/census.txt`
  - `wc -l /tmp/census.txt` equals the reported distinct-path count. **This is the assertion** — a census whose line count disagrees with its own header is the bug all over again.
  - Without `--out`, the summary states how many paths were not printed.

- [x] **Step 4: Commit** — `fix(scripts): the sample sweep reports every path, not the first thirty`

---

### Task 2 (Tier 1): correct the FTM and PAF fixtures to the shape real files use

**Files:**
- Modify: `tests/fixtures/gedcom/dialects/family-tree-maker.ged`
- Modify: `tests/fixtures/gedcom/dialects/paf.ged`
- Modify: `src/import/gedcom/accounting-declared.ts`
- Test: `tests/unit/import-gedcom-dialects.test.ts`

`INDI._FREL` was never a mapping gap. It was a fixture that did not match its program.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/import-gedcom-dialects.test.ts
describe('FTM / PAF parent relation', () => {
  it('reads _FREL and _MREL where real files put them — under FAM.CHIL', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('family-tree-maker.ged')));
    const pc = await queryAll<{ person1_id: string; person2_id: string; subtype: string }>(
      db, `SELECT person1_id, person2_id, subtype FROM relationships WHERE type = 'parent_child'`);
    expect(pc.map(r => r.subtype).sort()).toEqual(['adopted', 'biological']);
  });

  it('reports nothing unaccounted for either fixture', async () => {
    for (const f of ['family-tree-maker.ged', 'paf.ged']) {
      const db = await createTestDb();
      const report = await importGedcom(db, parseGedcom(readDialect(f)));
      const undeclared = (report.unaccountedFor ?? []).filter(u => !matchDeclared(u.path));
      expect(undeclared, `${f}`).toEqual([]);
    }
  });
});
```

- [x] **Step 2: Run — confirm it fails.** With the INDI-level fixture there is no `FAM.CHIL._FREL`, so both children come back `biological`.

- [x] **Step 3: Rewrite the two fixture FAM records**

Real FTM, verbatim shape from `export-import/samples/d-jeffrey/family-tree-maker-pres2020.ged:46409`:

```
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
2 _FREL Adopted
2 _MREL Adopted
1 CHIL @I4@
2 _FREL Natural
2 _MREL Natural
```

PAF takes the same shape. Delete the level-1 `_FREL` / `_MREL` lines from the INDI records in both fixtures.

> Add a second child to each fixture if it has only one, so the test can assert two different subtypes and prove the value is read rather than defaulted.

- [x] **Step 4: Delete three declarations**

```ts
  // removed — a fixture invention, never a real shape:
  { path: 'INDI._FREL',        reason: 'unmapped:pending-dialect-tag-review — …' },
  { path: 'INDI._MREL',        reason: 'unmapped:pending-dialect-tag-review — …' },
  { path: 'INDI._FREL._MREL',  reason: 'unmapped:pending-dialect-tag-review — …' },
```

- [x] **Step 5: Verify** — `npm test -- import-gedcom-dialects import-tag-accounting` green.

- [x] **Step 6: Commit** — `test(import): FTM and PAF fixtures use the shape real files write`

---

### Task 3 (Tier 1): a relation the file called *Unknown* is not stored as biological

**Files:**
- Modify: `src/import/gedcom/profiles/arkivdigital.ts` (rename and widen the function)
- Modify: `src/import/gedcom/phases/families.ts` (import site)
- Test: `tests/unit/import-parent-relation-subtype.test.ts` (new)

This is a Prime Directive violation, not a gap: `default: return 'biological'` writes a relation the file did not state. 35 rows across the corpus.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/import-parent-relation-subtype.test.ts
import { describe, it, expect } from 'vitest';
import { parentRelSubtype } from '../../src/import/gedcom/profiles/arkivdigital';

describe('parentRelSubtype', () => {
  it.each([
    ['Natural', 'biological'],
    ['natural', 'biological'],
    ['biological', 'biological'],
    ['Adopted', 'adopted'],
    ['adopted', 'adopted'],
    ['Step', 'step'],
    ['Foster', 'foster'],
    ['Unknown', 'unknown'],
    ['Private', 'unknown'],
    ['', 'unknown'],
    ['Sealed', 'unknown'],
  ])('maps %s to %s', (input, expected) => {
    expect(parentRelSubtype(input)).toBe(expected);
  });

  it('never answers biological for a value it does not recognise', () => {
    // The failure this test exists for: an unrecognised word became a claim
    // of biological parentage the file never made.
    for (const v of ['Sealed', 'Guardian', '?', 'okänd', 'xyz']) {
      expect(parentRelSubtype(v), v).not.toBe('biological');
    }
  });
});
```

Plus an end-to-end assertion in `import-gedcom-dialects.test.ts`:

```ts
  it('stores Unknown as unknown, not biological', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(`0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME P /Parent/
0 @I2@ INDI
1 NAME C /Child/
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
2 _FREL Unknown
0 TRLR
`));
    const pc = await queryAll<{ subtype: string }>(
      db, `SELECT subtype FROM relationships WHERE type = 'parent_child'`);
    expect(pc.map(r => r.subtype)).toEqual(['unknown']);
  });
```

- [x] **Step 2: Run — confirm it fails.** `Unknown` currently returns `biological`.

- [x] **Step 3: Implement**

```ts
// src/import/gedcom/profiles/arkivdigital.ts
/**
 * Parent-relation word → `ParentChildSubtype`.
 *
 * Shared vocabulary, not an ArkivDigital one. ArkivDigital writes lowercase
 * `adopted`; Family Tree Maker and PAF write capitalised `Natural`, `Step`,
 * `Adopted`, `Unknown`, `Private` at the same `FAM.CHIL` position.
 *
 * **Unrecognised input answers `unknown`, never `biological`.** Prime
 * Directive: a relation the file declined to state is not a relation the DB
 * gets to assert. The previous `default: 'biological'` stored a biological
 * parent for 35 rows across the sample corpus whose files said otherwise.
 */
export function parentRelSubtype(value: string): ParentChildSubtype {
  switch (value.trim().toLowerCase()) {
    case 'adopted':    return 'adopted';
    case 'foster':     return 'foster';
    case 'step':       return 'step';
    case 'natural':
    case 'biological': return 'biological';
    default:           return 'unknown';
  }
}

/** @deprecated Use `parentRelSubtype`. Kept until the last caller moves. */
export const adParentRelSubtype = parentRelSubtype;
```

Import `ParentChildSubtype` from `../../../api/types`. Update the two call sites in `phases/families.ts` to the new name and delete the alias in the same commit if nothing else references it — `grep -rn adParentRelSubtype src/ tests/` decides.

- [x] **Step 4: Check the `PEDI` path for the same bug.** `families.ts` also derives `childSubtype` from `PEDI`:

```ts
      let childSubtype = pedi ? (pedi === 'birth' ? 'biological' : pedi) : 'biological';
```

An unrecognised `PEDI` value is written straight into `subtype` with no vocabulary check, and a missing `PEDI` yields `biological`. Route it through `parentRelSubtype` too, mapping GEDCOM's `birth` to `biological`, and record in the commit what the vocabulary check changed. **A missing `PEDI` staying `biological` is the correct default** — GEDCOM 5.5.1 §PEDI names `birth` as the assumed value — so keep that branch and say so in a comment.

- [x] **Step 5: Verify** — the new suite plus `import-gedcom-dialects`, `import-arkivdigital-relations` green.

- [x] **Step 6: Commit** — `fix(import): an unstated parent relation is unknown, not biological`

---

### Task 4 (Tier 1): the living flag is derived, so declare it and remove the allowlist lie

**Files:**
- Modify: `src/import/gedcom/phases/individuals.ts` (`KNOWN_INDI_TAGS`)
- Modify: `src/import/gedcom/accounting-declared.ts`
- Test: `tests/unit/import-tag-accounting.test.ts`

`INDI._LIVING` sits in `KNOWN_INDI_TAGS`, so it never appeared in `skipped`, while no phase ever read it. It is the sharpest example of an allowlist entry that looks like handling and is not — the reason clause 1 needed a mechanical contract.

The right answer is **not** to store it. `src/api/html_site/` derives living-ness at render time (`isLivingDerived`), and `persons` has no living column by design. Legacy's `_LIVING N` is Legacy's own derivation, not authored research. Storing another program's inference is the Prime Directive violation this app exists to avoid.

- [x] **Step 1: Write the test that pins the decision**

```ts
  it('does not store a foreign living flag', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('legacy.ged')));
    const cols = await queryAll<{ name: string }>(db, `PRAGMA table_info(persons)`);
    expect(cols.map(c => c.name)).not.toContain('living');
  });

  it('declares the living flag rather than pretending to read it', () => {
    for (const p of ['INDI._LIVING', 'INDI._FLGS', 'INDI._FLGS._LIVING']) {
      expect(matchDeclared(p)?.reason, p).toMatch(/^excluded:redundant/);
    }
  });

  it('_LIVING is no longer in the known-tag allowlist', async () => {
    // An allowlist entry with no reader is what made this invisible for months.
    const src = readFileSync(
      new URL('../../src/import/gedcom/phases/individuals.ts', import.meta.url), 'utf-8');
    const allowlist = /const KNOWN_INDI_TAGS = new Set\(\[([\s\S]*?)\]\)/.exec(src)?.[1] ?? '';
    expect(allowlist).not.toContain("'_LIVING'");
  });
```

- [x] **Step 2: Run — confirm the second and third fail.**

- [x] **Step 3: Implement**

Remove `'_LIVING'` from `KNOWN_INDI_TAGS` in `individuals.ts` line 22. Rewrite the three declarations:

```ts
  { path: 'INDI._LIVING',       reason: 'excluded:redundant — the app derives living-ness at render time from dates (src/api/html_site/ isLivingDerived) and persons has no living column by design. Legacy writes its own derived flag; storing another program\'s inference is what the Prime Directive forbids.' },
  { path: 'INDI._FLGS',         reason: 'excluded:redundant — Family Historian flag block; its only observed child is _LIVING, see INDI._LIVING' },
  { path: 'INDI._FLGS._LIVING', reason: 'excluded:redundant — Family Historian living flag, same derivation as INDI._LIVING' },
```

- [x] **Step 4: Verify** — `npm test -- import-tag-accounting import-gedcom-dialects` green; the `legacy.ged` and `family-historian.ged` gate entries still pass because the paths are declared, not silently allowed.

- [x] **Step 5: Commit** — `fix(import): the living flag is derived, not imported`

---

### Task 5 (Tier 1): `_MARNM` is a married name

**Files:**
- Modify: `src/import/gedcom/phases/individuals.ts`
- Modify: `src/gedcom/exporter.ts`
- Modify: `src/import/gedcom/accounting-declared.ts` (add nothing; the path is corpus-only today)
- Test: `tests/unit/import-married-name.test.ts` (new)
- Fixture: `tests/fixtures/gedcom/dialects/rootsmagic.ged`

724 occurrences in `rootsmagic-8.ged`. `person_names.name_type` already has `'married'`, and `name_qualifier` already has `'married'` — so this is mapping work, not modelling work.

- [x] **Step 1: Add the tag to the RootsMagic fixture**

```
0 @I2@ INDI
1 NAME Mary /Jones/
2 _MARNM Mary /Smith/
```

- [x] **Step 2: Write the failing test**

```ts
// tests/unit/import-married-name.test.ts
describe('_MARNM', () => {
  it('becomes a second person_name with type married', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('rootsmagic.ged')));
    const names = await queryAll<{ given_name: string; surname: string; name_type: string; sort_order: number }>(
      db, `SELECT pn.given_name, pn.surname, pn.name_type, pn.sort_order
             FROM person_names pn ORDER BY pn.sort_order`);
    expect(names).toContainEqual(
      expect.objectContaining({ surname: 'Smith', name_type: 'married' }));
    // The birth name stays first and stays the birth name.
    expect(names[0].name_type).toBe('birth');
    expect(names[0].surname).toBe('Jones');
  });

  it('accepts a surname-only _MARNM', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(`0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Mary /Jones/
2 _MARNM /Smith/
0 TRLR
`));
    const married = await queryAll<{ given_name: string | null; surname: string }>(
      db, `SELECT given_name, surname FROM person_names WHERE name_type = 'married'`);
    expect(married).toEqual([expect.objectContaining({ surname: 'Smith' })]);
  });

  it('round-trips', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('rootsmagic.ged')));
    const back = await createTestDb();
    const { ged } = await exportGedcom(db, '5.5.1');
    await importGedcom(back, parseGedcom(ged));
    const n = await queryAll(back, `SELECT id FROM person_names WHERE name_type = 'married'`);
    expect(n).toHaveLength(1);
  });
});
```

- [x] **Step 3: Run — confirm it fails.**

- [x] **Step 4: Implement the import**

Three facts about the code this lands in, each of which contradicts the obvious guess:

1. **There is no name-parsing helper.** `individuals.ts:142` splits the `NAME` value inline
   with `const surnameMatch = raw.match(/^(.*?)\/(.+?)\/(.*)$/)`. Extract that into a
   local function and call it from both places rather than writing a second regex.
2. **The buffer is `nameRows`** (declared at line 67, flushed at line 254 by
   `bulkAddPersonNames`), not `nameRowBuffer`, and it lives in **Pass 1** — where `nameNode`
   is in scope. Not Pass 2.
3. **Do not set `sort_order`.** `bulkAddPersonNames` assigns a dense per-person order when
   the field is absent, so a row pushed after the birth name lands after it. Setting it by
   hand fights a mechanism that already works.

```ts
// src/import/gedcom/phases/individuals.ts — extracted from the inline match at line 142
function splitGedcomName(raw: string): { given: string | null; surname: string | null } {
  const m = raw.match(/^(.*?)\/(.+?)\/(.*)$/);
  return {
    given: (m ? m[1] : raw).trim() || null,
    surname: m ? m[2].trim() || null : null,
  };
}
```

```ts
// …in Pass 1, immediately after nameRows.push({ … }) for the birth name
      // RootsMagic writes the married name as a sub-tag of the birth NAME.
      // 724 occurrences in the sample corpus. person_names already models it:
      // name_type 'married' plus the matching name_qualifier.
      const marnm = getChild(nameNode, '_MARNM')?.value?.trim();
      if (marnm) {
        const { given: mGiven, surname: mSurname } = splitGedcomName(marnm);
        nameRows.push({
          id: uuid(),
          person_id: personId,
          given_name: mGiven,
          surname: mSurname,
          name_prefix: null,
          name_suffix: null,
          name_type: 'married',
          patronymic_base: null,
          preferred_name: null,
          nickname: null,
          name_qualifier: 'married',
          date_from: null,
          date_to: null,
        });
      }
```

`nameRows`' element type declares every field non-optional, so all thirteen are listed.
**Do not add a per-row insert here** — push into the buffer and let the existing flush run.

- [x] **Step 5: Implement the export**

> **Checked, no change made.** The exporter already writes the married row as
> `1 NAME /Smith/` + `2 TYPE MARRIED` + `2 _NQUAL married`, which re-imports as a
> married name — the round-trip test passes untouched. Emitting `2 _MARNM`
> instead would trade the portable standard shape for a RootsMagic-only one, and
> emitting both would produce a duplicate married row on re-import.

The exporter already emits multiple `person_names`. Confirm what it writes for a `married` row today, and if it writes a bare second `1 NAME`, the round-trip test in Step 2 passes without any exporter change — check before editing. If a change is needed, emit `2 _MARNM` under the birth name so the file reads back identically to what RootsMagic wrote.

- [x] **Step 6: Verify** — new suite green; `npm test -- import-tag-accounting` shows no `_MARNM` path; census contains no `_MARNM`.

- [x] **Step 7: Commit** — `feat(import): a RootsMagic married name stays a married name`

---

### Task 6 (Tier 1): Holger `PARI` becomes a parish place

**Files:**
- Modify: `src/import/gedcom/phases/prep-places.ts`
- Modify: `src/import/gedcom/event-importer.ts`
- Modify: `src/import/gedcom/accounting-declared.ts`
- Test: `tests/unit/import-holger-parish.test.ts` (new)

**Risk this task takes, stated before it is taken.** Holger writes a town in `PLAC` and a parish in `PARI`:

```
2 PLAC Stockholm
2 PARI Stockholms domkyrkoförsamling (A)
```

For the two fixture cases the parish sits *inside* the named place, so the chain is `Stockholm > Stockholms domkyrkoförsamling`. For a rural record — a farm in `PLAC`, its parish in `PARI` — the containment is the other way round, and no evidence available settles which shape Holger actually emits, because **Holger is Windows-only and paid, and no real export exists in the corpus.** The `.claude/rules/mandate.md` Tier 4 entry for Holger fixture authoring is the same blocker.

The choice: build the chain `PLAC > PARI`, because it is right for every case observed, it preserves both values where dropping preserves neither, and reversing it later is one `reverse()` plus a data migration for whoever imported in between. The alternative — keep dropping a real place component until a Windows licence appears — is worse.

**Unblocking measurement, to run when a real Holger export arrives:** count records where the `PARI` value contains the `PLAC` value as a substring versus the reverse. If the reverse dominates, flip the chain and ship a migration.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/import-holger-parish.test.ts
describe('Holger PARI', () => {
  it('resolves the parish as a place inside the PLAC value', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('holger.ged')), { profile: 'holger' });
    const places = await queryAll<{ id: string; name: string; place_type: string | null; parent_place_id: string | null }>(
      db, 'SELECT id, name, place_type, parent_place_id FROM places');
    const parish = places.find(p => p.name === 'Stockholms domkyrkoförsamling (A)');
    expect(parish, 'parish place not created').toBeDefined();
    expect(parish!.place_type).toBe('parish');
    const town = places.find(p => p.id === parish!.parent_place_id);
    expect(town?.name).toBe('Stockholm');
  });

  it('points the event at the parish, not the town', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('holger.ged')), { profile: 'holger' });
    const rows = await queryAll<{ name: string }>(db, `
      SELECT p.name FROM events e JOIN places p ON p.id = e.place_id
       WHERE e.event_type = 'birth'`);
    expect(rows.map(r => r.name)).toContain('Stockholms domkyrkoförsamling (A)');
  });

  it('does not create a parish level when PARI is absent', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(`0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME A /B/
1 BIRT
2 PLAC Stockholm
0 TRLR
`), { profile: 'holger' });
    const places = await queryAll<{ name: string; parent_place_id: string | null }>(
      db, 'SELECT name, parent_place_id FROM places');
    expect(places).toEqual([expect.objectContaining({ name: 'Stockholm', parent_place_id: null })]);
  });

  it('reuses one parish row across events that name it twice', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('holger.ged')), { profile: 'holger' });
    const dup = await queryAll(db, `
      SELECT name FROM places WHERE name = 'Stockholms domkyrkoförsamling (A)'`);
    expect(dup).toHaveLength(1);
  });
});
```

- [x] **Step 2: Run — confirm it fails.** No parish place exists; `PARI` is dropped.

- [x] **Step 3: Implement**

**`PARI` is a sibling of `PLAC`, not a child of it** — and `GedcomNode` has no `parent`
field (`src/gedcom/parser.ts`: `level`, `xref`, `tag`, `value`, `children`). The existing
`collectPlacNodes` walker at `prep-places.ts:16` returns bare `PLAC` nodes and throws the
owning event away, so it cannot reach the parish. A second collector is needed — the walker
holds the owner while it recurses, so pairing is free:

```ts
// src/import/gedcom/phases/prep-places.ts, beside collectPlacNodes
/**
 * Every PLAC node together with the PARI sibling on its owner, in document
 * order. Holger writes the parish beside the place rather than inside it:
 *
 *   1 BIRT
 *   2 PLAC Stockholm
 *   2 PARI Stockholms domkyrkoförsamling (A)
 *
 * `GedcomNode` carries no parent pointer, so the pairing has to happen during
 * the walk — the owner is in hand exactly once, here.
 */
function collectPlacWithParish(
  nodes: GedcomNode[],
  out: Array<{ placNode: GedcomNode; parish: string | null }> = [],
): Array<{ placNode: GedcomNode; parish: string | null }> {
  for (const owner of nodes) {
    for (const child of owner.children) {
      if (child.tag === 'PLAC' && child.value) {
        // getChild marks the node consumed — that is what removes PARI from
        // the unaccounted set. A raw children.find() would leave it reported.
        out.push({ placNode: child, parish: getChild(owner, 'PARI')?.value?.trim() || null });
      }
    }
    if (owner.children.length > 0) collectPlacWithParish(owner.children, out);
  }
  return out;
}
```

> The nested loop plus the recursive call visits each node twice. That is a tree walk over
> parsed nodes, not a DB query, and `collectPlacNodes` already walks the same tree — so it
> costs nothing measurable. Do not restructure it into something clever.

Then a Holger branch beside the ArkivDigital one, building the same `HierarchyLevel[]`
shape `bulkResolveHierarchy` already consumes:

```ts
  // ── Holger: PLAC + its PARI sibling become a two-level chain ─────────────
  if (ctx.isHolger) {
    const chains: HierarchyLevel[][] = [];
    const displayByChainKey = new Map<string, string[]>();
    for (const { placNode, parish } of collectPlacWithParish(ctx.tree)) {
      if (!parish) { flatNodes.push(placNode); continue; }
      const levels: HierarchyLevel[] = [
        { name: placNode.value.trim(), type: 'locality' },
        { name: parish,                type: 'parish'   },
      ];
      const key = levels.map(l => l.name).join(' > ');
      if (!displayByChainKey.has(key)) {
        chains.push(levels);
        displayByChainKey.set(key, []);
      }
      displayByChainKey.get(key)!.push(placNode.value.trim());
    }
    if (chains.length > 0) {
      const resolved = await bulkResolveHierarchy(ctx.db, chains);
      for (const [key, chain] of resolved) {
        for (const display of displayByChainKey.get(key) ?? []) {
          // Key by the PLAC display string so event-importer.ts needs no
          // change: it still calls resolvePlaceFn(db, placValue), still gets a
          // Map.get hit, and never learns the hierarchy exists. Same trick the
          // ArkivDigital branch uses.
          placeMap.set(normalize(display), chain.place);
        }
      }
    }
  }
```

`getChild` is not currently imported into `prep-places.ts` — add it from `../node-utils`.

**One ordering trap.** The ArkivDigital branch runs first and is tag-driven (`ctx.isArkivDigital || anyAdpl`). A Holger file has no `_ADPL`, so the branches never both fire — but write the Holger branch as `else if` on the same chain anyway, so a future file carrying both cannot resolve the same PLAC twice.

- [x] **Step 4: Delete the declaration** — remove `{ path: '*.PARI', … }`.

> **Deviation, measured.** `ctx.isHolger` is set only by `options.profile ===
> 'holger'` (import-core.ts:118), and the accounting gate imports every fixture
> with no options at all — so a profile-gated branch would leave `*.PARI`
> undeclared and red for exactly the import most users perform. The branch keys
> on the tag instead, `ctx.isHolger || anyPari`, which is the rule the
> ArkivDigital branch beside it already states for `_ADPL`.
>
> The PLAC level is written with `type: null`, not `'locality'`. `PLAC
> Stockholm` states a name, not a kind, and `'locality'` is not in the
> `PlaceType` union the column is typed against.

- [x] **Step 5: Verify**
  - New suite green.
  - `npm test -- import-tag-accounting` green with `*.PARI` gone.
  - `npm test -- export-perf` green — the new branch is one `bulkResolveHierarchy` call for the whole tree, matching the ArkivDigital branch. If it added a per-event query, that is a `.claude/rules/performance.md` violation and the task is not done.

- [x] **Step 6: Commit** — `feat(import): a Holger parish becomes a place, not a dropped line`

---

### Task 7 (Tier 1): `_HDP` — reconcile the contradiction, then declare it

**Files:**
- Modify: `src/import/gedcom/accounting-declared.ts`
- Test: `tests/unit/import-tag-accounting-declared.test.ts`

The app already says two different things about this tag. `import-core.ts:601` tells the user:

> `_HDP / _H8P` — Holger internal metadata (sort keys, display IDs, timestamps). All data is present in standard GEDCOM tags; nothing was lost.

while `accounting-declared.ts:78` says it is real authored data awaiting a mapping. One of the two is wrong, and a user reading both gets no answer.

The disclosure is right: `_HDP 12345` is Holger's internal row id, and `person_identifiers` would round-trip it as `1 REFN 12345 / 2 TYPE Other`, which is not `1 _HDP 12345` — storing it would change the file on export while adding nothing the researcher authored.

- [x] **Step 1: Write the test**

```ts
  it('_HDP is declared consistently with what the import report already tells the user', () => {
    const d = matchDeclared('INDI._HDP');
    expect(d?.reason).toMatch(/^excluded:not-relevant/);
    expect(d?.reason).toContain('import-core.ts');
  });
```

- [x] **Step 2: Implement**

```ts
  { path: 'INDI._HDP', reason: 'excluded:not-relevant — Holger\'s internal row id, not authored research. The import report already discloses it (import-core.ts, the _HDP / _H8P unmappedData category). Storing it in person_identifiers would re-emit it as REFN + TYPE Other, changing the file on export while adding nothing the researcher wrote.' },
```

- [x] **Step 3: Verify** — `npm test -- import-tag-accounting-declared` green. Confirm `import-core.ts`'s `unmappedData` category still fires: a Holger import with `_HDP` still shows the user that line. The two now agree.

> If the count that drives that disclosure reads `partial.skipped` and `_HDP` has since stopped landing there, the disclosure is silently dead. Check it by importing `holger.ged` with `{ profile: 'holger' }` and asserting the category appears in the report. Fix it here if it does not — a disclosure nobody sees is the failure this whole line of work exists to end.

- [x] **Step 4: Commit** — `docs(import): _HDP is Holger bookkeeping, and the report already said so`

---

### Task 8 (Tier 1): a citation on an association

**Files:**
- Modify: `src/import/gedcom/phases/asso.ts`
- Modify: `src/import/gedcom/accounting-declared.ts`
- Test: `tests/unit/import-asso-citation.test.ts` (new)

RootsMagic writes `2 SOUR @S1@` under `1 ASSO`. `asso.ts` reads `ROLE` / `RELA` / `_EVID` / `NOTE` and not `SOUR`.

Where the citation can attach depends on which branch the ASSO takes:

| Branch | Row created | Citation FK available |
|---|---|---|
| `_EVID` present | `event_participants` | none — the citation belongs on the event, which already has one |
| lowercase role in the T05 vocabulary | `person_associations` | **none** — `citations` has no `person_association_id` |
| capitalised `Sibling` / `Godparent` / `Other` | `relationships` | `citations.relationship_id` ✓ |
| anything else | nothing, `assoDropCount++` | — |

The rootsmagic fixture's `2 RELA Witness` falls into the fourth branch — the ASSO itself is dropped today, so its citation has nowhere to go regardless.

- [x] **Step 1: Decide and record the split.** Map the third branch (a `relationships` row exists, the FK exists). Declare the second: adding a `person_association_id` column to `citations` is schema work whose only driver is one fixture, and it belongs in the standard-tag plan Task 11 files, alongside `*.SOUR.OBJE` and the other citation-shaped gaps. Write that reasoning into the declaration, not just into this plan.

- [x] **Step 2: Write the failing test**

```ts
// tests/unit/import-asso-citation.test.ts
const ASSO_WITH_SOUR = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL Parish book
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 ASSO @I2@
2 RELA Godparent
2 SOUR @S1@
3 PAGE 14
0 @I2@ INDI
1 NAME Anna /Ersdotter/
0 TRLR
`;

describe('citation on an association', () => {
  it('attaches to the relationship the ASSO created', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(ASSO_WITH_SOUR));
    const rows = await queryAll<{ page: string; relationship_id: string; type: string }>(db, `
      SELECT c.page, c.relationship_id, r.type
        FROM citations c JOIN relationships r ON r.id = c.relationship_id`);
    expect(rows).toEqual([expect.objectContaining({ page: '14', type: 'godparent' })]);
  });

  it('does not create an orphan citation when the ASSO creates no relationship', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(ASSO_WITH_SOUR.replace('RELA Godparent', 'RELA Witness')));
    expect(await queryAll(db, 'SELECT id FROM citations')).toEqual([]);
  });
});
```

- [x] **Step 3: Run — confirm it fails.**

- [x] **Step 4: Implement** — in the capitalised-`RELA` branch of `asso.ts`, after `createRelationship` returns, read `SOUR` children and create citations against `relationship_id`. `phaseAsso` iterates `ctx.assoData`, which is bounded by ASSO count, not person count — but if a tree has thousands of ASSOs this becomes per-row IPC. Buffer the citation rows and flush once with `bulkCreateCitations` after the loop, matching `individuals.ts`.

- [x] **Step 5: Rewrite the declaration** to cover only what remains:

```ts
  { path: 'INDI.ASSO.SOUR', reason: 'unmapped:pending-standard-tag-gaps — mapped when the ASSO creates a relationships row (citations.relationship_id). Not mapped for the person_associations branch: citations has no person_association_id column, and adding one is schema work that belongs with the other citation-shaped gaps.' },
```

Replace `pending-standard-tag-gaps` with the actual plan slug Task 11 files.

- [x] **Step 6: Verify** — new suite green, accounting gate green.

- [x] **Step 7: Commit** — `feat(import): keep the citation on an association`

---

### Task 9 (Tier 1): the OBJE and SOUR sub-tag family

**Files:**
- Modify: `src/import/gedcom/accounting-declared.ts`
- Modify: `src/import/gedcom/phases/media.ts` (or wherever `importObjeNode` lives) if a mapping lands
- Test: `tests/unit/import-media-subtags.test.ts` (new, only if a mapping lands)

Seven entries, all currently `unmapped:pending-dialect-tag-review`: `OBJE.FILE.FORM`, `OBJE.FILE.FORM.TYPE`, `OBJE.FILE.TITL`, `OBJE.REFN`, `OBJE.REFN.TYPE`, `OBJE.RIN`, `SOUR.ABBR`.

- [x] **Step 1: Measure before deciding.** For each of the seven, get the occurrence count from the Task 1 census and note which programs write it. `OBJE.FILE.FORM` shows 199 in the corpus and 49 + 56 under `INDI.OBJE.FILE.FORM` in two files — a real, standard tag. Record the counts in the commit; a classification with no denominator is a shrug.

- [x] **Step 2: Classify each one** into exactly one of:

> **Both of the plan's guesses were wrong, measured.** `OBJE.FILE.FORM` is not
> redundant with `media.format`: the importer read `FORM` only as a direct child
> of `OBJE`, and the corpus writes it there **0** times against 199 under `FILE`.
> `OBJE.FILE.TITL` is not a genuinely different value either: **0** of the 174
> OBJE records carrying it also carry a level-1 `TITL`, so `media.title` fell
> back to `basename(file)` on every one. Both are *map*, not *declare*.
>
> Measured counts: `OBJE.FILE.FORM` 199 · `OBJE.FILE.TITL` 175 · `SOUR.ABBR` 22
> · `OBJE.REFN` 2 · `OBJE.REFN.TYPE` 2 · `OBJE.RIN` 0 · `OBJE.FILE.FORM.TYPE` 0
> (the corpus writes `OBJE.FILE.FORM.MEDI`, 8, at that position instead).
  - **map** — the column exists. `OBJE.FILE.TITL` against `media.title` is the likely candidate; check whether `media.title` is already fed from `OBJE.TITL` one level up, in which case the per-file title is a genuinely different value and the classification is *declare*.
  - **declare `excluded:redundant`** — the value is read from elsewhere. `OBJE.FILE.FORM` against `media.format` is the likely candidate; verify the importer reads `FORM` at the level it actually appears before declaring redundancy.
  - **declare `unmapped:pending-<plan>`** — real data, no column, needs the follow-up plan.

- [x] **Step 3: Implement whichever mappings Step 2 chose**, each with a fixture line and a test asserting the value lands and survives a round-trip.

- [x] **Step 4: Rewrite the remaining declarations** with the measured count and the classification reason. No entry keeps `pending-dialect-tag-review`.

- [x] **Step 5: Verify** — accounting gate green; census shows the mapped paths gone.

- [x] **Step 6: Commit** — `feat(import): classify the media and source sub-tags, map what has a column`

---

### Task 10 (Tier 2): the remaining vendor tags

**Files:**
- Modify: `src/import/gedcom/accounting-declared.ts`

Four fixture-declared paths and five corpus families. None holds authored genealogy; each needs a reason, not a mapping. Tier 2 because "this holds nothing the researcher wrote" is a judgement, and the executor records it rather than asking.

| Path | Program | Corpus count | Proposed reason |
|---|---|---:|---|
| `INDI._PHOTO` | MyHeritage | 0 (fixture only) | `excluded:redundant` — primary-photo pointer; media links carry the same association, and sort order carries primacy |
| `INDI._MTTAG` | MyHeritage | 0 (fixture only) | `unmapped:pending-<plan>` — a tag pointer; the app has `groups`, so this may map |
| `INDI._WEBTAG` | Family Historian | 0 (fixture only) | `unmapped:pending-<plan>` — a web link on a person; no column |
| `INDI._CUSTOM` | — | 0 (fixture only) | `excluded:not-relevant` — the fixture's deliberate stand-in for an unknown vendor tag |
| `INDI._UPD` | RootsMagic | 4683 | `excluded:not-relevant` — last-updated timestamp, app bookkeeping |
| `INDI._PPEXCLUDE` | Legacy | 347 | `excluded:not-relevant` — a Legacy report-exclusion flag |
| `INDI._SOSADABOVILLE` | Ancestris | 203 | `unmapped:pending-<plan>` — Sosa-Stradonitz numbering, relative to a root person the file does not name |
| `*._UID` / `*.RIN` on events | FTM | 28 786 | `unmapped:pending-<plan>` — event-level identifiers; `person_identifiers` covers persons only |
| `*.CHAN(.DATE(.TIME))` | several | 2740 | `excluded:not-relevant` — when the exporting program last touched the record |

- [x] **Step 1: Verify each count against the Task 1 census** before writing it into a reason. A count copied from this table without re-measuring is the failure mode `.claude/rules/evidence.md` names.

> **Re-measured 2026-08-29 against a census taken after Tasks 2-9 (750 distinct
> paths).** Four of the table's counts needed correcting or splitting:
> `*._UID` is 14 485 across 10 paths and `*.RIN` is 14 478 across 10 — the
> table's single `28 786` was close to their sum (28 963) but is two different
> tags with two different reasons. `*.CHAN` is 1 476 per level, not 2 740 for
> the family, plus 16 `*.CHAN.NOTE`; the matcher has no `X.*` form that reaches
> a suffix, so each level needs its own pattern. `INDI._UPD` 4683,
> `INDI._PPEXCLUDE` 347 and `INDI._SOSADABOVILLE` 203 confirmed as written.
> `INDI._PHOTO`, `INDI._MTTAG`, `INDI._WEBTAG` and `INDI._CUSTOM` confirmed at 0.

- [x] **Step 2: Write the declarations**, each naming the program and the count.

- [x] **Step 3: Verify** — `npm test -- import-tag-accounting-declared` green; no entry carries `pending-dialect-tag-review`.

- [x] **Step 4: Commit** — `docs(import): classify the remaining vendor tags with their counts`

---

### Task 11 (Tier 1): file the plan for the standard-tag gap

**Files:**
- Create: `docs/plans/2026-08-28-standard-tag-gaps.md`
- Modify: `src/import/gedcom/accounting-declared.ts`

The census's biggest finding is not a dialect finding: 110 of 165 visible paths have a standard GEDCOM leaf tag. Those need a plan of their own, and the `unmapped:pending-<plan>` reasons written in Tasks 8, 9 and 10 need it to exist — `.claude/rules/plans.md`: a reason naming a plan that is not on disk is the violation caught on 2026-08-23.

- [x] **Step 1: Produce the classified list** from the Task 1 census: every path whose leaf tag has no leading underscore, with its count and the programs that write it.

> **Re-measured after Tasks 2-10 shipped: 700 distinct paths, 10 207
> occurrences — 613 with a standard leaf tag (3 357 occurrences) and 87 with an
> underscore leaf (6 850).** The preamble's "110 of 165 visible" came from the
> truncated sweep and understated the path count by a factor of four. The filed
> plan carries the census numbers, grouped by concept, and states its own title
> is imperfect for the same reason this one's is: the single largest undeclared
> block, `_EVENT_DEFN` at 1 717 occurrences, has an underscore root.

- [x] **Step 2: Write the plan** at `docs/plans/2026-08-28-standard-tag-gaps.md`, following `.claude/rules/plans.md` — User goal, Scope with every path enumerated, Verification, then tasks. Group by concept, not by tag:
  - **Citation media** — `*.SOUR.OBJE`, 282 occurrences across three hosts. `citations` has no media link.
  - **Name parts** — `INDI.NAME.SPFX`, 156. `person_names` has `name_prefix`; check whether SPFX belongs there or is a distinct surname particle, given `name_qualifier` already has `'particle'`.
  - **Source text** — `SOUR.TEXT` (56) and `SOUR.NOTE` (108).
  - **Age at event** — `INDI.CHR.AGE` and its siblings, 98+.
  - **Submitter** — `SUBM.LANG`, 89.
  - **LDS ordinance dates** — `INDI.ENDL.DATE`, `INDI.SLGC.DATE`, `FAM.SLGS.DATE`, `FAM.CHIL.SLGC`, ~950. The ordinances themselves are already declared `excluded:not-relevant`; their children inherit that reason and this is a declaration task, not a mapping one.

- [x] **Step 3: Commit the plan immediately** — `.claude/rules/plans.md` "Commit plans and specs immediately". `git add docs/plans/2026-08-28-standard-tag-gaps.md && git commit -m "docs(plan): standard GEDCOM tags the importer does not read"`.

- [x] **Step 4: Point the pending reasons at it** — replace every `pending-standard-tag-gaps` placeholder written in Tasks 8–10 with the real slug.

- [x] **Step 5: Verify** — `grep -rn "pending-dialect-tag-review" src/ tests/` returns nothing. That is this plan's completion condition.

---

### T-final (Tier 1): close out

- [ ] **Invoke the `/close-out` skill.** It walks the 6+1 steps, refuses partial work, and captures evidence.

---

## Self-review checklist

- [x] Every task has a tier tag.
- [x] No self-referential tasks.
- [x] Every task ends in a commit or a recorded measurement.
- [x] No file from `export-import/` committed.
- [x] No change to `normalize.ts`, no `unmapped_data` table.
- [x] Zero `unmapped:pending-dialect-tag-review` entries remain in `accounting-declared.ts`.
- [x] Every declaration written in this plan carries a measured count, not an adjective.
- [x] No unrecognised relation word is stored as `biological`.
- [x] No foreign program's derived flag is stored.
- [x] The Holger parish hierarchy direction is stated as a risk in the code comment, not only here.
- [ ] `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e:full` green with output captured.
- [ ] `npm run typecheck` shows no NEW errors against the branch-point baseline, and none in a touched file.

## Failure modes / RCA reference

- **`INDI._LIVING` sat in `KNOWN_INDI_TAGS` while no phase read it.** An allowlist entry that looks like handling. Task 4 removes it; the mechanical contract in `CLAUDE.md` is what surfaced it.
- **The design spec asserted `_FREL` was unmapped.** It was mapped; the fixture was wrong. Measured 2026-08-27 against 36 real files: 45 996 occurrences, all under `FAM.CHIL`, none reported by the sweep. A claim about the importer that was never checked against a real file.
- **The sweep that surveys the corpus truncates its own output.** 755 distinct, 30 printed. `.claude/rules/evidence.md`: a query that cannot return everything cannot support a claim about the whole. Task 1 is first for this reason.
- **`_HDP` carries two contradictory answers in shipped code.** The import report calls it bookkeeping, the declared list calls it pending research. Task 7 picks one.
