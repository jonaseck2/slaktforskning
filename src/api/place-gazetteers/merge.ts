import type { Gazetteer, GazetteerConfig, GazetteerNode } from './types';

/**
 * Find a node in the tree by path key.
 * Bare key ("Denmark") — match first node by name at any depth.
 * Path key ("Germany > Bavaria") — walk down matching each ancestor from root's children.
 */
function findNodeByPath(root: GazetteerNode, pathKey: string): GazetteerNode | null {
  const parts = pathKey.split(' > ');
  if (parts.length === 1) {
    function walk(node: GazetteerNode): GazetteerNode | null {
      if (node.name === parts[0]) return node;
      if (node.children) {
        for (const child of node.children) {
          const found = walk(child);
          if (found) return found;
        }
      }
      return null;
    }
    if (root.name === parts[0]) return root;
    if (root.children) {
      for (const child of root.children) {
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  }
  let current: GazetteerNode | null = root;
  for (const part of parts) {
    if (!current.children) return null;
    const child = current.children.find(c => c.name === part);
    if (!child) {
      if (current === root && current.name === part) continue;
      return null;
    }
    current = child;
  }
  return current;
}

/**
 * Merge language gazetteer translations into target gazetteers as aliases.
 * Mutates target gazetteer nodes in place.
 */
function mergeTranslations(langGaz: Gazetteer, targets: Gazetteer[]): void {
  if (!langGaz.translations) return;
  const targetMap = new Map(targets.map(g => [g.id, g]));

  for (const [targetId, translations] of Object.entries(langGaz.translations)) {
    const target = targetMap.get(targetId);
    if (!target) continue;

    for (const [pathKey, names] of Object.entries(translations)) {
      const node = findNodeByPath(target.root, pathKey);
      if (!node) continue;

      const existing = new Set(node.aliases ?? []);
      const merged = [...(node.aliases ?? [])];
      for (const name of names) {
        if (!existing.has(name)) {
          merged.push(name);
          existing.add(name);
        }
      }
      (node as GazetteerNode).aliases = merged;
    }
  }
}

export function loadGazetteers(
  config: GazetteerConfig,
  bundled: Gazetteer[],
  imported: Gazetteer[] = [],
): Gazetteer[] {
  const enabled = new Set(config.enabledGazetteers);

  // Imported overrides bundled when ids collide
  const importedIds = new Set(imported.map(g => g.id));
  const all = [...bundled.filter(g => !importedIds.has(g.id)), ...imported];
  const filtered = all.filter(g => enabled.has(g.id));

  // Separate language gazetteers from point/boundary
  const langGazetteers = filtered.filter(g => g.kind === 'language');
  const dataGazetteers = filtered.filter(g => g.kind !== 'language');

  // Nothing to merge — return as-is
  if (langGazetteers.length === 0) return dataGazetteers;

  // Clone data gazetteers before mutating so bundled singletons stay clean
  const cloned: Gazetteer[] = dataGazetteers.map(g => JSON.parse(JSON.stringify(g)) as Gazetteer);

  // Merge translations into cloned data gazetteers
  for (const lang of langGazetteers) {
    mergeTranslations(lang, cloned);
  }

  return cloned;
}

export interface ScaffoldingIndex {
  lookup(path: string[]): GazetteerNode | null;
  roots(): GazetteerNode[];
}

function pathKey(parts: string[]): string {
  return parts.map(p => p.toLowerCase()).join(' › ');
}

export function buildScaffoldingIndex(scaffolding: Gazetteer[]): ScaffoldingIndex {
  const index = new Map<string, GazetteerNode>();
  const rootNodes: GazetteerNode[] = [];

  function walk(node: GazetteerNode, ancestors: string[]) {
    const path = [...ancestors, node.name];
    index.set(pathKey(path), node);
    if (node.children) for (const child of node.children) walk(child, path);
  }

  for (const g of scaffolding) {
    if (!g.root) continue;
    rootNodes.push(g.root);
    walk(g.root, []);
  }

  return {
    lookup: (path) => index.get(pathKey(path)) ?? null,
    roots: () => rootNodes,
  };
}

export interface AttachReport {
  attached: number;
  rejected: Array<{ gazetteer: string; parentPath: string[]; reason: string }>;
}

interface RuntimeNode extends GazetteerNode {
  __gazetteer?: string;     // single source ID — never an array, never updated after first set
}

function stampSource(node: GazetteerNode, gazetteerId: string): RuntimeNode {
  const cloned = JSON.parse(JSON.stringify(node)) as RuntimeNode;
  cloned.__gazetteer = gazetteerId;
  if (cloned.children) {
    cloned.children = cloned.children.map(c => stampSource(c, gazetteerId));
  }
  return cloned;
}

export function attachContributions(gazetteers: Gazetteer[], idx: ScaffoldingIndex): AttachReport {
  const report: AttachReport = { attached: 0, rejected: [] };

  for (const g of gazetteers) {
    if (g.shape !== 'contributions' || !g.contributions) continue;
    for (const contrib of g.contributions) {
      const parent = idx.lookup(contrib.parentPath);
      if (!parent) {
        report.rejected.push({
          gazetteer: g.id,
          parentPath: contrib.parentPath,
          reason: 'parent path does not resolve in scaffolding',
        });
        continue;
      }
      parent.children = parent.children ?? [];
      // No merging — every contribution leaf becomes a distinct sibling under the scaffolding parent.
      // License/provenance: each leaf is stamped with its single source gazetteer ID.
      // If two source gazetteers contribute leaves with the same (name, type), both are appended.
      // De-duplication of redundant gazetteers is a curatorial decision at build time, not a load-time merge.
      for (const node of contrib.nodes) {
        parent.children.push(stampSource(node, g.id));
        report.attached++;
      }
    }
  }

  return report;
}
