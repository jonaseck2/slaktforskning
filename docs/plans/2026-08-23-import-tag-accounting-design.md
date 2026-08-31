# Nothing Is Silently Dropped — Import Accounting Design Spec

**Date:** 2026-08-23
**Status:** Superseded in part. Approved 2026-08-23, then implemented independently
on `feat/importer-tag-accounting` by a parallel session that never saw this file — it
was orphaned on an unlanded branch. Both arrived at the same mechanism. See
"What actually shipped" below for the reconciliation, and
`2026-08-23-unmapped-capture-design.md` for the half that did not.
**Repairs:** `CLAUDE.md` Prime Directive (cont.) clause 1, which had no mechanical
enforcement and was false in practice.

## User goal

A researcher importing a file from any genealogy program keeps everything they wrote —
including the parts this app does not yet understand — and can see a plain list of what
was not understood.

Concretely: importing an ArkivDigital export and exporting it again returns a file
carrying the same information, `_DESC` annotations and `_AID` archive pointers included,
even before anyone writes a profile that models them. The import report names every tag
the app did not model, with a count, so "not modelled" is a visible decision rather than
a silent disappearance.

## Background — the measured breach

`CLAUDE.md` Prime Directive (cont.) has two clauses. Clause 2 (export round-trip) is
guarded by `src/api/gedcom_fidelity_registry.ts` and three CI tests. Clause 1 (the
importer discloses what it cannot model) had **no mechanical enforcement at all**.

`ctx.skippedTags` is written in exactly two places:

- `src/import/gedcom/phases/individuals.ts:398` — unrecognised level-1 tags on INDI
- `src/import/gedcom/phases/families.ts:164` — unrecognised level-1 tags on FAM

Every other phase reads a fixed allowlist and discards the remainder without counting it.
A tag is disclosed only if it sits at level 1 of an INDI or FAM record.

Measured against four ArkivDigital exports: **43 199 custom-tag occurrences across 168
paths. 2 763 consumed, 143 disclosed, 40 293 dropped with no report entry.** Among the
losses: 9 046 `_AID` archive pointers, the entire `_ADPL` place hierarchy, and 900 `_DESC`
values holding the researcher's own annotations.

The `gedcom` skill simultaneously documented "`_` prefixed custom tags — reported in
`skipped` (never silently dropped)". That guarantee was false by four orders of magnitude,
and the dialect-test diagnostic loop ("eyeball the per-file skipped-tag list") was built
on it.

### The violation is not GEDCOM-specific

| Importer | Read shape | Accounts for the rest? |
|---|---|---|
| GEDCOM | `getChild(node,'TITL')` × 209 call sites | level-1 INDI/FAM only |
| RootsMagic | 14 named-column `SELECT`s | no |
| Gramps | 34 `attr(...)` calls | no |
| Genney | 1 `SELECT *`, 1 named | `skipped` counts *records*, not fields |
| Holger | rides the GEDCOM path | inherits the gap |

Same shape — an allowlist with no accounting for the remainder — on three different
substrates.

### Findings that shape the mechanism

**The chokepoint is viable.** 209 of 243 node reads (86 %) already flow through
`getChild` / `getChildren` in `src/import/gedcom/node-utils.ts`. The 34 raw `.children`
sites are enumerable: `walk()` recursions in `prep-places` / `prep-inline-media` /
`translations`, the two `skippedTags` loops, `detect.ts`, and small local finds in
`holger.ts` and `notes.ts`.

**`CONT` / `CONC` never become nodes.** `src/gedcom/parser.ts:28-35` folds them into the
parent's value before the tree is built. They need no ignore list. The earlier 168-path
census counted raw *lines*, so the parsed-node baseline is smaller than that figure.

**`normalize.ts` is itself a drop site, and it runs before every phase.** Three:

- `inlineSnotes` rebuilds each SNOTE as `{ tag: 'NOTE', …, children: [] }`, discarding
  any SNOTE sub-tags (`LANG`, `TRAN` in GEDCOM 7.0).
- `.filter(c => c.tag !== 'CONC')` at line 124.
- `.filter(n => n.tag !== 'SNOTE')` at line 213.

It also rebuilds nodes with `{...node, children: newChildren}`, so **object identity does
not survive normalization**. Accounting only on the post-normalize tree would render
normalize's own drops permanently invisible.

**The parser drops malformed lines silently.** A line failing the regex hits `continue`
with no counter.

## Scope

All five importers. Two mechanisms, because the input schemas differ in kind.

### Part A — GEDCOM: measure at runtime (open vocabulary)

Any vendor can invent a tag, so coverage cannot be declared ahead of time. It is measured.

- **Marking via `WeakSet<GedcomNode>` on the import context**, not a `consumed` field on
  the node. A field would be copied by normalize's spread and go stale. Identity-based
  marking makes rebuilt nodes correctly fresh.
- **Mark on value extraction, not traversal.** `getChild` / `getChildren` mark what they
  return. The `walk()` recursions visit every node — if traversal marked, everything
  would read as accounted for and the test would be worthless.
- **The 34 raw `.children` sites** route through `node-utils` or mark explicitly.
- **`no-restricted-syntax` lint rule on `.children` within `src/import/gedcom/`.**
  `.eslintrc.json` exists and carries no restriction rules today. This is what stops the
  35th raw site being written next year.
- **Account across the normalize boundary.** Every pre-normalize node is present
  post-normalize or covered by a declared transformation. Closes the `inlineSnotes` hole.
- **Parser counts malformed lines** and reports them.

### Part B — closed-schema formats: assert against the schema

RootsMagic and Genney are SQLite. Their schemas are introspectable, so coverage is
asserted the way `gedcom-fidelity-registry-coverage.test.ts` asserts ours: enumerate
every `(table, column)` via `PRAGMA table_info` on the *source* database and require each
to have a disposition — mapped, captured, or declared-unmapped with a reason. A source
column with no disposition breaks CI.

Gramps is XML with a published DTD. Same treatment against the element/attribute set
present across fixtures.

### Part C — capture verbatim, so unmapped is non-destructive

Reporting a drop is weaker than not dropping. Unmapped data is stored verbatim.

```sql
CREATE TABLE unmapped_data (
  id            TEXT PRIMARY KEY,
  entity_type   TEXT NOT NULL,   -- person | family | source | place | event | media | …
  entity_id     TEXT NOT NULL,
  source_format TEXT NOT NULL,   -- gedcom | rootsmagic | gramps | genney
  path          TEXT NOT NULL,   -- 'INDI.BIRT._DESC' | 'PersonTable.Color'
  ordinal       INTEGER NOT NULL DEFAULT 0,
  fragment      TEXT NOT NULL,   -- verbatim source fragment, relative level
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**GEDCOM's unit is a subtree, not a scalar.** `_ADPL` carries five children. `fragment`
holds the verbatim lines at relative level, re-emitted under the correct parent at
`parentLevel + 1` on export. `ordinal` preserves sibling order so re-emission is stable.

**Ownership rule.** An unmapped node belongs to **the nearest ancestor that became a DB
entity**, and `path` records the full route from the record root so re-emission knows
where to put it back. `INDI.BIRT.PLAC._ADPL._PARISH` is owned by the *event* — the
nearest entity ancestor — not by the person and not by the place, because the place row
is shared across events and re-emitting there would duplicate the tag onto every event
using it.

**Records that become no entity** — `HEAD`, `SUBN`, `TRLR` — use
`entity_type = 'file'` with `entity_id` set to the import batch id. Their unmapped tags
re-emit into the header on export. Without this case the ownership rule has a hole and
header extensions vanish.

**Asymmetry, stated plainly.** This app exports GEDCOM. It does not write `.rmtree`,
`.gramps` or Genney files. Literal round-trip therefore applies to the GEDCOM path only.
For native formats, capture means the data is preserved and surfaceable, and can be
emitted as custom tags on GEDCOM export — not that the source file can be reconstructed.

**Prime Directive check.** `unmapped_data` stores what was in the imported file, verbatim.
That is the directive's own definition of authored data. Nothing is computed, guessed or
normalised.

**Fidelity registry entries.** `unmapped_data` needs entries like any other table, and
they are unusual enough to state now: `fragment`, `path` and `ordinal` are
`lossless` under both versions for `source_format = 'gedcom'` — the fragment re-emits
verbatim — and `excluded:no-export-target` for the native formats, since this app writes
no `.rmtree`, `.gramps` or Genney file to round-trip them through.

**The table shrinks as format support improves.** Once the ArkivDigital profile maps
`_DESC` and `_AID`, those rows stop being created on new imports. Capture is a safety net
sized by how much the app does not yet model, not a permanent parallel store.

### Part D — the declared-not-modelled registry

`src/import/unmapped_registry.ts`, mirroring the fidelity registry: tag path, reason,
and whether it is captured or genuinely discarded. LDS ordinances are the canonical
"discarded on purpose" entry.

Declaring a tag is what discharges the obligation. The report still names it, so the
user sees the decision.

### Runtime versus test

- **Runtime always reports** whatever is unaccounted, including tags from a vendor nobody
  has seen. A new format's unknown tag cannot have been anticipated by a test.
- **CI enforces the corpus.** Every tag across the 22 fixtures in `tests/fixtures/gedcom/`
  is read, captured, or registered.

### Scope deviations

- **The import report UI is minimal.** `GedcomImportSection.vue` gains the unaccounted
  list grouped by path with counts — 165 rows for the ArkivDigital case, not 40 293
  lines. Surfacing captured `unmapped_data` in the entity panels is a follow-up.
- **Archive (`.zip`) export of `unmapped_data`** follows the existing carve-out in
  `CLAUDE.md`: conceptually in scope, mechanically enforced later.
- **`skipped` stays as a deprecated alias** for `unaccountedFor` so existing report
  consumers and tests keep working. Removal is a follow-up.

## What actually shipped (reconciliation, 2026-08-23)

This spec was approved and then orphaned: it sat on `fix/binding-envelope-silent-failures`,
an unlanded branch, while a parallel session wrote its own plan
(`2026-08-23-importer-tag-accounting.md`) and implemented it. Neither read the other. The
mechanisms converged — identity-based marking of consumed nodes, a declared-exception list
with mandatory reasons, a gate test over every fixture — which is some evidence the design
was the obvious one rather than a clever one.

Measured against the shipped branch:

| Spec part | Status |
|---|---|
| Marking on value extraction, not traversal | **shipped** — `Set<GedcomNode>` passed as an argument to a pure walk in `accounting-walk.ts`, equivalent to the `WeakSet` this spec proposed |
| Unaccounted-for report, per path with counts | **shipped** — `accounting-walk.ts` + import-report UI |
| Declared-not-modelled registry | **shipped** — `accounting-declared.ts`, 56 paths, reason prefixes enforced by test |
| Corpus gate test | **shipped** — over 19 fixtures, plus a synthetic ArkivDigital fixture |
| Account across the normalize boundary | **not shipped — demonstrated hole**, see below |
| Parser malformed-line counter | **not shipped** |
| `no-restricted-syntax` lint rule on `.children` | **not shipped** — the anti-drift half; nothing stops the 35th raw traversal |
| Closed-schema coverage (RootsMagic, Genney, Gramps) | **not shipped** |
| Verbatim capture in `unmapped_data` | **not shipped** — see below |

Running the new gate over the 19 shipped fixtures surfaced 20 undeclared paths, 13 of
which hold authored data. Those became `unmapped:pending-dialect-tag-review`, and that
plan is filed.

### The normalize-boundary hole is real, and measured

`import-core.ts:467` calls `collectUnaccounted(normalizedTree, endAccounting())` — the gate
walks the tree *after* `normalize.ts` has rewritten it. `inlineSnotes` still rebuilds each
shared note as `{ tag: 'NOTE', …, children: [] }`, so a GEDCOM 7.0 `SNOTE`'s sub-tags are
gone before the gate can see them.

Probed on this branch with a minimal 7.0 file:

```
0 @N1@ SNOTE Anteckning om Anna
1 LANG sv
1 TRAN Note about Anna
2 LANG en
```

```
unaccountedFor: [{"path":"HEAD.GEDC"},{"path":"HEAD.GEDC.VERS"},{"path":"TRLR"}]
  SNOTE.LANG reported? NO
  SNOTE.TRAN reported? NO
```

A shared note's language and its translation are discarded, and the gate that exists to
make exactly this impossible reports nothing. Not a regression — `inlineSnotes` predates
this work — but it is a silent drop surviving inside the mechanism built to end silent
drops, so it should not stay unfiled.

The fix is ordering, not capture: accounting must straddle the normalize boundary, with
every pre-normalize node either present afterwards or covered by a declared
transformation.

### The capture decision did not survive the gap

The approved answer to "what happens to a tag the importer does not model" was **capture
verbatim so it round-trips**, not **report only**. Reporting satisfies the letter of
clause 1 and still loses the researcher's words — this spec records that as a failure mode
of its own first draft, and the shipped branch is report-only.

Measured on the four ArkivDigital files, the 36 paths now declared `unmapped:pending-*`
cover **46 267 occurrences across 166 concrete paths** — `SOUR._AID` 9 046,
`SOUR.DATA.DATE` 6 147, the `_ADPL` hierarchy 23 000-odd, `_TITLE` 2 259, `_DESC` 898.
That data is now honestly *named* and still discarded.

This is defensible sequencing, not a mistake: report-first makes the loss visible and
sizes the problem, and `unmapped:pending-<plan>` is exactly the right hook to hang capture
on. It does mean Verification §3 below — the ArkivDigital files round-tripping through
`unmapped_data` alone, before any profile exists — cannot pass yet. Capture is specified
separately in `2026-08-23-unmapped-capture-design.md`.

**Capture is orthogonal to declaration, not a later stage of it.** Declaring a tag says
"we know we skipped this". Capturing it says "we kept it anyway". A tag can be both, and
capture also covers tags nobody has declared — a vendor the app has never seen. Mapping
plans like `pending-arkivdigital-profile` shrink the declared list; they do not remove the
need for the net.

## Implementation sequencing

One plan, per the scope decision, but the parts are not interchangeable and a reviewer
should be able to stop at any boundary with something coherent shipped.

| Step | Delivers | Standalone value |
|---|---|---|
| 1 | `WeakSet` marking + node-utils + the 34 raw sites + lint rule | the GEDCOM report becomes honest |
| 2 | Normalize-boundary accounting + parser malformed-line counter | closes the two pre-phase holes |
| 3 | `unmapped_registry.ts` + corpus accounting test | CI enforces the corpus |
| 4 | `unmapped_data` table + GEDCOM capture + exporter re-emission | unmapped becomes non-destructive |
| 5 | Closed-schema coverage for RootsMagic, Genney, Gramps | the other three importers stop claiming what they do not do |
| 6 | Import-report UI showing the grouped unaccounted list | the user sees it |

Steps 1-3 make the claim measurable. Step 4 makes it true. Steps 5-6 extend it. If effort
runs long, the honest place to stop and re-plan is after step 4 — the GEDCOM path is whole
and the remaining three importers are documented as not yet covered rather than silently
uncovered.

## Verification

1. **Corpus round-trip diff — the claim itself, made falsifiable.** For every fixture and
   every real-world sample: parse the original, import, export, parse the export, and diff
   the tag-path multiset. Any path present in the original and absent from the export is a
   loss and fails the test, unless it has a `unmapped_registry` entry declaring it
   discarded with a reason. This tests "nothing is silently dropped" directly rather than
   through a proxy.
2. **Accounting is empty across the corpus.** `unaccountedFor` is empty for all 22
   fixtures — every node read, captured, or registered.
3. **The four ArkivDigital files round-trip before any profile exists.** Import, export,
   re-import. Assert the 900 `_DESC` values and 9 046 `_AID` values are present after the
   second import, carried by `unmapped_data` alone. This is the test that would have
   failed on 2026-08-23.
4. **Closed-schema coverage.** Every source column in the RootsMagic and Genney schemas,
   and every Gramps element/attribute in the fixtures, has a disposition. An undispositioned
   column fails CI.
5. **The lint rule bites.** A test fixture containing a raw `.children` access inside
   `src/import/gedcom/` fails `npm run lint`.
6. **Regression canary.** Deliberately unmark one phase's reads and assert the accounting
   test fails. A guard that cannot fail is not a guard.

**User-goal-falsifiability check:** if all six pass, can the goal still be unmet? Yes, in
one way — the user is told what was not modelled but cannot *see* the captured data in the
app. That is the deliberate Scope deviation above, and it does not compromise preservation.
Item 3 is what proves nothing was lost.

## Failure modes / RCA reference

- **A documented guarantee with no test.** The proximate cause. `CLAUDE.md` was amended
  in `467a33bd` to give clause 1 a mechanical contract, and the `gedcom` skill's false
  row was removed in the same commit. This spec builds the test that makes the amended
  text true.
- **Marking on traversal instead of extraction.** Would make every test pass while
  measuring nothing. Called out explicitly because the `walk()` recursions make it the
  natural mistake.
- **Accounting only after normalization.** Would hide `inlineSnotes`' discarded SNOTE
  children — a drop that predates this investigation and that no one had noticed.
- **Reporting instead of preserving.** The first draft of this design reported unmapped
  tags and discarded them. Disclosure satisfies the letter of clause 1 and still loses
  the researcher's words. Capture is the correction.

---

## The two unshipped parts, inlined

These were separate spec files recovered from an unlanded branch on 2026-08-29. They are
not separate designs — they are this spec's own Part A and Part C, which the reconciliation
table above lists as not shipped. Keeping them as standalone files made `docs/plans/` read
as five open designs when there are three. Inlined here, verbatim, so this spec is the
single referent for what remains.


---

# Part A (unshipped): Accounting across the normalize boundary

## User goal

A researcher importing a GEDCOM 7.0 file is told what the app did not read — the same
promise 5.5.1 importers already get. Today the import report is silent about anything
the 7.0 normalization layer removes before the report is computed.

## Why this exists

Tag accounting shipped a gate that reports every node no phase read. It runs on the
*post-normalize* tree:

```ts
// import-core.ts
const normalizedTree = normalizeForImport(tree, version);   // ← before the window
beginAccounting();
…
unaccountedFor = collectUnaccounted(normalizedTree, endAccounting());
```

`normalize.ts` rewrites the tree first, and several of its transformations discard nodes.
Those nodes are gone before the gate can count them.

### Measured, not assumed

Probed on `feat/importer-tag-accounting` with a minimal 7.0 file:

```
0 @N1@ SNOTE Anteckning om Anna
1 LANG sv
1 TRAN Note about Anna
2 LANG en
```
```
unaccountedFor: [{"path":"HEAD.GEDC"},{"path":"HEAD.GEDC.VERS"},{"path":"TRLR"}]
  SNOTE.LANG reported? NO
  SNOTE.TRAN reported? NO
```

`buildSnoteMap` reads only the record's `.value`; the top-level filter then removes the
record entirely. A shared note's language and its translation are discarded, and the
mechanism built to make exactly this impossible reports nothing.

### The larger finding: the gate has never run with normalize active

`normalizeForImport` opens with `if (version !== '7.0') return nodes;`. Every fixture the
gate iterates is 5.5.1 or 5.5:

| Fixtures gated | 20 |
|---|---|
| GEDCOM 7.0 | **0** |
| containing `SNOTE` | **0** |
| containing `TRAN` | **0** |

So all seven transformations are untested by the accounting gate, and the declared list's
completeness claim is silently scoped to 5.5.1. For scale: `scripts/accounting-over-samples.ts`
run over the 36 gitignored real-world files in `export-import/samples/` surfaces **742
distinct undeclared paths** with 0 import failures, against 20 from the committed corpus —
and that script is deliberately non-CI, because those samples are not in the repository. The gate's own "guards against a vacuous
pass" test checks that fixtures were *found*; it does not check that they *reach* the code
under test.

### Two identity spaces, one walked

`normalize.ts` rebuilds nodes with `{ ...node, children }`, so a node that survives
normalization is a different object before and after. Meanwhile `phaseNotes` and
`phaseTranslations` deliberately read `ctx.originalTree` — the pre-normalize tree — so
their `getChild` calls mark **original** nodes while the gate walks **normalized** ones.
Those marks match nothing and are silently discarded.

This has never surfaced because the 7.0 paths never fire on a 5.5.1 corpus.

### What each transformation discards

| Transformation | Discards |
|---|---|
| top-level `filter(n => n.tag !== 'SNOTE')` + `buildSnoteMap` | the SNOTE record's children — `LANG`, `TRAN`, and `TRAN`'s own `LANG` |
| `inlineSnotes` | the pointer node's children (`children: []`); normally empty in valid 7.0 |
| `convertExidToRefn` | every `EXID` child except `TYPE` |
| `mergeMultipleGivnSurn` | duplicate `GIVN`/`SURN` nodes — values are joined, the nodes and any children are not |
| `dropConcNodes` | `CONC` stragglers — benign, the parser already folds them |
| `applyDatePhrase` | nothing (spread keeps `children`), but skips recursion on the branch it rewrites |

## Scope

### Part 1 — a GEDCOM 7.0 fixture, first

Nothing else here is verifiable without one. `tests/fixtures/gedcom/gedcom7.ged`
exercising, at minimum: a top-level `SNOTE` record with `LANG` and `TRAN` (with its own
`LANG`) plus a pointer to it; `NAME/TRAN`; `PLAC/TRAN`; `EXID` with `TYPE` and one
non-`TYPE` child; a `NAME` with two `GIVN` and two `SURN`; `DATE` with `PHRASE`.

It fails the gate on the first run. That is the deliverable of this part — a red test that
names what is being lost.

### Part 2 — one identity space, anchored on the parsed tree

The directive says the importer accounts for every node in the **parsed** tree. Accounting
therefore anchors pre-normalize.

- `normalize.ts` records provenance for every node it derives from an existing one:
  `provenance.set(newNode, originNode)` in a `WeakMap` owned by the accounting session.
- `markConsumed(node)` walks the provenance chain and marks each ancestor origin, so a
  phase marking a normalized node marks the original it came from.
- `collectUnaccounted` runs on the **original** tree.

This also repairs the `originalTree` split at no extra cost: `phaseNotes` and
`phaseTranslations` already mark original nodes, which is now the walked space.

**Failure direction inverts, and that is the point.** A transformation that forgets to
record provenance leaves its origin unmarked, so the origin reports as unaccounted — a
loud false positive on a green corpus. The same mistake today is a silent drop. Prefer the
alarm.

### Part 3 — normalize plays by the same rule

`normalize.ts` carries private copies of `getChild` / `getChildren` (lines 16–22) that do
not mark. Delete them and use the marking ones from `node-utils`. `buildSnoteMap` reads
`node.value` directly, so it marks the record explicitly — and not its children, which is
precisely what makes `SNOTE.LANG` surface.

Normalize stops being a privileged pre-pass and becomes another reader under the same
contract.

### Six declarations exist only because the session opens too late

`accounting-declared.ts` already records the symptom, in its own reason strings:

| Path | Declared reason |
|---|---|
| `HEAD.GEDC` | `excluded:structural — version envelope, read by detect.ts before the session opens` |
| `HEAD.GEDC.VERS` | `excluded:structural — read by detect.ts before the session opens` |
| `HEAD.GEDC.FORM` | `excluded:structural — always LINEAGE-LINKED in 5.5.1` |
| `HEAD.CHAR` | `excluded:structural — character set, applied at decode time before parsing` |
| `*.NAME.GIVN` | `excluded:redundant — folded into the NAME value by normalize.ts before the session` |
| `*.NAME.SURN` | `excluded:redundant — folded into the NAME value by normalize.ts before the session` |

Four of the six say *"before the session"* outright. These are not tags the app declines to
model — they are tags it **does** read, declared `excluded` because the reader runs outside
the accounting window. That is the same defect as the `SNOTE` loss wearing a different hat:
one produces a false `excluded`, the other a silent drop.

Moving `beginAccounting()` ahead of `detectGedcomVersion` and `normalizeForImport` makes
those reads markable, and the declarations become unnecessary. That is a falsifiable
outcome, not a hope — see Verification 6.

### Expected new findings

Once Part 1 runs against Parts 2–3, these should appear as unaccounted and need a decision:

- `SNOTE.LANG`, `SNOTE.TRAN`, `SNOTE.TRAN.LANG` — the app models `name_translations` and
  `place_translations` but has no note-translation equivalent. Real authored data;
  expected disposition `unmapped:pending-<plan>`, not `excluded`.
- `INDI.EXID.*` other than `TYPE`.
- Children of dropped duplicate `GIVN` / `SURN` nodes.

### Scope deviations

- **Capture is not in scope.** This plan makes the losses *visible*; keeping them is
  `2026-08-23-unmapped-capture-design.md`, which depends on this landing.
- **Modelling shared-note translations is not in scope.** This plan surfaces and declares
  them; mapping them is a separate plan.
- **One inaccurate reason string, fixed in passing.** `accounting-declared.ts` says
  `'*.NAME.GIVN' — folded into the NAME value by normalize.ts before the session`.
  normalize does not fold `GIVN` into the `NAME` value — `mergeMultipleGivnSurn` merges
  multiple `GIVN` into one `GIVN`. The conclusion (not read; `individuals.ts` parses the
  `NAME` value) is right, the stated mechanism is wrong. A reason field exists to be a
  decision, so it should be accurate.

## Verification

1. **The probe becomes a test.** The `SNOTE` case above, as a unit test, asserting
   `SNOTE.LANG` and `SNOTE.TRAN` appear in `unaccountedFor`. Locked red before the fix.
2. **The gate reaches normalize.** A test asserts the gated corpus contains at least one
   fixture whose `GEDC.VERS` is `7.0` — the missing half of the existing vacuous-pass
   guard.
3. **5.5.1 is byte-identical.** Import each of the 20 existing fixtures before and after;
   assert `unaccountedFor` is unchanged for every one. Normalize is a no-op there, so any
   difference is a regression introduced by the provenance plumbing.
4. **Provenance is complete.** With the 7.0 fixture, assert every node the phases genuinely
   read is marked in the original tree — no false positives from a missed
   `provenance.set`.
5. **Canary.** Delete one `provenance.set` call and assert Verification 4 fails. A guard
   that cannot fail is not a guard.
6. **Declarations shrink, specifically.** After the fix:
   - `HEAD.GEDC` and `HEAD.GEDC.VERS` are genuinely marked by `detect.ts` and their
     declarations are **deleted**. Assert the gate stays green without them.
   - `HEAD.CHAR` stays declared — the character set is applied at *decode* time, before a
     tree exists to mark — but its reason changes from "before the session" to the
     accurate "consumed before parsing".
   - `*.NAME.GIVN` / `*.NAME.SURN` stay declared, because a single `GIVN` is read by
     nobody, but the reason stops claiming normalize folds them into the `NAME` value. It
     does not: `mergeMultipleGivnSurn` merges multiple `GIVN` into one `GIVN`.

   A declaration that disappears because the code got honest is the cleanest evidence this
   plan worked.

**User-goal-falsifiability check:** if all five pass, can the goal be unmet? Yes, in one
way — a 7.0 file using a transformation the single fixture does not exercise could still
lose nodes. Mitigated by Verification 4 covering all seven transformations in one fixture,
and by the failure direction: a missed case reports loudly rather than vanishing.

## Failure modes / RCA reference

- **A gate whose corpus never reaches the code under test.** The proximate cause. The
  existing vacuous-pass guard checks fixtures were found, not that they exercise the
  branch. Verification 2 closes it for `7.0` specifically; the general lesson is that
  "the test passes" and "the test ran the code" are different claims.
- **Two identity spaces with no test across the seam.** `phaseNotes` and
  `phaseTranslations` read the original tree by design and mark nodes nobody walks. Only
  invisible because no 7.0 fixture exists.
- **Declaring a tag `excluded` to work around a mechanism limit.** Six entries say a
  reader runs "before the session" and are marked `excluded` for it. `excluded` is
  supposed to mean the app chose not to model the tag, not that the plumbing could not
  observe the read. The declared list stayed green while describing the tool's own
  blind spot as a property of the data.
- **Fixing the instance instead of the class.** Making `inlineSnotes` carry its children
  would fix the probe and leave `convertExidToRefn` and `mergeMultipleGivnSurn` dropping
  silently. Rejected for that reason.


---

# Part C (unshipped): Verbatim capture in unmapped_data

## User goal

A researcher keeps what they wrote even when this app does not understand it. Importing a
file from a program the app has never seen, exporting it again, and re-importing returns
the same information — including the tags the report listed as "not imported".

## Why this exists

Tag accounting made the importer *name* what it drops. Naming is not keeping.

Measured on the four ArkivDigital exports in `export-import/min släkt/`, the 36 paths
declared `unmapped:pending-*` cover **46 267 occurrences across 166 concrete paths**:

| Path | Occurrences | What it holds |
|---|---|---|
| `SOUR._AID` | 9 046 | ArkivDigital archive pointer — the stable image reference |
| `*.SOUR.DATA.DATE` | 6 147 | date the researcher consulted the record |
| `*.PLAC._ADPL` + children | 23 000-odd | country / county / parish / locality hierarchy |
| `*._TITLE` | 2 259 | occupation or title |
| `*._DESC` | 898 | the researcher's own annotations |

`_DESC` is the clearest case. `Trolovningsbarn`, `Felaktigt födelseår i källan`,
`Fade enl. muntl. erkännande inför dopförättaren Karl Petrus Lundberg` — these are
sentences a person typed about their own family. The importer now tells them it discarded
898 of them. That is an improvement over discarding them silently and it is not the goal.

**Capture is orthogonal to declaration.** Declaring says "we know we skipped this".
Capturing says "we kept it anyway". Mapping plans (`pending-arkivdigital-profile`,
`pending-dialect-tag-review`) shrink the declared list one vendor at a time; they never
remove the need for the net, because the next vendor's tags are not in it yet.

## Scope

### Storage

```sql
CREATE TABLE unmapped_data (
  id            TEXT PRIMARY KEY,
  entity_type   TEXT NOT NULL,   -- person | family | source | place | event | media | file
  entity_id     TEXT NOT NULL,
  source_format TEXT NOT NULL,   -- gedcom | rootsmagic | gramps | genney
  path          TEXT NOT NULL,   -- 'INDI.BIRT._DESC'
  ordinal       INTEGER NOT NULL DEFAULT 0,
  fragment      TEXT NOT NULL,   -- verbatim source fragment, relative level
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_unmapped_data_entity ON unmapped_data(entity_type, entity_id);
```

GEDCOM's unit is a subtree, not a scalar — `_ADPL` carries five children. `fragment` holds
the verbatim lines at relative level, re-emitted under the correct parent at
`parentLevel + 1`. `ordinal` preserves sibling order so re-emission is stable.

**Ownership rule.** An unmapped node belongs to the nearest ancestor that became a DB
entity. `INDI.BIRT.PLAC._ADPL._PARISH` is owned by the *event* — not the person, and not
the place, because a place row is shared across events and re-emitting there would
duplicate the tag onto every event using it. Records that become no entity (`HEAD`,
`SUBN`) use `entity_type = 'file'` with the import batch id, and re-emit into the header.

**Prime Directive.** `unmapped_data` stores what was in the imported file, verbatim.
Nothing is computed, guessed or normalised.

**The table shrinks as format support improves.** Once the ArkivDigital profile maps
`_AID` and `_DESC`, those rows stop being created. Capture is a net sized by what the app
does not yet model, not a permanent parallel store.

### Wiring

The accounting walk already computes the unaccounted set. Capture is a consumer of that
same set, so it adds no second traversal: where `accounting-walk.ts` reports a node,
capture also serialises it against its owning entity.

**Capture inherits the gate's blind spot, and cannot fix it.** The walk runs on the
*post-normalize* tree (`import-core.ts:467`), and `normalize.ts` drops nodes before that:
`inlineSnotes` rebuilds every GEDCOM 7.0 `SNOTE` with `children: []`, so its `LANG` and
`TRAN` sub-tags are gone. Probed on `feat/importer-tag-accounting`, neither is reported as
unaccounted — and neither would be captured, because capture reads the same set.

Normalize-boundary accounting is therefore a **prerequisite**, not a parallel nicety. It
belongs to the parent spec's unshipped Part A and must land before this plan's
Verification 2 can mean anything: a corpus round-trip diff that never sees the dropped
node cannot fail on it. Specified in
`2026-08-23-normalize-boundary-accounting-design.md`, which also records that the gate has
never once run with normalize active — all 20 gated fixtures are 5.5.1.

### Export

The exporter re-emits each fragment under its owning entity at the recorded path and
ordinal. Registry entries: `fragment`, `path`, `ordinal` are `lossless` under both
versions for `source_format = 'gedcom'`, and `excluded:no-export-target` for the native
formats — this app writes no `.rmtree`, `.gramps` or Genney file to round-trip them
through.

### Scope deviations

- **Surfacing captured data in the UI is out of scope.** The import report names the
  paths; the entity panels do not show the fragments. Preservation first, visibility
  second. Named so it is a decision rather than an oversight.
- **Native-format capture stores but cannot round-trip.** See the export asymmetry above.
- **The four unshipped Part A items** — normalize-boundary accounting, the parser
  malformed-line counter, the `.children` lint rule, closed-schema coverage — belong to
  the parent spec, not here. Listed in its reconciliation table.

## Verification

1. **The four ArkivDigital files round-trip with no profile.** Import, export, re-import.
   Assert the 898 `_DESC` values and 9 046 `_AID` values are present after the second
   import, carried by `unmapped_data` alone. This is the test the parent spec named and
   the shipped branch cannot pass.
2. **Corpus round-trip diff.** For every fixture: parse, import, export, parse, diff the
   tag-path multiset. Any path in the original and absent from the export fails, unless
   `accounting-declared.ts` marks it `excluded:*`. `unmapped:pending-*` paths must now
   survive — that is the difference this plan makes.
3. **Capture adds no traversal.** Assert the import issues the same number of tree walks
   as before, per `.claude/rules/performance.md`.
4. **Volume is bounded.** Importing the four ArkivDigital files creates ~46 000
   `unmapped_data` rows. Assert import wall-clock stays within the existing budget and the
   row count drops to near-zero once a mapping profile covers those paths.
5. **Regression canary.** Delete one capture call and assert Verification 1 fails. A guard
   that cannot fail is not a guard.

**User-goal-falsifiability check:** if all five pass, can the goal be unmet? Yes, in one
way — a researcher cannot *see* the captured fragments in the app, only in an export. That
is the deliberate scope deviation above. It does not compromise preservation.

## Failure modes / RCA reference

- **Reporting mistaken for keeping.** The parent spec's first draft reported unmapped tags
  and discarded them; the approved answer was capture. The approval did not reach the
  implementing session because the spec was orphaned on an unlanded branch. Process
  lesson, already actioned: `.claude/rules/plans.md` requires specs to be committed
  immediately, and committed is not enough — they must be on a branch the implementer will
  actually branch from.
- **Treating capture as a later stage of declaration.** It is orthogonal. A declared list
  covers vendors someone has already studied; capture covers the ones nobody has.
