import { describe, it, expect } from 'vitest';
import { computeSquareCropRect } from '../../src/renderer/utils/cropImage';

describe('computeSquareCropRect', () => {
  it('centers on region midpoint, uses max axis as side', () => {
    const rect = computeSquareCropRect({ x: 0.3, y: 0.2, width: 0.2, height: 0.4 });
    // cx = 0.4, cy = 0.4, s = 0.4
    expect(rect.size).toBeCloseTo(0.4);
    expect(rect.x).toBeCloseTo(0.2);
    expect(rect.y).toBeCloseTo(0.2);
  });

  it('clamps to left edge when region is near left', () => {
    const rect = computeSquareCropRect({ x: 0.0, y: 0.4, width: 0.2, height: 0.2 });
    // cx = 0.1, s = 0.2 → unclamped x = 0.0 (already edge)
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0.4);
    expect(rect.size).toBeCloseTo(0.2);
  });

  it('clamps to right edge when region is near right', () => {
    const rect = computeSquareCropRect({ x: 0.85, y: 0.4, width: 0.1, height: 0.2 });
    // cx = 0.9, cy = 0.5, s = 0.2 → unclamped x = 0.8, y = 0.4; 1 - s = 0.8 → x stays 0.8
    expect(rect.x).toBeCloseTo(0.8);
    expect(rect.y).toBeCloseTo(0.4);
    expect(rect.size).toBeCloseTo(0.2);
  });

  it('returns full-image center square when region is null', () => {
    const rect = computeSquareCropRect(null);
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0);
    expect(rect.size).toBeCloseTo(1);
  });

  it('handles a square region passthrough', () => {
    const rect = computeSquareCropRect({ x: 0.4, y: 0.4, width: 0.2, height: 0.2 });
    expect(rect.x).toBeCloseTo(0.4);
    expect(rect.y).toBeCloseTo(0.4);
    expect(rect.size).toBeCloseTo(0.2);
  });

  it('clamps wide region to fit image width', () => {
    // region is 1.2-wide (impossible in practice but we should not overflow)
    const rect = computeSquareCropRect({ x: 0.0, y: 0.4, width: 1.0, height: 0.1 });
    // cx = 0.5, s = 1.0, unclamped x = 0 → ok. But size >= 1 should saturate to 1.
    expect(rect.size).toBeLessThanOrEqual(1);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.size).toBeLessThanOrEqual(1 + 1e-9);
  });
});
