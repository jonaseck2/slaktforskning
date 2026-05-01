import { ref } from 'vue';
import { resolvePlace } from '../../api/place-gazetteers/resolver';
import type { Gazetteer } from '../../api/place-gazetteers/types';

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

  /**
   * Render-time virtual mounting: orphan DB places (parent_place_id = NULL)
   * whose name resolves to a deeper gazetteer node should appear inside the
   * gazetteer hierarchy, not at the top of the tree. The resolver tells us
   * "this place looks like Sweden → Stockholm län → Solna stad" — we hide it
   * from root and slot it as a child of the gazetteer parent on expand.
   *
   * Map key: gazetteer-parent-path (`gaz:<id>:<path>`). Value: the orphan rows
   * to splice in when that gazetteer node expands.
   *
   * This is *display only*. We never write the inferred parent back to the DB
   * (data-fidelity prime directive). The user's row keeps `parent_place_id =
   * NULL`; we just present it where the gazetteer suggests it belongs.
   */
  const mountedOrphans = new Map<string, DbChildRow[]>();

  async function loadRoots(): Promise<void> {
    const dbRoots = (await window.api?.places?.listChildren?.(null)) as DbChildRow[] | undefined ?? [];
    const merged = new Map<string, PlaceTreeNode>();
    mountedOrphans.clear();

    // Pass 1 — DB roots. We seed merged keyed by name so the next pass can
    // either pair gazetteer roots with the DB row, or push them to the side.
    for (const row of dbRoots) {
      merged.set(normalize(row.name), {
        key: dbKeyFor(row.id),
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

    // Pass 2 — gazetteer roots. Merge with same-name DB roots, otherwise add
    // as gazetteer-only.
    const gazetteers = opts.getGazetteers();
    for (const gaz of gazetteers) {
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

    // Pass 3 — virtual remount of orphan DB roots. For any node still tagged
    // `source: 'db'` (a real DB root that didn't pair with any gazetteer
    // root), ask the resolver where the gazetteer thinks it lives. If the
    // match goes deeper than the root level (matchedPath.length >= 2), pull
    // it out of the top-level merged map and remember it under its gazetteer
    // parent's path.
    if (gazetteers.length > 0) {
      const dbOnlyKeys: string[] = [];
      for (const [key, node] of merged) {
        if (node.source === 'db') dbOnlyKeys.push(key);
      }
      for (const key of dbOnlyKeys) {
        const node = merged.get(key);
        if (!node || !node.dbId) continue;
        const result = resolvePlace(node.name, gazetteers as Gazetteer[]);
        if (!result || result.matchedPath.length < 2) continue;
        const parentPath = result.matchedPath.slice(0, -1);
        const mountKey = gazKeyFor(result.gazetteer, parentPath);
        const list = mountedOrphans.get(mountKey) ?? [];
        list.push({
          id: node.dbId,
          name: node.name,
          parent_place_id: null,
          place_type: node.type,
          hasChildren: node.hasChildren,
        });
        mountedOrphans.set(mountKey, list);
        merged.delete(key);
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
      const dbChildren = (await window.api?.places?.listChildren?.(node.dbId)) as DbChildRow[] | undefined ?? [];
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

      // Virtual orphans the resolver mounted under this gazetteer node go
      // here. If the orphan's name collides with a gazetteer child we already
      // added above, prefer the merged form (real DB id wins on selection).
      const mountKey = gazKeyFor(node.gazId, node.gazPath);
      const mountedHere = mountedOrphans.get(mountKey);
      if (mountedHere) {
        for (const orphan of mountedHere) {
          const norm = normalize(orphan.name);
          const existing = merged.get(norm);
          if (existing) {
            existing.source = 'merged';
            existing.dbId = orphan.id;
            // Update key so a refresh (re-expand) keeps it stable as a DB row.
            existing.key = dbKeyFor(orphan.id);
            if (orphan.hasChildren) existing.hasChildren = true;
          } else {
            merged.set(norm, {
              key: dbKeyFor(orphan.id),
              name: orphan.name,
              type: orphan.place_type,
              source: 'db',
              dbId: orphan.id,
              gazId: null,
              gazPath: null,
              parent: node,
              hasChildren: !!orphan.hasChildren,
              childrenLoaded: false,
              expanded: false,
              children: [],
            });
          }
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

  async function findPathTo(placeId: string): Promise<PlaceTreeNode[]> {
    const ancestors = (await window.api?.places?.getAncestors?.(placeId)) as Array<{ id: string; name: string }> | undefined ?? [];
    if (ancestors.length === 0) return [];

    // If the place is an orphan DB row (parent_place_id IS NULL → ancestors
    // returns just the place itself) and the resolver suggested a gazetteer
    // mount point, follow the gazetteer parent path down so we land where the
    // virtual mount placed the row.
    if (ancestors.length === 1) {
      const gazetteers = opts.getGazetteers();
      const result = gazetteers.length > 0 ? resolvePlace(ancestors[0].name, gazetteers as Gazetteer[]) : null;
      if (result && result.matchedPath.length >= 2) {
        const path: PlaceTreeNode[] = [];
        let level = roots.value;
        // Walk down the gazetteer parent path, expanding each node so the
        // virtual mount can splice the orphan in at the leaf.
        for (let i = 0; i < result.matchedPath.length - 1; i++) {
          const segName = result.matchedPath[i];
          const next = level.find(n => normalize(n.name) === normalize(segName));
          if (!next) break;
          path.push(next);
          if (!next.expanded) await expandNode(next);
          level = next.children;
        }
        // Last hop: find the orphan we just mounted.
        const orphan = level.find(n => n.dbId === placeId);
        if (orphan) path.push(orphan);
        return path;
      }
    }

    const path: PlaceTreeNode[] = [];
    let level = roots.value;
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
    loadRoots,
    expandNode,
    collapseNode,
    findPathTo,
    createChild,
  };
}
