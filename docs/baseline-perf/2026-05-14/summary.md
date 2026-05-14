# Performance Baseline — 2026-05-14

Captured per [`docs/plans/2026-05-14-perf-baseline-capture.md`](../../plans/2026-05-14-perf-baseline-capture.md) (revised
to "Rust-first via samply" after the original Chromium-DevTools plan was overturned by macOS+WKWebView reality).
Renderer-side traces are deferred to user-driven Safari Web Inspector follow-up (Task 3 of the plan).

Tooling: [samply 0.13.1](https://github.com/mstange/samply) with `--unstable-presymbolicate`.
Each capture produced a `.json` profile + a `.syms.json` symbol sidecar; symbol names below were
resolved via the sidecar's `known_addresses` + `symbol_table` arrays. Profile files are
viewable directly with `samply load <path>.json` (auto-discovers the sidecar).

## Test database

DB path: `~/git/slaktforskning/export-import/wetransfer_testmaterial_2026-04-05_1624/linda.db`

| table   | rows |
|---------|------|
| persons | 833 |
| places  | 272 |
| events  | 3008 |
| media   | 4 |

Note: the original plan-scope threshold was ≥1,000 places and ≥5,000 persons. No on-disk database meets
both — `linda.db` is the best available (largest place breadth, modest person count). The other large
candidate `holger2.db` has 22,221 persons but 0 places. The revision note in the plan ("the realistic
largest DB on hand") accepts this; a future stress fixture from `seed_family` would tighten the boot
and dedup numbers without affecting place-resolve (which is gazetteer-bound, not row-count-bound).

## Workload 1 — boot

`samply record -- src-tauri/target/release/slaktforskning` (manually terminated after ~8 s with
SIGTERM to the slaktforskning PID only, so samply could finalise the profile).

The Tauri release binary was launched cold and sampled for ~8 s. No database was loaded — this
captures pure cold-start cost: dyld + Tauri runtime + wry/WKWebView boot + ui-bridge listener.

- Wall-clock span: **7636 ms** (sampled duration, not user-perceived "ready" time)
- Main thread CPU: 557 ms
- All threads total CPU: 2910 ms

### Top 3 functions, all threads, by self-time

1. `dyld4::PrebuiltLoader::loadDependents` — **1093 ms** (dyld dynamic-link work)
2. `dyld4::Loader::makeDyldCacheLoader` — **759 ms** (dyld cache resolution)
3. `__fcntl` — **459 ms** (file descriptor ops, mostly via dyld's image-loading path)

### Top 3 application-layer self-time

(Filtering out dyld, libsystem, V8, libuv, common runtime.)

1. `wry::wkwebview::navigation::navigation_policy` — 26 ms
2. `http::request::Builder::and_then` — 24 ms (likely the ui-bridge HTTP server warm-up)
3. `tao::platform_impl::platform::window::UnownedWindow::new` — 4 ms (window creation)

### Observation

Cold boot is **dominated by dyld** (~1.85 s of CPU just resolving and binding Mach-O dependencies),
not by anything app-specific. The application-layer work fits in <100 ms of CPU on the main thread.
This means the user-perceived "open the app" latency is bounded below by the OS dynamic linker
(~2 s of dyld CPU on this hardware) plus WKWebView spin-up, and is NOT a target for in-app
optimisation. The first opportunity for app-side gains would be deferring the ui-bridge HTTP
listener until first MCP/dev-tool invocation, but it currently costs <50 ms — not worth the
complexity.

## Workload 2 — place-resolve

`samply record -- node ./node_modules/vitest/vitest.mjs run tests/unit/places.test.ts tests/unit/place-gazetteers.test.ts tests/unit/swedishPlace.test.ts`

99 tests across 3 files exercising the place CRUD and gazetteer resolver. Test files chosen because
no `place-resolver*.test.ts` exists (the plan's literal filename was speculative); `places.test.ts`
+ `place-gazetteers.test.ts` + `swedishPlace.test.ts` are the canonical place-resolve coverage
under `tests/unit/`.

- Wall-clock span: **1210 ms** (99 tests; vitest reported `Duration 918ms` cold)
- Main thread CPU: 827 ms
- All threads total CPU: 5198 ms

### Top 3 functions, all threads, by self-time

1. `dyld4::APIs::dlopen` — **1941 ms** (vitest worker pool startup, loading test-runtime modules)
2. `dyld3::MachOAnalyzer::forEachRebaseLocation_Opcodes` — **169 ms** (Mach-O rebasing during dlopen)
3. `dyld4::Loader::getLoader` — **162 ms** (dyld loader path resolution)

### Top 3 application-layer self-time (main thread)

1. `dyld4::Loader::getLoader` — 77 ms
2. `v8::internal::Runtime::SetObjectProperty` — 32 ms (test-data setup; lots of object init)
3. `v8::internal::interpreter::BytecodeGenerator::VisitPropertyLoad` — 30 ms (test code is parsed cold)

### Observation

Place-resolve is **NOT what's slow here** — 99 tests cumulatively spent ~1.2 s wall-clock and the
profile is dominated by vitest module-load overhead and V8 codegen. The actual gazetteer-resolution
code does not appear in the top 20 of any thread. This means either (a) the resolver is genuinely
cheap on a 272-place fixture, or (b) the test-runner overhead is so large that real workload signal
is buried below it. For a *meaningful* place-resolve baseline, future work should run a dedicated
microbenchmark that calls `resolvePlace()` in a tight loop on a 10k+ row gazetteer outside vitest,
or capture from inside the running app while interacting with the map (Task 3 — Safari Web
Inspector).

## Workload 3 — dedup

`samply record -- node ./node_modules/vitest/vitest.mjs run tests/unit/duplicates.test.ts tests/unit/duplicates-places.test.ts tests/unit/duplicates-sources.test.ts tests/unit/duplicates-media.test.ts`

134 tests across 4 files exercising duplicate-finding for persons, places, sources, media. This is
the closest in-tree workload to the user-observable "find duplicates" MCP call without spinning up
the Tauri app.

- Wall-clock span: **29 741 ms** (134 tests; vitest reported `Duration 29.39s`)
- Main thread CPU: 19 191 ms
- All threads total CPU: 24 694 ms

### Top 3 functions, all threads, by self-time

1. `dyld3::MachOLoaded::findClosestSymbol` — **16 258 ms** ⚠️ (see note below)
2. `node::BaseObject::pointer_data` — 2 176 ms
3. `node::Environment::release_managed_buffer` — 607 ms

⚠️ The `findClosestSymbol` figure is samply's own in-process symbolication overhead caused by
`--unstable-presymbolicate` running across the long test duration. It is **not** a property of
the dedup code. The Top-3 application-layer numbers below filter it out.

### Top 3 application-layer self-time (excluding runtime/V8/dyld/symbolication)

1. `node::AsyncWrap::MakeCallback` — 366 ms (test async harness; not application logic)
2. `node::ArrayBufferViewContents<...>::ReadValue` — 311 ms (likely WASM-buffer marshalling, which
   suggests `node-sqlite3-wasm` is still imported by these tests even though Tauri uses rusqlite)
3. `Builtins_AsyncFunctionReject` — 41 ms

### Observation

The dedup tests run for ~30 seconds wall-clock, but the captured profile's application-layer signal
is also weak — the V8/Node runtime dominates, and the `findClosestSymbol` artefact eats ~16 s of
apparent self-time that is purely samply-bookkeeping. For a clean dedup baseline, future work
should: (a) re-record without `--unstable-presymbolicate` and use a post-hoc symbolicator (slower
to read, but the profile is uncontaminated), or (b) profile a single dedup invocation against a
22k-person fixture (`holger2.db`) from inside the running Tauri app, where the Rust-side cost lives.

## Cross-process timing gap

Renderer-side traces (Vue render time, layout, paint, `invoke()` round-trip from JS to Rust) were
NOT captured. macOS Tauri runs in WKWebView, which requires Safari Web Inspector (GUI-only, no
subagent path). Per the plan, this is deferred to the user as a follow-up: open the dev app,
attach Safari Web Inspector, capture Timelines for each of the three workloads, save the
`.cpuprofile` files alongside the Rust ones in this directory.

The Rust-side flamegraph captured here fills part of that gap (it shows where Rust-side time goes
during boot and during a Rust-touching workload) but is NOT synchronised with the renderer trace.
Future plans that need cross-process timing can reconsider CrabNebula DevTools (declined here as
paid tooling).

## How to read these profiles

```
samply load docs/baseline-perf/2026-05-14/<workload>-rust.json
```

The sidecar `<workload>-rust.syms.json` is auto-discovered.

## Files in this directory

- `boot-rust.json` + `boot-rust.syms.json` — boot trace
- `place-resolve-rust.json` + `place-resolve-rust.syms.json` — place-resolve trace
- `dedup-rust.json` + `dedup-rust.syms.json` — dedup trace
- `summary.md` — this file

## Referenced by

Tier 3 refactors will be written against this baseline. Each will:
- Name the specific workload(s) it claims to speed up.
- Capture an after-trace into `docs/baseline-perf/<after-date>/`.
- Compare wall-clock + top-3 self-time deltas in the close-out commit.

The numbers above are **not** a target list ("dedup is slow, fix it!"). They are the *current
shape* of where CPU time goes today. The plan that motivated this capture was about ensuring
future refactors can prove they moved the right needle — not about identifying needles to move.
