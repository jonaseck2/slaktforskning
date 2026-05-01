import { ref, computed } from 'vue';

export type PlaceTreeNodeSource = 'db' | 'gazetteer' | 'merged';

export interface PlaceTreeNode {
  key: string;
  name: string;
  type: string | null;
  source: PlaceTreeNodeSource;
  dbId: string | null;
  gazId: string | null;
  /** Ancestor names from root to self inclusive (for `findOrCreatePlaceWithChain`). */
  gazPath: string[] | null;
  parent: PlaceTreeNode | null;
  hasChildren: boolean;
  childrenLoaded: boolean;
  expanded: boolean;
  children: PlaceTreeNode[];
}

interface GazetteerNodeLike {
  name: string;
  type: string;
  children?: GazetteerNodeLike[];
}

interface GazetteerLike {
  id: string;
  root: GazetteerNodeLike;
}

interface DbChildRow {
  id: string;
  name: string;
  parent_place_id: string | null;
  place_type: string | null;
  hasChildren: boolean | number;
}

interface UsePlaceTreeOptions {
  /** Getter for enabled gazetteers. Read each time roots/children build,
   *  so callers can construct the tree before `ensureLoaded()` resolves. */
  getGazetteers: () => GazetteerLike[];
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function gazKeyFor(gazId: string, path: string[]): string {
  return `gaz:${gazId}:${path.join('>')}`;
}

function dbKeyFor(id: string): string {
  return `db:${id}`;
}

function findGazNode(gaz: GazetteerLike, path: string[]): GazetteerNodeLike | null {
  if (path.length === 0) return null;
  if (normalize(path[0]) !== normalize(gaz.root.name)) return null;
  let cur: GazetteerNodeLike | undefined = gaz.root;
  for (let i = 1; i < path.length && cur; i++) {
    cur = cur.children?.find(c => normalize(c.name) === normalize(path[i]));
  }
  return cur ?? null;
}

export function usePlaceTree(opts: UsePlaceTreeOptions) {
  const roots = ref<PlaceTreeNode[]>([]);
  const filter = ref<string>('');

  async function loadRoots(): Promise<void> {
    const dbRoots = (await window.api?.places.listChildren(null)) as DbChildRow[] | undefined ?? [];
    const merged = new Map<string, PlaceTreeNode>();

    for (const row of dbRoots) {
      const key = dbKeyFor(row.id);
      merged.set(normalize(row.name), {
        key,
        name: row.name,
        type: row.place_type,
        source: 'db',
        dbId: row.id,
        gazId: null,
        gazPath: null,
        parent: null,
        hasChildren: !!row.hasChildren,
        childrenLoaded: false,
        expanded: false,
        children: [],
      });
    }

    for (const gaz of opts.getGazetteers()) {
      const norm = normalize(gaz.root.name);
      const existing = merged.get(norm);
      if (existing) {
        existing.source = 'merged';
        existing.gazId = gaz.id;
        existing.gazPath = [gaz.root.name];
        if ((gaz.root.children?.length ?? 0) > 0) existing.hasChildren = true;
      } else {
        merged.set(norm, {
          key: gazKeyFor(gaz.id, [gaz.root.name]),
          name: gaz.root.name,
          type: gaz.root.type,
          source: 'gazetteer',
          dbId: null,
          gazId: gaz.id,
          gazPath: [gaz.root.name],
          parent: null,
          hasChildren: (gaz.root.children?.length ?? 0) > 0,
          childrenLoaded: false,
          expanded: false,
          children: [],
        });
      }
    }

    roots.value = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  // In-flight expandNode promises, keyed by node.key. Coalesces concurrent
  // expand calls (e.g. user clicks a chevron while a filter walk is mid-load)
  // so the same children aren't fetched and merged twice.
  const expandInflight = new Map<string, Promise<void>>();

  async function expandNode(node: PlaceTreeNode): Promise<void> {
    if (node.childrenLoaded) {
      node.expanded = true;
      return;
    }
    const existing = expandInflight.get(node.key);
    if (existing) return existing;
    const promise = expandNodeInner(node).finally(() => expandInflight.delete(node.key));
    expandInflight.set(node.key, promise);
    return promise;
  }

  async function expandNodeInner(node: PlaceTreeNode): Promise<void> {
    const merged = new Map<string, PlaceTreeNode>();

    if (node.dbId) {
      const dbChildren = (await window.api?.places.listChildren(node.dbId)) as DbChildRow[] | undefined ?? [];
      for (const row of dbChildren) {
        merged.set(normalize(row.name), {
          key: dbKeyFor(row.id),
          name: row.name,
          type: row.place_type,
          source: 'db',
          dbId: row.id,
          gazId: null,
          gazPath: null,
          parent: node,
          hasChildren: !!row.hasChildren,
          childrenLoaded: false,
          expanded: false,
          children: [],
        });
      }
    }

    if (node.gazId && node.gazPath) {
      const gaz = opts.getGazetteers().find(g => g.id === node.gazId);
      const gazNode = gaz ? findGazNode(gaz, node.gazPath) : null;
      const gazChildren = gazNode?.children ?? [];
      for (const child of gazChildren) {
        const norm = normalize(child.name);
        const childPath = [...node.gazPath, child.name];
        const existing = merged.get(norm);
        if (existing) {
          existing.source = 'merged';
          existing.gazId = node.gazId;
          existing.gazPath = childPath;
          if ((child.children?.length ?? 0) > 0) existing.hasChildren = true;
        } else {
          merged.set(norm, {
            key: gazKeyFor(node.gazId, childPath),
            name: child.name,
            type: child.type,
            source: 'gazetteer',
            dbId: null,
            gazId: node.gazId,
            gazPath: childPath,
            parent: node,
            hasChildren: (child.children?.length ?? 0) > 0,
            childrenLoaded: false,
            expanded: false,
            children: [],
          });
        }
      }
    }

    node.children = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
    node.childrenLoaded = true;
    node.expanded = true;
  }

  function collapseNode(node: PlaceTreeNode): void {
    node.expanded = false;
  }

  async function expandAllForFilter(): Promise<void> {
    const q = normalize(filter.value);
    if (q.length < 2) return;
    async function walk(node: PlaceTreeNode): Promise<boolean> {
      if (!node.childrenLoaded && node.hasChildren) {
        await expandNode(node);
      }
      let anyMatch = normalize(node.name).includes(q);
      for (const child of node.children) {
        const childMatch = await walk(child);
        if (childMatch) anyMatch = true;
      }
      if (anyMatch) node.expanded = true;
      return anyMatch;
    }
    for (const root of roots.value) {
      await walk(root);
    }
  }

  async function applyFilter(query: string): Promise<void> {
    filter.value = query;
    if (normalize(query).length >= 2) {
      await expandAllForFilter();
    }
  }

  /** True when the filter is active (>= 2 chars). */
  const filterActive = computed(() => normalize(filter.value).length >= 2);

  function nodeMatchesFilter(node: PlaceTreeNode): boolean {
    if (!filterActive.value) return true;
    const q = normalize(filter.value);
    if (normalize(node.name).includes(q)) return true;
    return node.children.some(c => nodeMatchesFilter(c));
  }

  /** Flat ordered list of nodes that should currently be rendered (respecting expand state and filter). */
  const visibleNodes = computed<PlaceTreeNode[]>(() => {
    const out: PlaceTreeNode[] = [];
    function walk(node: PlaceTreeNode): void {
      if (filterActive.value && !nodeMatchesFilter(node)) return;
      out.push(node);
      if (node.expanded) {
        for (const c of node.children) walk(c);
      }
    }
    for (const root of roots.value) walk(root);
    return out;
  });

  async function findPathTo(placeId: string): Promise<PlaceTreeNode[]> {
    const ancestors = (await window.api?.places.getAncestors(placeId)) as Array<{ id: string; name: string }> | undefined ?? [];
    if (ancestors.length === 0) return [];
    const path: PlaceTreeNode[] = [];
    let level = roots.value;
    let parent: PlaceTreeNode | null = null;
    for (const a of ancestors) {
      // Prefer matching by dbId — when a gazetteer root shares its name with a
      // DB root (e.g. both "Sverige"), name-only match would lock onto the
      // gazetteer node and the descent into next.children would skip the DB
      // ancestors that the user actually has.
      const byId = level.find(n => n.dbId === a.id);
      const next = byId ?? level.find(n => normalize(n.name) === normalize(a.name));
      if (!next) break;
      path.push(next);
      if (!next.expanded) await expandNode(next);
      parent = next;
      level = next.children;
    }
    return path;
  }

  async function createChild(parent: PlaceTreeNode, name: string): Promise<{ id: string; name: string }> {
    let parentDbId = parent.dbId;
    if (!parentDbId) {
      if (!parent.gazPath) throw new Error('Cannot create child under a node with no DB id and no gazetteer path');
      const ancestors = parent.gazPath.slice(0, -1).map(n => ({ name: n }));
      const materializedParent = (await window.api?.places.findOrCreateWithChain(parent.name, ancestors)) as { id: string; name: string };
      parentDbId = materializedParent.id;
      parent.dbId = parentDbId;
      parent.source = 'merged';
    }
    const created = (await window.api?.places.create({ name, parent_place_id: parentDbId })) as { id: string; name: string };
    parent.children.push({
      key: dbKeyFor(created.id),
      name: created.name,
      type: null,
      source: 'db',
      dbId: created.id,
      gazId: null,
      gazPath: null,
      parent,
      hasChildren: false,
      childrenLoaded: true,
      expanded: false,
      children: [],
    });
    parent.children.sort((a, b) => a.name.localeCompare(b.name));
    parent.hasChildren = true;
    parent.expanded = true;
    parent.childrenLoaded = true;
    return created;
  }

  return {
    roots,
    visibleNodes,
    filter,
    filterActive,
    loadRoots,
    expandNode,
    collapseNode,
    applyFilter,
    findPathTo,
    createChild,
  };
}
