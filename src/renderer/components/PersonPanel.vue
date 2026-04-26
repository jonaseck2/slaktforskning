<template>
  <div class="person-panel">
    <!-- Empty state -->
    <div v-if="!personId" class="panel-empty">
      {{ $t('panel.noPersonSelected') }}
    </div>

    <template v-else-if="person">
      <!-- Header -->
      <div class="panel-header">
        <AppAvatar
          :person-id="personId"
          :given-name="primaryName?.given_name ?? ''"
          :surname="primaryName?.surname ?? ''"
          :sex="person.sex"
          size="lg"
        />
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
          </div>
          <div class="panel-lifelines">
            <div v-if="person.birthLine" class="panel-lifeline">* {{ person.birthLine }}</div>
            <div v-if="person.deathLine" class="panel-lifeline">† {{ person.deathLine }}</div>
          </div>
          <div v-if="!props.readonly" class="panel-add-relative-btns">
            <AppButton variant="soft" size="sm" @click="openAddRelative('father')">+ {{ $t('personDetail.addFather') }}</AppButton>
            <AppButton variant="soft" size="sm" @click="openAddRelative('mother')">+ {{ $t('personDetail.addMother') }}</AppButton>
            <AppButton variant="soft" size="sm" @click="openAddRelative('spouse')">+ {{ $t('personDetail.addSpouse') }}</AppButton>
            <AppButton variant="soft" size="sm" @click="openAddRelative('child')">+ {{ $t('personDetail.addChild') }}</AppButton>
          </div>
        </div>
        <button class="panel-close-btn" :aria-label="$t('common.close')" @click="emit('close')">×</button>
      </div>

      <!-- Person section -->
      <div class="panel-section">
        <SectionHeader :title="$t('panel.personSection')" :collapsed="!sections.person" @toggle="toggleSection('person')" />
        <div v-if="sections.person" class="panel-section-body">
          <PersonDetailsSection :person-id="personId!" :sex="person.sex" :living="person.living" :readonly="props.readonly" @updated="onDetailUpdated" />
        </div>
      </div>

      <!-- Namen section -->
      <div class="panel-section">
        <SectionHeader :title="$t('personDetail.names')" :count="names.length" :collapsed="!sections.names" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('personDetail.addName') }" @toggle="toggleSection('names')" @action="openNameForm(null)" />
        <div v-if="sections.names" class="panel-section-body">
          <SectionEmpty v-if="names.length === 0" :message="$t('empty.names')" />
          <PersonNamesTable v-else :names="names" :readonly="props.readonly" @edit="openNameForm" @delete="deleteName" />
        </div>
      </div>

      <!-- Händelser section -->
      <div class="panel-section">
        <SectionHeader :title="$t('panel.events')" :count="eventCount" :collapsed="!sections.events" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('events.event') }" @toggle="toggleSection('events')" @action="triggerAddEvent" />
        <div v-if="sections.events" class="panel-section-body">
          <EventList ref="eventListRef" :person-id="personId" :readonly="props.readonly" hide-header />
        </div>
      </div>

      <!-- Timeline section -->
      <div class="panel-section">
        <SectionHeader :title="$t('personTimeline.title')" :count="eventCount" :collapsed="!sections.timeline" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('events.event') }" @toggle="toggleSection('timeline')" @action="triggerAddEvent" />
        <div v-if="sections.timeline" class="panel-section-body">
          <PersonTimeline :person-id="personId!" />
        </div>
      </div>

      <!-- Life Map section -->
      <div class="panel-section">
        <SectionHeader :title="$t('map.personMap')" :count="mapPointCount" :collapsed="!sections.map" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('events.event') }" @toggle="toggleSection('map')" @action="triggerAddEvent" />
        <div v-if="sections.map" class="panel-section-body">
          <PersonMap :person-id="personId!" />
        </div>
      </div>

      <!-- Identifiers section -->
      <div class="panel-section">
        <SectionHeader :title="$t('identifiers.title')" :count="identifierCount" :collapsed="!sections.identifiers" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('identifiers.add') }" @toggle="toggleSection('identifiers')" @action="identifiersSectionRef?.openAddForm()" />
        <div v-if="sections.identifiers" class="panel-section-body">
          <PersonIdentifiersSection ref="identifiersSectionRef" :person-id="personId!" :readonly="props.readonly" />
        </div>
      </div>

      <!-- Relationer section -->
      <div class="panel-section">
        <SectionHeader :title="$t('personDetail.relationships')" :count="relationshipCount" :collapsed="!sections.relationships" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('relationships.addRelationship') }" @toggle="toggleSection('relationships')" @action="openAddRelative('spouse')" />
        <div v-if="sections.relationships" class="panel-section-body">
          <PersonRelationshipsSection ref="relSectionRef" :person-id="personId!" />
        </div>
      </div>

      <!-- Grupper section -->
      <div class="panel-section">
        <SectionHeader :title="$t('groups.title')" :count="groups.length" :collapsed="!sections.groups" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('groups.addGroupShort') }" @toggle="toggleSection('groups')" @action="showGroupPicker = !showGroupPicker" />
        <div v-if="sections.groups" class="panel-section-body">
          <div v-if="!props.readonly && showGroupPicker && personId" class="panel-group-picker-wrap">
            <GroupPicker
              :person-id="personId"
              :exclude-ids="groups.map(g => g.id)"
              @added="onGroupAdded"
              @cancel="showGroupPicker = false"
            />
          </div>
          <SectionEmpty v-if="groups.length === 0" :message="$t('empty.groups')" />
          <GroupsTable v-else :groups="groups" :readonly="props.readonly" v-bind="props.readonly ? {} : { onRemove: removeFromGroup }" />
        </div>
      </div>

      <!-- Media section -->
      <div class="panel-section">
        <SectionHeader :title="$t('media.title')" :count="mediaCount" :collapsed="!sections.media" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('media.attachShort') }" @toggle="toggleSection('media')" @action="mediaSectionRef?.attach()" />
        <div v-if="sections.media" class="panel-section-body">
          <PersonMediaSection ref="mediaSectionRef" :person-id="personId!" :readonly="props.readonly" />
        </div>
      </div>

      <!-- Media Timeline section -->
      <div class="panel-section">
        <SectionHeader :title="$t('mediaTimeline.title')" :count="mediaCount" :collapsed="!sections.mediaTimeline" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('media.attachShort') }" @toggle="toggleSection('mediaTimeline')" @action="triggerAttachMedia" />
        <div v-if="sections.mediaTimeline" class="panel-section-body">
          <MediaTimeline entity-type="person" :entity-id="personId!" />
        </div>
      </div>

      <!-- Forskning section -->
      <div class="panel-section">
        <SectionHeader :title="$t('researchTasks.nav')" :count="researchTasks.length" :collapsed="!sections.research" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('researchTasks.addTask') }" @toggle="toggleSection('research')" @action="openTaskForm()" />
        <div v-if="sections.research" class="panel-section-body">
          <SectionEmpty v-if="researchTasks.length === 0" :message="$t('empty.researchTasks')" />
          <ResearchTasksTable v-else :tasks="researchTasks" :readonly="props.readonly" @updated="loadResearchTasks(personId!)" @select="goToTask" />
        </div>
      </div>

      <!-- Quality section -->
      <div class="panel-section">
        <SectionHeader :title="$t('quality.nav')" :count="checkCount" :collapsed="!sections.quality" @toggle="toggleSection('quality')" />
        <div v-if="sections.quality" class="panel-section-body">
          <PersonChecksSection ref="checksSectionRef" :person-id="personId!" @fix="handleCheckFix" />
        </div>
      </div>
    </template>

    <!-- Name form modal -->
    <PersonNameModal
      v-if="showNameForm && personId"
      :person-id="personId"
      :editing-name="editingName"
      :default-surname="primaryName?.surname ?? ''"
      @cancel="cancelNameForm"
      @close="cancelNameForm"
      @saved="reloadNames(personId!)"
    />

    <!-- Add research task modal -->
    <ResearchTaskModal
      v-if="showTaskForm && personId"
      mode="standalone"
      :person-id="personId"
      @cancel="showTaskForm = false"
      @close="showTaskForm = false"
      @saved="onTaskSaved"
    />

    <!-- Add relative modal -->
    <PersonModal
      v-if="showAddRelative && personId"
      mode="standalone"
      :add-related-to="{ personId: personId, mode: addRelativeMode, personSex: person?.sex as 'M' | 'F' | 'U' | undefined, personSurname: primaryName?.surname ?? undefined }"
      @close="showAddRelative = false"
      @cancel="showAddRelative = false"
      @saved="onRelativeSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, toRef, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import ResearchTaskModal from './modals/ResearchTaskModal.vue';
import EventList from './EventList.vue';
import type { ComponentPublicInstance } from 'vue';
import PersonName from './PersonName.vue';
import PersonNamesTable from './PersonNamesTable.vue';
import PersonNameModal from './modals/PersonNameModal.vue';
import PersonModal from './modals/PersonModal.vue';
import GroupPicker from './GroupPicker.vue';
import GroupsTable from './GroupsTable.vue';
import ResearchTasksTable from './ResearchTasksTable.vue';
import PersonIdentifiersSection from './PersonIdentifiersSection.vue';
import PersonMediaSection from './PersonMediaSection.vue';
import MediaTimeline from './MediaTimeline.vue';
import PersonChecksSection from './PersonChecksSection.vue';
import PersonRelationshipsSection from './PersonRelationshipsSection.vue';
import PersonDetailsSection from './PersonDetailsSection.vue';
import PersonTimeline from './PersonTimeline.vue';
import PersonMap from './PersonMap.vue';
import AppAvatar from './ui/AppAvatar.vue';
import AppButton from './ui/AppButton.vue';
import SectionHeader from './ui/SectionHeader.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import { usePersonPanelData, type NameData } from '../composables/usePersonPanelData';
import { usePanelSections } from '../composables/usePanelSections';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{ personId: string | null; readonly?: boolean }>();
const emit = defineEmits<{
  'relative-added': [];
  'person-changed': [];
  'close': [];
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
  eventCount,
  mapPointCount,
  relationshipCount,
  identifierCount,
  mediaCount,
  checkCount,
} = usePersonPanelData(personIdRef);

// ── Section state (composable) ──────────────────────────────────────────────

const { sections, toggleSection } = usePanelSections(
  'person-panel-section-',
  {
    person: false,
    names: false,
    events: true,
    timeline: false,
    map: false,
    relationships: true,
    groups: false,
    research: false,
    identifiers: false,
    media: false,
    mediaTimeline: false,
    quality: false,
  },
  {
    person: true, names: true, events: true, timeline: true, map: true,
    relationships: true, groups: true, research: false, identifiers: true,
    media: true, mediaTimeline: true, quality: false,
  },
);

// ── Template refs ───────────────────────────────────────────────────────────

const eventListRef = ref<(ComponentPublicInstance & { openAddForm: () => void }) | null>(null);
const identifiersSectionRef = ref<InstanceType<typeof PersonIdentifiersSection> | null>(null);
const mediaSectionRef = ref<InstanceType<typeof PersonMediaSection> | null>(null);
const checksSectionRef = ref<InstanceType<typeof PersonChecksSection> | null>(null);
const relSectionRef = ref<InstanceType<typeof PersonRelationshipsSection> | null>(null);

// ── Cross-section add actions ───────────────────────────────────────────────

async function triggerAddEvent() {
  if (!sections.events) toggleSection('events');
  await nextTick();
  eventListRef.value?.openAddForm();
}

async function triggerAttachMedia() {
  if (!sections.media) toggleSection('media');
  await nextTick();
  mediaSectionRef.value?.attach();
}

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

// ── Quality check fix actions ───────────────────────────────────────────────

function handleCheckFix(action: string) {
  switch (action) {
    case 'add-birth-event':
      eventListRef.value?.openAddForm('birth');
      break;
    case 'add-death-event':
      eventListRef.value?.openAddForm('death');
      break;
    case 'add-event':
      eventListRef.value?.openAddForm();
      break;
    case 'add-name':
      openNameForm(null);
      break;
    case 'add-father':
      openAddRelative('father');
      break;
    case 'add-mother':
      openAddRelative('mother');
      break;
    case 'toggle-living':
      if (person.value) updateLiving(!person.value.living);
      break;
  }
}

// ── Person field updates ────────────────────────────────────────────────────

function onDetailUpdated(field: string, value: unknown) {
  if (!person.value) return;
  if (field === 'sex') person.value.sex = value as string;
  if (field === 'living') person.value.living = value as boolean;
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
  emit('person-changed');
}

async function reloadNames(id: string) {
  await loadNames(id);
  emit('person-changed');
}

// ── Group actions ───────────────────────────────────────────────────────────

const showGroupPicker = ref(false);

async function removeFromGroup(groupId: string) {
  if (!props.personId) return;
  await window.api.groups.removeLinkByEntity(groupId, 'person', props.personId);
  await loadGroups(props.personId);
}

async function onGroupAdded() {
  showGroupPicker.value = false;
  if (props.personId) await loadGroups(props.personId);
}

// ── Research tasks ──────────────────────────────────────────────────────────

const router = useRouter();
const showTaskForm = ref(false);

function openTaskForm() {
  showTaskForm.value = true;
}

async function onTaskSaved() {
  if (props.personId) await loadResearchTasks(props.personId);
}

function goToTask(id: string) {
  router.push('/research-tasks/' + id);
}

// ── Derived ─────────────────────────────────────────────────────────────────

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
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  font-size: var(--font-sm);
}

.panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: var(--font-sm);
  padding: var(--space-xl);
  text-align: center;
}

/* Header */
.panel-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  background: var(--surface);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  padding: var(--space-md) 0 var(--space-md) var(--space-lg);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
.panel-header-content {
  flex: 1;
  min-width: 0;
}
.panel-close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: var(--font-lg);
  cursor: pointer;
  padding: 0 var(--space-md);
  align-self: stretch;
  margin: calc(var(--space-md) * -1) 0;
}
.panel-close-btn:hover { color: var(--text-primary); background: var(--surface-hover); }
.panel-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-bottom: var(--space-xs);
}
.panel-name-spacer {
  flex: 1;
}
.panel-name {
  min-width: 0;
  font-size: var(--font-base);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.panel-lifelines {
  margin-bottom: var(--space-xs);
}
.panel-lifeline {
  font-size: var(--font-xs);
  color: var(--text-muted);
  line-height: 1.5;
}
.panel-add-relative-btns {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

/* Sections */
.panel-section {
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  padding: 0 var(--space-lg);
}
.panel-section-body { padding: var(--space-xs) 0 var(--space-sm); }

/* Compact form */
/* Groups */
.panel-group-picker-wrap {
  padding: var(--space-xs) 0;
  border-bottom: 1px solid var(--surface-border);
}

</style>
