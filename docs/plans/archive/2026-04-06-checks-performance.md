# Fix: Quality checks CPU saturation on large GEDCOM imports

## Problem
Running quality checks (`checks:runAll`) after importing a large GEDCOM file (~22k persons, ~8k families) saturated the CPU for minutes. The same behaviour appeared on app restart after a mid-import kill (WAL recovery + checks triggered).

## Root Cause
Six check functions used a 4-way `event_participants` self-join that creates a Cartesian product explosion in WASM SQLite:

```sql
FROM events e
JOIN event_participants ep ON ep.event_id = e.id
JOIN event_participants epb ON epb.person_id = ep.person_id   -- self-join
JOIN events b ON b.id = epb.event_id AND b.event_type = 'birth'
```

With 22k persons this intermediate result set is enormous. The WASM SQLite engine (synchronous, blocking the Node.js event loop) took 90–135 s per check.

A CPU profile (V8 inspector / `.cpuprofile`) confirmed:
- 81.5% of samples in WASM SQLite bytecode execution
- `checkMarriageBeforeBirth` 31%, `checkMarriageAge` 30%, `checkMarriageAfterDeath` 14%
- Three earlier checks (`checkBirthAfterDeath`, `checkLifespan`, `checkDeathWithoutBirth`) were already fixed with the 2-query pattern in a prior session

Additional issues fixed in this session:
- `wrapHandler` was missing `await` — logged `→ OK` before async handlers resolved
- Correlated NOT EXISTS subqueries in several checks → replaced with Set membership
- N+1 queries in `checkSiblingAgeLarge` → single query + JS grouping
- Per-check timing logs added to `runAllCheckFunctions`
- 500-result cap per check code for `notice`-severity results (NO_BIRTH_EVENT etc. return 20k+ on large trees)
- `importInProgress` flag prevents checks from running while a GEDCOM import is in progress

## Fix
Replaced all 4-way self-joins with two `loadPersonEvents()` calls + JS join:

```typescript
const marriages = loadPersonEvents(db, 'marriage', ['exact', 'calculated']);
const births    = loadPersonEvents(db, 'birth',    ['exact', 'calculated']);
for (const [personId, personMarriages] of marriages) {
  const personBirths = births.get(personId);
  if (!personBirths) continue;
  // compare in JS
}
```

The `loadPersonEvents` helper uses two indexed seeks (event_type + date_type composite index) and returns a `Map<person_id, [{event_id, date_value}]>`.

Added V8 CPU profiling infrastructure (`captureProfile` in `src/main/ipc.ts`) wrapping `gedcom:import` and `checks:runAll` — writes `.cpuprofile` to `~/Desktop/` for Chrome DevTools analysis.

## Files Changed
- `src/api/checks.ts` — rewrote `checkMarriageAge`, `checkMarriageAfterDeath`, `checkMarriageBeforeBirth` (and in prior session: `checkBirthAfterDeath`, `checkLifespan`, `checkBurialBeforeDeath`, `checkDeathWithoutBirth`, `checkNoBirthEvent`, `checkNoParents`, `checkNoName`, `checkNotLivingWithoutDeathEvent`, `checkSiblingAgeLarge`, `checkCircularAncestry`, `checkMarriageAge`); added per-check timing logs
- `src/main/ipc.ts` — fixed missing `await` in `wrapHandler`; added `importInProgress` guard; added 500-result cap; added `captureProfile` helper
- `src/api/schema.ts` — added `idx_events_type_datetype` composite index
- `.claude/skills/performance-profiling/SKILL.md` — new skill documenting the profiling workflow and known patterns
