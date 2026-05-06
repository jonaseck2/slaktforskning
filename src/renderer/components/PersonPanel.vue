<template>
  <EntityPanel
    entity-type="person"
    :entity="person"
    :label="$t('panel.managePerson')"
    :created-at="person?.created_at ?? null"
    :updated-at="person?.updated_at ?? null"
    @close="emit('close')"
  >
    <template #empty>{{ $t('panel.noPersonSelected') }}</template>
    <template #header>
      <div class="person-summary-card">
        <div class="person-summary-top">
          <AppAvatar
            :person-id="personId!"
            :given-name="primaryName?.given_name ?? ''"
            :surname="primaryName?.surname ?? ''"
            :preferred-name="primaryName?.preferred_name ?? null"
            :sex="person?.sex ?? 'U'"
            size="lg"
          />
          <div class="person-summary-header">
            <div class="person-summary-name">
              <!-- Display only — see plan birth-name-display-and-quality-check. -->
              <PersonName
                :given-name="primaryName?.given_name ?? null"
                :surname="primaryName?.surname ?? null"
                :preferred-name="primaryName?.preferred_name ?? null"
                :nickname="primaryName?.nickname ?? null"
                :birth-surname="primaryBirthSurname"
                :show-birth-name-parenthetical="personNameOptions.showBirthNameParenthetical"
              />
            </div>
            <span v-if="showTreeBtn && isTreeSubject" class="tree-subject-chip">{{ $t('panel.treeSubject') }}</span>
            <AppButton v-else-if="showTreeBtn" variant="soft" size="sm" @click="emit('set-tree-subject')">{{ $t('panel.setAsTreeSubject') }}</AppButton>
          </div>
        </div>
        <dl class="person-summary-life">
          <div class="person-summary-row">
            <dt class="person-summary-marker" aria-label="Birth">*</dt>
            <dd class="person-summary-value" :class="{ 'is-empty': !person?.birthLine }">
              {{ person?.birthLine || '—' }}
            </dd>
          </div>
          <div class="person-summary-row">
            <dt class="person-summary-marker" aria-label="Death">†</dt>
            <dd class="person-summary-value" :class="{ 'is-empty': !person?.deathLine }">
              {{ person?.deathLine || '—' }}
            </dd>
          </div>
        </dl>
      </div>
    </template>

    <template v-if="person">
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
          <PersonDetailsSection :person-id="personId!" :sex="person.sex" :readonly="props.readonly" @updated="onDetailUpdated" />
        </div>
      </div>

      <!-- Namen section -->
      <div class="panel-section">
        <SectionHeader :title="$t('personDetail.names')" :count="names.length" :collapsed="!sections.names" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('personDetail.addName') }" @toggle="toggleSection('names')" @action="openNameForm(null)" />
        <div v-if="sections.names" class="panel-section-body">
          <SectionEmpty v-if="names.length === 0" :message="$t('empty.names')" />
          <PersonNamesTable v-else :names="names" :birth-event-date="birthEventDate" :readonly="props.readonly" @edit="openNameForm" @delete="deleteName" @reorder="reorderNames" />
        </div>
      </div>

      <!-- Händelser section -->
      <div class="panel-section">
        <SectionHeader :title="$t('panel.events')" :count="eventCount" :collapsed="!sections.events" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('events.event') }" @toggle="toggleSection('events')" @action="triggerAddEvent" />
        <div v-if="sections.events" class="panel-section-body">
          <EventList ref="eventListRef" :person-id="personId!" :readonly="props.readonly" hide-header />
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

      <!-- Relationer section -->
      <div class="panel-section">
        <SectionHeader :title="$t('personDetail.relationships')" :count="relationshipCount" :collapsed="!sections.relationships" @toggle="toggleSection('relationships')" />
        <div v-if="sections.relationships" class="panel-section-body">
          <PersonRelationshipsSection ref="relSectionRef" :person-id="personId!" />
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
        <SectionHeader :title="$t('mediaTimeline.title')" :count="mediaCount" :collapsed="!sections.mediaTimeline" @toggle="toggleSection('mediaTimeline')" />
        <div v-if="sections.mediaTimeline" class="panel-section-body">
          <MediaTimeline entity-type="person" :entity-id="personId!" />
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
          <GroupsTable v-else :groups="groups" :readonly="props.readonly" v-bind="props.readonly ? {} : { onRemove: removeFromGroup }" @select="(id) => router.push('/groups/' + id)" />
        </div>
      </div>

      <!-- Forskning section -->
      <div class="panel-section">
        <SectionHeader :title="$t('researchTasks.nav')" :count="researchTasks.length" :collapsed="!sections.research" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('researchTasks.addTask') }" @toggle="toggleSection('research')" @action="openTaskForm()" />
        <div v-if="sections.research" class="panel-section-body">
          <SectionEmpty v-if="researchTasks.length === 0" :message="$t('empty.researchTasks')" />
          <ResearchTasksTable v-else :tasks="researchTasks" :readonly="props.readonly" @updated="reload" @select="openTaskFromRow" />
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
        <AppButton variant="secondary" size="sm" @click="showDeleteConfirm = true">
          <IconTrash class="trash-icon" />
          <span>{{ $t('persons.deletePersonAction') }}</span>
        </AppButton>
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

    <ConfirmModal
      :visible="delName.visible.value"
      :title="$t('personDetail.removeNameConfirmTitle')"
      :message="$t('personDetail.removeNameConfirmMessage')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.delete')"
      @cancel="delName.cancel"
      @confirm="delName.confirm"
    />

    <ConfirmModal
      :visible="delGroup.visible.value"
      :title="$t('groups.removeMemberConfirmTitle')"
      :message="$t('groups.confirmRemoveMember')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.remove')"
      @cancel="delGroup.cancel"
      @confirm="delGroup.confirm"
    />

    <!-- Name form modal -->
    <PersonNameModal
      v-if="showNameForm && personId"
      :person-id="personId"
      :editing-name="editingName"
      :default-surname="primaryName?.surname ?? ''"
      @cancel="cancelNameForm"
      @close="cancelNameForm"
      @saved="onNameSaved"
    />

    <!-- Research task add/edit modal -->
    <ResearchTaskModal
      v-if="showTaskForm && personId"
      mode="standalone"
      :person-id="personId"
      :editing-task="editingTask"
      @cancel="closeTaskForm"
      @close="closeTaskForm"
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
  </EntityPanel>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
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
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import GroupPicker from './GroupPicker.vue';
import GroupsTable from './GroupsTable.vue';
import ResearchTasksTable from './ResearchTasksTable.vue';
import PersonMediaSection from './PersonMediaSection.vue';
import MediaTimeline from './MediaTimeline.vue';
import PersonChecksSection from './PersonChecksSection.vue';
import PersonRelationshipsSection from './PersonRelationshipsSection.vue';
import PersonDetailsSection from './PersonDetailsSection.vue';
import PersonTimeline from './PersonTimeline.vue';
import PersonMap from './PersonMap.vue';
import AppAvatar from './ui/AppAvatar.vue';
import AppButton from './ui/AppButton.vue';
import IconTrash from './ui/IconTrash.vue';
import EntityPanel from './EntityPanel.vue';
import SectionHeader from './ui/SectionHeader.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import { useEntityData } from '../composables/useEntityData';
import { usePanelSections } from '../composables/usePanelSections';
import {
  pickDisplayedName,
  sortNamesBySortOrder,
  birthDateValue,
  pickBirthSurnameForDisplay,
  type NameData,
} from '../utils/nameUtils';
import { usePersonNameOptions } from '../stores/personNameOptions';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface PersonData {
  id: string;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  birthLine: string | null;
  deathLine: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface GroupData {
  id: string;
  name: string;
  notes: string | null;
}

interface ResearchTaskRow {
  id: string;
  task: string;
  notes: string | null;
  result: string | null;
  status: string;
  priority: number;
  person_id?: string | null;
  person_given_name?: string | null;
  person_surname?: string | null;
  created_at: string;
  updated_at: string;
}

interface PersonPanelData {
  person: PersonData | null;
  primaryName: NameData | null;
  names: NameData[];
  birthEventDate: string | null;
  groups: GroupData[];
  researchTasks: ResearchTaskRow[];
  eventCount: number;
  mapPointCount: number;
  relationshipCount: number;
  mediaCount: number;
}

const props = defineProps<{ personId: string | null; showTreeBtn?: boolean; treeSubjectId?: string | null; readonly?: boolean }>();
const emit = defineEmits<{
  'relative-added': [];
  'set-tree-subject': [];
  'person-changed': [];
  'close': [];
}>();

const isTreeSubject = computed(() => !!props.personId && props.personId === props.treeSubjectId);

const router = useRouter();
const { t } = useI18n();
const toast = useToast();

// ── Data ────────────────────────────────────────────────────────────────────
// Single combined loader. The previous bespoke composable had a 2-wave pattern
// (identity first, then lifelines/counts) to avoid flicker on the avatar+name
// while place lookups for birth/death lines completed. With useEntityData's
// generation guard, switching person never overwrites the new entity with a
// stale loader's payload — and a single Promise.all keeps the network round
// trips parallel, so the brief "no data → all data" flicker is sub-frame in
// practice. This trade-off matches the migrated PlacePanel/SourcePanel.

async function buildDateLine(event: {
  date_original: string | null;
  date_value: string | null;
  place_id: string | null;
  place_address: string | null;
} | undefined): Promise<string | null> {
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

const idRef = computed(() => props.personId ?? null);
const { data: panelData, reload } = useEntityData<PersonPanelData>(idRef, async (id) => {
  const [raw, fetchedNames, events] = await Promise.all([
    window.api.persons.get(id) as Promise<{ id: string; sex: string; living: boolean; created_at: string; updated_at: string } | null>,
    window.api.persons.getNames(id) as Promise<NameData[]>,
    window.api.events.forPerson(id) as Promise<Array<{
      event_type: string;
      date_value: string | null;
      date_original: string | null;
      place_id: string | null;
      place_address: string | null;
    }>>,
  ]);

  if (!raw) {
    return {
      person: null,
      primaryName: null,
      names: [],
      birthEventDate: null,
      groups: [],
      researchTasks: [],
      eventCount: 0,
      mapPointCount: 0,
      relationshipCount: 0,
      mediaCount: 0,
    };
  }

  const birth = events.find(e => e.event_type === 'birth');
  const death = events.find(e => e.event_type === 'death');

  const [birthLine, deathLine, grps, tasks, rels, media] = await Promise.all([
    buildDateLine(birth),
    buildDateLine(death),
    window.api.groups.forPerson(id) as Promise<GroupData[]>,
    window.api.researchTasks.forPerson(id) as Promise<ResearchTaskRow[]>,
    window.api.relationships.getForPerson(id) as Promise<unknown[]>,
    window.api.media.forEntity('person', id) as Promise<unknown[]>,
  ]);

  return {
    person: {
      id: raw.id,
      sex: raw.sex as 'M' | 'F' | 'U',
      living: raw.living,
      birthLine,
      deathLine,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    },
    primaryName: pickDisplayedName(fetchedNames, events),
    names: sortNamesBySortOrder(fetchedNames),
    birthEventDate: birthDateValue(events),
    groups: grps,
    researchTasks: tasks,
    eventCount: events.length,
    mapPointCount: events.filter(e => e.place_id).length,
    relationshipCount: rels.length,
    mediaCount: media.length,
  };
});

const person = computed(() => panelData.value?.person ?? null);
const primaryName = computed(() => panelData.value?.primaryName ?? null);
const names = computed(() => panelData.value?.names ?? []);
const birthEventDate = computed(() => panelData.value?.birthEventDate ?? null);
const groups = computed(() => panelData.value?.groups ?? []);
const researchTasks = computed(() => panelData.value?.researchTasks ?? []);
const eventCount = computed(() => panelData.value?.eventCount ?? 0);
const mapPointCount = computed(() => panelData.value?.mapPointCount ?? 0);
const relationshipCount = computed(() => panelData.value?.relationshipCount ?? 0);
const mediaCount = computed(() => panelData.value?.mediaCount ?? 0);
const checkCount = computed(() => checksSectionRef.value?.count ?? 0);

// Display only — see plan birth-name-display-and-quality-check.
const personNameOptions = usePersonNameOptions();
const primaryBirthSurname = computed(() =>
  pickBirthSurnameForDisplay(primaryName.value, names.value),
);

// ── Section state (composable) ──────────────────────────────────────────────

const { sections, toggleSection } = usePanelSections(
  'person-panel-section-',
  {
    person: false,
    names: true,
    events: true,
    timeline: false,
    map: false,
    relationships: true,
    groups: false,
    research: false,
    media: false,
    mediaTimeline: false,
    quality: false,
  },
  {
    person: true, names: true, events: true, timeline: true, map: true,
    relationships: true, groups: true, research: false,
    media: true, mediaTimeline: true, quality: false,
  },
);

// ── Template refs ───────────────────────────────────────────────────────────

const eventListRef = ref<(ComponentPublicInstance & { openAddForm: (eventType?: string) => void }) | null>(null);
const mediaSectionRef = ref<InstanceType<typeof PersonMediaSection> | null>(null);
const checksSectionRef = ref<(InstanceType<typeof PersonChecksSection> & { count: number; reload: () => void }) | null>(null);
const relSectionRef = ref<InstanceType<typeof PersonRelationshipsSection> | null>(null);

// ── Cross-section add actions ───────────────────────────────────────────────

async function triggerAddEvent() {
  if (!sections.events) toggleSection('events');
  await nextTick();
  eventListRef.value?.openAddForm();
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
  await reload();
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

function onDetailUpdated(field: string, _value: unknown) {
  // Mutating IPC fans out via `onDataChanged`; useEntityData reloads on its own.
  // Just emit the parent event so chart/list views can re-render.
  if (field === 'sex') {
    // Optimistic update: trigger an immediate reload to refresh the avatar tint.
    reload();
  }
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

const delName = useDeleteConfirm<string>(async (nameId) => {
  if (!props.personId) return;
  await window.api.persons.deleteName(nameId);
  await reload();
  emit('person-changed');
});
function deleteName(nameId: string) { delName.ask(nameId); }

async function onNameSaved() {
  await reload();
  emit('person-changed');
}

/**
 * Apply a new name order: reassign sort_order so that newOrder[0] gets the
 * highest value (newest, table-top). Mirrors PersonMediaSection's pattern.
 */
async function reorderNames(orderedIds: string[]) {
  if (!props.personId) return;
  // Top of the table is the displayed name → highest sort_order.
  const total = orderedIds.length;
  for (let i = 0; i < total; i++) {
    await window.api.persons.updateName(orderedIds[i], { sort_order: total - i });
  }
  await reload();
  emit('person-changed');
}

// ── Group actions ───────────────────────────────────────────────────────────

const showGroupPicker = ref(false);

const delGroup = useDeleteConfirm<string>(async (groupId) => {
  if (!props.personId) return;
  await window.api.groups.removeLinkByEntity(groupId, 'person', props.personId);
  await reload();
});
function removeFromGroup(groupId: string) { delGroup.ask(groupId); }

async function onGroupAdded() {
  showGroupPicker.value = false;
  await reload();
}

// ── Research tasks ──────────────────────────────────────────────────────────

const showTaskForm = ref(false);
const editingTask = ref<ResearchTaskRow | null>(null);

function openTaskForm(task: ResearchTaskRow | null = null) {
  editingTask.value = task;
  showTaskForm.value = true;
}

function closeTaskForm() {
  showTaskForm.value = false;
  editingTask.value = null;
}

async function onTaskSaved() {
  closeTaskForm();
  await reload();
}

function openTaskFromRow(id: string) {
  const task = researchTasks.value.find(t => t.id === id);
  if (task) openTaskForm(task);
}
</script>

<style scoped>
/* Person summary card — compact identity panel rendered into EntityPanel's
   #header slot. Always renders a row for birth and death even when missing,
   so the layout stays predictable. */
.person-summary-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
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

/* Add-relative shortcuts — sit a bit below the identity card. */
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

/* Groups */
.panel-group-picker-wrap {
  padding: var(--space-xs) 0;
  border-bottom: 1px solid var(--surface-border);
}
</style>
