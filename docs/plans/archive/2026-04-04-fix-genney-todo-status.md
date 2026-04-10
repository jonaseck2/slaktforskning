# Fix: Genney import crash on TODO.STATUS integer

## Problem
Importing a Genney backup failed with:
```
TypeError: (todo.STATUS ?? "").toLowerCase is not a function
```
at `transformGenney` when processing research tasks (TODO table).

## Root Cause
`TodoRow.STATUS` was typed as `string | null`, but the Genney SQLite database stores
status as an integer. Calling `.toLowerCase()` on a number throws a TypeError.

## Fix
- Changed `TodoRow.STATUS` type to `string | number | null`
- Wrapped the lookup key with `String(...)` before calling `.toLowerCase()`:
  `String(todo.STATUS ?? '').toLowerCase()`
- Unknown integer values fall back to `'open'` (the existing default)

## Files Changed
- `src/import/genney/transform.ts` — type fix + `String()` coercion
