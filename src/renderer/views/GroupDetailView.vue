<template>
  <div v-if="group" class="group-detail">
    <input
      class="group-name-input"
      v-model="editName"
      type="text"
      @blur="saveName"
    />

    <div class="notes-block">
      <div class="notes-heading-row">
        <span class="notes-heading-label">{{ $t('common.notes') }}</span>
        <AppButton
          variant="soft"
          size="sm"
          :aria-pressed="notesMonospaced"
          :title="$t('common.monospacedTooltip')"
          @click="toggleNotesMonospaced"
        >
          <span class="mono-toggle-t" :class="{ 'is-mono': !notesMonospaced }">iWi</span>
        </AppButton>
      </div>
      <textarea
        ref="notesRef"
        class="group-notes-input"
        :class="{ 'notes-mono': notesMonospaced }"
        v-model="editNotes"
        rows="2"
        :placeholder="$t('groups.notes')"
        :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
        @blur="persistNotesHeight(); saveNotes()"
        @mouseup="persistNotesHeight"
      />
    </div>

    <!-- Members -->
    <SectionHeader
      :title="$t('groups.members')"
      :count="members.length"
      :collapsible="false"
      :action-label="!showAddMember ? '+ ' + $t('groups.addMember') : ''"
      @action="showAddMember = true"
    />

    <!-- Add member picker -->
    <div v-if="showAddMember" class="add-member-row">
      <PersonPicker v-model="newMemberId" :placeholder="$t('common.unknown')" />
      <AppButton variant="primary" size="sm" @click="addMember" :disabled="!newMemberId">{{ $t('groups.addMember') }}</AppButton>
      <AppButton variant="secondary" size="sm" @click="showAddMember = false; newMemberId = null">{{ $t('common.cancel') }}</AppButton>
    </div>

    <div v-if="members.length === 0" class="empty-hint">{{ $t('empty.persons') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th style="width: 100%">{{ $t('common.name') }}</th>
          <th>{{ $t('persons.sex') }}</th>
          <th class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="m in members"
          :key="m.person_id"
          class="clickable-row"
          tabindex="0"
          role="button"
          :aria-label="$t('a11y.editItem', { item: ((m.given_name || '') + ' ' + (m.surname || '')).trim() })"
          @click="goToPerson(m)"
          @keydown.enter="goToPerson(m)"
          @keydown.space.prevent="goToPerson(m)"
        >
          <td>
            <span class="person-link" style="display: inline-flex; align-items: center; gap: 6px;">
              <AppAvatar :person-id="m.person_id" :given-name="m.given_name ?? ''" :surname="m.surname ?? ''" :sex="(m.sex as 'M' | 'F' | 'U')" size="sm" />
              <PersonName :given-name="m.given_name" :surname="m.surname" :preferred-name="m.preferred_name" :nickname="m.nickname" />
            </span>
          </td>
          <td><AppBadge :variant="('sex-' + m.sex.toLowerCase()) as 'sex-m' | 'sex-f' | 'sex-u'">{{ m.sex }}</AppBadge></td>
          <td class="actions-cell">
            <AppButton variant="ghost" size="sm" @click.stop="removeMember(m.person_id)">✕</AppButton>
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
import AppAvatar from '../components/ui/AppAvatar.vue';
import AppBadge from '../components/ui/AppBadge.vue';
import AppButton from '../components/ui/AppButton.vue';
import SectionHeader from '../components/ui/SectionHeader.vue';
import { useFocusStore } from '../stores/focus';
import { fullNameParts } from '../utils/nameUtils';
import { useTextareaHeight } from '../composables/useTextareaHeight';
import { useMonospacedNotes } from '../composables/useMonospacedNotes';

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
const { textareaRef: notesRef, storedHeight: notesStoredHeight, persistHeight: persistNotesHeight } = useTextareaHeight('group-notes');
const { monospaced: notesMonospaced, toggle: toggleNotesMonospaced } = useMonospacedNotes('group');

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
.group-detail { }
.btn-back {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: var(--font-sm);
  padding: 0;
  margin-bottom: 16px;
  display: block;
}
.group-name-input {
  font-size: var(--font-2xl);
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
  border-bottom-color: var(--accent);
}
.group-notes-input {
  width: 100%;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  padding: 8px;
  font-size: var(--font-base);
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}
.notes-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-bottom: 24px;
}
.notes-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}
.notes-heading-label {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-secondary);
}
.group-notes-input.notes-mono {
  font-family: var(--font-mono);
}
.add-member-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.add-member-row > :first-child { flex: 1; }
</style>
