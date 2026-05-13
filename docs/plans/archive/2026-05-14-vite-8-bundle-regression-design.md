# Design — Vite 8 bundle regression investigation

**Roadmap reference:** [2026-05-14-audit-followup-roadmap.md](2026-05-14-audit-followup-roadmap.md) §1.1.

## User goal

I can read a measured before/after diff in `docs/plans/2026-05-14-vite-8-bundle-regression-rca.md` and tell, in one paragraph, why the post-Vite-8 bundle is the size it is. If the regression is cheaply fixable, it gets fixed in this plan. If it's structural to Rolldown's chunking model and not cheap, the plan documents it and we accept it (the roadmap's bundle work moves to a separate plan for the gazetteer architecture).

## Why now

User reported in conversation 2026-05-14 that the v0.256-era build was "much smaller." Vite 8 upgrade close-out plan ([archive/2026-05-13-vite-8-upgrade.md](archive/2026-05-13-vite-8-upgrade.md)) declared "matching expectation" without comparing against a Vite 7 baseline — the bundle was measured at 72 MB total post-upgrade, but the pre-upgrade measurement was `tauri-window-api-*.js = 30 MB raw / 7.4 MB gzipped` from a different code path (eagerly inlined, before the URL-asset fix landed). The two metrics aren't comparable, so the close-out plan's "not a regression" claim is unfounded against the user-reported evidence.

This plan exists to apply the discipline [`.claude/rules/plans.md`](../../.claude/rules/plans.md) §"Verification discipline at close-out" calls out: produce evidence, not assertion.

## Scope

1. **Capture pre-Vite-8 baseline.** From clean checkout of `v0.257.3` (the tag immediately before the Vite 8 upgrade commit `64a1c3f6`):
   - `npm install`
   - `npm run build`
   - Record: `du -sh dist-tauri`, `du -h dist-tauri/assets/* | sort -h | tail -10`, `ls dist-tauri/assets/*.js | wc -l`, `ls dist-tauri/assets/*.json | wc -l`, `du -sh dist-static` (one number).
2. **Capture current baseline.** Same metrics on current `main` (post-Vite-8). Use a separate worktree or `git stash` to switch between checkouts cleanly.
3. **Diff the two outputs.** Produce a table: metric / pre / post / delta / delta%. Identify which chunk(s) grew and by how much.
4. **Try up to three obvious tunings** on the regressed chunks, in order of increasing cost:
   - **(a) `assetsInlineLimit`** — Vite 8 may have changed data-URL inlining behavior for small assets. Verify `mc-quartiers.json` (the 2.4 KB gazetteer noted in the close-out plan as a data-URL) is still inlined identically; check whether other small JSONs that were *not* inlined under Vite 7 are now inlined (or vice versa). One-line config change if mismatched.
   - **(b) `rolldownOptions.output.manualChunks`** — if Rolldown's automatic grouping created a new fat chunk (e.g., bundling all gazetteer rule-files into a single chunk that Rollup previously split), an explicit `manualChunks` directive can restore the old shape.
   - **(c) `import.meta.glob` reshape** — [Vite Issue #21876](https://github.com/vitejs/vite/issues/21876) shows `import.meta.glob` behavior changed in Vite 8. If the regression is here, try the documented workarounds (explicit `as: 'url'` instead of `query: '?url'`, separate glob calls per gazetteer category, etc.).
5. **Write the RCA file** at `docs/plans/2026-05-14-vite-8-bundle-regression-rca.md` with: the measurement table, the named root cause (citing specific Vite/Rolldown behavior with line numbers if relevant), what tunings were tried, and the decision.

### Scope deviations

- **Static SPA bundle** (`dist-static/`) is in scope for **measurement** (one `du` number) but not for tuning. The close-out plan measured 1.4 MB / 416 KB gzip; `vite-plugin-singlefile` is a different code path. If it regressed materially, note it in the RCA; don't try to fix it in this plan.
- **Bisecting Vite 8 internals** (compiling Vite from source, isolating which commit introduced the regression) is out of scope. The user goal is "tell me why," not "fix at any cost." A multi-day Vite-internal investigation belongs in an upstream Vite issue, not this plan.
- **Switching off Rolldown** (using the `experimental.rollup` flag if it still exists in Vite 8) is out of scope as a fix — that's accepting structural defeat. May appear in the RCA as a recommendation if the regression is severe and structural.

## Approach choice

**Measurement-first, then up to three cheap tunings, then writeup.** Not bisect-driven. Not full re-architecture. The reasoning: the user picked "investigate, then decide" — the plan's value is the measured diff and named cause, not the fix itself. If a fix is cheap (a `manualChunks` directive), do it; if it isn't, the writeup IS the deliverable.

## Verification

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) §"User-goal-falsifiability check":

1. **`docs/plans/2026-05-14-vite-8-bundle-regression-rca.md` exists** and contains:
   - Pre-Vite-8 measurement section (raw `du` output pasted in a code block).
   - Post-Vite-8 measurement section (raw `du` output pasted in a code block).
   - A diff table: metric / pre / post / delta / delta%.
   - A named root cause: ≥1 paragraph citing the specific Vite or Rolldown behavior responsible (with link to the Vite issue, source file, or release-note line if applicable).
   - A "What was tried" section listing each of the (a)/(b)/(c) tunings attempted, with the result (worked / didn't help / made it worse).
   - A "Decision" section: one of `fixed-in-plan` / `accepted-as-structural` / `escalated-to-followup`.
2. **If `fixed-in-plan`:** current `npm run build` produces a bundle within ±5% of the captured v0.257.3 baseline on raw `du -sh dist-tauri`. Evidence: paste the new `du -sh` and the math.
3. **If `accepted-as-structural`:** the RCA names the specific Rolldown behavior responsible and links to an upstream Vite GitHub issue (existing or newly filed). `CHANGELOG.md` has an `Unreleased` entry acknowledging the regression.
4. **If `escalated-to-followup`:** a skeleton plan file exists at `docs/plans/2026-05-14-gazetteer-bundle-architecture-design.md` — User goal + Scope section only; full design is a separate brainstorm.

User-goal-falsifiability check: if every item passes, can the user still not know why the bundle is bigger? **No** — items 1c and 1d force the writeup to contain the diff and the cause, regardless of which decision branch is taken.

## Failure modes / RCA reference

**This plan exists because the Vite 8 close-out plan ([archive/2026-05-13-vite-8-upgrade.md](archive/2026-05-13-vite-8-upgrade.md)) declared "matching expectation" without a comparable Vite 7 baseline.** That close-out passed every verification gate written into the plan (lint, tests, build exit code, even e2e against the Tauri bundle) but its user-goal-falsifiability test had holes — none of the gates would have caught a 30%+ bundle-size increase, because no gate measured against a comparable baseline. This is the exact pattern [`.claude/rules/plans.md`](../../.claude/rules/plans.md) "User-goal-falsifiability test (L1, RCA 2026-05-12)" was written to prevent. The lesson for this plan: verification items 1c and 1d are the falsifiability check — they make it impossible to close the plan with "tests are green" if the underlying user goal (knowing why the bundle is the size it is) isn't met.

## Effort

1–2 days. Half a day for measurement + diff, half a day for tunings, the rest for writeup and decision.

## Tasks (high-level — implementation plan will expand)

- [ ] Capture pre-Vite-8 baseline measurements.
- [ ] Capture post-Vite-8 baseline measurements on current `main`.
- [ ] Write diff table.
- [ ] Try tuning (a): `assetsInlineLimit`.
- [ ] Try tuning (b): `manualChunks`.
- [ ] Try tuning (c): `import.meta.glob` reshape.
- [ ] Write RCA file with measurement, cause, tunings tried, decision.
- [ ] If `fixed-in-plan`: ship the fix; if `accepted-as-structural`: write `CHANGELOG.md` Unreleased entry; if `escalated-to-followup`: write skeleton design.
- [ ] Self-review checklist (added by writing-plans skill).
