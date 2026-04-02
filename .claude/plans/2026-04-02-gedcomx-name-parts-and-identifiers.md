# GEDCOM-X Alignment: Name Parts, Person Identifiers, Sex Edit, Relationship Actions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two highest-impact GEDCOM-X gaps (name prefixes/suffixes/qualifiers and person external identifiers), add sex editing on the person detail view, make PersonDetailView interactions consistent across sections, and allow adding existing persons as related via the Add Parent/Spouse/Child modal.

**Architecture:** Extend `person_names` with four new nullable columns (`name_prefix`, `name_suffix`, `patronymic_base`, `name_qualifier`). Add a new `person_identifiers` table for typed external IDs. Both changes are additive and non-breaking. Sex editing is pure UI — the API already supports `updatePerson(db, id, { sex })`. For consistency across sections: **names rows become clickable** (click opens edit modal) with only a delete button in the Actions cell; **relationships rows stay clickable** (click navigates to detail) and gain a delete button with `@click.stop`. The Add Parent/Spouse/Child modal gains a "New / Existing" toggle — when "Existing" is chosen, PersonPicker replaces the creation form and only the relationship is created.

**Tech Stack:** SQLite via node-sqlite3-wasm, TypeScript, Vue 3 Composition API, Vitest unit tests, MCP server (@modelcontextprotocol/sdk).

---

## Background: GEDCOM-X Gap Analysis

### What GEDCOM-X has that we are missing

**NamePart types:**
- `PREFIX` — honorific or particle before name: "Dr.", "von", "af", "de la", "Rev.", "Prost."
- `SUFFIX` — generational suffix: "Jr.", "Sr.", "III", "den yngre"

**NamePart qualifiers (on surname specifically):**
- `Patronymic` — surname derived from father's given name (Eriksson/Eriksdotter)
- `Matronymic` — surname derived from mother's given name (rare)
- `Particle` — noble particle that is part of the surname ("von" in "Carl von Linné")

**Why this matters for Swedish genealogy:**
- Patronymics were standard in Sweden until the Name Act (Namnlagen) phases: parish records 1600s–1901, and many rural families continued using them until forced to adopt fixed surnames (1963 final deadline)
- Example: Erik Johansson's children would be Lars Eriksson (son) and Stina Eriksdotter (daughter)
- Nobility used Latin particles: Carl von Linné, Axel af Klint
- Occupational surnames were common and overlap with titles

**GEDCOM 5.5.1 tags this maps to:**
- `NAME.NPFX` → `name_prefix`
- `NAME.NSFX` → `name_suffix`
- `NAME.SURN` → `surname` (already present)
- Patronymic qualifier → `name_qualifier = 'patronymic'`

**Person Identifiers — GEDCOM-X `Identifier` objects:**
- Each person can have multiple typed identifiers
- Types: `Primary` (internal ID), `Authority` (external canonical ID), `Deprecated` (old ID)
- Common values: FamilySearch person ID, Ancestry tree/person ID, Riksarkivet ID, Swedish personnummer (for living persons)

**GEDCOM 5.5.1 tags this maps to:**
- `INDI.REFN` (with TYPE) → authority identifier
- `INDI.RIN` → system record ID

---

## File Map

| File | Change |
|------|--------|
| `src/api/schema.ts` | Add 4 columns to `person_names`; create `person_identifiers` table |
| `src/api/types.ts` | Update `PersonName` type; add `PersonIdentifier` type |
| `src/api/persons.ts` | Update `addPersonName` to accept new fields; add `addPersonIdentifier`, `getPersonIdentifiers`, `deletePersonIdentifier` |
| `src/main/ipc.ts` | Register 3 new IPC handlers: `persons:addIdentifier`, `persons:getIdentifiers`, `persons:deleteIdentifier` |
| `src/preload/index.ts` | Expose new handlers on `window.api.persons` |
| `src/mcp/server.ts` | Add 3 new MCP tools: `add_person_identifier`, `get_person_identifiers`, `delete_person_identifier` |
| `src/renderer/views/PersonDetailView.vue` | Sex edit in header; name rows clickable + delete button; name prefix/suffix in modals; relationships rows + delete button; identifiers section |
| `src/renderer/components/AddRelatedPersonModal.vue` | Add "New / Existing" toggle; "Existing" mode shows PersonPicker, skips person creation |
| `tests/unit/persons.test.ts` | Tests for new name columns + identifier CRUD |
| `CLAUDE.md` | Update PersonName type, window.api surface, MCP tools |
| `.claude/DATA_MODEL.md` | Update `person_names` table, add `person_identifiers` table |
| `.claude/PLAN.md` | Mark this feature done in roadmap |

---

## Task 1: Schema + Types

**Files:**
- Modify: `src/api/schema.ts`
- Modify: `src/api/types.ts`

- [ ] **Step 1: Add columns to person_names DDL**

In `src/api/schema.ts`, find the `CREATE TABLE IF NOT EXISTS person_names` statement and add four new nullable columns after `sort_order`:

```sql
CREATE TABLE IF NOT EXISTS person_names (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
  given_name TEXT,
  surname TEXT,
  name_type TEXT DEFAULT 'birth',
  date_from TEXT,
  date_to TEXT,
  sort_order INTEGER DEFAULT 0,
  name_prefix TEXT,
  name_suffix TEXT,
  patronymic_base TEXT,
  name_qualifier TEXT
);
```

`name_prefix`: "Dr.", "von", "af", "de la", "Rev.", "Prost."
`name_suffix`: "Jr.", "Sr.", "III", "den yngre"
`patronymic_base`: the given name of the parent (e.g., "Erik" if surname is "Eriksson")
`name_qualifier`: `'patronymic' | 'matronymic' | 'particle' | 'married' | 'alias' | null`

- [ ] **Step 2: Add person_identifiers table to schema**

After the `person_names` CREATE statement, add:

```sql
CREATE TABLE IF NOT EXISTS person_identifiers (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
  identifier_type TEXT NOT NULL,
  identifier_value TEXT NOT NULL,
  created_at TEXT,
  UNIQUE(person_id, identifier_type, identifier_value)
);
```

`identifier_type` values: `'familysearch'`, `'ancestry'`, `'riksarkivet'`, `'personnummer'`, `'refn'`, `'rin'`, `'other'`

- [ ] **Step 3: Update PersonName type in types.ts**

In `src/api/types.ts`, update the `PersonName` interface:

```typescript
export interface PersonName {
  id: string;
  person_id: string;
  given_name: string | null;
  surname: string | null;
  name_type: 'birth' | 'married' | 'alias' | 'aka';
  date_from: string | null;
  date_to: string | null;
  sort_order: number;
  name_prefix: string | null;
  name_suffix: string | null;
  patronymic_base: string | null;
  name_qualifier: 'patronymic' | 'matronymic' | 'particle' | 'married' | 'alias' | null;
}
```

- [ ] **Step 4: Add PersonIdentifier type in types.ts**

```typescript
export interface PersonIdentifier {
  id: string;
  person_id: string;
  identifier_type: 'familysearch' | 'ancestry' | 'riksarkivet' | 'personnummer' | 'refn' | 'rin' | 'other';
  identifier_value: string;
  created_at: string;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/api/schema.ts src/api/types.ts
git commit -m "feat: add name prefix/suffix/patronymic columns and person_identifiers table schema"
```

---

## Task 2: API Functions

**Files:**
- Modify: `src/api/persons.ts`
- Test: `tests/unit/persons.test.ts`

- [ ] **Step 1: Write failing tests for new name columns**

In `tests/unit/persons.test.ts`, add a new describe block after the existing `addPersonName` tests:

```typescript
describe('addPersonName with extended fields', () => {
  it('stores name_prefix and name_suffix', () => {
    const person = createPerson(db, {});
    const name = addPersonName(db, person.id, {
      given_name: 'Carl',
      surname: 'Linné',
      name_prefix: 'von',
      name_suffix: null,
    });
    expect(name.name_prefix).toBe('von');
    expect(name.name_suffix).toBeNull();
  });

  it('stores patronymic_base and name_qualifier', () => {
    const person = createPerson(db, {});
    const name = addPersonName(db, person.id, {
      given_name: 'Lars',
      surname: 'Eriksson',
      patronymic_base: 'Erik',
      name_qualifier: 'patronymic',
    });
    expect(name.patronymic_base).toBe('Erik');
    expect(name.name_qualifier).toBe('patronymic');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A5 "patronymic"
```

Expected: FAIL — `name.name_prefix is not a property` or similar (column not yet read back).

- [ ] **Step 3: Update addPersonName to accept and return new fields**

In `src/api/persons.ts`, update `addPersonName`:

```typescript
export function addPersonName(
  db: Database,
  personId: string,
  data: {
    given_name?: string | null;
    surname?: string | null;
    name_type?: 'birth' | 'married' | 'alias' | 'aka';
    date_from?: string | null;
    date_to?: string | null;
    sort_order?: number;
    name_prefix?: string | null;
    name_suffix?: string | null;
    patronymic_base?: string | null;
    name_qualifier?: 'patronymic' | 'matronymic' | 'particle' | 'married' | 'alias' | null;
  }
): PersonName {
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO person_names
      (id, person_id, given_name, surname, name_type, date_from, date_to, sort_order,
       name_prefix, name_suffix, patronymic_base, name_qualifier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    id,
    personId,
    data.given_name ?? null,
    data.surname ?? null,
    data.name_type ?? 'birth',
    data.date_from ?? null,
    data.date_to ?? null,
    data.sort_order ?? 0,
    data.name_prefix ?? null,
    data.name_suffix ?? null,
    data.patronymic_base ?? null,
    data.name_qualifier ?? null,
  ]);
  const row = db.prepare('SELECT * FROM person_names WHERE id = ?').get([id]) as PersonName;
  return row;
}
```

`getPersonNames` already does `SELECT *`, so it returns the new columns automatically once they exist in the schema.

- [ ] **Step 4: Write failing tests for person identifier CRUD**

In `tests/unit/persons.test.ts`, add:

```typescript
describe('person identifiers', () => {
  it('adds and retrieves an identifier', () => {
    const person = createPerson(db, {});
    const id = addPersonIdentifier(db, person.id, {
      identifier_type: 'familysearch',
      identifier_value: 'L123-XYZ',
    });
    expect(id.identifier_type).toBe('familysearch');
    expect(id.identifier_value).toBe('L123-XYZ');

    const list = getPersonIdentifiers(db, person.id);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id.id);
  });

  it('deletes an identifier', () => {
    const person = createPerson(db, {});
    const id = addPersonIdentifier(db, person.id, {
      identifier_type: 'ancestry',
      identifier_value: 'A456',
    });
    const deleted = deletePersonIdentifier(db, id.id);
    expect(deleted).toBe(true);
    expect(getPersonIdentifiers(db, person.id)).toHaveLength(0);
  });

  it('enforces uniqueness per person/type/value', () => {
    const person = createPerson(db, {});
    addPersonIdentifier(db, person.id, { identifier_type: 'riksarkivet', identifier_value: 'R789' });
    expect(() =>
      addPersonIdentifier(db, person.id, { identifier_type: 'riksarkivet', identifier_value: 'R789' })
    ).toThrow();
  });
});
```

Update the import line at the top of the test file to include the new functions:

```typescript
import {
  createPerson, getPerson, listPersons, updatePerson, deletePerson, searchPersons,
  addPersonName, getPersonNames,
  addPersonIdentifier, getPersonIdentifiers, deletePersonIdentifier,
} from '../../src/api/persons';
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A5 "addPersonIdentifier"
```

Expected: FAIL — `addPersonIdentifier is not a function`.

- [ ] **Step 6: Implement person identifier API functions**

In `src/api/persons.ts`, add:

```typescript
export function addPersonIdentifier(
  db: Database,
  personId: string,
  data: {
    identifier_type: 'familysearch' | 'ancestry' | 'riksarkivet' | 'personnummer' | 'refn' | 'rin' | 'other';
    identifier_value: string;
  }
): PersonIdentifier {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run([id, personId, data.identifier_type, data.identifier_value, now]);
  const row = db.prepare('SELECT * FROM person_identifiers WHERE id = ?').get([id]) as PersonIdentifier;
  return row;
}

export function getPersonIdentifiers(db: Database, personId: string): PersonIdentifier[] {
  const stmt = db.prepare('SELECT * FROM person_identifiers WHERE person_id = ? ORDER BY created_at ASC');
  return stmt.all([personId]) as PersonIdentifier[];
}

export function deletePersonIdentifier(db: Database, id: string): boolean {
  const result = db.prepare('DELETE FROM person_identifiers WHERE id = ?').run([id]);
  return result.changes > 0;
}
```

Note: `result.changes` — in node-sqlite3-wasm, `stmt.run()` returns `{ changes: number, lastInsertRowid: number }`.

- [ ] **Step 7: Run all unit tests**

```bash
npm test
```

Expected: All tests pass (previously 37, now more).

- [ ] **Step 8: Commit**

```bash
git add src/api/persons.ts tests/unit/persons.test.ts
git commit -m "feat: add name prefix/suffix/patronymic and person identifier CRUD"
```

---

## Task 3: IPC + Preload

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Register new IPC handlers in ipc.ts**

In `src/main/ipc.ts`, in the persons section, add three new handlers after the existing `persons:getNames` handler:

```typescript
wrapHandler('persons:addIdentifier', (personId: string, data: unknown) =>
  persons.addPersonIdentifier(getDatabase(), personId, data as Parameters<typeof persons.addPersonIdentifier>[2])
);

wrapHandler('persons:getIdentifiers', (personId: string) =>
  persons.getPersonIdentifiers(getDatabase(), personId)
);

wrapHandler('persons:deleteIdentifier', (id: string) =>
  persons.deletePersonIdentifier(getDatabase(), id)
);
```

- [ ] **Step 2: Expose new channels in preload/index.ts**

In `src/preload/index.ts`, in the `persons` section of the contextBridge, add after `getNames`:

```typescript
addIdentifier: (personId: string, data: unknown) =>
  ipcRenderer.invoke('persons:addIdentifier', personId, data),
getIdentifiers: (personId: string) =>
  ipcRenderer.invoke('persons:getIdentifiers', personId),
deleteIdentifier: (id: string) =>
  ipcRenderer.invoke('persons:deleteIdentifier', id),
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts
git commit -m "feat: wire person identifier IPC channels"
```

---

## Task 4: MCP Server

**Files:**
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: Add three MCP tools for person identifiers**

In `src/mcp/server.ts`, find the existing person tools section (after `get_person_names`). Add:

```typescript
server.tool(
  'add_person_identifier',
  'Add an external identifier to a person (e.g. FamilySearch ID, Ancestry ID)',
  {
    person_id: z.string().describe('UUID of the person'),
    identifier_type: z.enum(['familysearch', 'ancestry', 'riksarkivet', 'personnummer', 'refn', 'rin', 'other']),
    identifier_value: z.string().describe('The external ID value'),
  },
  async ({ person_id, identifier_type, identifier_value }) => {
    const result = addPersonIdentifier(db, person_id, { identifier_type, identifier_value });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.tool(
  'get_person_identifiers',
  'Get all external identifiers for a person',
  { person_id: z.string().describe('UUID of the person') },
  async ({ person_id }) => {
    const result = getPersonIdentifiers(db, person_id);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.tool(
  'delete_person_identifier',
  'Delete an external identifier',
  { id: z.string().describe('UUID of the identifier to delete') },
  async ({ id }) => {
    const result = deletePersonIdentifier(db, id);
    return { content: [{ type: 'text', text: JSON.stringify({ deleted: result }) }] };
  }
);
```

Update the import at the top of server.ts to include the new functions:

```typescript
import {
  createPerson, getPerson, listPersons, updatePerson, deletePerson, searchPersons,
  addPersonName, getPersonNames,
  addPersonIdentifier, getPersonIdentifiers, deletePersonIdentifier,
} from '../api/persons';
```

- [ ] **Step 2: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat: add MCP tools for person identifiers"
```

---

## Task 5: Vue UI — Sex Editing

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`

Currently sex is displayed as a static badge in `.header-info` (line 7). There is no edit affordance. The API already supports `window.api.persons.update(id, { sex })`.

- [ ] **Step 1: Replace the static sex badge with an inline select**

In `PersonDetailView.vue`, find the `<div class="header-info">` block. Replace the static `<span :class="'sex-badge sex-' + person.sex">{{ person.sex }}</span>` with a `<select>` that saves on change:

```vue
<select
  class="sex-select"
  :value="person.sex"
  @change="updateSex(($event.target as HTMLSelectElement).value)"
>
  <option value="M">{{ $t('sex.M') }}</option>
  <option value="F">{{ $t('sex.F') }}</option>
  <option value="U">{{ $t('sex.U') }}</option>
</select>
```

- [ ] **Step 2: Add the updateSex handler in the script block**

In the `<script setup>` section, add after `saveNotes`:

```typescript
async function updateSex(sex: string) {
  if (!window.api || !person.value) return;
  await window.api.persons.update(personId, { sex });
  person.value.sex = sex;
}
```

- [ ] **Step 3: Style the sex select to match existing sex badges**

In the `<style scoped>` block, add:

```css
.sex-select {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid #ccc;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath d='M0 2l4 4 4-4z' fill='%23666'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  padding-right: 20px;
}
```

Note: The `.sex-M`, `.sex-F`, `.sex-U` classes are already defined and apply to the select via Vue's dynamic binding since `:class="'sex-' + person.sex"` can still be added to the select element.

Add `"sex.M"`, `"sex.F"`, `"sex.U"` to the i18n locale files if they don't already exist. Check `src/renderer/i18n/sv.ts` — if a `sex` key group is missing, add:

Swedish (`sv.ts`):
```typescript
sex: { M: 'Man', F: 'Kvinna', U: 'Okänd' },
```

English (`en.ts`):
```typescript
sex: { M: 'Male', F: 'Female', U: 'Unknown' },
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/views/PersonDetailView.vue src/renderer/i18n/
git commit -m "feat: add sex edit control to PersonDetailView header"
```

---

## Task 6: Vue UI — Relationship Delete Button

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`

Currently the relationships table uses a `clickable-row` that navigates to `/relationships/:id`. There is no delete affordance. The fix keeps the clickable-row behaviour (row click = navigate to detail) and adds a delete button per row with `@click.stop` to prevent navigation from also firing. This is consistent with the names table: both sections have clickable rows for the primary action, plus an explicit delete button.

- [ ] **Step 1: Add deleteRelationship handler to the script block**

In the `<script setup>` section, add after the `load` function:

```typescript
async function deleteRelationship(id: string) {
  if (!window.api) return;
  await window.api.relationships.delete(id);
  await load();
}
```

- [ ] **Step 2: Update the relationships table template**

The current table has no `Actions` column. Add one. The row click is kept for navigation; the delete button uses `@click.stop` so it does not also trigger navigation.

Replace:
```vue
<table v-else class="data-table">
  <thead>
    <tr>
      <th>{{ $t('common.type') }}</th>
      <th>{{ $t('relationshipDetail.subtype') }}</th>
      <th>{{ $t('common.name') }}</th>
    </tr>
  </thead>
  <tbody>
    <tr
      v-for="rel in rels"
      :key="rel.id"
      class="clickable-row"
      @click="$router.push(`/relationships/${rel.id}`)"
    >
      <td><span class="type-badge">{{ rel.typeLabel }}</span></td>
      <td>{{ rel.subtypeLabel || '—' }}</td>
      <td>{{ rel.otherPersonName || '—' }}</td>
    </tr>
  </tbody>
</table>
```

With:
```vue
<table v-else class="data-table">
  <thead>
    <tr>
      <th>{{ $t('common.type') }}</th>
      <th>{{ $t('relationshipDetail.subtype') }}</th>
      <th>{{ $t('common.name') }}</th>
      <th>{{ $t('common.actions') }}</th>
    </tr>
  </thead>
  <tbody>
    <tr
      v-for="rel in rels"
      :key="rel.id"
      class="clickable-row"
      @click="$router.push(`/relationships/${rel.id}`)"
    >
      <td><span class="type-badge">{{ rel.typeLabel }}</span></td>
      <td>{{ rel.subtypeLabel || '—' }}</td>
      <td>{{ rel.otherPersonName || '—' }}</td>
      <td class="actions-cell">
        <button class="btn-sm btn-delete" @click.stop="deleteRelationship(rel.id)">
          {{ $t('common.delete') }}
        </button>
      </td>
    </tr>
  </tbody>
</table>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/views/PersonDetailView.vue
git commit -m "feat: add delete button to relationships table in PersonDetailView"
```

---

## Task 7: Vue UI — Name Parts (prefix/suffix/patronymic)

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`

- [ ] **Step 1: Make names rows clickable and update the actions cell**

For consistency with the relationships table (clickable row = primary action, delete button for destructive action), make name rows clickable and remove the Edit button. The row click opens the edit modal; only the delete button remains in the actions cell.

Replace the `<tbody>` of the names table:

```vue
<tr
  v-for="name in names"
  :key="name.id"
  class="clickable-row"
  @click="openEditName(name)"
>
  <td>
    <span v-if="name.name_prefix" class="name-prefix">{{ name.name_prefix }} </span>{{ name.given_name }}
  </td>
  <td>
    {{ name.surname }}
    <span v-if="name.name_suffix"> {{ name.name_suffix }}</span>
    <span v-if="name.name_qualifier === 'patronymic'" class="name-qual-badge">pat.</span>
  </td>
  <td><span class="type-badge">{{ $t('nameTypes.' + name.name_type) }}</span></td>
  <td class="actions-cell">
    <button
      v-if="name.sort_order > 0"
      class="btn-sm btn-delete"
      @click.stop="removeName(name.id)"
    >{{ $t('common.delete') }}</button>
  </td>
</tr>
```

Note: `@click.stop` on delete prevents the row click (edit modal) from also firing. The primary name (`sort_order === 0`) has no delete button — same as before.

Add new styles in `<style scoped>`:

```css
.name-prefix {
  color: #6b7280;
  font-style: italic;
}
.name-qual-badge {
  background: #fef3c7;
  color: #92400e;
  padding: 1px 5px;
  border-radius: 8px;
  font-size: 11px;
  margin-left: 4px;
}
```

- [ ] **Step 2: Add prefix/suffix/qualifier fields to the add-name modal**

In the "Add Name" modal form, add fields after the existing `name_type` select:

```vue
<label>
  {{ $t('names.prefix') }}
  <input v-model="nameForm.name_prefix" type="text" :placeholder="$t('names.prefixPlaceholder')" />
</label>
<label>
  {{ $t('names.suffix') }}
  <input v-model="nameForm.name_suffix" type="text" :placeholder="$t('names.suffixPlaceholder')" />
</label>
<label>
  {{ $t('names.qualifier') }}
  <select v-model="nameForm.name_qualifier">
    <option value="">—</option>
    <option value="patronymic">{{ $t('names.qualifierPatronymic') }}</option>
    <option value="matronymic">{{ $t('names.qualifierMatronymic') }}</option>
    <option value="particle">{{ $t('names.qualifierParticle') }}</option>
  </select>
</label>
<label v-if="nameForm.name_qualifier === 'patronymic' || nameForm.name_qualifier === 'matronymic'">
  {{ $t('names.patronymicBase') }}
  <input v-model="nameForm.patronymic_base" type="text" :placeholder="$t('names.patronymicBasePlaceholder')" />
</label>
```

Update the `nameForm` reactive object to include the new fields:

```typescript
const nameForm = reactive({
  given_name: '',
  surname: '',
  name_type: 'married' as 'birth' | 'married' | 'alias' | 'aka',
  name_prefix: '',
  name_suffix: '',
  name_qualifier: '' as '' | 'patronymic' | 'matronymic' | 'particle',
  patronymic_base: '',
});
```

Update `addName` to pass the new fields and reset them:

```typescript
async function addName() {
  if (!window.api) return;
  try {
    await window.api.persons.addName(personId, {
      given_name: nameForm.given_name,
      surname: nameForm.surname,
      name_type: nameForm.name_type,
      name_prefix: nameForm.name_prefix || null,
      name_suffix: nameForm.name_suffix || null,
      name_qualifier: nameForm.name_qualifier || null,
      patronymic_base: nameForm.patronymic_base || null,
    });
    showNameForm.value = false;
    Object.assign(nameForm, {
      given_name: '', surname: '', name_type: 'married',
      name_prefix: '', name_suffix: '', name_qualifier: '', patronymic_base: '',
    });
    await load();
  } catch (err) {
    console.error('[PersonDetailView] addName failed:', err);
  }
}
```

- [ ] **Step 3: Also add the same fields to the edit-name modal**

The `editNameForm` reactive and the edit modal need the same fields. Update `editNameForm`:

```typescript
const editNameForm = reactive({
  given_name: '',
  surname: '',
  name_type: 'birth' as 'birth' | 'married' | 'alias' | 'aka',
  name_prefix: '',
  name_suffix: '',
  name_qualifier: '' as '' | 'patronymic' | 'matronymic' | 'particle',
  patronymic_base: '',
});
```

Update `openEditName` to populate the new fields:

```typescript
function openEditName(name: NameRow) {
  editingNameId.value = name.id;
  editNameForm.given_name = name.given_name;
  editNameForm.surname = name.surname;
  editNameForm.name_type = name.name_type as 'birth' | 'married' | 'alias' | 'aka';
  editNameForm.name_prefix = name.name_prefix || '';
  editNameForm.name_suffix = name.name_suffix || '';
  editNameForm.name_qualifier = (name.name_qualifier as '' | 'patronymic' | 'matronymic' | 'particle') || '';
  editNameForm.patronymic_base = name.patronymic_base || '';
  showEditNameForm.value = true;
}
```

Update `saveEditName` to pass the new fields:

```typescript
async function saveEditName() {
  if (!window.api || !editingNameId.value) return;
  try {
    await window.api.persons.updateName(editingNameId.value, {
      given_name: editNameForm.given_name,
      surname: editNameForm.surname,
      name_type: editNameForm.name_type,
      name_prefix: editNameForm.name_prefix || null,
      name_suffix: editNameForm.name_suffix || null,
      name_qualifier: editNameForm.name_qualifier || null,
      patronymic_base: editNameForm.patronymic_base || null,
    });
    showEditNameForm.value = false;
    editingNameId.value = null;
    await load();
  } catch (err) {
    console.error('[PersonDetailView] saveEditName failed:', err);
  }
}
```

Update the `NameRow` interface to include new fields:

```typescript
interface NameRow {
  id: string;
  given_name: string;
  surname: string;
  name_type: string;
  sort_order: number;
  name_prefix: string | null;
  name_suffix: string | null;
  patronymic_base: string | null;
  name_qualifier: string | null;
}
```

Add the same prefix/suffix/qualifier fields to the Edit Name modal template (same structure as Add Name modal above).

- [ ] **Step 4: Add i18n strings for new name fields**

Check `src/renderer/i18n/sv.ts` for an existing `names` key group. If missing, add:

```typescript
names: {
  prefix: 'Prefix',
  prefixPlaceholder: 'von, af, Dr., Prost.',
  suffix: 'Suffix',
  suffixPlaceholder: 'Jr., d.y.',
  qualifier: 'Namnkvalificerare',
  qualifierPatronymic: 'Patronymikon',
  qualifierMatronymic: 'Matronymikon',
  qualifierParticle: 'Adelstitel/partikel',
  patronymicBase: 'Faders/moders förnamn',
  patronymicBasePlaceholder: 't.ex. Erik (om efternamnet är Eriksson)',
},
```

In `src/renderer/i18n/en.ts`:

```typescript
names: {
  prefix: 'Prefix',
  prefixPlaceholder: 'von, af, Dr., Rev.',
  suffix: 'Suffix',
  suffixPlaceholder: 'Jr., Sr., III',
  qualifier: 'Name qualifier',
  qualifierPatronymic: 'Patronymic',
  qualifierMatronymic: 'Matronymic',
  qualifierParticle: 'Noble particle',
  patronymicBase: "Parent's given name",
  patronymicBasePlaceholder: 'e.g. Erik (if surname is Eriksson)',
},
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/PersonDetailView.vue src/renderer/i18n/
git commit -m "feat: add name prefix/suffix/qualifier UI to add and edit name modals"
```

---

## Task 8: Vue UI — Person Identifiers Section

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`

- [ ] **Step 1: Add identifiers state and handlers in the script block**

In the `<script setup>` section, add after the existing refs/functions:

```typescript
interface IdentifierRow {
  id: string;
  identifier_type: string;
  identifier_value: string;
}

const identifiers = ref<IdentifierRow[]>([]);
const showAddIdentifier = ref(false);
const newIdentifier = reactive({
  identifier_type: 'familysearch' as string,
  identifier_value: '',
});

async function loadIdentifiers() {
  identifiers.value = (await window.api.persons.getIdentifiers(personId)) as IdentifierRow[];
}

async function addIdentifier() {
  if (!window.api) return;
  await window.api.persons.addIdentifier(personId, {
    identifier_type: newIdentifier.identifier_type,
    identifier_value: newIdentifier.identifier_value,
  });
  newIdentifier.identifier_value = '';
  showAddIdentifier.value = false;
  await loadIdentifiers();
}

async function removeIdentifier(id: string) {
  if (!window.api) return;
  await window.api.persons.deleteIdentifier(id);
  await loadIdentifiers();
}
```

Call `loadIdentifiers()` inside `load()` alongside the other load calls.

- [ ] **Step 2: Add identifiers section to the template**

After the notes section, add:

```vue
<section class="detail-section">
  <div class="section-header">
    <h4>{{ $t('identifiers.title') }}</h4>
    <button class="btn-add" @click="showAddIdentifier = true">{{ $t('identifiers.add') }}</button>
  </div>
  <div v-if="identifiers.length === 0" class="empty-hint">{{ $t('identifiers.none') }}</div>
  <table v-else class="data-table">
    <thead>
      <tr>
        <th>{{ $t('identifiers.type') }}</th>
        <th>{{ $t('identifiers.value') }}</th>
        <th>{{ $t('common.actions') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="ident in identifiers" :key="ident.id">
        <td><span class="type-badge">{{ $t('identifiers.types.' + ident.identifier_type) }}</span></td>
        <td>{{ ident.identifier_value }}</td>
        <td class="actions-cell">
          <button class="btn-sm btn-delete" @click="removeIdentifier(ident.id)">
            {{ $t('common.delete') }}
          </button>
        </td>
      </tr>
    </tbody>
  </table>

  <div v-if="showAddIdentifier" class="modal-overlay" @click.self="showAddIdentifier = false">
    <div class="modal">
      <h3>{{ $t('identifiers.addTitle') }}</h3>
      <form @submit.prevent="addIdentifier">
        <label>
          {{ $t('identifiers.type') }}
          <select v-model="newIdentifier.identifier_type">
            <option value="familysearch">FamilySearch</option>
            <option value="ancestry">Ancestry</option>
            <option value="riksarkivet">Riksarkivet</option>
            <option value="personnummer">Personnummer</option>
            <option value="refn">REFN</option>
            <option value="rin">RIN</option>
            <option value="other">{{ $t('identifiers.types.other') }}</option>
          </select>
        </label>
        <label>
          {{ $t('identifiers.value') }}
          <input v-model="newIdentifier.identifier_value" type="text" required />
        </label>
        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="showAddIdentifier = false">
            {{ $t('common.cancel') }}
          </button>
          <button type="submit">{{ $t('common.save') }}</button>
        </div>
      </form>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Add i18n strings for identifiers**

In `src/renderer/i18n/sv.ts`:

```typescript
identifiers: {
  title: 'Externa identifierare',
  add: 'Lägg till',
  addTitle: 'Lägg till identifierare',
  none: 'Inga identifierare',
  type: 'Typ',
  value: 'Värde',
  types: {
    familysearch: 'FamilySearch',
    ancestry: 'Ancestry',
    riksarkivet: 'Riksarkivet',
    personnummer: 'Personnummer',
    refn: 'Referensnummer',
    rin: 'RIN',
    other: 'Annat',
  },
},
```

In `src/renderer/i18n/en.ts`:

```typescript
identifiers: {
  title: 'External identifiers',
  add: 'Add',
  addTitle: 'Add identifier',
  none: 'No identifiers',
  type: 'Type',
  value: 'Value',
  types: {
    familysearch: 'FamilySearch',
    ancestry: 'Ancestry',
    riksarkivet: 'Riksarkivet',
    personnummer: 'Personnummer',
    refn: 'Reference number',
    rin: 'RIN',
    other: 'Other',
  },
},
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/views/PersonDetailView.vue src/renderer/i18n/
git commit -m "feat: add person identifiers section to PersonDetailView"
```

---

## Task 9: AddRelatedPersonModal — Support Existing Persons

**Files:**
- Modify: `src/renderer/components/AddRelatedPersonModal.vue`

Currently the modal only supports creating a new person and linking them. There is no way to link an existing person as parent, spouse, or child. The fix adds a toggle at the top of the form: **New person** (current behaviour) vs **Existing person** (PersonPicker + relationship only).

- [ ] **Step 1: Add a mode toggle and existingPersonId ref**

In the `<script setup>` block, add:

```typescript
import PersonPicker from './PersonPicker.vue';

const entryMode = ref<'new' | 'existing'>('new');
const existingPersonId = ref<string | null>(null);
```

- [ ] **Step 2: Update the template to show the toggle and conditionally render each mode**

Replace the `<form>` content so that when `entryMode === 'existing'`, only a PersonPicker is shown (plus the subtype select for spouse mode), and when `entryMode === 'new'`, the existing person creation fields are shown:

```vue
<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h3>{{ title }}</h3>
      <form @submit.prevent="save">

        <!-- Toggle -->
        <div class="entry-mode-toggle">
          <button
            type="button"
            :class="['toggle-btn', { active: entryMode === 'new' }]"
            @click="entryMode = 'new'; existingPersonId = null"
          >{{ $t('addRelated.newPerson') }}</button>
          <button
            type="button"
            :class="['toggle-btn', { active: entryMode === 'existing' }]"
            @click="entryMode = 'existing'"
          >{{ $t('addRelated.existingPerson') }}</button>
        </div>

        <!-- Existing person mode -->
        <template v-if="entryMode === 'existing'">
          <label>
            {{ $t('addRelated.selectPerson') }}
            <PersonPicker
              :model-value="existingPersonId"
              :placeholder="$t('addRelated.searchPlaceholder')"
              @update:model-value="existingPersonId = $event"
            />
          </label>
        </template>

        <!-- New person mode -->
        <template v-else>
          <label>
            {{ $t('persons.givenName') }}
            <input v-model="form.given_name" type="text" required :placeholder="$t('persons.givenName')" />
          </label>
          <label>
            {{ $t('persons.surname') }}
            <input v-model="form.surname" type="text" :placeholder="$t('persons.surname')" />
          </label>
          <label>
            {{ $t('persons.sex') }}
            <select v-model="form.sex">
              <option value="U">{{ $t('persons.sexUnknown') }}</option>
              <option value="M">{{ $t('persons.male') }}</option>
              <option value="F">{{ $t('persons.female') }}</option>
            </select>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.living" />
            {{ $t('persons.living') }}
          </label>
        </template>

        <!-- Subtype — shown in both modes for spouse -->
        <label v-if="mode === 'spouse'">
          {{ $t('personDetail.coupleSubtype') }}
          <select v-model="form.subtype">
            <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">
              {{ $t('coupleSubtypes.' + st) }}
            </option>
          </select>
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="$emit('close')">{{ $t('common.cancel') }}</button>
          <button type="submit" :disabled="entryMode === 'existing' && !existingPersonId">
            {{ $t('personDetail.addAndLink') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Update the save function to handle both modes**

Replace the current `save` function:

```typescript
async function save() {
  if (!window.api) return;
  try {
    let targetPersonId: string;

    if (entryMode.value === 'existing') {
      if (!existingPersonId.value) return;
      targetPersonId = existingPersonId.value;
    } else {
      const newPerson = (await window.api.persons.create({
        given_name: form.given_name,
        surname: form.surname,
        sex: form.sex,
        living: form.living,
      })) as { id: string };
      targetPersonId = newPerson.id;
    }

    const relData: Record<string, unknown> = {};
    if (props.mode === 'parent') {
      relData.type = 'parent_child';
      relData.person1_id = targetPersonId;   // parent
      relData.person2_id = props.personId;   // child (current person)
      relData.subtype = 'biological';
    } else if (props.mode === 'child') {
      relData.type = 'parent_child';
      relData.person1_id = props.personId;   // parent (current person)
      relData.person2_id = targetPersonId;   // child
      relData.subtype = 'biological';
    } else {
      relData.type = 'couple';
      relData.person1_id = props.personId;
      relData.person2_id = targetPersonId;
      relData.subtype = form.subtype;
    }

    await window.api.relationships.create(relData);
    emit('saved');
    emit('close');
  } catch (err) {
    console.error('[AddRelatedPersonModal] save failed:', err);
  }
}
```

- [ ] **Step 4: Add toggle styles**

In `<style scoped>`, add:

```css
.entry-mode-toggle {
  display: flex;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  overflow: hidden;
}
.toggle-btn {
  flex: 1;
  padding: 6px 12px;
  background: #f8fafc;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: #334155;
}
.toggle-btn.active {
  background: #2c3e50;
  color: white;
}
```

- [ ] **Step 5: Add i18n strings**

In `src/renderer/i18n/sv.ts`, add inside `addRelated` (or create the key group):

```typescript
addRelated: {
  newPerson: 'Ny person',
  existingPerson: 'Befintlig person',
  selectPerson: 'Välj person',
  searchPlaceholder: 'Sök namn…',
},
```

In `src/renderer/i18n/en.ts`:

```typescript
addRelated: {
  newPerson: 'New person',
  existingPerson: 'Existing person',
  selectPerson: 'Select person',
  searchPlaceholder: 'Search name…',
},
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/AddRelatedPersonModal.vue src/renderer/i18n/
git commit -m "feat: allow linking existing persons in Add Parent/Spouse/Child modal"
```

---

## Task 10: Update Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/DATA_MODEL.md`
- Modify: `.claude/PLAN.md`

- [ ] **Step 1: Update PersonName type in CLAUDE.md**

Find the `PersonName` type in the Domain Types section and add the four new fields:

```typescript
PersonName { id, person_id, given_name, surname, name_type: 'birth'|'married'|'alias'|'aka', date_from?, date_to?, sort_order, name_prefix?, name_suffix?, patronymic_base?, name_qualifier? }
```

Add `PersonIdentifier` to the types list:

```typescript
PersonIdentifier { id, person_id, identifier_type: 'familysearch'|'ancestry'|'riksarkivet'|'personnummer'|'refn'|'rin'|'other', identifier_value, created_at }
```

- [ ] **Step 2: Update window.api surface in CLAUDE.md**

Add three new lines to the `window.api.persons.*` section:

```typescript
window.api.persons.addIdentifier(personId, data) // → PersonIdentifier
window.api.persons.getIdentifiers(personId)       // → PersonIdentifier[]
window.api.persons.deleteIdentifier(id)           // → boolean
```

- [ ] **Step 3: Update DATA_MODEL.md**

Update the `person_names` table to include the four new columns. Add a new `person_identifiers` table section.

- [ ] **Step 4: Mark done in PLAN.md**

Add a new completed section after the existing `v0.3.0` section:

```markdown
### Done (v0.3.1 — GEDCOM-X Name Parts + Person Identifiers + UX Polish)

- [x] Extended `person_names` with `name_prefix`, `name_suffix`, `patronymic_base`, `name_qualifier`
- [x] New `person_identifiers` table with types: familysearch, ancestry, riksarkivet, personnummer, refn, rin, other
- [x] API functions: `addPersonIdentifier`, `getPersonIdentifiers`, `deletePersonIdentifier`
- [x] IPC channels and preload: `persons:addIdentifier`, `persons:getIdentifiers`, `persons:deleteIdentifier`
- [x] MCP tools: `add_person_identifier`, `get_person_identifiers`, `delete_person_identifier`
- [x] PersonDetailView: inline sex edit (select replacing static badge)
- [x] PersonDetailView: name rows clickable (click = edit modal) + delete button only
- [x] PersonDetailView: name prefix/suffix/qualifier in add/edit modals
- [x] PersonDetailView: relationships rows + delete button (row click = navigate to detail)
- [x] PersonDetailView: external identifiers section with add/delete
- [x] AddRelatedPersonModal: "New / Existing" toggle with PersonPicker for existing persons
- [x] Swedish i18n for all new UI strings
```

- [ ] **Step 5: Run all tests one final time**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md .claude/DATA_MODEL.md .claude/PLAN.md
git commit -m "docs: update CLAUDE.md, DATA_MODEL.md, PLAN.md for v0.3.1 GEDCOM-X alignment"
```

---

## What Was Left Out (and Why)

| Feature | Reason deferred |
|---------|----------------|
| Media/Document attachments | Already in v0.6.0 roadmap. Independent of name parts/identifiers. |
| Agent/Contributor entity | Only needed for GEDCOM SUBM export. Low user value until v0.5.0 GEDCOM export. |
| `sibling` → GEDCOM-X alignment | Current model's `sibling` type is a pragmatic UI convenience not in GEDCOM-X. Not worth removing — it simplifies data entry. |
| `EnslavedBy` relationship | Not relevant for Swedish genealogy. |
| `AncestorDescendant` relationship | Derivable from parent_child chain; no new table needed. |

---

## Self-Review

**Spec coverage:**
- ✅ Name prefix (PREFIX NamePart) — Task 1 schema + Task 7 UI
- ✅ Name suffix (SUFFIX NamePart) — Task 1 schema + Task 7 UI
- ✅ Patronymic qualifier — Task 1 schema + Task 7 UI
- ✅ Person identifiers (external IDs) — Tasks 1–4, 8
- ✅ MCP tools for identifiers — Task 4
- ✅ Sex editing in PersonDetailView header — Task 5
- ✅ Relationships: delete button + clickable row — Task 6
- ✅ Names: clickable rows (edit modal on click) + delete button — Task 7 Step 1
- ✅ AddRelatedPersonModal: New/Existing toggle with PersonPicker — Task 9
- ✅ Swedish i18n for all new strings — Tasks 5–9
- ✅ Documentation — Task 10

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:**
- `PersonName.name_qualifier` is `'patronymic' | 'matronymic' | 'particle' | 'married' | 'alias' | null` in types.ts and persons.ts; Vue components use `'' | 'patronymic' | 'matronymic' | 'particle'` (empty string for the "no qualifier" select state, converted to null before API call)
- `PersonIdentifier.identifier_type` enum is consistent across types.ts, persons.ts, MCP Zod schema, and Vue template `<option>` values
- `window.api.persons.addIdentifier` / `getIdentifiers` / `deleteIdentifier` match in ipc.ts, preload/index.ts, and Vue usage
| `AncestorDescendant` relationship | Derivable from parent_child chain; no new table needed. |
