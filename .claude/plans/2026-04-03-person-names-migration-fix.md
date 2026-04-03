# Bug Fix: person_names Migration Guard (v0.3.1 columns)

**Date:** 2026-04-03
**Status:** Fixed

## Bug

`SQLite3Error: table person_names has no column named name_prefix` when adding a second name to a person on a pre-existing database.

## Root Cause

Same class as the v0.4.0 places bug: `CREATE TABLE IF NOT EXISTS` is a no-op when the table already exists. Users who created their database before v0.3.1 don't have the four columns added in that release:

- `name_prefix TEXT`
- `name_suffix TEXT`
- `patronymic_base TEXT`
- `name_qualifier TEXT CHECK(...)`

## Fix

Added idempotent migration guards to `initializeSchema()` in `src/api/schema.ts` (same pattern as the places migration):

1. Query `PRAGMA table_info(person_names)` and map to column names
2. For each missing column, run `ALTER TABLE person_names ADD COLUMN ...`
3. Covers all four columns added in v0.3.1

## Files Changed

- `src/api/schema.ts` — added migration block for person_names columns (before the places migration block)

## Testing

Unit tests (`npm test`) cover `addPersonName` with all fields including the new columns. Existing tests pass unchanged since the guard is idempotent on fresh databases.
