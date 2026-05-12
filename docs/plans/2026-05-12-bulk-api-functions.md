# Bulk api/ CRUD functions for the GEDCOM / Holger / RootsMagic hot paths

## User goal

When I import a 1.5 GB Holger or RootsMagic database, the GEDCOM-parse + insert phase finishes in roughly the time it took under Electron — minutes, not the 30+ minute wait the current Tauri build still has after the bulk-batching plan landed. The progress indicator advances visibly throughout. The combined `consolidateMediaFolder` (already fast) + GEDCOM-insert phase (this plan) puts a real-world Holger import end-to-end at ~5 minutes on my reference machine, not "go make coffee, come back, still going."

After this plan ships, every importer's hot loop writes through batched api/ functions; per-row IPC for bulk inserts is gone everywhere.

## Scope

The `bulk-insert-batching` plan (archived 2026-05-12) batched the importers that wrote through raw `stmt.run(…)` (Genney, Gramps, `consolidateMediaFolder`). The remaining importer hot paths write through the api/ CRUD layer (`createPerson`, `addPersonName`, `createEvent`, `createCitation`, `addPersonIdentifier`, `addEventParticipant`, `createRelationship`, `createSource`, `createMedia`, `addMediaLink`, `createRepository`, `createGroup`, `findOrCreatePlace`) — those calls each do one or more IPC roundtrips because the api/ functions themselves are one-row-per-call.

### api/ functions that need bulk variants

Audited 2026-05-12 against the importer per-row callsites in `src/import/gedcom/phases.ts` (38 hits) + `src/import/gedcom/event-importer.ts` (3 hits) + `src/import/rootsmagic/transform.ts` (13 hits). The full set of singular functions to grow bulk siblings:

**`src/api/persons.ts`**
- `createPerson` → `bulkCreatePersons(db, rows[]): Promise<Person[]>`
- `addPersonName` → `bulkAddPersonNames(db, rows[]): Promise<PersonName[]>`
- `addPersonIdentifier` → `bulkAddPersonIdentifiers(db, rows[]): Promise<PersonIdentifier[]>`

**`src/api/relationships.ts`**
- `createRelationship` → `bulkCreateRelationships(db, rows[]): Promise<Relationship[]>`
- `addEventParticipant` → `bulkAddEventParticipants(db, rows[]): Promise<EventParticipant[]>`

**`src/api/events.ts`**
- `createEvent` → `bulkCreateEvents(db, rows[]): Promise<GenealogyEvent[]>`

**`src/api/sources.ts`**
- `createSource` → `bulkCreateSources(db, rows[]): Promise<Source[]>`
- `createCitation` → `bulkCreateCitations(db, rows[]): Promise<Citation[]>`

**`src/api/media.ts`**
- `createMedia` → `bulkCreateMedia(db, rows[]): Promise<Media[]>`
- `addMediaLink` → `bulkAddMediaLinks(db, rows[]): Promise<MediaLink[]>`

**`src/api/groups.ts`**
- `createGroup` → `bulkCreateGroups(db, rows[]): Promise<Group[]>`
- `addGroupLink` → `bulkAddGroupLinks(db, rows[]): Promise<GroupLink[]>`

**`src/api/repositories.ts`**
- `createRepository` → `bulkCreateRepositories(db, rows[]): Promise<Repository[]>`

**`src/api/research_tasks.ts`**
- `createResearchTask` → `bulkCreateResearchTasks(db, rows[]): Promise<ResearchTask[]>`
- `addTaskLink` → `bulkAddTaskLinks(db, rows[]): Promise<TaskLink[]>`

### Importer files to migrate

- **`src/import/gedcom/phases.ts`** — every per-INDI / per-FAM / per-OBJE / per-REPO / per-SOUR / per-GROUP loop rewires to a two-pass shape: (1) parse + collect rows into per-table arrays, generating UUIDs in JS at collect-time so downstream loops can reference them; (2) flush each array via `bulk*`.
- **`src/import/gedcom/event-importer.ts`** — `createEvent` + `createCitation` + `addMediaLink` per event becomes per-pass collect + flush. The function probably needs to change from "import one event, return it" to "collect one event into a buffer, return the pre-allocated UUID; flush all events at end of pass".
- **`src/import/rootsmagic/transform.ts`** — full sweep of every `await createX(db, row)` in row-iteration loops.

### Scope deviations

- **Don't migrate `findOrCreatePlace`.** Place creation is interleaved with lookup ("does this normalized name + parent already exist?") — the singular function does a SELECT then optionally an INSERT. Batching this requires reading all places into memory, deduping in JS, and inserting only the new ones. That's a larger refactor and places are a bounded set (hundreds, not millions). The Tauri-port per-row cost on places is real but small. **Document as deviation; defer to a follow-up if profiling shows it dominant.**
- **Don't migrate the singular api/ functions away.** They stay one-row-per-call for the UI path (every modal save, every MCP `add_*` tool call). The bulk variants live alongside as opt-in for callers that have N rows ready. The singular `createPerson` becomes a single-row delegation to `bulkCreatePersons` (or stays its own implementation — measure at execution).
- **Don't change the data the importer writes.** The shape, the validation, the place-resolution, the SUBM matching — all stay identical. Only the SQL emit step changes.
- **Don't add bulk variants for entities the importers don't write in loops.** `db_settings`, `Citation` already covered, etc. are one-shot. Keep the surface minimal.
- **Don't introduce a generic `bulkInsert(table, rows)` helper.** Per-table `bulk*` functions own the SQL string + the column-order contract; a generic helper would push that knowledge to call sites.
- **Don't conflate with adding bulk variants to MCP tools.** MCP tools call the singular api/ functions; they stay per-call for now (one tool invocation = one entity, no batching needed at the MCP surface).

## Verification

User-observable outcome: a 1.5 GB Holger import (`Import → Holger → file.zip`) completes in ~5 minutes on my reference machine, end-to-end (file unzip + GEDCOM parse + insert + media-consolidate + reload). The progress indicator moves visibly throughout — no multi-minute pauses where it looks like the app froze.

### Mechanical checks (the user-goal-falsifiability test)

The plan is **wrong** if every check below passes and the user goal is still unmet. The checks:

1. **`npm test` → 4119+ passed (Xs)**. The bulk-variant additions don't regress.
2. **`tests/unit/import-batching.test.ts` extended.** Add a Holger-shaped fixture (~1000 persons + person_names + person_identifiers + events + event_participants + citations) and assert:
   - Wall-clock < N seconds (set after measuring baseline)
   - `invoke('db_run')` count stays in the small-constant range (only one-shot statements, NOT one per person/event/citation)
   - `invoke('db_batch_run')` covers persons, names, identifiers, events, participants, citations
   - The total DB state matches the singular-function path's output (golden-test: same input via singular path vs bulk path → identical row counts and FK closures).
3. **Singular-function tests stay green.** Every existing `tests/unit/persons.test.ts` / `events.test.ts` / etc. uses singular `createX`; those tests assert correctness of the underlying writes. If singular delegates to bulk, the unit tests catch any column-order drift.
4. **Live verification** (Task 8): I import the actual 1.5 GB Holger DB. Confirms the user goal subjectively. If it doesn't, the synthetic fixture in §2 isn't representative — extend the fixture, don't relax the goal.

### What's NOT verification

- "Bulk variants exist." Existing-but-unused code is the failure mode — it has to be wired into the importers.
- "Vitest is green on the api/ tests." Those test the singular functions; the bulk variants need their own row-shape coverage.
- "`npm run build` succeeds." Irrelevant; this is a runtime perf plan.

## Failure modes / RCA reference

This plan is the explicit follow-up to `docs/plans/archive/2026-05-12-bulk-insert-batching.md`. That plan landed batching for raw `stmt.run` callsites (Genney, Gramps, `consolidateMediaFolder`) but explicitly deferred the api/-layer rewrite as out-of-scope. The deferred work is what this plan covers.

**Three failure modes specific to this layer:**

1. **UUID-ordering / FK ordering bugs.** The singular path naturally serialises: `createPerson` returns `Person { id }`, then `addPersonName(db, person.id, …)` uses that id. The bulk path needs UUIDs *before* the inserts run. Solution: generate UUIDs in JS at collect time (already happens in Genney transform — `crypto.randomUUID()` per row). Each bulk function takes rows that have `id` already set, vs the singular function which generates the id internally. **Test:** every bulk function asserts `id` is on each input row; throws if missing.
2. **Insert-order across tables matters under FK constraints.** `event_participants.event_id` references `events.id`; flushing participants before events fails the FK. The importer phases must flush in topo order: persons → person_names → person_identifiers → sources → repositories → places (deferred — singular) → events → event_participants → citations → media → media_links → groups → group_links → research_tasks → task_links → relationships → relationship_events. Document the order in `phases.ts`'s leading comment AND assert it in the test (the bulk-fixture test asserts the FK closure is intact at the end).
3. **Singular-vs-bulk output drift.** The bulk variant must produce the same DB rows as N successive singular calls would. The defensive shape: singular `createX(db, row)` becomes a one-row delegation to `bulkCreateX(db, [row])`. Then every existing singular-function test exercises the bulk path too. The cost: a singular call now allocates a one-element array. Negligible.

## Tasks

### Task 1: Wire `runBatch` into the bulk variants — entity-by-entity

For each api/ function listed in Scope, add the bulk sibling. Mechanical pattern:

```typescript
// src/api/persons.ts
export async function bulkCreatePersons(
  db: Database,
  rows: Array<{ id?: string; sex: 'M'|'F'|'U'; living: boolean; notes?: string }>,
): Promise<Person[]> {
  if (rows.length === 0) return [];
  const now = new Date().toISOString();
  const params = rows.map(r => {
    const id = r.id ?? randomUUID();
    return [id, r.sex, r.living ? 1 : 0, r.notes ?? '', now, now];
  });
  await runBatch(
    db,
    'INSERT INTO persons (id, sex, living, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    params,
  );
  // Read back to return the typed shape (one query, not N).
  const ids = params.map(p => p[0]);
  return await queryAll<Person>(
    db,
    `SELECT * FROM persons WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
}
```

- [ ] `src/api/persons.ts`: `bulkCreatePersons`, `bulkAddPersonNames`, `bulkAddPersonIdentifiers`.
- [ ] `src/api/relationships.ts`: `bulkCreateRelationships`, `bulkAddEventParticipants`.
- [ ] `src/api/events.ts`: `bulkCreateEvents`.
- [ ] `src/api/sources.ts`: `bulkCreateSources`, `bulkCreateCitations`.
- [ ] `src/api/media.ts`: `bulkCreateMedia`, `bulkAddMediaLinks`.
- [ ] `src/api/groups.ts`: `bulkCreateGroups`, `bulkAddGroupLinks`.
- [ ] `src/api/repositories.ts`: `bulkCreateRepositories`.
- [ ] `src/api/research_tasks.ts`: `bulkCreateResearchTasks`, `bulkAddTaskLinks`.

For each, write a per-function unit test in `tests/unit/<entity>-bulk.test.ts` (or extend the existing entity test) asserting:
- N input rows → N rows in DB with the same column values.
- `id` field auto-populated when omitted; preserved when supplied.
- Empty input array → no DB writes, returns `[]`.
- An input row violating a NOT NULL / FK constraint causes the whole batch to roll back (zero rows committed).

### Task 2: Migrate `src/import/gedcom/phases.ts` to two-pass collect+flush

The current shape: one big `for (const indi of tree.individuals)` loop that creates the person, then per-iteration calls `addPersonName` / `addPersonIdentifier` / `createEvent` / `createCitation` etc.

The target shape:

```typescript
const personRows: PersonRow[] = [];
const nameRows: NameRow[] = [];
const identifierRows: IdentifierRow[] = [];
const eventRows: EventRow[] = [];
const participantRows: ParticipantRow[] = [];
const citationRows: CitationRow[] = [];

for (const indi of tree.individuals) {
  const personId = randomUUID();
  personRows.push({ id: personId, sex: ..., ... });
  for (const name of indi.names) {
    nameRows.push({ id: randomUUID(), person_id: personId, ... });
  }
  for (const refn of indi.identifiers) {
    identifierRows.push({ id: randomUUID(), person_id: personId, ... });
  }
  for (const ev of indi.events) {
    const eventId = randomUUID();
    eventRows.push({ id: eventId, ... });
    participantRows.push({ id: randomUUID(), event_id: eventId, person_id: personId, role: 'primary' });
    for (const cit of ev.citations) {
      citationRows.push({ id: randomUUID(), source_id: ..., event_id: eventId, ... });
    }
  }
}

// Topo-ordered flush:
await bulkCreatePersons(db, personRows);
await bulkAddPersonNames(db, nameRows);
await bulkAddPersonIdentifiers(db, identifierRows);
await bulkCreateEvents(db, eventRows);
await bulkAddEventParticipants(db, participantRows);
await bulkCreateCitations(db, citationRows);
```

- [ ] Walk every per-INDI / per-FAM / per-OBJE / per-REPO / per-SOUR / per-GROUP loop in `phases.ts`. For each, identify the rows it produces and the FK dependencies. Refactor into the collect+flush shape.
- [ ] Document the topo-flush order in a leading comment block. Cite the FK chain.
- [ ] Watch for places where the importer currently does: "create person, then immediately call back to look up the just-created person to set a derived field." That's a sync-loop pattern; it has to become "collect rows; do the lookup post-flush via a SELECT against the now-committed batch."
- [ ] If a phase has stateful dependencies that don't fit the two-pass shape (e.g. SUBM matching that needs all persons committed before matching), keep that phase singular but document why with an inline comment.

### Task 3: Migrate `src/import/gedcom/event-importer.ts`

- [ ] The `importEvent` function probably becomes `collectEvent` returning `{ eventId, citationRows, mediaLinkRows }` for the caller's buffers; or stays returning the typed Event shape but gets called inside Task 2's collect loop.
- [ ] Ensure no caller of the migrated function relies on the row being immediately readable from the DB — the row exists in the JS buffer, not in the DB, until the flush.

### Task 4: Migrate `src/import/rootsmagic/transform.ts`

- [ ] 13 per-row api/ callsites identified in the audit. Same collect+flush refactor.
- [ ] RootsMagic uses similar entity types; it can reuse the same `bulk*` functions added in Task 1.

### Task 5: Extend the perf regression test

- [ ] In `tests/unit/import-batching.test.ts`: add a Holger-shaped GEDCOM fixture (~1000 persons + per-person 2 names + 1-3 identifiers + 5-10 events + 1-2 citations per event). Run it through the GEDCOM importer (the same code path Holger uses) under the Tauri shim + counting `invoke` spy.
- [ ] Assert: wall-clock < threshold (set at execution after measuring baseline), `db_run` count single/double digits (NOT row-proportional), `db_batch_run` covers persons/names/identifiers/events/participants/citations.
- [ ] Golden-test: import the same fixture via singular path AND bulk path; assert resulting DB state is identical (same row counts per table, same FK closure, same column values up to `created_at` / `updated_at` timestamps).
- [ ] If the test reveals a phase that doesn't migrate cleanly (Task 2's escape hatch), the test will surface it via either wall-clock failure or per-row IPC count failure. Document the unmigrated phase in the plan's "Tasks discovered during execution".

### Task 6: Holger live verification + close-out

- [ ] User imports the 1.5 GB Holger DB. Confirms ~5-min wall-clock end-to-end.
- [ ] Update `.claude/rules/api.md` to clarify the bulk-vs-singular contract for new api/ functions added in the future (any importer-facing CRUD function ships with a bulk sibling from day one if there's any chance of N-row use).
- [ ] Bump version (minor — perf). CHANGELOG entry. Move plan to archive. Append archive entry. Remove planned block from `docs/PLAN.md`. Commit.

## Self-review checklist

- [ ] Every bulk variant in Task 1 exists with a unit test.
- [ ] Singular `createX` functions either delegate to `bulkCreateX(db, [row])` OR have a code comment explaining why they keep their own implementation.
- [ ] `phases.ts` has been refactored to collect+flush; FK topo order documented inline.
- [ ] `event-importer.ts` migrated.
- [ ] `rootsmagic/transform.ts` migrated.
- [ ] `tests/unit/import-batching.test.ts` extended with Holger-shaped fixture; wall-clock + IPC call-count assertions; golden-test against singular path.
- [ ] `npm test` → 4119+ passed.
- [ ] User-observable: 1.5 GB Holger import completes in ~5 min on user's reference machine.
- [ ] Plan `git mv` to `docs/plans/archive/`.
- [ ] Minor version bump in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (per the four-manifest sync rule).
- [ ] `## Unreleased` entry in `CHANGELOG.md`.
- [ ] Append archive entry to `docs/plans/archive/PLAN.md`.
- [ ] `.claude/rules/api.md` updated with the singular-vs-bulk contract for future CRUD functions.

## Tasks discovered during execution

(Empty until execution starts.)
