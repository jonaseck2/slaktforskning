<template>
  <div v-if="person" class="person-detail">
    <div v-if="checkIssues.length > 0" class="issues-banner" :class="hasBannerErrors ? 'banner-error' : 'banner-warning'">
      <span class="banner-icon">{{ hasBannerErrors ? '⚠️' : '⚠' }}</span>
      <span>{{ $t('quality.issuesBanner', { count: checkIssues.length }) }}</span>
      <button class="banner-toggle" @click="showIssueDetails = !showIssueDetails">
        {{ showIssueDetails ? $t('quality.hideDetails') : $t('quality.showDetails') }}
      </button>
      <div v-if="showIssueDetails" class="banner-details">
        <div v-for="issue in checkIssues" :key="issue.code" class="banner-issue">
          <span :class="['banner-severity', 'badge-' + issue.severity]">{{ $t('quality.severity.' + issue.severity) }}</span>
          <span>{{ issue.message }}</span>
        </div>
      </div>
    </div>
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
              <span v-if="name.name_prefix" class="name-prefix">{{ name.name_prefix }} </span>
              <PersonName :given-name="name.given_name" :preferred-name="name.preferred_name" :nickname="name.nickname" />
            </td>
            <td>
              {{ name.surname }}{{ name.name_suffix ? ' ' : '' }}<span v-if="name.name_suffix" class="name-suffix">{{ name.name_suffix }}</span><span v-if="name.name_qualifier === 'patronymic'" class="name-qual-badge">pat.</span><span v-if="name.name_qualifier === 'matronymic'" class="name-qual-badge">mat.</span>
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

    <!-- Research Tasks Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('researchTasks.title') }}</h4>
        <button class="btn-add" @click="showAddTaskModal = true">+ {{ $t('researchTasks.addTask') }}</button>
      </div>
      <div v-if="personTasks.length === 0" class="empty-hint">{{ $t('researchTasks.noTasks') }}</div>
      <div v-else class="task-list">
        <div v-for="task in personTasks" :key="task.id" class="task-row">
          <span
            :class="['status-chip', 'status-' + task.status]"
            @click="cycleTaskStatus(task)"
            :title="$t('researchTasks.status')"
          >{{ $t('researchTasks.statuses.' + task.status) }}</span>
          <span class="task-text">{{ task.task }}</span>
          <span v-if="task.result" class="task-result">— {{ task.result }}</span>
          <button class="btn-sm btn-delete" @click="deletePersonTask(task.id)">{{ $t('common.delete') }}</button>
        </div>
      </div>
    </section>

    <!-- Add Research Task Modal -->
    <div v-if="showAddTaskModal" class="modal-overlay" @click.self="showAddTaskModal = false">
      <div class="modal">
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
      </div>
    </div>

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

    <!-- Groups Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('groups.title') }} <span class="count-badge">({{ personGroups.length }})</span></h4>
        <button v-if="!showGroupPicker" class="btn-add" @click="showGroupPicker = true">+ {{ $t('groups.addMember') }}</button>
      </div>
      <div class="group-chips">
        <div v-for="g in personGroups" :key="g.id" class="group-chip">
          <router-link :to="'/groups/' + g.id" class="chip-name">{{ g.name }}</router-link>
          <button class="chip-remove" @click="removeFromGroup(g.id)" :title="$t('groups.confirmRemoveMember')">×</button>
        </div>
        <div v-if="personGroups.length === 0 && !showGroupPicker" class="empty-hint">{{ $t('groups.noGroups') }}</div>
      </div>
      <div v-if="showGroupPicker" class="group-picker-row">
        <GroupPicker
          :person-id="personId"
          :exclude-ids="personGroups.map(g => g.id)"
          @added="showGroupPicker = false; loadPersonGroups()"
          @cancel="showGroupPicker = false"
        />
        <button class="btn-cancel-inline" @click="showGroupPicker = false">{{ $t('common.cancel') }}</button>
      </div>
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

    <!-- Media Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('media.title') }}</h4>
        <button class="btn-add" @click="attachMediaToPerson">{{ $t('media.attach') }}</button>
      </div>
      <div v-if="personMedia.length === 0" class="empty-hint">{{ $t('media.noMedia') }}</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>{{ $t('media.title_label') }}</th>
            <th>{{ $t('media.format') }}</th>
            <th>{{ $t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in personMedia" :key="m.link_id">
            <td>{{ m.title || '—' }}</td>
            <td>{{ m.format || '—' }}</td>
            <td class="actions-cell">
              <button v-if="m.file_ref" class="btn-sm" @click="openMediaFile(m.id)">{{ $t('media.open') }}</button>
              <button class="btn-sm btn-delete" @click="unlinkMedia(m.link_id)">{{ $t('common.delete') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

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
          <label v-if="nameForm.name_type === 'birth'">
            {{ $t('persons.preferredName') }}
            <input v-model="nameForm.preferred_name" type="text" :placeholder="$t('persons.preferredNamePlaceholder')" />
          </label>
          <label>
            {{ $t('persons.nickname') }}
            <input v-model="nameForm.nickname" type="text" :placeholder="$t('persons.nicknamePlaceholder')" />
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
          <label v-if="editNameForm.name_type === 'birth'">
            {{ $t('persons.preferredName') }}
            <input v-model="editNameForm.preferred_name" type="text" :placeholder="$t('persons.preferredNamePlaceholder')" />
          </label>
          <label>
            {{ $t('persons.nickname') }}
            <input v-model="editNameForm.nickname" type="text" :placeholder="$t('persons.nicknamePlaceholder')" />
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
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import EventList from '../components/EventList.vue';
import AddRelatedPersonModal from '../components/AddRelatedPersonModal.vue';
import PersonName from '../components/PersonName.vue';
import GroupPicker from '../components/GroupPicker.vue';
import { NAME_TYPE_VALUES } from '../constants/eventTypes';
import { fullNameParts } from '../utils/nameUtils';
import { parseAsteriskNotation } from '../utils/nameUtils';
import { useFocusStore } from '../stores/focus';

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
  preferred_name: string | null;
  nickname: string | null;
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

interface CheckResult {
  code: string;
  severity: 'error' | 'warning' | 'notice';
  message: string;
  personIds: string[];
  eventIds?: string[];
  relationshipIds?: string[];
}

const { t } = useI18n();
const route = useRoute();
const personId = route.params.id as string;
const focusStore = useFocusStore();

const person = ref<PersonData | null>(null);
const names = ref<NameRow[]>([]);
const rels = ref<RelRow[]>([]);
const primaryName = ref('');
const notesText = ref('');
const showNameForm = ref(false);
const showEditNameForm = ref(false);
const editingNameId = ref<string | null>(null);
const showAddRelated = ref(false);
const addRelatedMode = ref<'parent' | 'spouse' | 'child'>('parent');
const editSex = ref('U');
const editLiving = ref(1);
const evidenceSourced = ref(0);
const evidenceTotal = ref(0);
const eventListRef = ref<InstanceType<typeof EventList> | null>(null);

const checkIssues = ref<CheckResult[]>([]);
const showIssueDetails = ref(false);
const hasBannerErrors = computed(() => checkIssues.value.some(r => r.severity === 'error'));

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
  preferred_name: '',
  nickname: '',
});

const editNameForm = reactive({
  given_name: '',
  surname: '',
  name_type: 'birth',
  name_prefix: '',
  name_suffix: '',
  name_qualifier: '',
  patronymic_base: '',
  preferred_name: '',
  nickname: '',
});

const identifiers = ref<IdentifierRow[]>([]);
const showAddIdentifier = ref(false);
const newIdentifier = reactive({ identifier_type: 'familysearch', identifier_value: '' });

// Research tasks
interface ResearchTask {
  id: string;
  task: string;
  notes?: string;
  result?: string;
  person_id?: string;
  priority: number;
  status: 'open' | 'in_progress' | 'done' | 'stopped';
}
const personTasks = ref<ResearchTask[]>([]);
const showAddTaskModal = ref(false);

interface PersonGroup { id: string; name: string; }
const personGroups = ref<PersonGroup[]>([]);
const showGroupPicker = ref(false);

interface PersonMediaItem {
  id: string;
  title: string;
  file_ref: string | null;
  format: string | null;
  link_id: string;
  link_type: number | null;
}
const personMedia = ref<PersonMediaItem[]>([]);
const taskForm = reactive({ task: '', priority: 1, notes: '' });
const STATUS_CYCLE: Array<'open' | 'in_progress' | 'done' | 'stopped'> = ['open', 'in_progress', 'done', 'stopped'];

async function loadPersonTasks() {
  if (!window.api?.researchTasks) return;
  personTasks.value = (await window.api.researchTasks.forPerson(personId)) as ResearchTask[];
}

async function loadPersonGroups() {
  personGroups.value = (await window.api.groups.forPerson(personId)) as PersonGroup[];
}

async function removeFromGroup(groupId: string) {
  await window.api.groups.removeMember(groupId, personId);
  await loadPersonGroups();
}

async function loadPersonMedia() {
  if (!window.api?.media) return;
  personMedia.value = (await window.api.media.forEntity('person', personId)) as PersonMediaItem[];
}

async function attachMediaToPerson() {
  const result = await window.api.media.attach({ entityType: 'person', entityId: personId }) as { canceled: boolean };
  if (!result.canceled) {
    await loadPersonMedia();
  }
}

async function openMediaFile(id: string) {
  await window.api.media.openFile(id);
}

async function unlinkMedia(linkId: string) {
  await window.api.media.removeLink(linkId);
  await loadPersonMedia();
}

async function cycleTaskStatus(task: ResearchTask) {
  const idx = STATUS_CYCLE.indexOf(task.status);
  const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
  await window.api.researchTasks.update(task.id, { status: next });
  task.status = next;
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

async function deletePersonTask(id: string) {
  if (!confirm('Ta bort denna uppgift?')) return;
  await window.api.researchTasks.delete(id);
  await loadPersonTasks();
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    showNameForm.value = false;
    showEditNameForm.value = false;
    showAddIdentifier.value = false;
  }
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

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
    await loadPersonTasks();
    await loadPersonGroups();
    await loadPersonMedia();
  } catch (err) {
    console.error('[PersonDetailView] load failed:', err);
  }
}

async function addName() {
  if (!window.api) return;
  try {
    const { given_name: parsedGiven, preferred_name: parsedPreferred } = parseAsteriskNotation(nameForm.given_name);
    const resolvedPreferred = nameForm.preferred_name || parsedPreferred || null;
    await window.api.persons.addName(personId, {
      given_name: parsedGiven,
      surname: nameForm.surname,
      name_type: nameForm.name_type,
      name_prefix: nameForm.name_prefix || null,
      name_suffix: nameForm.name_suffix || null,
      name_qualifier: nameForm.name_qualifier || null,
      patronymic_base: nameForm.patronymic_base || null,
      preferred_name: resolvedPreferred,
      nickname: nameForm.nickname || null,
    });
    showNameForm.value = false;
    nameForm.given_name = '';
    nameForm.surname = '';
    nameForm.name_type = 'married';
    nameForm.name_prefix = '';
    nameForm.name_suffix = '';
    nameForm.name_qualifier = '';
    nameForm.patronymic_base = '';
    nameForm.preferred_name = '';
    nameForm.nickname = '';
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
  editNameForm.preferred_name = name.preferred_name ?? '';
  editNameForm.nickname = name.nickname ?? '';
  showEditNameForm.value = true;
}

async function saveEditName() {
  if (!window.api || !editingNameId.value) return;
  try {
    const { given_name: parsedGiven, preferred_name: parsedPreferred } = parseAsteriskNotation(editNameForm.given_name);
    const resolvedPreferred = editNameForm.preferred_name || parsedPreferred || null;
    await window.api.persons.updateName(editingNameId.value, {
      given_name: parsedGiven,
      surname: editNameForm.surname,
      name_type: editNameForm.name_type,
      name_prefix: editNameForm.name_prefix || null,
      name_suffix: editNameForm.name_suffix || null,
      name_qualifier: editNameForm.name_qualifier || null,
      patronymic_base: editNameForm.patronymic_base || null,
      preferred_name: resolvedPreferred,
      nickname: editNameForm.nickname || null,
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

async function loadChecks(id: string) {
  if (!window.api) return;
  try {
    const all = (await window.api.checks.forPerson(id)) as CheckResult[];
    checkIssues.value = all.filter(r => r.severity === 'error' || r.severity === 'warning');
  } catch (err) {
    console.error('[PersonDetailView] loadChecks failed:', err);
  }
}

onMounted(async () => {
  await load();
  loadChecks(personId);
  let debounce: ReturnType<typeof setTimeout> | null = null;
  (window.api as unknown as { onDataChanged: (cb: () => void) => void }).onDataChanged(() => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => loadChecks(personId), 400);
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
  color: #2c3e50;
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
.type-badge {
  background: #f0fdf4;
  color: #166534;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}
.btn-edit {
  background: #eff6ff;
  color: #1d4ed8;
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
.name-prefix,
.name-suffix {
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
.issues-banner {
  padding: 12px 16px; border-radius: 6px; margin-bottom: 16px;
  border-left: 4px solid;
}
.banner-error { background: #fff5f5; border-color: #e53e3e; }
.banner-warning { background: #fffbeb; border-color: #d69e2e; }
.banner-toggle {
  margin-left: 12px; background: none; border: 1px solid currentColor;
  border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 12px;
}
.banner-details { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.banner-issue { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.banner-severity {
  font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 8px; text-transform: uppercase;
}
.badge-error { background: #feb2b2; color: #742a2a; }
.badge-warning { background: #fef3c7; color: #78350f; }
/* Research tasks */
.task-list { display: flex; flex-direction: column; gap: 6px; }
.task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: #f9fafb;
  font-size: var(--font-sm);
}
.task-text { flex: 1; }
.task-result { color: #6b7280; font-style: italic; font-size: 12px; }
.status-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.status-open { background: #dbeafe; color: #1d4ed8; }
.status-in_progress { background: #fef3c7; color: #92400e; }
.status-done { background: #d1fae5; color: #065f46; }
.status-stopped { background: #f3f4f6; color: #6b7280; }
.count-badge { font-weight: 400; color: #888; font-size: 13px; }
.group-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.group-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 20px;
  padding: 4px 8px 4px 12px;
  font-size: 13px;
}
.chip-name { color: #3730a3; text-decoration: none; font-weight: 500; }
.chip-name:hover { text-decoration: underline; }
.chip-remove {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.chip-remove:hover { color: #c0392b; }
.group-picker-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}
.group-picker-row > :first-child { flex: 1; }
.btn-cancel-inline {
  background: #e0e0e0;
  color: #333;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
</style>
