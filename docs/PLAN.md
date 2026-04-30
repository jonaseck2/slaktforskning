# Plan: Släktforskning

Local-first desktop genealogy app (Electron + Vue 3 + SQLite) with a built-in MCP server for AI agent access. Full architecture reference: `CLAUDE.md`.

Version history: [CHANGELOG.md](../CHANGELOG.md). Full implementation history and completed milestones: [plans/archive/PLAN.md](plans/archive/PLAN.md).

---

## Active Design Decisions

| Decision | Choice |
|----------|--------|
| Desktop framework | Electron 41 |
| Frontend | Vue 3 + Pinia |
| Database | SQLite via node-sqlite3-wasm (WAL, foreign keys on) |
| Agent interface | MCP stdio transport |
| i18n | vue-i18n — Swedish default, English fallback |

---

## Roadmap

Version numbers are not pre-assigned. When a milestone is committed, the version is bumped automatically: **new feature → minor bump**, **fix on existing feature → patch bump**.

#### Open Source Publishing [done]
CI/CD, automated releases, Claude-powered issue triage, governance files, README/DEVELOPING/CONTRIBUTING redesign, GitHub Actions badges, dependabot, CODEOWNERS.
- Spec: [plans/archive/2026-04-18-open-source-publishing-design.md](plans/archive/2026-04-18-open-source-publishing-design.md)
- Plan: [plans/archive/2026-04-18-open-source-publishing.md](plans/archive/2026-04-18-open-source-publishing.md)

#### Chart Layout Shared Utilities Refactor [planned]
Extract duplicated logic from pedigree, descendant, and hourglass layouts into `chart-layout/shared.ts`: `findPersonInTree`, `findParentOf`, placeholder extraction, line-to-dashed conversion.

#### IPC Channel Registry [done]
Replaced 3-layer string-keyed IPC boilerplate with a single typed registry in `src/shared/channels/` (~131 channels). Adding a channel is now one `defineChannel()` call instead of edits to three files. `window.api` is fully typed via `ApiSurface<typeof channelRegistry>`.
- Plan: [plans/archive/2026-04-28-ipc-channel-registry.md](plans/archive/2026-04-28-ipc-channel-registry.md)

#### Panel Composables & EntityPanel [planned]
Extract `useEntityData`, `useEditableFields`, and a shared `<EntityPanel>` shell to remove ~600 lines of repetition across 6 entity panels. Fixes the EventList stale-load race and centralizes 56+ ad-hoc localStorage keys.
- Plan: [plans/2026-04-28-panel-composables.md](plans/2026-04-28-panel-composables.md)

#### API Polymorphic Link Helpers [planned]
Collapse 15 near-identical `getXFor<EntityType>` queries (citations, groups, tasks, media) into `getLinkedEntities` + `getCitationsByOwner`. Public per-entity functions stay as wrappers — no MCP/IPC churn.
- Plan: [plans/2026-04-28-api-link-helpers.md](plans/2026-04-28-api-link-helpers.md)

#### Place Resolver Overhaul [planned]
Drop resolver from 6 hardcoded language vocabularies to universal rules + per-gazetteer normalization. Adds Swedish `kn`/`sn`/`fs` and länsbokstav alias support, fixes parens-as-separator, period-as-separator, and whitespace tolerance. Targets ~1 700 places that currently fall on the floor in `ben-inte-trasig.db`. Plus 4 new targeted quality checks.
- Plan: [plans/2026-04-30-place-resolver-overhaul.md](plans/2026-04-30-place-resolver-overhaul.md)

#### Chart Layout Alignment — Universal Spouse Rendering [branch: chart-layout-alignment]
Shared utilities, spouse data in all tree types, spouse boxes in all layouts. Crashes on selection — needs debugging before merge.
- Spec: `docs/plans/2026-04-13-chart-layout-alignment-design.md`
- Plan: `docs/plans/2026-04-13-chart-layout-alignment.md` (on branch)

---

#### User Feedback Batch (2026-04-15) [in-progress]
- `name_change` name type added (schema, i18n, MCP)
- Event type dropdowns sorted alphabetically by translation
- Close confirmation dialog on last window (production only)
- Media copy-on-attach verified working

#### Ben Feedback Batch (2026-04-29) [done]
25 items shipped across 8 releases (v0.162.6 → v0.169.0). Plans archived under `docs/plans/archive/2026-04-29-ben-*.md`. See CHANGELOG entries for the full list.

Phase 4/5 of the reactivity work (indirect events on timelines, mini family tree on Add Member) deferred and tracked separately:
- [plans/2026-04-29-ben-reactivity.md](plans/2026-04-29-ben-reactivity.md)

#### Workflow Analysis [research]
*High user-focus task — do this in a dedicated session with real usage data.*
Define primary user objectives, map to current click counts, identify highest-friction paths, produce prioritized improvement backlog.

---

#### App Naming [backlog]
Decide on a product name. Candidates: OurHumanLegacy, OurLegacy, MyLegacy, Släktforskning.

#### Onboarding & Welcome Screen [backlog]
First-run experience: welcome screen, getting started guidance, empty tree with "+" outline placeholder.

#### Place Gazetteers — Future Extensions [backlog]
- Historical place name support (parishes that changed names/boundaries over time with date ranges)
- Batch match quality report (how many places resolved, at what quality)

#### Media Viewer — Future Extensions [backlog]
- AI-assisted face detection (suggest regions automatically)
- Resize/move existing face tag regions
- Face tag suggestions based on other tagged photos

#### Duplicate Merge Side-by-Side UI [backlog]
Side-by-side person comparison view for duplicate detection. API has `findDuplicates` and `mergePersons` — needs a visual comparison UI.

#### Unified compare-and-merge UI for duplicates (v2) [backlog]
Extend `MergePersonsModal` pattern to places, media, and sources. Make the compare UI the landing target for all `DUPLICATE_*` quality rows. Consider a `/duplicates` route.

---

## Research

| Date | Topic | Location |
|------|-------|----------|
| 2026-04-11 | Competitor gap analysis v1 | [plans/archive/2026-04-11-competitor-gap-analysis.md](plans/archive/2026-04-11-competitor-gap-analysis.md) |
