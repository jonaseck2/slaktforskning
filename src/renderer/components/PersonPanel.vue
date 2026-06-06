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
            <span
              v-if="rawDisplayId !== null && rawDisplayId !== undefined"
              class="person-display-id"
              :title="$t('persons.displayIdLabel')"
            >#{{ rawDisplayId }}</span>
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
          <SectionEmpty
            v-if="names.length === 0"
            purpose-key="onboarding.empty.personNames.purpose"
            :action-label-key="props.readonly ? undefined : 'onboarding.empty.personNames.cta'"
            @action="openNameForm(null)"
          />
          <PersonNamesTable v-else :names="names" :birth-event-date="birthEventDate" :readonly="props.readonly" @edit="openNameForm" @delete="deleteName" @reorder="reorderNames" />
        </div>
      </div>

      <!-- Identifierare section. v-show on the outer div hides it entirely when
           the person has no identifiers (power-user feature — not shown until
           data exists). The child stays mounted via the outer v-show so
           identifierCount stays live without a separate data probe. -->
      <div v-show="identifierCount > 0" class="panel-section">
        <SectionHeader :title="$t('personDetail.identifiers')" :count="identifierCount" :collapsed="!sections.identifiers" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('personDetail.addIdentifierShort') }" @toggle="toggleSection('identifiers')" @action="identifiersSectionRef?.openAddForm()" />
        <div v-show="sections.identifiers" class="panel-section-body">
          <PersonIdentifiersSection ref="identifiersSectionRef" :person-id="personId!" :readonly="props.readonly" />
        </div>
      </div>

      <!-- Händelser section -->
      <div class="panel-section">
        <SectionHeader :title="$t('panel.events')" :count="eventCount" :collapsed="!sections.events" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('events.event') }" @toggle="toggleSection('events')" @action="triggerAddEvent" />
        <div v-if="sections.events" class="panel-section-body">
          <EventList ref="eventListRef" :person-id="personId!" :readonly="props.readonly" hide-header />
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
        <SectionHeader :title="$t('groups.title')" :count="groups.length" :collapsed="!sections.groups" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('groups.addGroupShort') }" @toggle="toggleSection('groups')" @action="openGroupPicker" />
        <div v-if="sections.groups" class="panel-section-body">
          <div v-if="!props.readonly && showGroupPicker && personId" class="panel-group-picker-wrap">
            <GroupPicker
              :person-id="personId"
              :exclude-ids="groups.map(g => g.id)"
              @added="onGroupAdded"
              @cancel="showGroupPicker = false"
            />
          </div>
          <SectionEmpty
            v-if="groups.length === 0"
            purpose-key="onboarding.empty.personGroups.purpose"
            :action-label-key="props.readonly ? undefined : 'onboarding.empty.personGroups.cta'"
            @action="showGroupPicker = true"
          />
          <GroupsTable v-else :groups="groups" :readonly="props.readonly" v-bind="props.readonly ? {} : { onRemove: removeFromGroup }" @select="(id) => router.push('/groups/' + id)" />
        </div>
      </div>

      <!-- Sources section (T11) — citations attached directly to the person.
           Citations on this person's events live in the per-event citations
           list; this section is for evidence about the person themselves. -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('personSources.title')"
          :count="sourceCount"
          :collapsed="!sections.sources"
          v-bind="props.readonly ? {} : { actionLabel: $t('personSources.add') }"
          @toggle="toggleSection('sources')"
          @action="openAddCitation"
        />
        <div v-if="sections.sources" class="panel-section-body">
          <PersonSourcesSection
            ref="sourcesSectionRef"
            :person-id="personId!"
            :readonly="props.readonly"
            @add-source="openAddCitation"
            @edit-citation="onEditCitation"
          />
        </div>
      </div>

      <!-- Person associations section (T21) — GEDCOM 7.0 ASSO without event.
           Friends, colleagues, godparents-in-general, neighbours, enemies.
           Distinct from event_participants (godparents tied to a specific
           baptism) and from relationships (couple/parent-child/sibling). -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('personAssociations.title')"
          :count="associationCount"
          :collapsed="!sections.associations"
          v-bind="props.readonly ? {} : { actionLabel: $t('personAssociations.add') }"
          @toggle="toggleSection('associations')"
          @action="associationsSectionRef?.openAddForm()"
        />
        <div v-if="sections.associations" class="panel-section-body">
          <PersonAssociationsSection
            ref="associationsSectionRef"
            :person-id="personId!"
            :readonly="props.readonly"
          />
        </div>
      </div>

      <!-- Shared notes (T20) — first-class notes attached to this person via
           note_links. Distinct from the per-row `persons.notes` text-blob
           column, which is edited inline in the Person section above. -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('notes.title')"
          :count="sharedNotesCount"
          :collapsed="!sections.sharedNotes"
          v-bind="props.readonly ? {} : { actionLabel: $t('notes.add') }"
          @toggle="toggleSection('sharedNotes')"
          @action="sharedNotesSectionRef?.openAddChoice()"
        />
        <div v-if="sections.sharedNotes" class="panel-section-body">
          <EntityNotesSection
            ref="sharedNotesSectionRef"
            entity-type="person"
            :entity-id="personId!"
            :readonly="props.readonly"
          />
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

      <!-- Forskning section. v-show (not v-if) keeps the section component
           mounted while collapsed so its `defineExpose({ count })` is live —
           otherwise the (N) count badge falls back to 0 whenever the section
           is closed, contradicting the DB and confusing the user. The child
           uses useEntityData with caching so the per-mount fetch is cheap. -->
      <div class="panel-section">
        <SectionHeader :title="$t('researchTasks.nav')" :count="researchTaskCount" :collapsed="!sections.research" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('researchTasks.addTask') }" @toggle="toggleSection('research')" @action="openTaskPicker()" />
        <div v-show="sections.research" class="panel-section-body">
          <div v-if="!props.readonly && showTaskPicker && personId" class="panel-group-picker-wrap">
            <ResearchTaskPicker
              :person-id="personId"
              :exclude-ids="researchTaskIds"
              @added="onTaskAdded"
              @cancel="showTaskPicker = false"
            />
          </div>
          <PersonResearchTasksSection
            ref="researchSectionRef"
            :person-id="personId!"
            :readonly="props.readonly"
            @select="openTaskForm"
            @add-task="openTaskPicker()"
          />
        </div>
      </div>

      <!-- Quality section. Same v-show rationale as Forskning above. -->
      <div class="panel-section">
        <SectionHeader :title="$t('quality.nav')" :count="checkCount" :collapsed="!sections.quality" @toggle="toggleSection('quality')" />
        <div v-show="sections.quality" class="panel-section-body">
          <PersonChecksSection ref="checksSectionRef" :person-id="personId!" @fix="handleCheckFix" />
        </div>
      </div>

      <!-- Danger zone: delete person — single source of truth for entity-deletion UX. -->
      <PanelDangerZone
        v-if="personId"
        entity-type="person"
        :entity-id="personId"
        :entity-label="dangerEntityLabel"
        :cascade-summary="[deleteConfirmMessage]"
        :readonly="props.readonly"
        @deleted="onDeleted"
      />
    </template>

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
      :default-given-name="primaryName?.given_name ?? ''"
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

    <!-- Citation modal — opens with personId pre-set so the new citation is
         attached directly to this person (T11). -->
    <CitationModal
      v-if="showCitationModal && personId"
      mode="standalone"
      :person-id="personId"
      :editing-citation="editingCitation"
      @close="closeCitationModal"
      @cancel="closeCitationModal"
      @saved="onCitationSaved"
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
import ResearchTaskPicker from './ResearchTaskPicker.vue';
import PersonResearchTasksSection from './PersonResearchTasksSection.vue';
import PersonIdentifiersSection from './PersonIdentifiersSection.vue';
import PersonMediaSection from './PersonMediaSection.vue';
import MediaTimeline from './MediaTimeline.vue';
import PersonChecksSection from './PersonChecksSection.vue';
import PersonSourcesSection, { type CitationRow } from './PersonSourcesSection.vue';
import PersonAssociationsSection from './PersonAssociationsSection.vue';
import EntityNotesSection from './EntityNotesSection.vue';
import CitationModal from './modals/CitationModal.vue';
import PersonRelationshipsSection from './PersonRelationshipsSection.vue';
import PersonDetailsSection from './PersonDetailsSection.vue';
import PersonTimeline from './PersonTimeline.vue';
import PersonMap from './PersonMap.vue';
import AppAvatar from './ui/AppAvatar.vue';
import AppButton from './ui/AppButton.vue';
import EntityPanel from './EntityPanel.vue';
import PanelDangerZone from './PanelDangerZone.vue';
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
  display_id: number | null;
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
  notes?: string | null;
  result?: string | null;
  status: 'open' | 'in_progress' | 'done' | 'stopped';
  priority: number;
  created_at: string;
  updated_at: string;
}

interface PersonPanelData {
  person: PersonData | null;
  primaryName: NameData | null;
  names: NameData[];
  birthEventDate: string | null;
  groups: GroupData[];
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
    window.api.persons.get(id) as Promise<{ id: string; sex: string; living: boolean; display_id: number | null; created_at: string; updated_at: string } | null>,
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
      eventCount: 0,
      mapPointCount: 0,
      relationshipCount: 0,
      mediaCount: 0,
    };
  }

  const birth = events.find(e => e.event_type === 'birth');
  const death = events.find(e => e.event_type === 'death');

  const [birthLine, deathLine, grps, rels, media] = await Promise.all([
    buildDateLine(birth),
    buildDateLine(death),
    window.api.groups.forPerson(id) as Promise<GroupData[]>,
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
      display_id: raw.display_id,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    },
    primaryName: pickDisplayedName(fetchedNames, events),
    names: sortNamesBySortOrder(fetchedNames),
    birthEventDate: birthDateValue(events),
    groups: grps,
    eventCount: events.length,
    mapPointCount: events.filter(e => e.place_id).length,
    relationshipCount: rels.length,
    mediaCount: media.length,
  };
});

const person = computed(() => panelData.value?.person ?? null);
const rawDisplayId = computed(() => panelData.value?.person?.display_id ?? null);
const primaryName = computed(() => panelData.value?.primaryName ?? null);
const names = computed(() => panelData.value?.names ?? []);
const birthEventDate = computed(() => panelData.value?.birthEventDate ?? null);
const groups = computed(() => panelData.value?.groups ?? []);
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
    identifiers: false,
    events: true,
    timeline: false,
    map: false,
    relationships: true,
    groups: false,
    research: false,
    media: false,
    mediaTimeline: false,
    sources: false,
    associations: false,
    sharedNotes: false,
    quality: false,
  },
  {
    person: true, names: true, events: true, timeline: true, map: true,
    relationships: true, groups: true, research: false,
    media: true, mediaTimeline: true, sources: false,
    associations: false,
    sharedNotes: false, quality: false,
  },
);

// ── Template refs ───────────────────────────────────────────────────────────

const eventListRef = ref<(ComponentPublicInstance & { openAddForm: (eventType?: string) => void }) | null>(null);
const mediaSectionRef = ref<InstanceType<typeof PersonMediaSection> | null>(null);
const checksSectionRef = ref<(InstanceType<typeof PersonChecksSection> & { count: number; reload: () => void }) | null>(null);
const sharedNotesSectionRef = ref<(InstanceType<typeof EntityNotesSection> & { count: number; openAddChoice: () => void }) | null>(null);
const sharedNotesCount = computed(() => sharedNotesSectionRef.value?.count ?? 0);
const relSectionRef = ref<InstanceType<typeof PersonRelationshipsSection> | null>(null);
const researchSectionRef = ref<InstanceType<typeof PersonResearchTasksSection> | null>(null);
const researchTaskCount = computed(() => researchSectionRef.value?.count ?? 0);
const researchTaskIds = computed<string[]>(() => researchSectionRef.value?.taskIds ?? []);
const identifiersSectionRef = ref<InstanceType<typeof PersonIdentifiersSection> | null>(null);
const identifierCount = computed(() => identifiersSectionRef.value?.count ?? 0);
const sourcesSectionRef = ref<InstanceType<typeof PersonSourcesSection> | null>(null);
const sourceCount = computed(() => sourcesSectionRef.value?.count ?? 0);
const associationsSectionRef = ref<(InstanceType<typeof PersonAssociationsSection> & { count: number; reload: () => void; openAddForm: () => void }) | null>(null);
const associationCount = computed(() => associationsSectionRef.value?.count ?? 0);

// ── Citation modal state (T11) ──────────────────────────────────────────────

const showCitationModal = ref(false);
const editingCitation = ref<CitationRow | null>(null);

function openAddCitation() {
  editingCitation.value = null;
  showCitationModal.value = true;
}
function onEditCitation(cit: CitationRow) {
  editingCitation.value = cit;
  showCitationModal.value = true;
}
function closeCitationModal() {
  showCitationModal.value = false;
  editingCitation.value = null;
}
async function onCitationSaved() {
  closeCitationModal();
  await sourcesSectionRef.value?.reload();
}

// ── Cross-section add actions ───────────────────────────────────────────────

async function triggerAddEvent() {
  if (!sections.events) toggleSection('events');
  await nextTick();
  eventListRef.value?.openAddForm();
}

// ── Delete person ───────────────────────────────────────────────────────────
// PanelDangerZone owns the trash button, ConfirmModal, and the
// window.api.persons.delete call. We supply the cascade summary
// (panel-specific domain knowledge: relationship count) and react to
// @deleted with toast + emits + nav.

const dangerEntityLabel = computed(() => {
  if (!primaryName.value) return t('common.unknown');
  return [primaryName.value.given_name, primaryName.value.surname].filter(Boolean).join(' ');
});

const deleteConfirmMessage = computed(() =>
  t('persons.deleteConfirmMessage', {
    name: dangerEntityLabel.value,
    relationships: relationshipCount.value,
  }),
);

function onDeleted() {
  toast.success(t('persons.deletedToast', { name: dangerEntityLabel.value }));
  emit('person-changed');
  emit('close');
  router.push('/persons');
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

// Mirrors openTaskPicker(): always expand the section AND open the picker.
// The previous handler was an inline `showGroupPicker = !showGroupPicker`
// toggle on the SectionHeader's @action, which (a) silently toggled state
// without expanding the section when collapsed (the picker DOM lives
// inside the section-body v-if), and (b) closed the picker on a second
// click instead of opening it — a Surface Contract "no silent
// degradation" violation across collapsed/expanded state.
function openGroupPicker() {
  if (!sections.groups) toggleSection('groups');
  showGroupPicker.value = true;
}

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
// `+ Task` opens the picker (mirrors `+ Group`), letting the user pick an
// existing task to link to this person OR type a new task name and create
// it inline. The full ResearchTaskModal still opens via row-click for
// editing existing tasks.
const showTaskPicker = ref(false);

function openTaskForm(task: ResearchTaskRow | null = null) {
  editingTask.value = task;
  showTaskForm.value = true;
}

function openTaskPicker() {
  // Make sure the section is open so the inline picker is visible.
  if (!sections.research) toggleSection('research');
  showTaskPicker.value = true;
}

async function onTaskAdded() {
  showTaskPicker.value = false;
  // Picker mutated through `mutating()`-wrapped IPCs, so the section's
  // `useEntityData` already reloads via onDataChanged. Reload PersonPanel's
  // own data so dependent counts/caches stay fresh.
  await reload();
}

function closeTaskForm() {
  showTaskForm.value = false;
  editingTask.value = null;
}

async function onTaskSaved() {
  closeTaskForm();
  // The new task linked to this person triggers `onDataChanged` which
  // reloads PersonResearchTasksSection automatically. Reload PersonPanel's
  // own data as well so other dependent caches stay fresh.
  await reload();
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

.person-display-id {
  font-size: var(--font-xs);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono, ui-monospace, monospace);
  margin-right: var(--space-sm);
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
