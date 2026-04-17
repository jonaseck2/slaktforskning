import { ref } from 'vue';
import { resolvePlace, resolveBoundary as resolveBoundaryFn, type BoundaryHint } from '../../api/place-gazetteers/resolver';
import { loadGazetteers, getAllGazetteers } from '../../api/place-gazetteers/index';
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
    const raw = (await window.api.db.getSetting('gazetteer_config')) as string | null;
    let config: GazetteerConfig;
    if (raw) {
      config = JSON.parse(raw) as GazetteerConfig;
    } else {
      // Default: enable all bundled gazetteers on new databases
      const bundledIds = getAllGazetteers().map(g => g.id);
      config = { enabledGazetteers: bundledIds };
      // Persist so it stays consistent with GazetteersView
      await window.api.db.setSetting('gazetteer_config', JSON.stringify(config));
    }
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

  async function ensureBoundaryLoaded() {
    if (boundaryLoaded) return;
    const imported = (await window.api.gazetteers.getImported()) as Gazetteer[];
    const all = [...getAllGazetteers(), ...imported];
    boundaryGazetteersRef = all.filter(g => g.kind === 'boundary');
    boundaryLoaded = true;
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

  return { ready, ensureLoaded, resolve, resolveBoundary, invalidate, getGazetteers };
}
