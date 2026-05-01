<template>
  <div v-if="markers.length > 0">
    <BaseMap
      ref="baseMapRef"
      height="350px"
      :initial-zoom="4"
      :initial-center="[55, 15]"
      @ready="fitBounds"
    >
      <LPolyline
        v-if="polylinePoints.length > 1"
        :lat-lngs="polylinePoints"
        :color="'#6366f1'"
        :weight="3"
        :opacity="0.6"
      />
      <LCircleMarker
        v-for="(m, idx) in markers"
        :key="idx"
        :lat-lng="[m.lat, m.lon]"
        :radius="6"
        :color="'#fff'"
        :weight="1.5"
        :fill-color="eventColor(m.eventType)"
        :fill-opacity="m.resolved ? 0.5 : 0.85"
      >
        <LPopup>
          <strong>{{ $t('eventTypes.' + m.eventType) }}</strong>
          <div v-if="m.date" class="popup-date">{{ m.date }}</div>
          <div class="popup-place">
            <router-link :to="{ path: '/places', query: { place: m.placeId } }" class="popup-link">{{ m.placeName }}</router-link>
          </div>
        </LPopup>
      </LCircleMarker>
    </BaseMap>
  </div>
  <SectionEmpty v-else :message="$t('empty.places')" />
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import { LCircleMarker, LPolyline, LPopup } from '@vue-leaflet/vue-leaflet';
import SectionEmpty from './ui/SectionEmpty.vue';
import BaseMap from './BaseMap.vue';
import { usePlaceResolver } from '../composables/usePlaceResolver';
import { useEntityData } from '../composables/useEntityData';

interface EventRow {
  id: string;
  event_type: string;
  date_value: string | null;
  date_original: string | null;
  place_id: string | null;
}

interface PlaceRow {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

interface Marker {
  lat: number;
  lon: number;
  eventType: string;
  date: string | null;
  placeName: string;
  placeId: string;
  resolved?: boolean;
}

const props = defineProps<{ personId: string }>();

const { ensureLoaded, resolveCoordinates } = usePlaceResolver();

const baseMapRef = ref<InstanceType<typeof BaseMap> | null>(null);

const EVENT_COLORS: Record<string, string> = {
  birth: '#22c55e',
  death: '#ef4444',
  marriage: '#ec4899',
  baptism: '#3b82f6',
  burial: '#6b7280',
  census: '#f59e0b',
  immigration: '#8b5cf6',
  emigration: '#8b5cf6',
  residence: '#0ea5e9',
};

function eventColor(eventType: string): string {
  return EVENT_COLORS[eventType] ?? '#6366f1';
}

function fitBounds() {
  nextTick(() => {
    const bounds = markers.value.map(m => [m.lat, m.lon] as [number, number]);
    baseMapRef.value?.fitBounds(bounds);
  });
}

const idRef = computed(() => props.personId ?? null);
const { data, reload } = useEntityData<Marker[]>(idRef, async (id) => {
  await ensureLoaded();
  const events = (await window.api.events.forPerson(id)) as EventRow[];
  const eventsWithPlaces = events.filter(e => e.place_id);

  // Fetch all unique places and their paths in parallel instead of a serial loop.
  const uniquePlaceIds = [...new Set(eventsWithPlaces.map(e => e.place_id!))];
  const [placeResults, pathResults] = await Promise.all([
    Promise.all(uniquePlaceIds.map(pid => window.api.places.get(pid) as Promise<PlaceRow | null>)),
    Promise.all(uniquePlaceIds.map(pid => window.api.places.getPath(pid) as Promise<string>)),
  ]);
  const placeById = new Map<string, PlaceRow | null>(uniquePlaceIds.map((pid, i) => [pid, placeResults[i]]));
  const pathById = new Map<string, string>(uniquePlaceIds.map((pid, i) => [pid, pathResults[i]]));

  const result: Marker[] = [];
  for (const ev of eventsWithPlaces) {
    const place = placeById.get(ev.place_id!);
    if (!place) continue;
    const fullPath = pathById.get(place.id) ?? '';
    const coords = resolveCoordinates(place, fullPath);
    if (coords) {
      result.push({
        lat: coords.lat,
        lon: coords.lon,
        eventType: ev.event_type,
        date: ev.date_original || ev.date_value,
        placeName: place.name,
        placeId: place.id,
        resolved: coords.resolved,
      });
    }
  }

  // Sort chronologically by date_value for the polyline
  result.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  return result;
});

const markers = computed(() => data.value ?? []);
const polylinePoints = computed<[number, number][]>(() => markers.value.map(m => [m.lat, m.lon] as [number, number]));

watch(markers, () => {
  if (baseMapRef.value?.getLeafletObject()) fitBounds();
});

defineExpose({ reload });
</script>

<style scoped>
.popup-link {
  color: var(--color-primary);
  text-decoration: none;
}
.popup-link:hover {
  text-decoration: underline;
}
.popup-date {
  font-size: var(--font-xs);
  color: #666;
}
.popup-place {
  margin-top: 2px;
}
</style>
