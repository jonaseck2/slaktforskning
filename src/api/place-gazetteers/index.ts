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
import usAllStates from './data/us-all-states.json';
import caProvinces from './data/ca-provinces.json';
// Global
import worldCountries from './data/world-countries.json';
import worldAdmin1 from './data/world-admin1.json';
// Boundary gazetteers
import dkSogneBoundaries from './data/dk-sogne-boundaries.json';
import noKommunerBoundaries from './data/no-kommuner-boundaries.json';
import fiKunnatBoundaries from './data/fi-kunnat-boundaries.json';
import isSveitarfelogBoundaries from './data/is-sveitarfelog-boundaries.json';
import usCountiesBoundaries from './data/us-counties-boundaries.json';
import caDivisionsBoundaries from './data/ca-divisions-boundaries.json';
import worldBoundaries from './data/world-boundaries.json';

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
  usAllStates as Gazetteer,
  caProvinces as Gazetteer,
  // Global
  worldCountries as Gazetteer,
  worldAdmin1 as Gazetteer,
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

/**
 * Find a node in the tree by path key.
 * Bare key ("Denmark") — match first node by name at any depth.
 * Path key ("Germany > Bavaria") — walk down matching each ancestor from root's children.
 */
function findNodeByPath(root: GazetteerNode, pathKey: string): GazetteerNode | null {
  const parts = pathKey.split(' > ');
  if (parts.length === 1) {
    function walk(node: GazetteerNode): GazetteerNode | null {
      if (node.name === parts[0]) return node;
      if (node.children) {
        for (const child of node.children) {
          const found = walk(child);
          if (found) return found;
        }
      }
      return null;
    }
    if (root.name === parts[0]) return root;
    if (root.children) {
      for (const child of root.children) {
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  }
  let current: GazetteerNode | null = root;
  for (const part of parts) {
    if (!current.children) return null;
    const child = current.children.find(c => c.name === part);
    if (!child) {
      if (current === root && current.name === part) continue;
      return null;
    }
    current = child;
  }
  return current;
}

/**
 * Merge language gazetteer translations into target gazetteers as aliases.
 * Mutates target gazetteer nodes in place.
 */
function mergeTranslations(langGaz: Gazetteer, targets: Gazetteer[]): void {
  if (!langGaz.translations) return;
  const targetMap = new Map(targets.map(g => [g.id, g]));

  for (const [targetId, translations] of Object.entries(langGaz.translations)) {
    const target = targetMap.get(targetId);
    if (!target) continue;

    for (const [pathKey, names] of Object.entries(translations)) {
      const node = findNodeByPath(target.root, pathKey);
      if (!node) continue;

      const existing = new Set(node.aliases ?? []);
      const merged = [...(node.aliases ?? [])];
      for (const name of names) {
        if (!existing.has(name)) {
          merged.push(name);
          existing.add(name);
        }
      }
      (node as GazetteerNode).aliases = merged;
    }
  }
}

export function loadGazetteers(config: GazetteerConfig, imported: Gazetteer[] = []): Gazetteer[] {
  const enabled = new Set(config.enabledGazetteers);

  // Imported overrides bundled when ids collide
  const importedIds = new Set(imported.map(g => g.id));
  const all = [...BUNDLED_GAZETTEERS.filter(g => !importedIds.has(g.id)), ...imported];
  const filtered = all.filter(g => enabled.has(g.id));

  // Separate language gazetteers from point/boundary
  const langGazetteers = filtered.filter(g => g.kind === 'language');
  const dataGazetteers = filtered.filter(g => g.kind !== 'language');

  // Nothing to merge — return as-is
  if (langGazetteers.length === 0) return dataGazetteers;

  // Clone data gazetteers before mutating so bundled singletons stay clean
  const cloned: Gazetteer[] = dataGazetteers.map(g => JSON.parse(JSON.stringify(g)) as Gazetteer);

  // Merge translations into cloned data gazetteers
  for (const lang of langGazetteers) {
    mergeTranslations(lang, cloned);
  }

  return cloned;
}
