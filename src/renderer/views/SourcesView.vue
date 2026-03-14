<template>
  <div>
    <div class="header">
      <h2>Sources</h2>
      <button @click="addSource">Add Source</button>
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
        <tr v-for="source in sourceList" :key="source.id">
          <td>{{ source.title }}</td>
          <td>{{ source.author }}</td>
          <td>{{ source.source_type }}</td>
          <td>
            <button class="btn-sm" @click="removeSource(source.id)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

declare const window: Window & { api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> };

interface SourceRow {
  id: string;
  title: string;
  author: string;
  source_type: string;
}

const sourceList = ref<SourceRow[]>([]);

async function load() {
  sourceList.value = await window.api.sources.list() as SourceRow[];
}

async function addSource() {
  const title = prompt('Source title:');
  if (!title) return;
  await window.api.sources.create({ title });
  await load();
}

async function removeSource(id: string) {
  await window.api.sources.delete(id);
  await load();
}

onMounted(load);
</script>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.empty { color: #999; padding: 40px; text-align: center; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td { padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: left; }
.data-table th { background: #eee; font-weight: 600; }
button { background: #2c3e50; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
button:hover { opacity: 0.9; }
.btn-sm { padding: 4px 8px; font-size: 12px; background: #e74c3c; }
</style>
