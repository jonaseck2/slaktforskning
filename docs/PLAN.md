# Plan: Släktforskning

A local-first desktop genealogy app. Includes a built-in MCP server so that **external** AI agents (Claude Desktop, Claude Code, etc.) can read, write, and test the database — the app itself ships **no integrated agent**, no in-app chatbot, no in-process LLM. Architecture and tech decisions live in [`CLAUDE.md`](../CLAUDE.md). Version history: [CHANGELOG.md](../CHANGELOG.md). Completed milestones: [plans/archive/PLAN.md](plans/archive/PLAN.md).

This file lists what's **planned**. Two states only: planned (here) or done (archive). No "in flight" — if it's worth tracking it's planned; if it's not getting done it's closed in the archive with the reason.

---

## Planned

Active plan files under `docs/plans/`. Each entry links the plan and states the user goal it delivers.

- **OSS launch demo + manual** — README screenshot + 8-step quickstart + full MANUAL.md across 19 sections, against a Swedish royal House of Holstein-Gottorp demo database. Rewritten 2026-05-31 for full agent-completability: face-tag regions via MCP coords + visual-diff verification (was: human drag), quickstart-screenshotted-coherence check (was: human timed walkthrough), MANUAL.md decomposed into 19 atomic per-section tasks (was: one mega-task). 40 Tier 1 tasks; zero Tier 4. → [2026-05-21-oss-launch-demo-and-manual.md](plans/2026-05-21-oss-launch-demo-and-manual.md)
- **Ben feedback polish (rapport 100-103, 105)** — beta-tester UI/i18n batch from v215→v265: citation modal labels + dropdown affordance + confidence order, EventModal section count parens + trash icon, per-event-type residence labels + inline save-and-continue, research-tasks rename, PersonPanel Timeline/Map reorder. → [2026-05-31-ben-feedback-polish-v215-to-v265.md](plans/2026-05-31-ben-feedback-polish-v215-to-v265.md)
- **Gramps binary importer fixtures** — close the e2e gap on Gramps native `.gramps` and `.gpkg` decoding via XML-direct authoring (rewritten 2026-05-31 from GUI-authoring to hand-written XML + gzip + zip, removing the Gramps-install gate). → [2026-05-31-gramps-binary-fixtures.md](plans/2026-05-31-gramps-binary-fixtures.md)
- **Media → source links (rapport 104)** — surface the `media_links→source` association (already in the schema, lossless GEDCOM) as a "Källor" section on MediaPanel, with link/create-and-link/unlink. Framing B chosen 2026-05-31; Framing A (per-media citation FK) deferred. → [2026-05-31-media-source-links.md](plans/2026-05-31-media-source-links.md) (design: [2026-05-31-media-citations-design.md](plans/2026-05-31-media-citations-design.md))

---

## Considered, not now

Things we thought about and decided against / deferred with an explicit reopen trigger. Not backlog — listed so we don't re-derive the same idea cold.

- **Historical place names** — parishes that changed names or borders over time. Considered as a place-gazetteers extension. Out of scope: pinning the database to a specific historical-resolver version would conflict with the Prime Directive. If revisited, the right shape is render-time alias resolution from a versioned alias table — not stored historical coordinates. **Reopen trigger:** post-OSS, if users vote for it on GitHub.
- **Hourglass layout internal refactor (Phase 2 of 3.2)** — no chart feature is blocked today; the file works and is tested. **Reopen trigger:** a specific chart-feature request blocked by the file's shape. Design lives at [`plans/2026-05-14-hourglass-layout-refactor-design.md`](plans/2026-05-14-hourglass-layout-refactor-design.md).
- **Renderer-side perf baseline** — original consumer (Tier 3 refactors) shipped. **Reopen trigger:** next user-reported renderer perf complaint; capture against the real repro, not on-shelf.
- **Modal companion composables (5 extractions)** — 3.5 already met its user goal; remaining LOC targets aspirational. **Reopen trigger:** a real modal bug whose root cause is hard to locate because the file is too big.
- **Tauri Raw Payloads adoption (audit T2.5)** — speculative; no IPC bandwidth complaint exists. **Reopen trigger:** a specific IPC bandwidth or roundtrip complaint with a measurable workload.
- **Holger + RootsMagic native binary fixtures** — contributor-driven (requires paid Windows software). **Reopen trigger:** a contributor opens a GitHub issue with a 3-person fixture attached for their tool.
- **Rapport 102 §5** (add second resident doesn't work) — **verified non-reproducible on 0.265.0 via dev MCP, 2026-05-31.** API path: added 3 participants to a residence event without error. UI path: the `.ep-body` modal container is `overflow-y: auto` with 337px of scrollable content; the participant picker initially renders below a 1280×768 viewport but is reachable via scroll. The v215.2 symptom Ben self-diagnosed ("händelsen hämnar nedanför min visade skärmbild") was pre-scrollable-modal. **Reopen trigger:** Ben (or any user) reports it again on a current release.
- **Rapport 106** (cannot update relationship event) — **verified non-reproducible on 0.265.0 via dev MCP, 2026-05-31.** `window.api.events.update()` on a relationship-linked event succeeds and preserves `relationship_id`; UI EventModal Save persists the change without toast or console error. Likely incidentally fixed in the ~60 versions of churn since v215.2. **Reopen trigger:** Ben (or any user) reports it again on a current release.

---

## Declared lossy, no promotion planned

The Prime Directive requires honest disclosure, not lossless round-trip for every column. The following lossy fields are documented in `src/api/gedcom_fidelity_registry.ts` and surfaced via `ExportReport.excluded`; promotion is not planned. Reopen if a user requests it.

- `media.is_printable` — UI convenience flag for reporting. User re-checks the box if they care.
- `media_links.link_type` — UI hint (portrait/document); user retags after import. Mostly an avatar-picker convenience.
- `media_links.sort_order` — relative order is preserved (what users observe in the UI); the absolute integer is rebased to 0..n-1 on import. The user does not author this number.
- `research_tasks` / `task_links` — internal working metadata, not published genealogy. Cross-tool portability has near-zero value (other apps use their own task systems).
- Archive (.zip) fidelity registry — considered. Dropped: the archive ships the SQLite file + media folder bit-for-bit, so there is no transformation that could lose data; the GEDCOM-style registry pattern would be guarding against a hypothetical future regression that would only appear if someone added DB-touching logic to the archive import/export path. Reopen if such a change is proposed.
