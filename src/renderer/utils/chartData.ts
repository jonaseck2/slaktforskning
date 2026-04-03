// src/renderer/utils/chartData.ts
// Fetches PersonNode trees from window.api for use by chart components.

import type { PersonNode, PedigreeTree, HourglassTree, TimelineEntry } from './chartLayout';

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

export async function fetchPedigreeTree(focalId: string): Promise<PedigreeTree> {
  const [focal, rawRels] = await Promise.all([
    fetchPersonNode(focalId),
    window.api.relationships.getForPerson(focalId),
  ]) as [PersonNode, RawRel[]];

  // Parents: parent_child rels where focal is person2 (the child)
  const parentIds = rawRels
    .filter(r => r.type === 'parent_child' && r.person2_id === focalId)
    .map(r => r.person1_id)
    .filter((id): id is string => id !== null)
    .slice(0, 2);

  const parents = (await Promise.all([
    parentIds[0] ? fetchPersonNode(parentIds[0]) : null,
    parentIds[1] ? fetchPersonNode(parentIds[1]) : null,
  ])) as [PersonNode | null, PersonNode | null];

  const gpPairs = await Promise.all(
    parents.map(async (parent): Promise<[PersonNode | null, PersonNode | null]> => {
      if (!parent) return [null, null];
      const pRels = (await window.api.relationships.getForPerson(parent.id)) as RawRel[];
      const gpIds = pRels
        .filter(r => r.type === 'parent_child' && r.person2_id === parent.id)
        .map(r => r.person1_id)
        .filter((id): id is string => id !== null)
        .slice(0, 2);
      return [
        gpIds[0] ? await fetchPersonNode(gpIds[0]) : null,
        gpIds[1] ? await fetchPersonNode(gpIds[1]) : null,
      ];
    })
  );

  return {
    focal,
    parents,
    grandparents: [...gpPairs[0], ...gpPairs[1]] as [
      PersonNode | null, PersonNode | null, PersonNode | null, PersonNode | null,
    ],
  };
}

export async function fetchHourglassTree(focalId: string): Promise<HourglassTree> {
  const [pedigree, rawRels] = await Promise.all([
    fetchPedigreeTree(focalId),
    window.api.relationships.getForPerson(focalId),
  ]) as [PedigreeTree, RawRel[]];

  // Children: parent_child rels where focal is person1 (the parent)
  const childIds = rawRels
    .filter(r => r.type === 'parent_child' && r.person1_id === focalId)
    .map(r => r.person2_id)
    .filter((id): id is string => id !== null);

  const children = await Promise.all(childIds.map(fetchPersonNode));
  return { ...pedigree, children };
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
