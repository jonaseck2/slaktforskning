# GEDCOM-X Alignment: Name Parts + Person Identifiers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two highest-impact GEDCOM-X data model gaps — name prefixes/suffixes/qualifiers and person external identifiers — to prepare the schema for GEDCOM 5.5.1 import/export.

**Architecture:** Extend `person_names` with four new nullable columns (`name_prefix`, `name_suffix`, `patronymic_base`, `name_qualifier`). Add a new `person_identifiers` table for typed external IDs. Both changes are additive and non-breaking. Wire the new fields through API → IPC → preload → MCP → Vue (display + modals).

**Tech Stack:** SQLite via node-sqlite3-wasm, TypeScript, Vue 3 Composition API, Vitest unit tests, MCP server (@modelcontextprotocol/sdk).

---

## Background

**GEDCOM-X NamePart types missing from current model:**
- `PREFIX` — "Dr.", "von", "af", "de la", "Rev.", "Prost." → `name_prefix`
- `SUFFIX` — "Jr.", "Sr.", "III", "den yngre" → `name_suffix`
- Qualifiers: `Patronymic`, `Matronymic`, `Particle` → `name_qualifier`
- `patronymic_base` — the given name of the parent (e.g. "Erik" if surname is "Eriksson")

**Why important for Swedish genealogy:** Patronymics were the norm until the Name Act forced fixed surnames (fully enforced 1963). Nobility used particles: Carl von Linné, Axel af Klint.

**GEDCOM 5.5.1 mapping:** `NAME.NPFX` → `name_prefix`, `NAME.NSFX` → `name_suffix`, `INDI.REFN` → `person_identifiers` (type=`refn`), `INDI.RIN` → `person_identifiers` (type=`rin`).

**GEDCOM-X Identifier objects on Person:**
- Typed external IDs: FamilySearch person ID, Ancestry ID, Riksarkivet ID, personnummer, REFN, RIN.

---

## File Map

| File | Change |
|------|--------|
| `src/api/schema.ts` | Add 4 columns to `person_names`; create `person_identifiers` table |
| `src/api/types.ts` | Update `PersonName` type; add `PersonIdentifier` type |
| `src/api/persons.ts` | Update `addPersonName`; add `addPersonIdentifier`, `getPersonIdentifiers`, `deletePersonIdentifier` |
| `src/main/ipc.ts` | Register 3 new IPC handlers: `persons:addIdentifier`, `persons:getIdentifiers`, `persons:deleteIdentifier` |
| `src/preload/index.ts` | Expose new handlers on `window.api.persons` |
| `src/mcp/server.ts` | Add 3 MCP tools: `add_person_identifier`, `get_person_identifiers`, `delete_person_identifier` |
| `src/renderer/views/PersonDetailView.vue` | Show prefix/suffix/qualifier in names table; add fields to add/edit name modals; add identifiers section |
| `tests/unit/persons.test.ts` | Tests for new name columns + identifier CRUD |
| `CLAUDE.md` | Update PersonName type, window.api surface, MCP tools |
| `docs/DATA_MODEL.md` | Update `person_names` table, add `person_identifiers` table |
| `docs/PLAN.md` | Mark v0.3.1 done |

---

## Task 1: Schema + Types

**Files:**
- Modify: `src/api/schema.ts`
- Modify: `src/api/types.ts`

- [ ] **Step 1: Add columns to person_names DDL**

In `src/api/schema.ts`, find the `CREATE TABLE IF NOT EXISTS person_names` statement and add four nullable columns after `sort_order`:

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

- [ ] **Step 2: Add person_identifiers table to schema**

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
git commit -m "feat: add name prefix/suffix/patronymic columns and person_identifiers schema"
```

---

## Task 2: API Functions

**Files:**
- Modify: `src/api/persons.ts`
- Modify: `tests/unit/persons.test.ts`

- [ ] **Step 1: Write failing tests for extended name columns**

In `tests/unit/persons.test.ts`, add after existing `addPersonName` tests:

```typescript
describe('addPersonName with extended fields', () => {
  it('stores name_prefix and name_suffix', () => {
    const person = createPerson(db, {});
    const name = addPersonName(db, person.id, { given_name: 'Carl', surname: 'Linné', name_prefix: 'von' });
    expect(name.name_prefix).toBe('von');
    expect(name.name_suffix).toBeNull();
  });

  it('stores patronymic_base and name_qualifier', () => {
    const person = createPerson(db, {});
    const name = addPersonName(db, person.id, { given_name: 'Lars', surname: 'Eriksson', patronymic_base: 'Erik', name_qualifier: 'patronymic' });
    expect(name.patronymic_base).toBe('Erik');
    expect(name.name_qualifier).toBe('patronymic');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "patronymic"
```

Expected: FAIL.

- [ ] **Step 3: Update addPersonName to accept and return new fields**

In `src/api/persons.ts`, update `addPersonName` signature and INSERT:

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
  db.prepare(`
    INSERT INTO person_names
      (id, person_id, given_name, surname, name_type, date_from, date_to, sort_order,
       name_prefix, name_suffix, patronymic_base, name_qualifier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run([
    id, personId,
    data.given_name ?? null, data.surname ?? null,
    data.name_type ?? 'birth',
    data.date_from ?? null, data.date_to ?? null,
    data.sort_order ?? 0,
    data.name_prefix ?? null, data.name_suffix ?? null,
    data.patronymic_base ?? null, data.name_qualifier ?? null,
  ]);
  return db.prepare('SELECT * FROM person_names WHERE id = ?').get([id]) as PersonName;
}
```

`getPersonNames` uses `SELECT *` so returns new columns automatically once the schema is updated.

- [ ] **Step 4: Write failing tests for person identifier CRUD**

```typescript
import { addPersonIdentifier, getPersonIdentifiers, deletePersonIdentifier } from '../../src/api/persons';

describe('person identifiers', () => {
  it('adds and retrieves an identifier', () => {
    const person = createPerson(db, {});
    const id = addPersonIdentifier(db, person.id, { identifier_type: 'familysearch', identifier_value: 'L123-XYZ' });
    expect(id.identifier_type).toBe('familysearch');
    const list = getPersonIdentifiers(db, person.id);
    expect(list).toHaveLength(1);
  });

  it('deletes an identifier', () => {
    const person = createPerson(db, {});
    const id = addPersonIdentifier(db, person.id, { identifier_type: 'ancestry', identifier_value: 'A456' });
    expect(deletePersonIdentifier(db, id.id)).toBe(true);
    expect(getPersonIdentifiers(db, person.id)).toHaveLength(0);
  });

  it('enforces uniqueness per person/type/value', () => {
    const person = createPerson(db, {});
    addPersonIdentifier(db, person.id, { identifier_type: 'riksarkivet', identifier_value: 'R789' });
    expect(() => addPersonIdentifier(db, person.id, { identifier_type: 'riksarkivet', identifier_value: 'R789' })).toThrow();
  });
});
```

- [ ] **Step 5: Run to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "addPersonIdentifier"
```

Expected: FAIL.

- [ ] **Step 6: Implement person identifier functions**

```typescript
export function addPersonIdentifier(
  db: Database,
  personId: string,
  data: { identifier_type: PersonIdentifier['identifier_type']; identifier_value: string }
): PersonIdentifier {
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run([id, personId, data.identifier_type, data.identifier_value, new Date().toISOString()]);
  return db.prepare('SELECT * FROM person_identifiers WHERE id = ?').get([id]) as PersonIdentifier;
}

export function getPersonIdentifiers(db: Database, personId: string): PersonIdentifier[] {
  return db.prepare('SELECT * FROM person_identifiers WHERE person_id = ? ORDER BY created_at ASC').all([personId]) as PersonIdentifier[];
}

export function deletePersonIdentifier(db: Database, id: string): boolean {
  return db.prepare('DELETE FROM person_identifiers WHERE id = ?').run([id]).changes > 0;
}
```

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add src/api/persons.ts tests/unit/persons.test.ts
git commit -m "feat: extend addPersonName with prefix/suffix/patronymic; add person identifier CRUD"
```

---

## Task 3: IPC + Preload

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Register new IPC handlers (after `persons:getNames`)**

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

- [ ] **Step 2: Expose in preload/index.ts (after `getNames`)**

```typescript
addIdentifier: (personId: string, data: unknown) => ipcRenderer.invoke('persons:addIdentifier', personId, data),
getIdentifiers: (personId: string) => ipcRenderer.invoke('persons:getIdentifiers', personId),
deleteIdentifier: (id: string) => ipcRenderer.invoke('persons:deleteIdentifier', id),
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

- [ ] **Step 1: Add import**

```typescript
import { ..., addPersonIdentifier, getPersonIdentifiers, deletePersonIdentifier } from '../api/persons';
```

- [ ] **Step 2: Add 3 tools after `get_person_names`**

```typescript
server.tool('add_person_identifier', 'Add an external identifier to a person (FamilySearch ID, Ancestry ID, etc.)', {
  person_id: z.string(),
  identifier_type: z.enum(['familysearch','ancestry','riksarkivet','personnummer','refn','rin','other']),
  identifier_value: z.string(),
}, async ({ person_id, identifier_type, identifier_value }) =>
  ({ content: [{ type: 'text', text: JSON.stringify(addPersonIdentifier(db, person_id, { identifier_type, identifier_value })) }] })
);

server.tool('get_person_identifiers', 'Get all external identifiers for a person', { person_id: z.string() },
  async ({ person_id }) => ({ content: [{ type: 'text', text: JSON.stringify(getPersonIdentifiers(db, person_id)) }] })
);

server.tool('delete_person_identifier', 'Delete an external identifier', { id: z.string() },
  async ({ id }) => ({ content: [{ type: 'text', text: JSON.stringify({ deleted: deletePersonIdentifier(db, id) }) }] })
);
```

- [ ] **Step 3: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat: add MCP tools for person identifiers"
```

---

## Task 5: Vue UI

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Display prefix/suffix/qualifier in the names table**

In the names table `<tbody>`, update each row to show new fields alongside the existing columns. The edit button and delete button stay as-is (clickable-row behaviour is handled by a separate UX plan):

```vue
<tr v-for="name in names" :key="name.id" class="clickable-row" @click="openEditName(name)">
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
    <button v-if="name.sort_order > 0" class="btn-sm btn-delete" @click.stop="removeName(name.id)">
      {{ $t('common.delete') }}
    </button>
  </td>
</tr>
```

Add to `NameRow` interface:

```typescript
interface NameRow {
  id: string; given_name: string; surname: string; name_type: string; sort_order: number;
  name_prefix: string | null; name_suffix: string | null;
  patronymic_base: string | null; name_qualifier: string | null;
}
```

Add styles:

```css
.name-prefix { color: #6b7280; font-style: italic; }
.name-qual-badge { background: #fef3c7; color: #92400e; padding: 1px 5px; border-radius: 8px; font-size: 11px; margin-left: 4px; }
```

- [ ] **Step 2: Add prefix/suffix/qualifier fields to Add Name modal**

After the `name_type` select in the add-name modal form, add:

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

Update `nameForm` reactive and `addName` to include the new fields (pass as null when empty, reset on close). Also update `editNameForm`, `openEditName`, and `saveEditName` identically for the edit modal.

- [ ] **Step 3: Add identifiers section**

After the notes section, add a `<section>` for identifiers. State:

```typescript
interface IdentifierRow { id: string; identifier_type: string; identifier_value: string; }
const identifiers = ref<IdentifierRow[]>([]);
const showAddIdentifier = ref(false);
const newIdentifier = reactive({ identifier_type: 'familysearch', identifier_value: '' });

async function loadIdentifiers() {
  identifiers.value = (await window.api.persons.getIdentifiers(personId)) as IdentifierRow[];
}
async function addIdentifier() {
  await window.api.persons.addIdentifier(personId, { identifier_type: newIdentifier.identifier_type, identifier_value: newIdentifier.identifier_value });
  newIdentifier.identifier_value = '';
  showAddIdentifier.value = false;
  await loadIdentifiers();
}
async function removeIdentifier(id: string) {
  await window.api.persons.deleteIdentifier(id);
  await loadIdentifiers();
}
```

Call `loadIdentifiers()` inside `load()`. Template:

```vue
<section class="detail-section">
  <div class="section-header">
    <h4>{{ $t('identifiers.title') }}</h4>
    <button class="btn-add" @click="showAddIdentifier = true">{{ $t('identifiers.add') }}</button>
  </div>
  <div v-if="identifiers.length === 0" class="empty-hint">{{ $t('identifiers.none') }}</div>
  <table v-else class="data-table">
    <thead><tr><th>{{ $t('identifiers.type') }}</th><th>{{ $t('identifiers.value') }}</th><th>{{ $t('common.actions') }}</th></tr></thead>
    <tbody>
      <tr v-for="ident in identifiers" :key="ident.id">
        <td><span class="type-badge">{{ $t('identifiers.types.' + ident.identifier_type) }}</span></td>
        <td>{{ ident.identifier_value }}</td>
        <td class="actions-cell">
          <button class="btn-sm btn-delete" @click="removeIdentifier(ident.id)">{{ $t('common.delete') }}</button>
        </td>
      </tr>
    </tbody>
  </table>
  <!-- Add identifier modal follows same pattern as other modals -->
</section>
```

- [ ] **Step 4: Add i18n strings**

In `sv.ts`:

```typescript
names: {
  prefix: 'Prefix', prefixPlaceholder: 'von, af, Dr., Prost.',
  suffix: 'Suffix', suffixPlaceholder: 'Jr., d.y.',
  qualifier: 'Namnkvalificerare',
  qualifierPatronymic: 'Patronymikon', qualifierMatronymic: 'Matronymikon', qualifierParticle: 'Adelstitel/partikel',
  patronymicBase: 'Faders/moders förnamn', patronymicBasePlaceholder: 't.ex. Erik (om efternamnet är Eriksson)',
},
identifiers: {
  title: 'Externa identifierare', add: 'Lägg till', addTitle: 'Lägg till identifierare', none: 'Inga identifierare',
  type: 'Typ', value: 'Värde',
  types: { familysearch: 'FamilySearch', ancestry: 'Ancestry', riksarkivet: 'Riksarkivet', personnummer: 'Personnummer', refn: 'Referensnummer', rin: 'RIN', other: 'Annat' },
},
```

In `en.ts`:

```typescript
names: {
  prefix: 'Prefix', prefixPlaceholder: 'von, af, Dr., Rev.',
  suffix: 'Suffix', suffixPlaceholder: 'Jr., Sr., III',
  qualifier: 'Name qualifier',
  qualifierPatronymic: 'Patronymic', qualifierMatronymic: 'Matronymic', qualifierParticle: 'Noble particle',
  patronymicBase: "Parent's given name", patronymicBasePlaceholder: 'e.g. Erik (if surname is Eriksson)',
},
identifiers: {
  title: 'External identifiers', add: 'Add', addTitle: 'Add identifier', none: 'No identifiers',
  type: 'Type', value: 'Value',
  types: { familysearch: 'FamilySearch', ancestry: 'Ancestry', riksarkivet: 'Riksarkivet', personnummer: 'Personnummer', refn: 'Reference number', rin: 'RIN', other: 'Other' },
},
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/PersonDetailView.vue src/renderer/i18n/
git commit -m "feat: add name prefix/suffix/qualifier display and identifiers section to PersonDetailView"
```

---

## Task 6: Update Documentation

- [ ] **Step 1: Update PersonName type in CLAUDE.md**

```typescript
PersonName { id, person_id, given_name, surname, name_type, date_from?, date_to?, sort_order, name_prefix?, name_suffix?, patronymic_base?, name_qualifier? }
PersonIdentifier { id, person_id, identifier_type, identifier_value, created_at }
```

- [ ] **Step 2: Update window.api surface in CLAUDE.md**

```typescript
window.api.persons.addIdentifier(personId, data) // → PersonIdentifier
window.api.persons.getIdentifiers(personId)       // → PersonIdentifier[]
window.api.persons.deleteIdentifier(id)           // → boolean
```

- [ ] **Step 3: Update DATA_MODEL.md** — add 4 columns to person_names table, add person_identifiers table.

- [ ] **Step 4: Mark v0.3.1 done in PLAN.md**

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/DATA_MODEL.md docs/PLAN.md
git commit -m "docs: update docs for v0.3.1 GEDCOM-X name parts and identifiers"
```

---

## Self-Review

- ✅ Schema: 4 new columns on `person_names`, `person_identifiers` table — Task 1
- ✅ API: extended `addPersonName`, identifier CRUD — Task 2
- ✅ IPC + preload — Task 3
- ✅ MCP tools — Task 4
- ✅ Display prefix/suffix/qualifier in names table — Task 5
- ✅ Prefix/suffix/qualifier fields in add/edit name modals — Task 5
- ✅ Identifiers section in PersonDetailView — Task 5
- ✅ Swedish i18n — Task 5
- ✅ Documentation — Task 6

**Not in this plan (separate UX plan):** sex editing, name rows clickable behaviour, relationship delete button, AddRelatedPersonModal existing-person support.
