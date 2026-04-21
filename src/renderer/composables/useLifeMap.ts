import { ref, watch, type Ref } from 'vue';

export interface LifeMapEvent {
  id: string;
  eventType: string;
  dateISO: string | null;
  placeName: string;
  lat: number;
  lon: number;
  description: string | null;
}

export interface LifeMapData {
  events: LifeMapEvent[];
  bounds: { north: number; south: number; east: number; west: number } | null;
}

export function useLifeMap(personId: Ref<string | null>) {
  const data = ref<LifeMapData>({ events: [], bounds: null });
  const loading = ref(false);

  async function load() {
    if (!personId.value) {
      data.value = { events: [], bounds: null };
      return;
    }
    loading.value = true;
    try {
      const events = (await (window as unknown as { api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> }).api.events.forPerson(personId.value)) as Array<Record<string, unknown>>;
      const geocoded: LifeMapEvent[] = [];
      for (const e of events) {
        const placeId = e.place_id as string | null;
        if (!placeId) continue;
        const place = (await (window as unknown as { api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> }).api.places.get(placeId)) as Record<string, unknown> | null;
        if (!place || place.latitude == null || place.longitude == null) continue;
        geocoded.push({
          id: e.id as string,
          eventType: e.event_type as string,
          dateISO: (e.date_value as string) || null,
          placeName: place.name as string,
          lat: place.latitude as number,
          lon: place.longitude as number,
          description: (e.description as string) || null,
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
