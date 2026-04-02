<template>
  <div>
    <div class="header">
      <h2>{{ $t('families.title') }}</h2>
      <button @click="showAddForm = true">{{ $t('families.addFamily') }}</button>
    </div>
    <div v-if="families.length === 0" class="empty">
      {{ $t('families.emptyState') }}
    </div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('families.partnerA') }}</th>
          <th>{{ $t('families.partnerB') }}</th>
          <th>{{ $t('families.unionType') }}</th>
          <th>{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="family in families"
          :key="family.id"
          class="clickable-row"
          @click="goToDetail(family.id)"
        >
          <td>{{ family.partner_a_name || '—' }}</td>
          <td>{{ family.partner_b_name || '—' }}</td>
          <td><span class="union-badge">{{ $t('unionTypes.' + family.union_type) }}</span></td>
          <td>
            <button class="btn-sm btn-delete" @click.stop="removeFamily(family.id)">{{ $t('common.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Add Family Modal -->
    <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
      <div class="modal">
        <h3>{{ $t('families.addFamily') }}</h3>
        <form @submit.prevent="addFamily">
          <label>
            {{ $t('families.unionType') }}
            <select v-model="form.union_type">
              <option v-for="ut in UNION_TYPE_VALUES" :key="ut" :value="ut">
                {{ $t('unionTypes.' + ut) }}
              </option>
            </select>
          </label>
          <label>
            {{ $t('families.partnerA') }}
            <PersonPicker v-model="form.partner_a_id" :placeholder="$t('families.searchPerson')" />
          </label>
          <label>
            {{ $t('families.partnerB') }}
            <PersonPicker v-model="form.partner_b_id" :placeholder="$t('families.searchPerson')" />
          </label>
          <label>
            {{ $t('common.notes') }}
            <textarea v-model="form.notes" rows="2" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showAddForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('families.addFamily') }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PersonPicker from '../components/PersonPicker.vue';
import { UNION_TYPE_VALUES } from '../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface FamilyRow {
  id: string;
  partner_a_id: string | null;
  partner_b_id: string | null;
  union_type: string;
  notes: string;
  partner_a_name: string;
  partner_b_name: string;
}

interface NameRow {
  given_name: string;
  surname: string;
}

const { t } = useI18n();
const router = useRouter();
const families = ref<FamilyRow[]>([]);
const showAddForm = ref(false);
const form = reactive({
  union_type: 'marriage',
  partner_a_id: null as string | null,
  partner_b_id: null as string | null,
  notes: '',
});

async function getPersonName(id: string | null): Promise<string> {
  if (!id || !window.api) return '';
  try {
    const names = (await window.api.persons.getNames(id)) as NameRow[];
    if (names.length > 0) return `${names[0].given_name} ${names[0].surname}`.trim();
  } catch {
    /* ignore */
  }
  return '';
}

async function load() {
  if (!window.api) return;
  try {
    const raw = (await window.api.families.list()) as Array<{
      id: string;
      partner_a_id: string | null;
      partner_b_id: string | null;
      union_type: string;
      notes: string;
    }>;
    const enriched: FamilyRow[] = [];
    for (const f of raw) {
      enriched.push({
        ...f,
        partner_a_name: await getPersonName(f.partner_a_id),
        partner_b_name: await getPersonName(f.partner_b_id),
      });
    }
    families.value = enriched;
  } catch (err) {
    console.error('[FamiliesView] load failed:', err);
  }
}

async function addFamily() {
  if (!window.api) return;
  try {
    await window.api.families.create({
      union_type: form.union_type,
      partner_a_id: form.partner_a_id,
      partner_b_id: form.partner_b_id,
      notes: form.notes,
    });
    showAddForm.value = false;
    form.union_type = 'marriage';
    form.partner_a_id = null;
    form.partner_b_id = null;
    form.notes = '';
    await load();
  } catch (err) {
    console.error('[FamiliesView] addFamily failed:', err);
  }
}

async function removeFamily(id: string) {
  if (!window.api) return;
  if (!confirm(t('families.confirmDelete'))) return;
  try {
    await window.api.families.delete(id);
    await load();
  } catch (err) {
    console.error('[FamiliesView] removeFamily failed:', err);
  }
}

function goToDetail(id: string) {
  router.push(`/families/${id}`);
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
.union-badge {
  background: #fef3c7;
  color: #92400e;
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
  width: 450px;
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
form select,
form textarea {
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
