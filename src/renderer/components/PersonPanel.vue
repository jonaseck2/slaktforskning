<template>
  <div class="person-panel">
    <!-- Empty state -->
    <div v-if="!personId" class="panel-empty">
      {{ $t('panel.noPersonSelected') }}
    </div>

    <template v-else-if="person">
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-sex-bar" :style="{ background: sexColor }"></div>
        <div class="panel-header-content">
          <div class="panel-name">
            <PersonName
              :given-name="primaryName?.given_name ?? null"
              :surname="primaryName?.surname ?? null"
              :preferred-name="primaryName?.preferred_name ?? null"
              :nickname="primaryName?.nickname ?? null"
            />
          </div>
          <div class="panel-lifelines">
            <div v-if="person.birthLine" class="panel-lifeline">* {{ person.birthLine }}</div>
            <div v-if="person.deathLine" class="panel-lifeline">† {{ person.deathLine }}</div>
          </div>
          <div class="panel-add-relative-btns">
            <button class="btn-dark" @click="openAddRelative('parent')">+ Förälder</button>
            <button class="btn-dark" @click="openAddRelative('spouse')">+ Partner</button>
            <button class="btn-dark" @click="openAddRelative('child')">+ Barn</button>
          </div>
        </div>
      </div>

      <!-- Person section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('person')">
          <span class="panel-chevron">{{ sections.person ? '▾' : '▸' }}</span>
          Person
          <router-link :to="'/persons/' + personId" class="panel-section-header-action" @click.stop>Redigera</router-link>
        </button>
        <div v-if="sections.person" class="panel-section-body">
          <div class="compact-form">
            <div class="compact-field">
              <label class="compact-label">Kön</label>
              <select class="compact-control" :value="person.sex" @change="updateSex(($event.target as HTMLSelectElement).value as 'M' | 'F' | 'U')">
                <option value="M">{{ $t('sex.M') }}</option>
                <option value="F">{{ $t('sex.F') }}</option>
                <option value="U">{{ $t('sex.U') }}</option>
              </select>
            </div>
            <div class="compact-field">
              <label class="compact-label">Status</label>
              <select class="compact-control" :value="person.living ? 'true' : 'false'" @change="updateLiving(($event.target as HTMLSelectElement).value === 'true')">
                <option value="true">{{ $t('personDetail.statusLiving') }}</option>
                <option value="false">{{ $t('personDetail.statusDeceased') }}</option>
              </select>
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('panel.notes') }}</label>
              <textarea
                class="compact-control"
                rows="2"
                :value="person.notes ?? ''"
                @blur="updateNotes(($event.target as HTMLTextAreaElement).value)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Namn section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('names')">
          <span class="panel-chevron">{{ sections.names ? '▾' : '▸' }}</span>
          Namn
          <span class="panel-section-header-action" @click.stop="openNameForm(null)">+ Namn</span>
        </button>
        <div v-if="sections.names" class="panel-section-body">
          <div v-if="names.length === 0" class="panel-empty-section">—</div>
          <div
            v-for="name in names"
            :key="name.id"
            class="panel-name-row panel-name-row-clickable"
            @click="openNameForm(name)"
          >
            <div class="panel-name-row-main">
              <PersonName
                :given-name="name.given_name"
                :surname="name.surname"
                :preferred-name="name.preferred_name ?? null"
                :nickname="name.nickname ?? null"
              />
              <span class="panel-name-type">{{ $t('nameTypes.' + name.name_type) }}</span>
            </div>
            <span v-if="name.sort_order === 0" class="panel-name-star">★</span>
            <button
              v-else
              class="btn-sm btn-delete"
              @click.stop="deleteName(name.id!)"
            >✕</button>
          </div>
        </div>
      </div>

      <!-- Händelser section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('events')">
          <span class="panel-chevron">{{ sections.events ? '▾' : '▸' }}</span>
          {{ $t('panel.events') }}
          <span class="panel-section-header-action" @click.stop="eventListRef?.openAddForm()">+ {{ $t('events.event') }}</span>
        </button>
        <div v-if="sections.events" class="panel-section-body">
          <EventList ref="eventListRef" :person-id="personId" hide-header />
        </div>
      </div>

      <!-- Grupper section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('groups')">
          <span class="panel-chevron">{{ sections.groups ? '▾' : '▸' }}</span>
          Grupper
          <span class="panel-section-header-action" @click.stop="showGroupPicker = !showGroupPicker">+ Grupp</span>
        </button>
        <div v-if="sections.groups" class="panel-section-body">
          <div v-if="showGroupPicker && personId" class="panel-group-picker-wrap">
            <GroupPicker
              :person-id="personId"
              :exclude-ids="groups.map(g => g.id)"
              @added="onGroupAdded"
              @cancel="showGroupPicker = false"
            />
          </div>
          <div v-if="groups.length === 0" class="panel-empty-section">—</div>
          <div
            v-for="group in groups"
            :key="group.id"
            class="panel-group-row"
          >
            <router-link :to="'/groups/' + group.id" class="panel-group-link">{{ group.name }}</router-link>
            <button class="btn-sm btn-delete" @click="removeFromGroup(group.id)">✕</button>
          </div>
        </div>
      </div>

      <!-- Forskning section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('research')">
          <span class="panel-chevron">{{ sections.research ? '▾' : '▸' }}</span>
          {{ $t('researchTasks.nav') }}
          <span class="panel-section-header-action" @click.stop="openTaskForm(null)">+ {{ $t('researchTasks.nav') }}</span>
        </button>
        <div v-if="sections.research" class="panel-section-body">
          <div v-if="researchTasks.length === 0" class="panel-empty-section">—</div>
          <div
            v-for="task in researchTasks"
            :key="task.id"
            class="panel-task-row panel-task-row-clickable"
            @click="openTaskForm(task)"
          >
            <span :class="['panel-task-status', 'task-' + task.status]">{{ $t('researchTasks.statuses.' + task.status) }}</span>
            <span class="panel-task-text">{{ task.task }}</span>
            <button class="btn-sm btn-delete" @click.stop="deleteTask(task.id)">✕</button>
          </div>
        </div>
      </div>
    </template>

    <!-- Name form modal -->
    <div v-if="showNameForm" class="modal-overlay" @click.self="cancelNameForm">
      <div class="modal">
        <h3>{{ editingName ? $t('names.edit') : $t('names.add') }}</h3>
        <form @submit.prevent="saveName">
          <label>{{ $t('persons.givenName') }}<input v-model="nameFormData.given_name" type="text" autofocus /></label>
          <label>{{ $t('persons.surname') }}<input v-model="nameFormData.surname" type="text" /></label>
          <label>{{ $t('names.nameType') }}
            <select v-model="nameFormData.name_type">
              <option v-for="nt in NAME_TYPE_VALUES" :key="nt" :value="nt">{{ $t('nameTypes.' + nt) }}</option>
            </select>
          </label>
          <label>{{ $t('names.preferredName') }}<input v-model="nameFormData.preferred_name" type="text" /></label>
          <label>{{ $t('names.nickname') }}<input v-model="nameFormData.nickname" type="text" /></label>
          <label>{{ $t('names.prefix') }}<input v-model="nameFormData.name_prefix" type="text" /></label>
          <label>{{ $t('names.suffix') }}<input v-model="nameFormData.name_suffix" type="text" /></label>
          <label>{{ $t('names.patronymicBase') }}<input v-model="nameFormData.patronymic_base" type="text" /></label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="cancelNameForm">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('common.save') }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Research task form modal -->
    <div v-if="showTaskForm" class="modal-overlay" @click.self="showTaskForm = false">
      <div class="modal">
        <h3>{{ editingTask ? $t('common.edit') + ' ' + $t('researchTasks.nav') : '+ ' + $t('researchTasks.nav') }}</h3>
        <form @submit.prevent="saveTask">
          <label>{{ $t('researchTasks.task') }} *
            <textarea v-model="taskFormData.task" rows="3" required autofocus />
          </label>
          <label>{{ $t('researchTasks.status') }}
            <select v-model="taskFormData.status">
              <option v-for="s in TASK_STATUS_VALUES" :key="s" :value="s">{{ $t('researchTasks.statuses.' + s) }}</option>
            </select>
          </label>
          <label>{{ $t('researchTasks.notes') }}
            <textarea v-model="taskFormData.notes" rows="2" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showTaskForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('common.save') }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Add relative modal -->
    <AddRelatedPersonModal
      v-if="showAddRelative && personId"
      :person-id="personId"
      :mode="addRelativeMode"
      @close="showAddRelative = false"
      @saved="onRelativeSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, reactive } from 'vue';
import EventList from './EventList.vue';
import type { ComponentPublicInstance } from 'vue';
import PersonName from './PersonName.vue';
import AddRelatedPersonModal from './AddRelatedPersonModal.vue';
import GroupPicker from './GroupPicker.vue';
import { NAME_TYPE_VALUES } from '../constants/eventTypes';

const TASK_STATUS_VALUES = ['open', 'in_progress', 'done', 'stopped'] as const;

const props = defineProps<{ personId: string | null }>();
const emit = defineEmits<{
  'relative-added': [];
}>();

// ── Local state ──────────────────────────────────────────────────────────────

interface PersonData {
  id: string;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  notes: string | null;
  birthLine: string | null;
  deathLine: string | null;
}
interface NameData { id?: string; given_name: string; surname: string; preferred_name: string | null; nickname: string | null; sort_order: number; name_type?: string; name_prefix?: string | null; name_suffix?: string | null; name_qualifier?: string | null; patronymic_base?: string | null; }
interface GroupData { id: string; name: string; notes: string | null; }
interface TaskData { id: string; task: string; status: string; notes: string | null; result: string | null; priority: number; }

const person = ref<PersonData | null>(null);
const primaryName = ref<NameData | null>(null);
const names = ref<NameData[]>([]);
const groups = ref<GroupData[]>([]);
const researchTasks = ref<TaskData[]>([]);

// Add relative modal state
const showAddRelative = ref(false);
const addRelativeMode = ref<'parent' | 'spouse' | 'child'>('parent');
// EventList ref for triggering add form
const eventListRef = ref<(ComponentPublicInstance & { openAddForm: () => void }) | null>(null);

// Group picker state
const showGroupPicker = ref(false);

// Research task form state
const showTaskForm = ref(false);
const editingTask = ref<TaskData | null>(null);
const taskFormData = reactive({ task: '', status: 'open' as string, notes: '' });

function openAddRelative(mode: 'parent' | 'spouse' | 'child') {
  addRelativeMode.value = mode;
  showAddRelative.value = true;
}

async function onRelativeSaved() {
  showAddRelative.value = false;
  if (props.personId) {
    await loadPerson(props.personId);
  }
  emit('relative-added');
}

// Section open/closed — persisted per key
function loadSection(key: string, def: boolean): boolean {
  const v = localStorage.getItem(`viz-panel-section-${key}`);
  return v === null ? def : v === 'true';
}
const sections = reactive({
  person: loadSection('person', false),
  names: loadSection('names', false),
  events: loadSection('events', true),
  groups: loadSection('groups', false),
  research: loadSection('research', false),
});

function toggleSection(key: keyof typeof sections) {
  sections[key] = !sections[key];
  localStorage.setItem(`viz-panel-section-${key}`, String(sections[key]));
}

// ── Person field updates ──────────────────────────────────────────────────────

async function updateSex(value: 'M' | 'F' | 'U') {
  if (!props.personId || !person.value) return;
  await window.api.persons.update(props.personId, { sex: value });
  person.value.sex = value;
}

async function updateLiving(value: boolean) {
  if (!props.personId || !person.value) return;
  await window.api.persons.update(props.personId, { living: value });
  person.value.living = value;
}

async function updateNotes(value: string) {
  if (!props.personId || !person.value) return;
  const notes = value.trim() || null;
  await window.api.persons.update(props.personId, { notes });
  person.value.notes = notes;
}

// ── Name form ─────────────────────────────────────────────────────────────────

const showNameForm = ref(false);
const editingName = ref<NameData | null>(null);
const nameFormData = reactive({ given_name: '', surname: '', name_type: 'birth' as string, name_prefix: '', name_suffix: '', name_qualifier: '', patronymic_base: '', preferred_name: '', nickname: '' });

function openNameForm(name: NameData | null) {
  editingName.value = name;
  if (name) {
    nameFormData.given_name = name.given_name ?? '';
    nameFormData.surname = name.surname ?? '';
    nameFormData.name_type = name.name_type ?? 'birth';
    nameFormData.name_prefix = name.name_prefix ?? '';
    nameFormData.name_suffix = name.name_suffix ?? '';
    nameFormData.name_qualifier = name.name_qualifier ?? '';
    nameFormData.patronymic_base = name.patronymic_base ?? '';
    nameFormData.preferred_name = name.preferred_name ?? '';
    nameFormData.nickname = name.nickname ?? '';
  } else {
    nameFormData.given_name = '';
    nameFormData.surname = '';
    nameFormData.name_type = 'birth';
    nameFormData.name_prefix = '';
    nameFormData.name_suffix = '';
    nameFormData.name_qualifier = '';
    nameFormData.patronymic_base = '';
    nameFormData.preferred_name = '';
    nameFormData.nickname = '';
  }
  showNameForm.value = true;
}

function cancelNameForm() {
  showNameForm.value = false;
  editingName.value = null;
}

async function saveName() {
  if (!props.personId) return;
  const payload = {
    given_name: nameFormData.given_name || null,
    surname: nameFormData.surname || null,
    name_type: nameFormData.name_type,
    name_prefix: nameFormData.name_prefix || null,
    name_suffix: nameFormData.name_suffix || null,
    name_qualifier: nameFormData.name_qualifier || null,
    patronymic_base: nameFormData.patronymic_base || null,
    preferred_name: nameFormData.preferred_name || null,
    nickname: nameFormData.nickname || null,
  };
  if (editingName.value?.id) {
    await window.api.persons.updateName(editingName.value.id, payload);
  } else {
    await window.api.persons.addName(props.personId, payload);
  }
  showNameForm.value = false;
  editingName.value = null;
  await reloadNames(props.personId);
}

async function deleteName(nameId: string) {
  if (!props.personId) return;
  await window.api.persons.deleteName(nameId);
  await reloadNames(props.personId);
}

async function reloadNames(id: string) {
  const fetched = (await window.api.persons.getNames(id)) as NameData[];
  const sorted = [...fetched].sort((a, b) => a.sort_order - b.sort_order);
  names.value = sorted;
  primaryName.value = sorted[0] ?? null;
}

// ── Research tasks ────────────────────────────────────────────────────────────

function openTaskForm(task: TaskData | null) {
  editingTask.value = task;
  taskFormData.task = task?.task ?? '';
  taskFormData.status = task?.status ?? 'open';
  taskFormData.notes = task?.notes ?? '';
  showTaskForm.value = true;
}

async function saveTask() {
  if (!props.personId) return;
  if (editingTask.value) {
    await window.api.researchTasks.update(editingTask.value.id, {
      task: taskFormData.task,
      status: taskFormData.status,
      notes: taskFormData.notes || null,
    });
  } else {
    await window.api.researchTasks.create({
      task: taskFormData.task,
      status: taskFormData.status,
      notes: taskFormData.notes || null,
      person_id: props.personId,
    });
  }
  showTaskForm.value = false;
  editingTask.value = null;
  await loadResearchTasks(props.personId);
}

async function deleteTask(id: string) {
  if (!props.personId) return;
  await window.api.researchTasks.delete(id);
  await loadResearchTasks(props.personId);
}

async function loadResearchTasks(id: string) {
  const raw = (await window.api.researchTasks.forPerson(id)) as TaskData[];
  researchTasks.value = raw;
}

// ── Derived ──────────────────────────────────────────────────────────────────

const SEX_COLORS: Record<string, string> = { M: '#7eb8f7', F: '#f7a5c0', U: '#ccc' };
const sexColor = computed(() => SEX_COLORS[person.value?.sex ?? 'U'] ?? '#ccc');

// ── Date formatting ───────────────────────────────────────────────────────────

async function buildDateLine(event: { date_original: string | null; date_value: string | null; place_id: string | null; place_address: string | null } | undefined): Promise<string | null> {
  if (!event) return null;

  const datePart = (event.date_original && event.date_original.trim())
    ? event.date_original.trim()
    : (event.date_value ?? null);

  if (!datePart) return null;

  let placePart: string | null = null;
  if (event.place_id) {
    try {
      const place = (await window.api.places.get(event.place_id)) as { name?: string; city?: string } | null;
      if (place) placePart = place.city ?? place.name ?? null;
    } catch {
      // ignore place fetch errors
    }
  } else if (event.place_address && event.place_address.trim()) {
    placePart = event.place_address.trim();
  }

  return placePart ? `${datePart}, ${placePart}` : datePart;
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadPerson(id: string) {
  const raw = (await window.api.persons.get(id)) as { id: string; sex: string; living: boolean; notes: string | null } | null;
  if (props.personId !== id) return;
  if (!raw) { person.value = null; return; }

  const fetched = (await window.api.persons.getNames(id)) as NameData[];
  if (props.personId !== id) return;
  const sorted = [...fetched].sort((a, b) => a.sort_order - b.sort_order);
  primaryName.value = sorted[0] ?? null;
  names.value = sorted;

  // Get birth/death events with full date + place info
  const events = (await window.api.events.forPerson(id)) as Array<{
    event_type: string;
    date_value: string | null;
    date_original: string | null;
    place_id: string | null;
    place_address: string | null;
  }>;
  if (props.personId !== id) return;

  const birth = events.find(e => e.event_type === 'birth');
  const death = events.find(e => e.event_type === 'death');

  const [birthLine, deathLine] = await Promise.all([
    buildDateLine(birth),
    buildDateLine(death),
  ]);
  if (props.personId !== id) return;

  person.value = {
    id: raw.id,
    sex: raw.sex as 'M' | 'F' | 'U',
    living: raw.living,
    notes: raw.notes,
    birthLine,
    deathLine,
  };

  await loadGroups(id);
  await loadResearchTasks(id);
}

async function loadGroups(id: string) {
  const raw = (await window.api.groups.forPerson(id)) as GroupData[];
  groups.value = raw;
}

async function removeFromGroup(groupId: string) {
  if (!props.personId) return;
  await window.api.groups.removeMember(groupId, props.personId);
  await loadGroups(props.personId);
}

async function onGroupAdded() {
  showGroupPicker.value = false;
  if (props.personId) await loadGroups(props.personId);
}

watch(() => props.personId, async (id) => {
  person.value = null;
  names.value = [];
  groups.value = [];
  researchTasks.value = [];
  if (id) await loadPerson(id);
}, { immediate: true });
</script>

<style scoped>
.person-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  background: white;
  font-size: 13px;
}

.panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #aaa;
  font-size: 13px;
  padding: 24px;
  text-align: center;
}

/* Header */
.panel-header {
  display: flex;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.panel-sex-bar {
  width: 4px;
  flex-shrink: 0;
}
.panel-header-content {
  padding: 10px 14px 10px 10px;
  flex: 1;
  min-width: 0;
}
.panel-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a2a3a;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.panel-lifelines {
  margin-bottom: 6px;
}
.panel-lifeline {
  font-size: 12px;
  color: #555;
  line-height: 1.5;
}
.panel-add-relative-btns {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.btn-dark {
  background: #2c3e50;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
}
.btn-dark:hover { opacity: 0.9; }

/* Sections */
.panel-section {
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}
.panel-section-header {
  width: 100%;
  text-align: left;
  background: #fafafa;
  border: none;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 6px;
}
.panel-section-header:hover { background: #f0f0f0; }
.panel-chevron { font-size: 10px; color: #999; }
.panel-section-header-action {
  margin-left: auto;
  background: #2c3e50;
  color: white;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  text-decoration: none;
  display: inline-block;
}
.panel-section-header-action:hover { opacity: 0.85; }
.panel-section-body { padding: 4px 0 8px; }
.panel-empty-section { padding: 4px 14px; color: #bbb; font-size: 12px; }

/* Compact form */
.compact-form {
  padding: 4px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.compact-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.compact-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: #888;
  letter-spacing: 0.4px;
}
.compact-control {
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  color: #222;
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  resize: vertical;
}
.compact-control:focus {
  outline: none;
  border-color: #2980b9;
}

/* Name rows */
.panel-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 14px;
  gap: 6px;
}
.panel-name-row-clickable {
  cursor: pointer;
}
.panel-name-row-clickable:hover {
  background: #f5f7fa;
}
.panel-name-row-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.panel-name-type {
  font-size: 11px;
  color: #aaa;
}
.panel-name-star {
  font-size: 12px;
  color: #f0a500;
  flex-shrink: 0;
}
.btn-cancel {
  background: #f0f0f0;
  color: #555;
  border: none;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
}
.btn-cancel:hover { background: #e0e0e0; }
.btn-sm {
  padding: 3px 8px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}
.btn-delete {
  background: #fee2e2;
  color: #b91c1c;
}
.btn-delete:hover { background: #fecaca; }

/* Groups */
.panel-group-picker-wrap {
  padding: 6px 14px;
  border-bottom: 1px solid #f0f0f0;
}
.panel-group-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 14px;
}
.panel-group-link {
  font-size: 12px;
  color: #2563eb;
  text-decoration: none;
}
.panel-group-link:hover { text-decoration: underline; }

/* Research tasks */
.panel-task-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
}
.panel-task-row-clickable { cursor: pointer; }
.panel-task-row-clickable:hover { background: #f5f7fa; }
.panel-task-status {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  white-space: nowrap;
  flex-shrink: 0;
}
.task-open { background: #f1f5f9; color: #64748b; }
.task-in_progress { background: #dbeafe; color: #1d4ed8; }
.task-done { background: #dcfce7; color: #15803d; }
.task-stopped { background: #fee2e2; color: #b91c1c; }
.panel-task-text {
  font-size: 12px;
  color: #333;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
