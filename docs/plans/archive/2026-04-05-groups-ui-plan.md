# Groups UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Groups UI — a GroupsView list, GroupDetailView with members, a GroupPicker component, and a Groups section in PersonDetailView — plus update the sidebar nav with icons.

**Architecture:** All backend API (`window.api.groups.*`) is already complete. This is a pure frontend build: two new views, one new component, additions to PersonDetailView and App.vue. GroupPicker mirrors PersonPicker but searches groups and supports inline creation.

**Tech Stack:** Vue 3 Composition API (`<script setup>`), Vue Router hash-history, vue-i18n, existing `window.api.groups.*` IPC surface.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/i18n/sv.ts` | Modify | Add `groups.*` and `nav.groups` keys |
| `src/renderer/i18n/en.ts` | Modify | Add English translations |
| `src/renderer/router.ts` | Modify | Add `/groups` and `/groups/:id` routes |
| `src/renderer/App.vue` | Modify | Add Groups nav link, update person + quality icons |
| `src/renderer/views/GroupsView.vue` | Create | Groups list with member count |
| `src/renderer/views/GroupDetailView.vue` | Create | Edit group + members table |
| `src/renderer/components/GroupPicker.vue` | Create | Autocomplete for adding person to group |
| `src/renderer/views/PersonDetailView.vue` | Modify | Add Groups section before Notes |

---

## Task 1: i18n keys + router routes

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/router.ts`

- [ ] **Step 1: Add Swedish i18n keys**

In `src/renderer/i18n/sv.ts`, add inside the export default object after the `researchTasks` block:

```typescript
  groups: {
    title: 'Grupper',
    addGroup: 'Lägg till grupp',
    emptyState: 'Inga grupper ännu.',
    name: 'Namn',
    notes: 'Anteckningar',
    members: 'Medlemmar',
    addMember: 'Lägg till',
    confirmDelete: 'Ta bort gruppen? Alla medlemskap tas bort.',
    confirmRemoveMember: 'Ta bort personen från gruppen?',
    noGroups: 'Inte med i någon grupp ännu.',
    searchOrCreate: 'Sök grupp eller skapa ny\u2026',
    createNew: 'Skapa ny grupp',
    cancel: 'Avbryt',
  },
```

Also add `groups: 'Grupper'` inside the existing `nav` block in `sv.ts`.

- [ ] **Step 2: Add English i18n keys**

In `src/renderer/i18n/en.ts`, add the same structure after the `researchTasks` block:

```typescript
  groups: {
    title: 'Groups',
    addGroup: 'Add group',
    emptyState: 'No groups yet.',
    name: 'Name',
    notes: 'Notes',
    members: 'Members',
    addMember: 'Add',
    confirmDelete: 'Delete this group? All memberships will be removed.',
    confirmRemoveMember: 'Remove this person from the group?',
    noGroups: 'Not a member of any group yet.',
    searchOrCreate: 'Search group or create new\u2026',
    createNew: 'Create new group',
    cancel: 'Cancel',
  },
```

Also add `groups: 'Groups'` inside the existing `nav` block in `en.ts`.

- [ ] **Step 3: Add routes**

In `src/renderer/router.ts`, add after the `research-tasks` route:

```typescript
    { path: '/groups', component: () => import('./views/GroupsView.vue') },
    { path: '/groups/:id', component: () => import('./views/GroupDetailView.vue') },
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all 440 tests pass (no logic changes yet).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(groups): i18n keys and router routes"
```

---

## Task 2: GroupsView

**Files:**
- Create: `src/renderer/views/GroupsView.vue`

- [ ] **Step 1: Create GroupsView**

Create `src/renderer/views/GroupsView.vue`:

```vue
<template>
  <div>
    <div class="header">
      <h2>{{ $t('groups.title') }}</h2>
      <button @click="showAddForm = true">{{ $t('groups.addGroup') }}</button>
    </div>
    <div v-if="groups.length === 0" class="empty">{{ $t('groups.emptyState') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('groups.name') }}</th>
          <th>{{ $t('groups.members') }}</th>
          <th>{{ $t('groups.notes') }}</th>
          <th>{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="g in groups"
          :key="g.id"
          class="clickable-row"
          @click="router.push('/groups/' + g.id)"
        >
          <td>{{ g.name }}</td>
          <td>{{ g.memberCount }}</td>
          <td class="notes-cell">{{ g.notes }}</td>
          <td>
            <button class="btn-sm btn-delete" @click.stop="deleteGroup(g.id)">{{ $t('common.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Add Group Modal -->
    <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
      <div class="modal">
        <h3>{{ $t('groups.addGroup') }}</h3>
        <form @submit.prevent="addGroup">
          <label>
            {{ $t('groups.name') }} *
            <input v-model="form.name" type="text" required autofocus />
          </label>
          <label>
            {{ $t('groups.notes') }}
            <textarea v-model="form.notes" rows="2" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showAddForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('common.save') }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface GroupRow {
  id: string;
  name: string;
  notes: string;
  memberCount: number;
}

const { t } = useI18n();
const router = useRouter();
const groups = ref<GroupRow[]>([]);
const showAddForm = ref(false);
const form = reactive({ name: '', notes: '' });

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') showAddForm.value = false;
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

async function load() {
  if (!window.api) return;
  const raw = (await window.api.groups.list()) as Array<{ id: string; name: string; notes: string }>;
  const enriched: GroupRow[] = [];
  for (const g of raw) {
    const members = (await window.api.groups.getMembers(g.id)) as unknown[];
    enriched.push({ ...g, memberCount: members.length });
  }
  groups.value = enriched;
}

async function addGroup() {
  if (!window.api || !form.name.trim()) return;
  await window.api.groups.create({ name: form.name.trim(), notes: form.notes.trim() });
  showAddForm.value = false;
  form.name = '';
  form.notes = '';
  await load();
}

async function deleteGroup(id: string) {
  if (!confirm(t('groups.confirmDelete'))) return;
  await window.api.groups.delete(id);
  await load();
}

onMounted(load);
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
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
.clickable-row { cursor: pointer; }
.clickable-row:hover { background: #f0f4ff; }
.notes-cell {
  color: #777;
  font-size: 13px;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.btn-sm { padding: 4px 8px; font-size: 12px; }
.btn-delete { background: #fee; color: #c0392b; }
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
form input, form textarea {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.modal-actions button { padding: 8px 16px; border-radius: 4px; border: none; cursor: pointer; font-size: 14px; }
.modal-actions button[type='submit'] { background: #2c3e50; color: white; }
.btn-cancel { background: #e0e0e0; color: #333; }
</style>
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: 440 tests pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(groups): GroupsView list with add/delete"
```

---

## Task 3: GroupDetailView

**Files:**
- Create: `src/renderer/views/GroupDetailView.vue`

- [ ] **Step 1: Create GroupDetailView**

Create `src/renderer/views/GroupDetailView.vue`:

```vue
<template>
  <div v-if="group" class="group-detail">
    <button class="btn-back" @click="$router.push('/groups')">← {{ $t('groups.title') }}</button>

    <input
      class="group-name-input"
      v-model="editName"
      type="text"
      @blur="saveName"
    />

    <textarea
      class="group-notes-input"
      v-model="editNotes"
      rows="2"
      :placeholder="$t('groups.notes')"
      @blur="saveNotes"
    />

    <!-- Members -->
    <div class="members-header">
      <h4>{{ $t('groups.members') }} <span class="count">({{ members.length }})</span></h4>
      <button v-if="!showAddMember" class="btn-add" @click="showAddMember = true">+ {{ $t('groups.addMember') }}</button>
    </div>

    <!-- Add member picker -->
    <div v-if="showAddMember" class="add-member-row">
      <PersonPicker v-model="newMemberId" :placeholder="$t('common.unknown')" />
      <button class="btn-sm" @click="addMember" :disabled="!newMemberId">{{ $t('groups.addMember') }}</button>
      <button class="btn-sm btn-cancel-inline" @click="showAddMember = false; newMemberId = null">{{ $t('common.cancel') }}</button>
    </div>

    <div v-if="members.length === 0" class="empty-hint">{{ $t('groups.noGroups') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('common.name') }}</th>
          <th>{{ $t('persons.sex') }}</th>
          <th>{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in members" :key="m.person_id">
          <td>
            <router-link :to="'/persons/' + m.person_id" class="person-link">
              <PersonName :given-name="m.given_name" :surname="m.surname" :preferred-name="m.preferred_name" :nickname="m.nickname" />
            </router-link>
          </td>
          <td>{{ m.sex || '–' }}</td>
          <td>
            <button class="btn-sm btn-delete" @click="removeMember(m.person_id)">{{ $t('common.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import PersonPicker from '../components/PersonPicker.vue';
import PersonName from '../components/PersonName.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface Group { id: string; name: string; notes: string; }
interface MemberRow {
  person_id: string;
  given_name: string | null;
  surname: string | null;
  preferred_name: string | null;
  nickname: string | null;
  sex: string;
}

const route = useRoute();
const groupId = route.params.id as string;

const group = ref<Group | null>(null);
const editName = ref('');
const editNotes = ref('');
const members = ref<MemberRow[]>([]);
const showAddMember = ref(false);
const newMemberId = ref<string | null>(null);

async function load() {
  if (!window.api) return;
  group.value = (await window.api.groups.get(groupId)) as Group | null;
  if (!group.value) return;
  editName.value = group.value.name;
  editNotes.value = group.value.notes;
  await loadMembers();
}

async function loadMembers() {
  const raw = (await window.api.groups.getMembers(groupId)) as Array<{ person_id: string }>;
  const rows: MemberRow[] = [];
  for (const m of raw) {
    const names = (await window.api.persons.getNames(m.person_id)) as Array<{
      given_name: string | null; surname: string | null;
      preferred_name: string | null; nickname: string | null;
    }>;
    const person = (await window.api.persons.get(m.person_id)) as { sex: string } | null;
    const n = names[0] ?? { given_name: null, surname: null, preferred_name: null, nickname: null };
    rows.push({ person_id: m.person_id, ...n, sex: person?.sex ?? '' });
  }
  members.value = rows;
}

async function saveName() {
  if (!group.value || editName.value.trim() === group.value.name) return;
  await window.api.groups.update(groupId, { name: editName.value.trim() });
  group.value.name = editName.value.trim();
}

async function saveNotes() {
  if (!group.value || editNotes.value === group.value.notes) return;
  await window.api.groups.update(groupId, { notes: editNotes.value });
  group.value.notes = editNotes.value;
}

async function addMember() {
  if (!newMemberId.value) return;
  await window.api.groups.addMember(groupId, newMemberId.value);
  newMemberId.value = null;
  showAddMember.value = false;
  await loadMembers();
}

async function removeMember(personId: string) {
  await window.api.groups.removeMember(groupId, personId);
  await loadMembers();
}

onMounted(load);
</script>

<style scoped>
.group-detail { max-width: 800px; }
.btn-back {
  background: none;
  border: none;
  color: #3498db;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  margin-bottom: 16px;
  display: block;
}
.group-name-input {
  font-size: 22px;
  font-weight: 700;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  width: 100%;
  padding: 4px 0;
  margin-bottom: 8px;
  font-family: inherit;
  transition: border-color 0.15s;
}
.group-name-input:focus {
  outline: none;
  border-bottom-color: #3498db;
}
.group-notes-input {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  margin-bottom: 24px;
  box-sizing: border-box;
}
.members-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.members-header h4 { margin: 0; font-size: 15px; }
.count { font-weight: 400; color: #888; font-size: 13px; }
.add-member-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.add-member-row > :first-child { flex: 1; }
.empty-hint { color: #aaa; font-size: 13px; margin: 8px 0; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #ddd;
  text-align: left;
}
.data-table th { background: #eee; font-weight: 600; }
.person-link { color: #3498db; text-decoration: none; }
.person-link:hover { text-decoration: underline; }
button { background: #2c3e50; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
button:hover { opacity: 0.9; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-add { background: none; color: #3498db; font-size: 13px; padding: 4px 8px; border: 1px solid #3498db; border-radius: 4px; }
.btn-sm { padding: 5px 10px; font-size: 13px; }
.btn-delete { background: #fee; color: #c0392b; }
.btn-cancel-inline { background: #e0e0e0; color: #333; }
</style>
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: 440 tests pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(groups): GroupDetailView with members table"
```

---

## Task 4: GroupPicker component

**Files:**
- Create: `src/renderer/components/GroupPicker.vue`

This component is used in PersonDetailView to add a person to a group. It shows a text input with autocomplete, lists groups the person is not already in, and offers inline group creation.

- [ ] **Step 1: Create GroupPicker**

Create `src/renderer/components/GroupPicker.vue`:

```vue
<template>
  <div class="group-picker">
    <input
      ref="inputEl"
      type="text"
      v-model="query"
      :placeholder="$t('groups.searchOrCreate')"
      @input="onInput"
      @focus="open = true"
      @blur="onBlur"
      @keydown.escape="$emit('cancel')"
    />
    <ul v-if="open && (filtered.length > 0 || query.trim())" class="picker-dropdown">
      <li
        v-for="g in filtered"
        :key="g.id"
        class="picker-option"
        @mousedown.prevent="select(g)"
      >
        {{ g.name }}
        <span class="picker-count">{{ g.memberCount }}</span>
      </li>
      <li
        v-if="query.trim() && !exactMatch"
        class="picker-option picker-create"
        @mousedown.prevent="createAndAdd"
      >
        ＋ {{ $t('groups.createNew') }} "{{ query.trim() }}"
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface GroupOption { id: string; name: string; memberCount: number; }

const props = defineProps<{
  personId: string;
  excludeIds: string[];
}>();

const emit = defineEmits<{
  added: [];
  cancel: [];
}>();

const query = ref('');
const open = ref(false);
const allGroups = ref<GroupOption[]>([]);
const inputEl = ref<HTMLInputElement | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return allGroups.value.filter(
    g => !props.excludeIds.includes(g.id) && (!q || g.name.toLowerCase().includes(q))
  );
});

const exactMatch = computed(() =>
  allGroups.value.some(g => g.name.toLowerCase() === query.value.trim().toLowerCase())
);

async function loadGroups() {
  if (!window.api) return;
  const raw = (await window.api.groups.list()) as Array<{ id: string; name: string }>;
  const options: GroupOption[] = [];
  for (const g of raw) {
    const members = (await window.api.groups.getMembers(g.id)) as unknown[];
    options.push({ id: g.id, name: g.name, memberCount: members.length });
  }
  allGroups.value = options;
}

function onInput() {
  open.value = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadGroups, 150);
}

function onBlur() {
  setTimeout(() => { open.value = false; }, 200);
}

async function select(g: GroupOption) {
  await window.api.groups.addMember(g.id, props.personId);
  query.value = '';
  open.value = false;
  emit('added');
}

async function createAndAdd() {
  const name = query.value.trim();
  if (!name) return;
  const created = (await window.api.groups.create({ name, notes: '' })) as { id: string };
  await window.api.groups.addMember(created.id, props.personId);
  query.value = '';
  open.value = false;
  emit('added');
}

onMounted(async () => {
  await loadGroups();
  await nextTick();
  inputEl.value?.focus();
});
</script>

<style scoped>
.group-picker { position: relative; }
.group-picker input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
  font-family: inherit;
}
.picker-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #ccc;
  border-top: none;
  border-radius: 0 0 4px 4px;
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}
.picker-option {
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}
.picker-option:hover { background: #eef2ff; }
.picker-create { color: #059669; }
.picker-create:hover { background: #f0fdf4; }
.picker-count { font-size: 12px; color: #aaa; }
</style>
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: 440 tests pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(groups): GroupPicker autocomplete component"
```

---

## Task 5: PersonDetailView groups section

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`

Add imports, reactive state, load function, and the Groups section template between Relationships and Notes.

- [ ] **Step 1: Add import for GroupPicker**

In `PersonDetailView.vue`, find the existing imports block (near the top of `<script setup>`). Add:

```typescript
import GroupPicker from '../components/GroupPicker.vue';
```

- [ ] **Step 2: Add reactive state**

In `PersonDetailView.vue` script, after the `personTasks` ref (around line 508), add:

```typescript
interface PersonGroup { id: string; name: string; }
const personGroups = ref<PersonGroup[]>([]);
const showGroupPicker = ref(false);
```

- [ ] **Step 3: Add loadPersonGroups function**

After the `loadPersonTasks` function (around line 513), add:

```typescript
async function loadPersonGroups() {
  personGroups.value = (await window.api.groups.forPerson(personId)) as PersonGroup[];
}

async function removeFromGroup(groupId: string) {
  await window.api.groups.removeMember(groupId, personId);
  await loadPersonGroups();
}
```

- [ ] **Step 4: Call loadPersonGroups in load()**

In the `load()` function, after `await loadPersonTasks()` (around line 622), add:

```typescript
    await loadPersonGroups();
```

- [ ] **Step 5: Add Groups section template**

In the template, find the Notes section comment `<!-- Notes Section -->` (around line 192). Insert the Groups section **immediately before** it:

```html
    <!-- Groups Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('groups.title') }} <span class="count-badge">({{ personGroups.length }})</span></h4>
        <button v-if="!showGroupPicker" class="btn-add" @click="showGroupPicker = true">+ {{ $t('groups.addMember') }}</button>
      </div>
      <div class="group-chips">
        <div v-for="g in personGroups" :key="g.id" class="group-chip">
          <router-link :to="'/groups/' + g.id" class="chip-name">{{ g.name }}</router-link>
          <button class="chip-remove" @click="removeFromGroup(g.id)" :title="$t('groups.confirmRemoveMember')">×</button>
        </div>
        <div v-if="personGroups.length === 0 && !showGroupPicker" class="empty-hint">{{ $t('groups.noGroups') }}</div>
      </div>
      <div v-if="showGroupPicker" class="group-picker-row">
        <GroupPicker
          :person-id="personId"
          :exclude-ids="personGroups.map(g => g.id)"
          @added="showGroupPicker = false; loadPersonGroups()"
          @cancel="showGroupPicker = false"
        />
        <button class="btn-cancel-inline" @click="showGroupPicker = false">{{ $t('common.cancel') }}</button>
      </div>
    </section>
```

- [ ] **Step 6: Add scoped CSS for chips**

In the `<style scoped>` block of `PersonDetailView.vue`, add:

```css
.count-badge { font-weight: 400; color: #888; font-size: 13px; }
.group-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.group-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 20px;
  padding: 4px 8px 4px 12px;
  font-size: 13px;
}
.chip-name { color: #3730a3; text-decoration: none; font-weight: 500; }
.chip-name:hover { text-decoration: underline; }
.chip-remove {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.chip-remove:hover { color: #c0392b; }
.group-picker-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}
.group-picker-row > :first-child { flex: 1; }
.btn-cancel-inline {
  background: #e0e0e0;
  color: #333;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
```

- [ ] **Step 7: Run tests**

```bash
npm test
```

Expected: 440 tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(groups): Groups section in PersonDetailView"
```

---

## Task 6: Sidebar nav update + PLAN.md sync

**Files:**
- Modify: `src/renderer/App.vue`
- Modify: `src/renderer/i18n/sv.ts`  *(if `nav.groups` not yet there — it was added in Task 1)*
- Modify: `package.json` (version bump)
- Modify: `docs/PLAN.md`
- Move: `docs/plans/2026-04-05-groups-ui.md` → `docs/plans/archive/2026-04-05-groups-ui.md`

- [ ] **Step 1: Add Groups nav link + fix icons in App.vue**

In `src/renderer/App.vue`, replace the entire `<nav class="sidebar">` block with:

```html
    <nav class="sidebar">
      <h1>{{ $t('app.title') }}</h1>
      <form class="sidebar-search" @submit.prevent="submitSearch">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="$t('app.search')"
          class="sidebar-search-input"
        />
      </form>
      <router-link to="/visualisering" class="nav-item">
        <span class="nav-icon">🌳</span>
        <span class="nav-label">{{ $t('nav.tree') }}</span>
      </router-link>
      <router-link to="/" class="nav-item">
        <span class="nav-icon">👥</span>
        <span class="nav-label">{{ $t('nav.persons') }}</span>
      </router-link>
      <router-link to="/relationships" class="nav-item">
        <span class="nav-icon">🔗</span>
        <span class="nav-label">{{ $t('nav.relationships') }}</span>
      </router-link>
      <router-link to="/places" class="nav-item">
        <span class="nav-icon">📍</span>
        <span class="nav-label">{{ $t('places.title') }}</span>
      </router-link>
      <router-link to="/sources" class="nav-item">
        <span class="nav-icon">📚</span>
        <span class="nav-label">{{ $t('nav.sources') }}</span>
      </router-link>
      <router-link to="/groups" class="nav-item">
        <span class="nav-icon">🏷️</span>
        <span class="nav-label">{{ $t('nav.groups') }}</span>
      </router-link>
      <router-link to="/research-tasks" class="nav-item">
        <span class="nav-icon">🔬</span>
        <span class="nav-label">
          {{ $t('researchTasks.nav') }}
          <span v-if="openTaskCount > 0" class="error-badge">{{ openTaskCount }}</span>
        </span>
      </router-link>
      <router-link to="/quality" class="nav-item">
        <span class="nav-icon">⚠️</span>
        <span class="nav-label">
          {{ $t('quality.nav') }}
          <span v-if="qualityErrorCount > 0" class="error-badge">{{ qualityErrorCount }}</span>
        </span>
      </router-link>
      <router-link to="/reports" class="nav-item">
        <span class="nav-icon">🖨️</span>
        <span class="nav-label">{{ $t('reports.nav') }}</span>
      </router-link>
      <div class="sidebar-spacer"></div>
      <router-link to="/database" class="nav-bottom">{{ $t('database.nav') }} {{ currentDbName }}</router-link>
      <router-link to="/import-export" class="nav-bottom">{{ $t('nav.importExport') }}</router-link>
      <select class="locale-switcher" :value="locale" @change="switchLocale($event)">
        <option value="sv">Svenska</option>
        <option value="en">English</option>
      </select>
    </nav>
```

Changes from original:
- 👤 → 👥 for Persons
- 🔍 → ⚠️ for Quality
- New `<router-link to="/groups">` with 🏷️ between Sources and Research Tasks

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: 440 tests pass.

- [ ] **Step 3: Bump version, update PLAN.md, archive plan file**

1. In `package.json`, bump `"version"` from `"1.6.5"` to `"1.7.0"` (new feature → minor bump).

2. Move `docs/plans/2026-04-05-groups-ui.md` to `docs/plans/archive/2026-04-05-groups-ui.md`.

3. In `docs/PLAN.md`, add to Implementation Status table:
   ```
   | v0.17.0 | Groups UI: GroupsView, GroupDetailView, GroupPicker, PersonDetailView section, sidebar nav icons | [archive](plans/archive/2026-04-05-groups-ui.md) |
   ```
   Also add a spec doc pointer in the Roadmap section removal — remove the `### Groups` item from Roadmap if present (it's not currently there, so just add the Implementation Status row).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(groups): complete Groups UI — views, GroupPicker, PersonDetailView section, sidebar nav

- GroupsView: list with member count, add/delete modal
- GroupDetailView: inline edit name/notes, members table, PersonPicker to add
- GroupPicker: autocomplete with create-new, used in PersonDetailView
- PersonDetailView: Groups section with chips, GroupPicker inline
- App.vue: Groups nav link, 👥 for Persons, ⚠️ for Quality
- Bump to v0.17.0"
```
