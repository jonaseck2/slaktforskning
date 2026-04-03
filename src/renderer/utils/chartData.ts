// src/renderer/utils/chartData.ts
// Fetches PersonNode trees from window.api for use by chart components.

import type { PersonNode, PedigreeTree, HourglassTree, TimelineEntry, DescendantNode } from './chartLayout';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

type RawPerson  = { id: string; sex: string; living: boolean };
type RawName    = { given_name: string | null; surname: string | null; preferred_name: string | null; sort_order: number };
type RawEvent   = { event_type: string; date_value: string | null };
type RawRel     = { type: string; person1_id: string | null; person2_id: string | null };

function extractYear(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = v.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

export async function fetchPersonNode(id: string): Promise<PersonNode> {
  const [person, names, events] = await Promise.all([
    window.api.persons.get(id),
    window.api.persons.getNames(id),
    window.api.events.forPerson(id),
  ]) as [RawPerson | null, RawName[], RawEvent[]];

  if (!person) throw new Error(`Person not found: ${id}`);
  const primary = [...names].sort((a, b) => a.sort_order - b.sort_order)[0]
    ?? { given_name: null, surname: null, preferred_name: null };

  return {
    id,
    givenName: primary.given_name,
    surname: primary.surname,
    preferredName: primary.preferred_name ?? null,
    sex: person.sex as 'M' | 'F' | 'U',
    living: Boolean(person.living),
    birthYear: extractYear(events.find(e => e.event_type === 'birth')?.date_value),
    deathYear: extractYear(events.find(e => e.event_type === 'death')?.date_value),
  };
}

/**
 * Fetch an ahnentafel ancestor tree up to `generations` levels (including focal).
 * Default: 5 generations (focal + 4 ancestor levels = up to 16 great-great-grandparents).
 */
export async function fetchPedigreeTree(focalId: string, generations = 5): Promise<PedigreeTree> {
  const nodes = new Map<number, PersonNode>();

  async function fetchAncestors(personId: string, ahnNum: number, gen: number): Promise<void> {
    if (gen < generations) {
      const [node, rawRels] = await Promise.all([
        fetchPersonNode(personId),
        window.api.relationships.getForPerson(personId),
      ]) as [PersonNode, RawRel[]];

      nodes.set(ahnNum, node);

      const parentIds = rawRels
        .filter(r => r.type === 'parent_child' && r.person2_id === personId)
        .map(r => r.person1_id)
        .filter((id): id is string => id !== null)
        .slice(0, 2);

      await Promise.all(parentIds.map((pid, i) => fetchAncestors(pid, ahnNum * 2 + i, gen + 1)));
    } else {
      nodes.set(ahnNum, await fetchPersonNode(personId));
    }
  }

  await fetchAncestors(focalId, 1, 1);
  return { nodes, generations };
}

/**
 * Fetch a descendant tree up to `maxDepth` levels below the given person.
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
    return { person: node, children };
  } else {
    return { person: await fetchPersonNode(personId), children: [] };
  }
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

  return { ancestors, descendantRoot, descendantGenerations: 3, spouses };
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
