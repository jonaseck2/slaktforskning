# Fix: Genney import — address fields not stored on places

## Problem
When Genney's SPLACE table has address columns (STREET, POSTALCODE, CITY, COUNTRY),
the importer silently ignored them. The fields fell through to `[key: string]: unknown`
in the `SPlaceRow` interface and were never written to the database.

The `insertPlace` prepared statement also omitted the address columns (`street`,
`postal_code`, `city`, `country`), so even if they had been extracted they could not
have been persisted.

## Root Cause
`SPlaceRow` only declared the columns that were verified against a real Genney backup
at the time the importer was written (NAME, PARENT, LATITUD, LONGITUD, NOTE, TYPE).
By analogy with the REPO table (which has ADDRESS, CITY, POSTALCODE, STATE, COUNTRY),
the SPLACE table is expected to have similar address columns in some Genney databases.

The `insertPlace` SQL in `transformGenney` only included 8 columns:
```sql
INSERT INTO places (id, name, normalized_name, place_type, parent_place_id,
                   latitude, longitude, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

## Fix
- Added `STREET`, `POSTALCODE`, `CITY`, `COUNTRY` optional columns to `SPlaceRow`
- Updated `insertPlace` to include `street`, `postal_code`, `city`, `country` (12 params)
- `importSplace` now passes `sp.STREET ?? null`, `sp.POSTALCODE ?? null`,
  `sp.CITY ?? null`, `sp.COUNTRY ?? null`
- If a Genney database does not have those columns, all values are `undefined` and
  `?? null` keeps the existing behavior unchanged

## Files Changed
- `src/import/genney/transform.ts` — SPlaceRow interface + insertPlace SQL + run call
- `tests/unit/genney.test.ts` — two new tests: address fields imported, null when absent