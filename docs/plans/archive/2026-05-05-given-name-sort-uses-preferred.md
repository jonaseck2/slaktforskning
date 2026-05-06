# Implementation: Person list "Förnamn" sort respects preferred name

**Date:** 2026-05-05
**Branch strategy:** main (api change + small renderer wiring)
**Source:** Beta tester report 60 (v0.215.2)

## User goal

Click "Förnamn" in the person list and see rows sorted by the **displayed** first name — which is the preferred name (tilltalsnamn) when one is marked, or the first token of `given_name` when not. Today the sort is strictly the first token of `given_name`, ignoring tilltalsnamn — so a person whose full name is "Johan Erik" with "Erik" marked as tilltalsnamn sorts under J, not E. The user reads the row as "Erik". The sort should match what they read.

The user's words (translated): *"When I click 'Förnamn', the sorting should follow the tilltalsnamn if one is marked. Today the sort is strictly by the first name in the field."*

## Scope

The bug lives in one SQL query and is consumed by one renderer:

- `src/api/persons.ts` line 481 `listPersonsPage()` — the `given_name` ORDER BY clause is `pn.given_name ${dir}, pn.surname ${dir}`. It must instead order by `COALESCE(pn.preferred_name, pn.given_name)` (with normalization for collation).
- `src/renderer/views/PersonsListTab.vue` — consumer; no change needed if the API switch is transparent (same `sortBy = 'given_name'` value, different ORDER BY).

Other places that sort by given name:
- `listPersons()` line 143: `ORDER BY pn.surname, pn.given_name` — the relevance/full list path. Less commonly user-facing as a sort knob; audit during impl. Switch to the preferred-name expression if user-facing.
- Any chart / report that renders a given-name-sorted list — audit.

### Scope deviations

- Surname sort behavior: unchanged (no preferred-name analog for surname).
- Birth-date sort: unchanged.
- Search/filter (token match): already searches `given_name`, `surname`, `preferred_name`, and `nickname` per `persons.ts` line 200. Not in scope here — search ≠ sort.

## Design summary

### The order key

For each row, the **sort key** for `given_name` mode is:

```
COALESCE(NULLIF(TRIM(pn.preferred_name), ''), pn.given_name)
```

Same TRIM/NULLIF as the existing patterns. This matches `getDisplayGivenName()` in `persons.ts` line 131 (the function the renderer uses to format the cell), so sort key = display key.

For collation, SQLite's default `BINARY` collation ranks å/ä/ö after z incorrectly. The schema defines `NOCASE` collation on relevant columns. Confirm during impl which collation `pn.preferred_name` and `pn.given_name` carry; align so that the sort respects locale ordering for å/ä/ö. If SQLite collation can't deliver locale-correct Swedish ordering (it can't natively), accept the existing imperfect behavior — sort matches display, even if Swedish-letter ordering is approximate. (A full ICU-collation effort is out of scope and a separate problem affecting all sort modes.)

### Tiebreak

Surname asc/desc as a secondary key (matches today). Then `id` for total order.

## Tasks

- [x] **Edit `listPersonsPage()`** — `given_name` ORDER BY now `COALESCE(NULLIF(TRIM(pn.preferred_name), ''), pn.given_name) ${dir}, pn.surname ${dir}`.
- [x] **Edit `listPersons()`** — left alone; it's an internal list used by other api functions, not a user-facing sort knob.
- [x] **Unit test** in `tests/unit/persons.test.ts` covers all three fixture cases plus an empty-preferred-name edge case.
- [x] **Component smoke**: deferred to user (sort behaviour is mechanically asserted by the unit test; same-expression-as-display invariant verified).
- [x] **Patch bump** to v0.215.4 + CHANGELOG entry.

## Verification (user-observable)

1. Have a person whose full given_name is "Johan Erik" with "Erik" marked as tilltalsnamn, and another person named "Anna" (no tilltalsnamn).
2. Open Persons list, click Förnamn ▲.
3. The row showing "Erik" appears under E, not J. Order: Anna (A) → Erik (E).
4. Click Förnamn again to flip to ▼. Reverse order: Erik → Anna.

## Failure modes / RCA reference

- **Display key drift.** If `getDisplayGivenName()` (renderer) and the SQL sort key diverge, the user sees a row out of order. Both must use the same expression: prefer non-empty preferred, fall back to given. Catch with a unit test that asserts the sort produces visually-monotonic display strings.
- **Collation surprise.** Adding `COLLATE NOCASE` on the new expression may change tiebreak behavior for case-different inputs. Confirm test fixtures cover both ASCII and Swedish letters.
- **Pagination boundary.** `LIMIT/OFFSET` must apply *after* the new ORDER BY — test asserts that paging through all rows produces a sorted concatenation, not a permutation. (This is automatic if ORDER BY is in the same query, but worth a smoke test if a refactor touches the paging boundary.)
