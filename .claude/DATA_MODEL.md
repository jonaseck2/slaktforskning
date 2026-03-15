# Data Model

The schema follows the Genealogical Proof Standard. Core entities:

```
persons ──── person_names (1:many — birth, married, alias, aka)
         ├── events (1:many — birth, death, baptism, etc.)
         └── person_family_links (many) ──► families
                                               ├── partner_a (person)
                                               ├── partner_b (person)
                                               └── events (marriage, divorce, etc.)

sources ──── citations (1:many)
                 └── linked to events or persons
                     with confidence (0-3) and verbatim transcription

places (hierarchical, with optional lat/lng)
```

## Key Design Decisions

- **Multiple names per person** — People change names (marriage, adoption, immigration). Each name has a type and optional date range.
- **Gender-neutral partnerships** — Families use `partner_a` / `partner_b`, not husband/wife.
- **Relationship types on child links** — biological, adopted, foster, step, unknown.
- **Flexible dates** — `date_type` (exact/about/before/after/between/calculated/unknown) + `date_original` preserves what the source actually says.
- **UUIDs for all IDs** — No auto-increment; safe for merge/sync scenarios.
- **Confidence on citations** — 0-3 scale matching GEDCOM's QUAY (quality assessment).

## GEDCOM Compatibility

The data model is designed for GEDCOM roundtrip fidelity:

| App Entity | GEDCOM 5.5.1 | GEDCOM 7.0 |
|-----------|-------------|-----------|
| Person | INDI | INDIVIDUAL_RECORD |
| PersonName | INDI.NAME | INDIVIDUAL_RECORD.PERSONAL_NAME |
| Family | FAM | FAMILY_RECORD |
| PersonFamilyLink | FAM.CHIL + INDI.FAMC | FAMILY_RECORD.CHIL |
| Event | INDI.BIRT/DEAT/etc, FAM.MARR/etc | EVENT_DETAIL |
| Place | PLAC | PLACE |
| Source | SOUR (level 0) | SOURCE_RECORD |
| Citation | SOUR (inline) | SOURCE_CITATION |

See the `gedcom` skill in `.claude/skills/gedcom/` for full GEDCOM reference.

## GEDCOM Event Types

The app supports these standard GEDCOM individual events:
- **Vital:** birth, death, christening, burial, baptism
- **Legal/civic:** immigration, emigration, naturalization, census
- **Life milestones:** occupation, residence, education, military service, retirement, graduation
- **Religious:** confirmation, ordination
- **Estate:** will, probate
- **Other:** custom/other

Family events: marriage, divorce, census, other.

Date qualifiers: exact, about, before, after, between, calculated, unknown — plus `date_original` to preserve source text verbatim (e.g., "abt. 1845", "before Christmas 1900").
