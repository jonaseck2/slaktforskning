<template>
  <div v-if="person" class="person-detail">
    <div class="detail-header">
      <div class="header-row">
        <AppAvatar
          v-if="!profilePicUrl"
          :given-name="primaryNameData?.given_name ?? ''"
          :surname="primaryNameData?.surname ?? ''"
          :sex="(person.sex as 'M' | 'F' | 'U')"
          size="xl"
        />
        <img
          v-else
          :src="profilePicUrl"
          class="profile-thumbnail"
          :alt="$t('media.profileAlt')"
        />
        <div class="header-info">
          <h2>{{ primaryName }}</h2>
          <div class="header-summary">
            <span v-if="birthSummary" class="summary-text">{{ birthSummary }}</span>
            <span v-if="birthSummary && (person.living || !person.living)" class="summary-sep">&middot;</span>
            <span class="summary-text">{{ person.living ? $t('persons.living') : $t('personDetail.deceased') }}</span>
          </div>
          <div class="header-badges">
            <AppBadge :variant="('sex-' + person.sex.toLowerCase()) as 'sex-m' | 'sex-f' | 'sex-u'">{{ $t('sex.' + person.sex) }}</AppBadge>
            <AppBadge v-if="person.living" variant="status">{{ $t('persons.living') }}</AppBadge>
            <AppBadge v-else variant="status">{{ $t('personDetail.deceased') }}</AppBadge>
          </div>
        </div>
      </div>
    </div>

    <!-- Person Details -->
    <section class="detail-section" aria-labelledby="section-person-details">
      <SectionHeader :title="$t('personDetail.detailsTitle')" :collapsible="false" />
      <PersonDetailsSection :person-id="person.id" :sex="person.sex" :living="person.living" @updated="onDetailUpdated" />
    </section>

    <!-- Names Section -->
    <section id="section-names" class="detail-section" aria-labelledby="section-person-names">
      <SectionHeader
        :title="$t('personDetail.names')"
        :count="names.length"
        :collapsible="false"
        :action-label="'+ ' + $t('personDetail.addName')"
        tabindex="0"
        :data-narrate="t('screenReader.sectionNames', { count: names.length, summary: names[0] ? (names[0].given_name ?? '') + ' ' + (names[0].surname ?? '') : '' })"
        @action="showNameForm = true"
      />
      <div v-if="names.length === 0" class="empty-hint">{{ $t('personDetail.noNames') }}</div>
      <PersonNamesTable v-else :names="names" @edit="openEditName" @delete="removeName" />
    </section>

    <!-- Relationships Section -->
    <section id="section-relationships" class="detail-section" aria-labelledby="section-person-relationships">
      <div class="section-header-custom" tabindex="0" :data-narrate="t('screenReader.sectionRelationships', { count: 0, summary: '' })">
        <span class="section-title-label">{{ $t('personDetail.relationships') }} <span v-if="relSectionRef?.count" class="section-count">({{ relSectionRef.count }})</span></span>
        <div class="rel-actions">
          <AppButton variant="soft" size="sm" @click="addRelatedMode = 'father'; showAddRelated = true">+ {{ $t('personDetail.addFather') }}</AppButton>
          <AppButton variant="soft" size="sm" @click="addRelatedMode = 'mother'; showAddRelated = true">+ {{ $t('personDetail.addMother') }}</AppButton>
          <AppButton variant="soft" size="sm" @click="addRelatedMode = 'spouse'; showAddRelated = true">+ {{ $t('personDetail.addSpouse') }}</AppButton>
          <AppButton variant="soft" size="sm" @click="addRelatedMode = 'child'; showAddRelated = true">+ {{ $t('personDetail.addChild') }}</AppButton>
        </div>
      </div>
      <PersonRelationshipsSection ref="relSectionRef" :person-id="personId" />
    </section>

    <!-- Events Section -->
    <section id="section-events" class="detail-section" aria-label="Events">
      <EventList :person-id="person.id" ref="eventListRef" :key="'events-' + dataVersionStore.version" />
    </section>

    <!-- Timeline Section -->
    <section id="section-timeline" class="detail-section" aria-labelledby="section-person-timeline">
      <SectionHeader :title="$t('personTimeline.title')" :collapsible="false" />
      <PersonTimeline ref="timelineRef" :person-id="person.id" :key="'timeline-' + dataVersionStore.version" />
    </section>

    <!-- Life Map Section -->
    <section class="detail-section" aria-labelledby="section-person-map">
      <SectionHeader :title="$t('map.personMap')" :collapsible="false" />
      <PersonMap :person-id="person.id" :key="'map-' + dataVersionStore.version" />
    </section>

    <!-- Identifiers Section -->
    <section id="section-identifiers" class="detail-section" aria-labelledby="section-person-identifiers">
      <SectionHeader
        :title="$t('identifiers.title')"
        :count="identifiersSectionRef?.count"
        :collapsible="false"
        :action-label="'+ ' + $t('identifiers.add')"
        tabindex="0"
        :data-narrate="t('screenReader.sectionIdentifiers', { count: identifiersSectionRef?.count ?? 0, summary: '' })"
        @action="identifiersSectionRef?.openAddForm()"
      />
      <PersonIdentifiersSection ref="identifiersSectionRef" :person-id="person.id" />
    </section>

    <!-- Groups Section -->
    <section class="detail-section" aria-labelledby="section-person-groups">
      <SectionHeader
        :title="$t('groups.title')"
        :count="personGroups.length"
        :collapsible="false"
        :action-label="!showGroupPicker ? '+ ' + $t('groups.addMember') : ''"
        @action="showGroupPicker = true"
      />
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
    <section id="section-media" class="detail-section" aria-labelledby="section-person-media">
      <SectionHeader
        :title="$t('media.title')"
        :count="mediaSectionRef?.count"
        :collapsible="false"
        :action-label="'+ ' + $t('media.attach')"
        tabindex="0"
        :data-narrate="t('screenReader.sectionMedia', { count: mediaSectionRef?.count ?? 0, summary: '' })"
        @action="mediaSectionRef?.attach()"
      />
      <PersonMediaSection ref="mediaSectionRef" :person-id="person.id" @profile-changed="loadProfilePic" />
    </section>

    <!-- Media Timeline Section -->
    <section class="detail-section" aria-labelledby="section-media-timeline">
      <SectionHeader :title="$t('mediaTimeline.title')" :collapsible="false" />
      <MediaTimeline entity-type="person" :entity-id="person.id" />
    </section>

    <!-- Research Tasks Section -->
    <section class="detail-section" aria-labelledby="section-person-tasks">
      <SectionHeader
        :title="$t('nav.researchTasks')"
        :count="personTasks.length"
        :collapsible="false"
        :action-label="'+ ' + $t('researchTasks.addTask')"
        @action="showAddTaskModal = true"
      />
      <div v-if="personTasks.length === 0" class="empty-hint">{{ $t('researchTasks.noTasks') }}</div>
      <ResearchTasksTable v-else :tasks="personTasks" @updated="loadPersonTasks" />
    </section>

    <!-- Add Research Task Modal -->
    <AddResearchTaskModal
      v-if="showAddTaskModal"
      :person-id="personId"
      @close="showAddTaskModal = false"
      @saved="loadPersonTasks"
    />

    <!-- Quality Section -->
    <section id="section-checks" class="detail-section" aria-labelledby="section-person-quality">
      <SectionHeader
        :title="$t('quality.nav')"
        :count="checksSectionRef?.count"
        :collapsible="false"
        tabindex="0"
        :data-narrate="t('screenReader.sectionChecks', { count: checksSectionRef?.count ?? 0, summary: '' })"
      />
      <PersonChecksSection ref="checksSectionRef" :person-id="person.id" @fix="handleCheckFix" />
    </section>

    <AddRelatedPersonModal
      v-if="showAddRelated"
      :person-id="person.id"
      :person-sex="person.sex as 'M' | 'F' | 'U'"
      :person-surname="primaryNameData?.surname ?? undefined"
      :mode="addRelatedMode"
      @close="showAddRelated = false"
      @saved="showAddRelated = false; relSectionRef?.reload()"
    />

    <!-- Add Name Modal -->
    <PersonNameFormModal
      v-if="showNameForm || showEditNameForm"
      :person-id="personId"
      :name="showEditNameForm ? editingName : null"
      :default-surname="names.length > 0 ? names[0].surname : ''"
      @close="showNameForm = false; showEditNameForm = false"
      @saved="load"
    />
  </div>
  <div v-else class="empty">{{ $t('common.loading') }}</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, nextTick, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave } from 'vue-router';
import { useScreenReaderMode } from '../composables/useScreenReaderMode';
import { useToast } from '../composables/useToast';
import { useTTS } from '../composables/useTTS';
import { narratePerson, narrationLabelsFromI18n } from '../utils/narration';
import AddResearchTaskModal from '../components/AddResearchTaskModal.vue';
import EventList from '../components/EventList.vue';
import AddRelatedPersonModal from '../components/AddRelatedPersonModal.vue';
import PersonRelationshipsSection from '../components/PersonRelationshipsSection.vue';
import PersonNamesTable from '../components/PersonNamesTable.vue';
import PersonNameFormModal from '../components/PersonNameFormModal.vue';
import PersonIdentifiersSection from '../components/PersonIdentifiersSection.vue';
import PersonMediaSection from '../components/PersonMediaSection.vue';
import MediaTimeline from '../components/MediaTimeline.vue';
import PersonChecksSection from '../components/PersonChecksSection.vue';
import PersonTimeline from '../components/PersonTimeline.vue';
import ResearchTasksTable from '../components/ResearchTasksTable.vue';
import GroupPicker from '../components/GroupPicker.vue';
import GroupsTable from '../components/GroupsTable.vue';
import PersonDetailsSection from '../components/PersonDetailsSection.vue';
import PersonMap from '../components/PersonMap.vue';
import AppAvatar from '../components/ui/AppAvatar.vue';
import AppBadge from '../components/ui/AppBadge.vue';
import AppButton from '../components/ui/AppButton.vue';
import SectionHeader from '../components/ui/SectionHeader.vue';
import { fullNameParts } from '../utils/nameUtils';
import { useFocusStore } from '../stores/focus';
import { useDataVersionStore } from '../stores/dataVersion';

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
const router = useRouter();
const personId = route.params.id as string;
const focusStore = useFocusStore();
const { t, locale } = useI18n();
const screenReader = useScreenReaderMode();
const toast = useToast();
const ttsEnabled = inject<Ref<boolean>>('ttsEnabled', ref(false));
const { speak, stop } = useTTS();

const person = ref<PersonData | null>(null);
const names = ref<NameRow[]>([]);
const primaryName = ref('');
const profilePicUrl = ref<string | null>(null);
const showNameForm = ref(false);
const showEditNameForm = ref(false);
const editingName = ref<NameRow | null>(null);
const showAddRelated = ref(false);
const addRelatedMode = ref<'father' | 'mother' | 'spouse' | 'child'>('father');
const primaryNameData = computed(() => names.value.length > 0 ? names.value[0] : null);
const birthSummary = ref('');
const dataVersionStore = useDataVersionStore();
const eventListRef = ref<InstanceType<typeof EventList> | null>(null);
const identifiersSectionRef = ref<InstanceType<typeof PersonIdentifiersSection> | null>(null);
const mediaSectionRef = ref<InstanceType<typeof PersonMediaSection> | null>(null);
const checksSectionRef = ref<InstanceType<typeof PersonChecksSection> | null>(null);
const timelineRef = ref<InstanceType<typeof PersonTimeline> | null>(null);
const relSectionRef = ref<InstanceType<typeof PersonRelationshipsSection> | null>(null);

// Pending fix action from ?action= query param (QualityView navigation)
const pendingFixAction = ref<string | null>((route.query.action as string) || null);

// Execute pending action once person data loads and child components mount
watch(person, (p) => {
  if (p && pendingFixAction.value) {
    const action = pendingFixAction.value;
    pendingFixAction.value = null;
    // Two nextTicks: first for v-if="person" to render children, second for child refs to populate
    nextTick(() => nextTick(() => handleCheckFix(action)));
  }
});

// Research tasks
const personTasks = ref<import('../components/ResearchTasksTable.vue').ResearchTaskRow[]>([]);
const showAddTaskModal = ref(false);

const personGroups = ref<import('../components/GroupsTable.vue').GroupRow[]>([]);
const showGroupPicker = ref(false);
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

async function load() {
  if (!window.api) return;
  try {
    // Load person, names, events, tasks, groups, and profile pic in parallel where possible
    const [personData, namesData, eventsData] = await Promise.all([
      window.api.persons.get(personId) as Promise<PersonData | null>,
      window.api.persons.getNames(personId) as Promise<NameRow[]>,
      window.api.events.forPerson(personId) as Promise<Array<{ event_type: string; date_value: string | null; place_name?: string | null }>>,
    ]);

    person.value = personData;
    if (!person.value) return;
    localStorage.setItem('viz-focal-person', personId);

    names.value = namesData;
    if (names.value.length > 0) {
      const n = names.value[0];
      primaryName.value = fullNameParts(n.given_name ?? null, n.surname ?? null, n.preferred_name ?? null, n.nickname ?? null)
        .map(p => p.text).join('');
    }
    focusStore.set(personId, primaryName.value);

    // Build birth summary from already-loaded events (no extra IPC call)
    const birth = eventsData.find(e => e.event_type === 'birth');
    if (birth) {
      const parts: string[] = [];
      if (birth.place_name) parts.push(birth.place_name);
      if (birth.date_value) parts.push('b. ' + birth.date_value);
      birthSummary.value = parts.length > 0 ? parts.join(', ') : '';
    } else {
      birthSummary.value = '';
    }

    // Load remaining data in parallel
    await Promise.all([
      loadPersonTasks(),
      loadPersonGroups(),
      loadProfilePic(),
    ]);
    await autoNarrate(eventsData);
  } catch (err) {
    console.error('[PersonDetailView] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

async function autoNarrate(eventsData?: Array<{ event_type: string; date_value: string | null; place_name?: string | null }>) {
  if (!ttsEnabled.value) return;
  const primaryName_ = names.value[0];
  const name = primaryName_
    ? ((primaryName_.given_name || '') + ' ' + (primaryName_.surname || '')).trim() || 'Unknown'
    : 'Unknown';

  let birthDate: string | undefined;
  let birthPlace: string | undefined;
  let deathDate: string | undefined;
  let deathPlace: string | undefined;

  const events = eventsData ?? await window.api.events.forPerson(personId) as Array<{ event_type: string; date_value: string | null; place_name?: string | null }>;
  const birth = events.find(e => e.event_type === 'birth');
  const death = events.find(e => e.event_type === 'death');
  birthDate = birth?.date_value ?? undefined;
  birthPlace = birth?.place_name ?? undefined;
  deathDate = death?.date_value ?? undefined;
  deathPlace = death?.place_name ?? undefined;

  const text = narratePerson({ name, birthDate, birthPlace, deathDate, deathPlace }, narrationLabelsFromI18n(t));
  speak(text, locale.value);
}

async function loadProfilePic() {
  if (!person.value) { profilePicUrl.value = null; return; }
  const mediaItems = await window.api.media.forEntity('person', person.value.id) as Array<{ id: string }>;
  if (mediaItems.length > 0) {
    profilePicUrl.value = await window.api.media.readAsDataUrl(mediaItems[0].id) as string | null;
  } else {
    profilePicUrl.value = null;
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

function onDetailUpdated(field: string, value: unknown) {
  if (!person.value) return;
  if (field === 'sex') person.value.sex = value as string;
  if (field === 'living') person.value.living = value as number;
}

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
      showNameForm.value = true;
      break;
    case 'add-father':
      addRelatedMode.value = 'father';
      showAddRelated.value = true;
      break;
    case 'add-mother':
      addRelatedMode.value = 'mother';
      showAddRelated.value = true;
      break;
    case 'toggle-living':
      if (person.value) updateLiving(person.value.living ? 0 : 1);
      break;
  }
}

function jumpToSection(sectionId: string): void {
  const el = document.getElementById(sectionId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
    const firstFocusable = el.querySelector('[tabindex="0"], button, a, input, tr[tabindex]') as HTMLElement | null;
    if (firstFocusable) firstFocusable.focus();
    else el.focus();
  }
}

let cleanupHotkeys: (() => void) | undefined;

onMounted(async () => {
  await load();
  // Action query param is handled by the watch(person) above — no need to clear it here.
  // IMPORTANT: Do NOT call router.replace to strip the query param — it changes route.fullPath
  // which is the component :key, causing the component to remount and destroy the modal.
  let debounce: ReturnType<typeof setTimeout> | null = null;
  (window.api as unknown as { onDataChanged: (cb: () => void) => void }).onDataChanged(() => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      checksSectionRef.value?.reload();
    }, 400);
  });

  if (screenReader.isScreenReader.value) {
    cleanupHotkeys = screenReader.registerHotkeys([
      { key: '1', action: () => jumpToSection('section-names'), description: t('personDetail.names') },
      { key: '2', action: () => jumpToSection('section-events'), description: t('events.title') },
      { key: '3', action: () => jumpToSection('section-relationships'), description: t('personDetail.relationships') },
      { key: '4', action: () => jumpToSection('section-media'), description: t('media.title') },
      { key: '5', action: () => jumpToSection('section-identifiers'), description: t('identifiers.title') },
      { key: '6', action: () => jumpToSection('section-checks'), description: t('quality.nav') },
    ]);
  }
});

onUnmounted(() => {
  cleanupHotkeys?.();
});

onBeforeRouteLeave(() => { stop(); });
</script>

<style scoped>
.person-detail {
  max-width: none;
}
.detail-header {
  margin-bottom: 24px;
}
.header-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--surface-border-subtle);
}
.profile-thumbnail {
  width: 56px;
  height: 72px;
  object-fit: cover;
  border-radius: 5px;
  border: 1px solid var(--surface-border);
  flex-shrink: 0;
}
.header-info {
  flex: 1;
}
.header-info h2 {
  margin: 0;
  font-size: var(--font-xl);
}
.header-summary {
  font-size: var(--font-sm);
  color: var(--text-muted);
  margin-top: 2px;
}
.summary-sep {
  margin: 0 6px;
}
.header-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.header-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.sex-select {
  padding: 2px 20px 2px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
  font-weight: 600;
  border: 1px solid var(--color-border-input);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath d='M0 2l4 4 4-4z' fill='%23666'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
}
.sex-select.sex-M { background-color: var(--color-sex-m-bg); color: var(--color-sex-m-text); }
.sex-select.sex-F { background-color: var(--color-sex-f-bg); color: var(--color-sex-f-text); }
.sex-select.sex-U { background-color: var(--color-sex-u-bg); color: var(--color-sex-u-text); }
.detail-section {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--surface-border-subtle, #eee);
}
textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  font-family: inherit;
  font-size: var(--font-base);
  resize: vertical;
}
.section-header-custom {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  padding: var(--space-sm, 8px) 0;
}
.section-title-label {
  font-weight: var(--font-weight-bold, 700);
  font-size: var(--font-base);
  color: var(--text-primary);
  margin-right: auto;
}
.section-count {
  font-weight: var(--font-weight-normal);
  color: var(--text-muted);
  font-size: var(--font-sm);
}
.rel-actions {
  display: flex;
  gap: 4px;
}
.group-picker-row {
  margin-bottom: 8px;
}
</style>
