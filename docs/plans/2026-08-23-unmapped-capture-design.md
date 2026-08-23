# Unmapped Capture — Design Spec

**Date:** 2026-08-23
**Status:** Filed, not started. Depends on `feat/importer-tag-accounting` landing **and**
on normalize-boundary accounting, which is a prerequisite rather than a sibling — see Wiring.
**Parent:** `2026-08-23-import-tag-accounting-design.md` — this is the half of it that
did not ship.

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
node cannot fail on it.

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
