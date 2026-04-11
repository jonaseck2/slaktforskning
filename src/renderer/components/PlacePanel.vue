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
          <router-link :to="'/places/' + placeId" class="panel-view-full">{{ $t('placePanel.viewFull') }}</router-link>
        </div>
      </div>

      <!-- Place section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('place')">
          <span class="panel-chevron">{{ sections.place ? '▾' : '▸' }}</span>
          {{ $t('places.detailsTitle') }}
          <router-link :to="'/places/' + placeId" class="panel-section-header-action" @click.stop>{{ $t('common.edit') }}</router-link>
        </button>
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
                class="compact-control"
                rows="2"
                :value="place.notes ?? ''"
                @blur="saveField('notes', ($event.target as HTMLTextAreaElement).value || null)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Address section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('address')">
          <span class="panel-chevron">{{ sections.address ? '▾' : '▸' }}</span>
          {{ $t('places.address') }}
        </button>
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
        <button class="panel-section-header" @click="toggleSection('children')">
          <span class="panel-chevron">{{ sections.children ? '▾' : '▸' }}</span>
          {{ $t('places.hierarchy') }}
        </button>
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
        <button class="panel-section-header" @click="toggleSection('persons')">
          <span class="panel-chevron">{{ sections.persons ? '▾' : '▸' }}</span>
          {{ $t('persons.title') }}
        </button>
        <div v-if="sections.persons" class="panel-section-body">
          <PlacePersonsSection :place-id="placeId!" />
        </div>
      </div>

      <!-- Events section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('events')">
          <span class="panel-chevron">{{ sections.events ? '▾' : '▸' }}</span>
          {{ $t('panel.events') }}
        </button>
        <div v-if="sections.events" class="panel-section-body">
          <EventList :place-id="placeId!" hide-header readonly />
        </div>
      </div>

      <!-- Citations section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('citations')">
          <span class="panel-chevron">{{ sections.citations ? '▾' : '▸' }}</span>
          {{ $t('sourceDetail.citations') }}
        </button>
        <div v-if="sections.citations" class="panel-section-body">
          <PlaceCitationsSection :place-id="placeId!" />
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
          <EntityMediaSection ref="mediaSectionRef" entity-type="place" :entity-id="placeId!" />
        </div>
      </div>

      <!-- Media Timeline section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('mediaTimeline')">
          <span class="panel-chevron">{{ sections.mediaTimeline ? '▾' : '▸' }}</span>
          {{ $t('mediaTimeline.title') }}
        </button>
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
import { usePlacePanelSections } from '../composables/usePlacePanelSections';
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
const emit = defineEmits<{ 'select-place': [id: string] }>();

// ── Section state ───────────────────────────────────────────────────────────

const { sections, toggleSection } = usePlacePanelSections();

// ── Template refs ───────────────────────────────────────────────────────────

const mediaSectionRef = ref<InstanceType<typeof EntityMediaSection> | null>(null);

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
.panel-header-content {
  padding: 10px 14px;
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
.place-type-badge {
  flex-shrink: 0;
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: var(--font-xs);
}
.panel-view-full {
  font-size: var(--font-xs);
  color: var(--color-primary);
  text-decoration: none;
}
.panel-view-full:hover { text-decoration: underline; }

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
.panel-section-count {
  background: var(--color-bg-muted);
  color: var(--color-text-muted);
  border-radius: 10px;
  padding: 0 6px;
  font-size: var(--font-xs);
}
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
  cursor: pointer;
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

/* Hierarchy list */
.hierarchy-list {
  list-style: none;
  padding: 4px 14px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hierarchy-list li {
  font-size: var(--font-xs);
}
.hierarchy-current {
  color: var(--color-text);
  font-size: var(--font-xs);
}
.hierarchy-children-label {
  padding: 6px 14px 2px;
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--color-text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
</style>
