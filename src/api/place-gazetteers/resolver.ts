import type { Gazetteer, GazetteerNode, PlaceResolveResult, BoundaryResolveResult } from './types';

function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    // Swedish
    .replace(/\s*(församling|socken|kommun|stad|härad|län|distrikt|pastorat)$/i, '')
    // Danish
    .replace(/\s*(sogn|kirkedistrikt|kommune|amt|herred)$/i, '')
    // Norwegian
    .replace(/\s*(fylke|prestegjeld|sokn)$/i, '')
    // Finnish
    .replace(/\s*(kunta|kaupunki|maakunta|seurakunta)$/i, '')
    // Icelandic
    .replace(/\s*(sýsla|hreppur|sveitarfélag|sókn)$/i, '')
    // English / North American
    .replace(/\s*(county|parish|township|borough|province|state)$/i, '')
    // Common prefixes
    .replace(/^(county of|province of|state of)\s+/i, '');
}

function fuzzyEqual(a: string, b: string): boolean {
  return a === b;
}

function nodeMatches(node: GazetteerNode, component: string): boolean {
  const norm = normalize(component);
  const normNode = normalize(node.name);
  if (fuzzyEqual(normNode, norm)) return true;
  return node.aliases?.some(a => fuzzyEqual(normalize(a), norm)) ?? false;
}

const treeDepthCache = new WeakMap<GazetteerNode, number>();
function getTreeDepth(node: GazetteerNode): number {
  const cached = treeDepthCache.get(node);
  if (cached !== undefined) return cached;
  const depth = (!node.children || node.children.length === 0)
    ? 1
    : 1 + Math.max(...node.children.map(getTreeDepth));
  treeDepthCache.set(node, depth);
  return depth;
}

interface MatchCandidate {
  path: GazetteerNode[];
  matched: string[];
  unmatched: string[];
  depth: number;
  treeDepth: number;
  contradictions: number;
}

// Name index: maps normalized name → list of { node, ancestors } for O(1) lookup
type NodeEntry = { node: GazetteerNode; ancestors: GazetteerNode[] };
const nameIndexCache = new WeakMap<GazetteerNode, Map<string, NodeEntry[]>>();

function getNameIndex(root: GazetteerNode): Map<string, NodeEntry[]> {
  const cached = nameIndexCache.get(root);
  if (cached) return cached;
  const index = new Map<string, NodeEntry[]>();
  function walk(node: GazetteerNode, ancestors: GazetteerNode[]) {
    const norm = normalize(node.name);
    if (!index.has(norm)) index.set(norm, []);
    index.get(norm)!.push({ node, ancestors });
    if (node.aliases) {
      for (const alias of node.aliases) {
        const na = normalize(alias);
        if (!index.has(na)) index.set(na, []);
        index.get(na)!.push({ node, ancestors });
      }
    }
    if (node.children) {
      const nextAncestors = [...ancestors, node];
      for (const child of node.children) walk(child, nextAncestors);
    }
  }
  // Index the root node itself
  walk(root, []);

  nameIndexCache.set(root, index);
  return index;
}

function findMatches(
  components: string[],
  root: GazetteerNode,
): MatchCandidate[] {
  const index = getNameIndex(root);
  const candidates: MatchCandidate[] = [];

  // Find all nodes that match any component
  for (const component of components) {
    const norm = normalize(component);
    const entries = index.get(norm);
    if (!entries) continue;

    for (const { node, ancestors } of entries) {
      const fullPath = [...ancestors, node];
      const pathSet = new Set(fullPath);
      // Check which other components match nodes on this path
      const remaining = components.filter(c => {
        const cn = normalize(c);
        return !fullPath.some(n =>
          normalize(n.name) === cn || (n.aliases?.some(a => normalize(a) === cn) ?? false)
        );
      });

      // Count contradictions: unmatched components that match nodes
      // ELSEWHERE in the tree (i.e. the input names a place that exists
      // but in a different branch than this candidate)
      let contradictions = 0;
      for (const um of remaining) {
        const umNorm = normalize(um);
        const umEntries = index.get(umNorm);
        if (umEntries) {
          // The component matches something in this gazetteer —
          // check if ALL matches are outside this candidate's path
          const allOutside = umEntries.every(e => !pathSet.has(e.node));
          if (allOutside) contradictions++;
        }
      }

      candidates.push({
        path: fullPath,
        matched: fullPath.map(n => n.name),
        unmatched: remaining,
        depth: fullPath.length,
        treeDepth: getTreeDepth(node) + fullPath.length - 1,
        contradictions,
      });
    }
  }

  return candidates;
}

function pickBest(candidates: MatchCandidate[]): { best: MatchCandidate; ambiguous: boolean } | null {
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    // 1. Fewer contradictions first (unmatched components that exist elsewhere)
    if (a.contradictions !== b.contradictions) return a.contradictions - b.contradictions;
    // 2. Fewer unmatched components
    if (a.unmatched.length !== b.unmatched.length) return a.unmatched.length - b.unmatched.length;
    // 3. Deeper match
    return b.depth - a.depth;
  });

  const best = candidates[0];
  // Ambiguous if multiple candidates with the same quality resolve to
  // different leaf nodes (i.e. different geographical locations)
  const sameQuality = candidates.filter(
    c => c.contradictions === best.contradictions &&
         c.unmatched.length === best.unmatched.length
  );
  const distinctLocations = new Set(
    sameQuality.map(c => {
      const node = c.path[c.path.length - 1];
      return `${node.lat},${node.lon}`;
    })
  );
  return { best, ambiguous: distinctLocations.size > 1 };
}

export interface GazetteerSearchHit {
  node: GazetteerNode;
  path: GazetteerNode[];
  gazetteer: string;
}

/**
 * Search for all nodes whose name matches the query, returning every match
 * at every level (county, municipality, locality, etc.).
 */
export function searchGazetteer(
  query: string,
  gazetteers: Gazetteer[],
  limit = 10,
): GazetteerSearchHit[] {
  if (!query.trim() || gazetteers.length === 0) return [];
  const norm = normalize(query);
  if (!norm) return [];

  const hits: GazetteerSearchHit[] = [];

  function walk(node: GazetteerNode, path: GazetteerNode[], gazId: string) {
    const currentPath = [...path, node];
    if (nodeMatches(node, query)) {
      hits.push({ node, path: currentPath, gazetteer: gazId });
    }
    if (hits.length >= limit) return;
    if (node.children) {
      for (const child of node.children) {
        walk(child, currentPath, gazId);
        if (hits.length >= limit) return;
      }
    }
  }

  for (const gaz of gazetteers) {
    walk(gaz.root, [], gaz.id);
    if (hits.length >= limit) break;
  }

  return hits;
}

function isBetterCandidate(a: MatchCandidate, b: MatchCandidate): boolean {
  if (a.contradictions !== b.contradictions) return a.contradictions < b.contradictions;
  if (a.unmatched.length !== b.unmatched.length) return a.unmatched.length < b.unmatched.length;
  return a.depth > b.depth;
}

export function resolvePlace(
  placeName: string,
  gazetteers: Gazetteer[],
): PlaceResolveResult | null {
  if (!placeName.trim() || gazetteers.length === 0) return null;

  const components = placeName.split(',').map(p => p.trim()).filter(Boolean);
  if (components.length === 0) return null;

  // Build a global map of normalized name → minimum depth (ancestor count)
  // across all gazetteers.  Shallow entries (countries, depth 1–2) are strong
  // geographic anchors; deep entries (localities, depth 4+) are weak ones.
  // Used to weight contradictions: an unmatched component that matches a
  // shallow/broad node elsewhere is a stronger signal than one matching a leaf.
  const globalNameDepth = new Map<string, number>();
  for (const gaz of gazetteers) {
    for (const [name, entries] of getNameIndex(gaz.root).entries()) {
      for (const entry of entries) {
        const depth = entry.ancestors.length + 1;
        const existing = globalNameDepth.get(name);
        if (existing === undefined || depth < existing) {
          globalNameDepth.set(name, depth);
        }
      }
    }
  }

  // Collect best candidate per gazetteer, then compute contradiction weight
  // using global depth info so cross-gazetteer conflicts are detected.
  const perGaz: { candidate: MatchCandidate; ambiguous: boolean; gazId: string }[] = [];

  for (const gaz of gazetteers) {
    const candidates = findMatches(components, gaz.root);
    const picked = pickBest(candidates);
    if (!picked) continue;

    // Compute contradiction weight: sum of 1/depth for each unmatched
    // component that exists in another gazetteer.  Shallow matches (country
    // names) produce large weights; deep matches (localities) produce small
    // ones.  Stored as integer (×1000) to avoid floating-point comparison.
    let weightedContradictions = 0;
    for (const um of picked.best.unmatched) {
      const depth = globalNameDepth.get(normalize(um));
      if (depth !== undefined) {
        weightedContradictions += Math.round(1000 / depth);
      }
    }
    picked.best.contradictions = weightedContradictions;

    perGaz.push({ candidate: picked.best, ambiguous: picked.ambiguous, gazId: gaz.id });
  }

  let bestOverall: { candidate: MatchCandidate; ambiguous: boolean; gazId: string } | null = null;
  for (const entry of perGaz) {
    if (!bestOverall || isBetterCandidate(entry.candidate, bestOverall.candidate)) {
      bestOverall = entry;
    }
  }

  if (!bestOverall) return null;

  const { candidate, ambiguous, gazId } = bestOverall;
  const deepestNode = candidate.path[candidate.path.length - 1];
  const isLeaf = !deepestNode.children || deepestNode.children.length === 0;

  let matchQuality: PlaceResolveResult['matchQuality'];
  if (ambiguous) {
    matchQuality = 'ambiguous';
  } else if (candidate.unmatched.length === 0 && isLeaf) {
    matchQuality = 'exact';
  } else {
    matchQuality = 'partial';
  }

  return {
    lat: deepestNode.lat,
    lon: deepestNode.lon,
    matchedPath: candidate.matched,
    matchedNodes: candidate.path,
    matchDepth: candidate.depth,
    treeDepth: candidate.treeDepth,
    matchQuality,
    matchedNode: deepestNode,
    gazetteer: gazId,
    unmatchedComponents: candidate.unmatched,
  };
}

function distanceSq(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = lat1 - lat2;
  const dLon = lon1 - lon2;
  return dLat * dLat + dLon * dLon;
}

export interface BoundaryHint {
  lat: number;
  lon: number;
}

export function resolveBoundary(
  placeName: string,
  gazetteers: Gazetteer[],
  hint?: BoundaryHint,
): BoundaryResolveResult | null {
  if (!placeName.trim() || gazetteers.length === 0) return null;

  const boundaryGazetteers = gazetteers.filter(g => g.kind === 'boundary');
  if (boundaryGazetteers.length === 0) return null;

  const components = placeName.split(',').map(p => p.trim()).filter(Boolean);
  if (components.length === 0) return null;

  // Collect all candidates across all boundary gazetteers
  const allCandidates: MatchCandidate[] = [];

  for (const gaz of boundaryGazetteers) {
    allCandidates.push(...findMatches(components, gaz.root));
  }

  if (allCandidates.length === 0) return null;

  // Sort by match quality (fewest contradictions, then fewest unmatched, then deepest)
  allCandidates.sort((a, b) => {
    if (a.contradictions !== b.contradictions) return a.contradictions - b.contradictions;
    if (a.unmatched.length !== b.unmatched.length) return a.unmatched.length - b.unmatched.length;
    return b.depth - a.depth;
  });

  const bestUnmatched = allCandidates[0].unmatched.length;
  const topCandidates = allCandidates.filter(c => c.unmatched.length === bestUnmatched);

  // Pick the best candidate — use hint lat/lon to disambiguate if multiple match
  let chosen: MatchCandidate;
  if (topCandidates.length > 1 && hint) {
    chosen = topCandidates.reduce((best, c) => {
      const node = c.path[c.path.length - 1];
      const bestNode = best.path[best.path.length - 1];
      return distanceSq(node.lat, node.lon, hint.lat, hint.lon) <
             distanceSq(bestNode.lat, bestNode.lon, hint.lat, hint.lon)
        ? c : best;
    });
  } else {
    chosen = topCandidates[0];
  }

  const deepestNode = chosen.path[chosen.path.length - 1];
  if (!deepestNode.geometry) return null;

  const isLeaf = !deepestNode.children || deepestNode.children.length === 0;
  const ambiguous = !hint && topCandidates.length > 1 &&
    new Set(topCandidates.map(c => {
      const n = c.path[c.path.length - 1];
      return `${n.lat},${n.lon}`;
    })).size > 1;

  let matchQuality: BoundaryResolveResult['matchQuality'];
  if (ambiguous) {
    matchQuality = 'ambiguous';
  } else if (chosen.unmatched.length === 0 && isLeaf) {
    matchQuality = 'exact';
  } else {
    matchQuality = 'partial';
  }

  return {
    geometry: deepestNode.geometry,
    matchedPath: chosen.matched,
    matchQuality,
    nodeType: deepestNode.type,
  };
}
