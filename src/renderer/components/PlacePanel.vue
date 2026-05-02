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
            <!-- Place name (PlacePicker also acts as merge-from-existing) -->
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.name') }}</label>
              <PlacePicker
                :model-value="placeId"
                @select="onNamePlaceSelected"
              />
            </div>

            <!-- Type -->
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.type') }}</label>
              <div class="field-resolved-wrap" :class="{ 'has-resolved': !place.place_type && resolvedTypeLabel }">
                <select
                  class="compact-control"
                  :value="place.place_type ?? ''"
                  @change="saveField('place_type', ($event.target as HTMLSelectElement).value || null)"
                >
                  <option value="">{{ !place.place_type && resolvedTypeLabel ? resolvedTypeLabel : '—' }}</option>
                  <option v-for="pt in PLACE_TYPE_VALUES" :key="pt" :value="pt">{{ $t('placeTypes.' + pt) }}</option>
                </select>
                <span v-if="!place.place_type && resolvedTypeLabel" class="resolved-chip-inline resolved-chip-select">{{ $t('places.resolvedBadge') }}</span>
              </div>
            </div>

            <!-- Parent place -->
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.parentPlace') }}</label>
              <div class="field-resolved-wrap" :class="{ 'has-resolved': !place.parent_place_id && resolvedParentPath }">
                <PlacePicker
                  :model-value="place.parent_place_id ?? null"
                  :placeholder="!place.parent_place_id && resolvedParentPath ? resolvedParentPath : undefined"
                  @update:model-value="saveField('parent_place_id', $event)"
                />
                <span v-if="!place.parent_place_id && resolvedParentPath" class="resolved-chip-inline resolved-chip-picker">{{ $t('places.resolvedBadge') }}</span>
              </div>
            </div>

            <!-- Coordinates: lat + long on one row, with map-pick icon button -->
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.coordinates') }}</label>
              <div class="coord-row">
                <div class="field-resolved-wrap coord-wrap" :class="{ 'has-resolved': place.latitude == null && resolvedMatch }">
                  <input
                    class="compact-control coord-input"
                    type="number"
                    step="any"
                    :placeholder="place.latitude == null && resolvedMatch ? formatCoord(resolvedMatch.lat) : $t('places.latitude')"
                    :aria-label="$t('places.latitude')"
                    :value="place.latitude ?? ''"
                    @blur="saveField('latitude', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null)"
                  />
                  <span v-if="place.latitude == null && resolvedMatch" class="resolved-chip-inline">{{ $t('places.resolvedBadge') }}</span>
                </div>
                <div class="field-resolved-wrap coord-wrap" :class="{ 'has-resolved': place.longitude == null && resolvedMatch }">
                  <input
                    class="compact-control coord-input"
                    type="number"
                    step="any"
                    :placeholder="place.longitude == null && resolvedMatch ? formatCoord(resolvedMatch.lon) : $t('places.longitude')"
                    :aria-label="$t('places.longitude')"
                    :value="place.longitude ?? ''"
                    @blur="saveField('longitude', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null)"
                  />
                  <span v-if="place.longitude == null && resolvedMatch" class="resolved-chip-inline">{{ $t('places.resolvedBadge') }}</span>
                </div>
                <button
                  type="button"
                  class="coord-pick-btn"
                  :class="{ 'is-active': props.pickMode }"
                  :title="$t('places.pickCoordsTitle')"
                  :aria-label="$t('places.pickCoordsTitle')"
                  :aria-pressed="props.pickMode ? 'true' : 'false'"
                  @click="onPickCoordsClick"
                >📍</button>
              </div>
            </div>

            <!-- Resolved-via line: gazetteer + match quality + matched path -->
            <div v-if="resolvedMatch" class="compact-field resolved-field">
              <span class="compact-label">{{ $t('gazetteers.resolvedVia') }}</span>
              <span class="resolved-value">
                <span :class="'resolved-quality match-' + resolvedMatch.matchQuality">{{ $t('gazetteers.match.' + resolvedMatch.matchQuality) }}</span>
                <code class="resolved-gaz">{{ resolvedMatch.gazetteer }}</code>
                <span class="resolved-path">{{ resolvedMatch.matchedPath.join(' › ') }}</span>
              </span>
            </div>

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
                  <span class="mono-toggle-t" :class="{ 'is-mono': !notesMonospaced }">iWi</span>
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
                <code class="resolved-gaz">{{ resolvedMatch.gazetteer }}</code>
                <span class="resolved-path">{{ resolvedMatch.matchedPath.join(' › ') }}</span>
              </span>
            </div>
            <div v-if="place.notes" class="compact-field">
              <span class="compact-label">{{ $t('panel.notes') }}</span>
              <span class="readonly-value">{{ place.notes }}</span>
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
          :action-label="!props.readonly ? '+ ' + $t('placePanel.addPerson') : undefined"
          @toggle="toggleSection('persons')"
          @action="showAddPersonForm = true"
        />
        <div v-if="sections.persons" class="panel-section-body">
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
        <SectionHeader :title="$t('mediaTimeline.title')" :count="mediaCount" :collapsed="!sections.mediaTimeline" :action-label="!props.readonly ? '+ ' + $t('media.attachShort') : undefined" @toggle="toggleSection('mediaTimeline')" @action="triggerAttachMedia" />
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
          <SectionEmpty v-if="researchTasks.length === 0" :message="$t('empty.researchTasks')" />
          <ResearchTasksTable
            v-else
            :tasks="researchTasks"
            :readonly="props.readonly"
            @updated="loadTasks"
            @select="goToTask"
          />
        </div>
      </div>

      <!-- Quality section -->
      <div class="panel-section">
        <SectionHeader :title="$t('quality.nav')" :count="checkCount" :collapsed="!sections.quality" @toggle="toggleSection('quality')" />
        <div v-if="sections.quality" class="panel-section-body">
          <PlaceChecksSection ref="checksSectionRef" :place-id="placeId!" />
        </div>
      </div>
    </template>

    <!-- Add person modal -->
    <PersonModal
      v-if="!props.readonly && showAddPersonForm && placeId"
      mode="standalone"
      @close="showAddPersonForm = false"
      @cancel="showAddPersonForm = false"
      @saved="onPersonSaved"
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
import { useRouter } from 'vue-router';
import EventList from './EventList.vue';
import PersonModal from './modals/PersonModal.vue';
import ResearchTaskModal from './modals/ResearchTaskModal.vue';
import ResearchTasksTable from './ResearchTasksTable.vue';
import PlacePersonsSection from './PlacePersonsSection.vue';
import EntityMediaSection from './EntityMediaSection.vue';
import MediaTimeline from './MediaTimeline.vue';
import PlaceTimeline from './PlaceTimeline.vue';
import PlacePicker from './PlacePicker.vue';
import PlaceChecksSection from './PlaceChecksSection.vue';
import EntityPanel from './EntityPanel.vue';
import type { ComponentPublicInstance, Ref } from 'vue';
import SectionHeader from './ui/SectionHeader.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import AppButton from './ui/AppButton.vue';
import { usePanelSections } from '../composables/usePanelSections';
import { useTextareaHeight } from '../composables/useTextareaHeight';
import { useMonospacedNotes } from '../composables/useMonospacedNotes';
import { PLACE_TYPE_VALUES } from '../constants/eventTypes';
import { useEntityData } from '../composables/useEntityData';
import { useEditableFields } from '../composables/useEditableFields';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import type { PlaceResolveResult } from '../../api/place-gazetteers/types';
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

const { t, te } = useI18n();

// ── Section state ───────────────────────────────────────────────────────────

const { sections, toggleSection } = usePanelSections(
  'place-panel-section-',
  {
    place: true, persons: true, events: true, timeline: false,
    media: false, mediaTimeline: false, tasks: false, quality: false,
  },
  {
    place: true, persons: true, events: true, timeline: true,
    media: true, mediaTimeline: true, tasks: true, quality: false,
  },
);

// ── Template refs ───────────────────────────────────────────────────────────

const eventListRef = ref<(ComponentPublicInstance & { openAddForm: () => void }) | null>(null);
const mediaSectionRef = ref<InstanceType<typeof EntityMediaSection> | null>(null);
const checksSectionRef = ref<InstanceType<typeof PlaceChecksSection> | null>(null);
const checkCount = computed(() => checksSectionRef.value?.count ?? 0);
const personsSectionRef = ref<InstanceType<typeof PlacePersonsSection> | null>(null);
const showAddPersonForm = ref(false);

async function triggerAttachMedia() {
  if (!sections.media) toggleSection('media');
  await nextTick();
  mediaSectionRef.value?.attach();
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
const { data: panelData, reload } = useEntityData<PlacePanelData>(idRef, async (id) => {
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
// quality, and what the resolved values would be — so the user can fall back
// to the gazetteer (or override with a researched coordinate). Resolved values
// are NEVER persisted (Prime Directive); they are recomputed every render.
const { ready: resolverReady, ensureLoaded: ensureResolverLoaded, resolve } = usePlaceResolver();
ensureResolverLoaded();

const resolvedMatch = computed<PlaceResolveResult | null>(() => {
  if (!resolverReady.value) return null;
  const p = place.value;
  if (!p) return null;
  const parts = [p.name, ...ancestors.value.map(a => a.name)];
  return resolve(parts.join(', '));
});

// Did the user's leaf token (first comma-component of `place.name`) actually
// match a node in the gazetteer? If yes, the gazetteer's matched leaf == the
// user's place, so its type/parents apply directly. If no, the matched node
// is an ancestor — its type doesn't describe the user's place, and the matched
// "leaf" IS the user's place's parent.
const leafMatched = computed<boolean>(() => {
  const m = resolvedMatch.value;
  const p = place.value;
  if (!m || !p) return false;
  const leafToken = p.name.split(/,|\.(?=[A-Z])/)[0].trim().toLowerCase();
  return !m.unmatchedComponents.some(u => u.trim().toLowerCase() === leafToken);
});

// Resolved Type fallback — the gazetteer node's `type` (e.g. "country", "city").
// If it overlaps with PLACE_TYPE_VALUES we render the localized label; otherwise
// we render the raw string from the gazetteer. Only meaningful when the user's
// leaf actually matched; otherwise the type describes an ancestor, not this place.
const resolvedTypeLabel = computed<string | null>(() => {
  const m = resolvedMatch.value;
  if (!m || !leafMatched.value) return null;
  const raw = m.matchedNode?.type ?? null;
  if (!raw) return null;
  const key = `placeTypes.${raw}`;
  return te(key) ? t(key) : raw;
});

// Resolved Parent path fallback — everything in the matched gazetteer path
// before the leaf, joined with ›. Empty when the leaf matched at root level.
//
// Edge case: when the user's leaf token did NOT match the gazetteer, the
// matched gazetteer "leaf" is actually the parent of the user's place — keep
// the full path instead of slicing it off. Example: "Uvira, Belgiska Kongo" →
// "Uvira" is unmatched, gazetteer matched "Belgiska Kongo" → "Kingdom of
// Kongo" — that's the parent of Uvira.
const resolvedParentPath = computed<string | null>(() => {
  const m = resolvedMatch.value;
  if (!m) return null;
  const path = leafMatched.value ? m.matchedPath.slice(0, -1) : m.matchedPath;
  return path.length > 0 ? path.join(' › ') : null;
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

async function onPersonSaved() {
  showAddPersonForm.value = false;
  personsSectionRef.value?.reload();
  await reload();
}

async function onNamePlaceSelected(selected: { id: string; name: string }) {
  if (!props.placeId || selected.id === props.placeId) return;
  const source = (await window.api.places.get(selected.id)) as Place | null;
  const path = (await window.api.places.getPath(selected.id)) as string;
  const updates: Record<string, unknown> = { name: path || selected.name };
  if (source) {
    if (source.latitude != null) updates.latitude = source.latitude;
    if (source.longitude != null) updates.longitude = source.longitude;
    if (source.place_type) updates.place_type = source.place_type;
    if (source.parent_place_id) updates.parent_place_id = source.parent_place_id;
  }
  await window.api.places.update(props.placeId, updates);
  await reload();
  emit('place-updated', props.placeId);
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

function formatCoord(n: number): string {
  return n.toFixed(5);
}

// ── Research tasks ──────────────────────────────────────────────────────────

const router = useRouter();
const researchTasks = ref<ResearchTask[]>([]);
const showTaskForm = ref(false);
const editingTask = ref<ResearchTask | null>(null);

async function loadTasks() {
  if (!props.placeId) {
    researchTasks.value = [];
    return;
  }
  try {
    researchTasks.value = (await window.api.researchTasks.forPlace(props.placeId)) as ResearchTask[];
  } catch (err) {
    console.error('[PlacePanel] loadTasks failed:', err);
    researchTasks.value = [];
  }
}

function openTaskForm(task: ResearchTask | null = null) {
  editingTask.value = task;
  showTaskForm.value = true;
}

function closeTaskForm() {
  showTaskForm.value = false;
  editingTask.value = null;
}

async function onTaskSaved() {
  closeTaskForm();
  await loadTasks();
}

function goToTask(id: string) {
  router.push('/research-tasks/' + id);
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

watch(() => props.placeId, () => { void loadTasks(); void loadHero(); }, { immediate: true });
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

/* Coordinates row: lat + long inputs side-by-side, with map-pin pick button */
.coord-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: stretch;
}
.coord-wrap {
  flex: 1 1 100px;
  min-width: 100px;
}
.coord-input {
  width: 100%;
}
/* Hide native number-input spinners — they crowd the resolved chip and aren't
   useful for free-form coordinate entry */
.coord-input::-webkit-inner-spin-button,
.coord-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.coord-input { -moz-appearance: textfield; }
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

/* Inline-in-field resolved fallback: ghost the placeholder text and pin a
   small "Resolved" chip inside the field's right edge. Communicates "if you
   leave this blank, the gazetteer says X" without persisting X. */
.field-resolved-wrap {
  position: relative;
  display: block;
  width: 100%;
}
.field-resolved-wrap.has-resolved .compact-control::placeholder {
  color: var(--text-secondary);
  font-style: italic;
  opacity: 1;
}
/* When the parent picker is showing a resolved fallback, push its inner
   placeholder text further right so it doesn't slide under the chip. */
.field-resolved-wrap.has-resolved :deep(.place-picker input) {
  padding-right: 92px;
}
.field-resolved-wrap.has-resolved > input.compact-control {
  padding-right: 78px;
}
/* Native select arrow sits at the right edge — keep the chip clear of it */
.field-resolved-wrap.has-resolved > select.compact-control {
  padding-right: 96px;
}
.resolved-chip-inline {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  background: var(--info-bg, var(--surface-hover));
  color: var(--info-text, var(--text-secondary));
  border-radius: var(--radius-full);
  padding: 1px 6px;
  line-height: 1.4;
  pointer-events: none;
  z-index: 1;
}
/* Clear the picker's tree-button (24px wide @ right:4px → ends at right:28px) */
.resolved-chip-picker { right: 36px; }
/* Clear the native select dropdown caret on the right */
.resolved-chip-select { right: 28px; }

.resolved-field {
  margin-top: var(--space-xs);
}
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
.resolved-quality.match-exact {
  background: var(--success-bg);
  color: var(--success-text);
}
.resolved-quality.match-partial {
  background: var(--warning-bg);
  color: var(--warning-text);
}
.resolved-quality.match-ambiguous {
  background: var(--error-bg);
  color: var(--error-text);
}
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
