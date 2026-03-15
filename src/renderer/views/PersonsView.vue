<template>
  <div>
    <div class="header">
      <h2>Persons</h2>
      <button @click="addPerson">Add Person</button>
    </div>
    <div v-if="persons.length === 0" class="empty">
      No persons yet. Click "Add Person" to get started.
    </div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>Given Name</th>
          <th>Surname</th>
          <th>Sex</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="person in persons" :key="person.id">
          <td>{{ person.given_name }}</td>
          <td>{{ person.surname }}</td>
          <td>{{ person.sex }}</td>
          <td>
            <button class="btn-sm" @click="removePerson(person.id)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

declare const window: Window & { api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> };

interface PersonRow {
  id: string;
  given_name: string;
  surname: string;
  sex: string;
}

const persons = ref<PersonRow[]>([]);

async function load() {
  if (!window.api) return;
  try {
    persons.value = await window.api.persons.list() as PersonRow[];
  } catch (err) {
    console.error('[PersonsView] load failed:', err);
  }
}

async function addPerson() {
  if (!window.api) return;
  const given = prompt('Given name:');
  if (!given) return;
  const surname = prompt('Surname:');
  try {
    await window.api.persons.create({ given_name: given, surname: surname ?? '' });
    await load();
  } catch (err) {
    console.error('[PersonsView] addPerson failed:', err);
  }
}

async function removePerson(id: string) {
  if (!window.api) return;
  try {
    await window.api.persons.delete(id);
    await load();
  } catch (err) {
    console.error('[PersonsView] removePerson failed:', err);
  }
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
.data-table th, .data-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #ddd;
  text-align: left;
}
.data-table th {
  background: #eee;
  font-weight: 600;
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
.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
  background: #e74c3c;
}
</style>
