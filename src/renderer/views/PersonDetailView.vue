<template>
  <div v-if="person" class="person-detail">
    <div class="detail-header">
      <button class="btn-back" @click="$router.push('/')">{{ $t('personDetail.back') }}</button>
      <div class="header-info">
        <h2>{{ primaryName }}</h2>
        <span v-if="!person.living" class="deceased-badge">{{ $t('personDetail.deceased') }}</span>
        <button type="button" class="btn-view-tree" data-testid="view-in-tree-btn" @click="$router.push('/visualisering/' + personId)">{{ $t('personDetail.viewInTree') }} →</button>
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
      <label class="notes-label">
        {{ $t('common.notes') }}
        <textarea
          v-model="notesText"
          rows="3"
          :placeholder="$t('personDetail.notesPlaceholder')"
          @blur="saveNotes"
        />
      </label>
    </section>

    <!-- Names Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('personDetail.names') }}</h4>
        <button class="btn-add" @click="showNameForm = true">{{ $t('personDetail.addName') }}</button>
      </div>
      <div v-if="names.length === 0" class="empty-hint">{{ $t('personDetail.noNames') }}</div>
      <PersonNamesTable v-else :names="names" @edit="openEditName" @delete="removeName" />
    </section>

    <!-- Events Section -->
    <section class="detail-section">
      <EventList :person-id="person.id" ref="eventListRef" />
    </section>

    <!-- Identifiers Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('identifiers.title') }}</h4>
        <button class="btn-add" @click="identifiersSectionRef?.openAddForm()">{{ $t('identifiers.add') }}</button>
      </div>
      <PersonIdentifiersSection ref="identifiersSectionRef" :person-id="person.id" />
    </section>

    <!-- Relationships Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('personDetail.relationships') }}</h4>
        <div class="rel-actions">
          <button class="btn-add" @click="addRelatedMode = 'parent'; showAddRelated = true">{{ $t('personDetail.addParent') }}</button>
          <button class="btn-add" @click="addRelatedMode = 'spouse'; showAddRelated = true">{{ $t('personDetail.addSpouse') }}</button>
          <button class="btn-add" @click="addRelatedMode = 'child'; showAddRelated = true">{{ $t('personDetail.addChild') }}</button>
        </div>
      </div>
      <PersonRelationshipsSection ref="relSectionRef" :person-id="personId" />
    </section>

    <!-- Groups Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('groups.title') }}</h4>
        <button v-if="!showGroupPicker" class="btn-add" @click="showGroupPicker = true">+ {{ $t('groups.addMember') }}</button>
      </div>
      <div v-if="showGroupPicker" class="group-picker-row">
        <GroupPicker
          :person-id="personId"
          :exclude-ids="personGroups.map(g => g.id)"
          @added="showGroupPicker = false; loadPersonGroups()"
          @cancel="showGroupPicker = false"
        />
      </div>
      <div v-if="personGroups.length === 0 && !showGroupPicker" class="empty-hint">{{ $t('groups.noGroups') }}</div>
      <GroupsTable v-else-if="personGroups.length > 0" :groups="personGroups" @remove="removeFromGroup" />
    </section>

    <!-- Media Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('media.title') }}</h4>
        <button class="btn-add" @click="mediaSectionRef?.attach()">{{ $t('media.attach') }}</button>
      </div>
      <PersonMediaSection ref="mediaSectionRef" :person-id="person.id" />
    </section>

    <!-- Research Tasks Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('researchTasks.title') }}</h4>
        <button class="btn-add" @click="showAddTaskModal = true">+ {{ $t('researchTasks.addTask') }}</button>
      </div>
      <div v-if="personTasks.length === 0" class="empty-hint">{{ $t('researchTasks.noTasks') }}</div>
      <ResearchTasksTable v-else :tasks="personTasks" @updated="loadPersonTasks" />
    </section>

    <!-- Add Research Task Modal -->
    <BaseModal v-if="showAddTaskModal" @close="showAddTaskModal = false">
        <h3>{{ $t('researchTasks.addTask') }}</h3>
        <form @submit.prevent="createPersonTask">
          <label>
            {{ $t('researchTasks.task') }} *
            <input v-model="taskForm.task" type="text" required autofocus />
          </label>
          <label>
            {{ $t('researchTasks.priority') }}
            <select v-model="taskForm.priority">
              <option :value="0">0</option>
              <option :value="1">1</option>
              <option :value="2">2</option>
              <option :value="3">3</option>
            </select>
          </label>
          <label>
            {{ $t('researchTasks.notes') }}
            <textarea v-model="taskForm.notes" rows="2" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showAddTaskModal = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('common.save') }}</button>
          </div>
        </form>
    </BaseModal>

    <!-- Quality Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('quality.nav') }}</h4>
      </div>
      <PersonChecksSection ref="checksSectionRef" :person-id="person.id" />
    </section>

    <AddRelatedPersonModal
      v-if="showAddRelated"
      :person-id="person.id"
      :mode="addRelatedMode"
      @close="showAddRelated = false"
      @saved="showAddRelated = false; relSectionRef?.reload()"
    />

    <!-- Add Name Modal -->
    <PersonNameFormModal
      v-if="showNameForm || showEditNameForm"
      :person-id="personId"
      :name="showEditNameForm ? editingName : null"
      @close="showNameForm = false; showEditNameForm = false"
      @saved="load"
    />
  </div>
  <div v-else class="empty">{{ $t('common.loading') }}</div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from '../composables/useToast';
import BaseModal from '../components/BaseModal.vue';
import EventList from '../components/EventList.vue';
import AddRelatedPersonModal from '../components/AddRelatedPersonModal.vue';
import PersonRelationshipsSection from '../components/PersonRelationshipsSection.vue';
import PersonNamesTable from '../components/PersonNamesTable.vue';
import PersonNameFormModal from '../components/PersonNameFormModal.vue';
import PersonIdentifiersSection from '../components/PersonIdentifiersSection.vue';
import PersonMediaSection from '../components/PersonMediaSection.vue';
import PersonChecksSection from '../components/PersonChecksSection.vue';
import ResearchTasksTable from '../components/ResearchTasksTable.vue';
import GroupPicker from '../components/GroupPicker.vue';
import GroupsTable from '../components/GroupsTable.vue';
import { fullNameParts } from '../utils/nameUtils';
import { useFocusStore } from '../stores/focus';

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
  preferred_name: string | null;
  nickname: string | null;
}

const route = useRoute();
const personId = route.params.id as string;
const focusStore = useFocusStore();
const { t } = useI18n();
const toast = useToast();

const person = ref<PersonData | null>(null);
const names = ref<NameRow[]>([]);
const primaryName = ref('');
const notesText = ref('');
const showNameForm = ref(false);
const showEditNameForm = ref(false);
const editingName = ref<NameRow | null>(null);
const showAddRelated = ref(false);
const addRelatedMode = ref<'parent' | 'spouse' | 'child'>('parent');
const editSex = ref('U');
const editLiving = ref(1);
const evidenceSourced = ref(0);
const evidenceTotal = ref(0);
const eventListRef = ref<InstanceType<typeof EventList> | null>(null);
const identifiersSectionRef = ref<InstanceType<typeof PersonIdentifiersSection> | null>(null);
const mediaSectionRef = ref<InstanceType<typeof PersonMediaSection> | null>(null);
const checksSectionRef = ref<InstanceType<typeof PersonChecksSection> | null>(null);
const relSectionRef = ref<InstanceType<typeof PersonRelationshipsSection> | null>(null);

// Research tasks
const personTasks = ref<import('../components/ResearchTasksTable.vue').ResearchTaskRow[]>([]);
const showAddTaskModal = ref(false);

const personGroups = ref<import('../components/GroupsTable.vue').GroupRow[]>([]);
const showGroupPicker = ref(false);

const taskForm = reactive({ task: '', priority: 1, notes: '' });

async function loadPersonTasks() {
  if (!window.api?.researchTasks) return;
  personTasks.value = (await window.api.researchTasks.forPerson(personId)) as import('../components/ResearchTasksTable.vue').ResearchTaskRow[];
}

async function loadPersonGroups() {
  personGroups.value = (await window.api.groups.forPerson(personId)) as PersonGroup[];
}

async function removeFromGroup(groupId: string) {
  await window.api.groups.removeMember(groupId, personId);
  await loadPersonGroups();
}

async function createPersonTask() {
  if (!taskForm.task.trim()) return;
  await window.api.researchTasks.create({
    task: taskForm.task,
    notes: taskForm.notes || undefined,
    person_id: personId,
    priority: taskForm.priority,
    status: 'open',
  });
  taskForm.task = '';
  taskForm.notes = '';
  taskForm.priority = 1;
  showAddTaskModal.value = false;
  await loadPersonTasks();
}

async function load() {
  if (!window.api) return;
  try {
    person.value = (await window.api.persons.get(personId)) as PersonData | null;
    if (!person.value) return;
    localStorage.setItem('viz-focal-person', personId);
    notesText.value = person.value.notes || '';
    editSex.value = person.value.sex;
    editLiving.value = person.value.living;

    names.value = (await window.api.persons.getNames(personId)) as NameRow[];
    if (names.value.length > 0) {
      const n = names.value[0];
      primaryName.value = fullNameParts(n.given_name ?? null, n.surname ?? null, n.preferred_name ?? null, n.nickname ?? null)
        .map(p => p.text).join('');
    }
    focusStore.set(personId, primaryName.value);

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

    await loadPersonTasks();
    await loadPersonGroups();
  } catch (err) {
    console.error('[PersonDetailView] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

function openEditName(name: NameRow) {
  editingName.value = name;
  showEditNameForm.value = true;
}

async function removeName(id: string) {
  if (!window.api) return;
  try {
    await window.api.persons.deleteName(id);
    await load();
  } catch (err) {
    console.error('[PersonDetailView] removeName failed:', err);
    toast.error(t('errors.deleteFailed'));
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
    toast.error(t('errors.saveFailed'));
  }
}

onMounted(async () => {
  await load();
  let debounce: ReturnType<typeof setTimeout> | null = null;
  (window.api as unknown as { onDataChanged: (cb: () => void) => void }).onDataChanged(() => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => checksSectionRef.value?.reload(), 400);
  });
});
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
  color: var(--color-primary);
  cursor: pointer;
  padding: 4px 0;
  font-size: var(--font-base);
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
.btn-view-tree {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.evidence-summary {
  font-size: var(--font-sm);
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
  font-size: var(--font-md);
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
  font-size: var(--font-sm);
  font-weight: 600;
  color: #555;
}
.field-grid select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
  font-family: inherit;
}
.notes-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-sm);
  font-weight: 600;
  color: #555;
  margin-top: 12px;
}
textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-family: inherit;
  font-size: var(--font-base);
  resize: vertical;
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
.group-picker-row {
  margin-bottom: 8px;
}
</style>
