<template>
  <div class="database-view">
    <h2>{{ $t('database.title') }}</h2>

    <section class="db-section">
      <h3>{{ $t('database.current') }}</h3>
      <div class="db-path">{{ current?.path ?? '…' }}</div>
    </section>

    <section class="db-section">
      <h3>{{ $t('database.recent') }}</h3>
      <div v-if="recent.length === 0" class="db-no-recent">{{ $t('database.noRecent') }}</div>
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

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();

interface DbEntry { path: string; name: string }

const current = ref<DbEntry | null>(null);
const recent = ref<DbEntry[]>([]);
const statusMsg = ref('');
const backupStatus = ref('');

async function load() {
  current.value = await window.api.db.getCurrent() as DbEntry;
  const all = await window.api.db.getRecent() as DbEntry[];
  // Exclude the currently active path from the recent list
  recent.value = all.filter(e => e.path !== current.value?.path);
}

async function openPath(p: string) {
  const result = await window.api.db.switchTo(p) as { path: string; name: string };
  statusMsg.value = t('database.switchedTo', { name: result.name });
  setTimeout(() => { statusMsg.value = ''; }, 3000);
}

async function createNew() {
  const result = await window.api.db.createNew() as { path?: string; name?: string; canceled?: boolean };
  if (!result.canceled) {
    statusMsg.value = t('database.switchedTo', { name: result.name });
    setTimeout(() => { statusMsg.value = ''; }, 3000);
  }
}

async function openExisting() {
  const result = await window.api.db.openExisting() as { path?: string; name?: string; canceled?: boolean };
  if (!result.canceled) {
    statusMsg.value = t('database.switchedTo', { name: result.name });
    setTimeout(() => { statusMsg.value = ''; }, 3000);
  }
}

async function backup() {
  const result = await (window.api.backup as Record<string, () => Promise<{ success: boolean; path?: string; error?: string }>>).backup();
  if (result.success && result.path) {
    backupStatus.value = t('database.backupSaved', { path: result.path });
    setTimeout(() => { backupStatus.value = ''; }, 5000);
  }
}

async function restore() {
  if (!confirm(t('database.confirmRestore'))) return;
  const result = await (window.api.backup as Record<string, () => Promise<{ success: boolean; path?: string; error?: string }>>).restore();
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
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #666;
  margin-bottom: 10px;
}

.db-path {
  font-family: monospace;
  font-size: 13px;
  background: #f0f0f0;
  padding: 8px 12px;
  border-radius: 4px;
  word-break: break-all;
}

.db-no-recent {
  color: #999;
  font-size: 14px;
}

.db-recent-table {
  width: 100%;
  border-collapse: collapse;
}

.db-recent-row {
  cursor: pointer;
  border-bottom: 1px solid #eee;
}

.db-recent-row:hover {
  background: #f5f5f5;
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
  font-size: 12px;
  color: #666;
  padding: 8px 0;
  word-break: break-all;
}

.db-actions {
  display: flex;
  gap: 10px;
}

.db-actions button {
  padding: 8px 16px;
  border: 1px solid #ccc;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;
}

.db-actions button:hover {
  background: #f0f0f0;
}

.db-status {
  padding: 8px 12px;
  background: #e8f5e9;
  border-radius: 4px;
  font-size: 14px;
  color: #2e7d32;
}
</style>
