<template>
  <div>
    <div class="header">
      <h2>{{ $t('relationships.title') }}</h2>
      <button @click="showAddForm = true">{{ $t('relationships.addRelationship') }}</button>
    </div>
    <div v-if="relationships.length === 0" class="empty">
      {{ $t('relationships.emptyState') }}
    </div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('common.type') }}</th>
          <th>{{ $t('relationships.person1') }}</th>
          <th>{{ $t('relationships.person2') }}</th>
          <th>{{ $t('relationshipDetail.subtype') }}</th>
          <th>{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="rel in relationships"
          :key="rel.id"
          class="clickable-row"
          @click="goToDetail(rel.id)"
        >
          <td><span class="type-badge">{{ $t('relTypes.' + rel.type) }}</span></td>
          <td>
            <PersonName
              v-if="rel.person1_given_name || rel.person1_surname"
              :given-name="rel.person1_given_name"
              :surname="rel.person1_surname"
              :preferred-name="rel.person1_preferred_name"
            /><span v-else>—</span>
            <span v-if="roleLabel1(rel.type)" class="role-label">{{ roleLabel1(rel.type) }}</span>
          </td>
          <td>
            <PersonName
              v-if="rel.person2_given_name || rel.person2_surname"
              :given-name="rel.person2_given_name"
              :surname="rel.person2_surname"
              :preferred-name="rel.person2_preferred_name"
            /><span v-else>—</span>
            <span v-if="roleLabel2(rel.type)" class="role-label">{{ roleLabel2(rel.type) }}</span>
          </td>
          <td>{{ rel.subtype ? getSubtypeLabel(rel.type, rel.subtype) : '—' }}</td>
          <td>
            <button class="btn-sm btn-delete" @click.stop="removeRelationship(rel.id)">{{ $t('common.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Add Relationship Modal -->
    <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
      <div class="modal">
        <h3>{{ $t('relationships.addRelationship') }}</h3>
        <form @submit.prevent="addRelationship">
          <label>
            {{ $t('common.type') }}
            <select v-model="form.type">
              <option v-for="rt in RELATIONSHIP_TYPE_VALUES" :key="rt" :value="rt">
                {{ $t('relTypes.' + rt) }}
              </option>
            </select>
          </label>
          <label v-if="form.type === 'couple'">
            {{ $t('relationshipDetail.subtype') }}
            <select v-model="form.subtype">
              <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">
                {{ $t('coupleSubtypes.' + st) }}
              </option>
            </select>
          </label>
          <label v-if="form.type === 'parent_child'">
            {{ $t('relationshipDetail.subtype') }}
            <select v-model="form.subtype">
              <option v-for="st in PARENT_CHILD_SUBTYPE_VALUES" :key="st" :value="st">
                {{ $t('parentChildSubtypes.' + st) }}
              </option>
            </select>
          </label>
          <label>
            {{ $t('relationships.person1') }}
            <PersonPicker v-model="form.person1_id" :placeholder="$t('relationships.searchPerson')" />
          </label>
          <label>
            {{ $t('relationships.person2') }}
            <PersonPicker v-model="form.person2_id" :placeholder="$t('relationships.searchPerson')" />
          </label>
          <label>
            {{ $t('common.notes') }}
            <textarea v-model="form.notes" rows="2" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showAddForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('relationships.addRelationship') }}</button>
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
import PersonName from '../components/PersonName.vue';
import { RELATIONSHIP_TYPE_VALUES, COUPLE_SUBTYPE_VALUES, PARENT_CHILD_SUBTYPE_VALUES } from '../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface RelRow {
  id: string;
  type: string;
  person1_id: string | null;
  person2_id: string | null;
  subtype: string | null;
  notes: string;
  person1_given_name: string;
  person1_surname: string;
  person1_preferred_name: string | null;
  person2_given_name: string;
  person2_surname: string;
  person2_preferred_name: string | null;
}

interface NameRow {
  given_name: string;
  surname: string;
  preferred_name: string | null;
}

const { t } = useI18n();
const router = useRouter();
const relationships = ref<RelRow[]>([]);
const showAddForm = ref(false);
const form = reactive({
  type: 'couple' as string,
  subtype: 'marriage' as string,
  person1_id: null as string | null,
  person2_id: null as string | null,
  notes: '',
});

function roleLabel1(type: string): string {
  if (type === 'parent_child') return t('relTypes.parent');
  if (type === 'couple') return t('relTypes.partner');
  if (type === 'sibling') return t('relTypes.sibling');
  if (type === 'godparent') return t('relTypes.godparent');
  return '';
}

function roleLabel2(type: string): string {
  if (type === 'parent_child') return t('relTypes.child');
  if (type === 'couple') return t('relTypes.partner');
  if (type === 'sibling') return t('relTypes.sibling');
  if (type === 'godparent') return t('relTypes.godchild');
  return '';
}

function getSubtypeLabel(type: string, subtype: string): string {
  if (type === 'couple') return t('coupleSubtypes.' + subtype);
  if (type === 'parent_child') return t('parentChildSubtypes.' + subtype);
  return subtype;
}

async function getPersonNameRow(id: string | null): Promise<{ given_name: string; surname: string; preferred_name: string | null }> {
  if (!id || !window.api) return { given_name: '', surname: '', preferred_name: null };
  try {
    const names = (await window.api.persons.getNames(id)) as NameRow[];
    if (names.length > 0) return { given_name: names[0].given_name, surname: names[0].surname, preferred_name: names[0].preferred_name };
  } catch {
    /* ignore */
  }
  return { given_name: '', surname: '', preferred_name: null };
}

async function load() {
  if (!window.api) return;
  try {
    const raw = (await window.api.relationships.list()) as Array<{
      id: string;
      type: string;
      person1_id: string | null;
      person2_id: string | null;
      subtype: string | null;
      notes: string;
    }>;
    const enriched: RelRow[] = [];
    for (const r of raw) {
      const p1 = await getPersonNameRow(r.person1_id);
      const p2 = await getPersonNameRow(r.person2_id);
      enriched.push({
        ...r,
        person1_given_name: p1.given_name,
        person1_surname: p1.surname,
        person1_preferred_name: p1.preferred_name,
        person2_given_name: p2.given_name,
        person2_surname: p2.surname,
        person2_preferred_name: p2.preferred_name,
      });
    }
    relationships.value = enriched;
  } catch (err) {
    console.error('[RelationshipsView] load failed:', err);
  }
}

async function addRelationship() {
  if (!window.api) return;
  try {
    await window.api.relationships.create({
      type: form.type,
      person1_id: form.person1_id,
      person2_id: form.person2_id,
      subtype: form.subtype,
      notes: form.notes,
    });
    showAddForm.value = false;
    form.type = 'couple';
    form.subtype = 'marriage';
    form.person1_id = null;
    form.person2_id = null;
    form.notes = '';
    await load();
  } catch (err) {
    console.error('[RelationshipsView] addRelationship failed:', err);
  }
}

async function removeRelationship(id: string) {
  if (!window.api) return;
  if (!confirm(t('relationships.confirmDelete'))) return;
  try {
    await window.api.relationships.delete(id);
    await load();
  } catch (err) {
    console.error('[RelationshipsView] removeRelationship failed:', err);
  }
}

function goToDetail(id: string) {
  router.push(`/relationships/${id}`);
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
  background: #fef3c7;
  color: #92400e;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}
.role-label {
  display: block;
  font-size: 11px;
  color: #888;
  margin-top: 1px;
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
