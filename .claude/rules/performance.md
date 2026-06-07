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
