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
            <button class="btn-sm btn-delete" @click="emit('close')" :title="$t('common.close')">✕</button>
          </div>
          <router-link :to="'/places/' + placeId" class="panel-view-full">{{ $t('placePanel.viewFull') }}</router-link>
        </div>
      </div>

      <!-- Place section -->
      <div class="panel-section">
        <SectionHeader :title="$t('places.detailsTitle')" :collapsed="!sections.place" :action-label="$t('common.edit')" @toggle="toggleSection('place')" @action="$router.push('/places/' + placeId)" />
        <div v-if="sections.place" class="panel-section-body">
          <div class="compact-form">
            <div class="compact-field">
              <label class="compact-label">{{ $t('places.name') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="place.name"
                @blur="saveField('name', ($event.target as HTMLInputElement).value)"
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
              <label class="compact-label">{{ $t('panel.notes') }}</label>
              <textarea
                ref="notesRef"
                class="compact-control"
                rows="2"
                :value="place.notes ?? ''"
                :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
                @blur="persistNotesHeight(); saveField('notes', ($event.target as HTMLTextAreaElement).value || null)"
                @mouseup="persistNotesHeight"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Address section -->
      <div class="panel-section">
        <SectionHeader :title="$t('places.address')" :collapsed="!sections.address" @toggle="toggleSection('address')" />
        <div v-if="sections.address" class="panel-section-body">
          <div class="compact-form">
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
        </div>
      </div>

      <!-- Hierarchy section -->
      <div class="panel-section">
        <SectionHeader :title="$t('places.hierarchy')" :count="childPlaces.length" :collapsed="!sections.children" @toggle="toggleSection('children')" />
        <div v-if="sections.children" class="panel-section-body">
          <div v-if="ancestors.length === 0 && childPlaces.length === 0" class="panel-empty-section">—</div>
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

      <!-- Persons section -->
      <div class="panel-section">
        <SectionHeader :title="$t('persons.title')" :collapsed="!sections.persons" @toggle="toggleSection('persons')" />
        <div v-if="sections.persons" class="panel-section-body">
          <PlacePersonsSection :place-id="placeId!" />
        </div>
      </div>

      <!-- Events section -->
      <div class="panel-section">
        <SectionHeader :title="$t('panel.events')" :collapsed="!sections.events" @toggle="toggleSection('events')" />
        <div v-if="sections.events" class="panel-section-body">
          <EventList ref="eventListRef" :place-id="placeId!" hide-header show-persons />
        </div>
      </div>

      <!-- Citations section -->
      <div class="panel-section">
        <SectionHeader :title="$t('sourceDetail.citations')" :collapsed="!sections.citations" @toggle="toggleSection('citations')" />
        <div v-if="sections.citations" class="panel-section-body">
          <PlaceCitationsSection :place-id="placeId!" />
        </div>
      </div>

      <!-- Media section -->
      <div class="panel-section">
        <SectionHeader :title="$t('media.title')" :collapsed="!sections.media" :action-label="'+ ' + $t('media.attachShort')" @toggle="toggleSection('media')" @action="mediaSectionRef?.attach()" />
        <div v-if="sections.media" class="panel-section-body">
          <EntityMediaSection ref="mediaSectionRef" entity-type="place" :entity-id="placeId!" />
        </div>
      </div>

      <!-- Media Timeline section -->
      <div class="panel-section">
        <SectionHeader :title="$t('mediaTimeline.title')" :collapsed="!sections.mediaTimeline" @toggle="toggleSection('mediaTimeline')" />
        <div v-if="sections.mediaTimeline" class="panel-section-body">
          <MediaTimeline entity-type="place" :entity-id="placeId!" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import EventList from './EventList.vue';
import PlacePersonsSection from './PlacePersonsSection.vue';
import PlaceCitationsSection from './PlaceCitationsSection.vue';
import EntityMediaSection from './EntityMediaSection.vue';
import MediaTimeline from './MediaTimeline.vue';
import PlacePicker from './PlacePicker.vue';
import SectionHeader from './ui/SectionHeader.vue';
import { usePlacePanelSections } from '../composables/usePlacePanelSections';
import { useTextareaHeight } from '../composables/useTextareaHeight';
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

const props = defineProps<{ placeId: string | null }>();
const emit = defineEmits<{ 'select-place': [id: string]; 'close': [] }>();

// ── Section state ───────────────────────────────────────────────────────────

const { sections, toggleSection } = usePlacePanelSections();

// ── Template refs ───────────────────────────────────────────────────────────

const mediaSectionRef = ref<InstanceType<typeof EntityMediaSection> | null>(null);
const { textareaRef: notesRef, storedHeight: notesStoredHeight, persistHeight: persistNotesHeight } = useTextareaHeight('place-panel-notes');

// ── Data ────────────────────────────────────────────────────────────────────

const place = ref<Place | null>(null);
const ancestors = ref<ChildPlace[]>([]);
const childPlaces = ref<ChildPlace[]>([]);

async function load(id: string | null) {
  if (!id) {
    place.value = null;
    ancestors.value = [];
    childPlaces.value = [];
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
}

watch(() => props.placeId, load, { immediate: true });

// ── Field updates ────────────────────────────────────────────────────────────

async function saveField(field: string, value: unknown) {
  if (!props.placeId || !place.value) return;
  await window.api.places.update(props.placeId, { [field]: value });
  (place.value as Record<string, unknown>)[field] = value;
}
</script>

<style scoped>
.place-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  background: var(--surface);
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
  border-bottom: 1px solid var(--surface-border);
  flex-shrink: 0;
}
.panel-header-content {
  padding: var(--space-sm) var(--space-md);
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
  border-bottom: 1px solid var(--surface-border);
  flex-shrink: 0;
  padding: 0 var(--space-md);
}
.panel-section-body { padding: var(--space-xs) 0 var(--space-sm); }
.panel-empty-section { padding: var(--space-xs) 0; color: var(--text-muted); font-size: var(--font-xs); }

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
</style>
