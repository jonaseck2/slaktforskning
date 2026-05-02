# Plan: Släktforskning

A local-first desktop genealogy app. Includes a built-in MCP server so that **external** AI agents (Claude Desktop, Claude Code, etc.) can read, write, and test the database — the app itself ships **no integrated agent**, no in-app chatbot, no in-process LLM. Architecture and tech decisions live in [`CLAUDE.md`](../CLAUDE.md). Version history: [CHANGELOG.md](../CHANGELOG.md). Completed milestones: [plans/archive/PLAN.md](plans/archive/PLAN.md).

---

## Roadmap

#### API Polymorphic Link Helpers [planned]
Collapse 15 near-identical `getXFor<EntityType>` queries (citations, groups, tasks, media) into `getLinkedEntities` + `getCitationsByOwner`. Public per-entity functions stay as wrappers — no MCP/IPC churn.
- Plan: [plans/2026-04-28-api-link-helpers.md](plans/2026-04-28-api-link-helpers.md)

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

#### media_links.sort_order — preserve absolute integer on round-trip [backlog]
After the GEDCOM fidelity audit, `media_links.sort_order` is documented as lossy: the importer always renumbers OBJE blocks from 0..n-1 by emit position. Relative ordering survives, but a user-authored sort_order of 42 on a single OBJE comes back as 0. To promote this back to lossless, the importer needs to honor an explicit sort hint (custom `_SORT` sub-tag or use the OBJE block's emit position only when no hint is present). Low priority — relative ordering is what users actually observe in the UI.

---

## Considered, not now

Things we thought about and decided against / deferred. Not backlog — listed only so we don't re-derive the same idea cold.

- **Historical place names** — parishes that changed names or borders over time, with date ranges (e.g. "Stettin" → "Szczecin" 1945, Schleswig-Holstein county splits, Swedish parish mergers post-2000). Considered as a place-gazetteers extension. Out of scope: pinning the database to a specific historical-resolver version would conflict with the Prime Directive (DB stores authored values; everything else derives at read time). If revisited, the right shape is render-time alias resolution from a versioned alias table — not stored historical coordinates. Open it as a GitHub issue post-OSS so users can vote.
