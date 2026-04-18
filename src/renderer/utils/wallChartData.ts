// src/renderer/utils/wallChartData.ts
// Fetches tree data from window.api and converts to WallChartPerson trees.

import type { WallChartPerson, WallChartAncestorTree, WallChartDescendantTree } from '../../api/wall-charts';

type RawPerson = { id: string; sex: string; living: boolean };
type RawName = { given_name: string | null; surname: string | null; preferred_name: string | null; sort_order: number };
type RawEvent = { event_type: string; date_value: string | null; place_id: string | null };
type RawRel = { type: string; person1_id: string | null; person2_id: string | null };

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

async function fetchWallChartPerson(id: string): Promise<WallChartPerson> {
  const [person, names, events] = await Promise.all([
    window.api.persons.get(id),
    window.api.persons.getNames(id),
    window.api.events.forPerson(id),
  ]) as [RawPerson | null, RawName[], RawEvent[]];

  if (!person) throw new Error(`Person not found: ${id}`);

  const primary = [...names].sort((a, b) => a.sort_order - b.sort_order)[0]
    ?? { given_name: null, surname: null, preferred_name: null };

  const birth = events.find(e => e.event_type === 'birth');
  const death = events.find(e => e.event_type === 'death');

  let birthPlace: string | null = null;
  let deathPlace: string | null = null;
  if (birth?.place_id) {
    try {
      const place = await window.api.places.get(birth.place_id) as { name: string } | null;
      birthPlace = place?.name ?? null;
    } catch { /* ignore */ }
  }
  if (death?.place_id) {
    try {
      const place = await window.api.places.get(death.place_id) as { name: string } | null;
      deathPlace = place?.name ?? null;
    } catch { /* ignore */ }
  }

  return {
    id,
    givenName: primary.preferred_name ?? primary.given_name,
    surname: primary.surname,
    sex: person.sex as 'M' | 'F' | 'U',
    birthDate: birth?.date_value ?? null,
    deathDate: death?.date_value ?? null,
    birthPlace,
    deathPlace,
    photoBase64: null, // TODO: photo embedding in future iteration
  };
}

export async function fetchWallChartAncestorTree(
  personId: string,
  maxGenerations: number,
  currentGen = 0,
): Promise<WallChartAncestorTree> {
  const person = await fetchWallChartPerson(personId);

  if (currentGen >= maxGenerations - 1) {
    return { person, father: null, mother: null };
  }

  const rawRels = (await window.api.relationships.getForPerson(personId)) as RawRel[];
  let parentIds = rawRels
    .filter(r => r.type === 'parent_child' && r.person2_id === personId)
    .map(r => r.person1_id)
    .filter((id): id is string => id !== null)
    .slice(0, 2);

  // Sort: male → father slot, female → mother slot
  if (parentIds.length === 2) {
    const sexes = await Promise.all(
      parentIds.map(pid => window.api.persons.get(pid) as Promise<{ sex: string } | null>),
    );
    if (sexes[0]?.sex === 'F' && sexes[1]?.sex !== 'F') {
      parentIds = [parentIds[1], parentIds[0]];
    }
  }

  const father = parentIds[0]
    ? await fetchWallChartAncestorTree(parentIds[0], maxGenerations, currentGen + 1)
    : null;
  const mother = parentIds[1]
    ? await fetchWallChartAncestorTree(parentIds[1], maxGenerations, currentGen + 1)
    : null;

  return { person, father, mother };
}

export async function fetchWallChartDescendantTree(
  personId: string,
  maxGenerations: number,
  currentGen = 0,
): Promise<WallChartDescendantTree> {
  const person = await fetchWallChartPerson(personId);

  if (currentGen >= maxGenerations) {
    return { person, children: [] };
  }

  const rawRels = (await window.api.relationships.getForPerson(personId)) as RawRel[];
  const childIds = rawRels
    .filter(r => r.type === 'parent_child' && r.person1_id === personId)
    .map(r => r.person2_id)
    .filter((id): id is string => id !== null);

  const children = await Promise.all(
    childIds.map(cid => fetchWallChartDescendantTree(cid, maxGenerations, currentGen + 1)),
  );

  return { person, children };
}
