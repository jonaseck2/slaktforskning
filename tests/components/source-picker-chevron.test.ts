import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import sv from '../../src/renderer/i18n/sv';
import SourcePicker from '../../src/renderer/components/SourcePicker.vue';

// SourcePicker resolves the selected source's display name via window.api when
// modelValue is set. Stub it so the selected-source mount doesn't throw.
beforeEach(() => {
  (globalThis as unknown as { window: { api: unknown } }).window.api = {
    sources: {
      get: vi.fn().mockResolvedValue({ id: 'src-1', title: 'Test source' }),
      list: vi.fn().mockResolvedValue([]),
      listPage: vi.fn().mockResolvedValue({ sources: [], total: 0 }),
    },
  };
});

/**
 * A2 (Ben rapport 100 §2): the source field must visibly signal that it opens
 * a dropdown. The friction Ben reported was that the field looked like a plain
 * text input. We render a decorative ▾ chevron affordance.
 *
 * The chevron's exact pixel position is CSS and not asserted here; what this
 * test guards is the user-observable claim — the affordance is present, is the
 * down-chevron glyph, and is decorative (aria-hidden) so it doesn't pollute the
 * combobox's accessible name. This replaces the plan's manual screenshot with a
 * mechanical regression guard.
 */
function mountPicker(modelValue: string | null = null) {
  const i18n = createI18n({ legacy: false, locale: 'sv', messages: { sv } });
  return mount(SourcePicker, {
    props: { modelValue },
    global: { plugins: [i18n] },
  });
}

describe('SourcePicker dropdown affordance (Rapport 100 §2)', () => {
  it('renders a decorative ▾ chevron when no source is selected', () => {
    const chevron = mountPicker(null).find('.picker-chevron');
    expect(chevron.exists()).toBe(true);
    expect(chevron.text()).toBe('▾');
    expect(chevron.attributes('aria-hidden')).toBe('true');
  });

  it('keeps the chevron when a source is selected (alongside the edit button)', () => {
    const wrapper = mountPicker('src-1');
    expect(wrapper.find('.picker-chevron').exists()).toBe(true);
    expect(wrapper.find('.edit-source-btn').exists()).toBe(true);
  });
});
