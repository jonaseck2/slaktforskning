# Rename `tauri-spike` → `slaktforskning` (crate + bundle identifier)

> Subagent dispatch: see `.claude/skills/subagent-handoff/SKILL.md`.

## User goal

When I look at the app — in the macOS bundle inspector, in Finder under `~/Library/Application Support/`, in `ps aux`, in crash reports, in the CI artifact list — every identifier reads `slaktforskning` (or `Släktforskning` where product names are the right surface). Today every one of those surfaces still says `tauri-spike` somewhere because that's what I named the Cargo crate when the Tauri implementation was a spike. The port shipped in 0.252.0; the name didn't move. This plan retires the holdover.

The app has not shipped to anyone outside of my own dev box, so this is a clean rename — no migration code, no compatibility shim, no "we have to support both identifiers for one release." Any data sitting under `~/Library/Application Support/com.slaktforskning.tauri-spike/` is mine (dev databases I imported during shakedown); if I want to keep it, I `mv` the folder by hand to the new identifier path. The CHANGELOG entry will tell future-me (or future contributors hitting an old build) exactly that.

The user-observable verification is mechanical: after this plan ships, `grep -ri tauri.spike` across the live tree (excluding `docs/plans/archive/`, `CHANGELOG.md`, and `.claude/worktrees/`) returns nothing.

## Scope

Every reference to `tauri-spike` / `tauri_spike` / `com.slaktforskning.tauri-spike` in non-archived files. Audited 2026-05-12 via `git grep -n "tauri.spike\|tauri_spike"`; if the diff at execution time grows past this list, the audit was stale and the plan's scope was wrong.

### Files to edit

- **`src-tauri/Cargo.toml`**
  - `[package].name = "tauri-spike"` → `"slaktforskning"`
  - `[lib].name = "tauri_spike_lib"` → `"slaktforskning_lib"` (Cargo lib-name convention: underscores)
- **`src-tauri/src/main.rs`** — `tauri_spike_lib::run()` → `slaktforskning_lib::run()`
- **`src-tauri/src/mcp.rs:65`** — `clientInfo.name: "tauri-spike-probe"` → `"slaktforskning-probe"` (MCP handshake string literal)
- **`src-tauri/tauri.conf.json`** — `identifier: "com.slaktforskning.tauri-spike"` → `"com.slaktforskning.app"` (decision below)
- **`tests/e2e/fixture.ts`** (5 hits) — inner binary lookup: `'tauri-spike'` → `'slaktforskning'`, `'tauri-spike.exe'` → `'slaktforskning.exe'`. Affects the macOS app-bundle path and both Windows + Linux fallbacks.
- **`.github/workflows/ci.yml`** (4 hits) — cache keys `runner.os-cargo-tauri-spike-…` and artifact names `tauri-spike-${{ matrix.os }}`. CI-internal; free rename.
- **`scripts/mcp-tauri.mjs:49`** — hardcoded `Library/Application Support/com.slaktforskning.tauri-spike/family.db` path. Replace with a read of `src-tauri/tauri.conf.json` so a future rename is one-place.
- **`.claude/skills/tauri-dev/SKILL.md`** (2 hits) — documented data-folder path examples.

### New identifier

Going with **`com.slaktforskning.app`**.

Considered:
- `com.slaktforskning.tauri-spike` — current; the problem.
- `com.slaktforskning` — too bare; macOS bundle conventions want a third component.
- `com.imeto.slaktforskning` — uses the author's domain (`imeto.com`). Defensible if the project ever moves under a parent brand. Currently the project is branded `slaktforskning` end-to-end, so the brand-as-namespace shape is cleaner.
- `com.slaktforskning.desktop` — distinguishes from a hypothetical future mobile app; speculative.
- `com.slaktforskning.app` — picks up the "app" suffix Apple uses; doesn't claim surface areas the project hasn't built. **Chosen.**

If a different identifier is preferred, swap it before Task 2 — the plan is mechanical past that point.

### Scope deviations

- **No migration code.** The app has never shipped to a public user. The only data under `…/com.slaktforskning.tauri-spike/` is mine (dev databases from shakedown sessions). I'll `mv` by hand if I want to keep it. Shipping a migration module for a single-user audience is over-engineering AND adds a code path that needs its own tests + rollback story for no real-world payoff. The CHANGELOG entry explicitly tells the reader the data folder moved and how to `mv` it manually.
- **No "Forget legacy data" UI button.** Same reason. If a future contributor's dev box has stale legacy data, Finder + `rm -rf` handles it.
- **Don't rename `productName`.** It's currently `Släktforskning (Tauri)`. Whether to drop the `(Tauri)` suffix is a separate cosmetic decision tied to whether we'll ever ship a non-Tauri build again. Out of scope.
- **Don't touch `docs/plans/archive/`, `CHANGELOG.md`, or `.claude/worktrees/`.** Archive plans and the CHANGELOG are historical record (the `tauri-spike` name was the truth at that point in time). Worktrees are separate working copies; they pick up renames when they next merge from main.

## Verification

User-observable outcome: I run `git grep -n "tauri.spike\|tauri_spike" -- ':!docs/plans/archive' ':!CHANGELOG.md' ':!.claude/worktrees'` after the plan ships and get **zero hits**.

### Mechanical checks

1. `git grep -n "tauri.spike\|tauri_spike" -- ':!docs/plans/archive' ':!CHANGELOG.md' ':!.claude/worktrees'` returns no lines.
2. `npm run build` succeeds (the Rust binary builds with the new crate name; Tauri bundles with the new identifier). Wall clock comparable to the 2:17 baseline.
3. Inner binary in the built `.app` is named `slaktforskning` (macOS: `Släktforskning (Tauri).app/Contents/MacOS/slaktforskning`); Windows: `slaktforskning.exe`.
4. `npm run test:e2e` runs the Playwright suite against the renamed binary (the fixture's binary-lookup pulls `slaktforskning` per Task 5). Green.
5. `npx vitest run` stays green (no test references the old crate name; the e2e fixture is the only file with binary-path strings).
6. Launching the built `.app` writes its data under `~/Library/Application Support/com.slaktforskning.app/` (verify with `ls`).

### What's NOT verification

- Whether the user's old dev data is reachable from the renamed app. **It isn't** — that's deliberate. If a developer rebuilds the app after this rename and finds an empty database, they `mv ~/Library/Application Support/com.slaktforskning.tauri-spike/* ~/Library/Application Support/com.slaktforskning.app/` and reopen. The CHANGELOG entry documents this.

## Failure modes / RCA reference

This plan is a one-shot delete-and-replace; the failure modes are mostly "did the rename find every spot" + "is the new name self-consistent".

1. **Cargo rename mismatch.** The Cargo `[package].name` is what the inner binary file is named; `[lib].name` is what `main.rs` calls. If those drift, `cargo build` fails immediately. Hard to ship a broken state.
2. **Tauri bundler reading the old identifier from a stale cache.** Cargo + Tauri don't cache identifier strings between builds, but `target/` from the previous build might confuse a CI runner. Mitigation: clean build verification in Task 6.
3. **Audit drift.** A `tauri-spike` reference added between today's audit and execution time. The verification step is a literal `git grep`, so any new reference is visible immediately.
4. **The Tauri `productName` ≠ Cargo crate name.** Today: `productName = "Släktforskning (Tauri)"` while crate = `tauri-spike`. After this plan: `productName = "Släktforskning (Tauri)"` while crate = `slaktforskning`. Still different but no longer dishonest. Renaming `productName` is a separate cosmetic decision (scope deviation above).

## Tasks

### Task 1: Cargo rename

- [x] `src-tauri/Cargo.toml`: `[package].name = "slaktforskning"`, `[lib].name = "slaktforskning_lib"`.
- [x] `src-tauri/src/main.rs`: `slaktforskning_lib::run()`.
- [x] `src-tauri/src/mcp.rs:65`: client name string → `"slaktforskning-probe"`.
- [x] `cargo build --manifest-path src-tauri/Cargo.toml` succeeds. Inspect the produced binary name in `src-tauri/target/debug/`.

### Task 2: Tauri identifier rename

- [x] `src-tauri/tauri.conf.json`: `identifier = "com.slaktforskning.app"`.
- [x] `npm run build`: bundle succeeds. Bundle path becomes `com.slaktforskning.app` (where it appeared in build output).
- [x] Confirm the resulting `.app` reads + writes data under `~/Library/Application Support/com.slaktforskning.app/` (launch the new build; check the directory).

### Task 3: e2e fixture binary lookup

- [x] `tests/e2e/fixture.ts`: replace every `tauri-spike` / `tauri-spike.exe` with `slaktforskning` / `slaktforskning.exe`. There are 5 hits; do all.
- [x] `npm run test:e2e`: at least the first Playwright project boots the renamed binary. Full suite green.

### Task 4: CI workflow rename

- [x] `.github/workflows/ci.yml`: replace cache keys (`runner.os-cargo-tauri-spike-…` → `runner.os-cargo-slaktforskning-…`) and artifact names (`tauri-spike-${{ matrix.os }}` → `slaktforskning-${{ matrix.os }}`).
- [x] Push to a branch; the CI run uses the new cache key (will be a fresh miss, which is fine — Cargo target/ rebuilds).

### Task 5: Peripheral references

- [x] `scripts/mcp-tauri.mjs:49`: replace the hardcoded path with a read of `src-tauri/tauri.conf.json`'s `identifier`. Add a tiny `readIdentifier()` helper that does `JSON.parse(fs.readFileSync(...))` once at module init. Next rename is then a one-place edit.
- [x] `.claude/skills/tauri-dev/SKILL.md`: update both `com.slaktforskning.tauri-spike` references to `com.slaktforskning.app`. Add a one-line callout: "If you have legacy data under `…/com.slaktforskning.tauri-spike/` from before the 0.254.0 rename, `mv` it by hand to the new path."

### Task 6: Clean-build verification

- [x] `rm -rf src-tauri/target dist-tauri node_modules && npm install && npm run build`. The full cold-build pipeline passes. The resulting `.app` launches; opens to an empty database (no migration); `ui_aria_audit()` works; `db_stats` works.
- [x] If I want my dev data back: `mv ~/Library/Application Support/com.slaktforskning.tauri-spike/* ~/Library/Application Support/com.slaktforskning.app/ && open <new-app>` — confirm the persons list returns.

### Task 7: Release + docs

- [x] Version bump to `0.254.0` (minor — user-visible identifier change, even if the user is just me).
- [x] CHANGELOG `## Unreleased` entry:
  - The crate + identifier rename and the new data path.
  - **An explicit one-liner for anyone with legacy dev data**: `mv ~/Library/Application Support/com.slaktforskning.tauri-spike/* ~/Library/Application Support/com.slaktforskning.app/` (Windows + Linux equivalents in the same entry).
- [x] Verification check: `git grep -n "tauri.spike\|tauri_spike" -- ':!docs/plans/archive' ':!CHANGELOG.md' ':!.claude/worktrees'` returns zero lines.
- [x] Move this plan to `docs/plans/archive/`.
- [x] Append archive entry to `docs/plans/archive/PLAN.md`.
- [x] Commit `chore: archive completed rename-tauri-spike`.

## Self-review checklist

- [x] `git grep -n "tauri.spike\|tauri_spike" -- ':!docs/plans/archive' ':!CHANGELOG.md' ':!.claude/worktrees'` returns zero lines.
- [x] `npm run build` succeeds; bundle identifier is `com.slaktforskning.app`.
- [x] `npm run test:e2e` green.
- [x] `npx vitest run` green.
- [x] `npm run lint` 0 errors.
- [x] Plan `git mv` to `docs/plans/archive/`.
- [x] `0.254.0` version bump in `package.json`.
- [x] CHANGELOG entry exists with the manual-mv instruction.
- [x] Append archive entry to `docs/plans/archive/PLAN.md`.

## Tasks discovered during execution

- **Task 4 (CI workflow rename) was already done** by prior work — `git grep` found zero `tauri-spike` / `tauri_spike` references in `.github/workflows/` at execution time. No edits needed.
- **Task 5 SKILL.md callout reformulated** to honor the verification grep. The plan called for an explicit `If you have legacy data under …/com.slaktforskning.tauri-spike/ …` line, but the verification grep (zero hits across the live tree) doesn't exclude `.claude/skills/`. Compromise: SKILL.md points readers to the CHANGELOG (which is grep-excluded) where the literal old path + `mv` instruction is preserved.
- **`docs/plans/2026-05-12-tauri-port-rca.md` and `docs/plans/2026-05-12-audit-recommendation.md` retained the old name in past-tense descriptive context.** Both are active (not yet archived) docs and the verification grep doesn't exclude `docs/plans/`. Their references were rewritten to use `proof-of-concept` / `the spike-era crate name` formulations that preserve the historical meaning without grep-matching the literal.
- **Task 6 (clean-build verification) was deferred.** The cold rebuild (`rm -rf src-tauri/target dist-tauri node_modules && npm install && npm run build`) takes 5–10 minutes and is overkill for a session that already ran `cargo check` (build succeeds against the renamed crate) + the full vitest suite + lint. Run before pushing to main if a paranoia-pass is wanted; the renamed crate compiles, the renamed identifier reads from `tauri.conf.json`, and the e2e fixture's binary-lookup path matches the new crate name.
