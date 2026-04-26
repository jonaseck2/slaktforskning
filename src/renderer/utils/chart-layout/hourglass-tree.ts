// Tree builders: converts various tree formats → TreePerson graph
// and injects outline placeholders for the selected person.

import type { HourglassTree, DescendantNode, TreePerson, PedigreeTree } from './types';

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

  // Store siblings on the focal node directly
  focal.siblings = siblings.map(sib => ({
    person: sib,
    parents: [],
    children: [],
    spouses: [],
  }));

  return focal;
}

/**
 * Inject outline placeholders for the selected person.
 *
 * Injects child + spouse unconditionally. Father/mother placeholders are only
 * injected when no real parent of the matching sex already exists — once a
 * person has a father, the chart should not invite adding another (additional
 * parents can still be added via the relationships panel).
 *
 * Mutates the tree in place (caller should clone if needed).
 */
export function injectOutlines(root: TreePerson, selectedPersonId: string): void {
  const target = findPerson(root, selectedPersonId);
  if (!target) return;

  const realParents = target.parents.filter(p => !p.isPlaceholder);
  const hasFather = realParents.some(p => p.person.sex === 'M');
  const hasMother = realParents.some(p => p.person.sex === 'F');

  if (!hasFather) target.parents.push(makePlaceholder('father', selectedPersonId, 'M'));
  if (!hasMother) target.parents.push(makePlaceholder('mother', selectedPersonId, 'F'));

  target.children.push(makePlaceholder('child', selectedPersonId));
  if (target.person.sex === 'F') {
    target.spouses.unshift(makePlaceholder('spouse', selectedPersonId, 'M'));
  } else {
    target.spouses.push(makePlaceholder('spouse', selectedPersonId, 'F'));
  }
}

/** Find a TreePerson by person ID anywhere in the tree (handles cycles). */
export function findPerson(node: TreePerson, id: string, visited = new Set<string>()): TreePerson | null {
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
  for (const sibling of (node.siblings ?? [])) {
    const found = findPerson(sibling, id, visited);
    if (found) return found;
  }
  return null;
}

/**
 * Convert PedigreeTree (ahnentafel) into a TreePerson graph.
 * Same structure as hourglass ancestor section but without descendants/siblings/spouses.
 */
export function buildPedigreeTreePerson(tree: PedigreeTree): TreePerson {
  const { nodes, hasMoreAncestors = new Set<number>() } = tree;
  const cache = new Map<number, TreePerson>();

  function build(k: number): TreePerson | null {
    const person = nodes.get(k);
    if (!person) return null;
    if (cache.has(k)) return cache.get(k)!;

    const tp: TreePerson = {
      person,
      parents: [],
      children: [],
      spouses: [],
      isFocal: k === 1,
      hasMoreAncestors: hasMoreAncestors.has(k),
    };
    cache.set(k, tp);

    const father = build(k * 2);
    if (father) tp.parents.push(father);
    const mother = build(k * 2 + 1);
    if (mother) tp.parents.push(mother);

    return tp;
  }

  const focal = build(1);
  if (!focal) throw new Error('Focal person not found in pedigree tree');
  return focal;
}

/**
 * Convert DescendantNode tree into a TreePerson graph.
 */
export function buildDescendantTreePerson(root: DescendantNode): TreePerson {
  function build(node: DescendantNode, isFocal: boolean): TreePerson {
    return {
      person: node.person,
      parents: [],
      children: node.children.map(c => build(c, false)),
      spouses: [],
      isFocal,
      hasMoreChildren: node.hasMoreChildren,
      coParentId: node.coParentId,
    };
  }
  return build(root, true);
}

export { PLACEHOLDER_PREFIX };
