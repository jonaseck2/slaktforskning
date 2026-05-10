# Changelog

## Unreleased

- feat(duplicates): /duplicates view now covers persons, places, sources, and media in a four-tab shell. Each tab finds duplicate pairs (Levenshtein-tolerant heuristics scoped to entity-specific keys: parent_place_id for places, author for sources, file_ref for media), shows them in a list with score, and offers Compare-and-Merge modals mirroring the persons-tab pattern. The MergeMediaModal additionally has explicit "keep this file / discard this file" radio buttons per side — silently deleting either file would violate the Prime Directive. Merges are atomic and undoable: every touched row's pre-merge state is snapshotted; for media merges the deleted file's bytes are also captured so undo restores both row and file. New MCP tools `merge_places`, `merge_sources`, `merge_media`; `find_duplicates` extended with optional `entity` argument (default `'person'` for backwards-compat). `DUPLICATE_*` quality-check rows now deep-link into the right tab with the pair pre-opened in the compare-and-merge modal.
- perf: media gallery pages and panel sections now render in seconds instead of minutes — thumbnails are resized to 256 px JPEGs and cached on disk, so repeat visits read ~50 KB per item.
- fix: gallery's own scroll now triggers infinite scroll. It was a no-op when the left list was open — the user had to scroll the list panel for new items to appear.
- feat(timeline): person timeline labels every kin event with the relationship in question. "Birth" never appears in someone else's row — a child's birth reads "Son's birth" / "Daughter's birth", a parent's death reads "Parent's death", a partner's death names the partner, marriage and divorce show the partner's name in place of the ceremony place. Foster children's biological birth events no longer appear on a foster parent's timeline (the placement event surfaces in their place when dated). Every dated row, including kin rows, now shows the focal person's age in a dedicated visual column to the right of the spine — present and unambiguous, with negative ages rendered for events before the focal birth. The same composer also drives `ALifeReport`. Render-only — no schema change.
- feat(persons-list): person list grew into a sparseness scanner. Optional columns for sex, # of names, # of events, # of relationships, # of media, # of group memberships, # of research tasks, and # of quality issues — pick any combination from the new "⋮ Kolumner" picker; selection persists. Sort by any column ascending to find sparse persons (0 events, 0 names, etc.). Shift-click a column header to add a secondary sort key; a status pill below the filter chips shows the active sort chain. Default tiebreaker is name ASC so sorting by sex or any count gives stable ordering without setting a secondary explicitly. Aggregates are a single SQL query per page with new indexes on the FK columns.
- feat(quality): new `event_outside_lifespan` check fires when an event is dated before a participant's birth or after their death. Save-time non-blocking warning toast in `EventModal`; row appears in the Quality view (chronology category) with a click-through to the person panel. Covers all participant roles, not just primary — a witness recorded after their own death is also flagged. Uses earliest birth / latest death when multiples exist; year-only dates compared conservatively (false positives over false negatives). Informational only — never modifies the saved event.
- feat(person-name-modal): the "+ Namn" dialog now prefills both given name and surname from the person's currently displayed name (previously only surname was prefilled, leaving given_name blank). Required-field markers — red asterisk + "Obligatoriskt" helper line on each input until at least one of given_name/surname has content. Save button is greyed and `aria-disabled` while invalid; an Enter-key save attempt on an invalid form now flashes the offending field red, focuses it, and surfaces a specific reason instead of silently doing nothing. Mononyms still work — only one of the two fields is required, never both.
- feat(ui): notes monospace toggle button now reads `iWi  Fast teckenbredd` (or `iWi  Monospace` in EN) — the visual `iWi` mnemonic stays for sighted users who recognise the typographic joke but is `aria-hidden`, supplemented by a clear text label. Tooltip rewritten to explicitly explain the toggle. Applied identically across all three Notes-hosting surfaces (Person, Place, Media). Rich-text formatting on Notes is a separate brainstorm — deferred.
- fix(gedcom): groups and group memberships are now preserved on round-trip via custom `_GROUP` and `_GROUP_LINK` records under both GEDCOM 5.5.1 and 7.0. Each `groups` row exports as a level-0 `_GROUP` record carrying NAME and NOTE; each `group_links` row exports as a `_GROUP_LINK` sub-record with `2 TYPE person|place|media` and `2 REF @xref@` resolving back to the host. To make the polymorphic xref resolve, the existing top-level `_PLAC` phase is extended to emit records for places that are group-linked (in addition to places with citations) and a new top-level OBJE phase emits records for media that are group-linked. The previously-emitted "Groups and group membership" entry in `ExportReport.excluded` is removed — the data is no longer dropped. New importer phase resolves each `_GROUP_LINK` REF against the right xref map (personMap / objeMap / a freshly-built place-xref map) and surfaces dangling refs via `ImportReport.warnings` rather than silently dropping. Per-field fidelity harness now exercises the round-trip for every non-audit `groups.*` and `group_links.*` column; golden seed extended with two groups carrying mixed-type members (3 persons + 1 place + 2 media + 1 person + 1 place) to catch multi-field interaction regressions.
- fix(gedcom): citation transcriptions on person-level, family-level (relationship-level) and place-level citations now round-trip end-to-end under GEDCOM 7.0 via a custom `2 _TRANS` sub-tag under SOUR. The Swedish parish-record example from the plan ("Petrus Andersson, hustru Cathrina Mårtensdotter, dotter Maria, döpt i Adolf Fredrik 1786-04-12, faddrar…") now survives export and re-import on every host kind. Multi-line transcriptions split across CONT continuation under `_TRANS` so embedded newlines round-trip byte-identical (parish-record blocks with witness lists). Event-level and name-level citations continue to use standard DATA/TEXT under SOUR (already lossless under both versions); the exporter intentionally does NOT double-emit `_TRANS` alongside DATA/TEXT (option A — keeps the file minimal, no "which one wins on import" ambiguity). The registry entry for `citations.transcription` is now split by version: v7.0 promoted to `lossless-via:_TRANS`; v5.5.1 stays `lossy` because 5.5.1 is historically stricter about unknown sub-tags inside SOUR cites — promoting v5.5.1 would be a separate plan focused on consumer-tolerance testing.
- fix(gedcom): notes on sibling, godparent, and "other" relationships are now preserved on round-trip via the custom `2 _RELA_NOTE` sub-tag under each ASSO block. Couple notes already rode `_RELNOTES` on FAM; this closes the non-couple branch where ASSO had no standard NOTE child the importer reads back. Multi-line notes split across CONT continuation lines on export and rejoin on import, so embedded newlines survive byte-identical. Both endpoints' ASSO blocks carry the note (the exporter writes the relationship under each person); the importer's existing deduplication ensures only one DB row results. `parent_child` notes remain lossy (parent_child rides FAMC/FAMS in GEDCOM with no current NOTE carrier on those structures) — tracked as a follow-up. Registry: `relationships.notes` `expectedAfterRoundTrip` updated so couple/sibling/godparent/other return the seeded value; only parent_child still returns `''`.
- fix(gedcom): `sources.abstract` and `sources.call_number` are now preserved on round-trip via custom `_ABSTRACT` and `_CALL` sub-tags emitted under each SOUR record. Multi-line abstracts are split across CONT continuation lines on export and rejoined by the parser on import, so embedded newlines survive byte-identical. Promoted in `gedcom_fidelity_registry.ts` from `lossy` to `lossless-via:_ABSTRACT` / `lossless-via:_CALL` for both 5.5.1 and 7.0. The repository's own `repositories.call_number` is intentionally out of scope (different table, different carrier under REPO) and tracked as a follow-up.
- fix(gedcom): `events.place_address` is now preserved on round-trip via the custom `_PLAC_ADDR` sub-tag. Emitted at level 3 under PLAC when a place is attached to the event, or directly at level 2 under the event when no PLAC line is emitted (so authored addresses survive even on event records without a place). Importer reads the tag at either position. Promoted in `gedcom_fidelity_registry.ts` from `lossy` to `lossless-via:_PLAC_ADDR` for both 5.5.1 and 7.0.
- chore: agent-tooling — new `import-format-add` skill captures the recipe for adding a native importer for a new genealogy file format (file map, transform-layer phases, end-to-end wiring, fixture-based tests), distilled from the Genney + RootsMagic + Gramps precedents. `gedcom` skill picks up a "Dialect coverage" section pointing at the synthetic fixtures + the real-sample suite.
- chore: archive completed Bernadotte MCP test session — moves the two session plan files (`docs/plans/2026-05-09-bernadotte-{findings,followups}.md`) to `docs/plans/archive/` and appends a one-paragraph entry to `docs/plans/archive/PLAN.md` cataloguing the 18 fixes that landed in-session: `data:changed` broadcast wiring (worker → preload), tolerant date parser that removed 232 of 359 `run_checks` false positives, `add_place` leafProps drop on the parent_chain branch, `createSource` INSERT silently dropping `abstract` + `call_number`, `merge_persons` post-merge dedupe (single-cardinality events with citation transfer + `name_type='birth'` demotion to `aka`), empty-tree fallback for fresh DBs, place_type vocabulary expansion (`palace` / `castle` / `church`) with MCP-enum sync, i18n `eventTypes.accession` + `coronation`, `v-show` for sections deriving counts via `defineExpose`, resizable columns with localStorage persistence (the table-layout-fixed-vs-width-100% gotcha), new `PersonIdentifiersSection.vue` (FamilySearch / Ancestry / Riksarkivet / personnummer / GEDCOM REFN/RIN), `ui_reload` dev-MCP tool, `ui_get_dom` extended with `mode` / `all` / `limit`, `mcp-dev` skill renamed to `slaktforskning-mcp-dev`, new `slaktforskning-mcp` skill for agents using the MCP for genealogy research, two more pitfall sections + reload matrix in `slaktforskning-mcp-dev`, two new project-wide UI rules in `renderer.md`, two napkin entries. One open finding remains (#9 — the `living: true` heuristic for >130-yr-old persons without a death event; by-design, low priority).
- fix: Import / Export tab labelled "Genney" now reads "Import Genney" — matches the "Import Holger or OurKind", "Import RootsMagic", and "Import Gramps" tabs alongside it.
- feat: native Gramps .gramps / .gpkg importer — opens a Gramps XML database directly (gunzipping on the fly when the file is gzipped) and reads researcher info, persons, names, families, parent-child relationships, events with dates and places, sources, citations, and media. No need to first export to GEDCOM. New top-level Import/Export tab "Import Gramps", same UX shape as the RootsMagic tab. MCP `import_file` auto-detects .gramps/.gpkg files. Validated against the official Gramps reference data.gramps fixture (60 persons, 21 families, 84 parent-child links, 125 events, 43 places, 4 sources, 6 media), researcher info preserved.
- feat: MCP `import_file` tool now auto-detects RootsMagic .rmgc / .rmtree files and dispatches to the native importer — agents can drop a RootsMagic file onto an empty database without first exporting it to GEDCOM.
- feat: RootsMagic .rmgc import is now a top-level Import/Export tab — pick a .rmgc file and click Import. Wired through the worker thread (IPC channel `import:rootsmagicRun`), with progress messages and a post-import report showing the per-entity counts. Builds on the transform layer landed in v0.244.0.
- feat: native RootsMagic .rmgc importer (foundation) — opens a RootsMagic database (versions 7+) directly as the SQLite file it is and reads persons, names, families, parent-child relationships, events with dates and places, sources, citations, and media. No need to first export to GEDCOM. RootsMagic's UniqueID per person rides through as a `uid` person identifier so re-exports keep the cross-system handle. Validated end-to-end against two real .rmgc fixtures (13-person and 3-person test databases). Includes the proprietary RM date-format parser (`D.+19551002..+00000000..` → `1955-10-02`). UI section + IPC channel + MCP integration ship in follow-up commits.
- feat(gazetteer): europe-historical (sparse first cut) — completes the European gazetteer roadmap (14/14 plans landed). Wikidata SPARQL extension to `world-historical` covering historical European entities at admin1 depth from 5 validated classes (Russian Empire/Soviet governorates Q86622, Provinces of Prussia Q675291, Soviet Union republics Q236036, HRE Imperial Estates Q1507115, Crown lands of Austria Q681026). 39 entities shipped (Crown lands of Austria 27 + Soviet republics 12, ~10 KB raw / 1 KB gzip) due to Wikidata SPARQL rate-limiting (502/429) on the other 3 classes mid-build; the script's per-class graceful-fallback handles partial success and re-runs fill in missing classes when Wikidata is responsive. Bundled count 71 → 72.
- chore: archive 13 European gazetteer plans (Tier 1 + Tier 2) — moved DE upgrade, GB, IE, NL, BE, FR, EE, LV, LT, PL, plus three Tier 2 batches and the design doc to `docs/plans/archive/`. Single roadmap entry appended to `docs/plans/archive/PLAN.md` captures the QID-validation lesson and the closed-vocab discovery.
- feat: GEDCOM import covers three more long-tail tags — `UID` (GEDCOM 7.0 standard, was only handled as `_UID`), `ORDN` (ordination — `ordination` was already in the event-type vocabulary but the GEDCOM tag mapping was missing on both sides), and `_MILT` (FTM's military-service tag — `military` is in the vocabulary too). Closes the last items above the long tail of niche / app-internal tags from the real-sample dialect audit.
- feat: first-time onboarding — every panel section in the right-side panels (Person, Place, Source, Group, ResearchTask, Media) now shows a Purpose-stated empty state on a fresh database, telling the genealogist what each section is *for* in their own words rather than a blank rectangle. Plus four enumerated coachmarks targeting confusion gaps from beta tester feedback: (1) Hourglass focus-switch — anchored hint on first chart open ("Click any person to view; double-click to set focus there"), explains the gesture Bengt couldn't discover; (2) Media reorder — anchored on the first row's order column when ≥2 media items exist; (3) Face-tag drawing — anchored on the photo canvas when face-tag mode is active, addresses the input-row-that-looks-typeable trap; (4) First media attach — toast on the very first successful attach, explains the `<dbname>-media/` copy convention. State persists per-installation in `settings.json`, NOT per-DB (so Bengt's "tested in tiny DB then opened real DB" pattern doesn't re-fire every coachmark). New "Reset onboarding" button in Settings → Defaults clears the seen-state. Coverage of empty-state coaching is enforced by `panel-empty-state-coverage.test.ts` — any future panel section without coaching breaks the build.
- perf: dramatically smaller installer and lower idle memory after a sweep of the Electron bundle and gazetteer payload. The packaged macOS app.asar drops from 128 MB to 10 MB by switching `forge.config.ts` `packagerConfig.ignore` from a regex denylist to an aggressive `.vite/**` + `package.json` allowlist (the Vite plugin already bundles every non-external JS dep, so anything else inside the asar was dead weight). The bundled gazetteer payload drops from 7.30 MB (gzipped JSON) to 5.64 MB (gzipped packed binary) by switching to a binary format with deduplicated string table, int32 lat/lon, and delta-encoded geometry; contributors still author JSON in `src/api/place-gazetteers/data/` — the binary is a pure build derivation. A statement-cache audit also closed 20 leaked SQLite prepared statements (3 in `media_consolidate.ts`, 17 in `genney/transform.ts`) that would have grown the WASM heap on large imports.
- feat(gazetteer): Tier 2 Eastern Europe — adds 9 new gazetteers in one batch from GeoNames country dumps (CC BY 4.0): `bg-obshtini` (Bulgaria, 28 oblasti + 265 obshtini + 138 places, Cyrillic/Latin), `ro-judete` (Romania, 42 județe + 3,181 comune + 788 places), `md-raioane` (Moldova, 37 raioane + 61 places), `gr-dimoi` (Greece, 14 periféries + 54 admin2 + 246 places, Greek/Latin), `cy-eparchies` (Cyprus, 6 eparchies + 615 admin2 + 35 places), `by-rajony` (Belarus, 7 voblasci + 158 rajony + 144 places, Cyrillic/Łacinka), `ua-oblasti` (Ukraine, 27 oblasti + 146 admin2 + 1,000 places, Crimea per Wikidata model), `fo-kommunur` (Faroe Islands, 6 sýslur + 29 kommunur + 2 places — standalone gazetteer), `gl-kommune` (Greenland, 5 kommunit + 3 admin2 — standalone, rooted under World > North America > Greenland). Aggregate ~2.1 MB raw / 169 KB gzip. Per-gazetteer normalize strips local civil suffixes per country. Bundled count 62 → 71. **Skipped: ru-eu / tr-eu** — European Russia (west of Urals) and European Turkey (Thrace) need longitude-based filtering of large GeoNames RU.zip / TR.zip dumps; deferred to follow-up plans.
- feat: six new event types — Cremation, Bar Mitzvah, Bas Mitzvah (person events) and Annulment, Separation, Marriage license (relationship events). All six are emitted by major genealogy apps (FTM Habsburg has 18 annulments + 7 separations alone, Heiner Eichmann's torture test has cremation + Bar/Bas Mitzvah) and were silently dropped on GEDCOM import before. They round-trip back out as their original GEDCOM tags (CREM/BARM/BASM/ANUL/MARL/_SEPR) on export. Cremation also counts toward the "this person is no longer living" derivation alongside death and burial.
- feat(gazetteer): Tier 2 Central Europe — adds 12 new gazetteers in one batch from GeoNames country dumps (CC BY 4.0): `cz-okresy` (Czechia, 14 kraje + 98 okresy + 354 places), `sk-okresy` (Slovakia, 8 kraje + 79 okresy + 147 places), `hu-jarasok` (Hungary, 20 megyék + 197 járások + 371 places), `si-obcine` (Slovenia, 212 občine + 17 admin2 + 40 places — no constitutional admin1), `hr-zupanije` (Croatia, 21 županije + 572 općine/gradovi + 76 places), `ba-opstine` (Bosnia and Herzegovina, 3 entities + 18 cantons + 118 places), `rs-okruzi` (Serbia, 2 stat regions + 25 admin2 + 107 places, Cyrillic/Latin aliases), `me-opstine` (Montenegro, 25 opštine + 15 places), `mk-opstini` (North Macedonia, 71 opštini + 70 places, Cyrillic/Latin), `al-bashkite` (Albania, 12 qarqe + 61 bashkite + 68 places), `xk-komunat` (Kosovo, 7 districts + 38 komunat + 34 places), `lu-communes` (Luxembourg, 12 cantons + 105 communes + 30 places). Aggregate 838 KB raw / 74 KB gzip. Per-gazetteer normalize strips local civil suffixes per country (kraj/okres, megye/járás, občina, županija/općina, opština + Cyrillic forms, qark/bashki, komuna, canton/commune). Bundled count 50 → 62.
- feat: GEDCOM import now preserves five widely-emitted person identifier tags that were silently dropped before — `_UID` (RootsMagic / FTM / Genney cross-system sync ID), `AFN` (Ancestral File Number, GEDCOM 5.5 standard), `SSN` (Social Security Number, GEDCOM 5.5 standard), `FSID` (modern FamilySearch ID), and any standalone `_UID` (was previously imported only when the Holger profile was active). Each maps to its own row under the person's identifiers section. Round-trips back out as the same tag on GEDCOM export.
- feat(gazetteer): Tier 2 Western Europe — adds 10 new gazetteers in one batch from GeoNames country dumps (CC BY 4.0): `at-bezirke` (Austria, 9 Bundesländer + 94 Bezirke + 207 places), `ch-cantons` (Switzerland, 26 Kantone + 149 Bezirke + 355 places), `it-province` (Italy, 20 regioni + 107 province + 2,029 places), `es-provincias` (Spain, 19 comunidades + 52 provincias + 1,481 places), `pt-distritos` (Portugal, 20 distritos + 308 concelhos + 543 places), `mt-localities` (Malta, 68 local councils + 31 places), `sm-castelli` (San Marino, 9 castelli + 4 places), `li-gemeinden` (Liechtenstein, 11 Gemeinden + 3 places), `ad-parroquies` (Andorra, 7 parròquies + 5 places), `mc-quartiers` (Monaco, 1 admin1 + 5 places). Vatican City excluded (no GeoNames admin data; resolves via world-countries). Aggregate 1.4 MB raw / 117 KB gzip. Per-gazetteer normalize strips local civil suffixes per country. 3 sample probes added to european-coverage (AT/CH/IT). Bundled count 40 → 50. No parishes per Tier 2 design; opportunistic boundaries deferred.
- feat(gazetteer): Poland Tier 1 (partial) — adds `pl-powiaty` from GeoNames PL.zip under CC BY 4.0. 16 województwa (admin1) + 380 powiaty (admin2) + 491 populated places ≥10000 pop (admin3); 259 KB raw / 23 KB gzip. Polish adjectival voivodeship names ("Małopolskie", "Wielkopolskie") chosen as canonical with English "X Voivodeship" forms attached as aliases. Per-gazetteer normalize strips Polish civil suffixes (województwo, powiat, gmina, parafia, dzielnica, miasto, wieś) and Voivodeship + Gmina prefixes. 2 PL probes (Kraków/Bochnia powiat) added to european-coverage. Bundled count 39 → 40. Catholic parafie (Wikidata Q17143723, ~5k coverage) and ~2,500 gminy deferred. Pre-1989 województwa and partition-era admin go to europe-historical.
- feat(gazetteer): Baltic Tier 1 (partial) — adds three new gazetteers from GeoNames EE.zip / LV.zip / LT.zip under CC BY 4.0: `ee-counties` (15 maakonnad → 79 vallad/linnad → 95 places ≥1k, 56 KB raw / 5 KB gzip), `lv-novadi` (43 post-2021-reform novadi/valstspilsētas → 587 pagasti → 104 places ≥1k, 181 KB raw / 15 KB gzip), `lt-savivaldybes` (10 historical apskritys → 60 savivaldybės → 133 places ≥1k, 58 KB raw / 5 KB gzip). Per-gazetteer normalize strips local civil suffixes (maakond, vald, linn, novads, pagasts, savivaldybė, seniūnija, …). 6 Baltic probes added across EE/LV/LT to european-coverage. Bundled count 36 → 39. Lutheran kihelkonnad/draudzes (EE/LV) and Catholic parapijos (LT) from Wikidata Q102496/Q17143723 deferred to follow-up.
- fix: GEDCOM import no longer crashes on files with a SEX value our schema doesn't recognise (X for intersex/non-binary in GEDCOM 7.0, lowercase, or empty). Surfaced by the official FamilySearch GEDCOM 7.0 reference test suite — all six `maximal70*.ged` files plus several real-world exports (`webtreeprint`) hit `CHECK constraint failed: sex IN ('M','F','U')`. Now any value outside M/F/U normalises to U and is disclosed in the import report's skipped list (e.g. `SEX=X×1`) so the user can see what was changed.
- feat(gazetteer): France Tier 1 (partial) — adds `fr-departements` from GeoNames FR.zip under CC BY 4.0. 13 metropolitan régions (admin1) + 96 départements (admin2) + 1,017 populated places ≥10000 pop (admin3); 263 KB raw / 24 KB gzip. Overseas departments excluded (not in geographical Europe). Per-gazetteer normalize strips French civil suffixes (commune, département, région, canton, arrondissement) and prefixes (Commune de, Département de/du, Ville de). 4 FR probes (Bourg-en-Bresse/Strasbourg/Bretagne/Aude) added to european-coverage. Bundled count 35 → 36. ~35k communes deferred to follow-up.
- feat(gazetteer): Belgium Tier 1 (partial) — adds `be-provinces` from GeoNames BE.zip under CC BY 4.0. 3 regions (Bruxelles-Capitale, Vlaanderen, Wallonie — admin1) + 10 provinces + Brussels-Capital direct localities (admin2) + 1,735 populated places ≥1000 pop (admin3); 385 KB raw / 32 KB gzip. Bilingual NL/FR/DE handling: "Provincie X" / "Province de X" / "Province du X" prefixes stripped from canonical name with originals kept as aliases; per-gazetteer normalize strips both forms at resolve time. 4 BE probes (Antwerpen/Liège/Hainaut/West-Vlaanderen) added to european-coverage. Bundled count 34 → 35. Catholic parishes from Wikidata Q17143723 deferred.
- feat(gazetteer): Netherlands Tier 1 (partial) — adds `nl-gemeenten` from GeoNames NL.zip under CC BY 4.0. 12 provinces (admin1) + 342 gemeenten (admin2) + 1,512 populated places ≥1000 pop (admin3); 450 KB raw / 35 KB gzip. "Provincie X" / "Gemeente X" prefixes stripped from canonical names with originals kept as aliases; per-gazetteer normalize rules also strip those prefixes at resolve time. 4 NL probes (Leiden/Hoorn/Maastricht/Groningen) added to european-coverage. Bundled count 33 → 34. Historical (former) gemeenten via Wikidata Q2039348 + P582 end-time filter deferred to follow-up `nl-historical-gemeenten` plan.
- chore(tests): GEDCOM dialect coverage fixtures + import test — minimal but signature-realistic .ged samples for RootsMagic, Gramps, Family Tree Maker, Legacy, MacFamilyTree, Family Historian, MyHeritage, PAF, Holger, and Genney. Asserts each imports without crashing and that no core GEDCOM tag (NAME, INDI, FAM, BIRT, DEAT, MARR, SEX, …) ends up in the skipped list. Regression tripwire for the "RootsMagic imports from 10+ programs" gap surfaced in the competitor analysis.
- feat(gazetteer): Ireland (Republic) Tier 1 (partial) — adds `ie-counties` from GeoNames IE.zip under CC BY 4.0. 4 historical provinces (Connacht, Leinster, Munster, Ulster — admin1) + 26 RoI counties (admin2) + 369 populated places ≥1000 pop (admin3); 95 KB raw / 9 KB gzip. Northern Ireland counties live in `gb-civil-divisions` (Antrim, Armagh, Down, Fermanagh, Londonderry, Tyrone). Reuses `GB_RULES` normalize. 4 IE probes (Wicklow/Cork/Dublin City/Sligo) added to european-coverage. Bundled count 32 → 33. Civil parishes (~2,500), townlands (~62k), Catholic parishes from Wikidata Q17143723 deferred to follow-up gazetteers.
- feat(gazetteer): UK civil divisions Tier 1 (partial) — adds `gb-civil-divisions` from ONS Open Geography Portal under Open Government Licence v3.0. 4 home nations (admin1) + 361 Local Authority Districts (admin2) with BUC boundary polygons; 5.3 MB raw / 0.3 MB gzip. Adds `GB_RULES` normalize set (council area, civil parish, royal burgh, community, ceremonial county, county-of/city-of/parish-of prefixes). 4 user-goal probes (Edinburgh, Cardiff, Belfast, Westminster) added to european-coverage. Bundled count 31 → 32. Civil parishes (~10k England + ~860 Wales communities + ~900 Scottish kirk session parishes) and C of E ecclesiastical parishes deferred to follow-up gazetteers.
- feat(gazetteer): German gazetteer Tier 1 — bring Germany to parity with Nordic countries for genealogical place resolution. Adds `de-gemeinden-boundaries` (BKG vg250 — 16 Bundesländer + 400 Kreise polygons, 5.4 MB raw / 0.34 MB gzip) and `de-kirchgemeinden` (Wikidata Q20820021 + Q17143723 + Q102496 — Lutheran Kirchengemeinden + Catholic Pfarreien, sparse first cut: 61 parishes with admin1 chain across 8 of 16 Bundesländer). Extends `DE_RULES.stripSuffixes` with ecclesiastical terms (Kirchgemeinde, Pfarrei, Pfarrei-Verband, Kirchspiel, Pfarrbezirk, …). The boundary gazetteer makes the resolver pick bare admin2 names (`Lübeck`, `Garmisch-Partenkirchen`) over the prefixed forms (`Kreisfreie Stadt Lübeck`) when the user types the bare form. Bundled count 29 → 31.
- chore(gazetteer): seed `tests/unit/european-coverage.test.ts` registry — roadmap-level smoke probes that subsequent country plans extend, with sequence-order assertion preventing wrong-reason passes.
- docs(plans): European gazetteer roadmap — design doc + 14 implementation plans (DE upgrade + GB + IE + NL + BE + FR + EE + LV + LT + PL + 3 Tier 2 batches + europe-historical) with mandatory Wikidata QID-validation gate after several originally-drafted QIDs were caught wrong post-design (e.g. Q1620908 = "historical region" not Kirchengemeinde, Q73501 = a Dutch town).
- fix: Genney `.gcc` / `.backup` import now reads researcher info (name, address, phone, email) from the Genney SUBMITTER profile and writes it into Settings — closes the same gap as the GEDCOM SUBM fix below, but for the Derby-database import path. Existing values you typed in Settings are not overwritten.
- fix: GEDCOM import now reads researcher info (name, address, phone, email) from the SUBM record and writes it into Settings — previously only the name was used to match a tree subject and the contact details were silently dropped, so a GEDCOM round-trip lost your researcher info. Existing values you typed in Settings are not overwritten.
- chore: tree charts no longer encode parent_child subtype (foster/adopted/step) as dashed/dotted line variants. Every parent_child edge now renders as the same solid line. The relationship subtype is still recorded in the database and editable in the relationship modal — only the chart rendering changed. Removes the mixed-subtype edge-splitting code path that had to fight the couple-anchor layout to show two different dashes for the same child.
- fix: saving a group or research task with empty notes crashed with `NOT NULL constraint failed: groups.notes` / `research_tasks.notes` (same shape as v0.227.6's relationship fix); clearing the notes field on a place silently kept the old text. Modals (Group, Place, ResearchTask) no longer coerce empty strings to `null`, and the `update*` api functions coerce `null` → `''` for NOT-NULL text columns to match their `create*` siblings.
- feat: open-source license attribution now travels with the app. Settings → About → "View open source notices" displays the full license text of every bundled third-party library (185 packages). The same `THIRD_PARTY_LICENSES.txt` plus a CycloneDX `sbom.cdx.json` are attached to every GitHub release as standalone supply-chain artifacts.
- fix: SBOM workflow now includes Electron (and its electron-* runtime packages) — Electron is a devDependency in `package.json` but physically ships in the binary, so omitting it would mislead supply-chain auditors
- fix: document dev-mode Vite path-traversal assumption in `app:readThirdPartyLicenses`; tighten `window.api.app` type to remove `as string` cast in licenses modal

- feat: `THIRD_PARTY_LICENSES.txt` is now auto-generated and bundled into the packaged app at `Resources/THIRD_PARTY_LICENSES.txt`
- fix: `npm ls` warnings (peer-dep advisories, extraneous-package notices) are now forwarded to stderr instead of being silently discarded during license generation
- fix: list views (Places, Groups, Tasks, Media) and panel sections (Uppgifter, Kvalitet, Identifierare) no longer cache the initial empty fetch when data is created via the MCP server. The DB worker now broadcasts `data:changed` after every mutating channel handler, the preload subscribes and fans out to existing `dataChangedListeners`, and `useEntityData` / `usePagedList` refresh as if the renderer had made the call itself. Surfaced by an MCP-driven Bernadotte-line test where Groups/Places/Tasks views showed "Inga grupper / Inga platser / Inga uppgifter" while the DB held dozens of rows; pickers and quality reports saw the data correctly. Regression-tested in `tests/unit/data-changed-broadcast.test.ts` (asserts both ends of the wiring stay present).
- fix: `add_place` MCP tool silently dropped `place_type` / `latitude` / `longitude` / `notes` / `date_from` / `date_to` / `street` / `postal_code` / `city` / `country` whenever `parent_chain` was supplied — the chain branch only forwarded `name` to `findOrCreatePlaceWithChain`. The api function now accepts an optional `leafProps` arg that gets passed through to `createPlace` for newly created leaves; existing rows are still left untouched (use `update_place` to overwrite). Closes a Prime-Directive violation surfaced by the Bernadotte test.
- fix: i18n labels for `eventTypes.accession` ("Trontillträde" / "Accession to throne") and `eventTypes.coronation` ("Kröning" / "Coronation") added to both `sv.ts` and `en.ts`. Both keys (plus `name_change`) also added to the `EVENT_TYPE_VALUES` constant so the EventModal dropdown lists them. Without this, the side panel showed the literal text "eventTypes.accession" next to the date for monarchs.
- feat: `ui_reload` dev-MCP tool — hard-reloads the Electron renderer window via the existing UI bridge. Lets agent-driven tests re-mount list views after MCP-side mutations without asking the user to press Cmd+R. (The data:changed broadcast above makes most reloads unnecessary, but this keeps a one-shot escape hatch for cache-shaped problems we haven't found yet.)
- fix: editing a relationship's subtype (e.g. father → adopted father) crashed with `NOT NULL constraint failed: relationships.notes` when the notes field was empty. RelationshipModal sent `null` for empty notes and `updateRelationship` wrote it through to the NOT-NULL column; both now coerce empty notes to `''` to match `createRelationship`'s contract.
- chore: pure preview-injection helper extracted from `src/main/preview-protocol.ts` into `src/main/preview-html-inject.ts` and unit-tested (marker-present / marker-missing / placement-before-module / `</script>` escape / null-snapshot / dist-static survives viteSingleFile). Adds a Static SPA gotcha + memory rule capturing the silent-string-replace anti-pattern that produced v0.227.5 — never let a build-artifact mutation no-op silently; throw if the marker isn't found.
- fix: website export preview iframe is blank with a `Failed to fetch ./data.json` console error after the Track B compression change. preview-protocol's regex was looking for the `<script src="./data.js">` tag that Track B removed, so the snapshot never got injected and the bootstrap fell through to the dev-mode `data.json` fetch (which fails on the iframe's blob: URL). Restored via a stable `<!--PREVIEW_SNAPSHOT_INJECTION_POINT-->` marker in the static HTML; the preview builder now throws loudly if the marker is missing instead of silently producing a broken iframe.
- chore: expand `ux-intent-mapping` skill with the four Surface Contract checks (host-entity flow, label honesty, lifecycle parity, no silent state degradation), the five historical panel failures, and a pre-commit checklist
- chore: add `gedcom-fidelity-registry` and `undo-redo-patterns` skills — trigger-on-intent guides for the two safety nets that protect user data when adding schema columns or new mutations
- fix: research tasks shown on a place panel now refresh as soon as you save or delete one — previously the list went stale until the panel was closed and reopened
- fix: research-task person links survived in name only — upgrading from a v0.79 database silently wiped every task→person link because `DROP TABLE research_tasks` cascaded through `task_links`. Both legacy table-redefinition migrations (research_tasks + person_names) now disable foreign keys around the rebuild
- chore: add schema-migration coverage tests — synthesised pre-v0.3 fixture, idempotency check, and a column-fingerprint snapshot that fails CI if a column is added without a migration block
- feat: bundled gazetteers ship gzipped — installer is ~46 MB smaller (52.6 MB raw → 6.4 MB compressed for the 29 bundled gazetteer JSONs); app boot, place picker and gazetteer resolution unchanged
- feat: website export gets two delivery modes — Split (default, smaller, for hosted deployment on GitHub Pages / S3 / Netlify) and Portable (single self-contained index.html for emailing or opening locally with a double-click). The exported snapshot is always gzipped; on a typical DB the hosted folder drops from ~60 MB to ~13 MB and the portable single-file from ~60 MB to ~17 MB
- chore: add `worker-thread-ipc-split` skill — trigger-on-intent companion to the IPC rules, with bug history and pre-commit reflex for sync I/O / bulk-write / lying-bulk-name violations
- feat: website export panel renames "Ämne" to "Fokusperson" with a clearer hint, and shows a file count next to the "Mediafiler" checkbox so you know how big the export will be before clicking
- fix: website export now copies media files when `file_ref` is stored as a relative path — previously the access check ran against the wrong base directory and silently dropped every file
- feat: notes, place descriptions, media captions and citation page badges render archive references as clickable links per your link rules; reports get an opt-in toggle (Header & footer section) so printed pages stay clean while PDF and website export pick up the live links
- fix: side-panel tables no longer clip badges, dates, and delete buttons — columns size to content again
- feat: imports, exports, and website preview run on the DB worker thread — the app no longer freezes for 25 s during a 22 k-person Holger import (or for the duration of any long-running export/preview)
- perf: hourglass tree at 7 generations loads noticeably faster — fewer DB round-trips per node
- fix: place-tree picker icon and tooltip explain what the panel shows
- fix: clarify "date original" field with label and helper; flag misuse via quality check
- fix: per-row partner heading is singular ('Partner' not 'Partners')
- fix: 'Förnamn' sort uses tilltalsnamn (preferred name) when marked
- fix: list table headers stay visible while scrolling
- fix: section headers in side panels are visually distinct (color band)
- fix: chart controls (zoom, generation count, fan arc, color mode) now show tooltips on hover
- feat: register birth date and place inline when adding a new person
- fix: 'About OurLegacy' is reachable from the macOS app menu and from Settings
- feat: side panels show when an entity was registered and (where tracked) last changed
- feat: each person has a stable, sortable display id, visible in the list and the panel header
- fix(chart): dedup focal partner against tree members so persons can no longer appear twice in the hourglass
- fix: imported (Genney) and undo-restored persons get a display_id immediately, not at next app launch
- chore: test suite is fully green (13 stale tests updated to match shipped behavior; no code regressions found)
- feat: undo/redo buttons in the topbar with action-naming tooltips (e.g. "Ångra: Skapa person")
- fix: typing in a place field after picking from the suggestion list edits the field instead of clearing it
- fix: tall modal forms now scroll inside the modal so Save stays reachable
- fix(schema): pre-v0.218 databases no longer crash on app launch with "no such column: display_id"
- fix: relation row uses clearer role labels (full word, not "Fö"), hover tooltips on every affordance, and a trash icon for remove
- feat: research tasks can be linked to persons; each person's PersonPanel surfaces an "Uppgifter" section with a + Task CTA that auto-links the host person
- feat: source types include passenger list, probate inventory, peerage register, encyclopedia, genealogist; dropdown sorts alphabetically in the user's locale; "Tidning / Tidskrift" and "Onlinedatabas / Sociala media" relabeled
- fix(mcp): dev tools (db_stats, seed_*, clear_test_data) follow `switch_database` swaps instead of staying pinned to the closed initial connection
- fix(mcp): `db_stats` no longer throws `stmt.getAsObject is not a function` (used the sql.js API instead of node-sqlite3-wasm's); `app_status` reports the live DB path after a `switch_database` swap (was reporting only the launch-time env var)
- fix: relationship edit modal saves correctly; Save button is dimmed when fields are missing; save errors now surface the underlying cause instead of a generic "Could not save" toast
- feat: name records can carry a source citation (Hänvisning section in PersonNameModal); 'Giltigt till' / 'Valid until' field is hidden where it doesn't apply (`birth`, `name_change`) and relabeled per name type ('Used until' for `alias` / `aka`)
- fix(chart): adoptive parent_child edges render dotted, distinct from foster's dashed style; mixed-subtype edges (e.g. one foster + one adopted parent) split into per-parent paths so each subtype is visible; legend wires both foster and adoptive entries
- chore: revert sex-change-guard Phase 1 — the new `gender_transition` event type didn't fit GEDCOM 5.5.1/7 round-trip cleanly enough to ship; the API guard also regressed PersonModal sex changes for any person with relationships

## 0.215.2

- fix(chart): multi-partner connector sits a quarter of the gap above the row, no longer overlapping the parent line

## 0.215.1

- fix(chart): multi-partner connector now routes above the row so it doesn't cross children

## 0.215.0

- feat: relations on a person panel render in a deterministic order

## 0.214.0 — Event participants parity + marriage-flow prompts

- feat(events): editing a wedding/marriage/engagement/divorce now shows the "Other person" picker pre-filled — the affordance is symmetric across create and edit
- feat(events): every event type (baptism, funeral, christening, …) now exposes a Deltagare / Participants section, so witnesses, godparents and mourners can be recorded against any event
- feat(relationships): saving a couple+marriage relationship without a wedding event now offers to record the wedding inline; declining writes nothing
- feat(relationships): creating a second partnership while an existing one has no divorce event and the partner is still alive now warns before silent overlap; the user can proceed or cancel

## 0.213.0 — Hourglass chart polish

- feat: siblings and shared children render oldest-leftmost in the family chart
- feat: partner edges no longer cross other partners' boxes when a person has 2+ partners
- feat: shared children visibly hang from the couple connector, not from one parent
- feat: foster parent–child relationships render with a dashed line and a hover label
- feat: clicking a relative pans the chart to keep them on screen

## 0.212.2

- fix: long text in panel tables clips with ellipsis instead of stacking vertically

## 0.212.1

- fix(places): the map sheet no longer overflows its column when the center is squeezed narrow (small windows, default panel widths, static-export preview iframe). `.map-chart-area` was held open at `min-width: 200px` while its parent shrank, so it leaked across the list and panel columns. Now matches `PersonsView`'s `.viz-chart-area` (min-width: 0 + overflow: hidden on the wrapper) — the map shrinks cleanly with its slot.

## 0.212.0

- feat(person-modal): the Save button in "Lägg till ny person" stays disabled until the user types at least one name field; no more accidental nameless persons. Existing nameless rows in user databases are surfaced via a new `PERSON_NO_NAME` quality check (notice severity).
- feat(persons): every server-side path that creates a person row now refuses to do so without a name — `persons.create`, `persons.createWithEvent`, MCP `create_person`, MCP `add_child`. Importers (GEDCOM, Holger, Genney, archive .zip) opt in via an explicit `allowNameless: true` and append a warning to the import report when an INDI/PERSON record carries no NAME tag, preserving the source's reference graph without silent drops.

## 0.211.3

- fix: foster/adoptive/step relationships render natural Swedish labels (Fosterförälder, not Förälder + Foster)

## 0.211.2

- fix: Place Details panel now reactively previews Type / Parent / Coordinates as you type in the Name field, matching the Add Place modal

## 0.211.1

- fix: place name autocomplete no longer opens its dropdown when the panel switches to a different place

## 0.211.0

- feat: place name field autocompletes from existing places + gazetteer in both the Add Place modal and the Place Details panel — picking a suggestion only fills the name string, no merge or side-effects

## 0.210.12

- fix: place tree picker filter input now has matching padding around it, like other filter boxes

## 0.210.11

- fix(import): Holger imports no longer crash with `ReferenceError: existsSync is not defined` the moment they hit an inline OBJE. v0.210.7 removed the `existsSync` import from `obje-importer.ts` (matching the parallel cleanup in `phaseObje`) but missed the call site at line 53. Lint with `--quiet` doesn't surface "used identifier with no matching import," so the regression shipped through v0.210.10. `is_missing` now derives from `!file` only — on-disk truth is decided later by `consolidateMediaFolder`'s single recursive readdir, matching `phaseObje`.
- fix(import): media imported via Holger now actually loads in the renderer. v0.210.7's bulk-copy step preserves the source media folder structure (e.g. `Media/P12/photo.jpg` → `<dbname>-media/P12/photo.jpg`), but `consolidateMediaFolder`'s fast-path was rewriting the DB ref to `<dbname>-media/photo.jpg` (basename only, flat). Every row's `file_ref` therefore pointed at a path that didn't exist; `media:readAsDataUrl` returned null, MediaView spinners hung, AppAvatars showed initials. Consolidate now takes a `bulkCopiedFromDir` argument from the import handler and writes the relative subpath that matches what bulk-copy actually placed on disk. Existing databases imported under v0.210.7–v0.210.10 need to be re-imported to pick up the corrected refs.
- fix(import): consolidate's fast-path now verifies the bulk-copied file is actually in dest before rewriting the ref. If a source file was missing from the bulk-copy tree (the wetransfer bundle didn't include it, etc.), the row is counted as `missing` instead of silently writing a broken ref.

## 0.210.10

- perf(media): `getPersonProfilePicRefs` (the bulk endpoint behind every avatar batch fetch) now runs two SQL queries total regardless of input size — one window-function pass over `media_regions` to pick the first face tag per person, and one pass over `media_links` for persons without a face tag. Previous implementation was a JS loop calling the singular per-id helper, so a 50-row PersonsListTab triggered 100 SQL prepares + executes inside one IPC. Down to 2.
- fix(profilePic): if the batched profile-pic IPC rejects (worker error, dropped reply, anything), the store now logs `[profilePic] batch fetch failed:` and marks every queued person as `error` so the loading spinners terminate cleanly. Without this, the shared `pendingPromise` would hang forever and AppAvatars would spin until the user navigated away.
- chore(gazetteers): the `[gazetteers] coord divergence at …` warning is off by default. With multiple sources merging the same World tree, a single mismatched coordinate fires the warning hundreds of times per gazetteer load and floods the terminal buffer. The divergences themselves are upstream script bugs to fix one-off, not runtime concerns. Re-enable with `SLAKTFORSKNING_GAZETTEER_DEBUG=1` when actually triaging.

## 0.210.9

- perf(ipc): the DB worker no longer pins on synchronous file reads when the renderer mounts a list view full of avatars. `media:readAsDataUrl` and `media:getFilePath` were doing `fs.readFileSync` / `fs.existsSync` on the worker thread; with media in the database, switching to PersonsListTab fired N per-row IPCs that each blocked the worker for the duration of a 5 MB JPEG read + base64 encode (~50 ms each), serialising every other handler behind them. Reads now go through `fs.promises.readFile` / `fs.promises.access` — libuv's threadpool runs them in parallel and the worker stays responsive between callbacks.
- perf(renderer): the profile-pic store now coalesces per-row `ensureLoaded` calls into a single batched `media:profilePicRefs` IPC per microtask. Mounting PersonsListTab over a 22k-person DB fired one IPC per visible avatar (50+ round-trips through the worker) — Vue flushes child component setups inside the same microtask, so collecting them into a single `ensureBatch` call collapses that into one round-trip with no UX change.
- perf(renderer): `PersonsView.load()` no longer fetches the entire `persons` table just to compute `noPersonsExist` / `noFocalPerson`. The previous `persons.list()` returned all 22k rows (with joined names) so two boolean comparisons could run; now `persons.listPage(1, 0, ...)` returns one row plus the total via the existing pagination path.
- fix(worker): lifecycle handlers (`init`, `db-switch`, `import-start`, `import-end`) now log a clear `[db-worker] lifecycle handler crashed:` line before re-throwing. Without this, an `openDb` failure (corrupt DB, failed migration, lock race) took the worker down silently and every subsequent IPC failed with the unhelpful `Worker exited with code 1`.

## 0.210.8

- fix(ci): the Vitest root `testTimeout: 15000` was not inheriting into the `unit` and `components` projects, so per-project timeouts silently fell back to the 5 s default. Windows runners hit this on `mcp.test.ts > switch_database` (slow first-time SQLite-WASM init) and `import-genney-orchestrator.test.ts > isDockerAvailable` (slow `where docker` spawn). Now set per-project too.
- fix(ci): e2e tests against the packaged Linux binary now pass `--no-sandbox --disable-setuid-sandbox` to Electron on Linux runners. GitHub Actions' Ubuntu image ships the packaged binary without the root-owned, mode-4755 `chrome-sandbox` helper that Electron's SUID sandbox requires, so the binary aborted at startup with `chrome-sandbox helper binary was found, but is not configured correctly`. macOS and Windows still launch unmodified.

## 0.210.7

- perf(ipc): the per-IPC timing log was running unconditionally in production, doing two synchronous `fs.appendFileSync` calls per IPC handler invocation. After a long session it had grown to 1 GB; appending to that file from the Electron main thread on every renderer call eventually serialized the entire IPC bus — `persons:list` calls were observed taking over 4 minutes from queue to response while the actual handler completed in milliseconds. The log is now off by default and gated behind `SLAKTFORSKNING_IPC_LOG=1`; when enabled it uses a buffered write stream instead of sync appends. The 1 GB log this regression produced sits in `~/Library/Application Support/Släktforskning/ipc-timing.log` — safe to truncate.
- perf(import): Holger imports with a media folder now finish in seconds instead of minutes. Three compounding issues:
  - The media folder was copied one file at a time inside `consolidateMediaFolder` with up to 7 sequential `await` calls per file (multiple stat/exists checks + `copyFile` + a diagnostic stat), so libuv's threadpool sat ~75% idle. The Holger handler now bulk-copies the source media tree up front via `fsp.cp({ recursive: true })` (one Node call, libuv parallelises internally), and consolidate fast-paths every row already present in dest with a single `Set.has` lookup.
  - The remaining slow-path copies (files outside the bulk-copy tree) now use `COPYFILE_EXCL`, which lets the kernel handle "dest exists" / "source missing" atomically — one syscall per file instead of stat+open+write.
  - The 12k `UPDATE media SET file_ref = ?` rewrites were each their own autocommit, triggering a WAL fsync per row (~1–5 ms each on APFS). Now wrapped in `BEGIN IMMEDIATE / COMMIT` — one fsync at the end. CLAUDE.md's existing "writes > 50 rows must be transactional" rule applies; this loop was missed.
- perf(import): `phaseObje` and `importObjeNode` no longer call `existsSync` per OBJE record (~12k synchronous stat calls on the main thread for a Holger import). The `is_missing` flag is now derived from "do we have a file_ref" only; whether the file is actually on disk is decided later by `consolidateMediaFolder`'s single recursive readdir of the dest folder.
- perf(import): Genney's `.backup` archive media copy migrated from `fs.cpSync` to the new async `bulkCopyMediaFolder` helper, so the main thread stays responsive during the copy.
- chore(import): Holger import path emits boundary timing logs (`[import-timing] ...`) for parse, each phase, bulk copy, consolidate, and total handler time — visible in the npm-start terminal. Useful when tracking down regressions in this area; constant overhead, no per-row chatter.

## 0.210.6

- fix(ci): release workflow no longer self-deadlocks on artifact storage quota. The cleanup job was gated on `release.result == 'success'`, but the release fails when uploads hit quota — so cleanup never ran and quota stayed full forever. Cleanup now runs `if: always()`, keeps only the 3 newest artifacts (was 30), and build artifacts get `retention-days: 1` since they're transit-only between the build and release jobs (the durable copies live on the GitHub Release page). v0.205 → v0.210.5 binaries were lost to this; first release after the fix is v0.210.6.
- fix(tests): two Genney import tests no longer time out on Ubuntu CI. They asserted "Docker spawn rejects without a real Derby DB," but Ubuntu runners ship Docker preinstalled, so the spawn took longer than the default 5 s test timeout to actually fail. Per-test timeout bumped to 30 s.

## 0.210.5

- perf(import): large GEDCOM imports (10k+ persons) no longer churn CPU for minutes. `createPerson` was running two correlated `EXISTS` subqueries through `livingSqlExpr` after every INSERT, scanning the growing `events` + `event_participants` tables — turning bulk imports into O(n²). The just-created person has no events yet, so the derivation is skipped. Regression introduced when the stored `living` flag was replaced by the read-time derivation; the report-side fix landed in `loadLivingDerivation`, but the import-side call site was missed.
- perf(places): added `places(normalized_name)` and `places(parent_place_id, normalized_name)` indexes. `findOrCreatePlace` and `findOrCreatePlaceWithChain` were doing full-table scans on every event — fine on day one, O(n²) once you've imported a few thousand places. Idempotent migration runs on next DB open.
- perf(import): media consolidation no longer freezes the renderer. `consolidateMediaFolder` is now async — `fs.copyFile` and `fs.access` go through libuv's threadpool so the main thread stays free to service IPC traffic (list loads, undo, panel switches) between file copies. Previously a 1.5 GB media import blocked the main thread for ~38 s of synchronous `copyFileSync` calls at ~40 MB/s while the UI sat unresponsive at 10 % CPU.
- fix(import): the Holger and Genney import handlers now set `importInProgress` like the GEDCOM and archive handlers, so the worker thread skips `checks:runAll` for the duration of the import instead of running quality checks concurrently with the import's writes.

## 0.210.4

- fix(gazetteers): toggling a gazetteer in settings now actually re-resolves places everywhere — the resolved-via line, map pins, and tree picker hits all reflect the new enabled set immediately. The shared resolver's `ready` ref was created per-call, so when GazetteersView invalidated the cache the other consumers (PlacePanel, MapView, useResolvedPlace, …) never saw the flip and kept rendering against the old tree. `ready` is now module-level shared state, `invalidate()` drops the gazetteer references too (not just the result cache), and saving the settings calls `ensureLoaded()` so the new tree is in place before consumers re-run.
- fix(gazetteers): `resolveBoundary` now respects the user's enabled-set; disabling a boundary gazetteer in settings actually removes its polygons from the map.

## 0.210.3

- fix(gazetteers): the GazetteersView "Test Lookup" panel now shows one row per source gazetteer that produced a hit (with each source merged with the enabled language gazetteers for alias enrichment), so `world-historical` is visible again when testing historical names like "Sovjetunionen". Previously the loop iterated the merge engine's single synthetic gazetteer, hiding every source under the "Merged hierarchy" label.
- feat(gazetteers): test-lookup results have a Matched / All-enabled filter chip — "Matched" (default) shows only sources that resolved the input; "All enabled" lists every enabled source with a "no match" placeholder for the rest, so it's clear which sources you've enabled but didn't contribute.
- fix(ux): the test-lookup search input uses the canonical `.list-filter-input` style (padding, border-radius, focus ring) shared with the list/tree pickers across the app, instead of its own slightly off variant.

## 0.210.2

- fix(gazetteers): the resolver no longer requires the matched node to be a leaf to call a match `exact` — "Afrika" → Africa and "Sverige" → Sweden now report `exact` instead of `partial`. The leaf-only shortcut was a relic from when leaves were the "specific" places (parishes, cities); with the global hierarchy every continent and country has children, so the shortcut downgraded every input that landed on a real, fully-consumed node above leaf level.
- fix(gazetteers): the "Resolved via" line in PlacePanel, PlaceFormFields, and the map popup now shows the real source gazetteer IDs (`world-boundaries`, `lang-sv-geonames`, …) from the matched node's `__contributors`, instead of the synthetic merge-engine id `__merged__`.

## 0.210.1

- fix(gazetteers): translation-only language gazetteers carrying the legacy `kind: 'language'` discriminator (instead of the new `shape: 'language'`) were being walked as data gazetteers, so their Swedish/historical aliases never reached the merged tree; loader now treats both as synonyms
- fix(gazetteers): län-letter codes (e.g. "Solna (B)" → Stockholm) and historical län aliases re-attach under the new World > Europe > Sweden > <län> path, where each län's `name` is the bare form and the genitive lives in aliases
- fix(gazetteers): `loadGazetteers` returns an empty array when no gazetteers are enabled (was a synthetic empty-World shell)
- feat(gazetteers): `sv-sockenstad-boundaries` and `dk-sogne-boundaries` cross-reference both modern and church/Wikidata + DAWA parish gazetteers when looking up parent-admin chains, raising the polygon→kommun match rate for older / merged parishes (sv: 198 → 106 unmapped of 2473; dk: ~67 → 2 unmapped of 2148)

## 0.210.0

- feat(gazetteers): global gazetteer hierarchy migration. The picker, panel breadcrumb, resolver, and map now see one canonical place hierarchy rooted at `World` (with `World (Historical)` as a sibling super-root). Every per-country and per-source gazetteer emits a self-rooted tree typed by the closed admin vocabulary `world | continent | country | admin{N}`. The structural-merge engine collapses same-`(name, type, parent_path)` nodes across sources — Eksjö kommun is one node with `__contributors` listing every gazetteer that contributed to it. Resolver verified end-to-end across SE/FI/NO/DK/IS/US/CA/DE plus `World (Historical)` for historical empires. `GazetteerNode.type` tightened to the closed type. Imported user gazetteers must root at `World` or `World (Historical)`.
- feat(gazetteers): every per-country gazetteer re-fetched fresh and re-rooted under World > Europe / North America. Per-country admin1/admin2 names are GeoNames-canonical with locale suffix as alias (Jönköpings län → Jönköping with alias). Source attributions: GeoNames CC BY 4.0 (countries, admin1, admin2 codes, country dumps for SE/NO/FI/IS/US/CA/DE), Wikidata CC0 (Swedish parishes, Danish parishes, Swedish landskap, world-historical), DAWA CC BY 4.0 (Danish parish administration), Lantmäteriet CC0 (Swedish parish & city polygons), GeoDanmark via ok-dk/dagi (Danish parish polygons), Natural Earth public domain (world country polygons + continent polygons). Boundary gazetteers cross-reference each country's GeoNames `.txt` ADM1/ADM2 rows for parent-admin lookup so polygons attach under their canonical fylke/state/Bundesland.
- chore(gazetteers): structural-merge engine in `src/api/place-gazetteers/merge.ts` replaces the legacy attach-only loader. Build scripts produce trees that match the contract; the load-time engine is mechanical merge with `__contributors: string[]` for provenance — no per-country mapping tables in app code, no fixtures, no privileged "scaffolding" gazetteers.

## Unreleased

- chore: extend Surface contract guidance with a fourth check — "no silent degradation across state" — capturing the pattern behind the place-picker filter dropping gazetteers and the section-CTA failing on collapsed sections, as a single principle rather than two specific patches
- fix: section header action buttons (+ Event, + Media, + Add task, etc.) now expand the section first when collapsed, so the result of the action is visible — previously, clicking + Media on a collapsed Media section silently no-op'd because the section's body wasn't mounted yet
- fix(mcp): place tools (`add_place`, `update_place`, `record_event`) now reject comma-strings in `name`/`place` and accept an explicit `parent_chain` / `place_chain` (root → leaf) — closes the "Chennai, India, World, India, World" RCA where an agent's path-shaped string got persisted verbatim as a place name
- fix: places map keeps its zoom and pan when you set a pin — no more snapping back to Sweden after every map click
- fix: place modal now previews gazetteer resolution (parent, type, coords) inline like the side panel does
- fix: place panel name field is a plain editable text input — picking from the old name picker no longer silently overwrites parent/type/coords
- fix: research-task delete confirmation and toast now show the task title instead of "Unknown" — caught immediately by the fresh-context audit re-run after host-level lifecycle was added to the Surface contract
- feat: every entity panel now has a Danger-zone delete button at the bottom, mirroring the existing person delete; places, sources, media, groups, and research tasks can now be deleted directly from their panels (places previously had no UI delete path at all)
- chore: extend Surface contract guidance in CLAUDE.md to cover host-level lifecycle (the panel must let the user delete the entity it's hosted on, not just the items inside its sections)
- fix: place panel's Persons section no longer carries a "+ Event" button — the section is a derived view, and a fresh-context audit caught the title/label mismatch (Persons section + Event handler); a small running hint signposts the Events section above as the canonical add path
- chore: tighten Surface contract guidance to distinguish title-mismatch and duplicate-on-derived-view failures from convenience-duplicate Add CTAs across alternate views of the same primitive
- chore: codify Surface contract guidance for panel CTAs in CLAUDE.md
- feat: + Event from a place pre-fills the place; the place panel's Persons section now uses + Event so adding a person there actually attaches them to the place
- fix: removed the unwired duplicate + Media button on Media Timeline sections in the Person and Place panels
- feat(mcp): MCP feature parity with the desktop app. The prod server now exposes 77 workflow tools (was 39) covering full CRUD on every record type the renderer can author or curate. New tools: `update_relationship`, `delete_relationship`, `add_event_participant`, `remove_event_participant`, `delete_event`, `update_source`, `delete_source`, `update_citation`, `delete_citation`, `update_place`, `delete_place`, `link_media`, `unlink_media`, `reorder_media`, `update_media_region`, `delete_media_region`, `delete_research_task`, `add_person_identifier`, `get_person_identifiers`, `delete_person_identifier`, full Groups domain (`add_group`, `list_groups`, `get_group`, `update_group`, `delete_group`, `add_group_link`, `remove_group_link`), full Repositories domain (`add_repository`, `list_repositories`, `get_repository`, `update_repository`, `delete_repository`, `link_source_repository`, `unlink_source_repository`, `get_repositories_for_source`), and `import_archive` / `export_archive` for `.zip` round-trip with media. Coverage is enforced by a registry-completeness test in `tests/unit/mcp.test.ts` so future regressions break CI.
- feat(mcp): new `update_media` and `delete_media` MCP tools. Closes the gap that left an agent unable to repair a broken `media.file_ref` (e.g. an attached URL that should have been a relative path under `<dbname>-media/`) or remove a media row entirely. `update_media` now also accepts `file_ref` (previously only title/notes/format/is_printable were updatable).
- feat(mcp): `record_event` and `update_event` accept `date_value_end` so range dates (`date_type: "between"`, e.g. military service 1999–2000) round-trip through the MCP — previously the field was silently dropped on the way in.
- feat(mcp): new `update_person_name` tool — retype an existing `person_name` (e.g. flip the auto-stamped primary `birth` to `aka` when the actual birth surname differs), set `date_from`/`date_to`, attach `nickname` / `preferred_name`. Closes the gap that left the `MULTIPLE_BIRTH_NAMES` quality warning unfixable from the agent side.
- feat(mcp): new `delete_person_name` tool — drop a single `person_name` record without deleting the person.
- fix: name reorder arrows now disable (with tooltip) when chronological order forbids the swap, instead of clicking through to a red error
- fix: fan chart generation 6 ring is wider so birth and death dates fit alongside the name
- fix: dragging the side panels next to the fan chart no longer stutters — the chart re-fits once you release
- perf: Family in a Year report no longer pegs CPU or crashes the database worker on large trees
- fix: events list in side panels drops the Fact column and stops wrapping place names — narrow panels truncate cleanly instead of contracting
- fix: map view now refreshes pins automatically when places change anywhere in the app — no more switching tabs to see edits

## v0.204.0 — GEDCOM round-trip fidelity registry + coverage guard

- **feat:** Every column in every non-exempt schema table now has an explicit round-trip status under GEDCOM 5.5.1 and 7.0, declared in `src/api/gedcom_fidelity_registry.ts`. A schema-introspection unit test asserts the registry covers every column — adding a new column to `src/api/schema.ts` without registering it fails CI immediately with the column name and a pointer to the registry. The user's choice to use this app remains reversible: the data they hand us comes back out, with documented `lossy` / `excluded` exceptions instead of silent loss.
- **test:** Three new tests enforce the contract — `tests/unit/gedcom-fidelity-registry-coverage.test.ts` (schema gate), `tests/unit/gedcom-fidelity-per-field.test.ts` (per-(table, column, version) round-trip, 187 cases + 100 documented exclusions), `tests/unit/gedcom-fidelity-golden.test.ts` (multi-row, multi-table seed → round-trip → canonical equality).
- **fix(gedcom):** `formatGedcomDate` was emitting the start of `BET..AND` through ISO→GEDCOM but the end raw, breaking `events.date_value_end` round-trip. Both ends now go through the converter.
- **fix(gedcom):** Repository address sub-fields (`CITY`/`POST`/`STAE`/`CTRY`) were attaching as orphans to the preceding `1 NAME` line when address itself was empty; the importer dropped them. Now emits a `1 ADDR` parent (with empty value if needed) whenever any address sub-field is present.
- **docs:** New "⚠️ Prime Directive (cont.): Round-Trip Fidelity" section in `CLAUDE.md` codifies the directive as co-equal with authored-data preservation. Lifecycle direction is GEDCOM → DB → user → DB → GEDCOM end-to-end.

## v0.203.0 — GEDCOM round-trip fidelity for fact-shaped events

- **feat:** Occupation, education, religion, title, and other GEDCOM-X fact-shaped events now preserve the line value (e.g. `OCCU "Carpenter"`) end-to-end. Previously the importer silently dropped the value; now it lands in a dedicated `events.value` column and round-trips back through GEDCOM export byte-for-byte.
- **feat:** EventModal shows a type-aware "Value" field (Yrke / Examen / Trossamfund / etc.) for fact-shaped event types, plus an always-visible Notes textarea. The Value field is hidden for non-fact-shaped events (BIRT/DEAT/MARR/etc.) but Save preserves authored data regardless of UI mode — Prime Directive guard.
- **feat:** EventList renders the value bold over a muted notes line for richer at-a-glance reading.
- **feat:** New event types `title`, `religion`, `description`, `fact` to route TITL/RELI/DSCR/FACT GEDCOM tags cleanly (previously TITL was coerced to occupation; RELI/DSCR/FACT silently dropped).
- **feat:** MCP `record_event` / `update_event` accept `value` and `notes` fields; the legacy `description` parameter is kept as a deprecated alias that routes to `notes` for backwards compatibility with existing AI agents.
- **feat:** CSV export adds a `value` column.
- **fix:** Genney importer maps fact-shaped event values into `events.value` instead of concatenating into notes.
- **fix:** PersonTimeline and PlaceTimeline rendered events.description (which no longer exists) — now render value + notes.
- **schema:** `events.description` renamed to `events.notes`; new `events.value TEXT` column. Migration is idempotent and preserves all authored data.

## v0.202.4 — Research task row click opens the editor in place

- fix: clicking a research task in PersonPanel or PlacePanel now opens ResearchTaskModal in edit mode in the panel, matching how names and events behave. Was navigating to `/research-tasks/:id` and yanking you out of the person/place you were on.

## v0.202.3 — UX_INVENTORY surface walk complete

- chore: filled in the last 4 modal Purposes (ResearchTaskModal, MergePersonsModal, LinkRuleModal, ConfirmModal). Every bounded UI surface in the renderer now has a user-stated Purpose sentence. Recorded the row-click inconsistency on ResearchTaskModal (panels navigate to /research-tasks instead of opening the modal in-place — names/events open in-place) for a future fix.

## v0.202.2 — UX_INVENTORY purposes for modals + finding #10

- chore: filled in user-stated Purpose sentences for 7 more surfaces in docs/UX_INVENTORY.md (ExportOptionsPanel, PersonModal, PersonNameModal, PlaceModal, PlaceTreePickerModal, RelationshipModal, GroupModal). Added cross-cutting finding #10 capturing the design principle that creation modals for referenceable entities should also offer "find existing" in the same flow. Internal docs only.

## v0.202.1

- fix: PlacePanel resolved-parent placeholder now shows the correct parent when the user's leaf token isn't in the gazetteer. For places like "Uvira, Belgiska Kongo" where the gazetteer matches only at parent level (→ "Kingdom of Kongo"), the matched node IS the parent — keep the full path instead of slicing it off. Resolved-type placeholder is also nulled in this case, since the gazetteer's type describes an ancestor, not the user's place.

## v0.202.0 — Place-as-biography

- feat: PlacePanel reshaped to read like a place's biography. Hero photo above the place name (first attached image by `media_links.sort_order`; click → MediaPanel; falls back to text-only when no qualifying media). Persons section now shows year ranges (`first_year–last_year`) per resident, sorted earliest-first, and excludes witnesses/godparents/officiants — only primary-role events count someone as a resident. New Research Tasks section linked to the place via the existing polymorphic `task_links` schema (no migration). Section order rewritten to biography flow: Place → Events → Timeline → Persons → Media → Media Timeline → Research Tasks → Quality. No new database schema; everything derives from data the user already authored.

## v0.201.0 — Inline media picker across entity panels

- feat: every right-side entity panel media section (Person, Place, Relationship, Source, Group, ResearchTask) now hosts the same inline `[picker | Add | Cancel]` add-row. The `+ Attach` action no longer jumps straight to the OS file dialog — type to autocomplete against existing media (already-linked items filtered out), or click the in-field 📎 icon / dropdown footer "Attach file…" to upload a new file. Same shape across all three section flavors (PersonMediaSection, EntityMediaSection, LinkedMediaSection).
- feat: new `media:createFromFile` IPC creates a media row without linking — lets `MediaAddRow` stay link-table agnostic across `media_links` / `group_links` / `task_links`.
- fix: MediaPicker `aria-expanded` now reflects the dropdown's always-on footer item (was stale when only the footer was visible).

## v0.200.2 — UX_INVENTORY purposes filled in (PlacePanel, SourcePanel, side panels)

- chore: filled in user-stated Purpose sentences for 14 panel and section surfaces in docs/UX_INVENTORY.md (PlacePanel sections, SourcePanel sections, GroupPanel, ResearchTaskPanel, MediaPanel, ReportPanel, WebsitePanel). Internal docs only.

## v0.200.0 — Relationships are managed per-person, not as a standalone view

- feat: removed the Relationships nav entry, list view, and side panel. Relationships are managed per-person from PersonPanel → Relations (which already does what users actually reach for). The data, MCP tools, GEDCOM FAM round-trip, and RelationshipModal (for editing relationships inline from PersonPanel) all stay.
- fix: search results no longer show a Relationships section — the rows had no canonical destination. Persons and sources sections still work; searching still finds people involved in relationships.
- fix: bookmarks to `/relationships` and `/relationships/:id` redirect to `/persons` instead of breaking.

## v0.199.1 — Trim Repositories section from SourcePanel

- chore: removed the Repositories section from SourcePanel — structured GEDCOM REPO records had no real authoring path here (no /repositories view, no RepositoryModal). The free-text `repository` field on the source covers the "what archive" question for hand-typed sources. Importers and exporters keep round-tripping REPO records as before.

## v0.198.2 — Trim place address fields from PlacePanel

- chore: removed the Address section from PlacePanel — street/postal code/city/country exist only to round-trip GEDCOM event-level ADDR sub-tags, no reason for a researcher to type them by hand. Importers and exporters keep populating and emitting the columns.

## v0.197.1 — Trim place-level citations from PlacePanel

- chore: removed the Citations section from PlacePanel — citing a place directly (vs an event at the place) didn't earn a section. Existing data and the underlying API are preserved.

## Unreleased

- chore: PLAN.md trimmed to active items; done milestones live only in the archive going forward.
- feat: PlacePanel gains a Timeline section that mirrors PersonPanel's Timeline — chronological events at this place with the same dot rail, gap markers on >20-year jumps, dated/undated split, and approximate-date affordance. Read-only derived view of the Events section; clicking a row opens the same event editor; `+ Event` chip routes to the same add flow (no second authoring path).
- feat: PlacePanel place section now communicates *how* a place is anchored — Type, Parent place, and Coordinates each show a "Resolved" hint with the gazetteer's value when you haven't authored one yourself.
- ux: Resolved hints sit inside the Type, Parent place, and Coordinate fields (was below); the place name field is relabelled "Place".
- fix: missing place-type translations (historical_state, state, region, division, church, language, root) added in en + sv.
- fix: panel CTA cleanup — Groups row in PersonPanel now navigates to GroupsView (was a dead click), unlink buttons across MediaPanel + EntityMediaSection use `IconUnlink` instead of raw `✕` (face-tag delete uses `IconTrash`), GroupPanel + ResearchTaskPanel unlinks now show the same confirm dialog PersonPanel has, the misleading "Add relationship" header button (silently picked spouse) is gone, and face-tag rows in MediaPanel show an explicit pencil affordance for reassignment. Convention regression-tested by `tests/components/panel-cta-conventions.test.ts`.
- feat: lat/long sit on a single row with a 📍 button — click to set coordinates by clicking on the map. A blue banner names the target place; Esc cancels.
- feat: PlacePanel Hierarchy section removed — the place picker already exposes the place tree.
- feat: persons with both a current and a birth-name record render as `Anna Andersson (f. Svensson)` (sv) / `(b. Svensson)` (en) across the panel header, persons list, search, person picker, relationships list, person timeline, linked-persons sections, and HTML site export.
- feat: 7 keepsake reports (A Life, A Marriage, Life on One Page, Photo Album, Your Ancestors, Place Chronicle, Family in Year) each get a per-report "Show birth name in parenthesis" toggle, inheriting the global default and overridable per-report.
- feat: Settings → Defaults gains a "Visning / Display" section with a global toggle for the birth-name parenthetical (defaults to on). Toggle re-renders open views immediately.
- feat: low-importance quality check `LIKELY_INLINE_BIRTH_NAME` flags name records like `"Andersson (f. Svensson)"` packed into a single field. The user splits them by hand via the existing name-edit modal — no auto-splitting (Prime Directive).
- fix: GEDCOM importer now maps `2 TYPE NAME_CHANGE` to `name_change` (was silently falling back to `birth`). Round-trip regression test covers all five `name_type` values via export → re-import.
- fix: MCP server survives Electron app restarts without forcing a manual reconnect
- chore: CSV export gains a comment explicitly forbidding baking the parenthetical form into surname cells (would round-trip as a literal string and trip the new quality check).

## v0.196.0 — Name changes on the timeline

- feat: a name (married, name change, alias, aka) with a "from" date now appears on the person's timeline at that date — the type label reads "Name change" with the new full name beneath
- feat: marriage / wedding / engagement event modal has an opt-in "Also record a name change for X" companion (off by default) that creates a separate `married` name with `date_from` = the event date
- ux: the name editor surfaces the from-date field inline for any non-birth name type (no longer hidden in the "more" details), with a hint explaining timeline visibility
- fix: clicking a name-change entry on the timeline opens the name editor (not the event editor)

## v0.195.0 — Right-panel action clarity

- feat: row actions in right-side panels now use distinct icons — trash for "delete entity permanently", unlink for "remove this connection". Tooltips spell out the blast radius. Replaces the overloaded `✕`.
- feat: clicking a relationship row in PersonPanel opens RelationshipModal in edit mode (consistent with names and events).
- feat: "Add father / mother / spouse / son / daughter" defaults to Find Existing Person when the database has more than one person, with helper text above the toggle. Prevents accidental duplicates.
- feat: External identifiers section removed from PersonPanel (round-trip-only data, surfaced via import/export). Dead `PersonIdentifierModal` and orphaned i18n / entity-color tokens cleaned up.
- fix: replaced hex colors and invented design-token names with real tokens in Names table, Research Tasks table, and Groups table. High-contrast and dark themes now adjust these correctly.
- fix: Quality section is consistently the last data section across all panels (PlacePanel was the only violator).
- fix: Names section is open by default in PersonPanel.
- fix: birth-name shows a disabled trash icon with explanatory tooltip instead of disappearing.
- chore: IconTrash + IconUnlink are now shared `ui/` primitives; PersonPanel Danger zone uses the shared trash too.
- chore: hand-rolled 1500ms debounce in PersonChecksSection documented (orthogonal to useEntityData's mutation debounce — debounces selection changes during list navigation).
- chore: UX_INVENTORY filled out for PersonPanel surfaces; cross-cutting icon convention documented; cross-cutting findings #1 (`✕` overload) and #2 (Add-relative duplicates) marked resolved.

## v0.194.2 — Person panel cleanup

- fix: name list reads chronologically — oldest at top, current/at-death name at the bottom
- fix: removed misleading "Living/Deceased" badge — death events already speak for themselves
- chore: UX inventory captures CTA shape for every panel section and modal (internal docs)

## v0.194.1 — Event-type change preserves authored data

- fix: changing event type no longer silently nulls cause-of-death or end date — authored values stay until you clear them
- fix: type-change warning now lists exactly what's at risk (orphaned spouse, missing spouse, citations written about the old type)

## v0.194.0 — Citation modal redesign + span end-date + place tree polish

- feat: citation source is now an autocomplete with in-field edit, changeable on existing citations
- feat: citation modal — notes resizable, defaults to Primary evidence, save button always visible
- feat: span event end date uses the same picker as the main date and defaults to unknown
- fix: place tree picker scrolls properly and filter searches the whole DB from the first character

## v0.193.3 — Internal only

- chore: UX intent-mapping skill + UX_INVENTORY use English consistently; UI-label Swedish stays in i18n only.

## v0.193.2 — Place tree picker attaches as side subpanel

- fix(modals): the place tree picker, when opened from a `PlacePicker` field inside another modal (e.g. EventModal), now renders as a side-attached subpanel via Teleport instead of stacking an overlay on top of the parent modal — matches the CitationModal pattern.

## v0.193.1 — Internal only

- chore: UX intent-mapping skill + surface inventory for renderer panels/modals.

## v0.193.0 — Scoped DOM tools for layout debugging

- feat(mcp-dev): `ui_get_dom` takes an optional `selector` so it returns one element's HTML instead of the full document.
- feat(mcp-dev): new `ui_query_styles` returns computed styles, bounding rect, and scroll metrics for matched elements.
- feat(mcp-dev): `ui_screenshot` accepts an optional `selector` (and `padding`) to crop the PNG to a single element.

## v0.192.1 — Right side panels scroll again

- fix: right side panels scroll when their content overflows — deep panels no longer clip below the viewport.

## v0.192.0 — Life timeline tells the story of a life

- feat(reports): A Life Report's timeline now shows the **story of the subject's life** — own events plus parent deaths, spouse death, and each child's birth/foster_placement/death that fell within the subject's lifetime. Family events render with a sex-typed relationship suffix ("Maria (mor)", "Lars (son)") so multiple Bortgång/Födelse markers in the same year stay readable.
- feat(reports): two opt-in toggles in ReportPanel — "Inkludera barns äktenskap" and "Inkludera syskons bortgång" — surface children's marriages and sibling deaths during the subject's lifetime when enabled.
- feat(panel): PersonTimeline (the timeline section in PersonPanel) now consumes the same canonical `getTimeline()` API. Previously it duplicated the EventList sitting next to it; now it tells the life story too. Clicking a family entry navigates to that person's panel; clicking a self entry still opens EventModal for editing.
- feat(api): `getTimeline(db, personId, options?)` is now the single source of truth for life timelines. Lifetime constraint is applied server-side (events outside the subject's birth–death window are dropped; child births get a +9-month posthumous extension to capture postpartum births).
- feat(mcp): `get_timeline` MCP tool exposes the new categories with a typed `relationship_label` ("self" | "father" | "mother" | "parent" | "spouse" | "son" | "daughter" | "child" | "sibling") and `include_children_marriages` / `include_sibling_deaths` parameters for AI-driven research.
- Supersedes Phase 4 of `docs/plans/2026-04-29-ben-reactivity.md` (BEN #31).

## v0.191.1 — Swedish continent names resolve

- fix(gazetteer): "Afrika", "Europa", "Asien", "Nordamerika", "Sydamerika", "Antarktis", and "Oceanien" now resolve to the corresponding continent in `world-boundaries`. The continents-in-world-boundaries plan added the geometries with English-only names; the Swedish-exonyms-expansion plan stopped at admin1 + capitals. The continents fell through the gap. `scripts/build-lang-sv-wikidata.ts` now also queries the 7 continent QIDs (Q15/Q51/Q48/Q46/Q49/Q538/Q18) and emits a `world-boundaries` translation block (Q538's English label is "Insular Oceania", so we key by QID and map QID → our gazetteer's continent name).

## v0.191.0 — Every right-side panel uses the EntityPanel shell

- refactor: MediaPanel, ReportPanel, and WebsitePanel now use the shared `EntityPanel` shell — same `.side-panel` root, same role-label band, same ▶ collapse button, same surface/radius/shadow chrome as Person/Place/Source/Relationship/Group/ResearchTask. The user-visible outcome: every paneled route's right pane is layout-identical and behavior-identical, no more "this one looks slightly different" drift. ExportOptionsPanel is documented as a deliberate exception (it's an embedded options form, not a list-view-hosted side panel).
- feat(website-export): WebsitePanel can now be collapsed and reopened from the WebsiteExportView, mirroring the ReportsView pattern (◀ reopen affordance + localStorage-persisted open state).
- test: new `tests/components/panel-layout-consistency.test.ts` mounts every right-side panel and asserts the root has `.side-panel` and rejects the `.entity-panel` collision class — catches the v0.190.0-class of bug at CI time.
- docs(rules): renderer.md now requires a class-name collision grep before introducing a new CSS class on any element in `src/renderer/`, and codifies "pattern migrations are all-or-nothing" at the component level (companion to plans.md Rule A2). EntityPanel is documented as canonical for ALL right-side panels in the Shared component catalog. The `add-feature` skill links to both rules.

## v0.190.3 — Process capture from panel-composables RCA

- chore: project-local rules + skills capturing six lessons from the panel-composables refactor. New `.claude/rules/plans.md` (every plan opens with User goal, full pattern scope, user-observable verification, RCA footer). New `.claude/skills/subagent-handoff/` with project-local prompt templates centering user goals over spec compliance + dispatcher verification rule. New `.claude/skills/dom-first-debugging/` (read truth before reasoning about CSS). The `panel-consistency-finish` plan retrofitted to comply with the new rules — proof the rules fire correctly. No upstream `superpowers:*` skills patched; everything project-local survives plugin updates.

## v0.190.2 — Right side panels fill width and height again

- fix: the new EntityPanel root class collided with `.entity-panel` in `shared.css` (the BaseSubPanel modal-chrome class), which forced `width: 320px`, `max-height: calc(100vh - 64px)`, `flex-shrink: 0`, and `overflow: hidden` on every migrated side panel — making them fixed-width, height-clipped, and unable to fill the app. The collision is removed; panels now use `.side-panel` alone.

## v0.190.1 — Tree no longer remounts on name save

- fix: editing a non-focal person's name in the side panel now updates that one box in place instead of remounting the entire tree (lost zoom/scroll). The chart's `useEntityData` already auto-refreshes on mutation; the redundant `@person-changed="reloadChart"` and `@relative-added="reloadChart"` event bindings on PersonsView's PersonPanel are removed. `reloadChart` (full remount) is reserved for focal-person change and context-menu add/delete.

## v0.190.0 — Entity panel foundation

- feat: panel composables refactor — useEntityData and usePagedList now bake in cross-view reactivity (left list + right panel + center view all auto-update on any mutation), new EntityPanel shell component, useEditableFields composable, centralized localStorage key registry; all 7 entity panels migrated

## v0.189.0 — German gazetteer (de-gemeinden)

- feat: new bundled gazetteer `de-gemeinden` — 16 Bundesländer → ~400 Kreise → 3052 populated places (≥ 5000 pop) from GeoNames CC BY 4.0
- chore: `DE_RULES` suffix-strip set added (Land, Bezirk, Kreis, Landkreis, Stadtkreis, Gemeinde, Stadt, Markt, Ortsteil) — user queries like "Landkreis Schwabach" now resolve to the same node as "Schwabach"
- note: boundary gazetteer (`de-gemeinden-boundaries`) deferred — Wikimedia Maps geoshape endpoint returns HTTP 403; will ship when an alternative boundary source is identified

## v0.188.0 — Swedish-language exonyms broadened

- feat: 212 new EU admin1 Swedish exonyms — "Flandern" (Flanders), "Bayern" (Bavaria), "Toscana" (Tuscany), "Katalonien" (Catalonia), "Skottland" (Scotland), "Brysselregionen" — now resolve to their admin1 region
- chore: 346 city-level Swedish exonyms ("Bryssel", "Wien", "Köpenhamn", "Florens", "Rom", …) pre-positioned in `lang-sv-geonames`. Dormant until a future plan adds city-level nodes to `world-admin1`; will activate automatically with no rebuild

## v0.187.0 — Swedish landskap as a gazetteer

- feat: new bundled gazetteer `sv-landskap` with all 25 historical Swedish provinces (Skåne, Bohuslän, Ångermanland, Lappland, …) — names that didn't fit the modern län/kommun tree now resolve to a real geographic anchor
- chore: `landskap` added to Swedish suffix-strip rules so "Skåne landskap" matches the same as "Skåne"

## v0.186.0 — Continents in the boundary gazetteer

- feat: world-boundaries now contains the 7 continents (Africa, Antarctica, Asia, Europe, North America, Oceania, South America) as siblings of countries — bare-continent inputs ("Afrika", "Europa") resolve to the continent polygon
- chore: new build script `build-world-continents-boundaries.ts` (Wikidata primary, Natural Earth fallback)

## v0.185.3 — Media filters actually filter

- fix: Type / Status / Face-tag chips in the media library now filter results — were being ignored server-side

## v0.185.2 — Skill rules: filter chips on every center view

- chore: internal only

## v0.185.1 — Avatars show your photos again

- fix: avatars and tree boxes show the linked profile photo, not just initials, when no face has been tagged
- fix: relationship rows and the duplicates list now use the same avatar as everywhere else

## v0.185.0 — Filter the media library

- feat: media library has filter chips for Type (image/document/audio/video), Status (missing on disk, orphaned), and Face tags

## v0.184.1 — Filter chips wrap instead of scrolling

- fix: filter chip rows wrap to a second line when full instead of hiding overflow behind a scroll

## v0.184.0 — Filter places by country

- feat: places filter is now country-based with live counts (Sverige 4657, USA 463, …) instead of the unhelpful place-type chips
- fix: filter chip pill no longer drifts visually between views — same look in Persons, Places, Settings

## v0.183.1 — Places list shows the resolved gazetteer path

- feat: each row in the places list now shows the gazetteer-matched path under the name

## v0.183.0 — Bug fixes + bigger test net under the build

- fix: `run_checks` MCP tool now returns the quality issues — was returning `{}` for every call
- fix: profile pictures no longer stay stuck on a loading spinner after a network/IPC hiccup
- chore: test suite grew to 2773 tests; coverage floor locked at 80% to block regressions

## v0.182.1 — Place lookup: tolerate trailing punctuation

- fix: a stray trailing `.` or `,` in a place name (e.g. `Vallsjö., Sverige`) now resolves cleanly

## v0.182.0 — Place tree picker: stage selection, OK to confirm

- feat: clicking a row stages the choice — press OK to commit, like other selection modals
- feat: inline `+ Add child` also stages instead of committing on the spot

## v0.181.1 — Place tree picker: single scrollbar

- fix: place tree picker no longer shows two scrollbars stacked on top of each other

## v0.181.0 — Place tree picker: orphan places under their gazetteer parent

- feat: orphan DB places (e.g. unparented "Solna") now appear nested under their gazetteer parent

## v0.180.0 — Place tree picker: searchable across the whole DB

- feat: filter searches the full database with infinite scroll instead of walking the loaded tree

## v0.179.2 — Place tree picker: load resilience + filter style

- fix: picker recovers with an error toast instead of getting stuck on "Loading…"
- fix: filter input now matches the styling of other entity-list filters

## v0.179.1 — Place tree picker: button inside the input

- fix: tree-picker button sits flush inside the place input, like the calendar button on date inputs

## v0.179.0 — Place tree picker

- feat: new tree-button on the place picker opens a hierarchical browser of your places + gazetteers
- feat: each tree row has expand/collapse and an inline `+ Add child` for new places under that node

## v0.178.1 — Lint cleanup

- chore: internal only

## v0.178.0 — Duplicates: infinite scroll + cleaner labels

- feat: Duplicates view shows all candidates with infinite scroll instead of capping at 100
- fix: row-action button reads "Merge" instead of "Merge Persons" (English)

## v0.177.0 — Duplicates: ignore a pair from the list

- feat: small ✕ on each Duplicates row marks the pair as ignored — won't reappear on the next scan

## v0.176.0 — Citations available while creating an event

- feat: can attach citations while creating a new event — was only available when editing

## v0.175.3 — Names: aligned date inputs

- fix: date fields in the Add/Edit Name modal now use the same date picker as the rest of the app

## v0.175.2 — Settings: drop redundant clear button

- fix: removed the duplicate ✕ next to the tree-subject picker — the picker has its own clear

## v0.175.1 — Media: missing-file count from the whole DB

- fix: Media footer's "N missing" reflects the whole library, not just the rows you've scrolled past

## v0.175.0 — Duplicates nav badge

- feat: Duplicates nav entry now shows a count badge (matches Quality and Tasks)

## v0.174.4 — Simpler horizontal nav header

- fix: horizontal nav layout collapses from two rows to one
- fix: dropped the redundant global search picker from the header — still reachable from People

## v0.174.3 — Agent tooling cleanup

- chore: internal only

## v0.174.2 — Agent tooling cleanup

- chore: internal only

## v0.174.1 — Agent tooling cleanup

- chore: internal only

## v0.174.0 — Agent tooling cleanup

- chore: internal only

## v0.173.0 — Agent tooling cleanup

- chore: internal only

## v0.172.9 — Repo settings cleanup

- chore: internal only

## v0.172.8 — Update security contact email

- fix: SECURITY.md vulnerability-disclosure address switched to the maintainer's personal email

## v0.172.7 — Agent tooling cleanup

- chore: internal only

## v0.172.6 — Imported databases load in seconds, not on quality-check delay

- fix: after a large import, Persons / Media / Places no longer mount empty while checks run
- perf: gazetteer-aware quality checks now share one load and yield to the worker

## v0.172.5 — Photos with junk format strings show their thumbnails

- fix: imported media with garbled `format` values (e.g. `KÄL`, `COM`) now show the thumbnail anyway

## v0.172.4 — Picker-created places stay on the map

- fix: picking an exact-match place suggestion now keeps its parent chain so the map can locate it

## v0.172.3 — More modal padding fixes

- fix: GEDCOM export, merge-persons confirm, and every delete-confirm now have proper edge padding

## v0.172.2 — Import/export report modal styling

- fix: import/export report modals now have proper edge padding and section spacing

## v0.172.1 — Researcher email placeholder

- fix: researcher-email placeholder renders as `name@example.com` instead of being parsed as a token

## v0.172.0 — Data fidelity: stop persisting inferred values

- policy: resolved coordinates, guessed date types, and fuzzy normalizations are never written to the DB
- fix: place picker no longer writes gazetteer-derived coordinates onto picker-created places
- fix: MCP tools no longer guess `date_type='exact'` when only a date value was given
- note: databases that picked up inferred coordinates in v0.169–v0.171 keep them until you re-edit the place

## v0.171.1 — Map place-type filter actually filters

- fix: the place-type chip bar above the map now filters map points and re-fits bounds (was dead UI)

## v0.171.0 — Place quality checks

- feat: flag places whose name looks like a date (`1736`, `1736-11-11`) — typed into the wrong field
- feat: flag broken länsbokstav notation like `Borås (PI` where `)` was typed as `I` or `|`
- feat: flag missing-comma names like `Solna Stockholm` that should be `Solna, Stockholm`
- feat: flag places used by events but with no parent and no gazetteer match — typos, addresses, occupations

## v0.170.0 — Place resolver overhaul

- feat: Swedish abbreviations `kn` / `sn` / `fs` (kommun, socken, församling) now resolve like the full word
- feat: parens around county letters (`Stockholm (A)`) and mangled forms (`Hässleholm L)`) now resolve
- feat: `Husby Rekarne` and `Husby-Rekarne` are equivalent during compare
- feat: country-name aliases (`Skottland`, `Tyskland`, `Kina`) resolve even with a restricted gazetteer config
- internal: per-gazetteer normalization rules — third-party gazetteers can now ship their own conventions

## v0.169.0 — Place picker: parent-aware autocomplete, county codes

- feat: picker reads strings right-to-left so `Hörningsholm, Mosås (T)` anchors on Örebro län (BEN #27)
- feat: every Swedish län carries its A–BD county-letter code as an alias (`Solna (B)` → Stockholms län)
- feat: accepting a hierarchical suggestion creates the matched parent chain in one step
- fix: clicking "Skapa ny ort" in an event modal no longer closes the surrounding modal (BEN #19b)
- fix: after creating a place, the "Skapa ny plats" suggestion no longer reappears on next focus (BEN #34)

## v0.168.1 — Preload signature fix

- fix: list views no longer crash with "is not a function" — preload signatures matched to v0.168.0 channels

## v0.168.0 — List filter and sort now span the whole database

- feat: filter and sort in Persons / Places / Sources / Media now operate on the whole DB
- feat: Sources view gets a filter input, sortable headers, and infinite scroll for the first time

## v0.167.0 — Tree refresh keeps zoom and scroll

- feat: editing events no longer resets your place in the tree — zoom and scroll position stick (BEN #37)

## v0.166.1

- fix: centre segment of the fan chart no longer links to a wrong ancestor (the proband has no page)
- fix: fan-chart hover uses the standard browser tooltip instead of a bespoke floating panel

## v0.166.0 — Reports: researcher info, page numbers, richer citations, GEDCOM SUBM fix

- feat: researcher info (name, address, phone, email) configurable from Settings → "Forskarinformation"
- feat: keepsake reports now show researcher header / footer and "X / Y" page numbers in the printed PDF
- feat: GEDCOM export's SUBM record writes the researcher's name + contact details
- feat: citation appendix in keepsake reports now shows publication, repository, URL, and per-source pages

## v0.165.0 — Names: displayed name follows latest name change date

- feat: displayed name follows the latest "valid from" date instead of a manually starred entry
- feat: names list shows a "Datum (giltig från)" column with date-descending sort + tie-break reorder
- feat: adding a Vigselnamn or Namnändring pre-fills the current name so only changes need editing
- feat: renamed "Gift namn" → "Vigselnamn"; name-type picker now sorts alphabetically

## v0.164.0 — Gazetteer placement diagnostics

- feat: map popup and PlacePanel show which gazetteer resolved a place + match quality
- chore: internal — diagnostic script and skill for auditing place-resolution outliers

## v0.163.1 — Commit skill compatibility

- chore: internal only

## v0.163.0 — Events: sort order setting + date ranges for span events

- feat: Defaults toggle for event-type picker — alphabetical (default) or life-arc order
- feat: residence, education, occupation, military, and travel events accept an optional end date
- feat(events): added "Resa" / Travel as a first-class event type
- feat(events): event lists and reports render "start – end" for span events with an end date set

## v0.162.7 — Reactivity: panels and tree refresh on mutation

- fix: section count badges in PersonPanel update immediately after adding/editing/deleting an event
- fix: family tree re-renders after editing the focal person's events, names, or relationships
- fix: PersonPanel timeline and map re-fetch automatically when same-person events change

## v0.162.6 — Ben feedback round: labels, event-type cleanup, About menu

- fix: event-modal labels tightened — Källa, Dödsorsak on death, "Övriga händelser" dropdown
- fix: media panel notes section retitled "Bildtext"
- fix: "Dop" no longer appears twice — baptism/christening collapsed to one type with auto migration
- fix: adding a new event no longer pre-selects a type when smart defaults are off
- fix: editing an event warns if you change its type — registration data may be inconsistent
- fix: production launch no longer auto-opens DevTools
- feat: Help → About OurLegacy shows the live version with a GitHub link

## v0.162.5 — Polymorphic link helpers

- refactor(api): consolidate "get linked entities" SQL queries into 2 helpers — internal only

## v0.162.4 — Website export

- fix: static site no longer ships broken-image entries for media whose source files are missing

## v0.162.3 — Stale-load race fix

- fix(panels): rapidly switching between entities no longer leaves a panel showing stale data
- fix: exported static sites opened over `file://` no longer flood the console with CORS / map errors

## v0.162.2 — Website export polish

- fix(website-export): media list footer reads "Mediaregistret" instead of mislabeled "Personregistret"
- fix(website-export): preview-iframe media truncation now explained where the truncation happens

## v0.162.1 — Preload regression fix

- fix(build): startup OOM caused by preload bundle pulling in the full api layer

## v0.162.0 — IPC channel registry

- chore: internal only

## v0.161.0 — Live preview iframe

- feat: export view renders the actual static site in an iframe with inlined photo thumbnails

## v0.160.0 — Component inspector

- feat(dev): hold-Alt component & i18n inspector for describing UI to Claude (dev mode only)

## v0.159.0 — Auto-refresh export preview

- feat: website-export right panel is a flat list of collapsible sections with live preview auto-refresh

## v0.158.7 — Last-route restore

- fix: reload restores the last route instead of always landing on Persons

## v0.158.6 — Place resolver

- fix(gazetteers): "California, USA" resolves to the state, not a tiny CDP of the same name

## v0.158.5 — Panel collapse-tab alignment

- fix(panels): every panel and list column reserves the same slot for its `▶`/`◀` collapse tab

## v0.158.4 — Media list infinite scroll

- fix(media): left list column infinite-scrolls on its own instead of bottoming out at the gallery's page size

## v0.158.3 — Media gallery aspect

- fix(media): gallery cards use a portrait 1:1.35 thumbnail that scales with column width

## v0.158.2 — Media gallery face crop

- fix(media): gallery cards bias the photo crop toward the top so faces stay visible

## v0.158.1 — Selected card scroll-into-view

- fix(media): selecting a media item scrolls both the list and the gallery so it stays visible

## v0.158.0 — Collapsible side panels everywhere

- feat(panels): every right-side panel gains a `▶` collapse tab on its left edge (was: PersonPanel only)
- feat(panels): PlacesView gets the matching `◀` reopen button it was missing
- feat(panels): Reports/Prints panels can now fully collapse

## v0.157.10 — Permanent media list

- feat: MediaView always shows a left-side list column alongside the gallery (with collapse + resize)
- fix(media): search filter moves into the list column; right MediaPanel is now collapsible

## v0.157.9 — Top-bar search picker

- fix(nav): horizontal top-bar search uses the same PersonPicker typeahead as the sidebar

## v0.157.8 — Tree subject vs. selected person

- feat: rename "focus person" to "tree subject" — clicking a person opens their panel without re-rooting
- feat: "🌳 Set as tree subject" is the only action that changes the chart's root

## v0.157.7 — Square avatars, face-cropped tree photos

- feat(avatars): every profile picture is a rounded square matching the tree-box style
- feat: tree boxes show the same face-cropped photo as avatars; untagged falls through to sex-colored initials

## v0.157.6 — Consistent face-tag styling

- refactor(media): face-tag boxes look identical in the viewer and in reports

## v0.157.5 — Panel close button alignment

- fix(panels): the × in PersonPanel and MediaPanel now lines up with the panel title

## v0.157.4 — Consistent panel close buttons

- fix(panels): every side panel shares one close-button style anchored top-right
- fix(persons): "🌳 Show in tree" moves to the dates row in PersonPanel
- fix(media): MediaPanel renames the open-viewer button to "View" and moves it to the format row

## v0.157.3 — Sidebar PersonPicker

- feat: sidebar search now opens a person's panel without re-rooting the tree
- fix(nav): remove the "Fokusperson" label above the sidebar

## v0.157.2 — Restore separate selected vs. focal person

- fix: clicking in the tree opens the panel; only "🌳 Show in tree" refocuses the chart

## v0.157.1 — Sex-typed child placeholders

- fix: "+ Barn" outline split into "+ Son" and "+ Dotter" — clicking either pre-fills sex

## v0.157.0 — Modal context in headings

- feat: modal headings state who or what you're working on (e.g. "Birth of John Doe")

## v0.156.5 — Report panel slider caps

- fix(reports): Hourglass and Descendant generations sliders go up to 20, matching the tree view's `+` button

## v0.156.4 — Draw face tag opens viewer

- fix: clicking "Draw" on Face Tags opens the media viewer so the box can be drawn immediately
- fix(media): Face Tags section moves directly after Linked Persons

## v0.156.3 — Consolidated avatars

- fix: profile pictures everywhere update automatically when face tags or media order change

## v0.156.2 — Drop the stored "living" flag

- fix: living/deceased is now derived from events — the Living/Deceased toggle is removed
- **breaking**: Genney persons marked deceased without a death event now appear as living after import

## v0.156.1 — Click-to-refocus tree

- fix: clicking a person in the tree refocuses the chart and opens the panel — all in one click

## v0.156.0 — Drop chart hover tooltip

- fix: removed the floating hover tooltip from the tree charts — names are already legible inside boxes

## v0.155.4 — Marriage events: pick second person

- feat: marriage / wedding / engagement / divorce events from a person panel offer a partner picker

## v0.155.3 — Birth events: optional baptism

- feat: birth events include optional Dopdatum + Faddrar — a baptism event is created when filled

## v0.155.2 — Add child: pick the other parent

- feat: adding a child shows an "Other parent" picker (auto-selected if there's one partner)

## v0.155.1 — Partner sex defaults to opposite

- feat: adding a partner from a tree view defaults sex to the opposite of the focused person

## v0.155.0 — PersonModal no longer creates events

- feat: "Create new person" is separated from event creation — events are added afterwards

## v0.154.5 — Reorder add-person fields

- feat(persons): new-person form is now Sex → Living → Relationship type → Name

## v0.154.4 — Preferred name underline in trees

- feat(charts): preferred-name marker is visible in all three tree views, matching lists and panels

## v0.154.3 — Parent/child labelled relationship pickers

- feat(relationships): RelationshipModal labels its pickers as Parent / Child for `parent_child` type
- fix(relationships): saving validates both pickers are filled and different — was silently saving nulls

## v0.154.2 — Auto-focus child name input

- fix(persons): clicking a son/dotter/unknown button auto-focuses the given-name input

## v0.154.1 — Add child: pick sex up front

- feat(persons): "Add child" opens a son/dotter/unknown picker before the person form
- feat(persons): "New / Existing person" toggle visible from the first frame in every "add related" flow

## v0.154.0 — Hide redundant parent placeholders

- feat: father/mother outline placeholders are hidden when a real parent of that sex already exists

## v0.153.1 — Cancel actually closes Add Related modals

- fix(modals): the cancel button and click-outside on Add father / mother / spouse / child now close the modal

## v0.153.0 — Swedish couple-subtype rename

- fix(i18n): "Äktenskap" → "Gift" in Swedish

## v0.152.4 — Theme-aware quality chips

- fix: quality chips use the same theme-aware colors as modal headers; new Media color (rose)

## v0.152.3 — Notes monospace toggle

- fix(panels): notes monospace toggle ("iWi") only swaps font-family — no more bulging above the heading

## v0.152.2 — Wider event/citation modals

- fix(modals): event and citation modals open at 480px and can be resized below the content height

## v0.152.1 — Two-phase citation modal

- feat: CitationModal opens on "Choose a source" when no source is preset, then shows it as a card

## v0.152.0 — Single-field date input

- feat: DateInput is one monospace YYYY-MM-DD field with the calendar icon inside; partial dates still work

## v0.151.3 — Accessible delete buttons

- fix: every row-level delete/unlink button announces what's about to be removed to screen readers

## v0.151.2 — Unified input styling

- fix: all inputs across modals and panels share one resting/focus look

## v0.151.1 — High-contrast count chips

- fix: sidebar chips, soft buttons, and citation links now meet AA contrast in dark and high-contrast modes

## v0.151.0 — Cleaner empty states

- fix: empty-state placeholders drop the duplicate "+ X" button — the section header is the entry point

## v0.150.4 — Print-safe chart reports

- fix: chart report previews hide zoom controls and stop picking up dark/high-contrast surface colors
- fix: long person names in the timeline report no longer clip at the SVG's left edge

## v0.150.3 — Narration coverage

- feat(a11y): Source / Group / Media pickers, modal headers, and the MediaViewer narrate to screen readers
- feat(a11y): face tag regions are keyboard-focusable

## v0.150.2 — Theme-aware entity colors

- feat: per-entity colors flip with appearance and theme; entity color regressions fail CI

## v0.150.1 — Side-panel table polish

- fix(panels): hide column headers on side-panel tables (avatar + name link is self-evident)
- fix(panels): drop fixed table layout that was squashing identifier / relationship / media / task tables

## v0.150.0 — Unified panel shell

- chore: all 8 entity side panels share one shell with consistent header padding and close buttons
- fix(panels): PersonPanel and MediaPanel gain a close button they were missing
- fix(panels): MediaPanel and ReportPanel persist section state across reloads

## v0.149.0 — Multi-entity tasks and groups

- feat: research tasks and groups can now link to multiple persons, places, and media items

## v0.148.0 — Nav rename

- feat(nav): "Research Tasks" → "Tasks" / "Uppgifter"
- feat(reports): "Framable prints" → "Charts" / "Diagram"

## v0.147.x — Static export polish

- feat: Person/Place/Media side panels are back in the static export (read-only — no edit affordances)
- fix(website-export): static site shows charts, maps, and media; CartoDB Voyager tiles work over `file://`
- fix(website-export): gazetteer-resolved coordinates baked into the snapshot so places appear on the map
- feat: privacy option to drop media only attached to events / places / sources / relationships
- fix(charts): zoom controls and click-to-select work in readonly mode (navigation, not editing)
- fix(map): backdrop uses the surface color, no surrounding border
- feat(media): viewer previews the report-style caption ("From left: …" + notes) under the picture

## v0.146.0 — App-look website export

- feat: export produces a read-only SPA that visually matches the app — same sidebar, layout, minus editing
- feat(website-export): focus-person + N ancestor / M descendant scope filter
- feat(website-export): living-person privacy controls (exclude or redact to decade)
- feat(website-export): pre-rendered keepsake reports and frameable chart prints in the bundle
- fix(website-export): no longer locks up on libraries with thousands of media files

## v0.145.0 — Universal side panels

- feat: every entity-list view (persons, relationships, sources, places, groups, tasks) gets a side panel
- feat(panels): new SourcePanel, RelationshipPanel, GroupPanel, ResearchTaskPanel
- feat(routing): `:id` routes navigate to the list view with the panel pre-selected
- chore: removed all DetailView components — editing happens through modals from inside panels

## v0.144.0 — Split Present nav

- feat(nav): Present section now has Reports (keepsake), Framable prints, and Website as separate items
- chore: HTML site export removed from Import / Export tabs

## v0.143.0 — Universal entity-panel modals

- feat(modals): every modal uses BaseSubPanel with `mode='standalone'|'subpanel'`
- feat(modals): new LinkRuleModal, PersonIdentifierModal; add-related-person folded into PersonModal
- feat(citations): CitationModal supports inline source picking when no source is preset

## v0.142.x — Modal redesign and panel polish

- feat: unified Person / Event / Citation / Source modals replace the older split add-and-edit forms
- fix(panels): PlacePanel no longer reloads when switching list↔map
- fix(modals): standalone BaseSubPanel simplified; dropdowns capped at 5 results

## v0.141.x — Nav and focal defaults

- feat(nav): Sources and Relationships moved to Review, Reports moved to Present
- fix: visualization focal person uses `default_person_id` instead of always falling back to first
- fix(modals): AddResearchTaskModal shows PersonPicker when opened without a pre-passed personId
- fix(charts): descendant and hourglass connectors share one horizontal segment height per generation
- fix(media): empty state gains an "Attach media" action button

## v0.141.0 — Independent fan chart settings

- feat: Your Ancestors gets a Fan Chart section with independent arc span, color, and generation limit
- feat: ancestor pages go up to 10 generations independently of the embedded fan chart

## v0.140.0 — Empty states + chart outline fixes

- feat(ui): two-tier empty state system — `SectionEmpty` for in-section, `AppEmptyState` for full-view
- fix(charts): pedigree and descendant placeholder children no longer affect real-node placement
- fix(map): always renders the map; "no places" / "no matches" become floating pill overlays
- fix(modals): titles read "Add [Entity]"
- fix(i18n): standardised Swedish "plats", "Hänvisning" for citations, "Forskningsuppgift" for tasks
- fix(quality): checks defer 1500ms after navigation to avoid contention with main data load

## v0.139.0 — Multilingual historical gazetteer

- feat: historical place names in any language ("Sovjetunionen", "Sowjetunion", etc.) now resolve correctly

## v0.138.0 — Your Ancestors photos

- feat: Photos checkbox in Your Ancestors renders per-ancestor photo pages (was silently ignored)
- feat(reports): Captions and Photo Notes checkboxes added

## v0.137.x — Report and print fixes

- fix(reports): anchor links no longer trigger Vue Router warnings
- feat(reports): fan chart segments scroll to matching ancestor section on click
- fix(reports): map previews are static (no pan/zoom)
- fix(print): chart colors now appear when printing
- feat(reports): ReportPanel replaces ChartExportControls; ReportsView is panel + preview with drag handle
- fix(reports): keepsake PDF right margin no longer cropped
- fix(reports): framable prints tab labels match visualization chart names

## v0.136.5 — Timeline chart improvements

- fix(timeline): tick labels below axis with mirrored top axis above
- fix(timeline): today label and event markers no longer clip
- fix(timeline): per-event marker tooltips
- fix(timeline): tooltip width adapts to long names; height grows with event count
- fix(timeline): birth/death year labels inline with symbol

## v0.136.x — Build, install, CI

- fix(build): downgrade `@electron/fuses` to satisfy Forge peer dep
- fix(make): comment out Linux RPM/DEB makers (incompatible with rpmbuild on Debian trixie)
- fix(ci): e2e smoke timeout 30s → 90s
- feat(mcp): `search_persons` gains optional `limit` parameter (1–200, default 20)

## v0.135.x — Devcontainer and release workflow

- fix(devcontainer): `xvfb-start.sh` exports `DISPLAY=:99` so `source` works
- fix(devcontainer): postCreateCommand chowns `~/.claude` for named-volume permissions
- fix(ci): claude.yml uses `claude_code_oauth_token` for Claude Max compatibility
- fix(ci): release workflow compares against the last git tag instead of `HEAD~1`
- feat(reports): ReportsView uses the standard paneled layout with drag-resize ReportPanel

## v0.132.0 — Cropped face-tag profile pictures

- feat: every avatar shows a person's starred face tag as a cropped square (rendered live, no extra storage)
- feat(avatars): live updates when tags are starred, reassigned, reordered, or unlinked

## v0.131.0 — Keepsake reports redesign

Reports view rebuilt around family-facing keepsake narratives.

- feat(reports): **A Life** — life map, visual timeline, family, events, notes, photos, sources appendix
- feat(reports): **A Marriage** — dual life map, shared timeline, couple, children grid, narrative, photos
- feat(reports): **Place Chronicle** — boundary map, persons, events, description, photos, child places
- feat(reports): **Your Ancestors** — fan chart cover, full-page fan, per-ancestor pages, surname index
- feat(reports): **Life on One Page** — single framable sheet
- feat(reports): **Family in Year X** — snapshot of everyone alive in a target year
- feat(reports): **Photo Album** — chronological media gallery (person / couple / place / all)
- chore: removed Individual Summary, Family Group Sheet, tabular Ancestor Sheet (replaced by the new reports)
- feat: new `researcher_name` setting for "Compiled by …" attribution
- feat: identifiers always hidden for living persons; per-report toggle redacts birth year to decade
