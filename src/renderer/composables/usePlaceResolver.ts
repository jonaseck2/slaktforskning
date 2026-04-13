import { ref } from 'vue';
import { resolvePlace } from '../../api/place-gazetteers/resolver';
import { loadGazetteers } from '../../api/place-gazetteers/index';
import type { Gazetteer, GazetteerConfig, PlaceResolveResult } from '../../api/place-gazetteers/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const cache = new Map<string, PlaceResolveResult | null>();
let gazetteersRef: Gazetteer[] = [];
let configLoaded = false;

export function usePlaceResolver() {
  const ready = ref(false);

  async function ensureLoaded() {
    if (configLoaded) { ready.value = true; return; }
    const raw = (await window.api.db.getSetting('gazetteer_config')) as string | null;
    const config: GazetteerConfig = raw
      ? JSON.parse(raw) as GazetteerConfig
      : { enabledGazetteers: [] };
    const imported = (await window.api.gazetteers.getImported()) as Gazetteer[];
    gazetteersRef = loadGazetteers(config, imported);
    configLoaded = true;
    ready.value = true;
  }

  function resolve(placeName: string): PlaceResolveResult | null {
    if (gazetteersRef.length === 0) return null;
    const cacheKey = placeName;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    const result = resolvePlace(placeName, gazetteersRef);
    cache.set(cacheKey, result);
    return result;
  }

  function invalidate() {
    cache.clear();
    configLoaded = false;
    ready.value = false;
  }

  function getGazetteers(): Gazetteer[] {
    return gazetteersRef;
  }

  return { ready, ensureLoaded, resolve, invalidate, getGazetteers };
}
