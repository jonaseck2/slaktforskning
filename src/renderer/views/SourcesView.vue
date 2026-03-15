<template>
  <div>
    <div class="header">
      <h2>Sources</h2>
      <button @click="showAddForm = true">Add Source</button>
    </div>
    <div v-if="sourceList.length === 0" class="empty">
      No sources yet. Click "Add Source" to get started.
    </div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Author</th>
          <th>Type</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="source in sourceList"
          :key="source.id"
          class="clickable-row"
          @click="goToDetail(source.id)"
        >
          <td>{{ source.title }}</td>
          <td>{{ source.author || '—' }}</td>
          <td><span v-if="source.source_type" class="type-badge">{{ formatSourceType(source.source_type) }}</span></td>
          <td>
            <button class="btn-sm btn-delete" @click.stop="removeSource(source.id)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Add Source Modal -->
    <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
      <div class="modal">
        <h3>Add Source</h3>
        <form @submit.prevent="addSource">
          <label>
            Title
            <input v-model="form.title" type="text" required autofocus />
          </label>
          <label>
            Author
            <input v-model="form.author" type="text" />
          </label>
          <label>
            Source Type
            <select v-model="form.source_type">
              <option value="">— Select —</option>
              <option v-for="st in SOURCE_TYPES" :key="st.value" :value="st.value">
                {{ st.label }}
              </option>
            </select>
          </label>
          <label>
            Publication Info
            <input v-model="form.publication_info" type="text" placeholder="Publisher, year, etc." />
          </label>
          <label>
            Repository
            <input v-model="form.repository" type="text" placeholder="Archive or library name" />
          </label>
          <label>
            URL
            <input v-model="form.url" type="url" placeholder="https://..." />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showAddForm = false">Cancel</button>
            <button type="submit">Add Source</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { SOURCE_TYPES } from '../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface SourceRow {
  id: string;
  title: string;
  author: string;
  source_type: string;
}

const router = useRouter();
const sourceList = ref<SourceRow[]>([]);
const showAddForm = ref(false);
const form = reactive({
  title: '',
  author: '',
  source_type: '',
  publication_info: '',
  repository: '',
  url: '',
});

function formatSourceType(type: string): string {
  return SOURCE_TYPES.find((st) => st.value === type)?.label ?? type;
}

async function load() {
  if (!window.api) return;
  try {
    sourceList.value = (await window.api.sources.list()) as SourceRow[];
  } catch (err) {
    console.error('[SourcesView] load failed:', err);
  }
}

async function addSource() {
  if (!window.api) return;
  try {
    await window.api.sources.create({
      title: form.title,
      author: form.author,
      source_type: form.source_type,
      publication_info: form.publication_info,
      repository: form.repository,
      url: form.url,
    });
    showAddForm.value = false;
    form.title = '';
    form.author = '';
    form.source_type = '';
    form.publication_info = '';
    form.repository = '';
    form.url = '';
    await load();
  } catch (err) {
    console.error('[SourcesView] addSource failed:', err);
  }
}

async function removeSource(id: string) {
  if (!window.api) return;
  if (!confirm('Delete this source? This cannot be undone.')) return;
  try {
    await window.api.sources.delete(id);
    await load();
  } catch (err) {
    console.error('[SourcesView] removeSource failed:', err);
  }
}

function goToDetail(id: string) {
  router.push(`/sources/${id}`);
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
.clickable-row {
  cursor: pointer;
}
.clickable-row:hover {
  background: #f0f4ff;
}
.type-badge {
  background: #ede9fe;
  color: #5b21b6;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}
button {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}
button:hover {
  opacity: 0.9;
}
.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}
.btn-delete {
  background: #fee;
  color: #c0392b;
}
/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 480px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.modal h3 {
  margin: 0 0 16px;
}
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
form input[type='text'],
form input[type='url'],
form select {
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
.modal-actions button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 14px;
}
.modal-actions button[type='submit'] {
  background: #2c3e50;
  color: white;
}
.btn-cancel {
  background: #e0e0e0;
  color: #333;
}
</style>
