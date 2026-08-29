# ArkivDigital Import and Multi-File Merge — Design Spec

**Date:** 2026-08-23
**Status:** Design approved. Three implementation plans to follow — Part 0 (tag
accounting), Parts 1-3 (profile, storage, round-trip), Parts 4-5 (multi-file queue,
consolidation review). Part 0 lands first.

## User goal

A researcher who exports several family trees from ArkivDigital can import them all
into one database and get one tree — where every source is the archive volume it
actually is, every place sits in its real parish and county, and nothing they typed
survives the trip as anything less than what they wrote.

Concretely, for the four trees in `export-import/min släkt/`:

- The 2776 imported source records resolve to the 1496 archive volumes they represent,
  with the image reference kept on the citation.
- Places form a real hierarchy — 6 countries, 31 counties, 333 parishes, 1367
  localities — instead of 1624 flat display strings.
- The researcher's own annotations on events (`Trolovningsbarn`,
  `Felaktigt födelseår i källan`) are present after import.
- The five people who appear in more than one tree are offered for merge, and the
  researcher decides.

## Background — how this was found

Four GEDCOM 5.5.1 exports from ArkivDigital, dated 2026-08-23, all post-dating AD's
2026-02-23 custom-tag change (`_ADPL` / `_LOCALITY` / `_PARISH_AID` / `_COUNTY` present,
`_PLACE` gone).

| Tree | INDI | FAM | SOUR records |
|---|---|---|---|
| Farfars | 206 | 102 | 793 |
| Farmors | 61 | 29 | 213 |
| Morfars | 162 | 60 | 529 |
| Mormors | 393 | 158 | 1241 |
| **merged** | **822** | **349** | **2776** |

Importing all four into one in-memory DB through the current `importGedcom` path
succeeds and produces 822 persons, 5025 events, 1617 places, 2776 sources and
6752 citations. The `skipped` report lists one tag: `_TITLE`, 143 occurrences.

That report is not the whole truth. A tag-path census of the four files finds
**43 199 custom-tag occurrences across 168 distinct paths**. Of those, 2763 are
consumed (`SOUR._URL` → `sources.url`), 143 are disclosed, and **40 293 are dropped
without appearing in any report**. One standard tag joins them: `SOUR.DATA.DATE`,
6147 occurrences, empty on all 6752 imported citations.

### Why the report is blind

`ctx.skippedTags` is written in two places in the entire importer:

- `src/import/gedcom/phases/individuals.ts:398` — unrecognised level-1 tags on INDI,
  checked against `KNOWN_INDI_TAGS`.
- `src/import/gedcom/phases/families.ts:164` — unrecognised level-1 tags on FAM.

Every other phase reads a fixed allowlist and discards the remainder silently.
`phaseSources` reads `TITL`, `AUTH`, `PUBL`, `_URL`, `_STYPE`, `_ABSTRACT`, `_CALL`,
`REPO`, `_REPO_TEXT`, `OBJE` — `_AID` is neither read nor counted. A tag is disclosed
only when it sits at level 1 of an INDI or FAM record, which is why `INDI._TITLE`
appears in the report and `INDI.RESI._DESC` does not.

Generalising that disclosure is **Part 0 of this spec**, and it lands before the profile.
The reason is not tidiness. Until the report is honest, no one — reviewer or user — can
tell whether the ArkivDigital profile is complete, and every future format inherits the
same blindness. `CLAUDE.md` Prime Directive (cont.) clause 1 was strengthened alongside
this spec to give the import side the mechanical contract the export side already had.

### Two structural mismatches, measured

**AD writes one SOUR record per image, not per volume.** 2776 records collapse to 1496
distinct volumes under the key `(TITL, _AID)`, falling back to `(TITL, _URL)` for the
43 non-AD sources with no `_AID`. `Sveriges befolkning 1985` is 129 separate records,
`Valbo (X) AI:8 (1789-1805)` is 37.

The collapse loses nothing. 2715 of 2776 record-level `_URL` values are identical to,
or strictly less specific than, an `_AID` already carried on that record's own
citations. 15 differ only in `http:` versus `https:`. 47 are volume-level where the
citation is page-level. 4 are genuinely different, all pointing at a volume's first
image. 14 records carry no `_URL` at all.

**AD hands us a place hierarchy and we flatten it.** All 4868 `PLAC` lines carry an
`_ADPL` block. `_PARISH_AID` has 335 distinct values against 333 distinct `_PARISH`
names, so two parishes share a name across counties and the name alone cannot identify
them.

The census counts 1624 distinct `PLAC` strings across the four files. The import
produces 1617 place rows. Measured: `normalized_name` collation (lowercase, strip
diacritics) folds 8 pairs, giving 1616. The remaining row is unaccounted for and the
implementation plan must explain it before asserting a place count.

Two of the 8 folds are worth a look. `Mackmyra By` / `Mackmyra by` is a harmless case
difference. `Vägmästaregatan 26A` / `Vågmästaregatan 26A` is an `ä`/`å` pair that
diacritic-stripping merges into one row — almost certainly the same street typed two
ways, but the second authored spelling is discarded without a word. Behaviour to
confirm, not necessarily to change.

### The four trees are near-disjoint

Exact name+birthdate matching finds 2 shared people out of 758. Loose matching
(first given name + birth year) finds 5 genuine cross-tree duplicates:

| Person | Trees | Why exact matching missed it |
|---|---|---|
| Lena* Kristina Johansson f. Lundberg (1954) | 3 | — |
| Susanna* Maria Caleklint f. Johansson (1979) | 3 | — |
| Ronny Ingemar Lobenius f. Johansson (1952) | Farfars, Farmors | asterisk present in one |
| Gustaf Hilding Johansson (1920) | Farfars, Farmors | asterisk position differs |
| Maj Gulli / Gurli Maria Lindgren (1925) | Farfars, Farmors | spelling variant plus maiden vs married surname |

One pair needs a human: Karl Gunnar Lundberg (Morfars, 1921) and Karl Gunnar Vallentin
(Mormors, 1921) could be a name change or two men.

AD allocates person ids from one global sequence but writes a fresh id per tree — all
822 xrefs are distinct across the four files, including for the same human. Cross-tree
person identity must stay fuzzy and human-approved. Five rows is a review someone will
finish.

Farmors' tree stops at 1952 and never reaches the researcher. Those five people are the
only join between the four lines.

### Documentation drift worth recording

AD's published list names `_JUDICIAL_DISTRICT`. The files emit `_JUDICIAL`, 8
occurrences. GEDCOM 5.5.1 caps tags at 15 characters, so the documented name cannot be
written. Read `_JUDICIAL`, accept `_JUDICIAL_DISTRICT` as an alias.

## Scope

### Part 0 — tag accounting (lands first)

The importer accounts for every node in the parsed tree. A node is accounted for when a
phase reads it, or when the report names it with its full tag path and count.

- `getChild` / `getChildren` in `src/import/gedcom/node-utils.ts` mark the nodes they
  return. After all phases run, walk the tree and collect the unmarked.
- The report gains an `unaccountedFor: { path, count }[]` field, replacing `skipped` as
  the honest surface. `skipped` stays as a deprecated alias so existing report consumers
  and tests keep working.
- Structural nodes that carry no data of their own — `CONT`, `CONC`, `TRLR`, xref
  plumbing — are marked by the parser, not by phases, and never appear in the report.
- `tests/unit/import-tag-accounting.test.ts` imports every fixture under
  `tests/fixtures/gedcom/` and asserts `unaccountedFor` is empty, or matches a declared
  allowlist with a reason per entry.

Existing formats will fail that test on first run. That is the point — the failures are
the drops nobody could see. Each becomes either a mapping or a declared entry with a
reason. Part 0 is done when every shipped fixture is clean.

**Why generic marking and not per-phase allowlists.** A phase written next year without
its own allowlist is silently blind again, which is the exact failure being repaired.
Marking on read cannot be forgotten, because not reading a node is what makes it
unaccounted for.

### Part 1 — `arkivdigital` import profile

A new `src/import/gedcom/profiles/arkivdigital.ts`, same shape as `genney.ts` and
`holger.ts`, selected by `ImportOptions.profile === 'arkivdigital'` and auto-detected
from `HEAD.SOUR = Arkiv_Digital`.

| Tag | Occurrences | Destination |
|---|---|---|
| `_ADPL` → `_COUNTRY` / `_COUNTY` / `_PARISH` / `_LOCALITY` | 4868 | real `places` hierarchy, 1737 nodes |
| `_PARISH_AID` | 4694 | `external_identifiers`, system `arkivdigital.parish` |
| `_AID` on SOUR | 2722 | `external_identifiers`, system `arkivdigital` |
| `_AID` on citation | 6324 | `external_identifiers`, `entity_type='citation'`, system `arkivdigital.image` |
| `_DESC` incl. `CONT` / `CONC` | 900 | event / citation note |
| `SOUR.DATA.DATE` | 6147 | `citations.date_accessed` (column exists, empty today) |
| `_TITLE` level 1 | 143 | occupation / title event |
| `_JUDICIAL` | 8 | place attribute (härad) |
| `_FREL` / `_MREL` on `FAM.CHIL` | 4 | `parent_child` subtype, mirrors Holger's `ADOP TYPE` |
| `_POS` / `_PRIM` on `INDI.OBJE` | 14 | media region / primary flag |
| `_FOFN` / `_SIZE` / `_OWN` / `_CAPT` on OBJE | 11 | media fields |
| `_TAG` + `TYPE` on NOTE / FAMS / FAMC | 12 | note label |
| `*` in given names | many | preferred-name marker, reuse the genney handling |
| `_SEPR`, `_DOMESTIC_PARTNERSHIP`, `_DATE_TEXT` | 0 in these files | per AD's published list, synthetic fixture |

`MAP` / `LATI` / `LONG` already import correctly (1579 of 1617 places carry
coordinates) and are unchanged. Coordinates come from the file, so they are authored,
not inferred.

### Part 2 — `external_identifiers` storage

```sql
CREATE TABLE external_identifiers (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('source','place','media','repository','citation')),
  entity_id   TEXT NOT NULL,
  system      TEXT NOT NULL,
  value       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(entity_type, entity_id, system, value)
);
```

**Why this exists is round-trip, not dedup.** Under the Prime Directive (cont.) every
`(table, column)` declares its round-trip status, and `excluded` requires citing a spec
section that cannot carry the value. `_AID` and `_PARISH_AID` are representable — they
are plain custom tags — so `excluded` is not available to them. They must be stored to
round-trip.

The precedent is `person_identifiers`, which exists for exactly this reason:
`REFN` / `RIN` / `_UID` / `AFN` / `SSN` survive DB → GEDCOM → DB because
`src/gedcom/exporter.ts:674-708` switches on `identifier_type` and writes each back.
Sources and places have no equivalent, so their ids cannot round-trip today.

`person_identifiers` stays as-is. It carries a CHECK-validated type list, working call
sites, MCP tools and an exporter switch, and ArkivDigital adds nothing to it — AD's
person xrefs are per-tree and useless across trees.

Exact source and place dedup becomes possible as a consequence. It is not the
justification.

### Part 3 — exporter and fidelity registry

- Exporter emits `1 _AID <value>` on SOUR records carrying an `arkivdigital` identifier,
  matching the existing `_URL` / `_STYPE` / `_ABSTRACT` / `_CALL` pattern.
- Exporter reconstructs the `_ADPL` block from the stored place hierarchy. Deterministic
  derivation from stored values, nothing new persisted.
- Registry entries for every new column, plus per-field round-trip tests.

### Part 4 — multi-file import

Every importer accepts N files and runs them as a sequential queue. Not an AD-specific
path and not a new merge concept — `importGedcom` already appends to the current
database, verified: all four files land in one DB as 822 persons today. The queue adds
a multi-select picker, per-file progress, and one combined report.

### Part 5 — consolidation review, a step in the import flow

Runs once after the queue drains, scoped to what just arrived. Produces **clusters, not
pairs**:

- **Exact clusters** — identical `(system, value)`. Zero judgement. 2776 sources → 1496.
  Parish nodes by `_PARISH_AID`.
- **Fuzzy clusters** — the existing Levenshtein scorers, for persons and for formats
  with no key.

The user approves or declines each cluster. Declines go to `ignored_duplicates`, which
already supports `entity_type IN ('person','place','source','media')`.

Each import profile contributes its own exact keys through an optional `identityKeys`
member on the profile object. The review step itself is format-agnostic.

**Clusters are required, not a refinement.** `findDuplicateSources` is pairwise and
Levenshtein-based. 129 copies of `Sveriges befolkning 1985` is 8256 pairs from one
title, and an all-pairs scan over 2776 sources is 3.85 M comparisons — already a
`.claude/rules/performance.md` violation sitting in shipped code.

Imports stay faithful. No profile collapses anything at import time. 2776 source
records import as 2776, and the review step is where anything merges.

### Scope deviations

- **Genney, Holger, Gramps and RootsMagic get the `identityKeys` hook but no keys.**
  Gramps carries `handle` and `gramps_id` on every source and place, Genney carries
  internal RIDs, and neither is persisted today. Wiring them is mechanical once the
  table and the hook exist, but each needs its own round-trip test and fixture work.
  Follow-up plan, one per format.
- **`person_identifiers` is not folded into `external_identifiers`.** Two identifier
  tables is a smell. Folding costs a migration plus a rewrite of every call site, MCP
  tool and exporter branch, and loses the CHECK-validated type list that does real
  validation for persons. Revisit when a second entity type needs person-style typing.
- **Archive (`.zip`) export of `external_identifiers` is in scope conceptually,
  mechanically enforced later** — matching the existing carve-out in `CLAUDE.md`.

## Verification

1. **Import all four fixtures into one database, then approve every exact cluster in
   the consolidation review.** Assert 822 persons, 2776 sources before approval and
   1496 after, 1737 place nodes with `parent_place_id` set, 900 `_DESC` values
   present as notes, 6147 `citations.date_accessed` populated, 9046 `_AID` values stored.
2. **Tag accounting is empty, for every format.** `import-tag-accounting.test.ts`
   asserts `unaccountedFor` is empty across every fixture, the four AD files included.
   Independently cross-checked against the standalone 168-path census, so the test and
   the measurement cannot drift into agreeing with each other while both being wrong.
3. **Round-trip.** Export the merged DB, re-import it, assert DB equivalence including
   `external_identifiers` rows and the place hierarchy. Per-field round-trip test for
   every new column under both 5.5.1 and 7.0.
4. **Re-import the same file.** Import Morfars twice. Today this yields 324 persons and
   1058 sources. Assert the consolidation review offers the whole tree as exact
   clusters rather than creating a second copy silently.
5. **The five join people are offered.** Assert the fuzzy person clusters contain
   Lena Kristina, Susanna Maria, Ronny Ingemar, Gustaf Hilding and Maj Gulli/Gurli, and
   that none of them is merged without approval.
6. **e2e.** `[imports]` project covers the multi-file queue and the consolidation step
   against the packaged binary.

**User-goal-falsifiability check:** if all six pass, can the goal still be unmet? The
gap would be usability of the review at 1496-cluster scale — a researcher who cannot
finish the review has not merged their trees. Item 6 must therefore assert
"approve all exact clusters" completes in one action, not 1496.

## Failure modes / RCA reference

- **Reading the `skipped` report as evidence of completeness.** It covers level-1 INDI
  and FAM tags only. The first pass of this investigation concluded the importer
  "drops surprisingly little" on that basis, and the census contradicted it by four
  orders of magnitude. Any future claim about importer coverage cites a census, not the
  report.
- **Pairwise dedup on group duplicates.** `findDuplicateSources` predates any format
  that produces 129 copies of one thing. Cluster-first is the correction.
- **Persisting inference.** Coordinates, parish names and county names all come from
  the file. None of this design computes a place, a date or a coordinate. The
  `_ADPL` block emitted on export is reconstructed from stored hierarchy at render
  time, which is the allowed deterministic-derivation shape.

## Follow-up plans

Each is a separate spec. Neither blocks this one. Tag accounting was a follow-up in an
earlier draft and is now Part 0 — the report has to be honest before anything built on
top of it can be trusted.

### F1 — `_PARISH_AID` → gazetteer crosswalk *(investigation first)*

**Question:** can ArkivDigital's parish identifier be mapped to a node in the bundled
Swedish gazetteers, so an AD place resolves exactly instead of by name?

**Why it might work.** Each `_ADPL` block supplies a four-way tuple: `_PARISH_AID`
(`a3096`), `_PARISH` (`Hedesunda`), `_COUNTY` (`Gävleborgs län`), and the sibling
`MAP` coordinates. We ship `sv-forsamlingar.json` (3410 nodes) and `sv-socknar.json`
(2838 nodes), both carrying `name`, `aliases`, `lat`, `lon` and an admin path. Name plus
county plus coordinate proximity is three independent signals against a bounded
candidate set.

**Why it matters.** 335 distinct `_PARISH_AID` values cover 333 distinct parish names in
these four trees alone — two parishes share a name and cannot be told apart by string
matching. An AID crosswalk resolves them, and resolves every other AD parish without a
fuzzy match.

**Where the mapping lives.** A build output under
`src/api/place-gazetteers/data/`, produced by a script in `src/gazetteer-build/`, in
the same shape as every other bundled gazetteer. Never a DB write — the resolver
consults it at render time against the current bundle. Persisting a resolved parish id
into the user's database would be exactly the inference the Prime Directive forbids.

**What the investigation must answer before any plan is written:**

1. Coverage — what fraction of the 335 AIDs match a gazetteer node with all three
   signals agreeing? A crosswalk that covers 60 % is a different feature from one that
   covers 98 %.
2. Whether `MAP` coordinates describe the parish or the locality. The sample shows
   `Högnäs, Hedesunda` at `N60.379017 / E17.019017`, which is the hamlet, not the church.
   Proximity thresholds have to account for parish extent.
3. Whether AD parish AIDs are stable across exports and across AD's own data revisions.
   A crosswalk keyed on an unstable id is worse than no crosswalk.
4. Whether `sv-forsamlingar` or `sv-socknar` is the right target, or both. AD's
   `_PARISH` is a church-book parish, which is a församling, but historical socken
   boundaries are what most pre-1900 records follow.
5. Total AID space — these four trees are one researcher's corner of Sweden. Sweden has
   roughly 2500 historical parishes, so 335 is around 13 %. A crosswalk built only from
   observed AIDs is a partial artefact and must say so.

Spike, not a build. Output is an answer and a coverage number, then a plan if the
number justifies one.

### F2 — Align external identifier storage across every format *(one plan, not one per format)*

Gramps carries `handle` and `gramps_id` on every source and place. Genney carries
internal RIDs. RootsMagic carries its own row ids. None is persisted. Once
`external_identifiers` and the `identityKeys` hook exist, wiring each is mechanical.

**One plan covering all formats at once, deliberately.** Doing them one at a time is
itself the drift: the second format invents a system-naming convention that does not
match the first, and by the fourth there is no convention left to follow. Everything AD
established — key shape, system naming, exporter emission, registry entry, round-trip
test — becomes the template applied to all of them in one pass.

The anti-drift artefact is a **registered system-name list**, in the same spirit as the
fidelity registry:

| System name | Issued by | Entity types | Round-trips as |
|---|---|---|---|
| `arkivdigital` | ArkivDigital | source | `1 _AID` on SOUR |
| `arkivdigital.parish` | ArkivDigital | place | `_ADPL._PARISH_AID` |
| `arkivdigital.image` | ArkivDigital | citation | `3 _AID` on the citation |
| `gramps.handle` | Gramps | source, place, media, repository | `_HANDLE` |
| `gramps.id` | Gramps | source, place, media, repository | `REFN` with `TYPE` |
| `genney.rid` | Genney | source, place | `_RID` |

A unit test asserts every `external_identifiers.system` value in a DB appears in that
list, so a format cannot quietly introduce a seventh naming style. Same enforcement shape
as the fidelity registry's column-coverage test: adding an unregistered system breaks CI
by design.

Sequenced after Parts 1-3, since AD is where the template gets proven.
