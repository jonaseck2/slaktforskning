# Post-Tauri audit + execution roadmap

> Not an implementation plan; a synthesis. Captures the full state of the codebase + the prompts/skills/rules infrastructure at the close of the 2026-05-12 session, recommends the order of execution for the seven outstanding plans, and surfaces three new issues uncovered by the audit that don't yet have plans. Written before context compaction so the recommendation survives the session boundary.

## User goal

When I read `docs/PLAN.md` after compaction, I see an ordered list of work that closes the Tauri-port regression class, the verification-infrastructure gap, and the toolchain-currency gap — in the order that minimizes rework and unblocks the most downstream items per task. New issues the audit surfaced today are either filed as plans (so they're tracked) or explicitly accepted as low-priority (so I'm not surprised later). When I want to know the truth about the codebase's current health, I read this file's audit section and trust the numbers (test count, lint state, unpushed commits, bundle size) — they were measured, not estimated.

## Audit results (measured 2026-05-12 against commit `dd3649fe`)

### Code health

| Surface | Measured state | Smell? |
|---|---|---|
| **Unit tests** | 247 files / 3996 passed / 112 skipped / 0 failed | ✅ green; ⚠️ 112 skipped (gap #17, plan filed) |
| **Lint** | 0 errors / 29 warnings (all pre-existing import-order) | ✅ |
| **Build (`npm run build`)** | Exits 0 in ~2:17 cold-Rust; bundle at `src-tauri/target/release/bundle/macos/Släktforskning (Tauri).app` | ✅ functional; ⚠️ needs `NODE_OPTIONS=8192MB` heap workaround |
| **e2e (`npx playwright test`)** | 4 projects total; 2 fail (`[smoke]` boot + `[duplicates]`) with `executeJs: renderer script timed out` | ❌ (gap #18, plan filed) |
| **Bundle size** | `tauri-window-api-*.js` = 30 MB raw / 7.4 MB gzipped (gazetteer JSONs eagerly inlined); rest ~1 MB total | ❌ (RC3, plan filed) |
| **Renderer runtime (cold launch)** | WebKit content process peaks at ~4 GB RSS / 100% CPU during gazetteer init burst, then settles | ❌ (same RC3 cause as bundle) |
| **TODO/FIXME/HACK markers** | 30 across 11 files; mostly in importers (gedcom, genney) | ⚠️ low-priority, not load-bearing |

### Naming + version consistency

| Surface | State | Plan exists? |
|---|---|---|
| `tauri-spike` literal in live code | 11 files still reference it: `.claude/skills/tauri-dev/SKILL.md`, `docs/PLAN.md`, `scripts/mcp-tauri.mjs`, `src-tauri/Cargo.lock`, `src-tauri/Cargo.toml`, `src-tauri/src/main.rs`, `src-tauri/src/mcp.rs`, `src-tauri/tauri.conf.json`, `tests/e2e/fixture.ts` (+ 2 plan files that reference it intentionally) | ✅ `2026-05-12-rename-tauri-spike.md` |
| `smoke` in code identifiers | `tests/e2e/app.test.ts:20` (`startApp(UI_PORT, 'smoke')`); `playwright.config.ts:29` (`name: 'smoke'`); `tests/e2e/duplicates.spec.ts` (comment); `.claude/skills/subagent-handoff/implementer-prompt.md:80` (still says "smoke-check") | ✅ `2026-05-12-e2e-test-repair.md` covers the e2e ones; the skill template needs a separate trivial fix (see "New gaps" below) |
| `version` drift | `package.json` = `0.253.1`; `src-tauri/Cargo.toml` = `0.1.0`; `src-tauri/tauri.conf.json` = `0.1.0` | ⚠️ Mentioned as gap #14 in RCA; folded into the rename plan |
| `productName` | `Släktforskning (Tauri)` — still includes `(Tauri)` suffix | Out-of-scope per the rename plan's deviations |

### Git state

| Surface | State | Smell? |
|---|---|---|
| **Branch** | `main` | ✅ |
| **Commits ahead of `origin/main`** | **84 unpushed** | ❌ (L6 violation in the making) |
| **Uncommitted** | 0 files | ✅ |
| **Last 15 commits this session** | RCA + plans + infrastructure fixes (no implementation regressions) | ✅ |

### Process / prompts / skills health

| Surface | State | Notes |
|---|---|---|
| `CLAUDE.md` | 189 lines; Tech Stack section now correctly says Tauri 2.x + rusqlite (was Electron 41 + node-sqlite3-wasm pre-cleanup); "Finishing a plan" has new step 0 (evidence) and revised step 6 (PR vs direct-to-main) | ✅ |
| `.claude/rules/` | 8 files: `api`, `build`, `ipc`, `mcp`, `media`, `plans`, `renderer`, `tests`. `plans.md` is the most-recently-updated; `build.md` rewritten as Tauri-shaped during cleanup; `tests.md` patched | ✅ |
| `.claude/skills/` | 32 skills. `electron-dev` correctly deleted; `tauri-dev`, `tauri-bridge`, `rusqlite-patterns` exist as Tauri replacements. `subagent-handoff` directory has prompt templates | ⚠️ `tauri-dev/SKILL.md` description still says "Replaces the retired electron-dev skill" — electron-dev no longer exists, that line is stale; minor |
| Memory entries | 24 entries indexed. Most are project-specific feedback. A few look stale or duplicative (see "Stale memory entries" below) | ⚠️ |
| `.github/workflows/ci.yml` | Rewritten this session; now triggers on push-to-main + PRs-to-main, unit job runs lint + vitest on Linux, build job runs cross-OS Tauri bundle | ✅ |
| `.github/workflows/release.yml` | Renamed from `release-tauri.yml`; triggers on tags; has macOS notarization + Windows signing + Linux AppImage GPG. Not audited for stale `tauri-spike` references — does it use the `target/release/bundle/macos/*.app` path or a stale one? | ⚠️ Gap #16; not yet planned |
| `tests/unit/scripts.npmScripts.test.ts` | Lands today; subprocess-runs each CI-safe npm script. 4 scripts exercised (`lint`, `build:static`, `build:third-party-licenses`, `build:mcp-sidecar`); the rest categorized in `SKIPPED_WITH_REASON` | ✅ |

### Stale memory entries

Audit pass against the 24 memory entries:

- `feedback_use_dev_mcp.md` — title says "For Electron app screenshots..." but the app is Tauri now. The *advice* (use slaktforskning-dev MCP, not chrome-devtools-mcp) is still correct; the framing is Electron-era. **Update the description to be runtime-agnostic.**
- `feedback_no_chrome_devtools_screenshots.md` — mentions `dev-debug.sh` (Electron-era script that doesn't exist) and `--browserUrl` for Electron CDP. Mostly stale now that the Tauri app exposes its own `/eval` bridge at `127.0.0.1:19241` directly. **Replace or delete** — the chrome-devtools-mcp pattern isn't load-bearing for Tauri inspection (we have `ui_*` and `ui_aria_*` instead).
- `feedback_plan_close_out.md` — superseded by `.claude/rules/plans.md` "Verification discipline at close-out" + CLAUDE.md's "Finishing a plan" section. **Per L5 (project rules go in workspace not memory), this entire memory entry should be retired** — the rule lives in the workspace now.
- `feedback_be_explicit.md` — overlap with `.claude/rules/plans.md` "Verification discipline" + the new feedback_no_smoke_checks message. Not redundant (it's the *general* discipline; the workspace rule is the close-out-specific application), but worth flagging.

### Planned work — full inventory (7 active plans in `docs/PLAN.md`)

| # | Plan | Class (RCA) | Independent? | Estimated size |
|---|---|---|---|---|
| 1 | `2026-05-12-tauri-port-rca.md` | RCA itself | Already done (retrospective) | N/A |
| 2 | `2026-05-12-skipped-tests-cleanup.md` | RC4 (test infra) | Independent | ~1 hour |
| 3 | `2026-05-12-gazetteer-lazy-chunks.md` | RC3 (perf shortcut) | Blocks #4 root-cause | ~half day |
| 4 | `2026-05-12-e2e-test-repair.md` | RC4 (test infra) | Blocked-by #3 for root-cause; can ship with timeout marker without #3 | ~2 hours (with marker) or ~1 hour (after #3) |
| 5 | `2026-05-12-rename-tauri-spike.md` | RC2 (renames) | Independent | ~1 hour |
| 6 | `2026-05-12-vite-7-upgrade.md` | toolchain currency | Independent; audit-first task | ~half day |
| 7 | `2026-05-12-app-a11y-gaps.md` | follow-up to ARIA-MCP | Independent | ~half day |

Plus the RCA's queued items that aren't yet plans:
- `release.yml` audit (gap #16) — small, ~30 min, no plan needed; fold into one of the existing plans or open a quick PR.
- Cargo / `tauri.conf.json` version sync (gap #14) — fold into the rename plan (#5).

## Recommended execution order

The order minimizes rework + unblocks downstream items + addresses the loudest user-observable issues first.

**Tier 1 — fix the suite + the cause cascade together**

1. **Plan #2: skipped-tests cleanup.** Smallest, fully independent, restores `npm test`'s `skipped` count as a real signal. Once landed, every subsequent plan's close-out evidence (per L7) reads cleanly. **Rationale:** unblocks every other plan's verification step.
2. **Plan #3: gazetteer lazy chunks.** Removes the `NODE_OPTIONS=8192MB` heap workaround AND the renderer's 4 GB RSS / 100% CPU at boot — which is *also* what's pinning the e2e fixture's `executeJs` past timeout. **Rationale:** closes RC3 and unblocks plan #4 in one move.
3. **Plan #4: e2e repair + `[smoke]` → `[boot]` rename.** With #3 landed, no timeout marker is needed; the gazetteer-init burst is gone. Also wires `npx playwright test` into close-out evidence per L7. **Rationale:** restores the e2e suite as the load-bearing "the app actually works" check.

**Tier 2 — rename + toolchain currency (independent, lower-risk)**

4. **Plan #5: rename `tauri-spike` → `slaktforskning`.** Pure mechanical pass; no migration since no public users. Fold gaps #14 (version sync) and #16 (release.yml audit) in here. **Rationale:** retires the proof-of-concept naming once the user-blocking work is done.
5. **Plan #6: Vite 7 upgrade.** Audit-first per the plan's Task 1. **Rationale:** least urgent of Tier 2 but unblocks any Vite 7-specific bug fix we might want later.

**Tier 3 — app-side a11y (follow-up to a shipped feature)**

6. **Plan #7: app a11y gaps.** The 27 findings `ui_aria_audit` surfaced. Adds the CI-gate test that fails the build on any new a11y gap (the structural fix). **Rationale:** valuable but no user is blocked today; ships after the toolchain cleanup is done so the a11y plan's test additions land on a clean foundation.

**Cross-cutting: PR vs direct-to-main**

Per L6, every plan above lands via PR. Each plan is its own PR; CI runs the verification matrix per push. The 84 unpushed commits from this session form the *first* PR (or rather, the foundation against which the next 7 PRs branch off `main`). **The session's first action when execution resumes is to push to `origin` and let CI validate the baseline.** If CI fails on push, that's an RC4 mitigation working as intended — better to find out before the plan-execution PRs stack on a broken base.

## New gaps uncovered by this audit (not yet planned)

Three findings beyond what the RCA captured:

### Gap A — `tauri-dev` skill description is stale

`.claude/skills/tauri-dev/SKILL.md`'s frontmatter description says *"Replaces the retired electron-dev skill — same name pattern, Tauri-shaped contents."* The retirement is done (electron-dev directory doesn't exist anymore), so the comparative framing has lost its referent. **Fix:** one-line description update to remove the comparative; just describe what the skill does. Trivial. **Recommendation:** fold into Plan #5 (the rename pass touches `.claude/skills/tauri-dev/SKILL.md` anyway).

### Gap B — `feedback_plan_close_out.md` memory entry is fully superseded

The memory entry's content is now in `.claude/rules/plans.md` "Verification discipline at close-out" + CLAUDE.md's "Finishing a plan" section. Per L5, project rules go in workspace. **Fix:** delete the memory entry + remove from `MEMORY.md` index. **Recommendation:** do this in the next session's cleanup pass; it's a one-line memory operation, no plan needed.

### Gap C — Two memory entries are Electron-era and need refresh, not deletion

`feedback_use_dev_mcp.md` and `feedback_no_chrome_devtools_screenshots.md` are mostly outdated but the underlying *advice* (prefer the slaktforskning-dev MCP over chrome-devtools-mcp for app inspection) is still load-bearing for the Tauri build. **Fix:** rewrite each entry's description + body to be runtime-agnostic (the app is Tauri; the dev MCP serves both runtimes through the same `/eval` bridge surface). **Recommendation:** fold into the same memory-cleanup pass as Gap B.

## Verification of this recommendation

This recommendation is "complete" when:

1. Every gap in the Tauri-port RCA (1–18) is either in a planned file with a clear scope, or explicitly accepted with reason.
2. The 7 planned plans are ordered in a way that minimizes rework — the order above honors: (a) test infrastructure before feature work, (b) cause before symptom (gazetteer-lazy before e2e timeout marker), (c) load-bearing user-observable issues (`npm run build` heap, app boot CPU) before cosmetic ones (rename, Vite version).
3. The new gaps (A, B, C) are filed somewhere durable (this document; folded into existing plans where natural).
4. The audit numbers (test counts, lint state, unpushed commits, bundle size) are *measured*, not estimated. Every number in the audit section above is the output of a command I ran in this session, not a guess. If a future contributor wants to verify, the commands are reproducible from `.claude/rules/plans.md`'s "Verification discipline" section.

## Open questions

Two decisions to align on before execution resumes:

1. **Push the 84 commits now or wait until execution resumes?** Per L6, pushing requires local-green first. Local green is true (tests + lint pass; build works with heap workaround). E2e is broken — but the broken state predates this session, and the plan to fix it is filed. Pushing now lets CI validate the baseline (which is the right RC4 mitigation). Holding lets you control the first PR's contents tightly. **My recommendation: push.** The baseline isn't perfect, but the broken e2e state is the truth we want to start from — pretending it's green by holding the push is the antipattern.

2. **The 3 stale memory entries (Gaps A–C).** Fold into next session's cleanup or open a tiny dedicated PR ("memory hygiene")? **My recommendation: dedicated tiny PR.** Memory hygiene is its own scope; bundling it into a code PR confuses the close-out commit message.

## Tasks discovered during execution

(This document is the synthesis output, not an implementation plan. Tasks belong in the referenced sub-plans.)
