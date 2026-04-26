<template>
  <div class="person-panel">
    <!-- Empty state -->
    <div v-if="!personId" class="panel-empty">
      {{ $t('panel.noPersonSelected') }}
    </div>

    <template v-else-if="person">
      <!-- Collapse arrow on the panel's left edge — same pattern as the
           persons-list ◀/▶ buttons. -->
      <button class="panel-collapse-btn" :aria-label="$t('common.close')" :title="$t('common.close')" @click="emit('close')">▶</button>
      <!-- Pinned header: role label + identity card never scroll. The
           scrollbar belongs to the .panel-scroll-area below them. -->
      <div class="panel-sticky-top">
      <!-- Panel role label -->
      <h3 class="panel-role-label">{{ $t('panel.managePerson') }}</h3>
      <!-- Person summary card: name + always-rendered birth/death rows -->
      <div class="person-summary-card">
        <div class="person-summary-top">
          <AppAvatar
            :person-id="personId"
            :given-name="primaryName?.given_name ?? ''"
            :surname="primaryName?.surname ?? ''"
            :preferred-name="primaryName?.preferred_name ?? null"
            :sex="person.sex"
            size="lg"
          />
          <div class="person-summary-header">
            <div class="person-summary-name">
              <PersonName
                :given-name="primaryName?.given_name ?? null"
                :surname="primaryName?.surname ?? null"
                :preferred-name="primaryName?.preferred_name ?? null"
                :nickname="primaryName?.nickname ?? null"
              />
            </div>
            <span v-if="showTreeBtn && isTreeSubject" class="tree-subject-chip">{{ $t('panel.treeSubject') }}</span>
            <AppButton v-else-if="showTreeBtn" variant="soft" size="sm" @click="emit('set-tree-subject')">{{ $t('panel.setAsTreeSubject') }}</AppButton>
          </div>
        </div>
        <dl class="person-summary-life">
          <div class="person-summary-row">
            <dt class="person-summary-marker" aria-label="Birth">*</dt>
            <dd class="person-summary-value" :class="{ 'is-empty': !person.birthLine }">
              {{ person.birthLine || '—' }}
            </dd>
          </div>
          <div class="person-summary-row">
            <dt class="person-summary-marker" aria-label="Death">†</dt>
            <dd class="person-summary-value" :class="{ 'is-empty': !person.deathLine }">
              {{ person.deathLine || '—' }}
            </dd>
          </div>
        </dl>
      </div>
      </div>

      <!-- Scrollable area: everything below the pinned header scrolls in
           its own region so the scrollbar can't pass over the card. -->
      <div class="panel-scroll-area">
      <!-- Add-relative shortcuts, sitting below the summary card -->
      <div v-if="!props.readonly" class="panel-add-relative-section">
        <div class="panel-add-relative-label">{{ $t('personDetail.addRelativeLabel') ?? $t('relationships.addRelationship') }}</div>
        <div class="panel-add-relative-btns">
          <AppButton variant="soft" size="sm" @click="openAddRelative('father')">+ {{ $t('personDetail.addFather') }}</AppButton>
          <AppButton variant="soft" size="sm" @click="openAddRelative('mother')">+ {{ $t('personDetail.addMother') }}</AppButton>
          <AppButton variant="soft" size="sm" @click="openAddRelative('spouse')">+ {{ $t('personDetail.addSpouse') }}</AppButton>
          <AppButton variant="soft" size="sm" @click="openAddRelative('son')">+ {{ $t('personDetail.addSon') }}</AppButton>
          <AppButton variant="soft" size="sm" @click="openAddRelative('daughter')">+ {{ $t('personDetail.addDaughter') }}</AppButton>
        </div>
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

      <!-- Danger zone: delete person -->
      <div v-if="!props.readonly" class="panel-danger-zone">
        <AppButton variant="ghost" size="sm" class="delete-person-btn" @click="showDeleteConfirm = true">
          <!-- Filled "sheet-metal" trash can — solid silhouette instead of
               the wire-mesh look the 🗑️ emoji has on Windows. -->
          <svg class="trash-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M9 3a1 1 0 0 0-1 1v1H4.5a.75.75 0 0 0 0 1.5h.6l1.18 13.06A2 2 0 0 0 8.27 21.5h7.46a2 2 0 0 0 1.99-1.94L18.9 6.5h.6a.75.75 0 0 0 0-1.5H16V4a1 1 0 0 0-1-1H9zm.5 2v-.5h5V5h-5z"/>
            <rect x="9.25" y="9" width="1.5" height="9" rx="0.5" fill="var(--surface)" opacity="0.55"/>
            <rect x="13.25" y="9" width="1.5" height="9" rx="0.5" fill="var(--surface)" opacity="0.55"/>
          </svg>
          <span>{{ $t('persons.deletePersonAction') }}</span>
        </AppButton>
      </div>
      </div>
    </template>

    <!-- Delete confirmation -->
    <ConfirmModal
      :visible="showDeleteConfirm"
      :title="$t('persons.deleteConfirmTitle')"
      :message="deleteConfirmMessage"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('persons.deleteConfirmContinue')"
      @cancel="showDeleteConfirm = false"
      @confirm="performDelete"
    />

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
import { ref, toRef, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import ResearchTaskModal from './modals/ResearchTaskModal.vue';
import EventList from './EventList.vue';
import type { ComponentPublicInstance } from 'vue';
import PersonName from './PersonName.vue';
import PersonNamesTable from './PersonNamesTable.vue';
import PersonNameModal from './modals/PersonNameModal.vue';
import PersonModal from './modals/PersonModal.vue';
import ConfirmModal from './ConfirmModal.vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../composables/useToast';
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

const props = defineProps<{ personId: string | null; showTreeBtn?: boolean; treeSubjectId?: string | null; readonly?: boolean }>();
const emit = defineEmits<{
  'relative-added': [];
  'set-tree-subject': [];
  'person-changed': [];
  'close': [];
}>();

const isTreeSubject = computed(() => !!props.personId && props.personId === props.treeSubjectId);

const { t } = useI18n();
const toast = useToast();

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

// ── Delete person ───────────────────────────────────────────────────────────

const showDeleteConfirm = ref(false);
const deleteConfirmMessage = computed(() => {
  const name = primaryName.value
    ? [primaryName.value.given_name, primaryName.value.surname].filter(Boolean).join(' ')
    : t('common.unknown');
  return t('persons.deleteConfirmMessage', {
    name,
    relationships: relationshipCount.value,
  });
});

async function performDelete() {
  if (!props.personId) return;
  try {
    await window.api.persons.delete(props.personId);
    showDeleteConfirm.value = false;
    toast.success(t('persons.deletedToast', {
      name: primaryName.value
        ? [primaryName.value.given_name, primaryName.value.surname].filter(Boolean).join(' ')
        : t('common.unknown'),
    }));
    emit('person-changed');
    emit('close');
  } catch (err) {
    console.error('[PersonPanel] delete failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

// ── Add relative modal ──────────────────────────────────────────────────────

const showAddRelative = ref(false);
type AddRelativeMode = 'father' | 'mother' | 'spouse' | 'child' | 'son' | 'daughter';
const addRelativeMode = ref<AddRelativeMode>('father');

function openAddRelative(mode: AddRelativeMode) {
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
  }
}

// ── Person field updates ────────────────────────────────────────────────────

function onDetailUpdated(field: string, value: unknown) {
  if (!person.value) return;
  if (field === 'sex') person.value.sex = value as string;
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
.panel-danger-zone {
  padding: var(--space-md) var(--space-lg) var(--space-lg);
  border-top: 1px solid var(--surface-border-subtle);
  display: flex;
  justify-content: flex-end;
  margin-top: auto;
}
.trash-icon {
  width: 18px;
  height: 18px;
  display: inline-block;
  margin-right: 6px;
  vertical-align: -4px;
}

/* Delete-person button: outlined, no background fill. Uses :deep so the
   styles reach into AppButton's scoped element. */
.delete-person-btn :deep(.app-btn) {
  background: transparent;
  border: 1px solid var(--surface-border);
  color: var(--text-secondary);
}
.delete-person-btn :deep(.app-btn:hover:not(:disabled)) {
  background: var(--surface-hover);
  border-color: var(--surface-border);
  color: var(--text-primary);
}

.person-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* The panel itself does not scroll — its inner .panel-scroll-area
     does, so the scrollbar starts below the pinned header card. */
  overflow: hidden;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  font-size: var(--font-sm);
  position: relative;
  /* Reserve a slot at the left for the collapse arrow so it never
     overlaps section content or the sticky "Hantera person" header. */
  padding-left: 28px;
}

/* Scrollable region below the pinned header. */
.panel-scroll-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  /* Breathing room between the pinned identity card and the first
     section below it. */
  padding-top: var(--space-lg);
}

/* Collapse arrow on the panel's left edge — mirrors the
   `list-collapse-btn` / `list-open-btn` pattern on the persons list. */
.panel-collapse-btn {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-left: none;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  padding: 6px 5px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-xs);
  z-index: 10;
}
.panel-collapse-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }

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

/* Role label above the person header — mirrors "Personlista" on the
   list column. Sticky so it stays visible while panel scrolls. */
/* Pinned stack: role label + identity card live outside the scroll
   region so the scrollbar starts below them and can't paint over the
   card. No sticky needed any more — flexbox keeps them at top. */
.panel-sticky-top {
  background: var(--surface);
  flex-shrink: 0;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  position: relative;
  z-index: 2;
}
.panel-role-label {
  margin: 0;
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
  padding: var(--space-md) var(--space-lg) var(--space-sm) var(--space-lg);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  border-bottom: 1px solid var(--surface-border-subtle);
  background: var(--surface);
}
.panel-role-label + .panel-header,
.panel-role-label + .person-summary-card {
  border-radius: 0;
  padding-top: var(--space-md);
}
/* When inside the sticky stack the card needs a bottom border so it
   reads as a header block once the rest of the panel scrolls under it. */
.panel-sticky-top .person-summary-card {
  margin-bottom: 0;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  border-bottom: 1px solid var(--surface-border-subtle);
}

/* Person summary card — compact identity panel under "Hantera person".
   Always renders a row for birth and death even when missing, so the
   layout stays predictable. */
.person-summary-card {
  margin: var(--space-md) var(--space-md) 0;
  padding: var(--space-md);
  background: var(--surface);
  border: 1px solid var(--surface-border-subtle);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  flex-shrink: 0;
}
.person-summary-top {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}
.person-summary-header {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}
.person-summary-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-md);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.person-summary-life {
  margin: 0;
  display: grid;
  gap: 2px;
  padding: var(--space-xs) 0 0;
  border-top: 1px dashed var(--surface-border-subtle);
}
.person-summary-row {
  display: grid;
  grid-template-columns: 1.25em 1fr;
  align-items: baseline;
  gap: var(--space-sm);
}
.person-summary-marker {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-base);
  text-align: center;
}
.person-summary-value {
  margin: 0;
  font-size: var(--font-sm);
  color: var(--text-primary);
}
.person-summary-value.is-empty {
  color: var(--text-muted);
  font-style: italic;
}

/* Add-relative shortcuts — moved out of the header so they sit a bit
   below the identity card. */
.panel-add-relative-section {
  padding: var(--space-md) var(--space-md) var(--space-sm);
  flex-shrink: 0;
}
.panel-add-relative-label {
  font-size: var(--font-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-xs);
}

/* Header */
.panel-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  background: var(--surface);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  padding: 0 0 0 var(--space-lg);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
.panel-header > .app-avatar {
  margin-top: var(--space-md);
  margin-bottom: var(--space-md);
}
.panel-header-content {
  padding: var(--space-md) 0;
  flex: 1;
  min-width: 0;
}
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
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: var(--space-sm);
  margin-bottom: var(--space-xs);
}
.panel-lifeline-dates {
  min-width: 0;
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
.tree-subject-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--accent-text);
  background: var(--accent);
  border-radius: var(--radius-full);
  white-space: nowrap;
  align-self: flex-start;
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
