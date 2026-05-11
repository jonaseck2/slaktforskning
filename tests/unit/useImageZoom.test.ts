import { describe, it, expect } from 'vitest';
import { useImageZoom } from '../../src/renderer/composables/useImageZoom';

describe('useImageZoom', async () => {
  it('initializes in fit mode with zoom 1', async () => {
    const { zoom, panX, panY, isFitMode } = useImageZoom();
    expect(zoom.value).toBe(1);
    expect(panX.value).toBe(0);
    expect(panY.value).toBe(0);
    expect(isFitMode.value).toBe(true);
  });

  it('zoomIn increases zoom by step', async () => {
    const { zoom, zoomIn } = useImageZoom();
    zoomIn();
    expect(zoom.value).toBeCloseTo(1.25);
  });

  it('zoomOut decreases zoom but not below minZoom', async () => {
    const { zoom, zoomOut, setMinZoom } = useImageZoom();
    setMinZoom(0.5);
    zoomOut();
    expect(zoom.value).toBeCloseTo(0.8);
    for (let i = 0; i < 10; i++) zoomOut();
    expect(zoom.value).toBeGreaterThanOrEqual(0.5);
  });

  it('zoomOut does not go below minZoom of 1 when no setMinZoom called', async () => {
    const { zoom, zoomOut } = useImageZoom();
    zoomOut();
    expect(zoom.value).toBe(1);
  });

  it('fitToContainer resets zoom and pan', async () => {
    const { zoom, panX, panY, zoomIn, fitToContainer } = useImageZoom();
    zoomIn();
    zoomIn();
    fitToContainer();
    expect(zoom.value).toBe(1);
    expect(panX.value).toBe(0);
    expect(panY.value).toBe(0);
  });

  it('caps zoom at MAX_ZOOM (5)', async () => {
    const { zoom, zoomIn } = useImageZoom();
    for (let i = 0; i < 50; i++) zoomIn();
    expect(zoom.value).toBeLessThanOrEqual(5);
  });

  it('setPan updates panX and panY', async () => {
    const { panX, panY, setPan } = useImageZoom();
    setPan(100, 200);
    expect(panX.value).toBe(100);
    expect(panY.value).toBe(200);
  });

  it('isFitMode is false after zooming', async () => {
    const { isFitMode, zoomIn } = useImageZoom();
    expect(isFitMode.value).toBe(true);
    zoomIn();
    expect(isFitMode.value).toBe(false);
  });

  it('zoomPercent returns formatted string', async () => {
    const { zoomPercent, zoomIn } = useImageZoom();
    expect(zoomPercent.value).toBe('100%');
    zoomIn();
    expect(zoomPercent.value).toBe('125%');
  });
});
