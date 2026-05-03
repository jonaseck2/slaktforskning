import type { Gazetteer, GazetteerConfig, GazetteerNode } from './types';

export function loadGazetteers(
  config: GazetteerConfig,
  bundled: Gazetteer[],
  imported: Gazetteer[] = [],
): Gazetteer[] {
  const enabled = new Set(config.enabledGazetteers);
  const importedIds = new Set(imported.map(g => g.id));
  const all = [...bundled.filter(g => !importedIds.has(g.id)), ...imported];

  // Scaffolding is ALWAYS enabled — canonical reference set, not a toggle.
  const filtered = all.filter(g => g.shape === 'scaffolding' || enabled.has(g.id));

  const scaffolding = filtered
    .filter(g => g.shape === 'scaffolding')
    .map(g => JSON.parse(JSON.stringify(g)) as Gazetteer);

  const idx = buildScaffoldingIndex(scaffolding);

  const contributions = filtered.filter(g => g.shape === 'contributions');
  const report = attachContributions(contributions, idx);
  if (report.rejected.length > 0) {
    console.warn('[gazetteers] rejected contributions:', report.rejected);
  }

  // Translations apply only to scaffolding nodes (admin division naming).
  // They never touch leaves — leaf aliases stay exactly as the source authored them.
  const langGazetteers = filtered.filter(g => g.shape === 'language');
  for (const lang of langGazetteers) mergeTranslations(lang, idx);

  // Synthesize a single merged-tree gazetteer. Multi-root case (World + World (Historical))
  // ships in Phase 6 — for Phases 1–5 there is exactly one scaffolding root.
  return [{
    id: '__merged__',
    name: 'Merged hierarchy',
    locale: 'mul',
    shape: 'scaffolding',
    root: scaffolding[0]?.root ?? { name: 'World', type: 'world', lat: 0, lon: 0 },
  }];
}

function mergeTranslations(lang: Gazetteer, idx: ScaffoldingIndex): void {
  if (!lang.translations) return;
  for (const [_targetId, translations] of Object.entries(lang.translations)) {
    for (const [pathStr, names] of Object.entries(translations)) {
      const node = idx.lookup(pathStr.split(' › '));
      if (!node) continue;
      const existing = new Set(node.aliases ?? []);
      for (const n of names) existing.add(n);
      node.aliases = Array.from(existing);
    }
  }
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
