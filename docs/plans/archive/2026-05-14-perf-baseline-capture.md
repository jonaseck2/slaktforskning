# Plan — performance baseline capture (existing tools)

**Roadmap reference:** [2026-05-14-audit-followup-roadmap.md](2026-05-14-audit-followup-roadmap.md) §1.2.

This is a single-file plan — small enough that the design and the implementation plan are merged here.

## User goal

Tier 3 refactors (3.1 duplicates, 3.2 chart-layout, 3.4 report_data) reference concrete before-numbers in their Verification sections. I can read each Tier 3 plan's close-out and tell whether the refactor actually moved a needle, instead of trusting "it should be faster now."

## Why now

Tier 3 complexity refactors target files the 2026-05-14 audit *believes* are slow but doesn't have measurements for. Without baseline, the refactors can't pass a falsifiability check — "it should be faster" isn't evidence. [`.claude/rules/plans.md`](../../.claude/rules/plans.md) §"Verification discipline at close-out" requires evidence, not assertion.

CrabNebula DevTools was evaluated and declined (paid tooling; existing two-tool approach is good enough for baseline capture, only loses Tauri-command-timing unification which we accept as a documented gap).

## Scope

Three workloads, baselined under realistic load:

1. **Boot trace** — `npm start`, capture Chromium DevTools Performance recording from `bootLog('about to wait for router.isReady')` (the existing boot log line in [`src/renderer/main.ts:145`](../../src/renderer/main.ts#L145)) until the renderer is idle (no work for ≥2 s). Save the .cpuprofile.
2. **Place-resolve trace** — load a database with ≥1,000 places, navigate to `/places`, scroll to trigger map-pin resolution against the gazetteers. Capture: (a) renderer .cpuprofile via Chromium DevTools, (b) Rust-side flamegraph via `cargo flamegraph -p slaktforskning` (or `samply record` if `cargo flamegraph` has setup issues on macOS).
3. **Dedup trace** — load a database with ≥5,000 persons, invoke `mcp__slaktforskning-dev__find_duplicates` (or `npm test -- duplicates` against a generated stress fixture). Capture: (a) renderer .cpuprofile if the renderer is involved, (b) Rust-side flamegraph.

For each workload, the .cpuprofile and .svg files commit to `docs/baseline-perf/2026-05-14/` alongside a `summary.md` that names:
- Total wall-clock duration of the trace.
- Top 3 functions by self-time on the renderer side.
- Top 3 functions by self-time on the Rust side.
- A one-paragraph observation: what's slow, what's surprising, what to refactor.

### Scope deviations

- **Test database choice.** Use the user's own working database when possible (most realistic). If it doesn't exercise a workload (e.g., < 1,000 places), generate via `mcp__slaktforskning-dev__seed_family` or copy the e2e fixture. Document the choice and row counts in `summary.md`.
- **Tauri command timing gap.** Chromium DevTools shows `invoke()` round-trip latency but not the Rust-side breakdown inside the call. The Rust flamegraph fills part of that gap but isn't synchronized with the renderer trace. Document this limitation in `summary.md`; future plans that need cross-process timing can reconsider CrabNebula.
- **Profile.** Use Release mode for the Rust flamegraph (`cargo flamegraph --release`). Debug mode dominates the trace with non-representative function calls.

## Approach

Existing two-tool approach — Chromium DevTools renderer-side + `cargo flamegraph` (or `samply`) Rust-side. Skip CrabNebula. The unification gap is documented in the summary, not closed.

## Verification

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) user-goal-falsifiability check:

1. `docs/baseline-perf/2026-05-14/` exists and contains:
   - `boot.cpuprofile`
   - `place-resolve-renderer.cpuprofile`
   - `place-resolve-rust.svg` (flamegraph)
   - `dedup-renderer.cpuprofile`
   - `dedup-rust.svg`
   - `summary.md`
2. `summary.md` contains, for each of the three workloads, the four fields named in Scope: wall-clock, top-3 renderer self-time, top-3 Rust self-time, one-paragraph observation.
3. [`.claude/skills/performance-profiling`](../../.claude/skills/) front-matter or body references `docs/baseline-perf/YYYY-MM-DD/` as the canonical baseline commit location, so future plans use the same path convention.

Falsifiability check: if every item passes, can a Tier 3 plan close without referencing these numbers? **No.** The Tier 3 plans (3.1, 3.2, 3.4) will be written after this lands and will name `docs/baseline-perf/2026-05-14/summary.md` row X as their before-baseline; their Verification will require a matching after-number from the same workload.

## Failure modes / RCA reference

Tauri-port "improved perf" claims after the migration had no measured before-numbers — "the new build feels fast" became the only check. The audit then identified perf hotspots ("4 GB RSS during gazetteer init", "place-resolver complex") again without numbers, just impressions. This plan exists so the audit-followup refactors don't repeat that — every Tier 3 refactor's "did it work" answer is decidable from committed baseline files, not from running the user app and asking "feels okay?"

## Effort

0.5 day. Sequencing: boot trace (~30 min), place-resolve trace (~1 hour including DB load), dedup trace (~1 hour), summary writeup (~1 hour).

## Revision history

- **2026-05-14 (initial):** Plan assumed Chromium DevTools for renderer-side .cpuprofile capture. Two subagent dispatches returned BLOCKED with diagnostics that overturned the plan's premise:
  1. **Tauri on macOS uses WKWebView, not Chromium.** Safari Web Inspector is the renderer-side debugger; its Timelines export format isn't directly compatible with Chromium DevTools' .cpuprofile schema. The `chrome-devtools-mcp` plugin tools don't attach to WKWebView either.
  2. **Subagents lack GUI access.** Driving "click Record / reload / click Stop / Save profile" interactively in Safari Web Inspector is not subagent-executable.
  3. **Stress fixture missing:** `holger2.db` has 22k persons but 0 places; `linda.db` has 833 persons + 272 places (under the ≥1k places / ≥5k persons threshold). No DB on disk meets both thresholds; the `seed_family` MCP tool requires the app to be running.
- **2026-05-14 (revised, below):** Pivot to **Rust-first capture via `samply`** (subagent-executable — pure CLI). Renderer-side captures become a documented "user must perform interactively in Safari Web Inspector" step OR a future follow-up after the app gains a headless-trace-export mechanism. Reduces the immediate plan's scope to the workloads that exercise Rust the most: place-resolve, dedup. Boot trace gets captured as a Rust-binary samply pass (covers Rust-side launch cost; renderer-side mount cost requires the GUI step).

## Tasks (bite-sized — for `superpowers:executing-plans` or human execution)

### Task 0: Install profiling tools (subagent-executable)

- [ ] **Step 1: Install samply**

```bash
cargo install --locked samply
samply --version
```

Expected: samply prints its version.

- [ ] **Step 2: Build a release binary**

```bash
npm run build:bin 2>&1 | tail -5
ls -la src-tauri/target/release/slaktforskning
```

Expected: release binary exists.

### Task 1: Prepare test database

- [ ] **Step 1: Inspect the working database's row counts**

```bash
sqlite3 ~/Library/Application\ Support/com.slaktforskning.app/family.db \
  "SELECT 'persons', COUNT(*) FROM persons UNION ALL SELECT 'places', COUNT(*) FROM places;"
```

Expected: two rows with counts.

- [ ] **Step 2: Pick the best available DB and document its limitations**

Known DBs on this system (verified 2026-05-14 by an earlier subagent):

| DB path | persons | places | events | media |
|---|---|---|---|---|
| `~/Library/Application Support/com.slaktforskning.app/family.db` | 0 | 0 | 0 | 0 |
| `~/Library/Application Support/Släktforskning/slaktforskning.db` | 8 | 13 | 21 | 0 |
| `~/git/slaktforskning/export-import/wetransfer_testmaterial_2026-04-05_1624/linda.db` | **833** | **272** | 3008 | 4 |
| `~/git/slaktforskning/export-import/wetransfer_testmaterial_2026-04-05_1624/holger2.db` | **22221** | 0 | 40954 | 0 |

**Pick `linda.db`** as the baseline DB — best place breadth on disk. The original threshold (≥1k places, ≥5k persons) is reduced to "the realistic largest DB on hand" per the revision note. If `seed_family` is run later with the app running, regenerate the baseline against the larger stress fixture.

- [ ] **Step 3: Note the chosen DB and row counts**

Save to a scratch file (will be copied into `summary.md`):

```
DB: <path>
persons: <count>
places: <count>
events: <count>
media: <count>
```

### Task 2: Capture Rust-side boot + place-resolve + dedup traces (subagent-executable)

These three captures are pure CLI — no GUI needed. The user-driven renderer-side traces (Task 4) are documented as a follow-up.

- [ ] **Step 1: Boot trace (Rust-side)**

```bash
mkdir -p docs/baseline-perf/2026-05-14
samply record --save-only -o docs/baseline-perf/2026-05-14/boot-rust.json \
  src-tauri/target/release/slaktforskning &
SAMPLY_PID=$!
sleep 8  # Wait for app to fully boot and gazetteer init to settle
kill $SAMPLY_PID
ls -la docs/baseline-perf/2026-05-14/boot-rust.json
```

Expected: profile JSON exists. Note: samply may need additional flags or signal handling depending on platform — adjust if the first run produces an empty file.

- [ ] **Step 2: Place-resolve trace via the unit-test workload**

```bash
samply record --save-only -o docs/baseline-perf/2026-05-14/place-resolve-rust.json \
  npx vitest run tests/unit/place-resolver*.test.ts tests/unit/place-gazetteers*.test.ts
```

Expected: profile captures the gazetteer resolver hot path.

- [ ] **Step 3: Dedup trace via the unit-test workload**

```bash
samply record --save-only -o docs/baseline-perf/2026-05-14/dedup-rust.json \
  npx vitest run tests/unit/duplicates
```

Expected: profile captures the dedup scoring path.

- [ ] **Step 4: Open each profile in samply to identify top 3 self-time functions**

```bash
samply load docs/baseline-perf/2026-05-14/boot-rust.json
# Note the top 3 functions by self-time; close the viewer
samply load docs/baseline-perf/2026-05-14/place-resolve-rust.json
samply load docs/baseline-perf/2026-05-14/dedup-rust.json
```

Save the top-3 per workload for `summary.md`.

### Task 3: Renderer-side captures (USER-DRIVEN — interactive Safari Web Inspector)

This task requires interactive use of Safari Web Inspector on macOS Tauri (no subagent equivalent). Document explicitly that it's a manual step; the resulting traces become part of the baseline if captured.

- [ ] **Step 1: Open the dev app**

```bash
npm start &
```

- [ ] **Step 2: Open Safari Web Inspector**

In the running Tauri app's window: right-click → Inspect Element. Or System Settings → Safari → Advanced → "Show Develop menu" must be enabled; then Develop → Slaktforskning → choose the renderer.

- [ ] **Step 3: Capture three workloads**

For each of boot / place-resolve (load DB, navigate to /places, scroll) / dedup (load DB, trigger `find_duplicates`):
1. Switch to Timelines tab → JavaScript & Events.
2. Click Record (red dot).
3. Perform the workload.
4. Stop recording.
5. Export → JavaScript Profile → save as `docs/baseline-perf/2026-05-14/<workload>-renderer.cpuprofile`.

- [ ] **Step 4: Mark renderer-side captures as DONE in `summary.md` (or as "user follow-up needed" if skipped)**

### Task 4: Renderer-side captures (deferred; previously Task 3)

- [ ] **Step 1: Navigate to /places in the running app**

Verify the chosen DB is loaded; map view shows pins.

- [ ] **Step 2: Open DevTools Performance, start recording**

- [ ] **Step 3: Trigger place resolution**

Switch to list view, scroll the place list to the bottom (or filter to trigger queries). Wait for all pins to render.

- [ ] **Step 4: Stop recording, save as `place-resolve-renderer.cpuprofile`**

```bash
mv ~/Downloads/place-resolve-renderer.cpuprofile docs/baseline-perf/2026-05-14/
```

### Task 4: Capture place-resolve trace (Rust)

- [ ] **Step 1: Install cargo-flamegraph if missing**

```bash
cargo install flamegraph
```

Or use `samply` on macOS:

```bash
cargo install --locked samply
```

- [ ] **Step 2: Build a release binary**

```bash
npm run build:bin 2>&1 | tail -5
```

Expected: produces `src-tauri/target/release/slaktforskning` (or `.exe`).

- [ ] **Step 3: Profile the binary while triggering place-resolve workload**

```bash
# Using samply (macOS):
samply record src-tauri/target/release/slaktforskning &
# In the app, navigate to /places, exercise the workload, then close the app.
# samply will write profile_<timestamp>.json
```

Or with flamegraph (Linux):

```bash
cargo flamegraph -p slaktforskning --release
# Trigger workload, close app — produces flamegraph.svg
```

- [ ] **Step 4: Move output to docs/baseline-perf/**

```bash
mv flamegraph.svg docs/baseline-perf/2026-05-14/place-resolve-rust.svg
# OR for samply: mv profile_*.json docs/baseline-perf/2026-05-14/place-resolve-rust.json
```

### Task 5: Capture dedup trace

- [ ] **Step 1: Renderer side — record `find_duplicates` invocation**

In the running app, open DevTools Performance, start recording, navigate to `/quality` or wherever `find_duplicates` is triggered. Wait for results to render.

- [ ] **Step 2: Save as `dedup-renderer.cpuprofile`**

```bash
mv ~/Downloads/dedup-renderer.cpuprofile docs/baseline-perf/2026-05-14/
```

- [ ] **Step 3: Rust side — profile dedup-only path**

Run a script or test that calls dedup directly under `samply`:

```bash
samply record sh -c "src-tauri/target/release/slaktforskning --headless dedup" 2>&1 | tail -5
# If a --headless mode isn't available, profile a Vitest run of duplicates.test.ts
# instead: samply record npx vitest run tests/unit/duplicates.test.ts
```

- [ ] **Step 4: Move output**

```bash
mv profile_*.json docs/baseline-perf/2026-05-14/dedup-rust.json
# OR: mv flamegraph.svg docs/baseline-perf/2026-05-14/dedup-rust.svg
```

### Task 6: Write `summary.md`

- [ ] **Step 1: Create `docs/baseline-perf/2026-05-14/summary.md`**

Use this template:

```markdown
# Performance Baseline — 2026-05-14

## Test database

DB path: <path>
- persons: <count>
- places: <count>
- events: <count>
- media: <count>

## Boot workload

- Wall-clock: <ms>
- Top renderer self-time:
  1. <function> — <ms>
  2. <function> — <ms>
  3. <function> — <ms>
- (Rust-side timing not captured for boot — N/A)
- Observation: <one paragraph: what's slow, what's surprising>

## Place-resolve workload

- Wall-clock (renderer trace): <ms>
- Top renderer self-time:
  1. <function> — <ms>
  2. <function> — <ms>
  3. <function> — <ms>
- Top Rust self-time:
  1. <function> — <ms>
  2. <function> — <ms>
  3. <function> — <ms>
- Observation: <one paragraph>

## Dedup workload

- Wall-clock: <ms>
- Top renderer self-time:
  1. <function> — <ms>
  2. <function> — <ms>
  3. <function> — <ms>
- Top Rust self-time:
  1. <function> — <ms>
  2. <function> — <ms>
  3. <function> — <ms>
- Observation: <one paragraph>

## Cross-process timing gap

Chromium DevTools shows `invoke()` round-trip latency but not the Rust-side
breakdown inside the call. The Rust flamegraph fills part of that gap but
isn't synchronized with the renderer trace. Future plans that need
cross-process timing can reconsider CrabNebula DevTools.
```

Fill in the TBDs by reading each cpuprofile (open in Chromium DevTools → Performance → Load profile) and each flamegraph (open .svg in a browser; the wide bars are the hot functions).

- [ ] **Step 2: Commit the baseline**

```bash
git add docs/baseline-perf/2026-05-14/
git commit -m "perf: capture 2026-05-14 baselines for boot/place-resolve/dedup

Three workloads traced via Chromium DevTools (renderer) + samply
(Rust). Summary in docs/baseline-perf/2026-05-14/summary.md.
Referenced by Tier 3 audit-followup plans (3.1 duplicates, 3.2
chart-layout, 3.4 report_data) for before/after comparison."
```

### Task 7: Update the performance-profiling skill

- [ ] **Step 1: Open `.claude/skills/performance-profiling/SKILL.md`** (or equivalent skill file path).

- [ ] **Step 2: Add a reference to `docs/baseline-perf/`**

In the skill body, add a paragraph after the tool-usage section:

```markdown
## Baseline storage convention

Baselines from "before refactor" captures live at `docs/baseline-perf/YYYY-MM-DD/`:
- `<workload>.cpuprofile` — renderer trace from Chromium DevTools Performance tab
- `<workload>-rust.svg` or `.json` — flamegraph or samply profile
- `summary.md` — wall-clock + top-3 self-time + observation per workload

Tier 3 audit-followup plans (and any future "did this refactor help?" question)
reference these files by date stamp. After capturing a new baseline, commit
the directory in one PR.
```

- [ ] **Step 3: Commit the skill update**

```bash
git add .claude/skills/performance-profiling/
git commit -m "skill(performance-profiling): document docs/baseline-perf/ as the canonical baseline location"
```

### Task 8: Self-review

- [ ] All three workloads have both renderer and (where applicable) Rust traces in `docs/baseline-perf/2026-05-14/`.
- [ ] `summary.md` has the four-field table for each workload (wall-clock, top-3 renderer, top-3 Rust, observation).
- [ ] Test database row counts documented.
- [ ] `.claude/skills/performance-profiling` references the new location.
- [ ] Cross-process timing gap explicitly noted (so future readers know what we *didn't* capture).
