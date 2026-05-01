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
      <PersonPicker
        :model-value="treeSubjectId"
        :placeholder="$t('database.treeSubjectNone')"
        @update:model-value="setTreeSubject"
      />
    </section>

    <section class="db-section">
      <h3>{{ $t('settings.researcherInfo') }}</h3>
      <p class="db-hint">{{ $t('settings.researcherInfoHint') }}</p>
      <div class="researcher-grid">
        <label class="researcher-label">
          {{ $t('settings.researcherName') }}
          <input
            type="text"
            class="researcher-input"
            :value="researcherName"
            :placeholder="$t('settings.researcherNamePlaceholder')"
            @input="onResearcherFieldInput('researcher_name', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="researcher-label">
          {{ $t('settings.researcherAddress') }}
          <textarea
            class="researcher-input researcher-textarea"
            rows="3"
            :value="researcherAddress"
            :placeholder="$t('settings.researcherAddressPlaceholder')"
            @input="onResearcherFieldInput('researcher_address', ($event.target as HTMLTextAreaElement).value)"
          ></textarea>
        </label>
        <label class="researcher-label">
          {{ $t('settings.researcherPhone') }}
          <input
            type="text"
            class="researcher-input"
            :value="researcherPhone"
            :placeholder="$t('settings.researcherPhonePlaceholder')"
            @input="onResearcherFieldInput('researcher_phone', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="researcher-label">
          {{ $t('settings.researcherEmail') }}
          <input
            type="email"
            class="researcher-input"
            :value="researcherEmail"
            :placeholder="$t('settings.researcherEmailPlaceholder')"
            @input="onResearcherFieldInput('researcher_email', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
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
const researcherAddress = ref<string>('');
const researcherPhone = ref<string>('');
const researcherEmail = ref<string>('');

type ResearcherKey = 'researcher_name' | 'researcher_address' | 'researcher_phone' | 'researcher_email';

async function load() {
  current.value = await window.api.db.getCurrent();
  const all = await window.api.db.getRecent();
  // Exclude the currently active path from the recent list
  recent.value = all.filter(e => e.path !== current.value?.path);
  treeSubjectId.value = await window.api.db.getSetting('default_person_id') as string | null;
  const [name, address, phone, email] = await Promise.all([
    window.api.db.getSetting('researcher_name') as Promise<string | null>,
    window.api.db.getSetting('researcher_address') as Promise<string | null>,
    window.api.db.getSetting('researcher_phone') as Promise<string | null>,
    window.api.db.getSetting('researcher_email') as Promise<string | null>,
  ]);
  researcherName.value    = name    || '';
  researcherAddress.value = address || '';
  researcherPhone.value   = phone   || '';
  researcherEmail.value   = email   || '';
}

async function onResearcherFieldInput(key: ResearcherKey, value: string) {
  // Mirror to local ref so the controlled input does not flicker.
  if (key === 'researcher_name')    researcherName.value    = value;
  if (key === 'researcher_address') researcherAddress.value = value;
  if (key === 'researcher_phone')   researcherPhone.value   = value;
  if (key === 'researcher_email')   researcherEmail.value   = value;
  // Trim only single-line fields; keep multi-line address verbatim except trailing whitespace.
  const trimmed = key === 'researcher_address' ? value.replace(/\s+$/, '') : value.trim();
  if (trimmed) {
    await window.api.db.setSetting(key, trimmed);
  } else {
    await window.api.db.deleteSetting(key);
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

.researcher-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.researcher-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}

.researcher-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  background: var(--surface-bg);
  color: var(--color-text);
  font-size: var(--font-base);
  font-family: inherit;
  box-sizing: border-box;
}

.researcher-textarea {
  resize: vertical;
  min-height: 60px;
  font-family: inherit;
}

.researcher-input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-color: var(--accent);
  background: var(--surface);
}

.db-status {
  padding: 8px 12px;
  background: var(--color-bg-subtle);
  border-radius: 4px;
  font-size: var(--font-base);
  color: var(--color-text);
}
</style>
