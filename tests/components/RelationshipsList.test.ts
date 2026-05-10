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

describe('RelationshipsList — row affordances (tooltips + trash icon)', async () => {
  it('role badge has Edit-relationship tooltip + aria-label (sv)', () => {
    const wrapper = mount(RelationshipsList, {
      global: { plugins: [makeI18n('sv')] },
      props: { rows: [makeRow('Förälder')] },
    });
    const badge = wrapper.find('.type-cell .type-badge');
    expect(badge.attributes('title')).toBe('Redigera relationen');
    expect(badge.attributes('aria-label')).toBe('Redigera relationen');
  });

  it('role badge has Edit-relationship tooltip (en)', () => {
    const wrapper = mount(RelationshipsList, {
      global: { plugins: [makeI18n('en')] },
      props: { rows: [makeRow('Parent')] },
    });
    const badge = wrapper.find('.type-cell .type-badge');
    expect(badge.attributes('title')).toBe('Edit relationship');
    expect(badge.attributes('aria-label')).toBe('Edit relationship');
  });

  it('person link has Manage-{name} tooltip (sv)', () => {
    const wrapper = mount(RelationshipsList, {
      global: { plugins: [makeI18n('sv')] },
      props: { rows: [makeRow('Förälder')] },
    });
    const link = wrapper.find('.person-link');
    expect(link.attributes('title')).toBe('Hantera Anna Andersson');
    expect(link.attributes('aria-label')).toBe('Hantera Anna Andersson');
  });

  it('person link has Manage-{name} tooltip (en)', () => {
    const wrapper = mount(RelationshipsList, {
      global: { plugins: [makeI18n('en')] },
      props: { rows: [makeRow('Parent')] },
    });
    const link = wrapper.find('.person-link');
    expect(link.attributes('title')).toBe('Manage Anna Andersson');
  });

  it('remove button uses the trash icon and has Remove-relationship tooltip', () => {
    const wrapper = mount(RelationshipsList, {
      global: { plugins: [makeI18n('sv')] },
      props: { rows: [makeRow('Förälder')] },
    });
    const removeBtn = wrapper.find('[data-testid="rel-row-remove"]');
    expect(removeBtn.exists()).toBe(true);
    expect(removeBtn.attributes('title')).toBe('Ta bort relationen');
    expect(removeBtn.attributes('aria-label')).toBe('Ta bort relationen');
    // The IconTrash component renders a path with `M3 6h18` — distinguishes
    // it from the prior IconUnlink (link-shaped) glyph.
    expect(removeBtn.html()).toContain('M3 6h18');
  });

  it('emits delete from the trash button', async () => {
    const wrapper = mount(RelationshipsList, {
      global: { plugins: [makeI18n('sv')] },
      props: { rows: [makeRow('Förälder')] },
    });
    (await wrapper.find('[data-testid="rel-row-remove"]')).trigger('click');
    expect(wrapper.emitted('delete')?.[0]).toEqual(['rel-1']);
  });
});
