# Every Imported Identifier Comes Back — external_identifiers Round-Trip Design Spec

**Status:** Design written 2026-08-29.

## User goal

An identifier the importer read out of someone's file comes back out when they export,
whatever kind of thing it was attached to and whatever program wrote it. A researcher who
imports four ArkivDigital exports, works for a year, and exports again still has every
archive pointer the original files carried. A researcher whose file came from Gramps keeps
the Gramps handles even though this app has never heard of Gramps handles.

Identifiers are import-side data. Nothing the user authors in the app creates one, and
nothing in the app reads one to make a decision.

## Background — the measured gap

`external_identifiers` shipped in v0.273.0 as round-trip storage for source-format ids.
Six probes against a seeded database, exported to GEDCOM 5.5.1 and grepped, measured 2026-08-29:

| Seeded row | Survives export |
|---|---|
| `place` + `arkivdigital.parish`, parish **has** a parent | yes — `_PARISH_AID` inside `_ADPL` |
| `place` + `arkivdigital.parish`, parish has **no** parent | **no** |
| `place` + `arkivdigital.parish`, place on no event and no citation | **no** |
| `media` + any system | **no** |
| `repository` + any system | **no** |
| `source` + `gramps.handle` | **no** |

Five of six lose the row. The `.zip` archive is not an escape hatch: `exportArchive` calls
`exportGedcom`, so it inherits every loss above.

### What the registry says today

`src/api/gedcom_fidelity_registry.ts` declares `external_identifiers.entity_type` and
`.system` as `lossy`, naming the three pairs that have an emitting tag. That declaration is
honest and discharges the Prime Directive for those two columns.

`external_identifiers.value` is declared `lossless`. Four of the five failing probes lose the
value, so that entry is an overclaim.

The per-field test does not catch it. `seedExternalIdentifiers` in
`tests/helpers/gedcom_fidelity.ts` hardcodes `entity_type='source', system='arkivdigital'` —
the one pair with a working emitter — and substitutes only the column under test. The test
cannot return zero for `value`, so it is not evidence about `value`. This is the failure
shape `.claude/rules/evidence.md` was written against.

### What the import side already does correctly

Clause 1 of the Prime Directive (cont.) holds and was verified, not assumed. A `_AID` on a
`REPO` record — a location no phase reads — is reported:

```json
"unaccountedFor": [{"path": "REPO._AID", "count": 1}]
```

Full tag path, occurrence count. Nothing is silently dropped on import. This spec does not
change the import accounting mechanism. It gives four more tag paths a phase that reads them.

## The design

### One rule

**Every `external_identifiers` row is emitted. The tag is chosen by the entity's GEDCOM home.
When a `(entity_type, system)` pair already has a vendor-shaped tag, that tag is the only
carrier for the pair.**

The second sentence is what keeps an ArkivDigital export looking like an ArkivDigital export.
A researcher's file must survive this app and still open in the program that wrote it.

### The carrier table

Each entity type already has a place in the exported file where its own columns travel.
The identifier rides there too. No new record type is invented.

| entity_type | carrier host | 5.5.1 | 7.0 | vendor override |
|---|---|---|---|---|
| `source` | `0 @S1@ SOUR` record | `1 REFN` + `2 TYPE` | `1 EXID` + `2 TYPE` | `arkivdigital` → `1 _AID` |
| `repository` | `0 @R1@ REPO` record | `1 REFN` + `2 TYPE` | `1 EXID` + `2 TYPE` | none |
| `media` | `OBJE` block, inline and top-level | `REFN` + `TYPE` | `EXID` + `TYPE` | none |
| `citation` | `SOUR` substructure | `_EXID` + `TYPE` | `_EXID` + `TYPE` | `arkivdigital.image` → `_AID` |
| `place`, as an event's own place | `PLAC` sub-tag block | `_EXID` + `TYPE` | `_EXID` + `TYPE` | `arkivdigital.parish` → `_PARISH_AID` |
| `place`, reached only by a place-level citation | `0 @Pn@ _PLAC` record | `_EXID` + `TYPE` | `_EXID` + `TYPE` | none — see below |

`TYPE` carries the `system` column verbatim. The host record or block carries `entity_type`.
Together they reconstruct the row.

A `REFN` or `EXID` with no `TYPE` imports as system `refn`, and a row with system `refn`
exports as a bare `REFN` or `EXID` with no `TYPE`. Symmetric, so a file that already carried
untyped references keeps its exact bytes.

### The `_PLAC` record is the one place the vendor override does not apply

Found by probe on 2026-08-29, after the first thirteen matrix cells were green. A place that
carries a place-level citation and that no event names reaches the file only as its own
`0 @Pn@ _PLAC` record. `emitPlaceSubTags` is never called on it, so there is no `PLAC` block
and no `_ADPL` block — and `_PARISH_AID` lives inside `_ADPL`. Measured: both a seeded
`arkivdigital.parish` and a seeded `gramps.handle` were lost.

Applying the vendor override here would delete the row rather than defer it, because the tag
it defers to is not emitted. So this one site emits **every** system as `_EXID`,
`arkivdigital.parish` included. That does not weaken the override rule: `_PLAC` is a custom
level-0 record ArkivDigital never writes and skips on read, so nothing here changes what
ArkivDigital reads back — which is the only thing the rule protects.

The emit is skipped when an event already emitted the place's `PLAC` block. Without that gate
a place that is both an event place and a citation host would carry two carriers for one row —
`_PARISH_AID` under the event and `_EXID` under the record — and the second export would not be
stable. `emitPlaceSubTags` records every place it emits, so the gate is exact rather than
inferred.

### Why the carrier is the existing block and not a new record

The first draft of this design gave `media` and `place` their own top-level records. Reading
the importer showed why that is wrong.

An inline `OBJE` block carries no xref, and `importObjeNode` creates a row from it
(`src/import/gedcom/obje-importer.ts:63`). A top-level `OBJE` record is handled separately by
`phaseObje`. Emitting a media both ways produces **two media rows** on re-import. The
exporter's comment at `src/gedcom/exporter.ts:1116` claims a `_OBJE_ID` tag prevents exactly
this — that tag appears once in the whole codebase, in the comment. It is never emitted and
never read. Putting the identifier on the inline block instead means no new record, no
duplicate row, and the same mechanism the registry already declares for `media.file_ref`.

The same argument applies to places. `_PLAC` top-level records are emitted only for places
carrying a place-level citation or a group link. The `PLAC` sub-tag block under an event is
where `_PTYPE` and `_PLAC_ID` already travel, so the identifier travels there.

### Why standard REFN / EXID where the specification has a slot

`person_identifiers` already emits `REFN` under 5.5.1 and `EXID` under 7.0
(`src/gedcom/exporter.ts:759`). `source`, `repository` and `media` are records where both
specifications allow that pair. Using it costs one ternary per site, and another genealogy
program reading the export understands the result. That serves the *more portable* arm of the
scope gate in `CLAUDE.md`.

A GEDCOM citation is a `SOUR` pointer substructure and a `PLAC` block is a substructure too.
Neither has a `REFN` slot in either specification. Both take the custom `_EXID` tag, identical
under both versions.

The alternative — one custom `_EXID` everywhere — is simpler inside this codebase and worse
outside it, and it diverges from the `person_identifiers` precedent for no gain.

### The one fix that is not a new emit site

**`_ADPL` must not be gated on having a parent.** `emitPlaceSubTags` calls `emitAdplBlock`
only when `place.parent_place_id` is set (`src/gedcom/exporter.ts:132`). The parish is the
level that carries `_PARISH_AID`, and a parish with no parent is a legal row —
`parent_place_id` is `ON DELETE SET NULL`, so deleting a county disarms every parish under it.
`emitAdplBlock` already returns early when the typed chain is empty, which is the correct
condition. The parent guard is a proxy for it and the wrong one.

Measured reachability: 0 of 4 694 `_PARISH_AID` blocks across the 45 real `.ged` files lack a
`_COUNTY` or `_COUNTRY` above the parish. The bug is latent in this corpus, not active.
Un-guarding changes the exported bytes for root-level typed places that carry no identifier,
which is why it needs a round-trip test rather than an assertion.

### What the registry becomes

Fourteen of the sixteen `(route × system-kind)` cells in the plan's scope table gain a
carrier. Two do not, and they are named precisely rather than covered by a vague reason.

**Uncovered cell 1: a non-ArkivDigital identifier on a place that is never an event's own
place.** Such a place reaches the file only as a level inside an `_ADPL` chain, and that
chain's per-level identifier slot is `HierarchyLevel.externalId` — a single string whose
`arkivdigital.parish` value is **load-bearing for place disambiguation**, not only for
round-trip. `src/api/places_hierarchy.ts:70` uses it to keep two same-named parishes apart.
Generalising one disambiguating string into a list of typed identifiers changes what "the same
place" means, which is a places-hierarchy user goal and not this one.

**Uncovered cell 2: any identifier on a place that no event and no citation reaches.** That
place is not exported at all, so nothing hangs off it. See the Scope deviation below.

The middle ground between the two — a place no event names but a place-level citation does
reach — was silently lost until the `_PLAC` record gained its own carrier, and is now covered.
Uncovered cell 2 is therefore exactly what its sentence says and nothing wider: no event **and**
no citation.

No importer can currently produce cell 1. Three sites in the codebase write a place
identifier: `prep-places.ts` writes the literal `arkivdigital.parish` off a resolved `_ADPL`
chain, and `prep-places.ts` and `place-citations.ts` each read an arbitrary system out of an
`_EXID` tag — but both of those attach it to a *leaf* place, the one an event's `PLAC` names or
the one a `_PLAC` record is about, never to an ancestor-only level. A census of those three
sites is asserted as an exact set, so a fourth writer fails CI and its author has to classify
it instead of losing data quietly.

`entity_type`, `system` and `value` therefore stay `lossy`, with the reason narrowed from
"only three pairs have an emitting tag" to that single cell. Declaring them `lossless` while a
seedable row is still lost would repeat the overclaim this plan exists to remove.

`id` stays `UUID_PK_VIA_XREF`, `entity_id` stays `UUID_FK_VIA_XREF`, `created_at` stays
`AUDIT_TS_EXCLUDED`.

## Scope

- `src/gedcom/external-id-tags.ts` — new. Pure emit/read helpers for both tag shapes.
- `src/gedcom/exporter.ts` — `SOUR` record, `REPO` record, `OBJE` block, `emitCitationBlock`,
  `emitPlaceSubTags`, and the `_ADPL` parent-guard removal.
- `src/import/gedcom/phases/sources.ts` — read `REFN`/`EXID` + `TYPE` on `SOUR`.
- `src/import/gedcom/phases/repo.ts` — read `REFN`/`EXID` + `TYPE` on `REPO`.
- `src/import/gedcom/phases/obje.ts` and `src/import/gedcom/obje-importer.ts` — read
  `REFN`/`EXID` + `TYPE` on both `OBJE` shapes.
- `src/import/gedcom/phases/prep-places.ts` — read `_EXID` + `TYPE` under `PLAC`.
- The citation-collection sites in `individuals.ts`, `families.ts`, `event-importer.ts` and
  `place-citations.ts` — read `_EXID` + `TYPE` inside the `SOUR` block.
- `src/api/gedcom_fidelity_registry.ts` — three reasons narrowed to the single uncovered cell.
- `tests/helpers/gedcom_fidelity.ts` — `seedExternalIdentifiers` parametrised by pair.
- `tests/unit/` — a pair-matrix round-trip test and the uncovered-cell guard.

### Scope deviations

**No authoring surface.** No UI, no MCP tool, no `window.api` write path. The user stated the
constraint directly: *"data added in the app does not have to reflect these
external_identifiers at all."* The existing read-only accessor
(`tauri-window-api.ts:295`) is unchanged. This is the reason the plan fits one worktree.

**`unmapped_data` is not touched.** A parallel session owns `docs/unmapped-capture` and Part C
of `docs/plans/2026-08-23-import-tag-accounting-design.md`. That work captures arbitrary
unmapped tags verbatim. This work makes one already-modelled table round-trip. They are
different mechanisms with different shapes, and the boundary is: **do not edit
`src/import/gedcom/normalize.ts`, do not create an `unmapped_data` table.**

`normalize.ts` is where `EXID → REFN` conversion lives today, and it is `INDI`-only
(`convertExidToRefn` returns unchanged for every other tag). The new phases therefore read
`EXID` directly rather than relying on normalization. No edit to that file is needed.

**Unreferenced places stay unexported.** Probe 3 lost its row because the whole place was not
exported — no event names it and no citation points at it, so the exporter emits nothing for
it at all. Its identifier is lost for the same reason its `name` and `place_type` are, and
`places.parent_place_id` is already declared `lossy` on the same grounds. Exporting every
orphan place is a `places` round-trip question with its own user goal, and folding it in here
would widen the diff without serving this goal. This is the second uncovered cell and the
matrix test declares it rather than hiding it.

**`person_identifiers` is out of scope.** Persons already round-trip through `REFN`/`EXID`.
This table covers the five non-person entity types by construction.

## Verification

1. **The user-observable outcome.** Import a GEDCOM carrying identifiers on all five entity
   types, export, re-import, and assert every `(entity_type, system, value)` triple is present
   in the second database. This is the goal sentence, made falsifiable.
2. **The pair matrix.** For each of the 5 entity types crossed with a vendor system and an
   unknown system, seed → export → re-import → assert the row survives. The three vendor pairs
   additionally assert the vendor tag, not `REFN`/`_EXID`, is what carries them. The two
   uncovered cells are asserted as *expected* losses with their reason, so the matrix states
   the whole space and nothing sits outside it.
3. **The four real ArkivDigital exports still export byte-identically.** They contain 0 root
   parishes and 0 non-AD systems, so the vendor-override rule predicts no change. A diff that
   is not empty means the override rule leaked.
4. **The per-field test can now fail.** `seedExternalIdentifiers` takes the pair as a
   parameter. Deliberately reverting one emit site makes the matrix test red.
5. **Registry coverage.** The schema-introspection test still passes, and the narrowed `lossy`
   reasons name the two uncovered cells rather than the three covered pairs.
6. **`unaccountedFor` stays empty across the 22 fixtures.** The new reads go through
   `getChild`, which marks consumed, so adding them cannot open an accounting hole. Asserted,
   not assumed.

**User-goal-falsifiability check.** If all six pass, can the goal still be unmet? One way: an
identifier attached to an entity that is itself dropped from the export by an export filter
(`ExportOptions` person scoping). That is the filter working as asked, and item 1 runs without
filters. No other path leaves a row uncarried, because item 2 enumerates the whole
`(entity_type × system-kind)` space rather than sampling it.

## Failure modes / RCA reference

**A test that cannot return zero is not evidence.** `seedExternalIdentifiers` hardcoding the
one working pair is the same shape as `ctx.skippedTags` reporting 143 of 40 436 drops
(`CLAUDE.md`, 2026-08-23) and the same shape as `git log | grep | head -3` read as prevalence
(`.claude/rules/evidence.md`). The parametrised seeder exists because the fix is not "declare
it lossless after fixing the emitters" but "make the test capable of disagreeing".

**Registry entries drift toward optimism.** `value: lossless` was written while the adjacent
comment correctly explained that only three pairs have a tag. The comment and the status
contradicted each other for two releases. Any registry entry whose adjacent comment names an
exception is a `lossy`, not a `lossless`.
