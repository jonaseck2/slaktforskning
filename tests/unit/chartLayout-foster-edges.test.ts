// Foster parent_child edges render with a distinctive dash pattern, NOT solid.
//
// User goal (from docs/plans/2026-05-04-hourglass-chart-polish.md):
//   Foster relationships are distinguishable from biological at a glance —
//   the line connecting a foster parent and child is dashed, not solid.
//
// Mechanically: parent_child relationships with subtype === 'foster' are
// emitted as paths prefixed 'F:' so the renderer styles them differently.
// All other subtypes (biological, adopted, step, unknown, null) emit plain
// (un-prefixed) solid paths.

import { describe, it, expect } from 'vitest';
import { computeHourglassLayout, FOSTER_PATH_PREFIX } from '../../src/renderer/utils/chart-layout';
import type { PersonNode, TreePerson } from '../../src/renderer/utils/chart-layout';

function p(id: string, overrides: Partial<PersonNode> = {}): PersonNode {
  return {
    id, givenName: 'Test', surname: id, preferredName: null, nickname: null,
    sex: 'U', living: true, birthDate: null, deathDate: null,
    birthPlace: null, deathPlace: null, photoUrl: null,
    ...overrides,
  };
}

describe('foster parent_child edges render dashed', () => {
  it('focal F + foster child C → exactly one foster path emitted', () => {
    const tree: TreePerson = {
      person: p('focal', { sex: 'M' }),
      parents: [],
      spouses: [],
      children: [{
        person: p('child'),
        parents: [],
        children: [],
        spouses: [],
        parentSubtype: 'foster',
      }],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);
    const fosterPaths = layout.paths.filter(d => d.startsWith(FOSTER_PATH_PREFIX));
    expect(fosterPaths.length).toBe(1);
  });

  it('focal F + biological child C → no foster paths emitted (control)', () => {
    const tree: TreePerson = {
      person: p('focal', { sex: 'M' }),
      parents: [],
      spouses: [],
      children: [{
        person: p('child'),
        parents: [],
        children: [],
        spouses: [],
        parentSubtype: 'biological',
      }],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);
    const fosterPaths = layout.paths.filter(d => d.startsWith(FOSTER_PATH_PREFIX));
    expect(fosterPaths.length).toBe(0);
  });

  it('focal F + child C with no parentSubtype → no foster paths (null is solid)', () => {
    const tree: TreePerson = {
      person: p('focal', { sex: 'M' }),
      parents: [],
      spouses: [],
      children: [{
        person: p('child'),
        parents: [],
        children: [],
        spouses: [],
      }],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);
    const fosterPaths = layout.paths.filter(d => d.startsWith(FOSTER_PATH_PREFIX));
    expect(fosterPaths.length).toBe(0);
  });

  it('focal F + foster parent P (ancestor side) → exactly one foster path emitted', () => {
    const tree: TreePerson = {
      person: p('focal', { sex: 'M' }),
      parents: [{
        person: p('fosterParent', { sex: 'M' }),
        parents: [],
        children: [],
        spouses: [],
        parentSubtype: 'foster',
      }],
      spouses: [],
      children: [],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);
    const fosterPaths = layout.paths.filter(d => d.startsWith(FOSTER_PATH_PREFIX));
    expect(fosterPaths.length).toBe(1);
  });

  it('mixed: bio child + foster child + adopted child → exactly one foster path', () => {
    const tree: TreePerson = {
      person: p('focal', { sex: 'M' }),
      parents: [],
      spouses: [],
      children: [
        { person: p('bio'), parents: [], children: [], spouses: [], parentSubtype: 'biological' },
        { person: p('foster'), parents: [], children: [], spouses: [], parentSubtype: 'foster' },
        { person: p('adopt'), parents: [], children: [], spouses: [], parentSubtype: 'adopted' },
      ],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);
    const fosterPaths = layout.paths.filter(d => d.startsWith(FOSTER_PATH_PREFIX));
    const otherChildPaths = layout.paths.filter(d => !d.startsWith(FOSTER_PATH_PREFIX) && !d.startsWith('D:'));
    expect(fosterPaths.length).toBe(1);
    // bio + adopted are solid: at least 2 non-foster, non-placeholder connectors.
    expect(otherChildPaths.length).toBeGreaterThanOrEqual(2);
  });
});
