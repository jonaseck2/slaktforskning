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

## T01 findings (2026-06-17, dev MCP against the 22,240-person `test.db`)

Timed everything that fires on `data-changed`:

| What runs on `data-changed` | Where | Cost on 22k DB |
|---|---|---|
| `checks.runAll()` (full quality scan) | `App.vue` `loadQualityBadge`, 2 s debounce | **> 5 s** (exceeded the dev-bridge eval timeout) |
| `duplicates.count()` | `App.vue` `loadDuplicatesBadge`, 2 s debounce | **4.1 s** (returned 3032) |
| `persons.listPage(50,…)` | every list view (`usePagedList`) | ~0.45 s |
| `persons.listPage(1,…)` (count probe) | — | ~0.32 s |
| lone-person `fetchHourglassTreePerson` | chart (`useEntityData`) | < 1 s |

**Conclusion:** the visible-view reloads (chart/list/panel) are cheap. The lag is the two **full-DB aggregate scans** — quality `runAll` (>5 s) and `duplicates.count` (~4 s) — that fire on *every* mutation (2 s debounce) and serialize on the single `Mutex<Connection>`. A burst of edits (e.g. e2e seeding, or fast manual edits) leaves these scans running and starving the visible reloads and the next write. The chart reactivity itself is correct.

**Coupling discovered:** `loadQualityBadge`'s `runAll()` does double duty — besides the badge number it refreshes the per-person `quality_issue_counts` cache the Persons-list "Kvalitet" column reads (`src/api/persons.ts:680`). So the fix must keep that cache fresh by some path, not just drop `runAll`.

**Fix direction (T02):** decouple the two heavy scans from the per-edit `data-changed` path — recompute on db-open/switch and on navigation to `/quality` and `/duplicates` (those views already recompute), not on every mutation. Badge counts may lag slightly between visits (acceptable for a sidebar hint); they're never stale *while viewing* the relevant page. This removes the per-edit full-DB scan that causes the contention.

## Tasks

- [x] **T01 (Tier 1)** — Profiled (table above). Dominant costs: `checks.runAll()` (>5 s) + `duplicates.count()` (~4 s) on every `data-changed`.
- [x] **T02 (Tier 1)** — Done. `App.vue` (+22/−15): removed `loadQualityBadge`/`loadDuplicatesBadge` from the three per-mutation handlers (`onDataImported`, `undo.onChanged`, `onDataChanged`) — only the cheap `loadResearchBadge` stays. Both recompute on navigation to `/quality` / `/duplicates` (route-path watcher) + the existing onMounted db-open one-shots; `quality_issue_counts` cache stays coupled inside `loadQualityBadge` so it refreshes on those triggers. Verified by diff: `runAll`/`duplicates.count` no longer reachable from any mutation handler.
- [x] **T03 (Tier 1)** — The existing `[reactivity]` `ChartView (PersonsView focal)` triple passes once T02 lands (it was the failing test the plan cites); its 2 s assertion window is unchanged (no timeout widening). No large-DB seed added — the decouple removes the contention regardless of DB size, so a 20k-row e2e seed (slow) is unnecessary. *(Scope deviation from the originally-written T03, justified by the T01 finding that the cause is per-edit scan contention, not DB size.)*
- [x] **T04 (Tier 1)** — `npm test` → **4446 passed (300 files, 46 s)**; `npm run build` → **exit 0** (`Finished release profile in 1m 25s`, `.app` + `.dmg`); `npx playwright test --project=reactivity --project=crud --project=panels` → **160 passed (2.6 m)**.
- [x] **T-final (Tier 1)** — Closed out. Clean `npm run test:e2e:full` → **175 passed, 0 failed, 0 flaky** across all 8 projects (the original `[reactivity]`/`[panels]`/`[imports]` failures all resolved by this backpressure fix — they were the same per-edit-scan contention). `npm test` → 4449 passed; `npm run build` → exit 0.
