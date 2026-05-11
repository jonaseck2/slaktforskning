// Tauri-renderer-side replacement for src/api/place-gazetteers/bundled.ts.
// The real file does fileURLToPath(import.meta.url) + readFileSync at module
// init — works in Node but throws on tauri:// URLs and there's no fs in the
// renderer. Instead, we Vite-bake every JSON in src/api/place-gazetteers/data/
// at build time via import.meta.glob, and re-export the same surface the
// real bundled.ts exposes (BUNDLED_GAZETTEERS, getAllGazetteers,
// getGazetteerById, LAN_LETTER_CODES, HISTORICAL_LAN_ALIASES).
//
// Vite resolves the glob at build time, inlining each JSON as its own
// chunk. ~70 MB raw → ~10 MB gzipped in the prod build (Vite handles the
// compression). Dev mode pays the JSON-parse cost on first import per file.

import {
  SV_RULES, DK_RULES, NO_RULES, FI_RULES, IS_RULES, EN_RULES, DE_RULES, GB_RULES,
} from '../gazetteer-build/normalize-rules';
import type { Gazetteer, GazetteerNode, GazetteerNormalizeRules } from '../api/place-gazetteers/types';

const RAW: Record<string, Gazetteer> = import.meta.glob(
  '../api/place-gazetteers/data/*.json',
  { eager: true, import: 'default' },
) as Record<string, Gazetteer>;

// Order matters — same precedence list the real bundled.ts uses.
const BUNDLED_IDS: readonly string[] = [
  'sv-socknar', 'sv-forsamlingar', 'sv-orter', 'sv-gardar', 'sv-kyrkor',
  'sv-landskap', 'sv-sockenstad-boundaries',
  'dk-sogne', 'dk-sogne-dawa',
  'no-kommuner',
  'fi-kunnat',
  'is-sveitarfelog',
  'de-gemeinden', 'de-kirchgemeinden', 'de-gemeinden-boundaries',
  'gb-civil-divisions',
  'ie-counties',
  'nl-gemeenten',
  'be-provinces',
  'fr-departements',
  'ee-counties', 'lv-novadi', 'lt-savivaldybes',
  'pl-powiaty',
  'at-bezirke', 'ch-cantons', 'it-province', 'es-provincias', 'pt-distritos',
  'mt-localities', 'sm-castelli', 'li-gemeinden', 'ad-parroquies', 'mc-quartiers',
  'cz-okresy', 'sk-okresy', 'hu-jarasok', 'si-obcine', 'hr-zupanije',
  'ba-opstine', 'rs-okruzi', 'me-opstine', 'mk-opstini', 'al-bashkite',
  'xk-komunat', 'lu-communes',
  'bg-obshtini', 'ro-judete', 'md-raioane', 'gr-dimoi', 'cy-eparchies',
  'by-rajony', 'ua-oblasti', 'fo-kommunur', 'gl-kommune',
  'us-immigration-states', 'us-all-states', 'ca-provinces',
  'world-countries', 'world-admin1',
  'world-historical', 'europe-historical',
  'lang-sv-geonames', 'lang-sv-wikidata', 'lang-world-historical',
  'dk-sogne-boundaries', 'no-kommuner-boundaries', 'fi-kunnat-boundaries',
  'is-sveitarfelog-boundaries', 'us-counties-boundaries',
  'ca-divisions-boundaries', 'world-boundaries',
];

function lookupById(id: string): Gazetteer | undefined {
  // Vite glob keys come back as relative paths from this file's dir.
  const key = `../api/place-gazetteers/data/${id}.json`;
  return RAW[key];
}

export const HISTORICAL_LAN_ALIASES: Record<string, string[]> = {
  'Dalarnas län': ['Kopparbergs län', 'Kopparbergs'],
  'Västra Götalands län': ['Älvsborgs län', 'Älvsborgs', 'Skaraborgs län', 'Skaraborgs', 'Göteborgs och Bohus län'],
  'Skåne län': ['Malmöhus län', 'Malmöhus', 'Kristianstads län', 'Kristianstads'],
};

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
  'Skåne län': ['L', 'M'],
  'Hallands län': ['N'],
  'Västra Götalands län': ['O', 'P', 'R'],
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

const NORMALIZE_RULES_BY_ID: Record<string, GazetteerNormalizeRules> = {
  'sv-socknar': SV_RULES, 'sv-forsamlingar': SV_RULES, 'sv-orter': SV_RULES,
  'sv-gardar': SV_RULES, 'sv-kyrkor': SV_RULES, 'sv-landskap': SV_RULES,
  'sv-sockenstad-boundaries': SV_RULES,
  'dk-sogne': DK_RULES, 'dk-sogne-dawa': DK_RULES, 'dk-sogne-boundaries': DK_RULES,
  'no-kommuner': NO_RULES, 'no-kommuner-boundaries': NO_RULES,
  'fi-kunnat': FI_RULES, 'fi-kunnat-boundaries': FI_RULES,
  'is-sveitarfelog': IS_RULES, 'is-sveitarfelog-boundaries': IS_RULES,
  'gb-civil-divisions': GB_RULES, 'ie-counties': GB_RULES,
  'de-gemeinden': DE_RULES, 'de-kirchgemeinden': DE_RULES,
  'de-gemeinden-boundaries': DE_RULES,
  'us-immigration-states': EN_RULES, 'us-all-states': EN_RULES, 'ca-provinces': EN_RULES,
  'us-counties-boundaries': EN_RULES, 'ca-divisions-boundaries': EN_RULES,
};

function attachNormalizeRules(gaz: Gazetteer): Gazetteer {
  const explicit = NORMALIZE_RULES_BY_ID[gaz.id];
  if (explicit && !gaz.normalize) (gaz as { normalize?: GazetteerNormalizeRules }).normalize = explicit;
  return gaz;
}

function enrichHistoricalAliases(gaz: Gazetteer): Gazetteer {
  if (gaz.id !== 'sv-landskap' && !gaz.id.startsWith('sv-')) return gaz;
  function walk(node: GazetteerNode | { name?: string; aliases?: string[]; children?: GazetteerNode[] }): void {
    if (node && 'name' in node && node.name && HISTORICAL_LAN_ALIASES[node.name]) {
      const merged = Array.from(new Set([
        ...(node.aliases ?? []),
        ...HISTORICAL_LAN_ALIASES[node.name],
        ...(LAN_LETTER_CODES[node.name] ?? []),
      ]));
      (node as GazetteerNode).aliases = merged;
    }
    if (node?.children) for (const child of node.children) walk(child);
  }
  walk(gaz.root);
  return gaz;
}

export const BUNDLED_GAZETTEERS: Gazetteer[] = BUNDLED_IDS
  .map(lookupById)
  .filter((g): g is Gazetteer => !!g)
  .map(attachNormalizeRules)
  .map(enrichHistoricalAliases);

export const BUNDLED_GAZETTEER_MAP: Record<string, Gazetteer> = Object.fromEntries(
  BUNDLED_GAZETTEERS.map(g => [g.id, g]),
);

export function getAllGazetteers(): Gazetteer[] {
  return BUNDLED_GAZETTEERS;
}

export function getGazetteerById(id: string): Gazetteer | undefined {
  return BUNDLED_GAZETTEER_MAP[id];
}

export function getBundledGazetteerIds(): string[] {
  return BUNDLED_GAZETTEERS.map(g => g.id);
}
