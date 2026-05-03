export const GAZETTEER_NODE_TYPES = [
  'world', 'continent', 'country', 'admin1', 'admin2', 'admin3', 'admin4',
  'locality', 'parish', 'farm', 'church', 'city', 'landskap',
  'historical-state', 'other',
] as const;

export type GazetteerNodeType = typeof GAZETTEER_NODE_TYPES[number];

export function isGazetteerNodeType(s: string): s is GazetteerNodeType {
  return (GAZETTEER_NODE_TYPES as readonly string[]).includes(s);
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export type GazetteerGeometry = GeoJSONPolygon | GeoJSONMultiPolygon;

export interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
  geometry?: GazetteerGeometry;
  startYear?: number;
  endYear?: number;
}

export interface GazetteerSource {
  name: string;          // e.g. "Wikidata"
  url: string;           // e.g. "https://www.wikidata.org/wiki/Q18333556"
  license: string;       // e.g. "CC0 1.0"
  created?: string;      // ISO date when the source dataset was established
  fetched: string;       // ISO date of last fetch, e.g. "2026-04-11"
  kgmid?: string;        // Google Knowledge Graph ID, e.g. "/g/11b60xsbyy"
}

/**
 * Per-gazetteer normalization rules. Applied during place-name matching after
 * universal normalization (lowercase, trim, strip parens, hyphen↔space).
 *
 * Each gazetteer carries the vocabulary that's specific to its locale, so the
 * resolver itself stays language-agnostic. Bundled gazetteers attach these at
 * load time (see bundled.ts); imported third-party gazetteers ship the field
 * on the JSON.
 */
export interface GazetteerNormalizeRules {
  /** Suffix tokens to strip when they appear at the end of a name (e.g. 'kommun', 'sogn', 'county'). */
  stripSuffixes?: string[];
  /** Regex source strings to apply after suffix strip. */
  stripPatterns?: string[];
  /** Prefix phrases to strip from the start (e.g. 'county of', 'province of'). */
  stripPrefixes?: string[];
}

export interface Contribution {
  parentPath: string[];      // canonical names from scaffolding, e.g. ['World','Europe','Sweden']
  nodes: GazetteerNode[];    // children to attach under the resolved parent
}

export interface Gazetteer {
  id: string;
  name: string;
  locale: string;
  description?: string;
  source?: GazetteerSource;
  /** Discriminator. New gazetteers set this; legacy gazetteers without it are treated as 'scaffolding' if `root` is set, else error. */
  shape?: 'scaffolding' | 'contributions' | 'language';
  /** Set when shape === 'scaffolding' OR for legacy self-rooted gazetteers (Phase 0–7). */
  root?: GazetteerNode;
  /** Set when shape === 'contributions'. */
  contributions?: Contribution[];
  kind?: 'point' | 'boundary' | 'language';
  translations?: Record<string, Record<string, string[]>>;
  normalize?: GazetteerNormalizeRules;
}

export interface PlaceResolveResult {
  lat: number;
  lon: number;
  matchedPath: string[];
  matchedNodes: GazetteerNode[];
  matchDepth: number;
  matchQuality: 'exact' | 'partial' | 'ambiguous';
  matchedNode: GazetteerNode;
  gazetteer: string;
  unmatchedComponents: string[];
}

export interface BoundaryResolveResult {
  geometry: GazetteerGeometry;
  matchedPath: string[];
  matchQuality: 'exact' | 'partial' | 'ambiguous';
  nodeType: string;
}

export interface GazetteerConfig {
  enabledGazetteers: string[];
}

export interface GazetteerInfo {
  id: string;
  name: string;
  locale: string;
  description?: string;
  source?: GazetteerSource;
  bundled: boolean;
  kind?: 'point' | 'boundary' | 'language';
  rootName?: string;
}
