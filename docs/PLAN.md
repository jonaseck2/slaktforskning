# Plan: Släktforskning

A local-first desktop genealogy app. Includes a built-in MCP server so that **external** AI agents (Claude Desktop, Claude Code, etc.) can read, write, and test the database — the app itself ships **no integrated agent**, no in-app chatbot, no in-process LLM. Architecture and tech decisions live in [`CLAUDE.md`](../CLAUDE.md). Version history: [CHANGELOG.md](../CHANGELOG.md). Completed milestones: [plans/archive/PLAN.md](plans/archive/PLAN.md).

This file lists only what's **left** — planned, in-progress, or backlog. Anything done lives in the archive PLAN linked above; this file never carries `[done]` entries.

---

## In flight

Active plans under `docs/plans/`. Each entry links the plan file; the user goal is what the plan delivers.

- **E2E Expansion** — broaden the Playwright suite beyond Tier 1 (boot / crud / website-export / duplicates) into panels / reactivity / imports so the close-out evidence rule catches more regressions before main. → [2026-05-13-e2e-expansion.md](plans/2026-05-13-e2e-expansion.md) (spec: [-design.md](plans/2026-05-13-e2e-expansion-design.md))
- **E2E Test-Coverage Enrichment** — follow-ups to the E2E expansion: fill the gaps the initial Tier 2 split surfaced. → [2026-05-14-e2e-framework-followups.md](plans/2026-05-14-e2e-framework-followups.md)
- **Native importer binary fixtures** — close the e2e gaps for native importers (Holger / RootsMagic / Gramps) by shipping versioned binary fixtures the import project can run against. → [2026-05-14-importer-binary-fixtures.md](plans/2026-05-14-importer-binary-fixtures.md)
- **Genney Tauri wiring** — port the last `notWired('Genney')` importer to the Tauri build (Docker + Java extractor pipeline behind a Rust shell-out command). → [2026-05-14-genney-tauri-wiring.md](plans/2026-05-14-genney-tauri-wiring.md)
- **Audit follow-up roadmap** — actionable cluster of fixes derived from the post-port audit. → [2026-05-14-audit-followup-roadmap.md](plans/2026-05-14-audit-followup-roadmap.md)
- **Hourglass layout refactor (Phase 2)** — internal refactor of `hourglass.ts` to simplify positioning passes. Design phase only. → [2026-05-14-hourglass-layout-refactor-design.md](plans/2026-05-14-hourglass-layout-refactor-design.md)
- **Modal companion composables (3.5 follow-up)** — extract shared modal-state composables now that the BaseSubPanel modal pattern is converged. → [2026-05-14-modal-companion-composables.md](plans/2026-05-14-modal-companion-composables.md)
- **Renderer-side perf baseline** — capture a Safari Web Inspector trace of the renderer to pair with the existing Rust-side `samply` baselines. → [2026-05-14-perf-baseline-renderer.md](plans/2026-05-14-perf-baseline-renderer.md)
- **`build-third-party-licenses.mjs` reliability** — make the third-party-license bundle generator deterministic and CI-safe. → [2026-05-14-third-party-licenses-reliability.md](plans/2026-05-14-third-party-licenses-reliability.md)

## Backlog

#### App Naming [backlog]
Decide on a product name. Candidates: OurHumanLegacy, OurLegacy, MyLegacy, Släktforskning.

---

## Considered, not now

Things we thought about and decided against / deferred. Not backlog — listed only so we don't re-derive the same idea cold.

- **Historical place names** — parishes that changed names or borders over time, with date ranges (e.g. "Stettin" → "Szczecin" 1945, Schleswig-Holstein county splits, Swedish parish mergers post-2000). Considered as a place-gazetteers extension. Out of scope: pinning the database to a specific historical-resolver version would conflict with the Prime Directive (DB stores authored values; everything else derives at read time). If revisited, the right shape is render-time alias resolution from a versioned alias table — not stored historical coordinates. Open it as a GitHub issue post-OSS so users can vote.

---

## Declared lossy, no promotion planned

The Prime Directive requires honest disclosure, not lossless round-trip for every column. The following lossy fields are documented in `src/api/gedcom_fidelity_registry.ts` and surfaced via `ExportReport.excluded`; promotion is not planned. Reopen if a user requests it.

- `media.is_printable` — UI convenience flag for reporting. User re-checks the box if they care.
- `media_links.link_type` — UI hint (portrait/document); user retags after import. Mostly an avatar-picker convenience.
- `media_links.sort_order` — relative order is preserved (what users observe in the UI); the absolute integer is rebased to 0..n-1 on import. The user does not author this number.
- `research_tasks` / `task_links` — internal working metadata, not published genealogy. Cross-tool portability has near-zero value (other apps use their own task systems).
- Archive (.zip) fidelity registry — considered. Dropped: the archive ships the SQLite file + media folder bit-for-bit, so there is no transformation that could lose data; the GEDCOM-style registry pattern would be guarding against a hypothetical future regression that would only appear if someone added DB-touching logic to the archive import/export path. Reopen if such a change is proposed.
