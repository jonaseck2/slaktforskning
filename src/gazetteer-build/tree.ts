import type { GazetteerNode } from '../api/place-gazetteers/types';

/** Count all nodes recursively in a gazetteer tree. */
export function countNodes(node: GazetteerNode): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

/** Walk every node in the tree, calling fn(node, depth) at each. */
export function walkTree(
  node: GazetteerNode,
  fn: (node: GazetteerNode, depth: number) => void,
  depth = 0,
): void {
  fn(node, depth);
  if (node.children) {
    for (const child of node.children) {
      walkTree(child, fn, depth + 1);
    }
  }
}

/** Count nodes grouped by type. Returns e.g. { country: 1, county: 21, parish: 2400 }. */
export function countByType(node: GazetteerNode): Record<string, number> {
  const counts: Record<string, number> = {};
  walkTree(node, (n) => {
    counts[n.type] = (counts[n.type] || 0) + 1;
  });
  return counts;
}
