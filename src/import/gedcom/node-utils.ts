/**
 * GEDCOM node traversal helpers.
 */

import type { GedcomNode } from '../../gedcom/parser';
import { markConsumed } from './tag-accounting';

// Both accessors mark what they return. `CLAUDE.md` Prime Directive (cont.)
// clause 1 — marking on read is what makes accounting impossible to forget:
// not reading a node is precisely what makes it unaccounted for. `markConsumed`
// is a no-op outside an accounting session, so these stay usable everywhere.

export function getChild(node: GedcomNode, tag: string): GedcomNode | undefined {
  const found = node.children.find(c => c.tag === tag);
  if (found) markConsumed(found);
  return found;
}

export function getChildren(node: GedcomNode, tag: string): GedcomNode[] {
  const found = node.children.filter(c => c.tag === tag);
  for (const child of found) markConsumed(child);
  return found;
}

/**
 * Resolve a NOTE reference (either inline text or @xref@ pointer into noteMap).
 */
export function resolveNote(node: GedcomNode, noteMap: Map<string, string>): string {
  const noteNode = getChild(node, 'NOTE');
  if (!noteNode) return '';
  const val = noteNode.value ?? '';
  if (val.startsWith('@') && val.endsWith('@')) {
    return noteMap.get(val) ?? '';
  }
  return val;
}
