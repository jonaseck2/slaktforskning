import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ResearchTaskModal from '../../src/renderer/components/modals/ResearchTaskModal.vue';
import { i18n } from './setup';

/**
 * Surface contract: when ResearchTaskModal is opened from PersonPanel's
 * "+ Task" CTA with `personId`, saving must auto-link the new task to
 * that person via `task_links` (entity_type='person'). Without this the
 * CTA produces an orphan task — the same shape as the historical
 * "PlacePanel + Add person" bug.
 */
describe('ResearchTaskModal — host-person link on create', () => {
  const mockCreate = vi.fn();
  const mockAddLink = vi.fn();
  const mockGetNames = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'new-task-id', task: 'x', priority: 1, status: 'open' });
    mockAddLink.mockResolvedValue({ id: 'link-1' });
    mockGetNames.mockResolvedValue([{ given_name: 'Anna', surname: 'Lind' }]);

    (window as unknown as { api: unknown }).api = {
      researchTasks: {
        create: mockCreate,
        update: vi.fn(),
        addLink: mockAddLink,
      },
      persons: { getNames: mockGetNames },
    };
  });

  it('calls addLink with the host person id after creating the task', async () => {
    const wrapper = mount(ResearchTaskModal, {
      global: { plugins: [i18n] },
      props: { personId: 'host-person-id', mode: 'standalone' },
    });
    await flushPromises();

    // Type a task title and save.
    const textarea = wrapper.find('textarea');
    await textarea.setValue('Find the baptism record');

    // Trigger the BaseSubPanel's save action by emitting from the inner component.
    // BaseSubPanel surfaces save as a button; locate it.
    const saveBtn = wrapper.findAll('button').find(b => /save|spara/i.test(b.text()));
    expect(saveBtn).toBeTruthy();
    await saveBtn!.trigger('click');
    await flushPromises();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockAddLink).toHaveBeenCalledWith('new-task-id', 'person', 'host-person-id');
  });

  it('does NOT call addLink when no personId is supplied (standalone create)', async () => {
    const wrapper = mount(ResearchTaskModal, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone' },
    });
    await flushPromises();

    await wrapper.find('textarea').setValue('Generic task');

    const saveBtn = wrapper.findAll('button').find(b => /save|spara/i.test(b.text()));
    await saveBtn!.trigger('click');
    await flushPromises();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockAddLink).not.toHaveBeenCalled();
  });
});
