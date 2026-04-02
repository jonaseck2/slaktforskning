# PersonDetailView UX Improvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four focused UX improvements to PersonDetailView and AddRelatedPersonModal: (1) inline sex editing, (2) name rows clickable instead of using a separate Edit button, (3) delete button on relationship rows, (4) AddRelatedPersonModal can link existing persons instead of only creating new ones.

**Architecture:** Pure UI changes — no schema, no API, no IPC changes. The `updatePerson` API already accepts `{ sex }`. Relationship delete uses the existing `window.api.relationships.delete`. PersonPicker already exists and is reused in AddRelatedPersonModal.

**Tech Stack:** Vue 3 Composition API, vue-i18n.

---

## File Map

| File | Change |
|------|--------|
| `src/renderer/views/PersonDetailView.vue` | Sex select in header; name rows clickable; relationship rows + delete button |
| `src/renderer/components/AddRelatedPersonModal.vue` | New/Existing toggle with PersonPicker |
| `src/renderer/i18n/sv.ts` | New strings for addRelated section |
| `src/renderer/i18n/en.ts` | New strings for addRelated section |

---

## Task 1: Inline Sex Editing

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`

Currently `person.sex` is a static badge in `.header-info`. The API already supports `window.api.persons.update(id, { sex })`.

- [ ] **Step 1: Replace static sex badge with inline select**

In the `<div class="header-info">` block, replace:

```vue
<span :class="'sex-badge sex-' + person.sex">{{ person.sex }}</span>
```

With:

```vue
<select
  :class="'sex-select sex-' + person.sex"
  :value="person.sex"
  @change="updateSex(($event.target as HTMLSelectElement).value)"
>
  <option value="M">{{ $t('sex.M') }}</option>
  <option value="F">{{ $t('sex.F') }}</option>
  <option value="U">{{ $t('sex.U') }}</option>
</select>
```

- [ ] **Step 2: Add updateSex handler**

In `<script setup>`, add after `saveNotes`:

```typescript
async function updateSex(sex: string) {
  if (!window.api || !person.value) return;
  await window.api.persons.update(personId, { sex });
  person.value.sex = sex;
}
```

- [ ] **Step 3: Add sex select styles**

In `<style scoped>`, add:

```css
.sex-select {
  padding: 2px 20px 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid #ccc;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath d='M0 2l4 4 4-4z' fill='%23666'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
}
.sex-select.sex-M { background-color: #dbeafe; color: #1d4ed8; }
.sex-select.sex-F { background-color: #fce7f3; color: #be185d; }
.sex-select.sex-U { background-color: #f3f4f6; color: #6b7280; }
```

- [ ] **Step 4: Add i18n strings if missing**

Check `sv.ts`/`en.ts` for a `sex` key group. If missing:

```typescript
// sv.ts
sex: { M: 'Man', F: 'Kvinna', U: 'Okänd' },
// en.ts
sex: { M: 'Male', F: 'Female', U: 'Unknown' },
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/PersonDetailView.vue src/renderer/i18n/
git commit -m "feat: add inline sex editing to PersonDetailView header"
```

---

## Task 2: Name Rows Clickable

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`

Currently the names table has an explicit "Edit" button per row. The click target is small and inconsistent with the relationships table (which uses clickable rows). Replace with a clickable row that opens the edit modal; remove the edit button; keep only the delete button with `@click.stop`.

- [ ] **Step 1: Update names table rows**

Find the names `<tbody>`. Remove `class="btn-sm btn-edit"` edit button. Add `class="clickable-row"` and `@click="openEditName(name)"` to `<tr>`. Add `@click.stop` to the delete button.

Before:
```vue
<tr v-for="name in names" :key="name.id">
  ...
  <td class="actions-cell">
    <button class="btn-sm btn-edit" @click="openEditName(name)">{{ $t('common.edit') }}</button>
    <button v-if="name.sort_order > 0" class="btn-sm btn-delete" @click="removeName(name.id)">{{ $t('common.delete') }}</button>
  </td>
</tr>
```

After:
```vue
<tr v-for="name in names" :key="name.id" class="clickable-row" @click="openEditName(name)">
  ...
  <td class="actions-cell">
    <button v-if="name.sort_order > 0" class="btn-sm btn-delete" @click.stop="removeName(name.id)">
      {{ $t('common.delete') }}
    </button>
  </td>
</tr>
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/views/PersonDetailView.vue
git commit -m "feat: make name rows clickable, remove redundant edit button"
```

---

## Task 3: Relationship Delete Button

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`

Currently relationship rows navigate to `/relationships/:id` on click but have no delete affordance. Add a delete button per row with `@click.stop` and a `deleteRelationship` handler.

- [ ] **Step 1: Add deleteRelationship handler**

In `<script setup>`:

```typescript
async function deleteRelationship(id: string) {
  if (!window.api) return;
  await window.api.relationships.delete(id);
  await load();
}
```

- [ ] **Step 2: Update relationships table**

Add an `Actions` `<th>` and a delete button `<td>` to each row. Keep `class="clickable-row"` and `@click` for navigation:

Before:
```vue
<thead><tr>
  <th>{{ $t('common.type') }}</th>
  <th>{{ $t('relationshipDetail.subtype') }}</th>
  <th>{{ $t('common.name') }}</th>
</tr></thead>
<tbody>
  <tr v-for="rel in rels" :key="rel.id" class="clickable-row" @click="$router.push(`/relationships/${rel.id}`)">
    <td>...</td><td>...</td><td>...</td>
  </tr>
</tbody>
```

After:
```vue
<thead><tr>
  <th>{{ $t('common.type') }}</th>
  <th>{{ $t('relationshipDetail.subtype') }}</th>
  <th>{{ $t('common.name') }}</th>
  <th>{{ $t('common.actions') }}</th>
</tr></thead>
<tbody>
  <tr v-for="rel in rels" :key="rel.id" class="clickable-row" @click="$router.push(`/relationships/${rel.id}`)">
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
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/views/PersonDetailView.vue
git commit -m "feat: add delete button to relationship rows in PersonDetailView"
```

---

## Task 4: AddRelatedPersonModal — Link Existing Person

**Files:**
- Modify: `src/renderer/components/AddRelatedPersonModal.vue`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

Currently the modal only creates a new person. Add a "New / Existing" toggle. When "Existing" is selected, show a PersonPicker and skip person creation — only create the relationship.

- [ ] **Step 1: Add toggle state and PersonPicker import**

In `<script setup>`:

```typescript
import PersonPicker from './PersonPicker.vue';

const entryMode = ref<'new' | 'existing'>('new');
const existingPersonId = ref<string | null>(null);
```

- [ ] **Step 2: Update the template**

Replace the form content with a mode toggle + conditional sections:

```vue
<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h3>{{ title }}</h3>
      <form @submit.prevent="save">
        <!-- Toggle -->
        <div class="entry-mode-toggle">
          <button type="button" :class="['toggle-btn', { active: entryMode === 'new' }]"
            @click="entryMode = 'new'; existingPersonId = null">
            {{ $t('addRelated.newPerson') }}
          </button>
          <button type="button" :class="['toggle-btn', { active: entryMode === 'existing' }]"
            @click="entryMode = 'existing'">
            {{ $t('addRelated.existingPerson') }}
          </button>
        </div>

        <!-- Existing person -->
        <template v-if="entryMode === 'existing'">
          <label>
            {{ $t('addRelated.selectPerson') }}
            <PersonPicker :model-value="existingPersonId" :placeholder="$t('addRelated.searchPlaceholder')"
              @update:model-value="existingPersonId = $event" />
          </label>
        </template>

        <!-- New person -->
        <template v-else>
          <label>{{ $t('persons.givenName') }}
            <input v-model="form.given_name" type="text" required :placeholder="$t('persons.givenName')" />
          </label>
          <label>{{ $t('persons.surname') }}
            <input v-model="form.surname" type="text" :placeholder="$t('persons.surname')" />
          </label>
          <label>{{ $t('persons.sex') }}
            <select v-model="form.sex">
              <option value="U">{{ $t('persons.sexUnknown') }}</option>
              <option value="M">{{ $t('persons.male') }}</option>
              <option value="F">{{ $t('persons.female') }}</option>
            </select>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.living" />{{ $t('persons.living') }}
          </label>
        </template>

        <!-- Subtype — both modes, spouse only -->
        <label v-if="mode === 'spouse'">{{ $t('personDetail.coupleSubtype') }}
          <select v-model="form.subtype">
            <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">{{ $t('coupleSubtypes.' + st) }}</option>
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

- [ ] **Step 3: Update save function**

Replace the existing `save` function:

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
        given_name: form.given_name, surname: form.surname,
        sex: form.sex, living: form.living,
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

```css
.entry-mode-toggle {
  display: flex;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 4px;
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
.toggle-btn.active { background: #2c3e50; color: white; }
```

- [ ] **Step 5: Add i18n strings**

```typescript
// sv.ts
addRelated: { newPerson: 'Ny person', existingPerson: 'Befintlig person', selectPerson: 'Välj person', searchPlaceholder: 'Sök namn…' },
// en.ts
addRelated: { newPerson: 'New person', existingPerson: 'Existing person', selectPerson: 'Select person', searchPlaceholder: 'Search name…' },
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/AddRelatedPersonModal.vue src/renderer/i18n/
git commit -m "feat: allow linking existing persons in AddRelatedPersonModal"
```

---

## Self-Review

- ✅ Sex inline editing — Task 1
- ✅ Name rows clickable, edit button removed — Task 2
- ✅ Relationship delete button with `@click.stop` — Task 3
- ✅ AddRelatedPersonModal New/Existing toggle with PersonPicker — Task 4
- ✅ Swedish i18n for all new strings — Tasks 1, 4

**Type consistency:** `entryMode` is `'new' | 'existing'` throughout. `existingPersonId` is `string | null` matching PersonPicker's `modelValue` type. `save()` guards against `entryMode === 'existing' && !existingPersonId` both in the button `:disabled` binding and in the function body.
