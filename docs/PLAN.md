# Plan: Släktforskning

A local-first desktop genealogy app. Includes a built-in MCP server so that **external** AI agents (Claude Desktop, Claude Code, etc.) can read, write, and test the database — the app itself ships **no integrated agent**, no in-app chatbot, no in-process LLM. Architecture and tech decisions live in [`CLAUDE.md`](../CLAUDE.md). Version history: [CHANGELOG.md](../CHANGELOG.md). Completed milestones: [plans/archive/PLAN.md](plans/archive/PLAN.md).

---

## Roadmap

#### European Gazetteer Roadmap [in-progress, 1 of 14 plans landed]
End-to-end European place-resolution coverage — Tier 1 (DE, GB, IE, NL, BE, FR, EE, LV, LT, PL) gets parishes + boundaries; Tier 2 (~33 countries) gets admin1+admin2+localities; one `europe-historical` gazetteer for Habsburg / Russian Empire / partition entities.
- Design: `docs/plans/2026-05-09-european-gazetteers-design.md`
- DE upgrade landed: `docs/plans/archive/2026-05-09-de-gazetteer-upgrade.md` (de-gemeinden-boundaries + de-kirchgemeinden, v0.229.0)
- 13 plans remaining: `docs/plans/2026-05-09-{gb,ie,nl,be,fr,ee,lv,lt,pl,tier2-{western,central,eastern},europe-historical}-gazetteer*.md`

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

---

## GEDCOM Round-Trip Fidelity: Lossy → Lossless Promotions [backlog]

The registry in `src/api/gedcom_fidelity_registry.ts` declares 20+ fields as currently lossy. Each entry below describes an upgrade path to lossless status via custom GEDCOM tags. Priority is determined by user impact: couple subtypes (marriage, divorce) are higher priority than research-task metadata; group/task records are saved last and may be out of scope for v1.

#### groups / group_links — custom `_GROUP` tag [backlog]
`groups` (name, notes) and `group_links` (entity_type, entity_id, sort_order) are currently dropped on export; they have no GEDCOM equivalent. A custom `_GROUP` tag structure could carry group records as references under level-0 (with name/notes) and group-link targets under level-1. Path: extend exporter to emit `_GROUP` records; extend importer phases to recognize and parse them. Test via golden-DB round-trip. User impact: medium (groups are used for organizing large trees but are not essential to offboarding).

#### research_tasks / task_links — custom `_TASK` tag [backlog]
Like groups, research tasks and their links have no GEDCOM representation. Custom `_TASK` records (with priority, status, task, notes, result) and `_TASK_LINK` sub-records could carry the full dataset. Path: parallel to groups upgrade. Lower user impact than groups (tasks are internal research metadata, not published genealogy).

#### events.place_address — custom `_PLAC_ADDR` sub-tag [backlog]
The `place_address` field (street, city, postal_code, country addresses at the event level) is currently dropped on export under both GEDCOM 5.5.1 and 7.0. A custom `_PLAC_ADDR` sub-tag could preserve it: `2 _PLAC_ADDR Tvärgatan 5, 35243 Växjö, Sverige`. Requires coordinate logic (when to emit ADDRESS vs custom tag) to avoid duplication with standard ADDR. Path: extend exporter with conditional `_PLAC_ADDR` emit for non-empty `place_address`.

#### sources.abstract, sources.call_number — custom `_ABSTRACT` and `_CALL` [backlog]
Source abstract and call_number are currently lossy (not emitted to GEDCOM). Custom `_ABSTRACT` and `_CALL` sub-tags under `SOUR` records could carry them. Medium priority (affect source workflow but not core genealogy data).

#### media.is_printable — custom `_PRINTABLE` flag on OBJE [backlog]
Currently resets to 0 on round-trip. A custom `_PRINTABLE 1` sub-tag on OBJE records could preserve the flag. Very low priority (purely metadata for reporting).

#### relationships.notes — custom `_COUPLE_NOTE` and `_PAREN_NOTE` for non-couple types [backlog]
Relationship notes are currently lossy for non-couple types (they're dropped on export). Couple relationship notes are preserved via custom `_COUPLE_NOTE` on FAM, but sibling/godparent/other relationships have no carrier (ASSO has no NOTE support). Path: extend ASSO emit to carry a custom `_RELA_NOTE` sub-tag. Low priority (relationship metadata is often stored at the event or person level instead).

#### media_links.link_type — preserve via custom `_LINK_TYPE` on OBJE [backlog]
`link_type` on media_links is currently lossy (importer resets it to null). A custom `_LINK_TYPE <portrait|document|...>` sub-tag could preserve the link hint. Low priority (mostly a UI convenience, relative media order survives).

#### citations.transcription — lossy via custom `_TRANS` sub-tag — promote 7.0 to lossless [backlog]
Under GEDCOM 5.5.1, citation transcriptions are dropped because SOUR cites have no standard TEXT analog (v5.5.1 TEXT appears only under DATA). Under GEDCOM 7.0, this could be promoted to lossless via custom `_TRANS` under the source citation. Path: exporter detects v7.0 and emits `_TRANS`; importer on v7.0 reads it. Currently both v551 and v70 are lossy in the registry. Separate the versions and promote 7.0. Medium priority (transcription is high-value genealogy data and worth saving).

### [planned] Archive (.zip) round-trip fidelity registry + tests
Mirror `src/api/gedcom_fidelity_registry.ts` for the .zip archive export/import path. Share the helper infrastructure in `tests/helpers/gedcom_fidelity.ts` but allow per-format status (e.g., groups could be lossless in archive but lossy in GEDCOM). Scope: `src/export/archive.ts`, `src/import/archive/`, tests for per-field round-trip + golden-seed.
