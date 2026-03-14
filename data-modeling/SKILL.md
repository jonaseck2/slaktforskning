---
name: data-modeling
description: Design data schemas and entity-relationship models for genealogy applications, including persons, family relationships, life events, sources, citations, and media. Use this skill whenever the user wants to model genealogy data, design a database schema for a family tree app, think through how to represent complex family structures (adoptions, remarriages, unknown parents), or figure out how to handle evidence and citations. Trigger when the user asks about data models, schema design, how to store genealogy data, how to represent family relationships in a database, or wants an ERD or schema for a genealogy app.
---

# Genealogy Data Modeling

This skill helps design robust data schemas for genealogy applications — covering the core entities, their relationships, and the tricky edge cases that trip up naive designs.

## Core entities

### Person
The fundamental unit. Key attributes:
- `id` (UUID)
- Names: given name, surname, name type (birth, married, alias, also-known-as), date range
- Sex / gender
- Living flag (for privacy)
- Notes

**Design note:** A person can have multiple names over time. Store names as a separate `PersonName` entity linked to Person, not as flat fields.

### Family / Couple
Represents a partnership (married, cohabiting, unknown). Links two persons.
- `id`
- Partner A (person_id)
- Partner B (person_id)
- Union type (marriage, civil union, cohabitation, unknown)
- Start event, end event (see Events)

**Design note:** Separate "Family" from "Marriage event" — the relationship exists even if we don't know the marriage date.

### Person-Family link
Links a person to a family as a child.
- `person_id`
- `family_id`
- Relationship type (biological, adopted, foster, step, unknown)

### Event
Something that happened to a person or family at a point in time.
- `id`
- Event type (birth, death, marriage, divorce, burial, baptism, immigration, census, residence, occupation, military, etc.)
- Date (see Date model below)
- Place (see Place below)
- Description / notes
- Subject: person_id or family_id

### Date model
Genealogy dates are often uncertain. Don't use a simple date field. Model:
- Date type: exact, about (~), before, after, between, calculated, unknown
- Date value(s): ISO date string(s)
- Original text (preserve what the source actually says, e.g., "abt 1842")

### Place
- `id`
- Name (as recorded)
- Normalized name
- Latitude, longitude (optional)
- Parent place (for hierarchy: village → county → country)
- Date range (place names and boundaries change over time)

### Source
A document, record, or artifact that contains information.
- `id`
- Title
- Author
- Publication info
- Repository (where it's held)
- URL / call number
- Source type (vital record, census, newspaper, photograph, oral history, etc.)

### Citation
Links a claim in the tree to a source, with location within source.
- `id`
- `source_id`
- Page / film number / URL fragment
- Date accessed
- Confidence level
- Transcription (verbatim text from source)
- Notes

### Assertion / Claim
A specific piece of information derived from a citation. This separates "what the source says" from "what we conclude."
- `id`
- `citation_id`
- Claim type (birth date, birth place, parent-child relationship, etc.)
- Value
- Confidence

**Design note:** This three-layer model (Source → Citation → Assertion) follows the Genealogical Proof Standard and is what separates serious genealogy apps from simple tree builders.

### Media
Photos, documents, audio, video.
- `id`
- File reference / URL
- Media type
- Title, date, description
- Links to persons, families, events, places

## Entity-relationship overview

```
Person ─── PersonName (many)
       ─── Event (many, as subject)
       ─── PersonFamilyLink (many) ──► Family
                                           ├── Partner A (Person)
                                           ├── Partner B (Person)
                                           └── Event (many, e.g. marriage)

Citation ──► Source
Assertion ──► Citation
Event ──► Assertion (many)
PersonAttribute ──► Assertion (many)

Media ─── linked to any entity
Place ─── used by Event
```

## Tricky edge cases

- **Unknown parents:** Family can exist with one or both partners null.
- **Same-sex couples:** Model partners as Partner A / Partner B, not "husband/wife".
- **Adoptions:** Use the relationship type field on PersonFamilyLink.
- **Plural marriages:** A person can be linked to multiple families as partner.
- **Conflicting information:** Multiple assertions for the same fact with different values is valid — let the researcher evaluate evidence.
- **Living persons:** Flag persons as living; suppress details in public views.
- **Merged duplicates:** Keep a `merged_into` pointer to handle deduplication without data loss.

## Output format

When designing a schema, produce:

1. **Entity list** with key fields and data types
2. **ERD** as an ASCII diagram or Mermaid `erDiagram` block
3. **Notes on design decisions** — explain why the model is shaped the way it is
4. **SQL DDL or JSON Schema** as requested
5. **GEDCOM mapping** — how entities map to GEDCOM tags (see gedcom skill for details)

## Recommended starting point for a new app

If the user needs a minimal viable schema, start with: Person, Family, PersonFamilyLink, Event, Place, Source, Citation. Add Assertion layer when the app matures toward research-grade use.
