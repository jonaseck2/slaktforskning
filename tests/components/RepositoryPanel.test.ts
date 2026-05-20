/**
 * RepositoryPanel — user-goal coverage (T10).
 *
 * User goal: the genealogist must be able to author, view, edit, and remove
 * every primitive the data model owns. Before T10, `repositories` had zero
 * UI surface — users could not see, edit, or delete repositories without the
 * MCP or external tools. This test asserts the panel shows what the api
 * returned, persists field edits via window.api.repositories.update, and
 * dispatches delete via the PanelDangerZone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import RepositoryPanel from '../../src/renderer/components/RepositoryPanel.vue';
import PanelDangerZone from '../../src/renderer/components/PanelDangerZone.vue';
import ConfirmModal from '../../src/renderer/components/ConfirmModal.vue';
import { i18n } from './setup';

interface ApiMocks {
  repositories: {
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    forSource: ReturnType<typeof vi.fn>;
  };
  sources: { list: ReturnType<typeof vi.fn> };
  onDataChanged: ReturnType<typeof vi.fn>;
  offDataChanged: ReturnType<typeof vi.fn>;
}

function installApi(): ApiMocks {
  const api: ApiMocks = {
    repositories: {
      get: vi.fn(async (id: string) => {
        if (id === 'r1') {
          return {
            id: 'r1',
            name: 'Riksarkivet',
            address: 'Marieberg',
            city: 'Stockholm',
            postal_code: '11221',
            state: null,
            country: 'Sverige',
            phone: null,
            email: null,
            web: 'https://riksarkivet.se',
            call_number: null,
            notes: '',
            created_at: '2025-01-01T00:00:00Z',
          };
        }
        return null;
      }),
      update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({
        id,
        ...patch,
      })),
      delete: vi.fn().mockResolvedValue(true),
      forSource: vi.fn(async () => []),
    },
    sources: { list: vi.fn(async () => []) },
    onDataChanged: vi.fn(),
    offDataChanged: vi.fn(),
  };
  (window as unknown as { api: ApiMocks }).api = api;
  return api;
}

describe('RepositoryPanel', () => {
  let api: ApiMocks;
  beforeEach(() => { api = installApi(); });

  it('renders the loaded repository name and city', async () => {
    const w = mount(RepositoryPanel, {
      global: { plugins: [i18n] },
      props: { repositoryId: 'r1' },
    });
    await flushPromises();
    await nextTick();
    expect(api.repositories.get).toHaveBeenCalledWith('r1');
    expect(w.text()).toContain('Riksarkivet');
    // City value is bound via :value on an input — read DOM value instead of text.
    const inputs = w.findAll('input.compact-control');
    const values = inputs.map(i => (i.element as HTMLInputElement).value);
    expect(values).toContain('Stockholm');
  });

  it('persists a field edit on blur via window.api.repositories.update', async () => {
    const w = mount(RepositoryPanel, {
      global: { plugins: [i18n] },
      props: { repositoryId: 'r1' },
    });
    await flushPromises();
    await nextTick();

    const inputs = w.findAll('input.compact-control');
    // First input is the Name field
    const nameInput = inputs[0]!;
    await nameInput.setValue('National Archives');
    await nameInput.trigger('blur');
    await flushPromises();

    expect(api.repositories.update).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ name: 'National Archives' }),
    );
  });

  it('shows a Danger Zone delete button that dispatches repositories.delete after confirm', async () => {
    const w = mount(RepositoryPanel, {
      global: { plugins: [i18n] },
      props: { repositoryId: 'r1' },
    });
    await flushPromises();
    await nextTick();

    const danger = w.findComponent(PanelDangerZone);
    expect(danger.exists(), 'PanelDangerZone should be rendered').toBe(true);
    expect(danger.props('entityType')).toBe('repository');

    // Open the confirm dialog
    const trashBtn = danger.find('button');
    await trashBtn.trigger('click');
    await nextTick();

    const confirm = danger.findComponent(ConfirmModal);
    expect(confirm.exists()).toBe(true);
    expect(confirm.props('visible')).toBe(true);

    // Confirm
    confirm.vm.$emit('confirm');
    await flushPromises();

    expect(api.repositories.delete).toHaveBeenCalledWith('r1');
  });

  it('emits close after a successful delete', async () => {
    const w = mount(RepositoryPanel, {
      global: { plugins: [i18n] },
      props: { repositoryId: 'r1' },
    });
    await flushPromises();
    await nextTick();

    const danger = w.findComponent(PanelDangerZone);
    danger.vm.$emit('deleted');
    await flushPromises();

    expect(w.emitted('close')).toBeTruthy();
  });
});
