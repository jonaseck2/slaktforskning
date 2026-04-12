import type { Gazetteer, GazetteerConfig } from './types';
import svSocknar from './data/sv-socknar.json';
import svForsamlingar from './data/sv-forsamlingar.json';
import svOrter from './data/sv-orter.json';
import svGardar from './data/sv-gardar.json';
import svKyrkor from './data/sv-kyrkor.json';

const BUNDLED_GAZETTEERS: Gazetteer[] = [
  svSocknar as Gazetteer,
  svForsamlingar as Gazetteer,
  svOrter as Gazetteer,
  svGardar as Gazetteer,
  svKyrkor as Gazetteer,
];

export function getAllGazetteers(): Gazetteer[] {
  return BUNDLED_GAZETTEERS;
}

export function loadGazetteers(config: GazetteerConfig): Gazetteer[] {
  const enabled = new Set(config.enabledGazetteers);
  return BUNDLED_GAZETTEERS.filter(g => enabled.has(g.id));
}
