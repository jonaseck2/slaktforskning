// Shared utility functions for chart layout algorithms.

import type { DescendantNode } from './types';

/** Extracts the 4-digit year from an ISO date string. Used for timeline positioning. */
export function yearFromDate(d: string | null): number | null {
  if (!d) return null;
  const m = d.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * Returns the actual maximum depth of a descendant tree (0 = focal only).
 * Used after loadChildrenForNode to update HourglassTree.descendantGenerations.
 */
export function maxDescendantDepth(node: DescendantNode, depth = 0): number {
  if (node.children.length === 0) return depth;
  return Math.max(...node.children.map(c => maxDescendantDepth(c, depth + 1)));
}
