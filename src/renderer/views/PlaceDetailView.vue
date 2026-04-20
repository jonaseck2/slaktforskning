<template>
  <div v-if="place" class="place-detail">
    <div class="detail-header">
      <h2>{{ place.name }}</h2>
      <AppBadge v-if="place.place_type" variant="event">{{ $t('placeTypes.' + place.place_type) }}</AppBadge>
      <AppButton variant="ghost" size="sm" @click="$router.push('/reports?tab=placeChronicle&placeId=' + place.id)">{{ $t('reports.placeChronicle.title') }} →</AppButton>
    </div>

    <section class="detail-section" aria-labelledby="section-place-details">
      <SectionHeader
        :title="$t('places.detailsTitle')"
        :collapsible="false"
        tabindex="0"
        :data-narrate="t('screenReader.navPlaceDetail', { name: place.name })"
      />
      <div class="field-grid">
        <label>{{ $t('places.name') }}
          <PlacePicker :model-value="placeId" @select="onNamePlaceSelected" />
        </label>
        <label>{{ $t('places.type') }}
          <select v-model="editType" @change="save({ place_type: editType || null })">
            <option value="">—</option>
            <option v-for="pt in PLACE_TYPE_VALUES" :key="pt" :value="pt">
              {{ $t('placeTypes.' + pt) }}
            </option>
          </select>
        </label>
        <label>{{ $t('places.parentPlace') }}
          <PlacePicker v-model="editParentId" @update:model-value="save({ parent_place_id: $event })" />
        </label>
        <label>{{ $t('places.latitude') }}
          <input v-model.number="editLat" type="number" step="0.000001" @blur="save({ latitude: editLat || null })" />
        </label>
        <label>{{ $t('places.longitude') }}
          <input v-model.number="editLon" type="number" step="0.000001" @blur="save({ longitude: editLon || null })" />
        </label>
      </div>
    </section>

    <section class="detail-section" aria-labelledby="section-place-address">
      <SectionHeader
        :title="$t('places.address')"
        :collapsible="false"
        tabindex="0"
        :data-narrate="$t('places.address')"
      />
      <div class="field-grid">
        <label>{{ $t('places.street') }}
          <input v-model="editStreet" type="text" @blur="save({ street: editStreet || null })" />
        </label>
        <label>{{ $t('places.postalCode') }}
          <input v-model="editPostalCode" type="text" @blur="save({ postal_code: editPostalCode || null })" />
        </label>
        <label>{{ $t('places.city') }}
          <input v-model="editCity" type="text" @blur="save({ city: editCity || null })" />
        </label>
        <label>{{ $t('places.country') }}
          <input v-model="editCountry" type="text" @blur="save({ country: editCountry || null })" />
        </label>
      </div>
    </section>

    <section class="detail-section" aria-labelledby="section-place-notes">
      <div class="notes-heading-row">
        <h4 id="section-place-notes" tabindex="0" :data-narrate="editNotes ? t('screenReader.sectionNotes', { content: editNotes }) : t('screenReader.sectionNotesEmpty')">{{ $t('common.notes') }}</h4>
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
        v-model="editNotes"
        rows="3"
        :class="{ 'notes-mono': notesMonospaced }"
        :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
        @blur="persistNotesHeight(); save({ notes: editNotes })"
        @mouseup="persistNotesHeight"
      />
    </section>

    <!-- Gazetteer Match Section -->
    <section v-if="gazetteerMatch" class="detail-section gazetteer-section" aria-labelledby="section-gazetteer-match">
      <SectionHeader :title="$t('gazetteers.matchTitle')" :collapsible="false" />
      <div class="gazetteer-match">
        <div class="match-quality-row">
          <span class="match-badge" :class="'match-' + gazetteerMatch.matchQuality">
            {{ $t('gazetteers.match.' + gazetteerMatch.matchQuality) }}
          </span>
          <span class="gazetteer-name">{{ gazetteerMatch.gazetteer }}</span>
        </div>
        <div class="match-path">{{ gazetteerMatch.matchedPath.join(' > ') }}</div>
        <div v-if="gazetteerMatch.unmatchedComponents.length" class="unmatched">
          {{ $t('gazetteers.unmatched') }}: {{ gazetteerMatch.unmatchedComponents.join(', ') }}
        </div>
        <div class="resolved-coords">{{ gazetteerMatch.lat.toFixed(5) }}, {{ gazetteerMatch.lon.toFixed(5) }}</div>
      </div>
    </section>

    <!-- Map Section -->
    <section v-if="mapMarkers.length > 0" class="detail-section" aria-labelledby="section-place-map">
      <SectionHeader :title="$t('map.placeMap')" :collapsible="false" />
      <BaseMap
        ref="baseMapRef"
        height="300px"
        :initial-zoom="10"
        :initial-center="mapCenter"
        @ready="fitMapBounds"
      >
        <LMarker
          v-for="m in mapMarkers"
          :key="m.id"
          :lat-lng="[m.lat, m.lon]"
        >
          <LPopup>
            <strong>{{ m.name }}</strong>
            <span v-if="m.type"> ({{ $t('placeTypes.' + m.type) }})</span>
          </LPopup>
        </LMarker>
      </BaseMap>
    </section>

    <section class="detail-section" aria-labelledby="section-place-media-timeline">
      <SectionHeader :title="$t('mediaTimeline.title')" :collapsible="false" />
      <MediaTimeline entity-type="place" :entity-id="placeId" />
    </section>

    <section v-if="children.length" class="detail-section" aria-labelledby="section-place-children">
      <SectionHeader :title="$t('places.childPlaces')" :count="children.length" :collapsible="false" />
      <ul class="child-list">
        <li v-for="child in children" :key="child.id">
          <a href="#" @click.prevent="$router.push('/places/' + child.id)">{{ child.name }}</a>
          <AppBadge v-if="child.place_type" variant="event">{{ $t('placeTypes.' + child.place_type) }}</AppBadge>
        </li>
      </ul>
    </section>
  </div>
  <div v-else class="empty">{{ $t('common.loading') }}</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PlacePicker from '../components/PlacePicker.vue';
import MediaTimeline from '../components/MediaTimeline.vue';
import BaseMap from '../components/BaseMap.vue';
import AppBadge from '../components/ui/AppBadge.vue';
import AppButton from '../components/ui/AppButton.vue';
import SectionHeader from '../components/ui/SectionHeader.vue';
import { PLACE_TYPE_VALUES } from '../constants/eventTypes';
import { LMarker, LPopup } from '@vue-leaflet/vue-leaflet';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import { useTextareaHeight } from '../composables/useTextareaHeight';
import { useMonospacedNotes } from '../composables/useMonospacedNotes';

interface PlaceRow { id: string; name: string; place_type: string | null; parent_place_id: string | null; latitude: number | null; longitude: number | null; notes: string; street: string | null; postal_code: string | null; city: string | null; country: string | null; }

const { t } = useI18n();
const route = useRoute();
const placeId = route.params.id as string;
const place = ref<PlaceRow | null>(null);
const placePath = ref('');
const children = ref<PlaceRow[]>([]);
const editName = ref('');
const editType = ref('');
const editParentId = ref<string | null>(null);
const editLat = ref<number | null>(null);
const editLon = ref<number | null>(null);
const editNotes = ref('');
const editStreet = ref('');
const editPostalCode = ref('');
const editCity = ref('');
const editCountry = ref('');
const baseMapRef = ref<InstanceType<typeof BaseMap> | null>(null);
const { ready: resolverReady, ensureLoaded, resolve: resolvePlace, invalidate: invalidateResolver } = usePlaceResolver();
const { textareaRef: notesRef, storedHeight: notesStoredHeight, persistHeight: persistNotesHeight } = useTextareaHeight('place-notes');
const { monospaced: notesMonospaced, toggle: toggleNotesMonospaced } = useMonospacedNotes('place');

async function onNamePlaceSelected(selected: { id: string; name: string }) {
  if (selected.id === placeId) return;
  // Fetch the selected place's full data to copy coordinates and type
  const source = (await window.api.places.get(selected.id)) as PlaceRow | null;
  const path = (await window.api.places.getPath(selected.id)) as string;
  const updates: Record<string, unknown> = { name: path || selected.name };
  if (source) {
    if (source.latitude != null) updates.latitude = source.latitude;
    if (source.longitude != null) updates.longitude = source.longitude;
    if (source.place_type) updates.place_type = source.place_type;
    if (source.parent_place_id) updates.parent_place_id = source.parent_place_id;
  }
  await save(updates);
  nextTick(() => fitMapBounds());
}

const gazetteerMatch = computed(() => {
  if (!resolverReady.value || !place.value) return null;
  if (place.value.latitude != null && place.value.longitude != null) return null;
  return resolvePlace(placePath.value || place.value.name);
});

interface MapMarker { id: string; name: string; lat: number; lon: number; type: string | null; }

const mapMarkers = computed<MapMarker[]>(() => {
  const result: MapMarker[] = [];
  if (place.value) {
    if (place.value.latitude != null && place.value.longitude != null) {
      result.push({ id: place.value.id, name: place.value.name, lat: place.value.latitude, lon: place.value.longitude, type: place.value.place_type });
    } else if (gazetteerMatch.value) {
      // Use gazetteer-resolved coordinates when no stored lat/lon
      result.push({ id: place.value.id, name: place.value.name, lat: gazetteerMatch.value.lat, lon: gazetteerMatch.value.lon, type: place.value.place_type });
    }
  }
  for (const child of children.value) {
    if (child.latitude != null && child.longitude != null) {
      result.push({ id: child.id, name: child.name, lat: child.latitude, lon: child.longitude, type: child.place_type });
    }
  }
  return result;
});

const mapCenter = computed<[number, number]>(() => {
  if (mapMarkers.value.length > 0) {
    return [mapMarkers.value[0].lat, mapMarkers.value[0].lon];
  }
  return [55, 15];
});

function fitMapBounds() {
  nextTick(() => {
    if (mapMarkers.value.length === 0) return;
    const bounds = mapMarkers.value.map(m => [m.lat, m.lon] as [number, number]);
    baseMapRef.value?.fitBounds(bounds);
  });
}

async function load() {
  await ensureLoaded();
  place.value = (await window.api.places.get(placeId)) as PlaceRow | null;
  if (!place.value) return;
  placePath.value = (await window.api.places.getPath(placeId)) as string;
  editName.value = place.value.name;
  editType.value = place.value.place_type ?? '';
  editParentId.value = place.value.parent_place_id;
  editLat.value = place.value.latitude;
  editLon.value = place.value.longitude;
  editNotes.value = place.value.notes;
  editStreet.value = place.value.street ?? '';
  editPostalCode.value = place.value.postal_code ?? '';
  editCity.value = place.value.city ?? '';
  editCountry.value = place.value.country ?? '';
  const all = (await window.api.places.list()) as PlaceRow[];
  children.value = all.filter(p => p.parent_place_id === placeId);
}

async function save(data: Record<string, unknown>) {
  await window.api.places.update(placeId, data);
  if ('name' in data) {
    invalidateResolver();
    await ensureLoaded();
  }
  await load();
  if ('name' in data) nextTick(() => fitMapBounds());
}

onMounted(load);
</script>

<style scoped>
.place-detail { max-width: none; }
.detail-header { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
.detail-header h2 { margin: 0; }
.btn-back { background: none; border: none; color: var(--accent); cursor: pointer; padding: 4px 0; font-size: var(--font-base); }
.btn-back:hover { text-decoration: underline; }
.detail-section { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--surface-border-subtle, #eee); }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.full-width { grid-column: 1 / -1; }
label { display: flex; flex-direction: column; gap: 4px; font-size: var(--font-sm); font-weight: 600; color: var(--text-secondary); }
input[type='text'], input[type='number'], select, textarea {
  padding: 6px 8px; border: 1px solid var(--surface-border); border-radius: 4px; font-size: var(--font-base); font-family: inherit;
}
textarea { resize: vertical; width: 100%; box-sizing: border-box; }
.child-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.child-list li { display: flex; align-items: center; gap: 8px; }
.child-list a { color: var(--accent); text-decoration: none; font-size: var(--font-base); }
.child-list a:hover { text-decoration: underline; }
.empty { color: var(--text-muted); padding: 40px; text-align: center; }
.gazetteer-section { background: var(--surface-bg, #f8f9fa); border: 1px dashed var(--surface-border); border-radius: 6px; padding: 12px; }
.gazetteer-match { font-size: var(--font-sm); }
.match-quality-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.match-badge { font-size: var(--font-xs); font-weight: 600; padding: 2px 6px; border-radius: 3px; }
.match-exact { background: var(--success-bg); color: var(--success-text); }
.match-partial { background: var(--warning-bg); color: var(--warning-text); }
.match-ambiguous { background: var(--error-bg); color: var(--error-text); }
.gazetteer-name { color: var(--text-muted); font-size: var(--font-xs); }
.match-path { color: var(--text-primary); margin-bottom: 4px; }
.unmatched { color: var(--text-muted); font-size: var(--font-xs); margin-bottom: 4px; }
.resolved-coords { color: var(--text-secondary); font-size: var(--font-xs); font-family: monospace; }
.notes-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}
textarea.notes-mono {
  font-family: var(--font-mono);
}
</style>
