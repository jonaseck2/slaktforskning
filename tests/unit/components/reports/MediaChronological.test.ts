import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import MediaChronological from '../../../../src/renderer/components/reports/primitives/MediaChronological.vue';

const mockApi = {
  media: {
    readAsDataUrl: vi.fn(async (id: string) => `data:image/jpeg;base64,${id}`),
  },
};
// @ts-expect-error test shim
globalThis.window = { api: mockApi } as never;

describe('MediaChronological', () => {
  beforeEach(() => {
    mockApi.media.readAsDataUrl.mockClear();
  });

  it('filters out documents by default', () => {
    const wrapper = mount(MediaChronological, {
      props: {
        items: [
          { id: '1', title: 'Photo', notes: null, fileRef: '/a/b.jpg', format: 'image/jpeg', inferredDateISO: null },
          { id: '2', title: 'Doc', notes: null, fileRef: '/a/b.pdf', format: 'application/pdf', inferredDateISO: null },
        ],
      },
    });
    expect(wrapper.findAll('.media-item').length).toBe(1);
    expect(wrapper.text()).toContain('Photo');
    expect(wrapper.text()).not.toContain('Doc');
  });

  it('includes documents when toggle on', () => {
    const wrapper = mount(MediaChronological, {
      props: {
        includeDocuments: true,
        items: [
          { id: '1', title: 'Photo', notes: null, fileRef: '/a/b.jpg', format: 'image/jpeg', inferredDateISO: null },
          { id: '2', title: 'Doc', notes: null, fileRef: '/a/b.pdf', format: 'application/pdf', inferredDateISO: null },
        ],
      },
    });
    expect(wrapper.findAll('.media-item').length).toBe(2);
  });

  it('renders nothing when items empty', () => {
    const wrapper = mount(MediaChronological, { props: { items: [] } });
    expect(wrapper.find('.media-chronological').exists()).toBe(false);
  });

  it('hides captions when showCaptions false', () => {
    const wrapper = mount(MediaChronological, {
      props: {
        showCaptions: false,
        items: [{ id: '1', title: 'Photo', notes: null, fileRef: '/a/b.jpg', format: 'image/jpeg', inferredDateISO: null }],
      },
    });
    expect(wrapper.find('.media-caption').exists()).toBe(false);
  });

  it('loads image data URLs via window.api.media.readAsDataUrl', async () => {
    const wrapper = mount(MediaChronological, {
      props: {
        items: [
          { id: 'abc', title: 'Photo', notes: null, fileRef: '/a/b.jpg', format: 'image/jpeg', inferredDateISO: null },
        ],
      },
    });
    await flushPromises();
    expect(mockApi.media.readAsDataUrl).toHaveBeenCalledWith('abc');
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('data:image/jpeg;base64,abc');
  });
});
