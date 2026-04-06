import type { GedcomNode } from '../../gedcom/parser';

export type GedcomVersion = '5.5.1' | '5.5.5' | '7.0' | 'unknown';

export function detectGedcomVersion(nodes: GedcomNode[]): GedcomVersion {
  const head = nodes.find(n => n.tag === 'HEAD');
  if (!head) return 'unknown';
  const gedc = head.children.find(n => n.tag === 'GEDC');
  if (!gedc) return 'unknown';
  const vers = gedc.children.find(n => n.tag === 'VERS');
  if (!vers) return 'unknown';
  const v = vers.value.trim();
  if (v === '7.0') return '7.0';
  if (v === '5.5.5') return '5.5.5';
  if (v === '5.5.1' || v === '5.5') return '5.5.1';
  return 'unknown';
}
