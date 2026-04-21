import { ref, watch, type Ref } from 'vue';
import { usePlaceResolver } from './usePlaceResolver';

export interface LifeMapEvent {
  id: string;
  eventType: string;
  dateISO: string | null;
  placeName: string;
  lat: number;
  lon: number;
  description: string | null;
  resolved?: boolean;
}

export interface LifeMapData {
  events: LifeMapEvent[];
  bounds: { north: number; south: number; east: number; west: number } | null;
}

type Api = Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;

export function useLifeMap(personId: Ref<string | null>) {
  const data = ref<LifeMapData>({ events: [], bounds: null });
  const loading = ref(false);
  const { ensureLoaded, resolveCoordinates } = usePlaceResolver();

  async function load() {
    if (!personId.value) {
      data.value = { events: [], bounds: null };
      return;
    }
    loading.value = true;
    try {
      await ensureLoaded();
      const api = (window as unknown as { api: Api }).api;
      const events = (await api.events.forPerson(personId.value)) as Array<Record<string, unknown>>;
      const placeCache = new Map<string, Record<string, unknown> | null>();
      const pathCache = new Map<string, string>();
      const geocoded: LifeMapEvent[] = [];
      for (const e of events) {
        const placeId = e.place_id as string | null;
        if (!placeId) continue;
        let place = placeCache.get(placeId);
        if (place === undefined) {
          place = (await api.places.get(placeId)) as Record<string, unknown> | null;
          placeCache.set(placeId, place ?? null);
        }
        if (!place) continue;
        let placePath = pathCache.get(placeId);
        if (placePath === undefined) {
          placePath = (await api.places.getPath(placeId)) as string;
          pathCache.set(placeId, placePath);
        }
        const coords = resolveCoordinates(
          place as { latitude: number | null; longitude: number | null },
          placePath,
        );
        if (!coords) continue;
        geocoded.push({
          id: e.id as string,
          eventType: e.event_type as string,
          dateISO: (e.date_value as string) || null,
          placeName: place.name as string,
          lat: coords.lat,
          lon: coords.lon,
          description: (e.description as string) || null,
          resolved: coords.resolved,
        });
      }
      geocoded.sort((a, b) => (a.dateISO || '').localeCompare(b.dateISO || ''));

      const bounds = geocoded.length
        ? {
            north: Math.max(...geocoded.map((g) => g.lat)),
            south: Math.min(...geocoded.map((g) => g.lat)),
            east: Math.max(...geocoded.map((g) => g.lon)),
            west: Math.min(...geocoded.map((g) => g.lon)),
          }
        : null;

      data.value = { events: geocoded, bounds };
    } catch (err) {
      console.error('[useLifeMap] load failed:', err);
    } finally {
      loading.value = false;
    }
  }

  watch(personId, load, { immediate: true });

  return { data, loading, reload: load };
}
