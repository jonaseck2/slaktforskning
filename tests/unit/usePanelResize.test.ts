import { describe, it, expect } from 'vitest';
import { clampWidth } from '../../src/renderer/composables/usePanelResize';

describe('clampWidth', () => {
  it('clamps to minimum', () => {
    expect(clampWidth(100, 1000)).toBe(200);
  });
  it('clamps very large value to max (75% of container width)', () => {
    const maxWidth = 600;
    const result = clampWidth(99999, maxWidth);
    expect(result).toBe(maxWidth);
  });
  it('passes through valid width within range', () => {
    expect(clampWidth(300, 1000)).toBe(300);
  });
  it('clamps to minimum at boundary', () => {
    expect(clampWidth(200, 1000)).toBe(200);
  });
});
