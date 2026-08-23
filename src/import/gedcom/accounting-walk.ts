/**
 * Walks a parsed GEDCOM tree and reports every node not present in the consumed
 * set, aggregated by full tag path.
 *
 * Pure: takes the consumed set as an argument rather than reading the accounting
 * session, so it is testable without running an import and reusable by the
 * samples script.
 *
 * A path is the tag chain from the level-0 record down, joined with '.', e.g.
 * `INDI.BIRT.PLAC._ADPL._PARISH`. Xrefs are not part of the path — the point is
 * to name the shape of what was dropped, not each occurrence.
 */
import type { GedcomNode } from '../../gedcom/parser';

export interface UnaccountedTag {
  path: string;
  count: number;
}

export function collectUnaccounted(
  tree: GedcomNode[],
  consumed: Set<GedcomNode>,
): UnaccountedTag[] {
  const counts = new Map<string, number>();

  const walk = (nodes: GedcomNode[], prefix: string): void => {
    for (const node of nodes) {
      const path = prefix === '' ? node.tag : `${prefix}.${node.tag}`;
      if (!consumed.has(node)) {
        counts.set(path, (counts.get(path) ?? 0) + 1);
      }
      if (node.children.length > 0) walk(node.children, path);
    }
  };
  walk(tree, '');

  return Array.from(counts, ([path, count]) => ({ path, count }))
    .sort((a, b) => (b.count - a.count) || a.path.localeCompare(b.path));
}
