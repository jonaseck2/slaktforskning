# GEDCOM Alignment Audit

Permanent reference. Classifies every schema column in [`src/api/schema.ts`](../src/api/schema.ts) against GEDCOM 5.5.1, GEDCOM 7.0, and each non-GEDCOM importer we ship (Holger, Genney, RootsMagic, Gramps). Lists every gap with severity and links to the task that closes it in [`docs/plans/2026-05-19-gedcom-alignment.md`](plans/2026-05-19-gedcom-alignment.md). Recommends future work.

This doc is the source of truth for modeling decisions referenced by Phase 1 schema work (T02) and Phase 2 schema-feature integration (T04–T09). It is not a plan; it is the standing reference plans cite.

Companion files:

- [`src/api/gedcom_fidelity_registry.ts`](../src/api/gedcom_fidelity_registry.ts) — per-column round-trip status enforced by the schema-introspection coverage test (`tests/unit/gedcom-fidelity-registry-coverage.test.ts`). Adding a column without a registry entry breaks CI.
- [`src/gedcom/exporter.ts`](../src/gedcom/exporter.ts) and [`src/import/gedcom/phases/`](../src/import/gedcom/phases/) — implementation of the mapping rules below.
- [`docs/plans/2026-05-19-gedcom-alignment-design.md`](plans/2026-05-19-gedcom-alignment-design.md) — design spec the gap classification below was extracted from.
- [`CLAUDE.md`](../CLAUDE.md) — Prime Directive (Round-Trip Fidelity) that gives this audit its severity bar.

## How to read this doc

- **Verdict** column in §1: `aligned` (same shape as GEDCOM, no custom tag), `via` (different shape but round-trips losslessly via a documented tag, either standard or custom `_PREFIX`), or `gap` (something is silently lost or unauthorable). A `via` is acceptable forever; a `gap` is a Prime Directive concern unless explicitly classified `lossy` or `excluded` with a reason in the fidelity registry.
- **Severity** in §2 follows the Prime Directive ranking: `silent-loss` (Prime Directive violation — data written to the DB does not survive a round-trip and the user is not told), `authoring-blocked` (schema preserves the value but the UI offers no way to enter / edit / remove it, so the user cannot exercise the column without the MCP or a fixture importer), `nice-to-have` (cosmetic; doesn't block authoring or round-trip).
- **5.5.1 status** / **7.0 status** mirror the fidelity-registry vocabulary: `lossless`, `lossless-via:<mechanism>`, `lossy:<reason>`, `excluded:<reason>`.
- **Task-id** points into [`docs/plans/2026-05-19-gedcom-alignment.md`](plans/2026-05-19-gedcom-alignment.md). `none` means the gap is documented but not in this plan's scope (cite the reason).

## §1 — Entity model alignment

Every table in [`src/api/schema.ts`](../src/api/schema.ts), one row. Columns: our table → GEDCOM 5.5.1 → GEDCOM 7.0 → Holger → Genney → RootsMagic → Gramps → verdict.

Holger uses our standard GEDCOM importer with `profile='holger'` ([`src/import/holger/index.ts`](../src/import/holger/index.ts)); its column mapping is identical to GEDCOM 5.5.1 in practice (Holger 8 exports 5.5.1 ANSI). The "Holger" column below therefore tracks what Holger-exported GEDCOM contains in practice (per the Holger 8 manual + fixture inspection), not a separate format.

| Our table | GEDCOM 5.5.1 | GEDCOM 7.0 | Holger | Genney | RootsMagic | Gramps | Verdict |
|---|---|---|---|---|---|---|---|
| `persons` ([schema:17](../src/api/schema.ts#L17)) | `INDI` record | `INDI` record | `INDI` (5.5.1) | `PERSON` table (RID `I*`) | `PersonTable` | `<person>` element | aligned |
| `person_names` ([schema:26](../src/api/schema.ts#L26)) | `NAME` sub-record under INDI with `NPFX`/`SURN`/`NSFX`/`NICK` sub-tags + `TYPE` | Same plus `NAME.TRAN` for transliteration (see §2) | `NAME` under INDI | `PERSON.GIVENNAME`/`SURNAME`/`NICKNAME`/`PREFIX`/`SUFFIX` (single name per person; not multi-NAME) | `NameTable` with `NameType` 0/2/3/4/6 (primary/AKA/married/alias/birth) | `<name>` blocks per person (multi-name) | via — name-piece sub-tags carry prefix/suffix/qualifier/patronymic; `preferred_name` rides asterisk in given_name; `nickname` via `NICK`; `name_type` mapped per-format |
| `person_identifiers` ([schema:44](../src/api/schema.ts#L44)) | `REFN`/`RIN` standard tags; `_FSFTID`/`_UID`/`_AFN` etc. as custom or in `IDNO`/`SSN` | Same plus first-class `UID` in 7.0 | `REFN`/`RIN`/`_UID` (5.5.1) | `PERSON.UID` | `PersonTable.UniqueID` | `<attribute type="_UID">` | via — `identifier_type` enum maps to standard/custom tag per row |
| `relationships` ([schema:54](../src/api/schema.ts#L54)) | `couple` → `FAM` record (HUSB/WIFE); `parent_child` → `FAMC`/`FAMS` + PEDI; `sibling`/`godparent`/`other` → `ASSO` with `RELA` under one of the INDIs | Same shape; 7.0 also allows `ASSO` on FAM for multi-parent via `ROLE PARENT` | Same as 5.5.1 | `FAMILY` + `COUPLE_FAMILY` + `SPOUSE_FAMILY` tables (binary HUSB/WIFE only) | `FamilyTable` + `ChildTable` (binary only) | `<family>` elements (binary) | via — deliberate GEDCOM-X-influenced shape; flatter than FAM but FAM round-trips losslessly via translation layer in importer/exporter. See §3 for rename rationale. |
| `event_participants` ([schema:98](../src/api/schema.ts#L98)) | Implicit (the INDI owning the event has role `primary`); other participants ride `ASSO` with `RELA` on the event | Same | Same | `OWNER_EVENT` (event ownership) + `WITNESS`-shaped rows via Genney role conventions | `WitnessTable` (role per FK to RoleTable) | `<eventref role="...">` per person | via — GEDCOM-X-influenced (multi-role per event); maps to ASSO RELA |
| `places` ([schema:67](../src/api/schema.ts#L67)) | `PLAC` sub-tag (comma-separated hierarchy) + `MAP`/`LATI`/`LONG` + `ADDR`/`ADR1`/`CITY`/`POST`/`CTRY` | Same plus `PLAC.TRAN` for transliteration (see §2) | `PLAC` + `MAP` (5.5.1) | `SPLACE` table (self-referential hierarchy + lat/lon + address) | `PlaceTable` (flat; hierarchy implied in name; lat/lon × 10⁷) | `<placeobj>` with `<placeref>` for parent | via — `place_type`, `date_from`, `date_to`, `notes` ride custom `_PTYPE`/`_DATE_FROM`/`_DATE_TO`/`_PNOTES`; address fields ride standard ADDR sub-structure; `parent_place_id` is `lossy` (see §2). |
| `events` ([schema:84](../src/api/schema.ts#L84)) | Per-type tag under INDI/FAM (`BIRT`, `DEAT`, `MARR`, etc.) + `DATE`/`PLAC`/`CAUS`/`NOTE`; fact-shaped events emit value on tag line | Same plus first-class date qualifiers (`INTERPRETED`, `FROM x TO y`) and `NO` negation (see §2) | Same as 5.5.1 (Holger emits standard tags) | `EVENT` table + `EVENT_PLACE` + `OWNER_EVENT` | `EventTable` + `FactTypeTable` (one row per fact-type) | `<event>` element with `<type>` | via — `event_type` enum maps to tag; `date_value`/`date_value_end`/`date_original`/`date_type` ride DATE keyword grammar; `place_address` rides custom `_PLAC_ADDR`. **`value` is lossy for non-fact event types** (see §2). |
| `sources` ([schema:108](../src/api/schema.ts#L108)) | `SOUR` top-level record + `TITL`/`AUTH`/`PUBL` standard tags | Same | Same | `SOURCE` table | `SourceTable` | `<source>` element | via — `url`/`source_type`/`call_number`/`abstract`/`repository` (free-text) ride custom `_URL`/`_STYPE`/`_CALL`/`_ABSTRACT`/`_REPO_TEXT` sub-tags. **`sources.repository` free-text column is scheduled for drop (T02);** repository FKs go via `source_repositories`. |
| `citations` ([schema:120](../src/api/schema.ts#L120)) | Inline `SOUR` substructure (cite to a top-level SOUR with `PAGE`/`DATA/TEXT`/`QUAY`/`NOTE` sub-tags) under any record that cites the source — INDI / NAME / FAM / event / PLAC | Same | Same | `CITATION` + `CITATION_SOURCE` + `OWNER_CITATION` (rich citation table with attachment to event/person/family) | `CitationTable` (with `OwnerType`/`OwnerID` poly-attachment) | `<citation>` element + `<citationref>` from the host | via — deliberate normalized-relational shape (factored out of inline SOUR for query convenience); round-trips losslessly via inline-SOUR re-emission per host kind. `transcription` is lossy on 5.5.1 for person/family/place hosts (see §2); lossless on 7.0 via `_TRANS` custom. |
| `groups` ([schema:136](../src/api/schema.ts#L136)) | No GEDCOM equivalent | No GEDCOM equivalent | n/a | `GROUPS` + `GROUP_MEMBER` tables (Genney's native group concept) | None (no group concept in RM schema) | None (Gramps tags are flat tag rows, not groups) | via — app-specific; rides custom top-level `_GROUP` records on export. Lossless via custom tags, but **no other tool will read them.** |
| `group_links` ([schema:143](../src/api/schema.ts#L143)) | n/a | n/a | n/a | (see `groups`) | n/a | n/a | via — polymorphic link; rides `_GROUP_LINK`/`TYPE` sub-record under `_GROUP`. |
| `repositories` ([schema:155](../src/api/schema.ts#L155)) | `REPO` top-level record + `ADDR`/`PHON`/`EMAIL`/`WWW` | Same | Same | `REPO` table (mostly identical to GEDCOM REPO shape) | `RepositoryTable` | `<repository>` element | aligned (apart from `call_number`, which the exporter does not emit today — see §2 gap row) |
| `source_repositories` ([schema:171](../src/api/schema.ts#L171)) | `REPO @REPOx@` sub-tag under `SOUR` (one source → many repo refs) | Same | Same | `SOURCE_REPO` join table | `SourceRepositoryTable` (implicit through citations) | `<reporef>` from source | aligned |
| `research_tasks` ([schema:177](../src/api/schema.ts#L177)) | No GEDCOM equivalent | `_TODO` is sometimes used as a vendor extension; no standard tag | n/a | `TODO` table (Genney's native research-task concept) | `TaskTable` (RM 9+) — **unknown coverage**, currently not imported | `<note type="To Do">` (Gramps uses notes typed `To Do`) | excluded (app-specific). T19 fixes the result-field UI gap; the row itself is `lossy: dropped on export` per registry. |
| `task_links` ([schema:188](../src/api/schema.ts#L188)) | n/a | n/a | n/a | (via TODO.PERSON) | n/a | n/a | excluded (rides research_tasks; both dropped on export) |
| `media` ([schema:200](../src/api/schema.ts#L200)) | `OBJE` top-level record or inline `OBJE` sub-record + `FILE`/`FORM`/`TITL`/`NOTE` | Same | Same | `MEDIA` table | `MultimediaTable` + `MediaLinkTable` | `<object>` element + `<objref>` from host | via — `file_ref` is relative path; `is_printable` is `lossy` (exporter does not emit, importer sets 0); `is_missing` is `excluded` (derived at import). |
| `media_links` ([schema:211](../src/api/schema.ts#L211)) | Inline OBJE under host record | Same | Same | (via MEDIA.OWNER_TYPE/OWNER_ID) | `MediaLinkTable.OwnerType/OwnerID` | `<objref>` from host | via — polymorphic link; `link_type` is `lossy` (not emitted). `entity_type` is `excluded` (derived from where the OBJE appears in the GEDCOM tree). |
| `media_regions` ([schema:228](../src/api/schema.ts#L228)) | No GEDCOM equivalent | No GEDCOM equivalent | n/a | None | None | None | excluded (app-specific face-tag overlay; not exported) |
| `db_settings` ([schema:223](../src/api/schema.ts#L223)) | n/a | n/a | n/a | `INI` table | None | `<header>` (researcher metadata) | excluded (app-internal storage; some keys round-trip via HEAD — see T09) |
| `gazetteers` ([schema:242](../src/api/schema.ts#L242)) | n/a | n/a | n/a | n/a | n/a | n/a | excluded (render-time place resolution data; never authored by user, never exported) |
| `ignored_duplicates` ([schema:257](../src/api/schema.ts#L257)) | n/a | n/a | n/a | n/a | n/a | n/a | excluded (UI state for duplicate-merge workflow; not authored content) |
| `quality_issue_counts` ([schema:588](../src/api/schema.ts#L588)) | n/a | n/a | n/a | n/a | n/a | n/a | excluded (render-time cache, refreshed from current DB state) |

**Sixteen tables claimed in `.claude/rules/api.md`; this audit enumerates twenty.** The four extra are `ignored_duplicates`, `quality_issue_counts`, `gazetteers`, and `media_regions` — all `excluded` from GEDCOM by design (UI state, render cache, gazetteer data, app-specific overlay). The "16 tables" count in the rule predates the additions in v0.218, v0.220, v0.236, v0.249.

### Deliberate model deviations (called out explicitly)

These are not gaps. They are conscious model choices the audit endorses; documenting them here means future readers don't re-derive them and don't try to "fix" them.

1. **`relationships` + `event_participants` is flatter than GEDCOM `FAM`.** Our model stores each parent-child pairing as a separate `relationships` row (`type='parent_child'`, `subtype` per parent) and each marital union as a `couple` row. GEDCOM stores both inside one `FAM` record. This is GEDCOM-X-influenced (Persons have Relationships; Events are shared across participants) and gives us cleaner queries for "who are this person's parents" without walking through a family object. Round-trip translation lives in [`src/gedcom/exporter.ts`](../src/gedcom/exporter.ts) (couples + per-child `parent_child` rows → FAM records with HUSB/WIFE/CHIL/PEDI) and [`src/import/gedcom/phases/`](../src/import/gedcom/phases/) (FAM → couple row + N parent_child rows). The exporter currently has five corner-case bugs in this translation layer (§2); T03 fixes them per-version.
2. **`citations` is a normalized inline-SOUR substructure.** GEDCOM treats citation as a sub-structure of whatever record cites the source (a NAME's SOUR sub-tag, an event's SOUR sub-tag, an INDI's SOUR sub-tag). We factor it into its own table for relational query convenience (a single source can have many citations, each polymorphically attached to person / event / place / relationship / person_name). Round-trip emits one inline SOUR substructure per (host, citation) pair under the host's GEDCOM record. Not a top-level GEDCOM record on export, just an inline node.
3. **`media_regions`, `groups`, `research_tasks` are app-specific.** GEDCOM has no equivalent for any of them; we ship custom `_GROUP` top-level records on export, but no other tool reads them. Research tasks and media regions are not exported at all. This is documented in `excluded`/`lossy:dropped-on-export` rows in the fidelity registry.
4. **`gazetteers`, `db_settings`, `quality_issue_counts`, `ignored_duplicates` are app-internal.** Render-time data, settings, caches, UI state. Never authored, never exported. `db_settings` partially round-trips via HEAD metadata (researcher name, language, copyright) once T09 lands.

## §2 — Gap classification

Every gap from three sources: (a) the five corner-case exporter bugs in [`src/gedcom/exporter.ts`](../src/gedcom/exporter.ts) found during the 2026-05-19 design phase, (b) the silent-round-trip-loss UI gaps from the design spec's UI gap table, (c) the new-concept additions GEDCOM 7.0 / Holger / Genney / RootsMagic / Gramps carry that our schema doesn't yet model.

Severity follows the Prime Directive ranking. `silent-loss` is a Prime Directive violation (data was authored, round-trip drops it, the user is not told); `authoring-blocked` means the column persists losslessly but the UI cannot create / edit / remove it (the user is silently denied authorship); `nice-to-have` means the gap is cosmetic.

### §2a — Exporter corner cases (5 bugs)

Each row classified per-version: where the spec carries the concept, we achieve `lossless`; where the spec genuinely cannot, we accept a documented `lossy:<version>-spec-limit` with disclosure to the export report.

| Concept | Severity | Surface | 5.5.1 status | 7.0 status | Task-id |
|---|---|---|---|---|---|
| **Single-parent FAM silently dropped on export** — `src/gedcom/exporter.ts:553` iterates `couple` relationships only; orphan `parent_child` rows with no corresponding `couple` row emit zero FAM record, so the mother (or father)–child link disappears. | silent-loss | exporter | lossless (after fix) | lossless (after fix) | T03 |
| **PEDI subtype mis-attributed** — exporter uses `Array.find()` against parent_child rows that may have different `subtype` per parent for the same FAM; first match wins by array order. Adopted-by-father / biological-to-mother child reports identical PEDI for both parents. | silent-loss | exporter | lossless (after fix) | lossless (after fix) | T03 |
| **No `FAMC`/`FAMS` emission on INDI records** — exporter doesn't emit them; importer tolerates the omission but some strict 5.5.1 consumers require them. Within-app round-trip currently works because our importer back-fills from FAM's HUSB/WIFE/CHIL; **cross-app interoperability is broken.** | authoring-blocked (the user can't reliably hand their export to a different 5.5.1 tool) | exporter | lossless (after fix) | lossless (after fix) | T03 |
| **Same-couple-twice collapsed** — if the user has two `couple` rows for the same (person1_id, person2_id) pair (e.g. married 1850, divorced 1855, remarried 1860 → two FAM records in the source), the exporter emits one FAM and the second couple row's events / notes / subtype attach to the wrong union. | silent-loss | importer + exporter | lossless (after fix) | lossless (after fix) | T03 |
| **Multi-parent triad (3+ parents in one family unit) collapsed** — 5.5.1 FAM is strictly binary HUSB+WIFE → genuinely unrepresentable in 5.5.1. 7.0 supports via `ASSO @I3@ / ROLE PARENT` substructure on FAM. Currently the exporter elects two parents arbitrarily and silently drops the rest. | silent-loss | exporter | lossy:5.5.1-spec-limit (extra parents disclosed to export report; importer-side `expectedAfterRoundTrip` documents 2-parent reconstruction) | lossless (after fix; ASSO emission on FAM) | T03 |

**Per-importer impact for the 5 corner cases:**

- **Holger:** uses our standard GEDCOM importer with profile=holger — affected identically to GEDCOM. Single-parent FAM and multi-parent triad both occur in real Holger 8 exports; Holger 8 supports binary FAM only, so multi-parent → drops via the spec, not via our bugs. Same-couple-twice does occur (remarriage of the same pair).
- **Genney:** native `COUPLE_FAMILY` table can carry multi-parent rows (`FATHER` + `MOTHER` columns plus separate `COUPLE_FAMILY` rows per child); importer translates to our `parent_child` rows. Multi-parent persists into our DB and surfaces the exporter bug on export.
- **RootsMagic:** `FamilyTable` is binary (`FatherID` + `MotherID`); multi-parent is not representable in RM. Same-couple-twice is allowed (two FamilyTable rows with the same parent pair).
- **Gramps:** `<family>` is binary (`<father>` + `<mother>`); same as RM. Multi-parent not representable at source. Same-couple-twice allowed.

### §2b — UI gaps (existing columns, no authoring surface)

Every column listed below is `lossless` or `lossless-via` per the fidelity registry — the round-trip works. **The user has no UI path to enter, edit, or remove the value;** the column is only populated via importer or MCP. By the Prime Directive's "user can author, view, edit, and remove every primitive" clause this is `authoring-blocked` severity for all.

| Concept | Severity | Surface | 5.5.1 status | 7.0 status | Task-id |
|---|---|---|---|---|---|
| `citations.person_id` | authoring-blocked | UI | lossless-via (existing) | lossless-via (existing) | T11 |
| `citations.place_id` | authoring-blocked | UI | lossless-via | lossless-via | T12 |
| `citations.relationship_id` | authoring-blocked | UI | lossless-via | lossless-via | T13 |
| `citations.person_name_id` | authoring-blocked (verify-only — wiring exists, complete path check) | UI | lossless-via | lossless-via | T11 (verify) |
| `event_participants.role` | authoring-blocked | UI | lossless-via | lossless-via | T18 |
| `media_links.link_type` | authoring-blocked | UI | lossy (not emitted; resets to null on round-trip — see §2c row) | lossy (same) | T19 |
| `media.format` | authoring-blocked | UI | lossless-via | lossless-via | T19 |
| `media.notes` | authoring-blocked | UI | lossless-via | lossless-via | T19 |
| `sources.call_number` | authoring-blocked | UI | lossless-via | lossless-via | T14 |
| `sources.abstract` | authoring-blocked | UI | lossless-via | lossless-via | T14 |
| `places.street` | authoring-blocked | UI | lossless-via | lossless-via | T15 |
| `places.postal_code` | authoring-blocked | UI | lossless-via | lossless-via | T15 |
| `places.city` | authoring-blocked | UI | lossless-via | lossless-via | T15 |
| `places.country` | authoring-blocked | UI | lossless-via | lossless-via | T15 |
| `places.date_from` / `date_to` | authoring-blocked | UI | lossless-via | lossless-via | T15 |
| `events.place_address` | authoring-blocked | UI | lossless-via | lossless-via | T17 |
| `events.date_value_end` | authoring-blocked (only renders for some event types) | UI | lossless-via | lossless-via | T17 |
| `events.cause` | authoring-blocked | UI | lossless-via | lossless-via | T17 |
| `person_names.name_prefix` / `name_suffix` / `name_qualifier` / `patronymic_base` | authoring-blocked (hidden inside `<details>`) | UI | lossless-via | lossless-via | T16 |
| `research_tasks.result` | authoring-blocked (only shown for done/stopped) | UI | lossy:dropped-on-export (research tasks are app-specific) | lossy:dropped-on-export | T19 |
| `relationships.subtype` for `sibling` / `godparent` / `other` types | authoring-blocked (UI only renders subtype for couple / parent_child) | UI | lossy:non-couple-non-parent-child-subtype-not-emitted (registry) | same | T19 |
| **All columns of `repositories`** (`name`, `address`, `city`, `postal_code`, `state`, `country`, `phone`, `email`, `web`, `call_number`, `notes`) | authoring-blocked (entire entity has no UI surface) | UI | lossless-via (except `call_number` — see §2c) | same | T10 |
| **`source_repositories` link UI** (source ↔ repository attachment) | authoring-blocked | UI | aligned (REPO sub-tag under SOUR) | same | T10 |

**Per-importer impact:**

- **All four non-GEDCOM importers populate most of these columns.** Genney populates `repositories` from its `REPO` table, sources' `call_number` / `abstract` from `SOURCE.CALLNUMBER` / `SOURCE.TEXT`, places' address fields from `SPLACE.STREET`/`POSTALCODE`/`CITY`/`COUNTRY`, events' `cause` from `EVENT.CAUSE`. RootsMagic populates witnesses (`event_participants.role`) from `WitnessTable`, source `call_number` from `SourceTable.RefNumber`. Gramps populates researcher metadata into `db_settings` for HEAD round-trip. Without the UI gaps closed, **users importing from these formats lose access to data the importer correctly stored.** This is the Prime Directive "user must be able to view what they imported" failure mode.

### §2c — New concepts (schema additions)

Concepts GEDCOM 7.0 supports (or that a non-GEDCOM importer carries) that our schema doesn't yet model. Each will be schema + importer + exporter + fidelity-registry + UI (Phase 2 + Phase 4 tasks).

| Concept | Severity | Surface | 5.5.1 status | 7.0 status | Task-id |
|---|---|---|---|---|---|
| **Shared notes (`SNOTE`)** — top-level notes referenced from multiple records | authoring-blocked → silent-loss (without fix, shared-note semantics collapse to inline NOTE on import; cross-references lost) | schema + importer + exporter + UI | lossy:5.5.1-shared-degrades-to-inline (5.5.1 has no SNOTE; falls back to per-record inline NOTE — text round-trips but the "shared" identity is lost) | lossless | T04, T20 |
| **Person-to-person associations (`ASSO`)** — godparent / friend / colleague / enemy / etc. *without* a shared event | authoring-blocked → silent-loss (ASSO blocks on INDI without an EVEN parent currently dropped on import per `unmappedData`) | schema + importer + exporter + UI | lossless | lossless | T05, T21 |
| **Negative assertions (`NO X` / `NO X DATE`)** — "this person was never married" / "no children" | authoring-blocked → silent-loss (NO records dropped on import per `unmappedData`) | schema (`events.is_negation`) + importer + exporter + UI | lossless-via (5.5.1 has no NO; falls back to a custom `_NO` event-shaped row with the negated event_type) — declare `lossy:5.5.1-spec-limit` if the consuming tool doesn't read the custom tag | lossless | T06, T22 |
| **Name translation (`NAME / TRAN`)** — alt-script / alt-language name forms | authoring-blocked → silent-loss (TRAN sub-tags dropped on import) | schema (`name_translations`) + importer + exporter + UI | lossy:5.5.1-spec-limit (falls back to additional NAME nodes with TYPE='translation' + language marker — text round-trips, link semantics lossy) | lossless | T07, T23 |
| **Place translation (`PLAC / TRAN`)** — alt-script / alt-language place forms | authoring-blocked → silent-loss | schema (`place_translations`) + importer + exporter + UI | lossy:5.5.1-spec-limit (same shape as NAME TRAN fallback) | lossless | T07, T23 |
| **Source coverage (`SOUR / DATA / EVEN`)** — "this source covers BIRT events in Stockholm 1850-1900" | authoring-blocked → silent-loss (DATA/EVEN sub-records dropped on import) | schema (`source_coverage_events`) + importer + exporter + UI | lossless (standard SOUR/DATA/EVEN structure; 5.5.1 supports it natively) | lossless | T08, T24 |
| **HEAD metadata preservation** — origin app, language, copyright, default submitter | authoring-blocked (importer reads `SUBM` for default_person_id but doesn't preserve the rest); silent-loss on round-trip (re-export drops it) | schema (none — rides `db_settings`) + importer + exporter | lossless-via (`header_metadata` key in `db_settings`) | lossless-via | T09 |
| **`SEX X` (intersex; 7.0 only)** — the persons.sex CHECK constraint currently rejects 'X' | silent-loss (any 'X' sex in an imported 7.0 GEDCOM is currently force-mapped to 'U' on insert) | schema CHECK + importer + exporter | lossy:5.5.1-spec-limit (5.5.1 has only M/F/U; X falls back to U with `expectedAfterRoundTrip` returning 'U') | lossless | T09 |
| **`DATE INTERPRETED <phrase>` qualifier** — user's free-text date interpretation | authoring-blocked → silent-loss | schema (`events.date_type` extension) + importer + exporter | lossy:5.5.1-spec-limit (5.5.1 has INT but no PHRASE — text falls into `date_original`) | lossless | T09 |
| **`DATE FROM x TO y` with explicit direction** — distinct from `BET..AND` (range) | authoring-blocked | schema (`events.date_type` extension) + importer + exporter | lossless-via (5.5.1 supports FROM/TO directly) | lossless | T09 |

**Per-importer impact:**

- **Holger:** Holger 8 export is 5.5.1 — most new concepts are not present in source. Exception: Holger does emit witnesses (riding `ASSO RELA` on events), some `_TODO` lines (vendor extension), and some translation-like multi-NAME nodes for hyphenated bynames in Swedish. Coverage check: **unknown — needs further investigation in T25.**
- **Genney:** `REMARK` table carries some note-shape rows that could map to SNOTE; `OWNER_EVENT` covers witnesses; no native translation or negation support; no SNOTE shape. `REPO` is fully covered. Coverage: **partial — REMARK shape is unclear, T25 audits.**
- **RootsMagic:** RM7+ supports shared notes (`NoteTable`); witnesses (`WitnessTable`) already imported as `event_participants` with `role='witness'`; alternate names (`NameTable.NameType`) imported. Negative assertions: **unknown — needs investigation in T25.** Translations: not natively supported (RM is single-script).
- **Gramps:** natively models nearly all of this. Shared notes (`<note>` blocks referenced by `<noteref>`), associations (`<personref>`), event roles, multi-name with type, attributes for negation. **Highest mapping fidelity available;** T25 maps 1:1 wherever schema permits.

### §2d — Existing `lossy` registry entries (already mechanically guarded)

These entries already exist in [`src/api/gedcom_fidelity_registry.ts`](../src/api/gedcom_fidelity_registry.ts) with `expectedAfterRoundTrip` callbacks that document the recoverable state mechanically. The per-field round-trip tests enforce them. Listed here for completeness — no plan task touches them in this round, but they are the precedent for §2c's classifications.

| Column | Why it's already lossy | Mechanical guard |
|---|---|---|
| `person_names.sort_order` | NAME emit order preserved by exporter; the integer column rebases to 0 on import | `expectedAfterRoundTrip: () => 0` |
| `group_links.sort_order` | Same shape — emit order preserved; column rebases | `expectedAfterRoundTrip: () => 0` |
| `media_links.sort_order` | Same shape — OBJE emit order preserved; column rebases | `expectedAfterRoundTrip: () => 0` |
| `places.parent_place_id` | Hierarchy encoded only in PLAC name; FK is rebuilt by name parsing on import — not guaranteed when parsing fails | `expectedAfterRoundTrip: () => null` |
| `events.value` | Fact-shaped events preserve line value; non-fact event types lose it (importer routes stray line values to `[unmapped line value: ...]` in notes) | `expectedAfterRoundTrip: (seeded, ctx) => factShapedEventTypes.has(ctx.row.event_type) ? seeded : null` |
| `relationships.subtype` for sibling/godparent/other types | Non-couple/non-parent_child subtypes are not emitted | `expectedAfterRoundTrip` returns `null` for those types |
| `relationships.notes` for `parent_child` rows | parent_child rides FAMC/FAMS which has no NOTE carrier in our exporter today | `expectedAfterRoundTrip` returns `''` for parent_child |
| `media.is_printable` | Exporter does not emit; importer sets 0 | `expectedAfterRoundTrip: () => 0` |
| `media_links.link_type` | Exporter does not emit; importer sets null | `expectedAfterRoundTrip: () => null` |
| `repositories.call_number` | Exporter does not emit; importer sets null | `expectedAfterRoundTrip: () => null` |
| `citations.transcription` for person/family/place hosts on 5.5.1 | 5.5.1 is stricter about unknown sub-tags inside SOUR cites; we don't emit a custom carrier at that level | 5.5.1 expected returns `''` for those hosts; 7.0 is `lossless-via:_TRANS` |
| `research_tasks.*` / `task_links.*` | Research tasks are app-specific; dropped on export | `expectedAfterRoundTrip: () => null` for every column; ExportReport.excluded surfaces the loss |
| `persons.display_id` | Per-database integer ordering label; re-assigned on import in created_at order | `excluded` (re-derived, not authored) |
| `places.normalized_name` | Deterministic derivation of `places.name` (lowercase + strip diacritics); not authored | `excluded` |
| `media.is_missing` | Derived at import time from filesystem `existsSync(file_ref)` | `excluded` |
| `media_links.entity_type` | Derived at import from the parent GEDCOM record nesting the OBJE block | `excluded` |
| All `*.created_at` / `*.updated_at` | App-internal audit timestamps | `excluded: AUDIT_TS_EXCLUDED` |
| All `*.id` PKs | UUID re-issued on import; XREF graph identity is the actual round-trip invariant | `excluded: UUID_PK_VIA_XREF` |
| All FK columns ending `_id` | Same — FK target UUID re-issued; link verified via any non-id column on the related row | `excluded: UUID_FK_VIA_XREF` |

### §2e — Out-of-scope categories (documented exclusions)

| Concept | Reason | Registry status |
|---|---|---|
| **LDS ordinances** (`BAPL`, `ENDL`, `SLGC`, `SLGS`) | Non-LDS app; current `unmappedData` disclosure on import suffices for any user who needs them. | `excluded:non-LDS-app` (target classification — registry entry to be added if any LDS-related column is ever introduced) |
| **DNA evidence** (`_DNA` vendor extensions in 7.0) | Vendor-specific (Ancestry's `_DNA` differs from MyHeritage's); no canonical structure to model against. Wait for a 7.x extension proposal. | `excluded:vendor-extension` (same — target classification) |
| **Multi-submitter** (multiple `SUBM` records) | Solo-researcher app by design. Single submitter preserved via HEAD metadata; additional SUBMs disclosed in import report. | `lossy:singleton-by-design` (target — applies to the future `db_settings.header_metadata` row that T09 lands) |

## §3 — Recommended future work

### §3a — `relationships` → `families` rename

**Recommendation: file a separate plan after the current GEDCOM alignment plan ships. Not load-bearing for the Prime Directive once T03 patches land.**

The current `relationships` table is GEDCOM-X-influenced (see §1 deviation #1) and stores each parent-child pairing and each marital union as a separate row. The exporter translates this back to GEDCOM's `FAM` shape. The five corner-case bugs in §2a all live in this translation layer.

T03 in the current plan patches each corner case at the exporter layer. Per the design spec's per-version classification:

| Corner case | Post-T03 5.5.1 status | Post-T03 7.0 status |
|---|---|---|
| Single-parent FAM | lossless | lossless |
| PEDI per-parent ambiguity | lossless | lossless |
| FAMC/FAMS emission | lossless | lossless |
| Same-couple-twice | lossless | lossless |
| Multi-parent triad | lossy:5.5.1-spec-limit (extras disclosed) | lossless (ASSO ROLE PARENT) |

A rename to `families` + `family_members` + `person_associations` would resolve four of these more cleanly at the model layer:

1. **Single-parent FAM:** a `families` row with one member is natural; no orphan parent_child rows to detect. The exporter's branching disappears.
2. **PEDI per-parent ambiguity:** `family_members.role` and `family_members.subtype` are per-parent-per-child rows, eliminating the array-lookup-by-FAM ambiguity.
3. **Same-couple-twice:** two `families` rows with the same parent pair are syntactically distinct; no importer-side disambiguation needed.
4. **Multi-parent triad:** `family_members` can carry 3+ parents directly; the 7.0 emitter trivially maps the extras to ASSO ROLE PARENT, and the 5.5.1 emitter has a clean "elect strongest pair, disclose rest" path.

The fifth corner case (FAMC/FAMS emission on INDI) is mechanical and not affected by the rename.

**Why the rename is not load-bearing:** the design spec already classifies each corner case per-version (lossless on 7.0 for all four model-cleanliness cases; lossy:5.5.1-spec-limit only on 5.5.1 for multi-parent). The user's data round-trips correctly after T03. The rename is model-cleanliness work — easier code, fewer footguns for future authors — not data fidelity work.

**Cost estimate:** schema migration with FK rewiring across `events.relationship_id`, `citations.relationship_id`, `media_links.entity_type='relationship'`. Touches every entity panel that references relationships. Comparable in scope to the current alignment plan (probably 15–20 tasks). Defer until the alignment plan is in production and the corner-case fixes are validated on real user data.

### §3b — Mechanical enforceability of lossy classifications

Each per-version `lossy` entry in the fidelity registry has an `expectedAfterRoundTrip` callback that documents the recoverable state mechanically. The per-field round-trip test in `tests/unit/gedcom-fidelity-per-field.test.ts` (and the comprehensive golden-DB test in `tests/unit/gedcom-roundtrip-comprehensive.test.ts`) seed every column, export to GEDCOM, re-import, and assert column value equals either the seeded value (for `lossless`/`lossless-via`) or the `expectedAfterRoundTrip(seeded, ctx)` return value (for `lossy`).

This is what makes the lossy classifications **enforceable, not aspirational.** A regression in the exporter that drops a previously-`lossless-via` value to `lossy` breaks CI immediately — not "next time we audit." The schema-introspection coverage test (`tests/unit/gedcom-fidelity-registry-coverage.test.ts`) ensures the registry stays exhaustive — adding a column without a registry entry breaks CI.

This pattern was introduced in the v0.205 round-trip-fidelity plan and is the precedent for every entry T02 will scaffold and T04–T09 will refine.

### §3c — Outstanding investigation items deferred to T25

The §2c per-importer impact subsection flagged three "unknown — needs further investigation" items:

- Whether Holger 8 emits anything resembling SNOTE or TRAN shapes via custom tags.
- Whether Genney's `REMARK` table semantically corresponds to GEDCOM SNOTE (shared note) or only inline NOTE (per-record).
- Whether RootsMagic 9+ has native negative-assertion support and which RM table it lives in.

T25 (Holger / Genney / RootsMagic / Gramps importer audit + concept-mapping) is the task that resolves these. The investigation output goes into this audit doc's §2c per-importer impact rows as a follow-up commit during the T25 close-out.

### §3d — Archive `.zip` round-trip mechanical enforcement

Archive `.zip` export/import is in-scope conceptually under the Prime Directive's "user must be able to leave with their data intact" — but the current plan only ships the JSON-shape extension (T26) and a single round-trip test. Per-field mechanical enforcement (analogous to the GEDCOM fidelity registry) is **not** in this plan's scope; defer to a future plan once the new tables in T02 have settled.
