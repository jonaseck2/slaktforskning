# Website-Preview Performance Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Use the project-local `subagent-handoff` skill for dispatch. Steps use checkbox (`- [x]`) syntax for tracking.

## User goal

When the genealogist opens the website-export preview on a real-sized family database, the iframe should be usable in well under 30 seconds — not "around a minute" as it does today. Quick scope/option tweaks (e.g. flipping the "include living people" toggle) should re-preview within a few seconds, not pause the app long enough that the user wonders if it crashed.

## Scope

The full preview pipeline that runs from clicking "Preview" or changing an export option to seeing the iframe content render:

- `src/renderer/views/WebsiteExportView.vue` — the trigger UI (the debounce + Promise.all that fires `previewFn` + `buildHtmlFn`).
- `src/api/html_site/scope.ts` — the in-scope person-id resolution (ancestors / descendants / spouses / everyone).
- `src/api/html_site/snapshot.ts` — the full snapshot build that pulls every entity table for the in-scope set.
- `src-tauri/src/media.rs` — `website_bake_preview_thumbnails`, the sequential thumbnail bake (first ~24 image media, 400 px JPEG, 5 MB budget).
- `src/shared/preview-html-inject.ts` — the `JSON.stringify` + string-replace injection into the static SPA bundle.
- `src/renderer/views/WebsiteExportView.vue` Blob-URL handling and iframe load.

### Scope deviations

- **The non-preview website-export path** (`html_site/export.ts`, the "Save HTML site to disk" flow) is **in scope only for the bottlenecks shared with the preview** (scope.ts, snapshot.ts). The dedicated full-export-only paths (page rendering, on-disk file writing, full media copy with progress) are out of scope — the user goal is about preview latency, not full-export latency, and the on-disk export has its own progress UI that makes the wait acceptable. Any optimization that lands inside `scope.ts` or `snapshot.ts` naturally improves the full export too — bonus, not the target.
- **Renderer-side gazetteer resolution of unseen places** during the snapshot build is **in scope** only if profiling shows it's a top-3 contributor; otherwise it's not touched. Gazetteer resolution is render-time work elsewhere in the app and the same patterns apply.
- **No change to the static SPA bundle's runtime behaviour inside the iframe.** This plan optimizes the BUILD of the snapshot + the inject, not the rendering inside the iframe. Iframe-internal perf is a separate concern.

## Verification

The plan is done when **all** of the following are demonstrated with output evidence in the close-out commit:

1. **User-observable speed-up (the falsifiability gate):** the BEFORE and AFTER preview wall-clock times are captured against a representative real-ish database (the dev `family.db` if present, or a deterministic seed via the seed_family MCP tool sized to 1000+ persons). The AFTER time is at most 30 seconds for a cold "Everyone" scope preview, AND at most 5 seconds for an incremental option-flip preview after the first build. If the BEFORE was already under 30 seconds (i.e. the user's "kanske en prestandafråga" guess was right and the bottleneck was transient), this plan exits early after Wave 1 with the timing instrumentation as a permanent regression net — no force-fit of optimizations that don't move the number. Document the early-exit decision in the close-out commit.
2. **No data fidelity regression.** The exported snapshot's entity counts (persons, relationships, events, places, media, sources, citations, groups) are bit-identical between BEFORE and AFTER on the same input + same scope. A new `tests/unit/preview-snapshot-stability.test.ts` (added in Wave 1) asserts this by hashing the JSON-serialised snapshot for a deterministic seeded DB. **The Prime Directive applies:** no inferred values must enter the snapshot through any optimization (no "good enough" approximations of living-status, no rounded coordinates).
3. **`npm test`** → `N passed (Xs)` (paste the summary line into the close-out commit).
4. **`npm run build`** → `built in Xs`, exit 0 (paste the tail).
5. **`npm run test:e2e:full`** → `M passed (Ys)` across all 7 projects. The `[website-export]` Tier 1 project is non-negotiable; the snapshot build code is exactly what that project's round-trip tests exercise. The `[reactivity]` ChartView test (known pre-existing environment-flake per the previous plan's close-out) is acceptable as a single failure if it reproduces on `main` against the same machine — capture the reproduction.
6. **`npx vue-tsc --noEmit --ignoreDeprecations 6.0`** completes with no NEW errors in touched files.

The falsifiability test (per `.claude/rules/plans.md` L1): if every gate above passes but the wall-clock measurement in #1 didn't move (or the entity counts in #2 changed), the plan failed even with green tests.

## Failure modes / RCA reference

- **Past failure: bulk-insert batching plan (2026-05-12).** Per-row IPC roundtrips dominated importer wall-clock; the fix was `db_batch_run`. The pattern here is the same shape — `src/api/html_site/scope.ts` fires per-generation traversal queries, one row at a time. Solution path: rusqlite recursive CTE OR bulk parent/child lookups via existing api/-layer bulk variants. **Anti-failure-mode:** do not add new per-row IPC paths "to keep the diff small"; if a bulk variant is needed, it's worth adding.
- **Past failure: panel-composables half-migration (v0.190.0).** Verified-against-tests-only feature shipped half-broken because the test didn't observe the user goal. **Anti-failure-mode here:** the wall-clock measurement IS the user-goal observation. Do not skip Wave 1.
- **Past failure: gazetteer Frankenstein merges (project memory `feedback_no_gazetteer_frankensteins.md`).** Don't combine optimization concerns. Each Wave fixes ONE bottleneck and ships independently — never "while we're in this file, also tweak X".
- **Prime Directive applicability.** This plan optimizes *reads*. The Prime Directive's "no inferred writes" rule does not bind on a read-path optimization. But the secondary directive — that the user sees exactly what they authored — DOES bind: any optimization that loses, rounds, or substitutes an authored value during the snapshot build is a Prime Directive violation. Wave 1's snapshot-stability test is the mechanical guard.

## Tech Stack

- Rust + rusqlite + tauri-plugin-shell (for SQL-side scope + recursive CTE)
- TypeScript Vue 3 (renderer-side timing instrumentation + the WebsiteExportView trigger)
- Rust `image` crate for thumbnails; `rayon` for thumbnail parallelism (already a transitive dep — verify via `cargo tree -p rayon` in Wave 4)
- Vitest for the snapshot-stability unit test
- Playwright for the existing `[website-export]` Tier 1 project that exercises the round-trip

## File Structure

**Modify:**

- `src/renderer/views/WebsiteExportView.vue` — Wave 1 adds opt-in `console.time/console.timeEnd` instrumentation behind a localStorage flag (`slaktforskning-debug-preview-timing`). Wave 5 verifies the instrumented numbers in close-out.
- `src/api/html_site/scope.ts` — Wave 2 replaces the per-generation traversal loops with bulk-fetch-per-frontier or a SQLite recursive CTE.
- `src/api/html_site/snapshot.ts` — Wave 3 pushes the scope filter into SQL for the heaviest tables (events, event_participants, citations, media_links) instead of `SELECT * FROM <table>` + JS filter.
- `src-tauri/src/media.rs` — Wave 4 swaps the sequential thumbnail loop for a rayon parallel iterator (bounded to `num_cpus::get().min(8)`).

**Create:**

- `tests/unit/preview-snapshot-stability.test.ts` — Wave 1 seeds a deterministic DB, builds the snapshot, hashes the JSON-serialised result. Each subsequent wave runs this test after its change; the hash must stay constant.
- (Optional) `src/api/html_site/scope-helpers.ts` if Wave 2's batching helpers don't belong inline in `scope.ts`.

**Leave untouched:**

- `src/static/index.html`, `src/static/main.ts`, anything inside the static SPA bundle. The iframe rendering is out of scope.
- `src/api/html_site/redact.ts`, `redactBundle.ts` — privacy redaction is correctness, not perf.

---

### Task 1: Baseline measurement + snapshot-stability test (TDD foundation)

Goal: lock current behaviour into a regression net, AND capture the BEFORE number that Wave 5 will diff against.

**Files:**
- Modify: `src/renderer/views/WebsiteExportView.vue`
- Create: `tests/unit/preview-snapshot-stability.test.ts`

- [x] **Step 1: Add opt-in timing instrumentation in WebsiteExportView**

Insert in the `<script setup>` block of `src/renderer/views/WebsiteExportView.vue`, before the watch/debounce that fires `previewFn`+`buildHtmlFn`. Add a helper that wraps each preview rebuild:

```ts
const DEBUG_TIMING = (() => {
  try { return localStorage.getItem('slaktforskning-debug-preview-timing') === '1'; }
  catch { return false; }
})();

async function timedPhase<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!DEBUG_TIMING) return fn();
  const start = performance.now();
  try { return await fn(); }
  finally { console.log(`[preview-timing] ${label}: ${(performance.now() - start).toFixed(0)} ms`); }
}
```

Wrap each phase of the preview rebuild — the scope+snapshot build, the thumbnail bake, and the HTML inject — in `timedPhase('phase-name', () => ...)`. Find the existing `Promise.all([previewFn(), buildHtmlFn()])` site; instrument each branch separately.

Verify by setting `localStorage.setItem('slaktforskning-debug-preview-timing', '1')` in the dev app's console, opening WebsiteExportView, and confirming each phase logs.

- [x] **Step 2: Add a snapshot-stability test (TDD foundation for fidelity)**

Create `tests/unit/preview-snapshot-stability.test.ts`. Seed a deterministic DB using `createTestDb()` + the existing seed-family helpers (or hand-build with 50 persons across 3 generations, some events, a couple of relationships, a media link with file_ref, a couple of sources/citations, one group). Build the snapshot via `buildWebsiteSnapshot()` for "everyone" scope. Hash the JSON-serialised snapshot with `crypto.createHash('sha256').update(JSON.stringify(snapshot, Object.keys(snapshot).sort())).digest('hex')`.

Assert the hash equals a hard-coded constant (run once, paste in the value).

The point is **not** the hash value itself — it's that subsequent optimizations don't change the snapshot's content, only its build path. If Wave 2/3 changes the hash, the optimization changed user-observable output, which is a Prime Directive concern.

```ts
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createTestDb, seedSmallFamily } from './helpers';
import { buildWebsiteSnapshot } from '../../src/api/html_site/snapshot';

describe('website preview snapshot stability', () => {
  it('produces a hash-stable snapshot for a deterministic seeded DB', async () => {
    const db = createTestDb();
    seedSmallFamily(db); // ~50 persons across 3 generations
    const snapshot = await buildWebsiteSnapshot(db, { scope: 'everyone' });
    const hash = createHash('sha256')
      .update(JSON.stringify(snapshot, Object.keys(snapshot).sort()))
      .digest('hex');
    // Run once with `console.log(hash)` then paste the result; never regenerate
    // without verifying the snapshot's content didn't change (open with jq).
    expect(hash).toBe('<paste-hash-here-after-first-run>');
  });
});
```

Run the test, capture the hash, paste it in, re-run. Expected: green. The test file is committed with the populated hash.

- [x] **Step 3: Capture BEFORE timing**

With the dev app running (`npm start`), set the debug flag in console, open WebsiteExportView, run a full "Everyone"-scope preview build on the user's family.db. Capture each `[preview-timing] <phase>: NNN ms` log line. Paste the captured numbers into the close-out commit's commit message.

If the BEFORE wall-clock total is already under 30 seconds: **stop the plan**. The user goal is met by the instrumentation as a regression net; later optimizations are speculative. Document the early-exit in the close-out commit.

- [x] **Step 4: Commit**

```bash
git add src/renderer/views/WebsiteExportView.vue tests/unit/preview-snapshot-stability.test.ts
git commit -m "feat(website-export): preview-timing instrumentation + snapshot stability gate"
```

---

### Task 2: Bulk-batch the scope traversal in `scope.ts`

Goal: collapse the per-generation N+1 query pattern into bulk frontier lookups. Saves the largest expected chunk of wall-clock.

**Files:**
- Modify: `src/api/html_site/scope.ts`

- [x] **Step 1: Identify every per-row IPC site**

Read `src/api/html_site/scope.ts` end-to-end. Note every call site that fires inside a `for` / `while` loop over person IDs. Expected hits: `getParents(id)` per frontier-person per generation, `getChildren(id)` per frontier-person per generation, `getSpouses(id)` per in-scope person at the end.

For each, identify whether there's an existing bulk variant in the api/ layer (`src/api/persons.ts`, `src/api/relationships.ts`). The bulk-api plan (2026-05-12) added bulk inserts; reads may or may not have parallels. Check `bulkGet*` / `findManyBy*` / `*ByIds` patterns.

- [x] **Step 2: Write a focused fail-first benchmark**

Append a microbenchmark to `tests/unit/preview-snapshot-stability.test.ts` (same file, same DB seed). Measure scope-resolution wall-clock with `performance.now()` for "everyone" + "focus + 5 ancestors + 3 descendants" against the deterministic seed. Assert `< 500 ms` for a 50-person tree.

If the benchmark passes on current code (50-person seed is too small to hit N+1), enlarge the seed to 500 persons. Iterate until the assertion fails meaningfully (current N+1 code takes >500 ms; target code <100 ms).

- [x] **Step 3: Refactor to bulk-frontier lookups**

For each `for` loop over person IDs that fires `getParents`/`getChildren`/`getSpouses`:

- Replace with a bulk query: `SELECT person1_id, person2_id, subtype FROM relationships WHERE (person1_id IN (?,?,...) OR person2_id IN (?,?,...)) AND type = ?` for the whole frontier.
- Group results by frontier-person-id in JS using a `Map<personId, Relationship[]>`.

Alternative (cleaner long-term but heavier touch): write a SQLite recursive CTE that walks ancestors or descendants in one query. The CTE shape:

```sql
WITH RECURSIVE ancestors(person_id, generation) AS (
  SELECT ?, 0
  UNION ALL
  SELECT pcr.person1_id, a.generation + 1
  FROM ancestors a
  JOIN relationships pcr ON pcr.person2_id = a.person_id AND pcr.type = 'parent-child'
  WHERE a.generation < ?
)
SELECT DISTINCT person_id FROM ancestors;
```

Pick the simpler bulk-frontier approach unless it doesn't bring the benchmark under target.

- [x] **Step 4: Verify the benchmark passes**

Re-run the test. The < 500 ms assertion now passes. Run the snapshot-stability test from Task 1 — must still pass (same hash).

- [x] **Step 5: Commit**

```bash
git add src/api/html_site/scope.ts tests/unit/preview-snapshot-stability.test.ts
git commit -m "perf(website-export): bulk-batch scope traversal (N+1 → frontier queries)"
```

---

### Task 3: SQL-side scope filter in `snapshot.ts`

Goal: stop pulling whole tables across the IPC just to filter in JS. Push the in-scope id set into SQL.

**Files:**
- Modify: `src/api/html_site/snapshot.ts`

- [x] **Step 1: Identify the full-table-scan hot spots**

Read `src/api/html_site/snapshot.ts`. Find every `queryAll(SELECT * FROM <table>)` followed by a `.filter()` in JS. Expected: events, event_participants, citations, media_links, maybe more.

- [x] **Step 2: Push the filter into SQL**

For each, rewrite as:

```ts
const personIds = [...scope.personIdSet];
const events = personIds.length === 0 ? [] : db.queryAll(
  `SELECT * FROM events WHERE id IN (
     SELECT event_id FROM event_participants WHERE person_id IN (${personIds.map(() => '?').join(',')})
   )`,
  personIds
);
```

For very large in-scope sets (the "everyone" case), the `IN (?,?,?,...)` form will exceed SQLite's default `SQLITE_MAX_VARIABLE_NUMBER` (32766 on modern SQLite, 999 on default builds). For >900 IDs, fall back to: insert the scope into a temporary table (`CREATE TEMP TABLE scope_persons(id TEXT PRIMARY KEY)`, bulk-insert via `db_batch_run`, then use `WHERE person_id IN (SELECT id FROM scope_persons)`), drop the temp table at the end.

- [x] **Step 3: Verify snapshot-stability test still passes**

The hash must be unchanged. If it changed: the SQL-side filter is returning a different row set than the JS filter (likely a corner case like NULL handling or sort order). Diff the snapshots, find the difference, fix.

- [x] **Step 4: Commit**

```bash
git add src/api/html_site/snapshot.ts
git commit -m "perf(website-export): push scope filter into SQL for heavy tables"
```

---

### Task 4: Parallelise thumbnail baking in `media.rs`

Goal: turn the sequential JPEG-decode loop into a rayon parallel iterator. Smaller absolute saving than Tasks 2-3 but cheap.

**Files:**
- Modify: `src-tauri/src/media.rs`

- [x] **Step 1: Confirm rayon is available**

```bash
cargo --manifest-path src-tauri/Cargo.toml tree -p rayon 2>&1 | head -5
```

If absent, add `rayon = "1"` to `src-tauri/Cargo.toml` dependencies (or use `std::thread::scope` to avoid a new dep).

- [x] **Step 2: Rewrite the bake loop**

Current shape (rough): `for media_ref in &media_refs { let jpeg = make_thumbnail_jpeg(...); out.push(jpeg); }`.

New shape:

```rust
use rayon::prelude::*;

let results: Vec<Option<ThumbnailData>> = media_refs
    .par_iter()
    .map(|m| make_thumbnail_jpeg(m, max_dim, quality).ok())
    .collect();

// Apply the 5 MB budget AFTER all bakes finish (serial budgeting; the bake
// itself is parallel). Earlier-budget-cutoff was a sequential
// optimization that doesn't translate; with parallelism we just bake them
// all in ~maxWorkers worth of wall-clock time and discard tail entries.
let mut budget_remaining: usize = 5 * 1024 * 1024;
let mut out = Vec::with_capacity(results.len());
for r in results.into_iter().flatten() {
    if r.bytes.len() <= budget_remaining { budget_remaining -= r.bytes.len(); out.push(r); }
    else { break; }
}
```

- [x] **Step 3: Verify it builds**

```bash
cargo --manifest-path src-tauri/Cargo.toml check 2>&1 | tail -10
```

- [x] **Step 4: Verify the e2e website-export test still passes**

```bash
npx playwright test --project=website-export 2>&1 | tail -5
```

- [x] **Step 5: Commit**

```bash
git add src-tauri/src/media.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "perf(media): parallelise preview thumbnail bake via rayon"
```

---

### Task 5: Verification + close-out

- [x] **Step 1: Capture AFTER timing.** Same procedure as Task 1 Step 3 (debug flag, dev app, `npm start`, WebsiteExportView, "Everyone" scope, full build). Paste each phase's `[preview-timing] ...` line.

- [x] **Step 2: BEFORE → AFTER comparison.** Confirm wall-clock total is < 30 s for cold preview AND < 5 s for incremental option-flip. If either target is missed, NOT done — investigate which phase still dominates; consider a follow-up plan.

- [x] **Step 3: Run automated gates.**

```bash
npm test 2>&1 | tail -5                       # all green
npm run build 2>&1 | tail -5                  # exit 0, paste line
npm run test:e2e:full 2>&1 | tail -5          # all 7 projects, ChartView reactivity flake acceptable per prior plan
NODE_OPTIONS="--max-old-space-size=8192" npx vue-tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep "^src/" | grep -E "scope|snapshot|WebsiteExportView" | head
```

- [x] **Step 4: Mark every checkbox `[x]`. Archive plan + version bump (minor — performance feature) + CHANGELOG entry + `docs/plans/archive/PLAN.md` entry. Same shape as the previous plan's close-out.**

- [x] **Step 5: Commit + push to main per the project's direct-merge convention.**
