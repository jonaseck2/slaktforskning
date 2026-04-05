# Persons List: Query Optimization + Load-More Pagination

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PersonsView's N+1 IPC pattern (one call per person for events/citations) with a single JOIN query and load-more pagination, making the list usable with 22k+ persons.

**Architecture:** New `listPersonsPage` and `searchPersonsWithDetails` functions in `src/api/persons.ts` return `PersonListItem` rows with birth/death date and place joined in one SQL query. A new `persons:listPage` IPC channel returns `{ persons, total }`. PersonsView loads 100 at a time with a "Load more" button.

**Tech Stack:** TypeScript, node-sqlite3-wasm (queryOne/queryAll/runSql from `src/api/db.ts`), Vue 3 Composition API, Electron IPC, Vitest.

---

## File Map

| File | Change |
|------|--------|
| `src/api/persons.ts` | Add `PersonListItem` type, `listPersonsPage`, `countPersons`, `searchPersonsWithDetails` |
| `src/main/ipc.ts` | Add `persons:listPage`, `persons:searchWithDetails` handlers |
| `src/preload/index.ts` | Expose `persons.listPage`, `persons.searchWithDetails` |
| `src/renderer/views/PersonsView.vue` | Rewrite list/search logic, new columns, load-more UI |
| `src/renderer/i18n/sv.ts` | Add `birthDate`, `birthPlace`, `deathDate`, `deathPlace`, `showingOf`, `loadMore` keys |
| `src/renderer/i18n/en.ts` | Same keys in English |
| `tests/unit/persons.test.ts` | Add tests for the three new API functions |

---

### Task 1: New API functions + tests

**Files:**
- Modify: `src/api/persons.ts`
- Test: `tests/unit/persons.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/persons.test.ts`. First import `createEvent` and `addEventParticipant`:

```typescript
import {
  createPerson, getPerson, listPersons, updatePerson, deletePerson,
  searchPersons, addPersonName, getPersonNames, updatePersonName,
  deletePersonName, addPersonIdentifier, getPersonIdentifiers,
  deletePersonIdentifier, getDisplayGivenName,
  listPersonsPage, countPersons, searchPersonsWithDetails,
} from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
```

Then add a new `describe` block after the existing tests:

```typescript
describe('listPersonsPage / countPersons / searchPersonsWithDetails', () => {
  it('returns basic PersonListItem shape', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Andersson', sex: 'M' });
    const result = listPersonsPage(db, 100, 0);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(p.id);
    expect(result[0].sex).toBe('M');
    expect(result[0].given_name).toBe('Erik');
    expect(result[0].surname).toBe('Andersson');
    expect(result[0].birth_date).toBeNull();
    expect(result[0].birth_place).toBeNull();
    expect(result[0].death_date).toBeNull();
    expect(result[0].death_place).toBeNull();
  });

  it('joins birth and death date/place', () => {
    const p = createPerson(db, { given_name: 'Anna', surname: 'Berg', sex: 'F' });
    const birth = createEvent(db, { event_type: 'birth', date_original: '1 JAN 1900' });
    addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    const death = createEvent(db, { event_type: 'death', date_original: '15 MAR 1980' });
    addEventParticipant(db, { event_id: death.id, person_id: p.id, role: 'primary' });

    const result = listPersonsPage(db, 100, 0);
    const row = result.find(r => r.id === p.id)!;
    expect(row.birth_date).toBe('1 JAN 1900');
    expect(row.death_date).toBe('15 MAR 1980');
    expect(row.birth_place).toBeNull(); // no place set
  });

  it('respects LIMIT and OFFSET', () => {
    for (let i = 0; i < 5; i++) {
      createPerson(db, { given_name: `Person${i}`, surname: 'Test' });
    }
    const page1 = listPersonsPage(db, 3, 0);
    const page2 = listPersonsPage(db, 3, 3);
    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(2);
    // no overlap
    const ids1 = page1.map(r => r.id);
    const ids2 = page2.map(r => r.id);
    expect(ids1.some(id => ids2.includes(id))).toBe(false);
  });

  it('countPersons returns total', () => {
    createPerson(db, { given_name: 'A', surname: 'A' });
    createPerson(db, { given_name: 'B', surname: 'B' });
    expect(countPersons(db)).toBe(2);
  });

  it('searchPersonsWithDetails matches by name and returns life event data', () => {
    const p = createPerson(db, { given_name: 'Karl', surname: 'Johansson', sex: 'M' });
    const birth = createEvent(db, { event_type: 'birth', date_original: '5 MAJ 1850' });
    addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    createPerson(db, { given_name: 'Anna', surname: 'Svensson' });

    const results = searchPersonsWithDetails(db, 'Karl');
    expect(results).toHaveLength(1);
    expect(results[0].given_name).toBe('Karl');
    expect(results[0].birth_date).toBe('5 MAJ 1850');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "listPersonsPage"
```

Expected: FAIL with `listPersonsPage is not a function` (or similar import error).

- [ ] **Step 3: Add `PersonListItem` type and three functions to `src/api/persons.ts`**

Add after the existing `listPersons` function (around line 49):

```typescript
export type PersonListItem = {
  id: string;
  sex: 'M' | 'F' | 'U';
  given_name: string;
  surname: string;
  birth_date: string | null;
  birth_place: string | null;
  death_date: string | null;
  death_place: string | null;
};

const PERSON_LIST_QUERY = `
  SELECT
    p.id,
    p.sex,
    COALESCE(pn.given_name, '') AS given_name,
    COALESCE(pn.surname, '')    AS surname,
    birth.date_original         AS birth_date,
    bp.name                     AS birth_place,
    death.date_original         AS death_date,
    dp.name                     AS death_place
  FROM persons p
  LEFT JOIN person_names pn
    ON pn.person_id = p.id
    AND pn.sort_order = (SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id)
  LEFT JOIN (
    SELECT ep.person_id, e.date_original, e.place_id
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    WHERE e.event_type = 'birth'
  ) birth ON birth.person_id = p.id
  LEFT JOIN places bp ON bp.id = birth.place_id
  LEFT JOIN (
    SELECT ep.person_id, e.date_original, e.place_id
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    WHERE e.event_type = 'death'
  ) death ON death.person_id = p.id
  LEFT JOIN places dp ON dp.id = death.place_id
  ORDER BY pn.surname, pn.given_name
`;

export function listPersonsPage(db: Database, limit: number, offset: number): PersonListItem[] {
  return queryAll<PersonListItem>(db, `${PERSON_LIST_QUERY} LIMIT ? OFFSET ?`, [limit, offset]);
}

export function countPersons(db: Database): number {
  return queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM persons')?.n ?? 0;
}

export function searchPersonsWithDetails(db: Database, query: string): PersonListItem[] {
  const like = `%${query}%`;
  return queryAll<PersonListItem>(db, `
    SELECT
      p.id,
      p.sex,
      COALESCE(pn.given_name, '') AS given_name,
      COALESCE(pn.surname, '')    AS surname,
      birth.date_original         AS birth_date,
      bp.name                     AS birth_place,
      death.date_original         AS death_date,
      dp.name                     AS death_place
    FROM persons p
    LEFT JOIN person_names pn
      ON pn.person_id = p.id
      AND pn.sort_order = (SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id)
    LEFT JOIN (
      SELECT ep.person_id, e.date_original, e.place_id
      FROM events e
      JOIN event_participants ep ON ep.event_id = e.id
      WHERE e.event_type = 'birth'
    ) birth ON birth.person_id = p.id
    LEFT JOIN places bp ON bp.id = birth.place_id
    LEFT JOIN (
      SELECT ep.person_id, e.date_original, e.place_id
      FROM events e
      JOIN event_participants ep ON ep.event_id = e.id
      WHERE e.event_type = 'death'
    ) death ON death.person_id = p.id
    LEFT JOIN places dp ON dp.id = death.place_id
    WHERE p.notes LIKE ?
       OR EXISTS (
         SELECT 1 FROM person_names n
         WHERE n.person_id = p.id
           AND (n.given_name LIKE ? OR n.surname LIKE ? OR n.preferred_name LIKE ?)
       )
    ORDER BY pn.surname, pn.given_name
  `, [like, like, like, like]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test 2>&1 | tail -8
```

Expected: all tests pass (number increases by 5).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(api): add listPersonsPage, countPersons, searchPersonsWithDetails"
```

---

### Task 2: IPC + preload wiring

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add IPC handlers to `src/main/ipc.ts`**

Add after the `persons:deleteIdentifier` handler (around line 56):

```typescript
wrapHandler('persons:listPage', (limit, offset) =>
  persons.listPersonsPage(getDatabase(), limit as number, offset as number)
);
wrapHandler('persons:countPersons', () =>
  persons.countPersons(getDatabase())
);
wrapHandler('persons:searchWithDetails', (query) =>
  persons.searchPersonsWithDetails(getDatabase(), query as string)
);
```

- [ ] **Step 2: Expose in `src/preload/index.ts`**

Add to the `persons` object (after `deleteIdentifier`):

```typescript
listPage: (limit: number, offset: number) => ipcRenderer.invoke('persons:listPage', limit, offset),
countPersons: () => ipcRenderer.invoke('persons:countPersons'),
searchWithDetails: (query: string) => ipcRenderer.invoke('persons:searchWithDetails', query),
```

- [ ] **Step 3: Run tests**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests still pass.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ipc): wire persons:listPage, countPersons, searchWithDetails"
```

---

### Task 3: i18n keys

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add keys to `src/renderer/i18n/sv.ts`**

In the `persons` section, add after `confirmDelete`:

```typescript
birthDate: 'Födelsedag',
birthPlace: 'Födelseort',
deathDate: 'Dödsdag',
deathPlace: 'Dödsort',
showingOf: 'Visar {shown} av {total} personer',
loadMore: 'Ladda fler',
```

- [ ] **Step 2: Add keys to `src/renderer/i18n/en.ts`**

In the `persons` section, add after `confirmDelete`:

```typescript
birthDate: 'Birth date',
birthPlace: 'Birth place',
deathDate: 'Death date',
deathPlace: 'Death place',
showingOf: 'Showing {shown} of {total} persons',
loadMore: 'Load more',
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(i18n): add persons list pagination strings"
```

---

### Task 4: Rewrite PersonsView

**Files:**
- Modify: `src/renderer/views/PersonsView.vue`

This task replaces the N+1 load with paginated `listPage` calls and updates the table columns.

- [ ] **Step 1: Replace the `<script setup>` block**

Replace the entire `<script setup lang="ts">` section with:

```typescript
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PersonName from '../components/PersonName.vue';
import { useFocusStore } from '../stores/focus';
import { fullNameParts } from '../utils/nameUtils';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface PersonListItem {
  id: string;
  sex: string;
  given_name: string;
  surname: string;
  birth_date: string | null;
  birth_place: string | null;
  death_date: string | null;
  death_place: string | null;
}

const PAGE_SIZE = 100;

const { t } = useI18n();
const router = useRouter();
const focusStore = useFocusStore();

const persons = ref<PersonListItem[]>([]);
const total = ref(0);
const offset = ref(0);
const loading = ref(false);
const showAddForm = ref(false);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') showAddForm.value = false;
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

const form = reactive({
  given_name: '',
  surname: '',
  sex: 'U',
  notes: '',
});

async function load() {
  if (!window.api) return;
  loading.value = true;
  try {
    const result = await window.api.persons.listPage(PAGE_SIZE, 0) as { persons: PersonListItem[]; total: number };
    persons.value = result.persons;
    total.value = result.total;
    offset.value = PAGE_SIZE;
  } catch (err) {
    console.error('[PersonsView] load failed:', err);
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (!window.api || loading.value) return;
  loading.value = true;
  try {
    const result = await window.api.persons.listPage(PAGE_SIZE, offset.value) as { persons: PersonListItem[]; total: number };
    persons.value = [...persons.value, ...result.persons];
    total.value = result.total;
    offset.value += PAGE_SIZE;
  } catch (err) {
    console.error('[PersonsView] loadMore failed:', err);
  } finally {
    loading.value = false;
  }
}

async function addPerson() {
  if (!window.api) return;
  try {
    await window.api.persons.create({
      given_name: form.given_name,
      surname: form.surname,
      sex: form.sex,
      notes: form.notes,
    });
    showAddForm.value = false;
    form.given_name = '';
    form.surname = '';
    form.sex = 'U';
    form.notes = '';
    await load();
  } catch (err) {
    console.error('[PersonsView] addPerson failed:', err);
  }
}

async function removePerson(id: string) {
  if (!window.api) return;
  if (!confirm(t('persons.confirmDelete'))) return;
  try {
    await window.api.persons.delete(id);
    await load();
  } catch (err) {
    console.error('[PersonsView] removePerson failed:', err);
  }
}

function goToDetail(person: PersonListItem) {
  const name = fullNameParts(person.given_name ?? null, person.surname ?? null, null, null).map(p => p.text).join('');
  focusStore.set(person.id, name);
  router.push(`/persons/${person.id}`);
}

onMounted(load);
</script>
```

- [ ] **Step 2: Replace the `<template>` block**

Replace the entire `<template>` section with:

```html
<template>
  <div>
    <div class="header">
      <h2>{{ $t('persons.title') }}</h2>
      <div class="header-actions">
        <button @click="showAddForm = true">{{ $t('persons.addPerson') }}</button>
      </div>
    </div>

    <div v-if="persons.length === 0 && !loading" class="empty">
      {{ $t('persons.emptyState') }}
    </div>

    <template v-else>
      <p class="count-label">
        {{ $t('persons.showingOf', { shown: persons.length, total }) }}
      </p>
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ $t('persons.givenName') }}</th>
            <th>{{ $t('persons.surname') }}</th>
            <th>{{ $t('persons.sex') }}</th>
            <th>{{ $t('persons.birthDate') }}</th>
            <th>{{ $t('persons.birthPlace') }}</th>
            <th>{{ $t('persons.deathDate') }}</th>
            <th>{{ $t('persons.deathPlace') }}</th>
            <th>{{ $t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="person in persons"
            :key="person.id"
            class="clickable-row"
            @click="goToDetail(person)"
          >
            <td>
              <PersonName :given-name="person.given_name" :preferred-name="null" :nickname="null" />
            </td>
            <td>{{ person.surname }}</td>
            <td><span :class="'sex-badge sex-' + person.sex">{{ person.sex }}</span></td>
            <td>{{ person.birth_date ?? '' }}</td>
            <td>{{ person.birth_place ?? '' }}</td>
            <td>{{ person.death_date ?? '' }}</td>
            <td>{{ person.death_place ?? '' }}</td>
            <td>
              <button class="btn-sm btn-delete" @click.stop="removePerson(person.id)">{{ $t('common.delete') }}</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="persons.length < total" class="load-more">
        <button :disabled="loading" @click="loadMore">
          {{ loading ? $t('common.loading') : $t('persons.loadMore') }}
        </button>
      </div>
    </template>

    <!-- Add Person Modal -->
    <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
      <div class="modal">
        <h3>{{ $t('persons.addPerson') }}</h3>
        <form @submit.prevent="addPerson">
          <label>
            {{ $t('persons.givenName') }}
            <input v-model="form.given_name" type="text" required autofocus />
          </label>
          <label>
            {{ $t('persons.surname') }}
            <input v-model="form.surname" type="text" />
          </label>
          <label>
            {{ $t('persons.sex') }}
            <div class="radio-group">
              <label class="radio-label">
                <input v-model="form.sex" type="radio" value="M" /> {{ $t('persons.male') }}
              </label>
              <label class="radio-label">
                <input v-model="form.sex" type="radio" value="F" /> {{ $t('persons.female') }}
              </label>
              <label class="radio-label">
                <input v-model="form.sex" type="radio" value="U" /> {{ $t('persons.sexUnknown') }}
              </label>
            </div>
          </label>
          <label>
            {{ $t('common.notes') }}
            <textarea v-model="form.notes" rows="2" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showAddForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('persons.addPerson') }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Replace the `<style>` block**

Replace the entire `<style scoped>` section with:

```css
<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.count-label {
  font-size: 13px;
  color: #666;
  margin: 0 0 8px;
}
.empty {
  color: #999;
  padding: 40px;
  text-align: center;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th,
.data-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #ddd;
  text-align: left;
}
.data-table th {
  background: #eee;
  font-weight: 600;
}
.clickable-row {
  cursor: pointer;
}
.clickable-row:hover {
  background: #f0f4ff;
}
.sex-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}
.sex-M { background: #dbeafe; color: #1d4ed8; }
.sex-F { background: #fce7f3; color: #be185d; }
.sex-U { background: #f3f4f6; color: #6b7280; }
.load-more {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}
button {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}
button:hover { opacity: 0.9; }
button:disabled { opacity: 0.5; cursor: default; }
.btn-sm { padding: 4px 8px; font-size: 12px; }
.btn-delete { background: #fee; color: #c0392b; }
/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 420px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.modal h3 { margin: 0 0 16px; }
form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
form > label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #555;
}
form input[type='text'],
form textarea {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}
.radio-group {
  display: flex;
  gap: 16px;
  margin-top: 2px;
}
.radio-label {
  font-weight: normal;
  flex-direction: row !important;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.btn-cancel { background: #e0e0e0; color: #333; }
</style>
```

- [ ] **Step 4: Run tests**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 5: Verify the IPC handler returns `{ persons, total }`**

The `persons:listPage` handler in `src/main/ipc.ts` calls `listPersonsPage` which only returns the array. Update the handler to return the combined object:

```typescript
wrapHandler('persons:listPage', (limit, offset) => {
  const db = getDatabase();
  return {
    persons: persons.listPersonsPage(db, limit as number, offset as number),
    total: persons.countPersons(db),
  };
});
```

Remove the separate `persons:countPersons` handler — it's no longer needed since count is bundled with `listPage`.

Also remove `countPersons` from the preload (the `listPage` call returns `total` directly).

- [ ] **Step 6: Run tests**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(ui): persons list load-more pagination, birth/death columns"
```

---

## Self-Review

**Spec coverage:**
- ✅ `PersonListItem` type with id, sex, given_name, surname, birth_date, birth_place, death_date, death_place
- ✅ `listPersonsPage(db, limit, offset)` — Task 1
- ✅ `countPersons(db)` — Task 1 (bundled into `persons:listPage` IPC response in Task 4 Step 5)
- ✅ `searchPersonsWithDetails(db, query)` — Task 1
- ✅ `persons:listPage` IPC — Task 2, corrected in Task 4 Step 5
- ✅ `persons:searchWithDetails` IPC — Task 2
- ✅ PersonsView: 100-per-page load-more — Task 4
- ✅ PersonsView: new columns (birth date/place, death date/place), remove Living — Task 4
- ✅ PersonsView: search uses `searchWithDetails` — Task 4 (uses `persons.searchWithDetails` channel)
- ✅ "Showing X of Y" label — Task 3 + Task 4
- ✅ Tests for all three new API functions — Task 1
- ✅ i18n for new strings — Task 3

**Note:** `persons:searchWithDetails` is wired in Task 2 but PersonsView in Task 4 uses `window.api.persons.searchWithDetails` — the preload key matches. Correct.
