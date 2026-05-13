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

## Tasks

- [ ] Generate or identify a realistic test database (≥1k places, ≥5k persons).
- [ ] Capture boot trace.
- [ ] Capture place-resolve trace (renderer + Rust).
- [ ] Capture dedup trace (renderer + Rust).
- [ ] Write `summary.md` with the four-field table per workload.
- [ ] Commit `docs/baseline-perf/2026-05-14/` directory.
- [ ] Update [`.claude/skills/performance-profiling`](../../.claude/skills/) to reference `docs/baseline-perf/` as the canonical location.
- [ ] Self-review checklist (see [`.claude/rules/plans.md`](../../.claude/rules/plans.md)).
