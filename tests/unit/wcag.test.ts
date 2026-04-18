import { describe, expect, it } from 'vitest';
import {
  parseHex,
  relativeLuminance,
  contrastRatio,
  wcagThreshold,
  meetsWcag,
  NON_TEXT_THRESHOLD,
} from '../../src/renderer/utils/wcag';

describe('parseHex', () => {
  it('parses 6-digit hex with #', () => {
    expect(parseHex('#ff8040')).toEqual([255, 128, 64]);
  });

  it('parses 6-digit hex without #', () => {
    expect(parseHex('ff8040')).toEqual([255, 128, 64]);
  });

  it('parses 3-digit shorthand', () => {
    expect(parseHex('#f84')).toEqual([255, 136, 68]);
    expect(parseHex('#000')).toEqual([0, 0, 0]);
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
  });

  it('is case-insensitive', () => {
    expect(parseHex('#FF8040')).toEqual(parseHex('#ff8040'));
  });

  it('throws on invalid input', () => {
    expect(() => parseHex('#ggg')).toThrow(/Invalid hex color/);
    expect(() => parseHex('#12345')).toThrow(/Invalid hex color/);
    expect(() => parseHex('not-a-color')).toThrow(/Invalid hex color/);
  });
});

describe('relativeLuminance', () => {
  it('returns 0 for black', () => {
    expect(relativeLuminance('#000000')).toBe(0);
  });

  it('returns 1 for white', () => {
    expect(relativeLuminance('#ffffff')).toBe(1);
  });

  // Reference values computed from the W3C formula.
  // https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
  it('matches W3C reference for pure primaries', () => {
    expect(relativeLuminance('#ff0000')).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance('#00ff00')).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance('#0000ff')).toBeCloseTo(0.0722, 4);
  });

  it('matches known value for mid-gray #777777', () => {
    // W3C formula: ((119/255+0.055)/1.055)^2.4 ≈ 0.1845
    expect(relativeLuminance('#777777')).toBeCloseTo(0.1845, 3);
  });

  it('uses the linear branch for low values (≤ 0.03928)', () => {
    // #0a0a0a = 10/255 ≈ 0.0392 → right on the boundary, uses linear branch.
    // L = 10/255/12.92 ≈ 0.003035
    expect(relativeLuminance('#0a0a0a')).toBeCloseTo(0.003035, 5);
  });

  it('is monotonic from black to white along the gray axis', () => {
    const points = ['#000000', '#333333', '#777777', '#aaaaaa', '#ffffff'].map(relativeLuminance);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]).toBeGreaterThan(points[i - 1]);
    }
  });
});

describe('contrastRatio', () => {
  it('black on white = 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('is symmetric (fg/bg order does not matter)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(contrastRatio('#ffffff', '#000000'));
  });

  it('identical colors = 1:1', () => {
    expect(contrastRatio('#777777', '#777777')).toBe(1);
    expect(contrastRatio('#abc123', '#abc123')).toBe(1);
  });

  // WebAIM reference: #777777 on #FFFFFF = 4.48:1
  it('matches known WebAIM reference (#777777 on #ffffff ≈ 4.48:1)', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  // W3C AAA boundary example: #595959 on #ffffff ≈ 7.0:1
  it('matches W3C AAA boundary (#595959 on #ffffff ≈ 7.0:1)', () => {
    expect(contrastRatio('#595959', '#ffffff')).toBeCloseTo(7.0, 1);
  });

  // Accepts short-form hex
  it('accepts shorthand hex', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1);
  });
});

describe('wcagThreshold', () => {
  it('returns AAA normal = 7', () => {
    expect(wcagThreshold('AAA', 'normal')).toBe(7);
  });

  it('returns AAA large = 4.5', () => {
    expect(wcagThreshold('AAA', 'large')).toBe(4.5);
  });

  it('returns AA normal = 4.5', () => {
    expect(wcagThreshold('AA', 'normal')).toBe(4.5);
  });

  it('returns AA large = 3', () => {
    expect(wcagThreshold('AA', 'large')).toBe(3);
  });
});

describe('NON_TEXT_THRESHOLD', () => {
  it('is 3:1 per WCAG 1.4.11', () => {
    expect(NON_TEXT_THRESHOLD).toBe(3);
  });
});

describe('meetsWcag', () => {
  it('passes AAA normal at exactly 7:1', () => {
    expect(meetsWcag(7, 'AAA', 'normal')).toBe(true);
  });

  it('fails AAA normal just under 7:1', () => {
    expect(meetsWcag(6.99, 'AAA', 'normal')).toBe(false);
  });

  it('passes AAA large at 4.5:1', () => {
    expect(meetsWcag(4.5, 'AAA', 'large')).toBe(true);
  });

  it('fails AAA large at 4.49:1', () => {
    expect(meetsWcag(4.49, 'AAA', 'large')).toBe(false);
  });

  it('passes AA normal at 4.5:1 but not AAA normal', () => {
    expect(meetsWcag(4.5, 'AA', 'normal')).toBe(true);
    expect(meetsWcag(4.5, 'AAA', 'normal')).toBe(false);
  });

  it('defaults size to normal', () => {
    expect(meetsWcag(5, 'AA')).toBe(true);       // 5 ≥ 4.5
    expect(meetsWcag(5, 'AAA')).toBe(false);     // 5 < 7
  });

  it('black on white passes AAA normal', () => {
    const r = contrastRatio('#000000', '#ffffff');
    expect(meetsWcag(r, 'AAA', 'normal')).toBe(true);
  });

  it('#777777 on white passes AA large but fails AAA large', () => {
    const r = contrastRatio('#777777', '#ffffff');
    expect(meetsWcag(r, 'AA', 'large')).toBe(true);   // ~4.48 ≥ 3
    expect(meetsWcag(r, 'AA', 'normal')).toBe(false); // ~4.48 < 4.5
  });
});
