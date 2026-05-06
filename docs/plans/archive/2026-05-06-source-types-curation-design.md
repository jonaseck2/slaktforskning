# Design spec: Source-type curation

**Date:** 2026-05-06
**Status:** Design — needs decisions before implementation
**Source:** Beta tester reports 70 + 71 (v0.215.2)

## User goal

When recording a source, the genealogist picks from a dropdown of source types. The current list (`SOURCE_TYPE_VALUES`) is too short and ordered in a way that's neither alphabetical nor grouped. The genealogist wants:

1. The list **covers** the kinds of sources actually used in Swedish genealogy: passenger lists, probate inventories (bouppteckning), peerage registers (adelskalender), encyclopedias, the major online death index (Sveriges dödbok), social media as distinct from generic online databases, etc.
2. The list **is ordered** in a way the eye can scan — either alphabetical or grouped by archive shape.
3. Renaming "Tidning" → "Tidning / Tidskrift" so periodicals other than newspapers fit. Renaming "Onlinedata" so its scope is clearer.

This is the kind of curation that needs the user to confirm before we ship — every addition is a long-lived enum value and every renaming changes existing rows' rendering.

## Investigation needed

`SOURCE_TYPE_VALUES` lives in `src/renderer/constants/eventTypes.ts` (per CLAUDE.md). Per `gedcom_fidelity_registry.ts`, `sources.source_type` is registered for round-trip. Audit:

- Current enum values (full list, in current order).
- Where each is rendered in the UI (typically `i18n.ts` `sourceTypes.<value>` keys).
- GEDCOM round-trip behavior — does each type map to a GEDCOM source class? Does adding a new type require a registry update?

## Proposed changes (decisions needed)

Each item below is a separate yes/no the user picks. Ship only the ones the user accepts.

### Renames

| Current | Proposed | Decision |
|---|---|---|
| `Onlinedata` (online_database?) | `Onlinedatabas / Sociala media` (or split into two; see below) | TBD |
| `Tidning` | `Tidning / Tidskrift` (newspaper / periodical) | TBD |

### Splits

| Proposal | Rationale |
|---|---|
| Split `online_database` into `online_database` + `social_media` | Facebook posts vs Riksarkivet's online search are different shapes of "source". |
| Further split `social_media` into per-platform (`facebook`, `instagram`, `wikipedia`, …) | User flagged this themselves as possibly over-detailed. **Default: don't split per-platform.** |

### Additions

| Proposed new type | Rationale | Decision |
|---|---|---|
| `passenger_list` (Utvandringshandling / Passagerarlista) | Common in emigrant genealogy. | TBD |
| `probate_inventory` (Bouppteckning) | Could fold under `legal_document`, but it's the most-cited probate-class source in Swedish research. | TBD |
| `genealogist` / `research_work` (Släktforskare / släktforskningsarbete) | Citing another researcher's work. | TBD |
| `peerage_register` (Adelskalender) | Specific Swedish/Nordic source. | TBD |
| `encyclopedia` (Uppslagsverk) | Generic. | TBD |
| `swedish_death_index` (Sveriges dödbok) | Most-cited online death index in SE. Could fold under `online_database`. **Default: keep folded; it's a citation, not a type.** | TBD |

### Ordering

Two coherent options:

**Option A — alphabetical** (in the current locale). Simple, scannable, no judgment calls.

**Option B — grouped, with non-selectable group headings** in the dropdown. User-proposed groups:
- *Myndighetsarkiv* (gov't archives): folkbokföring, folkräkning, kyrkobok, militärhandling, invandringshandling
- *Diverse arkiv* (other archives): juridiskt dokument, övrigt
- *Levande källor* (living/published sources): tidning/tidskrift, fotografi, muntlig berättelse, brev/korrespondens, bok, onlinedatabas

Group headings render with distinct typography (italic, muted color) and are not selectable. Adds dropdown complexity and locale-dependent grouping logic.

**Default: Option A.** Alphabetical is simpler, language-neutral, and the user themselves flagged Option B as a "judgment question". Revisit if a future user-test confirms scanning is hard with 15+ flat options.

## Open questions for the user

- For each proposed addition (passenger_list, probate_inventory, genealogist, peerage_register, encyclopedia): **add or skip?**
- Rename `Tidning` → `Tidning / Tidskrift`: **yes or no?**
- Online-data split: **(a) keep flat as `online_database`, (b) rename to `Onlinedatabas / Sociala media`, or (c) split into two enum values**?
- Order: **alphabetical (default) or grouped**?
- Sveriges dödbok: **separate type, or use `online_database` with the title field doing the work?** (Default: latter.)

Once decided, the implementation plan ships as `2026-05-06-source-types-curation.md`. Migration strategy for existing rows (rename's old → new mapping) goes in that plan.

## Failure modes / RCA reference

- **GEDCOM round-trip risk:** every new `source_type` value needs to map to a GEDCOM source class for export. If no clean mapping, the type round-trips as `excluded:no-gedcom-equivalent` and the registry test will fail unless you add the entry.
- **Locale-stable enum values:** the value strings (e.g. `passenger_list`) live in code; the labels live in i18n. Don't put Swedish labels in the enum.
- **Existing data:** users with rows tagged `online_data` need a migration. Ship the rename via i18n only (label changes, value stays) wherever possible. If splitting an enum value, write a one-time migration that defaults all old rows to the more-conservative side and let the user reclassify.
- **Don't ship behind the user's back:** every rename above changes what the user sees on existing source rows. Land each rename with an explicit CHANGELOG bullet in the user's voice ("Onlinedata is now called …").
