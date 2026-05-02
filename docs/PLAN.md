# Plan: Släktforskning

A local-first desktop genealogy app. Includes a built-in MCP server so that **external** AI agents (Claude Desktop, Claude Code, etc.) can read, write, and test the database — the app itself ships **no integrated agent**, no in-app chatbot, no in-process LLM. Architecture and tech decisions live in [`CLAUDE.md`](../CLAUDE.md). Version history: [CHANGELOG.md](../CHANGELOG.md). Completed milestones: [plans/archive/PLAN.md](plans/archive/PLAN.md).

---

## Roadmap

#### Chart Layout Alignment — Universal Spouse Rendering [branch: chart-layout-alignment]
Shared utilities, spouse data in all tree types, spouse boxes in all layouts. Crashes on selection — needs debugging before merge.
- Spec: `docs/plans/2026-04-13-chart-layout-alignment-design.md`
- Plan: `docs/plans/2026-04-13-chart-layout-alignment.md` (on branch)

---

#### App Naming [backlog]
Decide on a product name. Candidates: OurHumanLegacy, OurLegacy, MyLegacy, Släktforskning.

#### Onboarding & Welcome Screen [backlog]
First-run experience: welcome screen, getting started guidance, empty tree with "+" outline placeholder.

#### Duplicates Panel — Places, Sources, Media [backlog]
Extend the existing `/duplicates` view (persons-only today) to cover places, sources, and media. Reuse the `MergePersonsModal` compare-and-merge pattern. API needs `findDuplicate*` + `merge*` per entity. Make the duplicates view the landing target for all `DUPLICATE_*` quality rows.
- Plan: TBD — needs a design pass (see brainstorming).

---

## Considered, not now

Things we thought about and decided against / deferred. Not backlog — listed only so we don't re-derive the same idea cold.

- **Historical place names** — parishes that changed names or borders over time, with date ranges (e.g. "Stettin" → "Szczecin" 1945, Schleswig-Holstein county splits, Swedish parish mergers post-2000). Considered as a place-gazetteers extension. Out of scope: pinning the database to a specific historical-resolver version would conflict with the Prime Directive (DB stores authored values; everything else derives at read time). If revisited, the right shape is render-time alias resolution from a versioned alias table — not stored historical coordinates. Open it as a GitHub issue post-OSS so users can vote.
