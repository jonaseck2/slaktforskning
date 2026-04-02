<template>
  <div v-if="person" class="person-detail">
    <div class="detail-header">
      <button class="btn-back" @click="$router.push('/')">{{ $t('personDetail.back') }}</button>
      <div class="header-info">
        <h2>{{ primaryName }}</h2>
        <span :class="'sex-badge sex-' + person.sex">{{ person.sex }}</span>
        <span v-if="!person.living" class="deceased-badge">{{ $t('personDetail.deceased') }}</span>
      </div>
    </div>

    <!-- Names Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('personDetail.names') }}</h4>
        <button class="btn-add" @click="showNameForm = true">{{ $t('personDetail.addName') }}</button>
      </div>
      <div v-if="names.length === 0" class="empty-hint">{{ $t('personDetail.noNames') }}</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>{{ $t('persons.givenName') }}</th>
            <th>{{ $t('persons.surname') }}</th>
            <th>{{ $t('common.type') }}</th>
            <th>{{ $t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="name in names" :key="name.id">
            <td>{{ name.given_name }}</td>
            <td>{{ name.surname }}</td>
            <td><span class="type-badge">{{ $t('nameTypes.' + name.name_type) }}</span></td>
            <td>
              <button
                v-if="name.sort_order > 0"
                class="btn-sm btn-delete"
                @click="removeName(name.id)"
              >
                {{ $t('common.delete') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Events Section -->
    <section class="detail-section">
      <EventList :person-id="person.id" ref="eventListRef" />
    </section>

    <!-- Relationships Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('personDetail.relationships') }}</h4>
      </div>
      <div v-if="rels.length === 0" class="empty-hint">{{ $t('personDetail.noRelationships') }}</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>{{ $t('common.type') }}</th>
            <th>{{ $t('relationshipDetail.subtype') }}</th>
            <th>{{ $t('common.name') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="rel in rels"
            :key="rel.id"
            class="clickable-row"
            @click="$router.push(`/relationships/${rel.id}`)"
          >
            <td><span class="type-badge">{{ $t('relTypes.' + rel.type) }}</span></td>
            <td>{{ rel.subtypeLabel || '—' }}</td>
            <td>{{ rel.otherPersonName || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Notes Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('common.notes') }}</h4>
      </div>
      <textarea
        v-model="notesText"
        rows="3"
        :placeholder="$t('personDetail.notesPlaceholder')"
        @blur="saveNotes"
      />
    </section>

    <!-- Add Name Modal -->
    <div v-if="showNameForm" class="modal-overlay" @click.self="showNameForm = false">
      <div class="modal">
        <h3>{{ $t('personDetail.addNameTitle') }}</h3>
        <form @submit.prevent="addName">
          <label>
            {{ $t('persons.givenName') }}
            <input v-model="nameForm.given_name" type="text" required />
          </label>
          <label>
            {{ $t('persons.surname') }}
            <input v-model="nameForm.surname" type="text" />
          </label>
          <label>
            {{ $t('common.type') }}
            <select v-model="nameForm.name_type">
              <option v-for="nt in NAME_TYPE_VALUES" :key="nt" :value="nt">
                {{ $t('nameTypes.' + nt) }}
              </option>
            </select>
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showNameForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('personDetail.addNameTitle') }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
  <div v-else class="empty">{{ $t('common.loading') }}</div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import EventList from '../components/EventList.vue';
import { NAME_TYPE_VALUES } from '../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface PersonData {
  id: string;
  sex: string;
  living: number;
  notes: string;
}

interface NameRow {
  id: string;
  given_name: string;
  surname: string;
  name_type: string;
  sort_order: number;
}

interface RelRow {
  id: string;
  type: string;
  person1_id: string | null;
  person2_id: string | null;
  subtype: string | null;
  otherPersonName: string;
  subtypeLabel: string;
}

const { t } = useI18n();
const route = useRoute();
const personId = route.params.id as string;

const person = ref<PersonData | null>(null);
const names = ref<NameRow[]>([]);
const rels = ref<RelRow[]>([]);
const primaryName = ref('');
const notesText = ref('');
const showNameForm = ref(false);
const eventListRef = ref<InstanceType<typeof EventList> | null>(null);

const nameForm = reactive({
  given_name: '',
  surname: '',
  name_type: 'married',
});

function getSubtypeLabel(type: string, subtype: string | null): string {
  if (!subtype) return '';
  if (type === 'couple') return t('coupleSubtypes.' + subtype);
  if (type === 'parent_child') return t('parentChildSubtypes.' + subtype);
  return subtype;
}

async function load() {
  if (!window.api) return;
  try {
    person.value = (await window.api.persons.get(personId)) as PersonData | null;
    if (!person.value) return;
    notesText.value = person.value.notes || '';

    names.value = (await window.api.persons.getNames(personId)) as NameRow[];
    if (names.value.length > 0) {
      const n = names.value[0];
      primaryName.value = `${n.given_name} ${n.surname}`.trim();
    }

    const rawRels = (await window.api.relationships.getForPerson(personId)) as Array<{
      id: string;
      type: string;
      person1_id: string | null;
      person2_id: string | null;
      subtype: string | null;
    }>;

    const enriched: RelRow[] = [];
    for (const r of rawRels) {
      const otherId = r.person1_id === personId ? r.person2_id : r.person1_id;
      let otherPersonName = '';
      if (otherId) {
        const pNames = (await window.api.persons.getNames(otherId)) as NameRow[];
        if (pNames.length > 0) otherPersonName = `${pNames[0].given_name} ${pNames[0].surname}`.trim();
      }
      enriched.push({
        ...r,
        otherPersonName: otherPersonName || t('common.unknown'),
        subtypeLabel: getSubtypeLabel(r.type, r.subtype),
      });
    }
    rels.value = enriched;
  } catch (err) {
    console.error('[PersonDetailView] load failed:', err);
  }
}

async function addName() {
  if (!window.api) return;
  try {
    await window.api.persons.addName(personId, {
      given_name: nameForm.given_name,
      surname: nameForm.surname,
      name_type: nameForm.name_type,
    });
    showNameForm.value = false;
    nameForm.given_name = '';
    nameForm.surname = '';
    nameForm.name_type = 'married';
    await load();
  } catch (err) {
    console.error('[PersonDetailView] addName failed:', err);
  }
}

async function removeName(id: string) {
  if (!window.api) return;
  console.warn('Delete name not yet implemented via IPC');
}

async function saveNotes() {
  if (!window.api || !person.value) return;
  if (notesText.value === (person.value.notes || '')) return;
  try {
    await window.api.persons.update(personId, { notes: notesText.value });
    person.value.notes = notesText.value;
  } catch (err) {
    console.error('[PersonDetailView] saveNotes failed:', err);
  }
}

onMounted(load);
</script>

<style scoped>
.person-detail {
  max-width: 700px;
}
.detail-header {
  margin-bottom: 24px;
}
.btn-back {
  background: none;
  border: none;
  color: #2c3e50;
  cursor: pointer;
  padding: 4px 0;
  font-size: 14px;
  margin-bottom: 8px;
}
.btn-back:hover {
  text-decoration: underline;
}
.header-info {
  display: flex;
  align-items: center;
  gap: 10px;
}
.header-info h2 {
  margin: 0;
}
.sex-badge {
  padding: 2px 10px;
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
.deceased-badge {
  background: #fef3c7;
  color: #92400e;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
}
.detail-section {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #eee;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.section-header h4 {
  margin: 0;
  font-size: 15px;
}
.btn-add {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.empty-hint {
  color: #999;
  font-size: 13px;
  padding: 12px 0;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.data-table th,
.data-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #eee;
  text-align: left;
}
.data-table th {
  background: #f8f8f8;
  font-weight: 600;
  font-size: 12px;
  color: #666;
}
.clickable-row {
  cursor: pointer;
}
.clickable-row:hover {
  background: #f0f4ff;
}
.type-badge {
  background: #f0fdf4;
  color: #166534;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}
.btn-sm {
  padding: 2px 8px;
  font-size: 12px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}
.btn-delete {
  background: #fee;
  color: #c0392b;
}
textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
}
.empty {
  color: #999;
  padding: 40px;
  text-align: center;
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
  width: 400px;
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
form select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
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
