# Instant updates on large databases

## 1. User goal

When the researcher edits anything — a name, a date, a place — every open view (the list, the side panel, the chart/map/timeline) reflects the change within a moment, **even on a lifetime-scale database with tens of thousands of people**. No multi-second lag, and no view that stays stale until they navigate away and back.

Today, on a ~22,000-person database, editing a person's name takes up to ~5 seconds to appear in the family-tree chart. On a small database it's instant. The work is correct (the change *does* eventually show) but the latency on real-sized archives is the bug.

## 2. Scope

The cause is structural, not a single component: every mutation fires one `data-changed` event, and **every** subscribed consumer reloads at once, all serialized on the single SQLite connection (`Mutex<Connection>` in `src-tauri/src/db.rs`). On a large database the sum of those concurrent reloads saturates the connection for seconds, and the chart's own reload queues behind the rest.

Reusable patterns in scope — every instance is a migration target:

- **`src/renderer/composables/useEntityData.ts`** — used by every self-loading panel/section/chart/single-entity view. Auto-subscribes to `onDataChanged` and reloads (150 ms debounce).
- **`src/renderer/composables/usePagedList.ts`** — used by every list view. Same subscription.
- **`src/renderer/tauri-window-api.ts`** — `mutating()` → `fireDataChanged()` fan-out (the broadcast source).
- **`src/renderer/App.vue`** — badge-count recomputation on `data-changed` across all entity types (a candidate dominant cost on large DBs).

**Scope deviations:** none assumed. The fix must apply to the shared composables so *all* consumers benefit; a fix that speeds up only the chart and leaves other views slow on large DBs is rejected (it would just move the lag around).

## 3. Verification

1. **User-observable:** on a seeded large database (≥20k persons), edit a person's name; the family-tree chart, the list, and the side panel all reflect it within ~1 s without a view-switch.
2. **The check that proves it:** the `[reactivity]` e2e project passes, and a new timing assertion (or an extended one) on a large seeded DB asserts the chart reflects a rename within a bounded window that is comfortably under the current ~5 s. Tests must observe the user-observable refresh, not internal structure.
3. **No regression on small DBs:** existing `[reactivity]` triples still pass.

**User-goal-falsifiability check:** if every verification passes, can the goal still be unmet? Only if the large-DB timing assertion is too loose — so it must be set from the profiled, fixed latency, not an arbitrary ceiling.

## 4. Failure modes / RCA reference

This is the IPC-backpressure issue documented in `.claude/skills/slaktforskning-mcp-dev/SKILL.md` ("IPC has no client-side backpressure — bursts serialize on one DB mutex"), surfaced while investigating the `[reactivity]` e2e failure on 2026-06-17. The chart reactivity itself was proven correct via dev MCP (rename → chart updates, just slowly). Do **not** "fix" this by widening the e2e timeout — that masks the latency the user goal targets.

## Tasks

- [ ] **T01 (Tier 1)** — Profile one `data-changed` cycle on a ≥20k-person DB (per the `performance-profiling` skill): time each consumer's reload and the `App.vue` badge recompute, identify the dominant cost(s). Capture a cpuprofile / timing table as evidence. Output: a short findings note committed under `docs/plans/` notes, naming the dominant cost(s). *(This replaces the guessing — the fix in T02+ is chosen from this evidence.)*
- [ ] **T02 (Tier 1)** — Based on T01, apply the highest-leverage fix in the shared composables. Candidate levers (pick per evidence, don't apply blindly): coalesce the fan-out so consumers don't all reload redundantly; a renderer-side concurrency cap on DB `invoke`s so the visible view isn't starved; cancel superseded reloads (generation guard already in `useEntityData`); make any profiled-expensive aggregate (badge counts) incremental or deferred.
- [ ] **T03 (Tier 1)** — Add/extend the `[reactivity]` e2e assertion on a large seeded DB (Verification §2). Seed via the existing fixture helpers; assert the chart reflects a rename within the profiled-and-fixed window.
- [ ] **T04 (Tier 1)** — Run `npm test`, `npm run build`, and `npx playwright test --project=reactivity` (plus `[crud]`/`[panels]` for regression); capture output.
- [ ] **T-final (Tier 1)** — Invoke `/close-out` skill.
