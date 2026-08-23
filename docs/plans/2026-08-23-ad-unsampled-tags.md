# ArkivDigital Tags Documented But Never Observed — Design Spec

**Date:** 2026-08-23
**Status:** Filed, blocked on a sample. Blocks nothing.

## User goal

A researcher whose ArkivDigital export records a separation, a cohabitation, or a
free-text date keeps those facts as facts the app can show and search, not as opaque
preserved text.

## Why this exists

ArkivDigital documents three custom tags that occur **zero times** across the four real
exports the `arkivdigital` profile was built from:

| Tag | ArkivDigital's description | Occurrences observed |
|---|---|---|
| `_DOMESTIC_PARTNERSHIP` | Sambohändelse — a cohabitation event | 0 |
| `_SEPR` | Händelse för separation | 0 (already a known FAM tag in this importer) |
| `_DATE_TEXT` | Datum utan giltigt GEDCOM-format | 0 |

They are in `tests/fixtures/gedcom/dialects/arkivdigital.ged` so the accounting gate
names them, and declared `unmapped:pending-ad-unsampled-tags`. They are not modelled.

**Modelling against documentation with no sample risks building the wrong shape.** The
documentation gives a one-line Swedish gloss, not a structure: it does not say whether
`_DOMESTIC_PARTNERSHIP` sits on FAM or INDI, what sub-tags it carries, or whether
`_DATE_TEXT` replaces a DATE or annotates one. Guessing produces a mapping that has to
be unpicked when a real file arrives, and unpicking a mapping means migrating whatever
users imported under it.

## What unblocks this

An ArkivDigital export containing at least one of:

- a couple recorded as sambo rather than married,
- a separation event,
- a date the researcher typed in free text.

The friend whose four trees drove the profile may have one; other Swedish users
certainly will. Until then the tags are named in the import report on every import, so a
user who has them can see they are not handled.

## Interim behaviour

Declared, therefore reported. Once verbatim capture ships
([2026-08-23-unmapped-capture-design.md](2026-08-23-unmapped-capture-design.md)) they are
also preserved and re-emitted on export, so a file carrying them round-trips without
data loss even while unmodelled. Preserved is not the same as modelled: a captured tag
is a blob the app cannot search, display, or reason about.

## Scope when it starts

`_DOMESTIC_PARTNERSHIP` maps onto the existing `cohabitation` couple subtype — the same
one Holger's `ENGA TYPE` of `Sambo` / `Partner` / `Särbo` already uses, so the concept is
modelled and only the tag reading is missing. `_SEPR` is already a known FAM tag. Of the
three, `_DATE_TEXT` is the one that needs a real design decision: the app stores
`date_original` alongside a parsed `date_value`, and whether `_DATE_TEXT` belongs there
or beside it depends on whether ArkivDigital emits it *instead of* or *as well as* a
DATE line. That is exactly the question a sample answers and documentation does not.

## Verification

1. Import a real export carrying the tag and assert the fact appears — a cohabitation
   couple subtype, a separation event, a `date_original` that survived.
2. Every `unmapped:pending-ad-unsampled-tags` entry is gone from
   `accounting-declared.ts`, replaced by a mapping.
