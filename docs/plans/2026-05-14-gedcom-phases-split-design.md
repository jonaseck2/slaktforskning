# Design — GEDCOM phases split

**Roadmap reference:** [2026-05-14-audit-followup-roadmap.md](2026-05-14-audit-followup-roadmap.md) §3.3.

## User goal

Fixing a bug in `phaseIndividuals` doesn't require scrolling through `phaseFamilies`, `phaseAsso`, and a dozen other phases in the same file. Each phase lives in its own file with focused tests. Adding a new phase (e.g., for a new GEDCOM tag) is "create one file, register in the orchestrator" — not "find your way through a 1,163-line file."

## Why now

The 2026-05-14 audit ranked GEDCOM phases #3 Tier 3. Structure is identical to `duplicates.ts` (3.1) — fourteen `phase<Name>(ctx)` functions already exist as discrete units; they just live in one file. Pure structural split.

Verified structure (2026-05-14):
- 14 phase functions in [`src/import/gedcom/phases.ts`](../../src/import/gedcom/phases.ts) (1,163 LOC).
- Orchestrated from [`src/import/gedcom/import-core.ts`](../../src/import/gedcom/import-core.ts) (603 LOC) via `createImportContext` + sequential phase calls.
- `ImportContext` threaded through every phase (lives in `import-types.ts`).

## Scope

Decompose `phases.ts` into:

```
src/import/gedcom/phases/
  ├── index.ts              # Re-exports all 14 phase functions
  ├── shared.ts             # PERSON_EVENT_TAGS, FAMILY_EVENT_TAGS, shared constants
  ├── notes.ts              # phaseNotes (lines 98–118)
  ├── prep-places.ts        # phasePrepPlaces (119–176)
  ├── prep-inline-media.ts  # phasePrepInlineMedia (177–229)
  ├── obje.ts               # phaseObje (230–276)
  ├── repo.ts               # phaseRepo (277–303)
  ├── groups.ts             # phaseGroups (304–317)
  ├── sources.ts            # phaseSources (318–373)
  ├── individuals.ts        # phaseIndividuals (374–758) — largest at 385 LOC
  ├── families.ts           # phaseFamilies (759–931)
  ├── asso.ts               # phaseAsso (932–982)
  ├── place-citations.ts    # phasePlaceCitations (983–1044)
  ├── group-records.ts      # phaseGroupRecords (1045–1117)
  ├── todos.ts              # phaseTodos (1118–1144)
  └── submitters.ts         # phaseSubmitters (1145–)
```

[`import-core.ts`](../../src/import/gedcom/import-core.ts) imports from `./phases` (the new directory's index) instead of `./phases.ts`. Sequential call order unchanged.

### Scope deviations

- **`PERSON_EVENT_TAGS` / `FAMILY_EVENT_TAGS`** (lines 43–96 of current `phases.ts`) move to `phases/shared.ts`. Consumed by `phaseIndividuals`, `phaseFamilies`, possibly others.
- **`ImportContext`** stays in `import-types.ts` (already extracted).
- **No phase-as-class pattern.** The audit's `class GedcomPhase1` suggestion is rejected. Function-per-file is simpler when each phase has one entry point — same anti-abstraction principle as 3.1.
- **Per-phase test splits not in scope.** [`tests/unit/gedcom.test.ts`](../../tests/unit/gedcom.test.ts) (1,783 LOC) and [`tests/unit/import-gedcom-reporting.test.ts`](../../tests/unit/import-gedcom-reporting.test.ts) (735 LOC) test all phases together via fixtures. Splitting them is a separate plan if desired. Verify test imports keep working (via the index re-export); update if tighter binding produces cleaner output.

## Approach

Single PR, mechanical file moves. Same pattern as 3.1. Per [`.claude/rules/renderer.md`](../../.claude/rules/renderer.md) §"Pattern migrations are all-or-nothing" — all 14 phases migrate together.

## Verification

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) user-goal-falsifiability check:

1. **`src/import/gedcom/phases.ts` does not exist** as a single file.
2. **`src/import/gedcom/phases/` contains 14 phase files + `index.ts` + `shared.ts`** (16 files).
3. **Public API preserved.** `tsc --noEmit` passes against all current call sites; `import-core.ts` orchestration unchanged in behavior.
4. **Per-file LOC under 600.** `wc -l src/import/gedcom/phases/*.ts` shows no file over 600 lines. (Largest: `individuals.ts` at ~385.)
5. **`npm test` exits 0** with same test count.
6. **GEDCOM round-trip works.** Run a representative GEDCOM file through the importer end-to-end via the existing fixture test (`gedcom.test.ts` Golden-DB-Seed round-trip test). Same result before and after.
7. **Performance spot-check.** Import a ≥1k-person GEDCOM pre- and post-refactor; record both wall-clocks in close-out. Expected: no regression. (Large-GEDCOM import isn't in plan 1.2's baseline workloads, so this plan does its own spot-check.)

Falsifiability: if every item passes, can a developer still find that touching `phaseIndividuals` requires reading `phaseFamilies`? **No** — items 2–4 enforce real boundaries; items 6–7 prove orchestration still produces identical output at identical speed.

### Dependencies

None. Independent of 1.2 (perf baseline).

## Failure modes / RCA reference

Same as 3.1: low-risk mechanical refactor. The historical pattern it doesn't repeat: a "phase-as-class" hierarchy that adds indirection without solving the file-size problem.

Specific GEDCOM risk: **inter-phase state leakage via `ImportContext`**. The audit noted "all phases peek at all maps (e.g., phase 4 reads `personMap`, `sourceMap`, `repoMap`, `grpMap`)." This pattern survives the split unchanged — each phase still accepts the full `ImportContext`. That's the right outcome: this plan doesn't try to narrow context per phase (which would break the data flow). A future plan can address it; not in scope here.

## Effort

1 day. Mechanical moves + test verification + GEDCOM round-trip spot-check.

## Tasks (high-level)

- [ ] Create `src/import/gedcom/phases/` directory.
- [ ] Move shared constants (`PERSON_EVENT_TAGS`, `FAMILY_EVENT_TAGS`) → `shared.ts`.
- [ ] Move each `phase<Name>` function → `<kebab-name>.ts` (14 files).
- [ ] Write `index.ts` re-exporting all 14 phase functions.
- [ ] Delete `src/import/gedcom/phases.ts`.
- [ ] Verify `import-core.ts` imports compile.
- [ ] Run `tsc --noEmit`, `npm test`.
- [ ] Run GEDCOM round-trip spot-check on a ≥1k-person file pre- and post-refactor; record wall-clocks.
- [ ] Self-review checklist.
