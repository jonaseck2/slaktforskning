# Importer Tag Accounting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The GEDCOM import report names every tag in the file that the importer did not read, so no authored data can disappear without the user being told.

**Architecture:** A module-scoped accounting session collects the nodes that phases actually read. `getChild` / `getChildren` mark on read, which covers 211 call sites without changing a single signature. Phases that walk `node.children` directly mark explicitly. After all phases run, a walk over the normalized tree collects everything unmarked and reports it by full tag path. A declared-exclusions list carries the tags the app deliberately does not model, each with a reason, and a test asserts the unaccounted-for set is a subset of it.

**Tech Stack:** TypeScript, Vitest, node-sqlite3-wasm, Vue 3.

**Spec:** [docs/plans/2026-08-23-arkivdigital-import-design.md](../2026-08-23-arkivdigital-import-design.md) — Part 0, written before the wider spec below existed.

**Superseding spec:** [docs/plans/2026-08-23-import-tag-accounting-design.md](../2026-08-23-import-tag-accounting-design.md) — "Nothing Is Silently Dropped", six steps across all five importers. It was written in a parallel session while this plan was being executed. This plan turned out to be its steps 1, 3 and 6.

## What this plan delivered, and what it did not

The two documents were written independently and converged on the same mechanism. Mapping
this plan onto the superseding spec's six steps, so nobody reads "archived" as "finished":

| Step in the superseding spec | Status |
|---|---|
| 1 — marking, node-utils, raw traversal sites | **shipped here**, minus the lint rule that spec calls for |
| 2 — normalize-boundary accounting, parser malformed-line counter | **not shipped.** `*.NAME.GIVN`, `*.NAME.SURN`, `HEAD.GEDC` and `HEAD.CHAR` are consumed before the session opens, so this plan *declared* them `excluded:redundant` / `excluded:structural` rather than accounting for them. Owned by [2026-08-23-unmapped-capture-design.md](../2026-08-23-unmapped-capture-design.md), which makes the hole a capture prerequisite. |
| 3 — declared registry + corpus accounting test | **shipped here** as `accounting-declared.ts` plus a gate over all 20 committed fixtures. The real-world corpus is a non-CI script, because `export-import/samples/` is gitignored and absent on a clean checkout. |
| 4 — `unmapped_data` table, verbatim capture, exporter re-emission | **not shipped.** This is the step that makes unmapped non-destructive. Owned by [2026-08-23-unmapped-capture-design.md](../2026-08-23-unmapped-capture-design.md). |
| 5 — closed-schema coverage for RootsMagic, Genney, Gramps | **not shipped.** Those importers read SQLite / XML / Derby, not a GEDCOM node tree, so this mechanism does not reach them. |
| 6 — import-report UI | **shipped here.** |

**The honest summary: this plan made the report true. It did not make the data survive.**
The superseding spec's own words — "reporting a drop is weaker than not dropping". A tag
named in the report is still a tag the database does not hold.

Two implementation details differ from the superseding spec and are worth knowing before
step 4 builds on them:

- It specifies a `WeakSet`; this shipped a module-scoped `Set` that is created and
  discarded per import, with re-entry throwing. Same effect, and the explicit
  begin/end is what lets `collectUnaccounted` stay a pure function.
- It counts 34 raw traversal sites. This found ~20 that matter: the seven in
  `previewGedcomImport` are on the preview path, which never opens a session, and
  `normalize.ts` and `detect.ts` run before the session by construction.

The remaining follow-ups this plan filed on its own account are
[2026-08-23-dialect-tag-review.md](../2026-08-23-dialect-tag-review.md) — the 13 dialect
tags declared `unmapped:pending-dialect-tag-review`, plus the 742 undeclared paths the
real-world corpus surfaced.

## Global Constraints

- `CLAUDE.md` Prime Directive (cont.) clause 1 is the contract this plan implements. Accounting is **per node**, not per record type and not per level.
- The four ArkivDigital files under `export-import/min släkt/` are a real person's family data. `/export-import/` is gitignored. **Never commit them, never copy them into `tests/fixtures/`.** All committed fixtures are synthetic.
- No behaviour change to what the importer *stores*. This plan changes what it *reports*. Any diff to a `persons` / `events` / `places` / `sources` / `citations` row is a bug in this plan.
- `skipped` stays on `ImportReport` as a deprecated alias. Existing consumers (`GedcomImportSection.vue:77`, dialect tests) must keep working unchanged.
- Working in a worktree: `git -C <path>`, `npm --prefix <path>`, and **vitest needs `--root <abs-worktree-path>`** or it silently runs main's copy of the test file. See `.claude/rules/worktrees.md`.

---

## User goal

A researcher who imports a GEDCOM sees, in the import report, every tag the app did not read — with its tag path and how many times it occurred. If ArkivDigital wrote 9 046 `_AID` values and the app stored none of them, the report says so.

Today it does not. The report names 143 of the 40 000-plus tag occurrences it discards.

## Scope

Every phase of the GEDCOM import pipeline. Full list, all 20 under `src/import/gedcom/phases/`: `asso`, `coverage`, `families`, `group-records`, `groups`, `header-metadata`, `individuals`, `negations`, `notes`, `obje`, `place-citations`, `prep-inline-media`, `prep-places`, `repo`, `shared`, `sources`, `submitters`, `todos`, `translations`, plus `event-importer.ts`, `obje-importer.ts` and the two profile modules `genney.ts` / `holger.ts`.

Every fixture the repo ships gets triaged: the 10 dialect fixtures under `tests/fixtures/gedcom/dialects/`, plus every `.ged` under `tests/fixtures/gedcom/`.

### Scope deviations

- **`export-import/samples/` (36 real-world files) is not gated by CI.** The directory is gitignored and not present on a clean checkout, so a CI test cannot depend on it. Task 8 adds an opt-in script that runs the accounting over whatever samples are present locally, and the executor runs it once and records the output. Not a gate, a measurement.
- **The `arkivdigital` profile is not built here.** This plan makes AD's dropped tags *visible*. Mapping them is the next plan. Task 7 adds a synthetic AD dialect fixture so the drops are visible in CI, and every AD tag lands in the declared-exclusions list with reason `unmapped:pending-arkivdigital-profile`.
- **Native importers (Genney, Holger, RootsMagic, Gramps) are out of scope.** They read SQLite / XML / Derby, not a GEDCOM node tree, so this mechanism does not apply. Their equivalent is a separate plan.

## Verification

1. **The report names the drops.** Import a synthetic ArkivDigital fixture and assert `unaccountedFor` contains `SOUR._AID`, `INDI.BIRT.PLAC._ADPL._PARISH`, `INDI.RESI._DESC` and `INDI.BIRT.SOUR.DATA.DATE`, each with a correct count. This is the user goal in one assertion — the tags that vanish silently today are named.
2. **Nothing is unaccounted for and undeclared.** `tests/unit/import-tag-accounting.test.ts` imports every fixture under `tests/fixtures/gedcom/` and asserts every unaccounted path matches an entry in the declared-exclusions list. A new phase that reads an allowlist without marking fails this test.
3. **The user can see it.** The import-report panel renders the unaccounted list. Verified against the running app via dev MCP `ui_screenshot`, not by asserting the component exists.
4. **No stored data changed.** Import the four AD files before and after this plan's changes, and diff row counts across `persons`, `events`, `places`, `sources`, `citations`, `relationships`. All equal.
5. **`npm test`, `npm run lint`, `npm run build`, `npx playwright test`** green, with output captured in the close-out commit.

**User-goal-falsifiability check:** if 1-5 pass, can the goal be unmet? Yes, in one way — a phase could mark a node as read and then throw the value away, which accounting cannot detect. That is a different failure (read-and-discard, not silent-drop) and out of scope. Recorded here so nobody reads item 2 as a completeness guarantee it does not give.

## Measured baseline

Established 2026-08-23 by a throwaway probe that patched `getChild`/`getChildren` to mark, ran all four AD files through `importGedcom`, and walked the normalized tree.

| | |
|---|---|
| Nodes in the parsed tree (all four files) | 116 428 |
| Marked consumed via `getChild` / `getChildren` alone | 63 350 (54.4 %) |
| Unmarked | 53 078 across 193 paths |

The unmarked figure is an **upper bound**, not the silent-drop count. It includes nodes that *are* consumed through direct `node.children` access — `SOUR` 2776, `INDI` 822, `INDI.NAME.GIVN` 821, `INDI.NAME.SURN` 786, `INDI.FAMS` 673, `INDI.FAMC` 491, `FAM` 349. Task 4 marks those and the number drops. What remains is the real set.

Genuine drops confirmed present in that list: `INDI.RESI.SOUR._AID` 4761, `INDI.RESI.SOUR.DATA.DATE` 4604, the `_ADPL` subtree, `SOUR._AID` 2722, `INDI.RESI._TITLE` 1380, `INDI.RESI._DESC` 448.

**`CONT` and `CONC` never appear.** `parseGedcom` folds them into the parent's value at [parser.ts:30-37](src/gedcom/parser.ts#L30-L37) and creates no node. The design spec claimed they needed an ignore list. They do not.

## File Structure

| File | Responsibility |
|---|---|
| `src/import/gedcom/tag-accounting.ts` *(new)* | The session: `beginAccounting`, `endAccounting`, `markConsumed`, `isAccounting`. Module-scoped `Set<GedcomNode>`. Nothing else. |
| `src/import/gedcom/accounting-walk.ts` *(new)* | `collectUnaccounted(tree)` — pure tree walk, returns `{ path, count }[]`. No session knowledge, takes the consumed set as an argument. Pure function, trivially testable. |
| `src/import/gedcom/accounting-declared.ts` *(new)* | `DECLARED_UNMAPPED` — the tags the app deliberately does not model, each with a reason string. Data only, no logic. |
| `src/import/gedcom/node-utils.ts` *(modify)* | `getChild` / `getChildren` call `markConsumed`. Two lines each. |
| `src/import/gedcom/import-core.ts` *(modify)* | Open the session, run phases, collect, put `unaccountedFor` on the report. |
| `src/renderer/components/import/GedcomImportSection.vue` *(modify)* | Render the list. |
| `tests/unit/import-tag-accounting.test.ts` *(new)* | The gate: every fixture, unaccounted ⊆ declared. |
| `tests/fixtures/gedcom/dialects/arkivdigital.ged` *(new)* | Synthetic, ~60 lines, carries every AD custom tag once. |
| `scripts/accounting-over-samples.ts` *(new)* | Opt-in run over `export-import/samples/`. Not CI. |

Session state lives in `tag-accounting.ts` and nowhere else. The walk is pure so it can be tested without an import. The declared list is data so a reviewer can read it as a list of decisions.

---

## Tasks

### Task 1 (Tier 1): Accounting session

**Files:**
- Create: `src/import/gedcom/tag-accounting.ts`
- Test: `tests/unit/import-tag-accounting-session.test.ts`

**Interfaces:**
- Consumes: `GedcomNode` from `src/gedcom/parser`.
- Produces: `beginAccounting(): void`, `endAccounting(): Set<GedcomNode>`, `markConsumed(node: GedcomNode): void`, `isAccounting(): boolean`.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/import-tag-accounting-session.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { beginAccounting, endAccounting, markConsumed, isAccounting } from '../../src/import/gedcom/tag-accounting';
import type { GedcomNode } from '../../src/gedcom/parser';

const node = (tag: string): GedcomNode => ({ level: 1, xref: null, tag, value: '', children: [] });

afterEach(() => { if (isAccounting()) endAccounting(); });

describe('tag accounting session', () => {
  it('collects marked nodes between begin and end', () => {
    const a = node('NAME');
    beginAccounting();
    markConsumed(a);
    expect(endAccounting().has(a)).toBe(true);
  });

  it('marking outside a session is a no-op, not a crash', () => {
    expect(isAccounting()).toBe(false);
    expect(() => markConsumed(node('SEX'))).not.toThrow();
  });

  it('each session starts empty', () => {
    const a = node('NAME');
    beginAccounting(); markConsumed(a); endAccounting();
    beginAccounting();
    expect(endAccounting().has(a)).toBe(false);
  });

  it('refuses a nested session rather than silently merging two imports', () => {
    beginAccounting();
    expect(() => beginAccounting()).toThrow(/already active/i);
  });

  it('endAccounting without begin throws', () => {
    expect(() => endAccounting()).toThrow(/no active/i);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/import-tag-accounting-session.test.ts`
Expected: FAIL — `Cannot find module '../../src/import/gedcom/tag-accounting'`.

- [x] **Step 3: Implement**

```ts
// src/import/gedcom/tag-accounting.ts
/**
 * Import-time tag accounting session.
 *
 * `CLAUDE.md` Prime Directive (cont.) clause 1: the importer accounts for every
 * node in the parsed tree — a phase reads it, or the report names it. This module
 * holds the "a phase read it" half.
 *
 * Module-scoped rather than threaded through ImportContext because `getChild` /
 * `getChildren` have 211 call sites across 22 files and no access to the context.
 * Marking on read is what makes the accounting impossible to forget: not reading a
 * node is precisely what makes it unaccounted for.
 *
 * One session at a time. `beginAccounting` throws on re-entry rather than merging
 * two imports' node sets, which would let a concurrent import mask a real drop.
 * The multi-file import queue is sequential by design for this reason.
 */
import type { GedcomNode } from '../../gedcom/parser';

let session: Set<GedcomNode> | null = null;

export function beginAccounting(): void {
  if (session !== null) {
    throw new Error('tag accounting: a session is already active — imports must not overlap');
  }
  session = new Set();
}

export function endAccounting(): Set<GedcomNode> {
  if (session === null) {
    throw new Error('tag accounting: no active session to end');
  }
  const collected = session;
  session = null;
  return collected;
}

export function isAccounting(): boolean {
  return session !== null;
}

/** No-op when no session is active, so callers never need to check. */
export function markConsumed(node: GedcomNode): void {
  session?.add(node);
}
```

- [x] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/unit/import-tag-accounting-session.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 5: Commit**

```bash
git add src/import/gedcom/tag-accounting.ts tests/unit/import-tag-accounting-session.test.ts
git commit -m "feat(import): tag accounting session"
```

---

### Task 2 (Tier 1): The unaccounted-for walk

**Files:**
- Create: `src/import/gedcom/accounting-walk.ts`
- Test: `tests/unit/import-tag-accounting-walk.test.ts`

**Interfaces:**
- Consumes: `GedcomNode`, and a `Set<GedcomNode>` produced by `endAccounting()`.
- Produces: `collectUnaccounted(tree: GedcomNode[], consumed: Set<GedcomNode>): UnaccountedTag[]` where `interface UnaccountedTag { path: string; count: number }`, sorted by `count` descending then `path` ascending.

Pure function. Takes the set as an argument rather than reading the session, so it can be tested without an import and reused by the samples script.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/import-tag-accounting-walk.test.ts
import { describe, it, expect } from 'vitest';
import { collectUnaccounted } from '../../src/import/gedcom/accounting-walk';
import { parseGedcom } from '../../src/gedcom/parser';
import type { GedcomNode } from '../../src/gedcom/parser';

const GED = `0 @I1@ INDI
1 NAME Olof /Skänk/
1 BIRT
2 DATE 1785
2 PLAC Sverige
3 _ADPL
4 _COUNTRY Sverige
0 @I2@ INDI
1 BIRT
2 PLAC Norge
3 _ADPL
4 _COUNTRY Norge
`;

function findByTag(nodes: GedcomNode[], tag: string, out: GedcomNode[] = []): GedcomNode[] {
  for (const n of nodes) { if (n.tag === tag) out.push(n); findByTag(n.children, tag, out); }
  return out;
}

describe('collectUnaccounted', () => {
  it('reports nothing when every node is consumed', () => {
    const tree = parseGedcom(GED);
    const all = new Set<GedcomNode>();
    const walk = (ns: GedcomNode[]) => { for (const n of ns) { all.add(n); walk(n.children); } };
    walk(tree);
    expect(collectUnaccounted(tree, all)).toEqual([]);
  });

  it('reports unconsumed nodes by full tag path, aggregated across records', () => {
    const tree = parseGedcom(GED);
    const consumed = new Set<GedcomNode>();
    const walk = (ns: GedcomNode[]) => {
      for (const n of ns) { if (!n.tag.startsWith('_')) consumed.add(n); walk(n.children); }
    };
    walk(tree);
    expect(collectUnaccounted(tree, consumed)).toEqual([
      { path: 'INDI.BIRT.PLAC._ADPL', count: 2 },
      { path: 'INDI.BIRT.PLAC._ADPL._COUNTRY', count: 2 },
    ]);
  });

  it('reports an unconsumed parent and its unconsumed children separately', () => {
    const tree = parseGedcom(GED);
    const adpl = findByTag(tree, '_ADPL');
    expect(adpl).toHaveLength(2);
    const result = collectUnaccounted(tree, new Set());
    const paths = result.map(r => r.path);
    expect(paths).toContain('INDI.BIRT.PLAC._ADPL');
    expect(paths).toContain('INDI.BIRT.PLAC._ADPL._COUNTRY');
    expect(paths).toContain('INDI.NAME');
  });

  it('sorts by count descending, then path ascending', () => {
    const tree = parseGedcom(GED);
    const result = collectUnaccounted(tree, new Set());
    for (let i = 1; i < result.length; i++) {
      const [a, b] = [result[i - 1], result[i]];
      expect(a.count > b.count || (a.count === b.count && a.path <= b.path)).toBe(true);
    }
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/import-tag-accounting-walk.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
// src/import/gedcom/accounting-walk.ts
/**
 * Walks a parsed GEDCOM tree and reports every node not present in the consumed
 * set, aggregated by full tag path.
 *
 * Pure: takes the consumed set as an argument rather than reading the accounting
 * session, so it is testable without running an import and reusable by the
 * samples script.
 *
 * A path is the tag chain from the level-0 record down, joined with '.', e.g.
 * `INDI.BIRT.PLAC._ADPL._PARISH`. Xrefs are not part of the path — the point is
 * to name the shape of what was dropped, not each occurrence.
 */
import type { GedcomNode } from '../../gedcom/parser';

export interface UnaccountedTag {
  path: string;
  count: number;
}

export function collectUnaccounted(
  tree: GedcomNode[],
  consumed: Set<GedcomNode>,
): UnaccountedTag[] {
  const counts = new Map<string, number>();

  const walk = (nodes: GedcomNode[], prefix: string): void => {
    for (const node of nodes) {
      const path = prefix === '' ? node.tag : `${prefix}.${node.tag}`;
      if (!consumed.has(node)) {
        counts.set(path, (counts.get(path) ?? 0) + 1);
      }
      if (node.children.length > 0) walk(node.children, path);
    }
  };
  walk(tree, '');

  return Array.from(counts, ([path, count]) => ({ path, count }))
    .sort((a, b) => (b.count - a.count) || a.path.localeCompare(b.path));
}
```

- [x] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/unit/import-tag-accounting-walk.test.ts`
Expected: PASS, 4 tests.

- [x] **Step 5: Commit**

```bash
git add src/import/gedcom/accounting-walk.ts tests/unit/import-tag-accounting-walk.test.ts
git commit -m "feat(import): collectUnaccounted tree walk"
```

---

### Task 3 (Tier 1): Mark on read in node-utils, wire the session into the import

**Files:**
- Modify: `src/import/gedcom/node-utils.ts`
- Modify: `src/import/gedcom/import-core.ts` (session open/close around the phase run; `unaccountedFor` on the report)
- Test: `tests/unit/import-tag-accounting.test.ts` (created here, extended in Task 6)

**Interfaces:**
- Consumes: Task 1's `beginAccounting` / `endAccounting`, Task 2's `collectUnaccounted`.
- Produces: `ImportReport.unaccountedFor: UnaccountedTag[]` and `ValidationReport.unaccountedFor`. `skipped` is unchanged and still populated.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/import-tag-accounting.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

// One INDI whose BIRT carries an ArkivDigital _ADPL block and a citation _AID.
// None of these tags is read by any phase today, and none of them is reported.
const AD_SHAPED = `0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL ArkivDigital: Valbo (X) C:15 (1920-1928)
1 _AID v191316
1 _URL https://www.arkivdigital.se/aid/show/v191316.b580.s52
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 SEX M
1 BIRT
2 DATE 07 JUN 1879
2 PLAC Högnäs, Hedesunda, Gävleborgs län, Sverige
3 _ADPL
4 _LOCALITY Högnäs
4 _PARISH_AID a3096
4 _PARISH Hedesunda
4 _COUNTY Gävleborgs län
4 _COUNTRY Sverige
2 SOUR @S1@
3 PAGE 52
3 DATA
4 DATE 18 JAN 2022
4 TEXT ArkivDigital: Valbo (X) C:15 Bild 580 / sid 52
3 _AID v191316.b580.s52
2 _DESC Trolovningsbarn
0 TRLR
`;

describe('import tag accounting', () => {
  it('names the ArkivDigital tags the importer does not read', async () => {
    const report: any = await importGedcom(db, parseGedcom(AD_SHAPED));
    const paths = new Map<string, number>(
      (report.unaccountedFor ?? []).map((u: any) => [u.path, u.count]),
    );
    expect(paths.get('SOUR._AID')).toBe(1);
    expect(paths.get('INDI.BIRT.PLAC._ADPL._PARISH')).toBe(1);
    expect(paths.get('INDI.BIRT.PLAC._ADPL._PARISH_AID')).toBe(1);
    expect(paths.get('INDI.BIRT._DESC')).toBe(1);
    expect(paths.get('INDI.BIRT.SOUR.DATA.DATE')).toBe(1);
    expect(paths.get('INDI.BIRT.SOUR._AID')).toBe(1);
  });

  it('does not report tags the importer does read', async () => {
    const report: any = await importGedcom(db, parseGedcom(AD_SHAPED));
    const paths = new Set((report.unaccountedFor ?? []).map((u: any) => u.path));
    expect(paths.has('SOUR.TITL')).toBe(false);
    expect(paths.has('INDI.BIRT.DATE')).toBe(false);
    expect(paths.has('SOUR._URL')).toBe(false);
  });

  it('leaves the deprecated skipped field populated for existing consumers', async () => {
    const report: any = await importGedcom(db, parseGedcom(AD_SHAPED));
    expect(Array.isArray(report.skipped)).toBe(true);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/import-tag-accounting.test.ts`
Expected: FAIL — `report.unaccountedFor` is `undefined`, so `paths.get(...)` returns `undefined` and the first assertion fails with `expected undefined to be 1`.

- [x] **Step 3: Mark on read**

```ts
// src/import/gedcom/node-utils.ts — replace the two accessors
import { markConsumed } from './tag-accounting';

export function getChild(node: GedcomNode, tag: string): GedcomNode | undefined {
  const found = node.children.find(c => c.tag === tag);
  if (found) markConsumed(found);
  return found;
}

export function getChildren(node: GedcomNode, tag: string): GedcomNode[] {
  const found = node.children.filter(c => c.tag === tag);
  for (const child of found) markConsumed(child);
  return found;
}
```

- [x] **Step 4: Open the session around the phase run**

In `src/import/gedcom/import-core.ts`, at the call site around line 444-450 where `normalizedTree` is built and `doImportGedcom` is invoked:

```ts
import { beginAccounting, endAccounting } from './tag-accounting';
import { collectUnaccounted, type UnaccountedTag } from './accounting-walk';

// ...
const normalizedTree = normalizeForImport(tree, version);

let unaccountedFor: UnaccountedTag[] = [];
beginAccounting();
try {
  partial = await doImportGedcom(cachedDb, normalizedTree, options, tree);
} finally {
  // `finally` so a throwing phase cannot strand the session and make the next
  // import fail with "a session is already active".
  unaccountedFor = collectUnaccounted(normalizedTree, endAccounting());
}
```

Add `unaccountedFor` to both report interfaces:

```ts
export interface ImportReport {
  // ... existing fields unchanged ...
  /** @deprecated Use `unaccountedFor`. Covers level-1 INDI/FAM tags only. */
  skipped: { tag: string; count: number }[];
  /** Every tag path in the file that no phase read. Prime Directive (cont.) clause 1. */
  unaccountedFor: UnaccountedTag[];
}
```

and include it in the returned object alongside `skipped: partial.skipped`.

- [x] **Step 5: Run the test and watch it pass**

Run: `npx vitest run tests/unit/import-tag-accounting.test.ts`
Expected: PASS, 3 tests.

- [x] **Step 6: Prove no stored data changed**

Run: `npx vitest run tests/unit/`
Expected: PASS. Any failure here means marking changed behaviour, which it must not — `getChild` still returns exactly what it returned before.

- [x] **Step 7: Commit**

```bash
git add src/import/gedcom/node-utils.ts src/import/gedcom/import-core.ts tests/unit/import-tag-accounting.test.ts
git commit -m "feat(import): report unaccounted-for tag paths"
```

---

### Task 4 (Tier 1): Mark the direct-traversal sites

**Files:**
- Modify: `src/import/gedcom/import-core.ts` (7 sites), `phases/individuals.ts` (3), `phases/notes.ts` (2), `phases/families.ts` (1), `phases/prep-places.ts` (1), `phases/prep-inline-media.ts` (1), `phases/translations.ts` (1), `profiles/holger.ts` (4)
- Test: `tests/unit/import-tag-accounting.test.ts` (extend)

**Interfaces:**
- Consumes: `markConsumed` from Task 1.
- Produces: no new exports. Removes the false positives from `unaccountedFor`.

Phases that walk `node.children` directly bypass Task 3's marking, so nodes they genuinely read are reported as dropped. The measured baseline shows the seven biggest: `SOUR` 2776, `INDI` 822, `INDI.NAME.GIVN` 821, `INDI.NAME.SURN` 786, `INDI.FAMS` 673, `INDI.FAMC` 491, `FAM` 349.

`normalize.ts` and `detect.ts` need no marking — both run before `beginAccounting()`, so their reads are outside the session by construction.

- [x] **Step 1: Write the failing test**

```ts
// append to tests/unit/import-tag-accounting.test.ts
const CORE_TAGS = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL A source
0 @I1@ INDI
1 NAME Erik /Hedqvist/
2 GIVN Erik
2 SURN Hedqvist
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME Anna /Ersdotter/
2 GIVN Anna
2 SURN Ersdotter
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Barn /Hedqvist/
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR
`;

it('does not report core tags that direct-traversal phases consume', async () => {
  const report: any = await importGedcom(db, parseGedcom(CORE_TAGS));
  const paths = new Set((report.unaccountedFor ?? []).map((u: any) => u.path));
  for (const p of ['INDI', 'FAM', 'SOUR', 'HEAD', 'TRLR',
                   'INDI.NAME.GIVN', 'INDI.NAME.SURN',
                   'INDI.FAMS', 'INDI.FAMC',
                   'FAM.HUSB', 'FAM.WIFE', 'FAM.CHIL']) {
    expect(paths, `${p} is consumed but reported as unaccounted`).not.toContain(p);
  }
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/import-tag-accounting.test.ts -t 'direct-traversal'`
Expected: FAIL, listing the paths still reported. That list is the work.

- [x] **Step 3: Mark at each direct-traversal site**

The full set of `.children` traversals inside the session, from a repo-wide grep.
`normalize.ts` (11 sites) and `detect.ts` (2 sites) are **excluded** — both run before
`beginAccounting()`, so their reads are outside the session by construction.

| File | Lines |
|---|---|
| `import-core.ts` | 326, 335, 355, 356, 358, 365, 366 |
| `phases/individuals.ts` | 114, 388, 391 |
| `phases/notes.ts` | 26, 41 |
| `phases/families.ts` | 162 |
| `phases/prep-places.ts` | 32 |
| `phases/prep-inline-media.ts` | 32 |
| `phases/translations.ts` | 130 |
| `profiles/holger.ts` | 21, 38, 39, 40 |

Plus the record-claiming loops at the head of each phase (`for (const n of ctx.tree) if (n.tag === 'SOUR' …)`), which is where `INDI` 822, `FAM` 349 and `SOUR` 2776 come from.

The pattern at every site is one added line. Example, `src/import/gedcom/phases/families.ts:162`:

```ts
for (const child of node.children) {
  markConsumed(child);   // ← add
  // ... existing body unchanged
}
```

For record-claiming loops in `import-core.ts` and the phase entry points, mark the record as the phase claims it. Example, `phaseSources`:

```ts
for (const n of ctx.tree) if (n.tag === 'SOUR' && n.xref) { markConsumed(n); sourNodes.push(n); }
```

Work through the failing paths from Step 2 one at a time, re-running the test after each. Do not add a blanket "mark everything" walk — that would make the test pass while destroying its value.

- [x] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/unit/import-tag-accounting.test.ts`
Expected: PASS, 4 tests.

- [x] **Step 5: Re-measure against the real AD files**

The four AD files are gitignored local data — this is a measurement, not a test.

```bash
npx tsx -e "
import pkg from 'node-sqlite3-wasm'; const { Database } = pkg;
import { readFileSync, readdirSync } from 'node:fs';
import { initializeSchema } from './src/api/schema';
import { parseGedcom } from './src/gedcom/parser';
import { importGedcom } from './src/import/gedcom';
const dir = 'export-import/min släkt';
const db = new Database(':memory:'); await initializeSchema(db);
let n = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith('.ged'))) {
  const r = await importGedcom(db, parseGedcom(readFileSync(dir + '/' + f, 'utf-8')));
  n += r.unaccountedFor.reduce((a, u) => a + u.count, 0);
  if (f.includes('Mormors')) console.log(r.unaccountedFor.slice(0, 20));
}
console.log('total unaccounted across four files:', n);
"
```

Expected: the top entries are `_AID`, the `_ADPL` subtree, `_TITLE`, `_DESC` and `SOUR.DATA.DATE` — and **no** core tags (`INDI`, `FAM`, `SOUR`, `NAME.GIVN`, `FAMS`, `FAMC`). Record the total in the commit message.

- [x] **Step 6: Commit**

```bash
git add src/import/gedcom/
git commit -m "feat(import): mark direct-traversal reads for tag accounting"
```

---

### Task 5 (Tier 1): Declared-exclusions list

**Files:**
- Create: `src/import/gedcom/accounting-declared.ts`
- Test: `tests/unit/import-tag-accounting-declared.test.ts`

**Interfaces:**
- Produces: `interface DeclaredUnmapped { path: string; reason: string }`, `DECLARED_UNMAPPED: DeclaredUnmapped[]`, and `matchDeclared(path: string): DeclaredUnmapped | undefined`.
- `path` supports a single trailing `*` wildcard and a leading `*.` wildcard, nothing more. `*.PLAC._ADPL._PARISH` matches that suffix under any event. `INDI.BIRT.*` matches any descendant of that prefix. Deliberately weak so nobody writes `*` and declares everything.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/import-tag-accounting-declared.test.ts
import { describe, it, expect } from 'vitest';
import { DECLARED_UNMAPPED, matchDeclared } from '../../src/import/gedcom/accounting-declared';

describe('declared unmapped tags', () => {
  it('matches an exact path', () => {
    expect(matchDeclared('SOUR._AID')?.reason).toMatch(/arkivdigital/i);
  });

  it('matches a leading wildcard suffix', () => {
    expect(matchDeclared('INDI.BIRT.PLAC._ADPL._PARISH')).toBeDefined();
    expect(matchDeclared('INDI.RESI.PLAC._ADPL._PARISH')).toBeDefined();
  });

  it('returns undefined for an undeclared path', () => {
    expect(matchDeclared('INDI.SOMETHING_NOBODY_DECLARED')).toBeUndefined();
  });

  it('rejects a bare catch-all — every entry must name something', () => {
    for (const d of DECLARED_UNMAPPED) {
      expect(d.path, 'a bare "*" declares everything and defeats the test').not.toBe('*');
      expect(d.path.length, `overly broad pattern: ${d.path}`).toBeGreaterThan(3);
    }
  });

  it('every entry carries a non-empty reason', () => {
    for (const d of DECLARED_UNMAPPED) {
      expect(d.reason.trim().length, `empty reason for ${d.path}`).toBeGreaterThan(0);
    }
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/import-tag-accounting-declared.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
// src/import/gedcom/accounting-declared.ts
/**
 * Tags the importer deliberately does not model.
 *
 * `CLAUDE.md` Prime Directive (cont.) clause 1: the app does not have to model
 * every tag, it has to say what it didn't. An entry here IS that statement, and
 * the reason is the whole point — a path with a vague reason is not a decision,
 * it is a shrug.
 *
 * Adding an entry is how you make `import-tag-accounting.test.ts` pass. That is
 * intentional: the cost of not mapping a tag is having to write down why.
 *
 * Pattern syntax, deliberately minimal:
 *   'INDI.RESI._TITLE'   exact path
 *   '*.PLAC._ADPL'       suffix match under any parent
 *   'INDI.BIRT.*'        any descendant of this prefix
 */

export interface DeclaredUnmapped {
  path: string;
  reason: string;
}

export const DECLARED_UNMAPPED: DeclaredUnmapped[] = [
  // ── ArkivDigital — mapped by the arkivdigital profile in the next plan ────
  { path: 'SOUR._AID',            reason: 'unmapped:pending-arkivdigital-profile — archive volume pointer, needs external_identifiers' },
  { path: '*.SOUR._AID',          reason: 'unmapped:pending-arkivdigital-profile — image pointer on the citation' },
  { path: '*.PLAC._ADPL',         reason: 'unmapped:pending-arkivdigital-profile — place hierarchy block' },
  { path: '*.PLAC._ADPL._LOCALITY',   reason: 'unmapped:pending-arkivdigital-profile' },
  { path: '*.PLAC._ADPL._PARISH',     reason: 'unmapped:pending-arkivdigital-profile' },
  { path: '*.PLAC._ADPL._PARISH_AID', reason: 'unmapped:pending-arkivdigital-profile' },
  { path: '*.PLAC._ADPL._COUNTY',     reason: 'unmapped:pending-arkivdigital-profile' },
  { path: '*.PLAC._ADPL._COUNTRY',    reason: 'unmapped:pending-arkivdigital-profile' },
  { path: '*.PLAC._ADPL._JUDICIAL',   reason: 'unmapped:pending-arkivdigital-profile — härad; AD documents _JUDICIAL_DISTRICT but 5.5.1 caps tags at 15 chars' },
  { path: '*.SOUR.DATA.DATE',     reason: 'unmapped:pending-arkivdigital-profile — date the researcher consulted the record; citations.date_accessed exists and is empty' },
  { path: '*._DESC',              reason: 'unmapped:pending-arkivdigital-profile — researcher annotation on an event' },
  { path: '*._TITLE',             reason: 'unmapped:pending-arkivdigital-profile — occupation/title' },

  // ── LDS ordinances — already disclosed via unmappedData, kept for parity ──
  { path: 'INDI.BAPL', reason: 'excluded:not-relevant — LDS ordinance, no app concept' },
  { path: 'INDI.CONL', reason: 'excluded:not-relevant — LDS ordinance, no app concept' },
  { path: 'INDI.ENDL', reason: 'excluded:not-relevant — LDS ordinance, no app concept' },
  { path: 'INDI.SLGC', reason: 'excluded:not-relevant — LDS ordinance, no app concept' },
  { path: 'FAM.SLGS',  reason: 'excluded:not-relevant — LDS ordinance, no app concept' },
];

export function matchDeclared(path: string): DeclaredUnmapped | undefined {
  return DECLARED_UNMAPPED.find(d => {
    if (d.path === path) return true;
    if (d.path.startsWith('*.')) return path.endsWith(d.path.slice(1));
    if (d.path.endsWith('.*'))   return path.startsWith(d.path.slice(0, -1));
    return false;
  });
}
```

- [x] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/unit/import-tag-accounting-declared.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 5: Commit**

```bash
git add src/import/gedcom/accounting-declared.ts tests/unit/import-tag-accounting-declared.test.ts
git commit -m "feat(import): declared-unmapped tag list"
```

---

### Task 6 (Tier 1): The gate — every fixture, unaccounted ⊆ declared

**Files:**
- Modify: `tests/unit/import-tag-accounting.test.ts`
- Modify: `src/import/gedcom/accounting-declared.ts` (entries added as the triage demands)

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: the CI gate. No new exports.

This is where the existing fixtures get triaged. Expect failures on first run — each is a drop nobody could previously see. For each, decide: map it (out of scope here, so file it), or declare it with a reason.

- [x] **Step 1: Write the failing test**

```ts
// append to tests/unit/import-tag-accounting.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matchDeclared } from '../../src/import/gedcom/accounting-declared';

const FIXTURE_DIRS = ['tests/fixtures/gedcom', 'tests/fixtures/gedcom/dialects'];

function fixtureFiles(): string[] {
  const out: string[] = [];
  for (const dir of FIXTURE_DIRS) {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.isFile() && f.name.endsWith('.ged')) out.push(join(dir, f.name));
    }
  }
  return out.sort();
}

describe('every shipped fixture is fully accounted for', () => {
  for (const file of fixtureFiles()) {
    it(`${file} — no undeclared unaccounted tags`, async () => {
      const freshDb = await createTestDb();
      const report: any = await importGedcom(freshDb, parseGedcom(readFileSync(file, 'utf-8')));
      const undeclared = (report.unaccountedFor ?? []).filter((u: any) => !matchDeclared(u.path));
      expect(
        undeclared,
        `${file} drops these without a declaration — map them, or add an entry with a reason ` +
        `to src/import/gedcom/accounting-declared.ts:\n` +
        undeclared.map((u: any) => `  ${String(u.count).padStart(5)}  ${u.path}`).join('\n'),
      ).toEqual([]);
    });
  }
});
```

- [x] **Step 2: Run it and read the failures**

Run: `npx vitest run tests/unit/import-tag-accounting.test.ts`
Expected: FAIL on several fixtures. Each failure message lists the undeclared paths and counts. This list is the previously invisible drop set — read it before touching anything.

- [x] **Step 3: Triage each undeclared path**

For each path in the failure output, add an entry to `DECLARED_UNMAPPED` with a reason from this vocabulary:

- `excluded:not-relevant — <why>` — genuinely no app concept (LDS ordinances, app-internal flags like `_UPD` / `_PPEXCLUDE`).
- `excluded:structural — <why>` — GEDCOM plumbing carrying no authored value.
- `unmapped:pending-<plan> — <what it holds>` — real authored data we intend to map. **Every one of these needs a plan filed.** If you write this reason and no plan exists, file it before committing.

If a path holds authored research data and you cannot name a plan for it, stop and surface to the user rather than declaring it.

- [x] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/unit/import-tag-accounting.test.ts`
Expected: PASS, all fixtures.

- [x] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. Record the summary line.

- [x] **Step 6: Commit**

```bash
git add tests/unit/import-tag-accounting.test.ts src/import/gedcom/accounting-declared.ts
git commit -m "test(import): gate every fixture on tag accounting"
```

---

### Task 7 (Tier 1): Synthetic ArkivDigital dialect fixture

**Files:**
- Create: `tests/fixtures/gedcom/dialects/arkivdigital.ged`
- Modify: `tests/unit/import-gedcom-dialects.test.ts`

**Interfaces:**
- Consumes: the Task 6 gate, which picks the new fixture up automatically.
- Produces: a committed, synthetic file carrying every AD custom tag at least once.

Synthetic names and places only. The four real files are gitignored local data and must not be copied here.

- [x] **Step 1: Write the fixture**

```
0 HEAD
1 SOUR Arkiv_Digital
2 NAME AD Family tree
2 CORP Arkiv Digital
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL ArkivDigital: Testby (X) C:1 (1800-1810)
1 _AID v100001
1 _URL https://www.arkivdigital.se/aid/show/v100001.b10.s5
0 @O1@ OBJE
1 FILE testbild.jpg
1 _FOFN original.jpg
1 _SIZE 12345
1 _OWN Testägare
1 _CAPT 1905
0 @I1@ INDI
1 NAME Anna* Testdotter /Testsson/
2 GIVN Anna* Testdotter
2 SURN Testsson
1 SEX F
1 _TITLE Soldathustru
1 BIRT
2 DATE 01 JAN 1850
2 PLAC Testtorpet, Testby, Testlands län, Sverige
3 MAP
4 LATI N60.000000
4 LONG E17.000000
3 _ADPL
4 _LOCALITY Testtorpet
4 _PARISH_AID a9001
4 _PARISH Testby
4 _COUNTY Testlands län
4 _COUNTRY Sverige
2 SOUR @S1@
3 PAGE 5
3 DATA
4 DATE 18 JAN 2022
4 TEXT ArkivDigital: Testby (X) C:1 Bild 10 / sid 5
3 _AID v100001.b10.s5
2 _DESC Trolovningsbarn
1 RESI
2 DATE ABT 1870
2 PLAC Testgården, Testby, Testlands län, Sverige
3 _ADPL
4 _LOCALITY Testgården
4 _PARISH_AID a9001
4 _PARISH Testby
4 _COUNTY Testlands län
4 _COUNTRY Sverige
1 PROB
2 DATE 1900
2 PLAC Testby, Testlands län, Sverige
3 _ADPL
4 _PARISH Testby
4 _COUNTY Testlands län
4 _JUDICIAL Testlands häradsrätt
4 _COUNTRY Sverige
1 OBJE @O1@
2 _POS 10,20,30,40
2 _PRIM Y
1 NOTE En anteckning
2 _TITLE Rubrik
2 _TAG Etikett
3 TYPE label
1 FAMS @F1@
0 @I2@ INDI
1 NAME Erik /Testsson/
1 SEX M
1 FAMS @F1@
0 @I3@ INDI
1 NAME Barn /Testsson/
1 SEX M
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 CHIL @I3@
2 _FREL Biological
2 _MREL Biological
1 MARR
2 DATE 1875
2 PLAC Testby, Testlands län, Sverige
3 _ADPL
4 _PARISH Testby
4 _COUNTRY Sverige
0 TRLR
```

- [x] **Step 2: Register it in the dialect test**

Add `'arkivdigital'` to the dialect list in `tests/unit/import-gedcom-dialects.test.ts` alongside the existing ten.

- [x] **Step 3: Run both tests and watch accounting fail**

Run: `npx vitest run tests/unit/import-gedcom-dialects.test.ts tests/unit/import-tag-accounting.test.ts`
Expected: the dialect test PASSES (no core tag in `skipped`). The accounting test FAILS on the new fixture, listing AD tags not yet in `DECLARED_UNMAPPED` — likely `INDI.OBJE._POS`, `INDI.OBJE._PRIM`, `OBJE._FOFN`, `OBJE._SIZE`, `OBJE._OWN`, `OBJE._CAPT`, `INDI.NOTE._TAG`, `INDI.NOTE._TAG.TYPE`, `FAM.CHIL._FREL`, `FAM.CHIL._MREL`.

That contrast is the point: the dialect test passing while the accounting test fails is exactly the blindness this plan removes.

- [x] **Step 4: Declare the remaining AD tags**

Add entries for each, reason `unmapped:pending-arkivdigital-profile` plus what the tag holds.

- [x] **Step 5: Run and watch both pass**

Run: `npx vitest run tests/unit/import-gedcom-dialects.test.ts tests/unit/import-tag-accounting.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add tests/fixtures/gedcom/dialects/arkivdigital.ged tests/unit/import-gedcom-dialects.test.ts src/import/gedcom/accounting-declared.ts
git commit -m "test(import): synthetic ArkivDigital dialect fixture"
```

---

### Task 8 (Tier 1): Surface it to the user, and a samples script

**Files:**
- Modify: `src/renderer/components/import/GedcomImportSection.vue`
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`
- Create: `scripts/accounting-over-samples.ts`

**Interfaces:**
- Consumes: `ImportReport.unaccountedFor`.
- Produces: a rendered report section. No new exports.

- [x] **Step 1: Add the i18n keys**

Keys live under the `importExport` namespace, beside `importReportSkipped` at
`src/renderer/i18n/en.ts:1602` and `sv.ts:1602`. Match that convention — a flat
top-level key will not resolve.

`en.ts`:
```ts
importReportUnaccounted: 'Tags not imported:',
importReportUnaccountedHint: 'These were in the file but the app does not handle them. Your file is unchanged.',
```

`sv.ts`:
```ts
importReportUnaccounted: 'Taggar som inte lästes in:',
importReportUnaccountedHint: 'De fanns i filen men hanteras inte av appen. Din fil är oförändrad.',
```

- [x] **Step 2: Render the section**

Directly after the existing `skipped` block at `GedcomImportSection.vue:77-83`, matching
its markup exactly — `<p class="report-section-label">`, not a heading, and `$t` with the
namespaced key:

```vue
<div v-if="importReport.unaccountedFor && importReport.unaccountedFor.length > 0" class="report-section">
  <p class="report-section-label">{{ $t('importExport.importReportUnaccounted') }}</p>
  <p class="report-hint">{{ $t('importExport.importReportUnaccountedHint') }}</p>
  <ul>
    <li v-for="u in importReport.unaccountedFor" :key="u.path">{{ u.path }}: {{ u.count }}</li>
  </ul>
</div>
```

**Two type declarations need the field, not one.** The component declares the report shape
twice — the component-level type at line 159, and an inline `result.report` type at line
284 inside the import handler. Add to both, or the field is typed away before it reaches
the template:

```ts
unaccountedFor?: { path: string; count: number }[];
```

- [x] **Step 3: Verify in the running app**

Launch with `npm start`, import `tests/fixtures/gedcom/dialects/arkivdigital.ged`, and
capture the report with dev MCP `ui_screenshot`. Confirm the section renders with the AD
paths listed under the existing "Unrecognised tags" block. A component test is not
sufficient — Verification §3 requires seeing it.

Note `GedcomImportSection.vue` was repaired in `5e80291d` after the Tauri port returned
the wrong envelope shapes. `tests/components/GedcomImportSection-flow.test.ts` now covers
that flow — run it and keep it green.

- [x] **Step 4: Write the samples script**

```ts
// scripts/accounting-over-samples.ts
/**
 * Runs tag accounting over every .ged under export-import/samples/ and prints
 * the undeclared paths per file.
 *
 * Not a CI gate — the directory is gitignored and absent on a clean checkout.
 * Run it locally when adding tag handling, to see what the real-world corpus
 * drops that the synthetic fixtures do not.
 *
 *   npx tsx scripts/accounting-over-samples.ts
 */
import pkg from 'node-sqlite3-wasm';
const { Database } = pkg as unknown as { Database: new (p: string) => never };
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { initializeSchema } from '../src/api/schema';
import { parseGedcom } from '../src/gedcom/parser';
import { importGedcom } from '../src/import/gedcom';
import { matchDeclared } from '../src/import/gedcom/accounting-declared';

const ROOT = 'export-import/samples';

function gedFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) gedFiles(full, out);
    else if (e.name.endsWith('.ged')) out.push(full);
  }
  return out;
}

async function main(): Promise<void> {
  if (!existsSync(ROOT)) {
    console.log(`${ROOT} not present — nothing to do.`);
    return;
  }
  const totals = new Map<string, number>();
  for (const file of gedFiles(ROOT).sort()) {
    const db = new Database(':memory:');
    await initializeSchema(db as never);
    let report: { unaccountedFor?: { path: string; count: number }[] };
    try {
      report = await importGedcom(db as never, parseGedcom(readFileSync(file, 'utf-8')));
    } catch (err) {
      console.log(`\n### ${file}\n  IMPORT FAILED: ${(err as Error).message}`);
      continue;
    }
    const undeclared = (report.unaccountedFor ?? []).filter(u => !matchDeclared(u.path));
    console.log(`\n### ${file}  — ${undeclared.length} undeclared paths`);
    for (const u of undeclared.slice(0, 15)) {
      console.log(`  ${String(u.count).padStart(6)}  ${u.path}`);
      totals.set(u.path, (totals.get(u.path) ?? 0) + u.count);
    }
    if (undeclared.length > 15) console.log(`  … and ${undeclared.length - 15} more`);
  }
  console.log(`\n===== GRAND TOTAL: ${totals.size} distinct undeclared paths =====`);
  for (const [path, count] of [...totals].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    console.log(`  ${String(count).padStart(7)}  ${path}`);
  }
}

await main();
```

Exit 0 always — it reports, it does not gate.

- [x] **Step 5: Run it and record the output**

Run: `npx tsx scripts/accounting-over-samples.ts`
Expected: a per-file list. Paste the totals into the commit message. If a real sample drops something the synthetic fixtures miss, add it to `DECLARED_UNMAPPED` with a reason.

- [x] **Step 6: Commit**

```bash
git add src/renderer/components/import/GedcomImportSection.vue src/renderer/i18n/ scripts/accounting-over-samples.ts src/import/gedcom/accounting-declared.ts
git commit -m "feat(import): show unaccounted-for tags in the import report"
```

---

### Task 9 (Tier 1): Prove no stored data changed

**Files:**
- Create: `scripts/import-row-counts.ts` (committed — it is the evidence tool, not a throwaway)

**Interfaces:** none exported.

Verification §4. Marking must be inert with respect to what the importer stores. Two runs
of the same script — one on the merge-base, one on this branch — must print identical
counts. A script rather than an ad-hoc snippet so both runs are provably the same code.

- [x] **Step 1: Write the counting script**

```ts
// scripts/import-row-counts.ts
/**
 * Imports every .ged in a directory into one in-memory DB and prints row counts.
 *
 * Used to prove an importer change is inert: run on the merge-base and on the
 * branch, diff the output. Any difference means stored data changed.
 *
 *   npx tsx scripts/import-row-counts.ts "export-import/min släkt"
 */
import pkg from 'node-sqlite3-wasm';
const { Database } = pkg as unknown as { Database: new (p: string) => never };
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeSchema } from '../src/api/schema';
import { parseGedcom } from '../src/gedcom/parser';
import { importGedcom } from '../src/import/gedcom';

const TABLES = [
  'persons', 'person_names', 'person_identifiers', 'events', 'event_participants',
  'relationships', 'places', 'sources', 'citations', 'media', 'notes', 'repositories',
];

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: import-row-counts.ts <dir>');
  const db = new Database(':memory:');
  await initializeSchema(db as never);
  const origLog = console.log;
  console.log = (...a: unknown[]) => {
    if (!String(a[0]).startsWith('[import-timing]')) origLog(...a);
  };
  for (const f of readdirSync(dir).filter(f => f.endsWith('.ged')).sort()) {
    await importGedcom(db as never, parseGedcom(readFileSync(join(dir, f), 'utf-8')));
  }
  console.log = origLog;
  for (const t of TABLES) {
    const rows = (db as unknown as { all(q: string): { c: number }[] })
      .all(`SELECT COUNT(*) c FROM ${t}`);
    console.log(`${t.padEnd(22)} ${rows[0].c}`);
  }
}

await main();
```

- [x] **Step 2: Commit the script before measuring**

```bash
git add scripts/import-row-counts.ts
git commit -m "chore(scripts): row-count tool for proving importer changes inert"
```

- [x] **Step 3: Run it on this branch**

Run: `npx tsx scripts/import-row-counts.ts "export-import/min släkt" | tee /tmp/counts-after.txt`
Expected: `persons 822`, `events 5025`, `places 1617`, `sources 2776`, `citations 6752`, `relationships 1306`.

- [x] **Step 4: Run it on the merge-base**

```bash
git worktree add /tmp/acct-baseline "$(git merge-base HEAD main)"
cp scripts/import-row-counts.ts /tmp/acct-baseline/scripts/
ln -s "$(pwd)/node_modules" /tmp/acct-baseline/node_modules
ln -s "$(pwd)/export-import" /tmp/acct-baseline/export-import
npm --prefix /tmp/acct-baseline exec -- tsx /tmp/acct-baseline/scripts/import-row-counts.ts "export-import/min släkt" | tee /tmp/counts-before.txt
```

The script is copied in rather than committed to the baseline, because the baseline
predates it. Symlinking `node_modules` avoids a full reinstall.

- [x] **Step 5: Diff**

Run: `diff /tmp/counts-before.txt /tmp/counts-after.txt && echo "IDENTICAL — marking is inert"`
Expected: no output from `diff`, then `IDENTICAL — marking is inert`.

If they differ, marking changed behaviour. Stop and find out why — most likely a
`markConsumed` call added inside a conditional that also altered control flow.

- [x] **Step 6: Clean up and record**

```bash
rm -f /tmp/acct-baseline/node_modules /tmp/acct-baseline/export-import
git worktree remove --force /tmp/acct-baseline
```

Paste both count blocks and the `diff` result into the close-out commit.

---

### Task 10 (Tier 1): Close out

- [x] **T-final (Tier 1)** — Invoke `/close-out` skill. The skill walks the 6+1 steps, refuses partial, captures evidence.

---

## Self-review checklist

- [x] Every task has a tier tag.
- [x] No task is self-referential (no "write this plan", no "mark everything complete").
- [x] Every task ends in a commit or a recorded measurement.
- [x] No task bundles more than one user-observable verb.
- [x] `skipped` still populated, `GedcomImportSection.vue:77` still renders, dialect tests unchanged.
- [x] No file from `export-import/` committed. `git log --stat` shows only synthetic fixtures.
- [x] Every `DECLARED_UNMAPPED` entry with reason `unmapped:pending-<plan>` has a real plan filed.
- [x] Verification §1-§5 each have captured output in the close-out commit.
- [x] `npm test`, `npm run lint`, `npm run build`, `npx playwright test` green.
