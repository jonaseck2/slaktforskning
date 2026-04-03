# Plan: Genney Export Profile + Roundtrip (Investigated, Not Implemented)

**Versions:** v0.6.5 (Genney Export Profile) + v0.6.6 (Genney Roundtrip)
**Date:** 2026-04-03
**Status:** Investigated and rejected
**Decision date:** 2026-04-03

## Summary

Two milestones were planned to make App → Genney 4.1 → App a lossless cycle:

- **v0.6.5** — Export with Genney-compatible GEDCOM: hierarchical PLAC strings, `_UID`, `_YHAPLOGROUP`/`_MHAPLOGROUP`
- **v0.6.6** — Fix gaps found in the roundtrip analysis: `*`-encoded tilltalsnamn, `_REL` tag, identifier mapping

Both were rejected after investigating Genney's actual data model (Apache Derby database from a real `.gcc` backup) and its GEDCOM export behavior.

## Why Rejected

### 1. Genney has two export modes — we assumed the wrong one

Genney 4.1 exports in two modes:
- **"Genney" format** — proprietary extended GEDCOM/XML with all fields. Lossless roundtrip into Genney.
- **"GEDCOM 5.5" format** — standard GEDCOM, lossy. Drops DNA, place hierarchy, groups, relationship status, etc.

The `.ged` files a user exports from Genney are the GEDCOM 5.5 format. Our importer already handles the Genney-specific tags that Genney emits even in its GEDCOM 5.5 mode (`_YHAPLOGROUP`, `_MHAPLOGROUP`, `_UID`). Building an exporter that writes back to Genney's extended format would require reverse-engineering Genney's undocumented proprietary tags — not feasible.

### 2. Critical fields cannot survive a GEDCOM pass through Genney 4.1

All `_`-prefixed custom tags we write (v0.6.3 extensions: `_LIVING`, `_PREF`, `_PATR`, `_NQUAL`, `_DATE_FROM`/`_DATE_TO` on names, `_FSI`/`_ANID`/`_RAID`/`_PNUMMER`, `_SUBTYPE`, `_RELNOTES`, `_PLAC_ID`, `_URL`, `_STYPE`, `_CITNOTES`, `_ACCESSED`, `0 @Px@ _PLAC` records) are silently stripped by Genney on re-export. A true lossless roundtrip is impossible.

### 3. Encoding mismatches

- **Tilltalsnamn**: Genney encodes it as `*` after the given name in the NAME string (e.g. `Eva *Linda Marie`), not as a separate tag. Our v0.6.2 importer reads `_PREF` but not the `*` syntax — a fix would be possible, but adding more Genney-specific heuristics increases fragility.
- **Relationship status**: Genney uses `_REL` (e.g. `_REL Ogift`) on FAM, not `_SUBTYPE`. Our export uses `_SUBTYPE`; Genney would not read it back.
- **`_UID` uncertainty**: The `_UID` tag handling in v0.6.2 was inferred from the user's `.ged` file; Genney's documented identifier field maps to `REFN`, not `_UID`.

### 4. Place hierarchy survives already (via our importer)

Our v0.6.2 `findOrCreateSwedishPlace` already reconstructs the parent chain from Genney's hierarchical PLAC string on import. Going the other direction (App → Genney) would need `buildSwedishPlaceName`, but since the other round-trip problems are unfixable, the investment is not justified.

### 5. DNA sample data is fundamentally unrepresentable

Genney's DNA entity (type, haplogroup, testing company, date, notes, per-person links, inheritance flag) has no GEDCOM equivalent. Only the haplogroup string survives, which our importer already reads.

## What Survives the Genney Cycle Without Any Extra Work

| Data | Mechanism | Survives? |
|------|-----------|-----------|
| Names, sex, events, dates | Standard GEDCOM | Yes |
| Place hierarchy | Genney hierarchical PLAC string | Yes — our importer rebuilds the chain |
| Place coordinates | MAP/LATI/LONG (standard) | Yes — Genney re-emits these |
| Y/mtDNA haplogroup string | `_YHAPLOGROUP`/`_MHAPLOGROUP` | Yes — Genney emits, our importer reads |
| REFN/RIN identifiers | Standard GEDCOM | Yes |
| Sources and basic citations | Standard SOUR/PAGE/QUAY | Yes |
| Person notes | Standard NOTE | Yes |
| Repository | Standard REPO | Yes |

## What Is Irretrievably Lost Through Genney

All v0.6.3 custom `_` tags, place-level citations, sibling/godparent relationships, non-primary event participants, source type/URL, citation notes/date_accessed, name metadata (preferred, patronymic, qualifier, date_from/to), and all non-UID person identifiers.

## Decision

The Genney roundtrip is **best-effort by design**. The existing v0.6.2 Genney import profile handles what Genney's GEDCOM export provides. Users who want lossless roundtrip use the internal extended GEDCOM format (v0.6.3). Genney users accept that data added in Släktforskning beyond what GEDCOM 5.5 supports will not survive export back to Genney.

v0.6.5 and v0.6.6 are not planned for implementation.
