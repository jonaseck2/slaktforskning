# macOS 26 Tahoe — Electron Startup Crash

## Status
**Resolved** — fixed by upgrading Electron 41.1.1 → 41.2.0 + `--no-incremental-marking` JS flag.

## Problem
The packaged Släktforskning.app crashed immediately on macOS 26.2 Tahoe (build 25C56) with EXC_BREAKPOINT (SIGTRAP, exit 133). The crash was in Electron Framework internals (V8/cppgc garbage collector), before any app code ran. Dev mode (npm start) worked fine.

Related bug: electron/electron#49522 (closed as Not Planned / need-info)

## Fix Applied (2026-04-09)
1. Upgraded Electron from 41.1.1 to **41.2.0**
2. Added `app.commandLine.appendSwitch('js-flags', '--no-incremental-marking')` in `src/main/index.ts` to disable V8 incremental marking (the cppgc component that triggered the crash)

Packaged app launches successfully on macOS 26.2 Tahoe with both changes applied.