/* eslint-disable no-restricted-syntax */
// Sync fs reads in this file are intentional and bounded:
// gazetteers load once at module init (before any IPC handler is registered).
// They are NOT executed per-handler, so the worker-thread sync-I/O ban does
// not apply. See .claude/rules/api.md "Worker-thread sync I/O" — that rule
// targets handlers, not one-shot module init.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import {
  SV_RULES, DK_RULES, NO_RULES, FI_RULES, IS_RULES, EN_RULES, DE_RULES, GB_RULES,
} from '../../gazetteer-build/normalize-rules';
import type { Gazetteer, GazetteerNode, GazetteerNormalizeRules } from './types';

// Order matters — preserved from the original 29-static-import list. Resolver
// precedence may depend on this ordering.
const BUNDLED_GAZETTEER_IDS: readonly string[] = [
  // Swedish
  'sv-socknar', 'sv-forsamlingar', 'sv-orter', 'sv-gardar', 'sv-kyrkor',
  'sv-landskap', 'sv-sockenstad-boundaries',
  // Danish
  'dk-sogne', 'dk-sogne-dawa',
  // Norwegian
  'no-kommuner',
  // Finnish
  'fi-kunnat',
  // Icelandic
  'is-sveitarfelog',
  // German
  'de-gemeinden', 'de-kirchgemeinden', 'de-gemeinden-boundaries',
  // British Isles
  'gb-civil-divisions',
  // Ireland
  'ie-counties',
  // Netherlands
  'nl-gemeenten',
  // Belgium
  'be-provinces',
  // France
  'fr-departements',
  // North American
  'us-immigration-states', 'us-all-states', 'ca-provinces',
  // Global
  'world-countries', 'world-admin1',
  // Historical
  'world-historical',
  // Language gazetteers
  'lang-sv-geonames', 'lang-sv-wikidata', 'lang-world-historical',
  // Boundary gazetteers
  'dk-sogne-boundaries', 'no-kommuner-boundaries', 'fi-kunnat-boundaries',
  'is-sveitarfelog-boundaries', 'us-counties-boundaries',
  'ca-divisions-boundaries', 'world-boundaries',
];

const HERE = dirname(fileURLToPath(import.meta.url));

// Resolves to one of two locations depending on whether we're running from
// source (tests, dev, ts-node) or from a Vite-built bundle:
//   - Built: <bundle-dir>/gazetteers/<id>.json.gz (gzipped, shipped in app.asar)
//   - Source: <src/api/place-gazetteers>/data/<id>.json (raw, authored truth)
// The compressed sibling is preferred when present; falls back to raw for
// vitest and any direct-source consumer.
function loadGazetteer(id: string): Gazetteer {
  const gzPath = resolve(HERE, 'gazetteers', `${id}.json.gz`);
  if (existsSync(gzPath)) {
    return JSON.parse(gunzipSync(readFileSync(gzPath)).toString('utf8')) as Gazetteer;
  }
  const rawPath = resolve(HERE, 'data', `${id}.json`);
  return JSON.parse(readFileSync(rawPath, 'utf8')) as Gazetteer;
}

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
  'sv-landskap': SV_RULES,
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
  // German
  'de-gemeinden': DE_RULES,
  'de-kirchgemeinden': DE_RULES,
  'de-gemeinden-boundaries': DE_RULES,
  // British Isles
  'gb-civil-divisions': GB_RULES,
  // Ireland — share GB normalize rules (English + civil-parish/county-of patterns)
  'ie-counties': GB_RULES,
  // Netherlands — universal-only is fine; Provincie/Gemeente prefixes already
  // stripped at build time and kept as aliases.
  'nl-gemeenten': { stripSuffixes: [], stripPrefixes: ['provincie', 'gemeente'] },
  // Belgium — bilingual prefixes
  'be-provinces': { stripSuffixes: ['gemeente', 'commune', 'ville', 'stad'], stripPrefixes: ['provincie', 'province de', 'province du', 'commune de', 'ville de'] },
  // France — French civil-administrative suffixes
  'fr-departements': { stripSuffixes: ['commune', 'département', 'région', 'canton', 'ville', 'arrondissement'], stripPrefixes: ['commune de', 'département de', 'département du', 'région', 'arrondissement de', 'canton de', 'ville de'] },
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
  if (!gaz.root) return gaz;
  // Pre-migration self-rooted gazetteers exposed län directly under root; the
  // global hierarchy puts them under World > Europe > Sweden, so we walk the
  // whole tree and inject aliases wherever a node name matches a known län.
  function walk(node: GazetteerNode): void {
    const extra: string[] = [];
    // Lookup keys come from the pre-migration self-rooted era ("Stockholms län").
    // The new tree often stores the bare form ("Stockholm") as `name` with
    // "Stockholms län" in aliases — match either to remain compatible.
    const lookupKeys = [node.name, ...(node.aliases ?? [])];
    for (const key of lookupKeys) {
      const hist = HISTORICAL_LAN_ALIASES[key];
      if (hist) extra.push(...hist);
      const letters = LAN_LETTER_CODES[key];
      if (letters) extra.push(...letters);
    }
    if (extra.length > 0) {
      const existing = new Set(node.aliases ?? []);
      const merged = [...(node.aliases ?? [])];
      for (const alias of extra) {
        if (!existing.has(alias)) merged.push(alias);
      }
      (node as GazetteerNode).aliases = merged;
    }
    if (node.children) for (const child of node.children) walk(child);
  }
  walk(gaz.root);
  return gaz;
}

const BUNDLED_GAZETTEERS: Gazetteer[] = BUNDLED_GAZETTEER_IDS
  .map(loadGazetteer)
  .map(attachNormalizeRules)
  .map(enrichHistoricalAliases);

export function getAllGazetteers(): Gazetteer[] {
  return BUNDLED_GAZETTEERS;
}
