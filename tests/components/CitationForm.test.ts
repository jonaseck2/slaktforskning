import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import CitationForm from '../../src/renderer/components/CitationForm.vue';
import { i18n } from './setup';

describe('CitationForm', () => {
  const mockCitationsCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCitationsCreate.mockResolvedValue({ id: 'cit-1' });
    (window as unknown as { api: unknown }).api = {
      citations: { create: mockCitationsCreate },
      sources: {
        list: vi.fn().mockResolvedValue([{ id: 'src-1', title: 'Test Source' }]),
      },
    };
  });

  it('passes relationship_id when relationshipId prop is provided', async () => {
    const wrapper = mount(CitationForm, {
      global: { plugins: [i18n] },
      props: { relationshipId: 'rel-123' },
    });
    await flushPromises();

    // Select the source from the dropdown
    await wrapper.find('select').setValue('src-1');

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockCitationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        source_id: 'src-1',
        relationship_id: 'rel-123',
      }),
    );
  });
});
