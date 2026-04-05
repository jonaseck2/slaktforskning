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
import { ref, reactive, onMounted, onActivated, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useDataVersionStore } from '../stores/dataVersion';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

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

onMounted(async () => {
  await load();
  loadedVersion = dataVersionStore.version;
});

onActivated(async () => {
  if (dataVersionStore.version !== loadedVersion) {
    await load();
    loadedVersion = dataVersionStore.version;
  }
});
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
