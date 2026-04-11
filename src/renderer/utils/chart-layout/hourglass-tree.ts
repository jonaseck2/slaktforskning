// Hourglass tree builder: converts HourglassTree → TreePerson graph
// and injects outline placeholders for the selected person.

import type { PersonNode, HourglassTree, DescendantNode, TreePerson } from './types';

const PLACEHOLDER_PREFIX = '__ph_';

function makePlaceholder(
  role: 'father' | 'mother' | 'child' | 'spouse',
  forPersonId: string,
  sex: 'M' | 'F' | 'U' = 'U',
): TreePerson {
  return {
    person: {
      id: `${PLACEHOLDER_PREFIX}${role}_${forPersonId}`,
      givenName: null, surname: null, preferredName: null, nickname: null,
      sex, living: false, birthDate: null, deathDate: null,
    },
    parents: [],
    children: [],
    spouses: [],
    isPlaceholder: true,
    placeholderRole: role,
    placeholderForPersonId: forPersonId,
  };
}

/**
 * Convert HourglassTree (ahnentafel + descendant tree) into a uniform TreePerson graph.
 *
 * The graph is rooted at the focal person. Parents link upward, children link downward,
 * spouses link sideways. All nodes use the same TreePerson interface.
 */
export function buildHourglassTree(tree: HourglassTree): TreePerson {
  const { ancestors, descendantRoot, spouses = [], siblings = [] } = tree;
  const ancestorNodes = ancestors.nodes;
  const hasMoreAncestors = ancestors.hasMoreAncestors ?? new Set<number>();

  // Build ancestor TreePersons recursively from ahnentafel
  const treePersonCache = new Map<number, TreePerson>();

  function buildAncestor(k: number): TreePerson | null {
    const person = ancestorNodes.get(k);
    if (!person) return null;

    if (treePersonCache.has(k)) return treePersonCache.get(k)!;

    const tp: TreePerson = {
      person,
      parents: [],
      children: [],
      spouses: [],
      isFocal: k === 1,
      hasMoreAncestors: hasMoreAncestors.has(k),
    };
    treePersonCache.set(k, tp);

    // Build parents (father = k*2, mother = k*2+1)
    const father = buildAncestor(k * 2);
    if (father) tp.parents.push(father);
    const mother = buildAncestor(k * 2 + 1);
    if (mother) tp.parents.push(mother);

    return tp;
  }

  const focal = buildAncestor(1);
  if (!focal) {
    // Shouldn't happen — focal must exist
    throw new Error('Focal person not found in ancestor tree');
  }

  // Build descendant TreePersons recursively
  function buildDescendant(node: DescendantNode): TreePerson {
    const tp: TreePerson = {
      person: node.person,
      parents: [],
      children: node.children.map(c => buildDescendant(c)),
      spouses: [],
      hasMoreChildren: node.hasMoreChildren,
      coParentId: node.coParentId,
    };
    return tp;
  }

  // Merge descendant children into focal node
  // (focal already exists from ancestor tree — add children from descendant tree)
  focal.children = descendantRoot.children.map(c => buildDescendant(c));
  focal.hasMoreChildren = descendantRoot.hasMoreChildren;

  // Add spouses to focal
  focal.spouses = spouses.map(sp => ({
    person: sp,
    parents: [],
    children: [],
    spouses: [],
  }));

  // Add siblings as additional children of focal's parents
  // Siblings are children of the focal's parents but not the focal person
  const siblingTreePersons: TreePerson[] = siblings.map(sib => ({
    person: sib,
    parents: [],
    children: [],
    spouses: [],
  }));

  // If focal has parents, add siblings as their children
  // (The focal is already implicitly a child of these parents via the ancestor link)
  if (focal.parents.length > 0) {
    // Add siblings to the first parent's children list
    // (siblings are shared children of both parents)
    focal.parents[0].children = [focal, ...siblingTreePersons];
  }

  return focal;
}

/**
 * Inject outline placeholders for the selected person.
 * Always injects: father, mother, child, spouse. No conditions.
 *
 * Mutates the tree in place (caller should clone if needed).
 */
export function injectOutlines(root: TreePerson, selectedPersonId: string): void {
  const target = findPerson(root, selectedPersonId);
  if (!target) return;

  // Father outline
  target.parents.push(makePlaceholder('father', selectedPersonId, 'M'));
  // Mother outline
  target.parents.push(makePlaceholder('mother', selectedPersonId, 'F'));
  // Child outline
  target.children.push(makePlaceholder('child', selectedPersonId));
  // Spouse outline (right for male, left for female)
  if (target.person.sex === 'F') {
    target.spouses.unshift(makePlaceholder('spouse', selectedPersonId, 'M'));
  } else {
    target.spouses.push(makePlaceholder('spouse', selectedPersonId, 'F'));
  }
}

/** Find a TreePerson by person ID anywhere in the tree (handles cycles). */
function findPerson(node: TreePerson, id: string, visited = new Set<string>()): TreePerson | null {
  if (node.person.id === id) return node;
  if (visited.has(node.person.id)) return null;
  visited.add(node.person.id);
  for (const parent of node.parents) {
    const found = findPerson(parent, id, visited);
    if (found) return found;
  }
  for (const child of node.children) {
    const found = findPerson(child, id, visited);
    if (found) return found;
  }
  for (const spouse of node.spouses) {
    const found = findPerson(spouse, id, visited);
    if (found) return found;
  }
  return null;
}

export { PLACEHOLDER_PREFIX };
