# Every Imported Identifier Comes Back

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`2026-08-29-external-identifier-roundtrip-design.md`](2026-08-29-external-identifier-roundtrip-design.md). Read it before T01 — it holds the carrier table, the two uncovered cells, and why the carrier is an existing block rather than a new record.

**Tech Stack:** TypeScript, Vitest, node-sqlite3-wasm, SQLite.

## User goal

An identifier the importer read out of someone's file comes back out when they export,
whatever kind of thing it was attached to and whatever program wrote it. A researcher who
imports four ArkivDigital exports, works for a year, and exports again still has every archive
pointer the original files carried. A researcher whose file came from Gramps keeps the Gramps
handles even though this app has never heard of Gramps handles.

## Scope

Every one of the five `entity_type` values `external_identifiers` accepts, crossed with a
vendor system and an unknown system. `place` splits into four rows because a place reaches the
exported file by four different routes and each route offers a different carrier. Eight rows,
sixteen cells: twelve are covered by this plan, two already worked, and two are declared
uncovered with a reason and a test that says so.

| entity_type | vendor system | unknown system |
|---|---|---|
| `source` | already works (`1 _AID`) | T03 |
| `repository` | T03 | T03 |
| `media` | T04 | T04 |
| `citation` | already works (`_AID` in `SOUR`) | T05 |
| `place`, event's own place | T06 (root-parish fix) | T06 |
| `place`, reachable only through a place-level citation | T-new (`_EXID` on the `_PLAC` record) | T-new |
| `place`, `_ADPL` ancestor only | already works | **uncovered — T09 declares it** |
| `place`, unreachable from any event or citation | **uncovered** | **uncovered — T09 declares it** |

**T-new was found by probe, not by the design.** After cells 1-13 went green, a place carrying
a place-level citation and named by no event was measured: it gets a `0 @Pn@ _PLAC` record with
`NAME`, `_PLAC_ID` and `SOUR`, `emitPlaceSubTags` is never called on it, and both a seeded
`arkivdigital.parish` and a seeded `gramps.handle` were lost. It sits between the two rows
below it — the place *is* exported, unlike the last row, and it has no `_ADPL` slot competing
for it, unlike the row after this one.

### Scope deviations

- **No authoring surface** — no UI, no MCP tool, no `window.api` write path. The user's own
  words: *"data added in the app does not have to reflect these external_identifiers at all."*
- **`src/import/gedcom/normalize.ts` is not edited and no `unmapped_data` table is created.** A
  parallel session owns `docs/unmapped-capture`. The new phases read `EXID` directly, so no
  edit to that file is needed.
- **`person_identifiers` is untouched.** Persons already round-trip via `REFN`/`EXID`.

## Verification

1. **The user goal, made falsifiable.** `tests/unit/external-identifier-roundtrip.test.ts`
   imports a GEDCOM carrying identifiers on all five entity types, exports, re-imports, and
   asserts every `(entity_type, system, value)` triple is present in the second database —
   under **both** 5.5.1 and 7.0.
2. **The whole matrix, not a sample.** The same file enumerates all ten cells. The eight
   covered cells assert survival. The two uncovered cells assert the loss *and* its reason, so
   nothing sits outside the table.
3. **The three vendor pairs still use the vendor tag.** Asserted on the emitted text, not on
   the round-tripped database — a `REFN` would round-trip fine and still break ArkivDigital.
4. **The four real ArkivDigital exports export byte-identically to `main`.** Measured, with
   the diff line count pasted into the task's commit.
5. **`unaccountedFor` stays empty across the fixture corpus.** `npm test` covers this via the
   existing accounting tests, which fail if a new tag is emitted that no phase reads back.
6. **The guard can fail.** T10 reverts one emit site, shows the matrix test red, and restores.

**User-goal-falsifiability check.** If all six pass, can the goal still be unmet? Only for an
entity the export filter deliberately excluded, and item 1 runs unfiltered. Item 2 enumerates
the space rather than sampling it, so no uncovered cell can hide.

## Global Constraints

- `.claude/rules/api.md`: bulk writes go through `runBatch`. Never `db.prepare(...).run(...)` raw.
- `.claude/rules/performance.md`: no per-row DB call inside a loop over a DB-scale array.
  `prefetchExportData` already fetches the whole `external_identifiers` table
  (`src/gedcom/export-prefetch.ts:240`), keyed by `mediaEntityKey(entity_type, entity_id)`.
  **Read from `pre.externalIdsByEntity`. Never add a fetch.** On the import side, accumulate
  rows in an array and flush once through `bulkAddExternalIdentifiers`, matching
  `sources.ts:86`.
- **Prime Directive:** nothing inferred is persisted. An identifier is only ever written from a
  tag that was in the file.
- **Prime Directive (cont.):** the registry entry and the emit site land in the same commit.
- `/export-import/` is gitignored real family data. **Never commit it, never copy it into
  `tests/fixtures/`.** All committed fixtures are synthetic. Reading it for measurement is fine.
- Worktree: `git -C <path>`, `npm --prefix <path>`, **vitest needs `--root <abs-worktree-path>`**.
- Stage **by explicit path**. `git add -A` is blocked by a hook.

---

## Tasks

### T01 (Tier 1): the two tag shapes, as pure functions

Create `src/gedcom/external-id-tags.ts`. Nothing else in this plan emits or parses these tags
by hand.

```ts
import type { ExternalIdentifier, ExternalIdentifierInput } from '../api/external_identifiers';
import type { GedcomNode } from './parser';

/**
 * Systems that already have a vendor-shaped tag. A row whose system is in this
 * set is emitted by its vendor emitter and by nothing else — emitting it twice
 * would put a `REFN` next to a `_AID` in an ArkivDigital file and change what
 * ArkivDigital reads back.
 */
export const VENDOR_CARRIED_SYSTEMS: ReadonlySet<string> = new Set([
  'arkivdigital',          // 1 _AID on the SOUR record
  'arkivdigital.parish',   // _PARISH_AID inside the _ADPL block
  'arkivdigital.image',    // _AID inside the citation's SOUR block
]);

/** A `REFN`/`EXID` with no `TYPE` is this system, and this system emits no `TYPE`. */
export const UNTYPED_SYSTEM = 'refn';

export function generic(idents: readonly ExternalIdentifier[]): ExternalIdentifier[] {
  return idents.filter(i => !VENDOR_CARRIED_SYSTEMS.has(i.system));
}

/**
 * Record-level carrier: `REFN` under 5.5.1, `EXID` under 7.0. Both specifications
 * allow the tag on SOUR, REPO and OBJE records. Matches what `person_identifiers`
 * already emits (exporter.ts:759).
 */
export function emitRecordExternalIds(
  lines: string[],
  idents: readonly ExternalIdentifier[],
  level: number,
  version: '5.5.1' | '7.0',
): void {
  const tag = version === '7.0' ? 'EXID' : 'REFN';
  for (const i of generic(idents)) {
    lines.push(`${level} ${tag} ${i.value}`);
    if (i.system !== UNTYPED_SYSTEM) lines.push(`${level + 1} TYPE ${i.system}`);
  }
}

/**
 * Substructure carrier: `_EXID`. A GEDCOM citation is a SOUR pointer substructure
 * and a PLAC block is a substructure — neither has a REFN slot in either
 * specification, so the tag is custom and identical under both versions.
 */
export function emitSubstructureExternalIds(
  lines: string[],
  idents: readonly ExternalIdentifier[],
  level: number,
): void {
  for (const i of generic(idents)) {
    lines.push(`${level} _EXID ${i.value}`);
    if (i.system !== UNTYPED_SYSTEM) lines.push(`${level + 1} TYPE ${i.system}`);
  }
}

/**
 * Read either shape back. `getChild`/`getChildren` mark nodes consumed, so a tag
 * read here is accounted for and cannot appear in `unaccountedFor`.
 */
export function readExternalIds(
  node: GedcomNode,
  tags: readonly string[],
  entity_type: string,
  entity_id: string,
  getChild: (n: GedcomNode, t: string) => GedcomNode | undefined,
  getChildren: (n: GedcomNode, t: string) => GedcomNode[],
): ExternalIdentifierInput[] {
  const out: ExternalIdentifierInput[] = [];
  for (const tag of tags) {
    for (const n of getChildren(node, tag)) {
      const value = n.value?.trim();
      if (!value) continue;
      const system = getChild(n, 'TYPE')?.value?.trim() || UNTYPED_SYSTEM;
      out.push({ entity_type, entity_id, system, value });
    }
  }
  return out;
}
```

`getChild`/`getChildren` are injected rather than imported so this module stays free of an
import cycle with `src/import/`. Confirm the real signatures in
`src/import/gedcom/node-utils.ts` before writing the calls and match them exactly.

- [ ] Write `src/gedcom/external-id-tags.ts`.
- [ ] Write `tests/unit/external-id-tags.test.ts`: vendor systems are filtered out of both
      emitters, `UNTYPED_SYSTEM` emits no `TYPE`, an untyped `REFN` reads back as `refn`, a
      `TYPE`-carrying `EXID` reads back with that system, `7.0` emits `EXID` and `5.5.1` emits
      `REFN`.
- [ ] `npm test -- external-id-tags` green. Commit.

### T02 (Tier 1): the matrix test, written red

Write the test before the emitters so every later task has a target that can disagree.

Create `tests/unit/external-identifier-roundtrip.test.ts`. It seeds one database per cell, runs
`exportGedcom` then `importGedcom` into a fresh `createTestDb()`, and asserts on
`SELECT entity_type, system, value FROM external_identifiers` in the second database.

Cells and their expectations:

| # | entity_type | system | expect |
|---|---|---|---|
| 1 | `source` | `arkivdigital` | survives, carried by `1 _AID` |
| 2 | `source` | `gramps.handle` | survives, carried by `REFN`/`EXID` |
| 3 | `repository` | `arkivdigital` | survives, carried by `REFN`/`EXID` |
| 4 | `repository` | `riksarkivet.id` | survives, carried by `REFN`/`EXID` |
| 5 | `media` | `arkivdigital.image` | survives, carried by `REFN`/`EXID` |
| 6 | `media` | `gramps.handle` | survives, carried by `REFN`/`EXID` |
| 7 | `citation` | `arkivdigital.image` | survives, carried by `_AID` |
| 8 | `citation` | `gramps.handle` | survives, carried by `_EXID` |
| 9 | `place` on an event, parish **with** a parent | `arkivdigital.parish` | survives, `_PARISH_AID` |
| 10 | `place` on an event, parish with **no** parent | `arkivdigital.parish` | survives, `_PARISH_AID` |
| 11 | `place` on an event | `gramps.handle` | survives, carried by `_EXID` |
| 12 | `place` reachable only as an `_ADPL` ancestor | `gramps.handle` | **expected loss** — cell 1 of the design's uncovered pair |
| 13 | `place` on no event and no citation | any | **expected loss** — cell 2 |

Every surviving cell runs under **both** `'5.5.1'` and `'7.0'`.

Seeding helper — the column names are the ones that actually exist, checked against
`src/api/schema.ts`:

```ts
async function seedPersonEventAtPlace(db: Database, placeId: string): Promise<void> {
  const pid = crypto.randomUUID();
  await runSql(db, 'INSERT INTO persons (id) VALUES (?)', [pid]);
  await runSql(db,
    'INSERT INTO person_names (id, person_id, given_name, surname, sort_order) VALUES (?,?,?,?,0)',
    [crypto.randomUUID(), pid, 'Test', 'Person']);
  const eid = crypto.randomUUID();
  await runSql(db, 'INSERT INTO events (id, event_type, place_id) VALUES (?,?,?)',
    [eid, 'birth', placeId]);
  await runSql(db,
    'INSERT INTO event_participants (id, event_id, person_id, role) VALUES (?,?,?,?)',
    [crypto.randomUUID(), eid, pid, 'primary']);
}
```

`events` has **no** `person_id` column and `person_names` has **`given_name`**, singular, with
no `is_primary`. Both mistakes cost a run during the probe that produced this plan.

The two expected-loss cells assert the row is absent **and** carry a comment naming the design
section that explains why. An expected-loss assertion with no reason is indistinguishable from
a bug someone forgot to fix.

- [ ] Write the test. Cells 1, 7, 9 pass on current `main`. Cells 2–6, 8, 10, 11 fail.
- [ ] Record the exact pass/fail split in the commit message. Commit red, deliberately —
      `git commit` with `[red]` in the subject so the bisect story is readable.

### T03 (Tier 1): SOUR and REPO records carry the generic tag

`src/gedcom/exporter.ts`. The `SOUR` record block already emits the vendor tag at `:418`:

```ts
    for (const ident of pre.externalIdsByEntity.get(mediaEntityKey('source', src.id)) ?? []) {
      if (ident.system === 'arkivdigital') lines.push(`1 _AID ${ident.value}`);
    }
```

Leave that loop exactly as it is and add the generic emitter beneath it:

```ts
    emitRecordExternalIds(lines,
      pre.externalIdsByEntity.get(mediaEntityKey('source', src.id)) ?? [], 1, version);
```

The `REPO` block (`:372`–`:397`) has no identifier emission at all. Add the same call after the
`NOTE` line and before `emitNotesForEntity`, so the record's own fields stay grouped:

```ts
    emitRecordExternalIds(lines,
      pre.externalIdsByEntity.get(mediaEntityKey('repository', repo.id)) ?? [], 1, version);
```

Import side. `src/import/gedcom/phases/sources.ts` already accumulates into `externalIdRows`
(declared at `:42`, flushed at `:86`). Push the generic reads into the same array — do not add
a second flush:

```ts
    externalIdRows.push(...readExternalIds(node, ['REFN', 'EXID'], 'source', id, getChild, getChildren));
```

`src/import/gedcom/phases/repo.ts` has no accumulator. Add one, and flush once after the loop
that creates the repositories. `createRepository` returns the row, so the id is in hand.

- [ ] Exporter: both call sites.
- [ ] Importer: `sources.ts` and `repo.ts`.
- [ ] Matrix cells 2, 3, 4 green under both versions.
- [ ] `npm test` green. Commit.

### T04 (Tier 1): OBJE blocks carry the generic tag

Media has two GEDCOM shapes and both need the tag, because a media row can arrive through
either. **Do not add a top-level `OBJE` record for media that has none** — the design section
"Why the carrier is the existing block" explains that it produces two media rows on re-import,
and that the `_OBJE_ID` dedup the exporter's comment at `:1116` claims exists is a comment and
nothing else.

`emitMediaBlocks` (`:221`) has no `version` parameter. Add one as the last argument and update
all five call sites — `:457`, `:739`, `:845`, `:1009`, `:1025`. Then:

```ts
    if (m.notes) lines.push(`${baseLevel + 1} NOTE ${m.notes}`);
    emitRecordExternalIds(lines,
      pre.externalIdsByEntity.get(mediaEntityKey('media', m.id)) ?? [], baseLevel + 1, version);
```

The top-level `OBJE` record for group-linked media (`:1119`) gets the same call at level 1.

Import side, both shapes:

- `src/import/gedcom/phases/obje.ts` — the loop at `:22` already has `node` and the generated
  `id`. Accumulate and flush once after `bulkCreateMedia`.
- `src/import/gedcom/obje-importer.ts` — `importObjeNode` handles the inline shape. It creates
  one media at a time and returns the id. Read the tags there and write them with
  `bulkAddExternalIdentifiers` for that single row. This is the one per-row write in the plan
  and it is correct: the function is already per-row by construction, and the inline path is
  bounded by media count, not person count. Note it in the commit so the performance reviewer
  does not have to rediscover it.

Watch the early returns in `importObjeNode`: the `@`-pointer branch (`:71`) and the
`inlineMediaMap` cache hit (`:77`) must not write identifiers, or a media linked to twelve
people gets twelve identical write attempts. `INSERT OR IGNORE` would absorb them, but the
writes are still wasted.

- [ ] Exporter: `emitMediaBlocks` signature + five call sites + top-level record.
- [ ] Importer: `obje.ts` and `obje-importer.ts`.
- [ ] Matrix cells 5, 6 green under both versions.
- [ ] `npm test` green. Commit.

### T05 (Tier 1): citations carry the generic tag

`emitCitationBlock` (`:178`) already takes `externalIds` and emits the vendor tag at `:213`.
Add the generic emitter directly after that loop:

```ts
  emitSubstructureExternalIds(lines, externalIds, baseLevel + 1);
```

No signature change and no call-site change — all six call sites already pass
`pre.externalIdsByEntity.get(mediaEntityKey('citation', cit.id)) ?? []`.

Import side, four sites read `_AID` inside a citation's `SOUR` block today:

- `src/import/gedcom/event-importer.ts:394`
- `src/import/gedcom/phases/individuals.ts:385` and `:435`
- `src/import/gedcom/phases/families.ts:181`

Each already builds an `ExternalIdentifierInput` for the image pointer and pushes it into a
buffer flushed once per phase (`individuals.ts:510`, `families.ts:234`). Add the `_EXID` read
beside each `_AID` read and push into the same buffer.

`src/import/gedcom/phases/place-citations.ts:28` is a fifth citation host and reads no `_AID`
at all today. It calls `createCitation` per row (`:37`), so the citation id is in hand. Read
`_EXID` there too and write with `bulkAddExternalIdentifiers` after the loop.

- [ ] Exporter: one line in `emitCitationBlock`.
- [ ] Importer: five citation-host sites.
- [ ] Matrix cell 8 green under both versions. Cell 7 still green — assert the emitted text
      still says `_AID` and not `_EXID`.
- [ ] `npm test` green. Commit.

### T06 (Tier 1): places — the root-parish fix and the leaf carrier

Two changes in `emitPlaceSubTags` (`:125`).

**Drop the parent guard.** Today:

```ts
  if (placeById && externalIdsByEntity && place.parent_place_id) {
    emitAdplBlock(lines, place, subLevel, placeById, externalIdsByEntity);
  }
```

becomes:

```ts
  // `emitAdplBlock` returns early when the typed chain is empty, which is the
  // condition that actually matters. `parent_place_id` was a proxy for it and
  // dropped a root-level parish's `_PARISH_AID` on the floor.
  if (placeById && externalIdsByEntity) {
    emitAdplBlock(lines, place, subLevel, placeById, externalIdsByEntity);
  }
```

**Add the leaf carrier.** After the `MAP` block, emit the leaf place's non-vendor identifiers:

```ts
  emitSubstructureExternalIds(lines,
    externalIdsByEntity?.get(mediaEntityKey('place', place.id)) ?? [], subLevel);
```

`emitPlaceSubTags` currently types `externalIdsByEntity` as
`Map<string, Array<{ system: string; value: string }>>`. `emitSubstructureExternalIds` takes
`ExternalIdentifier[]`. Widen the parameter to `ExternalIdentifier[]` — the prefetch already
supplies that type (`export-prefetch.ts:93`), and the narrower annotation is a leftover.

Import side: `src/import/gedcom/phases/prep-places.ts`. The `_PARISH_AID` path at `:131` is
untouched. Add a read of `_EXID` directly under each `PLAC` node, resolved against the place
that node maps to, and flush with the existing `bulkAddExternalIdentifiers` call at `:133`.

**The un-guard changes exported bytes** for every root-level typed place, identifier or not.
Run the full suite and read the failures rather than assuming there are none. If a fixture
round-trip test moves, decide whether the new output is more correct before touching the
fixture.

- [ ] Exporter: guard removal, leaf carrier, parameter type widened.
- [ ] Importer: `prep-places.ts`.
- [ ] Matrix cells 10, 11 green under both versions. Cell 9 still green.
- [ ] `npm test` green, with any fixture movement explained in the commit. Commit.

### T07 (Tier 1): make the per-field seeder capable of disagreeing

`tests/helpers/gedcom_fidelity.ts:157` hardcodes `entity_type='source', system='arkivdigital'`
— the one pair that always worked. That is why `value: lossless` survived two releases.

Parametrise the pair. The per-field driver keeps calling it with the source pair, and the
matrix test from T02 becomes its second caller with the other nine. The helper must no longer
be able to pass for a pair nobody exercised.

- [ ] `seedExternalIdentifiers(db, col, value, pair?)` with the source pair as the default.
- [ ] `tests/unit/gedcom-fidelity-per-field.test.ts` still green.
- [ ] Commit.

### T08 (Tier 1): narrow the registry reasons to the two uncovered cells

`src/api/gedcom_fidelity_registry.ts:242`–`:273`. The block comment names three emitting pairs
and the reasons say "only source, place and citation rows have an emitting tag". Both are now
false in the direction of pessimism, and `value: lossless` is false in the direction of
optimism.

`entity_type`, `system` and `value` all stay `lossy` — the two uncovered cells are real and
seedable. Rewrite each `reason` to name them:

> a place reachable only as an `_ADPL` ancestor carries one identifier slot, which
> `places_hierarchy.ts` uses for disambiguation, so a second system on such a place has no
> carrier — and a place no event or citation reaches is not exported at all

Rewrite the block comment to describe the carrier table, not the three vendor pairs.

**`value` moving from `lossless` to `lossy` needs an `expectedAfterRoundTrip`.** Check what the
per-field driver does with it for the default source pair, which round-trips fine — the
expectation has to be "the value" for that pair, not `null`. If the driver cannot express
"lossless for the seeded pair, lossy for two named cells", say so in the task report rather
than weakening the test to fit.

- [ ] Three reasons rewritten, block comment rewritten.
- [ ] `tests/unit/gedcom-fidelity-registry-coverage.test.ts` and the per-field test green.
- [ ] Commit.

### T09 (Tier 1): a guard so the uncovered cells cannot silently grow

Uncovered cell 1 is unreachable today because no writer puts a second *hardcoded* system on a
place. That is a fact about today's code, not a property of the design, so it needs a test.

**The premise as first written was already stale.** It said `prep-places.ts:133` is the only
writer of a place identifier. T06 added a second (`_EXID` under a `PLAC` node) and T-new a
third (`_EXID` on a `_PLAC` record), and both read an *arbitrary* system out of the file. The
census therefore states three sites, classified by shape, rather than one system:

| site | shape | which place it attaches to |
|---|---|---|
| `prep-places.ts` | literal `arkivdigital.parish` | any level of a resolved `_ADPL` chain |
| `prep-places.ts` | `readExternalIds ['_EXID']` | the leaf place an event's `PLAC` names |
| `place-citations.ts` | `readExternalIds ['_EXID']` | the place a `_PLAC` record is about |

The two `readExternalIds` sites cannot reach cell 1: both attach to a place that has its own
carrier by construction. Only a hardcoded system can land on an ancestor-only level, and there
is exactly one.

Add to `tests/unit/external-identifier-roundtrip.test.ts`:

Implement the census by reading the source files, not by importing them — a runtime check
cannot see a writer that no fixture exercises. `fs.readdirSync` over **`src/`**, not
`src/import/`: the exporter and the api layer can write one too, and a census scoped to where
the writers happen to live today cannot report a writer that moves. The test must fail if the
regex matches zero files, otherwise it is a query that cannot return zero — the failure this
whole plan is about. Three zero-guards ship with it: a self-check that the regexes match a
known-positive string and decline three known-negative ones, a floor on the number of files
the walk found, and a floor on the number of distinct entity types `readExternalIds` is called
for.

- [ ] Write the guard.
- [ ] Prove it fails: add a throwaway second place system in a scratch edit, watch it go red,
      revert. Paste both outcomes in the commit.
- [ ] Commit.

### T10 (Tier 1): prove the matrix can fail, and diff the real corpus

Two measurements, both pasted into the commit message.

**The guard bites.** Revert one line of T03's exporter change, run
`npm test -- external-identifier-roundtrip`, capture the failure, restore. A matrix that cannot
go red is not a matrix.

**The four real ArkivDigital exports are byte-identical.** They carry 0 root parishes and 0
non-ArkivDigital systems, so the vendor-override rule predicts an empty diff. Export each file
on `main` and on the branch, and diff:

```bash
# From the worktree. /export-import/ is gitignored real family data —
# read it, never copy it into tests/fixtures/, never commit it.
npx tsx scripts/<export-harness>.ts export-import/<file>.ged /tmp/after-<n>.ged
diff /tmp/before-<n>.ged /tmp/after-<n>.ged | wc -l
```

Check whether such a harness script already exists before writing one. A non-empty diff means
the vendor-override rule leaked and T03–T06 need re-reading — it is not a fixture to update.

- [ ] Guard-bites evidence captured.
- [ ] Four diffs, each with its line count. Commit.

### T11 (Tier 1): full verification evidence

Per `.claude/rules/plans.md` "Verification discipline at close-out", assertions are not
evidence. Capture actual output.

- [ ] `npm test` → paste the `N passed (Xs)` summary line.
- [ ] `npm run lint` → 0 errors.
- [ ] `npm run typecheck` → count against the 2461 baseline. Fewer or equal, never more.
      `.claude/rules/build.md` first — a config error makes `vue-tsc` abort and report almost
      nothing, which reads as success.
- [ ] `npm run build` → paste the tail line and exit code.
- [ ] `npm run test:e2e` → 4 Tier 1 projects. The importer is in scope but no panel or modal
      is, so the full tier is not required. If any import-facing e2e moves, run
      `npm run test:e2e:full` and paste that instead.

### T-final (Tier 1): close out

- [ ] Invoke `/close-out`. The skill walks the 6+1 steps, refuses partial, captures evidence.

---

## Self-review checklist

- [ ] Every task produced a commit, and no task bundled more than one user-observable verb.
- [ ] No task took the plan's word for a symbol, signature or line number without opening the
      file. The plan that preceded this one asserted seven symbols that did not exist.
- [ ] The two uncovered cells are asserted as losses with reasons, not omitted.
- [ ] No new per-entity DB fetch inside a DB-scale loop. `pre.externalIdsByEntity` is the only
      export-side source, and import-side writes are buffered and flushed once per phase — with
      the one documented exception in T04.
- [ ] `src/import/gedcom/normalize.ts` is unchanged and no `unmapped_data` table exists.
- [ ] `git diff --stat main` contains no file under `/export-import/` and no new fixture copied
      from it.

## Failure modes / RCA reference

**A test that cannot return zero is not evidence.** `seedExternalIdentifiers` hardcoding the
one working pair let `value: lossless` stand through two releases while the comment beside it
correctly said only three pairs had a tag. Same shape as `ctx.skippedTags` disclosing 143 of
40 436 drops (`CLAUDE.md`, 2026-08-23). T07 and T09 exist because fixing the emitters without
fixing the seeder would leave the next overclaim just as invisible.

**The previous plan in this area asserted seven symbols that did not exist** — `exportGedcom`'s
signature, `getExternalIdentifiersByEntityType`'s return type, a `parent` field on
`GedcomNode`, and four more. They were caught only because the user pushed twice. Every code
block above was written against a file opened during planning, and every one should still be
re-checked against the file before it is typed.
