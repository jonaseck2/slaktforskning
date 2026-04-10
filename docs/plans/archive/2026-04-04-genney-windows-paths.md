# Fix: Genney .backup extraction fails with Windows path separators

## Problem
Importing a Genney `.backup` file (created on Windows) failed: the Derby database directory was never found, so the import either fell back to GEDCOM or threw "No Derby database found in archive."

## Root Cause
Windows zip tools use `\` as the path separator in zip entry names (e.g. `database\seg0\c660.dat`). macOS and Linux `unzip` treats `\` as a valid filename character rather than a directory separator, so the entire path becomes a single flat file named `database\seg0\c660.dat` in the extraction directory. `findDerbyDirs` walking the tree never found `service.properties` because the real Derby directory structure was never created.

## Fix
Replaced the `spawnSync('unzip', ...)` call and the `fixWindowsPaths` post-processor with `fflate.unzipSync()` (pure JS, added as an explicit runtime dependency). `fflate` returns a flat `{ [entryPath: string]: Uint8Array }` map; entry paths with `\` separators are normalised to `/` before writing, so no subprocess or post-processing is needed. Works identically on macOS, Linux, and Windows.

`cross-zip` (already a transitive dep via Electron Forge) was considered but rejected: it still delegates to `unzip` on macOS/Linux and would have the same backslash problem on those platforms.

## Files Changed
- `src/import/genney/index.ts` — replaced `spawnSync unzip` + `fixWindowsPaths` with `extractZip()` using `fflate.unzipSync`
- `package.json` — added `fflate` as a runtime dependency
