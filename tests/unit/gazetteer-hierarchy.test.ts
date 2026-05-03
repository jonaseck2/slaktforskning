import { describe, it, expect } from 'vitest';
import { getAllGazetteers } from '../../src/api/place-gazetteers/bundled';
import { GAZETTEER_NODE_TYPES } from '../../src/api/place-gazetteers/types';
import { loadGazetteers } from '../../src/api/place-gazetteers/merge';
import type { GazetteerNode, Gazetteer } from '../../src/api/place-gazetteers/types';

describe('gazetteer hierarchy integrity', () => {
  const all = getAllGazetteers();
  const enabledIds = all.filter(g => g.shape !== 'language' && g.root).map(g => g.id);

  it('migrated gazetteers root at World or World (Historical)', () => {
    // Until each per-country gazetteer migrates (Phase 3+), legacy roots like "Sverige" / "Norge" still exist.
    // The strict assertion lands in Phase 8.
    const migrated = all.filter(g => g.root && (g.root.name === 'World' || g.root.name === 'World (Historical)'));
    expect(migrated.length).toBeGreaterThanOrEqual(2); // world-countries + world-admin1 at minimum
  });

  it.skip('every node type is in the closed vocabulary (7 admin levels)', () => {
    // Un-skip in Phase 8 once every gazetteer has migrated to the closed vocabulary.
    function check(node: GazetteerNode, gid: string): string[] {
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
    }
    expect(errors).toEqual([]);
  });

  it('after merging migrated gazetteers, exactly one canonical Sweden under World > Europe', () => {
    // Only enable gazetteers already migrated to the World-rooted shape (Phase 2.1, 2.2).
    const migratedIds = all
      .filter(g => g.root?.name === 'World' && g.shape !== 'language')
      .map(g => g.id);
    const result = loadGazetteers({ enabledGazetteers: migratedIds }, all);
    expect(result).toHaveLength(1);
    const root = result[0].root!;
    expect(root.name).toBe('World');
    const europe = root.children?.find(c => c.name === 'Europe');
    expect(europe).toBeDefined();
    const swedens = europe!.children?.filter(c => c.name === 'Sweden') ?? [];
    expect(swedens.length).toBe(1);
    expect(swedens[0].type).toBe('country');
  });
});
