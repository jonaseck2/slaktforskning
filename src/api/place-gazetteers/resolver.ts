import type { Gazetteer, GazetteerNode, PlaceResolveResult, BoundaryResolveResult } from './types';

function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*(församling|socken|kommun|stad|härad|län)$/i, '');
}

function nodeMatches(node: GazetteerNode, component: string): boolean {
  const norm = normalize(component);
  if (normalize(node.name) === norm) return true;
  return node.aliases?.some(a => normalize(a) === norm) ?? false;
}

function getTreeDepth(node: GazetteerNode): number {
  if (!node.children || node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(getTreeDepth));
}

interface MatchCandidate {
  path: GazetteerNode[];
  matched: string[];
  unmatched: string[];
  depth: number;
  treeDepth: number;
}

function findMatches(
  components: string[],
  node: GazetteerNode,
  path: GazetteerNode[],
): MatchCandidate[] {
  const currentPath = [...path, node];
  const remaining = components.filter(c => !nodeMatches(node, c));
  const matchedHere = components.length - remaining.length;

  const candidates: MatchCandidate[] = [];

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      candidates.push(...findMatches(remaining, child, currentPath));
    }
  }

  if (matchedHere > 0) {
    candidates.push({
      path: currentPath,
      matched: currentPath.map(n => n.name),
      unmatched: remaining,
      depth: currentPath.length,
      treeDepth: getTreeDepth(node) + currentPath.length - 1,
    });
  }

  return candidates;
}

function pickBest(candidates: MatchCandidate[]): { best: MatchCandidate; ambiguous: boolean } | null {
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.unmatched.length !== b.unmatched.length) return a.unmatched.length - b.unmatched.length;
    return b.depth - a.depth;
  });

  const best = candidates[0];
  // Ambiguous if multiple candidates with the same unmatched count resolve to
  // different leaf nodes (i.e. different geographical locations)
  const sameQuality = candidates.filter(
    c => c.unmatched.length === best.unmatched.length
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

export function resolvePlace(
  placeName: string,
  gazetteers: Gazetteer[],
): PlaceResolveResult | null {
  if (!placeName.trim() || gazetteers.length === 0) return null;

  const components = placeName.split(',').map(p => p.trim()).filter(Boolean);
  if (components.length === 0) return null;

  let bestOverall: { candidate: MatchCandidate; ambiguous: boolean; gazId: string } | null = null;

  for (const gaz of gazetteers) {
    const candidates = findMatches(components, gaz.root, []);
    const picked = pickBest(candidates);
    if (!picked) continue;

    if (
      !bestOverall ||
      picked.best.unmatched.length < bestOverall.candidate.unmatched.length ||
      (picked.best.unmatched.length === bestOverall.candidate.unmatched.length &&
        picked.best.depth > bestOverall.candidate.depth)
    ) {
      bestOverall = { candidate: picked.best, ambiguous: picked.ambiguous, gazId: gaz.id };
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
    allCandidates.push(...findMatches(components, gaz.root, []));
  }

  if (allCandidates.length === 0) return null;

  // Sort by match quality (fewest unmatched, then deepest)
  allCandidates.sort((a, b) => {
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
