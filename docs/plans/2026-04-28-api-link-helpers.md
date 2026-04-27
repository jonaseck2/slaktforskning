# API Link Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse ~15 nearly-identical "get linked entities" SQL queries (`getCitationsForPerson|Place|Event|Relationship|Source`, `getGroupsForPerson|Place|Media`, `getResearchTasksForPerson|Place|Media`, `getMediaForEntity` variants) into a small generic helper layer in `src/api/links.ts`. Public per-entity functions remain (so renderer/MCP callers don't change) but delegate to the helper.

**Architecture:** A single `getLinkedEntities(db, linkTable, entityType, entityId, options)` function knows how to query any of the polymorphic link tables (`group_links`, `task_links`, `media_links`, `citations`). The 15 existing per-entity functions become 5-line wrappers. Tests verify wrappers produce identical results to the originals on a seeded fixture.

**Tech Stack:** TypeScript, node-sqlite3-wasm, Vitest.

---

## Why this matters

The polymorphic-link pattern is repeated 15 times in `src/api/`:

| Domain | Functions | Files |
|---|---|---|
| Citations | `getCitationsForEvent`, `getCitationsForPerson`, `getCitationsForPlace`, `getCitationsForRelationship`, `getCitationsForSource` | `src/api/sources.ts` |
| Groups | `getGroupsForPerson`, `getGroupsForPlace`, `getGroupsForMedia` | `src/api/groups.ts:71-96` |
| Tasks | `getResearchTasksForPerson`, `getResearchTasksForPlace`, `getResearchTasksForMedia` | `src/api/research_tasks.ts:32-57` |
| Media | `getMediaForEntity` (already partly generic) | `src/api/media.ts` |

Each is "SELECT … FROM <link_table> WHERE entity_type = ? AND entity_id = ?" with the same JOIN to the parent table. A bug fix (e.g., adding sort_order ordering, or changing INNER to LEFT JOIN) must currently be applied in every copy.

After this refactor:
- One implementation owns the JOIN + sort + filter logic.
- Adding a new entity type that participates in groups/tasks/media is a 1-line change to the helper, not a new function in every domain file.
- Wrapper functions stay (public API unchanged) so MCP and IPC callers see no diff.

## File Structure

```
src/api/
├── links.ts                        # NEW — getLinkedEntities + types
├── sources.ts                      # MODIFIED — citations functions become wrappers
├── groups.ts                       # MODIFIED — getGroupsFor* become wrappers
├── research_tasks.ts               # MODIFIED — getResearchTasksFor* become wrappers
└── media.ts                        # MODIFIED — getMediaForEntity uses helper

tests/unit/
├── links.test.ts                   # NEW — direct helper tests
└── (existing per-domain tests stay green and prove no regression)
```

## Conventions

- Tests run with `npx vitest run <file>` against in-memory SQLite via `tests/unit/helpers.ts → createTestDb()`.
- Each task ends in `npm run lint && npx vitest run` green.
- Conventional commits: `feat(api):` for the new helper, `refactor(api):` for migrations.
- No public function signature changes — every wrapper preserves its existing shape so MCP tool definitions and IPC handlers don't need updating.

---

## Task 1: Define the helper

**Files:**
- Create: `src/api/links.ts`
- Create: `tests/unit/links.test.ts`

- [ ] **Step 1: Survey current implementations**

Read each of:
- `src/api/sources.ts` — find every `getCitationsFor*` function. Note their JOINs (citations → sources?), columns selected, ordering.
- `src/api/groups.ts:71-96` — `getGroupsForPerson|Place|Media`.
- `src/api/research_tasks.ts:32-57` — `getResearchTasksForPerson|Place|Media`.
- `src/api/media.ts` — `getMediaForEntity` (likely already generic).

Confirm shape: each query is `SELECT <parent>.* FROM <link_table> JOIN <parent> ON ... WHERE entity_type = ? AND entity_id = ? ORDER BY <link_table>.sort_order`.

Citations are slightly different: the citations table itself holds `event_id`, `person_id`, `relationship_id`, `place_id` columns (not a polymorphic `entity_type` + `entity_id` pair). Treat citations as a SEPARATE helper because the schema differs.

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/links.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { getLinkedEntities, getCitationsByOwner } from '../../src/api/links';
import * as groups from '../../src/api/groups';
import * as persons from '../../src/api/persons';
import * as sources from '../../src/api/sources';
import * as events from '../../src/api/events';

describe('getLinkedEntities', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('returns groups linked to a person via group_links', () => {
    const p = persons.createPerson(db, { sex: 'M', given_name: 'A', surname: 'B' });
    const g = groups.createGroup(db, { name: 'G1' });
    groups.addGroupLink(db, g.id, 'person', p.id);

    const result = getLinkedEntities(db, {
      linkTable: 'group_links',
      parentTable: 'groups',
      entityType: 'person',
      entityId: p.id,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(g.id);
    expect(result[0].name).toBe('G1');
  });

  it('respects sort_order on the link table', () => {
    const p = persons.createPerson(db, { sex: 'M', given_name: 'A', surname: 'B' });
    const g1 = groups.createGroup(db, { name: 'first' });
    const g2 = groups.createGroup(db, { name: 'second' });
    groups.addGroupLink(db, g2.id, 'person', p.id);
    groups.addGroupLink(db, g1.id, 'person', p.id);

    const result = getLinkedEntities(db, {
      linkTable: 'group_links',
      parentTable: 'groups',
      entityType: 'person',
      entityId: p.id,
    });
    expect(result.map(r => r.name)).toEqual(['second', 'first']);
  });
});

describe('getCitationsByOwner', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('returns citations linked via person_id column', () => {
    const p = persons.createPerson(db, { sex: 'F', given_name: 'C', surname: 'D' });
    const s = sources.createSource(db, { title: 'Census' });
    sources.createCitation(db, { source_id: s.id, person_id: p.id, page: '12' });

    const result = getCitationsByOwner(db, 'person', p.id);
    expect(result).toHaveLength(1);
    expect(result[0].source_id).toBe(s.id);
    expect(result[0].page).toBe('12');
  });

  it('returns citations linked via event_id column', () => {
    const p = persons.createPerson(db, { sex: 'F', given_name: 'E', surname: 'F' });
    const e = events.createEvent(db, { event_type: 'birth' });
    const s = sources.createSource(db, { title: 'BirthRec' });
    sources.createCitation(db, { source_id: s.id, event_id: e.id });

    const result = getCitationsByOwner(db, 'event', e.id);
    expect(result).toHaveLength(1);
    expect(result[0].source_id).toBe(s.id);
  });
});
```

- [ ] **Step 3: Run test, see it fail**

```
npx vitest run tests/unit/links.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the polymorphic helper**

```ts
// src/api/links.ts
import type { Database } from 'node-sqlite3-wasm';

type PolymorphicEntityType = 'person' | 'place' | 'media' | 'event' | 'source' | 'relationship';

interface GetLinkedEntitiesArgs {
  linkTable: 'group_links' | 'task_links' | 'media_links';
  parentTable: 'groups' | 'research_tasks' | 'media';
  entityType: PolymorphicEntityType;
  entityId: string;
  /** Extra columns from the link table to expose on the result. */
  linkColumns?: string[];
}

export function getLinkedEntities<T = Record<string, unknown>>(
  db: Database,
  args: GetLinkedEntitiesArgs
): T[] {
  const linkAlias = 'l';
  const parentAlias = 'p';
  const extraCols = (args.linkColumns ?? [])
    .map(c => `${linkAlias}.${c} AS link_${c}`)
    .join(', ');
  const sql =
    `SELECT ${parentAlias}.*${extraCols ? ', ' + extraCols : ''} ` +
    `FROM ${args.linkTable} ${linkAlias} ` +
    `JOIN ${args.parentTable} ${parentAlias} ON ${parentAlias}.id = ${linkAlias}.${args.parentTable === 'groups' ? 'group_id' : args.parentTable === 'research_tasks' ? 'task_id' : 'media_id'} ` +
    `WHERE ${linkAlias}.entity_type = ? AND ${linkAlias}.entity_id = ? ` +
    `ORDER BY ${linkAlias}.sort_order`;
  const stmt = db.prepare(sql);
  return stmt.all([args.entityType, args.entityId]) as T[];
}
```

- [ ] **Step 5: Implement the citations helper (different schema)**

```ts
// src/api/links.ts (continued)
type CitationOwnerType = 'person' | 'place' | 'event' | 'relationship' | 'source';

const CITATION_FK_COLUMN: Record<CitationOwnerType, string> = {
  person:       'person_id',
  place:        'place_id',
  event:        'event_id',
  relationship: 'relationship_id',
  source:       'source_id',
};

export function getCitationsByOwner<T = Record<string, unknown>>(
  db: Database,
  ownerType: CitationOwnerType,
  ownerId: string
): T[] {
  const col = CITATION_FK_COLUMN[ownerType];
  const stmt = db.prepare(
    `SELECT * FROM citations WHERE ${col} = ? ORDER BY created_at`
  );
  return stmt.all([ownerId]) as T[];
}
```

- [ ] **Step 6: Run test, see it pass**

```
npx vitest run tests/unit/links.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```
git add src/api/links.ts tests/unit/links.test.ts
git commit -m "feat(api): add polymorphic link query helpers"
```

---

## Task 2: Migrate groups.ts

**Files:**
- Modify: `src/api/groups.ts:71-96`
- Existing: `tests/unit/groups.test.ts` must stay green.

- [ ] **Step 1: Run baseline tests**

```
npx vitest run tests/unit/groups.test.ts
```

Record pass count. All must remain green at end.

- [ ] **Step 2: Replace bodies with helper calls**

```ts
// src/api/groups.ts
import { getLinkedEntities } from './links';
import type { Group } from './types';

export function getGroupsForPerson(db: Database, personId: string): Group[] {
  return getLinkedEntities<Group>(db, {
    linkTable: 'group_links', parentTable: 'groups',
    entityType: 'person', entityId: personId,
  });
}
export function getGroupsForPlace(db: Database, placeId: string): Group[] {
  return getLinkedEntities<Group>(db, {
    linkTable: 'group_links', parentTable: 'groups',
    entityType: 'place', entityId: placeId,
  });
}
export function getGroupsForMedia(db: Database, mediaId: string): Group[] {
  return getLinkedEntities<Group>(db, {
    linkTable: 'group_links', parentTable: 'groups',
    entityType: 'media', entityId: mediaId,
  });
}
```

Delete the original 26-line implementations.

- [ ] **Step 3: Run tests**

```
npx vitest run tests/unit/groups.test.ts
```

Expected: same pass count as baseline. If a test fails, the new helper's ORDER BY differs from the original — adjust.

- [ ] **Step 4: Commit**

```
git add src/api/groups.ts
git commit -m "refactor(api): groups link queries delegate to getLinkedEntities"
```

---

## Task 3: Migrate research_tasks.ts

Same pattern as Task 2. Three functions become 3-line wrappers. Run baseline → refactor → run again. Commit `refactor(api): research_tasks link queries delegate to getLinkedEntities`.

---

## Task 4: Migrate sources.ts citations

**Files:**
- Modify: `src/api/sources.ts` (5 `getCitationsFor*` functions)

- [ ] **Step 1: Baseline**

```
npx vitest run tests/unit/sources.test.ts
```

- [ ] **Step 2: Replace each function body with `getCitationsByOwner`:**

```ts
import { getCitationsByOwner } from './links';

export function getCitationsForEvent(db: Database, eventId: string): Citation[] {
  return getCitationsByOwner<Citation>(db, 'event', eventId);
}
export function getCitationsForPerson(db: Database, personId: string): Citation[] {
  return getCitationsByOwner<Citation>(db, 'person', personId);
}
export function getCitationsForPlace(db: Database, placeId: string): Citation[] {
  return getCitationsByOwner<Citation>(db, 'place', placeId);
}
export function getCitationsForRelationship(db: Database, relId: string): Citation[] {
  return getCitationsByOwner<Citation>(db, 'relationship', relId);
}
export function getCitationsForSource(db: Database, sourceId: string): Citation[] {
  return getCitationsByOwner<Citation>(db, 'source', sourceId);
}
```

- [ ] **Step 3: Run tests, ensure baseline matches**

- [ ] **Step 4: Commit**

```
git add src/api/sources.ts
git commit -m "refactor(api): citations queries delegate to getCitationsByOwner"
```

---

## Task 5: Migrate media.ts

`getMediaForEntity` already takes `entityType` and `entityId` parameters but reimplements the JOIN inline. Refactor to call `getLinkedEntities`:

```ts
export function getMediaForEntity(
  db: Database, entityType: string, entityId: string
): (Media & { link_id: string; link_type: string | null; sort_order: number })[] {
  return getLinkedEntities(db, {
    linkTable: 'media_links',
    parentTable: 'media',
    entityType: entityType as PolymorphicEntityType,
    entityId,
    linkColumns: ['id', 'link_type', 'sort_order'],
  });
}
```

The result rows have `link_id` (from `link_id`), `link_link_type`, `link_sort_order` — adjust the helper output naming if existing tests expect specific keys. Easiest: tweak `getLinkedEntities` to optionally rename `link_id` → `link_id` (drop the `link_` prefix on `id`).

Run `tests/unit/media.test.ts`. Commit.

---

## Task 6: Sweep for any remaining duplicates

- [ ] **Step 1:** Grep for likely siblings:
```
grep -RIn "FROM group_links\\|FROM task_links\\|FROM media_links" src/api
grep -RIn "WHERE entity_type" src/api
```

- [ ] **Step 2:** Any non-test hits outside `links.ts` are migration candidates. Move them.
- [ ] **Step 3:** `npx vitest run` (full unit suite) green. Commit `refactor(api): consolidate remaining polymorphic link queries`.

---

## Task 7: Update CLAUDE.md

- [ ] **Step 1:** In the "API Functions" section, add a brief subsection at the top:

```
### links.ts
getLinkedEntities(db, { linkTable, parentTable, entityType, entityId }) → T[]
getCitationsByOwner(db, ownerType, ownerId) → Citation[]
```

- [ ] **Step 2:** Note that `getGroupsFor*`, `getResearchTasksFor*`, `getCitationsFor*`, `getMediaForEntity` all delegate to these helpers — domain-specific functions remain as the public API.

- [ ] **Step 3:** Commit `docs: document link helpers in CLAUDE.md`.

---

## Self-review checklist

- [ ] Every `getXFor<EntityType>` function in `groups.ts`, `research_tasks.ts`, `sources.ts` is now ≤5 lines.
- [ ] `npx vitest run` is green with no behaviour changes (existing per-domain tests cover the wrappers).
- [ ] No public API signature changed — IPC handlers and MCP tools needed no edits.
- [ ] CLAUDE.md mentions `links.ts`.

## Out of scope (for follow-up plans)

- Adding NEW entity types to the polymorphic link tables. The helper makes this trivial but the schema changes are a separate decision.
- Pagination / filtering options on the helper. Add only when a caller needs them.
- IPC channel registry (see `2026-04-28-ipc-channel-registry.md`).
- Panel composables (see `2026-04-28-panel-composables.md`).
