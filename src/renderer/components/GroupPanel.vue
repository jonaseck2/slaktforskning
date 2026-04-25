<template>
  <div class="group-panel">
    <!-- Empty state -->
    <div v-if="!groupId" class="panel-empty">
      {{ $t('groupPanel.noGroupSelected') }}
    </div>

    <template v-else-if="group">
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-header-content">
          <div class="panel-name-row">
            <div class="panel-name">{{ group.name || $t('common.unknown') }}</div>
            <span class="member-count-badge">{{ members.length }} {{ $t('groups.members').toLowerCase() }}</span>
          </div>
        </div>
        <button class="panel-close-btn" :aria-label="$t('common.close')" @click="emit('close')">×</button>
      </div>

      <!-- Group info section -->
      <div class="panel-section">
        <SectionHeader :title="$t('groups.title')" :collapsed="!sections.info" @toggle="toggleSection('info')" />
        <div v-if="sections.info" class="panel-section-body">
          <div class="compact-form">
            <div class="compact-field">
              <label class="compact-label">{{ $t('groups.name') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="editFields.name"
                @input="editFields.name = ($event.target as HTMLInputElement).value"
                @blur="saveField('name')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('groups.notes') }}</label>
              <textarea
                class="compact-control"
                rows="3"
                :value="editFields.notes"
                @input="editFields.notes = ($event.target as HTMLTextAreaElement).value"
                @blur="saveField('notes')"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Members section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('groups.members')"
          :count="members.length"
          :collapsed="!sections.members"
          :action-label="!showAddMember ? '+ ' + $t('groups.addMember') : ''"
          @toggle="toggleSection('members')"
          @action="onAddMemberAction"
        />
        <div v-if="sections.members" class="panel-section-body">
          <div v-if="showAddMember" class="add-member-row">
            <PersonPicker v-model="newMemberId" :placeholder="$t('common.unknown')" />
            <AppButton variant="primary" size="sm" :disabled="!newMemberId" @click="addMember">{{ $t('common.add') }}</AppButton>
            <AppButton variant="ghost" size="sm" @click="showAddMember = false; newMemberId = null">{{ $t('common.cancel') }}</AppButton>
          </div>
          <SectionEmpty v-if="members.length === 0 && !showAddMember" :message="$t('empty.persons')" />
          <table v-else-if="members.length > 0" class="data-table">
            <thead>
              <tr>
                <th>{{ $t('common.name') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in members" :key="m.person_id">
                <td>
                  <span class="member-cell">
                    <AppAvatar
                      :person-id="m.person_id"
                      :given-name="m.given_name ?? ''"
                      :surname="m.surname ?? ''"
                      :sex="(m.sex as 'M' | 'F' | 'U')"
                      size="sm"
                    />
                    <router-link :to="'/persons/' + m.person_id" class="person-link" @click.stop>
                      <PersonName
                        :given-name="m.given_name"
                        :surname="m.surname"
                        :preferred-name="m.preferred_name"
                        :nickname="m.nickname"
                      />
                    </router-link>
                  </span>
                </td>
                <td class="actions-cell">
                  <AppButton variant="ghost" size="sm" @click="removeMember(m.person_id)">✕</AppButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PersonPicker from './PersonPicker.vue';
import PersonName from './PersonName.vue';
import AppAvatar from './ui/AppAvatar.vue';
import AppButton from './ui/AppButton.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import SectionHeader from './ui/SectionHeader.vue';
import { useToast } from '../composables/useToast';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface GroupData {
  id: string;
  name: string;
  notes: string;
}

interface MemberRow {
  person_id: string;
  given_name: string | null;
  surname: string | null;
  preferred_name: string | null;
  nickname: string | null;
  sex: string;
}

const props = defineProps<{ groupId: string | null }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const toast = useToast();

// ── Section state ───────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'group-panel-section-';
function loadBool(key: string, def: boolean): boolean {
  const v = localStorage.getItem(STORAGE_PREFIX + key);
  return v === null ? def : v === 'true';
}
const sections = reactive({
  info: loadBool('info', true),
  members: loadBool('members', true),
});
function toggleSection(key: keyof typeof sections) {
  sections[key] = !sections[key];
  localStorage.setItem(STORAGE_PREFIX + key, String(sections[key]));
}

// ── State ───────────────────────────────────────────────────────────────────

const group = ref<GroupData | null>(null);
const members = ref<MemberRow[]>([]);
const showAddMember = ref(false);
const newMemberId = ref<string | null>(null);

const editFields = reactive({
  name: '',
  notes: '',
});

// ── Loaders ─────────────────────────────────────────────────────────────────

async function load(id: string | null) {
  if (!id) {
    group.value = null;
    members.value = [];
    return;
  }
  try {
    const g = await window.api.groups.get(id) as GroupData | null;
    if (props.groupId !== id) return; // raced past us
    group.value = g;
    if (!g) return;

    editFields.name = g.name ?? '';
    editFields.notes = g.notes ?? '';

    await loadMembers(id);
  } catch (err) {
    console.error('[GroupPanel] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

async function loadMembers(id: string) {
  try {
    const raw = await window.api.groups.getMembers(id) as Array<{ person_id: string }>;
    if (props.groupId !== id) return;
    const rows: MemberRow[] = [];
    for (const m of raw) {
      const names = await window.api.persons.getNames(m.person_id) as Array<{
        given_name: string | null; surname: string | null;
        preferred_name: string | null; nickname: string | null;
      }>;
      const person = await window.api.persons.get(m.person_id) as { sex: string } | null;
      const n = names[0] ?? { given_name: null, surname: null, preferred_name: null, nickname: null };
      rows.push({ person_id: m.person_id, ...n, sex: person?.sex ?? '' });
    }
    if (props.groupId !== id) return;
    members.value = rows;
  } catch (err) {
    console.error('[GroupPanel] loadMembers failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

watch(() => props.groupId, load, { immediate: true });

// ── Field updates ───────────────────────────────────────────────────────────

async function saveField(field: keyof typeof editFields) {
  if (!props.groupId || !group.value) return;
  const val = editFields[field];
  if (val === (group.value as Record<string, unknown>)[field]) return;
  try {
    await window.api.groups.update(props.groupId, { [field]: val });
    (group.value as Record<string, unknown>)[field] = val;
  } catch (err) {
    console.error(`[GroupPanel] saveField(${field}) failed:`, err);
    toast.error(t('errors.saveFailed'));
  }
}

// ── Members ─────────────────────────────────────────────────────────────────

function onAddMemberAction() {
  if (!sections.members) toggleSection('members');
  showAddMember.value = true;
  newMemberId.value = null;
}

async function addMember() {
  if (!props.groupId || !newMemberId.value) return;
  try {
    await window.api.groups.addMember(props.groupId, newMemberId.value);
    showAddMember.value = false;
    newMemberId.value = null;
    await loadMembers(props.groupId);
  } catch (err) {
    console.error('[GroupPanel] addMember failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function removeMember(personId: string) {
  if (!props.groupId) return;
  if (!confirm(t('groups.confirmRemoveMember'))) return;
  try {
    await window.api.groups.removeMember(props.groupId, personId);
    await loadMembers(props.groupId);
  } catch (err) {
    console.error('[GroupPanel] removeMember failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}
</script>

<style scoped>
.group-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  font-size: var(--font-sm);
}

.panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: var(--font-sm);
  padding: var(--space-xl);
  text-align: center;
}

/* Header */
.panel-header {
  display: flex;
  background: var(--surface);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
.panel-header-content {
  padding: var(--space-md) var(--space-lg);
  flex: 1;
  min-width: 0;
}
.panel-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}
.panel-name {
  font-size: var(--font-base);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.member-count-badge {
  flex-shrink: 0;
  background: var(--surface-bg);
  color: var(--text-muted);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  font-size: var(--font-xs);
}
.panel-close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: var(--font-lg);
  cursor: pointer;
  padding: 0 var(--space-md);
  align-self: stretch;
}
.panel-close-btn:hover { color: var(--text-primary); background: var(--surface-hover); }

/* Sections */
.panel-section {
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  padding: 0 var(--space-lg);
}
.panel-section-body { padding: var(--space-xs) 0 var(--space-sm); }

/* Compact form */
.compact-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.compact-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.compact-label {
  font-size: var(--font-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.4px;
}
.compact-control {
  font-size: var(--font-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-primary);
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  resize: vertical;
}
.compact-control:focus {
  outline: none;
  border-color: var(--accent);
}

.add-member-row {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  padding: var(--space-xs) 0;
}
.add-member-row > :first-child { flex: 1; }

.member-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
</style>
