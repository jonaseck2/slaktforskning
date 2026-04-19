# PersonPicker Relation Hint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a grey-italic disambiguation hint (direct relationship to tree's `default_person_id` + birth/death years) next to each person in the `PersonPicker` autocomplete dropdown.

**Architecture:** Extend `searchPersons` in `src/api/persons.ts` to accept an optional `relateeId` and enrich each result with `relation_role`, `birth_year`, `death_year` via correlated subselects. Thread the optional arg through IPC → preload → `window.api.persons.search`. In the renderer, cache `default_person_id` once via a small composable, pass it on every search, and render the hint after the name.

**Tech Stack:** TypeScript, node-sqlite3-wasm, Vue 3 Composition API, vue-i18n.

**Spec:** `docs/superpowers/specs/2026-04-19-person-picker-relation-hint-design.md`

---

## File Map

- **Create:** `tests/unit/persons-search-hint.test.ts` — unit tests for extended `searchPersons`
- **Modify:** `src/api/persons.ts` — extend `searchPersons` signature, add subselects
- **Modify:** `src/main/ipc/persons.ts` — forward optional `relateeId` arg
- **Modify:** `src/preload/index.ts` — accept second arg
- **Modify:** `src/renderer/api.d.ts` — update `persons.search` signature (if typed there)
- **Create:** `src/renderer/composables/useDefaultPerson.ts` — cached fetch + reset helper
- **Modify:** `src/renderer/views/DatabaseView.vue` — call `resetDefaultPersonId()` after set/clear
- **Modify:** `src/renderer/components/import/ArchiveSection.vue` — call reset after set
- **Modify:** `src/renderer/components/import/HolgerImportSection.vue` — call reset after set
- **Modify:** `src/renderer/components/import/GedcomImportSection.vue` — call reset after set
- **Modify:** `src/renderer/components/PersonPicker.vue` — use composable, render hint, screen-reader narration
- **Modify:** `src/renderer/i18n/en.ts` — add `picker.relation.*` keys
- **Modify:** `src/renderer/i18n/sv.ts` — add `picker.relation.*` keys
- **Modify:** `package.json` — bump to 0.121.0
- **Modify:** `docs/PLAN.md` — add v0.121.0 roadmap row

No schema changes, no new IPC channels, no new database tables.

---

## Task 1: Unit tests for extended `searchPersons`

**Files:**
- Create: `tests/unit/persons-search-hint.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/persons-search-hint.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'node-sqlite3-wasm';
import { createTestDb } from './helpers';
import { createPerson, searchPersons } from '../../src/api/persons';
import { createRelationship, addEventParticipant } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';

describe('searchPersons hint enrichment', () => {
  let db: Database;
  beforeEach(() => { db = createTestDb(); });

  it('returns null relation_role when relateeId is null', () => {
    createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const results = searchPersons(db, 'Per', null);
    expect(results).toHaveLength(1);
    expect(results[0].relation_role).toBeNull();
  });

  it('returns null relation_role when relateeId is omitted', () => {
    createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const results = searchPersons(db, 'Per');
    expect(results[0].relation_role).toBeNull();
  });

  it('labels a parent (candidate is person1 in parent_child with relatee as person2)', () => {
    const parent = createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const child = createPerson(db, { given_name: 'Anna', surname: 'Persson' });
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });
    const results = searchPersons(db, 'Per', child.id);
    expect(results[0].relation_role).toBe('parent');
  });

  it('labels a child (candidate is person2 in parent_child with relatee as person1)', () => {
    const parent = createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const child = createPerson(db, { given_name: 'Anna', surname: 'Persson' });
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });
    const results = searchPersons(db, 'Anna', parent.id);
    expect(results[0].relation_role).toBe('child');
  });

  it('labels a partner regardless of person1/person2 order', () => {
    const a = createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const b = createPerson(db, { given_name: 'Anna', surname: 'Andersson' });
    createRelationship(db, { type: 'couple', person1_id: a.id, person2_id: b.id });
    expect(searchPersons(db, 'Per', b.id)[0].relation_role).toBe('partner');
    expect(searchPersons(db, 'Anna', a.id)[0].relation_role).toBe('partner');
  });

  it('labels siblings bidirectionally', () => {
    const a = createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const b = createPerson(db, { given_name: 'Anna', surname: 'Persson' });
    createRelationship(db, { type: 'sibling', person1_id: a.id, person2_id: b.id });
    expect(searchPersons(db, 'Per', b.id)[0].relation_role).toBe('sibling');
    expect(searchPersons(db, 'Anna', a.id)[0].relation_role).toBe('sibling');
  });

  it('labels godparent', () => {
    const gp = createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const child = createPerson(db, { given_name: 'Anna', surname: 'Persson' });
    createRelationship(db, { type: 'godparent', person1_id: gp.id, person2_id: child.id });
    expect(searchPersons(db, 'Per', child.id)[0].relation_role).toBe('godparent');
  });

  it('returns null relation_role for "other" relationship type', () => {
    const a = createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const b = createPerson(db, { given_name: 'Anna', surname: 'Persson' });
    createRelationship(db, { type: 'other', person1_id: a.id, person2_id: b.id });
    expect(searchPersons(db, 'Per', b.id)[0].relation_role).toBeNull();
  });

  it('extracts birth_year and death_year from primary-participant events', () => {
    const p = createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const birth = createEvent(db, { event_type: 'birth', date_value: '1919-05-12' });
    addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    const death = createEvent(db, { event_type: 'death', date_value: '1985-11-02' });
    addEventParticipant(db, { event_id: death.id, person_id: p.id, role: 'primary' });
    const results = searchPersons(db, 'Per', null);
    expect(results[0].birth_year).toBe('1919');
    expect(results[0].death_year).toBe('1985');
  });

  it('returns null year fields when no events exist', () => {
    createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const results = searchPersons(db, 'Per', null);
    expect(results[0].birth_year).toBeNull();
    expect(results[0].death_year).toBeNull();
  });

  it('returns only birth_year when death event is missing', () => {
    const p = createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const birth = createEvent(db, { event_type: 'birth', date_value: '1919-05-12' });
    addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    const results = searchPersons(db, 'Per', null);
    expect(results[0].birth_year).toBe('1919');
    expect(results[0].death_year).toBeNull();
  });

  it('ignores events where participant role is not primary', () => {
    const p = createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const event = createEvent(db, { event_type: 'birth', date_value: '1919-05-12' });
    addEventParticipant(db, { event_id: event.id, person_id: p.id, role: 'witness' });
    const results = searchPersons(db, 'Per', null);
    expect(results[0].birth_year).toBeNull();
  });

  it('handles date_value of just YYYY', () => {
    const p = createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const event = createEvent(db, { event_type: 'birth', date_value: '1919' });
    addEventParticipant(db, { event_id: event.id, person_id: p.id, role: 'primary' });
    const results = searchPersons(db, 'Per', null);
    expect(results[0].birth_year).toBe('1919');
  });

  it('returns both dates and role together', () => {
    const parent = createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const child = createPerson(db, { given_name: 'Anna', surname: 'Persson' });
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });
    const birth = createEvent(db, { event_type: 'birth', date_value: '1919-01-01' });
    addEventParticipant(db, { event_id: birth.id, person_id: parent.id, role: 'primary' });
    const results = searchPersons(db, 'Per', child.id);
    expect(results[0].relation_role).toBe('parent');
    expect(results[0].birth_year).toBe('1919');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/persons-search-hint.test.ts`
Expected: multiple failures — `relation_role`, `birth_year`, `death_year` are `undefined` on the returned rows, and `searchPersons(db, 'Per', null)` errors because the third argument isn't accepted yet.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/unit/persons-search-hint.test.ts
git commit -m "test(persons): failing tests for searchPersons hint enrichment"
```

---

## Task 2: Extend `searchPersons` API

**Files:**
- Modify: `src/api/persons.ts` (around lines 87-118 — the existing `searchPersons` function)

- [ ] **Step 1: Update the signature and SQL**

Replace the entire existing `searchPersons` function with:

```ts
export function searchPersons(
  db: Database,
  query: string,
  relateeId?: string | null,
): (Person & {
  given_name: string;
  surname: string;
  preferred_name: string | null;
  nickname: string | null;
  relation_role: 'parent' | 'child' | 'partner' | 'sibling' | 'godparent' | null;
  birth_year: string | null;
  death_year: string | null;
})[] {
  // Split query into tokens so "Linda Ahnstedt" matches "Eva Linda* Marie f. Ahnstedt"
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  // Each token must match at least one name field (given_name, surname, preferred_name) on ANY name row
  const tokenClauses = tokens.map(() =>
    `EXISTS (
       SELECT 1 FROM person_names n
       WHERE n.person_id = p.id
         AND (n.given_name LIKE ? OR n.surname LIKE ? OR n.preferred_name LIKE ?)
     )`
  ).join(' AND ');
  const tokenParams = tokens.flatMap(t => { const l = `%${t}%`; return [l, l, l]; });

  // Relevance: prefix matches on surname/given_name score higher than substring matches
  const firstToken = `${tokens[0]}%`;
  const relevanceParams = [firstToken, firstToken];

  const relatee = relateeId ?? null;

  return queryAll<Person & {
    given_name: string;
    surname: string;
    preferred_name: string | null;
    nickname: string | null;
    relation_role: 'parent' | 'child' | 'partner' | 'sibling' | 'godparent' | null;
    birth_year: string | null;
    death_year: string | null;
  }>(db, `
    SELECT p.*, pn.given_name, pn.surname, pn.preferred_name, pn.nickname,
      (SELECT
          CASE
            WHEN r.type = 'parent_child' AND r.person1_id = p.id THEN 'parent'
            WHEN r.type = 'parent_child' AND r.person2_id = p.id THEN 'child'
            WHEN r.type = 'couple'       THEN 'partner'
            WHEN r.type = 'sibling'      THEN 'sibling'
            WHEN r.type = 'godparent'    THEN 'godparent'
            ELSE NULL
          END
         FROM relationships r
         WHERE ? IS NOT NULL
           AND (
             (r.person1_id = p.id AND r.person2_id = ?)
             OR (r.person2_id = p.id AND r.person1_id = ?)
           )
           AND r.type IN ('parent_child','couple','sibling','godparent')
         ORDER BY r.created_at
         LIMIT 1
      ) AS relation_role,
      (SELECT SUBSTR(e.date_value, 1, 4)
         FROM events e
         JOIN event_participants ep ON ep.event_id = e.id
         WHERE ep.person_id = p.id
           AND ep.role = 'primary'
           AND e.event_type = 'birth'
           AND e.date_value IS NOT NULL AND e.date_value <> ''
         ORDER BY e.date_value
         LIMIT 1
      ) AS birth_year,
      (SELECT SUBSTR(e.date_value, 1, 4)
         FROM events e
         JOIN event_participants ep ON ep.event_id = e.id
         WHERE ep.person_id = p.id
           AND ep.role = 'primary'
           AND e.event_type = 'death'
           AND e.date_value IS NOT NULL AND e.date_value <> ''
         ORDER BY e.date_value
         LIMIT 1
      ) AS death_year
    FROM persons p
    LEFT JOIN person_names pn ON pn.person_id = p.id AND pn.sort_order = (
      SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id
    )
    WHERE ${tokenClauses}
    ORDER BY
      CASE WHEN pn.given_name LIKE ? THEN 0 WHEN pn.surname LIKE ? THEN 0 ELSE 1 END,
      pn.surname, pn.given_name
    LIMIT 20
  `, [relatee, relatee, relatee, ...tokenParams, ...relevanceParams]);
}
```

Notes for the implementer:
- `relatee` is bound THREE times at the start of the param list (for the three `?` placeholders in the `relation_role` subselect). The first `?` is the `IS NOT NULL` guard; the second and third are the two match sides.
- When `relatee` is null, the `? IS NOT NULL` predicate is false in SQLite, so the subquery returns no rows and the SELECT yields `NULL`.
- The `r.type IN (...)` filter explicitly excludes `'other'` so it stays null (matches the spec's table).

- [ ] **Step 2: Run the unit tests**

Run: `npx vitest run tests/unit/persons-search-hint.test.ts`
Expected: all 14 tests pass.

- [ ] **Step 3: Run the full unit suite to confirm no regressions**

Run: `npx vitest run`
Expected: all existing tests still pass. If any existing test called `searchPersons` destructuring specific fields that weren't there before, they continue to work because added fields are additive.

- [ ] **Step 4: Commit**

```bash
git add src/api/persons.ts
git commit -m "feat(persons): searchPersons returns relation_role + birth/death years"
```

---

## Task 3: Thread `relateeId` through IPC, preload, and types

**Files:**
- Modify: `src/main/ipc/persons.ts` (line 12)
- Modify: `src/preload/index.ts` (line 23)
- Modify: `src/renderer/api.d.ts`

- [ ] **Step 1: Update the IPC handler**

In `src/main/ipc/persons.ts`, replace line 12:

```ts
  wrapHandler('persons:search', (query) => persons.searchPersons(getDb(), query as string));
```

with:

```ts
  wrapHandler('persons:search', (query, relateeId) =>
    persons.searchPersons(getDb(), query as string, (relateeId as string | null | undefined) ?? null)
  );
```

- [ ] **Step 2: Update preload bridge**

In `src/preload/index.ts`, replace line 23:

```ts
    search: (query: string) => ipcRenderer.invoke('persons:search', query),
```

with:

```ts
    search: (query: string, relateeId?: string | null) => ipcRenderer.invoke('persons:search', query, relateeId ?? null),
```

- [ ] **Step 3: Update api.d.ts if it types `persons.search`**

Read `src/renderer/api.d.ts` first:

```bash
grep -n "persons" src/renderer/api.d.ts
```

If a `search` entry exists under `persons`, update its signature to `search: (query: string, relateeId?: string | null) => Promise<...>` and add the three new fields to the return type. If no `persons.search` entry exists (the file may be sparse), skip this step — runtime is untyped and other call sites already cast results.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v node_modules | head -20`
Expected: no new errors. Existing callers that don't pass `relateeId` still compile because the new arg is optional.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/persons.ts src/preload/index.ts src/renderer/api.d.ts
git commit -m "feat(ipc): thread optional relateeId through persons.search bridge"
```

---

## Task 4: Add i18n keys

**Files:**
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`

- [ ] **Step 1: Add English keys**

In `src/renderer/i18n/en.ts`, find the top level of the default export. Add a new `picker` namespace (if not already present) alongside existing top-level namespaces like `nav`, `settings`, `media`:

```ts
  picker: {
    relation: {
      parent: 'parent',
      child: 'child',
      partner: 'partner',
      sibling: 'sibling',
      godparent: 'godparent',
    },
  },
```

If a `picker` namespace already exists, add just the nested `relation` object inside it.

- [ ] **Step 2: Add Swedish keys**

In `src/renderer/i18n/sv.ts`, add the mirror:

```ts
  picker: {
    relation: {
      parent: 'förälder',
      child: 'barn',
      partner: 'partner',
      sibling: 'syskon',
      godparent: 'fadder',
    },
  },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v node_modules | head -20`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "i18n: add picker.relation.* keys for PersonPicker hint"
```

---

## Task 5: Default-person composable + reset wiring

**Files:**
- Create: `src/renderer/composables/useDefaultPerson.ts`
- Modify: `src/renderer/views/DatabaseView.vue` (around lines 76-91)
- Modify: `src/renderer/components/import/ArchiveSection.vue` (around line 173)
- Modify: `src/renderer/components/import/HolgerImportSection.vue` (around line 125)
- Modify: `src/renderer/components/import/GedcomImportSection.vue` (around line 180)

- [ ] **Step 1: Create the composable**

Create `src/renderer/composables/useDefaultPerson.ts`:

```ts
declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

let cached: Promise<string | null> | null = null;

export function getDefaultPersonId(): Promise<string | null> {
  if (!cached) {
    cached = window.api.db.getSetting('default_person_id').then(v => (v as string | null) ?? null);
  }
  return cached;
}

export function resetDefaultPersonId(): void {
  cached = null;
}
```

Name note: `getDefaultPersonId` is a plain function, not a `use*` composable hook, because it is callable from any `async` context and returns a Promise — no reactivity needed. Kept in `composables/` for discoverability.

- [ ] **Step 2: Wire reset in DatabaseView**

Read `src/renderer/views/DatabaseView.vue` lines 76-91 first.

In `src/renderer/views/DatabaseView.vue`, at the top of the `<script setup>` block, import:

```ts
import { resetDefaultPersonId } from '../composables/useDefaultPerson';
```

Then add a call to `resetDefaultPersonId()` right after EACH of the three existing `window.api.db.setSetting('default_person_id', ...)` / `window.api.db.deleteSetting('default_person_id')` calls.

Expected pattern (illustrative — match the exact structure in the file):

```ts
  if (personId) {
    await window.api.db.setSetting('default_person_id', personId);
    resetDefaultPersonId();
  } else {
    await window.api.db.deleteSetting('default_person_id');
    resetDefaultPersonId();
  }
```

and

```ts
  treeSubjectId.value = null;
  await window.api.db.deleteSetting('default_person_id');
  resetDefaultPersonId();
```

- [ ] **Step 3: Wire reset in three import sections**

In each of the three import files, add the same import and call `resetDefaultPersonId()` right after the `await window.api.db.setSetting('default_person_id', personId);` line:

- `src/renderer/components/import/ArchiveSection.vue` — around line 173
- `src/renderer/components/import/HolgerImportSection.vue` — around line 125
- `src/renderer/components/import/GedcomImportSection.vue` — around line 180

Example change (same pattern in all three):

```ts
import { resetDefaultPersonId } from '../../composables/useDefaultPerson';
```

```ts
  if (personId) {
    await window.api.db.setSetting('default_person_id', personId);
    resetDefaultPersonId();
    resolvedTreeSubjectId.value = personId;
    ...
```

Also wire a reset on database switch. Find any existing `switchDatabase` / `db.switch` call in the renderer (likely in `SettingsView.vue` or `DatabaseView.vue` — grep for `db.switch` or `switchDatabase`):

```bash
grep -rn "db\.switch\|switchDatabase" src/renderer --include="*.vue"
```

Add `resetDefaultPersonId()` after each call that changes the active database. If multiple call sites exist, cover them all.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v node_modules | head -20`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/composables/useDefaultPerson.ts src/renderer/views/DatabaseView.vue src/renderer/components/import/
git commit -m "feat(renderer): cache default_person_id with reset-on-change"
```

---

## Task 6: PersonPicker hint rendering

**Files:**
- Modify: `src/renderer/components/PersonPicker.vue`

- [ ] **Step 1: Extend the `PersonResult` interface**

Replace the `PersonResult` interface (around lines 53-60):

```ts
interface PersonResult {
  id: string;
  given_name: string;
  surname: string;
  preferred_name: string | null;
  nickname: string | null;
  sex: string;
  relation_role: 'parent' | 'child' | 'partner' | 'sibling' | 'godparent' | null;
  birth_year: string | null;
  death_year: string | null;
}
```

- [ ] **Step 2: Add default-person fetch and hint helpers**

Add these imports at the top of `<script setup>`:

```ts
import { getDefaultPersonId } from '../composables/useDefaultPerson';
```

Add this ref next to the other state (near `searchQuery`):

```ts
const defaultPersonId = ref<string | null>(null);
getDefaultPersonId().then(id => { defaultPersonId.value = id; });
```

Add these helpers at the bottom of the `<script setup>` block (before `</script>`):

```ts
function formatDateRange(b: string | null, d: string | null): string {
  if (!b && !d) return '';
  const left = b ? `*${b}` : '';
  const right = d ? `†${d}` : '';
  return `(${left}–${right})`;
}

function formatHint(p: PersonResult): string {
  const parts: string[] = [];
  if (p.relation_role) parts.push(t(`picker.relation.${p.relation_role}`));
  const dateStr = formatDateRange(p.birth_year, p.death_year);
  if (dateStr) parts.push(dateStr);
  return parts.join(' ');
}

function narratePerson(p: PersonResult): string {
  const name = [p.given_name, p.surname].filter(Boolean).join(' ');
  const hint = formatHint(p);
  return hint ? `${name}, ${hint}` : name;
}
```

- [ ] **Step 3: Pass `relateeId` into the search call**

Replace the existing `search` function (around lines 100-106):

```ts
async function search(query: string) {
  if (!window.api || query.length < 2) {
    results.value = [];
    return;
  }
  results.value = (await window.api.persons.search(query, defaultPersonId.value)) as PersonResult[];
}
```

- [ ] **Step 4: Update the template to render the hint**

In the template, replace the `<li>` content block (around lines 22-35). The old block ends with the `<span class="picker-sex">` element. Replace the whole block with:

```vue
      <li
        v-for="(person, idx) in results"
        :key="person.id"
        :id="pickerId + '-option-' + person.id"
        role="option"
        :aria-selected="idx === highlightIndex"
        class="picker-option"
        :class="{ highlighted: idx === highlightIndex }"
        v-narrate="narratePerson(person)"
        @mousedown.prevent="select(person)"
      >
        <span class="picker-name"><PersonName :given-name="person.given_name" :surname="person.surname" :preferred-name="person.preferred_name" :nickname="person.nickname" /></span>
        <span v-if="formatHint(person)" class="picker-hint">{{ formatHint(person) }}</span>
        <span class="picker-sex">{{ person.sex }}</span>
      </li>
```

- [ ] **Step 5: Add hint CSS**

In the scoped `<style>` block, add this rule right after `.picker-name { ... }` (around line 215):

```css
.picker-hint {
  font-size: var(--font-sm);
  color: var(--text-muted);
  font-style: italic;
  margin-left: 8px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v node_modules | head -20`
Expected: no new errors.

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/PersonPicker.vue
git commit -m "feat(picker): add relation + dates hint to PersonPicker dropdown"
```

---

## Task 7: Version bump, roadmap entry, spec archive

**Files:**
- Modify: `package.json`
- Modify: `docs/PLAN.md`
- Move: `docs/superpowers/specs/2026-04-19-person-picker-relation-hint-design.md` → `docs/superpowers/specs/archive/`

- [ ] **Step 1: Bump version**

In `package.json`, change:

```json
"version": "0.120.0",
```

to:

```json
"version": "0.121.0",
```

- [ ] **Step 2: Add roadmap entry**

In `docs/PLAN.md`, find the Done roadmap table (around the `v0.120.0` row). Add a new row directly below it:

```
| v0.121.0 | feat(picker): relation + dates hint in PersonPicker — role label (parent/child/partner/sibling/godparent) to the tree's default person + (*YYYY–†YYYY) pulled from primary-role birth/death events | [spec](docs/superpowers/specs/archive/2026-04-19-person-picker-relation-hint-design.md) |
```

- [ ] **Step 3: Archive the spec**

```bash
git mv docs/superpowers/specs/2026-04-19-person-picker-relation-hint-design.md docs/superpowers/specs/archive/2026-04-19-person-picker-relation-hint-design.md
```

- [ ] **Step 4: Run unit suite + lint one more time**

Run: `npx vitest run && npm run lint`
Expected: all tests pass, zero lint errors.

- [ ] **Step 5: Final commit**

```bash
git add package.json docs/PLAN.md docs/superpowers/specs/
git commit -m "release: v0.121.0 — PersonPicker relation + dates hint"
```

---

## Verification Checklist

At the end, the engineer should confirm:

- [ ] `npx vitest run` — all unit tests pass (old + the 14 new ones in `persons-search-hint.test.ts`)
- [ ] `npx tsc --noEmit` — no new type errors
- [ ] `npm run lint` — zero errors
- [ ] `package.json` version is `0.121.0`
- [ ] Spec lives at `docs/superpowers/specs/archive/2026-04-19-person-picker-relation-hint-design.md`
- [ ] `docs/PLAN.md` has the v0.121.0 row with the archived spec link
