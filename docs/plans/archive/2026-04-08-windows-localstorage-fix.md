# Fix: Windows happy-dom localStorage broken in component tests

## Problem
Component tests (`PedigreeChart.test.ts`, `VisualizationView.test.ts`) failed on Windows with:
- `TypeError: localStorage.clear is not a function`
- `TypeError: localStorage.getItem is not a function`

All 678 tests passed on macOS; 12 failed on Windows.

## Root Cause
happy-dom implements localStorage via a file-persistence mechanism driven by a `--localstorage-file` CLI argument. Vitest generates this path from the OS temp directory. On Windows, the generated path is not valid for happy-dom, which logs:

    Warning: --localstorage-file was provided without a valid path

When the path is invalid, happy-dom's localStorage object exists but its methods (`getItem`, `setItem`, `clear`, etc.) are non-functional, causing the test failures.

## Fix
Added `tests/components/vitestSetup.ts` — a Vitest `setupFiles` entry that installs a complete in-memory localStorage mock on `window` before any component test runs. Wired it into `vitest.config.mts` via `setupFiles: ['./tests/components/vitestSetup.ts']` in the `components` project block.

The mock is a plain object satisfying the `Storage` interface; it resets cleanly when tests call `localStorage.clear()`.

## Files Changed
- `tests/components/vitestSetup.ts` — new file: in-memory localStorage mock
- `vitest.config.mts` — added `setupFiles` to the components test project
