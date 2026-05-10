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

#### Duplicates Panel — Places, Sources, Media [planned]
Extend the existing `/duplicates` view (persons-only today) to cover places, sources, and media. Reuse the `MergePersonsModal` compare-and-merge pattern. API needs `findDuplicate*` + `merge*` per entity. Make the duplicates view the landing target for all `DUPLICATE_*` quality rows.
- Design: [`plans/2026-05-09-duplicates-panel-design.md`](plans/2026-05-09-duplicates-panel-design.md)
- Plan: [`plans/2026-05-09-duplicates-panel.md`](plans/2026-05-09-duplicates-panel.md)

---

## Considered, not now

Things we thought about and decided against / deferred. Not backlog — listed only so we don't re-derive the same idea cold.

- **Historical place names** — parishes that changed names or borders over time, with date ranges (e.g. "Stettin" → "Szczecin" 1945, Schleswig-Holstein county splits, Swedish parish mergers post-2000). Considered as a place-gazetteers extension. Out of scope: pinning the database to a specific historical-resolver version would conflict with the Prime Directive (DB stores authored values; everything else derives at read time). If revisited, the right shape is render-time alias resolution from a versioned alias table — not stored historical coordinates. Open it as a GitHub issue post-OSS so users can vote.

---

## GEDCOM Round-Trip Fidelity: Lossy → Lossless Promotions [backlog]

The registry in `src/api/gedcom_fidelity_registry.ts` declares 20+ fields as currently lossy. Each entry below describes an upgrade path to lossless status via custom GEDCOM tags. Priority is determined by user impact: couple subtypes (marriage, divorce) are higher priority than research-task metadata; group/task records are saved last and may be out of scope for v1.

#### Declared lossy, no promotion planned
The Prime Directive requires honest disclosure, not lossless round-trip for every column. The following lossy fields are documented in `src/api/gedcom_fidelity_registry.ts` and surfaced via `ExportReport.excluded`; promotion is not planned. Reopen if a user requests it.
- `media.is_printable` — UI convenience flag for reporting. User re-checks the box if they care.
- `media_links.link_type` — UI hint (portrait/document); user retags after import. Mostly an avatar-picker convenience.
- `media_links.sort_order` — relative order is preserved (what users observe in the UI); the absolute integer is rebased to 0..n-1 on import. The user does not author this number.
- `research_tasks` / `task_links` — internal working metadata, not published genealogy. Cross-tool portability has near-zero value (other apps use their own task systems).

### [planned] Archive (.zip) round-trip fidelity registry + tests
Mirror `src/api/gedcom_fidelity_registry.ts` for the .zip archive export/import path. Share the helper infrastructure in `tests/helpers/gedcom_fidelity.ts` but allow per-format status (e.g., groups could be lossless in archive but lossy in GEDCOM). Scope: `src/export/archive.ts`, `src/import/archive/`, tests for per-field round-trip + golden-seed. Lower urgency: pure CI insurance — the archive ships the SQLite file bit-for-bit, so no regression has been observed; this would catch a future one.
- Plan: [`plans/2026-05-09-archive-fidelity-registry.md`](plans/2026-05-09-archive-fidelity-registry.md)
