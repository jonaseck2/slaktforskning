import { describe, it, expect } from 'vitest';
import {
  getPaperDimensions,
} from '../../src/api/chart-export';

describe('getPaperDimensions', () => {
  it('returns A4 portrait dimensions by default', () => {
    expect(getPaperDimensions({ paperSize: 'A4', orientation: 'portrait' }))
      .toEqual({ width: 210, height: 297 });
  });
  it('swaps width and height for landscape', () => {
    expect(getPaperDimensions({ paperSize: 'A4', orientation: 'landscape' }))
      .toEqual({ width: 297, height: 210 });
  });
  it('returns A2 dimensions when A2 is selected', () => {
    const dims = getPaperDimensions({ paperSize: 'A2', orientation: 'portrait' });
    expect(dims).toEqual({ width: 420, height: 594 });
  });
  it('returns custom dimensions when paperSize is custom', () => {
    const dims = getPaperDimensions({
      paperSize: 'custom',
      orientation: 'portrait',
      customWidth: 500,
      customHeight: 700,
    });
    expect(dims).toEqual({ width: 500, height: 700 });
  });
});
