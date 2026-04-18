// Theme-aware chart colors composable.
// Returns CSS custom property values when themed, or hardcoded neutral palette for export.

import { computed } from 'vue';
import { useThemeSignal } from './useThemeSignal';

export interface ChartColors {
  surface: string;
  surfaceBorder: string;
  textPrimary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentText: string;
  connector: string;
  sexMBg: string;
  sexFBg: string;
  sexUBg: string;
  sexMText: string;
  sexFText: string;
  sexUText: string;
  // Box colors
  boxBg: string;
  boxDeceased: string;
  boxFocal: string;
  boxStroke: string;
  focalStroke: string;
  text: string;
  textSub: string;
  textFocal: string;
  textFocalSub: string;
  line: string;
  placeholderStroke: string;
  placeholderText: string;
}

/** Hardcoded neutral palette for unthemed export (PDF, PNG). */
export const EXPORT_COLORS: ChartColors = {
  surface: '#ffffff',
  surfaceBorder: '#dddddd',
  textPrimary: '#222222',
  textMuted: '#888888',
  accent: '#2c3e50',
  accentHover: '#1a2a3a',
  accentText: '#ffffff',
  connector: '#cccccc',
  sexMBg: '#7eb8f7',
  sexFBg: '#f7a5c0',
  sexUBg: '#cccccc',
  sexMText: '#ffffff',
  sexFText: '#ffffff',
  sexUText: '#555555',
  // Box colors
  boxBg: '#ffffff',
  boxDeceased: '#f8f8f8',
  boxFocal: '#2c3e50',
  boxStroke: '#dddddd',
  focalStroke: '#1a2a3a',
  text: '#333333',
  textSub: '#888888',
  textFocal: '#ffffff',
  textFocalSub: 'rgba(255,255,255,0.65)',
  line: '#cccccc',
  placeholderStroke: '#94a3b8',
  placeholderText: '#94a3b8',
};

function readCssVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}

/**
 * Composable that returns chart colors.
 *
 * When `themed` is true, reads CSS custom properties from the document root
 * (so colors update with theme changes).
 * When `themed` is false, returns `EXPORT_COLORS` for unthemed export.
 */
export function useChartColors(themed: boolean) {
  const themeVersion = useThemeSignal();
  return computed<ChartColors>(() => {
    if (!themed) return EXPORT_COLORS;

    // Register a dependency on the theme signal so changes to
    // html.classList invalidate this computed. Not read in the
    // non-themed branch — exports must stay invariant.
    void themeVersion.value;

    const s = getComputedStyle(document.documentElement);
    const g = (name: string, fallback: string) => readCssVar(s, name, fallback);

    return {
      surface: g('--surface-bg', '#ffffff'),
      surfaceBorder: g('--surface-border', '#dddddd'),
      textPrimary: g('--text-primary', '#222222'),
      textMuted: g('--text-muted', '#888888'),
      accent: g('--accent', '#2c3e50'),
      accentHover: g('--accent-hover', '#1a2a3a'),
      accentText: g('--accent-text', '#ffffff'),
      connector: g('--chart-line', '#cccccc'),
      sexMBg: g('--sex-m-bg', '#7eb8f7'),
      sexFBg: g('--sex-f-bg', '#f7a5c0'),
      sexUBg: g('--sex-u-bg', '#cccccc'),
      sexMText: g('--sex-m-text', '#ffffff'),
      sexFText: g('--sex-f-text', '#ffffff'),
      sexUText: g('--sex-u-text', '#555555'),
      // Box colors (chart-specific tokens)
      boxBg: g('--chart-box-bg', '#ffffff'),
      boxDeceased: g('--chart-box-deceased', '#f8f8f8'),
      boxFocal: g('--chart-box-focal', '#2c3e50'),
      boxStroke: g('--chart-box-stroke', '#dddddd'),
      focalStroke: g('--chart-focal-stroke', '#1a2a3a'),
      text: g('--chart-text', '#333333'),
      textSub: g('--chart-text-sub', '#888888'),
      textFocal: g('--chart-text-focal', '#ffffff'),
      textFocalSub: g('--chart-text-focal-sub', 'rgba(255,255,255,0.65)'),
      line: g('--chart-line', '#cccccc'),
      placeholderStroke: g('--chart-placeholder-stroke', '#94a3b8'),
      placeholderText: g('--chart-placeholder-text', '#94a3b8'),
    };
  });
}
