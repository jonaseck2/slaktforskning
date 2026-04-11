import type { Gazetteer, GazetteerConfig } from './types';
import svParishes from './data/sv-parishes.json';

const BUNDLED_GAZETTEERS: Gazetteer[] = [
  svParishes as Gazetteer,
];

export function getAllGazetteers(): Gazetteer[] {
  return BUNDLED_GAZETTEERS;
}

export function loadGazetteers(config: GazetteerConfig): Gazetteer[] {
  const enabled = new Set(config.enabledGazetteers);
  return BUNDLED_GAZETTEERS.filter(g => enabled.has(g.id));
}
