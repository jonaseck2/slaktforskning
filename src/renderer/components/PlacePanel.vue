<template>
  <EntityPanel
    entity-type="place"
    :entity="place"
    :label="$t('panel.managePlace')"
    @close="emit('close')"
  >
    <template #empty>{{ $t('placePanel.noPlaceSelected') }}</template>
    <template #header>
      <div class="place-panel-hero">
        <button
          v-if="heroSrc && heroMediaId"
          type="button"
          class="place-panel-hero-photo"
          :title="$t('media.title')"
          @click="$router.push('/media?open=' + heroMediaId)"
        >
          <img :src="heroSrc" :alt="place?.name ?? ''" />
        </button>
        <div class="panel-name-row">
          <div class="panel-name">{{ place?.name }}</div>
          <span v-if="place?.place_type" class="place-type-badge">{{ $t('placeTypes.' + place.place_type) }}</span>
        </div>
      </div>
    </template>

    <template v-if="place">
      <!-- Place section -->
      <div class="panel-section">
        <SectionHeader :title="$t('places.detailsTitle')" :collapsed="!sections.place" @toggle="toggleSection('place')" />
        <div v-if="sections.place" class="panel-section-body">
          <div v-if="!props.readonly" class="compact-form">
            <!-- Place name -->
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.name') }}</label>
              <PlaceNameAutocomplete
                :model-value="place.name"
                :exclude-place-id="place.id"
                @update:model-value="draftName = $event"
                @change="(v: string) => { draftName = ''; saveField('name', v.trim() || place.name); }"
              />
            </div>

            <PlaceFormFields
              :form="placeFormView"
              :resolved-match="resolvedMatch"
              :resolved-type-label="resolvedTypeLabel"
              :resolved-parent-path="resolvedParentPath"
              @update:field="onPlaceFieldUpdate"
            >
              <template #coord-extras>
                <button
                  type="button"
                  class="coord-pick-btn"
                  :class="{ 'is-active': props.pickMode }"
                  :title="$t('places.pickCoordsTitle')"
                  :aria-label="$t('places.pickCoordsTitle')"
                  :aria-pressed="props.pickMode ? 'true' : 'false'"
                  @click="onPickCoordsClick"
                >📍</button>
              </template>
            </PlaceFormFields>

            <!-- Notes -->
            <div class="compact-field">
              <div class="notes-heading-row">
                <label class="compact-label">{{ $t('panel.notes') }}</label>
                <AppButton
                  variant="soft"
                  size="sm"
                  :aria-pressed="notesMonospaced"
                  :title="$t('common.monospacedTooltip')"
                  @click="toggleNotesMonospaced"
                >
                  <span class="mono-toggle-label">{{ $t('common.monospaceLabel') }}</span>
                </AppButton>
              </div>
              <textarea
                ref="notesRef"
                class="compact-control"
                rows="2"
                :value="place.notes ?? ''"
                :class="{ 'notes-mono': notesMonospaced }"
                :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
                @blur="persistNotesHeight(); saveField('notes', ($event.target as HTMLTextAreaElement).value || null)"
                @mouseup="persistNotesHeight"
              />
            </div>
          </div>
          <div v-else class="compact-form">
            <div v-if="place.place_type" class="compact-field">
              <span class="compact-label">{{ $t('places.type') }}</span>
              <span class="readonly-value">{{ $t('placeTypes.' + place.place_type) }}</span>
            </div>
            <div v-if="place.latitude != null || place.longitude != null" class="compact-field">
              <span class="compact-label">{{ $t('places.coordinates') }}</span>
              <span class="readonly-value">{{ place.latitude ?? '—' }}, {{ place.longitude ?? '—' }}</span>
            </div>
            <div v-if="resolvedMatch" class="compact-field resolved-field">
              <span class="compact-label">{{ $t('gazetteers.resolvedVia') }}</span>
              <span class="resolved-value">
                <span :class="'resolved-quality match-' + resolvedMatch.matchQuality">{{ $t('gazetteers.match.' + resolvedMatch.matchQuality) }}</span>
                <code v-if="resolvedSource" class="resolved-gaz">{{ resolvedSource }}</code>
                <span class="resolved-path">{{ resolvedMatch.matchedPath.join(' › ') }}</span>
              </span>
            </div>
            <div v-if="place.notes" class="compact-field">
              <span class="compact-label">{{ $t('panel.notes') }}</span>
              <LinkedText :text="place.notes" class="readonly-value" />
            </div>
          </div>
        </div>
      </div>

      <!-- Events section -->
      <div class="panel-section">
        <SectionHeader :title="$t('panel.events')" :count="eventCount" :collapsed="!sections.events" :action-label="!props.readonly ? '+ ' + $t('events.event') : undefined" @toggle="toggleSection('events')" @action="eventListRef?.openAddForm()" />
        <div v-if="sections.events" class="panel-section-body">
          <EventList ref="eventListRef" :place-id="placeId!" :readonly="props.readonly" hide-header show-persons />
        </div>
      </div>

      <!-- Timeline section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('placeTimeline.title')"
          :count="eventCount"
          :collapsed="!sections.timeline"
          :action-label="!props.readonly ? '+ ' + $t('events.event') : undefined"
          @toggle="toggleSection('timeline')"
          @action="eventListRef?.openAddForm()"
        />
        <div v-if="sections.timeline" class="panel-section-body">
          <PlaceTimeline :place-id="placeId!" />
        </div>
      </div>

      <!-- Persons section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('persons.title')"
          :count="personCount"
          :collapsed="!sections.persons"
          @toggle="toggleSection('persons')"
        />
        <div v-if="sections.persons" class="panel-section-body">
          <p class="running-hint">{{ $t('placePanel.personsDerivedHint') }}</p>
          <PlacePersonsSection ref="personsSectionRef" :place-id="placeId!" />
        </div>
      </div>

      <!-- Media section -->
      <div class="panel-section">
        <SectionHeader :title="$t('media.title')" :count="mediaCount" :collapsed="!sections.media" :action-label="!props.readonly ? '+ ' + $t('media.attachShort') : undefined" @toggle="toggleSection('media')" @action="mediaSectionRef?.attach()" />
        <div v-if="sections.media" class="panel-section-body">
          <EntityMediaSection ref="mediaSectionRef" entity-type="place" :entity-id="placeId!" :readonly="props.readonly" />
        </div>
      </div>

      <!-- Media Timeline section -->
      <div class="panel-section">
        <SectionHeader :title="$t('mediaTimeline.title')" :count="mediaCount" :collapsed="!sections.mediaTimeline" @toggle="toggleSection('mediaTimeline')" />
        <div v-if="sections.mediaTimeline" class="panel-section-body">
          <MediaTimeline entity-type="place" :entity-id="placeId!" />
        </div>
      </div>

      <!-- Research Tasks section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('researchTasks.nav')"
          :count="researchTasks.length"
          :collapsed="!sections.tasks"
          :action-label="!props.readonly ? '+ ' + $t('researchTasks.addTask') : undefined"
          @toggle="toggleSection('tasks')"
          @action="openTaskForm()"
        />
        <div v-if="sections.tasks" class="panel-section-body">
          <SectionEmpty
            v-if="researchTasks.length === 0"
            purpose-key="onboarding.empty.placeResearchTasks.purpose"
            :action-label-key="props.readonly ? undefined : 'onboarding.empty.placeResearchTasks.cta'"
            @action="openTaskForm()"
          />
          <ResearchTasksTable
            v-else
            :tasks="researchTasks"
            :readonly="props.readonly"
            @select="openTaskFromRow"
          />
        </div>
      </div>

      <!-- Sources section (T12) — citations attached directly to the place.
           Citations on events at this place live in the per-event citations
           list; this section is for evidence about the place itself. -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('placeSources.title')"
          :count="sourceCount"
          :collapsed="!sections.sources"
          :action-label="!props.readonly ? $t('placeSources.add') : undefined"
          @toggle="toggleSection('sources')"
          @action="openAddCitation"
        />
        <div v-if="sections.sources" class="panel-section-body">
          <PlaceSourcesSection
            ref="sourcesSectionRef"
            :place-id="placeId!"
            :readonly="props.readonly"
            @add-source="openAddCitation"
            @edit-citation="onEditCitation"
          />
        </div>
      </div>

      <!-- Quality section. v-show (not v-if) keeps the child mounted so its
           defineExpose({ count }) is live — otherwise the (N) count badge
           is 0 whenever the section is closed, contradicting the DB. The
           child caches via useEntityData so the per-mount fetch is cheap. -->
      <div class="panel-section">
        <SectionHeader :title="$t('quality.nav')" :count="checkCount" :collapsed="!sections.quality" @toggle="toggleSection('quality')" />
        <div v-show="sections.quality" class="panel-section-body">
          <PlaceChecksSection ref="checksSectionRef" :place-id="placeId!" />
        </div>
      </div>

      <!-- Danger zone: delete place — single source of truth for entity-deletion UX. -->
      <PanelDangerZone
        v-if="placeId"
        entity-type="place"
        :entity-id="placeId"
        :entity-label="dangerEntityLabel"
        :cascade-summary="[deleteConfirmMessage]"
        :readonly="props.readonly"
        @deleted="onDeleted"
      />
    </template>

    <!-- Citation modal — opens with placeId pre-set so the new citation is
         attached directly to this place (T12). -->
    <CitationModal
      v-if="showCitationModal && placeId"
      mode="standalone"
      :place-id="placeId"
      :editing-citation="editingCitation"
      @close="closeCitationModal"
      @cancel="closeCitationModal"
      @saved="onCitationSaved"
    />

    <!-- Research task form modal -->
    <ResearchTaskModal
      v-if="!props.readonly && showTaskForm && placeId"
      mode="standalone"
      :place-id="placeId"
      :editing-task="editingTask"
      @cancel="closeTaskForm"
      @close="closeTaskForm"
      @saved="onTaskSaved"
    />
  </EntityPanel>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import EventList from './EventList.vue';
import LinkedText from './LinkedText.vue';
import ResearchTaskModal from './modals/ResearchTaskModal.vue';
import ResearchTasksTable from './ResearchTasksTable.vue';
import PlacePersonsSection from './PlacePersonsSection.vue';
import EntityMediaSection from './EntityMediaSection.vue';
import MediaTimeline from './MediaTimeline.vue';
import PlaceTimeline from './PlaceTimeline.vue';
import PlaceFormFields, { type PlaceFormShape } from './PlaceFormFields.vue';
import PlaceNameAutocomplete from './PlaceNameAutocomplete.vue';
import PlaceChecksSection from './PlaceChecksSection.vue';
import PlaceSourcesSection, { type CitationRow } from './PlaceSourcesSection.vue';
import CitationModal from './modals/CitationModal.vue';
import EntityPanel from './EntityPanel.vue';
import PanelDangerZone from './PanelDangerZone.vue';
import type { ComponentPublicInstance, Ref } from 'vue';
import SectionHeader from './ui/SectionHeader.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import AppButton from './ui/AppButton.vue';
import { useToast } from '../composables/useToast';
import { usePanelSections } from '../composables/usePanelSections';
import { useTextareaHeight } from '../composables/useTextareaHeight';
import { useMonospacedNotes } from '../composables/useMonospacedNotes';
import { useEntityData } from '../composables/useEntityData';
import { useEditableFields } from '../composables/useEditableFields';
import { useResolvedPlace } from '../composables/useResolvedPlace';
import type { ResearchTask } from '../../api/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface Place {
  id: string;
  name: string;
  place_type?: string | null;
  parent_place_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
}

interface ChildPlace {
  id: string;
  name: string;
  parent_place_id: string | null;
}

const props = defineProps<{ placeId: string | null; readonly?: boolean; pickMode?: boolean }>();
const emit = defineEmits<{
  'select-place': [id: string];
  'close': [];
  'place-updated': [id: string];
  'pick-coords': [];
  'cancel-pick': [];
}>();

const { t } = useI18n();
const toast = useToast();

// ── Section state ───────────────────────────────────────────────────────────

const { sections, toggleSection } = usePanelSections(
  'place-panel-section-',
  {
    place: true, persons: true, events: true, timeline: false,
    media: false, mediaTimeline: false, tasks: false, sources: false, quality: false,
  },
  {
    place: true, persons: true, events: true, timeline: true,
    media: true, mediaTimeline: true, tasks: true, sources: false, quality: false,
  },
);

// ── Template refs ───────────────────────────────────────────────────────────

const eventListRef = ref<(ComponentPublicInstance & { openAddForm: () => void }) | null>(null);
const mediaSectionRef = ref<InstanceType<typeof EntityMediaSection> | null>(null);
const checksSectionRef = ref<InstanceType<typeof PlaceChecksSection> | null>(null);
const checkCount = computed(() => checksSectionRef.value?.count ?? 0);
const personsSectionRef = ref<InstanceType<typeof PlacePersonsSection> | null>(null);
const sourcesSectionRef = ref<InstanceType<typeof PlaceSourcesSection> | null>(null);
const sourceCount = computed(() => sourcesSectionRef.value?.count ?? 0);

// ── Citation modal state (T12) ──────────────────────────────────────────────

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

const { textareaRef: notesRef, storedHeight: notesStoredHeight, persistHeight: persistNotesHeight } = useTextareaHeight('place-panel-notes');
const { monospaced: notesMonospaced, toggle: toggleNotesMonospaced } = useMonospacedNotes('place');

// ── Data ────────────────────────────────────────────────────────────────────

interface PlacePanelData {
  place: Place | null;
  ancestors: ChildPlace[];
  personCount: number;
  eventCount: number;
  mediaCount: number;
}

const idRef = computed(() => props.placeId ?? null);
const { data: panelData } = useEntityData<PlacePanelData>(idRef, async (id) => {
  const [p, allPlaces] = await Promise.all([
    window.api.places.get(id) as Promise<Place | null>,
    window.api.places.list() as Promise<ChildPlace[]>,
  ]);

  // Build ancestor chain by walking up parent_place_id (used to feed the gazetteer
  // resolver with the full hierarchy, e.g. "Vienna, Austria").
  const chain: ChildPlace[] = [];
  const placeMap = new Map(allPlaces.map(pl => [pl.id, pl]));
  let parentId = p?.parent_place_id ?? null;
  while (parentId) {
    const parent = placeMap.get(parentId);
    if (!parent) break;
    chain.push(parent);
    parentId = parent.parent_place_id;
  }

  // Load counts for collapsed section headers
  let personCount = 0;
  let eventCount = 0;
  let mediaCount = 0;
  try {
    const [persons, events, media] = await Promise.all([
      window.api.places.getPersons(id) as Promise<unknown[]>,
      window.api.events.forPlace(id) as Promise<unknown[]>,
      window.api.media.forEntity('place', id) as Promise<unknown[]>,
    ]);
    personCount = persons.length;
    eventCount = events.length;
    mediaCount = media.length;
  } catch {
    // counts are non-critical
  }

  return { place: p, ancestors: chain, personCount, eventCount, mediaCount };
});

const place = computed(() => panelData.value?.place ?? null);
const ancestors = computed(() => panelData.value?.ancestors ?? []);

// Gazetteer resolution: surface which gazetteer the resolver picked, at what
// quality, and what the resolved values would be. Per the Prime Directive,
// these previewed values are NEVER persisted; they are recomputed every render
// by the shared composable below (also used by PlaceModal).
//
// `draftName` mirrors what the user is currently typing in the Name field
// (emitted from PlaceNameAutocomplete via @update:model-value). Feeding it
// into the resolver lets the Type / Parent / Coordinates Resolved chips
// re-preview live as the user types — same UX as PlaceModal, where the
// modal's `form.name` is v-modeled directly into the resolver. Cleared on
// commit (@change) so the chips fall back to the saved place.name once the
// user is done.
const draftName = ref('');
const placeNameRef = computed(() => draftName.value || place.value?.name || '');
const ancestorNamesRef = computed(() => ancestors.value.map(a => a.name));
const { resolvedMatch, resolvedTypeLabel, resolvedParentPath } = useResolvedPlace(
  placeNameRef,
  ancestorNamesRef,
);

// Source provenance for the resolved-via line. The merge engine collapses
// every source into one synthetic gazetteer (`__merged__`), so the useful
// "where did this come from?" data lives on the matched node's
// `__contributors`. Show the contributor IDs; suppress the synthetic id.
const resolvedSource = computed<string | null>(() => {
  if (!resolvedMatch.value) return null;
  const node = resolvedMatch.value.matchedNode as { __contributors?: string[] };
  const contributors = node.__contributors ?? [];
  if (contributors.length === 0) return null;
  if (contributors.length === 1) return contributors[0];
  return contributors.join(', ');
});

const personCount = computed(() => panelData.value?.personCount ?? 0);
const eventCount = computed(() => panelData.value?.eventCount ?? 0);
const mediaCount = computed(() => panelData.value?.mediaCount ?? 0);

// ── Field updates ────────────────────────────────────────────────────────────

const persistPlace = async (id: string, patch: Partial<Place>) => {
  await window.api.places.update(id, patch);
  emit('place-updated', id);
};
const { fields, save } = useEditableFields<Place & Record<string, unknown>>(
  idRef,
  place as unknown as Ref<(Place & Record<string, unknown>) | null>,
  persistPlace,
);

async function saveField(field: string, value: unknown) {
  if (!props.placeId || !place.value || props.readonly) return;
  (fields as Record<string, unknown>)[field] = value;
  await save(field as keyof Place);
}

const placeFormView = computed<PlaceFormShape>(() => ({
  place_type: place.value?.place_type ?? null,
  parent_place_id: place.value?.parent_place_id ?? null,
  latitude: place.value?.latitude ?? null,
  longitude: place.value?.longitude ?? null,
}));

function onPlaceFieldUpdate(field: keyof PlaceFormShape, value: unknown) {
  saveField(field, value);
}


// ── Map-pick coordinates ─────────────────────────────────────────────────────

function onPickCoordsClick() {
  if (props.readonly) return;
  if (props.pickMode) {
    emit('cancel-pick');
  } else {
    emit('pick-coords');
  }
}

// ── Research tasks ──────────────────────────────────────────────────────────

// useEntityData auto-subscribes to onDataChanged, so the list refreshes after
// any mutation (this panel's task modal, a sibling window, an MCP call) without
// a manual loadTasks() call. Pre-2026-05: this used a ref + watch + manual
// loadTasks; saving a task in the modal left the list stale until panel reopen.
const { data: tasksData } = useEntityData<ResearchTask[]>(
  idRef,
  async (id) => (await window.api.researchTasks.forPlace(id)) as ResearchTask[],
);
const researchTasks = computed<ResearchTask[]>(() => tasksData.value ?? []);
const showTaskForm = ref(false);
const editingTask = ref<ResearchTask | null>(null);

function openTaskForm(task: ResearchTask | null = null) {
  editingTask.value = task;
  showTaskForm.value = true;
}

function closeTaskForm() {
  showTaskForm.value = false;
  editingTask.value = null;
}

function onTaskSaved() {
  closeTaskForm();
  // useEntityData's onDataChanged subscription handles the reload.
}

function openTaskFromRow(id: string) {
  const task = researchTasks.value.find(t => t.id === id);
  if (task) openTaskForm(task);
}

// ── Delete place ────────────────────────────────────────────────────────────
// PanelDangerZone owns the trash button, ConfirmModal, and the
// window.api.places.delete call. We supply the cascade summary
// (panel-specific domain knowledge: event/person/media counts) and
// react to @deleted with toast + close.

const dangerEntityLabel = computed(() => place.value?.name ?? t('common.unknown'));

const deleteConfirmMessage = computed(() =>
  t('places.deleteConfirmMessage', {
    name: dangerEntityLabel.value,
    events: eventCount.value,
    persons: personCount.value,
    media: mediaCount.value,
  }),
);

function onDeleted() {
  toast.success(t('places.deletedToast', { name: dangerEntityLabel.value }));
  emit('close');
}

const heroMediaId = ref<string | null>(null);
const heroSrc = ref<string | null>(null);

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif)$/i;

function isImageMedia(m: { format?: string | null; file_ref?: string | null }): boolean {
  if (m.format && /^image\//i.test(m.format)) return true;
  if (m.file_ref && IMAGE_EXT.test(m.file_ref)) return true;
  return false;
}

async function loadHero() {
  heroMediaId.value = null;
  heroSrc.value = null;
  if (!props.placeId) return;
  try {
    const items = (await window.api.media.forEntity('place', props.placeId)) as Array<{ id: string; format: string | null; file_ref: string | null; sort_order: number }>;
    const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
    const first = sorted.find(isImageMedia);
    if (!first) return;
    heroMediaId.value = first.id;
    heroSrc.value = (await window.api.media.readAsDataUrl(first.id)) as string | null;
  } catch (err) {
    console.error('[PlacePanel] loadHero failed:', err);
  }
}

watch(() => props.placeId, () => { void loadHero(); }, { immediate: true });
</script>

<style scoped>
/* Header slot content — rendered in EntityPanel's `<slot name="header">`
   but owned by this template, so PlacePanel's scope hash applies. */
.panel-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-bottom: var(--space-xs);
}
.panel-name {
  font-size: var(--font-base);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.place-type-badge {
  flex-shrink: 0;
  background: var(--surface-bg);
  color: var(--text-muted);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  font-size: var(--font-xs);
}
.panel-view-full {
  font-size: var(--font-xs);
  color: var(--accent);
  text-decoration: none;
}
.panel-view-full:hover { text-decoration: underline; }

/* Sections */
.panel-section {
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  padding: 0 var(--space-lg);
}
.panel-section-body { padding: var(--space-xs) 0 var(--space-sm); }

/* Compact form */
.compact-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.compact-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.compact-label {
  font-size: var(--font-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.4px;
}
.compact-control {
  font-size: var(--font-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-primary);
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  resize: vertical;
}
.compact-control:focus {
  outline: none;
  border-color: var(--accent);
}

.readonly-value {
  font-size: var(--font-xs);
  color: var(--text-primary);
  padding: var(--space-xs) 0;
}

/* Map-pick button — stays in PlacePanel because it's panel-specific (rendered
   into PlaceFormFields' #coord-extras slot). The lat/long row + resolved-chip
   styling lives in PlaceFormFields.vue. */
.coord-pick-btn {
  flex: 0 0 auto;
  padding: 0 var(--space-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: var(--font-base);
  cursor: pointer;
  line-height: 1;
}
.coord-pick-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}
.coord-pick-btn.is-active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text, #fff);
}

/* Resolved-via line still appears in the read-only fallback view below, so
   keep these styles scoped to the panel for that case. */
.resolved-field { margin-top: var(--space-xs); }
.resolved-value {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--font-xs);
  padding: var(--space-xs) 0;
  min-width: 0;
}
.resolved-quality, .resolved-gaz { flex-shrink: 0; }
.resolved-quality {
  display: inline-block;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  line-height: 1.4;
}
.resolved-quality.match-exact { background: var(--success-bg); color: var(--success-text); }
.resolved-quality.match-partial { background: var(--warning-bg); color: var(--warning-text); }
.resolved-quality.match-ambiguous { background: var(--error-bg); color: var(--error-text); }
.resolved-gaz {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.95em;
  background: var(--surface-hover);
  border-radius: var(--radius-sm);
  padding: 0 4px;
  color: var(--text-secondary);
}
.resolved-path {
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.notes-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}
textarea.compact-control.notes-mono {
  font-family: var(--font-mono);
}
.place-panel-hero { display: flex; flex-direction: column; gap: var(--space-xs); }
.place-panel-hero-photo {
  display: block;
  width: 100%;
  max-height: 180px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius-md);
  overflow: hidden;
}
.place-panel-hero-photo img {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 180px;
  object-fit: cover;
}
.place-panel-hero-photo:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
