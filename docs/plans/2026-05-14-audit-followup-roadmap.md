# Audit Follow-up Roadmap — 2026-05-14

## User goal

After this roadmap's items are executed, the codebase is current with 2026 Tauri 2 + Vite 8 ecosystem patterns, free of Electron-port residue, free of `pkg`-deprecation risk, and free of the six concrete complexity hotspots that today make feature work in `duplicates`, `chart-layout`, `gedcom`, `report_data`, modals, and IPC require coordinating changes across files that should be independent. **I can read `docs/PLAN.md` and tell what's actually current vs aspirational** — every active plan is an executable plan, every "done" item has been verified with output evidence per [`.claude/rules/plans.md`](../../.claude/rules/plans.md). **`npm run build` produces a bundle whose size I can defend** — no regression vs the pre-Vite-8 baseline that the user noticed in v0.256.

This document is an **index of follow-up work**, not an implementation plan itself. Each item points to its eventual `docs/plans/YYYY-MM-DD-<name>.md` file (some not yet written). Items grouped by tier; sequencing recommendation at the bottom.

## Inputs

- Initial audit produced 2026-05-14 in a Claude conversation (architecture alignment via WebSearch/WebFetch against current Tauri 2, Vite 8, awesome-tauri 2026 patterns; complexity hotspot survey via parallel Explore agents; cleanup smell sweep).
- Cross-checked against `docs/plans/2026-05-12-audit-recommendation.md` (the pre-Vite-8 audit — still partly-actionable; its gap #1 "bundle size 30 MB raw / 7.4 MB gz" predates the Vite 8 upgrade and is superseded by item 1.1 below).
- Verified against current files (`ls`, `grep`) before publication — see "Verified state" column.

## Scope

Every concrete recommendation surfaced during the 2026-05-14 audit is captured here, including the ones not in the top-3 summary. Items already-resolved by inspection (auto-update wiring, capability scoping, several pkg-flagged config deprecations) are listed under "Already done" with the evidence so they don't get re-discovered.

**Scope deviations:** none. If an audit finding doesn't appear below it should be added; if a listed item turns out to be unnecessary it should be deleted from the roadmap (not silently ignored).

---

## Tier 1 — Strategic plans (architecture-shaping; plan-driven, worktree + subagents)

### 1.1 Vite 8 bundle regression investigation

**User goal:** `npm run build` produces a renderer bundle whose total dist-tauri size and largest-chunk size are at least as good as the pre-Vite-8 v0.257.3 baseline. The user noticed v0.256-era builds were "much smaller" — that regression is either explained (by a measured baseline diff that shows the increase is structural, not accidental) or fixed.

**Why now:** confirmed user complaint. The Vite 8 close-out plan's verification §4 claimed "matching expectation" but never compared against a Vite 7 baseline; the pre-Vite-8 audit (`2026-05-12-audit-recommendation.md` gap #1) measured `tauri-window-api-*.js = 30 MB raw / 7.4 MB gz` on different grounds (single eager-collapsed chunk). The two measurements aren't comparable, so we don't actually know whether Vite 8 made things better, worse, or the same.

**Likely root causes to investigate:**
- Rolldown vs Rollup chunk-splitting heuristics on `import.meta.glob('...', { eager: true, query: '?url', import: 'default' })` ([`src/renderer/empty-gazetteers.ts:39`](../../src/renderer/empty-gazetteers.ts#L39)). [Vite Issue #21876](https://github.com/vitejs/vite/issues/21876) shows `import.meta.glob` changed in Vite 8.
- [Vite Issue #22007](https://github.com/vitejs/vite/issues/22007) — Vite 8 reports +8% bundle / +53% chunks on a large monorepo. The gazetteer setup is similar shape.
- `assetsInlineLimit` interaction: one gazetteer (`mc-quartiers.json`) is inlined as a data URL because it's < 4 KB; verify other small gazetteers aren't inflating bundle indirectly.
- Oxc replaces esbuild for JS transform in Vite 8 ([Vite 8 announcement](https://vite.dev/blog/announcing-vite8)) — verify Oxc isn't deoptimizing the code paths that previously minified well under esbuild.

**Verification:** measure `du -sh dist-tauri` + `du -h dist-tauri/assets/* | sort -h | tail -5` against `git checkout v0.257.3 && npm install && npm run build` for the same metric. Diff is < +5% OR the regression is named, measured, and accepted.

**Effort:** 1–2 days.
**Dependencies:** none. Independent of Tier 1.2–1.4.
**Plan file:** `docs/plans/2026-05-14-vite-8-bundle-regression.md` (to be written via `superpowers:brainstorming`).

### 1.2 CrabNebula DevTools profiling baseline

**User goal:** I can answer "where is time being spent at app boot?" and "what's the slowest IPC?" in under 5 minutes with a screenshot, not by reading code. Subsequent refactors (Tier 3 items) reference these baseline numbers in their Verification section so we can prove they actually moved a needle.

**Why now:** Tier 3 complexity refactors (duplicates.ts, chart-layout, report_data) target files the audit *believes* are slow but doesn't have measurements for. Refactoring without a baseline means we can't tell whether the work helped — exactly the pattern [`.claude/rules/plans.md`](../../.claude/rules/plans.md) calls out as user-goal-falsifiability failure.

**Scope:** install [CrabNebula DevTools](https://crabnebula.dev/devtools), capture three baseline traces (boot, place-resolve-heavy, dedup-run), commit the screenshots to `docs/baseline-perf/2026-05-14/`. Currently profiling is two-tool (Chromium DevTools for renderer per `.claude/skills/performance-profiling`, `cargo flamegraph` for Rust). CrabNebula unifies and is Tauri-specific.

**Effort:** 0.5 day. Single-file plan (no `-design.md` split).
**Dependencies:** blocks 3.1, 3.2, 3.4 (refactors need baseline). Not strictly blocking 3.3, 3.5, 3.6 but useful there too.
**Plan file:** `docs/plans/2026-05-14-crabnebula-baseline.md`.

### 1.3 Specta migration (renderer ↔ Rust IPC typesafety)

**User goal:** Adding a new Tauri command means writing the Rust function + adding it to `generate_handler!` — and the TypeScript binding shows up automatically with correct types. No more `src/shared/channels/*.ts` hand-rolled `defineChannel()`. No more "preload coverage" / "static-api coverage" / "ipc-worker coverage" tests. Renaming a Rust command in `db.rs` produces a TypeScript error at the call site, not a runtime crash.

**Why now:** the registry is 1,720 LOC across 21 files with 187 vestigial `thread:` markers (from the Electron worker/main dispatch model that no longer exists in Tauri). It's also where the audit's `thread:` smell and the `ipc-mcp-wirer` agent's whole reason for existence live. [Tauri Specta](https://github.com/oscartbeaumont/tauri-specta) replaces the entire pattern with codegen-from-Rust. Both the registry simplification and the awesome-tauri ecosystem alignment land in one move.

**Scope:** every Tauri command exposed via `tauri::generate_handler!` in [`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs). Every call site in `src/renderer/tauri-window-api.ts` (1,302 LOC) that today walks the registry. Every test file under `tests/unit/` that asserts coverage of the registry (`ipc-worker.test.ts`, `preload-coverage.test.ts`, `static-api-coverage.test.ts` — names per the `ipc-mcp-wirer` agent description).

**Scope deviations:** the `static-api` (website-export SPA) is a separate IPC surface (`src/static/static-api.ts`) that doesn't use Tauri. Specta is renderer-side only — `static-api.ts` stays hand-rolled. Document in code comment.

**Verification:** (1) `npm test` passes with the three coverage tests deleted; (2) renaming any Rust command produces a TypeScript error at every call site (tested by deliberately renaming one and observing `tsc` fail); (3) `wc -l src/shared/channels/` reports < 200 LOC (down from 1,720), or zero if the whole folder is deleted.

**Effort:** 3–5 days.
**Dependencies:** none directly. Subsumes the "drop `thread:` field" tactical item (2.2). Independent of Tier 1.4.
**Plan file:** `docs/plans/2026-05-14-specta-migration-design.md` + `docs/plans/2026-05-14-specta-migration.md`.

### 1.4 kkrpc sidecar migration (Rust ↔ Node MCP)

**User goal:** No more `pkg`-deprecated build step. The MCP sidecar runs as a child Node process invoked via [kkrpc](https://github.com/kunkunsh/kkrpc), with typesafe RPC across the wire. App bundles drop the per-platform `node22-*` binaries (currently ~65 MB each); a single shared `mcp-server.bundle.js` ships instead. Releases stop being blocked by whether `@yao-pkg/pkg-fetch` has prebuilt Node 22, 23, 24 binaries for our four target triples.

**Why now:** [`pkg` is deprecated](https://github.com/vercel/pkg) with 5.8.1 as last release. The project currently uses `@yao-pkg/pkg-fetch` (a community fork) which works but inherits the upstream's "Node SEA is now the supported path" position. Two viable migrations: Node SEA (mechanical swap, same architecture) or kkrpc (re-architects as child-process RPC, eliminates the binary-packaging step entirely). The user picked kkrpc.

**Scope:** [`scripts/build-mcp-sidecar.mjs`](../../scripts/build-mcp-sidecar.mjs), [`src/mcp/server.ts`](../../src/mcp/server.ts), [`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs) (sidecar spawn + capability), [`src-tauri/capabilities/default.json`](../../src-tauri/capabilities/default.json) (`shell:allow-execute` block — currently allows `mcp-server` sidecar binary), [`src-tauri/tauri.conf.json`](../../src-tauri/tauri.conf.json) (`externalBin` block), [`.github/workflows/release.yml`](../../.github/workflows/release.yml) (binary build matrix).

**Scope deviations:** the dev-mode MCP HTTP bridge (`src-tauri/src/ui_server.rs` per `slaktforskning-mcp-dev` skill) is a separate surface for `ui_*` and `chart_*` tools — kkrpc doesn't replace it. Document boundary.

**Verification:** (1) `npm run build` no longer invokes `pkg`; release bundles contain `src-tauri/binaries/mcp-server.bundle.js` not `mcp-server-<triple>` binaries; (2) `npx playwright test --grep '\[boot\] MCP server starts and responds'` passes against the new spawn architecture; (3) bundle size for the `mcp-server` artifact drops from ~65 MB × 4 platforms = 260 MB total to a single ~5–10 MB JS bundle (estimate).

**Effort:** 2–3 days.
**Dependencies:** none. Independent of Tier 1.3.
**Plan file:** `docs/plans/2026-05-14-kkrpc-sidecar-design.md` + `docs/plans/2026-05-14-kkrpc-sidecar.md`.

---

## Tier 2 — Tactical cleanups (small, can land on `main` directly with local-green per [`.claude/rules/plans.md`](../../.claude/rules/plans.md))

| # | Item | Effort | Verified state | Notes |
|---|------|--------|---------------|-------|
| 2.1 | Delete dead Electron artifacts: `.vite/build/`, `forge.env.d.ts`, `dist/forge.config.js` | 30 min | Confirmed all 3 exist via `ls`; none referenced by current build | Add `.vite/` and `dist/` to `.gitignore` if missing |
| 2.2 | Drop `thread: 'worker' \| 'main'` from channel registry | 1 hour | 187 occurrences across 21 files (1,720 LOC total); `tauri-window-api.ts` never reads `def.thread` | **Subsumed by 1.3 (Specta)**; do only if 1.3 isn't picked up |
| 2.3 | `smoke` identifier sweep per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) §3 | 30 min | Confirmed 2 hits remaining: `tests/unit/european-coverage.test.ts`, `tests/unit/scripts.npmScripts.test.ts` | Mostly already done; finish the sweep |
| 2.4 | Remove `@deprecated` aliases | 30 min | Confirmed 3 files: `useFirstEncounter.ts` (`resetCache`), `nameUtils.ts` (`formatSingleGivenName`), `mcp/tools/prod/events.ts` (`description` field) | Coordinate with consumers; verify no external MCP callers depend on `description` |
| 2.5 | Tauri Raw Payloads adoption for large-data IPC | 4–6 hours | Not started | Per [Tauri 2.0 release](https://v2.tauri.app/blog/tauri-20/), `tauri::ipc::Response` for media file reads and gazetteer pre-fetch; measure before/after via 1.2 |
| 2.6 | Active-plans archive sweep | 30 min | Confirmed 5 active plans; 2 are RCA/audit synthesis (not executable: `2026-05-12-audit-recommendation.md`, `2026-05-12-tauri-port-rca.md`) | Move synthesis docs to `docs/plans/archive/` since they're not executable plans, OR rename them to `-rca.md`/`-audit.md` outside `docs/plans/` |
| 2.7 | `build.rollupOptions` → `build.rolldownOptions` rename | 0 (no action) | Confirmed `grep` returns zero matches in vite configs | **Already clean**; documented as not-needed |

---

## Tier 3 — Complexity refactors (plan-driven, multi-day, worktree + subagents)

Numbers from the audit's complexity-hotspot survey. Each will need its own `-design.md` + `.md` plan per [`.claude/rules/plans.md`](../../.claude/rules/plans.md). All depend on 1.2 (profiling baseline) being captured first.

### 3.1 `src/api/duplicates.ts` split

**User goal:** Improving the person dedup scorer doesn't require touching place dedup. Adding a new entity type for dedup (e.g., relationships) doesn't require editing a 1,649-line file.

**Why first in Tier 3:** clearest entity boundaries; 4 entity types already separate at the test-file level (`duplicates.test.ts`, `duplicates-places.test.ts`, `duplicates-media.test.ts`, sources implied); shared O(N²) grouping orchestrator is easy to extract.

**Effort:** 2 days.
**Plan file:** TBD.

### 3.2 Chart layout separation (`hourglass.ts` + `chartData.ts`)

**User goal:** Adding a new chart type or modifying placement math doesn't require updating dozens of golden snapshots in `chartLayout.test.ts` (1,663 LOC). Property-based assertions (no box overlaps, parents above children) replace exact-coordinate golden snapshots.

**Why second:** highest payback per line touched; golden-snapshot fragility blocks chart features.

**Effort:** 4–5 days.
**Plan file:** TBD.

### 3.3 GEDCOM phases encapsulation (`src/import/gedcom/phases.ts`)

**User goal:** Each of the 7 import phases (NOTE maps → INDI → FAM → ASSO → PLAC → research tasks) is independently testable. A single phase break doesn't cascade through all 7 phases' test coverage.

**Effort:** 3–4 days.
**Plan file:** TBD.

### 3.4 `report_data.ts` shared traversal helpers

**User goal:** Six report builders share the same walk-ancestors / collect-events / sort-by-date scaffolding. Adding a new report is composing helpers, not re-implementing the traversal.

**Effort:** 3 days.
**Plan file:** TBD.

### 3.5 EventModal sub-component extraction

**User goal:** `EventModal.vue` (1,052 LOC), `PersonNameModal.vue` (701 LOC), `PersonModal.vue` (646 LOC), `RelationshipModal.vue` (568 LOC) split into reusable field-group sub-components. Event-type-specific field rows (occupation, residence, education) become `<EventOccupationFields>` etc.

**Effort:** 2 days.
**Plan file:** TBD.

### 3.6 `tauri-window-api.ts` per-domain split

**User goal:** The 1,302 LOC god-module becomes a thin re-export `index.ts` + per-domain files matching `src/api/`.

**Note:** **superseded by 1.3 (Specta migration)** if that lands first — Specta generates the bindings, no hand-rolled wiring remains. Keep this item only as a fallback if 1.3 is descoped.

### 3.7 Panel section scaffold composable

**User goal:** Reduce the 4,936 LOC of duplicated section-management boilerplate across 10 `*Panel.vue` files. Each panel manually manages `const <entity>SectionOpen = ref(...)` for each section; centralize via a `usePanelSections` composable.

**Effort:** 1 day. Lower priority than 3.1–3.6.

---

## Already done — verified clean, no action needed

- **Tauri capability scoping** ([`src-tauri/capabilities/default.json`](../../src-tauri/capabilities/default.json)) — properly scoped per-feature; `shell:allow-execute` limited to the `mcp-server` sidecar with named args. Not using wildcard `fs:default` or `*`. The 2026 best-practice writeup's concern doesn't apply.
- **Auto-update plugin** — fully wired in [`src-tauri/tauri.conf.json:54-58`](../../src-tauri/tauri.conf.json#L54) (endpoint = GitHub releases `latest.json`, pubkey present) and in capabilities (`updater:default`, `updater:allow-check`, `updater:allow-download-and-install`). No need to evaluate `tauri-update-cloudflare` or `faynoSync`.
- **`package.json` Electron deps** — confirmed zero. No `electron`, `electron-builder`, `electron-forge`, no `@electron-forge/*`.
- **`build.rollupOptions` deprecation** — confirmed not used in `vite.renderer.config.ts` or `vite.static.config.ts`. No rename needed.
- **Node 20 → 22 sidecar** — already complete in commit `64a1c3f6`, verified end-to-end in Vite 8 plan.

---

## Sequencing recommendation

```
Week 1 (foundation):
  ├── 1.1  Vite 8 bundle regression  ── investigate first; concrete user complaint
  ├── 1.2  CrabNebula profiling      ── set up before Tier 3 refactors
  └── 2.1, 2.3, 2.4, 2.6, 2.7        ── tactical cleanups (1 batched PR)

Week 2 (architecture):
  ├── 1.3  Specta migration          ── eliminates 1,720 LOC + 3 coverage tests
  └── 1.4  kkrpc sidecar migration   ── parallel-safe with 1.3 (different IPC surfaces)

Week 3+ (complexity refactors, by payback):
  ├── 3.1  duplicates.ts split
  ├── 3.2  chart-layout separation
  ├── 3.3  GEDCOM phases
  ├── 3.4  report_data helpers
  ├── 3.5  Modal extraction
  └── 3.7  Panel section composable
```

Tier 2.5 (Raw Payloads) lands somewhere in Week 2–3 once the profiling baseline from 1.2 identifies which IPC paths benefit most. Tier 3.6 (`tauri-window-api.ts` split) drops off the list if 1.3 (Specta) ships.

## Failure modes / RCA reference

This roadmap exists because the 2026-05-12 audit (`docs/plans/2026-05-12-audit-recommendation.md`) and the Tauri-port close-out RCA (`docs/plans/2026-05-12-tauri-port-rca.md`) both identified the bundle-size + complexity-hotspot patterns, but didn't get translated into actionable plans for the items beyond gap #1. This roadmap is the translation layer: every audit finding gets either a plan-file pointer or a verified "already done" note, so nothing falls through the cracks again.

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md): cleanup that lives between the user and the user goal is in-scope. The bundle regression (1.1), the deprecated-pkg risk (1.4), and the registry vestigial layer (1.3) are all between the user and "I can keep building features at the same pace" — they're not optional.
