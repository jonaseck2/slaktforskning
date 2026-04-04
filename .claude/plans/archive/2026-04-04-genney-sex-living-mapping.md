# Fix: Genney SEX encoding and LIVING flag inverted

## Problem
After a fresh Genney import, all persons with male names appeared as female, and every person appeared as deceased regardless of their actual status.

## Root Cause
`src/import/genney/transform.ts` had the SEX and LIVING field mappings backwards:

- **SEX**: Code mapped `SEX === 1 → 'M'` but Genney's actual Derby DB encoding is `0 = male, 1 = female`. This caused every male to import as female and vice versa.
- **LIVING**: Code mapped `LIVING === 1 → living: 1 (alive)` but Genney uses `LIVING = 1` to mean **deceased** (not alive). null/0 means alive. This caused every deceased person to appear alive and every living person to appear deceased.

The original archive documentation for the Genney import feature had these mappings wrong. The bugs were masked because most test fixtures happened to use SEX=1 for "male" in the tests, so both the code and the tests were consistently wrong.

## Fix
`src/import/genney/transform.ts` line 435: changed mapping to `p.SEX === 0 ? 'M' : p.SEX === 1 ? 'F' : 'U'`

`src/import/genney/transform.ts` line 441: changed to `p.LIVING === 1 ? 0 : 1` (LIVING=1 means deceased → living=0)

All Genney test fixtures in `tests/unit/genney.test.ts` updated to use the correct SEX values: male persons use `SEX: 0`, female persons use `SEX: 1`.

## Files Changed
- `src/import/genney/transform.ts` — corrected SEX ternary and LIVING flag inversion
- `tests/unit/genney.test.ts` — updated all male fixtures to `SEX: 0`, female to `SEX: 1`
