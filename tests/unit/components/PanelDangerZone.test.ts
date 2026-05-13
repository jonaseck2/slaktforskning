import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PanelDangerZone from '../../../src/renderer/components/PanelDangerZone.vue';
import { i18n } from '../../components/setup';

describe('PanelDangerZone', () => {
  const mockPersonsDelete = vi.fn();
  const mockPlacesDelete = vi.fn();
  const mockSourcesDelete = vi.fn();
  const mockMediaDelete = vi.fn();
  const mockGroupsDelete = vi.fn();
  const mockResearchTasksDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPersonsDelete.mockResolvedValue(undefined);
    mockPlacesDelete.mockResolvedValue(undefined);
    mockSourcesDelete.mockResolvedValue(undefined);
    mockMediaDelete.mockResolvedValue(undefined);
    mockGroupsDelete.mockResolvedValue(undefined);
    mockResearchTasksDelete.mockResolvedValue(undefined);
    (window as unknown as { api: unknown }).api = {
      persons: { delete: mockPersonsDelete },
      places: { delete: mockPlacesDelete },
      sources: { delete: mockSourcesDelete },
      media: { delete: mockMediaDelete },
      groups: { delete: mockGroupsDelete },
      researchTasks: { delete: mockResearchTasksDelete },
    };
  });

  function mountZone(props: Record<string, unknown>) {
    return mount(PanelDangerZone, {
      global: { plugins: [i18n] },
      props: {
        entityType: 'person',
        entityId: 'p-1',
        entityLabel: 'John Doe',
        cascadeSummary: [],
        ...props,
      },
    });
  }

  it('renders the delete button with entity-typed label', () => {
    const wrapper = mountZone({});
    expect(wrapper.find('.panel-danger-zone').exists()).toBe(true);
    expect(wrapper.text()).toContain('person');
  });

  it('opens confirm dialog on click and shows cascade summary', async () => {
    const wrapper = mountZone({ cascadeSummary: ['3 events will also be removed'] });
    await wrapper.find('.panel-danger-zone button').trigger('click');
    await flushPromises();
    // ConfirmModal renders the cascade summary as paragraphs
    expect(wrapper.text()).toContain('3 events will also be removed');
    expect(wrapper.text()).toContain('John Doe');
  });

  it('dispatches to the correct delete API based on entityType', async () => {
    const wrapper = mountZone({
      entityType: 'place',
      entityId: 'pl-1',
      entityLabel: 'Stockholm',
    });
    await wrapper.find('.panel-danger-zone button').trigger('click');
    await flushPromises();
    // ConfirmModal forwards "save" through BaseSubPanel — emit confirm directly
    wrapper.findComponent({ name: 'ConfirmModal' }).vm.$emit('confirm');
    await flushPromises();
    expect(mockPlacesDelete).toHaveBeenCalledWith('pl-1');
    expect(mockPersonsDelete).not.toHaveBeenCalled();
  });

  it('emits "deleted" after successful delete', async () => {
    const wrapper = mountZone({});
    await wrapper.find('.panel-danger-zone button').trigger('click');
    await flushPromises();
    wrapper.findComponent({ name: 'ConfirmModal' }).vm.$emit('confirm');
    await flushPromises();
    expect(mockPersonsDelete).toHaveBeenCalledWith('p-1');
    expect(wrapper.emitted('deleted')).toBeTruthy();
  });

  it('hidden when readonly', () => {
    const wrapper = mountZone({ readonly: true });
    expect(wrapper.find('.panel-danger-zone').exists()).toBe(false);
  });
});
