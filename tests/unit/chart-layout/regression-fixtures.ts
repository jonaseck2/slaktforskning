// Deliberately-broken ChartLayout fixtures.
//
// Each fixture violates exactly one property the assertion library protects.
// The tests in chartLayout.test.ts under "Property assertions catch regressions"
// confirm that the property suite throws with a named, fixture-specific error
// message — this is how the property suite earns its keep: when a future
// layout regression introduces an overlap, a reversed parent edge, or a
// broken generation row, the test that fires names the specific boxes.
//
// These are constructed by hand (no PersonNode realism beyond required
// fields) and never pass through the real layout algorithm.

import type { ChartLayout, PersonNode, BoxLayout } from '../../../src/renderer/utils/chart-layout/types';

function p(id: string, sex: PersonNode['sex'] = 'U'): PersonNode {
  return {
    id,
    givenName: 'Test',
    surname: 'Person',
    preferredName: null,
    nickname: null,
    sex,
    living: true,
    birthDate: null,
    deathDate: null,
    birthPlace: null,
    deathPlace: null,
    photoUrl: null,
  };
}

function box(id: string, x: number, y: number, w = 80, h = 40, isFocal = false): BoxLayout {
  return { person: p(id), isFocal, x, y, w, h };
}

function emptyLayoutFields() {
  return {
    paths: [] as string[],
    svgWidth: 1000,
    svgHeight: 800,
    viewBoxMinY: 0,
    collapseButtons: [],
    placeholders: [],
    placeholderLines: [],
  };
}

/**
 * Two boxes whose extents intersect — A at (100,100) and B at (110,110), both
 * 80x40. assertNoOverlaps must fire with both ids in the message.
 */
export const overlapFixture: ChartLayout = {
  boxes: [box('A', 100, 100), box('B', 110, 110)],
  lines: [],
  ...emptyLayoutFields(),
};

/**
 * A pedigree-style edge where the parent is to the LEFT of the child (wrong
 * direction — in pedigree, ancestors live to the right). assertParentDirection
 * called with chartType='pedigree' and the edge {parent:'parent', child:'child'}
 * must fire.
 */
export const parentDirectionReversedFixture: ChartLayout = {
  boxes: [
    box('parent', 100, 100), // wrongly placed left of child
    box('child', 300, 100),
  ],
  lines: [{ x1: 180, y1: 120, x2: 300, y2: 120 }],
  ...emptyLayoutFields(),
};

/** Edges to feed to assertParentDirection for the reversed-direction fixture. */
export const parentDirectionReversedEdges = [{ parent: 'parent', child: 'child' }];

/**
 * Two boxes nominally in the same generation, but their Y coordinates differ
 * by 50 (well beyond the default 2-pixel tolerance for hourglass).
 * assertGenerationAlignment with chartType='hourglass' and
 * generations=[['A','B']] must fire naming both ids.
 */
export const alignmentBrokenFixture: ChartLayout = {
  boxes: [box('A', 100, 100), box('B', 200, 150)],
  lines: [],
  ...emptyLayoutFields(),
};

/** Generation groups for the alignment-broken fixture. */
export const alignmentBrokenGenerations = [['A', 'B']];
