# Normalize-Boundary Accounting — Design Spec

**Date:** 2026-08-23
**Status:** Filed, not started. Prerequisite of
`2026-08-23-unmapped-capture-design.md`.
**Parent:** `2026-08-23-import-tag-accounting-design.md`, Part A.

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
completeness claim is silently scoped to 5.5.1. The gate's own "guards against a vacuous
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
- **Fixing the instance instead of the class.** Making `inlineSnotes` carry its children
  would fix the probe and leave `convertExidToRefn` and `mergeMultipleGivnSurn` dropping
  silently. Rejected for that reason.
