<template>
  <div class="person-panel">
    <!-- Empty state -->
    <div v-if="!personId" class="panel-empty">
      {{ $t('panel.noPersonSelected') }}
    </div>

    <template v-else-if="person">
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-sex-bar" :style="{ background: sexColor }">
          <span class="sex-indicator-label">{{ person.sex }}</span>
        </div>
        <div class="panel-header-content">
          <div class="panel-name-row">
            <div class="panel-name">
              <PersonName
                :given-name="primaryName?.given_name ?? null"
                :surname="primaryName?.surname ?? null"
                :preferred-name="primaryName?.preferred_name ?? null"
                :nickname="primaryName?.nickname ?? null"
              />
            </div>
            <button v-if="showTreeBtn" class="btn-tree-inline" @click="emit('show-in-tree')">{{ $t('panel.focus') }}</button>
          </div>
          <div class="panel-lifelines">
            <div v-if="person.birthLine" class="panel-lifeline">* {{ person.birthLine }}</div>
            <div v-if="person.deathLine" class="panel-lifeline">† {{ person.deathLine }}</div>
          </div>
          <div class="panel-add-relative-btns">
            <button class="btn-dark" @click="openAddRelative('father')"><span aria-hidden="true">+ </span>{{ $t('personDetail.addFather') }}</button>
            <button class="btn-dark" @click="openAddRelative('mother')"><span aria-hidden="true">+ </span>{{ $t('personDetail.addMother') }}</button>
            <button class="btn-dark" @click="openAddRelative('spouse')"><span aria-hidden="true">+ </span>{{ $t('personDetail.addSpouse') }}</button>
            <button class="btn-dark" @click="openAddRelative('child')"><span aria-hidden="true">+ </span>{{ $t('personDetail.addChild') }}</button>
          </div>
        </div>
      </div>

      <!-- Person section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('person')">
          <span class="panel-chevron">{{ sections.person ? '▾' : '▸' }}</span>
          Person
          <router-link :to="'/persons/' + personId" class="panel-section-header-action" @click.stop>{{ $t('common.edit') }}</router-link>
        </button>
        <div v-if="sections.person" class="panel-section-body">
          <div class="compact-form">
            <div class="compact-field">
              <label class="compact-label">{{ $t('persons.sex') }}</label>
              <select class="compact-control" :value="person.sex" @change="updateSex(($event.target as HTMLSelectElement).value as 'M' | 'F' | 'U')">
                <option value="M">{{ $t('sex.M') }}</option>
                <option value="F">{{ $t('sex.F') }}</option>
                <option value="U">{{ $t('sex.U') }}</option>
              </select>
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('personPanel.status') }}</label>
              <select class="compact-control" :value="person.living ? 'true' : 'false'" @change="updateLiving(($event.target as HTMLSelectElement).value === 'true')">
                <option value="true">{{ $t('personDetail.statusLiving') }}</option>
                <option value="false">{{ $t('personDetail.statusDeceased') }}</option>
              </select>
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('panel.notes') }}</label>
              <PersonNotesSection :person-id="personId!" :rows="2" class="compact-control" />
            </div>
          </div>
        </div>
      </div>

      <!-- Namen section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('names')">
          <span class="panel-chevron">{{ sections.names ? '▾' : '▸' }}</span>
          {{ $t('personDetail.names') }}
          <span class="panel-section-header-action" @click.stop="openNameForm(null)"><span aria-hidden="true">+ </span>{{ $t('personDetail.addName') }}</span>
        </button>
        <div v-if="sections.names" class="panel-section-body">
          <div v-if="names.length === 0" class="panel-empty-section">—</div>
          <PersonNamesTable v-else :names="names" @edit="openNameForm" @delete="deleteName" />
        </div>
      </div>

      <!-- Händelser section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('events')">
          <span class="panel-chevron">{{ sections.events ? '▾' : '▸' }}</span>
          {{ $t('panel.events') }}
          <span class="panel-section-header-action" @click.stop="eventListRef?.openAddForm()"><span aria-hidden="true">+ </span>{{ $t('events.event') }}</span>
        </button>
        <div v-if="sections.events" class="panel-section-body">
          <EventList ref="eventListRef" :person-id="personId" hide-header />
        </div>
      </div>

      <!-- Timeline section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('timeline')">
          <span class="panel-chevron">{{ sections.timeline ? '▾' : '▸' }}</span>
          {{ $t('personTimeline.title') }}
        </button>
        <div v-if="sections.timeline" class="panel-section-body">
          <PersonTimeline :person-id="personId!" />
        </div>
      </div>

      <!-- Identifiers section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('identifiers')">
          <span class="panel-chevron">{{ sections.identifiers ? '▾' : '▸' }}</span>
          {{ $t('identifiers.title') }}
          <span class="panel-section-header-action" @click.stop="identifiersSectionRef?.openAddForm()"><span aria-hidden="true">+ </span>{{ $t('identifiers.add') }}</span>
        </button>
        <div v-if="sections.identifiers" class="panel-section-body">
          <PersonIdentifiersSection ref="identifiersSectionRef" :person-id="personId!" />
        </div>
      </div>

      <!-- Relationer section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('relationships')">
          <span class="panel-chevron">{{ sections.relationships ? '▾' : '▸' }}</span>
          {{ $t('personDetail.relationships') }}
        </button>
        <div v-if="sections.relationships" class="panel-section-body">
          <PersonRelationshipsSection ref="relSectionRef" :person-id="personId!" />
        </div>
      </div>

      <!-- Grupper section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('groups')">
          <span class="panel-chevron">{{ sections.groups ? '▾' : '▸' }}</span>
          {{ $t('groups.title') }}
          <span class="panel-section-header-action" @click.stop="showGroupPicker = !showGroupPicker"><span aria-hidden="true">+ </span>{{ $t('groups.addGroupShort') }}</span>
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
          <GroupsTable v-else :groups="groups" @remove="removeFromGroup" />
        </div>
      </div>

      <!-- Media section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('media')">
          <span class="panel-chevron">{{ sections.media ? '▾' : '▸' }}</span>
          {{ $t('media.title') }}
          <span class="panel-section-header-action" @click.stop="mediaSectionRef?.attach()"><span aria-hidden="true">+ </span>{{ $t('media.attachShort') }}</span>
        </button>
        <div v-if="sections.media" class="panel-section-body">
          <PersonMediaSection ref="mediaSectionRef" :person-id="personId!" />
        </div>
      </div>

      <!-- Media Timeline section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('mediaTimeline')">
          <span class="panel-chevron">{{ sections.mediaTimeline ? '▾' : '▸' }}</span>
          {{ $t('mediaTimeline.title') }}
        </button>
        <div v-if="sections.mediaTimeline" class="panel-section-body">
          <MediaTimeline entity-type="person" :entity-id="personId!" />
        </div>
      </div>

      <!-- Forskning section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('research')">
          <span class="panel-chevron">{{ sections.research ? '▾' : '▸' }}</span>
          {{ $t('researchTasks.nav') }}
          <span class="panel-section-header-action" @click.stop="openTaskForm()"><span aria-hidden="true">+ </span>{{ $t('researchTasks.nav') }}</span>
        </button>
        <div v-if="sections.research" class="panel-section-body">
          <div v-if="researchTasks.length === 0" class="panel-empty-section">—</div>
          <ResearchTasksTable v-else :tasks="researchTasks" @updated="loadResearchTasks(personId!)" />
        </div>
      </div>

      <!-- Quality section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('quality')">
          <span class="panel-chevron">{{ sections.quality ? '▾' : '▸' }}</span>
          {{ $t('quality.nav') }}
        </button>
        <div v-if="sections.quality" class="panel-section-body">
          <PersonChecksSection ref="checksSectionRef" :person-id="personId!" />
        </div>
      </div>
    </template>

    <!-- Name form modal -->
    <PersonNameFormModal
      v-if="showNameForm && personId"
      :person-id="personId"
      :name="editingName"
      :default-surname="primaryName?.surname ?? ''"
      @close="cancelNameForm"
      @saved="reloadNames(personId!)"
    />

    <!-- Add research task modal -->
    <AddResearchTaskModal
      v-if="showTaskForm && personId"
      :person-id="personId"
      @close="showTaskForm = false"
      @saved="onTaskSaved"
    />

    <!-- Add relative modal -->
    <AddRelatedPersonModal
      v-if="showAddRelative && personId"
      :person-id="personId"
      :person-sex="person?.sex"
      :person-surname="primaryName?.surname ?? undefined"
      :mode="addRelativeMode"
      @close="showAddRelative = false"
      @saved="onRelativeSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, toRef, onMounted } from 'vue';
import AddResearchTaskModal from './AddResearchTaskModal.vue';
import EventList from './EventList.vue';
import type { ComponentPublicInstance } from 'vue';
import PersonName from './PersonName.vue';
import PersonNamesTable from './PersonNamesTable.vue';
import PersonNameFormModal from './PersonNameFormModal.vue';
import AddRelatedPersonModal from './AddRelatedPersonModal.vue';
import GroupPicker from './GroupPicker.vue';
import GroupsTable from './GroupsTable.vue';
import ResearchTasksTable from './ResearchTasksTable.vue';
import PersonIdentifiersSection from './PersonIdentifiersSection.vue';
import PersonMediaSection from './PersonMediaSection.vue';
import MediaTimeline from './MediaTimeline.vue';
import PersonChecksSection from './PersonChecksSection.vue';
import PersonRelationshipsSection from './PersonRelationshipsSection.vue';
import PersonNotesSection from './PersonNotesSection.vue';
import PersonTimeline from './PersonTimeline.vue';
import { usePersonPanelData, type NameData } from '../composables/usePersonPanelData';
import { useSectionState } from '../composables/useSectionState';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{ personId: string | null; showTreeBtn?: boolean }>();
const emit = defineEmits<{
  'relative-added': [];
  'show-in-tree': [];
  'person-changed': [];
}>();

// ── Data (composable) ───────────────────────────────────────────────────────

const personIdRef = toRef(props, 'personId');
const {
  person,
  primaryName,
  names,
  groups,
  researchTasks,
  loadPerson,
  loadNames,
  loadGroups,
  loadResearchTasks,
} = usePersonPanelData(personIdRef);

// ── Section state (composable) ──────────────────────────────────────────────

const { sections, toggleSection } = useSectionState();

// ── Template refs ───────────────────────────────────────────────────────────

const eventListRef = ref<(ComponentPublicInstance & { openAddForm: () => void }) | null>(null);
const identifiersSectionRef = ref<InstanceType<typeof PersonIdentifiersSection> | null>(null);
const mediaSectionRef = ref<InstanceType<typeof PersonMediaSection> | null>(null);
const checksSectionRef = ref<InstanceType<typeof PersonChecksSection> | null>(null);
const relSectionRef = ref<InstanceType<typeof PersonRelationshipsSection> | null>(null);

// ── Add relative modal ──────────────────────────────────────────────────────

const showAddRelative = ref(false);
const addRelativeMode = ref<'father' | 'mother' | 'spouse' | 'child'>('father');

function openAddRelative(mode: 'father' | 'mother' | 'spouse' | 'child') {
  addRelativeMode.value = mode;
  showAddRelative.value = true;
}

async function onRelativeSaved() {
  showAddRelative.value = false;
  relSectionRef.value?.reload();
  if (props.personId) {
    await loadPerson(props.personId);
  }
  emit('relative-added');
}

// ── Person field updates ────────────────────────────────────────────────────

async function updateSex(value: 'M' | 'F' | 'U') {
  if (!props.personId || !person.value) return;
  await window.api.persons.update(props.personId, { sex: value });
  person.value.sex = value;
  emit('person-changed');
}

async function updateLiving(value: boolean) {
  if (!props.personId || !person.value) return;
  await window.api.persons.update(props.personId, { living: value });
  person.value.living = value;
  emit('person-changed');
}

// ── Name form ───────────────────────────────────────────────────────────────

const showNameForm = ref(false);
const editingName = ref<NameData | null>(null);

function openNameForm(name: NameData | null) {
  editingName.value = name;
  showNameForm.value = true;
}

function cancelNameForm() {
  showNameForm.value = false;
  editingName.value = null;
}

async function deleteName(nameId: string) {
  if (!props.personId) return;
  await window.api.persons.deleteName(nameId);
  await loadNames(props.personId);
}

async function reloadNames(id: string) {
  await loadNames(id);
}

// ── Group actions ───────────────────────────────────────────────────────────

const showGroupPicker = ref(false);

async function removeFromGroup(groupId: string) {
  if (!props.personId) return;
  await window.api.groups.removeMember(groupId, props.personId);
  await loadGroups(props.personId);
}

async function onGroupAdded() {
  showGroupPicker.value = false;
  if (props.personId) await loadGroups(props.personId);
}

// ── Research tasks ──────────────────────────────────────────────────────────

const showTaskForm = ref(false);

function openTaskForm() {
  showTaskForm.value = true;
}

async function onTaskSaved() {
  if (props.personId) await loadResearchTasks(props.personId);
}

// ── Derived ─────────────────────────────────────────────────────────────────

const SEX_COLORS: Record<string, string> = { M: '#7eb8f7', F: '#f7a5c0', U: '#ccc' };
const sexColor = computed(() => SEX_COLORS[person.value?.sex ?? 'U'] ?? '#ccc');

// ── Data change listener ────────────────────────────────────────────────────

onMounted(() => {
  let debounce: ReturnType<typeof setTimeout> | null = null;
  (window.api as unknown as { onDataChanged: (cb: () => void) => void }).onDataChanged(() => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => checksSectionRef.value?.reload(), 400);
  });
});
</script>

<style scoped>
.person-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  background: var(--color-bg);
  font-size: var(--font-sm);
}

.panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-faint);
  font-size: var(--font-sm);
  padding: 24px;
  text-align: center;
}

/* Header */
.panel-header {
  display: flex;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
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
.panel-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.panel-name {
  font-size: var(--font-base);
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.btn-tree-inline {
  margin-left: auto;
  flex-shrink: 0;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: var(--font-xs);
  font-weight: 600;
  cursor: pointer;
}
.btn-tree-inline:hover { opacity: 0.85; }
.panel-lifelines {
  margin-bottom: 6px;
}
.panel-lifeline {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  line-height: 1.5;
}
.panel-add-relative-btns {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.btn-dark {
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: var(--font-xs);
  cursor: pointer;
}
.btn-dark:hover { opacity: 0.9; }

/* Sections */
.panel-section {
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.panel-section-header {
  width: 100%;
  text-align: left;
  background: var(--color-bg-subtle);
  border: none;
  padding: 8px 14px;
  cursor: pointer;
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 6px;
}
.panel-section-header:hover { background: var(--color-bg-muted); }
.panel-chevron { font-size: var(--font-xs); color: var(--color-text-faint); }
.panel-section-header-action {
  margin-left: auto;
  background: var(--color-primary);
  color: white;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: var(--font-xs);
  font-weight: 600;
  text-decoration: none;
  display: inline-block;
}
.panel-section-header-action:hover { opacity: 0.85; }
.panel-section-body { padding: 4px 0 8px; }
.panel-empty-section { padding: 4px 14px; color: var(--color-text-faint); font-size: var(--font-xs); }

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
  font-size: var(--font-xs);
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-subtle);
  letter-spacing: 0.4px;
}
.compact-control {
  font-size: var(--font-xs);
  padding: 4px 6px;
  border: 1px solid var(--color-border-input);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  resize: vertical;
}
.compact-control:focus {
  outline: none;
  border-color: #2980b9;
}

.btn-cancel {
  background: var(--color-bg-muted);
  color: var(--color-text-muted);
  border: none;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: var(--font-xs);
  cursor: pointer;
}
.btn-cancel:hover { background: var(--color-border); }
.btn-sm {
  padding: 3px 8px;
  font-size: var(--font-xs);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}
.btn-delete {
  background: var(--color-danger-bg);
  color: var(--color-danger-text);
}
.btn-delete:hover { background: var(--color-danger-hover); }

/* Groups */
.panel-group-picker-wrap {
  padding: 6px 14px;
  border-bottom: 1px solid var(--color-border);
}

</style>
