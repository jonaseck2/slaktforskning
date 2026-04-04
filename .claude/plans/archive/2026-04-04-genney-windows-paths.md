# Fix: Genney .backup extraction fails with Windows path separators

## Problem
Importing a Genney `.backup` file (created on Windows) failed: the Derby database directory was never found, so the import either fell back to GEDCOM or threw "No Derby database found in archive."

## Root Cause
Windows zip tools use `\` as the path separator in zip entry names (e.g. `database\seg0\c660.dat`). macOS and Linux `unzip` treats `\` as a valid filename character rather than a directory separator, so the entire path becomes a single flat file named `database\seg0\c660.dat` in the extraction directory. `findDerbyDirs` walking the tree never found `service.properties` because the real Derby directory structure was never created.

## Fix
Added `fixWindowsPaths(baseDir)` in `src/import/genney/index.ts`, called immediately after `unzip` returns in `extractArchive`. The function:
1. Scans the extraction directory for any entry whose name contains `\`
2. Splits the name on `\`, creates intermediate directories, and moves the file to the correct path
3. Repeats until no backslash-named entries remain (handles multi-level nesting in a single zip entry)

The `unzip` exit-code-1 tolerance (already in place) handles the "backslash path separator" warning that `unzip` emits for such archives.

## Files Changed
- `src/import/genney/index.ts` — added `fixWindowsPaths()` function; call it after unzip in `extractArchive()`
