# macOS 26 Tahoe — Electron Startup Crash

## Status
Open — blocked on Electron upstream fix

## Problem
The packaged Släktforskning.app crashes immediately on macOS 26.2 Tahoe (build 25C56) with EXC_BREAKPOINT (SIGTRAP, exit 133). The crash is in Electron Framework internals (V8/cppgc garbage collector), before any app code runs. Dev mode (npm start) works fine.

Confirmed bug: electron/electron#49522

## Known Facts
- Affects all current stable Electron versions tested: 41.0.2, 41.1.1, 42.0.0-beta.1
- Not caused by quarantine (xattr -cr does not help)
- Not caused by our app code (crash is in ElectronMain before JS runs)
- npm start works because it runs the Electron binary from node_modules directly
- Apple may fix at OS level in a later macOS 26 build (user is on 25C56)

## Investigation Options

### Option 1: Monitor electron/electron#49522
Watch the issue for a fix landing in a stable Electron release.
- Low effort, just wait
- No ETA

### Option 2: Test newer macOS 26 builds
Apple may fix the incompatibility in a later 26.2 or 26.x beta.
- Try the packaged app on each new macOS 26 beta update

### Option 3: Try Electron nightly builds
electron/nightlies on GitHub may contain the fix before a stable release.
- Risk: nightlies are unstable, may break other things
- Check: https://github.com/electron/electron/releases (filter pre-releases)

### Option 4: Chromium launch flags
The crash is a DCHECK in cppgc. Some Chromium flags can disable assertions or
change GC behavior. Worth trying in forge.config.ts via additionalArguments:
- --js-flags=--no-incremental-marking
- --disable-features=V8VmFuture
- Low confidence these help, but cheap to test

### Option 5: Build Electron from source with the fix patch
If a fix lands in electron main branch before a release, we can patch locally.
- High effort, not worth it unless urgent

## Current State
App version 0.38.4 is on Electron 41.1.1 (latest stable).
Using npm start for all dev/testing on macOS 26 in the meantime.
