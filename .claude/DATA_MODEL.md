# Data Model

## Philosophy

**Source-first, evidence-based genealogy.** Every claim in the database should be traceable to a source. Nothing is blocked without a source — the UI warns on unsourced entities and provides a research audit view — but the data model is designed so citations are natural first-class links, not afterthoughts.

The model is inspired by **GEDCOM-X** conceptually (Relationship instead of Family, clean source separation) but uses **GEDCOM 5.5.1 as the interchange format** on import/export, since that is what every relevant platform speaks.

---

## Core Architecture

```
EVIDENCE LAYER
  sources → citations → [assertions — schema present, UI deferred]

CONCLUSION LAYER
  persons, relationships, events, places
  (each entity/field = a conclusion, potentially unsourced → warned)
```

Citations link to any conclusion-layer entity:
- `citations.person_id` — a source supports something about this person
- `citations.relationship_id` — a source supports this relationship
- `citations.event_id` — a source supports this event
- `citations.place_id` — a source documents this place

---

## Entities

### persons
The fundamental unit. Unchanged from v0.1.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| sex | TEXT | 'M' \| 'F' \| 'U' |
| living | INTEGER | boolean — suppresses details in public views |
| notes | TEXT | |
| created_at | TEXT | datetime |
| updated_at | TEXT | datetime |

### person_names
A person can have multiple names over time (birth, married, alias, aka).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| person_id | TEXT FK | → persons, CASCADE DELETE |
| given_name | TEXT | |
| surname | TEXT | |
| name_type | TEXT | 'birth' \| 'married' \| 'alias' \| 'aka' |
| date_from | TEXT | ISO date |
| date_to | TEXT | ISO date |
| sort_order | INTEGER | 0 = primary name |
| name_prefix | TEXT | Title/prefix before given name (e.g. "Dr.", "von") |
| name_suffix | TEXT | Suffix after surname (e.g. "Jr.", "Sr.") |
| patronymic_base | TEXT | Base name used for Swedish patronymics (e.g. "Erik" → Eriksson/Eriksdotter) |
| name_qualifier | TEXT | CHECK ('married_name' \| 'aka' \| 'nick' \| 'immigrant' \| null) |
| preferred_name | TEXT | Tilltalsnamn — the specific given name used in daily life (e.g. "Linda" when full given name is "Eva Linda Marie") |
| nickname | TEXT | Smeknamn / informal name — separate from preferred_name |

### person_identifiers
External IDs linking a person record to identifiers in other systems.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| person_id | TEXT FK | → persons, CASCADE DELETE |
| identifier_type | TEXT | CHECK 'familysearch' \| 'ancestry' \| 'riksarkivet' \| 'personnummer' \| 'refn' \| 'rin' \| 'other' |
| identifier_value | TEXT | The actual identifier string |
| created_at | TEXT | datetime |
| UNIQUE | | (person_id, identifier_type, identifier_value) |

### relationships
**Replaces `families` + `person_family_links`.** A relationship is a typed, sourced connection between two persons. This is the GEDCOM-X model — there is no "Family" entity, only relationships between individuals.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| type | TEXT | 'couple' \| 'parent_child' \| 'sibling' \| 'godparent' \| 'other' |
| person1_id | TEXT FK | → persons, CASCADE DELETE. For couple: partner. For parent_child: **parent**. For sibling: either. |
| person2_id | TEXT FK | → persons, CASCADE DELETE. For couple: partner. For parent_child: **child**. For sibling: either. |
| subtype | TEXT | For couple: 'marriage' \| 'civil_union' \| 'cohabitation' \| 'unknown'. For parent_child: 'biological' \| 'adopted' \| 'foster' \| 'step' \| 'unknown'. |
| notes | TEXT | |
| created_at | TEXT | datetime |
| updated_at | TEXT | datetime |

**GEDCOM roundtrip:** On export, each `couple` relationship becomes a FAM record. `parent_child` relationships where person1 is a partner in a couple are emitted as FAM.CHIL. On import, FAM → one `couple` + N `parent_child` rows.

### events
Events belong to **one or more persons** via `event_participants`. An event can have multiple participants with roles — marriage has two spouses, adoption has a child and a parent, a witness at a baptism is also a participant. Events optionally reference the relationship they are part of.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| event_type | TEXT | See event types below |
| date_type | TEXT | 'exact' \| 'about' \| 'before' \| 'after' \| 'between' \| 'calculated' \| 'unknown' |
| date_value | TEXT | ISO date (YYYY-MM-DD) |
| date_value_end | TEXT | For 'between' only |
| date_original | TEXT | Verbatim from source, e.g. "Midsommar 1742" |
| place_id | TEXT FK | → places, SET NULL |
| place_address | TEXT | Verbatim address text from source (e.g. "Tvärgatan 5, Nyköping") — not linked to a Place row |
| cause | TEXT | Cause of event (e.g. "cholera", "accident") — applicable to any event type |
| description | TEXT | |
| relationship_id | TEXT FK | → relationships, SET NULL. Optional: links a marriage event to the couple relationship. |
| created_at | TEXT | datetime |
| updated_at | TEXT | datetime |

### event_participants
Junction table linking events to persons with roles.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| event_id | TEXT FK | → events, CASCADE DELETE |
| person_id | TEXT FK | → persons, CASCADE DELETE |
| role | TEXT | 'primary' \| 'spouse' \| 'parent' \| 'child' \| 'witness' \| 'godparent' \| 'officiant' \| 'other' |
| UNIQUE | | (event_id, person_id) |

### places
Hierarchical places including Swedish-specific types. Places are sourced entities — a farm name recorded in a document needs a citation just like a person's name.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| name | TEXT | Name as recorded in source |
| normalized_name | TEXT | Standardized name for search/dedup |
| place_type | TEXT | 'country' \| 'province' \| 'county' \| 'härad' \| 'parish' \| 'farm' \| 'village' \| 'city' \| 'other' |
| parent_place_id | TEXT FK | → places, SET NULL. Hierarchy: farm → parish → härad → county → country |
| latitude | REAL | |
| longitude | REAL | |
| date_from | TEXT | ISO date — when this name/boundary became valid |
| date_to | TEXT | ISO date — when this name/boundary ended |
| notes | TEXT | |
| street | TEXT | Street name and number, e.g. "Tvärgatan 5" |
| postal_code | TEXT | Postal code, e.g. "35243" (nullable) |
| city | TEXT | City name (nullable; may differ from `name` when `name` is a street address) |
| country | TEXT | Country name or ISO code, e.g. "Sverige" (nullable) |

These four address columns align with GEDCOM-X `Address` on `PlaceDescription`. In GEDCOM 5.5.1 they map to `ADDR`/`ADR1` → `street`, `CITY` → `city`, `POST` → `postal_code`, `CTRY` → `country` on the containing event's `PLAC`. `stateOrProvince` and `nonAdminArea` are covered by the hierarchy (`parent_place_id`) and `name`/`place_type` respectively.

### sources
A physical or digital document, record, or artifact.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| title | TEXT | |
| author | TEXT | |
| publication_info | TEXT | |
| repository | TEXT | Archive or library holding the source |
| url | TEXT | |
| source_type | TEXT | 'vital_record' \| 'census' \| 'church_record' \| 'newspaper' \| 'photograph' \| 'oral_history' \| 'letter' \| 'legal_document' \| 'military_record' \| 'immigration_record' \| 'book' \| 'online_database' \| 'other' |
| call_number | TEXT | Repository call number or shelf mark (from GEDCOM CALN) |
| abstract | TEXT | Source abstract / summary text |
| created_at | TEXT | datetime |
| updated_at | TEXT | datetime |

### citations
Links a source (at a specific location) to any conclusion-layer entity. A citation can point to a person, a relationship, an event, and/or a place simultaneously — e.g. a household examination record cites the person, their residence event, and the farm.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| source_id | TEXT FK | → sources, CASCADE DELETE |
| page | TEXT | Page, entry, film number, URL fragment, etc. |
| date_accessed | TEXT | ISO date |
| confidence | INTEGER | 0–3 (QUAY: 0=unreliable, 1=questionable, 2=secondary, 3=primary) |
| transcription | TEXT | Verbatim text from source |
| notes | TEXT | |
| event_id | TEXT FK | → events, SET NULL |
| person_id | TEXT FK | → persons, SET NULL |
| relationship_id | TEXT FK | → relationships, SET NULL |
| place_id | TEXT FK | → places, SET NULL |
| created_at | TEXT | datetime |

### groups
Research workflow tags. A group is a named collection of persons — used to mark subprojects, research status, emigration cohorts, etc. Persons can belong to multiple groups.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| name | TEXT | e.g. "Emigrated to America", "I'm here", "Branch: Ahnstedt" |
| notes | TEXT | |
| created_at | TEXT | datetime |

### group_members
Junction table linking persons to groups.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| group_id | TEXT FK | → groups, CASCADE DELETE |
| person_id | TEXT FK | → persons, CASCADE DELETE |
| UNIQUE | | (group_id, person_id) |

### repositories
Physical or digital archives/libraries that hold sources. Distinct from the `sources.repository` text field — this is a proper entity with contact details.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| name | TEXT | Archive or library name |
| address | TEXT | |
| city | TEXT | |
| postal_code | TEXT | |
| state | TEXT | |
| country | TEXT | |
| phone | TEXT | |
| email | TEXT | |
| web | TEXT | URL |
| call_number | TEXT | Default call number for sources held here |
| notes | TEXT | |
| created_at | TEXT | datetime |

### source_repositories
Links a source to the repository (or repositories) that hold it.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| source_id | TEXT FK | → sources, CASCADE DELETE |
| repository_id | TEXT FK | → repositories, CASCADE DELETE |
| UNIQUE | | (source_id, repository_id) |

### research_tasks
Research to-do items. Can be linked to a specific person or be general.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| person_id | TEXT FK | → persons, CASCADE DELETE. Nullable — task deleted when person is deleted |
| priority | INTEGER | 1 (low) – 3 (high), default 1 |
| status | TEXT | 'open' \| 'in_progress' \| 'done' \| 'stopped' |
| task | TEXT | What to investigate |
| notes | TEXT | Background / context |
| result | TEXT | Findings after completing the task |
| created_at | TEXT | datetime |
| updated_at | TEXT | datetime |

### media
Media item metadata. `file_ref` is a path or identifier — actual file handling is deferred (see `.claude/plans/2026-04-04-media.md`).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| file_ref | TEXT | File path or external reference |
| title | TEXT | Display title |
| format | TEXT | MIME type or format string, e.g. "image/jpeg" |
| notes | TEXT | |
| is_printable | INTEGER | boolean — include in printed reports |
| created_at | TEXT | datetime |

### media_links
Links a media item to any entity (person, event, relationship, place, or source).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| media_id | TEXT FK | → media, CASCADE DELETE |
| entity_type | TEXT | 'person' \| 'event' \| 'relationship' \| 'place' \| 'source' |
| entity_id | TEXT | FK to the relevant table |
| link_type | INTEGER | Optional — e.g. primary photo vs supporting image |
| created_at | TEXT | datetime |

### assertions *(schema present, UI deferred)*
The GPS layer between a citation and a conclusion. Records what a specific citation actually claims, separately from what the researcher has concluded. When assertions conflict across citations, the researcher decides which to accept.

Schema is created at startup (idempotent DDL) but no UI or API functions expose it yet. This future-proofs the schema without blocking current development.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID v4 |
| citation_id | TEXT FK | → citations, CASCADE DELETE |
| subject_type | TEXT | 'person' \| 'relationship' \| 'event' \| 'place' |
| subject_id | TEXT | FK to the relevant table |
| attribute | TEXT | 'birth_date' \| 'name' \| 'residence' \| 'relationship_type' \| 'sex' \| etc. |
| value | TEXT | The asserted value |
| value_original | TEXT | Verbatim from source |
| confidence | INTEGER | 0–3 |
| is_accepted | INTEGER | 1 = researcher accepts this as basis for conclusion |
| notes | TEXT | Researcher's analysis |
| created_at | TEXT | datetime |

---

## Unsourced Indicators

Rather than blocking saves, the app warns on unsourced entities. Citation coverage is computed at query time:

- **Person unsourced:** no citations with `person_id = this person` AND no citations on any event where this person is a participant
- **Relationship unsourced:** no citations with `relationship_id = this relationship`
- **Event unsourced:** no citations with `event_id = this event`
- **Place unsourced:** no citations with `place_id = this place`

A "research audit" view aggregates all unsourced entities in one place.

---

## Entity-Relationship Diagram

```
persons ──── person_names (many)
        └─── event_participants (many) ──► events ──── places
                                               └── relationship_id?

relationships ──── [person1, person2] ──► persons
              └─── event_participants (via relationship_id on events)

sources ──── citations ──────────────────┬──► events
                         │               ├──► persons
                         │               ├──► relationships
                         └──► assertions └──► places
```

---

## GEDCOM 5.5.1 Mapping

| App Entity | GEDCOM 5.5.1 | Notes |
|-----------|-------------|-------|
| Person | INDI | Direct mapping |
| PersonName | INDI.NAME | name_type → NAME.TYPE |
| Relationship (couple) | FAM | Reconstructed on export |
| Relationship (parent_child) | FAM.CHIL + INDI.FAMC | parent1=HUSB or WIFE, child=CHIL |
| Event | INDI.BIRT/DEAT/etc, FAM.MARR | event_participants with role='primary' → INDI event; relationship_id present → FAM event |
| EventParticipant (witness) | INDI.EVEN.WITN | Custom tag — preserved on roundtrip |
| Place | PLAC | Hierarchical via comma-separated PLAC values |
| Source | SOUR (level 0) | Direct mapping |
| Citation | SOUR (inline) | confidence → QUAY, transcription → DATA.TEXT |
| Assertion | No GEDCOM equivalent | Dropped on export; rebuilt from citations on import |

---

## Event Types

### Person events (individual)
birth, death, christening, burial, baptism, confirmation, ordination, immigration, emigration, naturalization, census, occupation, residence, education, graduation, military, retirement, will, probate, other

### Multi-person events (via event_participants)
marriage, divorce, adoption — these attach to 2+ persons with roles

### All events can be sourced
Every event row can have one or more citations via `citations.event_id`.

---

## Place Hierarchy (Swedish)

```
Sverige (country)
  └── Södermanlands län (county / province)
        └── Rönö härad (härad)
              └── Björkvik parish (parish)
                    └── Stensäter (farm)
```

A farm's `parent_place_id` points to its parish. A person's residence event points to the farm directly. The hierarchy is traversable upward for display and search.
