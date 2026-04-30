---
name: gedcom
description: Parse, validate, import/export GEDCOM files (5.5.1 and 7.0). Use for .ged files, genealogy data interchange, or GEDCOM compliance.
---

# GEDCOM

## ⚠️ Prime Directive: Import What's in the File, Nothing More

GEDCOM imports are a write path — they bring data into the database from the source file. Per the data-fidelity prime directive in `CLAUDE.md`, the importer must:

- **Preserve verbatim what the source file contains.** `MAP > LATI/LONG` sub-tags get persisted to `places.latitude`/`longitude` because the file already had those coordinates — they came with the file the user imported. That's authored data being preserved.
- **NEVER fill in fields the source did not contain.** Don't infer `date_type='exact'` because a `DATE` line had a parseable string. Don't auto-resolve `PLAC "Stockholm"` to coordinates via a gazetteer and persist them — let the resolver compute coords at view time.
- **NEVER fix obvious errors silently.** A typo in the source GEDCOM stays as a typo. The user can clean their data after import; the importer's job is fidelity, not correction.

Export has the mirror obligation: round-trip what the database stores, with explicit `excluded[]` reporting for entities GEDCOM 5.5.1 cannot represent. Don't synthesize plausible-looking values to "complete" the export.

This rule is non-negotiable. Past violations corrupted real databases.

GEDCOM (Genealogical Data Communication) is the de facto standard for exchanging family tree data between genealogy applications.

## Versions

- **GEDCOM 5.5.1** (1999, updated 2019) — dominant format; supported by virtually all genealogy software including Ancestry, FamilySearch, MyHeritage, Gramps
- **GEDCOM 7.0** (2021, FamilySearch) — modern redesign; structured dates, Unicode-first, extensible; growing adoption
- **GEDCOM-X** — JSON/XML format from FamilySearch; their API uses it; rarely used as a file format

Target 5.5.1 for maximum compatibility.

## File structure

```
0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Lars /Eriksson/
1 SEX M
1 BIRT
2 DATE 15 MAR 1842
2 PLAC Björkvik, Rönö härad, Södermanland
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 14 JUN 1869
0 TRLR
```

**Line format:** `LEVEL [XREF_ID] TAG [VALUE]`

- Level 0 records: `HEAD`, `INDI`, `FAM`, `SOUR`, `REPO`, `NOTE`, `OBJE`, `SUBM`, `TRLR`
- Level 1+ are sub-records of their parent

## App data model mapping

This app uses a GEDCOM-X-inspired model. Here is how GEDCOM 5.5.1 maps to it:

### What maps cleanly

| GEDCOM 5.5.1 | App entity | Notes |
|---|---|---|
| `INDI` | `persons` | Direct |
| `INDI.SEX` | `persons.sex` | M/F/U |
| `INDI.NAME` | `person_names` | Parse `Given /Surname/` format |
| `INDI.NAME.NPFX` | `person_names.name_prefix` | Requires v0.3.1 schema |
| `INDI.NAME.NSFX` | `person_names.name_suffix` | Requires v0.3.1 schema |
| `INDI.REFN` | `person_identifiers` (type=`refn`) | Requires v0.3.1 schema |
| `INDI.RIN` | `person_identifiers` (type=`rin`) | Requires v0.3.1 schema |
| `INDI.BIRT/DEAT/CHR/BURI/OCCU/RESI/...` | `events` + `event_participants` (role=`primary`) | |
| `FAM` | `relationships` (type=`couple`) | HUSB=person1, WIFE=person2 |
| `FAM.CHIL` | `relationships` (type=`parent_child`) | One per parent |
| `FAM.MARR/DIV/CENS/...` | `events` linked via `relationship_id` | |
| `PLAC` | `places` via `findOrCreatePlace(name)` | Hierarchical string stored as-is |
| `SOUR` (level 0) | `sources` | title/author/publication_info |
| `SOUR` (inline citation) | `citations` | QUAY→confidence, PAGE→page, DATA.TEXT→transcription |
| `DATE` | `events.date_type` + `date_value` + `date_original` | See date table below |
| `NOTE` | `persons.notes`, `events.description` | Concatenate CONT/CONC lines |

### What is dropped (not in app model)

| GEDCOM tag | Reason |
|---|---|
| `REPO` record | Repository is just a text field on `sources.repository` |
| `SUBM` record | No submitter concept in app |
| `OBJE` / multimedia | No media attachments (planned v0.6.0) |
| `ASSO` associations | No general association concept |
| `ALIA` | No identity alias linking |
| LDS ordinances (`BAPL`, `SLGC`, `CONL`, `ENDL`, `SLGS`) | Not relevant for Swedish genealogy |
| `ANCI`/`DESI` | Researcher flags — no equivalent |
| `AFN`/`RFN` | Rarely used in Swedish trees |
| `_` prefixed custom tags | Reported in `skipped` (never silently dropped — see data integrity rule) |

## GEDCOM-X vs GEDCOM 5.5.1 gaps (what the app model doesn't cover)

From the GEDCOM-X spec, these are gaps in the current data model beyond what v0.3.1 adds:

**Critical for future import quality:**
- `Agent` entity — contributor/researcher tracking; used for `SUBM` and source attribution
- `Document` entity — transcription/analysis documents; no equivalent in app
- 26+ additional event types (AdultChristening, BarMitzvah, Cremation, Funeral, Annulment, Engagement, etc.)
- 83 person fact types (Religion, Nationality, Physical description, National ID, Multiple birth, etc.)
- Multi-language place names (GEDCOM-X `PlaceDescription.names` list)
- Place identifiers (GeoNames ID, Wikidata Q-numbers)

**Lower priority:**
- Name qualifiers beyond patronymic/particle (Middle, Familiar, Religious, Geographic, Occupational, etc.)
- Multiple name forms with script/language variants (for non-Latin names)
- Source rights, coverage, media type, publisher/mediator agents
- Date precision beyond current model (time of day, timezones, recurring dates, durations)
- Attribution on individual data elements (who added which name variant)

## Date format

### GEDCOM 5.5.1 → app model

| GEDCOM date string | date_type | date_value | date_value_end |
|---|---|---|---|
| `12 JUN 1845` | `exact` | `1845-06-12` | null |
| `JUN 1845` | `exact` | `1845-06` | null |
| `1845` | `exact` | `1845` | null |
| `ABT 1845` / `CAL 1845` / `EST 1845` | `about` | `1845` | null |
| `BEF 1850` | `before` | `1850` | null |
| `AFT 1840` | `after` | `1840` | null |
| `BET 1840 AND 1850` | `between` | `1840` | `1850` |
| `FROM 1840 TO 1850` | `between` | `1840` | `1850` |
| Any other string | `unknown` | null | null |

Always preserve the original GEDCOM date string in `date_original`.

### App model → GEDCOM 5.5.1

Use `date_original` if set (preserves the original format). Otherwise reconstruct from `date_type` + `date_value`.

## PLAC (place) handling

GEDCOM 5.5.1 PLAC is a free-text comma-separated hierarchy: `"Björkvik, Rönö härad, Södermanland, Sverige"`.

**On import:** Call `findOrCreatePlace(name)` for the full string. The hierarchy is preserved in the `name` field as-is. Parsing and linking hierarchy levels is optional post-processing.

**On export:** Use `place.name` directly as the PLAC value.

## ADDR (address) handling

GEDCOM 5.5.1 has no `ADDR` directly on `PLAC` tags. The `ADDR` structure appears on the containing event (e.g. `RESI`):

```
1 RESI
  2 PLAC Tvärgatan 5, Växjö, Sverige
  2 ADDR Tvärgatan 5
    3 ADR1 Tvärgatan 5
    3 CITY Växjö
    3 POST 35243
    3 CTRY Sverige
```

**On import:** When a `RESI` (or other event) has both `PLAC` and `ADDR`, populate the address columns on the corresponding place record from `ADR1` → `street`, `CITY` → `city`, `POST` → `postal_code`, `CTRY` → `country`. Use `updatePlace(db, place.id, { street, city, postal_code, country })`.

**On export:** If a place has `street` set, emit `ADDR`/`ADR1`/`CITY`/`POST`/`CTRY` below the event's `PLAC` tag.

## NAME format

GEDCOM NAME format: `Given /Surname/ Suffix` or just `Given /Surname/`

**On import:**
```typescript
const match = raw.match(/^(.*?)\/(.+?)\/(.*)?$/);
const given = match?.[1]?.trim() || null;
const surname = match?.[2]?.trim() || null;
```

**On export:**
```
1 NAME Lars /Eriksson/
2 NPFX von           ← if name_prefix set
2 NSFX Jr.           ← if name_suffix set
```

## Essential tags by record type

### Individual (INDI)
| Tag | Meaning |
|-----|---------|
| `NAME` | Full name; surname in slashes: `Lars /Eriksson/` |
| `SEX` | M, F, U |
| `BIRT` | Birth event |
| `DEAT` | Death event |
| `BURI` | Burial |
| `CHR` / `BAPM` | Christening / Baptism |
| `CONF` | Confirmation |
| `OCCU` | Occupation |
| `RESI` | Residence |
| `EMIG` / `IMMI` | Emigration / Immigration |
| `NATU` | Naturalization |
| `CENS` | Census |
| `EDUC` | Education |
| `GRAD` | Graduation |
| `RETI` | Retirement |
| `PROB` / `WILL` | Probate / Will |
| `NOTE` | Free-text note |
| `SOUR` | Source citation |
| `REFN` | Reference number (external ID) |
| `RIN` | Record ID number |
| `FAMC` | Family as child (pointer to FAM) |
| `FAMS` | Family as spouse (pointer to FAM) |

### Family (FAM)
| Tag | Meaning |
|-----|---------|
| `HUSB` | Pointer to husband INDI |
| `WIFE` | Pointer to wife INDI |
| `CHIL` | Pointer to child INDI (repeat for each child) |
| `MARR` | Marriage event |
| `DIV` | Divorce event |
| `CENS` | Census (family) |

### Events (sub-records of INDI or FAM)
| Tag | Meaning |
|-----|---------|
| `DATE` | Event date |
| `PLAC` | Place (comma-separated hierarchy) |
| `NOTE` | Note about this event |
| `SOUR` | Source citation for this event |

### Source citation (SOUR sub-record)
```
1 SOUR @S1@
2 PAGE p. 42
2 DATA
3 TEXT verbatim text from source
2 QUAY 2
```
`QUAY` = 0 (unreliable) to 3 (direct primary evidence) — maps directly to `citations.confidence`.

### Source record (SOUR at level 0)
```
0 @S1@ SOUR
1 TITL 1880 Swedish Church Records
1 AUTH Riksarkivet
1 PUBL Stockholm
1 REPO @R1@
```

### Swedish church archive reference patterns

Swedish GEDCOM files (especially from Genney/ArkivDigital) use a structured source title format:

```
Parish (CountyCode) Series:Volume (YearRange)
```

Examples: `Skepperstad (F) C:8 (1921-1952)`, `Hultsjö (F) AIIa:4 (1914-1951)`

**Archive series codes:**
| Code | Record Type |
|------|------------|
| AI | Husförhörslängder (household examination) |
| AII | Församlingsböcker (parish books, post-1894) |
| AIIa | Parish records variant |
| B/BI | In/ut-flyttningslängder (migration records) |
| C | Födelse/dopböcker (birth/christening) |
| E | Lysning/vigselböcker (marriage) |
| F | Död/begravningsböcker (death/burial) |

**Linkable identifiers in citation notes:**
- `AID: v170308.b530.s44` → ArkivDigital deep link: `https://app.arkivdigital.se/volume/v170308?image=530`
- `NAD: SE/VALA/00333` → Riksarkivet archive reference

**REPO records** map to link targets: `ArkivDigital` → `app.arkivdigital.se`, `Riksarkivet` → `sok.riksarkivet.se`, `Sveriges släktforskarförbund` → `genealogi.se` (Dödboken, Sveriges Befolkning).

The source linker (`src/api/source-linker.ts`) auto-detects these patterns and renders inline links. See `src/api/link-rules/sv.ts` for the regex rules.

## GEDCOM 7.0 key differences

- UTF-8 mandatory (no ANSEL/ASCII)
- Structured dates with calendar systems (Gregorian, Julian, Hebrew, French Republican)
- `SNOTE` (shared note reference)
- `INDI.NO` (negative assertion — "this person had no children")
- Extension mechanism via `SCHMA` tag (custom tags without `_` prefix)
- Removes `CONC` line concatenation
- Typed relationships (GEDCOM 7.0 uses enumerated `PEDI` values for parent-child)

## Parsing GEDCOM

A minimal line-by-line parser:

1. Split each line: `LEVEL [XREF] TAG [VALUE]`
2. Maintain a stack to track the current record hierarchy
3. When level drops, pop the stack
4. Accumulate CONT lines into the previous value (with `\n`)
5. CONC (removed in 7.0) concatenates without newline — handle for compatibility

**TypeScript libraries for this project:**
- `read-gedcom` — browser and Node.js compatible, parses to a queryable tree
- `gedcom-stream` — streaming parser, good for large files (100MB+)

## Data integrity rule

**Data must never be silently lost during import or export.** This is fundamental to user trust.

Every piece of data that is dropped, skipped, remapped, or excluded must be reported to the user with:
1. **What** was dropped (tag name or entity type)
2. **How many** records/occurrences
3. **Why** (no app concept, redundant with standard tag, model limitation, etc.)

Use the `ImportReport` fields for import, and a pre-export warning for export:
- `skipped: { tag, count }[]` — unrecognised INDI/FAM tags (tag name + count, always shown)
- `unmappedData: { category, count }[]` — known-unsupported record types with human-readable explanation
- `warnings: string[]` — data that was transformed/remapped rather than dropped straight (e.g. "6573 REMA remarks imported as person notes")

**On export:** if any DB entities cannot be represented in GEDCOM (e.g. Research Tasks, Groups), the export function must return a summary of what was excluded and why, so the UI can show it to the user.

**Never use `unmappedData`/`warnings` for import and then omit the equivalent for export.** Both directions must be transparent.

### What counts as "reported"

| Situation | Required |
|-----------|----------|
| Tag appears in file but has no DB mapping | `skipped` entry with tag + count |
| Known record type with no app concept (REPO, SUBM) | `unmappedData` entry with description |
| Data remapped/converted (e.g. TRAN → aka name) | `warnings` entry explaining conversion |
| DB entity type that cannot be exported to GEDCOM | Export summary entry with count + reason |
| Data actively handled but user may not expect it | `warnings` entry (e.g. REMA imported as notes) |

### What is NOT required

- Field-level losses where the standard itself has no concept (e.g. no GEDCOM 5.5.1 tag for `persons.living`) — document in SKILL.md "What is dropped" table instead
- Entirely empty tables (no records to export)

## Export checklist

- [ ] `0 HEAD` with `1 GEDC` + `2 VERS 5.5.1` + `1 CHAR UTF-8`
- [ ] Valid XREF IDs (`@I1@`, `@F1@`, `@S1@`, etc.)
- [ ] `0 TRLR` at end
- [ ] Standard date format (preserve `date_original` if set)
- [ ] `HUSB`/`WIFE` in FAM → `FAMS` back-references on INDI (optional but standard)
- [ ] `CHIL` in FAM → `FAMC` back-references on INDI (optional but standard)
- [ ] Return export summary listing any DB tables/fields that were excluded from the output

## Import checklist

- [ ] Parse all level-0 record types: INDI, FAM, SOUR (skip REPO, SUBM, OBJE)
- [ ] Resolve XREF pointers (`@I1@`, `@F1@`, etc.) using a map
- [ ] Handle NAME tag: parse `Given /Surname/` + NPFX + NSFX
- [ ] Parse all date formats (exact, ABT, BEF, AFT, BET AND, FROM TO)
- [ ] Call `findOrCreatePlace(name)` for all PLAC values
- [ ] Preserve original date string in `date_original`
- [ ] Concatenate CONT lines with `\n`
- [ ] Process in order: SOUR → INDI → FAM (to resolve forward references)
- [ ] Each FAM.CHIL creates two parent_child relationships (one per parent, if both present)
- [ ] All skipped/remapped data reported per data integrity rule above

## Common pitfalls

- **Name format:** Some apps export `Given /Surname/ Suffix`; others omit the slashes. Handle gracefully.
- **Unknown parents:** A FAM may have only WIFE or only HUSB, or neither. Still create the couple relationship.
- **Non-standard tags:** Apps use `_MILI`, `_FSID`, etc. Don't crash — report in `skipped`, never drop silently.
- **Encoding:** Older files may use ANSEL. Detect from `HEAD.CHAR` tag.
- **Large files:** Some GEDCOM files are 100MB+. Stream-parse; don't load into memory.
- **CONT at level 2+:** CONT applies to the immediately preceding sibling at the same depth, not just level-1 values.
- **Empty PLAC values:** Many apps export `2 PLAC` with no value. Skip these; don't call `findOrCreatePlace('')`.
