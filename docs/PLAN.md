# Plan: Släktforskning

A local-first desktop genealogy app. Includes a built-in MCP server so that **external** AI agents (Claude Desktop, Claude Code, etc.) can read, write, and test the database — the app itself ships **no integrated agent**, no in-app chatbot, no in-process LLM. Architecture and tech decisions live in [`CLAUDE.md`](../CLAUDE.md). Version history: [CHANGELOG.md](../CHANGELOG.md). Completed milestones: [plans/archive/PLAN.md](plans/archive/PLAN.md).

This file lists only what's **left** — planned, in-progress, or backlog. Anything done lives in the archive PLAN linked above; this file never carries `[done]` entries.

---

## In flight

Active plans under `docs/plans/`. Each entry links the plan file; the user goal is what the plan delivers.

- **Modal companion composables (3.5 follow-up)** — extract `useCompanionBaptism` / `useSpousePicker` / `useCitationsForPersonName` / `useWeddingOffer` / `useOverlapCheck` so the four large modals fit on one screen. → [2026-05-14-modal-companion-composables.md](plans/2026-05-14-modal-companion-composables.md)
- **Audit follow-up roadmap (close-out)** — index doc; nearly all referenced plans have shipped, remaining tactical sweep + Tier 2.5 (Raw Payloads) gated on a renderer perf baseline. → [2026-05-14-audit-followup-roadmap.md](plans/2026-05-14-audit-followup-roadmap.md)

## Backlog

Plans that are valid and ready to grab but are not actively scheduled. Pull into "In flight" when triggered.

- **Native importer binary fixtures** — close the e2e gaps for native binary decoders (Holger `.zip+media`, RootsMagic `.rmtree`, Gramps `.gramps` / `.gpkg`). Contributor-blocked (requires source-app installs). Un-defer trigger codified in [`tests/e2e/imports.spec.ts:74`](../tests/e2e/imports.spec.ts#L74). → [2026-05-14-importer-binary-fixtures.md](plans/2026-05-14-importer-binary-fixtures.md)
- **Renderer-side perf baseline** — Safari Web Inspector traces (boot / place-resolve / dedup) to pair with the existing Rust-side `samply` baselines. 30-min user-driven task; grab when the next renderer-perf complaint arrives, or when starting audit-roadmap Tier 2.5 (Raw Payloads). → [2026-05-14-perf-baseline-renderer.md](plans/2026-05-14-perf-baseline-renderer.md)

---

## Considered, not now

Things we thought about and decided against / deferred. Not backlog — listed only so we don't re-derive the same idea cold.

- **Historical place names** — parishes that changed names or borders over time, with date ranges (e.g. "Stettin" → "Szczecin" 1945, Schleswig-Holstein county splits, Swedish parish mergers post-2000). Considered as a place-gazetteers extension. Out of scope: pinning the database to a specific historical-resolver version would conflict with the Prime Directive (DB stores authored values; everything else derives at read time). If revisited, the right shape is render-time alias resolution from a versioned alias table — not stored historical coordinates. Open it as a GitHub issue post-OSS so users can vote.
- **Hourglass layout internal refactor (Phase 2 of 3.2)** — explicit "execute only if a real chart feature is blocked" plan. No chart feature is blocked today; the file works and is tested. The audit's "this file is too big" framing was a wrong premise twice in this batch. Reopen if a specific chart-feature request makes the file's shape the blocker. Design lives at [`plans/2026-05-14-hourglass-layout-refactor-design.md`](plans/2026-05-14-hourglass-layout-refactor-design.md).

---

## Declared lossy, no promotion planned

The Prime Directive requires honest disclosure, not lossless round-trip for every column. The following lossy fields are documented in `src/api/gedcom_fidelity_registry.ts` and surfaced via `ExportReport.excluded`; promotion is not planned. Reopen if a user requests it.

- `media.is_printable` — UI convenience flag for reporting. User re-checks the box if they care.
- `media_links.link_type` — UI hint (portrait/document); user retags after import. Mostly an avatar-picker convenience.
- `media_links.sort_order` — relative order is preserved (what users observe in the UI); the absolute integer is rebased to 0..n-1 on import. The user does not author this number.
- `research_tasks` / `task_links` — internal working metadata, not published genealogy. Cross-tool portability has near-zero value (other apps use their own task systems).
- Archive (.zip) fidelity registry — considered. Dropped: the archive ships the SQLite file + media folder bit-for-bit, so there is no transformation that could lose data; the GEDCOM-style registry pattern would be guarding against a hypothetical future regression that would only appear if someone added DB-touching logic to the archive import/export path. Reopen if such a change is proposed.
