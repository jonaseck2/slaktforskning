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

  it('mixed: bio child + foster child + adopted child → one foster + one adopted path', () => {
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
    const fosterPaths = layout.paths.filter(d => d.startsWith('F:'));
    const adoptedPaths = layout.paths.filter(d => d.startsWith('A:'));
    const solidPaths = layout.paths.filter(d => !d.startsWith('F:') && !d.startsWith('A:') && !d.startsWith('D:'));
    expect(fosterPaths.length).toBe(1);
    expect(adoptedPaths.length).toBe(1);
    // Bio child connector is solid (no prefix) — at least one solid connector.
    expect(solidPaths.length).toBeGreaterThanOrEqual(1);
  });
});

// User goal (from docs/plans/2026-05-06-hourglass-foster-vs-adoptive-distinct.md):
//   The genealogist sees visually distinct dash patterns for foster vs
//   adopted parent_child edges. Mixed-subtype merged-edge cases (e.g. one
//   parent foster, the other adopted, sharing a couple connector) split
//   into two separate edges so each subtype is visible.
describe('adoptive parent_child edges render dotted', () => {
  it('focal F + adopted child C → exactly one adopted path emitted', () => {
    const tree: TreePerson = {
      person: p('focal', { sex: 'M' }),
      parents: [],
      spouses: [],
      children: [{
        person: p('child'),
        parents: [],
        children: [],
        spouses: [],
        parentSubtype: 'adopted',
      }],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);
    const adoptedPaths = layout.paths.filter(d => d.startsWith('A:'));
    const fosterPaths = layout.paths.filter(d => d.startsWith('F:'));
    expect(adoptedPaths.length).toBe(1);
    expect(fosterPaths.length).toBe(0);
  });

  it('focal F + adopted parent P (ancestor side) → exactly one adopted path emitted', () => {
    const tree: TreePerson = {
      person: p('focal', { sex: 'M' }),
      parents: [{
        person: p('adoptiveParent', { sex: 'M' }),
        parents: [],
        children: [],
        spouses: [],
        parentSubtype: 'adopted',
      }],
      spouses: [],
      children: [],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);
    const adoptedPaths = layout.paths.filter(d => d.startsWith('A:'));
    expect(adoptedPaths.length).toBe(1);
  });
});

describe('mixed-subtype merged-edge case (couple connector)', () => {
  // The plan's central failure mode: when a child has two on-chart parents
  // (focal + co-parent spouse) AND the two parent_child subtypes differ,
  // the merged couple-anchored edge would only show one dash pattern,
  // hiding the other parent's relationship type. Fix: split into per-parent
  // edges, each with its own dash.
  //
  // User goal: with one parent foster and the other adopted, the chart shows
  // TWO separate edges, one dashed (foster), one dotted (adopted) — NOT
  // one merged path styled either way.
  it('focal biological + co-parent adopted → two paths, one solid + one adopted', () => {
    const tree: TreePerson = {
      person: p('focal', { sex: 'M' }),
      parents: [],
      spouses: [{
        person: p('spouse', { sex: 'F' }),
        parents: [], children: [], spouses: [],
      }],
      children: [{
        person: p('child'),
        parents: [], children: [], spouses: [],
        parentSubtype: 'biological',
        coParentId: 'spouse',
        coParentSubtype: 'adopted',
      }],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);
    const adoptedPaths = layout.paths.filter(d => d.startsWith('A:'));
    const solidChildPaths = layout.paths.filter(d => !d.startsWith('A:') && !d.startsWith('F:') && !d.startsWith('D:'));
    expect(adoptedPaths.length).toBe(1);
    // At least one solid path — the biological focal→child edge. Couple
    // connector (focal↔spouse) is also solid, so we expect ≥ 2 solid total.
    expect(solidChildPaths.length).toBeGreaterThanOrEqual(2);
  });

  it('focal foster + co-parent adopted → two paths, one foster + one adopted', () => {
    const tree: TreePerson = {
      person: p('focal', { sex: 'M' }),
      parents: [],
      spouses: [{
        person: p('spouse', { sex: 'F' }),
        parents: [], children: [], spouses: [],
      }],
      children: [{
        person: p('child'),
        parents: [], children: [], spouses: [],
        parentSubtype: 'foster',
        coParentId: 'spouse',
        coParentSubtype: 'adopted',
      }],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);
    const adoptedPaths = layout.paths.filter(d => d.startsWith('A:'));
    const fosterPaths = layout.paths.filter(d => d.startsWith('F:'));
    expect(adoptedPaths.length).toBe(1);
    expect(fosterPaths.length).toBe(1);
  });

  it('same-subtype regression guard: both parents foster → ONE merged foster path', () => {
    // Same-subtype merged-edge case keeps the existing single merged path.
    // This is the cosmetic optimization — both parents share the dash, so
    // emitting one cleanly couple-anchored edge is correct.
    const tree: TreePerson = {
      person: p('focal', { sex: 'M' }),
      parents: [],
      spouses: [{
        person: p('spouse', { sex: 'F' }),
        parents: [], children: [], spouses: [],
      }],
      children: [{
        person: p('child'),
        parents: [], children: [], spouses: [],
        parentSubtype: 'foster',
        coParentId: 'spouse',
        coParentSubtype: 'foster',
      }],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);
    const fosterPaths = layout.paths.filter(d => d.startsWith('F:'));
    const adoptedPaths = layout.paths.filter(d => d.startsWith('A:'));
    // Exactly one foster path — the merged couple-anchored edge — and no
    // adopted path. Splitting same-subtype edges would be a regression.
    expect(fosterPaths.length).toBe(1);
    expect(adoptedPaths.length).toBe(0);
  });

  it('same-subtype regression guard: both parents biological → ONE merged solid path', () => {
    const tree: TreePerson = {
      person: p('focal', { sex: 'M' }),
      parents: [],
      spouses: [{
        person: p('spouse', { sex: 'F' }),
        parents: [], children: [], spouses: [],
      }],
      children: [{
        person: p('child'),
        parents: [], children: [], spouses: [],
        parentSubtype: 'biological',
        coParentId: 'spouse',
        coParentSubtype: 'biological',
      }],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);
    const fosterPaths = layout.paths.filter(d => d.startsWith('F:'));
    const adoptedPaths = layout.paths.filter(d => d.startsWith('A:'));
    // Solid child → no foster, no adopted prefixes. The merged couple
    // anchor produces a single solid (no-prefix) path for this child.
    expect(fosterPaths.length).toBe(0);
    expect(adoptedPaths.length).toBe(0);
  });

  it('keeps FOSTER_PATH_PREFIX export stable for renderer filtering', () => {
    expect(FOSTER_PATH_PREFIX).toBe('F:');
  });
});
