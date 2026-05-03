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

  it('every node type is in the closed vocabulary (admin levels)', () => {
    // Closed vocab: 'world' | 'continent' | 'country' | `admin${number}`.
    // Phase 8 un-skip — all migrated gazetteers use these types only.
    const ADMIN_LEVEL_RE = /^admin([1-9]\d*)$/;
    function isValidType(t: string): boolean {
      if ((GAZETTEER_NODE_TYPES as readonly string[]).includes(t)) return true;
      return ADMIN_LEVEL_RE.test(t);
    }
    function check(node: GazetteerNode, gid: string): string[] {
      const errors: string[] = [];
      if (!isValidType(node.type)) {
        errors.push(`${gid}: invalid type "${node.type}" on node "${node.name}"`);
      }
      if (node.children) for (const c of node.children) errors.push(...check(c, gid));
      return errors;
    }
    const errors: string[] = [];
    for (const g of all) {
      // Language gazetteers carry translation data, not geographic data.
      // Their pseudo-root (type 'language') is exempt from the admin vocab.
      if (g.shape === 'language' || g.kind === 'language') continue;
      if (g.root) errors.push(...check(g.root, g.id));
    }
    if (errors.length > 0) console.error(errors.slice(0, 20).join('\n'));
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
