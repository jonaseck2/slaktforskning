# Implementation: Show person ID in lists and PersonPanel

**Date:** 2026-05-05
**Branch strategy:** worktree (touches list, panel, sort logic, and a stable display-id question)
**Source:** Beta tester report 63 (v0.215.2)

## User goal

See a stable, sortable, glanceable identifier for every person — visible in the person list AND on PersonPanel. The user's two concrete use cases:

1. **Disambiguating duplicates while merging.** When two near-duplicate persons exist and they're partway through stitching them up, the user needs an at-a-glance identifier to confirm which row they're operating on. Names are duplicate-prone; the id is unique.
2. **Walking the whole database.** The user wants to be able to step through every person to perform a generic action; doing it family-by-family is hopeless. An id ordering enables a deterministic walk.

The user came from Holger, where person IDs are auto-incrementing integers visible everywhere. They're used to seeing them.

## Scope

Two paneled / listed surfaces, plus the data-model question of *what to display*.

### The data-model question (must be answered before implementation)

Person primary keys in this project are **UUIDv4** strings (per `.claude/rules/api.md`), e.g. `8f3a-4c12-…`. UUIDs are:
- ✅ unique, stable, never recycled
- ❌ not glanceable (32 hex chars)
- ❌ not sortable in a way the user can reason about
- ❌ not "+1 from the last person added"

The user's mental model is integer ids. UUIDs satisfy use case 1 (uniqueness) but fail at glanceable display, and they fail use case 2 (walking the database in id order doesn't equal creation order).

**Three options, decide before tasks:**

**Option A — show a short prefix of the UUID** (e.g. first 8 chars). Glanceable, no schema change, but prefix collisions are possible at scale and the value isn't ordered by creation.

**Option B — add a stable, visible `display_id` column** that's an auto-incrementing integer assigned at create time. Per-database scope (so import doesn't collide). New column on `persons`. Migration assigns values to existing rows ordered by `created_at`. This matches the user's Holger mental model exactly.

**Option C — show `created_at` formatted as date** as the disambiguator instead of an id. Solves use case 1 (different timestamps for two duplicates) without a new column. Doesn't satisfy use case 2.

**Recommended: Option B**, with deeper rationale:
- It's the only one that satisfies both use cases.
- The prime-directive risk is low: `display_id` is deterministic from `created_at` order at import time; it's not an inference about the person, it's an internal ordering label. (We already store `created_at` and `updated_at` — these aren't "inferred about the person" either; they're metadata. `display_id` is the same kind.)
- Holger users (the target audience) read it as expected.

If picking B, register `display_id` in `gedcom_fidelity_registry.ts` as `excluded:internal-ordering-id` (per the round-trip directive) since it's not GEDCOM-representable and is re-assigned on import (deterministically by `created_at` order).

### File scope

- `src/api/schema.ts` — add column + migration (Option B).
- `src/api/persons.ts` — `createPerson` assigns `display_id`, `listPersonsPage` selects it.
- `src/api/gedcom_fidelity_registry.ts` — register `display_id` as `excluded:internal-ordering-id`.
- `src/renderer/views/PersonsListTab.vue` — add `Id` column, sortable.
- `src/renderer/components/PersonPanel.vue` (or a sub-section like `PersonDetailsSection.vue`) — display `Id: <n>` discreetly in the header or the top of the panel body.
- All imports (`gedcom`, `holger`, `genney`) — `display_id` is auto-assigned per `created_at`; importers don't need to set it; but verify they don't *block* it.
- Existing tests — `tests/unit/persons.spec.ts` add coverage for assignment + sort.

### Scope deviations

- Don't change UUID primary keys. They stay as the canonical foreign key. `display_id` is a *display-only*, per-database value.
- Don't show `display_id` in MCP tool output (LLMs should keep using UUIDs as canonical).
- Don't show `display_id` in chart boxes (visual clutter; not the point).
- Don't gate import on `display_id` collision — assignment is post-import in a single transaction.

## Design summary (assuming Option B)

### Schema

```sql
ALTER TABLE persons ADD COLUMN display_id INTEGER;
CREATE UNIQUE INDEX idx_persons_display_id ON persons(display_id) WHERE display_id IS NOT NULL;
```

Backfill on first run after migration:

```sql
UPDATE persons
SET display_id = (
  SELECT 1 + COUNT(*) FROM persons p2
  WHERE p2.created_at < persons.created_at
     OR (p2.created_at = persons.created_at AND p2.id < persons.id)
);
```

(Wrap in `BEGIN IMMEDIATE` per `.claude/rules/api.md` bulk-write rules.)

### Assignment on create

`createPerson(db, data)` after inserting the row assigns:

```sql
UPDATE persons SET display_id = (SELECT COALESCE(MAX(display_id), 0) + 1 FROM persons) WHERE id = ?
```

(Inside the same transaction the importer/UI uses, so two concurrent creates don't collide. The UNIQUE index catches collision regardless.)

### Renderer

PersonsListTab: new column `Id` between the avatar and Förnamn, width ~60px, monospace font, right-aligned. Sortable (`sortBy = 'display_id'` → `ORDER BY display_id ASC/DESC`).

PersonPanel: small `<span class="person-display-id">#{{ displayId }}</span>` in the header band, near the entity-color label.

### i18n

`persons.idColumnHeader: "Id"` (universal label, no translation), `persons.displayIdLabel: "Person-ID"` for the panel.

## Tasks

- [ ] **Decide A/B/C** with user before implementing. (Default: B.)
- [ ] **Schema migration** (`schema.ts`): add column + unique index + backfill in `BEGIN IMMEDIATE` transaction.
- [ ] **Registry entry** (`gedcom_fidelity_registry.ts`): add `display_id` row.
- [ ] **API:** `createPerson` assigns; `listPersonsPage` selects + sorts; `getPerson` returns it.
- [ ] **PersonsListTab:** new column, sortable.
- [ ] **PersonPanel header** (`PersonPanel.vue`): show `#<n>` in the header band.
- [ ] **i18n keys** in both locales.
- [ ] **Unit tests:** create three persons in order, assert `display_id` = 1,2,3; sort `desc` returns 3,2,1; merge of person 2 into person 1 leaves 1 with id=1 and removes id=2 (verify). Migration assigns values matching `created_at` order on a seeded fixture.
- [ ] **Round-trip test:** seed with `display_id`, export to GEDCOM 5.5.1, re-import, assert the *new* `display_id`s are deterministic and correct (re-assigned by import order). The test asserts the registry's `excluded:internal-ordering-id` contract.
- [ ] **Minor bump** (new feature, schema change) + CHANGELOG: `- feat: each person has a stable, sortable display id; visible in list and panel`.

## Verification (user-observable)

1. Open Persons list. New `Id` column shows integers starting at 1, ordered as expected.
2. Click `Id` header. List sorts ascending. Click again — descending.
3. Open any person's panel. `#42` (or whatever) is visible in the header band.
4. Add a new person. Their `display_id` = (max + 1).
5. Merge two persons. The kept person retains its `display_id`; the deleted id is gone (not reused).
6. Export to GEDCOM 5.5.1. Re-import into an empty database. `display_id` values are re-assigned by import order — same set {1..N} but UUID→display_id mapping may differ. (This is fine; the contract is per-database stability, not cross-database.)

## Failure modes / RCA reference

- **Treating `display_id` as foreign key.** It's display-only, per-database. Foreign keys stay UUID. Catch in code review: any new `FK ... REFERENCES persons(display_id)` is a bug.
- **Race on create.** Two concurrent `createPerson` calls inside the same transaction with the `MAX + 1` pattern: SQLite serializes within a single connection, so it's safe; document the assumption. The unique index is the safety net.
- **Holger import skipping the assignment.** Importers must call `createPerson` (or assign `display_id` themselves in the same transaction) — never bypass via raw `INSERT INTO persons`. Audit every importer file.
- **Not in registry.** Adding the column without a `gedcom_fidelity_registry.ts` entry breaks CI per the round-trip directive — by design.
