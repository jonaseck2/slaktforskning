import type { Gazetteer, GazetteerNode, PlaceResolveResult } from './types';

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
    matchDepth: candidate.depth,
    treeDepth: candidate.treeDepth,
    matchQuality,
    matchedNode: deepestNode,
    gazetteer: gazId,
    unmatchedComponents: candidate.unmatched,
  };
}
