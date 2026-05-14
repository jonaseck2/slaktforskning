# kkrpc + Bun Sidecar Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Replace `@yao-pkg/pkg` with esbuild-only bundling + a shipped Bun runtime. Tauri spawns the MCP server as a child Bun process via [kkrpc](https://github.com/kunkunsh/kkrpc).

**Architecture:** Bun runtime per platform (downloaded from bun.sh at build time, ~70 MB each) ships as `src-tauri/binaries/bun-<triple>`. The MCP server bundle (esbuild ESM output) ships alongside as a Tauri resource. Rust `src-tauri/src/mcp.rs` uses kkrpc to spawn `bun server.bundle.mjs`. `@yao-pkg/pkg` removed entirely.

**Tech Stack:** Bun 1.x (replaces packaged Node), [`kkrpc`](https://github.com/kunkunsh/kkrpc) (Rust + TS), esbuild for ESM bundling, Tauri 2.x.

**Design doc:** [2026-05-14-kkrpc-sidecar-design.md](2026-05-14-kkrpc-sidecar-design.md)

---

## File Structure

| Path | Purpose |
|------|---------|
| `scripts/fetch-bun-binaries.mjs` | **New.** Download Bun for the target triples; SHA-pin + cache. Uses `node:child_process.spawn` (project standard — no `exec`). |
| `scripts/build-mcp-sidecar.mjs` | **Rewritten.** esbuild-only; CJS → ESM output; no pkg invocation. < 80 LOC. |
| `src-tauri/Cargo.toml` | Add kkrpc Rust crate. |
| `src-tauri/src/mcp.rs` | Rewrite spawn logic for kkrpc → `bun server.bundle.mjs`. |
| `src-tauri/tauri.conf.json` | Update `bundle.externalBin` to point at Bun binaries. |
| `src-tauri/capabilities/default.json` | Update `shell:allow-execute` to allow `bun` sidecar with `["server.bundle.mjs"]` args. |
| `.github/workflows/release.yml` | Build matrix downloads Bun for each target before `tauri build`. |
| `package.json` | Remove `@yao-pkg/pkg` and `@yao-pkg/pkg-fetch`; add kkrpc TS dep. |
| `src-tauri/binaries/.cache/` | **Gitignored.** Downloaded Bun binaries cached here. |
| `src-tauri/binaries/bun-binaries.lock` | **New.** SHA pins per target triple. Committed. |
| `tests/unit/bun-sidecar-spawn.test.ts` | **New.** Bun-compatibility gate test. |
| `CLAUDE.md`, `.claude/skills/slaktforskning-mcp-dev/`, `.claude/skills/tauri-dev/` | Replace pkg / `node22-*` references. |
| `CHANGELOG.md` | `## Unreleased` entry. |

---

## Task 0: Bun compatibility gate

**Files:**
- Read-only check + new test file `tests/unit/bun-sidecar-spawn.test.ts`.

- [ ] **Step 1: Install Bun locally** — `curl -fsSL https://bun.sh/install | bash` or `brew install bun`. Verify `bun --version` reports 1.x.

- [ ] **Step 2: Bundle the current MCP server with esbuild as ESM**

```bash
mkdir -p dist-mcp-test
npx esbuild src/mcp/server.ts --bundle --platform=node --format=esm --outfile=dist-mcp-test/server.bundle.mjs 2>&1 | tail -5
```

Expected: success; verify file is ≥1 MB.

- [ ] **Step 3: Spawn the bundle under Bun via stdio; send a minimal MCP `initialize` request**

Use a one-liner shell script that pipes the JSON-RPC `initialize` frame into Bun and captures the response. **Do not use `exec()`.** Either:
- Pipe via shell directly: `echo '{...}' | bun dist-mcp-test/server.bundle.mjs > /tmp/mcp-bun-response.json`
- Or write a 5-line Node script using `spawn('bun', [...])` with stdio piping.

Expected: response contains `"jsonrpc": "2.0"` and `"result"`. **If the spawn fails: STOP.** Escalate to user before any further task.

- [ ] **Step 4: Write `tests/unit/bun-sidecar-spawn.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('Bun-sidecar compatibility gate', () => {
  it('spawns the MCP server bundle under Bun and responds to initialize', async () => {
    const bundlePath = join(__dirname, '../../dist-mcp/server.bundle.mjs');
    if (!existsSync(bundlePath)) {
      throw new Error(`Run npm run build:mcp-sidecar first; missing ${bundlePath}`);
    }

    const bun = spawn('bun', [bundlePath]);
    const responsePromise = new Promise<string>((resolve, reject) => {
      let buf = '';
      bun.stdout.on('data', (d) => {
        buf += d.toString();
        if (buf.includes('"jsonrpc"')) resolve(buf);
      });
      bun.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 5000);
    });

    bun.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0.0' } },
      }) + '\n',
    );

    const response = await responsePromise;
    bun.kill();
    expect(response).toContain('"jsonrpc"');
    expect(response).toContain('"result"');
  }, 10000);
});
```

- [ ] **Step 5: Commit**

```bash
git add tests/unit/bun-sidecar-spawn.test.ts
git commit -m "test(mcp): bun-sidecar compatibility gate"
```

---

## Task 1: Bun binary fetch script

**Files:**
- Create: `scripts/fetch-bun-binaries.mjs`
- Create: `src-tauri/binaries/bun-binaries.lock`
- Modify: `.gitignore`

- [ ] **Step 1: Determine the pinned Bun version + per-triple SHA256s**

Manually download each Bun zip from `https://github.com/oven-sh/bun/releases/download/bun-v<ver>/bun-<triple>.zip` via `curl`. Compute SHA256 via `shasum -a 256` (macOS) or `sha256sum` (Linux). Record into `bun-binaries.lock`:

```json
{
  "bun_version": "1.1.x",
  "shas": {
    "aarch64-apple-darwin": "<sha256-of-bun-darwin-aarch64.zip>",
    "x86_64-apple-darwin":  "<sha256-of-bun-darwin-x64.zip>",
    "x86_64-unknown-linux-gnu": "<sha256-of-bun-linux-x64.zip>",
    "x86_64-pc-windows-msvc":   "<sha256-of-bun-windows-x64.zip>"
  }
}
```

- [ ] **Step 2: Write `scripts/fetch-bun-binaries.mjs`**

Pattern: use `node:child_process.spawn` for `curl` and `unzip` calls (project security-hook standard — no `exec`). Read the lockfile, iterate targets, for each:
1. If `${cacheDir}/${bunName}.zip` doesn't exist, spawn `curl -fL -o ${cacheDir}/${bunName}.zip ${url}`.
2. SHA-verify via `node:crypto.createHash('sha256').update(readFileSync(zipPath))`.
3. Spawn `unzip -oq ${zipPath} -d ${extractDir}`.
4. `copyFileSync(extractDir + '/bun-<...>/bun', binDir + '/bun-<triple>')`, then `chmodSync(0o755)`.

Concrete skeleton (≤ 80 LOC):

```javascript
#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, copyFileSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(__dirname, '..');
const binDir = join(repoRoot, 'src-tauri', 'binaries');
const cacheDir = join(binDir, '.cache');
const lock = JSON.parse(readFileSync(join(binDir, 'bun-binaries.lock'), 'utf8'));

const TARGETS = [
  { triple: 'aarch64-apple-darwin', bunName: 'bun-darwin-aarch64', exe: '' },
  { triple: 'x86_64-apple-darwin',  bunName: 'bun-darwin-x64', exe: '' },
  { triple: 'x86_64-unknown-linux-gnu', bunName: 'bun-linux-x64', exe: '' },
  { triple: 'x86_64-pc-windows-msvc',   bunName: 'bun-windows-x64', exe: '.exe' },
];

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

mkdirSync(cacheDir, { recursive: true });

for (const { triple, bunName, exe } of TARGETS) {
  const url = `https://github.com/oven-sh/bun/releases/download/bun-v${lock.bun_version}/${bunName}.zip`;
  const zipPath = join(cacheDir, `${bunName}.zip`);
  if (!existsSync(zipPath)) {
    console.log(`Downloading ${url}`);
    await run('curl', ['-fL', '--silent', '--show-error', '-o', zipPath, url]);
  }
  const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
  if (sha !== lock.shas[triple]) {
    throw new Error(`SHA mismatch for ${bunName}: expected ${lock.shas[triple]}, got ${sha}`);
  }
  const extractDir = join(cacheDir, bunName);
  await run('unzip', ['-oq', zipPath, '-d', extractDir]);
  const src = join(extractDir, bunName, `bun${exe}`);
  const dst = join(binDir, `bun-${triple}${exe}`);
  copyFileSync(src, dst);
  if (!exe) chmodSync(dst, 0o755);
  console.log(`Installed ${dst}`);
}
```

- [ ] **Step 3: Run + verify**

```bash
node scripts/fetch-bun-binaries.mjs
ls -la src-tauri/binaries/bun-*
```

Expected: four `bun-<triple>` binaries.

- [ ] **Step 4: Update `.gitignore`**

```
src-tauri/binaries/.cache/
src-tauri/binaries/bun-*
```

(Lockfile committed; binaries gitignored — CI fetches per build.)

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-bun-binaries.mjs src-tauri/binaries/bun-binaries.lock .gitignore
git commit -m "build: bun binary fetch script + SHA-pinned lock"
```

---

## Task 2: Rewrite `scripts/build-mcp-sidecar.mjs` to esbuild-only

**Files:**
- Modify: `scripts/build-mcp-sidecar.mjs`

- [ ] **Step 1: Replace with esbuild-only**

```javascript
#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const distDir = join(repoRoot, 'dist-mcp');
mkdirSync(distDir, { recursive: true });

const args = [
  'esbuild',
  'src/mcp/server.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  `--outfile=${join(distDir, 'server.bundle.mjs')}`,
  '--external:fsevents',
];

const p = spawn('npx', args, { cwd: repoRoot, stdio: 'inherit' });
p.on('exit', (code) => process.exit(code ?? 1));
```

- [ ] **Step 2: Run + verify the gate test**

```bash
npm run build:mcp-sidecar 2>&1 | tail -5
ls -la dist-mcp/server.bundle.mjs
npx vitest run tests/unit/bun-sidecar-spawn.test.ts 2>&1 | tail -5
```

Expected: bundle ≥1 MB; gate test passes.

- [ ] **Step 3: Commit**

```bash
git add scripts/build-mcp-sidecar.mjs
git commit -m "build(mcp): esbuild-only sidecar bundling (no pkg)"
```

---

## Task 3: Add kkrpc dependencies

- [ ] **Step 1: Add TS dep** — `npm install kkrpc`
- [ ] **Step 2: Add Rust crate** — edit `src-tauri/Cargo.toml` to add the kkrpc crate (consult its README for exact crate name + version).
- [ ] **Step 3: `cd src-tauri && cargo check` — verify 0 errors.**
- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "deps: add kkrpc for typesafe Tauri↔Bun sidecar RPC"
```

---

## Task 4: Rewrite `src-tauri/src/mcp.rs` for kkrpc

**Files:**
- Modify: `src-tauri/src/mcp.rs`

- [ ] **Step 1: Read current spawn pattern** — `cat src-tauri/src/mcp.rs`. Identify `probe_mcp_sidecar` and its `Command::new("mcp-server-<triple>")` callsite.

- [ ] **Step 2: Rewrite to use Bun + kkrpc**

Approximate shape (adapt to kkrpc's actual API):

```rust
pub async fn probe_mcp_sidecar(app: &tauri::AppHandle, repo_root: &str, db_path: &str) -> McpProbe {
    let sidecar = app
        .shell()
        .sidecar("bun")
        .expect("bun sidecar not configured")
        .args(["server.bundle.mjs"])
        .env("MCP_DB_PATH", db_path)
        .env("MCP_REPO_ROOT", repo_root);

    // Hand to kkrpc for typed RPC bridging (see kkrpc Rust-side README).
    // The existing JSON-RPC initialize handshake is preserved; kkrpc just
    // gives typed structs over the wire.
    // ...
}
```

- [ ] **Step 3: `cargo check` + commit**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
git add src-tauri/src/mcp.rs
git commit -m "refactor(mcp): spawn sidecar via Bun + kkrpc"
```

---

## Task 5: Update `tauri.conf.json` externalBin + resources

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Replace externalBin**

```json
"bundle": {
  "externalBin": ["binaries/bun"],
  "resources": ["../dist-mcp/server.bundle.mjs"]
}
```

- [ ] **Step 2: `npm run build:bin` to test** (won't full-bundle without signing certs; binary should be produced).
- [ ] **Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "build(tauri): externalBin → bun; bundle MCP server as a resource"
```

---

## Task 6: Update capabilities

**Files:**
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Replace the mcp-server entry**

```json
{
  "identifier": "shell:allow-execute",
  "allow": [
    {
      "name": "bun",
      "sidecar": true,
      "args": ["server.bundle.mjs"]
    }
  ]
}
```

(Fixed-args constraint prevents arbitrary script execution.)

- [ ] **Step 2: Commit**

```bash
git add src-tauri/capabilities/default.json
git commit -m "capability(tauri): allow bun sidecar with server.bundle.mjs only"
```

---

## Task 7: Update release.yml build matrix

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add a Bun-fetch step in each matrix runner before `tauri build`**

```yaml
- name: Fetch Bun binary for target
  run: node scripts/fetch-bun-binaries.mjs
```

- [ ] **Step 2: Verify YAML validity** — visual inspection or `yamllint`.
- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): fetch Bun binaries before tauri build"
```

---

## Task 8: Remove `@yao-pkg/pkg` + `@yao-pkg/pkg-fetch`

- [ ] **Step 1:** `npm uninstall @yao-pkg/pkg @yao-pkg/pkg-fetch`
- [ ] **Step 2:** `grep -r '@yao-pkg' scripts/ src-tauri/ src/` returns empty.
- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: remove @yao-pkg/pkg + @yao-pkg/pkg-fetch (no longer used)"
```

---

## Task 9: macOS code-signing verification

**Files:**
- Read-only check of `.github/workflows/release.yml` macOS signing flow.

- [ ] **Step 1: Inspect the macOS signing block** — `grep -A 5 'APPLE_SIGNING_IDENTITY\|codesign' .github/workflows/release.yml`.
- [ ] **Step 2: If Tauri's bundler doesn't auto-sign externalBin resources, add an explicit codesign step**

```yaml
- name: Sign Bun binary (macOS only)
  if: runner.os == 'macOS'
  run: |
    codesign --force --options runtime --sign "$APPLE_SIGNING_IDENTITY" \
      src-tauri/binaries/bun-${{ matrix.target }}
  env:
    APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
```

- [ ] **Step 3: Commit if changes were made.**

---

## Task 10: Update CLAUDE.md + skills

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/skills/slaktforskning-mcp-dev/` (replace pkg / `node22-*` references with Bun + kkrpc)
- Modify: `.claude/skills/tauri-dev/`

- [ ] **Step 1: Grep for stale references** — `grep -rn 'pkg\|node22-' CLAUDE.md .claude/skills/`.
- [ ] **Step 2: Update each match.**
- [ ] **Step 3: Note that the dev MCP HTTP bridge (`src-tauri/src/ui_server.rs`) is unchanged** — kkrpc only replaces the production sidecar pattern.
- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md .claude/skills/
git commit -m "docs: CLAUDE.md + skills updated for kkrpc + Bun sidecar"
```

---

## Task 11: Full verification

- [ ] **`@yao-pkg/pkg` removed.** `grep -r '@yao-pkg' package.json scripts/ src-tauri/` is empty.
- [ ] **Build pipeline simpler.** `wc -l scripts/build-mcp-sidecar.mjs` < 80; `grep -c pkg scripts/build-mcp-sidecar.mjs` = 0.
- [ ] **Bun binary present.** `ls src-tauri/binaries/bun-*` shows at least the host platform's binary.
- [ ] **Gate test passes.** `npm run build:mcp-sidecar && npx vitest run tests/unit/bun-sidecar-spawn.test.ts` exits 0.
- [ ] **Playwright `[boot] MCP server starts and responds` passes.** `npx playwright test --grep '\[boot\] MCP server starts and responds'` exits 0.
- [ ] **Full build + Playwright.** `npm run build && npx playwright test` all green (4 projects).
- [ ] **Bundle-size delta measured.** `du -sh src-tauri/target/release/bundle/macos/*.app` vs v0.257.4 baseline. Document delta in close-out.

---

## Task 12: CHANGELOG + close-out

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add Unreleased entry**

```markdown
## Unreleased

### Changed

- MCP sidecar runtime migrated from `@yao-pkg/pkg`-bundled Node 22 to a shipped Bun binary spawned via [kkrpc](https://github.com/kunkunsh/kkrpc). Build pipeline reduced to a single esbuild ESM bundle; no more pkg dependency. `scripts/build-mcp-sidecar.mjs` shrunk from ~150 to ~30 LOC. Per-platform bundle size: <delta>% vs v0.257.4.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "chore: changelog for kkrpc + Bun sidecar migration"
```

---

## Self-review checklist

- [ ] Task 0 gate test confirmed Bun runs the MCP SDK before scope expansion.
- [ ] `@yao-pkg/pkg` and `@yao-pkg/pkg-fetch` removed from `package.json`.
- [ ] `scripts/build-mcp-sidecar.mjs` < 80 LOC, 0 pkg references.
- [ ] Bun binaries fetched via SHA-pinned `bun-binaries.lock`; cache gitignored.
- [ ] `src-tauri/src/mcp.rs` uses kkrpc for typed spawn-and-talk.
- [ ] `src-tauri/tauri.conf.json` externalBin → `binaries/bun`.
- [ ] `src-tauri/capabilities/default.json` allows `bun` sidecar with fixed args.
- [ ] `.github/workflows/release.yml` fetches Bun in the matrix.
- [ ] macOS Bun binary code-signing verified.
- [ ] Playwright `[boot] MCP server starts and responds` passes.
- [ ] CHANGELOG Unreleased entry with bundle-size delta.

## Failure modes / RCA reference

- **Task 0 failure** = Bun + MCP SDK incompatibility. Stop. Escalate to user — possibly fall back to Node SEA per design doc's Failure modes section.
- **kkrpc Rust crate version drift.** Pin the crate version; verify CI reproducibility.
- **Bundle size growth.** Bun is ~70 MB statically linked; expected +5-15 MB per platform vs the pkg-built node22 binary. Acceptable per user goal. Document the exact number.
- **Code-signing on macOS.** If Tauri's bundler doesn't auto-sign externalBin resources, Task 9's explicit codesign step is needed. Test on a notarized build before claiming done.

**Project security-hook note:** All shell-out from Node scripts in this plan uses `node:child_process.spawn`, not `exec()`. The project enforces this via a pre-write security hook; deviations will fail the hook.
