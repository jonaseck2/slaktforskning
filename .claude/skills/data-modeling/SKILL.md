---
name: data-modeling
description: Design data schemas for genealogy apps — persons, families, events, sources, citations, media. Use for schema design, ERDs, modeling complex family structures, or any question about how the data model works in this project. Also triggers on questions about tables, foreign keys, relationships, or the GEDCOM-X vs GEDCOM alignment.
---

# Genealogy Data Modeling

This skill helps design robust data schemas for genealogy applications.

**For this project's actual implemented schema**, read `references/schema.md` (in this skill directory). The sections below cover general design principles that inform the schema.

---

## Core Design Philosophy

**Source-first, evidence-based genealogy.** Every claim should be traceable to a source. The model separates evidence (what sources say) from conclusions (what the researcher believes):

```
EVIDENCE LAYER:   sources → citations
CONCLUSION LAYER: persons, relationships, events, places
```

This model (Source → Citation → Event/Person) separates provenance from conclusions and is what separates research-grade genealogy from simple tree builders.

---

## Core Entities

### Person
The fundamental unit.
- `id` (UUID v4)
- Names: stored separately as `PersonName` (given, surname, name_type, date range, prefix, suffix, patronymic qualifier)
- Sex / gender, living flag (for privacy)
- External identifiers (FamilySearch ID, Ancestry ID, etc.)

**Design note:** A person can have multiple names over time. Store as a separate table, not flat fields. Swedish genealogy needs prefix/suffix/patronymic support (von Linné, Eriksson/Eriksdotter).

### Relationship (GEDCOM-X model — preferred)
A typed connection between two persons. Replaces the traditional "Family" entity.

- `id`
- `type`: couple, parent_child, sibling, godparent, other
- `person1_id`, `person2_id` — roles differ by type:
  - couple: both partners
  - parent_child: person1 = parent, person2 = child
  - sibling: either order
- `subtype`: for couple (marriage/civil_union/cohabitation/unknown), for parent_child (biological/adopted/foster/step/unknown)

**Why GEDCOM-X over the Family model:** No "Family" entity is needed — relationships between individuals are first-class. A person can be in multiple couples, have multiple parent-child relationships (biological + adoptive), and all relationships are queryable symmetrically.

**GEDCOM roundtrip:** On export, each `couple` relationship becomes a FAM record. `parent_child` relationships are emitted as FAM.CHIL entries.

### Event
Something that happened to one or more persons at a point in time.
- event_type (birth, death, marriage, divorce, baptism, immigration, census, etc.)
- Date model (see below)
- Place reference
- Links to persons via `EventParticipant` junction table (not a single person_id)

**Design note:** Events belong to persons via a participants table with roles (primary, spouse, parent, child, witness, godparent, officiant). A baptism can have the child as primary, parents as parent-role participants, and a godparent.

### Date model
Genealogy dates are uncertain. Never use a simple date field.
- `date_type`: exact, about, before, after, between, calculated, unknown
- `date_value`: ISO date (YYYY-MM-DD)
- `date_value_end`: for "between" only
- `date_original`: verbatim from source (e.g. "Midsommar 1742", "abt 1842")

### Place
Hierarchical. Swedish genealogy needs parish/härad/county structure.
- Name as recorded, normalized name for search/dedup
- `place_type`: country, province, county, härad, parish, farm, village, city, other
- `parent_place_id` for hierarchy (farm → parish → härad → county → country)
- Lat/long, date range (place names and boundaries change)
- Address fields (v0.5.3): `street`, `postal_code`, `city`, `country` — all nullable TEXT; align with GEDCOM-X `Address` on `PlaceDescription`. In GEDCOM 5.5.1 these map to `ADR1`/`CITY`/`POST`/`CTRY` on the containing event's `ADDR` structure.

### Source
A physical or digital document, record, or artifact.
- title, author, publication_info, repository, url
- `source_type`: vital_record, census, church_record, newspaper, photograph, oral_history, letter, legal_document, military_record, immigration_record, book, online_database, other

### Citation
Links a source (at a specific location) to any conclusion-layer entity. One citation can simultaneously point to a person, event, relationship, and place.
- `source_id` + page/location
- Confidence: 0=unreliable, 1=questionable, 2=secondary, 3=primary (GEDCOM QUAY)
- Transcription (verbatim text)
- FK to event, person, relationship, and/or place (all nullable, SET NULL on delete)

---

## Tricky edge cases

- **Unknown parents:** Relationship can have person1 or person2 null (parent unknown)
- **Same-sex couples:** person1/person2 have no gender assumption
- **Plural marriages:** A person can be in multiple couple relationships
- **Conflicting information:** Multiple citations for the same fact is valid — evidence conflict is a research finding
- **Patronymics:** Swedish pre-1963 surnames derived from father's given name (Erik → son: Eriksson, daughter: Eriksdotter). Model with `patronymic_base` + `name_qualifier`
- **Noble particles:** "von", "af", "de la" → `name_prefix`
- **Living persons:** `living` flag suppresses details in public-facing views

---

## Output format for schema design

When designing a schema, produce:

1. **Entity list** with key fields and data types
2. **ERD** as ASCII or Mermaid `erDiagram`
3. **Design decisions** — explain why the model is shaped the way it is
4. **SQL DDL** or TypeScript interfaces as appropriate
5. **GEDCOM mapping** — how entities map to GEDCOM 5.5.1 tags

## GEDCOM compatibility

When designing new entities, consider how they map to GEDCOM 5.5.1 tags (for broad compatibility). See the `/gedcom` skill for tag details. Entities without a standard GEDCOM equivalent should use `_`-prefixed custom tags to remain interoperable.

---

## SQLite bulk-write performance — mandatory rules

Any operation that writes more than ~50 rows **must** use a single transaction. Without this, each `db.prepare().run()` call is its own autocommit, triggering an individual WAL flush to disk. For 800 persons + 5900 citations this produces hundreds of MB of disk writes and takes minutes instead of seconds.

### Rule 1 — Wrap batch writes in one transaction

```typescript
db.exec('BEGIN IMMEDIATE');
try {
  for (const row of rows) createThing(db, row);
  db.exec('COMMIT');
} catch (err) {
  try { db.exec('ROLLBACK'); } catch { /* ignore */ }
  throw err;
}
```

`BEGIN IMMEDIATE` acquires the write lock upfront (avoids upgrade deadlocks). Use it for any import or migration that writes multiple rows.

### Rule 2 — Keep CPU work off the main Electron process

`JSON.parse`, bulk data transformation, and long loops block the Node.js event loop in the Electron main process, freezing the UI. For any operation that takes more than ~0.5s:

**JSON parsing of large outputs** — move to a `worker_threads` Worker (eval mode requires no build changes):

```typescript
import { Worker } from 'worker_threads';

const WORKER_CODE = `
const { workerData, parentPort } = require('worker_threads');
// ... CPU-intensive work here ...
parentPort.postMessage(result);
`;

function runInWorker(data: unknown): Promise<Result> {
  return new Promise((resolve, reject) => {
    const w = new Worker(WORKER_CODE, { eval: true, workerData: data });
    w.once('message', resolve);
    w.once('error', reject);
  });
}
```

**Child processes** (Docker, shell commands): always use async `spawn`, never `spawnSync`. The sync variant blocks the event loop for the entire child process duration.

### Why this keeps coming up

This was independently discovered twice — once during GEDCOM import and once during Genney Derby import. The pattern is always the same: import works fine for small test datasets, then hangs for minutes on real data. The fix is always: (1) wrap in transaction, (2) move CPU work off main thread.

---

## Project schema reference

Read `references/schema.md` for the full column-level schema of this project, including the GEDCOM 5.5.1 mapping table, event type list, and Swedish place hierarchy.
