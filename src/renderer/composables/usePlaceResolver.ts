import { ref } from 'vue';
import { resolvePlace, resolveBoundary as resolveBoundaryFn, type BoundaryHint } from '../../api/place-gazetteers/resolver';
import { loadGazetteers } from '../../api/place-gazetteers/merge';
import type { Gazetteer, GazetteerConfig, PlaceResolveResult, BoundaryResolveResult } from '../../api/place-gazetteers/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const cache = new Map<string, PlaceResolveResult | null>();
const boundaryCache = new Map<string, BoundaryResolveResult | null>();
let gazetteersRef: Gazetteer[] = [];
let configLoaded = false;
let boundaryGazetteersRef: Gazetteer[] = [];
let boundaryLoaded = false;

export function usePlaceResolver() {
  const ready = ref(false);

  async function ensureLoaded() {
    if (configLoaded) { ready.value = true; return; }
    try {
      const raw = (await window.api.db.getSetting('gazetteer_config')) as string | null;
      // console.time('[usePlaceResolver] getBundled+getImported');
      const [bundled, imported] = await Promise.all([
        window.api.gazetteers.getBundled() as Promise<Gazetteer[]>,
        window.api.gazetteers.getImported() as Promise<Gazetteer[]>,
      ]);
      // console.timeEnd('[usePlaceResolver] getBundled+getImported');

      let config: GazetteerConfig;
      if (raw) {
        config = JSON.parse(raw) as GazetteerConfig;
      } else {
        // Default: enable all bundled gazetteers on new databases
        config = { enabledGazetteers: bundled.map(g => g.id) };
        await window.api.db.setSetting('gazetteer_config', JSON.stringify(config));
      }
      gazetteersRef = loadGazetteers(config, bundled, imported);
      configLoaded = true;
      ready.value = true;
    } catch (err) {
      console.error('[usePlaceResolver] ensureLoaded failed:', err);
      gazetteersRef = [];
      configLoaded = false;
      ready.value = false;
    }
  }

  function resolve(placeName: string): PlaceResolveResult | null {
    if (gazetteersRef.length === 0) return null;
    const cacheKey = placeName;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    const result = resolvePlace(placeName, gazetteersRef);
    cache.set(cacheKey, result);
    return result;
  }

  async function ensureBoundaryLoaded() {
    if (boundaryLoaded) return;
    try {
      const [bundled, imported] = await Promise.all([
        window.api.gazetteers.getBundled() as Promise<Gazetteer[]>,
        window.api.gazetteers.getImported() as Promise<Gazetteer[]>,
      ]);
      boundaryGazetteersRef = [...bundled, ...imported].filter(g => g.kind === 'boundary');
      boundaryLoaded = true;
    } catch (err) {
      console.error('[usePlaceResolver] ensureBoundaryLoaded failed:', err);
      boundaryGazetteersRef = [];
      boundaryLoaded = false;
    }
  }

  async function resolveBoundary(placeName: string, hint?: BoundaryHint): Promise<BoundaryResolveResult | null> {
    await ensureBoundaryLoaded();
    if (boundaryGazetteersRef.length === 0) return null;
    const cacheKey = hint ? `${placeName}@${hint.lat},${hint.lon}` : placeName;
    if (boundaryCache.has(cacheKey)) return boundaryCache.get(cacheKey)!;
    const result = resolveBoundaryFn(placeName, boundaryGazetteersRef, hint);
    boundaryCache.set(cacheKey, result);
    return result;
  }

  function invalidate() {
    cache.clear();
    boundaryCache.clear();
    configLoaded = false;
    boundaryLoaded = false;
    ready.value = false;
  }

  function getGazetteers(): Gazetteer[] {
    return gazetteersRef;
  }

  function resolveCoordinates(
    place: { latitude: number | null; longitude: number | null },
    placePath: string
  ): { lat: number; lon: number; resolved: boolean } | null {
    if (place.latitude != null && place.longitude != null) {
      return { lat: place.latitude, lon: place.longitude, resolved: false };
    }
    const result = resolve(placePath);
    if (result) {
      return { lat: result.lat, lon: result.lon, resolved: true };
    }
    return null;
  }

  return { ready, ensureLoaded, resolve, resolveCoordinates, resolveBoundary, invalidate, getGazetteers };
}
