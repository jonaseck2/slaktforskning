// src/renderer/utils/chartData.ts
// Fetches PersonNode trees from window.api for use by chart components.

import type { PersonNode, PedigreeTree, HourglassTree, TimelineEntry, DescendantNode, TreePerson } from './chart-layout';

type RawPerson  = { id: string; sex: string; living: boolean };
type RawName    = { given_name: string | null; surname: string | null; preferred_name: string | null; nickname: string | null; sort_order: number };
type RawEvent   = { event_type: string; date_value: string | null; place_id?: string | null };
type RawRel     = { type: string; person1_id: string | null; person2_id: string | null };
type RawMedia   = { id: string; file_ref?: string | null; sort_order: number };
type RawPlace   = { id: string; name: string };

export async function fetchPersonNode(id: string): Promise<PersonNode> {
  const [person, names, events, mediaLinks] = await Promise.all([
    window.api.persons.get(id),
    window.api.persons.getNames(id),
    window.api.events.forPerson(id),
    window.api.media.forEntity('person', id),
  ]) as [RawPerson | null, RawName[], RawEvent[], RawMedia[]];

  if (!person) throw new Error(`Person not found: ${id}`);
  const primary = [...names].sort((a, b) => a.sort_order - b.sort_order)[0]
    ?? { given_name: null, surname: null, preferred_name: null, nickname: null };

  const birthEvent = events.find(e => e.event_type === 'birth');
  const deathEvent = events.find(e => e.event_type === 'death');

  // Fetch place names for birth/death events (sequential — depends on event data)
  let birthPlace: string | null = null;
  let deathPlace: string | null = null;

  if (birthEvent?.place_id) {
    try {
      const place = (await window.api.places.get(birthEvent.place_id)) as RawPlace | null;
      birthPlace = place?.name ?? null;
    } catch { /* ignore */ }
  }
  if (deathEvent?.place_id) {
    try {
      const place = (await window.api.places.get(deathEvent.place_id)) as RawPlace | null;
      deathPlace = place?.name ?? null;
    } catch { /* ignore */ }
  }

  // Profile photo: first media link sorted by sort_order
  const sortedMedia = [...mediaLinks].sort((a, b) => a.sort_order - b.sort_order);
  const photoUrl = sortedMedia[0]?.file_ref ?? null;

  return {
    id,
    givenName: primary.given_name,
    surname: primary.surname,
    preferredName: primary.preferred_name ?? null,
    nickname: primary.nickname ?? null,
    sex: person.sex as 'M' | 'F' | 'U',
    living: Boolean(person.living),
    birthDate: birthEvent?.date_value ?? null,
    deathDate: deathEvent?.date_value ?? null,
    birthPlace,
    deathPlace,
    photoUrl,
  };
}

/**
 * Fetch an ahnentafel ancestor tree up to `generations` levels (including focal).
 * Default: 5 generations (focal + 4 ancestor levels = up to 16 great-great-grandparents).
 * At the deepest generation, also checks for parents to populate hasMoreAncestors.
 */
export async function fetchPedigreeTree(focalId: string, generations = 5): Promise<PedigreeTree> {
  const nodes = new Map<number, PersonNode>();
  const hasMoreAncestors = new Set<number>();

  async function fetchAncestors(personId: string, ahnNum: number, gen: number): Promise<void> {
    if (gen < generations) {
      const [node, rawRels] = await Promise.all([
        fetchPersonNode(personId),
        window.api.relationships.getForPerson(personId),
      ]) as [PersonNode, RawRel[]];

      nodes.set(ahnNum, node);

      let parentIds = rawRels
        .filter(r => r.type === 'parent_child' && r.person2_id === personId)
        .map(r => r.person1_id)
        .filter((id): id is string => id !== null)
        .slice(0, 2);

      // Sort parents: male (M) gets even ahnentafel (left/father slot),
      // female (F) gets odd (right/mother slot). Fetch sex for both before assigning.
      if (parentIds.length === 2) {
        const sexes = await Promise.all(
          parentIds.map(pid => (window.api.persons.get(pid) as Promise<{ sex: string } | null>)),
        );
        if (sexes[0]?.sex === 'F' && sexes[1]?.sex !== 'F') {
          parentIds = [parentIds[1], parentIds[0]];
        }
      }

      await Promise.all(parentIds.map((pid, i) => fetchAncestors(pid, ahnNum * 2 + i, gen + 1)));
    } else {
      // Deepest generation: fetch node + check if parents exist in DB.
      const [node, rawRels] = await Promise.all([
        fetchPersonNode(personId),
        window.api.relationships.getForPerson(personId),
      ]) as [PersonNode, RawRel[]];
      nodes.set(ahnNum, node);
      const parentCount = rawRels
        .filter(r => r.type === 'parent_child' && r.person2_id === personId && r.person1_id !== null)
        .length;
      if (parentCount > 0) hasMoreAncestors.add(ahnNum);
    }
  }

  await fetchAncestors(focalId, 1, 1);
  return { nodes, generations, hasMoreAncestors };
}

/**
 * Load one generation of ancestors for the person at the given ahnentafel key.
 * Fetches their parents, checks if THOSE parents have further ancestors,
 * and returns a new PedigreeTree object (Vue reactivity requires new reference).
 */
export async function loadAncestorGeneration(
  tree: PedigreeTree,
  ahnNum: number,
): Promise<PedigreeTree> {
  const person = tree.nodes.get(ahnNum);
  if (!person) return tree;

  // Get parent relationships for the person at ahnNum
  const rawRels = (await window.api.relationships.getForPerson(person.id)) as RawRel[];
  let parentIds = rawRels
    .filter(r => r.type === 'parent_child' && r.person2_id === person.id)
    .map(r => r.person1_id)
    .filter((id): id is string => id !== null)
    .slice(0, 2);

  if (parentIds.length === 0) return tree; // nothing to load

  // Sort: male (M) → even ahnentafel (father slot), female (F) → odd (mother slot)
  if (parentIds.length === 2) {
    const sexes = await Promise.all(
      parentIds.map(pid => (window.api.persons.get(pid) as Promise<{ sex: string } | null>)),
    );
    if (sexes[0]?.sex === 'F' && sexes[1]?.sex !== 'F') {
      parentIds = [parentIds[1], parentIds[0]];
    }
  }

  const newNodes = new Map(tree.nodes);
  const newHasMore = new Set(tree.hasMoreAncestors ?? []);
  newHasMore.delete(ahnNum); // this person's parents are now loaded

  // Fetch each parent node + check if THEY have further parents
  await Promise.all(parentIds.map(async (pid, i) => {
    const parentAhnNum = ahnNum * 2 + i;
    const [parentNode, parentRels] = await Promise.all([
      fetchPersonNode(pid),
      (window.api.relationships.getForPerson(pid) as Promise<RawRel[]>),
    ]);
    newNodes.set(parentAhnNum, parentNode);

    const gpCount = parentRels
      .filter(r => r.type === 'parent_child' && r.person2_id === pid && r.person1_id !== null)
      .length;
    if (gpCount > 0) newHasMore.add(parentAhnNum);
  }));

  // Update generations count to cover the newly added depth
  // ahnNum * 2 is at depth floor(log2(ahnNum)) + 1; generations = that depth + 1
  const newGenerations = Math.max(
    tree.generations,
    Math.floor(Math.log2(ahnNum)) + 2,
  );

  return { nodes: newNodes, generations: newGenerations, hasMoreAncestors: newHasMore };
}

/**
 * Fetch a descendant tree up to `maxDepth` levels below the given person.
 * At the deepest generation, also checks for children to populate hasMoreChildren.
 */
export async function fetchDescendantTree(
  personId: string,
  depth: number,
  maxDepth: number,
): Promise<DescendantNode> {
  if (depth < maxDepth) {
    const [node, rawRels] = await Promise.all([
      fetchPersonNode(personId),
      window.api.relationships.getForPerson(personId),
    ]) as [PersonNode, RawRel[]];

    const childIds = rawRels
      .filter(r => r.type === 'parent_child' && r.person1_id === personId)
      .map(r => r.person2_id)
      .filter((id): id is string => id !== null);

    const children = await Promise.all(
      childIds.map(id => fetchDescendantTree(id, depth + 1, maxDepth)),
    );
    return { person: node, children, hasMoreChildren: false };
  } else {
    // Deepest generation: fetch node + check if children exist in DB.
    const [node, rawRels] = await Promise.all([
      fetchPersonNode(personId),
      window.api.relationships.getForPerson(personId),
    ]) as [PersonNode, RawRel[]];
    const hasMoreChildren = rawRels.some(
      r => r.type === 'parent_child' && r.person1_id === personId && r.person2_id !== null,
    );
    return { person: node, children: [], hasMoreChildren };
  }
}

/**
 * Fetch and attach children for the node identified by targetPersonId, anywhere
 * in the descendant tree rooted at `root`. Returns a new root object with new
 * object references along the path to the modified node (Vue reactivity).
 * Each newly loaded child gets hasMoreChildren set by checking their relationships.
 */
export async function loadChildrenForNode(
  root: DescendantNode,
  targetPersonId: string,
): Promise<DescendantNode> {
  async function updateNode(node: DescendantNode): Promise<DescendantNode> {
    if (node.person.id === targetPersonId) {
      // Fetch this person's children
      const rawRels = (await window.api.relationships.getForPerson(node.person.id)) as RawRel[];
      const childIds = rawRels
        .filter(r => r.type === 'parent_child' && r.person1_id === node.person.id)
        .map(r => r.person2_id)
        .filter((id): id is string => id !== null);

      const children = await Promise.all(childIds.map(async (cid) => {
        const [childNode, childRels] = await Promise.all([
          fetchPersonNode(cid),
          (window.api.relationships.getForPerson(cid) as Promise<RawRel[]>),
        ]);
        const hasMoreChildren = childRels.some(
          r => r.type === 'parent_child' && r.person1_id === cid && r.person2_id !== null,
        );
        return { person: childNode, children: [], hasMoreChildren };
      }));

      return { ...node, children, hasMoreChildren: false };
    }

    // Recurse into children, creating new object references only along changed path
    let changed = false;
    const newChildren = await Promise.all(node.children.map(async (child) => {
      const updated = await updateNode(child);
      if (updated !== child) changed = true;
      return updated;
    }));

    if (!changed) return node;
    return { ...node, children: newChildren };
  }

  return updateNode(root);
}

/**
 * Fetch an hourglass tree: 3 ancestor levels above focal + 3 descendant levels below
 * + couple partners (spouses) of the focal person.
 */
export async function fetchHourglassTree(focalId: string): Promise<HourglassTree> {
  const [ancestors, descendantRoot, rawRels] = await Promise.all([
    fetchPedigreeTree(focalId, 4), // focal + 3 ancestor levels (parents, gp, ggp)
    fetchDescendantTree(focalId, 0, 3), // 3 descendant levels (children, gc, ggc)
    window.api.relationships.getForPerson(focalId),
  ]) as [PedigreeTree, DescendantNode, RawRel[]];

  const spouseIds = rawRels
    .filter(r => r.type === 'couple')
    .map(r => (r.person1_id === focalId ? r.person2_id : r.person1_id))
    .filter((id): id is string => id !== null && id !== focalId);

  const spouses = await Promise.all(spouseIds.map(fetchPersonNode));

  // Find siblings: other children of the focal's parents.
  const parentIds = rawRels
    .filter(r => r.type === 'parent_child' && r.person2_id === focalId)
    .map(r => r.person1_id)
    .filter((id): id is string => id !== null);

  const siblingIdSet = new Set<string>();
  await Promise.all(parentIds.map(async (parentId) => {
    const parentRels = (await window.api.relationships.getForPerson(parentId)) as RawRel[];
    parentRels
      .filter(r => r.type === 'parent_child' && r.person1_id === parentId && r.person2_id !== focalId)
      .forEach(r => { if (r.person2_id) siblingIdSet.add(r.person2_id); });
  }));

  const siblings = await Promise.all([...siblingIdSet].map(fetchPersonNode));

  // Annotate focal's direct children with their co-parent ID.
  // A child's co-parent is the focal's spouse who is also a parent of that child.
  let annotatedRoot = descendantRoot;
  if (descendantRoot.children.length > 0 && spouseIds.length > 0) {
    const spouseIdSet = new Set(spouseIds);
    const annotatedChildren = await Promise.all(
      descendantRoot.children.map(async (child) => {
        const childRels = await (window.api.relationships.getForPerson(child.person.id) as Promise<RawRel[]>);
        const coParentId = childRels
          .filter(r => r.type === 'parent_child' && r.person2_id === child.person.id && r.person1_id !== focalId)
          .map(r => r.person1_id)
          .find(pid => pid !== null && spouseIdSet.has(pid!)) ?? null;
        return { ...child, coParentId };
      }),
    );
    annotatedRoot = { ...descendantRoot, children: annotatedChildren };
  }

  return { ancestors, descendantRoot: annotatedRoot, descendantGenerations: 3, spouses, siblings };
}

/**
 * Fetch an hourglass tree as a TreePerson graph directly (no ahnentafel).
 * Supports N parents per person. Fetches spouses for every node in the tree.
 * Returns the focal TreePerson as root.
 */
export async function fetchHourglassTreePerson(
  focalId: string,
  ancestorDepth = 3,
  descendantDepth = 3,
): Promise<TreePerson> {
  // Track all person IDs in the tree to avoid duplicate spouse nodes
  const treePersonIds = new Set<string>();

  /** Collect all person IDs that will be in the tree (ancestors + descendants + focal). */
  async function collectTreeIds(personId: string, direction: 'up' | 'down', depth: number, maxDepth: number): Promise<void> {
    if (treePersonIds.has(personId)) return;
    treePersonIds.add(personId);
    if (depth >= maxDepth) return;
    const rels = (await window.api.relationships.getForPerson(personId)) as RawRel[];
    if (direction === 'up') {
      const parentIds = rels
        .filter(r => r.type === 'parent_child' && r.person2_id === personId)
        .map(r => r.person1_id)
        .filter((id): id is string => id !== null);
      await Promise.all(parentIds.map(pid => collectTreeIds(pid, 'up', depth + 1, maxDepth)));
    } else {
      const childIds = rels
        .filter(r => r.type === 'parent_child' && r.person1_id === personId)
        .map(r => r.person2_id)
        .filter((id): id is string => id !== null);
      await Promise.all(childIds.map(cid => collectTreeIds(cid, 'down', depth + 1, maxDepth)));
    }
  }

  // First pass: collect all IDs that will be primary tree nodes
  await collectTreeIds(focalId, 'up', 0, ancestorDepth);
  await collectTreeIds(focalId, 'down', 0, descendantDepth);

  // Also collect siblings
  const focalRels = (await window.api.relationships.getForPerson(focalId)) as RawRel[];
  const focalParentIds = focalRels
    .filter(r => r.type === 'parent_child' && r.person2_id === focalId)
    .map(r => r.person1_id)
    .filter((id): id is string => id !== null);
  const siblingIdSet = new Set<string>();
  await Promise.all(focalParentIds.map(async (parentId) => {
    const parentRels = (await window.api.relationships.getForPerson(parentId)) as RawRel[];
    parentRels
      .filter(r => r.type === 'parent_child' && r.person1_id === parentId && r.person2_id !== focalId)
      .forEach(r => { if (r.person2_id) { siblingIdSet.add(r.person2_id); treePersonIds.add(r.person2_id); } });
  }));

  /** Fetch spouses (couple partners) for a person, excluding those already in the tree. */
  async function fetchSpouses(personId: string): Promise<TreePerson[]> {
    const rels = (await window.api.relationships.getForPerson(personId)) as RawRel[];
    const spouseIds = rels
      .filter(r => r.type === 'couple')
      .map(r => (r.person1_id === personId ? r.person2_id : r.person1_id))
      .filter((id): id is string => id !== null && id !== personId && !treePersonIds.has(id));
    return Promise.all(spouseIds.map(async (id) => ({
      person: await fetchPersonNode(id),
      parents: [],
      children: [],
      spouses: [],
    })));
  }

  function sortParentIds(ids: string[], sexes: ({ sex: string } | null)[]): string[] {
    const sorted = [...ids];
    sorted.sort((a, b) => {
      const sa = sexes[ids.indexOf(a)]?.sex;
      const sb = sexes[ids.indexOf(b)]?.sex;
      if (sa === 'M' && sb !== 'M') return -1;
      if (sa !== 'M' && sb === 'M') return 1;
      return 0;
    });
    return sorted;
  }

  /** Recursively build ancestors as TreePerson (supports N parents). */
  async function buildAncestors(personId: string, depth: number): Promise<TreePerson> {
    const node = await fetchPersonNode(personId);
    const rels = (await window.api.relationships.getForPerson(personId)) as RawRel[];
    const spouses = await fetchSpouses(personId);

    if (depth >= ancestorDepth) {
      const hasMore = rels.some(r => r.type === 'parent_child' && r.person2_id === personId && r.person1_id !== null);
      return { person: node, parents: [], children: [], spouses, hasMoreAncestors: hasMore };
    }

    let parentIds = rels
      .filter(r => r.type === 'parent_child' && r.person2_id === personId)
      .map(r => r.person1_id)
      .filter((id): id is string => id !== null);

    if (parentIds.length >= 2) {
      const sexes = await Promise.all(
        parentIds.map(pid => (window.api.persons.get(pid) as Promise<{ sex: string } | null>)),
      );
      parentIds = sortParentIds(parentIds, sexes);
    }

    const parents = await Promise.all(parentIds.map(pid => buildAncestors(pid, depth + 1)));
    return { person: node, parents, children: [], spouses };
  }

  /** Recursively build descendants as TreePerson (with spouses). */
  async function buildDescendants(personId: string, depth: number, isFocal: boolean): Promise<TreePerson> {
    const node = await fetchPersonNode(personId);
    const rels = (await window.api.relationships.getForPerson(personId)) as RawRel[];
    const spouses = isFocal ? [] : await fetchSpouses(personId);

    if (depth >= descendantDepth) {
      const hasMore = rels.some(r => r.type === 'parent_child' && r.person1_id === personId && r.person2_id !== null);
      return { person: node, parents: [], children: [], spouses, hasMoreChildren: hasMore, isFocal };
    }

    const childIds = rels
      .filter(r => r.type === 'parent_child' && r.person1_id === personId)
      .map(r => r.person2_id)
      .filter((id): id is string => id !== null);

    const children = await Promise.all(childIds.map(cid => buildDescendants(cid, depth + 1, false)));

    return { person: node, parents: [], children, spouses, isFocal };
  }

  // Build ancestor parents
  let parentIds = [...focalParentIds];
  if (parentIds.length >= 2) {
    const sexes = await Promise.all(
      parentIds.map(pid => (window.api.persons.get(pid) as Promise<{ sex: string } | null>)),
    );
    parentIds = sortParentIds(parentIds, sexes);
  }

  const parents = await Promise.all(parentIds.map(pid => buildAncestors(pid, 1)));

  // Descendant children
  const childIds = focalRels
    .filter(r => r.type === 'parent_child' && r.person1_id === focalId)
    .map(r => r.person2_id)
    .filter((id): id is string => id !== null);

  // Focal spouses
  const spouseIds = focalRels
    .filter(r => r.type === 'couple')
    .map(r => (r.person1_id === focalId ? r.person2_id : r.person1_id))
    .filter((id): id is string => id !== null && id !== focalId);
  const spouseIdSet = new Set(spouseIds);

  const spouses = await Promise.all(spouseIds.map(async (id) => ({
    person: await fetchPersonNode(id),
    parents: [],
    children: [],
    spouses: [],
  })));

  // Build children with coParentId annotation
  const children = await Promise.all(childIds.map(async (cid) => {
    const child = await buildDescendants(cid, 1, false);
    const childRels = (await window.api.relationships.getForPerson(cid)) as RawRel[];
    const coParentId = childRels
      .filter(r => r.type === 'parent_child' && r.person2_id === cid && r.person1_id !== focalId)
      .map(r => r.person1_id)
      .find(pid => pid !== null && spouseIdSet.has(pid!)) ?? null;
    child.coParentId = coParentId;
    return child;
  }));

  // Siblings (with their spouses)
  const siblings: TreePerson[] = await Promise.all([...siblingIdSet].map(async (id) => {
    const spouses = await fetchSpouses(id);
    return {
      person: await fetchPersonNode(id),
      parents: [],
      children: [],
      spouses,
    };
  }));

  const focal = await fetchPersonNode(focalId);
  return {
    person: focal,
    parents,
    children,
    spouses,
    siblings,
    isFocal: true,
    hasMoreChildren: false,
  };
}

/**
 * Load one generation of ancestors for a person in a TreePerson graph.
 * Returns a new TreePerson root (Vue reactivity requires new references).
 */
export async function loadAncestorGenerationTP(
  root: TreePerson,
  targetPersonId: string,
): Promise<TreePerson> {
  type RR = RawRel;

  async function updateNode(node: TreePerson): Promise<TreePerson> {
    if (node.person.id === targetPersonId && node.parents.length === 0 && node.hasMoreAncestors) {
      const rels = (await window.api.relationships.getForPerson(targetPersonId)) as RR[];
      const parentIds = rels
        .filter(r => r.type === 'parent_child' && r.person2_id === targetPersonId)
        .map(r => r.person1_id)
        .filter((id): id is string => id !== null);

      if (parentIds.length >= 2) {
        const sexes = await Promise.all(
          parentIds.map(pid => (window.api.persons.get(pid) as Promise<{ sex: string } | null>)),
        );
        parentIds.sort((a, b) => {
          const sa = sexes[parentIds.indexOf(a)]?.sex;
          const sb = sexes[parentIds.indexOf(b)]?.sex;
          if (sa === 'M' && sb !== 'M') return -1;
          if (sa !== 'M' && sb === 'M') return 1;
          return 0;
        });
      }

      const parents = await Promise.all(parentIds.map(async (pid) => {
        const [pNode, pRels] = await Promise.all([
          fetchPersonNode(pid),
          window.api.relationships.getForPerson(pid) as Promise<RR[]>,
        ]);
        // Fetch spouses for each new parent
        const spouseIds = pRels
          .filter(r => r.type === 'couple')
          .map(r => (r.person1_id === pid ? r.person2_id : r.person1_id))
          .filter((id): id is string => id !== null && id !== pid);
        const spouses: TreePerson[] = await Promise.all(spouseIds.map(async (sid) => ({
          person: await fetchPersonNode(sid),
          parents: [], children: [], spouses: [],
        })));
        const hasMore = pRels.some(r => r.type === 'parent_child' && r.person2_id === pid && r.person1_id !== null);
        return { person: pNode, parents: [], children: [], spouses, hasMoreAncestors: hasMore } as TreePerson;
      }));

      return { ...node, parents, hasMoreAncestors: false };
    }

    // Recurse into parents
    let changed = false;
    const newParents = await Promise.all(node.parents.map(async (p) => {
      const updated = await updateNode(p);
      if (updated !== p) changed = true;
      return updated;
    }));

    if (!changed) return node;
    return { ...node, parents: newParents };
  }

  return updateNode(root);
}

/**
 * Load children for a node in a TreePerson graph.
 * Returns a new TreePerson root (Vue reactivity requires new references).
 */
export async function loadChildrenForNodeTP(
  root: TreePerson,
  targetPersonId: string,
): Promise<TreePerson> {
  type RR = RawRel;

  async function updateNode(node: TreePerson): Promise<TreePerson> {
    if (node.person.id === targetPersonId && node.children.length === 0) {
      const rels = (await window.api.relationships.getForPerson(targetPersonId)) as RR[];
      const childIds = rels
        .filter(r => r.type === 'parent_child' && r.person1_id === targetPersonId)
        .map(r => r.person2_id)
        .filter((id): id is string => id !== null);

      const children = await Promise.all(childIds.map(async (cid) => {
        const [childNode, childRels] = await Promise.all([
          fetchPersonNode(cid),
          window.api.relationships.getForPerson(cid) as Promise<RR[]>,
        ]);
        const hasMore = childRels.some(
          r => r.type === 'parent_child' && r.person1_id === cid && r.person2_id !== null,
        );
        // Fetch spouses for each new child
        const spouseIds = childRels
          .filter(r => r.type === 'couple')
          .map(r => (r.person1_id === cid ? r.person2_id : r.person1_id))
          .filter((id): id is string => id !== null && id !== cid);
        const spouses: TreePerson[] = await Promise.all(spouseIds.map(async (sid) => ({
          person: await fetchPersonNode(sid),
          parents: [], children: [], spouses: [],
        })));
        return { person: childNode, parents: [], children: [], spouses, hasMoreChildren: hasMore } as TreePerson;
      }));

      return { ...node, children, hasMoreChildren: false };
    }

    // Recurse into children
    let changed = false;
    const newChildren = await Promise.all(node.children.map(async (c) => {
      const updated = await updateNode(c);
      if (updated !== c) changed = true;
      return updated;
    }));

    if (!changed) return node;
    return { ...node, children: newChildren };
  }

  return updateNode(root);
}

export async function fetchTimelineEntries(focalId: string): Promise<TimelineEntry[]> {
  const rawRels = (await window.api.relationships.getForPerson(focalId)) as RawRel[];

  const relatedIds = new Set<string>();
  rawRels.forEach(r => {
    if (r.person1_id && r.person1_id !== focalId) relatedIds.add(r.person1_id);
    if (r.person2_id && r.person2_id !== focalId) relatedIds.add(r.person2_id);
  });

  const allIds = [focalId, ...relatedIds];

  const results = await Promise.all(
    allIds.map(async (id) => {
      try {
        const [node, events] = await Promise.all([
          fetchPersonNode(id),
          window.api.events.forPerson(id) as Promise<RawEvent[]>,
        ]);
        return {
          person: node,
          isFocal: id === focalId,
          events: events.map(e => ({ event_type: e.event_type, date_value: e.date_value })),
        };
      } catch {
        return null;
      }
    }),
  );

  return results.filter((n): n is TimelineEntry => n !== null);
}

/**
 * Fetch ALL ancestors of a person using BFS, up to `limit` persons.
 * Returns an ahnentafel-keyed Map (1=focal, 2=father, 3=mother, …) and
 * a flag indicating whether the limit was reached.
 *
 * BFS is sequential (not parallel) to avoid overwhelming the IPC layer
 * for large trees.
 */
export async function fetchAllAncestors(
  focalId: string,
): Promise<{ ancestors: Map<number, PersonNode>; limitReached: boolean }> {
  const ancestors = new Map<number, PersonNode>();
  const queue: Array<{ personId: string; ahnNum: number }> = [
    { personId: focalId, ahnNum: 1 },
  ];

  while (queue.length > 0) {
    const { personId, ahnNum } = queue.shift()!;
    if (ancestors.has(ahnNum)) continue;

    try {
      const [node, rawRels] = await Promise.all([
        fetchPersonNode(personId),
        window.api.relationships.getForPerson(personId) as Promise<RawRel[]>,
      ]);
      ancestors.set(ahnNum, node);

      let parentIds = rawRels
        .filter(r => r.type === 'parent_child' && r.person2_id === personId)
        .map(r => r.person1_id)
        .filter((id): id is string => id !== null)
        .slice(0, 2);

      // Sort parents: male (M) → even ahnentafel (father), female (F) → odd (mother).
      if (parentIds.length === 2) {
        const sexes = await Promise.all(
          parentIds.map(pid =>
            (window.api.persons.get(pid) as Promise<{ sex: string } | null>),
          ),
        );
        if (sexes[0]?.sex === 'F' && sexes[1]?.sex !== 'F') {
          parentIds = [parentIds[1], parentIds[0]];
        }
      }

      for (let i = 0; i < parentIds.length; i++) {
        queue.push({ personId: parentIds[i], ahnNum: ahnNum * 2 + i });
      }
    } catch {
      // Skip missing or deleted ancestors; continue building the rest of the tree.
    }
  }

  return { ancestors, limitReached: false };
}
