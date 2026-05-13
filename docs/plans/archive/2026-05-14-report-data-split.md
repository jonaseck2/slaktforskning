# `report_data.ts` Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** Decompose `src/api/report_data.ts` (1,208 LOC) into per-report files. Discover shared traversal helpers post-split — extract to `shared.ts` only if ≥2 reports use them with identical shape.

**Architecture:** Mechanical split (same pattern as 3.1 and 3.3) + observation-driven helper extraction. The audit's claim of shared walk-ancestors/collect-events scaffolding is validated or disproved during the split — not assumed upfront.

**Tech Stack:** TypeScript, Vitest.

**Design doc:** [2026-05-14-report-data-split-design.md](2026-05-14-report-data-split-design.md)

---

## File Structure

| Path | Purpose |
|------|---------|
| `src/api/report_data/index.ts` | **New.** Re-exports public API. |
| `src/api/report_data/types.ts` | **New.** Genuinely-shared interfaces (`EventWithPlace`, `CitationWithSource`, `RelationshipSummary`). |
| `src/api/report_data/person-summary.ts` | **New.** `getPersonSummary` + `PersonSummary` type. |
| `src/api/report_data/family-unit.ts` | **New.** `getFamilyUnit` + `FamilyUnit`/`FamilyMember`. |
| `src/api/report_data/ancestor-tree.ts` | **New.** `getAncestorTree` + `AncestorNode`. |
| `src/api/report_data/place-history.ts` | **New.** `getPlaceHistory` + `PlaceHistory`/`PlaceEventRecord`. |
| `src/api/report_data/research-gaps.ts` | **New.** `getResearchGaps` + `ResearchGaps`. |
| `src/api/report_data/timeline.ts` | **New.** `getTimeline` + `TimelinePartner`/`TimelineEntry`/`TimelineOptions`. |
| `src/api/report_data/alive-in-year.ts` | **New.** `getAliveInYear` + `AliveInYearPerson`/`AliveInYearFamily`/`AliveInYearResult`. |
| `src/api/report_data/shared.ts` | **New ONLY IF migration finds ≥2-report identical patterns.** |
| `src/api/report_data.ts` | **Deleted.** |
| `CHANGELOG.md` | Unreleased entry. |

---

## Task 1: Pre-flight + type audit

- [ ] **Step 1: Verify the existing test file structure**

```bash
grep -n '^describe' tests/unit/report_data.test.ts | head -15
```

Expected: per-report `describe` blocks. The test file's import line stays `from '../../src/api/report_data'` (resolves through `index.ts`).

- [ ] **Step 2: Audit lines 16–213 (interface declarations)**

Open `src/api/report_data.ts`. For each interface in lines 16–213, mark:
- "Shared" if used by ≥2 reports → goes to `types.ts`.
- "Report-specific" if used by only one report → goes with its report.

Expected candidates for `types.ts`: `EventWithPlace`, `CitationWithSource`, `RelationshipSummary`. Report-specific: `PersonSummary`, `FamilyMember`, `FamilyUnit`, `AncestorNode`, `PlaceEventRecord`, `PlaceHistory`, `ResearchGaps`, `TimelinePartner`, `TimelineEntry`, `TimelineOptions`, `AliveInYear*`.

---

## Task 2: Create directory + types.ts

**Files:**
- Create: `src/api/report_data/types.ts`

- [ ] **Step 1: Create directory + move shared types**

```bash
mkdir -p src/api/report_data
```

Move `EventWithPlace`, `CitationWithSource`, `RelationshipSummary` (and any others tagged "Shared" in Task 1 step 2) from `report_data.ts` to `report_data/types.ts`.

- [ ] **Step 2: Update `report_data.ts` to re-import**

```typescript
import type { EventWithPlace, CitationWithSource, RelationshipSummary } from './report_data/types';
```

- [ ] **Step 3: `tsc --noEmit` + commit**

```bash
npx tsc --noEmit 2>&1 | tail -5
git add src/api/report_data/types.ts src/api/report_data.ts
git commit -m "refactor(report_data): extract shared types to report_data/types.ts"
```

---

## Tasks 3-9: Move each report function (one task per report)

Mechanical split, same pattern as plan 3.1. For each report:

| Task # | Report | Approx LOC | File |
|--------|--------|-----------|------|
| 3 | getResearchGaps | ~42 | `research-gaps.ts` |
| 4 | getPlaceHistory | ~41 | `place-history.ts` |
| 5 | getFamilyUnit | ~49 | `family-unit.ts` |
| 6 | getAncestorTree | ~58 | `ancestor-tree.ts` |
| 7 | getPersonSummary | ~89 | `person-summary.ts` |
| 8 | getAliveInYear | ~220 | `alive-in-year.ts` |
| 9 | getTimeline | ~270 | `timeline.ts` |

For each task:

- [ ] **Step 1: Cut the function + its report-specific types from `report_data.ts` to its new file**
- [ ] **Step 2: Update imports inside the new file** (shared types from `./types`, db helpers from `../db`, etc.)
- [ ] **Step 3: Update `report_data.ts` to re-import the function back** (temporary, during transition)
- [ ] **Step 4: `npx tsc --noEmit` + `npx vitest run tests/unit/report_data.test.ts -t <report-name>` passes**
- [ ] **Step 5: Commit**

```bash
git add src/api/report_data/<file>.ts src/api/report_data.ts
git commit -m "refactor(report_data): extract <reportName> to report_data/<file>.ts"
```

---

## Task 10: Write `index.ts`; delete `report_data.ts`

**Files:**
- Create: `src/api/report_data/index.ts`
- Delete: `src/api/report_data.ts`

- [ ] **Step 1: Write the re-export index**

```typescript
// src/api/report_data/index.ts

export * from './types';
export * from './person-summary';
export * from './family-unit';
export * from './ancestor-tree';
export * from './place-history';
export * from './research-gaps';
export * from './timeline';
export * from './alive-in-year';
// (optionally) export * from './shared'; — added in Task 11 if helpers extracted
```

- [ ] **Step 2: Verify `report_data.ts` is now empty (or just contains the re-import stubs)**

```bash
cat src/api/report_data.ts
```

- [ ] **Step 3: Delete it**

```bash
rm src/api/report_data.ts
```

- [ ] **Step 4: `npx tsc --noEmit` + `npm test`**

Expected: 0 errors; test count unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/api/report_data/index.ts src/api/report_data.ts
git commit -m "refactor(report_data): delete monolith; index.ts is the new entry

Completes the 7-report split. All seven report builders live in
their own files; report-specific types colocate with their builder;
shared types in types.ts. Helper extraction analysis follows in
the next commit."
```

---

## Task 11: Helper extraction analysis

**Files:**
- Possibly create: `src/api/report_data/shared.ts`

- [ ] **Step 1: Compare the 7 report files side-by-side**

Look for patterns that appear identically (not just similarly) in ≥2 files. Likely candidates:
- Walking ancestors via `parent_id` to depth N.
- Collecting events for a person + filtering by type.
- Sorting events by date (with `date_type` handling for "about", "before", etc.).

```bash
# List functions/inline-loops by similarity:
grep -nE 'function |const \w+ =|while \(|for \(' src/api/report_data/*.ts | head -30
```

- [ ] **Step 2: For each candidate**

Determine: identical shape, or cousins-but-different?
- If identical in ≥2 files: extract to `shared.ts` with a focused signature.
- If cousins (e.g., one walks `parent_id`, another walks `couple_id`): leave them separate. Document the decision in close-out.

- [ ] **Step 3: If extracting, write `src/api/report_data/shared.ts`**

```typescript
// Example — only include functions that ≥2 reports use with identical shape:

export async function walkAncestorsToDepth(db: Database, personId: string, depth: number): Promise<AncestorRow[]> {
  // ... shared implementation
}
```

- [ ] **Step 4: Update consumers to import from `./shared`**

- [ ] **Step 5: `npm test` + commit**

```bash
git add src/api/report_data/
git commit -m "refactor(report_data): extract shared helpers (<list>)

Extracted: <list of helper functions>.
Not extracted (cousins-but-different): <list with one-line reasons>."
```

If no helpers qualify, skip the commit — but still document the analysis in the close-out commit message.

---

## Task 12: Per-file LOC verification + in-app spot-test

- [ ] **Step 1: Verify no file exceeds 600 LOC**

```bash
wc -l src/api/report_data/*.ts | sort -rn
```

Expected: largest `timeline.ts` at ~270 LOC.

- [ ] **Step 2: In-app spot-test of reports**

```bash
npm start &
# Navigate to /reports
# Render: Person summary, Ancestor tree, Timeline
# Verify visually identical to pre-refactor.
# Kill app.
```

---

## Task 13: CHANGELOG + close-out

- [ ] **Step 1: Update CHANGELOG.md**

```markdown
## Unreleased

### Refactored

- `src/api/report_data.ts` (1,208 LOC) split into `src/api/report_data/`
  with one file per report builder + `types.ts` + `index.ts` re-export.
  Helpers extracted to `shared.ts`: <list, or "none — patterns were
  cousins-but-different, see commit for analysis">.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "chore: changelog for report_data split"
```

---

## Self-review checklist

- [ ] `src/api/report_data.ts` does not exist as a file.
- [ ] `src/api/report_data/` has 9–10 files.
- [ ] No file over 600 LOC.
- [ ] `npx tsc --noEmit` + `npm test` pass with unchanged test count.
- [ ] Helper extraction documented (extracted list + rejected list with reasons) in commit message.
- [ ] In-app spot-test of three reports confirms visual parity.
- [ ] CHANGELOG Unreleased entry.

## Failure modes / RCA reference

- **Over-extraction.** Don't write `walkAncestors()` because it "feels reusable" — only extract patterns ≥2 reports use with identical shape. Same anti-abstraction rule as plan 3.1.
- **Cousin-pattern hallucination.** Functions that look similar but differ structurally (one walks `parent_id`, another `couple_id`) are not the same. Leaving them separate is correct; document why.
