import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import RelationshipsList, { type RelationshipListRow } from '../../src/renderer/components/RelationshipsList.vue';
import en from '../../src/renderer/i18n/en';
import sv from '../../src/renderer/i18n/sv';

beforeEach(() => {
  setActivePinia(createPinia());
});

function makeI18n(locale: 'en' | 'sv') {
  return createI18n({
    legacy: false,
    locale,
    messages: { en, sv },
  });
}

function makeRow(roleLabel: string): RelationshipListRow {
  return {
    id: 'rel-1',
    roleLabel,
    persons: [
      {
        id: 'p2',
        givenName: 'Anna',
        surname: 'Andersson',
        sex: 'F',
      },
    ],
    ariaLabel: 'edit',
  };
}

describe('RelationshipsList — foster-terminology fix', () => {
  it('renders a single role badge — never two adjacent badges', () => {
    const wrapper = mount(RelationshipsList, {
      global: { plugins: [makeI18n('sv')] },
      props: { rows: [makeRow('Fosterförälder')] },
    });
    const badges = wrapper.findAll('.type-cell .type-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].text()).toBe('Fosterförälder');
  });

  it('Swedish foster parent_child role renders as "Fosterförälder" — not "Förälder Foster"', () => {
    const wrapper = mount(RelationshipsList, {
      global: { plugins: [makeI18n('sv')] },
      props: { rows: [makeRow('Fosterförälder')] },
    });
    const html = wrapper.html();
    expect(html).toContain('Fosterförälder');
    // Composition bug regression — must not appear as a side-by-side pair.
    expect(html).not.toMatch(/Förälder\s*<\/span>\s*<span[^>]*>\s*Foster/);
  });

  it('English foster parent_child role renders as "Foster parent"', () => {
    const wrapper = mount(RelationshipsList, {
      global: { plugins: [makeI18n('en')] },
      props: { rows: [makeRow('Foster parent')] },
    });
    expect(wrapper.find('.type-cell .type-badge').text()).toBe('Foster parent');
  });

  it('couple rows pass roleLabel through unchanged', () => {
    const wrapper = mount(RelationshipsList, {
      global: { plugins: [makeI18n('en')] },
      props: { rows: [makeRow('Couple (Marriage)')] },
    });
    const badges = wrapper.findAll('.type-cell .type-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].text()).toBe('Couple (Marriage)');
  });
});
