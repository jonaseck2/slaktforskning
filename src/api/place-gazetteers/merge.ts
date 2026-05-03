import type { Gazetteer, GazetteerConfig, GazetteerNode } from './types';

/**
 * Structural-merge engine.
 *
 * Every gazetteer emits a tree rooted at `World` (or `World (Historical)`).
 * The loader walks every enabled gazetteer's tree and merges into one accumulator
 * per root, using `(name, type)` as the merge key at each level.
 *
 * Merge rules:
 * - Same `(name, type)` from any number of source gazetteers → one merged node.
 * - `aliases`: union, dedup.
 * - `lat`/`lon`: first-wins (warn on >0.01° divergence — script bug to fix upstream).
 * - `geometry`: first-wins.
 * - `children`: recursively merge by the same rule.
 * - `__contributors`: array of contributing gazetteer IDs (runtime metadata for the picker).
 *
 * Translations (language gazetteers, `shape: 'language'`) overlay aliases onto existing
 * merged nodes by canonical path key.
 */

interface MergedNode extends GazetteerNode {
  __contributors?: string[];
}

const COORD_DIVERGENCE_WARN_THRESHOLD = 0.01;

function unionAliases(target: MergedNode, incoming: GazetteerNode): void {
  if (!incoming.aliases || incoming.aliases.length === 0) return;
  const set = new Set(target.aliases ?? []);
  for (const a of incoming.aliases) set.add(a);
  target.aliases = Array.from(set);
}

function addContributor(target: MergedNode, gazetteerId: string): void {
  target.__contributors = target.__contributors ?? [];
  if (!target.__contributors.includes(gazetteerId)) target.__contributors.push(gazetteerId);
}

function mergeChild(target: MergedNode, incoming: GazetteerNode, gazetteerId: string, path: string[]): void {
  // First-wins on lat/lon and geometry; warn if scalars diverge meaningfully.
  if (Math.abs(target.lat - incoming.lat) > COORD_DIVERGENCE_WARN_THRESHOLD
      || Math.abs(target.lon - incoming.lon) > COORD_DIVERGENCE_WARN_THRESHOLD) {
    console.warn(`[gazetteers] coord divergence at ${path.join(' › ')}: existing (${target.lat}, ${target.lon}) vs incoming (${incoming.lat}, ${incoming.lon}) from ${gazetteerId}`);
  }
  if (!target.geometry && incoming.geometry) target.geometry = incoming.geometry;
  unionAliases(target, incoming);
  addContributor(target, gazetteerId);

  if (!incoming.children || incoming.children.length === 0) return;
  target.children = target.children ?? [];
  for (const incChild of incoming.children) {
    const childPath = [...path, incChild.name];
    const existing = target.children.find(c => c.name === incChild.name && c.type === incChild.type);
    if (existing) {
      mergeChild(existing as MergedNode, incChild, gazetteerId, childPath);
    } else {
      const cloned = JSON.parse(JSON.stringify(incChild)) as MergedNode;
      // Stamp this gazetteer + descendants as contributors.
      stampContributorRecursive(cloned, gazetteerId);
      target.children.push(cloned);
    }
  }
}

function stampContributorRecursive(node: MergedNode, gazetteerId: string): void {
  addContributor(node, gazetteerId);
  if (node.children) for (const c of node.children) stampContributorRecursive(c as MergedNode, gazetteerId);
}

/** Merge one gazetteer's tree into the accumulator. The accumulator's root must match by name+type. */
export function mergeTree(accumulator: MergedNode, source: GazetteerNode, gazetteerId: string): void {
  if (accumulator.name !== source.name || accumulator.type !== source.type) {
    throw new Error(`mergeTree root mismatch: accumulator ${accumulator.name}/${accumulator.type} vs source ${source.name}/${source.type}`);
  }
  mergeChild(accumulator, source, gazetteerId, [source.name]);
}

/** Build a path-keyed index of every node in the merged tree. Used by translations. */
export interface NodeIndex {
  lookup(path: string[]): GazetteerNode | null;
}

function pathKey(parts: string[]): string {
  return parts.map(p => p.toLowerCase()).join(' › ');
}

export function buildNodeIndex(roots: GazetteerNode[]): NodeIndex {
  const index = new Map<string, GazetteerNode>();
  function walk(node: GazetteerNode, ancestors: string[]): void {
    const path = [...ancestors, node.name];
    index.set(pathKey(path), node);
    if (node.children) for (const child of node.children) walk(child, path);
  }
  for (const root of roots) walk(root, []);
  return { lookup: (path) => index.get(pathKey(path)) ?? null };
}

function applyTranslations(lang: Gazetteer, idx: NodeIndex): void {
  if (!lang.translations) return;
  for (const [_targetId, translations] of Object.entries(lang.translations)) {
    for (const [pathStr, names] of Object.entries(translations)) {
      const node = idx.lookup(pathStr.split(' › '));
      if (!node) continue;
      const set = new Set(node.aliases ?? []);
      for (const n of names) set.add(n);
      node.aliases = Array.from(set);
    }
  }
}

export function loadGazetteers(
  config: GazetteerConfig,
  bundled: Gazetteer[],
  imported: Gazetteer[] = [],
): Gazetteer[] {
  const enabled = new Set(config.enabledGazetteers);
  const importedIds = new Set(imported.map(g => g.id));
  const all = [...bundled.filter(g => !importedIds.has(g.id)), ...imported];
  const filtered = all.filter(g => enabled.has(g.id));

  // One accumulator per distinct root (typically just `World`, plus `World (Historical)`).
  const accumulators = new Map<string, MergedNode>();
  const dataGazetteers = filtered.filter(g => g.shape !== 'language' && g.root);

  for (const g of dataGazetteers) {
    const root = g.root!;
    const key = `${root.name}/${root.type}`;
    let acc = accumulators.get(key);
    if (!acc) {
      acc = {
        name: root.name,
        type: root.type,
        lat: root.lat,
        lon: root.lon,
        children: [],
        __contributors: [],
      };
      accumulators.set(key, acc);
    }
    mergeTree(acc, root, g.id);
  }

  // Translations apply to the merged tree.
  const langGazetteers = filtered.filter(g => g.shape === 'language');
  if (langGazetteers.length > 0) {
    const idx = buildNodeIndex(Array.from(accumulators.values()));
    for (const lang of langGazetteers) applyTranslations(lang, idx);
  }

  // Return one synthetic gazetteer per accumulator root.
  const roots = Array.from(accumulators.values());
  if (roots.length === 0) {
    return [{
      id: '__merged__',
      name: 'Merged hierarchy',
      locale: 'mul',
      root: { name: 'World', type: 'world', lat: 0, lon: 0 },
    } as Gazetteer];
  }

  // Single root case: one merged gazetteer. Multi-root case: expose all via `allRoots`.
  const primary = roots[0];
  const result: Gazetteer = {
    id: '__merged__',
    name: 'Merged hierarchy',
    locale: 'mul',
    root: primary,
  };
  if (roots.length > 1) {
    (result as Gazetteer & { allRoots?: GazetteerNode[] }).allRoots = roots;
  }
  return [result];
}
