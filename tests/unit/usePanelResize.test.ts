import { describe, it, expect } from 'vitest';
import { clampWidth } from '../../src/renderer/composables/usePanelResize';

describe('clampWidth', () => {
  it('clamps to minimum', () => {
    expect(clampWidth(100)).toBe(200);
  });
  it('clamps very large value to max (75% of window width)', () => {
    const result = clampWidth(99999);
    expect(result).toBeLessThan(99999);
    expect(result).toBeGreaterThanOrEqual(200);
  });
  it('passes through valid width within range', () => {
    expect(clampWidth(300)).toBe(300);
  });
  it('clamps to minimum at boundary', () => {
    expect(clampWidth(200)).toBe(200);
  });
});
