# Nothing Is Silently Dropped — Import Accounting Design Spec

**Date:** 2026-08-23
**Status:** Design written; awaiting review.
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
