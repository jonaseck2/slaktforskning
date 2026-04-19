// src/renderer/utils/fanColors.ts
// Pure color computation for fan chart segments (branch, sex, high-contrast,
// print). No DOM dependencies.

export type FanColorMode = 'branch' | 'sex';

export interface ThemeColors {
  accent: string;       // --accent
  sidebarBg: string;    // --sidebar-bg
  sexM: string;         // --sex-m-bg  (light mode) or darkened variant
  sexF: string;         // --sex-f-bg
  sexU: string;         // --sex-u-bg
  branches: [string, string, string, string];  // --fan-branch-1..4 (falls back to accent hue rotation)
}

/** Parse "#rrggbb" to [r, g, b]. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Convert [r, g, b] back to "#rrggbb". */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => Math.min(255, Math.max(0, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

/** Lighten a hex color toward white by `amount` (0–1). */
export function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}

/** Darken a hex color toward black by `amount` (0–1). */
export function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

/** Rotate hue of a hex color by `degrees`. */
export function rotateHue(hex: string, degrees: number): string {
  const [r, g, b] = hexToRgb(hex);
  // Convert to HSL, rotate, convert back
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  h = ((h * 360 + degrees) % 360 + 360) % 360;
  // HSL to RGB
  if (s === 0) {
    const v = Math.round(l * 255);
    return rgbToHex(v, v, v);
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hN = h / 360;
  return rgbToHex(
    Math.round(hue2rgb(p, q, hN + 1/3) * 255),
    Math.round(hue2rgb(p, q, hN) * 255),
    Math.round(hue2rgb(p, q, hN - 1/3) * 255),
  );
}

/**
 * Generate 4 branch base colors from a theme accent color.
 * Each branch is a 90° hue rotation from the previous.
 */
export function branchBaseColors(accent: string): [string, string, string, string] {
  return [
    accent,
    rotateHue(accent, 90),
    rotateHue(accent, 180),
    rotateHue(accent, 270),
  ];
}

/**
 * Compute segment fill for branch color mode.
 * @param ahnNum   Ahnentafel number (1=focal, 2=father, 3=mother, ...)
 * @param gen      Generation (0=focal, 1=parents, ...)
 * @param isEmpty  Whether the segment has no person
 * @param branches 4 branch base colors from branchBaseColors()
 * @param isDark   Whether dark mode is active
 */
export function branchFill(
  ahnNum: number, gen: number, isEmpty: boolean,
  branches: [string, string, string, string],
  isDark: boolean,
): string {
  let base: string;
  if (gen === 0) {
    base = isDark ? '#e0e0e0' : '#2c3e50';
  } else if (gen === 1) {
    // Father side = branches 0+1 blended, Mother side = branches 2+3 blended
    base = ahnNum === 2 ? branches[0] : branches[2];
  } else {
    const rootAhn = ahnNum >> (gen - 2);    // range 4–7
    const branchIdx = rootAhn - 4;          // 0–3
    const lightenAmt = isDark ? (gen - 2) * 0.05 : (gen - 2) * 0.07;
    base = isDark
      ? darken(branches[branchIdx] ?? '#888', lightenAmt)
      : lighten(branches[branchIdx] ?? '#ccc', lightenAmt);
  }
  if (isEmpty) {
    base = isDark ? lighten(base, 0.15) : lighten(base, 0.55);
  }
  return base;
}

/**
 * Compute segment fill for sex-based color mode.
 */
export function sexFill(
  sex: 'M' | 'F' | 'U' | string,
  gen: number,
  isEmpty: boolean,
  theme: ThemeColors,
  isDark: boolean,
): string {
  const sexBaseMap: Record<string, string> = { M: theme.sexM, F: theme.sexF, U: theme.sexU };
  let base = sexBaseMap[sex] ?? theme.sexU;
  // Per-generation depth: slight lighten outward so rings remain distinguishable
  base = isDark ? darken(base, gen * 0.03) : lighten(base, gen * 0.06);
  if (isEmpty) base = isDark ? lighten(base, 0.2) : lighten(base, 0.5);
  return base;
}

/**
 * Gradient stops for a single segment (radial depth effect).
 * Returns [innerColor, outerColor].
 */
export function segmentGradientStops(baseFill: string, isDark: boolean): [string, string] {
  return isDark
    ? [lighten(baseFill, 0.08), darken(baseFill, 0.06)]
    : [lighten(baseFill, 0.06), darken(baseFill, 0.08)];
}

/**
 * Focal circle fill.
 */
export function focalFill(sidebarBg: string, isDark: boolean): string {
  return isDark ? lighten(sidebarBg, 0.3) : sidebarBg;
}

/**
 * Print-mode fill: grayscale.
 * Focal=dark gray, gen 1-2=medium, gen 3-4=light, gen 5-6=very light.
 * Empty segments get a subtle dashed pattern (handled in SVG, not here).
 */
export function printFill(gen: number, isEmpty: boolean): string {
  if (isEmpty) return '#f5f5f5';
  const shades: Record<number, string> = {
    0: '#333333', 1: '#666666', 2: '#888888',
    3: '#aaaaaa', 4: '#bbbbbb', 5: '#cccccc', 6: '#dddddd',
  };
  return shades[gen] ?? '#dddddd';
}

/**
 * Read current theme token values from the DOM.
 * Call this once per render cycle (not per segment).
 */
export function readThemeColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const get = (prop: string) => style.getPropertyValue(prop).trim();
  const accent = get('--accent') || '#2d5a27';
  const b1 = get('--fan-branch-1');
  const b2 = get('--fan-branch-2');
  const b3 = get('--fan-branch-3');
  const b4 = get('--fan-branch-4');
  const branches: [string, string, string, string] = (b1 && b2 && b3 && b4)
    ? [b1, b2, b3, b4]
    : branchBaseColors(accent);
  return {
    accent,
    sidebarBg: get('--sidebar-bg') || '#1a2e1a',
    sexM: get('--sex-m-text') || '#3a5a7a',
    sexF: get('--sex-f-text') || '#8a5068',
    sexU: get('--sex-u-text') || '#666666',
    branches,
  };
}

/**
 * Detect dark mode from DOM.
 */
export function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}

/** Detect high-contrast mode from DOM. */
export function isHighContrast(): boolean {
  return document.documentElement.classList.contains('high-contrast');
}

/**
 * High-contrast fills: strong solid colors with maximum text contrast.
 * Uses fewer, more saturated colors. All text becomes pure white or black.
 */
export function highContrastBranchFill(
  ahnNum: number, gen: number, isEmpty: boolean,
  branches: [string, string, string, string],
): string {
  if (gen === 0) return '#000000';
  if (isEmpty) return '#ffffff';
  const rootAhn = gen >= 2 ? (ahnNum >> (gen - 2)) - 4 : (ahnNum === 2 ? 0 : 2);
  const branchIdx = Math.min(rootAhn, 3);
  // Saturate and darken for maximum contrast with white text
  return darken(branches[branchIdx] ?? '#555', 0.2);
}
