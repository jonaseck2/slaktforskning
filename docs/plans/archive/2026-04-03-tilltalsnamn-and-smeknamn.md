# Plan: Tilltalsnamn via asterisk + Smeknamn (nickname) separation

## Goal

Separate the concepts of *tilltalsnamn* (calling name / preferred given name) and
*smeknamn* (nickname) in both the data model and the UI. Currently GEDCOM NICK
is mapped to preferred_name, which conflates the two.

---

## Target behaviour

| Concept | Example | GEDCOM | DB field | Display |
|---------|---------|--------|----------|---------|
| Tilltalsnamn | "Sanna" in "Susanna Sanna* Kristina" | asterisk in NAME | preferred_name | Sanna underlined |
| Smeknamn | "Sanna" for Susanna | NICK | nickname (new column) | Susanna "Sanna" Johansson |

---

## What changes

### Step 1 — Schema: add nickname column to person_names

src/api/schema.ts — add to the CREATE TABLE person_names block:
  nickname TEXT

Migration guard at end of initializeSchema():
  // v0.6.8 nickname
  const cols = (db.prepare('PRAGMA table_info(person_names)').all([]) as Array<{ name: string }>).map(c => c.name);
  if (!cols.includes('nickname')) {
    db.exec('ALTER TABLE person_names ADD COLUMN nickname TEXT');
  }

### Step 2 — Types: add nickname to PersonName

src/api/types.ts: add  nickname: string | null  to PersonName interface.

### Step 3 — API: addPersonName / updatePersonName accept nickname

src/api/persons.ts — add nickname?: string | null to both functions and
include in INSERT/UPDATE SQL.

### Step 4 — Name input UI: asterisk notation hint + smeknamn field

PersonDetailView.vue:
- Existing preferred_name input: keep, update placeholder to hint asterisk
  usage (e.g. "t.ex. Sanna for Susanna Sanna* Kristina")
- Add new "Smeknamn" text input that saves to nickname field.

### Step 5 — Display: nameUtils.ts — show nickname in quotes

fullNameParts gains an optional nickname parameter (default null).
If nickname is set, append it after the last given-name token and before
the surname in double quotes:

  fullNameParts("Susanna", "Johansson", "Sanna", "Sanna")
  -> "Susanna \"Sanna\" Johansson"  (preferred "Sanna" underlined, then "Sanna" in quotes)

More realistic case where tilltalsnamn != nickname:
  fullNameParts("Anna Susanna Kristina", "Johansson", "Susanna", "Sanna")
  -> "Anna Susanna Kristina \"Sanna\" Johansson"

### Step 6 — PersonName component: nickname prop

PersonName.vue — add optional nickname?: string | null prop, pass to fullNameParts.
Update all <PersonName> usages that have access to nickname.

### Step 7 — GEDCOM import: re-map NICK to nickname

src/gedcom/importer.ts:
- NICK subtag -> store as nickname (not preferred_name)
- Asterisk in NAME -> preferred_name (unchanged)
- Genney asterisk still sets preferred_name

### Step 8 — GEDCOM export: emit both

src/gedcom/exporter.ts:
- nickname -> NICK tag (standard GEDCOM compat)
- preferred_name -> asterisk in NAME value (Genney compat) AND _TILLTALS custom tag

On re-import of our own export:
- NICK -> nickname
- _TILLTALS -> preferred_name
- Asterisk in NAME -> preferred_name (Genney compat path, unchanged)

### Step 9 — MCP tools: update add_person_name / update_person_name

Add nickname parameter to both tools Zod schemas in src/mcp/createServer.ts.

### Step 10 — Unit tests

- addPersonName stores and retrieves nickname
- fullNameParts with nickname renders nickname in quotes
- Import: NICK -> nickname, asterisk -> preferred_name
- Export roundtrip: nickname -> NICK -> re-imported as nickname

---

## Files changed

- [x] src/api/schema.ts — nickname column + migration
- [x] src/api/types.ts — nickname on PersonName
- [x] src/api/persons.ts — accept nickname in add/update
- [x] src/renderer/utils/nameUtils.ts — fullNameParts nickname support
- [x] src/renderer/components/PersonName.vue — nickname prop
- [x] src/renderer/views/PersonDetailView.vue — Smeknamn input
- [x] src/renderer/i18n/sv.ts + en.ts — nickname/nicknamePlaceholder strings
- [x] src/gedcom/importer.ts — NICK → nickname, _TILLTALS → preferred_name
- [x] src/gedcom/exporter.ts — nickname → NICK, preferred_name → asterisk + _TILLTALS
- [x] src/mcp/createServer.ts — nickname in add/update_person_name tools
- [x] tests/unit/persons.test.ts — nickname tests
- [x] tests/unit/nameUtils.test.ts — new file, fullNameParts nickname tests
- [x] tests/unit/gedcom.test.ts — roundtrip tests updated + new NICK→nickname test
