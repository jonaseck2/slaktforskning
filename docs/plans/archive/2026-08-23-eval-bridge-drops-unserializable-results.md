# Fix: the eval bridge dropped replies it could not encode

Third in a chain that began with a user report that GEDCOM import "did nothing".
See [gedcom-import-silent-noop](2026-08-23-gedcom-import-silent-noop.md) and
[binding-envelope-silent-failures](2026-08-23-binding-envelope-silent-failures.md).
Both left one loose end: a `[duplicates]` e2e failure filed as an unrelated flake.
It was neither flaky nor unrelated.

## Problem

`[duplicates] four-tab duplicates view` failed with `executeJs: renderer script
timed out`, then passed on retry. The previous write-up attributed it to the
seeded duplicate scan holding the renderer past the 15 s `EVAL_TIMEOUT`.

**That attribution was wrong.** The e2e DB holds eight seeded rows; there is no
expensive scan. The claim was reasoning from the error string rather than from
evidence, and it survived into an archived document.

## Root Cause

Spawning the release binary exactly as `startApp` does and timing each eval:

```
[  348ms] seed 8 rows
[  296ms] navigate /duplicates
[  251ms] route now                      -> "/duplicates?tab=persons"
[15406ms] replace tab=persons            -> {"error":"renderer script timed out"}
[  539ms] route after                    -> "/duplicates?tab=persons"
[  763ms] replace tab=places             -> null
[  905ms] duplicates.find                -> 1
```

Deterministic, not flaky. A *redundant* `router.replace` to the already-active
route hangs; a real tab change takes 763 ms. Narrowing further:

| Eval | Result |
|---|---|
| redundant replace, result discarded | 309 ms |
| redundant replace, scalar extracted | 317 ms — `type` 16 |
| redundant replace, **raw result** | **15318 ms timeout** |
| `JSON.stringify(failure)` | `TypeError: cannot serialize cyclic structures` |
| `structuredClone(failure)` | succeeds |

`DuplicatesView`'s `onMounted` already sets `?tab=persons`, so the spec's first
`replace({ tab: 'persons' })` is a duplicate. vue-router resolves it with a
`NavigationFailure` (`NavigationFailureType.duplicated` = 16) carrying `from`
and `to` route records that reference each other.

`ui_server.rs` wraps every script as `const __r = await (script)` and hands the
result to `window.__taurisUiCallback`, which called
`invoke('ui_eval_response', { id, value })`. That payload is **JSON**-encoded,
so the cyclic value made `invoke` reject — and `main.ts` swallowed the
rejection into `.catch(e => console.error('[ui-callback]', e))`. No reply
reached Rust, the pending oneshot never fired, and the caller waited out the
full `EVAL_TIMEOUT`.

So "renderer script timed out" was a misreport: nothing timed out, the reply
was dropped. The renderer's `console.error` is not piped to the app's stdout,
which is why the real reason never appeared in any log.

This is the same defect class as the two fixes before it — an error swallowed
at a boundary, surfacing as "nothing happened" — this time in the test harness
rather than the product.

## Fix

**Primary, at the root.** New `src/renderer/ui-bridge-response.ts`:
`encodeEvalResult` returns the value when JSON can carry it and an
`{ __error }` descriptor when it cannot, so a reply always goes back. The
descriptor names the constructor, a vue-router `type=N`, and the first keys,
and tells the caller to return a projection instead. `main.ts` routes the
callback through it. This fixes every eval returning a cyclic value, not just
this one.

**Secondary, at the call site.** `duplicates.spec.ts` appends `.then(() => null)`
to the navigation — it only needs the navigation to happen, not its result.

Deliberately *not* changed: `DuplicatesView`'s redundant `router.replace`. It is
correct behaviour (vue-router is telling the caller the navigation was already
satisfied), and suppressing it would hide the signal rather than fix the bridge.

## Files Changed

- `src/renderer/ui-bridge-response.ts` — new: `encodeEvalResult`, `describeUnserializable`
- `src/renderer/main.ts` — route the callback through `encodeEvalResult`
- `tests/e2e/duplicates.spec.ts` — discard the navigation result
- `tests/e2e/app.test.ts` — new `[boot]` test: a cyclic result answers in < 10 s
- `tests/unit/ui-bridge-response.test.ts` — new: 8 tests over both helpers

## Verification

Both new tests fail against the pre-fix tree; the e2e one fails with the exact
15003 ms stall on a two-line cyclic object.

Same repro after the fix — case C, the raw redundant replace:

```
[265ms] C: redundant replace, RAW result ->
  {"__error":"eval result is not serializable (JSON.stringify cannot serialize
   cyclic structures.): Error type=16 keys=[type, to, from]. Have the script
   return a projection of the value instead ..."}
```

15318 ms → 265 ms, with a message naming the cause and the way out.

```
npx playwright test --project=duplicates   1 passed (3.2s), then 3.1s / 3.1s / 3.1s
npm run test:e2e:full                      176 passed (2.7m), zero flaky
npm test                                   4494 passed (47.73s), 308 files
npm run lint                               0 errors, 48 warnings
vue-tsc                                    0 errors in src/ and tests/
npm run build:e2e                          Finished release profile in 27.46s
```

The duplicates spec previously burned 15 s and failed on first attempt on
*every* run, passing only on retry. It now passes first attempt in ~3 s, and
`test:e2e:full` is fully green with no flaky entries for the first time in this
sequence of fixes.

## Correction to the prior archive

`2026-08-23-binding-envelope-silent-failures.md` says under "Known unrelated
flake" that the seeded duplicate scan holds the renderer past the eval budget.
That is wrong on both counts — it is not a scan, and it is not flaky. This
document supersedes it.
