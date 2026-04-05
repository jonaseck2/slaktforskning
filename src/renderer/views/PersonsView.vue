<template>
  <div>
    <div class="header">
      <h2>{{ $t('persons.title') }}</h2>
      <div class="header-actions">
        <button @click="showAddForm = true">{{ $t('persons.addPerson') }}</button>
      </div>
    </div>
    <div v-if="persons.length === 0" class="empty">
      {{ $t('persons.emptyState') }}
    </div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('persons.givenName') }}</th>
          <th>{{ $t('persons.surname') }}</th>
          <th>{{ $t('persons.sex') }}</th>
          <th>{{ $t('persons.living') }}</th>
          <th>{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="person in persons"
          :key="person.id"
          class="clickable-row"
          @click="goToDetail(person)"
        >
          <td>
            <PersonName :given-name="person.given_name" :preferred-name="person.preferred_name" :nickname="person.nickname" />
            <CitationBadge :count="personCitationCounts[person.id] ?? 0" />
          </td>
          <td>{{ person.surname }}</td>
          <td><span :class="'sex-badge sex-' + person.sex">{{ person.sex }}</span></td>
          <td>{{ person.living ? $t('common.yes') : $t('common.no') }}</td>
          <td>
            <button class="btn-sm btn-delete" @click.stop="removePerson(person.id)">{{ $t('common.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Add Person Modal -->
    <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
      <div class="modal">
        <h3>{{ $t('persons.addPerson') }}</h3>
        <form @submit.prevent="addPerson">
          <label>
            {{ $t('persons.givenName') }}
            <input v-model="form.given_name" type="text" required autofocus />
          </label>
          <label>
            {{ $t('persons.surname') }}
            <input v-model="form.surname" type="text" />
          </label>
          <label>
            {{ $t('persons.sex') }}
            <div class="radio-group">
              <label class="radio-label">
                <input v-model="form.sex" type="radio" value="M" /> {{ $t('persons.male') }}
              </label>
              <label class="radio-label">
                <input v-model="form.sex" type="radio" value="F" /> {{ $t('persons.female') }}
              </label>
              <label class="radio-label">
                <input v-model="form.sex" type="radio" value="U" /> {{ $t('persons.sexUnknown') }}
              </label>
            </div>
          </label>
          <label class="checkbox-label">
            <input v-model="form.living" type="checkbox" /> {{ $t('persons.living') }}
          </label>
          <label>
            {{ $t('common.notes') }}
            <textarea v-model="form.notes" rows="2" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showAddForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('persons.addPerson') }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import CitationBadge from '../components/CitationBadge.vue';
import PersonName from '../components/PersonName.vue';
import { useFocusStore } from '../stores/focus';
import { fullNameParts } from '../utils/nameUtils';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface PersonRow {
  id: string;
  given_name: string;
  surname: string;
  preferred_name: string | null;
  nickname: string | null;
  sex: string;
  living: number;
}

const { t } = useI18n();
const router = useRouter();
const focusStore = useFocusStore();
const persons = ref<PersonRow[]>([]);
const personCitationCounts = ref<Record<string, number>>({});
const showAddForm = ref(false);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') showAddForm.value = false;
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

const form = reactive({
  given_name: '',
  surname: '',
  sex: 'U',
  living: true,
  notes: '',
});


async function load() {
  if (!window.api) return;
  try {
    persons.value = (await window.api.persons.list()) as PersonRow[];
    const counts: Record<string, number> = {};
    await Promise.all(
      persons.value.map(async (p) => {
        const events = (await window.api.events.forPerson(p.id)) as Array<{ id: string }>;
        const citArrays = await Promise.all(
          events.map(e => window.api.citations.forEvent(e.id) as Promise<unknown[]>),
        );
        counts[p.id] = citArrays.reduce((sum, arr) => sum + arr.length, 0);
      }),
    );
    personCitationCounts.value = counts;
  } catch (err) {
    console.error('[PersonsView] load failed:', err);
  }
}

async function addPerson() {
  if (!window.api) return;
  try {
    await window.api.persons.create({
      given_name: form.given_name,
      surname: form.surname,
      sex: form.sex,
      living: form.living,
      notes: form.notes,
    });
    showAddForm.value = false;
    form.given_name = '';
    form.surname = '';
    form.sex = 'U';
    form.living = true;
    form.notes = '';
    await load();
  } catch (err) {
    console.error('[PersonsView] addPerson failed:', err);
  }
}

async function removePerson(id: string) {
  if (!window.api) return;
  if (!confirm(t('persons.confirmDelete'))) return;
  try {
    await window.api.persons.delete(id);
    await load();
  } catch (err) {
    console.error('[PersonsView] removePerson failed:', err);
  }
}

function goToDetail(person: PersonRow) {
  const name = fullNameParts(person.given_name ?? null, person.surname ?? null, person.preferred_name ?? null, person.nickname ?? null).map(p => p.text).join('');
  focusStore.set(person.id, name);
  router.push(`/persons/${person.id}`);
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
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
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
.sex-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}
.sex-M {
  background: #dbeafe;
  color: #1d4ed8;
}
.sex-F {
  background: #fce7f3;
  color: #be185d;
}
.sex-U {
  background: #f3f4f6;
  color: #6b7280;
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
  width: 420px;
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
form textarea {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}
.radio-group {
  display: flex;
  gap: 16px;
  margin-top: 2px;
}
.radio-label {
  font-weight: normal;
  flex-direction: row !important;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.checkbox-label {
  flex-direction: row !important;
  align-items: center;
  gap: 6px;
  font-weight: normal;
  cursor: pointer;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.btn-cancel {
  background: #e0e0e0;
  color: #333;
}
</style>
