import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchHourglassTreePerson,
  fetchHourglassTree,
  fetchDescendantTree,
  sortByBirthOldestFirst,
  _resetPhotoCacheForTests,
} from '../../src/renderer/utils/chartData';

vi.mock('../../src/renderer/utils/cropImage', () => ({
  cropImageToDataUrl: vi.fn(async (raw: string) => raw),
}));

/**
 * Build a fixture world where:
 *   - focal "F" has 4 siblings: S65 (1965), S70 (1970), Sx (no birth date), S73 (1973)
 *   - focal "F" has 3 children: Cx (no date), C90 (1990), C85 (1985)
 *   - focal has parents P1 (father) and P2 (mother) — needed so siblings are findable
 *
 * Sibling DB order (insertion / `id` order) deliberately scrambles birth order:
 *   S73, Sx, S65, S70  → after sort should be S65, S70, S73, Sx
 * Child DB order:
 *   Cx, C90, C85  → after sort should be C85, C90, Cx
 */

type Person = { id: string; sex: 'M' | 'F' | 'U'; living: boolean; birthDate: string | null; givenName: string };
const persons: Record<string, Person> = {
  F:   { id: 'F',   sex: 'M', living: true,  birthDate: '1968-01-01', givenName: 'Focal' },
  P1:  { id: 'P1',  sex: 'M', living: false, birthDate: '1940-01-01', givenName: 'Father' },
  P2:  { id: 'P2',  sex: 'F', living: false, birthDate: '1942-01-01', givenName: 'Mother' },
  S73: { id: 'S73', sex: 'M', living: true,  birthDate: '1973-01-01', givenName: 'Sibling73' },
  Sx:  { id: 'Sx',  sex: 'M', living: true,  birthDate: null,         givenName: 'SiblingNoDate' },
  S65: { id: 'S65', sex: 'M', living: true,  birthDate: '1965-01-01', givenName: 'Sibling65' },
  S70: { id: 'S70', sex: 'F', living: true,  birthDate: '1970-01-01', givenName: 'Sibling70' },
  Cx:  { id: 'Cx',  sex: 'F', living: true,  birthDate: null,         givenName: 'ChildNoDate' },
  C90: { id: 'C90', sex: 'M', living: true,  birthDate: '1990-01-01', givenName: 'Child90' },
  C85: { id: 'C85', sex: 'F', living: true,  birthDate: '1985-01-01', givenName: 'Child85' },
};

// parent_child rels: child id → ordered list of parent ids encountered (P1 first, then P2)
// We model rels via window.api.relationships.getForPerson returning rows where:
//   { type: 'parent_child', person1_id: parent, person2_id: child }
const childToParents: Record<string, string[]> = {
  F:   ['P1', 'P2'],
  S65: ['P1', 'P2'],
  S70: ['P1', 'P2'],
  Sx:  ['P1', 'P2'],
  S73: ['P1', 'P2'],
  Cx:  ['F'],
  C90: ['F'],
  C85: ['F'],
};

// Insertion order on each parent (this is what the chart sees as "id order"):
const parentToChildrenOrder: Record<string, string[]> = {
  P1: ['F', 'S73', 'Sx', 'S65', 'S70'],
  P2: ['F', 'S73', 'Sx', 'S65', 'S70'],
  F:  ['Cx', 'C90', 'C85'],
};

function relationsFor(personId: string): Array<{ type: string; person1_id: string | null; person2_id: string | null; subtype?: string }> {
  const rels: Array<{ type: string; person1_id: string | null; person2_id: string | null }> = [];
  // As a child:
  for (const parentId of childToParents[personId] ?? []) {
    rels.push({ type: 'parent_child', person1_id: parentId, person2_id: personId });
  }
  // As a parent:
  for (const childId of parentToChildrenOrder[personId] ?? []) {
    rels.push({ type: 'parent_child', person1_id: personId, person2_id: childId });
  }
  return rels;
}

function installApi(): void {
  const api = {
    persons: {
      get: vi.fn(async (id: string) => {
        const p = persons[id];
        if (!p) return null;
        return { id: p.id, sex: p.sex, living: p.living };
      }),
      getNames: vi.fn(async (id: string) => [
        { given_name: persons[id]?.givenName ?? id, surname: null, preferred_name: null, nickname: null, sort_order: 0, name_type: 'birth', date_from: null, id: id + '-n' },
      ]),
    },
    events: {
      forPerson: vi.fn(async (id: string) => {
        const p = persons[id];
        if (!p?.birthDate) return [];
        return [{ event_type: 'birth', date_value: p.birthDate, place_id: null }];
      }),
    },
    media: {
      profilePicRef: vi.fn(async () => null),
      readAsDataUrl: vi.fn(async () => null),
    },
    places: { get: vi.fn(async () => null) },
    relationships: {
      getForPerson: vi.fn(async (id: string) => relationsFor(id)),
    },
  };
  // @ts-expect-error — install mock on global window for module under test
  globalThis.window = { api };
}

describe('sortByBirthOldestFirst — pure helper', () => {
  it('orders dated items ascending and pushes undated ones to the end (PersonNode shape)', () => {
    const items = [
      { id: 'b', birthDate: '1973-01-01' },
      { id: 'c', birthDate: null },
      { id: 'a', birthDate: '1965-01-01' },
      { id: 'a2', birthDate: null },
      { id: 'd', birthDate: '1970-01-01' },
    ];
    const sorted = sortByBirthOldestFirst(items);
    expect(sorted.map(i => i.id)).toEqual(['a', 'd', 'b', 'a2', 'c']);
  });

  it('orders TreePerson-shaped items by their nested person.birthDate', () => {
    const items = [
      { person: { id: '2', birthDate: '1990-05-01' } },
      { person: { id: '1', birthDate: '1985-04-01' } },
      { person: { id: '3', birthDate: null } },
    ];
    const sorted = sortByBirthOldestFirst(items as never);
    expect(sorted.map(i => (i as { person: { id: string } }).person.id)).toEqual(['1', '2', '3']);
  });
});

describe('fetchHourglassTreePerson — siblings and children sorted oldest-first', async () => {
  beforeEach(() => {
    _resetPhotoCacheForTests();
    installApi();
  });

  it('siblings of focal appear in birth order (oldest left), undated last', async () => {
    const tree = await fetchHourglassTreePerson('F', 1, 1);
    const sibIds = (tree.siblings ?? []).map(s => s.person.id);
    expect(sibIds).toEqual(['S65', 'S70', 'S73', 'Sx']);
  });

  it("focal's children appear in birth order, undated last", async () => {
    const tree = await fetchHourglassTreePerson('F', 1, 1);
    const childIds = tree.children.map(c => c.person.id);
    expect(childIds).toEqual(['C85', 'C90', 'Cx']);
  });
});

describe('fetchHourglassTree — siblings and children sorted oldest-first', async () => {
  beforeEach(() => {
    _resetPhotoCacheForTests();
    installApi();
  });

  it('siblings sorted, descendantRoot.children sorted', async () => {
    const tree = await fetchHourglassTree('F');
    const sibIds = (tree.siblings ?? []).map(s => s.id);
    expect(sibIds).toEqual(['S65', 'S70', 'S73', 'Sx']);

    const childIds = tree.descendantRoot.children.map(c => c.person.id);
    expect(childIds).toEqual(['C85', 'C90', 'Cx']);
  });
});

describe('fetchDescendantTree — children sorted oldest-first at every depth', async () => {
  beforeEach(() => {
    _resetPhotoCacheForTests();
    installApi();
  });

  it("focal's children come back in birth order", async () => {
    const root = await fetchDescendantTree('F', 0, 2);
    expect(root.children.map(c => c.person.id)).toEqual(['C85', 'C90', 'Cx']);
  });
});
