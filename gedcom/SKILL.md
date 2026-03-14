---
name: gedcom
description: Parse, explain, validate, and work with GEDCOM files — the standard format for exchanging genealogical data between applications. Use this skill whenever the user wants to read or understand a GEDCOM file, design a data model compatible with GEDCOM import/export, check GEDCOM compliance, convert GEDCOM data to another format, or understand what tags and structures a genealogy app must support to be interoperable. Trigger when the user mentions GEDCOM, .ged files, family tree import/export, genealogy data standards, or asks how to make their app compatible with other genealogy tools.
---

# GEDCOM

GEDCOM (Genealogical Data Communication) is the de facto standard for exchanging family tree data between genealogy applications. Understanding it is essential for building any genealogy app that isn't a walled garden.

## Current versions

- **GEDCOM 5.5.1** (1999, updated 2019) — the dominant format in use today. Supported by virtually all genealogy software.
- **GEDCOM 7.0** (2021, maintained by FamilySearch) — modern redesign with Unicode support, structured dates, and extensibility. Growing adoption.
- **GEDCOM-X** — an alternative XML/JSON format from FamilySearch; used by their API but rarely as a file format.

When in doubt, target 5.5.1 for maximum compatibility. Support 7.0 if building for a forward-looking audience.

## File structure

GEDCOM files are plain text, line-based:

```
0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 12 JUN 1845
2 PLAC Boston, Suffolk, Massachusetts, USA
1 DEAT
2 DATE ABT 1910
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 14 FEB 1870
0 TRLR
```

**Line format:** `LEVEL [XREF_ID] TAG [VALUE]`

- **Level 0** records: HEAD, INDI (individual), FAM (family), SOUR (source), REPO (repository), NOTE, OBJE (media), SUBM (submitter), TRLR (trailer)
- **Level 1+** are sub-records of their parent

## Essential tags to support

### Individual (INDI)
| Tag | Meaning |
|-----|---------|
| NAME | Full name; surname in slashes: `John /Smith/` |
| SEX | M, F, U |
| BIRT | Birth event |
| DEAT | Death event |
| BURI | Burial |
| CHR | Christening |
| OCCU | Occupation |
| RESI | Residence |
| NOTE | Free-text note |
| SOUR | Source citation |
| OBJE | Media link |
| FAMC | Family as child (pointer to FAM) |
| FAMS | Family as spouse (pointer to FAM) |

### Family (FAM)
| Tag | Meaning |
|-----|---------|
| HUSB | Pointer to husband INDI |
| WIFE | Pointer to wife INDI |
| CHIL | Pointer to child INDI (repeat for each child) |
| MARR | Marriage event |
| DIV | Divorce event |

### Events (sub-records of INDI or FAM)
| Tag | Meaning |
|-----|---------|
| DATE | Event date |
| PLAC | Place |
| NOTE | Note about this event |
| SOUR | Source citation for this event |

### Source citation (SOUR sub-record)
```
1 SOUR @S1@
2 PAGE p. 42
2 DATA
3 TEXT verbatim text from source
2 QUAY 2
```
`QUAY` = quality assessment: 0 (unreliable) to 3 (direct primary evidence).

### Source record (SOUR at level 0)
```
0 @S1@ SOUR
1 TITL 1880 United States Federal Census
1 AUTH Ancestry.com
1 PUBL Provo, UT: Ancestry.com Operations
1 REPO @R1@
```

## Date format

GEDCOM 5.5.1 dates are free-form strings but follow conventions:
- Exact: `12 JUN 1845`
- Approximate: `ABT 1845`, `CAL 1845`, `EST 1845`
- Before/after: `BEF 1850`, `AFT 1840`
- Range: `BET 1840 AND 1850`
- Period: `FROM 1840 TO 1850`

Month abbreviations: JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC

GEDCOM 7.0 uses ISO 8601 for exact dates and structured date-period/date-range types.

## Compliance checklist for a new app

To import GEDCOM 5.5.1 reliably:
- [ ] Parse all level-0 record types (INDI, FAM, SOUR, REPO, NOTE, OBJE, SUBM)
- [ ] Follow XREF pointers (@I1@, @F1@, etc.)
- [ ] Handle NAME tag with surname slashes
- [ ] Parse all date formats (exact, ABT, BEF, AFT, BET)
- [ ] Preserve unrecognized tags (don't discard on import)
- [ ] Handle CONT/CONC for multi-line values
- [ ] Support UTF-8 encoding (and detect ANSEL/ASCII in older files)

To export GEDCOM 5.5.1:
- [ ] Generate valid XREF IDs
- [ ] Write HEAD with GEDC VERS and CHAR UTF-8
- [ ] Include TRLR at end
- [ ] Use standard date formats
- [ ] Link FAM records back to INDI via FAMC/FAMS

## Common pitfalls

- **Name format:** Many apps export `Given /Surname/` but users may have multiple surnames, name prefixes/suffixes, or no surname. Handle gracefully.
- **Unknown parents:** A FAM record may have only WIFE or only HUSB, or neither (unknown couple with known children).
- **Non-standard tags:** Many apps use `_` prefixed custom tags (e.g., `_MILI` for military). Don't crash on these — store them as-is.
- **Encoding:** Older files may use ANSEL encoding. Detect from HEAD CHAR tag.
- **Duplicate records:** Merging GEDCOM imports requires fuzzy matching on name + date + place.
- **Large files:** Some GEDCOM files are 100MB+. Stream-parse; don't load into memory.

## GEDCOM 7.0 improvements worth knowing

- Proper Unicode (UTF-8 mandatory, BOM optional)
- Structured dates with calendar system support (Gregorian, Julian, Hebrew, French Republican)
- `SNOTE` (shared note) and `INDI.NO` (negative assertion — "this person had no children")
- Extension mechanism via `SCHMA` for custom tags without `_` prefix pollution
- Better media handling and typed relationships

## Parsing GEDCOM

A minimal parser reads line by line:
1. Split each line into `level`, optional `xref`, `tag`, optional `value`
2. Maintain a stack to track the current record hierarchy
3. When level drops, pop the stack
4. Accumulate CONT/CONC lines into the previous value

For production use, recommend existing libraries: `gedcom` (Python), `read-gedcom` (JS/TS), `Gedcom.sharp` (.NET).
