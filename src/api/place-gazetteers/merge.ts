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

// Off by default — divergences are upstream script bugs to fix one-off, not
// runtime concerns. With multiple sources merging the same World tree, a
// single mismatched coordinate fires the warning hundreds of times per
// gazetteer load and floods the terminal buffer. Re-enable with
// SLAKTFORSKNING_GAZETTEER_DEBUG=1 when actually triaging a divergence.
const COORD_WARN_ENABLED =
  typeof process !== 'undefined' && process.env?.SLAKTFORSKNING_GAZETTEER_DEBUG === '1';

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
  if (COORD_WARN_ENABLED
      && (Math.abs(target.lat - incoming.lat) > COORD_DIVERGENCE_WARN_THRESHOLD
          || Math.abs(target.lon - incoming.lon) > COORD_DIVERGENCE_WARN_THRESHOLD)) {
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

/**
 * Attach `extras` as aliases on `node` (de-duped, preserves existing).
 */
function attachAliases(node: GazetteerNode, extras: string[]): void {
  if (extras.length === 0) return;
  const set = new Set(node.aliases ?? []);
  for (const e of extras) set.add(e);
  node.aliases = Array.from(set);
}

/**
 * Search the subtree rooted at `root` (excluding `root` itself) for nodes
 * whose `name` or `aliases` match `needle` (case-insensitive). Returns
 * every match found. Scoped to this subtree so the search cannot escape
 * into an unrelated branch (e.g. Köpenhamn must not attach to Copenhagen,
 * NY because that lives under a different prefix).
 */
function findDescendantsByNameOrAlias(root: GazetteerNode, needle: string): GazetteerNode[] {
  const needleLc = needle.toLowerCase();
  const matches: GazetteerNode[] = [];
  // BFS the subtree, skipping the root itself.
  const queue: GazetteerNode[] = [];
  if (root.children) queue.push(...root.children);
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.name.toLowerCase() === needleLc) {
      matches.push(node);
    } else if (node.aliases) {
      for (const a of node.aliases) {
        if (a.toLowerCase() === needleLc) {
          matches.push(node);
          break;
        }
      }
    }
    if (node.children) for (const c of node.children) queue.push(c);
  }
  return matches;
}

function applyTranslations(lang: Gazetteer, idx: NodeIndex): void {
  if (!lang.translations) return;
  for (const [_targetId, translations] of Object.entries(lang.translations)) {
    for (const [pathStr, names] of Object.entries(translations)) {
      const parts = pathStr.split(' › ');

      // 1. Happy path: full-path exact lookup. Preserve existing behavior —
      //    attach only `names`, do NOT add the path's last segment.
      const exact = idx.lookup(parts);
      if (exact) {
        attachAliases(exact, names);
        continue;
      }

      // 2. Fallback: the overlay's full path doesn't resolve in the merged
      //    tree because the data gazetteer that actually carries the leaf
      //    uses a structurally-different parent (e.g. lang-sv-geonames keys
      //    on "Denmark > Capital Region > Copenhagen" — from world-admin1's
      //    English vocabulary — but dk-sogne-dawa places the city under
      //    "Region Hovedstaden > København"). To salvage these dormant
      //    overlays without touching the data, we look for the closest
      //    available anchor inside the SAME subtree the overlay points at.
      //
      //    Algorithm:
      //      a. Peel path segments from the right until idx.lookup(prefix)
      //         resolves. That single prefix is the "deepest existing
      //         prefix" — we never search beyond it.
      //      b. Search the prefix's descendant subtree for a node whose
      //         name or alias matches the overlay path's last segment (the
      //         English-canonical form). Scoped strictly to this subtree —
      //         never escape into a different branch (this is the
      //         knock-on-risk guard from the T03 investigation: Köpenhamn
      //         must not attach to Copenhagen, NY, because NY lives under
      //         a different prefix).
      //      c. Exactly one match → attach BOTH `names` AND the path's
      //         last segment as aliases on that descendant. Both
      //         "Köpenhamn" (Swedish translation value) and "Copenhagen"
      //         (English-canonical last segment) become resolvable.
      //      d. Two or more matches → ambiguous within the subtree; skip
      //         silently. Honest ambiguity beats a wrong attachment.
      //      e. Zero matches AND the prefix is at admin1 level or deeper
      //         (path length ≥ 4 = [World, Continent, Country, Admin1+])
      //         → attach the aliases to the prefix itself, as the closest
      //         available anchor for the overlay's intent. The depth guard
      //         prevents attaching to country/continent/world roots, which
      //         would resolve to country-centroid coordinates and defeat
      //         the famous-city user goal.
      //
      //    Single-prefix-only (no recursive peeling on 0-match): keeps the
      //    cost at O(N_entries) instead of O(N_entries × continent_subtree)
      //    — important because lang-sv-geonames has ~1500 entries and a
      //    naive multi-level BFS made every gazetteer load exceed the
      //    Vitest 60s timeout.
      if (parts.length < 2) continue;
      const needle = parts[parts.length - 1];

      // Find the deepest prefix of the overlay path that exists in the
      // merged tree. We only search descendants of this single prefix —
      // never escape into unrelated subtrees, and never BFS multiple levels
      // (which would be O(N_entries × continent_subtree_size) on every
      // gazetteer load).
      let deepestExistingPrefix: GazetteerNode | null = null;
      let deepestExistingPrefixLen = 0;
      for (let i = parts.length - 1; i >= 1; i--) {
        const prefixNode = idx.lookup(parts.slice(0, i));
        if (prefixNode) {
          deepestExistingPrefix = prefixNode;
          deepestExistingPrefixLen = i;
          break;
        }
      }
      if (!deepestExistingPrefix) continue;

      const matches = findDescendantsByNameOrAlias(deepestExistingPrefix, needle);
      if (matches.length === 1) {
        // Exactly one descendant matches the path's last segment — attach
        // both the translation values AND the path's last segment.
        attachAliases(matches[0], [...names, needle]);
        continue;
      }
      if (matches.length >= 2) {
        // Ambiguous within the subtree — skip silently. Honest ambiguity is
        // better than a wrong attachment.
        continue;
      }

      // Zero descendant matches. As a last resort, attach the aliases to
      // the deepest existing prefix itself — but ONLY if that prefix is at
      // admin1 level or deeper (length ≥ 4 = [World, Continent, Country,
      // Admin1+]). Otherwise the attachment would land on a country root or
      // higher and we'd resolve to country-centroid coordinates, defeating
      // the user goal of "famous-city pins land at the city".
      if (deepestExistingPrefixLen >= 4) {
        attachAliases(deepestExistingPrefix, [...names, needle]);
      }
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

  // Language gazetteers (translations only — no point/boundary data) are split out
  // so they don't get walked as if they were a regular tree. We accept both the
  // legacy `kind: 'language'` and the newer `shape: 'language'` discriminators.
  const isLanguage = (g: Gazetteer): boolean =>
    g.shape === 'language' || g.kind === 'language';

  // One accumulator per distinct root (typically just `World`, plus `World (Historical)`).
  const accumulators = new Map<string, MergedNode>();
  const dataGazetteers = filtered.filter(g => !isLanguage(g) && g.root);

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
  const langGazetteers = filtered.filter(isLanguage);
  if (langGazetteers.length > 0) {
    const idx = buildNodeIndex(Array.from(accumulators.values()));
    for (const lang of langGazetteers) applyTranslations(lang, idx);
  }

  // Return one synthetic gazetteer per accumulator root.
  const roots = Array.from(accumulators.values());
  if (roots.length === 0) return [];

  // Carry the union of every contributing source's normalize vocabulary onto the
  // merged gazetteer. Without this the merged tree strips no suffixes/prefixes, so
  // Swedish strings like "Stockholms kn" / "Bergs kn" never reduce to "Stockholm" /
  // "Berg" and a stray ISO code ("KN"→Saint Kitts, "MO"→Macao) becomes the only
  // match. The resolver applies these per-gazetteer at index + compare time
  // (normalizeForGazetteer); the per-source rules were lost when the merge emitted
  // the synthetic gazetteer without a `normalize` field.
  const mergedNormalize = (() => {
    const suf = new Set<string>(), pre = new Set<string>(), pat = new Set<string>();
    for (const g of dataGazetteers) {
      const n = g.normalize;
      if (!n) continue;
      n.stripSuffixes?.forEach(s => suf.add(s));
      n.stripPrefixes?.forEach(s => pre.add(s));
      n.stripPatterns?.forEach(s => pat.add(s));
    }
    if (suf.size === 0 && pre.size === 0 && pat.size === 0) return undefined;
    return {
      ...(suf.size ? { stripSuffixes: [...suf] } : {}),
      ...(pre.size ? { stripPrefixes: [...pre] } : {}),
      ...(pat.size ? { stripPatterns: [...pat] } : {}),
    };
  })();

  // Single root case: one merged gazetteer. Multi-root case: expose all via `allRoots`.
  const primary = roots[0];
  const result: Gazetteer = {
    id: '__merged__',
    name: 'Merged hierarchy',
    locale: 'mul',
    root: primary,
    ...(mergedNormalize ? { normalize: mergedNormalize } : {}),
  };
  if (roots.length > 1) {
    (result as Gazetteer & { allRoots?: GazetteerNode[] }).allRoots = roots;
  }
  return [result];
}
