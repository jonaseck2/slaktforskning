import { describe, it, expect } from 'vitest';
import { computeSquareCropRectPx } from '../../src/renderer/utils/cropImage';

describe('computeSquareCropRectPx', () => {
  it('portrait image with tall face region: square side = region height in pixels, contains whole face', () => {
    // 1080x1920 portrait, face tag {x:0.35,y:0.15,w:0.3,h:0.4}
    // pixel region: x=378, y=288, w=324, h=768. Face is 768px tall.
    // Expected square: size=768, centered on face midpoint (540, 672).
    const r = computeSquareCropRectPx({ x: 0.35, y: 0.15, width: 0.3, height: 0.4 }, 1080, 1920);
    expect(r.size).toBeCloseTo(768);
    // Face y-range is 288-1056; the 768 square should contain it exactly.
    expect(r.sy).toBeCloseTo(288);
    expect(r.sy + r.size).toBeCloseTo(1056);
    // Face x-range is 378-702 (324 wide); 768 square centered on 540 is 156-924.
    expect(r.sx).toBeCloseTo(156);
  });

  it('landscape image with wide face region: square side = region width in pixels', () => {
    // 1920x1080, face {x:0.2,y:0.3,w:0.5,h:0.2}
    // pixel region: x=384, y=324, w=960, h=216. Face is 960px wide.
    // Expected square: size=960, centered on (864, 432).
    const r = computeSquareCropRectPx({ x: 0.2, y: 0.3, width: 0.5, height: 0.2 }, 1920, 1080);
    expect(r.size).toBeCloseTo(960);
    expect(r.sx).toBeCloseTo(384);
    expect(r.sx + r.size).toBeCloseTo(1344);
    // y centered on 432, size 960 → would be -48..912; clamped to 0..960.
    expect(r.sy).toBeCloseTo(0);
  });

  it('clamps to left edge when region is at x=0', () => {
    const r = computeSquareCropRectPx({ x: 0.0, y: 0.4, width: 0.2, height: 0.2 }, 1000, 1000);
    // rxPx=0, ryPx=400, rwPx=200, rhPx=200. size=200. center=(100,500). sx=100-100=0, sy=500-100=400.
    expect(r.sx).toBeCloseTo(0);
    expect(r.sy).toBeCloseTo(400);
    expect(r.size).toBeCloseTo(200);
  });

  it('clamps to right edge when region is near right', () => {
    const r = computeSquareCropRectPx({ x: 0.85, y: 0.4, width: 0.1, height: 0.2 }, 1000, 1000);
    // rxPx=850, ryPx=400, rwPx=100, rhPx=200. size=200. center=(900,500). sx=900-100=800 (clamped, since W-size=800), sy=500-100=400.
    expect(r.sx).toBeCloseTo(800);
    expect(r.sy).toBeCloseTo(400);
    expect(r.size).toBeCloseTo(200);
  });

  it('clamps to bottom edge when region is near bottom', () => {
    const r = computeSquareCropRectPx({ x: 0.4, y: 0.85, width: 0.2, height: 0.1 }, 1000, 1000);
    // rxPx=400, ryPx=850, rwPx=200, rhPx=100. size=200. center=(500,900). sx=400, sy=900-100=800 (clamped).
    expect(r.sx).toBeCloseTo(400);
    expect(r.sy).toBeCloseTo(800);
    expect(r.size).toBeCloseTo(200);
  });

  it('null region on square image: full-image square', () => {
    const r = computeSquareCropRectPx(null, 1000, 1000);
    expect(r.sx).toBeCloseTo(0);
    expect(r.sy).toBeCloseTo(0);
    expect(r.size).toBeCloseTo(1000);
  });

  it('null region on landscape image: horizontally centered square of image height', () => {
    const r = computeSquareCropRectPx(null, 1920, 1080);
    expect(r.size).toBeCloseTo(1080);
    expect(r.sx).toBeCloseTo(420);
    expect(r.sy).toBeCloseTo(0);
  });

  it('null region on portrait image: vertically centered square of image width', () => {
    const r = computeSquareCropRectPx(null, 1080, 1920);
    expect(r.size).toBeCloseTo(1080);
    expect(r.sx).toBeCloseTo(0);
    expect(r.sy).toBeCloseTo(420);
  });

  it('square region passes through with exact pixel match', () => {
    const r = computeSquareCropRectPx({ x: 0.4, y: 0.4, width: 0.2, height: 0.2 }, 1000, 1000);
    expect(r.sx).toBeCloseTo(400);
    expect(r.sy).toBeCloseTo(400);
    expect(r.size).toBeCloseTo(200);
  });

  it('region larger than shortest image axis is saturated to fit', () => {
    // 1000x500 landscape, region spans full (impossible in practice).
    const r = computeSquareCropRectPx({ x: 0.0, y: 0.0, width: 1.0, height: 1.0 }, 1000, 500);
    // rwPx=1000, rhPx=500. size = min(500, max(1000, 500)) = 500.
    expect(r.size).toBeCloseTo(500);
    expect(r.sx).toBeGreaterThanOrEqual(0);
    expect(r.sy).toBeGreaterThanOrEqual(0);
    expect(r.sx + r.size).toBeLessThanOrEqual(1000 + 1e-9);
    expect(r.sy + r.size).toBeLessThanOrEqual(500 + 1e-9);
  });
});
