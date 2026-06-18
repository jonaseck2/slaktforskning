# Merged Gazetteer Carries Normalize Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [x]`) syntax.

**Goal:** Swedish (and other locale) place strings that use a suffix or genitive — "Ängby, Stockholms kn", "Mo, Bergs kn" — resolve to the correct Swedish place, not a stray ISO-coded country (Saint Kitts via "KN", Macao via "MO").

**Architecture:** The app resolves against a single `__merged__` gazetteer built by `loadGazetteers`. That merged gazetteer is created with `normalize: undefined`, dropping every source's `stripSuffixes` / `stripPrefixes` / `stripPatterns`. So in the merged tree, "Stockholms kn" is never reduced to "Stockholm" and no Swedish node matches — leaving the "kn"→Saint Kitts code-alias seed as the only candidate. Fix: the merge sets the merged gazetteer's `normalize` to the **union** of all contributing non-language sources' normalize rules.

**Tech Stack:** TypeScript (`src/api/place-gazetteers/`), Vitest.

**Design context:** Follow-up to `docs/plans/archive/2026-06-18-place-resolution-accuracy.md`. That plan fixed ISO sub-token matching, but the merged-tree normalize loss is a deeper, pre-existing root cause surfaced by three further user-reported cases (Ängby/Stockholms kn → Saint Kitts; Mo/Bergs kn → Macao; Boston/USA → Oregon). Verified empirically: setting `merged.normalize` to the union resolves the first two and preserves the existing 15-case corpus; Boston is a separate coverage gap (no Boston, MA in bundled data) — out of scope, documented.

## Global Constraints

- **Prime Directive:** render-time only; no DB writes. (CLAUDE.md)
- **No gazetteer frankensteins:** the fix is in the merge code, not hand-edited data. (`.claude/skills/gazetteers`)
- **Merged-tree test shape:** `loadGazetteers({ enabledGazetteers: bundled.map(g=>g.id) }, bundled, [])`.
- **Worktree:** `.worktrees/merged-gazetteer-normalize/`; controller uses `git -C` / `npm --prefix` / `vitest --root` per `.claude/rules/worktrees.md`.

## Verification

1. **User-observable outcome:** "Ängby, Stockholms kn" and "Mo, Bergs kn" resolve to Sweden; the previously-shipped 15-case corpus stays green.
2. **Check:** new cases added to `tests/unit/place-resolution-accuracy.test.ts`, red before the merge fix, green after; full `npm test` + build + e2e at close-out.

**Falsifiability:** if both pass, can the goal be unmet? Only for inputs whose Swedish node genuinely isn't in the data (e.g. Boston, MA) — documented as a coverage gap, not addressed here.

## Scope

- Modify: `src/api/place-gazetteers/merge.ts` (`loadGazetteers` — set merged `normalize` to the union of source rules).
- Modify: `tests/unit/place-resolution-accuracy.test.ts` (add the 2 fixable cases + a Boston coverage-gap guard).

### Scope deviations

- **Boston / Massachusetts not fixed.** No Boston, MA in the bundled gazetteers; resolving it would need city-level data (separate data plan). Asserted only as "stays in the United States."
- **Bare single-token ISO collisions** ("Mo", "kn", "Tun" with no other component) still match the country code — genuinely ambiguous, not in the corpus, not addressed.
- **No code-alias-only down-rank.** The union-normalize fix resolves the reported multi-component cases without it; adding a scoring down-rank is deferred unless a real case needs it.

## Tasks

### Task 1: Lock the new cases (failing)

**Files:** Modify `tests/unit/place-resolution-accuracy.test.ts`

**(Tier 1)**

- [x] **Step 1:** Add a `describe` block (or extend the corpus) with:

```ts
it('suffix/genitive Swedish strings resolve to Sweden, not an ISO-coded country (merged normalize)', () => {
  expect(path('Ängby, Stockholms kn')).toContain('Sweden');
  expect(path('Ängby, Stockholms kn')).not.toContain('Saint Kitts and Nevis');
  expect(path('Mo, Bergs kn')).toContain('Sweden');
  expect(path('Mo, Bergs kn')).not.toContain('Macao');
});

it('Boston, USA stays in the United States (no Boston, MA in bundled data — coverage gap)', () => {
  // Honest guard: we cannot pin Massachusetts without city data, but it must
  // not leave the US. Documents the coverage gap rather than over-asserting.
  expect(path('Boston, USA')).toContain('United States');
});
```

- [x] **Step 2:** Run — confirm the two `not.toContain` assertions fail (Saint Kitts / Macao), Boston passes.

Run: `npx vitest run --root <wt> <wt>/tests/unit/place-resolution-accuracy.test.ts`

- [x] **Step 3:** Commit `test(places): lock merged-normalize cases (red)`.

### Task 2: Merge carries the union of normalize rules

**Files:** Modify `src/api/place-gazetteers/merge.ts`

**(Tier 1)**

- [x] **Step 1:** In `loadGazetteers`, after collecting `dataGazetteers` (the non-language sources), build the union of their `normalize` rules and set it on each returned merged gazetteer object:

```ts
// Carry the union of every contributing source's normalize vocabulary onto the
// merged gazetteer. Without this the merged tree strips no suffixes/prefixes, so
// "Stockholms kn" / "Bergs kn" never reduce to "Stockholm" / "Berg" and a stray
// ISO code ("KN"→Saint Kitts, "MO"→Macao) becomes the only match.
const mergedNormalize = (() => {
  const suf = new Set<string>(), pre = new Set<string>(), pat = new Set<string>();
  for (const g of dataGazetteers) {
    const n = g.normalize;
    if (!n) continue;
    n.stripSuffixes?.forEach(s => suf.add(s));
    n.stripPrefixes?.forEach(s => pre.add(s));
    n.stripPatterns?.forEach(s => pat.add(s));
  }
  if (suf.size === 0 && pre.size === 0 && pat.size === 0) return undefined;
  return {
    ...(suf.size ? { stripSuffixes: [...suf] } : {}),
    ...(pre.size ? { stripPrefixes: [...pre] } : {}),
    ...(pat.size ? { stripPatterns: [...pat] } : {}),
  };
})();
```

Assign `normalize: mergedNormalize` on the merged `Gazetteer` object(s) returned by `loadGazetteers`, set BEFORE any resolver call (so it's in place when `getNameIndex` first runs and caches).

- [x] **Step 2:** Run the new cases — verify green.

- [x] **Step 3:** Run the full place/gazetteer suites — no regression:

Run: `npx vitest run --root <wt> <wt>/tests/unit/place-resolution-accuracy.test.ts <wt>/tests/unit/gazetteer-disambiguation.test.ts <wt>/tests/unit/gazetteers.test.ts <wt>/tests/unit/gazetteer-merge.test.ts <wt>/tests/unit/gazetteer-sweden.test.ts <wt>/tests/unit/checks-perf.test.ts`

- [x] **Step 4:** Commit `fix(places): merged gazetteer carries union of source normalize rules`.

### Task 3: Full verification + real-DB re-audit

**(Tier 1)**

- [x] **Step 1:** `npm test --prefix <wt>` → capture summary.
- [x] **Step 2:** Re-run `scripts/check-reported-places.ts` (extend its CASES with the 3 new strings) → capture; confirm the 2 fixable cases resolve to Sweden.
- [x] **Step 3:** `npm run build --prefix <wt>` → capture tail.
- [x] **Step 4:** `npm run test:e2e:full --prefix <wt>` → capture per-project counts.
- [x] **Step 5:** Commit any harness change `test(places): extend reproduction harness`.

### Task 4: Close out

**(Tier 1)**

- [x] **T-final:** Invoke `/close-out` (patch bump 0.271.3; the skill walks the 6+1 steps).

## Self-Review

- Spec coverage: R-A (merge normalize) → Task 2; corpus → Task 1; Boston coverage gap → Task 1 guard + scope deviation. ✓
- Placeholder scan: `<wt>` is the executor-filled worktree path, not a content gap.
- Type consistency: `mergedNormalize` shape matches the `Gazetteer.normalize` type (`stripSuffixes?`/`stripPrefixes?`/`stripPatterns?`).
