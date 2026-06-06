import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { mount, flushPromises } from '@vue/test-utils';
import CitationModal from '../../src/renderer/components/modals/CitationModal.vue';
import svMessages from '../../src/renderer/i18n/sv';
import { pinia } from './setup';

// Task 1 — Ben rapport 100 §1, §3, §4.
// Verify that the citation modal renders the updated Swedish label strings:
//   A1: title "Lägg till källhänvisning" (was "Lägg till hänvisning")
//   A3: page/location label "Sida / Plats / URL" (was "Sida / Plats")
//   A4: confidence section label "Källans tillförlitlighet" (was "Tillförlitlighet")

const svI18n = createI18n({
  legacy: false,
  locale: 'sv',
  messages: { sv: svMessages },
});

const globalConfig = {
  plugins: [svI18n, pinia],
  stubs: {
    RouterLink: { template: '<a><slot /></a>' },
    Teleport: { template: '<div><slot /></div>' },
    BaseSubPanel: { template: '<div class="stub-base-sub-panel"><slot /><slot name="subpanels" /></div>' },
    SourcePicker: { template: '<div class="stub-source-picker" />' },
    SourceModal: { template: '<div class="stub-source-modal" />' },
  },
};

describe('CitationModal — Swedish label rewrites (rapport 100 §1, §3, §4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = {
      citations: {
        get: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'new-cit' }),
        update: vi.fn().mockResolvedValue(null),
      },
      sources: {
        get: vi.fn().mockResolvedValue(null),
        list: vi.fn().mockResolvedValue([]),
        search: vi.fn().mockResolvedValue([]),
      },
      events: {
        get: vi.fn().mockResolvedValue(null),
      },
      persons: {
        getNames: vi.fn().mockResolvedValue([]),
      },
      relationships: {
        get: vi.fn().mockResolvedValue(null),
      },
      places: {
        get: vi.fn().mockResolvedValue(null),
      },
    };
  });

  it('A1: modal title is "Lägg till källhänvisning" in add mode', async () => {
    const wrapper = mount(CitationModal, {
      global: globalConfig,
      props: {},
    });
    await flushPromises();

    // The modal title is computed as t('citations.addTitle') when not editing.
    // BaseSubPanel is stubbed so the title prop text is not rendered in its slot,
    // but we can check the computed prop directly via the vm.
    const vm = wrapper.vm as unknown as { modalTitle: string };
    expect(vm.modalTitle).toBe('Lägg till källhänvisning');
  });

  it('A3: page/location field label contains "Sida / Plats / URL"', async () => {
    const wrapper = mount(CitationModal, {
      global: globalConfig,
      props: {},
    });
    await flushPromises();

    // The label is rendered inside the stub slot.
    expect(wrapper.text()).toContain('Sida / Plats / URL');
  });

  it('A4: confidence section label is "Källans tillförlitlighet"', async () => {
    const wrapper = mount(CitationModal, {
      global: globalConfig,
      props: {},
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Källans tillförlitlighet');
  });

  it('A5: confidence buttons render most-reliable-first (Primärkälla → Sekundärkälla → Tveksam → Opålitlig)', async () => {
    const wrapper = mount(CitationModal, {
      global: globalConfig,
      props: {},
    });
    await flushPromises();

    const buttons = wrapper.findAll('.ep-seg-opt');
    expect(buttons).toHaveLength(4);
    expect(buttons[0].text()).toBe('Primärkälla');
    expect(buttons[1].text()).toBe('Sekundärkälla');
    expect(buttons[2].text()).toBe('Tveksam');
    expect(buttons[3].text()).toBe('Opålitlig');
  });
});
