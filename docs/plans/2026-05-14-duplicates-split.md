# `duplicates.ts` Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** Decompose `src/api/duplicates.ts` (1,649 LOC) into per-entity files under `src/api/duplicates/`. Preserve public API via `index.ts` re-export. No call-site changes.

**Architecture:** Mechanical file split: move regions, write re-export index, update test imports, run tests. No factories, no class hierarchies, no premature shared abstractions. `levenshtein` extracted to `shared.ts` only if ≥2 entities use it.

**Tech Stack:** TypeScript, Vitest.

**Design doc:** [2026-05-14-duplicates-split-design.md](2026-05-14-duplicates-split-design.md)

---

## File Structure

| Path | Purpose |
|------|---------|
| `src/api/duplicates/index.ts` | **New.** Re-exports every public symbol from per-entity files. |
| `src/api/duplicates/shared.ts` | **New.** Only contains symbols genuinely shared (e.g., `levenshtein` if ≥2 entities use it). |
| `src/api/duplicates/persons.ts` | **New.** Lines 8–410 of current file. |
| `src/api/duplicates/places.ts` | **New.** Lines 413–867 (or 431–867 if `levenshtein` moves to shared). |
| `src/api/duplicates/sources.ts` | **New.** Lines 869–1219. |
| `src/api/duplicates/media.ts` | **New.** Lines 1221–1648. |
| `src/api/duplicates.ts` | **Deleted.** |
| `tests/unit/duplicates.test.ts` | Update import → `'../../src/api/duplicates/persons'`. |
| `tests/unit/duplicates-places.test.ts` | Update import → `'../../src/api/duplicates/places'`. |
| `tests/unit/duplicates-sources.test.ts` | Update import → `'../../src/api/duplicates/sources'`. |
| `tests/unit/duplicates-media.test.ts` | Update import → `'../../src/api/duplicates/media'`. |

---

## Task 1: Pre-flight verification

- [ ] **Step 1: Confirm plan 1.2 (perf baseline) has landed**

```bash
ls docs/baseline-perf/2026-05-14/summary.md
```

Expected: file exists. If not, run plan 1.2 first.

- [ ] **Step 2: Capture pre-refactor wall-clock for dedup workload**

Run the dedup workload one more time and save the wall-clock to `/tmp/dedup-pre-refactor.txt`:

```bash
# Use whichever invocation 1.2 used for the dedup trace; e.g. a vitest run
npx vitest run tests/unit/duplicates.test.ts --reporter=verbose 2>&1 | tail -10 > /tmp/dedup-pre-refactor.txt
```

- [ ] **Step 3: Audit `levenshtein` usage**

```bash
grep -n 'levenshtein' src/api/duplicates.ts
```

Note which sections use it (sources, media, places). If ≥2 sections, plan to extract to `shared.ts` in Task 3.

---

## Task 2: Create directory + move person section

**Files:**
- Create: `src/api/duplicates/persons.ts`
- Create: `src/api/duplicates/index.ts` (temporary, just for persons; expanded in later tasks)

- [ ] **Step 1: Create the directory**

```bash
mkdir -p src/api/duplicates
```

- [ ] **Step 2: Extract person dedup**

Open `src/api/duplicates.ts`. Cut lines 1–410 (imports through `mergePersons`'s closing brace) into a new file `src/api/duplicates/persons.ts`. Copy only the imports needed for the person section (most likely `import type { Database } from '../db'`, citation/event types, etc.).

- [ ] **Step 3: Write `src/api/duplicates/index.ts`**

```typescript
export * from './persons';
// Other entity exports added in Tasks 3-5
```

- [ ] **Step 4: Update one test to verify the wiring**

In `tests/unit/duplicates.test.ts`, change the import:

```typescript
// Before
import { findDuplicates, mergePersons } from '../../src/api/duplicates';
// After
import { findDuplicates, mergePersons } from '../../src/api/duplicates/persons';
```

- [ ] **Step 5: Run vitest**

```bash
npx vitest run tests/unit/duplicates.test.ts 2>&1 | tail -5
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/api/duplicates/ tests/unit/duplicates.test.ts src/api/duplicates.ts
git commit -m "refactor(duplicates): extract person dedup to src/api/duplicates/persons.ts

First leaf of the 3.1 split. Person section moved into its own
file; index.ts re-exports the public API; test import bound
tighter. Remaining entities follow in subsequent commits."
```

---

## Task 3: Move places + decide on `shared.ts`

**Files:**
- Create: `src/api/duplicates/places.ts`
- Optionally create: `src/api/duplicates/shared.ts`
- Modify: `src/api/duplicates/index.ts`

- [ ] **Step 1: Extract place dedup**

Move the place section (currently lines 413–867 in the original file) to `src/api/duplicates/places.ts`.

- [ ] **Step 2: Decision: extract `levenshtein` to `shared.ts`?**

From Task 1 step 3, you know whether ≥2 entities use it.
- If ≥2 entities: create `src/api/duplicates/shared.ts` with `export function levenshtein(a: string, b: string): number { ... }`. Update `places.ts` to `import { levenshtein } from './shared'`.
- If only places uses it: keep `levenshtein` inside `places.ts` as a non-exported function. Don't create `shared.ts` yet.

- [ ] **Step 3: Update `index.ts`**

```typescript
export * from './persons';
export * from './places';
// (optionally): export * from './shared'; — only if shared.ts is created with exported helpers
```

- [ ] **Step 4: Update `tests/unit/duplicates-places.test.ts` import**

```typescript
import { findDuplicatePlaces, mergePlaces } from '../../src/api/duplicates/places';
```

- [ ] **Step 5: Run vitest**

```bash
npx vitest run tests/unit/duplicates-places.test.ts 2>&1 | tail -5
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/api/duplicates/ tests/unit/duplicates-places.test.ts src/api/duplicates.ts
git commit -m "refactor(duplicates): extract place dedup; <shared.ts created | levenshtein stays in places>"
```

---

## Task 4: Move sources

**Files:**
- Create: `src/api/duplicates/sources.ts`
- Modify: `src/api/duplicates/index.ts`
- Modify: `tests/unit/duplicates-sources.test.ts`

- [ ] **Step 1: Extract source dedup** (lines 869–1219).
- [ ] **Step 2: Update `index.ts`** — add `export * from './sources';`.
- [ ] **Step 3: Update test import.**
- [ ] **Step 4: `npx vitest run tests/unit/duplicates-sources.test.ts` passes.**
- [ ] **Step 5: Commit**

```bash
git add src/api/duplicates/ tests/unit/duplicates-sources.test.ts src/api/duplicates.ts
git commit -m "refactor(duplicates): extract source dedup"
```

---

## Task 5: Move media + delete original file

**Files:**
- Create: `src/api/duplicates/media.ts`
- Modify: `src/api/duplicates/index.ts`
- Modify: `tests/unit/duplicates-media.test.ts`
- Delete: `src/api/duplicates.ts`

- [ ] **Step 1: Extract media dedup** (lines 1221–1648).
- [ ] **Step 2: Update `index.ts`** — add `export * from './media';`.
- [ ] **Step 3: Update test import.**
- [ ] **Step 4: Verify `src/api/duplicates.ts` is now empty** (or contains only leftover trivia like one stray import).
- [ ] **Step 5: Delete the original file**

```bash
rm src/api/duplicates.ts
```

- [ ] **Step 6: `tsc --noEmit` against all current call sites**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: 0 errors. If errors appear, they point at consumers of the old single file — but the index re-export should preserve all symbols.

- [ ] **Step 7: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

Expected: same test count as before refactor.

- [ ] **Step 8: Commit**

```bash
git add src/api/duplicates/ tests/unit/duplicates-media.test.ts src/api/duplicates.ts
git commit -m "refactor(duplicates): extract media dedup; delete src/api/duplicates.ts

Completes the 3.1 structural split. All four entities live in
their own files; src/api/duplicates/index.ts re-exports the
full public API; existing call sites still 'import from ../api/duplicates'.
The 1,649-LOC monolith is gone."
```

---

## Task 6: Per-file LOC verification + perf comparison

- [ ] **Step 1: Verify no file exceeds 600 LOC**

```bash
wc -l src/api/duplicates/*.ts | sort -rn | head -10
```

Expected: every file ≤ 600. (Largest expected: `media.ts` at ~430 LOC.)

- [ ] **Step 2: Run the dedup workload post-refactor**

```bash
npx vitest run tests/unit/duplicates.test.ts --reporter=verbose 2>&1 | tail -10 > /tmp/dedup-post-refactor.txt
diff /tmp/dedup-pre-refactor.txt /tmp/dedup-post-refactor.txt
```

Expected: wall-clock within ±5% of pre-refactor (this is a pure structural refactor).

- [ ] **Step 3: Capture in close-out note**

Update the close-out commit message (or a session note) with:
- Per-file LOC table.
- Pre vs post dedup wall-clock + delta%.
- Reference to `docs/baseline-perf/2026-05-14/summary.md`.

---

## Task 7: CHANGELOG + close-out

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add Unreleased entry**

```markdown
## Unreleased

### Refactored

- `src/api/duplicates.ts` (1,649 LOC) split into `src/api/duplicates/{persons,places,sources,media}.ts` with `index.ts` re-export. Public API unchanged; tests bind tighter to per-entity files. No perf regression in dedup workload.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "chore: changelog for duplicates split"
```

---

## Self-review checklist

- [ ] `src/api/duplicates.ts` does not exist as a file.
- [ ] `src/api/duplicates/` has 5–6 files (4 entity + index + optional shared).
- [ ] `npx tsc --noEmit` passes; `npm test` count unchanged.
- [ ] No file in `src/api/duplicates/` over 600 LOC.
- [ ] Each `duplicates-<entity>.test.ts` imports from `src/api/duplicates/<entity>`.
- [ ] Dedup workload wall-clock within ±5% of pre-refactor.
- [ ] CHANGELOG Unreleased entry.

## Failure modes / RCA reference

- **Premature shared abstraction.** If `levenshtein` looks like it should be in `shared.ts` but only one entity uses it, leave it. Resist the urge to "make it reusable while we're in there." This is the failure mode rejected upfront in the design.
- **Half-migration.** Once Task 2 lands, do not pause indefinitely. Complete all four entities in the same PR window. A codebase with `duplicates/persons.ts` AND `duplicates.ts` is worse than either.
- **Test count drift.** If `npm test` reports a different count after the refactor, investigate before committing — a moved test that lost its import may be silently un-discovered.
