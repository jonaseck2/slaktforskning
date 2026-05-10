import { describe, it, expect } from 'vitest';
import { clampWidth } from '../../src/renderer/composables/usePanelResize';

describe('clampWidth', async () => {
  it('clamps to minimum', async () => {
    expect(clampWidth(100, 1000)).toBe(200);
  });
  it('clamps very large value to max (75% of container width)', async () => {
    const maxWidth = 600;
    const result = clampWidth(99999, maxWidth);
    expect(result).toBe(maxWidth);
  });
  it('passes through valid width within range', async () => {
    expect(clampWidth(300, 1000)).toBe(300);
  });
  it('clamps to minimum at boundary', async () => {
    expect(clampWidth(200, 1000)).toBe(200);
  });
});
