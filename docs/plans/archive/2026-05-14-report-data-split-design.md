# Design — `report_data.ts` split (and extract helpers if they emerge)

**Roadmap reference:** [2026-05-14-audit-followup-roadmap.md](2026-05-14-audit-followup-roadmap.md) §3.4.

## User goal

Changes to `getTimeline` don't touch `getAliveInYear`. Adding a new report builder is "create one file, register in the index" — not "find your way through a 1,208-line file." If three report builders genuinely share the same walk-ancestors-and-collect-events scaffolding, that scaffolding lives in `shared.ts` — *discovered through the migration, not assumed upfront*.

## Why now

The 2026-05-14 audit ranked `report_data.ts` as #4 Tier 3. Seven discrete report functions live in one 1,208-LOC file. Structural split is mechanical; the audit's claim of shared traversal helpers gets validated (or disproved) during execution.

Verified structure (2026-05-14):
- 7 main exports: `getPersonSummary` (394), `getFamilyUnit` (483), `getAncestorTree` (532), `getPlaceHistory` (590), `getResearchGaps` (631), `getTimeline` (673, biggest at ~270 LOC), `getAliveInYear` (989).
- ~200 LOC of interfaces at the top (lines 16–213).
- Test file: [`tests/unit/report_data.test.ts`](../../tests/unit/report_data.test.ts) at 1,199 LOC, structured per-report via `describe()` blocks.

## Scope

Decompose [`src/api/report_data.ts`](../../src/api/report_data.ts) into:

```
src/api/report_data/
  ├── index.ts           # Re-exports public API
  ├── types.ts           # Genuinely-shared interfaces only
  ├── person-summary.ts  # getPersonSummary + PersonSummary type
  ├── family-unit.ts     # getFamilyUnit + FamilyUnit/FamilyMember types
  ├── ancestor-tree.ts   # getAncestorTree + AncestorNode type
  ├── place-history.ts   # getPlaceHistory + PlaceHistory/PlaceEventRecord types
  ├── research-gaps.ts   # getResearchGaps + ResearchGaps type
  ├── timeline.ts        # getTimeline + TimelinePartner/TimelineEntry/TimelineOptions types
  ├── alive-in-year.ts   # getAliveInYear + AliveInYear* types
  └── shared.ts          # ONLY if migration finds genuinely-shared helpers (see below)
```

### Helper extraction — discovered, not assumed

The audit claimed "six report builders share the same walk-ancestors / collect-events / sort-by-date scaffolding." This plan **does not** preemptively extract `walkAncestors()` / `collectEvents()` / `sortByDate()` helpers. Instead:

1. Split each report function into its own file.
2. After all 7 are in their own files, look at them side-by-side. If two or more files have **identical-shape** inner loops (walking, collecting, sorting), extract to `shared.ts`. If they only *seem* similar but differ structurally (one walks via `parent_id`, another via `couple_id`), leave them be.
3. Document the extraction decisions in the close-out: which helpers extracted, which files use them, what cousins-but-not-identical patterns were *not* extracted (with reason).

This avoids the "factory pattern" trap from 3.1 — abstraction emerges from observation, not assumption.

### Scope deviations

- **Type placement.** Lines 16–213 contain all interfaces. Most are report-specific (`PersonSummary`, `FamilyUnit`, `AncestorNode`) and move into their report's file. Genuinely-shared types (`EventWithPlace`, `CitationWithSource`, `RelationshipSummary`) move to `types.ts`. Line-by-line decision happens during execution.
- **No interface unification.** Each report's result shape stays distinct.
- **Test file stays as-is.** [`tests/unit/report_data.test.ts`](../../tests/unit/report_data.test.ts) (1,199 LOC) has per-report `describe()` blocks. Updating its imports is mechanical. Splitting the test file is a separate future plan.

## Approach

Single PR. Same pattern as 3.1 and 3.3. Per [`.claude/rules/renderer.md`](../../.claude/rules/renderer.md) §"Pattern migrations are all-or-nothing" — all 7 report functions migrate together.

Order of execution:
1. Move report functions to per-report files.
2. Run `tsc --noEmit` + `npm test` — verify zero regression at the structural-split level.
3. Compare the 7 files side-by-side; identify genuinely-shared patterns; extract to `shared.ts` only if used by ≥2 files with identical shape.
4. Document in close-out: extracted helpers, rejected extractions with reasons.

## Verification

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) user-goal-falsifiability check:

1. **`src/api/report_data.ts` does not exist** as a single file.
2. **`src/api/report_data/` contains 9–10 files:** index + types + 7 per-report files + (optionally) shared.
3. **Public API preserved.** `tsc --noEmit` passes against all current call sites; renderer and MCP tool wiring unchanged.
4. **Per-file LOC under 600.** `wc -l src/api/report_data/*.ts` shows no file over 600 lines.
5. **`npm test` exits 0** with same test count.
6. **Helper extraction documented.** Close-out has a section listing each helper extracted to `shared.ts` with the files using it AND a section listing cousin-but-not-identical patterns explicitly *not* extracted (with reason).
7. **No render regression.** Spot-test one or two reports in the running app: ReportsView → render a Person summary, an Ancestor tree, a Timeline. Visually identical to pre-refactor.

Falsifiability: if every item passes, can a developer still find that touching `getTimeline` requires reading `getAliveInYear`? **No** — items 2–4 enforce real boundaries; item 6 prevents the "premature factory pattern" failure mode by requiring documented justification.

### Dependencies

None. Independent of 1.2 — report rendering isn't in the baseline workloads.

## Failure modes / RCA reference

Same as 3.1 and 3.3: low-risk mechanical refactor. The specific risk for this plan is **over-extraction** in the helper phase — being tempted to write `walkAncestors()` because it "feels reusable" when only one report actually uses it. The "≥2 files with identical shape" rule in step 3 is the mitigation. Document rejected extractions to leave a trail for future readers.

## Effort

1.5 days. 1 day for split + verification, 0.5 day for helper-extraction analysis + close-out doc.

## Tasks (high-level)

- [ ] Create `src/api/report_data/` directory.
- [ ] Audit lines 16–213; sort interfaces into report-specific files vs `types.ts`.
- [ ] Move each `getXxx` function → per-report file (7 files).
- [ ] Write `index.ts` re-exporting public API.
- [ ] Delete `src/api/report_data.ts`.
- [ ] Run `tsc --noEmit`, `npm test`.
- [ ] Helper-extraction analysis: identify ≥2-file shared patterns; extract to `shared.ts`.
- [ ] Document extracted helpers + rejected extractions in close-out.
- [ ] Spot-test reports in the running app.
- [ ] Self-review checklist.
