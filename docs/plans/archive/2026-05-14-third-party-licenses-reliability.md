# Plan — `build-third-party-licenses.mjs` reliability

Roadmap origin: every subagent dispatch in the 2026-05-14 audit-followup batch reported the same pre-existing test failure — `tests/unit/scripts.thirdPartyLicenses.test.ts` and `tests/unit/scripts.npmScripts.test.ts > 'npm run build:third-party-licenses' exits 0` failing in worktrees because `npm ls --omit=dev --all` requires a populated `node_modules`. Subagents in isolated worktrees don't always run `npm ci` first; the script then exits 1 and cascades.

Single-file design + plan.

## User goal

`npm run build:third-party-licenses` either succeeds (with a populated `node_modules`) or exits 0 with a clean "skipped — `node_modules` not populated; run `npm install` first" warning. Subagents and CI no longer get noisy false failures that have to be diagnosed and discounted on every dispatch. CI builds still produce the real `THIRD_PARTY_LICENSES.txt` because CI always runs `npm ci` first.

## Why now

Every audit-followup subagent dispatch this batch reported this as a pre-existing failure ("worktree-no-node_modules issue"). It's not blocking, but it's a constant signal-to-noise drain — every dispatch's report has to spend a paragraph saying "this 1 failure is pre-existing, unrelated." The fix is small (one early-return branch in the script).

The script's existing "cargo license not installed → warn and emit npm-only output" path shows the pattern: detect, warn, exit cleanly. Apply the same to "node_modules not populated."

## Pre-plan audit (per `audit-validation` skill)

Verify the claim that `npm ls --omit=dev --all` fails on empty `node_modules`:

```bash
# Reproduce the failure in a clean worktree:
cd <some-empty-worktree>
node scripts/build-third-party-licenses.mjs 2>&1 | head -20
# Expected: "npm ls --omit=dev --all exited 1" or similar.

# Verify the existing "cargo license missing" path is the right pattern:
grep -A 10 'cargo license' scripts/build-third-party-licenses.mjs

# Verify what tauri.conf.json beforeBuildCommand expects:
grep build-third-party-licenses src-tauri/tauri.conf.json
```

If `npm ls` fails for a different reason (e.g., specific peer-dep error rather than "deps not installed"), this plan's premise needs updating before implementation.

## Scope

Single change: add an early-return branch to `scripts/build-third-party-licenses.mjs` that detects the "node_modules not populated" condition and exits cleanly.

```javascript
// Near the top of main(), before npmLs() is called:
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const NODE_MODULES = join(ROOT, 'node_modules');
const PRINT_TARGET = process.env.LICENSES_OUTPUT ?? OUTPUT;

if (!existsSync(NODE_MODULES)) {
  console.warn(
    '[build-third-party-licenses] node_modules not found at',
    NODE_MODULES,
    '— skipping (run `npm install` first to populate).',
  );
  // Emit an empty placeholder so the bundle.resources reference doesn't break:
  writeFileSync(PRINT_TARGET, '# Third-party licenses placeholder\n\n`node_modules` was not populated when this file was generated. Run `npm install` then `npm run build:third-party-licenses` to materialise the real list.\n');
  process.exit(0);
}

// (rest of the script unchanged)
```

Alternative: also detect that `node_modules` exists but is *empty* (the rare `npm install --no-package-lock` case):

```javascript
import { readdirSync } from 'node:fs';
if (!existsSync(NODE_MODULES) || readdirSync(NODE_MODULES).length === 0) {
  // ... same skip-and-placeholder
}
```

### Scope deviations

- **Don't auto-run `npm install`.** That's surprising side-effect; CI should always run `npm ci` explicitly, and subagents should rebase + `npm install` if they need the script to produce real output.
- **Don't change the test files.** `tests/unit/scripts.thirdPartyLicenses.test.ts` and `scripts.npmScripts.test.ts` should still verify the script produces real output when `node_modules` IS populated. Update them only if they assert against the old "exit 1 on missing deps" behavior — re-read the tests during execution to decide.
- **Don't touch the placeholder content** beyond "this is a placeholder; run npm install to get the real file." Future formatting tweaks are out of scope.

## Approach

Single PR, single commit. Easy to review.

## Verification

Per `.claude/rules/plans.md`:

1. Run `node scripts/build-third-party-licenses.mjs` in a clean worktree (no `node_modules`): exits 0; placeholder `THIRD_PARTY_LICENSES.txt` is created; `console.warn` printed.
2. Run `node scripts/build-third-party-licenses.mjs` in main repo (populated `node_modules`): produces the same real `THIRD_PARTY_LICENSES.txt` as before (diff is empty or limited to the date/freshness header).
3. `tests/unit/scripts.thirdPartyLicenses.test.ts` either still passes (if it tests the happy path) OR is updated to assert the new "skip + placeholder" behavior when `node_modules` is absent.
4. `tests/unit/scripts.npmScripts.test.ts > 'npm run build:third-party-licenses' exits 0` — passes in both populated and empty worktree.
5. CI release.yml's beforeBuildCommand still produces a real `THIRD_PARTY_LICENSES.txt` (because CI always `npm ci`'s first). No regression in shipped releases.

## Failure modes / RCA reference

- **Placeholder file path collision.** `tauri.conf.json` references `../THIRD_PARTY_LICENSES.txt` as a bundle resource. If the placeholder file exists in worktrees that DO populate node_modules later, the script must overwrite it (not skip because the file already exists). Verify the script doesn't add an "already exists, skipping" check that breaks this.
- **CI environment regression.** If CI's `npm ci` step is silently skipped (e.g., a workflow change), the placeholder would ship to users. Verification step 5 guards this — keep it in the close-out evidence.
- **Tests that subprocess-run the script.** `tests/unit/scripts.thirdPartyLicenses.test.ts` doesn't currently populate `node_modules` itself; it relies on the main repo's. If a future change makes the test run in a sandbox-without-node_modules, the test would start passing (because the script skips) without actually testing the licenses output. Add a test that uses a fixture with deliberate dep tree to verify the happy path.

## Effort

1 hour. Add the early-return branch, run both tests, commit.

## Tasks

- [x] Task 0: pre-plan audit (reproduce failure, confirm the pattern).
- [x] Task 1: add the early-return branch + placeholder write.
- [x] Task 2: run `node scripts/build-third-party-licenses.mjs` in main repo to confirm no regression.
- [x] Task 3: temporarily remove `node_modules` (or use a clean worktree) and confirm the skip path exits 0.
- [x] Task 4: run `tests/unit/scripts.thirdPartyLicenses.test.ts` + `tests/unit/scripts.npmScripts.test.ts` — update if either was asserting against exit 1.
- [x] Task 5: Commit + CHANGELOG entry.
