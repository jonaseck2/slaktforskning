/**
 * GEDCOM node traversal helpers.
 */

import type { GedcomNode } from '../../gedcom/parser';

export function getChild(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find(c => c.tag === tag);
}

export function getChildren(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter(c => c.tag === tag);
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
