// tests/unit/circleColors.test.ts
import { describe, it, expect } from 'vitest';
import {
  hexToRgb, rgbToHex, lighten, darken, rotateHue,
  branchBaseColors, branchFill, sexFill, segmentGradientStops,
  printFill, focalFill,
  type ThemeColors,
} from '../../src/renderer/utils/circleColors';

describe('hexToRgb', () => {
  it('parses #ff8040', () => {
    expect(hexToRgb('#ff8040')).toEqual([255, 128, 64]);
  });
  it('parses #000000', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
  });
});

describe('rgbToHex', () => {
  it('converts back to hex', () => {
    expect(rgbToHex(255, 128, 64)).toBe('#ff8040');
  });
  it('clamps values', () => {
    expect(rgbToHex(300, -5, 0)).toBe('#ff0000');
  });
});

describe('lighten', () => {
  it('lightens toward white', () => {
    const result = lighten('#000000', 0.5);
    expect(hexToRgb(result)).toEqual([128, 128, 128]);
  });
  it('amount=0 returns same color', () => {
    expect(lighten('#ff8040', 0)).toBe('#ff8040');
  });
  it('amount=1 returns white', () => {
    expect(lighten('#ff8040', 1)).toBe('#ffffff');
  });
});

describe('darken', () => {
  it('darkens toward black', () => {
    const result = darken('#ffffff', 0.5);
    expect(hexToRgb(result)).toEqual([128, 128, 128]);
  });
  it('amount=0 returns same color', () => {
    expect(darken('#ff8040', 0)).toBe('#ff8040');
  });
});

describe('rotateHue', () => {
  it('180° rotation of pure red gives cyan', () => {
    const result = rotateHue('#ff0000', 180);
    expect(result).toBe('#00ffff');
  });
  it('360° rotation returns same color', () => {
    const result = rotateHue('#2d5a27', 360);
    expect(result).toBe('#2d5a27');
  });
});

describe('branchBaseColors', () => {
  it('returns 4 colors', () => {
    const branches = branchBaseColors('#2d5a27');
    expect(branches).toHaveLength(4);
    expect(branches[0]).toBe('#2d5a27');
  });
  it('each branch differs from the previous', () => {
    const branches = branchBaseColors('#2d5a27');
    const unique = new Set(branches);
    expect(unique.size).toBe(4);
  });
});

describe('branchFill', () => {
  const branches = branchBaseColors('#2d5a27') as [string, string, string, string];

  it('focal (gen 0) returns dark color in light mode', () => {
    const fill = branchFill(1, 0, false, branches, false);
    expect(fill).toBe('#2c3e50');
  });

  it('focal (gen 0) returns light color in dark mode', () => {
    const fill = branchFill(1, 0, false, branches, true);
    expect(fill).toBe('#e0e0e0');
  });

  it('empty segments are lighter than filled in light mode', () => {
    const filled = branchFill(4, 2, false, branches, false);
    const empty = branchFill(4, 2, true, branches, false);
    // Empty should be lighter (higher RGB sum)
    const filledSum = hexToRgb(filled).reduce((a, b) => a + b, 0);
    const emptySum = hexToRgb(empty).reduce((a, b) => a + b, 0);
    expect(emptySum).toBeGreaterThan(filledSum);
  });

  it('gen 1 father uses branch 0', () => {
    const fill = branchFill(2, 1, false, branches, false);
    expect(fill).toBe(branches[0]);
  });

  it('gen 1 mother uses branch 2', () => {
    const fill = branchFill(3, 1, false, branches, false);
    expect(fill).toBe(branches[2]);
  });
});

describe('sexFill', () => {
  const theme: ThemeColors = {
    accent: '#2d5a27',
    sidebarBg: '#1a2e1a',
    sexM: '#e0eaf2',
    sexF: '#f5e8ee',
    sexU: '#e8e8e8',
  };

  it('male and female produce different fills', () => {
    const m = sexFill('M', 2, false, theme, false);
    const f = sexFill('F', 2, false, theme, false);
    expect(m).not.toBe(f);
  });

  it('empty is lighter than filled', () => {
    const filled = sexFill('M', 2, false, theme, false);
    const empty = sexFill('M', 2, true, theme, false);
    const filledSum = hexToRgb(filled).reduce((a, b) => a + b, 0);
    const emptySum = hexToRgb(empty).reduce((a, b) => a + b, 0);
    expect(emptySum).toBeGreaterThan(filledSum);
  });
});

describe('segmentGradientStops', () => {
  it('returns two different colors', () => {
    const [inner, outer] = segmentGradientStops('#6a9cc0', false);
    expect(inner).not.toBe(outer);
  });
  it('inner is lighter than outer in light mode', () => {
    const [inner, outer] = segmentGradientStops('#6a9cc0', false);
    const innerSum = hexToRgb(inner).reduce((a, b) => a + b, 0);
    const outerSum = hexToRgb(outer).reduce((a, b) => a + b, 0);
    expect(innerSum).toBeGreaterThan(outerSum);
  });
});

describe('printFill', () => {
  it('focal is darkest', () => {
    const focal = printFill(0, false);
    const gen3 = printFill(3, false);
    const focalSum = hexToRgb(focal).reduce((a, b) => a + b, 0);
    const gen3Sum = hexToRgb(gen3).reduce((a, b) => a + b, 0);
    expect(focalSum).toBeLessThan(gen3Sum);
  });
  it('empty is very light', () => {
    expect(printFill(3, true)).toBe('#f5f5f5');
  });
});

describe('focalFill', () => {
  it('returns sidebarBg in light mode', () => {
    expect(focalFill('#1a2e1a', false)).toBe('#1a2e1a');
  });
  it('lightens in dark mode', () => {
    const result = focalFill('#1a2e1a', true);
    const resultSum = hexToRgb(result).reduce((a, b) => a + b, 0);
    const origSum = hexToRgb('#1a2e1a').reduce((a, b) => a + b, 0);
    expect(resultSum).toBeGreaterThan(origSum);
  });
});
