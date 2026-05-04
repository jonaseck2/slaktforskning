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

2. **[2026-05-04] Removing an import while the symbol is still used = runtime ReferenceError, not a lint error**
   `npm run lint -- --quiet` only shows errors. An identifier with no matching import (because you removed the import line in a refactor) is a TypeScript / runtime error, not a lint warning. Before claiming "lint clean" after removing an import, `grep -rn "<symbol>\b" src/` to verify no call sites remain. v0.210.7 shipped `is_missing: !file || !existsSync(file)` with no `existsSync` import for four versions before someone tried a Holger import. If a refactor removes imports, run `npx tsc --noEmit | grep "^src/"` (errors-only) before commit.

3. **[2026-05-04] Don't bundle unrelated fixes into one commit, even when they share a symptom**
   "Holger import broken" had two independent root causes — a ReferenceError and a path-mismatch. Bundling them blocks the small risk-free fix on validation of the bigger one, and pollutes the commit's blast-radius diagnosis. Ship the obvious-and-tested fix first; queue the speculative one separately. CHANGELOG entries for unverified fixes are also premature — write them after the user confirms.

## Performance & Symptoms

1. **[2026-04-30] Empty UI right after import = worker thread blocked by checks, not missing data**
   Symptom: Media/Persons/Tree show empty states; last log is `[worker/checks] runAll #N: Nms → M raw`. The renderer's `media:listPage`, `persons:list`, `db:getSetting('default_person_id')` IPCs are queued behind running checks on the same worker thread. Don't go hunting for data corruption — `sqlite3 export-import/<file>.db "SELECT COUNT(*)..."` will show the rows are there. The `setImmediate` between checks doesn't help if individual checks are slow; yields must be inside the hot loops (every ~200 iterations via `await new Promise(r => setImmediate(r))`). The three gazetteer-aware checks (`checkGazetteerMatchQuality`, `checkPlaceMissingComma`, `checkPlaceNameNoRegion`) are the usual offenders. See `/performance-profiling` for the full fix shape and the regression tripwires in `tests/unit/checks-perf.test.ts`.

2. **[2026-04-30] Resolver caches must key on root identity (WeakMap), not array identity**
   In `src/api/place-gazetteers/resolver.ts`, the per-root `perGazetteerNameDepth = WeakMap<GazetteerNode, …>` survives `loadGazetteers` deep-cloning the gazetteer array. An array-identity cache (the `cachedGazRoots` shape introduced by e53c4776 and reverted) misses on every `loadGazetteers` call because the array is fresh each time. Two-tier: per-root WeakMap for the heavy walk + optional per-array WeakMap for the merge step. Don't merge per-gazetteer cache logic with `nameIndexCache` — that one keys on `Gazetteer` correctly because it uses `normalizeForGazetteer` (per-locale rules); the depth-map cache uses `normalizeUniversal` and is locale-agnostic.

3. **[2026-05-04] "PersonsView hangs on a fresh import" usually = avatar storm, not worker crash**
   Symptom: SIGINT shows a wall of `Worker exited with code 1` errors across 6+ different handlers. The worker isn't crashing — it's pinned by sequential per-row `media:readAsDataUrl` calls, and SIGINT just rejects everything in flight. Diagnosis path: which view? Persons-only → AppAvatar fan-out → check that `usePersonProfilePic` → `ensureLoaded` is going through the microtask-batched store dispatcher, that `getPersonProfilePicRefs` is one SQL query (not a JS loop), and that `media:readAsDataUrl` is async (`fsp.readFile`, not `readFileSync`). All three failed in v0.210.7 and were fixed across v0.210.9–v0.210.10. See `.claude/rules/api.md` "Worker-thread sync I/O" + `.claude/rules/renderer.md` "Per-row IPC fan-out".

## Research & Design

1. **[2026-04-10] Mine the user's own data files for real-world patterns**
   Before designing a feature that processes text or data, grep the user's GEDCOM files in `export-import/` for actual examples.

2. **[2026-03-15] Keep it simple — avoid unnecessary complexity**
   Prefer simple solutions. WASM-based SQLite eliminated all native module rebuild complexity.
