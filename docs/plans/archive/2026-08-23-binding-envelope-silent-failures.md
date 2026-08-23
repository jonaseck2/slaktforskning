# Fix: silent failures across the window.api envelope boundary

Follow-up to [2026-08-23-gedcom-import-silent-noop.md](2026-08-23-gedcom-import-silent-noop.md).
That fix repaired two envelope mismatches on the GEDCOM import path. The two
test holes it exposed had been hiding the same class of defect at five more
sites; this closes them.

## Problem

Bindings in `src/renderer/tauri-window-api.ts` signal failure with a *return
value*, not a rejection — `{ canceled: false, error }` or
`{ success: false, error }`. A consumer that guards only the success field and
omits the else branch therefore swallows every failure: no status line, no
console entry, no toast. The user sees a button that did nothing.

Each binding also invents its own envelope — `{canceled}`, `{success}`,
`{exported}`, `{imported}`, and mixtures — and until this pair of fixes no test
pinned any binding against its consumer.

## Root Cause

### Archive .zip import — real breakage, not merely an invisible error path

`api.archive.import` returns flat `{ imported: true, filePath, report }`, where
`report` is `ArchiveImportReport = { gedcomReport, mediaImported, mediaSkipped }`.

`ArchiveSection.handleImport` destructured a *nested* envelope left over from the
Electron worker channel:

```ts
| { success: true; report: { imported?: boolean; filePath?: string; report?: ImportReport } }
```

So `inner = result.report` picked up the `ArchiveImportReport`, and `inner.imported`
— a field that type does not have — was always `undefined`. The entire success
block was unreachable, including `dispatchEvent(new CustomEvent('data-imported'))`.
**Archive imports landed in the DB while every list, chart and panel stayed stale.**
`inner.report` was undefined too, so the report modal could not have rendered
even had the guard passed.

The failure path was invisible by design and visible by accident: `{ canceled:
false, error }` satisfied neither `'canceled' in result && result.canceled` nor
`'success' in result && !result.success`, so control reached `inner.imported` on
an undefined `inner` and threw a `TypeError` into the catch, which showed a
generic error.

### Four silent failure paths

| Site | Guard | Binding's failure return |
|---|---|---|
| `GedcomExportSection.vue` | `if (result.exported)`, no else | `{ canceled: false, error }` |
| `ArchiveSection.vue` (export) | `if (result.exported)`, no else | `{ canceled: false, error }` |
| `WebsiteExportView.vue` | `else if (res && !res.canceled && res.outputDir)` | `{ canceled: false, error }` |
| `DatabaseView.vue` (backup + restore) | `if (result.success)`, no else | `{ success: false, error }` |

`DatabaseView` had a second problem underneath the missing branch: `api.backup.
backup` / `.restore` encoded a *dismissed dialog* as `{ success: false, error:
'Cancelled' }`. Matching that string was the only way to tell a cancel from a
real failure, so guarding on `success` alone was the lesser evil — speak on every
cancel, or stay silent on every failure. Neither is correct.

### One discarded result

`EntityMediaSection.openFile` did `await window.api.media.openFile(id)` and
dropped the return. That binding fails with `{ success: false, error }` when the
row has no `file_ref`, no DB is open, or the shell hand-off fails.

## Fix

- `ArchiveSection.vue` — read the binding's flat shape; branch on `result.imported`
  for success and `result.error` for failure; assign `result.report` (the
  `ArchiveImportReport` the template already expects) instead of `result.report.report`.
- `GedcomExportSection.vue`, `ArchiveSection.vue` (export) — `else if (!result.canceled)`
  branch: status line, `console.error`, toast.
- `WebsiteExportView.vue` + `WebsitePanel.vue` — new `exportError` prop rendered
  through the existing `panel-error-hint`, set from the failure branch.
- `DatabaseView.vue` — cancel returns early, failure sets a `.db-status.is-error`
  line. New `database.backupFailed` / `database.restoreFailed` keys (en + sv).
- `tauri-window-api.ts` — `api.backup.backup` / `.restore` add `canceled: true`
  alongside `success: false` on a dismissed dialog, so consumers can separate
  the two without string matching. `success: false` is retained.
- `EntityMediaSection.vue` — surface `openFile`'s failure as a toast. New
  `errors.openFileFailed` key (en + sv).

Left unchanged, as the reference pattern the fixes above copy: `csv.export`
(cancel return, success branch, else error branch), `media.createFromFile`,
`media.attach`.

## Files Changed

- `src/renderer/components/import/ArchiveSection.vue` — flat envelope for import, failure branch for export
- `src/renderer/components/import/GedcomExportSection.vue` — export failure branch
- `src/renderer/views/WebsiteExportView.vue` — export failure branch + `exportError` state
- `src/renderer/components/WebsitePanel.vue` — `exportError` prop rendered as an error hint
- `src/renderer/views/DatabaseView.vue` — backup/restore failure branches, `.db-status.is-error`
- `src/renderer/components/EntityMediaSection.vue` — surface `openFile` failure
- `src/renderer/tauri-window-api.ts` — `canceled` flag on the backup/restore cancel returns
- `src/renderer/i18n/en.ts`, `sv.ts` — three new keys
- `tests/components/ArchiveSection-flow.test.ts` — new: import success/failure/cancel, export failure/cancel
- `tests/components/silent-failure-paths.test.ts` — new: GEDCOM export and backup/restore failure vs cancel
- `tests/unit/tauri-window-api.test.ts` — backup/restore cancel envelope

## Verification

All seven new tests fail against the pre-fix tree (the two binding-level ones
verified by reverting `tauri-window-api.ts` alone, since `git stash` also
stashes the test file they live in).

```
npm test              4486 passed (49.95s), 307 files
npm run test:e2e:full  174 passed, 1 flaky (2.7m)
npm run lint          0 errors, 48 warnings
vue-tsc               0 errors in src/ and tests/
npm run build:e2e     Finished release profile in 40.17s
```

## Known unrelated flake

`[duplicates] four-tab duplicates view` fails on first attempt and passes on
retry, with `executeJs: renderer script timed out`. The failing call is the
*first* eval after navigating to `/duplicates` (`duplicates.spec.ts:95`), and
`EVAL_TIMEOUT` in `src-tauri/src/ui_server.rs:30` is 15 s — so the seeded
duplicate scan holds the renderer past that budget. This predates the work here
(it was already flaky while verifying the previous fix) and nothing in this diff
touches duplicates, seeding, or the eval bridge. It is a responsiveness problem
under `.claude/rules/performance.md` "Responsiveness budget", not envelope drift,
and wants its own plan.
