---
title: Remove GPS/Assertions — Pivot to Source-Citation Model
date: 2026-04-08
status: active
---

# Remove GPS/Assertions — Pivot to Source-Citation Model

## Motivation

The GPS (Genealogical Proof Standard) assertion model adds research-grade complexity
that burdens the app workflow. No mainstream genealogy app (Genney, Holger, RootsMagic)
implements per-attribute assertion tracking. GEDCOM 5.5.1/7.0 has no support for it.
GEDCOM-X provides a philosophical framework (personas, evidence references) but at a
much coarser granularity. The assertion layer cannot be exported and is not imported
from any format.

The source-citation model is standard GEDCOM and serves the core use case: recording
where facts came from, with page references, confidence ratings, and transcriptions.

## What Is Outside Standard GEDCOM / GEDCOM-X

| Entity | Standard? | Verdict |
|--------|-----------|---------|
| `assertions` table | No GEDCOM equivalent. GEDCOM-X has coarser "Conclusion" base type but not per-attribute claims | **Remove** |
| `evidence_type` on assertions (direct/indirect/negative) | GPS-only concept, not in any export format | **Remove** (goes with assertions) |
| `is_accepted` on assertions | GPS-only concept | **Remove** (goes with assertions) |
| Conflict detection (`getConflicts`) | GPS-only concept | **Remove** |
| Proof summary generation | GPS-only concept | **Remove** |
| `question_assertions` link table | Never implemented, but in rejected GPS plan | N/A |
| Sources + Citations | Standard GEDCOM (SOUR, REPO, QUAY) | **Keep** |
| Citation confidence (0-3) | Maps to GEDCOM QUAY | **Keep** |
| Citation transcription | Standard practice | **Keep** |
| Research Tasks | Genney custom (_TODO), useful but not GPS | **Keep** |
| Groups | Genney custom (_GRP), GEDCOM-X Group | **Keep** |

## What Was Introduced by the GPS Focus

Implemented in v0.39.0-v0.39.2 (archive: 2026-04-08-evidence-analysis.md):
- Phase 1: Assertion CRUD + conflict detection
- Phase 2: Assertion UI (PersonEvidenceSection, AssertionFormModal, SourceDetailView expansion)
- Phase 3: Unsourced filter, proof summaries
- Phase 4: Duplicate detection + merge (this part is useful independent of GPS — keep merge, remove assertion reassignment)

Additional in current session:
- EvidenceView.vue (global assertion browser)
- Evidence nav item in sidebar
- /evidence route
- listAssertions API + IPC

## Files to Modify/Remove

### Remove Entirely
- [ ] `src/api/assertions.ts` — entire file
- [ ] `src/renderer/components/AssertionFormModal.vue` — entire file
- [ ] `src/renderer/components/PersonEvidenceSection.vue` — entire file
- [ ] `src/renderer/views/EvidenceView.vue` — entire file
- [ ] `tests/unit/assertions.test.ts` — entire file

### Remove Assertion Sections From
- [ ] `src/api/types.ts` — remove Assertion, AssertionSubjectType, EvidenceType, ConflictGroup types
- [ ] `src/api/schema.ts` — remove assertions table DDL + indexes
- [ ] `src/api/checks.ts` — remove `checkUnresolvedConflicts()` function + its import of getConflicts
- [ ] `src/api/duplicates.ts` — remove assertion reassignment in `mergePersons()` (lines ~229-233)
- [ ] `src/main/ipc.ts` — remove assertions import + all 11 assertion IPC handlers
- [ ] `src/preload/index.ts` — remove `window.api.assertions` object
- [ ] `src/mcp/createServer.ts` — remove assertions import + all 10 assertion MCP tools
- [ ] `src/renderer/App.vue` — remove Evidence nav item (router-link to /evidence)
- [ ] `src/renderer/router.ts` — remove /evidence route
- [ ] `src/renderer/views/PersonDetailView.vue` — remove Evidence Analysis section, evidenceSourced/evidenceTotal state, evidence badge
- [ ] `src/renderer/components/PersonPanel.vue` — remove Evidence Analysis panel section
- [ ] `src/renderer/views/SourceDetailView.vue` — remove citation-to-assertion expansion UI (assertion count, expand button, inline assertion table, add assertion button)
- [ ] `src/renderer/i18n/en.ts` — remove `assertions` block + `assertions.nav`
- [ ] `src/renderer/i18n/sv.ts` — remove `assertions` block + `assertions.nav`

### Keep As-Is
- `src/api/sources.ts` — citations are standard GEDCOM
- `src/api/duplicates.ts` — merge logic minus assertion lines
- `src/renderer/components/CitationForm.vue` — standard citation creation
- Research Tasks, Groups, Media — independent of GPS

## Implementation Steps

### Step 1: Remove API + Schema
- [ ] Delete `src/api/assertions.ts`
- [ ] Remove assertion types from `src/api/types.ts`
- [ ] Remove assertions table from `src/api/schema.ts`
- [ ] Remove `checkUnresolvedConflicts` from `src/api/checks.ts`
- [ ] Remove assertion reassignment from `src/api/duplicates.ts`

### Step 2: Remove IPC + Preload + MCP
- [ ] Remove assertion IPC handlers from `src/main/ipc.ts`
- [ ] Remove `window.api.assertions` from `src/preload/index.ts`
- [ ] Remove assertion MCP tools from `src/mcp/createServer.ts`

### Step 3: Remove UI
- [ ] Delete `src/renderer/views/EvidenceView.vue`
- [ ] Delete `src/renderer/components/PersonEvidenceSection.vue`
- [ ] Delete `src/renderer/components/AssertionFormModal.vue`
- [ ] Remove /evidence route from `src/renderer/router.ts`
- [ ] Remove Evidence nav item from `src/renderer/App.vue`
- [ ] Remove Evidence section from `src/renderer/views/PersonDetailView.vue`
- [ ] Remove Evidence panel from `src/renderer/components/PersonPanel.vue`
- [ ] Remove assertion expansion from `src/renderer/views/SourceDetailView.vue`

### Step 4: Remove i18n + Tests
- [ ] Remove `assertions` block from `src/renderer/i18n/en.ts`
- [ ] Remove `assertions` block from `src/renderer/i18n/sv.ts`
- [ ] Delete `tests/unit/assertions.test.ts`

### Step 5: Update Documentation
- [ ] Update CLAUDE.md: remove Assertion type, assertion API functions, assertion MCP tools, PersonEvidenceSection/AssertionFormModal from component table, Evidence route
- [ ] Update docs/PLAN.md: mark this milestone complete
- [ ] Update docs/MCP.md: remove assertion tools section
- [ ] Update docs/IPC_REFERENCE.md: remove assertion channels

### Step 6: Schema Migration (existing databases)
- [ ] The assertions table will remain in existing .db files but will be unused. No migration needed — SQLite ignores unused tables. The CREATE TABLE IF NOT EXISTS removal means new databases simply won't have the table.

## What About the GEDCOM Export Exclusion?

Currently `gedcom_export.ts` counts assertions and reports them as excluded from GEDCOM export. After removal, this exclusion report entry should also be removed since there will be no assertions to exclude.

- [ ] Remove assertion exclusion from `src/gedcom/exporter.ts`

## What About GEDCOM 7.0 NO Records?

The import code tracks GEDCOM 7.0 `NO` records (negative assertions like "NO BURI" = "no burial occurred") and reports them as unmapped. This is fine to keep as-is — it's import reporting, not an assertion feature.
