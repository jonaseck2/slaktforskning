# Släktforskning — Tauri spike

Minimal Tauri 2.x + Vue 3 + Vite app used to evaluate a possible Tauri
port of the main Electron build. See `docs/plans/tauri-port-evaluation.md`
in the parent repo for the spike's purpose and decision rule.

## Toolchain prerequisites

The spike must build cleanly on macOS, Windows, and Linux for the
cross-platform parity step in the recommendation. Each OS needs a
working Rust + system C toolchain on top of Node.js 22+.

### Common (all OSes)

- Node.js 22+ and npm 10+ (`node --version` / `npm --version`)
- Rust stable 1.80+ via rustup (`rustc --version`)
  - Recommended install: <https://rustup.rs>
- The `tauri-cli` is a dev-dependency of this package — it is fetched by
  `npm install`; no global install required.

### macOS

- Xcode Command Line Tools (`xcode-select --install`) — provides clang +
  the macOS SDK. No additional setup.
- Apple Silicon and Intel both work.

### Windows 10 / 11

- **Rust via rustup.** Easiest install path on a clean machine is winget:
  ```powershell
  winget install --id Rustlang.Rustup --exact --silent `
    --accept-package-agreements --accept-source-agreements
  ```
  After install, open a new shell so `cargo` / `rustc` land on `PATH`
  (rustup writes them to `%USERPROFILE%\.cargo\bin`).
- **Microsoft C++ Build Tools.** Rust on Windows uses the MSVC linker.
  Install via winget — note the **explicit `Microsoft.VisualStudio.Component.VC.Tools.x86.x64`
  component**. The `Microsoft.VisualStudio.Workload.VCTools` workload alone
  installs the IDE shell but NOT the actual `cl.exe`/`link.exe` binaries
  Rust needs (verified: a workload-only install left `vcvars64.bat` and
  `VC\Tools\MSVC\` missing). The component must be added explicitly:

  ```powershell
  # Run from an elevated PowerShell. winget's installer override does not
  # auto-elevate for VS Build Tools' --quiet/--passive modes.
  winget install --id Microsoft.VisualStudio.2022.BuildTools --exact `
    --silent --accept-package-agreements --accept-source-agreements `
    --override "--passive --norestart --includeRecommended `
                --add Microsoft.VisualStudio.Workload.VCTools `
                --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
                --add Microsoft.VisualStudio.Component.Windows11SDK.22621"
  ```

  ~5-6 GB download (full MSVC toolchain + Windows SDK). Verify success
  with vswhere — must print the install path, not silently exit:
  ```powershell
  & 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe' `
    -products '*' -requires Microsoft.VisualCpp.Tools.HostX64.TargetX64 `
    -property installationPath
  ```
  If empty: the compiler component didn't land. Re-run the install with
  the override above. Without `link.exe` on the search path, `cargo build`
  emits `error: linking with 'link.exe' failed`.

- **Don't run cargo from Git Bash.** Git Bash ships its own `link`
  (a coreutils alias for `ln`) at `/usr/bin/link` which shadows MSVC's
  `link.exe` in `$PATH` order. Use a Developer Command Prompt, plain
  `cmd.exe`, or PowerShell — anywhere except Git Bash. (Or prepend
  `$env:USERPROFILE\.cargo\bin` and the MSVC `Hostx64\x64` dir to your
  PATH explicitly.)
- **WebView2 Runtime.** Pre-installed on Windows 11 and any Windows 10
  with current Edge updates. Verify presence:
  ```powershell
  (Get-ItemProperty -Path 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}').pv
  ```
  If absent: `winget install --id Microsoft.EdgeWebView2Runtime`.
- A reboot is **not** required after MSVC Build Tools install, but a
  fresh terminal session is.

### Linux (Ubuntu / Debian families)

System dependencies for Tauri 2.x's WebKitGTK target:

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

Fedora / Arch packages have equivalents — see
<https://tauri.app/start/prerequisites/>.

## Build + run

Once the toolchain is in place:

```bash
cd tauri-spike
npm install            # fetches Vue/Vite + tauri-cli
npm run tauri dev      # opens a window with HMR
npm run tauri build    # produces a release bundle in src-tauri/target/release/bundle/
```

The first `cargo build` resolves and compiles all Rust dependencies
(rusqlite + bundled SQLite + Tauri runtime). Cold compile is 5-15
minutes depending on CPU + cache state; subsequent builds are
incremental and seconds.

## What's in the spike

Three Rust modules glue Tauri to a real Släktforskning database:

- `src-tauri/src/db.rs` — rusqlite 0.33 (bundled mode), opens a `.db`
  file in **DELETE journaling mode** + foreign keys enforced, exposes
  `db_open`, `db_close`, `db_is_open`, `db_stats`, `persons_list`,
  `get_ancestor_tree`. DELETE mode is deliberate (single-user genealogy
  app + cross-tool compat with the Electron build's node-sqlite3-wasm,
  which can't open WAL-tagged files). Every `db_open` issues an
  explicit `PRAGMA journal_mode = DELETE` so a previously-WAL-tagged
  file is checkpointed + downgraded on next access — see
  `.claude/skills/sqlite-wal/` and `examples/walfix.rs` for the rescue
  story behind that choice.
- `src-tauri/src/mcp.rs` — spawns the existing `src/mcp/server.ts` of
  the parent repo as a sidecar, validates an MCP `initialize` round
  trip via stdio.
- `src-tauri/src/lib.rs` — `open_second_window`, `broadcast_data_changed`
  for multi-window propagation; registers all of the above on the
  `invoke_handler`.

The Vue side (`src/`) renders two views: a paginated persons list and a
4-generation pedigree chart in raw SVG. No third-party chart library.

## Validating against a real database

The spike opens any existing slaktforskning SQLite database — the
default path it tries is `bengt.db` in the spike's working directory.
Drop a real database next to the binary (or update the
`db_open` call site in `src/App.vue`) and the spike will populate the
persons list + pedigree chart from real data.

For first-time setup on Windows or Linux: copy a known-good DB from the
main app's `~/Library/Application Support/slaktforskning/` (mac) /
`%APPDATA%\slaktforskning\` (win) / `~/.local/share/slaktforskning/`
(linux) — same SQLite schema, same DELETE journaling.

## Bundle targets

`src-tauri/tauri.conf.json` `bundle.targets` is set to
`["app", "appimage", "nsis"]` — the **portable formats per OS**:

- **macOS `.app`** — drag-to-Applications folder; no separate `.dmg`
  installer is produced.
- **Linux `.AppImage`** — single self-extracting executable; no
  `.deb` / `.rpm` installer (those land in Phase 7 of the full-port
  plan if/when distro-specific repos become a release target).
- **Windows `.exe` (NSIS self-extracting setup)** — easier than `.msi`
  to distribute outside corporate environments; the raw
  `target/release/<name>.exe` also works as a true portable binary.

Switch back to `"all"` if you need the installer formats during signing
/ notarization work in Phase 4.
