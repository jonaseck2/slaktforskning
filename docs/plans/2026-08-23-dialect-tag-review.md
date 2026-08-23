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

## The real-world corpus is much larger than the fixtures

`scripts/accounting-over-samples.ts` over the 36 gitignored files in
`export-import/samples/` (RootsMagic 8, FTM 20, PAF 2.2, Legacy, FamilyOrigins,
ANCESTRIS, Gramps, the FamilySearch 7.0 reference set, Heiner Eichmann's torture test).
All 36 import without failure. **742 distinct undeclared paths.**

They are not in `DECLARED_UNMAPPED` and should not be: the declared list is exercised by
the fixture gate, and 742 entries no test touches would be noise. They are recorded here
because this is the plan that will work through them.

Top of the list by occurrence:

```
  ===== GRAND TOTAL: 742 distinct undeclared paths, 0 files failed to import =====
       4683  INDI._UPD
       4542  INDI.DEAT._UID
       4542  INDI.DEAT.RIN
       4478  INDI.BIRT._UID
       4478  INDI.BIRT.RIN
       2877  FAM._UID
       2863  FAM.RIN
       2503  FAM.MARR._UID
       2503  FAM.MARR.RIN
        940  INDI.CHAN
        940  INDI.CHAN.DATE
        940  INDI.CHAN.DATE.TIME
        835  INDI.NAME.SOUR._LINK
        724  INDI.NAME._MARNM
        662  INDI.NAME.SOUR._FOOT
        631  INDI.BIRT.SOUR._LINK
        520  INDI.DEAT.SOUR._LINK
        501  INDI.DEAT.SOUR._FOOT
        430  FAM.CHAN
        430  FAM.CHAN.DATE
        430  FAM.CHAN.DATE.TIME
        418  INDI.BURI.SOUR._LINK
        390  INDI.ENDL.DATE
        364  INDI.BIRT.SOUR._FOOT
        347  INDI._PPEXCLUDE
        289  INDI.SLGC.DATE
        213  INDI.TITL.SOUR._FOOT
        203  INDI._SOSADABOVILLE
        199  OBJE.FILE.FORM
        175  OBJE.FILE.TITL
```

What stands out as authored genealogical data rather than app-internal bookkeeping:

- **`INDI.NAME._MARNM` — 724 occurrences.** A married name. The app models
  `person_names` with a `name_type`, so this is mapping work, not modelling work.
- **`INDI.BIRT._UID` / `.RIN` — 4478 each, plus the DEAT and MARR equivalents.**
  Event-level identifiers. `person_identifiers` covers persons only.
- **`*.SOUR._LINK` / `._FOOT` — 835 and 662.** Citation links and footnote text.
- **`FAM.ANUL.HUSB.AGE` and the CENS equivalents.** Age at event.
- **`OBJE.FILE.FORM` / `.TITL` — 199 and 175.** Media format and title.
- **`INDI._SOSADABOVILLE` — 203.** Sosa-Stradonitz ancestor numbering.

Clearly app-internal and safe to exclude once reviewed: `INDI._UPD` (4683),
`INDI.CHAN.DATE.TIME` (940), `INDI._PPEXCLUDE` (347).

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
