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
        <tr v-for="m in members" :key="m.person_id" class="clickable-row" @click="goToPerson(m)">
          <td>
            <span class="person-link">
              <PersonName :given-name="m.given_name" :surname="m.surname" :preferred-name="m.preferred_name" :nickname="m.nickname" />
            </span>
          </td>
          <td>{{ m.sex || '–' }}</td>
          <td>
            <button class="btn-sm btn-delete" @click.stop="removeMember(m.person_id)">✕</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PersonPicker from '../components/PersonPicker.vue';
import PersonName from '../components/PersonName.vue';
import { useFocusStore } from '../stores/focus';
import { fullNameParts } from '../utils/nameUtils';

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
const router = useRouter();
const groupId = route.params.id as string;
const focusStore = useFocusStore();

const group = ref<Group | null>(null);
const editName = ref('');
const editNotes = ref('');
const members = ref<MemberRow[]>([]);
const showAddMember = ref(false);
const newMemberId = ref<string | null>(null);

function goToPerson(m: MemberRow) {
  const name = fullNameParts(m.given_name ?? null, m.surname ?? null, m.preferred_name ?? null, m.nickname ?? null).map(p => p.text).join('');
  focusStore.set(m.person_id, name);
  router.push('/persons/' + m.person_id);
}

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
  font-size: var(--font-sm);
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
  font-size: var(--font-base);
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
.members-header h4 { margin: 0; font-size: var(--font-md); }
.count { font-weight: 400; color: #888; font-size: var(--font-sm); }
.add-member-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.add-member-row > :first-child { flex: 1; }
button { background: #2c3e50; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
button:hover { opacity: 0.9; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-add { background: none; color: #3498db; font-size: var(--font-sm); padding: 4px 8px; border: 1px solid #3498db; border-radius: 4px; }
.btn-cancel-inline { background: #e0e0e0; color: #333; }
</style>
