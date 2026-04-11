// src/renderer/utils/chartData.ts
// Fetches PersonNode trees from window.api for use by chart components.

import type { PersonNode, PedigreeTree, HourglassTree, TimelineEntry, DescendantNode } from './chart-layout';

type RawPerson  = { id: string; sex: string; living: boolean };
type RawName    = { given_name: string | null; surname: string | null; preferred_name: string | null; nickname: string | null; sort_order: number };
type RawEvent   = { event_type: string; date_value: string | null };
type RawRel     = { type: string; person1_id: string | null; person2_id: string | null };

export async function fetchPersonNode(id: string): Promise<PersonNode> {
  const [person, names, events] = await Promise.all([
    window.api.persons.get(id),
    window.api.persons.getNames(id),
    window.api.events.forPerson(id),
  ]) as [RawPerson | null, RawName[], RawEvent[]];

  if (!person) throw new Error(`Person not found: ${id}`);
  const primary = [...names].sort((a, b) => a.sort_order - b.sort_order)[0]
    ?? { given_name: null, surname: null, preferred_name: null, nickname: null };

  return {
    id,
    givenName: primary.given_name,
    surname: primary.surname,
    preferredName: primary.preferred_name ?? null,
    nickname: primary.nickname ?? null,
    sex: person.sex as 'M' | 'F' | 'U',
    living: Boolean(person.living),
    birthDate: events.find(e => e.event_type === 'birth')?.date_value ?? null,
    deathDate: events.find(e => e.event_type === 'death')?.date_value ?? null,
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
async function fetchDescendantTree(
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

export async function fetchTimelineEntries(focalId: string): Promise<TimelineEntry[]> {
  const rawRels = (await window.api.relationships.getForPerson(focalId)) as RawRel[];

  const relatedIds = new Set<string>();
  rawRels.forEach(r => {
    if (r.person1_id && r.person1_id !== focalId) relatedIds.add(r.person1_id);
    if (r.person2_id && r.person2_id !== focalId) relatedIds.add(r.person2_id);
  });

  const allIds = [focalId, ...relatedIds];
  const nodes = await Promise.all(allIds.map(id => fetchPersonNode(id).catch(() => null)));

  return nodes
    .filter((n): n is PersonNode => n !== null)
    .map(person => ({ person, isFocal: person.id === focalId }));
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
