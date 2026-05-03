import { describe, it, expect } from 'vitest';
import { getAllGazetteers } from '../../src/api/place-gazetteers/bundled';
import { GAZETTEER_NODE_TYPES } from '../../src/api/place-gazetteers/types';
import { buildScaffoldingIndex, attachContributions } from '../../src/api/place-gazetteers/merge';

describe('gazetteer hierarchy integrity', () => {
  const all = getAllGazetteers();
  const scaffolding = all.filter(g => g.shape === 'scaffolding');
  const contribGazetteers = all.filter(g => g.shape === 'contributions');

  it('every contribution parent path resolves into scaffolding', () => {
    const idx = buildScaffoldingIndex(JSON.parse(JSON.stringify(scaffolding)));
    const report = attachContributions(JSON.parse(JSON.stringify(contribGazetteers)), idx);
    if (report.rejected.length > 0) console.error('Rejected contributions:', report.rejected);
    expect(report.rejected).toEqual([]);
  });

  it.skip('every node type is in the closed vocabulary', () => {
    function check(node: any, gid: string): string[] {
      const errors: string[] = [];
      if (!(GAZETTEER_NODE_TYPES as readonly string[]).includes(node.type)) {
        errors.push(`${gid}: invalid type "${node.type}" on node "${node.name}"`);
      }
      if (node.children) for (const c of node.children) errors.push(...check(c, gid));
      return errors;
    }
    const errors: string[] = [];
    for (const g of all) {
      if (g.root) errors.push(...check(g.root, g.id));
      if (g.contributions) for (const contrib of g.contributions) for (const n of contrib.nodes) errors.push(...check(n, g.id));
    }
    expect(errors).toEqual([]);
  });

  it('exactly one canonical Sweden node in scaffolding', () => {
    const idx = buildScaffoldingIndex(JSON.parse(JSON.stringify(scaffolding)));
    const sweden = idx.lookup(['World', 'Europe', 'Sweden']);
    expect(sweden).not.toBeNull();
    expect(sweden!.type).toBe('country');
  });
});
