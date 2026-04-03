# Plan: Tilltalsnamn (Preferred/Call Name)

## Background

In Swedish naming tradition a person may have several given names — e.g. *Eva Linda Marie* — but one of them is the **tilltalsnamn**: the name they actually go by in everyday life. The tilltalsnamn is formally recorded in Folkbokföringen (the Swedish population register) and often underlined in old church records.

**Concrete example that motivated this feature:**  
Linda Ahnstedt's legal name is *Eva Linda Marie Ahnstedt* — her tilltalsnamn is *Linda*. Without this concept the app must either store "Linda" as the given name (losing the full legal name) or store "Eva Linda Marie" (making every display show the wrong name).

## Goal

Store and display the tilltalsnamn so that:
- The full legal name is preserved in `given_name` (e.g. "Eva Linda Marie")
- The tilltalsnamn (e.g. "Linda") drives all display, sorting, and search
- The UI makes it easy to set and see which name a person goes by

## Data Model Change

Add one nullable text column to `person_names`:

```
call_name TEXT  -- the specific given name used in daily life, e.g. "Linda"
```

Applied via an idempotent migration at the end of `initializeSchema()` (same pattern as the v0.3.1 migration for `name_prefix` etc.): check `PRAGMA table_info(person_names)`, add column if missing.

### `PersonName` type update

```typescript
PersonName {
  ...existing fields...
  call_name: string | null   // preferred given name within given_name, e.g. "Linda"
}
```

`call_name` is only meaningful on the `birth` name row. It is NULL for married/alias/aka names.

## Implementation Steps

- [ ] **1. Schema** — add `call_name TEXT` to `CREATE TABLE person_names` DDL + idempotent migration in `initializeSchema()`
- [ ] **2. Types** — add `call_name: string | null` to `PersonName` in `src/api/types.ts`
- [ ] **3. API** — update `addPersonName()` and `updatePersonName()` in `src/api/persons.ts` to accept/persist `call_name`; update `listPersons()` and `searchPersons()` to prefer `call_name` over the first token of `given_name` for the display column returned to callers. Add `getDisplayGivenName(name: PersonName): string` helper: returns `call_name ?? given_name?.split(' ')[0] ?? ''`
- [ ] **4. IPC** — expose `call_name` in `persons:addName` and `persons:updateName` handlers; update `persons:list` and `persons:search` responses
- [ ] **5. Preload** — no change needed (already passes all fields through)
- [ ] **6. MCP** — add `call_name: z.string().optional()` to `add_person_name` and `update_person_name` tool schemas in `createServer.ts`; bump server version
- [ ] **7. Vue — PersonDetailView name row** — show `call_name` in the name editor. In the name list, visually distinguish the tilltalsnamn (underline or bold the matching token in the full given name). Add a "Tilltalsnamn" input field in the name edit form (only shown when `name_type === 'birth'`)
- [ ] **8. Vue — list/search display** — PersonsView table and PersonPicker autocomplete should show `call_name + surname` as the display name rather than the raw `given_name`; show the full `given_name` in a smaller secondary line where space allows
- [ ] **9. Unit tests** — update `tests/unit/persons.test.ts`: test that `call_name` is stored/retrieved; test `getDisplayGivenName()` fallback chain; test that `listPersons` returns the call name
- [ ] **10. MCP tests** — update `tests/unit/mcp.test.ts`: test setting `call_name` via `add_person_name` and `update_person_name`
- [ ] **11. Docs** — update `CLAUDE.md` (`PersonName` type table), `DATA_MODEL.md`, `MCP.md` tool descriptions, `PLAN.md`

## Display Rules

| Context | Shows |
|---------|-------|
| Person list (PersonsView) | `call_name ?? first token of given_name` + surname |
| PersonPicker autocomplete | same as list |
| PersonDetailView header | `call_name ?? first token of given_name` + surname |
| PersonDetailView name row | Full `given_name`, with `call_name` token underlined; `call_name` in edit field |
| MCP tool output | Full `PersonName` object including `call_name` |

## Skills to Update

- **`add-feature`** — update the `PersonName` type reference in the skill to include `call_name`. Update the "Shared components to reuse" section to note that PersonPicker and PersonsView list now show `call_name` as the display name.
- **`data-modeling`** — add a "Tilltalsnamn" subsection under Person Names explaining the Swedish concept, the `call_name` column, and the display fallback chain (`call_name → first token of given_name`).
- **`gedcom`** — add mapping: `_TILLTALSNAMN` tag on `NAME` record → `call_name`; document the convention that the first given name is the tilltalsnamn by default in GEDCOM 5.5.1.

## GEDCOM Mapping

- **Import (GEDCOM 5.5.1):** The `1 NAME` tag encodes the preferred name as `Given /Surname/`. When the given part contains multiple words, the first word is typically the tilltalsnamn by convention — import it as `call_name`. Some exporters use `_TILLTALSNAMN` as a custom tag — support that too.
- **Export (GEDCOM 5.5.1):** Emit `_TILLTALSNAMN <call_name>` on the NAME record if set.

## What Does NOT Change

- `given_name` always stores the full legal given names (e.g. "Eva Linda Marie")
- Sorting in `listPersons` stays on `given_name` (secondary sort option deferred)
- The `name_type` field is unchanged; `call_name` is only meaningful on `birth` rows but is not enforced at DB level
