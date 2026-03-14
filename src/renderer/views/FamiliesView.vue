<template>
  <div>
    <div class="header">
      <h2>Families</h2>
      <button @click="addFamily">Add Family</button>
    </div>
    <div v-if="families.length === 0" class="empty">
      No families yet. Click "Add Family" to get started.
    </div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>Union Type</th>
          <th>Notes</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="family in families" :key="family.id">
          <td>{{ family.union_type }}</td>
          <td>{{ family.notes }}</td>
          <td>
            <button class="btn-sm" @click="removeFamily(family.id)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

declare const window: Window & { api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> };

interface FamilyRow {
  id: string;
  union_type: string;
  notes: string;
}

const families = ref<FamilyRow[]>([]);

async function load() {
  families.value = await window.api.families.list() as FamilyRow[];
}

async function addFamily() {
  await window.api.families.create({ union_type: 'unknown' });
  await load();
}

async function removeFamily(id: string) {
  await window.api.families.delete(id);
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
