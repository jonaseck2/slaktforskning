# Plan: Extended GEDCOM Roundtrip

**Version:** v0.6.4
**Date:** 2026-04-03
**Status:** Not started
**Depends on:** v0.6.3 (Database Switcher)

## Goal

Make export → import a lossless (or near-lossless) cycle for all data stored in
the app. The output must remain valid GEDCOM 5.5.1 that other tools (Genney,
RootsMagic, Ancestry) can still import — they simply ignore the `_`-prefixed
custom tags, which is required behavior per the GEDCOM 5.5.1 spec.

The approach is to make **the extended output the new default for `exportGedcom`**
— no profile flag needed. The importer already handles unknown tags gracefully;
adding readers for the new tags is fully backwards-compatible with files from
other apps.

## Two Extension Mechanisms

### 1 — Standard GEDCOM features (currently unused in our exporter)

These are valid GEDCOM 5.5.1 that every compliant reader supports:

| Feature | Tag structure | Preserves |
|---------|--------------|-----------|
| Preferred / call name | `2 NICK <name>` under NAME | `person_names.preferred_name` — `NICK` is the most widely supported GEDCOM encoding for call name. Semantics are imprecise (NICK conflates nickname and call name) but this is standard practice across all major genealogy apps. |
| Coordinates on place | `3 MAP` / `4 LATI N57.7` / `4 LONG E12.0` | `places.latitude`, `places.longitude` |
| Address on place | `3 ADDR` / `4 ADR1` / `4 POST` / `4 CITY` / `4 CTRY` | `places.street/postal_code/city/country` |
| Parent-child subtype | `2 PEDI biological` on CHIL in FAM | `relationship.subtype` (biological/adopted/foster/step) |
| Non-primary event participants | `1 ASSO @Ix@` / `2 RELA Witness` under INDI | `event_participants` with non-primary roles |
| Sibling / godparent relationships | `1 ASSO @Ix@` / `2 RELA Sibling` under INDI | `relationships` of type sibling, godparent |
| Person-level citations | `1 SOUR @Sx@` / `2 PAGE` / `2 QUAY` under INDI | `citations` with `person_id` set |
| Family-level citations | `1 SOUR @Sx@` / `2 PAGE` / `2 QUAY` under FAM | `citations` with `relationship_id` set |
| Source repository | `1 REPO <name>` (inline string, non-pointer) | `sources.repository` |
| Citation notes + date_accessed | `3 NOTE`, `3 DATE` under SOUR citation block | `citations.notes`, `citations.date_accessed` |

### 2 — Custom `_`-prefixed tags (our namespace)

Ignored by other apps, round-tripped by ours:

| Tag | Location | Level | Preserves |
|-----|----------|-------|-----------|
| `_LIVING` | INDI | 1 | `persons.living` (written only when `true`) |
| `_PATR` | NAME | 2 | `person_names.patronymic_base` |
| `_NQUAL` | NAME | 2 | `person_names.name_qualifier` |
| `_DATE_FROM` | NAME | 2 | `person_names.date_from` |
| `_DATE_TO` | NAME | 2 | `person_names.date_to` |
| `_FSI` | INDI | 1 | identifier_type: `familysearch` |
| `_ANID` | INDI | 1 | identifier_type: `ancestry` |
| `_RAID` | INDI | 1 | identifier_type: `riksarkivet` |
| `_PNUMMER` | INDI | 1 | identifier_type: `personnummer` |
| `_SUBTYPE` | FAM | 1 | `relationships.subtype` for couple (civil_union/cohabitation/unmarried/unknown) |
| `_RELNOTES` | FAM | 1 | `relationships.notes` |
| `_PTYPE` | PLAC | 3 | `places.place_type` |
| `_PNOTES` | PLAC | 3 | `places.notes` |
| `_DATE_FROM` | PLAC | 3 | `places.date_from` |
| `_DATE_TO` | PLAC | 3 | `places.date_to` |
| `_URL` | SOUR | 1 | `sources.url` |
| `_STYPE` | SOUR | 1 | `sources.source_type` |
| `_CITNOTES` | SOUR citation | 3 | `citations.notes` (supplement to standard NOTE) |
| `_ACCESSED` | SOUR citation | 3 | `citations.date_accessed` |
| `_PLAC_ID` | PLAC | 3 | App-internal place UUID — enables place deduplication on re-import without string matching |

## Place Deduplication: `_PLAC_ID`

The base importer creates place records by matching normalized name strings. This
means a place with coordinates, notes, and hierarchy gets recreated as a bare
name-only record on re-import.

Solution: write `3 _PLAC_ID <uuid>` under every PLAC tag in the export. On
re-import, when `_PLAC_ID` is present, look up the place by UUID first. If found,
reuse it; if not found (new database), fall back to name matching.

This makes place round-trips exact: coordinates, type, hierarchy, notes and
address are all preserved via the existing place record rather than needing to be
re-read from tags.

## ASSO — Non-Primary Participants and Sibling/Godparent

GEDCOM 5.5.1 defines `ASSO` (association) under INDI:

```
0 @I1@ INDI            ← baptism event has a godparent
1 BIRT
  ...
1 ASSO @I2@            ← I2 is associated with I1
2 RELA Godparent
```

### For event participants (non-primary roles)

Write one `ASSO` block per non-primary `EventParticipant`:
```
1 ASSO @Ix@
2 RELA <role>        ← Witness, Godparent, Officiant, Spouse, etc.
2 _EVID <event_id>  ← links this ASSO to the specific event (custom sub-tag)
```

On re-import: collect ASSO blocks from each INDI; after all events are created,
match by `_EVID` and call `addEventParticipant`.

### For sibling / godparent / other relationships

Write under the first person's INDI:
```
1 ASSO @I2@
2 RELA Sibling        ← or Godparent, or Other
```

Write under the second person's INDI:
```
1 ASSO @I1@
2 RELA Sibling
```

On re-import: after all persons are created, scan each INDI's ASSO blocks. For
each `RELA Sibling`, `RELA Godparent`, or `RELA Other`, call `createRelationship`
only once (deduplicate by checking if the pair already exists).

## Place-level Citations via `_PLAC` Records

GEDCOM 5.5.1 has no top-level place records — `0 @P1@ PLAC` is not valid. A
citation attached to a place (not via any event) has nowhere to live in standard
GEDCOM. Solution: emit custom top-level records:

```
0 @P1@ _PLAC
1 _PLAC_ID <uuid>      ← links back to our place record
1 SOUR @S1@
2 PAGE p. 42
2 QUAY 2
2 NOTE Optional citation note
2 _ACCESSED 2024-03-01
```

The exporter emits one `0 @Px@ _PLAC` record per place that has at least one
direct citation. The importer reads `_PLAC` records after the main pass, looks up
the place by `_PLAC_ID`, and creates the citations.

Other apps ignore `_PLAC` records entirely (unrecognised level-0 tags are skipped
per GEDCOM spec).

Add to exporter Step 1 as item 12, importer Step 2 correspondingly, and add a
roundtrip unit test.

## What Still Cannot Be Expressed

| Field | Reason |
|-------|--------|
| `Assertion` | Research-layer evidence evaluation (GPS standard) — deferred to v0.7.1 which adds `_ASSN` custom records after the v0.7.0 Assertions UI is built |
| `relationships.type = 'other'` | Removed from scope — not needed |

## Implementation Plan

### Step 1 — Extend `exportGedcom`
**File:** `src/gedcom/exporter.ts`

All changes to the exporter are unconditional — no new options parameter needed.

Order of additions:
1. `_LIVING` on INDI
2. `NICK` (preferred_name), `_PATR`, `_NQUAL`, `_DATE_FROM`, `_DATE_TO` on NAME records
3. `_FSI`, `_ANID`, `_RAID`, `_PNUMMER` from person_identifiers
4. ASSO blocks for non-primary event participants and sibling/godparent/other rels
5. `SOUR` blocks directly on INDI (person-level citations)
6. `SOUR` blocks directly on FAM (relationship-level citations)
7. `_SUBTYPE`, `_RELNOTES` on FAM
8. `PEDI` on CHIL in FAM
9. PLAC sub-tags: `MAP`/`LATI`/`LONG`, `ADDR`, `_PTYPE`, `_PNOTES`, `_DATE_FROM`, `_DATE_TO`, `_PLAC_ID`
10. `_URL`, `_STYPE`, `REPO` on SOUR
11. `NOTE`, `_CITNOTES`, `_ACCESSED` on SOUR citation blocks
12. `0 @Px@ _PLAC` records for place-level citations

### Step 2 — Extend `importGedcom`
**File:** `src/gedcom/importer.ts`

For each new tag added in Step 1, add a corresponding reader in the importer.
Each reader must be:
- **Non-breaking** when the tag is absent (existing files without these tags import unchanged)
- **Additive** — reads extra data if present, no effect if absent

Key additions:
- `_LIVING` → set `persons.living = true`
- `NICK` on NAME → `preferred_name`; `_PATR`, `_NQUAL`, `_DATE_FROM`, `_DATE_TO` on NAME → pass to `addPersonName`
- `_FSI`/`_ANID`/`_RAID`/`_PNUMMER` → `addPersonIdentifier` with correct type
- ASSO with `_EVID` → post-pass: link to event as non-primary participant
- ASSO with `RELA Sibling`/`RELA Godparent`/`RELA Other` → post-pass: `createRelationship` (deduplicated)
- `_PLAC` level-0 records → post-pass: look up place by `_PLAC_ID`, create citations
- Person-level SOUR → `createCitation` with `person_id`
- Family-level SOUR → `createCitation` with `relationship_id`
- `_SUBTYPE`, `_RELNOTES` on FAM → `updateRelationship` after creation
- `PEDI` on CHIL → pass as `subtype` to `createRelationship`
- PLAC `MAP`/`LATI`/`LONG`, `ADDR`, `_PTYPE`, `_PNOTES`, `_DATE_FROM`/`_DATE_TO` → `updatePlace` after `findOrCreatePlace`
- `_PLAC_ID` → look up place by UUID first; skip `findOrCreatePlace` if found
- `REPO` on SOUR → read as `repository` string (already done)
- `_URL`, `_STYPE` on SOUR → pass to `createSource`
- Citation `NOTE` → `citations.notes` (currently read into transcription; separate)
- `_ACCESSED` → `citations.date_accessed`

### Step 3 — Unit tests
**File:** `tests/unit/gedcom.test.ts`

Add roundtrip tests for each new field:
- `living: true` → survives roundtrip
- `preferred_name` → survives roundtrip via `NICK` (readable by all standard GEDCOM apps)
- `patronymic_base` → survives roundtrip (without needing Genney profile)
- `date_from`/`date_to` on name → survive
- `familysearch` identifier → survives
- `sibling` relationship → survives via ASSO
- Parent-child `subtype: 'adopted'` → survives via PEDI
- Event participant with `role: 'witness'` → survives via ASSO
- Person-level citation → survives
- Place with coordinates → survives
- Place address fields → survive
- Source url + source_type → survive
- Citation notes → survive
- `_PLAC_ID` lookup skips name matching → existing place record reused
- Place-level citation → survives via `_PLAC` top-level record

### Step 4 — Docs
Update `README.md`, `CLAUDE.md`, `.claude/PLAN.md`, `.claude/MCP.md`.

## Compatibility Note

Other apps importing our extended GEDCOM:
- Will correctly read all standard tags (names, events, sources, FAM structure)
- Will silently ignore all `_`-prefixed custom tags (required by spec)
- Will see `ASSO` blocks but may interpret them differently (ASSO is sometimes
  used differently by different apps — acceptable)
- Will see `MAP`/`ADDR` on PLAC and may display coordinates/addresses

Genney specifically: Genney reads `MAP`/`LATI`/`LONG` for place coordinates and
`ASSO` associations. Our extended export is a strict superset of what Genney
already produces — so Genney can re-import our export cleanly.
