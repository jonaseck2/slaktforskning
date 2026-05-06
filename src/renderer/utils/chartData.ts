// src/renderer/utils/chartData.ts
// Fetches PersonNode trees from window.api for use by chart components.

import type { PersonNode, PedigreeTree, HourglassTree, TimelineEntry, DescendantNode, TreePerson } from './chart-layout';
import { cropImageToDataUrl, type RegionFrac } from './cropImage';

type RawPerson  = { id: string; sex: string; living: boolean };
type RawName    = { id: string; given_name: string | null; surname: string | null; preferred_name: string | null; nickname: string | null; sort_order: number; name_type: string; date_from: string | null };
type RawEvent   = { event_type: string; date_value: string | null; place_id?: string | null };
type RawRel     = { type: string; person1_id: string | null; person2_id: string | null; subtype?: string | null };

type ParentSubtype = 'biological' | 'adopted' | 'foster' | 'step' | 'unknown' | null;

/** Coerce `relationships.subtype` from a raw row into the typed enum. */
function coerceParentSubtype(value: string | null | undefined): ParentSubtype {
  if (value == null) return null;
  if (value === 'biological' || value === 'adopted' || value === 'foster' || value === 'step' || value === 'unknown') {
    return value;
  }
  return null;
}
type RawPlace   = { id: string; name: string };
type ProfilePicRef = { mediaId: string; region: RegionFrac | null };

// Session cache: person id → cropped face data URL (or null if no profile pic).
// Trees show the *tagged face*, not the raw media — so we cache the cropped result
// per person. Same photo shared across persons gets fetched once but cropped per person.
const personPhotoCache = new Map<string, string | null>();
// Inner cache: media id → raw image data URL. Lets us avoid re-fetching the same
// photo when several siblings share one family portrait — but the cropped result
// (which is what trees actually render) is keyed per person above.
const rawMediaCache = new Map<string, string | null>();

/** Test hook — reset module-level caches between test cases. */
export function _resetPhotoCacheForTests(): void {
  personPhotoCache.clear();
  rawMediaCache.clear();
}

/**
 * Drop the cached cropped photo for a person so the next chart load refetches.
 * Called by the profilePic store on invalidation so list/panel avatars and
 * tree boxes stay in sync after a profile-pic change.
 */
export function invalidatePersonPhoto(personId: string): void {
  personPhotoCache.delete(personId);
}

export function invalidateAllPersonPhotos(): void {
  personPhotoCache.clear();
  rawMediaCache.clear();
}

/**
 * Pick the displayed primary name. Mirrors `displayedNameIdSql` in
 * src/api/persons.ts: latest non-null effective date_from wins, then highest
 * sort_order, then id. For `birth` names the effective date_from is the birth
 * event's date_value if any.
 */
function pickDisplayedNameLocal(names: RawName[], events: RawEvent[]): RawName | null {
  if (names.length === 0) return null;
  const dated = events.filter(e => e.event_type === 'birth' && e.date_value && e.date_value.length > 0);
  dated.sort((a, b) => (a.date_value ?? '').localeCompare(b.date_value ?? ''));
  const birthDate = dated[0]?.date_value ?? null;
  function effective(n: RawName): string | null {
    if (n.name_type === 'birth') return birthDate ?? n.date_from ?? null;
    return n.date_from ?? null;
  }
  return [...names].sort((a, b) => {
    const ea = effective(a);
    const eb = effective(b);
    if (ea && eb) {
      if (ea !== eb) return eb.localeCompare(ea);
    } else if (ea && !eb) {
      return -1;
    } else if (!ea && eb) {
      return 1;
    }
    if (a.sort_order !== b.sort_order) return b.sort_order - a.sort_order;
    return a.id.localeCompare(b.id);
  })[0];
}

async function resolvePersonPhotoUrl(personId: string): Promise<string | null> {
  if (personPhotoCache.has(personId)) return personPhotoCache.get(personId) ?? null;
  const ref = (await window.api.media.profilePicRef(personId)) as ProfilePicRef | null;
  // Avatar fallback chain (shared with profilePic store):
  //   1. Face-tagged region (any media) → cropped face
  //   2. Starred linked media (first by sort_order) → raw image
  //   3. Else null → initials placeholder
  if (!ref) {
    personPhotoCache.set(personId, null);
    return null;
  }
  let raw = rawMediaCache.get(ref.mediaId) ?? null;
  if (raw === null && !rawMediaCache.has(ref.mediaId)) {
    raw = ((await window.api.media.readAsDataUrl(ref.mediaId)) as string | null) ?? null;
    if (raw !== null) rawMediaCache.set(ref.mediaId, raw);
  }
  if (!raw) {
    // Don't poison the cache permanently — a missing file may come back later.
    return null;
  }
  if (!ref.region) {
    personPhotoCache.set(personId, raw);
    return raw;
  }
  try {
    const cropped = await cropImageToDataUrl(raw, ref.region);
    personPhotoCache.set(personId, cropped);
    return cropped;
  } catch {
    return null;
  }
}

/**
 * Sort siblings / children oldest-first by birthDate.
 * - Items WITH a birthDate sort first, ascending lexicographically (ISO dates sort correctly).
 * - Items WITHOUT a birthDate sort to the right of all dated items, ordered by id among themselves.
 *
 * Pure: returns a new array; does not mutate the input. Stable for equal keys.
 *
 * Accepts both shapes used in this module:
 *   - PersonNode-shaped (`{ id, birthDate }`)
 *   - TreePerson-shaped (`{ person: { id, birthDate } }`)
 */
export function sortByBirthOldestFirst<T extends { birthDate?: string | null; id?: string } | { person: { birthDate: string | null; id: string } }>(
  items: readonly T[],
): T[] {
  function key(item: T): { birth: string | null; id: string } {
    if ('person' in item && item.person) {
      return { birth: item.person.birthDate ?? null, id: item.person.id };
    }
    const flat = item as { birthDate?: string | null; id?: string };
    return { birth: flat.birthDate ?? null, id: flat.id ?? '' };
  }
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka.birth && kb.birth) {
      if (ka.birth !== kb.birth) return ka.birth < kb.birth ? -1 : 1;
      return ka.id.localeCompare(kb.id);
    }
    if (ka.birth && !kb.birth) return -1;  // dated wins, dated goes left
    if (!ka.birth && kb.birth) return 1;
    // Both undated → by id
    return ka.id.localeCompare(kb.id);
  });
}

export async function fetchPersonNode(id: string): Promise<PersonNode> {
  const [person, names, events] = await Promise.all([
    window.api.persons.get(id),
    window.api.persons.getNames(id),
    window.api.events.forPerson(id),
  ]) as [RawPerson | null, RawName[], RawEvent[]];

  if (!person) throw new Error(`Person not found: ${id}`);
  const birthEvent = events.find(e => e.event_type === 'birth');
  const deathEvent = events.find(e => e.event_type === 'death');
  const primary = pickDisplayedNameLocal(names, events)
    ?? { given_name: null, surname: null, preferred_name: null, nickname: null };

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

  const photoUrl = await resolvePersonPhotoUrl(id);

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
    return { person: node, children: sortByBirthOldestFirst(children), hasMoreChildren: false };
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

      return { ...node, children: sortByBirthOldestFirst(children), hasMoreChildren: false };
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

  const siblings = sortByBirthOldestFirst(
    await Promise.all([...siblingIdSet].map(fetchPersonNode)),
  );

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
    annotatedRoot = { ...descendantRoot, children: sortByBirthOldestFirst(annotatedChildren) };
  } else {
    // No annotation needed; still ensure siblings (children of the focal) are birth-sorted.
    annotatedRoot = { ...descendantRoot, children: sortByBirthOldestFirst(descendantRoot.children) };
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

  /** Recursively build ancestors as TreePerson (supports N parents).
   *  Parents carry the subtype of the parent_child relationship that links
   *  them to `personId` (so foster parents can render dashed). */
  async function buildAncestors(personId: string, depth: number): Promise<TreePerson> {
    const node = await fetchPersonNode(personId);
    const rels = (await window.api.relationships.getForPerson(personId)) as RawRel[];
    const spouses = await fetchSpouses(personId);

    if (depth >= ancestorDepth) {
      const hasMore = rels.some(r => r.type === 'parent_child' && r.person2_id === personId && r.person1_id !== null);
      return { person: node, parents: [], children: [], spouses, hasMoreAncestors: hasMore };
    }

    const parentRels = rels.filter(r => r.type === 'parent_child' && r.person2_id === personId && r.person1_id !== null);
    const subtypeByParentId = new Map<string, ParentSubtype>();
    for (const r of parentRels) {
      if (r.person1_id) subtypeByParentId.set(r.person1_id, coerceParentSubtype(r.subtype ?? null));
    }
    let parentIds = parentRels.map(r => r.person1_id!).filter((id): id is string => id !== null);

    if (parentIds.length >= 2) {
      const sexes = await Promise.all(
        parentIds.map(pid => (window.api.persons.get(pid) as Promise<{ sex: string } | null>)),
      );
      parentIds = sortParentIds(parentIds, sexes);
    }

    const parents = await Promise.all(parentIds.map(async (pid) => {
      const tp = await buildAncestors(pid, depth + 1);
      tp.parentSubtype = subtypeByParentId.get(pid) ?? null;
      return tp;
    }));
    return { person: node, parents, children: [], spouses };
  }

  /** Recursively build descendants as TreePerson (with spouses).
   *  Each child carries the subtype of the parent_child relationship that
   *  links it to `personId` (so foster children can render dashed). */
  async function buildDescendants(personId: string, depth: number, isFocal: boolean): Promise<TreePerson> {
    const node = await fetchPersonNode(personId);
    const rels = (await window.api.relationships.getForPerson(personId)) as RawRel[];
    const spouses = isFocal ? [] : await fetchSpouses(personId);

    if (depth >= descendantDepth) {
      const hasMore = rels.some(r => r.type === 'parent_child' && r.person1_id === personId && r.person2_id !== null);
      return { person: node, parents: [], children: [], spouses, hasMoreChildren: hasMore, isFocal };
    }

    const childRels = rels.filter(r => r.type === 'parent_child' && r.person1_id === personId && r.person2_id !== null);
    const subtypeByChildId = new Map<string, ParentSubtype>();
    for (const r of childRels) {
      if (r.person2_id) subtypeByChildId.set(r.person2_id, coerceParentSubtype(r.subtype ?? null));
    }
    const childIds = childRels.map(r => r.person2_id!).filter((id): id is string => id !== null);

    const children = await Promise.all(childIds.map(async (cid) => {
      const tp = await buildDescendants(cid, depth + 1, false);
      tp.parentSubtype = subtypeByChildId.get(cid) ?? null;
      return tp;
    }));

    return { person: node, parents: [], children: sortByBirthOldestFirst(children), spouses, isFocal };
  }

  // Build ancestor parents — capture subtype on each from the focal's
  // parent_child relationships so foster parents render dashed.
  const focalParentSubtypeById = new Map<string, ParentSubtype>();
  for (const r of focalRels) {
    if (r.type === 'parent_child' && r.person2_id === focalId && r.person1_id) {
      focalParentSubtypeById.set(r.person1_id, coerceParentSubtype(r.subtype ?? null));
    }
  }
  let parentIds = [...focalParentIds];
  if (parentIds.length >= 2) {
    const sexes = await Promise.all(
      parentIds.map(pid => (window.api.persons.get(pid) as Promise<{ sex: string } | null>)),
    );
    parentIds = sortParentIds(parentIds, sexes);
  }

  const parents = await Promise.all(parentIds.map(async (pid) => {
    const tp = await buildAncestors(pid, 1);
    tp.parentSubtype = focalParentSubtypeById.get(pid) ?? null;
    return tp;
  }));

  // Descendant children — capture subtype keyed by child id (from focal-side rels).
  const focalChildSubtypeById = new Map<string, ParentSubtype>();
  for (const r of focalRels) {
    if (r.type === 'parent_child' && r.person1_id === focalId && r.person2_id) {
      focalChildSubtypeById.set(r.person2_id, coerceParentSubtype(r.subtype ?? null));
    }
  }
  const childIds = focalRels
    .filter(r => r.type === 'parent_child' && r.person1_id === focalId)
    .map(r => r.person2_id)
    .filter((id): id is string => id !== null);

  // Focal spouses. Dedup against `treePersonIds` so a partner who already
  // appears elsewhere in the tree (e.g. as a sibling-in-law's partner, or
  // as a niece picked up via descendant collection) doesn't get rendered
  // twice. Add the kept ids to `treePersonIds` so subsequent fetches in
  // this build (children's coParentId resolution, sibling spouses) don't
  // re-introduce them. Tree-walk order: ancestors → descendants → siblings
  // → focal spouses; the first occurrence wins.
  const spouseIds = focalRels
    .filter(r => r.type === 'couple')
    .map(r => (r.person1_id === focalId ? r.person2_id : r.person1_id))
    .filter((id): id is string => id !== null && id !== focalId && !treePersonIds.has(id));
  for (const sid of spouseIds) treePersonIds.add(sid);
  const spouseIdSet = new Set(spouseIds);

  const spouses = await Promise.all(spouseIds.map(async (id) => ({
    person: await fetchPersonNode(id),
    parents: [],
    children: [],
    spouses: [],
  })));

  // Build children with coParentId annotation
  const childrenUnsorted = await Promise.all(childIds.map(async (cid) => {
    const child = await buildDescendants(cid, 1, false);
    const childRels = (await window.api.relationships.getForPerson(cid)) as RawRel[];
    const coParentId = childRels
      .filter(r => r.type === 'parent_child' && r.person2_id === cid && r.person1_id !== focalId)
      .map(r => r.person1_id)
      .find(pid => pid !== null && spouseIdSet.has(pid!)) ?? null;
    child.coParentId = coParentId;
    child.parentSubtype = focalChildSubtypeById.get(cid) ?? null;
    return child;
  }));
  const children = sortByBirthOldestFirst(childrenUnsorted);

  // Siblings (with their spouses)
  const siblingsUnsorted: TreePerson[] = await Promise.all([...siblingIdSet].map(async (id) => {
    const spouses = await fetchSpouses(id);
    return {
      person: await fetchPersonNode(id),
      parents: [],
      children: [],
      spouses,
    };
  }));
  const siblings = sortByBirthOldestFirst(siblingsUnsorted);

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
      const parentRels = rels.filter(r => r.type === 'parent_child' && r.person2_id === targetPersonId && r.person1_id !== null);
      const subtypeByParentId = new Map<string, ParentSubtype>();
      for (const r of parentRels) {
        if (r.person1_id) subtypeByParentId.set(r.person1_id, coerceParentSubtype(r.subtype ?? null));
      }
      const parentIds = parentRels
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
        return {
          person: pNode,
          parents: [],
          children: [],
          spouses,
          hasMoreAncestors: hasMore,
          parentSubtype: subtypeByParentId.get(pid) ?? null,
        } as TreePerson;
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
      const childRels = rels.filter(r => r.type === 'parent_child' && r.person1_id === targetPersonId && r.person2_id !== null);
      const subtypeByChildId = new Map<string, ParentSubtype>();
      for (const r of childRels) {
        if (r.person2_id) subtypeByChildId.set(r.person2_id, coerceParentSubtype(r.subtype ?? null));
      }
      const childIds = childRels
        .map(r => r.person2_id)
        .filter((id): id is string => id !== null);

      const children = await Promise.all(childIds.map(async (cid) => {
        const [childNode, cRels] = await Promise.all([
          fetchPersonNode(cid),
          window.api.relationships.getForPerson(cid) as Promise<RR[]>,
        ]);
        const hasMore = cRels.some(
          r => r.type === 'parent_child' && r.person1_id === cid && r.person2_id !== null,
        );
        // Fetch spouses for each new child
        const spouseIds = cRels
          .filter(r => r.type === 'couple')
          .map(r => (r.person1_id === cid ? r.person2_id : r.person1_id))
          .filter((id): id is string => id !== null && id !== cid);
        const spouses: TreePerson[] = await Promise.all(spouseIds.map(async (sid) => ({
          person: await fetchPersonNode(sid),
          parents: [], children: [], spouses: [],
        })));
        return {
          person: childNode,
          parents: [],
          children: [],
          spouses,
          hasMoreChildren: hasMore,
          parentSubtype: subtypeByChildId.get(cid) ?? null,
        } as TreePerson;
      }));

      return { ...node, children: sortByBirthOldestFirst(children), hasMoreChildren: false };
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

export async function fetchTimelineEntries(focalId: string, generations = 1): Promise<TimelineEntry[]> {
  const included = new Set<string>([focalId]);
  let frontier = new Set<string>([focalId]);

  for (let g = 1; g <= generations; g++) {
    const next = new Set<string>();
    await Promise.all([...frontier].map(async (id) => {
      const rels = (await window.api.relationships.getForPerson(id)) as RawRel[];
      for (const r of rels) {
        if (r.type !== 'parent_child' && r.type !== 'couple') continue;
        const other = r.person1_id === id ? r.person2_id : r.person2_id === id ? r.person1_id : null;
        if (other && !included.has(other)) {
          included.add(other);
          next.add(other);
        }
      }
    }));
    if (next.size === 0) break;
    frontier = next;
  }

  const results = await Promise.all(
    [...included].map(async (id) => {
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
