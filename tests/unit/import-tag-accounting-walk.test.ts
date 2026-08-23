// Pure tree walk that turns "which nodes were read" into "which tag paths were not".
// See docs/plans/2026-08-23-importer-tag-accounting.md Task 2.

import { describe, it, expect } from 'vitest';
import { collectUnaccounted } from '../../src/import/gedcom/accounting-walk';
import { parseGedcom } from '../../src/gedcom/parser';
import type { GedcomNode } from '../../src/gedcom/parser';

const GED = `0 @I1@ INDI
1 NAME Olof /Skänk/
1 BIRT
2 DATE 1785
2 PLAC Sverige
3 _ADPL
4 _COUNTRY Sverige
0 @I2@ INDI
1 BIRT
2 PLAC Norge
3 _ADPL
4 _COUNTRY Norge
`;

function findByTag(nodes: GedcomNode[], tag: string, out: GedcomNode[] = []): GedcomNode[] {
  for (const n of nodes) { if (n.tag === tag) out.push(n); findByTag(n.children, tag, out); }
  return out;
}

describe('collectUnaccounted', () => {
  it('reports nothing when every node is consumed', () => {
    const tree = parseGedcom(GED);
    const all = new Set<GedcomNode>();
    const walk = (ns: GedcomNode[]) => { for (const n of ns) { all.add(n); walk(n.children); } };
    walk(tree);
    expect(collectUnaccounted(tree, all)).toEqual([]);
  });

  it('reports unconsumed nodes by full tag path, aggregated across records', () => {
    const tree = parseGedcom(GED);
    const consumed = new Set<GedcomNode>();
    const walk = (ns: GedcomNode[]) => {
      for (const n of ns) { if (!n.tag.startsWith('_')) consumed.add(n); walk(n.children); }
    };
    walk(tree);
    expect(collectUnaccounted(tree, consumed)).toEqual([
      { path: 'INDI.BIRT.PLAC._ADPL', count: 2 },
      { path: 'INDI.BIRT.PLAC._ADPL._COUNTRY', count: 2 },
    ]);
  });

  it('reports an unconsumed parent and its unconsumed children separately', () => {
    const tree = parseGedcom(GED);
    expect(findByTag(tree, '_ADPL')).toHaveLength(2);
    const paths = collectUnaccounted(tree, new Set()).map(r => r.path);
    expect(paths).toContain('INDI.BIRT.PLAC._ADPL');
    expect(paths).toContain('INDI.BIRT.PLAC._ADPL._COUNTRY');
    expect(paths).toContain('INDI.NAME');
  });

  it('sorts by count descending, then path ascending', () => {
    const result = collectUnaccounted(parseGedcom(GED), new Set());
    for (let i = 1; i < result.length; i++) {
      const [a, b] = [result[i - 1], result[i]];
      expect(a.count > b.count || (a.count === b.count && a.path <= b.path)).toBe(true);
    }
  });
});
