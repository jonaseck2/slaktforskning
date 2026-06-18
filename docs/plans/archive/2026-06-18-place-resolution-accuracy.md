# Place Resolution Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Real places in a user's tree resolve to the correct location and aren't flagged "ambiguous" when the resolver actually knows the answer.

**Architecture:** Three resolver-scoring/index changes in `src/api/place-gazetteers/resolver.ts` (ambiguity predicate, modern-beats-historical signal, ISO-code-alias gating) plus a deterministic offline data-cleanup transform that strips modern-name aliases from the historical gazetteers. A 15-case regression corpus (the exact reported strings) is locked first via TDD and gates every change; a real-DB re-audit is the broad net.

**Tech Stack:** TypeScript (`src/api/`), Vitest (`tests/unit/`), `node-sqlite3-wasm` for the real-DB audit harness (already written: `scripts/check-reported-places.ts`).

**Design spec:** `docs/plans/2026-06-18-place-resolution-accuracy-design.md`.

## Global Constraints

- **Prime Directive (data fidelity):** the resolver computes on render; nothing is written back to the DB. These changes are render-time scoring only — no DB mutation, no persistence. (CLAUDE.md)
- **No gazetteer frankensteins:** gazetteer `data/*.json` are build outputs. Component 2's data cleanup is a committed, tested, re-runnable transform script — never ad-hoc hand-editing of the JSON. (`.claude/skills/gazetteers`)
- **Merged-tree test shape:** tests resolve against `loadGazetteers({ enabledGazetteers: bundled.map(g=>g.id) }, bundled, [])`, NOT raw `getAllGazetteers()` — the latter bypasses `applyTranslations` so language aliases never attach. (See `tests/unit/gazetteer-disambiguation.test.ts`.)
- **Code-alias definition:** an alias is a "code alias" iff its raw (pre-normalization) source form matches `/^[A-Z]{2,3}$/` (alpha-2/alpha-3 ISO codes).
- **Worktree:** execute in `.worktrees/place-resolution-accuracy/`. Controller uses directory-flag commands (`git -C`, `npm --prefix`, `vitest --root <wt>`) per `.claude/rules/worktrees.md`. Subagents dispatched into the worktree are cwd-correct and use bare commands.

---

### Task 1: Lock the 15-case regression corpus (failing test)

**Files:**
- Create: `tests/unit/place-resolution-accuracy.test.ts`

**Interfaces:**
- Consumes: `resolvePlace` from `src/api/place-gazetteers/resolver`, `loadGazetteers` from `src/api/place-gazetteers/merge`, `getAllGazetteers` from `src/api/place-gazetteers/bundled`.
- Produces: a shared `gazetteers` merged set + a `resolveRootCountry(name)` helper later tasks reuse implicitly (test-local only).

**(Tier 1)** — Agent owns.

- [x] **Step 1: Write the failing test**

Each case asserts the resolved **root region/country** (first meaningful path segment after `World`/`World (Historical)`) and the `matchQuality`. Use `matchedPath` for the path assertion and `matchQuality` for the flag. Cases that depend on coordinates use a tolerant box.

```ts
import { describe, it, expect } from 'vitest';
import { getAllGazetteers } from '../../src/api/place-gazetteers/bundled';
import { loadGazetteers } from '../../src/api/place-gazetteers/merge';
import { resolvePlace } from '../../src/api/place-gazetteers/resolver';

/**
 * User-goal regression corpus: the 15 strings the user reported as wrong/odd
 * place pins (2026-06-18). Each asserts the correct country/region root and a
 * non-"ambiguous" quality where the resolver should be confident.
 * Design: docs/plans/2026-06-18-place-resolution-accuracy-design.md
 */
describe('place resolution accuracy — reported corpus', () => {
  const bundled = getAllGazetteers();
  const gazetteers = loadGazetteers(
    { enabledGazetteers: bundled.map(g => g.id) },
    bundled,
    [],
  );

  // matchedPath[0] is always "World" or "World (Historical)"; [1] is the
  // continent for modern, or the historical polity name for historical.
  const resolve = (name: string) => resolvePlace(name, gazetteers);
  const path = (name: string) => resolve(name)?.matchedPath ?? [];
  const quality = (name: string) => resolve(name)?.matchQuality ?? 'null';

  it('Swedish places do not land in Africa/Belarus/Faroe (RC3/RC4)', () => {
    expect(path('Västra Vingåkers sn')).toContain('Sweden');
    expect(path('Västra Vingåkers sn')).not.toContain('Senegal');
    expect(path('Torsvi by, Torsvi (C)')).toContain('Sweden');
    expect(path('Torsvi by, Torsvi (C)')).not.toContain('Belarus');
    expect(path('Tun, Lidköpings kn (R)')).toContain('Sweden');
    expect(path('Tun, Lidköpings kn (R)')).not.toContain('Tunisia');
    expect(path('Tun, Lindköpings kn (R)')).toContain('Sweden');
    expect(path('Kärret, Hov')).not.toContain('Faroe Islands');
  });

  it('modern places do not land in historical empires (RC1)', () => {
    expect(path('New York')).not.toContain('Estado Novo');
    expect(path('New York')).toContain('United States');
    expect(path('Rasht, Iran')).not.toContain('Qajar Iran');
    expect(path('Rasht, Iran')).toContain('Iran');
    expect(path('Spanien')).not.toContain('Spanish Empire');
    expect(path('Spanien')).toContain('Spain');
    expect(path('Mellangården, Edum')).not.toContain('Edom');
    expect(path('Mellangården, Edum')).toContain('Sweden');
  });

  it('confident single-location matches are not flagged ambiguous (RC2)', () => {
    expect(quality('Turkiet')).not.toBe('ambiguous');
    expect(quality('Voss, Norge')).not.toBe('ambiguous');
    expect(quality('Ytre Arna, Hordaland, Norge')).not.toBe('ambiguous');
    expect(quality('Barcelona, Spanien')).not.toBe('ambiguous');
    expect(quality('Genève, Schweiz')).not.toBe('ambiguous');
    expect(quality('Warszawa, Polen')).not.toBe('ambiguous');
  });

  it('correct places still resolve to the right country (RC2 guard)', () => {
    expect(path('Turkiet')).toContain('Turkey');
    expect(path('Voss, Norge')).toContain('Norway');
    expect(path('Barcelona, Spanien')).toContain('Spain');
    expect(path('Genève, Schweiz')).toContain('Switzerland');
    expect(path('Warszawa, Polen')).toContain('Poland');
  });
});
```

- [x] **Step 2: Run the test to confirm it fails (red)**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/place-resolution-accuracy.test.ts`
Expected: FAIL — multiple assertions fail (Senegal/Belarus/Estado Novo/ambiguous). Capture the failure list; it is the baseline.

- [x] **Step 3: Commit the red corpus**

```bash
git add tests/unit/place-resolution-accuracy.test.ts
git commit -m "test(places): lock 15-case resolution-accuracy corpus (red)"
```

---

### Task 2: ISO codes match only as whole components (RC3/RC4)

**Files:**
- Modify: `src/api/place-gazetteers/resolver.ts` (`NormPathEntry`, `NodeEntry`, `getNameIndex`, `findMatches`)
- Test: `tests/unit/place-resolution-accuracy.test.ts` (RC3 block goes green)

**Interfaces:**
- Consumes: nothing new.
- Produces: `NormPathEntry` gains `codeAliases: Set<string>`; `NodeEntry` gains `normCodeAliases: Set<string>`. Code aliases are indexed for whole-component anchoring but only *match* a path node when the matched form equals the whole comma-component.

**(Tier 1)** — Agent owns.

- [x] **Step 1: Add code-alias classification to the index types**

In `resolver.ts`, extend the index entry types:

```ts
type NormPathEntry = { name: string; aliases: Set<string>; codeAliases: Set<string> };
type NodeEntry = {
  node: GazetteerNode;
  ancestors: GazetteerNode[];
  normName: string;
  normAliases: Set<string>;
  /** Normalized forms of aliases whose RAW source was a 2–3 letter ISO code. */
  normCodeAliases: Set<string>;
  normPath: NormPathEntry[];
  pathNames: string[];
};
```

- [x] **Step 2: Populate code aliases in `getNameIndex`**

Detect code aliases from the RAW alias string (before normalization loses case). A code alias is excluded from `normAliases` (so it is never sub-token matched) but still added to the name `index` map so a whole-component lookup can anchor it.

```ts
const isCodeAlias = (raw: string) => /^[A-Z]{2,3}$/.test(raw.trim());

// inside walk(), replacing the existing normAliases build:
const normAliases = new Set<string>();
const normCodeAliases = new Set<string>();
if (node.aliases) {
  for (const alias of node.aliases) {
    const na = normalizeForGazetteer(alias, gaz);
    if (!na) continue;
    if (isCodeAlias(alias)) normCodeAliases.add(na);
    else normAliases.add(na);
  }
}
const selfNorm: NormPathEntry = { name: normName, aliases: normAliases, codeAliases: normCodeAliases };
```

Update the `entry` object to include `normCodeAliases`. Keep indexing the node under every alias form (regular AND code) so whole-component anchoring still works:

```ts
if (!index.has(normName)) index.set(normName, []);
index.get(normName)!.push(entry);
for (const na of normAliases) {
  if (na === normName) continue;
  if (!index.has(na)) index.set(na, []);
  index.get(na)!.push(entry);
}
for (const na of normCodeAliases) {
  if (na === normName) continue;
  if (!index.has(na)) index.set(na, []);
  index.get(na)!.push(entry);
}
```

- [x] **Step 3: Gate code-alias matches to whole-component in `findMatches`**

In the per-component matching loop, a code alias only counts when the form being tried is the whole component (`form === whole`):

```ts
for (const form of forms) {
  for (let pi = 0; pi < normPath.length; pi++) {
    if (usedPathIndices.has(pi)) continue;
    const np = normPath[pi];
    const isWhole = form === whole;
    const hit =
      np.name === form ||
      np.aliases.has(form) ||
      (isWhole && np.codeAliases.has(form)); // code aliases: whole-component only
    if (hit) {
      usedPathIndices.add(pi);
      matched = true;
      if (isWhole) break;
      break;
    }
  }
  if (matched && form === whole) break;
}
```

- [x] **Step 4: Run the RC3 block — verify it goes green**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/place-resolution-accuracy.test.ts -t "Africa/Belarus/Faroe"`
Expected: the RC3/RC4 test passes (Vingåker→Sweden, Torsvi→Sweden, Tun→Sweden). `Kärret, Hov` may still fail if a foreign namesake wins — note it for Task 4.

- [x] **Step 5: Run the full resolver + gazetteer suites — no regression**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/gazetteer-disambiguation.test.ts tests/unit/gazetteers.test.ts tests/unit/gazetteer-sweden.test.ts tests/unit/place-gazetteers.test.ts`
Expected: all PASS (whole-component codes like "USA" still resolve).

- [x] **Step 6: Commit**

```bash
git add src/api/place-gazetteers/resolver.ts
git commit -m "fix(places): ISO country codes match only as whole components (RC3)"
```

---

### Task 3: Ambiguity means "different places," not "different coords" (RC2)

**Files:**
- Modify: `src/api/place-gazetteers/resolver.ts` (`pickBest` ambiguity block)
- Test: `tests/unit/place-resolution-accuracy.test.ts` (RC2 block goes green)

**Interfaces:**
- Consumes: the sorted `candidates` array already produced by `pickBest`.
- Produces: a stricter `ambiguous` boolean. No signature change to `pickBest`.

**(Tier 2)** — Surface reasoning before executing: this changes the ambiguity flag for *every* place in the app. The reasoning: ambiguity should mean "the resolver genuinely cannot tell which of two different real places you meant," not "two candidates have slightly different centroids." Report the before/after ambiguous-count from the real-DB audit (Task 6) in the commit.

- [x] **Step 1: Replace the ambiguity computation in `pickBest`**

After `candidates.sort(...)` and `const best = candidates[0]`, replace the existing `sameQuality` / `distinctLocations` block with a three-part predicate:

```ts
const best = candidates[0];

// Ambiguous ONLY when the resolver genuinely cannot choose:
//  (1) the runner-up ties `best` on EVERY strong signal (the sort could not
//      separate them), AND
//  (2) they are DIFFERENT places — neither matched-path is a prefix of the
//      other (rules out province-vs-its-city), and they are not the same
//      named place from two gazetteers (rules out point-gaz + boundary-gaz
//      duplicates), AND
//  (3) they land at materially different coordinates.
function tiedOnStrongSignals(a: MatchCandidate, b: MatchCandidate): boolean {
  return a.contradictions === b.contradictions &&
         a.lastComponentMatched === b.lastComponentMatched &&
         a.unmatched.length === b.unmatched.length &&
         a.pathNodesMatched === b.pathNodesMatched &&
         a.depth === b.depth;
}
function isPrefix(short: readonly string[], long: readonly string[]): boolean {
  if (short.length > long.length) return false;
  return short.every((n, i) => n === long[i]);
}
function samePlace(a: MatchCandidate, b: MatchCandidate): boolean {
  // Same named path (point + boundary duplicate), or one path is an ancestor
  // of the other (stem vs leaf, e.g. province vs its city).
  if (isPrefix(a.matched, b.matched) || isPrefix(b.matched, a.matched)) return true;
  const an = a.path[a.path.length - 1];
  const bn = b.path[b.path.length - 1];
  return an.lat === bn.lat && an.lon === bn.lon;
}
const COORD_EPS = 0.01; // ~1 km — below this, treat as the same pin
function coordsDiffer(a: MatchCandidate, b: MatchCandidate): boolean {
  const an = a.path[a.path.length - 1];
  const bn = b.path[b.path.length - 1];
  return Math.abs(an.lat - bn.lat) > COORD_EPS || Math.abs(an.lon - bn.lon) > COORD_EPS;
}

let ambiguous = false;
for (let i = 1; i < candidates.length; i++) {
  const other = candidates[i];
  if (!tiedOnStrongSignals(best, other)) break; // sorted: once untied, rest are worse
  if (!samePlace(best, other) && coordsDiffer(best, other)) {
    ambiguous = true;
    break;
  }
}
return { best, ambiguous };
```

- [x] **Step 2: Run the RC2 + guard blocks — verify green**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/place-resolution-accuracy.test.ts -t "ambiguous"`
Run: `npx vitest run --root <worktree-abs-path> tests/unit/place-resolution-accuracy.test.ts -t "right country"`
Expected: Turkiet/Voss/Ytre Arna/Barcelona/Genève/Warszawa no longer `ambiguous`, and still resolve to the right country.

- [x] **Step 3: Run the full resolver + gazetteer suites — no regression**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/gazetteer-disambiguation.test.ts tests/unit/gazetteer-merge.test.ts tests/unit/gazetteers.test.ts`
Expected: all PASS.

- [x] **Step 4: Commit**

```bash
git add src/api/place-gazetteers/resolver.ts
git commit -m "fix(places): ambiguous means different places, not different coords (RC2)"
```

---

### Task 4: Modern matches beat historical matches (RC1 scoring)

**Files:**
- Modify: `src/api/place-gazetteers/resolver.ts` (`MatchCandidate`, `findMatches`, `isBetterCandidate`, `pickBest`)
- Test: `tests/unit/place-resolution-accuracy.test.ts` (RC1 block — partial green; data cleanup in Task 5 finishes it)

**Interfaces:**
- Consumes: candidate `path` (root node identity).
- Produces: `MatchCandidate` gains `isHistorical: boolean` (true when the candidate's root is `World (Historical)`) and `matchedHistoricalByOwnName: boolean` (true when a historical node matched on its own `name`, not a modern-exonym alias). A modern candidate outranks a historical one unless the input named the historical entity by its own name.

**(Tier 1)** — Agent owns.

- [x] **Step 1: Add the historical signals to `MatchCandidate` and `findMatches`**

Add fields to the `MatchCandidate` interface:

```ts
  /** True when this candidate's root is the "World (Historical)" tree. */
  isHistorical: boolean;
  /** True when a historical node matched on its OWN name (not a modern alias). */
  matchedHistoricalByOwnName: boolean;
```

In `findMatches`, compute them when building each candidate. The root is `fullPath[0]`; historical roots are named `World (Historical)`. "Matched by own name" means at least one input form equalled a path node's `normName` (not only an alias). Track this in the per-component loop:

```ts
// near the top of the anchor loop:
const isHistorical = fullPath[0]?.name === 'World (Historical)';
let matchedByOwnName = false;
// inside the form/path match when `hit` is true, before break:
if (np.name === form) matchedByOwnName = true;
```

Then in the pushed candidate:

```ts
candidates.push({
  // ...existing fields...
  isHistorical,
  matchedHistoricalByOwnName: isHistorical && matchedByOwnName,
});
```

- [x] **Step 2: Add the modern-beats-historical signal to `isBetterCandidate`**

Insert as the FIRST comparison in `isBetterCandidate` (above `lastComponentMatched`), so it dominates depth:

```ts
function isBetterCandidate(a: MatchCandidate, b: MatchCandidate): boolean {
  // 0. Modern beats historical UNLESS the historical one was matched by its own
  //    name (the user explicitly named the historical entity). A modern match
  //    must never lose to a historical node that only matched via a modern alias.
  const aHistAlias = a.isHistorical && !a.matchedHistoricalByOwnName;
  const bHistAlias = b.isHistorical && !b.matchedHistoricalByOwnName;
  if (aHistAlias !== bHistAlias) return !aHistAlias; // prefer the non-alias-historical one
  // 1. Last component = broadest geographic scope ...
  if (a.lastComponentMatched !== b.lastComponentMatched) return a.lastComponentMatched;
  // ...rest unchanged...
}
```

- [x] **Step 3: Mirror the signal in `pickBest`'s sort**

`pickBest` compares within one gazetteer; the merged tree is one gazetteer, so historical and modern candidates meet here. Add the same rule as the first comparator in the `candidates.sort(...)`:

```ts
candidates.sort((a, b) => {
  const aHistAlias = a.isHistorical && !a.matchedHistoricalByOwnName;
  const bHistAlias = b.isHistorical && !b.matchedHistoricalByOwnName;
  if (aHistAlias !== bHistAlias) return aHistAlias ? 1 : -1; // non-historical-alias first
  if (a.contradictions !== b.contradictions) return a.contradictions - b.contradictions;
  // ...rest unchanged...
});
```

- [x] **Step 4: Run the RC1 block — verify improvement**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/place-resolution-accuracy.test.ts -t "historical empires"`
Expected: New York→United States, Rasht→Iran, Spanien→Spain now pass. `Mellangården, Edum` may still fail if the modern Swedish "Edum" vs historical "Edom" tie isn't broken by scoring alone (Edom's `Edum` alias is the collision) — Task 5 (data cleanup) removes that alias and finishes this case. Also re-check `Kärret, Hov` from Task 2.

- [x] **Step 5: Run the full resolver suites — no regression**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/gazetteer-disambiguation.test.ts tests/unit/gazetteers.test.ts tests/unit/gazetteer-hierarchy.test.ts`
Expected: all PASS. (Historical search by the entity's own name still resolves — only alias-only historical matches are down-ranked.)

- [x] **Step 6: Commit**

```bash
git add src/api/place-gazetteers/resolver.ts
git commit -m "fix(places): modern matches beat alias-only historical matches (RC1)"
```

---

### Task 5: Strip modern-name aliases from historical gazetteers (RC1 data)

**Files:**
- Create: `scripts/clean-historical-aliases.ts` (offline transform + reusable pure function)
- Modify: `src/api/place-gazetteers/data/world-historical.json`, `src/api/place-gazetteers/data/lang-world-historical.json` (regenerated by the transform — never hand-edited)
- Modify: `scripts/build-world-historical.ts`, `scripts/build-lang-world-historical.ts` (call the same filter so future regenerations stay clean)
- Test: `tests/unit/place-resolution-accuracy.test.ts` (RC1 block fully green), `tests/unit/clean-historical-aliases.test.ts`

**Interfaces:**
- Produces: `cleanHistoricalAliases(root: GazetteerNode, modernNames: Set<string>): number` — mutates the tree in place, dropping any alias whose normalized form is in `modernNames` OR is in an explicit fragment deny-list; returns the count removed. `buildModernNameSet(gazetteers: Gazetteer[]): Set<string>` — union of normalized names + non-code aliases of every NON-historical data gazetteer.

**(Tier 2)** — Touches shipped gazetteer data. Surface the removed-alias count + the list of dropped aliases in the commit; the transform is committed and re-runnable, so the change is reviewable and reversible.

- [x] **Step 1: Write the failing unit test for the transform**

```ts
import { describe, it, expect } from 'vitest';
import { cleanHistoricalAliases } from '../../scripts/clean-historical-aliases';
import type { GazetteerNode } from '../../src/api/place-gazetteers/types';

describe('cleanHistoricalAliases', () => {
  it('drops aliases that collide with a modern place name', () => {
    const root: GazetteerNode = {
      name: 'World (Historical)', type: 'world', lat: 0, lon: 0,
      children: [
        { name: 'Qajar Iran', type: 'country', lat: 35.7, lon: 51.4,
          aliases: ['Persia', 'Iran', 'Qajar'] },
        { name: 'Estado Novo', type: 'country', lat: 38.7, lon: -9.1,
          aliases: ['New State', 'New'] },
      ],
    };
    const modern = new Set(['iran', 'persia-is-not-modern-keep']); // 'iran' collides
    const removed = cleanHistoricalAliases(root, modern);
    const qajar = root.children![0];
    const estado = root.children![1];
    expect(qajar.aliases).not.toContain('Iran');   // collided with modern
    expect(qajar.aliases).toContain('Persia');     // genuinely historical, kept
    expect(estado.aliases).not.toContain('New');   // fragment deny-list
    expect(removed).toBeGreaterThanOrEqual(2);
  });
});
```

- [x] **Step 2: Run it — confirm fail**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/clean-historical-aliases.test.ts`
Expected: FAIL — `clean-historical-aliases` not found.

- [x] **Step 3: Implement `scripts/clean-historical-aliases.ts`**

```ts
// Offline transform: strip modern-name aliases from historical gazetteers.
// Re-runnable, deterministic, no network. Folded into the build scripts so
// regenerations stay clean (gazetteers are build outputs — never hand-edit).
import * as fs from 'fs';
import * as path from 'path';
import type { Gazetteer, GazetteerNode } from '../src/api/place-gazetteers/types';
import { getAllGazetteers } from '../src/api/place-gazetteers/bundled';

const norm = (s: string) =>
  s.toLowerCase().replace(/[()]/g, ' ').replace(/-/g, ' ')
   .replace(/\s+/g, ' ').trim().replace(/[.,:;]+$/, '').trim();

// Fragments produced by over-aggressive suffix-stripping in the build — never
// legitimate standalone aliases for a historical polity.
const FRAGMENT_DENYLIST = new Set(['new', 'old', 'the', 'state']);

export function buildModernNameSet(gazetteers: Gazetteer[]): Set<string> {
  const out = new Set<string>();
  const isHistorical = (g: Gazetteer) =>
    g.id.includes('historical') || g.root?.name === 'World (Historical)';
  const walk = (n: GazetteerNode) => {
    out.add(norm(n.name));
    for (const a of n.aliases ?? []) {
      if (!/^[A-Z]{2,3}$/.test(a.trim())) out.add(norm(a)); // skip ISO codes
    }
    for (const c of n.children ?? []) walk(c);
  };
  for (const g of gazetteers) {
    if (isHistorical(g) || !g.root) continue;
    if (g.shape === 'language' || g.kind === 'language') continue;
    walk(g.root);
  }
  return out;
}

export function cleanHistoricalAliases(root: GazetteerNode, modernNames: Set<string>): number {
  let removed = 0;
  const walk = (n: GazetteerNode) => {
    if (n.aliases) {
      const kept = n.aliases.filter(a => {
        const na = norm(a);
        const drop = modernNames.has(na) || FRAGMENT_DENYLIST.has(na);
        if (drop) removed++;
        return !drop;
      });
      if (kept.length) n.aliases = kept; else delete n.aliases;
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
  return removed;
}

// CLI entry: rewrite the two historical JSONs in place.
function main() {
  const DATA = path.join(__dirname, '../src/api/place-gazetteers/data');
  const modern = buildModernNameSet(getAllGazetteers());
  for (const file of ['world-historical.json', 'lang-world-historical.json']) {
    const p = path.join(DATA, file);
    const gaz: Gazetteer = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (!gaz.root) continue;
    const n = cleanHistoricalAliases(gaz.root, modern);
    fs.writeFileSync(p, JSON.stringify(gaz, null, 2) + '\n', 'utf-8');
    console.log(`${file}: removed ${n} modern-name aliases`);
  }
}
if (require.main === module) main();
```

- [x] **Step 4: Run the transform unit test — verify pass**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/clean-historical-aliases.test.ts`
Expected: PASS.

- [x] **Step 5: Run the transform against the shipped data**

Run: `npx tsx scripts/clean-historical-aliases.ts`
Expected: prints `world-historical.json: removed N …` and `lang-world-historical.json: removed M …`. Capture N and M and the diff (`git diff --stat src/api/place-gazetteers/data/`). Confirm `Iran`, `Spanien`, `Edum`, `New` are gone; `Persia`, `Qajar` remain.

- [x] **Step 6: Fold the filter into the build scripts**

In `scripts/build-world-historical.ts` (before `fs.writeFileSync`) and `scripts/build-lang-world-historical.ts` (before its write), import and call `cleanHistoricalAliases(root, buildModernNameSet(getAllGazetteers()))` so a future SPARQL regeneration re-applies the cleanup. Add a one-line comment pointing at this plan.

- [x] **Step 7: Run the full corpus — RC1 fully green**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/place-resolution-accuracy.test.ts`
Expected: PASS — including `Mellangården, Edum` → Sweden.

- [x] **Step 8: Commit**

```bash
git add scripts/clean-historical-aliases.ts tests/unit/clean-historical-aliases.test.ts \
  src/api/place-gazetteers/data/world-historical.json \
  src/api/place-gazetteers/data/lang-world-historical.json \
  scripts/build-world-historical.ts scripts/build-lang-world-historical.ts
git commit -m "fix(places): strip modern-name aliases from historical gazetteers (RC1 data)"
```

---

### Task 6: Real-DB re-audit + full verification

**Files:**
- Modify: `scripts/check-reported-places.ts` (point at the user's `family.db`; already enumerates all 15 strings via the CASES list — confirm coverage)

**Interfaces:**
- Consumes: the running resolver + merged gazetteers.
- Produces: before/after audit output captured for the close-out evidence.

**(Tier 1)** — Agent owns.

- [x] **Step 1: Re-run the reproduction harness**

Run: `npx tsx scripts/check-reported-places.ts`
Expected: every one of the 15 cases now resolves to the correct country/region and none are `ambiguous` (except any genuine true-tie). Capture the full output.

- [x] **Step 2: Audit at scale against the real DB — no new outliers**

Adapt `scripts/check-us-places.ts` (or extend the harness) to iterate ALL places in `src-tauri/target/debug/family.db`, resolve each, and bucket outliers (wrong-country, ambiguous, unresolved). Compare the outlier count before (stash the change) and after. Capture both counts.

Run: `npx tsx scripts/check-reported-places.ts` (and the all-places audit)
Expected: the corpus cases fixed; total ambiguous + wrong-country count strictly lower than baseline; no place that previously resolved correctly now resolves wrong.

- [x] **Step 3: Full unit suite + build**

Run: `npm test --prefix <worktree-abs-path>`
Expected: `N passed` — including the new corpus + transform tests; no regressions.

Run: `npm run build --prefix <worktree-abs-path>`
Expected: `built in Xs`, exit 0.

- [x] **Step 4: e2e (places surface touched → website-export/crud tiers at minimum)**

Run: `npm run test:e2e --prefix <worktree-abs-path>` (Tier 1: `[boot]`, `[crud]`, `[website-export]`, `[duplicates]`)
Expected: `4 passed`. Per `.claude/rules/plans.md`, this plan touches the resolver feeding the map/place panel; the `[panels]` project is relevant — run `npm run test:e2e:full --prefix <worktree-abs-path>` if the places panel/map has an e2e project. Capture pass counts.

- [x] **Step 5: Commit the audit evidence**

```bash
git add scripts/check-reported-places.ts
git commit -m "test(places): real-DB re-audit confirms 15 cases fixed, no new outliers"
```

---

### Task 7: Close out

**(Tier 1)** — Agent owns.

- [x] **T-final:** Invoke the `/close-out` skill. It walks the CLAUDE.md "Finishing a plan" 6+1 steps (evidence capture, checkbox completion, `git mv` plan + design to `docs/plans/archive/`, version bump + CHANGELOG via `oss-release`, `docs/PLAN.md` sync + archive PLAN.md append, commit, merge/push), refuses partial, captures evidence. This is a fix-only plan unless the ambiguity/scoring change is deemed a feature → patch vs minor decided by `oss-release`.

---

## Self-Review

**1. Spec coverage:**
- RC1 → Task 4 (scoring) + Task 5 (data). ✓
- RC2 → Task 3. ✓
- RC3/RC4 → Task 2. ✓
- RC5 → covered by Tasks 2–3 surfacing Warszawa/Hov as correct-country `partial` (asserted in Task 1's RC2 block + Task 6 audit); no new city data, per spec scope deviation. ✓
- Verification (corpus + real-DB audit + suites) → Tasks 1, 6. ✓

**2. Placeholder scan:** No TBD/TODO; all code steps carry concrete code. Worktree-relative `<worktree-abs-path>` is a deliberate command placeholder the executor fills (per worktrees rule), not a content gap.

**3. Type consistency:** `isCodeAlias`/`normCodeAliases`/`codeAliases` consistent across Task 2. `isHistorical`/`matchedHistoricalByOwnName` consistent Task 4. `cleanHistoricalAliases`/`buildModernNameSet` signatures match between Task 5 implementation and its test. `MatchCandidate` field additions in Task 4 are read in Task 3's `tiedOnStrongSignals` only via pre-existing fields (no forward dependency on Task 4 fields).

**4. Task ordering note:** Task 3 (ambiguity) is authored before Task 4 (historical fields) but does not reference the new `isHistorical` fields, so order is safe. If executed strictly in order, Task 1's RC1 assertions stay red until Task 5 — expected and documented per-task.
