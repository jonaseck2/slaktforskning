<template>
  <div v-if="markers.length > 0" class="person-map-container">
    <LMap
      ref="mapRef"
      :zoom="4"
      :center="[55, 15]"
      :use-global-leaflet="false"
      @ready="fitBounds"
    >
      <LTileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
        layer-type="base"
      />
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
    </LMap>
  </div>
  <div v-else class="empty-hint">{{ $t('map.empty') }}</div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { LMap, LTileLayer, LCircleMarker, LPolyline, LPopup } from '@vue-leaflet/vue-leaflet';
import 'leaflet/dist/leaflet.css';
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
  matchQuality?: string;
}

const props = defineProps<{ personId: string }>();

const { ready: resolverReady, ensureLoaded, resolve: resolvePlace } = usePlaceResolver();

const markers = ref<Marker[]>([]);
const mapRef = ref<InstanceType<typeof LMap> | null>(null);

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
    const map = mapRef.value?.leafletObject;
    if (!map || markers.value.length === 0) return;
    const bounds = markers.value.map(m => [m.lat, m.lon] as [number, number]);
    if (bounds.length === 1) {
      map.setView(bounds[0], 10);
    } else {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  });
}

async function load() {
  if (!props.personId) { markers.value = []; return; }
  await ensureLoaded();
  const events = (await window.api.events.forPerson(props.personId)) as EventRow[];
  const eventsWithPlaces = events.filter(e => e.place_id);

  const placeCache = new Map<string, PlaceRow | null>();
  const result: Marker[] = [];

  for (const ev of eventsWithPlaces) {
    let place = placeCache.get(ev.place_id!);
    if (place === undefined) {
      place = (await window.api.places.get(ev.place_id!)) as PlaceRow | null;
      placeCache.set(ev.place_id!, place);
    }
    if (place && place.latitude != null && place.longitude != null) {
      result.push({
        lat: place.latitude,
        lon: place.longitude,
        eventType: ev.event_type,
        date: ev.date_original || ev.date_value,
        placeName: place.name,
        placeId: place.id,
      });
    } else if (place && resolverReady.value) {
      const resolved = resolvePlace(place.name);
      if (resolved) {
        result.push({
          lat: resolved.lat,
          lon: resolved.lon,
          eventType: ev.event_type,
          date: ev.date_original || ev.date_value,
          placeName: place.name,
          placeId: place.id,
          resolved: true,
          matchQuality: resolved.matchQuality,
        });
      }
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

  if (mapRef.value?.leafletObject) fitBounds();
}

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.person-map-container {
  height: 350px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #ddd;
}
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
