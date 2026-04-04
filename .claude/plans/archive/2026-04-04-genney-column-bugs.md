# Fix: Genney import — EVENT_PLACE column names and REMARK.NOTE

## Problem
Two columns in the Genney transform were using wrong names, silently dropping data:

1. **Places never imported**: `EVENT_PLACE` was queried as `ep.RID` / `ep.SPLACEID`, but the actual Derby column names are `EVENT` and `PLACE`. Result: `referencedSplaceIds` was always empty → 0 places imported for any Genney backup.

2. **Remarks never merged into person notes**: `REMARK` was read as `r.TEXT`, but the actual column is `NOTE`. Result: all 3 REMARK rows were silently dropped.

## Root Cause
The column names were assumed from intuition, not verified against the actual Derby schema. The column name mismatch was only discoverable by running `DerbyExtractor --list-tables` against a real backup (the discovery tool was added as part of this investigation).

## Fix
- `EventPlaceRow`: `RID` → `EVENT`, `SPLACEID` → `PLACE`
- `RemarkRow`: `TEXT` → `NOTE`
- All usages in `transformGenney` updated to match
- Tests updated to use the real column names

## Files Changed
- `src/import/genney/transform.ts` — fixed interfaces and transform code
- `tests/unit/genney.test.ts` — updated fixtures to use real column names
