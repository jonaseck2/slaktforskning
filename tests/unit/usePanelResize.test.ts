import { describe, it, expect } from 'vitest';
import { clampWidth } from '../../src/renderer/composables/usePanelResize';

describe('clampWidth', () => {
  it('clamps to minimum', () => {
    expect(clampWidth(100)).toBe(200);
  });
  it('clamps to maximum', () => {
    expect(clampWidth(600)).toBe(520);
  });
  it('passes through valid width', () => {
    expect(clampWidth(300)).toBe(300);
  });
  it('clamps exact boundary values', () => {
    expect(clampWidth(200)).toBe(200);
    expect(clampWidth(520)).toBe(520);
  });
});
