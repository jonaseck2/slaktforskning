# Plan — Renderer-side perf baseline (Safari Web Inspector)

Roadmap origin: plan 1.2 (perf baseline capture) shipped Rust-side traces only; the renderer-side captures were deferred to user-driven Safari Web Inspector on Tauri/WKWebView because subagents have no GUI access. This plan picks up the deferred work as a deliberate user-driven session, not a subagent dispatch.

Single-file design + plan.

## User goal

`docs/baseline-perf/2026-05-14/` (or a date-fresh sibling directory) contains renderer-side .cpuprofile or .timeline traces for three workloads: boot, place-resolve, dedup. Future Tier 3 refactor close-outs can diff renderer wall-clock + top-self-time functions against these baselines, the same way the Rust-side `samply` JSON profiles already serve that role.

This is the missing half of plan 1.2. After it lands, the project has matched renderer + Rust traces for the same three workloads on the same DB.

## Why now

Plan 1.2 captured boot / place-resolve / dedup via `samply` on the release binary + via `vitest run` workloads on the test database (`linda.db`). That gave Rust-side numbers but no renderer-side numbers. The audit-followup work (plans 3.1, 3.3, 3.4, 3.5) shipped without renderer-side baselines because the gap was acceptable for non-renderer refactors. **The next user-observable perf concern will be in renderer-side rendering** (chart layout, modal mount, panel switching) — those refactors need renderer baselines to verify against.

This plan is **user-driven by design** — Safari Web Inspector on Tauri/WKWebView requires GUI interaction that subagents can't perform. Treat this plan as a 30-minute manual session, not a subagent dispatch.

## Pre-plan audit (per `audit-validation` skill)

Before starting, verify these claims that plan 1.2 made about renderer-side capture:

```bash
# Tauri build target on macOS — confirm it's WKWebView, not Chromium
# Check Tauri docs or:
grep -i 'wkwebview\|webkit' src-tauri/Cargo.toml

# Safari Web Inspector requires Develop menu enabled
defaults read -g WebKitDeveloperExtras 2>&1 | head -1

# linda.db exists at the path 1.2 used
ls "$HOME/git/slaktforskning/export-import/wetransfer_testmaterial_2026-04-05_1624/linda.db"

# Existing baseline directory shape:
ls docs/baseline-perf/2026-05-14/
```

The plan executor (the user) records each verification in `summary.md` alongside the new traces.

## Scope

### C1 — Boot trace (renderer-side)

User opens the dev app (`npm start`); right-clicks → Inspect Element → Timelines tab → record from page load through "no JavaScript activity for ≥2 seconds." Export as `boot-renderer.cpuprofile` (or `.timeline` — Safari Web Inspector's native format) and place at `docs/baseline-perf/2026-05-14/boot-renderer.cpuprofile`.

### C2 — Place-resolve trace (renderer-side)

With the same dev app session: load `linda.db` (via Settings → Open Database) → navigate to `/places` → wait for map pins to render → scroll the list to trigger more resolves → record from "navigate" to "idle for ≥2 seconds." Export as `place-resolve-renderer.cpuprofile`.

### C3 — Dedup trace (renderer-side)

`/duplicates` → wait for the four-tab summary to load (this triggers dedup-candidate fetching) → record from navigate to "all four tabs populated." Export as `dedup-renderer.cpuprofile`.

### C4 — Update `summary.md`

Append a "Renderer-side traces" section to the existing `docs/baseline-perf/2026-05-14/summary.md`. For each trace:
- Wall-clock duration.
- Top 3 functions by self-time on the renderer side.
- One-paragraph observation (what's slow, what's surprising).

### Scope deviations

- **Safari Web Inspector's export format isn't .cpuprofile-compatible with Chromium DevTools' viewer.** That's fine — the project commits to the Safari format and uses Safari Web Inspector to re-open them for future diffs. Document the format choice in `summary.md` so future-you doesn't try to load them in Chromium DevTools.
- **The renderer-side traces are NOT subagent-comparable** — a future Tier 3 refactor's subagent close-out can't run a renderer-side trace. The diff against this baseline is also user-driven (or a deferred follow-up step in the subagent's "DONE_WITH_CONCERNS" report).

## Approach

Single user session, ~30 minutes. Three captures + summary update + commit. No worktree, no subagent — the user does this hands-on.

## Verification

Per `.claude/rules/plans.md`:

1. Three new files at `docs/baseline-perf/2026-05-14/`: `boot-renderer.cpuprofile`, `place-resolve-renderer.cpuprofile`, `dedup-renderer.cpuprofile`.
2. `summary.md` has a "Renderer-side traces" section with the four fields per workload (wall-clock, top-3 functions, observation).
3. The traces actually open in Safari Web Inspector. (User opens each file via File → Open → confirms the timeline renders.)
4. The `.claude/skills/performance-profiling/SKILL.md` skill mentions Safari Web Inspector for Tauri-on-macOS renderer captures, alongside the existing samply/cargo-flamegraph guidance.

## Failure modes / RCA reference

- **Safari Web Inspector doesn't export to a useful format.** If the .timeline export is unusable, fall back to: take screenshots of the relevant flamegraph view and commit those alongside the .timeline binary. The screenshots are the diff-comparable artifact.
- **WKWebView's profiler doesn't show source-mapped TypeScript symbols.** Document this limitation in summary.md; the top-N functions may show as `_chunk-XXXX.js:line` rather than `useEntityData`. Use Vite's `--sourcemap=true` in the dev build if possible.
- **Plan 1.2's `summary.md` may have moved.** If `docs/baseline-perf/2026-05-14/summary.md` isn't there, find the actual baseline dir (`ls docs/baseline-perf/`) and update this plan inline before starting C1.

## Effort

30 minutes — 5 min per trace + 15 min for summary + verification.

## Tasks

- [ ] Task 0: pre-plan audit (verify WKWebView claim, Develop menu enabled, linda.db exists, baseline dir exists).
- [ ] Task 1: C1 boot trace.
- [ ] Task 2: C2 place-resolve trace.
- [ ] Task 3: C3 dedup trace.
- [ ] Task 4: C4 summary.md update.
- [ ] Task 5: Update `.claude/skills/performance-profiling/SKILL.md` with the Safari Web Inspector workflow.
- [ ] Task 6: Commit + close-out note.
