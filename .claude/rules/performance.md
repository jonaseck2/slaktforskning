# Performance Rules for Export / Import Passes

Loads when working on `src/gedcom/`, `src/api/`, `src/import/`, or any code that
iterates over DB-fetched arrays.

## The fundamental rule

**Never scan a large DB-fetched array inside a loop over another large DB-fetched array.**

Every `array.some()`, `array.filter()`, `array.find()`, or `array.includes()` inside
a `for` loop is a candidate violation. Before writing any nested iteration:

1. Ask: "Can I pre-build a `Map` or `Set` from the inner array before the outer loop?"
2. If yes — build the map first (O(N)), then loop with O(1) lookups.
3. If no — document why and get a second opinion.

The rule is absolute for arrays that grow with the genealogy DB (persons,
relationships, events, parent_child rows). It does not apply to small static
lookup tables (event type maps, tag registries — bounded at a few dozen entries).

## Specific patterns that are always wrong

```ts
// ❌ O(persons × couples × parentChildRels) = cubic on large trees
for (const person of persons) {
  for (const couple of couples) {
    const isChild = parentChildRels.some(r => r.person2_id === person.id && ...);
  }
}

// ❌ O(parentChildRels²) — filter inside a loop over the same array
for (const pc of parentChildRels) {
  const siblings = parentChildRels.filter(r => r.person2_id === pc.person2_id);
}

// ❌ O(N²) — array.includes() on an array built inside a loop
for (const item of items) {
  const others = bigArray.filter(...);
  bigArray.some(x => others.includes(x.id)); // includes is O(N) on array
}
```

## Correct pattern

```ts
// ✅ Build indexes first — O(N) total
const childrenByParentId = new Map<string, string[]>();
const parentsByChildId   = new Map<string, string[]>();
for (const r of parentChildRels) {
  if (!r.person1_id || !r.person2_id) continue;
  (childrenByParentId.get(r.person1_id) ?? (() => { const a: string[] = []; childrenByParentId.set(r.person1_id, a); return a; })()).push(r.person2_id);
  (parentsByChildId.get(r.person2_id) ?? (() => { const a: string[] = []; parentsByChildId.set(r.person2_id, a); return a; })()).push(r.person1_id);
}

// ✅ Lookup is O(1) per person — O(persons) total
for (const person of persons) {
  const parents = parentsByChildId.get(person.id) ?? [];
  // work with parents — no inner scan
}
```

## Rule for per-row DB queries in loops

**Never call a per-entity api/ getter inside a loop over a DB-scale array.**

The nested-scan rule above covers in-memory arrays; this covers SQL. Every
`await get*(db, id)` inside a `for` loop over persons / events / sources /
couples is one SQL execution — and under the Tauri db-shim, one IPC
round-trip (~1 ms) per call. A 10k-person export with 6 per-person getters
pays 60k+ round-trips: minutes of wall clock with the CPU idle.

```ts
// ❌ O(persons) IPC round-trips per getter
for (const p of persons) {
  const names = await getPersonNames(db, p.id);
  const idents = await getPersonIdentifiers(db, p.id);
}

// ✅ One bulk query per table, grouped into a Map before the loop
const allNames = await queryAll<PersonName>(db, 'SELECT * FROM person_names ORDER BY sort_order');
const namesByPersonId = groupBy(allNames, n => n.person_id);
for (const p of persons) {
  const names = namesByPersonId.get(p.id) ?? [];
}
```

When the bulk query replaces a per-entity getter, **replicate its ORDER BY
exactly** — a global sort preserves relative order within each group, so the
output stays byte-identical. Reference implementation:
`src/gedcom/export-prefetch.ts` (`prefetchExportData` — one fetch per table,
fourteen per-row getters eliminated from the GEDCOM exporter).

The per-concept GEDCOM emitters (`notes-emitter`, `translations-emitter`,
`coverage-emitter`, `assoc-emitter`) **are now prefetched too** — `ExportPrefetch`
carries notes-by-entity, associations-by-person, name/place translations, and
source coverage, each passed into its emitter (the `emitNegationsForEntity` shape:
optional prefetched param + standalone-fetch fallback). This shipped after a live
profile of a 22 243-person tree showed the export not completing in 3 min at ~0%
CPU — ~150k per-entity round-trips. Any NEW emitter follows the same rule: extend
`ExportPrefetch` with its table, never add a per-entity fetch inside the loop.

**This is now mechanically guarded.** `tests/unit/export-perf.test.ts` seeds a
5 000-person DB, spies on `db.prepare`, and asserts the GEDCOM export issues
`< 200` queries (O(tables), not O(persons)). A reintroduced per-row fetch blows the
budget and fails CI. When you add a new export path or emitter, add its query-count
assertion to that file.

## Responsiveness budget — long async handlers must yield AND report progress

Throughput (it's slow) and responsiveness (it feels dead) are different failures
with different fixes. The `spawn_blocking` architecture keeps SQL off the UI thread,
so a slow export does NOT freeze the renderer — but a multi-second operation with no
feedback reads to the user as a hang. Two obligations on any IPC handler / async
callback that iterates a DB-scale array:

1. **Prefetched, not N+1.** Covered by the per-row-query rule above. This is the
   throughput half.

2. **Progress + yield for anything that can exceed ~1 s.** This is the responsiveness
   half:
   - Thread an optional `onProgress?: (msg: string) => void` and emit at phase
     boundaries + periodically inside the hot loop (every ~500 entities). Match the
     importer's plain-string convention; the renderer fans it out via the
     `export:*Progress` / `import:*Progress` listener registry in
     `src/renderer/tauri-window-api.ts`, and the UI shows a running line.
   - For an unbounded in-process loop (e.g. resolving gazetteers per place), call the
     canonical wall-clock yield primitive `makeYieldBudget(75)` from
     `src/api/checks/checks-location.ts` so other IPCs interleave. Do NOT reimplement
     a yield; do NOT yield by row count (row cost is unpredictable — wall-clock isn't).

**Applies to** `src/gedcom/`, `src/import/`, and `src/api/` — including
`src/api/html_site/` (website export) and `src/api/archive_*` (archive export), all
under the `src/api/` load trigger above. Reference: the GEDCOM/website/archive
exporters all carry `onProgress`; `buildSnapshot`'s gazetteer loop uses
`makeYieldBudget`.

## Rule for DB fetch caching within a pass

**Never fetch the same rows twice in a single export or import pass.**

If a function fetches `getEventsForPerson(db, id)` in the main loop, and a helper
function also fetches `getEventsForPerson(db, id)` for the same entity in the same
pass:

- Pass the already-fetched result as an optional parameter to the helper.
- The helper falls back to its own fetch only when called standalone (tests, etc.).

```ts
// ❌ Double-fetch: main loop fetches, helper re-fetches
const events = await getEventsForPerson(db, p.id);
// ... main loop uses events ...
await emitNegationsForEntity(db, 'person', p.id, ...); // re-fetches internally

// ✅ Pass through
const events = await getEventsForPerson(db, p.id);
// ... main loop uses events ...
await emitNegationsForEntity(db, 'person', p.id, ..., events);
```

## Rule for output accumulation

For exports that produce large text output (GEDCOM, HTML), accumulating millions of
strings in a `string[]` then calling `join('\n')` materialises two copies of the full
output in memory simultaneously. For a 500 MB export that's 1 GB of peak RAM before
the GC can collect the array.

Preferred: stream directly to a `WritableStream` or write to a temp file in chunks.
Acceptable today: the `string[]` + `join` pattern, but keep it in mind when the RAM
profile becomes a user complaint.

## Applying this rule in code review

Before approving any code that touches entity arrays, check:

1. **Grep for nested iterations:** `for ... for`, `for ... some`, `for ... filter`,
   `for ... find`, `for ... includes` on arrays named like `persons`, `couples`,
   `relationships`, `parentChildRels`, `events`, `sources`, `citations`.
2. **Count the loops:** O(N) outer × O(N) inner = O(N²). Two DB-scale arrays means
   you need a Map.
3. **Check pre-computation location:** the Map must be built *before* the hot loop,
   not inside it.

## Why this rule exists

The GEDCOM exporter shipped with O(persons × couples × parentChildRels) FAMC/FAMS
loops that caused 30 GB RAM use and CPU starvation on a moderately large tree.
The fix required pre-building five lookup Maps — work that should have been done
at authoring time. This rule makes the correct pattern the default.
