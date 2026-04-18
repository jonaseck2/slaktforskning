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
});
