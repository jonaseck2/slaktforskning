import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import MediaChronological from '../../../../src/renderer/components/reports/primitives/MediaChronological.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { reports: { common: { fromLeft: 'From left:' } } } },
});

const mockApi = {
  media: {
    readAsDataUrl: vi.fn(async (id: string) => `data:image/jpeg;base64,${id}`),
  },
  mediaRegions: {
    getForMedia: vi.fn(async () => []),
  },
};
// @ts-expect-error test shim
globalThis.window = { api: mockApi } as never;

const globalOpts = { plugins: [i18n] };

describe('MediaChronological', () => {
  beforeEach(() => {
    mockApi.media.readAsDataUrl.mockClear();
    mockApi.mediaRegions.getForMedia.mockClear();
  });

  it('filters out documents by default', () => {
    const wrapper = mount(MediaChronological, {
      global: globalOpts,
      props: {
        items: [
          { id: '1', title: 'Photo', notes: null, fileRef: '/a/b.jpg', format: 'image/jpeg', inferredDateISO: null },
          { id: '2', title: 'Doc', notes: null, fileRef: '/a/b.pdf', format: 'application/pdf', inferredDateISO: null },
        ],
      },
    });
    expect(wrapper.findAll('.media-item').length).toBe(1);
  });

  it('includes documents when toggle on', () => {
    const wrapper = mount(MediaChronological, {
      global: globalOpts,
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
    const wrapper = mount(MediaChronological, { global: globalOpts, props: { items: [] } });
    expect(wrapper.find('.media-chronological').exists()).toBe(false);
  });

  it('hides captions when showCaptions false', () => {
    const wrapper = mount(MediaChronological, {
      global: globalOpts,
      props: {
        showCaptions: false,
        items: [{ id: '1', title: 'Photo', notes: null, fileRef: '/a/b.jpg', format: 'image/jpeg', inferredDateISO: null }],
      },
    });
    expect(wrapper.find('.media-caption').exists()).toBe(false);
  });

  it('loads image data URLs via window.api.media.readAsDataUrl', async () => {
    const wrapper = mount(MediaChronological, {
      global: globalOpts,
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
