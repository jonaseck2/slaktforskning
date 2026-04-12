export interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
}

export interface GazetteerSource {
  name: string;          // e.g. "Wikidata"
  url: string;           // e.g. "https://www.wikidata.org/wiki/Q18333556"
  license: string;       // e.g. "CC0 1.0"
  created?: string;      // ISO date when the source dataset was established
  fetched: string;       // ISO date of last fetch, e.g. "2026-04-11"
  kgmid?: string;        // Google Knowledge Graph ID, e.g. "/g/11b60xsbyy"
}

export interface Gazetteer {
  id: string;
  name: string;
  locale: string;
  description?: string;
  source?: GazetteerSource;
  root: GazetteerNode;
}

export interface PlaceResolveResult {
  lat: number;
  lon: number;
  matchedPath: string[];
  matchedNodes: GazetteerNode[];
  matchDepth: number;
  treeDepth: number;
  matchQuality: 'exact' | 'partial' | 'ambiguous';
  matchedNode: GazetteerNode;
  gazetteer: string;
  unmatchedComponents: string[];
}

export interface GazetteerConfig {
  enabledGazetteers: string[];
}
