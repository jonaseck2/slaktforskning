---
name: performance-profiling
description: Use when diagnosing slow operations, CPU saturation, or hangs in the Tauri app. Covers CPU profiling setup for the renderer (Chromium DevTools / Safari Web Inspector against the system webview), the Rust host binary (cargo flamegraph / samply), cpuprofile + Firefox-Profiler analysis, and the known SQLite bottleneck patterns in this codebase.
---

# Performance Profiling for Släktforskning

## Rule Zero

**Do not guess. Do not change code. Get a profile first.**

CPU profiles tell you exactly which functions consumed the time, with sample counts and call chains. Without one, you are guessing — and the bottleneck is almost never where you expect.

---

## Where bottlenecks live

| Layer | Tooling |
|---|---|
| Renderer (Vue, JS, layout, paint) | Chromium DevTools (Linux/Windows) or Safari Web Inspector (macOS WKWebView) — Performance tab against the running webview |
| Host process (DB, fs, native dialogs) | Rust async commands in `src-tauri/src/` — profile the Rust binary with `cargo flamegraph` or `samply` |
| SQLite | rusqlite (full native) — `EXPLAIN QUERY PLAN` + the slow-pattern catalog below |

The Rust core's `spawn_blocking` keeps SQL off the renderer thread, so renderer-side CPU is almost always Vue/layout/paint; host-side CPU is almost always SQL or `serde_json` serialisation. Profile the two layers independently.

## Step 1: Instrument the Suspect Operation

### Rust host (`src-tauri/src/*.rs`)

Build the app with debug symbols in a release-class profile, then drive it with native sampling profilers. Two options on macOS / Linux:

**`samply` (recommended — Firefox Profiler-compatible flamegraph):**

```bash
cargo install samply
# Build a release-with-debug binary
cd src-tauri && cargo build --release --features tauri/devtools
# Run under samply (replace path with the actual binary)
samply record ./target/release/slaktforskning
# When the operation completes, samply opens https://profiler.firefox.com with the trace loaded.
```

**`cargo flamegraph` (one PNG/SVG, simple):**

```bash
cargo install flamegraph
# macOS needs DTrace permissions; Linux needs perf
cd src-tauri && cargo flamegraph --release --bin slaktforskning
# Outputs flamegraph.svg in the current directory. Open in a browser.
```

For both: rebuild with `[profile.release] debug = true` in `Cargo.toml` if symbols are missing — the default release strip leaves nothing useful in the trace.

What you're looking for in the Rust profile:
- Wide `rusqlite::Statement::execute` / `query_map` frames → SQL bottleneck (use `EXPLAIN QUERY PLAN` to confirm + add an index in `src/api/schema.ts`).
- Wide `serde_json` frames in `db_run` / `db_all` / `db_get` → row payloads are large; consider a more selective `SELECT` from the api/-layer caller.
- Wide `tokio::fs` frames in import paths → bulk file copies; switch to `media_bulk_copy` Rust command (planned, see Cluster M).
- Wide `xcap::Window::capture_image` → screenshot endpoint hot-path; not a normal-app bottleneck (only fires from the dev MCP).

The renderer-side profile (next section) is the same regardless of runtime — Chromium DevTools attached to whichever webview is running the Vue app.

---

## Step 2: Analyze the Profile

**Option A — Chrome DevTools MCP (recommended — no manual steps):**

Use the `chrome-devtools-mcp` plugin tools to profile directly from the running Electron app:

```
1. performance_start_trace()              → start recording
2. Trigger the slow operation (import, quality checks, etc.)
3. performance_stop_trace()               → stop and save trace
4. performance_analyze_insight()          → get analysis of the trace
```

These tools capture V8 CPU profiles, network timing, and rendering metrics. The `performance_analyze_insight` tool provides automated bottleneck identification.

For renderer-side profiling, you can also use:
```
evaluate_script("performance.mark('start')")
// ... trigger operation ...
evaluate_script("performance.mark('end'); performance.measure('op', 'start', 'end').duration")
```

**Option B — Chrome DevTools UI (best flamegraph):**
1. Open Chrome → F12 → Performance tab → click the upload icon (⬆) → load the `.cpuprofile`
2. Look at the flamegraph: wide bars are hot. Narrow bars are fast.

**Option C — Agent analysis (when the file is too large to open):**
Hand the `.cpuprofile` path to an Explore agent with this instruction: "Parse the V8 cpuprofile JSON. Find the top 30 nodes by hitCount. For each hot node walk up the parent chain. Report total samples, top functions by hitCount with functionName/url/lineNumber, and the call chains. Identify the bottleneck."

Key metrics:
- **Total samples** = profile duration × sample rate (1000 Hz)
- **hitCount** on a leaf node = % of total time executing that code
- **High hitCount in WASM frames** = the SQL query itself is the bottleneck
- **High hitCount in JS** = the JS logic is the bottleneck

---

## Step 3: Interpret What You Find

### Pattern: rusqlite execution dominates (80%+ of samples)

The SQL query is slow. Look at the call chain to find which check / api function is calling it. The fix is always one of:

1. **4-way event_participants self-join** → 2-query + JS join (see below)
2. **Correlated NOT EXISTS subquery** → Set membership (see below)
3. **N+1 queries in a loop** → single bulk query + JS grouping

### Pattern: High hitCount in a specific check function

The function name and line number tell you exactly where to look. Read that function, identify which query pattern it uses, apply the appropriate fix.

### Pattern: `read()` syscalls (10–20% of samples)

Normal — this is SQLite doing WAL file I/O. Not actionable.

### Pattern: High hitCount in `getPersonDisplayNames`

The name-resolution query after `checks.runAllChecks()` is slow. Cap the result set before calling it (already done with 500-result cap per notice-severity check code in `checks:runAll` handler).

### Pattern: Renderer freezes during a long DB op

In Tauri this is rare: rusqlite calls go through `spawn_blocking`, so the Rust side never blocks the renderer's tokio executor or the WebView event loop. If you do see a freeze, the suspect is renderer-side JS (a synchronous loop in Vue / a layout-thrash render pass) — profile the renderer with DevTools, not the Rust binary. The classic Electron-era "yield inside the worker loop" fix does not apply here.

---

## Known Slow Patterns in This Codebase

### 1. The 4-Way event_participants Self-Join (the #1 killer)

```sql
-- SLOW: Cartesian product explosion with 20k persons
SELECT e.id, ep.person_id, b.date_value
FROM events e
JOIN event_participants ep ON ep.event_id = e.id
JOIN event_participants epb ON epb.person_id = ep.person_id   -- self-join
JOIN events b ON b.id = epb.event_id AND b.event_type = 'birth'
WHERE e.event_type = 'marriage'
```

**Fix: Two queries + JS join**

```typescript
// Load all events of each type separately — two simple index seeks
const marriages = loadPersonEvents(db, 'marriage', ['exact', 'calculated']);
const births    = loadPersonEvents(db, 'birth',    ['exact', 'calculated']);

// Join in JS — O(n) with Map lookup
for (const [personId, personMarriages] of marriages) {
  const personBirths = births.get(personId);
  if (!personBirths) continue;
  for (const m of personMarriages) {
    for (const b of personBirths) {
      // compare dates here
    }
  }
}
```

The `loadPersonEvents` helper already exists in `src/api/checks.ts`:

```typescript
function loadPersonEvents(
  db: Database,
  eventType: string,
  dateTypes: string[] = ['exact', 'calculated'],
): Map<string, Array<{ event_id: string; date_value: string }>>
```

### 2. Correlated NOT EXISTS per Person

```sql
-- SLOW: one subquery per row → O(n) queries
SELECT id FROM persons p
WHERE NOT EXISTS (
  SELECT 1 FROM event_participants ep
  JOIN events e ON e.id = ep.event_id
  WHERE ep.person_id = p.id AND e.event_type = 'birth'
)
```

**Fix: Set membership**

```typescript
// One query to get all person_ids that HAVE the event
const withBirth = personIdsWithEvent(db, 'birth');

// Filter in JS
const allPersons = queryAll<{ id: string }>(db, 'SELECT id FROM persons');
for (const p of allPersons) {
  if (!withBirth.has(p.id)) { /* flag it */ }
}
```

The `personIdsWithEvent` helper exists in `src/api/checks.ts`.

### 3. N+1 Queries in a Loop

```typescript
// SLOW: one SQL query per relationship
for (const rel of relationships) {
  const person = queryOne(db, 'SELECT ... FROM persons WHERE id = ?', [rel.person_id]);
}
```

**Fix: Bulk query + JS Map**

```typescript
const allPersons = queryAll<{ id: string }>(db, 'SELECT id, ... FROM persons');
const personMap = new Map(allPersons.map(p => [p.id, p]));
for (const rel of relationships) {
  const person = personMap.get(rel.person_id);
}
```

### 4. Gazetteer Load Fan-Out + Resolver Cache Fragility

Three checks (`checkGazetteerMatchQuality`, `checkPlaceMissingComma`, `checkPlaceNameNoRegion`) each call `loadGazetteersForChecks(db)` independently. That helper deep-clones ~42 MB of bundled gazetteer data (`JSON.parse(JSON.stringify(g))` in `src/api/place-gazetteers/merge.ts`) and merges language translations on every call. Three calls per `runAll` = three full clones.

Worse, the resolver's `getGlobalNameDepth` cache in `src/api/place-gazetteers/resolver.ts` was previously array-identity-keyed. Each fresh clone produced new identities → cache miss → full tree walk to rebuild a depth map across ~27 gazetteers.

**Fix shape (caller-side):** Hoist the load to a closure variable in `getAllCheckFunctions()`:

```typescript
let cachedGazetteers: ReturnType<typeof loadGazetteersForChecks> | null = null;
let cachedGazDb: Database | null = null;
function gazetteersFor(db: Database) {
  if (cachedGazetteers && cachedGazDb === db) return cachedGazetteers;
  cachedGazetteers = loadGazetteersForChecks(db);
  cachedGazDb = db;
  return cachedGazetteers;
}
// Then all three checks call gazetteersFor(db) instead of loadGazetteersForChecks(db) directly.
```

**Fix shape (resolver-side):** Two-tier WeakMap, NOT array-identity. Per-root `WeakMap<GazetteerNode, Map<string, number>>` so the heavy walk runs once per root identity even if the surrounding array changes. The depth-map values are `normalizeUniversal`-keyed (language-agnostic), so root-keying is safe regardless of the gazetteer's per-locale normalize rules. The OTHER cache (`nameIndexCache`) does need full-`Gazetteer` keying because it uses `normalizeForGazetteer`.

When changing the resolver's caching, lock the new behavior in with the tests already in `tests/unit/checks-perf.test.ts`:
1. Spy on `getImportedGazetteers` from `gazetteersApi`; assert ≤1 call per `runAllChecks` (catches re-introducing fan-out).
2. Wrap a synthetic gazetteer's `children` accessors with a Proxy counter; first `resolvePlace` builds (high count), second on the same root or in a different array hits the cache (low count).

---

## Indexes That Matter

The schema already has these covering the common check queries:

```sql
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_type_datetype ON events(event_type, date_type);
CREATE INDEX idx_event_participants_event_id ON event_participants(event_id);
CREATE INDEX idx_event_participants_person_id ON event_participants(person_id);
```

If a new query filters on a column not listed here, add the index in `src/api/schema.ts` (inside the final `db.exec(...)` block, using `CREATE INDEX IF NOT EXISTS`).

---

## Per-Check Timing (Debug Mode)

`runAllCheckFunctions` in `src/api/checks.ts` already logs per-check timing to stdout:

```
[checks] checkBirthAfterDeath: 80ms → 2 result(s)
[checks] checkMarriageAge: 12000ms → 45 result(s)   ← slow
```

Use these to narrow down which check to profile before capturing a full CPU profile.

---

## Profiling Checklist

When a user reports CPU saturation or slowness:

1. [ ] Check per-check timing logs first (`[checks] checkX: Nms → M result(s)`) — identify the slow check by name
2. [ ] Decide host vs renderer. If wall-clock dominates a Rust command (DB / fs / import), profile the Rust binary with `samply record`. If the UI is sluggish without a corresponding host-side cost, profile the renderer with DevTools (Chromium on Linux/Windows, Safari Web Inspector on macOS).
3. [ ] Trigger the operation with the actual large dataset
4. [ ] Collect the profile (samply opens Firefox Profiler automatically; `.cpuprofile` exports from DevTools)
5. [ ] Analyze: widest frames → identify bottleneck function + line number
6. [ ] Read that function in the source; identify the slow query pattern
7. [ ] Apply the appropriate fix (4-way JOIN → 2-query+JS, NOT EXISTS → Set, N+1 → bulk)
8. [ ] `npm test` — all tests must pass before declaring done
9. [ ] Re-run to verify the hot function is gone from the profile

---

## Baseline Storage Convention

Before-and-after CPU profiles for any refactor with a perf claim live at
`docs/baseline-perf/YYYY-MM-DD/`. Each dated directory contains:

- `<workload>-rust.json` — samply Rust-side profile (gecko-profile JSON)
- `<workload>-rust.syms.json` — symbol sidecar (auto-discovered by `samply load`)
- `<workload>-renderer.cpuprofile` — Chromium DevTools / Safari Web Inspector trace (when GUI-driven)
- `summary.md` — wall-clock + top-3 self-time per workload + observation paragraph

The first such baseline lives at [`docs/baseline-perf/2026-05-14/`](../../../docs/baseline-perf/2026-05-14/summary.md)
(boot + place-resolve + dedup, Rust-side only). View any profile interactively:

```
samply load docs/baseline-perf/2026-05-14/<workload>-rust.json
```

When closing out a perf refactor that claims to speed up workload X:
1. Capture an after-trace into `docs/baseline-perf/<after-date>/` using the same
   capture command listed in the prior `summary.md`.
2. Compare wall-clock + top-3 self-time deltas in the close-out commit message.
3. The plan's Verification section must name the specific row(s) it expects to move.

Renderer-side capture on macOS Tauri requires Safari Web Inspector (WKWebView; no
Chromium DevTools). On Linux/Windows, the renderer is a Chromium-family webview
and the standard `.cpuprofile` workflow applies.
