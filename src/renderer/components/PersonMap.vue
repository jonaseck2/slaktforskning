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
        :weight="2"
        :opacity="0.5"
        :dash-array="'6, 8'"
      />
      <LCircleMarker
        v-for="(m, idx) in markers"
        :key="idx"
        :lat-lng="[m.lat, m.lon]"
        :radius="8"
        :color="eventColor(m.eventType)"
        :fill-color="eventColor(m.eventType)"
        :fill-opacity="m.resolved ? 0.4 : 0.8"
        :dash-array="m.resolved ? '4, 4' : undefined"
      >
        <LPopup>
          <strong>{{ $t('eventTypes.' + m.eventType) }}</strong>
          <div v-if="m.date" class="popup-date">{{ m.date }}</div>
          <div class="popup-place">
            <router-link :to="'/places/' + m.placeId" class="popup-link">{{ m.placeName }}</router-link>
          </div>
        </LPopup>
      </LCircleMarker>
    </BaseMap>
  </div>
  <div v-else class="empty-hint">{{ $t('empty.places') }}</div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { LCircleMarker, LPolyline, LPopup } from '@vue-leaflet/vue-leaflet';
import BaseMap from './BaseMap.vue';
import { usePlaceResolver } from '../composables/usePlaceResolver';

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

const markers = ref<Marker[]>([]);
const baseMapRef = ref<InstanceType<typeof BaseMap> | null>(null);

const polylinePoints = ref<[number, number][]>([]);

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

async function load() {
  if (!props.personId) { markers.value = []; return; }
  await ensureLoaded();
  const events = (await window.api.events.forPerson(props.personId)) as EventRow[];
  const eventsWithPlaces = events.filter(e => e.place_id);

  const placeCache = new Map<string, PlaceRow | null>();
  const pathCache = new Map<string, string>();
  const result: Marker[] = [];

  for (const ev of eventsWithPlaces) {
    let place = placeCache.get(ev.place_id!);
    if (place === undefined) {
      place = (await window.api.places.get(ev.place_id!)) as PlaceRow | null;
      placeCache.set(ev.place_id!, place);
    }
    if (!place) continue;
    let fullPath = pathCache.get(place.id);
    if (fullPath === undefined) {
      fullPath = (await window.api.places.getPath(place.id)) as string;
      pathCache.set(place.id, fullPath);
    }
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

  markers.value = result;
  polylinePoints.value = result.map(m => [m.lat, m.lon] as [number, number]);

  if (baseMapRef.value?.getLeafletObject()) fitBounds();
}

watch(() => props.personId, load, { immediate: true });
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
