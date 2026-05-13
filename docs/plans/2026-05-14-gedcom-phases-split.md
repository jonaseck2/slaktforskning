# GEDCOM Phases Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** Decompose `src/import/gedcom/phases.ts` (1,163 LOC) into per-phase files under `src/import/gedcom/phases/`. Same structural-split pattern as plan 3.1.

**Architecture:** Mechanical file split. Each of the 14 phases (notes, prep-places, prep-inline-media, obje, repo, groups, sources, individuals, families, asso, place-citations, group-records, todos, submitters) moves to its own file. Shared constants (`PERSON_EVENT_TAGS`, `FAMILY_EVENT_TAGS`) move to `shared.ts`. `index.ts` re-exports the public API. `import-core.ts` orchestration unchanged.

**Tech Stack:** TypeScript, Vitest.

**Design doc:** [2026-05-14-gedcom-phases-split-design.md](2026-05-14-gedcom-phases-split-design.md)

---

## File Structure

| Path | Purpose |
|------|---------|
| `src/import/gedcom/phases/index.ts` | **New.** Re-exports all 14 phase functions. |
| `src/import/gedcom/phases/shared.ts` | **New.** `PERSON_EVENT_TAGS`, `FAMILY_EVENT_TAGS`, other shared constants. |
| `src/import/gedcom/phases/notes.ts` | **New.** `phaseNotes` (lines 98–118 of current `phases.ts`). |
| `src/import/gedcom/phases/prep-places.ts` | **New.** `phasePrepPlaces` (119–176). |
| `src/import/gedcom/phases/prep-inline-media.ts` | **New.** `phasePrepInlineMedia` (177–229). |
| `src/import/gedcom/phases/obje.ts` | **New.** `phaseObje` (230–276). |
| `src/import/gedcom/phases/repo.ts` | **New.** `phaseRepo` (277–303). |
| `src/import/gedcom/phases/groups.ts` | **New.** `phaseGroups` (304–317). |
| `src/import/gedcom/phases/sources.ts` | **New.** `phaseSources` (318–373). |
| `src/import/gedcom/phases/individuals.ts` | **New.** `phaseIndividuals` (374–758) — largest at ~385 LOC. |
| `src/import/gedcom/phases/families.ts` | **New.** `phaseFamilies` (759–931). |
| `src/import/gedcom/phases/asso.ts` | **New.** `phaseAsso` (932–982). |
| `src/import/gedcom/phases/place-citations.ts` | **New.** `phasePlaceCitations` (983–1044). |
| `src/import/gedcom/phases/group-records.ts` | **New.** `phaseGroupRecords` (1045–1117). |
| `src/import/gedcom/phases/todos.ts` | **New.** `phaseTodos` (1118–1144). |
| `src/import/gedcom/phases/submitters.ts` | **New.** `phaseSubmitters` (1145–). |
| `src/import/gedcom/phases.ts` | **Deleted.** |
| `src/import/gedcom/import-core.ts` | Import update: `from './phases'` (resolves to `./phases/index`). |
| `CHANGELOG.md` | Unreleased entry. |

---

## Task 1: Pre-flight + identify a reference GEDCOM fixture

- [ ] **Step 1: Confirm orchestrator imports `from './phases'`**

```bash
grep -n 'from .*phases' src/import/gedcom/import-core.ts
```

Note the import paths — they should resolve identically after the split.

- [ ] **Step 2: Pick a representative GEDCOM fixture (≥1k persons) for round-trip spot-check**

```bash
find tests -name '*.ged' -size +50k 2>/dev/null | head -3
```

Note the path of one. Save for use in Task 8.

- [ ] **Step 3: Capture pre-refactor import wall-clock**

```bash
# Use the existing gedcom.test.ts round-trip test as the workload
npx vitest run tests/unit/gedcom.test.ts --reporter=verbose 2>&1 | tail -10 > /tmp/gedcom-pre-refactor.txt
```

---

## Task 2: Extract shared constants

**Files:**
- Create: `src/import/gedcom/phases/shared.ts`

- [ ] **Step 1: Create directory + shared file**

```bash
mkdir -p src/import/gedcom/phases
```

- [ ] **Step 2: Move `PERSON_EVENT_TAGS` (line 43) and `FAMILY_EVENT_TAGS` (line 65) to `phases/shared.ts`**

Also move any imports those constants depend on.

- [ ] **Step 3: Update `phases.ts` to re-import them from `./phases/shared`**

```typescript
// Top of phases.ts during transition:
import { PERSON_EVENT_TAGS, FAMILY_EVENT_TAGS } from './phases/shared';
```

- [ ] **Step 4: `tsc --noEmit` + `npx vitest run tests/unit/gedcom.test.ts`**

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/import/gedcom/phases/shared.ts src/import/gedcom/phases.ts
git commit -m "refactor(gedcom): extract shared tag constants to phases/shared.ts"
```

---

## Tasks 3-16: Move each phase function (one task per phase)

For each of the 14 phases, repeat this mechanical pattern. Numbered Task 3 (notes) through Task 16 (submitters) — each is identical in shape:

**Files (per task):**
- Create: `src/import/gedcom/phases/<kebab-name>.ts`
- Modify: `src/import/gedcom/phases.ts` (remove the moved region)

- [ ] **Step 1: Cut the `phase<Name>(ctx)` function from `phases.ts` to its new file**

The new file imports `ImportContext` from `../import-types`, plus whatever else the function uses (db helpers, shared tags, etc.).

- [ ] **Step 2: Verify `tsc --noEmit` + relevant tests pass**

```bash
npx tsc --noEmit 2>&1 | grep gedcom | head -5
npx vitest run tests/unit/gedcom.test.ts --reporter=basic 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add src/import/gedcom/phases/<kebab-name>.ts src/import/gedcom/phases.ts
git commit -m "refactor(gedcom): extract phase<Name> to phases/<kebab-name>.ts"
```

**Recommended order (small phases first to validate the pattern, then large):**

| Task # | Phase | Approx LOC | File |
|--------|-------|-----------|------|
| 3 | notes | 20 | `phases/notes.ts` |
| 4 | repo | 27 | `phases/repo.ts` |
| 5 | groups | 14 | `phases/groups.ts` |
| 6 | todos | 27 | `phases/todos.ts` |
| 7 | obje | 47 | `phases/obje.ts` |
| 8 | asso | 51 | `phases/asso.ts` |
| 9 | place-citations | 62 | `phases/place-citations.ts` |
| 10 | prep-places | 58 | `phases/prep-places.ts` |
| 11 | prep-inline-media | 53 | `phases/prep-inline-media.ts` |
| 12 | sources | 56 | `phases/sources.ts` |
| 13 | submitters | ~20 | `phases/submitters.ts` |
| 14 | group-records | 73 | `phases/group-records.ts` |
| 15 | families | 173 | `phases/families.ts` |
| 16 | individuals | 385 | `phases/individuals.ts` |

After Task 16, `phases.ts` should contain only the `PERSON_EVENT_TAGS` re-import line and possibly a few stragglers.

---

## Task 17: Write `phases/index.ts`; delete `phases.ts`

**Files:**
- Create: `src/import/gedcom/phases/index.ts`
- Delete: `src/import/gedcom/phases.ts`

- [ ] **Step 1: Write the re-export index**

```typescript
// src/import/gedcom/phases/index.ts

export { phaseNotes } from './notes';
export { phasePrepPlaces } from './prep-places';
export { phasePrepInlineMedia } from './prep-inline-media';
export { phaseObje } from './obje';
export { phaseRepo } from './repo';
export { phaseGroups } from './groups';
export { phaseSources } from './sources';
export { phaseIndividuals } from './individuals';
export { phaseFamilies } from './families';
export { phaseAsso } from './asso';
export { phasePlaceCitations } from './place-citations';
export { phaseGroupRecords } from './group-records';
export { phaseTodos } from './todos';
export { phaseSubmitters } from './submitters';
export { PERSON_EVENT_TAGS, FAMILY_EVENT_TAGS } from './shared';
```

- [ ] **Step 2: Update `import-core.ts` if needed**

```bash
grep -n 'from .*phases' src/import/gedcom/import-core.ts
```

Likely the import is already `from './phases'` and resolves to `./phases/index` automatically. If it's `from './phases.ts'`, change to `from './phases'`.

- [ ] **Step 3: Delete the original phases.ts**

```bash
# Confirm it's empty / only contains the re-import line
cat src/import/gedcom/phases.ts
rm src/import/gedcom/phases.ts
```

- [ ] **Step 4: `tsc --noEmit` + full `npm test`**

```bash
npx tsc --noEmit 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Expected: 0 type errors; same test count as before.

- [ ] **Step 5: Commit**

```bash
git add src/import/gedcom/phases/index.ts src/import/gedcom/import-core.ts src/import/gedcom/phases.ts
git commit -m "refactor(gedcom): delete phases.ts; phases/index.ts is the new entry

Completes the 14-phase split. import-core.ts orchestration unchanged.
Previous 1,163-LOC monolith now lives as 14 sibling files + shared
constants + index re-export. Largest sub-file: individuals.ts at ~385 LOC."
```

---

## Task 18: Per-file LOC verification + round-trip spot-check

- [ ] **Step 1: Verify no file exceeds 600 LOC**

```bash
wc -l src/import/gedcom/phases/*.ts | sort -rn | head
```

Expected: largest is `individuals.ts` at ~385 LOC.

- [ ] **Step 2: GEDCOM round-trip spot-check**

```bash
npx vitest run tests/unit/gedcom.test.ts --reporter=verbose 2>&1 | tail -10 > /tmp/gedcom-post-refactor.txt
diff /tmp/gedcom-pre-refactor.txt /tmp/gedcom-post-refactor.txt
```

Expected: identical or wall-clock within ±5%.

- [ ] **Step 3: Document in close-out**

Record per-file LOC + pre/post wall-clock in the close-out commit message or a session note.

---

## Task 19: CHANGELOG + close-out

```bash
# CHANGELOG.md ## Unreleased:
# ### Refactored
# - `src/import/gedcom/phases.ts` (1,163 LOC) split into `src/import/gedcom/phases/`
#   with 14 per-phase files + `shared.ts` + `index.ts` re-export. `import-core.ts`
#   orchestration unchanged. GEDCOM round-trip wall-clock within ±5% of pre-refactor.

git add CHANGELOG.md
git commit -m "chore: changelog for GEDCOM phases split"
```

---

## Self-review checklist

- [ ] `src/import/gedcom/phases.ts` does not exist as a file.
- [ ] `src/import/gedcom/phases/` has 16 files (14 phase + `shared.ts` + `index.ts`).
- [ ] Largest file ≤ 600 LOC.
- [ ] `tsc --noEmit` + `npm test` pass with unchanged test count.
- [ ] GEDCOM round-trip wall-clock within ±5% of baseline.
- [ ] CHANGELOG Unreleased entry.

## Failure modes / RCA reference

Same as plan 3.1: low-risk mechanical refactor. The historical pattern this *doesn't* repeat — a "phase-as-class" hierarchy that adds indirection without solving the file-size problem. Functions in separate files are enough.

Inter-phase context leakage via `ImportContext` (all phases peek at all maps) is acknowledged and explicitly preserved. This plan does NOT try to narrow context per phase; that's a future plan.
