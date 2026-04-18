import type { Gazetteer, GazetteerConfig, GazetteerNode } from './types';
// Swedish
import svSocknar from './data/sv-socknar.json';
import svForsamlingar from './data/sv-forsamlingar.json';
import svOrter from './data/sv-orter.json';
import svGardar from './data/sv-gardar.json';
import svKyrkor from './data/sv-kyrkor.json';
import svSockenstadBoundaries from './data/sv-sockenstad-boundaries.json';
// Danish
import dkSogne from './data/dk-sogne.json';
import dkSogneDawa from './data/dk-sogne-dawa.json';
// Norwegian
import noKommuner from './data/no-kommuner.json';
// Finnish
import fiKunnat from './data/fi-kunnat.json';
// Icelandic
import isSveitarfelog from './data/is-sveitarfelog.json';
// North American
import usImmigrationStates from './data/us-immigration-states.json';
import caProvinces from './data/ca-provinces.json';
// Global
import worldCountries from './data/world-countries.json';
import worldAdmin1 from './data/world-admin1.json';

// Historical Swedish county (län) names → modern equivalents
// These were renamed in the 1997 county reform
const HISTORICAL_LAN_ALIASES: Record<string, string[]> = {
  'Dalarnas län': ['Kopparbergs län', 'Kopparbergs'],
  'Västra Götalands län': ['Älvsborgs län', 'Älvsborgs', 'Skaraborgs län', 'Skaraborgs', 'Göteborgs och Bohus län'],
  'Skåne län': ['Malmöhus län', 'Malmöhus', 'Kristianstads län', 'Kristianstads'],
};

function enrichHistoricalAliases(gaz: Gazetteer): Gazetteer {
  if (!gaz.root.children) return gaz;
  for (const child of gaz.root.children) {
    const extra = HISTORICAL_LAN_ALIASES[child.name];
    if (extra) {
      const existing = new Set(child.aliases ?? []);
      const merged = [...(child.aliases ?? [])];
      for (const alias of extra) {
        if (!existing.has(alias)) merged.push(alias);
      }
      (child as GazetteerNode).aliases = merged;
    }
  }
  return gaz;
}

const BUNDLED_GAZETTEERS: Gazetteer[] = [
  // Swedish
  svSocknar as Gazetteer,
  svForsamlingar as Gazetteer,
  svOrter as Gazetteer,
  svGardar as Gazetteer,
  svKyrkor as Gazetteer,
  svSockenstadBoundaries as Gazetteer,
  // Danish
  dkSogne as Gazetteer,
  dkSogneDawa as Gazetteer,
  // Norwegian
  noKommuner as Gazetteer,
  // Finnish
  fiKunnat as Gazetteer,
  // Icelandic
  isSveitarfelog as Gazetteer,
  // North American
  usImmigrationStates as Gazetteer,
  caProvinces as Gazetteer,
  // Global
  worldCountries as Gazetteer,
  worldAdmin1 as Gazetteer,
].map(enrichHistoricalAliases);

export function getAllGazetteers(): Gazetteer[] {
  return BUNDLED_GAZETTEERS;
}

export function loadGazetteers(config: GazetteerConfig, imported: Gazetteer[] = []): Gazetteer[] {
  const enabled = new Set(config.enabledGazetteers);
  const all = [...BUNDLED_GAZETTEERS, ...imported];
  return all.filter(g => enabled.has(g.id));
}
