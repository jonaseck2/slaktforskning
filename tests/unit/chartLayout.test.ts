import { describe, it, expect } from 'vitest';
import {
  computePedigreeLayout,
  computeHourglassLayout,
  computeTimelineLayout,
  BOX_W,
  BOX_H,
} from '../../src/renderer/utils/chartLayout';
import type { PersonNode, PedigreeTree, HourglassTree } from '../../src/renderer/utils/chartLayout';

function p(id: string, overrides: Partial<PersonNode> = {}): PersonNode {
  return { id, givenName: 'Test', surname: 'Person', sex: 'U', living: true, birthYear: null, deathYear: null, ...overrides };
}

describe('computePedigreeLayout', () => {
  it('returns one focal box when tree has no ancestors', () => {
    const tree: PedigreeTree = { focal: p('f'), parents: [null, null], grandparents: [null, null, null, null] };
    const { boxes } = computePedigreeLayout(tree);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].isFocal).toBe(true);
    expect(boxes[0].w).toBe(BOX_W);
    expect(boxes[0].h).toBe(BOX_H);
  });

  it('places focal box at leftmost x (PAD=10)', () => {
    const tree: PedigreeTree = { focal: p('f'), parents: [null, null], grandparents: [null, null, null, null] };
    const { boxes } = computePedigreeLayout(tree);
    expect(boxes[0].x).toBe(10);
  });

  it('generates no connector lines when no ancestors', () => {
    const tree: PedigreeTree = { focal: p('f'), parents: [null, null], grandparents: [null, null, null, null] };
    expect(computePedigreeLayout(tree).lines).toHaveLength(0);
  });

  it('adds both parent boxes at genX[1]=215', () => {
    const tree: PedigreeTree = {
      focal: p('f'),
      parents: [p('p0'), p('p1')],
      grandparents: [null, null, null, null],
    };
    const { boxes } = computePedigreeLayout(tree);
    const parentBoxes = boxes.filter(b => !b.isFocal);
    expect(parentBoxes).toHaveLength(2);
    parentBoxes.forEach(b => expect(b.x).toBe(215));
  });

  it('places parents[0] above parents[1]', () => {
    const tree: PedigreeTree = {
      focal: p('f'),
      parents: [p('p0'), p('p1')],
      grandparents: [null, null, null, null],
    };
    const { boxes } = computePedigreeLayout(tree);
    const p0 = boxes.find(b => b.person.id === 'p0')!;
    const p1 = boxes.find(b => b.person.id === 'p1')!;
    expect(p0.y).toBeLessThan(p1.y);
  });

  it('generates connector lines when at least one parent exists', () => {
    const tree: PedigreeTree = {
      focal: p('f'),
      parents: [p('p0'), null],
      grandparents: [null, null, null, null],
    };
    expect(computePedigreeLayout(tree).lines.length).toBeGreaterThan(0);
  });

  it('returns 7 boxes for a full 3-generation tree', () => {
    const tree: PedigreeTree = {
      focal: p('f'),
      parents: [p('p0'), p('p1')],
      grandparents: [p('gp0'), p('gp1'), p('gp2'), p('gp3')],
    };
    expect(computePedigreeLayout(tree).boxes).toHaveLength(7);
  });

  it('places grandparent boxes at genX[2]=420', () => {
    const tree: PedigreeTree = {
      focal: p('f'),
      parents: [p('p0'), p('p1')],
      grandparents: [p('gp0'), null, p('gp2'), null],
    };
    const { boxes } = computePedigreeLayout(tree);
    const gpBoxes = boxes.filter(b => b.person.id === 'gp0' || b.person.id === 'gp2');
    gpBoxes.forEach(b => expect(b.x).toBe(420));
  });

  it('focal is vertically centered between parents', () => {
    const tree: PedigreeTree = {
      focal: p('f'),
      parents: [p('p0'), p('p1')],
      grandparents: [null, null, null, null],
    };
    const { boxes } = computePedigreeLayout(tree);
    const focal = boxes.find(b => b.isFocal)!;
    const p0 = boxes.find(b => b.person.id === 'p0')!;
    const p1 = boxes.find(b => b.person.id === 'p1')!;
    const focalCY = focal.y + BOX_H / 2;
    const p0cy = p0.y + BOX_H / 2;
    const p1cy = p1.y + BOX_H / 2;
    expect(focalCY).toBeCloseTo((p0cy + p1cy) / 2, 1);
  });
});

describe('computeHourglassLayout', () => {
  it('places focal at horizontal center', () => {
    const tree: HourglassTree = {
      focal: p('f'), parents: [null, null], grandparents: [null, null, null, null], children: [],
    };
    const { boxes, svgWidth } = computeHourglassLayout(tree);
    const focal = boxes.find(b => b.isFocal)!;
    expect(focal.x).toBeCloseTo(svgWidth / 2 - BOX_W / 2, 0);
  });

  it('places child boxes below the focal box', () => {
    const tree: HourglassTree = {
      focal: p('f'), parents: [null, null], grandparents: [null, null, null, null],
      children: [p('c1'), p('c2')],
    };
    const { boxes } = computeHourglassLayout(tree);
    const focal = boxes.find(b => b.isFocal)!;
    const children = boxes.filter(b => b.person.id === 'c1' || b.person.id === 'c2');
    expect(children).toHaveLength(2);
    children.forEach(c => expect(c.y).toBeGreaterThan(focal.y + BOX_H));
  });

  it('generates no lines when no parents and no children', () => {
    const tree: HourglassTree = {
      focal: p('f'), parents: [null, null], grandparents: [null, null, null, null], children: [],
    };
    expect(computeHourglassLayout(tree).lines).toHaveLength(0);
  });

  it('svgHeight grows when children are added', () => {
    const noChildren: HourglassTree = {
      focal: p('f'), parents: [null, null], grandparents: [null, null, null, null], children: [],
    };
    const withChildren: HourglassTree = { ...noChildren, children: [p('c1')] };
    const h1 = computeHourglassLayout(noChildren).svgHeight;
    const h2 = computeHourglassLayout(withChildren).svgHeight;
    expect(h2).toBeGreaterThan(h1);
  });
});

describe('computeTimelineLayout', () => {
  it('returns one bar per entry', () => {
    const entries = [
      { person: p('f', { birthYear: 1978 }), isFocal: true },
      { person: p('x', { birthYear: 1950, deathYear: 2010 }), isFocal: false },
    ];
    expect(computeTimelineLayout(entries, 2024).bars).toHaveLength(2);
  });

  it('marks persons with no death year as open (living bar)', () => {
    const entries = [{ person: p('f', { birthYear: 1978 }), isFocal: true }];
    expect(computeTimelineLayout(entries, 2024).bars[0].isOpen).toBe(true);
  });

  it('marks persons with a death year as closed', () => {
    const entries = [{ person: p('x', { birthYear: 1900, deathYear: 1980 }), isFocal: false }];
    expect(computeTimelineLayout(entries, 2024).bars[0].isOpen).toBe(false);
  });

  it('sorts oldest birth year to top (first in array)', () => {
    const entries = [
      { person: p('young', { birthYear: 1980 }), isFocal: false },
      { person: p('old', { birthYear: 1920 }), isFocal: false },
    ];
    const { bars } = computeTimelineLayout(entries, 2024);
    expect(bars[0].person.id).toBe('old');
    expect(bars[1].person.id).toBe('young');
  });

  it('generates decade tick marks', () => {
    const entries = [{ person: p('f', { birthYear: 1950 }), isFocal: true }];
    const { ticks } = computeTimelineLayout(entries, 2000);
    expect(ticks.length).toBeGreaterThan(0);
    ticks.forEach(t => expect(t.year % 10).toBe(0));
  });

  it('includes a todayX value', () => {
    const entries = [{ person: p('f', { birthYear: 1950 }), isFocal: true }];
    const { todayX } = computeTimelineLayout(entries, 2000);
    expect(todayX).toBeGreaterThan(0);
  });

  it('marks person with no birth year as hasNoDate', () => {
    const entries = [{ person: p('x'), isFocal: false }];
    expect(computeTimelineLayout(entries, 2024).bars[0].hasNoDate).toBe(true);
  });
});
