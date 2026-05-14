# Design — kkrpc + Bun sidecar migration

**Roadmap reference:** [2026-05-14-audit-followup-roadmap.md](2026-05-14-audit-followup-roadmap.md) §1.4.

## User goal

No more `@yao-pkg/pkg` in the build pipeline. The MCP server runs as a child Bun process spawned via [kkrpc](https://github.com/kunkunsh/kkrpc) with typesafe RPC across the wire. Releases stop being blocked by whether pkg supports the next Node version. Build pipeline is one tool (esbuild bundle + ship Bun binary), not two (esbuild + pkg).

I can read `scripts/build-mcp-sidecar.mjs` and see the build is a single esbuild pass; the rest is just shipping the Bun binary that nodejs.org / bun.sh maintains.

## Why now

`@yao-pkg/pkg` is a community fork of [Vercel's pkg, deprecated in 2024](https://github.com/vercel/pkg) with the rationale "Node.js 21 supports single executable applications." The community fork tracks Node release-by-release but every Node version bump is a build-pipeline risk for this project. The 2026-05-14 audit flagged this as Tier 1 cleanup; user picked kkrpc + Bun as the migration target over Node SEA.

Counts (verified 2026-05-14):
- Current pipeline: `esbuild` → CJS bundle → `@yao-pkg/pkg` → 65 MB binary per platform × 4 platforms = ~260 MB shipped
- 4 target triples: `darwin-arm64`, `darwin-x64`, `windows-x64`, `linux-x64`
- Rust spawn site: [`src-tauri/src/mcp.rs:35`](../../src-tauri/src/mcp.rs#L35) `probe_mcp_sidecar`
- Build script: [`scripts/build-mcp-sidecar.mjs`](../../scripts/build-mcp-sidecar.mjs) ~150 LOC

## Scope

### Bun runtime acquisition

- Download Bun binaries for the four target triples from `bun.sh` releases at build time. New script `scripts/fetch-bun-binaries.mjs` with per-target download + SHA verification.
- Rename per Tauri's `externalBin` convention: `bun-aarch64-apple-darwin`, `bun-x86_64-apple-darwin`, `bun-x86_64-unknown-linux-gnu`, `bun-x86_64-pc-windows-msvc.exe`.
- Place at `src-tauri/binaries/`; cache downloaded binaries in gitignored `src-tauri/binaries/.cache/` so CI doesn't re-download on every run (use a checked-in `bun-binaries.lock` for SHA pinning).

### MCP server bundling

- Keep the esbuild step. Switch output from CJS (`dist-mcp/server.cjs`) to ESM (`dist-mcp/server.bundle.mjs`) since Bun prefers ESM and kkrpc's RPC layer is ESM-native.
- Ship the bundle as a Tauri resource alongside the Bun binary.
- **Task 0 (compatibility gate, see Failure modes):** verify `@modelcontextprotocol/sdk` runs on Bun before proceeding with the rest of the scope.

### Rust spawn side

- Replace [`src-tauri/src/mcp.rs`](../../src-tauri/src/mcp.rs) `probe_mcp_sidecar` + spawn with kkrpc's Rust-side spawn primitive. Old pattern: `Command::new("mcp-server-<triple>")` → stdio JSON-RPC dance. New pattern: `Command::new("bun-<triple>") .arg("server.bundle.mjs")` → kkrpc-managed stdio framing with typed messages.
- Update [`src-tauri/capabilities/default.json`](../../src-tauri/capabilities/default.json) `shell:allow-execute` block: replace the `name: "mcp-server"` entry with the `bun` sidecar entry, including `args: ["server.bundle.mjs"]` constraint.
- Update [`src-tauri/tauri.conf.json`](../../src-tauri/tauri.conf.json) `bundle.externalBin` to point at the Bun binaries (one entry per triple in the standard Tauri convention).

### Build pipeline

- Rewrite [`scripts/build-mcp-sidecar.mjs`](../../scripts/build-mcp-sidecar.mjs) to esbuild-only (no pkg invocation). Target < 80 LOC (down from ~150).
- Bun binary download moves to new `scripts/fetch-bun-binaries.mjs`; runs once and caches.
- Update [`.github/workflows/release.yml`](../../.github/workflows/release.yml) build matrix: each runner downloads Bun for its target (or pulls from cache), runs `npm run build:mcp-sidecar` (now esbuild-only), then `tauri build`.
- Remove `@yao-pkg/pkg` and `@yao-pkg/pkg-fetch` from `package.json` devDependencies.

### Renderer side

- kkrpc gives a typesafe RPC client surface to the sidecar. The MCP tool registration shape (how external agents like Claude Desktop talk to the server) doesn't change — that's the MCP protocol over stdio, agent-facing.
- The *internal* spawn-and-talk path used by `probe_mcp_sidecar` and any UI-triggered internal sidecar calls becomes kkrpc-typed.

### Scope deviations

- **MCP tool definitions** in [`src/mcp/createProdServer.ts`](../../src/mcp/createProdServer.ts) and [`createDevServer.ts`](../../src/mcp/createDevServer.ts) don't change — they expose tools via the MCP protocol to external agents (Claude Desktop, agent SDK clients). kkrpc is the internal Tauri↔sidecar transport for our own UI's interactions, not the external-facing protocol. Document the boundary.
- **Dev MCP HTTP bridge** ([`src-tauri/src/ui_server.rs`](../../src-tauri/src/ui_server.rs)) stays as-is per [`.claude/skills/slaktforskning-mcp-dev/`](../../.claude/skills/slaktforskning-mcp-dev/). It's the renderer↔dev-MCP-server channel for `ui_*` and `chart_*` tools during `npm run tauri:dev`. Different surface from the production sidecar; orthogonal to this plan.
- **Bun + Node-API compatibility risk.** If `@modelcontextprotocol/sdk` or any transitive Node-API native module doesn't load on Bun, the plan escalates: either patch upstream, find a pure-JS alternative, or fall back to Node runtime. This risk is named upfront; Task 0 gates the rest of the work.

## Approach

Plan-driven worktree + subagents per CLAUDE.md. The PR ships:
1. Bun binary fetch script + cache.
2. esbuild-only build pipeline (`@yao-pkg/pkg` deps removed from `package.json`).
3. kkrpc Rust-side and TS-side wiring.
4. Updated `tauri.conf.json`, capabilities, `release.yml` build matrix.
5. `CLAUDE.md`, skills, agents updated where they reference pkg or `node22-*` binaries.
6. `CHANGELOG.md` Unreleased entry.

## Verification

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) user-goal-falsifiability check:

1. **`@yao-pkg/pkg` removed.** `grep -r '@yao-pkg' package.json` returns empty.
2. **Build pipeline simpler.** `wc -l scripts/build-mcp-sidecar.mjs` < 80; `grep -i pkg scripts/build-mcp-sidecar.mjs` returns empty.
3. **Bun binaries present in bundle.** `src-tauri/binaries/bun-*` exist after `npm run build:mcp-sidecar` for the host platform; release CI produces all four targets via the matrix.
4. **`@modelcontextprotocol/sdk` works on Bun.** A `tests/unit/bun-sidecar-spawn.test.ts` (or e2e equivalent) launches the bundled MCP server under Bun, sends an MCP protocol request, asserts a valid response. **Falsifiability gate** — if Bun can't run the SDK, the plan doesn't close.
5. **`npx playwright test --grep '\[boot\] MCP server starts and responds'` passes.** Same e2e test that proves today's pkg-built sidecar works, now against Bun.
6. **`npm run build` still produces a working `.app`/`.exe`/`.AppImage`.** `[boot]` packaged-binary Playwright project passes.
7. **Bundle size delta documented.** New per-platform bundle size measured vs the v0.257.4 baseline. Expected: within ±15% (Bun is ~70 MB vs pkg-Node ~65 MB). Larger growth requires investigation before close-out.
8. **`probe_mcp_sidecar` Rust function still returns truthy.** Rust integration test that exercises Bun spawn instead of pkg spawn.

Falsifiability check: if every item passes, can "no more pkg in the pipeline AND the sidecar still works" be false? **No** — item 1 verifies removal; items 4, 5, 6 verify the sidecar works in three independent ways (unit, MCP protocol, Playwright e2e); item 8 verifies the Rust spawn path.

## Failure modes / RCA reference

- **Bun + Node-API native modules.** `@modelcontextprotocol/sdk` is JS-only but may transitively pull in something with native bindings. **Task 0** of execution is the compatibility check — block before scope expansion. If incompatible, the plan escalates per the deviation note (fall back to Node runtime, or patch upstream).
- **Code signing on macOS.** Bun's binary must be code-signed/notarized like any macOS executable. Verify the existing Tauri macOS signing flow (`APPLE_SIGNING_IDENTITY` env in [`release.yml`](../../.github/workflows/release.yml)) covers `externalBin` resources; if not, add a hardened-runtime signing step.
- **Bundle size growth.** Bun is ~70 MB statically linked; per-platform increase of ~5–15 MB vs pkg. Acceptable per user goal (the cost is the binary, the win is build-pipeline cleanliness), but document the explicit number in close-out.
- **kkrpc stability.** Community-maintained library. Pin version in `package.json` and `Cargo.toml`; verify CI reproducibility.

This plan exists because the audit flagged `@yao-pkg/pkg` as a one-Node-bump-from-breaking dependency on a deprecated upstream. Moving to Bun + kkrpc puts the runtime on a maintained foundation while also adopting current Tauri ecosystem patterns ([awesome-tauri 2026 listing](https://github.com/tauri-apps/awesome-tauri)).

## Effort

2–3 days, plan-driven worktree work.

- Day 1: Task 0 Bun compatibility check; Bun binary fetch script; esbuild pipeline rewrite.
- Day 2: kkrpc wiring (Rust + TS); `tauri.conf.json` + capabilities updates; end-to-end one-command working.
- Day 3: `release.yml` matrix update; macOS signing verification; close-out verification + docs.

## Tasks (high-level — implementation plan will expand)

- [ ] **Task 0 (gate):** Bun compatibility check. Spawn the existing MCP server bundle under Bun locally; assert basic MCP protocol round-trip works. Escalate if blocked.
- [ ] `scripts/fetch-bun-binaries.mjs` with SHA pinning and gitignored cache.
- [ ] Rewrite `scripts/build-mcp-sidecar.mjs` to esbuild-only; switch CJS → ESM output.
- [ ] Add kkrpc to `package.json` and `Cargo.toml`; pin versions.
- [ ] Rewrite `src-tauri/src/mcp.rs` spawn logic for kkrpc.
- [ ] Update `src-tauri/tauri.conf.json` `externalBin`.
- [ ] Update `src-tauri/capabilities/default.json` `shell:allow-execute` block.
- [ ] Update `.github/workflows/release.yml` build matrix.
- [ ] Remove `@yao-pkg/pkg` and `@yao-pkg/pkg-fetch` from `package.json`.
- [ ] macOS code-signing verification for Bun binary.
- [ ] Bun-spawn integration test.
- [ ] Update `CLAUDE.md`, [`.claude/skills/slaktforskning-mcp-dev/`](../../.claude/skills/slaktforskning-mcp-dev/), [`.claude/skills/tauri-dev/`](../../.claude/skills/tauri-dev/) — replace pkg/`node22-*` references.
- [ ] `npm test` + `npm run build` + `npx playwright test` all green with evidence captured.
- [ ] `CHANGELOG.md` Unreleased entry.
- [ ] Self-review checklist.
