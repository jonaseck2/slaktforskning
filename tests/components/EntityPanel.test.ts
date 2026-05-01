import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import EntityPanel from '../../src/renderer/components/EntityPanel.vue';
import { i18n } from './setup';

describe('EntityPanel', () => {
  it('renders empty state when entity is null', () => {
    const w = mount(EntityPanel, {
      global: { plugins: [i18n] },
      props: { entityType: 'person', entity: null, label: 'Person' },
    });
    expect(w.find('.panel-empty').exists()).toBe(true);
  });

  it('emits close when close button clicked', async () => {
    const w = mount(EntityPanel, {
      global: { plugins: [i18n] },
      props: { entityType: 'person', entity: { id: '1' }, label: 'Person' },
      slots: { default: '<div>content</div>' },
    });
    await w.find('[data-testid="entity-close"]').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('emits edit when edit button clicked', async () => {
    const w = mount(EntityPanel, {
      global: { plugins: [i18n] },
      props: { entityType: 'person', entity: { id: '1' }, label: 'Person', editable: true },
    });
    await w.find('[data-testid="entity-edit"]').trigger('click');
    expect(w.emitted('edit')).toHaveLength(1);
  });

  it('renders header slot content when entity is set', () => {
    const w = mount(EntityPanel, {
      global: { plugins: [i18n] },
      props: { entityType: 'place', entity: { id: '1' }, label: 'Plats' },
      slots: {
        header: '<div class="panel-name">My Place</div>',
        default: '<div class="my-section">body</div>',
      },
    });
    expect(w.find('.panel-name').text()).toBe('My Place');
    expect(w.find('.my-section').exists()).toBe(true);
  });
});
