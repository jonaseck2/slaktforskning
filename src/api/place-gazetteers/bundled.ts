import {
  SV_RULES, DK_RULES, NO_RULES, FI_RULES, IS_RULES, EN_RULES,
} from '../../gazetteer-build/normalize-rules';
import type { Gazetteer, GazetteerNode, GazetteerNormalizeRules } from './types';
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

// Standard one- or two-letter county codes used in Swedish genealogical
// notation (e.g. "Solna (B)", "Mosås (T)"). These alias each modern län
// to the letter the source records use; combined with HISTORICAL_LAN_ALIASES
// the resolver also picks up historical letters like W (Kopparberg) and
// O (Göteborgs och Bohus). See BENGT #27.
export const LAN_LETTER_CODES: Record<string, string[]> = {
  'Stockholms län': ['AB', 'A', 'B'],
  'Uppsala län': ['C'],
  'Södermanlands län': ['D'],
  'Östergötlands län': ['E'],
  'Jönköpings län': ['F'],
  'Kronobergs län': ['G'],
  'Kalmar län': ['H'],
  'Gotlands län': ['I'],
  'Blekinge län': ['K'],
  'Skåne län': ['L', 'M'], // L = Kristianstad, M = Malmöhus (pre-1997)
  'Hallands län': ['N'],
  'Västra Götalands län': ['O', 'P', 'R'], // O = Bohus, P = Älvsborg, R = Skaraborg
  'Värmlands län': ['S'],
  'Örebro län': ['T'],
  'Västmanlands län': ['U'],
  'Dalarnas län': ['W'],
  'Gävleborgs län': ['X'],
  'Västernorrlands län': ['Y'],
  'Jämtlands län': ['Z'],
  'Västerbottens län': ['AC'],
  'Norrbottens län': ['BD'],
};

// Per-gazetteer normalization rules, applied at load time so we don't have to
// regenerate the multi-megabyte bundled JSON files when the rule sets change.
// Imported (third-party) gazetteers can ship a `normalize` field on their JSON
// directly. World/historical gazetteers get NO rules — universal normalization
// only.
const NORMALIZE_RULES_BY_ID: Record<string, GazetteerNormalizeRules> = {
  // Swedish
  'sv-socknar': SV_RULES,
  'sv-forsamlingar': SV_RULES,
  'sv-orter': SV_RULES,
  'sv-gardar': SV_RULES,
  'sv-kyrkor': SV_RULES,
  'sv-sockenstad-boundaries': SV_RULES,
  // Danish
  'dk-sogne': DK_RULES,
  'dk-sogne-dawa': DK_RULES,
  'dk-sogne-boundaries': DK_RULES,
  // Norwegian
  'no-kommuner': NO_RULES,
  'no-kommuner-boundaries': NO_RULES,
  // Finnish
  'fi-kunnat': FI_RULES,
  'fi-kunnat-boundaries': FI_RULES,
  // Icelandic
  'is-sveitarfelog': IS_RULES,
  'is-sveitarfelog-boundaries': IS_RULES,
  // English / North American (admin1-style)
  'us-immigration-states': EN_RULES,
  'us-all-states': EN_RULES,
  'ca-provinces': EN_RULES,
  'world-admin1': EN_RULES,
};

function attachNormalizeRules(gaz: Gazetteer): Gazetteer {
  const rules = NORMALIZE_RULES_BY_ID[gaz.id];
  if (rules && !gaz.normalize) {
    (gaz as Gazetteer).normalize = rules;
  }
  return gaz;
}

function enrichHistoricalAliases(gaz: Gazetteer): Gazetteer {
  if (!gaz.root.children) return gaz;
  for (const child of gaz.root.children) {
    const extra: string[] = [];
    const hist = HISTORICAL_LAN_ALIASES[child.name];
    if (hist) extra.push(...hist);
    const letters = LAN_LETTER_CODES[child.name];
    if (letters) extra.push(...letters);
    if (extra.length === 0) continue;
    const existing = new Set(child.aliases ?? []);
    const merged = [...(child.aliases ?? [])];
    for (const alias of extra) {
      if (!existing.has(alias)) merged.push(alias);
    }
    (child as GazetteerNode).aliases = merged;
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
].map(attachNormalizeRules).map(enrichHistoricalAliases);

export function getAllGazetteers(): Gazetteer[] {
  return BUNDLED_GAZETTEERS;
}
