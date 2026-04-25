import { describe, it, expect } from 'vitest';
import { curvedElbow } from '../../src/renderer/utils/chart-layout/connectors';

describe('curvedElbow', () => {
  it('right direction: generates valid SVG path with M and H/V commands', () => {
    const d = curvedElbow(0, 50, 200, 100, 'right');
    expect(d).toContain('M');
    expect(d).toMatch(/[HhVvMmQq]/);
    expect(d.startsWith('M 0,50')).toBe(true);
  });

  it('down direction: generates valid SVG path', () => {
    const d = curvedElbow(100, 0, 200, 150, 'down');
    expect(d).toContain('M');
    expect(d.startsWith('M 100,0')).toBe(true);
  });

  it('same-Y horizontal (right): returns simple M x1,y H x2', () => {
    const d = curvedElbow(0, 50, 200, 50, 'right');
    expect(d).toBe('M 0,50 H 200');
  });

  it('same-X vertical (down): returns simple M x,y1 V y2', () => {
    const d = curvedElbow(100, 0, 100, 150, 'down');
    expect(d).toBe('M 100,0 V 150');
  });

  it('parent above child (toY < fromY): path goes upward', () => {
    // down direction but parent is above — vertical segment should go upward
    const d = curvedElbow(100, 200, 200, 50, 'down');
    expect(d).toContain('M');
    // The path should be valid SVG
    expect(d.length).toBeGreaterThan(5);
  });

  it('right direction: produces path ending near toX', () => {
    const toX = 300;
    const d = curvedElbow(0, 50, toX, 150, 'right');
    // Path should mention toX somewhere
    expect(d).toContain(String(toX));
  });

  it('down direction: customMidY forces horizontal segment to that Y', () => {
    const customMidY = 80;
    const d = curvedElbow(100, 10, 200, 150, 'down', customMidY);
    // First Q control point is "fromX,midY" — midY must equal customMidY
    const match = d.match(/Q ([\d.-]+),([\d.-]+)/);
    expect(match).not.toBeNull();
    expect(parseFloat(match![2])).toBeCloseTo(customMidY, 3);
  });

  it('down direction: without customMidY horizontal segment is at geometric midpoint', () => {
    const fromY = 10, toY = 150;
    const d = curvedElbow(100, fromY, 200, toY, 'down');
    const match = d.match(/Q ([\d.-]+),([\d.-]+)/);
    expect(match).not.toBeNull();
    expect(parseFloat(match![2])).toBeCloseTo((fromY + toY) / 2, 3);
  });

  it('down direction: L-shape when customMidY equals toY', () => {
    const toY = 150;
    const d = curvedElbow(100, 10, 200, toY, 'down', toY);
    expect(d).toMatch(/^M \S+ V \S+ H \S+$/);
    const vMatch = d.match(/V ([\d.-]+)/);
    expect(vMatch).not.toBeNull();
    expect(parseFloat(vMatch![1])).toBeCloseTo(toY, 3);
  });
});
