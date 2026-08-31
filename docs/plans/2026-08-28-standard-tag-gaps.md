# Standard GEDCOM Tags the Importer Does Not Read

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the importer reads the standard GEDCOM tags a researcher's file actually carries — the media on a citation, the particle in a surname, the source's own transcript, the age recorded at an event — and names, with a reason, whatever is left.

**Architecture:** tag accounting names what the importer drops; the dialect-tag review worked through the vendor half of that list. This plan works through the rest. Every task is independently committable.

**Tech Stack:** TypeScript, Vitest, node-sqlite3-wasm, SQLite.

**Spec:** this file. Referent for every `unmapped:pending-standard-tag-gaps` reason in `src/import/gedcom/accounting-declared.ts`.

**Depends on:** tag accounting (v0.272.0, [plan](archive/2026-08-23-importer-tag-accounting.md)) and the dialect-tag review ([plan](2026-08-23-dialect-tag-review.md)), which filed this one and wrote the reasons that point here.

## Global Constraints

- `.claude/rules/api.md`: bulk writes go through `runBatch`. Never `db.prepare(...).run(...)` raw.
- `.claude/rules/performance.md`: no per-row DB call inside a loop over a DB-scale array. Most of this work lands in the individuals and families phases, which run once per INDI/FAM.
- **Prime Directive:** nothing inferred is persisted. `AGE` in particular — an age at an event is not a birth date, and computing one from it would be exactly the violation.
- **Prime Directive (cont.):** every new column gets an entry in `src/api/gedcom_fidelity_registry.ts` in the same commit. The schema-introspection test fails otherwise, by design.
- `/export-import/` is gitignored real family data. **Never commit it, never copy it into `tests/fixtures/`.** All committed fixtures are synthetic.
- Worktree: `git -C <path>`, `npm --prefix <path>`, **vitest needs `--root <abs-worktree-path>`**.
- Stage **by explicit path**. `git add -A` is blocked by a hook.

---

## User goal

Import a GEDCOM written by any program and:

- a photograph attached to a source citation arrives with the citation, not silently dropped,
- a surname particle — *van*, *de*, *af* — stays part of the name it belongs to,
- a source's own transcribed text and its notes arrive with the source,
- the age a record states at an event is preserved as the record's own words,
- a media object with several files keeps all of them, not just the first,
- and whatever the app still cannot read is named in the import report, with the reason.

## What the census says

**The plan's original census measured the wrong directory.** It ran against
`export-import/samples`, which holds third-party and synthetic test files. Re-measured
2026-08-29 against *both* denominators, after the dialect review, the AD profile, the
citation `_AID` and the external-identifier round-trip all shipped:

| Denominator | Paths | Occurrences |
|---|---:|---:|
| `export-import/samples` — the original scope | 690 | 10 187 |
| `export-import` — every real `.ged`, including the researcher's own files | **747** | **145 964** |

The original number (700 / 10 207) reproduces almost exactly on its own denominator, so
the measurement was competent and the *scope* was wrong. 57 paths worth **128 728
occurrences — 88 % of the real drop volume — never appear in `samples/` at all**, because
they live in the Holger export and the four ArkivDigital files the researcher actually
uses. `INDI.NOTE`, which T04 already targets, is 19 occurrences in `samples/` and **6 568**
in the real corpus: a 346× under-count that would have made T04 look like a rounding error.

Regenerate with:

```bash
npx tsx scripts/accounting-over-samples.ts export-import --out /tmp/census.txt
```

### What only the real files show

| Path | Occurrences | What it is |
|---|---:|---|
| `INDI._H8P` | 44 466 | Holger 8's internal row id — the sibling of `_HDP`, which **is** declared |
| `INDI.OBJE._HDM` | 23 964 | Holger's media bookkeeping |
| `INDI.OBJE.DATA` | 23 964 | the standard `OBJE.DATA` wrapper Holger writes around it |
| `INDI.REMA` | 13 146 | Holger's free-text remark — authored research |
| `FAM.MARR._HDV` / `._H8V` | 6 688 each | Holger marriage bookkeeping |
| `FAM.MARR.PARI` | 2 008 | the parish of a marriage |
| `INDI.RESI._PLC` / `.BIRT._PLC` / `.DEAT._PLC` | 2 191 | Holger place pointers |
| `INDI._GRP` | 945 | in `KNOWN_INDI_TAGS` yet still reported — allowlisted, never consumed |
| `_PLC` + children | 2 308 | Holger's top-level place-definition record |

Only `INDI._HDP` carries a declaration. `_H8P` — 44 466 occurrences, the same concept from
Holger 8 — has none. That single missing line is 30 % of the corpus's entire undeclared
volume.

**700 distinct undeclared paths, 10 207 occurrences.** Split by leaf tag:

| | paths | occurrences |
|---|---:|---:|
| standard leaf tag (no leading `_`) | 613 | 3 357 |
| `_`-prefixed leaf tag | 87 | 6 850 |

The dialect-tag review named this split as its own biggest finding and declined to act on it, on the grounds that mapping it is several separate pieces of modelling work behind a title that says "dialect". That judgement stands. The title of *this* plan is likewise imperfect — the single largest undeclared block, `_EVENT_DEFN` at 1 717 occurrences, has an underscore root and standard leaves — and the filename stays, because every `unmapped:pending-standard-tag-gaps` reason in the code points at it.

By record root:

| Root | occurrences | paths |
|---|---:|---:|
| `INDI` | 6 261 | 262 |
| `_EVENT_DEFN` | 1 717 | 26 |
| `FAM` | 1 146 | 191 |
| `OBJE` | 446 | 52 |
| `SOUR` | 272 | 49 |
| `SUBM` | 174 | 41 |
| `HEAD` | 101 | 34 |
| `_PLAC_DEFN` | 40 | 4 |
| `REPO` | 21 | 15 |
| `_LOC`, `SUBN`, `_RECORD`, `_PUBLISH`, `_USER`, `_PARTY`, `_MYOWNTAG`, `NOTE` | 29 | 39 |

## Scope

Enumerating 700 paths one per bullet would be a wall nobody reads, and the list is *reproducible* — the census command above regenerates it exactly. So scope is enumerated **by concept, with the exact occurrence count and path count of each**, and the sum of the groups accounts for every one of the 700. A group is in scope unless the deviations section names it.

| Group | Occurrences | Paths | Task |
|---|---:|---:|---|
| Citation media — `*.SOUR.OBJE` and its children | 386 | 19 | T02 |
| Multi-file media objects — the 2nd..nth `OBJE.FILE` and their sub-tags | 371 | 9 | T03 |
| `NOTE` on hosts no phase reads | 242 | 51 | T04 |
| Age at event — `*.AGE` | 187 | 59 | T05 |
| Source text and notes — `SOUR.TEXT`, `SOUR.NOTE` and children | 176 | 4 | T06 |
| Submitter — `SUBM.LANG` and the rest of the SUBM record | 174 | 41 | T07 |
| Name parts — `NAME.SPFX`, `NPFX`, `NSFX` | 158 | 4 | T08 |
| Addresses — `ADDR` / `PHON` / `EMAIL` / `WWW` / `FAX` on any host | 117 | 41 | T09 |
| Repository call numbers — `SOUR.REPO.CALN` and `.MEDI` | 32 | 4 | T10 |
| `HEAD.SCHMA` — 7.0 extension-tag declarations | 20 | 2 | T11 |
| LDS ordinance children — `BAPL` / `CONL` / `ENDL` / `SLGC` / `SLGS` sub-tags | 1 078 | 33 | T12 (declare) |
| `_EVENT_DEFN` — Legacy's event-definition record | 1 717 | 26 | T13 (declare) |
| `_PLAC_DEFN` — Legacy's place-definition record | 40 | 4 | T13 (declare) |
| Citation presentation — `*.SOUR._LINK` / `._FOOT` | 4 314 | ~20 | T14 (declare) |
| Preference flags — `FAM.HUSB._PREF` and siblings | 416 | 3 | T14 (declare) |
| **Holger row ids — `INDI._H8P`** | **44 466** | **1** | **T16 (declare)** |
| **Holger media bookkeeping — `INDI.OBJE._HDM`** | **23 964** | **1** | **T16 (declare)** |
| **`OBJE.DATA` wrapper and its children** | **23 964** | **~3** | **T17 (map)** |
| **`INDI.REMA` — Holger's free-text remark** | **13 146** | **1** | **T18 (map)** |
| **`FAM.MARR._HDV` / `._H8V`** | **13 376** | **2** | **T16 (declare)** |
| **`FAM.MARR.PARI` and the other `PARI`** | **2 502** | **4** | **T19 (map)** |
| **`_PLC` record + `*._PLC` pointers** | **4 499** | **~10** | **T20 (map or declare — decide by probe)** |
| **`INDI._GRP` — allowlisted, never consumed** | **945** | **1** | **T21 (fix the allowlist lie)** |
| Everything not named above | remainder | remainder | T15 (sweep) |

T15 exists because the groups above are hand-drawn and the census is not. Its job is to re-run the census and account for whatever the earlier tasks did not reach — the same "did I get them all?" the truncating sweep used to make unanswerable.

### Scope deviations

- **`INDI.SLGC.FAMC` (80) and the other LDS structure tags are declared, not mapped.** The ordinances themselves already carry `excluded:not-relevant`; a child of an excluded parent inherits the reason. Declaring them is bookkeeping, and T12 is a declaration task with no modelling in it.
- **`_EVENT_DEFN` and `_PLAC_DEFN` are declared, not mapped.** They are Legacy's *definitions* of its own custom event and place types — the sentence templates it uses to render a narrative (`_SEN1` … `_SEN6`), not facts about anybody's family. The events defined by them arrive separately as ordinary event records.
- **`*.SOUR._LINK` / `._FOOT` are declared, not mapped.** 4 314 occurrences, and every one is presentation: a hyperlink and a footnote-number the exporting program computed for its own report. The citation they hang off is already imported.
- **Archive (`.zip`) and the non-GEDCOM importers are out of scope.** This plan is the GEDCOM tag-accounting list and nothing else.
- **`INDI.REMA` is mapped, not declared, and that is a reversal of the original scope.** It was invisible to the `samples/` census. 13 146 free-text remarks a researcher typed are authored research by the same argument that made `_DESC` load-bearing in the ArkivDigital work — `.claude/rules/evidence.md` and the Prime Directive both point the same way.
- **`_H8P` / `_HDM` / `_HDV` / `_H8V` are declared, not mapped.** They are Holger's internal row ids and media bookkeeping. `INDI._HDP` already carries `excluded:not-relevant` with a written reason; these inherit it verbatim. 82 494 occurrences discharged by four lines, which is what declaration is for.

## Verification

1. **User-observable:** import a file carrying a photograph on a birth citation and the photograph appears on that citation in the app, not only on the person. Import a name written `2 SPFX van` and the app shows *van Dijk*, one name, not *Dijk* with the particle lost. Import a source with `1 TEXT` and the transcript is on the source. Import an event with `2 AGE 42y` and the record's stated age is visible on the event and is not turned into a birth date.
2. `npm test -- import-tag-accounting` green, with **zero** entries carrying `unmapped:pending-standard-tag-gaps` in `src/import/gedcom/accounting-declared.ts`. That is this plan's completion condition, asserted by a test rather than by a grep.
3. The census, re-run at close-out, contains no path from a group T02–T11 claims to have mapped. Its own distinct-path total is quoted in the close-out commit against the **747 / 145 964** recorded here, on the `export-import` denominator — not the `samples/` one the plan first used.
4. Every new column has a `src/api/gedcom_fidelity_registry.ts` entry and a per-field round-trip test that seeds the column, exports, re-imports and asserts the value survives.
5. A test asserts an imported `AGE` is stored as the record's own string and that **no** birth date was derived from it — the Prime Directive check, because the failure mode here is a helpful inference rather than a missing value.

**User-goal-falsifiability check.** If 1–5 pass, can the goal still be unmet? Yes, in one way: a group can be *declared* rather than mapped and still pass 2, 3 and 4, because a declaration discharges the accounting obligation without giving the researcher the data. That is why §1 names four specific values a user can see, and why the deviations section has to justify each declaration individually rather than as a batch.

**Type-checking, measured not asserted.** `npm run typecheck` is not clean on this repo and never has been. The check is *no new errors*, measured against a baseline taken in the worktree at the branch point — never in the main tree, where `src-tauri/target/release/**` swamps the count.

---

## Tasks

### T01 (Tier 1): fixtures for the four user-observable values

**Files:** create `tests/fixtures/gedcom/standard-tags.ged`.

One synthetic file carrying a citation with `OBJE`, a `NAME` with `SPFX`, a `SOUR` with `TEXT` and `NOTE`, an event with `AGE`, and an `OBJE` with two `FILE`s. Shapes copied from the real corpus, values invented. Nothing from `/export-import/`.

- [ ] Write the fixture; assert it parses and imports without throwing.
- [ ] Commit — `test(import): a fixture for the standard tags the importer drops`.

### T02 (Tier 1): a photograph on a citation arrives with the citation

**Files:** `src/api/schema.ts`, `src/api/gedcom_fidelity_registry.ts`, `src/import/gedcom/event-importer.ts`, `src/gedcom/exporter.ts`, test.

386 occurrences across 19 paths. `citations` has no media link. Decide between a `media_links` row with `entity_type='citation'` (the table already carries an entity-typed FK, so this may need no schema change at all — **check first**) and a new column.

- [ ] Establish whether `media_links` already accepts `citation`; record the answer in the commit.
- [ ] Failing test: import a citation with `OBJE`, assert the media is reachable from the citation.
- [ ] Implement, including the export side and its round-trip test.
- [ ] Registry entry for any new column.
- [ ] Commit — `feat(import): keep the photograph attached to a citation`.

### T03 (Tier 1): a media object with several files keeps all of them

**Files:** `src/import/gedcom/obje-importer.ts`, `src/import/gedcom/phases/obje.ts`, `src/import/gedcom/phases/prep-inline-media.ts`, test.

371 occurrences across 9 paths. `getChild(node, 'FILE')` returns the first `FILE` and marks only that one, so the 2nd..nth file of a multi-file `OBJE` is dropped *and* reported. One `media` row per `FILE` is the likely shape.

- [ ] Failing test: an `OBJE` with two `FILE`s yields two media rows, both linked to the same host.
- [ ] Implement across all three call sites; they already share `readObjeFormAndTitle`.
- [ ] Commit — `feat(import): a media object with several files keeps all of them`.

### T04 (Tier 1): a NOTE on a host no phase reads

**Files:** `src/import/gedcom/phases/notes.ts` and the hosts, test.

242 occurrences across 51 paths — `SOUR.NOTE`, `HEAD.NOTE`, `INDI.NAME.NOTE`, `OBJE.NOTE` and 47 more. The `notes` table is entity-typed already, so this is wiring rather than modelling.

- [ ] Enumerate the 51 host paths from the census; group by entity type.
- [ ] Failing test per entity type that gains a note.
- [ ] Implement; declare any host whose entity type the `notes` table does not model.
- [ ] Commit — `feat(import): a note stays with whatever it was written on`.

### T05 (Tier 1): the age a record states at an event

**Files:** `src/api/schema.ts`, `src/api/gedcom_fidelity_registry.ts`, `src/import/gedcom/event-importer.ts`, `src/gedcom/exporter.ts`, test.

187 occurrences across 59 paths. `events` has no age column.

- [ ] Failing test: `2 AGE 42y` on a death is stored verbatim and **no** birth date is derived from it.
- [ ] Add `events.age_at_event TEXT`, storing the record's own string — not a parsed number of years. `42y 3m`, `INFANT` and `CHILD` are all legal GEDCOM and all mean something a number cannot hold.
- [ ] Registry entry + round-trip test.
- [ ] Commit — `feat(import): an event keeps the age the record stated`.

### T06 (Tier 1): a source's transcript and its notes

**Files:** `src/api/schema.ts`, `src/api/gedcom_fidelity_registry.ts`, `src/import/gedcom/phases/sources.ts`, `src/gedcom/exporter.ts`, test.

176 occurrences across 4 paths — `SOUR.TEXT` 63, `SOUR.NOTE` 111 and their children. `SOUR.NOTE` goes to the `notes` table alongside T04. `SOUR.TEXT` is the source's own transcribed text and needs a column; `citations.transcription` is the per-citation equivalent and is the naming precedent.

- [ ] Failing test for each.
- [ ] Implement; registry entry + round-trip test for the new column.
- [ ] Commit — `feat(import): a source keeps its transcript`.

### T07 (Tier 1): the submitter record

**Files:** `src/import/gedcom/phases/submitters.ts`, `accounting-declared.ts`, test.

174 occurrences across 41 paths, `SUBM.LANG` (92) the largest. Most of a SUBM record is contact detail for the person who exported the file.

- [ ] Classify all 41 paths: map, or declare with the count.
- [ ] Implement whichever map; declare the rest.
- [ ] Commit — `feat(import): read the submitter record, declare what it does not model`.

### T08 (Tier 1): a surname particle stays part of the name

**Files:** `src/import/gedcom/phases/individuals.ts`, `src/gedcom/exporter.ts`, test.

158 occurrences across 4 paths, `INDI.NAME.SPFX` 155. `person_names` has `name_prefix`, and `name_qualifier` already has `'particle'` — so establish which of the two `SPFX` belongs in before writing code. `NPFX` (*Dr*, *Rev*) and `SPFX` (*van*, *de*) are different things and the existing `name_prefix` column is fed from `NPFX`.

- [ ] Failing test: `1 NAME Jan /Dijk/ / 2 SPFX van` renders as one name including the particle.
- [ ] Implement; round-trip test.
- [ ] Commit — `feat(import): a surname particle stays part of the name`.

### T09 (Tier 1): addresses on their hosts

**Files:** the relevant phases, `accounting-declared.ts`, test.

117 occurrences across 41 paths — `INDI.ADDR` 20, `HEAD.SOUR.CORP.ADDR` 10, and 39 smaller. `repositories` already models an address; persons and sources do not.

- [ ] Classify by host; map where a column exists, declare where it does not.
- [ ] Commit — `feat(import): an address stays with whatever it was written on`.

### T10 (Tier 1): repository call numbers

**Files:** `src/import/gedcom/phases/repo.ts`, test.

32 occurrences across 4 paths — `SOUR.REPO.CALN` 16 and `.MEDI` 13. The call number is how a researcher finds the volume again on the shelf.

- [ ] Failing test; implement; round-trip.
- [ ] Commit — `feat(import): a repository call number survives the import`.

### T11 (Tier 1): `HEAD.SCHMA`

**Files:** `accounting-declared.ts` or `src/import/gedcom/phases/header-metadata.ts`, test.

20 occurrences across 2 paths. GEDCOM 7.0's declaration of which extension tags a file uses. Either read it to inform the accounting report, or declare it.

- [ ] Decide and record; commit — `docs(import): HEAD.SCHMA declares extension tags, and so do we`.

### T12 (Tier 1): LDS ordinance children inherit their parent's reason

**Files:** `accounting-declared.ts`, test.

1 078 occurrences across 33 paths. The ordinances carry `excluded:not-relevant` already; their children do not. A wildcard per ordinance is the shape — `BAPL.*`, `CONL.*`, `ENDL.*`, `SLGC.*`, `SLGS.*` — but the matcher's `X.*` form matches by *prefix*, so verify each pattern against a real path before trusting it.

- [ ] Write the declarations with measured counts; test each pattern resolves.
- [ ] Commit — `docs(import): LDS ordinance children inherit the ordinance's reason`.

### T13 (Tier 1): Legacy's definition records

**Files:** `accounting-declared.ts`, test.

`_EVENT_DEFN` 1 717 across 26 paths, `_PLAC_DEFN` 40 across 4. Sentence templates and type definitions Legacy uses to render its own narratives, not facts about a family. The events they define arrive separately as ordinary records — **confirm that** against the corpus before declaring, because the whole justification rests on it.

- [ ] Confirm the events exist independently; record the check.
- [ ] Declare with measured counts; commit — `docs(import): Legacy's definition records are templates, not facts`.

### T14 (Tier 2): citation presentation and preference flags

**Files:** `accounting-declared.ts`.

`*.SOUR._LINK` / `._FOOT` 4 314; `FAM.HUSB._PREF` / `WIFE._PREF` / `CHIL._PREF` 416. Tier 2 because "this is presentation, not research" is a judgement, and the executor records it rather than asking.

- [ ] Declare with measured counts and the reasoning; commit — `docs(import): citation link and footnote tags are presentation`.

### T15 (Tier 1): re-run the census and account for the remainder

Run on `export-import`, not `export-import/samples`. The whole point of the correction above is that the sample directory hides 88 % of the volume.

**Files:** `accounting-declared.ts`.

The groups above were drawn by hand; the census is not. Whatever T02–T14 did not reach is still a silent drop until it is named.

- [ ] Re-run `npx tsx scripts/accounting-over-samples.ts export-import/samples --out census.txt`.
- [ ] Every remaining path is mapped or declared. Quote the before (700) and after distinct-path totals in the commit.
- [ ] Commit — `docs(import): account for the tail of the census`.


### T16 (Tier 1): declare Holger's bookkeeping — 82 494 occurrences, four lines

`INDI._HDP` already carries a written reason in `src/import/gedcom/accounting-declared.ts`.
Its siblings have none, which is why the corpus reports 82 494 undeclared occurrences of
data nobody wants imported. Add four entries beside it, each with its own reason — a
shared reason string is how a declaration list stops being read.

```ts
{ path: 'INDI._H8P', reason: "excluded:not-relevant — Holger 8's internal row id, the same concept as _HDP under a later schema version. Storing it would re-emit it as REFN + TYPE Other, changing the file on export while adding nothing the researcher wrote. 44 466 occurrences." },
{ path: 'INDI.OBJE._HDM', reason: 'excluded:not-relevant — Holger media bookkeeping; the media row itself imports through OBJE.FILE. 23 964 occurrences.' },
{ path: 'FAM.MARR._HDV', reason: 'excluded:not-relevant — Holger marriage bookkeeping, no authored content. 6 688 occurrences.' },
{ path: 'FAM.MARR._H8V', reason: 'excluded:not-relevant — Holger 8 marriage bookkeeping, the _HDV sibling. 6 688 occurrences.' },
```

Before writing each one, open a real Holger file and read three occurrences. A declaration
is a claim about content, and `excluded:not-relevant` asserted without looking is the
overclaim this whole effort exists to remove. If any of the four turns out to carry
authored text, it becomes a mapping task and this one shrinks.

- [ ] Read three real occurrences of each of the four tags. Paste them in the commit.
- [ ] Add the four entries.
- [ ] Re-census: total occurrences drop by ~82 494. Quote before and after.
- [ ] `npm test -- import-tag-accounting` green. Commit.

### T17 (Tier 1): the `OBJE.DATA` wrapper — 23 964 occurrences

Holger wraps every media reference in `2 OBJE` / `3 DATA` and hangs its own `_HDM` beneath.
`DATA` is standard GEDCOM 5.5.1 and the importer reads straight past it.

Probe first: does `OBJE.DATA` carry anything but `_HDM`? If it is a bare wrapper, the entry
is `excluded:structural — a container tag with no value of its own; its children are
accounted for individually`. If it carries `FILE` or `FORM` children the importer is
missing, it is a mapping task. **Decide from the file, not from this paragraph.**

- [ ] Census the children of `OBJE.DATA` across the corpus, with counts.
- [ ] Map or declare per what the census shows, and say which in the commit.
- [ ] Commit.

### T18 (Tier 1): `INDI.REMA` — 13 146 remarks a researcher typed

Holger's free-text remark on a person. Same shape as ArkivDigital's `_DESC`, which the
profile work established is authored research and must be kept.

`persons.notes` already exists and is the right home — a remark is a note about the person.
Append rather than overwrite: `INDI.NOTE` (T04) targets the same column and both can be
present.

```ts
// individuals.ts, beside the NOTE read
const rema = getChild(node, 'REMA')?.value?.trim();
// notes is TEXT NOT NULL DEFAULT '' — join, never clobber. The order is the
// file's order, so a re-export is stable.
const noteParts = [existingNote, rema].filter(Boolean);
personRow.notes = noteParts.join('\n\n');
```

Add `'REMA'` to `KNOWN_INDI_TAGS`. Registry: `persons.notes` already has an entry — check
whether it still describes reality once two tags feed it, and correct it if not.

- [ ] Read ten real `REMA` values first and quote three in the commit. If they are
      bookkeeping rather than prose, this becomes a declaration and the plan says so.
- [ ] Map, with a round-trip test: `REMA` in → `persons.notes` → export → re-import.
- [ ] Commit.

### T19 (Tier 1): `PARI` — the parish of an event, 2 502 occurrences

`FAM.MARR.PARI` (2 008), `INDI.BIRT.PARI` (334), `INDI.DEAT.PARI` (160). A parish is a
place, and `places` already models parishes with `place_type = 'parish'` — the ArkivDigital
work built the whole hierarchy on it.

The event already resolves a `PLAC`. `PARI` names the parish that `PLAC` sits in. Resolve
it as the parent place, exactly as `_ADPL` does, and reuse `bulkResolveHierarchy` rather
than writing a second path.

**Do not invent a hierarchy the file did not state.** If `PLAC` and `PARI` disagree, keep
both as authored: the parish becomes the parent only when the file's own structure says so.
Probe ten real cases before choosing the shape.

- [ ] Census: how often does an event carry both `PLAC` and `PARI`, and do they agree?
- [ ] Implement per the census. Round-trip test.
- [ ] Commit.

### T20 (Tier 1): the `_PLC` record and its pointers — 4 499 occurrences

`_PLC` is a top-level Holger place-definition record (432 each of `_PLC`, `.NAME`, `.FORM`,
`.TYPE`, 424 `._PLP`), and `INDI.*._PLC` (2 191) are pointers into it. This is Holger's
equivalent of the `_PLAC` record this app writes itself.

If the pointers resolve to definitions carrying names the flat `PLAC` string does not, this
is real place data and maps to `places`. If every `_PLC` definition duplicates the `PLAC`
already imported, it is `excluded:redundant` with the measurement as the reason.

The dialect review got exactly this classification backwards twice — `OBJE.FILE.FORM` and
`OBJE.FILE.TITL` were both called redundant and both were dropping data. **Measure the
overlap, do not reason about it.**

- [ ] Census the overlap: of N `_PLC` definitions, how many names appear in no `PLAC`?
- [ ] Map or declare per the number. Quote it in the commit either way.
- [ ] Commit.

### T21 (Tier 1): `INDI._GRP` is allowlisted but never consumed

`_GRP` sits in `KNOWN_INDI_TAGS` (`individuals.ts:28`) yet the census reports 945
undeclared occurrences of `INDI._GRP`. An allowlist entry that no phase reads is precisely
the silent-drop shape clause 1 exists to prevent: the tag looks handled to anyone reading
the code and is not.

- [ ] Determine which it is: a tag that should map to `groups` / `group_links`, or one that
      should be declared. Read the real values.
- [ ] Fix the code so the allowlist and the behaviour agree, whichever way.
- [ ] Add a test that fails if a `KNOWN_INDI_TAGS` entry is neither consumed nor declared —
      the general form of this bug, so the 946th occurrence cannot hide the same way.
- [ ] Commit.

### T-final (Tier 1): close out

- [ ] **Invoke the `/close-out` skill.** It walks the 6+1 steps, refuses partial work, and captures evidence.

---

## Self-review checklist

- [ ] Every task has a tier tag.
- [ ] No self-referential tasks.
- [ ] Every task ends in a commit or a recorded measurement.
- [ ] No file from `export-import/` committed.
- [ ] Zero `unmapped:pending-standard-tag-gaps` entries remain in `accounting-declared.ts`.
- [ ] Every declaration carries a measured count, not an adjective.
- [ ] Every new column has a fidelity-registry entry and a round-trip test.
- [ ] No value is derived from `AGE` and written to another column.
- [ ] `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e:full` green with output captured.
- [ ] `npm run typecheck` shows no NEW errors against the branch-point baseline.

## Failure modes / RCA reference

- **The sweep that surveys the corpus used to truncate its own output** — 755 distinct paths, 30 printed. Fixed by the dialect-tag review's Task 1. Every count in this plan comes from the census file, not from the console summary. `.claude/rules/evidence.md`.
- **A declaration is not a mapping.** Verification §2 and §3 both pass if every group is declared and none is mapped. Verification §1 is the one that does not, and it is the one that matters.
- **`excluded` does not mean "hard".** `CLAUDE.md` Prime Directive (cont.) enumerates what it does mean. Each declaration in T12–T14 has to land on one of those meanings and say which.
- **The plan that shipped before this one had four measurement errors in its own premises** — `_FREL`'s position, the `Adopted` count, `_MARNM`'s payload shape, and both guesses about `OBJE.FILE.FORM` / `OBJE.FILE.TITL`. Each was written as settled fact and each was wrong. Measure the shape in the corpus before writing the code that reads it.
