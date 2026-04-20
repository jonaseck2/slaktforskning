// Reactive theme/appearance signal for chart components.
// Spec: docs/plans/2026-04-19-reactive-theme-signal-design.md
//
// When the user toggles theme (forest/nordic/twilight) or appearance
// (light/dark/high-contrast), chart color composables must invalidate so
// inline SVG attributes like :fill="nameColor(box)" rebind. Today their
// `computed` has no reactive dep on the html class list, so they cache
// forever.

import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { useThemeSignal } from '../../src/renderer/composables/useThemeSignal';
import { useChartColors, EXPORT_COLORS } from '../../src/renderer/composables/useChartColors';
import { useFanThemeColors } from '../../src/renderer/composables/useFanThemeColors';

function setHtmlVars(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

function clearHtmlState() {
  const root = document.documentElement;
  root.className = '';
  for (const prop of [
    '--text-primary', '--surface-bg', '--accent',
    '--sex-m-bg', '--sex-f-bg', '--sex-u-bg', '--sidebar-bg',
  ]) {
    root.style.removeProperty(prop);
  }
}

afterEach(clearHtmlState);

describe('useThemeSignal', () => {
  it('increments themeVersion when html class changes', async () => {
    const version = useThemeSignal();
    const before = version.value;

    document.documentElement.classList.add('dark');
    await nextTick();

    expect(version.value).toBeGreaterThan(before);
  });

  it('increments themeVersion when an attribute other than class would NOT trigger it', async () => {
    // Guardrail: make sure the observer is scoped to `class` mutations.
    // Setting an inline style (different attribute) should not bump the signal.
    const version = useThemeSignal();
    const before = version.value;

    document.documentElement.setAttribute('lang', 'sv');
    await nextTick();

    expect(version.value).toBe(before);
    document.documentElement.removeAttribute('lang');
  });
});

describe('useChartColors(true) reacts to theme changes', () => {
  it('re-reads --text-primary when the class list changes', async () => {
    setHtmlVars({ '--text-primary': '#111111' });
    const colors = useChartColors(true);
    expect(colors.value.textPrimary).toBe('#111111');

    // Change CSS var AND flip a class to trigger the observer.
    setHtmlVars({ '--text-primary': '#eeeeee' });
    document.documentElement.classList.add('dark');
    await nextTick();

    expect(colors.value.textPrimary).toBe('#eeeeee');
  });

  it('re-reads --accent when switching themes', async () => {
    setHtmlVars({ '--accent': '#2d5a27' });
    const colors = useChartColors(true);
    expect(colors.value.accent).toBe('#2d5a27');

    setHtmlVars({ '--accent': '#6c5ce7' });
    document.documentElement.classList.add('theme-twilight');
    await nextTick();

    expect(colors.value.accent).toBe('#6c5ce7');
  });
});

describe('useChartColors(false) stays invariant', () => {
  it('does not track the theme signal — always returns EXPORT_COLORS by reference', async () => {
    const colors = useChartColors(false);
    const first = colors.value;

    document.documentElement.classList.add('dark');
    await nextTick();
    document.documentElement.classList.add('theme-nordic');
    await nextTick();
    document.documentElement.classList.add('high-contrast');
    await nextTick();

    expect(colors.value).toBe(first);
    expect(colors.value).toBe(EXPORT_COLORS);
  });
});

describe('useFanThemeColors', () => {
  it('re-reads readThemeColors / isDarkMode / isHighContrast on class change', async () => {
    setHtmlVars({
      '--accent': '#2d5a27',
      '--sidebar-bg': '#1a2e1a',
      '--sex-m-bg': '#e0eaf2',
      '--sex-f-bg': '#f5e8ee',
      '--sex-u-bg': '#e8e8e8',
    });
    const chartTheme = useFanThemeColors();
    expect(chartTheme.value.theme.accent).toBe('#2d5a27');
    expect(chartTheme.value.dark).toBe(false);
    expect(chartTheme.value.highContrast).toBe(false);

    setHtmlVars({ '--accent': '#6c5ce7' });
    document.documentElement.classList.add('dark', 'high-contrast');
    await nextTick();

    expect(chartTheme.value.theme.accent).toBe('#6c5ce7');
    expect(chartTheme.value.dark).toBe(true);
    expect(chartTheme.value.highContrast).toBe(true);
  });
});
