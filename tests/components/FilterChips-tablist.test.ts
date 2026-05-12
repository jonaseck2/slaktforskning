// Asserts that FilterChips, when used in `role="tablist"` mode, exposes the
// ARIA tab pattern a screen reader expects: a tablist container, a tab role
// per chip, aria-selected reflecting the active value, and aria-controls
// pointing at a tabpanel id derived from the configured prefix.
//
// Why this matters: before this contract, the Settings tab strip rendered as
// a row of role=button chips. NVDA announced "Länkregler, button, 3 of 11"
// instead of "Länkregler, tab, 3 of 4 selected". The plan
// (docs/plans/2026-05-12-app-a11y-gaps.md, Task 1) calls out this as a
// blocking screen-reader regression. This test pins the contract so a future
// FilterChips refactor can't silently revert it.

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FilterChips from '../../src/renderer/components/ui/FilterChips.vue';
import { i18n } from './setup';

describe('FilterChips role="tablist"', () => {
  const options = [
    { value: 'database', label: 'Databas' },
    { value: 'defaults', label: 'Standardval' },
    { value: 'link-rules', label: 'Länkregler' },
    { value: 'gazetteers', label: 'Ortsregister' },
  ];

  it('marks the bar as a tablist with the supplied aria-label', () => {
    const wrapper = mount(FilterChips, {
      global: { plugins: [i18n] },
      props: {
        role: 'tablist',
        tabpanelIdPrefix: 'settings',
        ariaLabel: 'Inställningar',
        options,
        modelValue: 'link-rules',
      },
    });
    const bar = wrapper.find('.filter-chips-bar');
    expect(bar.attributes('role')).toBe('tablist');
    expect(bar.attributes('aria-label')).toBe('Inställningar');
  });

  it('marks each chip as a tab with aria-selected reflecting the active value', () => {
    const wrapper = mount(FilterChips, {
      global: { plugins: [i18n] },
      props: {
        role: 'tablist',
        tabpanelIdPrefix: 'settings',
        ariaLabel: 'Inställningar',
        options,
        modelValue: 'link-rules',
      },
    });
    const chips = wrapper.findAll('.chip-btn');
    expect(chips.length).toBe(4);
    for (const chip of chips) {
      expect(chip.attributes('role')).toBe('tab');
      expect(['true', 'false']).toContain(chip.attributes('aria-selected'));
    }
    // Exactly one tab is selected — the active one.
    const selected = chips.filter((c) => c.attributes('aria-selected') === 'true');
    expect(selected.length).toBe(1);
    expect(selected[0].text()).toContain('Länkregler');
  });

  it('wires aria-controls and id to the panel-prefix so a screen reader can jump tab → panel', () => {
    const wrapper = mount(FilterChips, {
      global: { plugins: [i18n] },
      props: {
        role: 'tablist',
        tabpanelIdPrefix: 'settings',
        ariaLabel: 'Inställningar',
        options,
        modelValue: 'database',
      },
    });
    const chips = wrapper.findAll('.chip-btn');
    expect(chips[0].attributes('id')).toBe('settings-tab-database');
    expect(chips[0].attributes('aria-controls')).toBe('settings-database');
    expect(chips[2].attributes('id')).toBe('settings-tab-link-rules');
    expect(chips[2].attributes('aria-controls')).toBe('settings-link-rules');
  });

  it('uses roving tabindex so only the active tab is in the tab order', () => {
    const wrapper = mount(FilterChips, {
      global: { plugins: [i18n] },
      props: {
        role: 'tablist',
        tabpanelIdPrefix: 'settings',
        ariaLabel: 'Inställningar',
        options,
        modelValue: 'defaults',
      },
    });
    const chips = wrapper.findAll('.chip-btn');
    const tabIndexes = chips.map((c) => c.attributes('tabindex'));
    // Exactly one chip has tabindex=0; the rest are -1 (roving tabindex).
    expect(tabIndexes.filter((t) => t === '0').length).toBe(1);
    expect(tabIndexes.filter((t) => t === '-1').length).toBe(3);
    // The active one is the focusable one.
    expect(chips[1].attributes('tabindex')).toBe('0');
  });

  it('default (filter) mode does NOT add tab roles — chips remain plain buttons', () => {
    const wrapper = mount(FilterChips, {
      global: { plugins: [i18n] },
      props: { options, modelValue: 'database' },
    });
    const bar = wrapper.find('.filter-chips-bar');
    expect(bar.attributes('role')).toBeUndefined();
    const chips = wrapper.findAll('.chip-btn');
    for (const chip of chips) {
      expect(chip.attributes('role')).toBeUndefined();
      expect(chip.attributes('aria-selected')).toBeUndefined();
      expect(chip.attributes('aria-controls')).toBeUndefined();
      expect(chip.attributes('tabindex')).toBeUndefined();
    }
  });
});
