# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- If guidance now lives in a path-scoped rule (`.claude/rules/`) or a skill, REMOVE it from here.
- Max 10 items per category.
- Each item includes date + concrete action.

## Execution & Validation

1. **[2026-04-17] Cannot launch Electron GUI from Claude Code's background shell on macOS**
   Ask the user to launch the app from their terminal. Use `./.devcontainer/verify-cdp.sh` to confirm CDP is active. Never `pkill -f Electron` — it kills the user's app. `setsid` doesn't exist on macOS, so don't try to detach Electron from the terminal either.

## Performance & Symptoms

1. **[2026-04-30] Empty UI right after import = worker thread blocked by checks, not missing data**
   Symptom: Media/Persons/Tree show empty states; last log is `[worker/checks] runAll #N: Nms → M raw`. The renderer's `media:listPage`, `persons:list`, `db:getSetting('default_person_id')` IPCs are queued behind running checks on the same worker thread. Don't go hunting for data corruption — `sqlite3 export-import/<file>.db "SELECT COUNT(*)..."` will show the rows are there. The `setImmediate` between checks doesn't help if individual checks are slow; yields must be inside the hot loops (every ~200 iterations via `await new Promise(r => setImmediate(r))`). The three gazetteer-aware checks (`checkGazetteerMatchQuality`, `checkPlaceMissingComma`, `checkPlaceNameNoRegion`) are the usual offenders. See `/performance-profiling` for the full fix shape and the regression tripwires in `tests/unit/checks-perf.test.ts`.

2. **[2026-04-30] Resolver caches must key on root identity (WeakMap), not array identity**
   In `src/api/place-gazetteers/resolver.ts`, the per-root `perGazetteerNameDepth = WeakMap<GazetteerNode, …>` survives `loadGazetteers` deep-cloning the gazetteer array. An array-identity cache (the `cachedGazRoots` shape introduced by e53c4776 and reverted) misses on every `loadGazetteers` call because the array is fresh each time. Two-tier: per-root WeakMap for the heavy walk + optional per-array WeakMap for the merge step. Don't merge per-gazetteer cache logic with `nameIndexCache` — that one keys on `Gazetteer` correctly because it uses `normalizeForGazetteer` (per-locale rules); the depth-map cache uses `normalizeUniversal` and is locale-agnostic.

## Research & Design

1. **[2026-04-10] Mine the user's own data files for real-world patterns**
   Before designing a feature that processes text or data, grep the user's GEDCOM files in `export-import/` for actual examples.

2. **[2026-03-15] Keep it simple — avoid unnecessary complexity**
   Prefer simple solutions. WASM-based SQLite eliminated all native module rebuild complexity.
