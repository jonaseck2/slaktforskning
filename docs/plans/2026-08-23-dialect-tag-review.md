# Dialect Tag Review — Design Spec

**Date:** 2026-08-23
**Status:** Filed, not started. Blocks nothing.

## User goal

A researcher importing from Family Tree Maker, PAF, Legacy, Family Historian,
MyHeritage, RootsMagic or Holger keeps the parent-relation types, parish names and
citations those programs wrote, instead of having them silently discarded.

## Why this exists

Tag accounting (`docs/plans/archive/2026-08-23-importer-tag-accounting.md`) made the
importer name what it drops. Running the new gate over the 19 shipped fixtures surfaced
20 undeclared paths. Seven are header metadata or profile-gated reads and were declared
`excluded`. The remaining thirteen hold authored data and were declared
`unmapped:pending-dialect-tag-review` — this plan is the referent.

| Path | Dialect | What it holds |
|---|---|---|
| `INDI._FREL` / `INDI._MREL` / `INDI._FREL._MREL` | FTM, PAF | Father/mother relation — adopted, foster, biological. Maps to a `parent_child` subtype the app already models. |
| `*.PARI` | Holger | Parish on an event. A real place component, dropped entirely. |
| `INDI.ASSO.SOUR` | RootsMagic | A citation on an association. `asso.ts` reads `ROLE`/`RELA`/`_EVID`/`NOTE` but not `SOUR`. |
| `INDI._LIVING` | Legacy | Living flag. **Sat in `KNOWN_INDI_TAGS`, so it never appeared in `skipped`, while no phase ever read it.** |
| `INDI._FLGS` / `INDI._FLGS._LIVING` | Family Historian | Living flag, nested form. |
| `INDI._HDP` | Holger | Counted for a warning at `import-core.ts:594`, value not stored. |
| `INDI._PHOTO` | MyHeritage | Primary-photo pointer. |
| `INDI._MTTAG` | MyHeritage | Tag pointer. |
| `INDI._WEBTAG` | Family Historian | Web link. |
| `INDI._CUSTOM` | — | Unrecognised vendor tag in the non-standard fixture. |

`_FREL`/`_MREL` and `*.PARI` are the two worth doing first. Both map onto concepts the
app already has — `parent_child` subtypes and place components — so they are mapping
work, not modelling work.

`INDI._LIVING` is the sharpest illustration of why clause 1 needed a mechanical
contract. An allowlist entry that looks like handling and is not.

## Scope

Every dialect fixture under `tests/fixtures/gedcom/dialects/`, and the real-world corpus
under `export-import/samples/` via `scripts/accounting-over-samples.ts`.

**Scope deviation:** the ArkivDigital tags are excluded — they belong to
`docs/plans/2026-08-23-arkivdigital-import-design.md` Parts 1-3 and carry the
`unmapped:pending-arkivdigital-profile` reason instead.

## Verification

1. Import each dialect fixture with its matching profile and assert the mapped values
   land — `_FREL: Adopted` produces a `parent_child` row with subtype `adopted`, a
   Holger `PARI` produces a place component.
2. Every `unmapped:pending-dialect-tag-review` entry is gone from
   `accounting-declared.ts`, replaced by a mapping or by an `excluded:` reason with a
   spec citation.
3. `scripts/accounting-over-samples.ts` shows no undeclared path attributable to these
   dialects.
