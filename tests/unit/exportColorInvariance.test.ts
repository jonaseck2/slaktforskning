// @vitest-environment happy-dom
//
// Regression tests for export-colour invariance.
// Background: theme tokens (Forest / Nordic / Twilight × light / dark / high-contrast)
// must never leak into exported wall-chart SVGs or into useChartColors(false).
// Spec: docs/superpowers/specs/2026-04-18-export-color-invariance-tests-design.md

import { afterEach, describe, expect, it } from 'vitest';
import {
  generatePedigreeWallChart,
  generateDescendantWallChart,
  type WallChartAncestorTree,
  type WallChartDescendantTree,
  type WallChartOptions,
  type ColorMode,
} from '../../src/api/wall-charts';
import { EXPORT_COLORS, useChartColors } from '../../src/renderer/composables/useChartColors';

// Every CSS variable that any theme / appearance layer touches. Setting these
// to a sentinel colour simulates "theme is doing something" so we can detect
// leaks. Keep this list broad — better to over-cover than miss a future token.
const THEMED_VARS = [
  '--sidebar-bg',
  '--sidebar-text',
  '--sidebar-text-muted',
  '--sidebar-active-bg',
  '--sidebar-active-text',
  '--sidebar-border',
  '--surface-bg',
  '--surface',
  '--surface-hover',
  '--surface-border',
  '--surface-border-subtle',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--accent',
  '--accent-hover',
  '--accent-text',
  '--sex-m-bg',
  '--sex-f-bg',
  '--sex-u-bg',
  '--sex-m-text',
  '--sex-f-text',
  '--sex-u-text',
  '--chart-box-bg',
  '--chart-box-deceased',
  '--chart-box-focal',
  '--chart-box-stroke',
  '--chart-focal-stroke',
  '--chart-text',
  '--chart-text-sub',
  '--chart-text-focal',
  '--chart-text-focal-sub',
  '--chart-line',
  '--chart-placeholder-stroke',
  '--chart-placeholder-text',
];

// Every theme / appearance combination we support in the renderer.
const THEME_STATES: Array<{ name: string; classes: string[] }> = [
  { name: 'forest light', classes: [] },
  { name: 'forest dark', classes: ['dark'] },
  { name: 'forest high-contrast', classes: ['high-contrast'] },
  { name: 'forest dark + hc', classes: ['dark', 'high-contrast'] },
  { name: 'nordic light', classes: ['theme-nordic'] },
  { name: 'nordic dark', classes: ['theme-nordic', 'dark'] },
  { name: 'nordic high-contrast', classes: ['theme-nordic', 'high-contrast'] },
  { name: 'twilight light', classes: ['theme-twilight'] },
  { name: 'twilight dark', classes: ['theme-twilight', 'dark'] },
  { name: 'twilight high-contrast', classes: ['theme-twilight', 'high-contrast'] },
];

const SENTINEL = 'magenta';

function applyThemeState(classes: string[]) {
  const root = document.documentElement;
  root.className = classes.join(' ');
  for (const v of THEMED_VARS) {
    root.style.setProperty(v, SENTINEL);
  }
}

function resetThemeState() {
  const root = document.documentElement;
  root.className = '';
  for (const v of THEMED_VARS) {
    root.style.removeProperty(v);
  }
}

afterEach(resetThemeState);

function makeAncestorTree(): WallChartAncestorTree {
  return {
    person: {
      id: 'p1',
      givenName: 'Anna',
      surname: 'Bergström',
      sex: 'F',
      birthDate: '1850-01-01',
      deathDate: '1920-06-12',
      birthPlace: 'Stockholm',
      deathPlace: 'Uppsala',
      photoBase64: null,
    },
    father: {
      person: {
        id: 'p2',
        givenName: 'Erik',
        surname: 'Bergström',
        sex: 'M',
        birthDate: '1820-04-15',
        deathDate: '1885-09-30',
        birthPlace: 'Uppsala',
        deathPlace: null,
        photoBase64: null,
      },
      father: null,
      mother: null,
    },
    mother: {
      person: {
        id: 'p3',
        givenName: 'Maria',
        surname: 'Lindgren',
        sex: 'F',
        birthDate: '1825-07-22',
        deathDate: null,
        birthPlace: 'Göteborg',
        deathPlace: null,
        photoBase64: null,
      },
      father: null,
      mother: null,
    },
  };
}

function makeDescendantTree(): WallChartDescendantTree {
  return {
    person: {
      id: 'd1',
      givenName: 'Karl',
      surname: 'Nilsson',
      sex: 'M',
      birthDate: '1800-01-01',
      deathDate: '1870-01-01',
      birthPlace: 'Malmö',
      deathPlace: null,
      photoBase64: null,
    },
    children: [
      {
        person: {
          id: 'd2',
          givenName: 'Sven',
          surname: 'Nilsson',
          sex: 'M',
          birthDate: '1830-03-10',
          deathDate: null,
          birthPlace: 'Malmö',
          deathPlace: null,
          photoBase64: null,
        },
        children: [],
      },
      {
        person: {
          id: 'd3',
          givenName: 'Ingrid',
          surname: 'Nilsson',
          sex: 'F',
          birthDate: '1832-08-05',
          deathDate: null,
          birthPlace: 'Malmö',
          deathPlace: null,
          photoBase64: null,
        },
        children: [],
      },
    ],
  };
}

const BASE_OPTIONS: WallChartOptions = {
  chartType: 'pedigree',
  paperSize: 'A2',
  orientation: 'landscape',
  generations: 3,
  showDates: true,
  showPlaces: true,
  showPhotos: false,
  fontSize: 'medium',
  colorMode: 'sex-colored',
  title: 'Invariance Test',
};

const COLOR_MODES: ColorMode[] = ['themed', 'bw', 'sex-colored'];

describe('export colour invariance', () => {
  describe('wall-charts SVG output is identical across every theme state', () => {
    for (const colorMode of COLOR_MODES) {
      it(`pedigree SVG is theme-invariant (colorMode=${colorMode})`, () => {
        const tree = makeAncestorTree();
        const opts: WallChartOptions = { ...BASE_OPTIONS, colorMode };

        resetThemeState();
        const baseline = generatePedigreeWallChart(tree, opts);

        for (const state of THEME_STATES) {
          applyThemeState(state.classes);
          const current = generatePedigreeWallChart(tree, opts);
          expect(current, `pedigree SVG drifted under theme "${state.name}"`).toBe(baseline);
        }
      });

      it(`descendant SVG is theme-invariant (colorMode=${colorMode})`, () => {
        const tree = makeDescendantTree();
        const opts: WallChartOptions = { ...BASE_OPTIONS, chartType: 'descendant', colorMode };

        resetThemeState();
        const baseline = generateDescendantWallChart(tree, opts);

        for (const state of THEME_STATES) {
          applyThemeState(state.classes);
          const current = generateDescendantWallChart(tree, opts);
          expect(current, `descendant SVG drifted under theme "${state.name}"`).toBe(baseline);
        }
      });
    }

    it('sentinel colour never appears in any generated SVG', () => {
      // Hard guarantee: if anything in wall-charts.ts starts reading CSS vars
      // set on :root, the magenta sentinel will end up in the output.
      const ancestor = makeAncestorTree();
      const descendant = makeDescendantTree();

      for (const state of THEME_STATES) {
        for (const colorMode of COLOR_MODES) {
          applyThemeState(state.classes);
          const pedSvg = generatePedigreeWallChart(ancestor, { ...BASE_OPTIONS, colorMode });
          const descSvg = generateDescendantWallChart(descendant, {
            ...BASE_OPTIONS,
            chartType: 'descendant',
            colorMode,
          });
          expect(pedSvg).not.toContain(SENTINEL);
          expect(descSvg).not.toContain(SENTINEL);
        }
      }
    });
  });

  describe('useChartColors(false) returns EXPORT_COLORS under every theme state', () => {
    it('returns a value deep-equal to EXPORT_COLORS regardless of theme tokens', () => {
      for (const state of THEME_STATES) {
        applyThemeState(state.classes);
        const colors = useChartColors(false).value;
        expect(colors, `useChartColors(false) drifted under theme "${state.name}"`).toEqual(
          EXPORT_COLORS,
        );
      }
    });

    it('returns the EXPORT_COLORS constant by reference (no per-call copy)', () => {
      // Referential check: guards against someone rewriting the non-themed
      // branch to build a new object each call — that would open a door for
      // subtle drift if the build logic ever touched CSS state.
      for (const state of THEME_STATES) {
        applyThemeState(state.classes);
        expect(useChartColors(false).value).toBe(EXPORT_COLORS);
      }
    });
  });
});
