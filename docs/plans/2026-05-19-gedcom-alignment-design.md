# GEDCOM Alignment — Audit + Full Remediation (Design Spec)

## User goal

Every authored field in our database survives a GEDCOM 5.5.1 OR 7.0 round-trip cleanly, or is explicitly classified as `lossy` / `excluded` in the fidelity registry with a documented reason. No silent data loss on export. Every concept GEDCOM 7.0 supports (or that a major non-GEDCOM importer carries — Holger, Genney, RootsMagic, Gramps) that our schema-can-but-UI-can't surface gets a UI entry point. The user can author, view, edit, and remove every primitive the data model owns. After this work, the genealogist's data is mechanically preserved through the full lifecycle: source format → DB → user edits → DB → GEDCOM export → re-import → equivalent DB.

This is the Prime Directive (data fidelity + round-trip fidelity from CLAUDE.md), enforced top-to-bottom across the schema, importers, exporters, and UI.

## Scope

Full enumeration of pattern instances and modifications. Anything not listed is a scope deviation requiring explicit reason in this document.

### Pattern: GEDCOM gap classification — every entity, every column
- All 16 tables in `src/api/schema.ts` audited against GEDCOM 5.5.1 + 7.0 + each non-GEDCOM importer (Holger/Genney/RootsMagic/Gramps)
- Audit output: `docs/GEDCOM_AUDIT.md` (permanent reference)

### Pattern: silent-round-trip-loss gaps — fix every one
**UI gaps where field is `lossless`/`lossless-via` in fidelity registry but has no UI entry point** — every instance, no exceptions:

| Entity / Column | Current state | Plan delivers |
|---|---|---|
| `citations.person_id` | column exists, CitationModal accepts personId prop, no panel section opens it | Sources/Citations section on PersonPanel |
| `citations.place_id` | column + prop, no UI surface | Sources/Citations section on PlacePanel |
| `citations.relationship_id` | column + prop, no UI surface | Sources/Citations section on RelationshipPanel |
| `citations.person_name_id` | column + already invoked from PersonNameModal | Verify path is complete; no new UI |
| `event_participants.role` | column round-trips, never displayed | Role picker per participant in EventParticipantsSection |
| `media_links.link_type` | column round-trips, no UI | Picker in media-attach flow + MediaModal display |
| `media.format`, `media.notes` | columns persist, no UI to edit | MediaModal extension |
| `sources.call_number`, `sources.abstract` | SourcePanel displays, SourceModal can't edit | SourceModal fields |
| `places.street`, `postal_code`, `city`, `country` | columns round-trip, no UI | PlaceFormFields extension |
| `places.date_from`, `date_to` | columns round-trip, no UI | PlaceFormFields extension |
| `events.place_address` | column round-trips, no UI | EventModal field |
| `events.date_value_end` | UI only renders when condition true; can't author for between/from-to in many event types | EventModal unconditional rendering |
| `person_names.name_prefix`, `name_suffix`, `name_qualifier`, `patronymic_base` | inputs hidden inside `<details>` block; not authorable in practice | PersonNameModal surface always-visible |
| `research_tasks.result` | only shown for done/stopped | ResearchTaskModal unconditional |
| `relationships.subtype` (sibling/godparent/other) | only rendered for couple/parent_child | RelationshipModal extension OR resolved by future rename |
| **Entire `repositories` entity (every column)** | net-new UI surface | RepositoriesView + RepositoryPanel + RepositoryModal + source-repo link section on SourcePanel |

### Pattern: silent-round-trip-loss bugs in current exporter — fix every one
Bugs uncovered during this design phase by reading `src/gedcom/exporter.ts` against the relationship model. Each corner case classified per-version: where the spec carries the concept, we achieve `lossless`; where the spec genuinely cannot, we accept documented `lossy:<version>-spec-limit` with disclosure.

| Corner case | Root cause | Plan delivers | 5.5.1 status | 7.0 status |
|---|---|---|---|---|
| **Single-parent families silently dropped on export** | Exporter at `src/gedcom/exporter.ts:553` iterates `couple` relationships only; orphan `parent_child` rows with no corresponding couple emit zero FAM record | Exporter emits synthetic FAM record (one HUSB or WIFE) for orphan parent_child rows; round-trip test for `(parent_only_mother + child)` seeded DB | `lossless` | `lossless` |
| **PEDI subtype potentially mis-attributed** | `exporter.ts:579` uses `Array.find()` against parent_child rows that may have different `subtype` values per parent for the same FAM; first match wins by array order | Explicit per-parent PEDI lookup; document the canonical resolution rule in the comment | `lossless` | `lossless` |
| **No FAMC/FAMS emission on INDI records** | Exporter doesn't emit; importer tolerates the omission but some 5.5.1-only tools require it | Emit FAMC for each INDI's family-as-child, FAMS for each INDI's family-as-spouse | `lossless` | `lossless` |
| **Same-couple-twice (multiple FAM with same HUSB+WIFE)** | Importer/exporter logic limit only — no schema UNIQUE constraint blocks it, both spec versions allow it | Importer creates separate couple rows per FAM occurrence; exporter emits one FAM per couple row even when same pair appears multiple times | `lossless` | `lossless` |
| **Multi-parent (3+ parents in one family unit) collapsed** | 5.5.1 FAM is strictly binary HUSB+WIFE → genuinely unrepresentable in 5.5.1. 7.0 supports via `ASSO @I3@ / ROLE PARENT` substructure on FAM | 7.0 emitter detects 3rd+ parents (parent_child rows whose parent is not in the FAM's HUSB/WIFE pair) and emits each as `1 ASSO @Ix@ / 2 ROLE PARENT` on the FAM. 5.5.1 emitter drops extras with disclosure to import/export report. | `lossy:5.5.1-spec-limit` (extra parents disclosed) | `lossless` |

### Pattern: missing GEDCOM 7.0 concepts — add every one
Concepts in GEDCOM 7.0 that our schema doesn't model. Each gets a new table or column, plus full importer + exporter + fidelity registry + tests.

| GEDCOM tag | New schema | Notes |
|---|---|---|
| `SNOTE` (shared notes) | `notes` (top-level) + `note_links` (polymorphic to person/event/place/source/family/etc.) | 7.0 first-class; 5.5.1 falls back to inline NOTE with `lossy:5.5.1-shared-degrades-to-inline` disclosure |
| `ASSO` (person-to-person, no event) | `person_associations` (person_id, related_person_id, role, notes) | Role per GEDCOM ROLE: godparent / friend / colleague / enemy / other |
| `NO X / DATE` (negative assertion) | `events.is_negation` (bool) + `events.negation_event_type` | Existing event model carries it via flag; no separate table |
| `NAME / TRAN` (alt-script/lang name) | `name_translations` (person_name_id, value, language, transliteration_scheme) | 5.5.1: fall back to additional NAME nodes with TYPE |
| `PLAC / TRAN` (alt-script/lang place) | `place_translations` (place_id, value, language, transliteration_scheme) | Same fallback |
| `SOUR / DATA / EVEN` (source coverage) | `source_coverage_events` (source_id, event_types[], date_value_from, date_value_to, place_id?, notes) | Lossless in 7.0, mostly lossless in 5.5.1 |
| `HEAD` (origin metadata preserved on import) | JSON value in `db_settings` under `header_metadata` key | Round-trip preserves originating-app, language, copyright |
| `SEX X` (intersex; 7.0 only) | `persons.sex` CHECK adds 'X' | 5.5.1 emit as 'U' with `lossy:5.5.1-spec-limit` |
| Date qualifiers `INTERPRETED`, `FROM x TO y` (with direction) | `events.date_type` extension | INTERPRETED stores user's original phrase; FROM/TO preserves direction |

### Pattern: legacy cleanup
- `sources.repository` (free-text string column) → migrate any non-empty values into `source_repositories` FK rows (no users yet → no production data to migrate, just any dev seed/test data), then drop the column. Importer/exporter switches to FK-only.

### Pattern: non-GEDCOM importer alignment
Each non-GEDCOM importer audited and updated to populate new tables when the source format carries the concept:

| Importer | New-concept coverage |
|---|---|
| Holger 8 (`src/import/holger/`) | Notes already covered. New: check for translation-shaped name variants, witnesses, source coverage. Map where present; document gaps in unmappedData. |
| Genney (`src/import/genney/`) | Same audit |
| RootsMagic (`src/import/rootsmagic/`) | RM7+ supports shared notes, alternate names, witness roles. Map them. |
| Gramps (`src/import/gramps/`) | Gramps natively models nearly all of this. Map 1:1 wherever schema permits. |
| Archive `.zip` (own format) | Extend JSON dump shape to include all new tables. Round-trip test. |

### Pattern: export-side updates
- HTML site export (`src/api/html_site/`): surface new fields (notes, translations, associations) on rendered static pages
- Archive `.zip` export: extend JSON dump shape (see above)
- GEDCOM export: every new concept emits to GEDCOM 7.0 losslessly; 5.5.1 falls back per documented rule

### Scope deviations

The following are deliberately out-of-scope. Each has a specific reason that is NOT "out of scope" or "would be hard."

- **`relationships` → `families`+`family_members`+`person_associations` rename and table restructure.** Reason: user explicitly held off this rename pending the corner-case investigation. This plan instead patches each corner case at the exporter layer per spec capability — three (single-parent FAM, PEDI ambiguity, no FAMC/FAMS) become `lossless` on both versions; one (same-couple-twice) becomes `lossless` on both versions via importer/exporter logic; one (multi-parent triad) becomes `lossless` on 7.0 via ASSO emission and `lossy:5.5.1-spec-limit` only on 5.5.1. The audit document RECOMMENDS the rename as a future plan for cleaner model fit, but the rename is no longer needed to achieve round-trip fidelity. If during execution the user reverses this decision, the plan converts to "execute rename in T03" with downstream UI tasks adjusting.
- **LDS ordinances** (`BAPL`, `ENDL`, `SLGC`, `SLGS`). Reason: non-LDS app; current `unmappedData` disclosure on import suffices. Documented as `excluded:non-LDS-app` in fidelity registry.
- **DNA evidence** (`_DNA` vendor extensions in 7.0). Reason: vendor-specific, no canonical structure to model against. Documented as `excluded:vendor-extension`.
- **Multi-submitter** (multiple `SUBM` records). Reason: solo-researcher app by design. Single `header_metadata` SUBM preserved; additional SUBMs disclosed in import report. Documented as `lossy:singleton-by-design`.

## Verification

Per `.claude/rules/plans.md` user-goal-falsifiability test. The verification items below are user-observable; if every one passes, the user goal in §1 cannot still be false.

1. **Seed a maximally-complex DB; round-trip GEDCOM 5.5.1; assert column-level diff is empty (or matches lossy-registry-declared expectations).** Implemented as `tests/unit/gedcom-roundtrip-comprehensive.test.ts` — seeds every table with rows exercising every column (including new tables), exports GEDCOM 5.5.1, re-imports into a fresh DB, diffs at column level against expected values from the fidelity registry.
2. **Same as #1 but for GEDCOM 7.0.** Stricter expected values (more `lossless` entries; fewer `lossy` ones).
3. **End-to-end import → export → re-import test for each non-GEDCOM importer.** Holger, Genney, RootsMagic, Gramps. Each importer's golden-fixture DB must export to GEDCOM 7.0 and re-import equivalently per fidelity registry.
4. **Archive `.zip` round-trip test** covering every new table.
5. **Corner-case targeted tests** — per version, per corner case:
   - **Single-parent FAM**: seed `(mother + child + no father)`; export 5.5.1 + 7.0; re-import each; assert mother-child link survives on both.
   - **PEDI ambiguity**: seed `(bio-mother + step-father couple + child biological-to-mother + step-to-father)`; export 5.5.1 + 7.0; re-import; assert PEDI subtype correct per parent on both versions.
   - **FAMC/FAMS emission**: seed `(person + spouse + child)`; export 5.5.1 + 7.0; assert FAMS on person, FAMS on spouse, FAMC on child in both outputs.
   - **Same-couple-twice**: seed `(couple A married 1850, divorced 1855, remarried 1860 — two FAM records in source)`; import; assert two separate couple rows persist; export both versions; assert two FAM records in each output; re-import; assert equivalence.
   - **Multi-parent triad on 7.0**: seed `(child with bio-mother + bio-father + adoptive-mother, 3 parent_child rows)`; export 7.0; assert FAM with 2 strongest parents as HUSB/WIFE + `1 ASSO @I3@ / 2 ROLE PARENT` for 3rd parent on FAM; re-import; assert all 3 parent_child rows reconstruct.
   - **Multi-parent triad on 5.5.1**: same seed; export 5.5.1; assert FAM with 2 strongest parents + extra-parents-dropped warning in export report; re-import; assert 2 parent_child rows + disclosure documented per `expectedAfterRoundTrip`.
6. **Schema-introspection coverage test** continues to pass: every new column has a fidelity-registry entry; CI fails on omission.
7. **UI completeness assertion:** for every silent-round-trip-loss gap listed above, a Playwright `[crud]`/`[panels]` test exercises the create/view/edit/delete path for the field on the target panel — proving the user-facing surface exists, not just that the column persists.
8. **`npm run test:e2e:full` green** across all 7 projects.
9. **Build clean:** `npm test`, `npm run lint`, `npm run build`, `npm run build:static`, `npm run build:mcp-sidecar` all exit 0.
10. **Live walkthrough at close-out:** import the included Bernadotte and Holger fixture files via the UI, walk through every new section/modal/field, confirm by inspection.

If items 1, 2, 3 pass, no field silently drops on round-trip. If items 5, 7 pass, every UI gap and every corner case is closed. If items 4, 6, 8, 9, 10 pass, the broader fixture and CI surface holds.

## Failure modes / RCA reference

Three prior failure modes inform this plan's structure:

- **Panel-composables refactor (v0.190.0–v0.190.2, RCA in `.claude/rules/plans.md`):** plan was mechanism-first, scope was implicit, verification was hygiene-only. This plan opens with a user goal and enumerates every pattern instance to avoid the same drift.
- **Tauri full-port close-out (RCA 2026-05-12):** plan archived while `npm start` was broken; hygiene gates passed but user-observable verification was absent. This plan's verification section names user-observable artifacts (round-trip diff output, e2e green per project, live walkthrough) rather than "tests pass."
- **GEDCOM corner-case investigation (this conversation, 2026-05-19):** the `relationships` model had two silent-data-loss bugs in production for at least a year, undetected by lint, unit tests, and three rounds of code review. Found only when explicitly asked "can we export cleanly." Lesson: pattern audits against the destination format catch what test suites miss. The audit task (T01) in this plan exists to surface the analogues in tables we haven't yet investigated.

## Architecture

### Three-deliverable structure

The plan produces three deliverables:

1. **`docs/GEDCOM_AUDIT.md`** — Permanent reference doc. Three sections:
   - **Entity model alignment** — table-by-table comparison of our schema vs GEDCOM 5.5.1 + 7.0 with verdict (✅ aligned / ⚠️ different shape that round-trips / ❌ gap)
   - **Gap classification** — every gap with `severity` (silent-loss / authoring-blocked / nice-to-have), `surface` (schema / importer / exporter / UI / all), and `task-id` pointing into this plan
   - **Recommended future work** — RECOMMENDS the `families` rename as a follow-up plan; documents the four documented `lossy:current-model-limitation` corner cases the rename would resolve

2. **Schema + API + importer + exporter + fidelity registry extensions** (Phase 2, 6 parallel tasks)

3. **UI surfaces for every authorable field** (Phases 3–4, 14 parallel tasks)

### Per-concept importer/exporter modularization (parallelization enabler)

Currently `src/gedcom/exporter.ts` is one large file and `src/import/gedcom/phases/` is several phase modules. To enable parallel execution of Phase 2 tasks without per-file merge conflicts, T02 (schema-additions task) ALSO scaffolds empty per-concept emitter modules:

```
src/gedcom/exporters/
  notes-emitter.ts          (stub created by T02; filled by T04)
  assoc-emitter.ts          (stub by T02; filled by T05)
  negation-emitter.ts       (stub by T02; filled by T06)
  translations-emitter.ts   (stub by T02; filled by T07)
  coverage-emitter.ts       (stub by T02; filled by T08)
  
src/import/gedcom/phases/
  notes.ts          (stub by T02; filled by T04)
  assoc.ts          (already exists, extended by T05)
  ...etc
```

`src/gedcom/exporter.ts` is reduced to an orchestrator that calls each per-concept emitter. T02 lands this restructure as part of its schema scaffolding so Phase 2 tasks edit only their own concept files. Merge conflicts on `phases.ts` orchestrator are minimal (one new call per task — mechanical to resolve).

### Fidelity registry merge-conflict minimization

`src/api/gedcom_fidelity_registry.ts` is a single object literal. Concurrent edits to add unrelated entries don't semantically conflict but git may flag them. Mitigation: T02 adds placeholder `kind: 'lossless'` entries with no `ownedBy` pointer for every new column, sectioned by table. Phase 2 tasks update existing entries in-place (`ownedBy` pointers, `kind` refinements where lossy) rather than appending. Smaller diff per task, cleaner merges.

### Test layout

- `tests/unit/gedcom-roundtrip-comprehensive.test.ts` — golden-DB-seed round-trip test (seeds every column; exports; re-imports; diffs). Verifies user goal item #1, #2.
- `tests/unit/gedcom-roundtrip-corner-cases.test.ts` — single-parent FAM, PEDI ambiguity, FAMC/FAMS emission, same-couple-twice. Verifies user goal item #5.
- `tests/unit/holger-roundtrip.test.ts`, `genney-roundtrip.test.ts`, `rootsmagic-roundtrip.test.ts`, `gramps-roundtrip.test.ts` — each importer's golden fixture → GEDCOM 7.0 export → re-import equivalence.
- `tests/unit/archive-roundtrip.test.ts` — `.zip` export → re-import equivalence covering new tables.
- `tests/components/<panel>.<section>.test.ts` — per-UI-gap mounted-component tests asserting the section/modal authors the column correctly.
- `tests/e2e/[crud]/` and `tests/e2e/[panels]/` — Playwright tests for every new UI surface.

## Task list

29 tasks across 6 phases. Dependencies form three roughly-parallel streams after the audit + schema-scaffolding bottleneck.

```
T01 (audit doc; serial; ~1d)
  │
  ▼
T02 (schema additions + module scaffolding + fidelity registry placeholders;
     all new tables/columns landed at once; no relationships-table touch;
     drop sources.repository column; ~1d)
  │
  ▼
T03 (exporter corner-case patches + fidelity registry lossy entries for #3,#4;
     unblocks parallel work but doesn't block UI tasks; ~1d)
  │
  ▼  AT THIS POINT 15 INDEPENDENT TASKS UNBLOCK
  │
  ├─► Phase 2 — Schema-feature integration (6 parallel subagents, 3-5d each)
  │      T04: Shared notes (api + importer module + exporter module + fidelity + tests)
  │      T05: Person associations
  │      T06: Negative assertions
  │      T07: Translations (names + places)
  │      T08: Source coverage
  │      T09: Sex X / HEAD preservation / extended date qualifiers
  │
  ├─► Phase 3 — UI for existing-but-unsurfaced fields (9 parallel subagents, 1-3d each)
  │      T10: Repositories CRUD
  │      T11: Citations on PersonPanel
  │      T12: Citations on PlacePanel
  │      T13: Citations on RelationshipPanel
  │      T14: SourceModal — call_number + abstract
  │      T15: PlaceFormFields — address + lifecycle dates
  │      T16: PersonNameModal — surface buried fields
  │      T17: EventModal — place_address + unconditional date_value_end
  │      T18: EventParticipantsSection — role picker
  │
  └─► Phase 3 misc (1 subagent, ~1d)
         T19: ResearchTask result / Relationship subtypes / MediaModal fields
  
  PHASE 2 TASKS UNBLOCK CORRESPONDING UI TASKS AS THEY LAND:
  
  ├─► Phase 4 — UI for new schema (5 tasks; each gated on its Phase 2 sibling)
  │      T20: Shared notes UI (after T04)
  │      T21: Person associations UI (after T05)
  │      T22: Negative assertions UI (after T06)
  │      T23: Translations UI (after T07)
  │      T24: Source coverage UI (after T08)
  │
  AFTER ALL PHASE 2 LANDS:
  
  └─► Phase 5 — Other-format alignment (3 parallel tasks, 2-4d each)
         T25: Holger / Genney / RootsMagic / Gramps importers
         T26: Archive .zip extension + round-trip test
         T27: HTML site export updates
  
  AFTER ALL PHASE 5 LANDS:
  
T28 (full close-out verification; ~0.5d)
```

Wall-clock estimate with up to 9 concurrent subagents at peak: ~3 weeks. Serial bottlenecks: T01, T02, T03 (~3 days). Longest individual task: T04 shared notes (~5 days; new table + importer + exporter + UI ripple via NoteModal/NotePicker + polymorphic link wiring across every entity panel). Phase 5 alignment is roughly 2-week parallel block depending on per-importer audit depth.

## Per-task structure

Every task follows this contract per `subagent-handoff`:

1. **User-observable outcome named in the task spec.** Not "add column X" — "user can author Y on Z surface; the value survives GEDCOM 7.0 round-trip."
2. **Verification command and expected output captured.** Each task lists the specific test file paths it touches and the `npm test -- <pattern>` command to verify.
3. **Subagent prompt template:** centers user goal first, enumerates pattern scope, requires evidence-before-completion per `superpowers:verification-before-completion`.
4. **Spec review + code-quality review per task** before merging back to the plan's worktree.

## Risks and mitigations

**Risk: Phase 2 schema-feature tasks discover modeling questions T01 didn't settle.** Mitigation: T01's deliverable explicitly includes a "decisions register" — every modeling question encountered during audit (table layout, column types, FK directions, polymorphic vs typed) gets a decision-with-rationale entry. Subagents executing Phase 2 follow the decisions register; no ad-hoc re-deciding.

**Risk: parallelization conflicts on importer/exporter/fidelity-registry single files.** Mitigation: T02 scaffolds per-concept modules and registry placeholders; subagents only edit their own files. Documented above.

**Risk: holger/genney/rootsmagic/gramps importers expand scope unpredictably (each might reveal "this format has feature X we don't model").** Mitigation: T25 is one task with a fixed scope — "audit each importer for the new concepts listed in this plan and map where applicable; document gaps in unmappedData." Discovered features beyond this plan's concept list go into the audit doc's recommended-future-work section, not into this plan.

**Risk: UI ripple from PersonPanel changes (new sections: Sources, Notes, Associations, Translations) makes the panel too dense.** Mitigation: T11, T20, T21, T23 each ship a panel layout review per `ux-intent-mapping`. Sections collapse by default; section visibility settings persist via `usePanelSections`.

**Risk: corner-case patches (T03) introduce regressions in existing GEDCOM round-trip tests.** Mitigation: T03 runs the existing `tests/unit/gedcom*.test.ts` suite (every commit) plus adds new `gedcom-roundtrip-corner-cases.test.ts`. Spec reviewer for T03 must confirm zero existing-test regressions.

**Risk: 29-task plan with parallel execution drifts.** Mitigation: weekly checkpoint at end of each working week to re-confirm the audit doc's gap classification still matches landed work, and to verify CI is green on the plan's worktree. If drift detected, pause, re-align.

## Open questions resolved during brainstorming

1. **GEDCOM-X relevance?** Dropped. No GEDCOM-X export, no GEDCOM-X terminology in new identifiers, no GEDCOM-X assessment section in audit. We adopted (and keep) several GEDCOM-X-influenced model choices (events as shared rows via event_participants, citations factored as their own table) — these are good and documented as deliberate, not converted back.
2. **Sources/citations/repositories naming?** Verified correct — our `repositories` = REPO, `sources` = SOUR, `citations` = inline SOUR substructure. Common confusion from "citation" sounding like a quote; in fact it IS the standard genealogy-prose word for the concept. No renames.
3. **What to do with `sources.repository` string column?** Drop it. No users yet → no migration. T02 removes the column; importer/exporter switches to FK-only via `source_repositories`.
4. **Rename `relationships` → `families`?** Held off by user. Patched at exporter layer (T03) for every corner case per spec capability — three corner cases (single-parent FAM, PEDI ambiguity, no FAMC/FAMS) become `lossless` on both versions; same-couple-twice becomes `lossless` on both versions; multi-parent triad becomes `lossless` on 7.0 via ASSO ROLE PARENT and `lossy:5.5.1-spec-limit` only on 5.5.1. Round-trip fidelity achieved without rename. Audit doc recommends rename as a future-plan model-cleanliness improvement, but it's no longer load-bearing for the Prime Directive.
5. **Can we document loss on GEDCOM 5.5.1 and support on 7.0 for each gap?** Yes — this is the principle the audit doc encodes. Per-version fidelity registry entries already support per-version classification; the corner-case table above applies it case-by-case. Every gap gets the strictest classification each version's spec permits.
5. **Plan shape — mega-plan or per-cluster?** Mega-plan. User explicitly chose "all gaps, no stone unturned." Risk mitigated via parallel subagent dispatch and per-task verification gates.
6. **Other-format implications?** Each non-GEDCOM importer gets a dedicated task (T25) to map the new concepts. Archive `.zip` extended (T26). HTML site export extended (T27).

## Next step

Invoke `superpowers:writing-plans` to produce the implementation plan at `docs/plans/2026-05-19-gedcom-alignment.md` with task-by-task checkboxes, dependency edges, subagent prompt templates, and verification commands per task.
