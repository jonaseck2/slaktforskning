<template>
  <div class="place-panel">
    <!-- Empty state -->
    <div v-if="!placeId" class="panel-empty">
      {{ $t('placePanel.noPlaceSelected') }}
    </div>

    <template v-else-if="place">
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-header-content">
          <div class="panel-name-row">
            <div class="panel-name">{{ place.name }}</div>
            <span v-if="place.place_type" class="place-type-badge">{{ $t('placeTypes.' + place.place_type) }}</span>
          </div>
        </div>
      </div>

      <!-- Place section -->
      <div class="panel-section">
        <SectionHeader :title="$t('places.detailsTitle')" :collapsed="!sections.place" @toggle="toggleSection('place')" />
        <div v-if="sections.place" class="panel-section-body">
          <div v-if="!props.readonly" class="compact-form">
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.name') }}</label>
              <PlacePicker
                :model-value="placeId"
                @select="onNamePlaceSelected"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.type') }}</label>
              <select
                class="compact-control"
                :value="place.place_type ?? ''"
                @change="saveField('place_type', ($event.target as HTMLSelectElement).value || null)"
              >
                <option value="">—</option>
                <option v-for="pt in PLACE_TYPE_VALUES" :key="pt" :value="pt">{{ $t('placeTypes.' + pt) }}</option>
              </select>
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.parentPlace') }}</label>
              <PlacePicker
                :model-value="place.parent_place_id ?? null"
                @update:model-value="saveField('parent_place_id', $event)"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.latitude') }}</label>
              <input
                class="compact-control"
                type="number"
                step="any"
                :value="place.latitude ?? ''"
                @blur="saveField('latitude', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null)"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.longitude') }}</label>
              <input
                class="compact-control"
                type="number"
                step="any"
                :value="place.longitude ?? ''"
                @blur="saveField('longitude', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null)"
              />
            </div>
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
              <span class="compact-label">{{ $t('places.latitude') }} / {{ $t('places.longitude') }}</span>
              <span class="readonly-value">{{ place.latitude ?? '—' }} / {{ place.longitude ?? '—' }}</span>
            </div>
            <div v-if="place.notes" class="compact-field">
              <span class="compact-label">{{ $t('panel.notes') }}</span>
              <span class="readonly-value">{{ place.notes }}</span>
            </div>
          </div>
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

      <!-- Events section -->
      <div class="panel-section">
        <SectionHeader :title="$t('panel.events')" :count="eventCount" :collapsed="!sections.events" :action-label="!props.readonly ? '+ ' + $t('events.event') : undefined" @toggle="toggleSection('events')" @action="eventListRef?.openAddForm()" />
        <div v-if="sections.events" class="panel-section-body">
          <EventList ref="eventListRef" :place-id="placeId!" :readonly="props.readonly" hide-header show-persons />
        </div>
      </div>

      <!-- Citations section -->
      <div class="panel-section">
        <SectionHeader :title="$t('sourceDetail.citations')" :count="citationCount" :collapsed="!sections.citations" :action-label="!props.readonly ? '+ ' + $t('sourceDetail.addCitation') : undefined" @toggle="toggleSection('citations')" @action="showCitationForm = true" />
        <div v-if="sections.citations" class="panel-section-body">
          <PlaceCitationsSection ref="citationsSectionRef" :place-id="placeId!" />
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

      <!-- Quality section -->
      <div class="panel-section">
        <SectionHeader :title="$t('quality.nav')" :count="checkCount" :collapsed="!sections.quality" @toggle="toggleSection('quality')" />
        <div v-if="sections.quality" class="panel-section-body">
          <PlaceChecksSection ref="checksSectionRef" :place-id="placeId!" />
        </div>
      </div>

      <!-- Address section -->
      <div class="panel-section">
        <SectionHeader :title="$t('places.address')" :collapsed="!sections.address" @toggle="toggleSection('address')" />
        <div v-if="sections.address" class="panel-section-body">
          <div v-if="!props.readonly" class="compact-form">
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.street') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="place.street ?? ''"
                @blur="saveField('street', ($event.target as HTMLInputElement).value || null)"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.postalCode') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="place.postal_code ?? ''"
                @blur="saveField('postal_code', ($event.target as HTMLInputElement).value || null)"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.city') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="place.city ?? ''"
                @blur="saveField('city', ($event.target as HTMLInputElement).value || null)"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.country') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="place.country ?? ''"
                @blur="saveField('country', ($event.target as HTMLInputElement).value || null)"
              />
            </div>
          </div>
          <div v-else class="compact-form">
            <div v-if="place.street" class="compact-field">
              <span class="compact-label">{{ $t('places.street') }}</span>
              <span class="readonly-value">{{ place.street }}</span>
            </div>
            <div v-if="place.postal_code" class="compact-field">
              <span class="compact-label">{{ $t('places.postalCode') }}</span>
              <span class="readonly-value">{{ place.postal_code }}</span>
            </div>
            <div v-if="place.city" class="compact-field">
              <span class="compact-label">{{ $t('places.city') }}</span>
              <span class="readonly-value">{{ place.city }}</span>
            </div>
            <div v-if="place.country" class="compact-field">
              <span class="compact-label">{{ $t('places.country') }}</span>
              <span class="readonly-value">{{ place.country }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Hierarchy section -->
      <div class="panel-section">
        <SectionHeader :title="$t('places.hierarchy')" :count="childPlaces.length" :collapsed="!sections.children" @toggle="toggleSection('children')" />
        <div v-if="sections.children" class="panel-section-body">
          <SectionEmpty v-if="ancestors.length === 0 && childPlaces.length === 0" :message="$t('empty.places')" />
          <template v-else>
            <!-- Ancestors (outermost first) -->
            <ul v-if="ancestors.length > 0" class="hierarchy-list">
              <li v-for="(anc, idx) in [...ancestors].reverse()" :key="anc.id" :style="{ paddingLeft: (idx * 12) + 'px' }">
                <a class="person-link" href="#" @click.prevent="emit('select-place', anc.id)">
                  {{ anc.name }}
                </a>
              </li>
              <li class="hierarchy-current" :style="{ paddingLeft: (ancestors.length * 12) + 'px' }">
                <strong>{{ place!.name }}</strong>
              </li>
            </ul>
            <!-- Children -->
            <div v-if="childPlaces.length > 0" class="hierarchy-children-label">{{ $t('places.childPlaces') }}</div>
            <ul v-if="childPlaces.length > 0" class="hierarchy-list">
              <li v-for="child in childPlaces" :key="child.id">
                <a class="person-link" href="#" @click.prevent="emit('select-place', child.id)">
                  {{ child.name }}
                </a>
              </li>
            </ul>
          </template>
        </div>
      </div>
    </template>

    <!-- Citation form modal -->
    <CitationModal
      v-if="!props.readonly && showCitationForm && placeId"
      mode="standalone"
      :place-id="placeId"
      @cancel="showCitationForm = false"
      @close="showCitationForm = false"
      @saved="showCitationForm = false; citationsSectionRef?.reload(); load(placeId)"
    />

    <!-- Add person modal -->
    <PersonModal
      v-if="!props.readonly && showAddPersonForm && placeId"
      mode="standalone"
      :prefill-place-id="placeId"
      @close="showAddPersonForm = false"
      @saved="onPersonSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import EventList from './EventList.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import PersonModal from './modals/PersonModal.vue';
import PlacePersonsSection from './PlacePersonsSection.vue';
import PlaceCitationsSection from './PlaceCitationsSection.vue';
import EntityMediaSection from './EntityMediaSection.vue';
import MediaTimeline from './MediaTimeline.vue';
import PlacePicker from './PlacePicker.vue';
import PlaceChecksSection from './PlaceChecksSection.vue';
import CitationModal from './modals/CitationModal.vue';
import type { ComponentPublicInstance } from 'vue';
import SectionHeader from './ui/SectionHeader.vue';
import AppButton from './ui/AppButton.vue';
import { usePanelSections } from '../composables/usePanelSections';
import { useTextareaHeight } from '../composables/useTextareaHeight';
import { useMonospacedNotes } from '../composables/useMonospacedNotes';
import { PLACE_TYPE_VALUES } from '../constants/eventTypes';

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

const props = defineProps<{ placeId: string | null; readonly?: boolean }>();
const emit = defineEmits<{ 'select-place': [id: string]; 'close': []; 'place-updated': [id: string] }>();

// ── Section state ───────────────────────────────────────────────────────────

const { sections, toggleSection } = usePanelSections(
  'place-panel-section-',
  {
    place: true, address: false, children: false, persons: true,
    events: true, citations: false, media: false, mediaTimeline: false, quality: false,
  },
  {
    place: true, address: true, children: true, persons: true,
    events: true, citations: true, media: true, mediaTimeline: true, quality: false,
  },
);

// ── Template refs ───────────────────────────────────────────────────────────

const eventListRef = ref<(ComponentPublicInstance & { openAddForm: () => void }) | null>(null);
const citationsSectionRef = ref<InstanceType<typeof PlaceCitationsSection> | null>(null);
const mediaSectionRef = ref<InstanceType<typeof EntityMediaSection> | null>(null);
const checksSectionRef = ref<InstanceType<typeof PlaceChecksSection> | null>(null);
const checkCount = computed(() => checksSectionRef.value?.count ?? 0);
const personsSectionRef = ref<InstanceType<typeof PlacePersonsSection> | null>(null);
const showCitationForm = ref(false);
const showAddPersonForm = ref(false);

async function triggerAttachMedia() {
  if (!sections.media) toggleSection('media');
  await nextTick();
  mediaSectionRef.value?.attach();
}
const { textareaRef: notesRef, storedHeight: notesStoredHeight, persistHeight: persistNotesHeight } = useTextareaHeight('place-panel-notes');
const { monospaced: notesMonospaced, toggle: toggleNotesMonospaced } = useMonospacedNotes('place');

// ── Data ────────────────────────────────────────────────────────────────────

const place = ref<Place | null>(null);
const ancestors = ref<ChildPlace[]>([]);
const childPlaces = ref<ChildPlace[]>([]);
const personCount = ref(0);
const eventCount = ref(0);
const citationCount = ref(0);
const mediaCount = ref(0);

async function load(id: string | null) {
  if (!id) {
    place.value = null;
    ancestors.value = [];
    childPlaces.value = [];
    personCount.value = 0;
    eventCount.value = 0;
    citationCount.value = 0;
    mediaCount.value = 0;
    return;
  }
  const [p, allPlaces] = await Promise.all([
    window.api.places.get(id) as Promise<Place | null>,
    window.api.places.list() as Promise<ChildPlace[]>,
  ]);
  place.value = p;
  childPlaces.value = allPlaces.filter((pl) => pl.parent_place_id === id);

  // Build ancestor chain by walking up parent_place_id
  const chain: ChildPlace[] = [];
  const placeMap = new Map(allPlaces.map(pl => [pl.id, pl]));
  let parentId = p?.parent_place_id ?? null;
  while (parentId) {
    const parent = placeMap.get(parentId);
    if (!parent) break;
    chain.push(parent);
    parentId = parent.parent_place_id;
  }
  ancestors.value = chain;

  // Load counts for collapsed section headers
  try {
    const [persons, events, citations, media] = await Promise.all([
      window.api.places.getPersons(id) as Promise<unknown[]>,
      window.api.events.forPlace(id) as Promise<unknown[]>,
      window.api.citations.forPlace(id) as Promise<unknown[]>,
      window.api.media.forEntity('place', id) as Promise<unknown[]>,
    ]);
    if (props.placeId !== id) return;
    personCount.value = persons.length;
    eventCount.value = events.length;
    citationCount.value = citations.length;
    mediaCount.value = media.length;
  } catch {
    // counts are non-critical
  }
}

watch(() => props.placeId, load, { immediate: true });

// ── Field updates ────────────────────────────────────────────────────────────

async function saveField(field: string, value: unknown) {
  if (!props.placeId || !place.value || props.readonly) return;
  await window.api.places.update(props.placeId, { [field]: value });
  (place.value as Record<string, unknown>)[field] = value;
  emit('place-updated', props.placeId);
}

async function onPersonSaved() {
  showAddPersonForm.value = false;
  personsSectionRef.value?.reload();
  await load(props.placeId);
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
  await load(props.placeId);
  emit('place-updated', props.placeId);
}
</script>

<style scoped>
.place-panel {
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
  background: var(--surface);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
.panel-header-content {
  padding: var(--space-md) var(--space-lg);
  flex: 1;
  min-width: 0;
}
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

/* Hierarchy list */
.hierarchy-list {
  list-style: none;
  padding: var(--space-xs) 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hierarchy-list li {
  font-size: var(--font-xs);
}
.hierarchy-current {
  color: var(--text-primary);
  font-size: var(--font-xs);
}
.hierarchy-children-label {
  padding: var(--space-xs) 0 2px;
  font-size: var(--font-xs);
  font-weight: var(--font-weight-bold);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.readonly-value {
  font-size: var(--font-xs);
  color: var(--text-primary);
  padding: var(--space-xs) 0;
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
</style>
