# Plan: Genney Derby Database Import

## Goal

Import genealogy data from Genney's Apache Derby database into Släktforskning without requiring Java as a permanent dependency. Java (via Docker) is only needed during the import operation.

## Database Analysis

**Database**: Apache Derby, schema `LINDA_AHNSTEDT` inside `export-import/test/` (unencrypted)  
**Stats**: 833 persons, 207 families, 3008 events, 5910 citations, 519 sources, 273 SPLACE entries, 14 TODOs, 21 groups

### Key Tables

| Genney Table | Rows | Slaktforskning Target |
|---|---|---|
| `PERSON` | 833 | `persons` + `person_names` |
| `FAMILY` | 207 | `relationships` (type=couple) |
| `COUPLE_FAMILY` | 632 | `relationships` (type=parent_child) |
| `EVENT` | 3008 | `events` + `event_participants` |
| `SPLACE` | 273 | `places` (hierarchical) |
| `SOURCE` | 519 | `sources` |
| `CITATION` | 5910 | `citations` |
| `CITATION_SOURCE` | 5910 | citations.source_id |
| `OWNER_CITATION` | 4517 | citations.event_id / person_id |
| `MEDIA` | 4 | (deferred — media feature not yet built) |
| `GROUPS` | 21 | (deferred — groups not in schema) |
| `TODO` | 14 | (deferred — no todo table) |
| `REMARK` | 3 | persons.notes |

### Schema Quirks

- **PLACE table is empty** — all places are in `SPLACE` (integer PK, hierarchical)
- **EVENT.PLACE** = denormalized text string (e.g. "Skepperstad, Jönköpings län")
- **EVENT_PLACE** = join table linking EVENT.RID (varchar) → SPLACE.RID (integer)
- **SPLACE** has `PARENT` (integer FK to itself), `LATITUD`/`LONGITUD`, `NOTE`, archive references
- **PERSON.SEX**: 0 = female, 1 = male (not GEDCOM M/F)
- **Asterisk notation**: `PERSON.GIVENNAME = "Stig Ingvar* Raine"` → `given_name="Stig Ingvar Raine"`, `preferred_name="Ingvar"`
- **IDs**: Genney uses `I123` (persons), `F123` (families), `E123` (events), `S123` (sources), `C123` (citations), integer for SPLACE

### Field Mappings

#### PERSON → persons + person_names
```
PERSON.RID         → store in person_names (for cross-referencing during import)
PERSON.UID         → person_identifiers (type='other', for dedup)
PERSON.SEX         → persons.sex: 0→'F', 1→'M', null→'U'
PERSON.NOTE        → persons.notes
PERSON.GIVENNAME   → person_names.given_name (strip asterisk)
                     → person_names.preferred_name (word followed by asterisk)
PERSON.SURNAME     → person_names.surname
PERSON.NICKNAME    → person_names.nickname  (requires v0.6.8)
PERSON.PREFIX      → person_names.name_prefix
PERSON.SUFFIX      → person_names.name_suffix
PERSON.BIRTHDATE   → (see EVENT below — BIRT events are separate)
PERSON.DEATHDATE   → (see EVENT below — DEAT events are separate)
PERSON.FATHER      → (see COUPLE_FAMILY below)
PERSON.MOTHER      → (see COUPLE_FAMILY below)
```

#### FAMILY → relationships (type='couple')
```
FAMILY.HUSBAND     → relationship.person1_id
FAMILY.WIFE        → relationship.person2_id
FAMILY.NOTE        → relationship.notes
-- Marriage event: FAMILY.MARRIAGEID references EVENT.RID
-- Marriage subtype from SPOUSE_FAMILY.RELATIONTYPE: 3→'married', 1→'cohabitation', 2→'other'
```

#### COUPLE_FAMILY → relationships (type='parent_child')
```
COUPLE_FAMILY.PERSON → child person_id
COUPLE_FAMILY.FATHER → parent 1 person_id (create separate parent_child relationship)
COUPLE_FAMILY.MOTHER → parent 2 person_id (create separate parent_child relationship)
COUPLE_FAMILY.FATHERLINK / MOTHERLINK → relationship.subtype: 'birth'→'biological', 'adopted'→'adopted'
-- Note: one COUPLE_FAMILY row = potentially 2 parent_child relationships
```

#### EVENT → events + event_participants
```
EVENT.RID          → internal mapping
EVENT.TYPE         → events.event_type (BIRT→'birth', DEAT→'death', MARR→'marriage', etc.)
EVENT.DATE         → events.date_original, parsed into date_type+date_value
EVENT.DESCRIPTION  → events.description
EVENT.NOTE         → events.description (append if both exist)
EVENT.PLACE        → events.place_id (lookup from SPLACE via EVENT_PLACE join)
EVENT.OWNER        → event_participants: Ixxxx→person, Fxxxx→relationship
-- For person events: add event_participant (role='primary')
-- For family events: link to relationship_id
```

#### SPLACE → places
```
SPLACE.RID         → internal mapping (integer)
SPLACE.NAME        → places.name
SPLACE.PARENT      → places.parent_place_id (self-referential)
SPLACE.LATITUD     → places.latitude (REAL, 0.0 = unset)
SPLACE.LONGITUD    → places.longitude (REAL, 0.0 = unset)
SPLACE.NOTE        → places.notes
SPLACE.TYPE        → places.place_type: 2→'parish', 25→'other' (enum TBD)
-- Only import SPLACE records actually referenced by EVENT_PLACE
-- Import parents recursively
```

#### SOURCE → sources
```
SOURCE.TITLE       → sources.title
SOURCE.AUTHOR      → sources.author
SOURCE.PUBLICATION → sources.publication_info
SOURCE.ABBREVIATION→ sources.title (if title is empty)
SOURCE.MEDIATYPE   → sources.source_type (map to our enum)
SOURCE.NOTE        → (append to publication_info or discard)
```

#### CITATION → citations
```
CITATION.WHEREINTEXT → citations.page
CITATION.TEXT        → citations.transcription
CITATION.NOTE        → citations.notes
CITATION.CERTAINTY   → citations.confidence: -1→0, 0→0, 1→1, 2→2, 3→3
CITATION.DATE        → citations.date_accessed
CITATION_SOURCE.SOURCE → citations.source_id
OWNER_CITATION.OWNER → if Exxxx: citations.event_id
                       if Ixxxx: citations.person_id
                       if Fxxxx: citations.relationship_id
```

## Java Dependency Strategy

### No permanent requirement — three approaches

**Option A: Docker (recommended, cleanest)**
- Docker is already installed on this machine
- Pull `eclipse-temurin:21-jdk-alpine` once (~200MB), reuse for all imports
- The 3 Derby jars total ~3.8MB — download at import time or bundle in repo
- Zero Java on host
- Works in CI/CD and on user machines that have Docker

**Option B: brew install temurin (simpler UX, temporary)**
```bash
brew install --cask temurin@21
# ... run import ...
brew uninstall --cask temurin@21  # optional cleanup
```
~300MB download, ~10 min install. User can uninstall after.

**Option C: Bundle JRE in app (seamless UX)**
- Download a ~50MB JRE and bundle in Electron app resources
- Only loads for Derby import, not for normal operation
- Adds 50MB to app size permanently

**Recommendation**: Implement Docker path first. If user doesn't have Docker, fall back to prompting for GEDCOM export from Genney instead.

## Implementation Plan

### Phase 1 — Derby extractor (Java, Docker-based)

Write a standalone Java extractor that:
1. Connects to Derby database (embedded, read-only)
2. Exports all tables as newline-delimited JSON to stdout
3. Accepts `--db-path` and `--schema` arguments

**File**: `src/import/genney/DerbyExtractor.java` (checked into repo as source)
**Jars**: `derby.jar`, `derbyshared.jar`, `derbytools.jar` — downloaded to `src/import/genney/lib/` at import time (or pre-downloaded)

**Docker invocation** (Node.js shells out):
```bash
docker run --rm \
  -v "$DB_PATH:/derby/db:ro" \
  -v "$JARS_DIR:/jars:ro" \
  -v "$OUTPUT_DIR:/output" \
  eclipse-temurin:21-jdk-alpine \
  sh -c "javac -cp '/jars/*' /jars/DerbyExtractor.java -d /output && java -cp '/output:/jars/*' DerbyExtractor --db-path /derby/db --schema LINDA_AHNSTEDT"
```

### Phase 2 — Transform & import script

**File**: `src/import/genney/transform.ts` (Node.js/TypeScript, no Java)

Steps:
1. Read JSON output from Phase 1
2. Map Genney IDs (I123, F123, etc.) to UUID map
3. Import in dependency order:
   a. SPLACE (recursive, parent before child)
   b. PERSON → persons + person_names
   c. FAMILY → relationships (couple)
   d. COUPLE_FAMILY → relationships (parent_child)
   e. EVENT → events + event_participants
   f. SOURCE → sources
   g. CITATION → citations
4. Write summary: N persons, M families, K events imported

### Phase 3 — UI integration

Add "Importera från Genney" option to the database menu or import dialog:
1. Prompt user to select Derby database directory
2. Auto-detect schema name (list non-SYS schemas)
3. Show progress and summary
4. If Docker not available: show message directing to GEDCOM export

### Phase 4 — .gcc / .backup support

`.gcc` files are ZIP archives containing the Derby database folder plus GEDCOM exports and media. Add support to:
1. Unzip to temp dir
2. Detect if Derby DB is encrypted (read `service.properties`)
3. If unencrypted: run Phase 1-2 on extracted DB
4. If encrypted: fall back to the newest GEDCOM in the archive's `gedcom/` folder

## Files to Create/Modify

- `src/import/genney/DerbyExtractor.java` — Derby dump tool (new)
- `src/import/genney/transform.ts` — Genney→slaktforskning mapper (new)
- `src/import/genney/index.ts` — orchestrator: Docker check → extract → transform (new)
- `src/import/genney/lib/` — derby jars (downloaded, gitignored)
- `src/main/ipc.ts` — add `import:genney` IPC handler
- `src/preload/index.ts` — expose `window.api.import.genney()`
- `src/renderer/` — add import UI (DatabaseView or dedicated ImportView)

## Open Questions / Decisions

1. **Nickname (v0.6.8)**: The importer should import `PERSON.NICKNAME` → `nickname` column. This requires v0.6.8 to be implemented first. If importing before v0.6.8, drop nickname or store as note.
2. **SPLACE type mapping**: Genney SPLACE.TYPE is an integer (2=parish, 25=other known). Need full enum mapping or map to 'other' for unknown values.
3. **Media files**: Windows paths (`C:\Users\linda\...`) are unusable on Mac. Import metadata only; log unmappable paths. Deferred until media feature is built.
4. **Groups/TODOs**: No matching schema. Options: (a) create a tags/notes system first, (b) import as person notes.
5. **Deduplication**: If database already has persons from a previous GEDCOM import, the UID field can be used to match and merge.
6. **GEDCOM fallback**: The `genney.backup` contains GEDCOM exports. The newest `Linda_Ahnstedt_utf8_251105.ged` already works with the current importer. Document this as the simple path.

## Testing Strategy

1. Unit test the transform.ts against the sample data dumped above
2. Integration test: extract `export-import/test/` → count output matches Derby row counts
3. E2E test: import into fresh DB → verify person/event/citation counts
