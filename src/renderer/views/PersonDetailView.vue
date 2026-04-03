<template>
  <div v-if="person" class="person-detail">
    <div class="detail-header">
      <button class="btn-back" @click="$router.push('/')">{{ $t('personDetail.back') }}</button>
      <div class="header-info">
        <h2>{{ primaryName }}</h2>
        <span v-if="!person.living" class="deceased-badge">{{ $t('personDetail.deceased') }}</span>
        <button type="button" class="btn-cite-header" @click="showCitePersonForm = true">{{ $t('personDetail.citePersonTitle') }}</button>
      </div>
      <div v-if="evidenceTotal > 0" class="evidence-summary">
        {{ $t('personDetail.evidenceSummary', { sourced: evidenceSourced, total: evidenceTotal }) }}
      </div>
    </div>

    <!-- Person Details -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('personDetail.detailsTitle') }}</h4>
      </div>
      <div class="field-grid">
        <label>
          {{ $t('persons.sex') }}
          <select
            :class="'sex-select sex-' + editSex"
            v-model="editSex"
            @change="updateSex(editSex)"
          >
            <option value="M">{{ $t('sex.M') }}</option>
            <option value="F">{{ $t('sex.F') }}</option>
            <option value="U">{{ $t('sex.U') }}</option>
          </select>
        </label>
        <label>
          {{ $t('personDetail.statusLabel') }}
          <select v-model="editLiving" @change="updateLiving(editLiving)">
            <option :value="1">{{ $t('personDetail.statusLiving') }}</option>
            <option :value="0">{{ $t('personDetail.statusDeceased') }}</option>
          </select>
        </label>
      </div>
    </section>

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
          <tr v-for="name in names" :key="name.id" class="clickable-row" @click="openEditName(name)">
            <td>
              <span v-if="name.name_prefix" class="name-prefix">{{ name.name_prefix }} </span>{{ name.given_name }}
            </td>
            <td>
              {{ name.surname }}<span v-if="name.name_suffix"> {{ name.name_suffix }}</span><span v-if="name.name_qualifier === 'patronymic'" class="name-qual-badge">pat.</span><span v-if="name.name_qualifier === 'matronymic'" class="name-qual-badge">mat.</span>
            </td>
            <td><span class="type-badge">{{ $t('nameTypes.' + name.name_type) }}</span></td>
            <td class="actions-cell">
              <button
                v-if="name.sort_order > 0"
                class="btn-sm btn-delete"
                @click.stop="removeName(name.id)"
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
        <div class="rel-actions">
          <button class="btn-rel-add" @click="addRelatedMode = 'parent'; showAddRelated = true">{{ $t('personDetail.addParent') }}</button>
          <button class="btn-rel-add" @click="addRelatedMode = 'spouse'; showAddRelated = true">{{ $t('personDetail.addSpouse') }}</button>
          <button class="btn-rel-add" @click="addRelatedMode = 'child'; showAddRelated = true">{{ $t('personDetail.addChild') }}</button>
        </div>
      </div>
      <div v-if="rels.length === 0" class="empty-hint">{{ $t('personDetail.noRelationships') }}</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>{{ $t('common.type') }}</th>
            <th>{{ $t('relationshipDetail.subtype') }}</th>
            <th>{{ $t('common.name') }}</th>
            <th>{{ $t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="rel in rels"
            :key="rel.id"
            class="clickable-row"
            @click="$router.push(`/relationships/${rel.id}`)"
          >
            <td><span class="type-badge">{{ rel.typeLabel }}</span></td>
            <td>{{ rel.subtypeLabel || '—' }}</td>
            <td>{{ rel.otherPersonName || '—' }}</td>
            <td class="actions-cell">
              <button class="btn-sm btn-delete" @click.stop="deleteRelationship(rel.id)">
                {{ $t('common.delete') }}
              </button>
            </td>
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

    <!-- Identifiers Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('identifiers.title') }}</h4>
        <button class="btn-add" @click="showAddIdentifier = true">{{ $t('identifiers.add') }}</button>
      </div>
      <div v-if="identifiers.length === 0" class="empty-hint">{{ $t('identifiers.none') }}</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>{{ $t('identifiers.type') }}</th>
            <th>{{ $t('identifiers.value') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ident in identifiers" :key="ident.id">
            <td><span class="type-badge">{{ $t('identifiers.types.' + ident.identifier_type) }}</span></td>
            <td>{{ ident.identifier_value }}</td>
            <td class="actions-cell">
              <button class="btn-sm btn-delete" @click="removeIdentifier(ident.id)">{{ $t('common.delete') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="showAddIdentifier" class="modal-overlay" @click.self="showAddIdentifier = false">
        <div class="modal">
          <h3>{{ $t('identifiers.addTitle') }}</h3>
          <form @submit.prevent="addIdentifier">
            <label>
              {{ $t('identifiers.type') }}
              <select v-model="newIdentifier.identifier_type">
                <option value="familysearch">FamilySearch</option>
                <option value="ancestry">Ancestry</option>
                <option value="riksarkivet">Riksarkivet</option>
                <option value="personnummer">Personnummer</option>
                <option value="refn">{{ $t('identifiers.types.refn') }}</option>
                <option value="rin">RIN</option>
                <option value="other">{{ $t('identifiers.types.other') }}</option>
              </select>
            </label>
            <label>
              {{ $t('identifiers.value') }}
              <input v-model="newIdentifier.identifier_value" type="text" required />
            </label>
            <div class="modal-actions">
              <button type="button" class="btn-cancel" @click="showAddIdentifier = false">{{ $t('common.cancel') }}</button>
              <button type="submit">{{ $t('common.save') }}</button>
            </div>
          </form>
        </div>
      </div>
    </section>

    <CitationForm
      v-if="showCitePersonForm"
      :person-id="person.id"
      @close="showCitePersonForm = false"
      @saved="showCitePersonForm = false"
    />

    <AddRelatedPersonModal
      v-if="showAddRelated"
      :person-id="person.id"
      :mode="addRelatedMode"
      @close="showAddRelated = false"
      @saved="showAddRelated = false; load()"
    />

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
          <label>
            {{ $t('names.prefix') }}
            <input v-model="nameForm.name_prefix" type="text" :placeholder="$t('names.prefixPlaceholder')" />
          </label>
          <label>
            {{ $t('names.suffix') }}
            <input v-model="nameForm.name_suffix" type="text" :placeholder="$t('names.suffixPlaceholder')" />
          </label>
          <label>
            {{ $t('names.qualifier') }}
            <select v-model="nameForm.name_qualifier">
              <option value="">—</option>
              <option value="patronymic">{{ $t('names.qualifierPatronymic') }}</option>
              <option value="matronymic">{{ $t('names.qualifierMatronymic') }}</option>
              <option value="particle">{{ $t('names.qualifierParticle') }}</option>
            </select>
          </label>
          <label v-if="nameForm.name_qualifier === 'patronymic' || nameForm.name_qualifier === 'matronymic'">
            {{ $t('names.patronymicBase') }}
            <input v-model="nameForm.patronymic_base" type="text" :placeholder="$t('names.patronymicBasePlaceholder')" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showNameForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('personDetail.addNameTitle') }}</button>
          </div>
        </form>
      </div>
    </div>
    <!-- Edit Name Modal -->
    <div v-if="showEditNameForm" class="modal-overlay" @click.self="showEditNameForm = false">
      <div class="modal">
        <h3>{{ $t('personDetail.editNameTitle') }}</h3>
        <form @submit.prevent="saveEditName">
          <label>
            {{ $t('persons.givenName') }}
            <input v-model="editNameForm.given_name" type="text" required />
          </label>
          <label>
            {{ $t('persons.surname') }}
            <input v-model="editNameForm.surname" type="text" />
          </label>
          <label>
            {{ $t('common.type') }}
            <select v-model="editNameForm.name_type">
              <option v-for="nt in NAME_TYPE_VALUES" :key="nt" :value="nt">
                {{ $t('nameTypes.' + nt) }}
              </option>
            </select>
          </label>
          <label>
            {{ $t('names.prefix') }}
            <input v-model="editNameForm.name_prefix" type="text" :placeholder="$t('names.prefixPlaceholder')" />
          </label>
          <label>
            {{ $t('names.suffix') }}
            <input v-model="editNameForm.name_suffix" type="text" :placeholder="$t('names.suffixPlaceholder')" />
          </label>
          <label>
            {{ $t('names.qualifier') }}
            <select v-model="editNameForm.name_qualifier">
              <option value="">—</option>
              <option value="patronymic">{{ $t('names.qualifierPatronymic') }}</option>
              <option value="matronymic">{{ $t('names.qualifierMatronymic') }}</option>
              <option value="particle">{{ $t('names.qualifierParticle') }}</option>
            </select>
          </label>
          <label v-if="editNameForm.name_qualifier === 'patronymic' || editNameForm.name_qualifier === 'matronymic'">
            {{ $t('names.patronymicBase') }}
            <input v-model="editNameForm.patronymic_base" type="text" :placeholder="$t('names.patronymicBasePlaceholder')" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showEditNameForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('common.save') }}</button>
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
import CitationForm from '../components/CitationForm.vue';
import AddRelatedPersonModal from '../components/AddRelatedPersonModal.vue';
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
  given_name: string | null;
  surname: string | null;
  name_type: string;
  sort_order: number;
  name_prefix: string | null;
  name_suffix: string | null;
  patronymic_base: string | null;
  name_qualifier: string | null;
}

interface RelRow {
  id: string;
  type: string;
  person1_id: string | null;
  person2_id: string | null;
  subtype: string | null;
  otherPersonName: string;
  subtypeLabel: string;
  typeLabel: string;
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
const showEditNameForm = ref(false);
const editingNameId = ref<string | null>(null);
const showCitePersonForm = ref(false);
const showAddRelated = ref(false);
const addRelatedMode = ref<'parent' | 'spouse' | 'child'>('parent');
const editSex = ref('U');
const editLiving = ref(1);
const evidenceSourced = ref(0);
const evidenceTotal = ref(0);
const eventListRef = ref<InstanceType<typeof EventList> | null>(null);

interface IdentifierRow {
  id: string;
  identifier_type: string;
  identifier_value: string;
}

const nameForm = reactive({
  given_name: '',
  surname: '',
  name_type: 'married',
  name_prefix: '',
  name_suffix: '',
  name_qualifier: '',
  patronymic_base: '',
});

const editNameForm = reactive({
  given_name: '',
  surname: '',
  name_type: 'birth',
  name_prefix: '',
  name_suffix: '',
  name_qualifier: '',
  patronymic_base: '',
});

const identifiers = ref<IdentifierRow[]>([]);
const showAddIdentifier = ref(false);
const newIdentifier = reactive({ identifier_type: 'familysearch', identifier_value: '' });

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
    editSex.value = person.value.sex;
    editLiving.value = person.value.living;

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
      let typeLabel = t('relTypes.' + r.type);
      if (r.type === 'parent_child') {
        typeLabel = r.person1_id === personId ? t('relTypes.child') : t('relTypes.parent');
      }
      enriched.push({
        ...r,
        otherPersonName: otherPersonName || t('common.unknown'),
        subtypeLabel: getSubtypeLabel(r.type, r.subtype),
        typeLabel,
      });
    }
    rels.value = enriched;

    // Evidence summary
    const evs = (await window.api.events.forPerson(personId)) as Array<{ id: string }>;
    evidenceTotal.value = evs.length;
    const counts = await Promise.all(
      evs.map(async (ev) => {
        const cits = (await window.api.citations.forEvent(ev.id)) as unknown[];
        return cits.length > 0 ? 1 : 0;
      }),
    );
    evidenceSourced.value = counts.reduce((a, b) => a + b, 0);

    await loadIdentifiers();
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
      name_prefix: nameForm.name_prefix || null,
      name_suffix: nameForm.name_suffix || null,
      name_qualifier: nameForm.name_qualifier || null,
      patronymic_base: nameForm.patronymic_base || null,
    });
    showNameForm.value = false;
    nameForm.given_name = '';
    nameForm.surname = '';
    nameForm.name_type = 'married';
    nameForm.name_prefix = '';
    nameForm.name_suffix = '';
    nameForm.name_qualifier = '';
    nameForm.patronymic_base = '';
    await load();
  } catch (err) {
    console.error('[PersonDetailView] addName failed:', err);
  }
}

function openEditName(name: NameRow) {
  editingNameId.value = name.id;
  editNameForm.given_name = name.given_name ?? '';
  editNameForm.surname = name.surname ?? '';
  editNameForm.name_type = name.name_type;
  editNameForm.name_prefix = name.name_prefix ?? '';
  editNameForm.name_suffix = name.name_suffix ?? '';
  editNameForm.name_qualifier = name.name_qualifier ?? '';
  editNameForm.patronymic_base = name.patronymic_base ?? '';
  showEditNameForm.value = true;
}

async function saveEditName() {
  if (!window.api || !editingNameId.value) return;
  try {
    await window.api.persons.updateName(editingNameId.value, {
      given_name: editNameForm.given_name,
      surname: editNameForm.surname,
      name_type: editNameForm.name_type,
      name_prefix: editNameForm.name_prefix || null,
      name_suffix: editNameForm.name_suffix || null,
      name_qualifier: editNameForm.name_qualifier || null,
      patronymic_base: editNameForm.patronymic_base || null,
    });
    showEditNameForm.value = false;
    editingNameId.value = null;
    await load();
  } catch (err) {
    console.error('[PersonDetailView] saveEditName failed:', err);
  }
}

async function removeName(id: string) {
  if (!window.api) return;
  try {
    await window.api.persons.deleteName(id);
    await load();
  } catch (err) {
    console.error('[PersonDetailView] removeName failed:', err);
  }
}

async function loadIdentifiers() {
  if (!window.api) return;
  try {
    identifiers.value = (await window.api.persons.getIdentifiers(personId)) as IdentifierRow[];
  } catch (err) {
    console.error('[PersonDetailView] loadIdentifiers failed:', err);
  }
}

async function addIdentifier() {
  if (!window.api) return;
  if (!newIdentifier.identifier_value.trim()) return;
  try {
    await window.api.persons.addIdentifier(personId, {
      identifier_type: newIdentifier.identifier_type,
      identifier_value: newIdentifier.identifier_value,
    });
    newIdentifier.identifier_value = '';
    showAddIdentifier.value = false;
    await loadIdentifiers();
  } catch (err) {
    console.error('[PersonDetailView] addIdentifier failed:', err);
  }
}

async function removeIdentifier(id: string) {
  if (!window.api) return;
  try {
    await window.api.persons.deleteIdentifier(id);
    await loadIdentifiers();
  } catch (err) {
    console.error('[PersonDetailView] removeIdentifier failed:', err);
  }
}

async function updateSex(sex: string) {
  if (!window.api || !person.value) return;
  await window.api.persons.update(personId, { sex });
  person.value.sex = sex;
}

async function updateLiving(living: number) {
  if (!window.api || !person.value) return;
  await window.api.persons.update(personId, { living });
  person.value.living = living;
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

async function deleteRelationship(id: string) {
  if (!window.api) return;
  await window.api.relationships.delete(id);
  await load();
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
.sex-select {
  padding: 2px 20px 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid #ccc;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath d='M0 2l4 4 4-4z' fill='%23666'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
}
.sex-select.sex-M { background-color: #dbeafe; color: #1d4ed8; }
.sex-select.sex-F { background-color: #fce7f3; color: #be185d; }
.sex-select.sex-U { background-color: #f3f4f6; color: #6b7280; }
.deceased-badge {
  background: #fef3c7;
  color: #92400e;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
}
.btn-cite-header {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.evidence-summary {
  font-size: 13px;
  color: #6b7280;
  margin-top: 4px;
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
.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.field-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #555;
}
.field-grid select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
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
.btn-edit {
  background: #eff6ff;
  color: #1d4ed8;
}
.btn-delete {
  background: #fee;
  color: #c0392b;
}
.actions-cell {
  display: flex;
  gap: 4px;
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
.rel-actions {
  display: flex;
  gap: 6px;
}
.btn-rel-add {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.btn-rel-add:hover {
  background: #e2e8f0;
}
.name-prefix {
  color: #6b7280;
  font-style: italic;
}
.name-qual-badge {
  background: #fef3c7;
  color: #92400e;
  padding: 1px 5px;
  border-radius: 8px;
  font-size: 11px;
  margin-left: 4px;
}
</style>
