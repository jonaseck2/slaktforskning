<template>
  <div class="database-view">
    <h2>{{ $t('database.title') }}</h2>

    <section class="db-section">
      <h3>{{ $t('database.current') }}</h3>
      <div class="db-path">{{ current?.path ?? '…' }}</div>
    </section>

    <section class="db-section">
      <h3>{{ $t('database.recent') }}</h3>
      <div v-if="recent.length === 0" class="db-no-recent">{{ $t('empty.recentDatabases') }}</div>
      <table v-else class="db-recent-table">
        <tbody>
          <tr
            v-for="entry in recent"
            :key="entry.path"
            class="db-recent-row"
            :class="{ active: entry.path === current?.path }"
            @click="openPath(entry.path)"
          >
            <td class="db-recent-name">{{ entry.name }}</td>
            <td class="db-recent-path">{{ entry.path }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="db-section">
      <h3>{{ $t('database.treeSubject') }}</h3>
      <p class="db-hint">{{ $t('database.treeSubjectHint') }}</p>
      <div class="tree-subject-row">
        <PersonPicker
          :model-value="treeSubjectId"
          :placeholder="$t('database.treeSubjectNone')"
          @update:model-value="setTreeSubject"
        />
        <button v-if="treeSubjectId" class="btn-sm btn-cancel" @click="clearTreeSubject">✕</button>
      </div>
    </section>

    <section class="db-section">
      <h3>{{ $t('settings.researcherName') }}</h3>
      <input
        type="text"
        class="researcher-name-input"
        :value="researcherName"
        :placeholder="$t('settings.researcherNamePlaceholder')"
        @input="onResearcherNameInput(($event.target as HTMLInputElement).value)"
      />
    </section>

    <section class="db-section db-actions">
      <button @click="createNew">{{ $t('database.createNew') }}</button>
      <button @click="openExisting">{{ $t('database.openOther') }}</button>
    </section>

    <section class="db-section db-actions">
      <button @click="backup">{{ $t('database.backupButton') }}</button>
      <button @click="restore">{{ $t('database.restoreButton') }}</button>
    </section>

    <div v-if="backupStatus" class="db-status">{{ backupStatus }}</div>
    <div v-if="statusMsg" class="db-status">{{ statusMsg }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import PersonPicker from '../components/PersonPicker.vue';
import { resetDefaultPersonId } from '../composables/useDefaultPerson';

const { t } = useI18n();

interface DbEntry { path: string; name: string }

const current = ref<DbEntry | null>(null);
const recent = ref<DbEntry[]>([]);
const statusMsg = ref('');
const backupStatus = ref('');
const treeSubjectId = ref<string | null>(null);
const researcherName = ref<string>('');

async function load() {
  current.value = await window.api.db.getCurrent();
  const all = await window.api.db.getRecent();
  // Exclude the currently active path from the recent list
  recent.value = all.filter(e => e.path !== current.value?.path);
  treeSubjectId.value = await window.api.db.getSetting('default_person_id') as string | null;
  researcherName.value = (await window.api.db.getSetting('researcher_name') as string | null) || '';
}

async function onResearcherNameInput(value: string) {
  researcherName.value = value;
  const trimmed = value.trim();
  if (trimmed) {
    await window.api.db.setSetting('researcher_name', trimmed);
  } else {
    await window.api.db.deleteSetting('researcher_name');
  }
}

async function setTreeSubject(personId: string | null) {
  treeSubjectId.value = personId;
  if (personId) {
    await window.api.db.setSetting('default_person_id', personId);
    resetDefaultPersonId();
  } else {
    await window.api.db.deleteSetting('default_person_id');
    resetDefaultPersonId();
  }
}

async function clearTreeSubject() {
  treeSubjectId.value = null;
  await window.api.db.deleteSetting('default_person_id');
  resetDefaultPersonId();
  statusMsg.value = t('database.treeSubjectCleared');
  setTimeout(() => { statusMsg.value = ''; }, 3000);
}

async function openPath(p: string) {
  const result = await window.api.db.switchTo(p);
  resetDefaultPersonId();
  statusMsg.value = t('database.switchedTo', { name: result.name });
  setTimeout(() => { statusMsg.value = ''; }, 3000);
}

async function createNew() {
  const result = await window.api.db.createNew();
  if (!('canceled' in result)) {
    resetDefaultPersonId();
    statusMsg.value = t('database.switchedTo', { name: result.name });
    setTimeout(() => { statusMsg.value = ''; }, 3000);
  }
}

async function openExisting() {
  const result = await window.api.db.openExisting();
  if (!('canceled' in result)) {
    statusMsg.value = t('database.switchedTo', { name: result.name });
    setTimeout(() => { statusMsg.value = ''; }, 3000);
  }
}

async function backup() {
  const result = await window.api.backup.backup();
  if (result.success && result.path) {
    backupStatus.value = t('database.backupSaved', { path: result.path });
    setTimeout(() => { backupStatus.value = ''; }, 5000);
  }
}

async function restore() {
  if (!confirm(t('database.confirmRestore'))) return;
  const result = await window.api.backup.restore();
  if (result.success) {
    backupStatus.value = t('database.restoreSuccess');
    setTimeout(() => { backupStatus.value = ''; }, 5000);
  }
}

onMounted(load);
</script>

<style scoped>
.database-view {
  max-width: 700px;
}

h2 {
  margin-bottom: 24px;
}

.db-section {
  margin-bottom: 28px;
}

.db-section h3 {
  font-size: var(--font-base);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: 10px;
}

.db-path {
  font-family: monospace;
  font-size: var(--font-sm);
  background: var(--color-bg-muted);
  padding: 8px 12px;
  border-radius: 4px;
  word-break: break-all;
}

.db-no-recent {
  color: var(--color-text-faint);
  font-size: var(--font-base);
}

.db-recent-table {
  width: 100%;
  border-collapse: collapse;
}

.db-recent-row {
  cursor: pointer;
  border-bottom: 1px solid var(--color-border);
}

.db-recent-row:hover {
  background: var(--color-bg-subtle);
}

.db-recent-row.active {
  opacity: 0.5;
  pointer-events: none;
}

.db-recent-name {
  font-weight: 500;
  padding: 8px 12px 8px 0;
  white-space: nowrap;
  width: 1%;
}

.db-recent-path {
  font-family: monospace;
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  padding: 8px 0;
  word-break: break-all;
}

.db-actions {
  display: flex;
  gap: 10px;
}

.db-actions button {
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--font-base);
  font-family: inherit;
  color: var(--color-text);
}

.db-actions button:hover {
  background: var(--color-bg-muted);
}

.db-hint {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.tree-subject-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tree-subject-row .btn-sm {
  flex-shrink: 0;
}

.researcher-name-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-base);
  font-family: inherit;
  box-sizing: border-box;
}

.researcher-name-input:focus {
  outline: none;
  border-color: var(--accent);
}

.db-status {
  padding: 8px 12px;
  background: var(--color-bg-subtle);
  border-radius: 4px;
  font-size: var(--font-base);
  color: var(--color-text);
}
</style>
