import type { Gazetteer, GazetteerNode } from './types';
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
import usAllStates from './data/us-all-states.json';
import caProvinces from './data/ca-provinces.json';
// Global
import worldCountries from './data/world-countries.json';
import worldAdmin1 from './data/world-admin1.json';
// Historical
import worldHistorical from './data/world-historical.json';
// Language gazetteers
import langSvGeonames from './data/lang-sv-geonames.json';
import langSvWikidata from './data/lang-sv-wikidata.json';
import langWorldHistorical from './data/lang-world-historical.json';
// Boundary gazetteers
import dkSogneBoundaries from './data/dk-sogne-boundaries.json';
import noKommunerBoundaries from './data/no-kommuner-boundaries.json';
import fiKunnatBoundaries from './data/fi-kunnat-boundaries.json';
import isSveitarfelogBoundaries from './data/is-sveitarfelog-boundaries.json';
import usCountiesBoundaries from './data/us-counties-boundaries.json';
import caDivisionsBoundaries from './data/ca-divisions-boundaries.json';
import worldBoundaries from './data/world-boundaries.json';

// Historical Swedish county (län) names → modern equivalents.
// These were renamed in the 1997 county reform.
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
  usAllStates as Gazetteer,
  caProvinces as Gazetteer,
  // Global
  worldCountries as Gazetteer,
  worldAdmin1 as Gazetteer,
  // Historical
  worldHistorical as Gazetteer,
  // Language gazetteers
  langSvGeonames as Gazetteer,
  langSvWikidata as Gazetteer,
  langWorldHistorical as Gazetteer,
  // Boundary gazetteers
  dkSogneBoundaries as Gazetteer,
  noKommunerBoundaries as Gazetteer,
  fiKunnatBoundaries as Gazetteer,
  isSveitarfelogBoundaries as Gazetteer,
  usCountiesBoundaries as Gazetteer,
  caDivisionsBoundaries as Gazetteer,
  worldBoundaries as Gazetteer,
].map(enrichHistoricalAliases);

export function getAllGazetteers(): Gazetteer[] {
  return BUNDLED_GAZETTEERS;
}
