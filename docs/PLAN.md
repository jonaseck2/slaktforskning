# Plan: Släktforskning

A local-first desktop genealogy app. Includes a built-in MCP server so that **external** AI agents (Claude Desktop, Claude Code, etc.) can read, write, and test the database — the app itself ships **no integrated agent**, no in-app chatbot, no in-process LLM. Architecture and tech decisions live in [`CLAUDE.md`](../CLAUDE.md). Version history: [CHANGELOG.md](../CHANGELOG.md). Completed milestones: [plans/archive/PLAN.md](plans/archive/PLAN.md).

---

## Roadmap

### [planned] Rename `tauri-spike` → `slaktforskning`
The Cargo crate, the Tauri bundle identifier, the inner Mach-O binary name, the macOS data-folder path, the CI cache keys, and the e2e fixture's binary-lookup strings all still read `tauri-spike` / `com.slaktforskning.tauri-spike` from the proof-of-concept phase. The Tauri port shipped in 0.252.0; the name didn't move. Clean rename — no migration code since the app has never shipped to a public user (any legacy dev data is `mv`-able by hand). After: `git grep tauri.spike` returns zero in live code.
- Plan: [`plans/2026-05-12-rename-tauri-spike.md`](plans/2026-05-12-rename-tauri-spike.md)

### [planned] Gazetteer lazy chunks
The renderer bundle's 30 MB `tauri-window-api-*.js` chunk is dominated by `import.meta.glob('../api/place-gazetteers/data/*.json', { eager: true })` in `src/renderer/empty-gazetteers.ts`, which inlines every gazetteer JSON (~70 MB raw) at build time. This forced the `NODE_OPTIONS=--max-old-space-size=8192` workaround in `package.json` and makes app cold-start parse 70 MB of JSON even if the user only opens Sweden. Switching to `eager: false` lets Vite code-split each gazetteer JSON into its own lazy chunk loaded on demand. Removes the heap-bump workaround.
- Plan: [`plans/2026-05-12-gazetteer-lazy-chunks.md`](plans/2026-05-12-gazetteer-lazy-chunks.md)

### [planned] App-level a11y gaps (surfaced by `ui_aria_audit`)
The dev MCP's `ui_aria_audit` tool (shipped 2026-05-12 in the ARIA-MCP plan) found 27 a11y findings on Settings → Länkregler alone — Settings chip strip without `role="tab"`, modal form inputs without label associations, 12 unnamed row-checkboxes, unnamed `<main>`. Same pattern likely repeats across every modal + form-driven view. This plan closes those gaps and adds a CI test (`tests/components/aria-audit-zero-findings.test.ts`) that fails the build on any new a11y gap.
- Plan: [`plans/2026-05-12-app-a11y-gaps.md`](plans/2026-05-12-app-a11y-gaps.md)

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
